import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Chain } from '@prisma/client';
import { ChainRPC, USDCTokenAddress } from './constants';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, transfer } from '@solana/spl-token';
import { isAddress, isHexStrict } from 'web3-validator';
import bs58 from 'bs58';

@Injectable()
export class HelperService {
  private readonly NODE_ENV: string;
  private readonly ALCHEMY_API_KEY: string;
  private readonly HELIUS_API_KEY: string;

  constructor(private readonly config: ConfigService) {
    this.NODE_ENV = config.getOrThrow<string>('NODE_ENV');
    this.ALCHEMY_API_KEY = config.getOrThrow<string>('ALCHEMY_API_KEY');
    this.HELIUS_API_KEY = config.getOrThrow<string>('HELIUS_API_KEY');
  }

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
}
