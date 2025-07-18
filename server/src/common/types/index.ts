import { User } from '@prisma/client';

export type SerializedBuffer = {
  type: 'Buffer';
  data: number[];
};

export type SessionData = {
  email?: string;
  otp?: string;
  otpExpiration?: number;
};

export type GoogleAuthUser = {
  user?: User;
  token: string;
  twoFactorAuth?: boolean;
};

export type GoogleAuthPayload = {
  email: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
};

export enum USDCTokenAddress {
  BASE_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  SOLANA_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  SOLANA_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
}

export enum ChainRPC {
  BASE_SEPOLIA = 'https://base-sepolia.g.alchemy.com/v2',
  BASE_MAINNET = 'https://base-mainnet.g.alchemy.com/v2',
  SOLANA_DEVNET = 'https://devnet.helius-rpc.com?api-key',
  SOLANA_MAINNET = 'https://mainnet.helius-rpc.com?api-key',
}
