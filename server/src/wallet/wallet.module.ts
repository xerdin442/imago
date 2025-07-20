import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { BullModule } from '@nestjs/bull';
import { HelperService } from './helpers';
import { EthWeb3Provider, SolanaWeb3Provider } from './providers';
import { WalletGateway } from './wallet.gateway';
import { WalletProcessor } from './wallet.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'wallet-queue',
    }),
  ],
  controllers: [WalletController],
  providers: [
    WalletService,
    WalletGateway,
    WalletProcessor,
    EthWeb3Provider,
    SolanaWeb3Provider,
    HelperService,
  ],
  exports: [WalletService],
})
export class WalletModule {}
