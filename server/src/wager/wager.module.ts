import { Module } from '@nestjs/common';
import { WagerController } from './wager.controller';
import { WagerService } from './wager.service';
import { WagerGateway } from './wager.gateway';
import { WagerProcessor } from './wager.processor';
import { BullModule } from '@nestjs/bull';
import { HelperService } from './helpers';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'wager-queue',
    }),
  ],
  controllers: [WagerController],
  providers: [WagerService, HelperService, WagerGateway, WagerProcessor],
})
export class WagerModule {}
