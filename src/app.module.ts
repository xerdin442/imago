import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { UserModule } from './user/user.module';
import { WagerModule } from './wager/wager.module';
import { WalletModule } from './wallet/wallet.module';
import { DbModule } from './db/db.module';
import { MetricsModule } from './metrics/metrics.module';
import { ConfigModule } from '@nestjs/config';
import { Secrets } from './common/secrets';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { AppController } from './app.controller';

@Module({
  imports: [
    AuthModule,
    AdminModule,
    UserModule,
    WagerModule,
    WalletModule,
    DbModule,
    MetricsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      redis: {
        host: Secrets.REDIS_HOST,
        port: Secrets.REDIS_PORT,
        db: Secrets.QUEUE_STORE_INDEX,
        password: Secrets.REDIS_PASSWORD,
        family: 0,
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'Seconds',
        ttl: 1000,
        limit: Secrets.RATE_LIMIT_PER_SECOND,
      },
      {
        name: 'Minutes',
        ttl: 60000,
        limit: Secrets.RATE_LIMIT_PER_MINUTE,
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  controllers: [AppController],
})
export class AppModule {}
