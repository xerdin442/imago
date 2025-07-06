import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import logger from '@src/common/logger';
import { Secrets } from '@src/common/secrets';

@Injectable()
export class DbService extends PrismaClient {
  private context = DbService.name;

  constructor() {
    super({
      datasources: {
        db: { url: Secrets.DATABASE_URL },
      },
    });
  }

  async cleanDb() {
    try {
      await this.$transaction([
        this.message.deleteMany(),
        this.chat.deleteMany(),
        this.wager.deleteMany(),
        this.transaction.deleteMany(),
        this.admin.deleteMany(),
        this.user.deleteMany(),
      ]);

      logger.info(`[${this.context}] Database cleaned up for tests.\n`);
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while cleaning database. Error: ${error.message}.\n`,
      );
      throw error;
    }
  }
}
