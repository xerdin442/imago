import { Inject, Injectable } from '@nestjs/common';
import { WalletGateway } from './wallet.gateway';
import Web3 from 'web3';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TokenBalance,
  SendTransactionError as SolanaTransactionError,
} from '@solana/web3.js';
import { Chain, Transaction, TransactionStatus, User } from '@prisma/client';
import { hdkey, Wallet } from '@ethereumjs/wallet';
import {
  ErrorType,
  getDomainKeySync,
  NameRegistryState,
  SNSError,
} from '@bonfida/spl-name-service';
import { DepositDTO, RedeemRewardsDTO, WithdrawalDTO } from './dto';
import axios from 'axios';
import * as bip39 from 'bip39';
import { ETH_WEB3_PROVIDER_TOKEN, SOL_WEB3_PROVIDER_TOKEN } from './providers';
import { derivePath } from 'ed25519-hd-key';
import {
  createThirdwebClient,
  ThirdwebClient,
  sendAndConfirmTransaction,
  getContract,
} from 'thirdweb';
import { Account, privateKeyToAccount } from 'thirdweb/wallets';
import { transfer, balanceOf } from 'thirdweb/extensions/erc20';
import {
  resolveAddress,
  BASENAME_RESOLVER_ADDRESS,
} from 'thirdweb/extensions/ens';
import { base, baseSepolia } from 'thirdweb/chains';
import { RedisClientType } from 'redis';
import { DbService } from '@src/db/db.service';
import { MetricsService } from '@src/metrics/metrics.service';
import { HelperService } from './helpers';
import { getPlatformWalletKeyphrase, Secrets } from '@src/common/secrets';
import logger from '@src/common/logger';
import { sendEmail } from '@src/common/config/mail';
import { connectToRedis } from '@src/common/config/redis';

@Injectable()
export class WalletService {
  private readonly context: string = WalletService.name;

  private readonly thirdweb: ThirdwebClient;
  private readonly BASE_USDC_TOKEN_ADDRESS: string;
  private readonly SOLANA_USDC_MINT_ADDRESS: string;

  private readonly SOLANA_DERIVATION_PATH = "m/44'/501'/1'/0'";
  private readonly ETHEREUM_DERIVATION_PATH = "m/44'/60'/0'/0/1";

  // Minimum amount in USD for native assets and stablecoins
  private readonly STABLECOIN_MINIMUM_BALANCE: number = 3500;
  private readonly BONK_MINIMUM_BALANCE: number = 3500;

  constructor(
    private readonly prisma: DbService,
    private readonly metrics: MetricsService,
    private readonly gateway: WalletGateway,
    private readonly helper: HelperService,
    @Inject(ETH_WEB3_PROVIDER_TOKEN) private readonly web3: Web3,
    @Inject(SOL_WEB3_PROVIDER_TOKEN) private readonly connection: Connection,
  ) {
    // Fetch the official USDC token addresses
    this.BASE_USDC_TOKEN_ADDRESS = this.helper.selectUSDCTokenAddress('BASE');
    this.SOLANA_USDC_MINT_ADDRESS =
      this.helper.selectUSDCTokenAddress('SOLANA');

    this.thirdweb = createThirdwebClient({
      secretKey: Secrets.THIRDWEB_API_KEY,
    });
  }

  async getPlatformWallet(chain: Chain): Promise<Wallet | Keypair> {
    const keyPhrase: string = await getPlatformWalletKeyphrase();
    const seed = bip39.mnemonicToSeedSync(keyPhrase);

    if (chain === 'BASE') {
      const hdWallet = hdkey.EthereumHDKey.fromMasterSeed(seed);
      const derivedKey = hdWallet.derivePath(this.ETHEREUM_DERIVATION_PATH);

      return derivedKey.getWallet();
    } else {
      const { key: privateKey32Bytes } = derivePath(
        this.SOLANA_DERIVATION_PATH,
        seed.toString('hex'),
      );

      return Keypair.fromSeed(privateKey32Bytes);
    }
  }

  async resolveDomainName(
    chain: Chain,
    domain: string,
  ): Promise<string | null> {
    try {
      if (chain === 'BASE') {
        const address = await resolveAddress({
          client: this.thirdweb,
          name: domain,
          resolverAddress: BASENAME_RESOLVER_ADDRESS,
          resolverChain: base,
        });

        if (address === '0x0000000000000000000000000000000000000000')
          return null;

        return address;
      }

      const { pubkey } = getDomainKeySync(domain);
      const { registry } = await NameRegistryState.retrieve(
        this.connection,
        pubkey,
      );

      return registry.owner.toBase58();
    } catch (error) {
      if (
        error instanceof SNSError &&
        error.type === ErrorType.AccountDoesNotExist
      ) {
        return null;
      }

      logger.error(
        `[${this.context}] An error occurred while resolving domain name: ${domain}. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  async initiateTransaction(
    userId: number,
    dto: DepositDTO | WithdrawalDTO,
  ): Promise<Transaction> {
    try {
      if ('txIdentifier' in dto) {
        return this.prisma.transaction.create({
          data: {
            userId,
            amount: dto.amount,
            chain: dto.chain,
            txIdentifier: dto.txIdentifier,
            status: 'PENDING',
            type: 'DEPOSIT',
          },
        });
      }

      return this.prisma.transaction.create({
        data: {
          userId,
          amount: dto.amount,
          chain: dto.chain,
          status: 'PENDING',
          type: 'WITHDRAWAL',
        },
      });
    } catch (error) {
      throw error;
    }
  }

  async updateDbAfterTransaction(
    tx: Transaction,
    txIdentifier: string,
    status: TransactionStatus,
  ): Promise<{ user: User; updatedTx: Transaction }> {
    try {
      const { id: txId, type, userId, amount } = tx;

      // Update user balance
      if (status === 'SUCCESS') {
        if (type === 'WITHDRAWAL') {
          await this.prisma.user.update({
            where: { id: userId },
            data: { balance: { decrement: amount } },
          });
        } else {
          await this.prisma.user.update({
            where: { id: userId },
            data: { balance: { increment: amount } },
          });
        }
      }

      // Update transaction details
      const updatedTx = await this.prisma.transaction.update({
        where: { id: txId },
        data: { status, txIdentifier },
        include: { user: true },
      });

      return { user: updatedTx.user, updatedTx };
    } catch (error) {
      throw error;
    }
  }

  async processDepositOnBase(
    dto: DepositDTO,
    transaction: Transaction,
  ): Promise<TransactionStatus> {
    const { amount, txIdentifier, chain, depositor } = dto;
    const metricLabels: string[] = [chain.toLowerCase()];

    try {
      // Get receipt of the deposit transaction
      const receipt = await this.web3.eth.getTransactionReceipt(txIdentifier);

      // If transaction is not confirmed, return deposit status based on number of retries
      if (!receipt) {
        if (transaction.retries < 2) {
          const updatedTx = await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { retries: { increment: 1 } },
          });

          logger.warn(
            `[${this.context}] Deposit transaction (Tx: ${dto.txIdentifier}) is pending confirmation and a retry has been scheduled. Attempt: ${updatedTx.retries}\n`,
          );

          return 'PENDING';
        } else {
          // Store failed transaction details
          const { user, updatedTx } = await this.updateDbAfterTransaction(
            transaction,
            txIdentifier,
            'FAILED',
          );

          // Notify client of transaction status
          this.gateway.sendTransactionStatus(user.email, updatedTx);

          // Update deposit metrics
          this.metrics.incrementCounter('failed_deposits', metricLabels);

          return 'FAILED';
        }
      }

      // Get transaction details
      const tx = await this.web3.eth.getTransaction(txIdentifier);

      let recipientAddress: string = '';
      let amountTransferred: number = 0;

      // Get the ABI signature of the transfer function
      const transferSignatureHash = this.web3.eth.abi.encodeFunctionSignature(
        'transfer(address,uint256)',
      );

      const inputData = tx.data as string;
      if (inputData.startsWith(transferSignatureHash)) {
        // Strip the function signature from the data and decode the parameters
        const encodedParameters = '0x' + inputData.slice(10);
        const decodedData = this.web3.eth.abi.decodeParameters(
          ['address', 'uint256'],
          encodedParameters,
        );

        recipientAddress = decodedData[0] as string;

        // Confirm that the transferred token is USDC
        const tokenCheck = tx.to === this.BASE_USDC_TOKEN_ADDRESS.toLowerCase();

        if (tokenCheck) {
          // Convert transfer amount from the smallest unit of USDC
          const txAmount = this.web3.utils.fromWei(
            decodedData[1] as bigint,
            'mwei',
          );
          amountTransferred = parseFloat(txAmount);
        }
      }

      // Confirm the transferred amount
      const amountCheck = amount === parseFloat(amountTransferred.toFixed(2));

      // Confirm that the recipient address is the platform wallet address
      const platformWallet = (await this.getPlatformWallet('BASE')) as Wallet;
      const walletCheck =
        recipientAddress.toLowerCase() ===
        platformWallet.getAddressString().toLowerCase();

      // Confirm that the sender address is the depositor's address
      const senderCheck = tx.from.toLowerCase() === depositor.toLowerCase();

      if (amountCheck && walletCheck && senderCheck) {
        // Update user balance and transaction details
        const { user, updatedTx } = await this.updateDbAfterTransaction(
          transaction,
          txIdentifier,
          'SUCCESS',
        );

        // Notify client of transaction status
        this.gateway.sendTransactionStatus(user.email, updatedTx);

        // Update deposit metrics
        this.metrics.incrementCounter('successful_deposits', metricLabels);
        this.metrics.incrementCounter('deposit_volume', metricLabels, amount);

        return 'SUCCESS';
      } else {
        // Store failed transaction details
        const { user, updatedTx } = await this.updateDbAfterTransaction(
          transaction,
          txIdentifier,
          'FAILED',
        );

        // Notify client of transaction status
        this.gateway.sendTransactionStatus(user.email, updatedTx);

        // Update deposit metrics
        this.metrics.incrementCounter('failed_deposits', metricLabels);

        return 'FAILED';
      }
    } catch (error) {
      throw error;
    }
  }

  async processDepositOnSolana(
    dto: DepositDTO,
    transaction: Transaction,
  ): Promise<TransactionStatus> {
    const { amount, txIdentifier, chain, depositor } = dto;
    const metricLabels: string[] = [chain.toLowerCase()];

    try {
      // Get transaction details
      const response = await axios.post(
        this.helper.selectRpcUrl('SOLANA'),
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            txIdentifier,
            { commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
          ],
        },
        {
          headers: { 'Content-Type': 'application/json' },
        },
      );

      // If transaction is not confirmed, return deposit status based on number of retries
      if (response.status === 200 && response.data.result === null) {
        if (transaction.retries < 2) {
          const updatedTx = await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { retries: { increment: 1 } },
          });

          logger.warn(
            `[${this.context}] Deposit transaction (Tx: ${dto.txIdentifier}) is pending confirmation and a retry has been scheduled. Attempt: ${updatedTx.retries}\n`,
          );

          return 'PENDING';
        } else {
          // Store failed transaction details
          const { user, updatedTx } = await this.updateDbAfterTransaction(
            transaction,
            txIdentifier,
            'FAILED',
          );

          // Notify client of transaction status
          this.gateway.sendTransactionStatus(user.email, updatedTx);

          // Update deposit metrics
          this.metrics.incrementCounter('failed_deposits', metricLabels);

          return 'FAILED';
        }
      }

      let recipientAddress: string = '';
      let senderAddress: string = '';
      let amountTransferred: number = 0;

      // Get the token balances from the transaction details
      const meta = response.data.result.meta as Record<string, any>;
      const preTokenBalances = meta.preTokenBalances as TokenBalance[];
      const postTokenBalances = meta.postTokenBalances as TokenBalance[];

      // Check for changes in the USDC token balances to get the sender and recipient addresses
      for (const postBalance of postTokenBalances) {
        if (postBalance.mint === this.SOLANA_USDC_MINT_ADDRESS) {
          const owner = postBalance.owner as string;

          const preBalance = preTokenBalances.find(
            (balance) =>
              balance.mint === this.SOLANA_USDC_MINT_ADDRESS &&
              balance.owner === owner,
          );

          const preAmount = preBalance?.uiTokenAmount.uiAmount as number;
          const postAmount = postBalance.uiTokenAmount.uiAmount as number;

          if (preAmount < postAmount) {
            recipientAddress = owner;
            amountTransferred = postAmount - preAmount;
          } else if (preAmount > postAmount) {
            senderAddress = owner;
            amountTransferred = preAmount - postAmount;
          }
        }
      }

      // Confirm the transferred amount
      const amountCheck = amount === parseFloat(amountTransferred.toFixed(2));

      // Confirm that the recipient address is the platform wallet address
      const platformWallet = (await this.getPlatformWallet(chain)) as Keypair;
      const walletCheck =
        recipientAddress === platformWallet.publicKey.toBase58();

      // Confirm that the sender address is the depositor's address
      const senderCheck = senderAddress === depositor;

      if (amountCheck && walletCheck && senderCheck) {
        // Update user balance and transaction details
        const { user, updatedTx } = await this.updateDbAfterTransaction(
          transaction,
          txIdentifier,
          'SUCCESS',
        );

        // Notify client of transaction status
        this.gateway.sendTransactionStatus(user.email, updatedTx);

        // Update deposit metrics
        this.metrics.incrementCounter('successful_deposits', metricLabels);
        this.metrics.incrementCounter('deposit_volume', metricLabels, amount);

        return 'SUCCESS';
      } else {
        // Store failed transaction details
        const { user, updatedTx } = await this.updateDbAfterTransaction(
          transaction,
          txIdentifier,
          'FAILED',
        );

        // Notify client of transaction status
        this.gateway.sendTransactionStatus(user.email, updatedTx);

        // Update deposit metrics
        this.metrics.incrementCounter('failed_deposits', metricLabels);

        return 'FAILED';
      }
    } catch (error) {
      throw error;
    }
  }

  async processWithdrawalOnBase(
    dto: WithdrawalDTO,
    transaction: Transaction,
    idempotencyKey: string,
  ): Promise<void> {
    const metricLabels: string[] = [dto.chain.toLowerCase()];

    // Initialize Redis connection
    const redis: RedisClientType = await connectToRedis(
      Secrets.REDIS_URL,
      'Idempotency Keys',
      Secrets.IDEMPOTENCY_KEYS_STORE_INDEX,
    );

    try {
      const platformWallet = (await this.getPlatformWallet('BASE')) as Wallet;
      const privateKey = platformWallet.getPrivateKeyString();

      // Fetch account from private key
      const account: Account = privateKeyToAccount({
        client: this.thirdweb,
        privateKey,
      });

      // Get USDC contract
      const usdcContract = getContract({
        client: this.thirdweb,
        chain: Secrets.NODE_ENV === 'production' ? base : baseSepolia,
        address: this.helper.selectUSDCTokenAddress('BASE'),
      });

      // Configure transaction details
      const preparedTx = transfer({
        contract: usdcContract,
        to: dto.address,
        amount: dto.amount,
      });

      // Send and confirm transaction on the network
      const { transactionHash } = await sendAndConfirmTransaction({
        transaction: preparedTx,
        account,
      });

      // Update user balance and transaction details
      const { user, updatedTx } = await this.updateDbAfterTransaction(
        transaction,
        transactionHash.toString(),
        'SUCCESS',
      );

      // Update withdrawal metrics
      this.metrics.incrementCounter('successful_withdrawals', metricLabels);
      this.metrics.incrementCounter(
        'withdrawal_volume',
        metricLabels,
        dto.amount,
      );

      // Notify client of transaction status
      this.gateway.sendTransactionStatus(user.email, updatedTx);

      // Update status of idempotency key
      const ttl = await redis.ttl(idempotencyKey);
      await redis.set(idempotencyKey, JSON.stringify({ status: 'COMPLETE' }));
      await redis.expire(idempotencyKey, ttl);

      // Notify user of successful withdrawal
      const date: string = updatedTx.createdAt.toISOString();
      const content = `Your withdrawal of $${dto.amount} on ${date} was successful. Your balance is $${user.balance}`;
      await sendEmail(user.email, 'Withdrawal Successful', content);

      return;
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while completing withdrawal from platform ethereum wallet. Error: ${error.message}\n`,
      );

      throw error;
    } finally {
      redis.destroy();
    }
  }

  async processWithdrawalOnSolana(
    dto: WithdrawalDTO,
    transaction: Transaction,
    idempotencyKey: string,
  ): Promise<void> {
    let signature: string = '';
    const metricLabels: string[] = [dto.chain.toLowerCase()];

    // Initialize Redis connection
    const redis: RedisClientType = await connectToRedis(
      Secrets.REDIS_URL,
      'Idempotency Keys',
      Secrets.IDEMPOTENCY_KEYS_STORE_INDEX,
    );

    try {
      const sender = (await this.getPlatformWallet('SOLANA')) as Keypair;
      const recipient = new PublicKey(dto.address);

      // Initiate withdrawal from platform wallet
      signature = await this.helper.transferTokensOnSolana(
        this.connection,
        sender,
        recipient,
        dto.amount,
        'usdc',
      );

      // Update user balance and store transaction details
      const { user, updatedTx } = await this.updateDbAfterTransaction(
        transaction,
        signature,
        'SUCCESS',
      );

      // Update withdrawal metrics
      this.metrics.incrementCounter('successful_withdrawals', metricLabels);
      this.metrics.incrementCounter(
        'withdrawal_volume',
        metricLabels,
        dto.amount,
      );

      // Notify client of transaction status
      this.gateway.sendTransactionStatus(user.email, updatedTx);

      // Update status of idempotency key
      const ttl = await redis.ttl(idempotencyKey);
      await redis.set(idempotencyKey, JSON.stringify({ status: 'COMPLETE' }));
      await redis.expire(idempotencyKey, ttl);

      // Notify user of successful withdrawal
      const date: string = updatedTx.createdAt.toISOString();
      const content = `Your withdrawal of $${dto.amount} on ${date} was successful. Your balance is $${user.balance}`;
      await sendEmail(user.email, 'Withdrawal Successful', content);

      return;
    } catch (error) {
      if (error instanceof SolanaTransactionError) {
        // Store failed transaction details
        const { user, updatedTx } = await this.updateDbAfterTransaction(
          transaction,
          signature,
          'FAILED',
        );

        // Update withdrawal metrics
        this.metrics.incrementCounter('failed_withdrawals', metricLabels);

        // Notify client of transaction status
        this.gateway.sendTransactionStatus(user.email, updatedTx);

        // Notify user of failed withdrawal
        const date: string = updatedTx.createdAt.toISOString();
        const content = `Your withdrawal of $${dto.amount} on ${date} was unsuccessful. Please try again later.`;
        await sendEmail(user.email, 'Failed Withdrawal', content);

        logger.error(
          `[${this.context}] An error occurred while completing withdrawal from platform solana wallet. Error: ${error.message}\n`,
        );

        return;
      }

      throw error;
    } finally {
      redis.destroy();
    }
  }

  async checkNativeAssetBalance(chain: Chain): Promise<void> {
    try {
      let lowBalanceCheck: boolean = false;
      let currentBalance: number = 0;

      let symbol: string = '';
      chain === 'BASE' ? (symbol = 'ETH') : (symbol = 'SOL');

      let coinId: string = '';
      chain === 'BASE' ? (coinId = 'ethereum') : (coinId = 'solana');

      // Fetch the current USD prices of the native assets
      const usdPrice = await this.helper.fetchTokenPrice(coinId);
      // Estimate the minimum balance of the assets using the USD prices
      const minimumBalance = this.STABLECOIN_MINIMUM_BALANCE / 4 / usdPrice;

      if (chain === 'BASE') {
        const platformWallet = (await this.getPlatformWallet(chain)) as Wallet;
        const privateKey = platformWallet.getPrivateKeyString();

        const account = this.web3.eth.accounts.privateKeyToAccount(privateKey);

        // Get ETH balance
        const currentBalanceInWei = await this.web3.eth.getBalance(
          account.address,
        );
        const currentBalanceInEther = this.web3.utils.fromWei(
          currentBalanceInWei,
          'ether',
        );
        currentBalance = parseFloat(currentBalanceInEther);

        // Check if balance is below allowed minimum
        if (currentBalance < Math.round(minimumBalance)) lowBalanceCheck = true;
      }

      if (chain === 'SOLANA') {
        const platformWallet = (await this.getPlatformWallet(chain)) as Keypair;

        // Get SOL balance
        const currentBalanceInLamports = await this.connection.getBalance(
          platformWallet.publicKey,
        );
        currentBalance = currentBalanceInLamports / LAMPORTS_PER_SOL;

        // Check if balance is below allowed minimum
        if (currentBalance < Math.round(minimumBalance)) lowBalanceCheck = true;
      }

      // Notify admin if native asset balance is low
      if (lowBalanceCheck) {
        const admin = await this.prisma.admin.findUniqueOrThrow({
          where: { id: 1 },
        });

        const content = `The platform wallet on ${chain} has a native asset balance of ${currentBalance}${symbol}`;
        await sendEmail(admin.email, 'Low Balance Alert', content);

        logger.warn(
          `[${this.context}] The platform wallet on ${chain} has a low native asset balance. Balance: ${currentBalance}${symbol}\n`,
        );
      }
    } catch (error) {
      logger.error(
        `[${this.context}] An error occured while checking native asset balance of platform wallet on ${chain}\n`,
      );

      throw error;
    }
  }

  async checkTokenBalance(chainOrToken: Chain | 'BONK'): Promise<void> {
    try {
      let lowBalanceCheck: boolean = false;
      let currentBalance: number = 0;

      if (chainOrToken === 'BASE') {
        const platformWallet = (await this.getPlatformWallet(
          chainOrToken,
        )) as Wallet;

        // Get USDC contract
        const usdcContract = getContract({
          client: this.thirdweb,
          chain: Secrets.NODE_ENV === 'production' ? base : baseSepolia,
          address: this.helper.selectUSDCTokenAddress(chainOrToken),
        });

        // Fetch USDC balance of platform wallet
        const balanceInDecimals = await balanceOf({
          contract: usdcContract,
          address: platformWallet.getAddressString(),
        });

        currentBalance = Number(balanceInDecimals) / 1e6;

        // Check if balance is below allowed minimum
        if (currentBalance < this.STABLECOIN_MINIMUM_BALANCE)
          lowBalanceCheck = true;
      }

      if (chainOrToken === 'SOLANA') {
        const platformWallet = (await this.getPlatformWallet(
          chainOrToken,
        )) as Keypair;

        // Get USDC token address of platform wallet
        const platformTokenAddress = await this.helper.getTokenAccountAddress(
          platformWallet.publicKey,
          'usdc',
        );

        // Fetch USDC balance of platform wallet
        const balance =
          await this.connection.getTokenAccountBalance(platformTokenAddress);
        currentBalance = balance.value.uiAmount as number;

        // Check if balance is below allowed minimum
        if (currentBalance < this.STABLECOIN_MINIMUM_BALANCE)
          lowBalanceCheck = true;
      }

      if (chainOrToken === 'BONK') {
        let bonkLowBalanceCheck: boolean = false;
        let bonkBalance: number = 0;

        const platformWallet = (await this.getPlatformWallet(
          'SOLANA',
        )) as Keypair;

        // Get BONK token address of the platform wallet
        const platformTokenAddress = await this.helper.getTokenAccountAddress(
          platformWallet.publicKey,
          'bonk',
        );

        // Fetch BONK balance of platform wallet
        const balance =
          await this.connection.getTokenAccountBalance(platformTokenAddress);
        bonkBalance = balance.value.uiAmount as number;

        // Check if balance is below allowed minimum
        if (bonkBalance < this.BONK_MINIMUM_BALANCE) bonkLowBalanceCheck = true;

        // Notify admin if BONK balance is low
        if (bonkLowBalanceCheck) {
          const admin = await this.prisma.admin.findUniqueOrThrow({
            where: { id: 1 },
          });

          const content = `The platform wallet has a BONK balance of ${currentBalance} BONK.`;
          await sendEmail(admin.email, 'Low Balance Alert', content);

          logger.warn(
            `[${this.context}] The platform wallet has a low BONK balance. Balance: ${currentBalance} BONK.\n`,
          );

          return;
        }
      }

      // Notify admin if stablecoin balance is low
      if (lowBalanceCheck) {
        const admin = await this.prisma.admin.findUniqueOrThrow({
          where: { id: 1 },
        });

        const content = `The platform wallet on ${chainOrToken.toLowerCase()} has a stablecoin balance of ${currentBalance} USDC.`;
        await sendEmail(admin.email, 'Low Balance Alert', content);

        logger.warn(
          `[${this.context}] The platform wallet on ${chainOrToken} has a low stablecoin balance. Balance: ${currentBalance} USDC.\n`,
        );

        return;
      }
    } catch (error) {
      logger.error(
        `[${this.context}] An error occured while checking stablecoin balance of platform wallet on ${chainOrToken}\n`,
      );

      throw error;
    }
  }

  async getRewards(userId: number): Promise<number> {
    try {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });

      // Fetch the current USD prices of the native assets
      const usdPrice = await this.helper.fetchTokenPrice('bonk');
      // Calculate onchain rewards
      const bonkValue = user.rewards / usdPrice;

      return parseFloat(bonkValue.toFixed(2));
    } catch (error) {
      throw error;
    }
  }

  async redeemRewards(userId: number, dto: RedeemRewardsDTO): Promise<string> {
    try {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });

      const sender = (await this.getPlatformWallet('SOLANA')) as Keypair;
      const recipient = new PublicKey(dto.address);

      // Withdraw equivalent of user rewards in BONK token from platform wallet
      const signature = await this.helper.transferTokensOnSolana(
        this.connection,
        sender,
        recipient,
        user.rewards,
        'bonk',
      );

      return signature;
    } catch (error) {
      throw error;
    }
  }

  async convertRewards(userId: number): Promise<void> {
    try {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });

      // Update user balance and reset rewards value
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          balance: { increment: Math.floor(user.rewards) },
          rewards: 0,
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }
}
