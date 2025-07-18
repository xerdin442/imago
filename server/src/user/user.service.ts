import { BadRequestException, Injectable } from '@nestjs/common';
import { Transaction, User, Wager } from '@prisma/client';
import { FundsTransferDTO, GetTransactionsDTO, UpdateProfileDTO } from './dto';
import { DbService } from '@src/db/db.service';
import { uploadFileToS3 } from '@src/common/config/upload';

@Injectable()
export class UserService {
  constructor(private readonly prisma: DbService) {}

  async updateProfile(
    userId: number,
    dto: UpdateProfileDTO,
    file?: Express.Multer.File,
  ): Promise<User> {
    try {
      // Upload file to AWS if available
      let filePath: string = '';
      if (file) filePath = await uploadFileToS3(file, 'profile-images');

      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...dto,
          ...(filePath && { profileImage: filePath }),
        },
      });

      user.password = 'X-X-X'; // Sanitize user output

      return user;
    } catch (error) {
      throw error;
    }
  }

  async deleteAccount(user: User): Promise<void> {
    try {
      if (user.balance < 5 && user.balance > 1) {
        throw new BadRequestException(
          `Your wallet balance is $${user.balance}. Create or join a wager to max out your balance before deleting your account`,
        );
      } else if (user.balance > 5) {
        throw new BadRequestException(
          'Withdraw your wallet balance before deleting your account',
        );
      } else {
        // Delete user profile
        await this.prisma.user.delete({
          where: { id: user.id },
        });

        return;
      }
    } catch (error) {
      throw error;
    }
  }

  async getWagers(userId: number): Promise<Wager[]> {
    try {
      return this.prisma.wager.findMany({
        where: {
          OR: [{ playerOne: userId }, { playerTwo: userId }],
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw error;
    }
  }

  async getTransactionHistory(
    userId: number,
    dto: GetTransactionsDTO,
  ): Promise<Transaction[]> {
    try {
      return this.prisma.transaction.findMany({
        where: { ...dto, userId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw error;
    }
  }

  async transferFunds(userId: number, dto: FundsTransferDTO): Promise<string> {
    try {
      // Update wallet balance of the sender and recipient
      await this.prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: dto.amount } },
      });
      const recipient = await this.prisma.user.update({
        where: { username: dto.username },
        data: { balance: { increment: dto.amount } },
      });

      return recipient.email;
    } catch (error) {
      throw error;
    }
  }
}
