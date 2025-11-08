import { Injectable, OnModuleInit } from '@nestjs/common';
import { RedisClientType } from 'redis';
import logger from '../logger';
import { Secrets } from '../secrets';
import { SessionData } from '../types';
import { connectToRedis } from '../config/redis';

@Injectable()
export class SessionService implements OnModuleInit {
  private readonly context = SessionService.name;
  private redis: RedisClientType;

  async onModuleInit() {
    this.redis = await connectToRedis(
      Secrets.REDIS_URL,
      this.context,
      Secrets.SESSION_STORE_INDEX,
    );
  }

  async set(key: string, value: SessionData): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value));
      logger.info(`[${this.context}] Session data updated by ${key}.\n`);
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while updating session data. Error: ${error.message}.\n`,
      );
      throw error;
    }
  }

  async get(key: string): Promise<SessionData> {
    try {
      const data = await this.redis.get(key);
      logger.info(`[${this.context}] User session retrieved by ${key}.\n`);

      return JSON.parse(data as string) as SessionData;
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while retrieving session data. Error: ${error.message}.\n`,
      );
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      logger.info(`[${this.context}] User session deleted by ${key}.\n`);
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while deleting user session. Error: ${error.message}.\n`,
      );
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.redis.flushAll();
      logger.info(`[${this.context}] Session store cleared for tests.\n`);
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while clearing session store. Error: ${error.message}.\n`,
      );
      throw error;
    }
  }
}
