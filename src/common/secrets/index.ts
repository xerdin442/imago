import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Config Service
const config = new ConfigService();

export const Secrets = {
  PORT: config.getOrThrow<number>('PORT'),
  NODE_ENV: config.getOrThrow<string>('NODE_ENV'),
  DATABASE_URL: config.getOrThrow<string>('DATABASE_URL'),
  JWT_SECRET: config.getOrThrow<string>('JWT_SECRET'),
  REDIS_PORT: config.getOrThrow<number>('REDIS_PORT'),
  REDIS_HOST: config.getOrThrow<string>('REDIS_HOST'),
  REDIS_PASSWORD: config.getOrThrow<string>('REDIS_PASSWORD'),
  REDIS_URL: config.getOrThrow<string>('REDIS_URL'),
  QUEUE_STORE_INDEX: config.getOrThrow<number>('QUEUE_STORE_INDEX'),
  SESSION_STORE_INDEX: config.getOrThrow<number>('SESSION_STORE_INDEX'),
  IDEMPOTENCY_KEYS_STORE_INDEX: config.getOrThrow<number>(
    'IDEMPOTENCY_KEYS_STORE_INDEX',
  ),
  SOCIAL_AUTH_STORE_INDEX: config.getOrThrow<number>('SOCIAL_AUTH_STORE_INDEX'),
  DEFAULT_IMAGE: config.getOrThrow<string>('DEFAULT_IMAGE'),
  RESEND_EMAIL_API_KEY: config.getOrThrow<string>('RESEND_EMAIL_API_KEY'),
  APP_NAME: config.getOrThrow<string>('APP_NAME'),
  APP_EMAIL: config.getOrThrow<string>('APP_EMAIL'),
  RATE_LIMIT_PER_SECOND: config.getOrThrow<number>('RATE_LIMIT_PER_SECOND'),
  RATE_LIMIT_PER_MINUTE: config.getOrThrow<number>('RATE_LIMIT_PER_MINUTE'),
  GOOGLE_CLIENT_ID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
  GOOGLE_CALLBACK_URL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
  APPLE_CLIENT_ID: config.getOrThrow<string>('APPLE_CLIENT_ID'),
  APPLE_CALLBACK_URL: config.getOrThrow<string>('APPLE_CALLBACK_URL'),
  CLOUD_NAME: config.getOrThrow<string>('CLOUD_NAME'),
  CLOUD_API_SECRET: config.getOrThrow<string>('CLOUD_API_SECRET'),
  CLOUD_API_KEY: config.getOrThrow<string>('CLOUD_API_KEY'),
  SOCIAL_AUTH_PASSWORD: config.getOrThrow<string>('SOCIAL_AUTH_PASSWORD'),
  HELIUS_API_KEY: config.getOrThrow<string>('HELIUS_API_KEY'),
  ALCHEMY_API_KEY: config.getOrThrow<string>('ALCHEMY_API_KEY'),
  COINGECKO_API_KEY: config.getOrThrow<string>('COINGECKO_API_KEY'),
  THIRDWEB_API_KEY: config.getOrThrow<string>('THIRDWEB_API_KEY'),
  PLATFORM_WALLET_KEYPHRASE: config.getOrThrow<string>(
    'PLATFORM_WALLET_KEYPHRASE',
  ),
};
