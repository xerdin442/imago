import { Process, Processor } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { DepositDTO, WithdrawalDTO } from './dto';
import { TransactionStatus, User } from '@prisma/client';
import { WalletService } from './wallet.service';
import { DbService } from '@src/db/db.service';
import { sendEmail } from '@src/common/config/mail';
import logger from '@src/common/logger';

interface TransactionJob {
  dto: DepositDTO | WithdrawalDTO;
  user: User;
  transactionId: number;
  idempotencyKey?: string;
}

@Injectable()
@Processor('wallet-queue')
export class WalletProcessor {
  private readonly context: string = WalletProcessor.name;

  constructor(
    private readonly prisma: DbService,
    private readonly walletService: WalletService,
  ) {}

  @Process('deposit')
  async processDeposit(job: Job<TransactionJob>): Promise<void> {
    const { user, transactionId } = job.data;
    const dto = job.data.dto as DepositDTO;

    try {
      const checkDepositStatus = async (
        status: TransactionStatus,
        date: string,
      ): Promise<void> => {
        if (status === 'SUCCESS') {
          // Notify user of successful deposit
          const content = `$${dto.amount} has been deposited in your wallet. Your balance is $${user.balance}. Date: ${date}`;
          await sendEmail(user.email, 'Deposit Successful', content);

          logger.info(
            `[${this.context}] Successful deposit by ${user.email}. Amount: $${dto.amount}\n`,
          );
        } else if (status === 'FAILED') {
          // Notify user of failed deposit
          const content = `Your deposit of $${dto.amount} on ${date} was unsuccessful. Please try again later.`;
          await sendEmail(user.email, 'Failed Deposit', content);

          logger.info(
            `[${this.context}] Failed deposit by ${user.email}. Amount: $${dto.amount}\n`,
          );
        } else if (status === 'PENDING') {
          // Retry pending transaction after 30 seconds
          setTimeout(() => {
            void (async () => await initiateDepositConfirmation())();
          }, 30 * 1000);
        }
      };

      const initiateDepositConfirmation = async (): Promise<void> => {
        let depositStatus: TransactionStatus;
        const transaction = await this.prisma.transaction.findUniqueOrThrow({
          where: { id: transactionId },
        });

        dto.chain === 'BASE'
          ? (depositStatus = await this.walletService.processDepositOnBase(
              dto,
              transaction,
            ))
          : (depositStatus = await this.walletService.processDepositOnSolana(
              dto,
              transaction,
            ));

        const date: string = transaction.createdAt.toISOString();
        await checkDepositStatus(depositStatus, date);
      };

      // Initiate first attempt to process deposit confirmation
      await initiateDepositConfirmation();
    } catch (error) {
      logger.error(
        `[${this.context}] An error occured while confirming user deposit for tx: ${dto.txIdentifier}. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @Process('withdrawal')
  async processWithdrawal(job: Job<TransactionJob>): Promise<void> {
    const { user, transactionId, idempotencyKey } = job.data;
    const dto = job.data.dto as WithdrawalDTO;

    const transaction = await this.prisma.transaction.findUniqueOrThrow({
      where: { id: transactionId },
    });

    try {
      dto.chain === 'BASE'
        ? await this.walletService.processWithdrawalOnBase(
            dto,
            transaction,
            idempotencyKey as string,
          )
        : await this.walletService.processWithdrawalOnSolana(
            dto,
            transaction,
            idempotencyKey as string,
          );

      logger.info(
        `[${this.context}] Successful withdrawal by ${user.email}. Amount: $${dto.amount}\n`,
      );

      // Check balance of native assets and stablecoins in platform wallet
      await this.walletService.checkStablecoinBalance(dto.chain);
      await this.walletService.checkNativeAssetBalance(dto.chain);
    } catch (error) {
      logger.error(
        `[${this.context}] Failed withdrawal of $${dto.amount} for ${user.email}. Error: ${error.message}\n`,
      );

      throw error;
    }
  }
}
