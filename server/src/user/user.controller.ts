import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Transaction, User, Wager } from '@prisma/client';
import { GetUser } from '../custom/decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { FundsTransferDTO, GetTransactionsDTO, UpdateProfileDTO } from './dto';
import { UserService } from './user.service';
import logger from '@src/common/logger';

@Controller('user')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  private readonly context: string = UserController.name;

  constructor(private readonly userService: UserService) {}

  @Get('profile')
  getProfile(@GetUser() user: User): { user: User } {
    logger.info(`[${this.context}] Profile viewed by ${user.email}\n`);

    return { user };
  }

  @Patch('profile')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: multer.memoryStorage(),
      limits: { fieldSize: 8 * 1024 * 1024 },
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: multer.FileFilterCallback,
      ): void => {
        const allowedMimetypes: string[] = [
          'image/png',
          'image/heic',
          'image/jpeg',
          'image/webp',
          'image/heif',
        ];

        if (allowedMimetypes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
    }),
  )
  async updateProfile(
    @GetUser() user: User,
    @Body() dto: UpdateProfileDTO,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ user: User; message: string }> {
    try {
      const updatedUser = await this.userService.updateProfile(
        user.id,
        dto,
        file,
      );

      logger.info(`[${this.context}] Profile updated by ${user.email}.\n`);

      return { user: updatedUser, message: 'Profile updated successfully' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while updating profile details. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @Delete('profile')
  async deleteAccount(@GetUser() user: User): Promise<{ message: string }> {
    try {
      await this.userService.deleteAccount(user);

      logger.info(`[${this.context}] Profile deleted by ${user.email}.\n`);

      return { message: 'Account deleted successfully' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while deleting user profile. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @Get('wagers')
  async getWagers(@GetUser() user: User): Promise<{ wagers: Wager[] }> {
    try {
      return { wagers: await this.userService.getWagers(user.id) };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while retrieving user's wagers. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @Get('transactions')
  async getTransactionHistory(
    @GetUser() user: User,
    @Query() dto: GetTransactionsDTO,
  ): Promise<{ transactions: Transaction[] }> {
    try {
      return {
        transactions: await this.userService.getTransactionHistory(
          user.id,
          dto,
        ),
      };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while retrieving user's transaction history. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @Post('wallet/transfer')
  @HttpCode(HttpStatus.OK)
  async transferFunds(
    @GetUser() user: User,
    @Body() dto: FundsTransferDTO,
  ): Promise<{ message: string }> {
    try {
      const recipient = await this.userService.transferFunds(user.id, dto);

      logger.info(
        `[${this.context}] Successful funds transfer from ${user.email} to ${recipient}. Amount: $${dto.amount}\n`,
      );

      return {
        message: `$${dto.amount} transfer to @${dto.username} was successful!`,
      };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while processing funds transfer. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @Get(':userId')
  async getUserById(@Param('userId') userId: number): Promise<{ user: User }> {
    return { user: await this.userService.getUserById(userId) };
  }
}
