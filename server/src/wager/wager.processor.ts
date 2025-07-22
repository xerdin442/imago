import { Processor, Process } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { DbService } from '@src/db/db.service';
import { MetricsService } from '@src/metrics/metrics.service';
import { Job } from 'bull';
import { HelperService } from './helpers';
import { WagerGateway } from './wager.gateway';
import { sendEmail } from '@src/common/config/mail';
import logger from '@src/common/logger';

interface WagerClaimJob {
  claimantId: number;
  wagerId: number;
  opponentId: number;
}

@Injectable()
@Processor('wager-queue')
export class WagerProcessor {
  private readonly context: string = WagerProcessor.name;

  constructor(
    private readonly prisma: DbService,
    private readonly helper: HelperService,
    private readonly metrics: MetricsService,
    private readonly gateway: WagerGateway,
  ) {}

  @Process('claim-wager')
  async claimWager(job: Job<WagerClaimJob>) {
    try {
      const { claimantId, wagerId, opponentId } = job.data;

      const wager = await this.prisma.wager.findUniqueOrThrow({
        where: { id: wagerId },
      });
      const claimant = await this.prisma.user.findUniqueOrThrow({
        where: { id: claimantId },
      });
      const opponent = await this.prisma.user.findUniqueOrThrow({
        where: { id: opponentId },
      });

      const subject = 'Accept or Contest Claim';
      const content = `@${claimant.username} has claimed the prize in the ${wager.title} wager.
        Accepting the claim means that you accept defeat and forfeit the prize.
        Contesting the claim means that you disagree and the claim will be settled through dispute resolution.`;
      await sendEmail(opponent.email, subject, content);
    } catch (error) {
      throw error;
    }
  }

  @Process('settle-wager')
  async settleWager(job: Job<WagerClaimJob>) {
    try {
      const { wagerId, claimantId, opponentId } = job.data;

      // Update wager status
      const wager = await this.prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'SETTLED' },
      });

      // Subtract platform fee and add winnings to the claimant's balance
      const winnings =
        wager.amount - this.helper.calculatePlatformFee(wager.amount);

      const claimant = await this.prisma.user.update({
        where: { id: claimantId },
        data: {
          balance: { increment: winnings },
        },
      });

      // Update the claimant's reward points
      await this.helper.updateRewardPoints(claimantId, winnings);

      const opponent = await this.prisma.user.findUniqueOrThrow({
        where: { id: opponentId },
      });

      // Notify the claimant and opponent via email
      const subject = 'Wager Settled';

      const claimantMailContent = `The 24-hour window for @${opponent.username} to accept or contest your claim in ${wager.title} wager has elapsed, and the wager has been settled in your favour. More wins, champ!`;
      await sendEmail(claimant.email, subject, claimantMailContent);

      const opponentMailContent = `The 24-hour window to accept or contest @${claimant.username}'s claim in ${wager.title} wager has elapsed, and the wager has been settled in favour of @${claimant.username}. Better luck next time!`;
      await sendEmail(opponent.email, subject, opponentMailContent);
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while claiming wager prize. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }

  @Process('contest-wager')
  async contestWagerClaim(job: Job<Record<string, number>>) {
    try {
      const wager = await this.prisma.wager.findUniqueOrThrow({
        where: { id: job.data.wagerId },
      });

      // Assign the resolution chat to the admin in this category
      const admins = await this.prisma.admin.findMany({
        where: {
          category: wager.category,
          NOT: { id: 1 }, // Excluding the super admin
        },
      });
      // Find the admin with the least number of active disputes
      const sortedAdmins = admins.sort((a, b) => a.disputes - b.disputes);
      const selectedAdmin = sortedAdmins[0];
      await this.prisma.admin.update({
        where: { id: selectedAdmin.id },
        data: { disputes: { increment: 1 } },
      });

      // Create dispute resolution chat
      const chat = await this.prisma.chat.create({
        data: {
          adminId: selectedAdmin.id,
          wagerId: wager.id,
          messages: {
            create: {
              author: 'Bot',
              content: `The prize claim in this wager was contested and this dispute resolution chat has been created to settle the contest.
                  An admin will be assigned to this chat shortly. Please ensure to have photos, videos, screenshots,
                  and any other evidence to support your claim as the winner of this wager. Goodluck!`,
            },
          },
        },
      });

      // Add the admin and wager players to the dispute chat
      await this.gateway.joinDisputeChat(chat.id, selectedAdmin.email, [
        wager.playerOne,
        wager.playerTwo as number,
      ]);

      // Update wager dispute metrics
      this.metrics.incrementCounter('wager_disputes', [
        wager.category.toLowerCase(),
      ]);

      return;
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while contesting wager claim. Error: ${error.message}.\n`,
      );

      throw error;
    }
  }
}
