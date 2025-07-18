/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/unbound-method */
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { TestingModule, Test } from '@nestjs/testing';
import { hdkey, Wallet } from '@ethereumjs/wallet';
import { Chain, Transaction, User } from '@prisma/client';
import {
  Connection,
  Keypair,
  PublicKey,
  TokenBalance,
  SendTransactionError as SolanaTransactionError,
} from '@solana/web3.js';
import Web3, {
  Web3Account,
  Transaction as EthTransaction,
  TransactionReceipt,
} from 'web3';
import {
  ErrorType,
  NameRegistryState,
  SNSError,
} from '@bonfida/spl-name-service';
import axios, { AxiosResponse } from 'axios';
import * as bip39 from 'bip39';
import * as ed25519 from 'ed25519-hd-key';
import * as Thirdweb from 'thirdweb';
import * as ThirdwebWallets from 'thirdweb/wallets';
import * as ThirdwebExtension from 'thirdweb/extensions/ens';
import * as ThirdwebERC20 from 'thirdweb/extensions/erc20';
import { RedisClientType } from 'redis';
import { USDCTokenAddress, ChainRPC } from '@src/common/types';
import { DbService } from '@src/db/db.service';
import { MetricsService } from '@src/metrics/metrics.service';
import { DepositDTO, WithdrawalDTO } from './dto';
import { HelperService } from './helpers';
import { ETH_WEB3_PROVIDER_TOKEN, SOL_WEB3_PROVIDER_TOKEN } from './providers';
import { WalletGateway } from './wallet.gateway';
import { WalletService } from './wallet.service';
import * as RedisService from '@src/common/config/redis';
import * as MailService from '@src/common/config/mail';

jest.mock('thirdweb', () => ({
  ...jest.requireActual('thirdweb'),
  getContract: jest.fn().mockReturnValue({
    address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  }),
  createThirdwebClient: jest.fn().mockReturnValue({
    clientId: 'client-id',
    secretKey: 'thirdweb-api-key',
  }),
  sendAndConfirmTransaction: jest.fn(),
}));

jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    getOrThrow: jest.fn((key: string) => {
      if (key === 'NODE_ENV') return 'test';
      if (key === 'COINGECKO_API_KEY') return 'coingecko-api-key';
      if (key === 'THIRDWEB_API_KEY') return 'thirdweb-api-key';

      return undefined;
    }),
  })),
}));

jest.mock('thirdweb/extensions/erc20', () => ({
  ...jest.requireActual('thirdweb/extensions/erc20'),
  transfer: jest.fn(),
}));

jest.mock('@src/common/secrets', () => ({
  ...jest.requireActual('@src/common/secrets'),
  getPlatformWalletKeyphrase: jest
    .fn()
    .mockResolvedValue('platform-wallet-keyphrase'),
}));

jest.mock('@src/common/config/mail', () => ({
  ...jest.requireActual('@src/common/config/mail'),
  sendEmail: jest.fn(),
}));

describe('Wallet Service', () => {
  let walletService: WalletService;
  let gateway: DeepMocked<WalletGateway>;
  let helper: DeepMocked<HelperService>;
  let web3: DeepMocked<Web3>;
  let connection: DeepMocked<Connection>;
  let prisma: DeepMocked<DbService>;
  let metrics: DeepMocked<MetricsService>;

  const user: User = {
    id: 1,
    email: 'user@example.com',
    firstName: 'Cristiano',
    lastName: 'Ronaldo',
    password: 'Password',
    username: 'goat_cr7',
    createdAt: new Date(),
    updatedAt: new Date(),
    profileImage: 'default-image-url',
    twoFASecret: null,
    twoFAEnabled: false,
    balance: 0,
  };

  const keypair = {
    secretKey: new Uint8Array([1, 2, 3]),
    publicKey: new PublicKey('11111111111111111111111111111111'),
  } as unknown as Keypair;

  const wallet = {
    getAddressString: () => '0x742d35Cc6634C0539F35Df2dFc2A53f4c7fEeD57',
    getPrivateKeyString: () => '0x0000000000000000000000000000000000000000000',
  } as unknown as Wallet;

  const account = {
    address: '0x742d35Cc6634C0539F35Df2dFc2A53f4c7fEeD57',
  } as unknown as Web3Account;

  const depositDto: DepositDTO = {
    amount: 150,
    chain: 'BASE',
    depositor: 'depositor-wallet-address',
    txIdentifier: 'signature-or-hash',
  };

  const withdrawalDto: WithdrawalDTO = {
    ...depositDto,
    address: 'user-wallet-address',
  };

  const transaction: Transaction = {
    id: 1,
    amount: depositDto.amount,
    chain: 'BASE',
    retries: 0,
    status: 'PENDING',
    txIdentifier: '0xdf5c2056ce34ceff42ad251a9f920a1c620c00b4ea0988731d3f',
    type: 'WITHDRAWAL',
    userId: user.id,
    createdAt: new Date(),
  };

  const redis = {
    set: jest.fn().mockResolvedValue('OK'),
    ttl: jest.fn().mockResolvedValue(1000),
    destroy: jest.fn().mockResolvedValue(undefined),
    expire: jest.fn().mockResolvedValue(true),
  } as unknown as RedisClientType;

  beforeAll(async () => {
    helper = createMock<HelperService>();
    web3 = createMock<Web3>();
    connection = createMock<Connection>();

    // Mock the helper service methods
    helper.selectUSDCTokenAddress.mockImplementation((chain: Chain) => {
      if (chain === 'BASE') {
        return USDCTokenAddress.BASE_SEPOLIA;
      } else {
        return USDCTokenAddress.SOLANA_DEVNET;
      }
    });
    helper.getTokenAccountAddress.mockResolvedValue(
      new PublicKey(USDCTokenAddress.SOLANA_DEVNET),
    );
    helper.transferTokensOnSolana.mockResolvedValue('confirmed-tx-signature');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: ETH_WEB3_PROVIDER_TOKEN,
          useValue: web3,
        },
        {
          provide: SOL_WEB3_PROVIDER_TOKEN,
          useValue: connection,
        },
      ],
    })
      .useMocker((token) => {
        if (token === HelperService) return helper;

        return createMock(token);
      })
      .compile();

    walletService = module.get<WalletService>(WalletService);
    gateway = module.get(WalletGateway);
    prisma = module.get(DbService);
    metrics = module.get(MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Platform Wallet', () => {
    beforeEach(() => {
      jest
        .spyOn(bip39, 'mnemonicToSeedSync')
        .mockReturnValue(Buffer.from('seed-phrase'));
    });

    it('should return the wallet instance of the platform ethereum wallet', async () => {
      jest.spyOn(hdkey.EthereumHDKey, 'fromMasterSeed').mockReturnValue({
        derivePath: jest.fn().mockReturnValue({
          getWallet: jest.fn().mockReturnValue(wallet),
        }),
      } as unknown as hdkey.EthereumHDKey);

      const response = walletService.getPlatformWallet('BASE');
      await expect(response).resolves.toEqual(wallet);
    });

    it('should return the keypair of the platform solana wallet', async () => {
      jest.spyOn(ed25519, 'derivePath').mockReturnValue({
        key: Buffer.from('key-from-seed'),
        chainCode: Buffer.from('chain-code'),
      });
      jest.spyOn(Keypair, 'fromSeed').mockReturnValue(keypair);

      const response = walletService.getPlatformWallet('SOLANA');
      await expect(response).resolves.toEqual(keypair);
    });
  });

  describe('Resolve Domain', () => {
    it('should return null if Basename is invalid or unregistered', async () => {
      jest
        .spyOn(ThirdwebExtension, 'resolveAddress')
        .mockResolvedValue('0x0000000000000000000000000000000000000000');

      const response = walletService.resolveDomainName(
        'BASE',
        'invalid.base.eth',
      );
      await expect(response).resolves.toBeNull();
    });

    it('should resolve a valid or registered Basename', async () => {
      jest
        .spyOn(ThirdwebExtension, 'resolveAddress')
        .mockResolvedValue('0x742d35Cc6634C0539F35Df2dFc2A53f4c7fEeD57');

      const response = walletService.resolveDomainName(
        'BASE',
        'xerdin442.base.eth',
      );
      await expect(response).resolves.toEqual(
        '0x742d35Cc6634C0539F35Df2dFc2A53f4c7fEeD57',
      );
    });

    it('should return null if the SNS domain is invalid or unregistered', async () => {
      jest
        .spyOn(NameRegistryState, 'retrieve')
        .mockRejectedValue(new SNSError(ErrorType.AccountDoesNotExist));

      const response = walletService.resolveDomainName('SOLANA', 'invalid.sol');
      await expect(response).resolves.toBeNull();
    });

    it('should resolve a valid or registered SNS domain', async () => {
      const registry = {
        owner: keypair.publicKey,
      } as unknown as NameRegistryState;

      jest.spyOn(NameRegistryState, 'retrieve').mockResolvedValue({
        registry,
        nftOwner: null,
      });

      const response = walletService.resolveDomainName('SOLANA', 'xerdin.sol');
      await expect(response).resolves.toEqual(registry.owner.toBase58());
    });
  });

  describe('Initiate Transaction', () => {
    it('should initiate a deposit transasction', async () => {
      const tx: Transaction = {
        ...transaction,
        type: 'DEPOSIT',
        txIdentifier: depositDto.txIdentifier,
      };

      (prisma.transaction.create as jest.Mock).mockResolvedValue(tx);

      const response = walletService.initiateTransaction(user.id, depositDto);
      await expect(response).resolves.toEqual(tx);
    });

    it('should initiate a withdrawal transasction', async () => {
      (prisma.transaction.create as jest.Mock).mockResolvedValue(transaction);

      const response = walletService.initiateTransaction(
        user.id,
        withdrawalDto,
      );
      await expect(response).resolves.toEqual(transaction);
    });
  });

  describe('Update DB after Transaction', () => {
    beforeEach(() => {
      (prisma.user.update as jest.Mock).mockResolvedValue(user);
    });

    it('should update db after a successful transaction', async () => {
      const tx: Transaction = { ...transaction, status: 'SUCCESS' };
      const updatedTx = { ...tx, user };

      (prisma.transaction.update as jest.Mock).mockResolvedValue(updatedTx);

      const response = walletService.updateDbAfterTransaction(
        tx,
        depositDto.txIdentifier,
        'SUCCESS',
      );

      await expect(response).resolves.toEqual({
        user: updatedTx.user,
        updatedTx,
      });
    });

    it('should update db after a failed transaction', async () => {
      const tx: Transaction = { ...transaction, status: 'FAILED' };
      const updatedTx = { ...tx, user };

      (prisma.transaction.update as jest.Mock).mockResolvedValue(updatedTx);

      const response = walletService.updateDbAfterTransaction(
        tx,
        depositDto.txIdentifier,
        'FAILED',
      );

      await expect(response).resolves.toEqual({
        user: updatedTx.user,
        updatedTx,
      });
    });
  });

  describe('Deposit on Base', () => {
    const receipt: TransactionReceipt = {
      transactionHash: '0xdf5c2056ce34ceff42ad251a9f920a1c620c00b4ea0988731d3f',
      transactionIndex: 0,
      blockNumber: 2,
      blockHash: '0xeb13429552dafa92e3409f42eb43944f7611963c63ce40e7243941a',
      from: '0x6e599da0bff7a6598ac1224e4985430bf16458a4',
      to: '0x6f1df96865d09d21e8f3f9a7fba3b17a11c7c53c',
      cumulativeGasUsed: 21000,
      gasUsed: 21000,
      logs: [],
      logsBloom: '0x000000000000000000000000000000000000000000000000000000',
      status: 1,
      effectiveGasPrice: 2000000000,
      type: 0n,
      root: '0x0000000000000000000000000000000000000000000000000000000000',
    };

    const abiFunctionSignature = '0x24ee009e';

    const ethTransaction: EthTransaction = {
      data: `${abiFunctionSignature}-input-data`,
      to: USDCTokenAddress.BASE_SEPOLIA.toLowerCase(),
      from: depositDto.depositor,
    };

    const decodedData = {
      '0': wallet.getAddressString(),
      '1': BigInt(`${depositDto.amount * 1e6}`),
    };

    beforeEach(() => {
      (web3.eth.getTransactionReceipt as jest.Mock).mockResolvedValue(receipt);
      (web3.eth.getTransaction as jest.Mock).mockResolvedValue(ethTransaction);
      (web3.eth.abi.encodeFunctionSignature as jest.Mock).mockReturnValue(
        abiFunctionSignature,
      );
      (web3.eth.abi.decodeParameters as jest.Mock).mockReturnValue(decodedData);
      (web3.utils.fromWei as jest.Mock).mockReturnValue(`${depositDto.amount}`);

      jest.spyOn(walletService, 'getPlatformWallet').mockResolvedValue(wallet);
      jest
        .spyOn(walletService, 'updateDbAfterTransaction')
        .mockResolvedValueOnce({ user, updatedTx: transaction });

      gateway.sendTransactionStatus.mockReturnValue(undefined);
      metrics.incrementCounter.mockReturnValue(undefined);
    });

    it('should return pending status if the hash is invalid or uncofirmed, and the transaction has not reached max retries', async () => {
      (web3.eth.getTransactionReceipt as jest.Mock).mockResolvedValue(null);
      (prisma.transaction.update as jest.Mock).mockResolvedValue(transaction);

      const response = walletService.processDepositOnBase(depositDto, {
        ...transaction,
        retries: 1,
      });
      await expect(response).resolves.toEqual('PENDING');
    });

    it('should return failed status if the hash is invalid or uncofirmed, and the confirmation check has been retried twice', async () => {
      (web3.eth.getTransactionReceipt as jest.Mock).mockResolvedValue(null);

      const response = walletService.processDepositOnBase(depositDto, {
        ...transaction,
        retries: 2,
      });
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return failed status if the transaction data does not contain the correct abi function signature', async () => {
      (web3.eth.abi.encodeFunctionSignature as jest.Mock).mockReturnValue(
        'incorrect-abi-signature',
      );

      const response = walletService.processDepositOnBase(
        depositDto,
        transaction,
      );
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return failed status if the transferred token is not USDC', async () => {
      (web3.eth.getTransaction as jest.Mock).mockResolvedValue({
        ...ethTransaction,
        to: 'incorrect-token-address',
      });

      const response = walletService.processDepositOnBase(
        depositDto,
        transaction,
      );
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return failed status if the deposited amount is not equal to the amount in the transaction details', async () => {
      (web3.eth.abi.decodeParameters as jest.Mock).mockReturnValue({
        ...decodedData,
        '1': BigInt(1000 * 1e6),
      });
      (web3.utils.fromWei as jest.Mock).mockReturnValue('1000');

      const response = walletService.processDepositOnBase(
        depositDto,
        transaction,
      );
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return failed status if the platform wallet address does not match the recipient in the transaction details', async () => {
      (web3.eth.abi.decodeParameters as jest.Mock).mockReturnValue({
        ...decodedData,
        '0': 'incorrect-recipient-address',
      });

      const response = walletService.processDepositOnBase(
        depositDto,
        transaction,
      );
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return failed status if the depositor address does not match the sender in the transaction details', async () => {
      (web3.eth.getTransaction as jest.Mock).mockResolvedValue({
        ...ethTransaction,
        from: 'incorrect-sender-address',
      });

      const response = walletService.processDepositOnBase(
        depositDto,
        transaction,
      );
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return success status if the transaction passes all checks', async () => {
      const response = walletService.processDepositOnBase(
        depositDto,
        transaction,
      );

      await expect(response).resolves.toEqual('SUCCESS');
    });
  });

  describe('Deposit on Solana', () => {
    const tx: Transaction = {
      ...transaction,
      chain: 'SOLANA',
      txIdentifier: '2nBhEBYYvfaAe16UMNqRHDYvZEJHvoPzUidNgNX59UxtbCXy2rqYcuyuv',
    };

    const dto: DepositDTO = { ...depositDto, chain: 'SOLANA' };

    const PLATFORM_SOLANA_WALLET_ADDRESS: string = keypair.publicKey.toBase58();
    const TOKEN_PROGRAM_ID_BASE58: string =
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

    const preTokenBalances: TokenBalance[] = [
      {
        accountIndex: 0,
        mint: USDCTokenAddress.SOLANA_DEVNET,
        owner: dto.depositor,
        programId: TOKEN_PROGRAM_ID_BASE58,
        uiTokenAmount: {
          amount: String(500 * 1e6),
          decimals: 6,
          uiAmount: 500,
          uiAmountString: '500',
        },
      },
      {
        accountIndex: 1,
        mint: USDCTokenAddress.SOLANA_DEVNET,
        owner: PLATFORM_SOLANA_WALLET_ADDRESS,
        programId: TOKEN_PROGRAM_ID_BASE58,
        uiTokenAmount: {
          amount: String(4500 * 1e6),
          decimals: 6,
          uiAmount: 4500,
          uiAmountString: '4500',
        },
      },
      {
        accountIndex: 2,
        mint: 'mock-token-mint',
        owner: dto.depositor,
        programId: TOKEN_PROGRAM_ID_BASE58,
        uiTokenAmount: {
          amount: String(75 * 1e8),
          decimals: 8,
          uiAmount: 75,
          uiAmountString: '75',
        },
      },
    ];

    const postTokenBalances: TokenBalance[] = [
      {
        accountIndex: 0,
        mint: USDCTokenAddress.SOLANA_DEVNET,
        owner: dto.depositor,
        programId: TOKEN_PROGRAM_ID_BASE58,
        uiTokenAmount: {
          amount: String(350 * 1e6),
          decimals: 6,
          uiAmount: 350,
          uiAmountString: '350',
        },
      },
      {
        accountIndex: 1,
        mint: USDCTokenAddress.SOLANA_DEVNET,
        owner: PLATFORM_SOLANA_WALLET_ADDRESS,
        programId: TOKEN_PROGRAM_ID_BASE58,
        uiTokenAmount: {
          amount: String(4650 * 1e6),
          decimals: 6,
          uiAmount: 4650,
          uiAmountString: '4650',
        },
      },
      {
        accountIndex: 2,
        mint: 'mock-token-mint',
        owner: dto.depositor,
        programId: TOKEN_PROGRAM_ID_BASE58,
        uiTokenAmount: {
          amount: String(75 * 1e8),
          decimals: 8,
          uiAmount: 75,
          uiAmountString: '75',
        },
      },
    ];

    const rpcTransactionResponse = {
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      config: {
        url: ChainRPC.SOLANA_DEVNET,
        method: 'post',
      },
      data: {
        jsonrpc: '2.0',
        id: '1',
        result: {
          blockTime: 1750383905,
          meta: {
            computeUnitsConsumed: 292686,
            err: null,
            fee: 492699,
            innerInstructions: [],
            loadedAddresses: {},
            logMessages: [],
            postBalances: [],
            postTokenBalances,
            preBalances: [],
            preTokenBalances,
            returnData: {
              data: ['XRQrAAAAAAA=', 'base64'],
              programId: 'HuTkmnrv4zPnArMqpbMbFhfwzTR7xfWQZHH1aQKzDKFZ',
            },
          },
          slot: 347936053,
          transaction: {
            signatures: [tx.txIdentifier],
            version: 0,
          },
        },
      },
    } as unknown as AxiosResponse;

    beforeEach(() => {
      jest.spyOn(axios, 'post').mockResolvedValue(rpcTransactionResponse);
      jest.spyOn(walletService, 'getPlatformWallet').mockResolvedValue(keypair);
      jest
        .spyOn(walletService, 'updateDbAfterTransaction')
        .mockResolvedValueOnce({ user, updatedTx: tx });

      gateway.sendTransactionStatus.mockReturnValue(undefined);
      metrics.incrementCounter.mockReturnValue(undefined);
    });

    it('should return pending status if the hash is invalid or uncofirmed, and the transaction has not reached max retries', async () => {
      jest.spyOn(axios, 'post').mockResolvedValue({
        ...rpcTransactionResponse,
        data: { result: null },
      });
      (prisma.transaction.update as jest.Mock).mockResolvedValue(tx);

      const response = walletService.processDepositOnSolana(dto, {
        ...tx,
        retries: 1,
      });
      await expect(response).resolves.toEqual('PENDING');
    });

    it('should return failed status if the hash is invalid or uncofirmed, and the confirmation check has been retried twice', async () => {
      jest.spyOn(axios, 'post').mockResolvedValue({
        ...rpcTransactionResponse,
        data: { result: null },
      });

      const response = walletService.processDepositOnSolana(dto, {
        ...tx,
        retries: 2,
      });
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return failed status if the token balances do not contain USDC balances', async () => {
      const updatedPreTokenBalances: TokenBalance[] = preTokenBalances.filter(
        (balance) =>
          balance.mint !== (USDCTokenAddress.SOLANA_DEVNET as string),
      );

      const updatedPostTokenBalances: TokenBalance[] = postTokenBalances.filter(
        (balance) =>
          balance.mint !== (USDCTokenAddress.SOLANA_DEVNET as string),
      );

      jest.spyOn(axios, 'post').mockResolvedValue({
        ...rpcTransactionResponse,
        data: {
          result: {
            meta: {
              preTokenBalances: updatedPreTokenBalances,
              postTokenBalances: updatedPostTokenBalances,
            },
          },
        },
      });

      const response = walletService.processDepositOnSolana(dto, tx);
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return failed status if the transferred token is not USDC', async () => {
      jest.spyOn(axios, 'post').mockResolvedValue({
        ...rpcTransactionResponse,
        data: {
          result: {
            meta: {
              preTokenBalances,
              postTokenBalances: preTokenBalances,
            },
          },
        },
      });

      const response = walletService.processDepositOnSolana(dto, tx);
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return failed status if the deposited amount is not equal to the amount in the transaction details', async () => {
      jest.spyOn(axios, 'post').mockResolvedValue({
        ...rpcTransactionResponse,
        data: {
          result: {
            meta: {
              preTokenBalances,
              postTokenBalances: [
                {
                  accountIndex: 0,
                  mint: USDCTokenAddress.SOLANA_DEVNET,
                  owner: dto.depositor,
                  programId: TOKEN_PROGRAM_ID_BASE58,
                  uiTokenAmount: {
                    amount: String(300 * 1e6),
                    decimals: 6,
                    uiAmount: 300,
                    uiAmountString: '300',
                  },
                },
                {
                  accountIndex: 1,
                  mint: USDCTokenAddress.SOLANA_DEVNET,
                  owner: PLATFORM_SOLANA_WALLET_ADDRESS,
                  programId: TOKEN_PROGRAM_ID_BASE58,
                  uiTokenAmount: {
                    amount: String(4700 * 1e6),
                    decimals: 6,
                    uiAmount: 4700,
                    uiAmountString: '4700',
                  },
                },
                {
                  accountIndex: 2,
                  mint: 'mock-token-mint',
                  owner: dto.depositor,
                  programId: TOKEN_PROGRAM_ID_BASE58,
                  uiTokenAmount: {
                    amount: String(75 * 1e8),
                    decimals: 8,
                    uiAmount: 75,
                    uiAmountString: '75',
                  },
                },
              ],
            },
          },
        },
      });

      const response = walletService.processDepositOnSolana(dto, tx);
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return failed status if the platform wallet address does not match the recipient in the transaction details', async () => {
      jest.spyOn(axios, 'post').mockResolvedValue({
        ...rpcTransactionResponse,
        data: {
          result: {
            meta: {
              preTokenBalances,
              postTokenBalances: [
                {
                  accountIndex: 0,
                  mint: USDCTokenAddress.SOLANA_DEVNET,
                  owner: dto.depositor,
                  programId: TOKEN_PROGRAM_ID_BASE58,
                  uiTokenAmount: {
                    amount: String(300 * 1e6),
                    decimals: 6,
                    uiAmount: 300,
                    uiAmountString: '300',
                  },
                },
                {
                  accountIndex: 1,
                  mint: USDCTokenAddress.SOLANA_DEVNET,
                  owner: 'incorrect-recipient-address',
                  programId: TOKEN_PROGRAM_ID_BASE58,
                  uiTokenAmount: {
                    amount: String(4700 * 1e6),
                    decimals: 6,
                    uiAmount: 4700,
                    uiAmountString: '4700',
                  },
                },
                {
                  accountIndex: 2,
                  mint: 'mock-token-mint',
                  owner: dto.depositor,
                  programId: TOKEN_PROGRAM_ID_BASE58,
                  uiTokenAmount: {
                    amount: String(75 * 1e8),
                    decimals: 8,
                    uiAmount: 75,
                    uiAmountString: '75',
                  },
                },
              ],
            },
          },
        },
      });

      const response = walletService.processDepositOnSolana(dto, tx);
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return failed status if the depositor address does not match the sender in the transaction details', async () => {
      jest.spyOn(axios, 'post').mockResolvedValue({
        ...rpcTransactionResponse,
        data: {
          result: {
            meta: {
              preTokenBalances,
              postTokenBalances: [
                {
                  accountIndex: 0,
                  mint: USDCTokenAddress.SOLANA_DEVNET,
                  owner: 'incorrect-depsitor-address',
                  programId: TOKEN_PROGRAM_ID_BASE58,
                  uiTokenAmount: {
                    amount: String(300 * 1e6),
                    decimals: 6,
                    uiAmount: 300,
                    uiAmountString: '300',
                  },
                },
                {
                  accountIndex: 1,
                  mint: USDCTokenAddress.SOLANA_DEVNET,
                  owner: PLATFORM_SOLANA_WALLET_ADDRESS,
                  programId: TOKEN_PROGRAM_ID_BASE58,
                  uiTokenAmount: {
                    amount: String(4700 * 1e6),
                    decimals: 6,
                    uiAmount: 4700,
                    uiAmountString: '4700',
                  },
                },
                {
                  accountIndex: 2,
                  mint: 'mock-token-mint',
                  owner: 'incorrect-depsitor-address',
                  programId: TOKEN_PROGRAM_ID_BASE58,
                  uiTokenAmount: {
                    amount: String(75 * 1e8),
                    decimals: 8,
                    uiAmount: 75,
                    uiAmountString: '75',
                  },
                },
              ],
            },
          },
        },
      });

      const response = walletService.processDepositOnSolana(dto, tx);
      await expect(response).resolves.toEqual('FAILED');
    });

    it('should return success status if the transaction passes all checks', async () => {
      const response = walletService.processDepositOnSolana(dto, tx);
      await expect(response).resolves.toEqual('SUCCESS');
    });
  });

  describe('Withdrawal on Base', () => {
    beforeEach(() => {
      jest.spyOn(RedisService, 'connectToRedis').mockResolvedValue(redis);
      jest.spyOn(walletService, 'getPlatformWallet').mockResolvedValue(wallet);

      jest.spyOn(ThirdwebWallets, 'privateKeyToAccount').mockReturnValue({
        address: account.address,
      } as unknown as ThirdwebWallets.Account);

      (ThirdwebERC20.transfer as jest.Mock).mockReturnValue({
        to: withdrawalDto.address,
      });

      jest
        .spyOn(walletService, 'updateDbAfterTransaction')
        .mockResolvedValueOnce({ user, updatedTx: transaction });

      gateway.sendTransactionStatus.mockReturnValue(undefined);
      metrics.incrementCounter.mockReturnValue(undefined);
      jest.spyOn(MailService, 'sendEmail').mockResolvedValue(undefined);
    });

    it('should sucesssfully process withdrawal from platform ethereum wallet', async () => {
      (Thirdweb.sendAndConfirmTransaction as jest.Mock).mockResolvedValue({
        transactionHash: { toString: jest.fn().mockReturnValue('0x123456') },
      });

      const response = walletService.processWithdrawalOnBase(
        withdrawalDto,
        transaction,
        'IDEMPOTENCY-KEY',
      );
      await expect(response).resolves.toBeUndefined();
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'successful_withdrawals',
        ['base'],
      );
    });
  });

  describe('Withdrawal on Solana', () => {
    const dto: WithdrawalDTO = {
      ...withdrawalDto,
      chain: 'SOLANA',
      address: '11111111111111111111111111111111',
    };

    const tx: Transaction = { ...transaction, chain: 'SOLANA' };

    beforeEach(() => {
      jest.spyOn(RedisService, 'connectToRedis').mockResolvedValue(redis);
      jest.spyOn(walletService, 'getPlatformWallet').mockResolvedValue(keypair);
      jest
        .spyOn(walletService, 'updateDbAfterTransaction')
        .mockResolvedValueOnce({ user, updatedTx: tx });

      gateway.sendTransactionStatus.mockReturnValue(undefined);
      metrics.incrementCounter.mockReturnValue(undefined);
      jest.spyOn(MailService, 'sendEmail').mockResolvedValue(undefined);
    });

    it('should sucesssfully process withdrawal from platform solana wallet', async () => {
      const response = walletService.processWithdrawalOnSolana(
        dto,
        tx,
        'IDEMPOTENCY-KEY',
      );

      await expect(response).resolves.toBeUndefined();
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'successful_withdrawals',
        ['solana'],
      );
    });

    it('should throw if an onchain error occurs during withdrawal from platform solana wallet', async () => {
      helper.transferTokensOnSolana.mockRejectedValue(
        new SolanaTransactionError({
          action: 'send',
          signature:
            '2nBhEBYYvfaAe16UMNqRHDYvZEJHvoPzUidNgNX59UxtbCXy2rqYcuyuv',
          transactionMessage: 'Transaction failed',
        }),
      );

      const response = walletService.processWithdrawalOnSolana(
        dto,
        tx,
        'IDEMPOTENCY-KEY',
      );

      await expect(response).resolves.toBeUndefined();
      expect(metrics.incrementCounter).toHaveBeenCalledWith(
        'failed_withdrawals',
        ['solana'],
      );
    });
  });

  describe('Fiat to Crypto Conversion', () => {
    it('should convert fiat amount to ethereum equivalent', async () => {
      jest.spyOn(axios, 'get').mockResolvedValue({
        data: {
          ethereum: { usd: 3600 },
        },
      });

      const response = walletService.convertAmountToCrypto(1000, 'BASE');
      await expect(response).resolves.toEqual(1000 / 3600);
    });

    it('should convert fiat amount to solana equivalent', async () => {
      jest.spyOn(axios, 'get').mockResolvedValue({
        data: {
          solana: { usd: 180 },
        },
      });

      const response = walletService.convertAmountToCrypto(45, 'SOLANA');
      await expect(response).resolves.toEqual(45 / 180);
    });
  });

  describe('Ethereum Wallet Balance', () => {
    beforeEach(() => {
      jest.spyOn(walletService, 'convertAmountToCrypto').mockResolvedValue(2);
      jest.spyOn(walletService, 'getPlatformWallet').mockResolvedValue(wallet);

      (web3.eth.accounts.privateKeyToAccount as jest.Mock).mockReturnValue(
        account,
      );
    });

    it('should ignore alert email if ETH balance is above allowed minimum', async () => {
      // Mock the wallet balance as 3 ETH (in wei)
      (web3.eth.getBalance as jest.Mock).mockResolvedValue(BigInt(3 * 1e18));
      (web3.utils.fromWei as jest.Mock).mockReturnValue('3.00');

      const response = walletService.checkNativeAssetBalance('BASE');

      await expect(response).resolves.toBeUndefined();
      expect(MailService.sendEmail).toHaveBeenCalledTimes(0);
    });

    it('should send alert email if ETH balance is below allowed minimum', async () => {
      // Mock the wallet balance as 1.8 ETH (in wei)
      (web3.eth.getBalance as jest.Mock).mockResolvedValue(BigInt(1.8 * 1e18));
      (web3.utils.fromWei as jest.Mock).mockReturnValue('1.80');

      const response = walletService.checkNativeAssetBalance('BASE');

      await expect(response).resolves.toBeUndefined();
      expect(MailService.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('should ignore alert email if stablecoin balance is above allowed minimum', async () => {
      jest
        .spyOn(ThirdwebERC20, 'balanceOf')
        .mockResolvedValue(BigInt(5000 * 1e6));

      const response = walletService.checkStablecoinBalance('BASE');

      await expect(response).resolves.toBeUndefined();
      expect(MailService.sendEmail).toHaveBeenCalledTimes(0);
    });

    it('should send alert email if stablecoin balance is below allowed minimum', async () => {
      jest
        .spyOn(ThirdwebERC20, 'balanceOf')
        .mockResolvedValue(BigInt(3000 * 1e6));

      const response = walletService.checkStablecoinBalance('BASE');

      await expect(response).resolves.toBeUndefined();
      expect(MailService.sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('Solana Wallet Balance', () => {
    beforeEach(() => {
      jest.spyOn(walletService, 'convertAmountToCrypto').mockResolvedValue(2);
      jest.spyOn(walletService, 'getPlatformWallet').mockResolvedValue(keypair);
    });

    it('should ignore alert email if SOL balance is above allowed minimum', async () => {
      // Mock platform wallet balance as 3 SOL (in lamports)
      connection.getBalance.mockResolvedValue(3 * 1e9);

      const response = walletService.checkNativeAssetBalance('SOLANA');

      await expect(response).resolves.toBeUndefined();
      expect(MailService.sendEmail).toHaveBeenCalledTimes(0);
    });

    it('should send alert email if SOL balance is below allowed minimum', async () => {
      // Mock platform wallet balance as 1.8 SOL (in lamports)
      connection.getBalance.mockResolvedValue(1.8 * 1e9);

      const response = walletService.checkNativeAssetBalance('SOLANA');

      await expect(response).resolves.toBeUndefined();
      expect(MailService.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('should ignore alert email if stablecoin balance is above allowed minimum', async () => {
      connection.getTokenAccountBalance.mockResolvedValue({
        context: { slot: 1 },
        value: {
          amount: '5000000000',
          decimals: 6,
          uiAmount: 5000,
          uiAmountString: '5000',
        },
      });

      const response = walletService.checkStablecoinBalance('SOLANA');

      await expect(response).resolves.toBeUndefined();
      expect(MailService.sendEmail).toHaveBeenCalledTimes(0);
    });

    it('should send alert email if stablecoin balance is below allowed minimum', async () => {
      connection.getTokenAccountBalance.mockResolvedValue({
        context: { slot: 1 },
        value: {
          amount: '3000000000',
          decimals: 6,
          uiAmount: 3000,
          uiAmountString: '3000',
        },
      });

      const response = walletService.checkStablecoinBalance('SOLANA');

      await expect(response).resolves.toBeUndefined();
      expect(MailService.sendEmail).toHaveBeenCalledTimes(1);
    });
  });
});
