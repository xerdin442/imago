import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { UserModule } from './user/user.module';
import { WagerModule } from './wager/wager.module';
import { WalletModule } from './wallet/wallet.module';
import { DbModule } from './db/db.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    AuthModule,
    AdminModule,
    UserModule,
    WagerModule,
    WalletModule,
    DbModule,
    MetricsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
