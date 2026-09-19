import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Logger } from '@src/common/logger';
import { Secrets } from '@src/common/secrets';

@Injectable()
export class DbService extends PrismaClient {
  private readonly logger = Logger(DbService.name);

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

      this.logger.info('Database cleaned up for tests.');
    } catch (error) {
      this.logger.error(
        `An error occurred while cleaning database. Error: ${error.message}.`,
      );
      throw error;
    }
  }
}
