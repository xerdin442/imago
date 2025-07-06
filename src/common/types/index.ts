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

export type GoogleAuthCallbackData = {
  user?: User;
  token: string;
  redirectUrl: string;
  nonce: string;
  twoFactorAuth?: boolean;
};
