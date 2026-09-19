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
import { FundsTransferDTO, GetTransactionsDTO, UpdateProfileDTO } from './dto';
import { UserService } from './user.service';
import { Logger } from '@src/common/logger';
import { UploadService } from '@src/common/config/upload';

@Controller('user')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  private readonly logger = Logger(UserController.name);

  constructor(private readonly userService: UserService) {}

  @Get('profile')
  getProfile(@GetUser() user: User): { user: User } {
    this.logger.info(`Profile viewed by ${user.email}`);

    return { user };
  }

  @Patch('profile')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      fileFilter: UploadService.fileFilter,
      limits: { fileSize: 8 * 1024 * 1024 },
      storage: UploadService.storage('user_profile', 'image'),
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
        file?.path,
      );

      this.logger.info(`Profile updated by ${user.email}.`);

      return { user: updatedUser, message: 'Profile updated successfully' };
    } catch (error) {
      this.logger.error(
        `An error occurred while updating profile details. Error: ${error.message}`,
      );

      throw error;
    }
  }

  @Delete('profile')
  async deleteAccount(@GetUser() user: User): Promise<{ message: string }> {
    try {
      await this.userService.deleteAccount(user);

      this.logger.info(`Profile deleted by ${user.email}.`);

      return { message: 'Account deleted successfully' };
    } catch (error) {
      this.logger.error(
        `An error occurred while deleting user profile. Error: ${error.message}`,
      );

      throw error;
    }
  }

  @Get('wagers')
  async getWagers(@GetUser() user: User): Promise<{ wagers: Wager[] }> {
    try {
      return { wagers: await this.userService.getWagers(user.id) };
    } catch (error) {
      this.logger.error(
        `An error occurred while retrieving user's wagers. Error: ${error.message}`,
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
      this.logger.error(
        `An error occurred while retrieving user's transaction history. Error: ${error.message}`,
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

      this.logger.info(
        `Successful funds transfer from ${user.email} to ${recipient}. Amount: $${dto.amount}`,
      );

      return {
        message: `$${dto.amount} transfer to @${dto.username} was successful!`,
      };
    } catch (error) {
      this.logger.error(
        `An error occurred while processing funds transfer. Error: ${error.message}`,
      );

      throw error;
    }
  }

  @Get(':userId')
  async getUserById(@Param('userId') userId: number): Promise<{ user: User }> {
    try {
      return { user: await this.userService.getUserById(userId) };
    } catch (error) {
      this.logger.error(
        `An error occurred while retrieving user's details by ID. Error: ${error.message}`,
      );

      throw error;
    }
  }
}
