import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Transaction, User } from '@prisma/client';
import { GetUser } from '../custom/decorators';
import { DepositDTO, RedeemRewardsDTO, WithdrawalDTO } from './dto';
import { AuthGuard } from '@nestjs/passport';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { HelperService } from './helpers';
import { WalletService } from './wallet.service';
import { connectToRedis } from '@src/common/config/redis';
import { RedisClientType } from 'redis';
import { Secrets } from '@src/common/secrets';
import logger from '@src/common/logger';

@Controller('wallet')
@UseGuards(AuthGuard('jwt'))
export class WalletController {
  private readonly context: string = WalletController.name;

  constructor(
    private readonly helper: HelperService,
    private readonly walletService: WalletService,
    @InjectQueue('wallet-queue') private readonly walletQueue: Queue,
  ) {}

  @Post('deposit')
  @HttpCode(HttpStatus.OK)
  async processDeposit(
    @GetUser() user: User,
    @Body() dto: DepositDTO,
  ): Promise<{ transaction: Transaction }> {
    try {
      const { depositor, txIdentifier, chain } = dto;

      // Validate transaction identifier
      const validTxIdentifier: boolean = this.helper.validateTxIdentifier(
        chain,
        txIdentifier,
      );
      if (!validTxIdentifier)
        throw new BadRequestException('Invalid transaction identifier');

      // Validate depositor address
      const isValidAddress: boolean = this.helper.validateAddress(
        chain,
        depositor,
      );
      if (!isValidAddress)
        throw new BadRequestException('Invalid depositor address');

      // Initiate a pending transaction and process confirmation of deposit
      const transaction = await this.walletService.initiateTransaction(
        user.id,
        dto,
      );
      await this.walletQueue.add('deposit', {
        dto,
        user,
        transactionId: transaction.id,
      });

      return { transaction };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while processing user deposit. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  async processWithdrawal(
    @GetUser() user: User,
    @Body() dto: WithdrawalDTO,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Promise<{ transaction?: Transaction; message?: string }> {
    // Initialize Redis connection
    const redis: RedisClientType = await connectToRedis(
      Secrets.REDIS_URL,
      'Idempotency Keys',
      Secrets.IDEMPOTENCY_KEYS_STORE_INDEX,
    );

    try {
      const { address, chain, amount } = dto;

      // Check if request contains a valid idempotency key
      if (!idempotencyKey) {
        throw new BadRequestException('"Idempotency-Key" header is required');
      }

      // Check if user has attempted similar withdrawal within the last 15 mins
      const existingWithdrawal = await redis.get(idempotencyKey);
      if (existingWithdrawal) {
        logger.warn(
          `[${this.context}] Duplicate withdrawal attempts by ${user.email}\n`,
        );

        const { status } = JSON.parse(existingWithdrawal) as { status: string };

        if (status === 'PROCESSING') {
          return {
            message: `Your withdrawal of ${amount} is being processed`,
          };
        } else {
          return { message: `Your withdrawal of ${amount} has been processed` };
        }
      }

      // Throw if the domain name is an ENS domain
      const isENSdomain = /(?<!\.base)\.eth$/;
      if (isENSdomain.test(address)) {
        throw new BadRequestException(
          'Only Basenames and SNS domains are supported at this time',
        );
      }

      // Resolve recipient's domain name if provided
      if (address.endsWith('.base.eth') || address.endsWith('.sol')) {
        const resolvedAddress = await this.walletService.resolveDomainName(
          chain,
          address,
        );

        if (!resolvedAddress) {
          let nameService: string = '';
          chain === 'BASE'
            ? (nameService = 'Basename')
            : (nameService = 'SNS domain');

          throw new BadRequestException(
            `Invalid or unregistered ${nameService}`,
          );
        }

        dto.address = resolvedAddress;
      }

      // Validate recipient address
      const isValidAddress: boolean = this.helper.validateAddress(
        chain,
        dto.address,
      );
      if (!isValidAddress) {
        throw new BadRequestException('Invalid recipient address');
      }

      // Check if withdrawal amount exceeds user balance
      if (user.balance < amount) {
        throw new BadRequestException(
          `Insufficient funds. Your balance is $${user.balance}`,
        );
      }

      // Check if withdrawal amount is below the allowed minimum
      if (amount < 5) {
        throw new BadRequestException('Minimum withdrawal amount is $5');
      }

      // Initiate pending withdrawal transaction
      const transaction = await this.walletService.initiateTransaction(
        user.id,
        dto,
      );

      // Store idempotency key to prevent similar withdrawal attempts within the next 15 mins
      await redis.setEx(
        idempotencyKey,
        900,
        JSON.stringify({ status: 'PROCESSING' }),
      );

      // Complete processing of withdrawal
      await this.walletQueue.add('withdrawal', {
        dto,
        user,
        transactionId: transaction.id,
        idempotencyKey,
      });

      return { transaction };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while processing user withdrawal. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @Get('rewards')
  async getRewards(@GetUser() user: User): Promise<{ rewards: number }> {
    try {
      return { rewards: await this.walletService.getRewards(user.id) };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while fetching user rewards. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @Post('rewards/redeem')
  @HttpCode(HttpStatus.OK)
  async redeemRewards(
    @GetUser() user: User,
    @Body() dto: RedeemRewardsDTO,
  ): Promise<{ message: string }> {
    try {
      // Resolve recipient's domain name if provided
      if (dto.address.endsWith('.sol')) {
        const resolvedAddress = await this.walletService.resolveDomainName(
          'SOLANA',
          dto.address,
        );

        if (!resolvedAddress) {
          throw new BadRequestException('Invalid or unregistered SNS domain');
        }

        dto.address = resolvedAddress;
      }

      // Validate recipient address
      const isValidAddress: boolean = this.helper.validateAddress(
        'SOLANA',
        dto.address,
      );
      if (!isValidAddress) {
        throw new BadRequestException('Invalid recipient address');
      }

      // Redeem user rewards
      const signature = await this.walletService.redeemRewards(user.id, dto);

      return {
        message: `Your rewards have been redeemed to BONK tokens and transferred to your wallet! Verify the transaction here: ${signature}`,
      };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while redeeming user rewards. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @Post('rewards/convert')
  @HttpCode(HttpStatus.OK)
  async convertRewards(@GetUser() user: User) {}
}
