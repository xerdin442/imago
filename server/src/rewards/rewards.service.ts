import { Injectable } from '@nestjs/common';
import { WalletService } from '@src/wallet/wallet.service';

@Injectable()
export class RewardsService {
  constructor(private readonly walletService: WalletService) {}

  async getRewards(userId: number) {}

  async populateLeaderboard() {}

  async withdrawRewards(userId: number) {}

  async convertRewards(userId: number) {}
}
