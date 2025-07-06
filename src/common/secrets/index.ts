import { ConfigService } from '@nestjs/config';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  GetSecretValueCommandOutput,
} from '@aws-sdk/client-secrets-manager';

// Initialize Config Service
const config = new ConfigService();

// Initialize AWS SecretsManager Client
const client = new SecretsManagerClient({
  region: 'eu-west-2',
});

// Retrieve wallet keyphrase from cloud storage
const getWalletKeyphrase = async (): Promise<string> => {
  try {
    const response: GetSecretValueCommandOutput = await client.send(
      new GetSecretValueCommand({
        SecretId: 'wager-app/platform-wallet-keyphrase',
        VersionStage: 'AWSCURRENT',
      }),
    );

    return response.SecretString as string;
  } catch (error) {
    throw error;
  }
};

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
  DEFAULT_IMAGE: config.getOrThrow<string>('DEFAULT_IMAGE'),
  RESEND_EMAIL_API_KEY: config.getOrThrow<string>('RESEND_EMAIL_API_KEY'),
  APP_NAME: config.getOrThrow<string>('APP_NAME'),
  APP_EMAIL: config.getOrThrow<string>('APP_EMAIL'),
  RATE_LIMIT_PER_SECOND: config.getOrThrow<number>('RATE_LIMIT_PER_SECOND'),
  RATE_LIMIT_PER_MINUTE: config.getOrThrow<number>('RATE_LIMIT_PER_MINUTE'),
  GOOGLE_CLIENT_ID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
  GOOGLE_CALLBACK_URL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
  AWS_ACCESS_KEY_ID: config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
  AWS_SECRET_ACCESS_KEY: config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
  AWS_REGION: config.getOrThrow<string>('AWS_REGION'),
  AWS_S3_BUCKET_NAME: config.getOrThrow<string>('AWS_S3_BUCKET_NAME'),
  SOCIAL_AUTH_PASSWORD: config.getOrThrow<string>('SOCIAL_AUTH_PASSWORD'),
  HELIUS_API_KEY: config.getOrThrow<string>('HELIUS_API_KEY'),
  ALCHEMY_API_KEY: config.getOrThrow<string>('ALCHEMY_API_KEY'),
  COINGECKO_API_KEY: config.getOrThrow<string>('COINGECKO_API_KEY'),
  THIRDWEB_API_KEY: config.getOrThrow<string>('THIRDWEB_API_KEY'),
  PLATFORM_WALLET_KEYPHRASE: getWalletKeyphrase().then((keyphrase) => {
    return keyphrase.trim();
  }),
};
