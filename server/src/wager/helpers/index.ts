import { Injectable } from '@nestjs/common';
import { DbService } from '@src/db/db.service';

@Injectable()
export class HelperService {
  constructor(private readonly prisma: DbService) {}

  calculatePlatformFee(amount: number): number {
    const tiers = [
      { threshold: 100, rate: 0.08 }, // 8% for the first $100
      { threshold: 1000, rate: 0.05 }, // 5% for the portion between $100.01 and $1000
      { threshold: 10000, rate: 0.03 }, // 3% for the portion between $1000.01 and $10000
      { threshold: 100000, rate: 0.015 }, // 1.5% for the portion between $10000.01 and $100000
      { threshold: 999999999, rate: 0.0035 }, // 0.35% for any amount above $100,000
    ];

    const MIN_FEE = 0.5; // Minimum fee to cover very small wagers

    let fee = 0;
    let remainingAmount = amount;
    let previousThreshold = 0;

    for (const tier of tiers) {
      if (remainingAmount <= 0) {
        break;
      }

      // Amount within the current tier's bracket
      const amountInThisTier = Math.min(
        remainingAmount,
        tier.threshold - previousThreshold,
      );

      // Apply the rate in this tier
      fee += amountInThisTier * tier.rate;

      remainingAmount -= amountInThisTier;
      previousThreshold = tier.threshold;
    }

    return Math.max(fee, MIN_FEE);
  }

  async updateRewardPoints(userId: number, winnings: number): Promise<void> {
    try {
      // Calculate reward points (1% of winnings)
      const rewardPoints = winnings * 0.01;

      // Update user rewards with a maximum of 125 points
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          rewards: {
            increment: rewardPoints < 125 ? rewardPoints : 125,
          },
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }
}
