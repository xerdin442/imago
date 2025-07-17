import { Injectable } from '@nestjs/common';
import { Chain } from '@prisma/client';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, transfer } from '@solana/spl-token';
import { isAddress, isHexStrict } from 'web3-validator';
import bs58 from 'bs58';
import { ChainRPC, USDCTokenAddress } from '@src/common/types';
import { Secrets } from '@src/common/secrets';
import axios from 'axios';

@Injectable()
export class HelperService {
  private readonly NODE_ENV: string = Secrets.NODE_ENV;
  private readonly ALCHEMY_API_KEY: string = Secrets.ALCHEMY_API_KEY;
  private readonly HELIUS_API_KEY: string = Secrets.HELIUS_API_KEY;

  constructor() {}

  selectRpcUrl(chain: Chain): string {
    let url: string;
    const isProd = this.NODE_ENV === 'production';

    if (isProd) {
      chain === 'BASE'
        ? (url = `${ChainRPC.BASE_MAINNET}/${this.ALCHEMY_API_KEY}`)
        : (url = `${ChainRPC.SOLANA_MAINNET}=${this.HELIUS_API_KEY}`);
    } else {
      chain === 'BASE'
        ? (url = `${ChainRPC.BASE_SEPOLIA}/${this.ALCHEMY_API_KEY}`)
        : (url = `${ChainRPC.SOLANA_DEVNET}=${this.HELIUS_API_KEY}`);
    }

    return url;
  }

  selectUSDCTokenAddress(chain: Chain): string {
    let address: string;
    const isProd = this.NODE_ENV === 'production';

    if (isProd) {
      chain === 'BASE'
        ? (address = USDCTokenAddress.BASE_MAINNET)
        : (address = USDCTokenAddress.SOLANA_MAINNET);
    } else {
      chain === 'BASE'
        ? (address = USDCTokenAddress.BASE_SEPOLIA)
        : (address = USDCTokenAddress.SOLANA_DEVNET);
    }

    return address;
  }

  async getTokenAccountAddress(owner: PublicKey): Promise<PublicKey> {
    try {
      return getAssociatedTokenAddress(
        new PublicKey(this.selectUSDCTokenAddress('SOLANA')),
        owner,
        true,
      );
    } catch (error) {
      throw error;
    }
  }

  async transferTokensOnSolana(
    connection: Connection,
    sender: Keypair,
    recipient: PublicKey,
    amount: number,
  ): Promise<string> {
    try {
      // Get the token account addresses of platform wallet and recipient address
      const senderTokenAddress = await this.getTokenAccountAddress(
        sender.publicKey,
      );
      const recipientTokenAddress =
        await this.getTokenAccountAddress(recipient);

      // Initiate transfer of USDC tokens from platform wallet
      const signature = await transfer(
        connection,
        sender,
        senderTokenAddress,
        recipientTokenAddress,
        sender.publicKey,
        amount * 1e6,
      );

      return signature;
    } catch (error) {
      throw error;
    }
  }

  validateAddress(chain: Chain, address: string): boolean {
    if (chain === 'BASE') return isAddress(address);

    try {
      return PublicKey.isOnCurve(new PublicKey(address));
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  validateTxIdentifier(chain: Chain, identifier: string): boolean {
    if (chain === 'BASE') {
      return isHexStrict(identifier) && identifier.length === 66;
    }

    const decodedBytes = bs58.decode(identifier);
    return decodedBytes.length === 64;
  }

  async convertAmountToCrypto(amount: number, chain: Chain): Promise<number> {
    try {
      let coinId: string = '';
      chain === 'BASE' ? (coinId = 'ethereum') : (coinId = 'solana');

      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
        {
          headers: {
            Accept: 'application/json',
            'x-cg-demo-api-key': Secrets.COINGECKO_API_KEY,
          },
        },
      );

      let usdPrice: number = 0;
      chain === 'BASE'
        ? (usdPrice = response.data.ethereum.usd as number)
        : (usdPrice = response.data.solana.usd as number);

      return amount / usdPrice;
    } catch (error) {
      throw error;
    }
  }
}
