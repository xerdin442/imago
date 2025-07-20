import { Module } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';
import { WalletModule } from '@src/wallet/wallet.module';

@Module({
  imports: [WalletModule],
  providers: [RewardsService],
  controllers: [RewardsController],
})
export class RewardsModule {}
