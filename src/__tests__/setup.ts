/// <reference types="jest" />

import 'reflect-metadata';
import 'dotenv/config';

jest.mock('@src/common/secrets', () => ({
  Secrets: {
    PORT: 3000,
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
    JWT_SECRET: 'test-jwt-secret',
    REDIS_PORT: 6379,
    REDIS_HOST: 'localhost',
    REDIS_PASSWORD: 'test-redis-password',
    REDIS_URL: 'redis://localhost:6379',
    CORS_ORIGINS: ['http://localhost:3000'],
    DEFAULT_IMAGE: 'https://example.com/default-image.png',
    RESEND_EMAIL_API_KEY: 'test-resend-api-key',
    APP_NAME: 'Wager Application',
    APP_EMAIL: 'test@example.com',
    RATE_LIMIT_PER_SECOND: 1000,
    RATE_LIMIT_PER_MINUTE: 1000,
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
    APPLE_CLIENT_ID: 'test-apple-client-id',
    APPLE_CALLBACK_URL: 'http://localhost:3000/api/auth/apple/callback',
    CLOUD_NAME: 'test-cloud-name',
    CLOUD_API_SECRET: 'test-cloud-api-secret',
    CLOUD_API_KEY: 'test-cloud-api-key',
    SOCIAL_AUTH_PASSWORD: 'social-auth-password',
    HELIUS_API_KEY: 'test-helius-api-key',
    ALCHEMY_API_KEY: 'test-alchemy-api-key',
    COINGECKO_API_KEY: 'coingecko-api-key',
    THIRDWEB_API_KEY: 'thirdweb-api-key',
    PLATFORM_WALLET_KEYPHRASE: 'test platform wallet keyphrase',
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});
