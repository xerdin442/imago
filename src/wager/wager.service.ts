import { InjectQueue } from '@nestjs/bull';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Wager, Message } from '@prisma/client';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import {
  CreateWagerDTO,
  DisputeResolutionDTO,
  UpdateWagerDTO,
  WagerInviteDTO,
} from './dto';
import { DbService } from '@src/db/db.service';
import { calculatePlatformFee } from './helpers';

@Injectable()
export class WagerService {
  constructor(
    private readonly prisma: DbService,
    @InjectQueue('wager-queue') private readonly wagersQueue: Queue,
  ) {}

  async createWager(userId: number, dto: CreateWagerDTO): Promise<Wager> {
    try {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });

      // Check if stake is less than the mininmum
      if (dto.stake < 1) {
        throw new BadRequestException('Minimum stake is $1');
      }
      // Check if user has sufficient funds to stake in the wager
      if (dto.stake > user.balance) {
        throw new BadRequestException('Insufficient balance');
      }

      // Create new wager
      const wager = await this.prisma.wager.create({
        data: {
          category: dto.category,
          conditions: dto.conditions,
          title: dto.title,
          amount: dto.stake * 2,
          inviteCode: randomUUID().split('-')[3],
          playerOne: userId,
        },
      });

      // Update user balance
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: dto.stake } },
      });

      return wager;
    } catch (error) {
      throw error;
    }
  }

  async updateWager(
    userId: number,
    wagerId: number,
    dto: UpdateWagerDTO,
  ): Promise<void> {
    try {
      const wager = await this.prisma.wager.findUniqueOrThrow({
        where: { id: wagerId },
      });

      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });

      // Verify that the user is the wager creator
      if (wager.playerOne !== userId) {
        throw new BadRequestException(
          'Details of a wager can only be modified by its creator',
        );
      }
      // Confirm wager status
      if (wager.status === 'ACTIVE') {
        throw new BadRequestException(
          'Details of an active wager cannot be modified',
        );
      }

      // Check if updated stake is less than the mininmum
      if ((dto.stake as number) < 1) {
        throw new BadRequestException('Minimum stake is $1');
      }
      // Check if user balance is less than the updated stake
      if ((dto.stake as number) > user.balance) {
        throw new BadRequestException('Insufficient balance');
      }

      if (wager.status === 'PENDING') {
        await this.prisma.wager.update({
          where: { id: wagerId },
          data: { ...dto },
        });

        return;
      }
    } catch (error) {
      throw error;
    }
  }

  async findWagerByInviteCode(dto: WagerInviteDTO): Promise<Wager> {
    try {
      const wager = await this.prisma.wager.findUnique({
        where: { ...dto },
      });

      if (!wager) {
        throw new BadRequestException('Invalid wager invite code');
      }

      return wager;
    } catch (error) {
      throw error;
    }
  }

  async joinWager(userId: number, wagerId: number): Promise<string> {
    try {
      const wager = await this.prisma.wager.findUniqueOrThrow({
        where: { id: wagerId },
      });

      if (wager.playerOne === userId) {
        throw new BadRequestException(
          'The creator of a wager cannot join the wager. Please invite another user',
        );
      }
      if (wager.playerOne && wager.playerTwo) {
        throw new BadRequestException(
          'This wager cannot have more than two players',
        );
      }

      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });

      // Check if user has sufficient funds to stake and join the wager
      const stake = wager.amount / 2;
      if (stake > user.balance) {
        throw new BadRequestException('Insufficient balance');
      }

      // Update wager status
      await this.prisma.wager.update({
        where: { id: wagerId },
        data: {
          playerTwo: userId,
          status: 'ACTIVE',
        },
      });

      // Update user balance after joining wager
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: stake } },
      });

      return wager.title;
    } catch (error) {
      throw error;
    }
  }

  async getWagerDetails(wagerId: number): Promise<Wager> {
    try {
      return this.prisma.wager.findUniqueOrThrow({
        where: { id: wagerId },
      });
    } catch (error) {
      throw error;
    }
  }

  async claimWager(userId: number, wagerId: number): Promise<string> {
    try {
      const wager = await this.prisma.wager.findUniqueOrThrow({
        where: { id: wagerId },
      });

      if (wager.status === 'SETTLED') {
        throw new BadRequestException('This wager has already been settled!');
      }
      if (wager.playerOne !== userId && wager.playerTwo !== userId) {
        throw new BadRequestException(
          'A prize can only be claimed by any of the two players in this wager',
        );
      }

      let opponentId: number;
      wager.playerOne === userId
        ? (opponentId = wager.playerTwo as number)
        : (opponentId = wager.playerOne);

      // Store the claimant as the winner temporarily until the opponent takes action within 24 hours
      await this.prisma.wager.update({
        where: { id: wagerId },
        data: { winner: userId },
      });

      // Notify the opponent of the claim
      await this.wagersQueue.add('claim-wager', {
        claimantId: userId,
        wagerId,
        opponentId,
      });

      // Automatically settle the wager after 24 hours if the opponent takes no action
      await this.wagersQueue.add(
        'settle-wager',
        { wagerId, claimantId: userId, opponentId },
        {
          jobId: `wager-${wagerId}`,
          delay: 24 * 60 * 60 * 1000,
        },
      );

      return wager.title;
    } catch (error) {
      throw error;
    }
  }

  async acceptWagerClaim(wagerId: number): Promise<void> {
    try {
      const wager = await this.prisma.wager.findUniqueOrThrow({
        where: { id: wagerId },
      });

      if (wager.status === 'SETTLED') {
        throw new BadRequestException('This wager has already been settled!');
      }
      await this.wagersQueue.removeJobs(`wager-${wagerId}`);

      await this.prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'SETTLED' },
      });

      // Subtract platform fee and add winnings to winner's balance
      await this.prisma.user.update({
        where: { id: wager.winner as number },
        data: {
          balance: {
            increment: wager.amount - calculatePlatformFee(wager.amount),
          },
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async contestWagerClaim(wagerId: number): Promise<void> {
    try {
      const wager = await this.prisma.wager.findUniqueOrThrow({
        where: { id: wagerId },
      });

      if (wager.status === 'SETTLED') {
        throw new BadRequestException('This wager has already been settled!');
      }
      await this.wagersQueue.removeJobs(`wager-${wagerId}`);

      // Update wager status and reset winner data
      await this.prisma.wager.update({
        where: { id: wagerId },
        data: {
          status: 'DISPUTE',
          winner: null,
        },
      });

      await this.wagersQueue.add('contest-wager', { wagerId });

      return;
    } catch (error) {
      throw error;
    }
  }

  async deleteWager(userId: number, wagerId: number): Promise<void> {
    try {
      const wager = await this.prisma.wager.findUniqueOrThrow({
        where: { id: wagerId },
      });

      if (wager.playerOne !== userId) {
        throw new BadRequestException(
          'A wager can only be deleted by its creator',
        );
      }
      if (wager.status === 'ACTIVE') {
        throw new BadRequestException('An active wager cannot be deleted');
      }
      if (wager.status === 'PENDING') {
        await this.prisma.wager.delete({
          where: { id: wagerId },
        });

        return;
      }
    } catch (error) {
      throw error;
    }
  }

  async getDisputeChatMessages(wagerId: number): Promise<Message[]> {
    try {
      return this.prisma.message.findMany({
        where: {
          chat: { wagerId },
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error) {
      throw error;
    }
  }

  async assignWinnerAfterResolution(
    wagerId: number,
    dto: DisputeResolutionDTO,
  ): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (!user) {
        throw new BadRequestException('Invalid username');
      }

      // Update the status and winner of the wager
      const wager = await this.prisma.wager.update({
        where: { id: wagerId },
        data: {
          winner: user.id,
          status: 'SETTLED',
        },
      });

      // Subtract platform fee and add winnings to the winner's balance
      await this.prisma.user.update({
        where: { username: dto.username },
        data: {
          balance: {
            increment: wager.amount - calculatePlatformFee(wager.amount),
          },
        },
      });
    } catch (error) {
      throw error;
    }
  }
}
