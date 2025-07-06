import { BadRequestException, Injectable } from '@nestjs/common';
import { Admin, Chat } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AdminAuthDTO, CreateAdminDTO } from './dto';
import * as argon from 'argon2';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { DbService } from '@src/db/db.service';
import { sendEmail } from '@src/common/config/mail';
import { Secrets } from '@src/common/secrets';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: DbService) {}

  async signup(dto: AdminAuthDTO): Promise<void> {
    try {
      const admins = await this.prisma.admin.findMany();
      if (admins.length === 1) {
        throw new BadRequestException(
          'Only one Super Admin profile can be created',
        );
      }

      const hash = await argon.hash(dto.passcode);
      await this.prisma.admin.create({
        data: {
          ...dto,
          passcode: hash,
          name: 'Super Admin',
          category: 'OTHERS',
          disputes: 0,
        },
      });

      return;
    } catch (error) {
      throw error;
    }
  }

  async login(dto: AdminAuthDTO): Promise<Admin> {
    try {
      const admin = await this.prisma.admin.findUnique({
        where: { email: dto.email },
      });
      // Check if admin is found with given email address
      if (!admin) {
        throw new BadRequestException('No admin found with that email address');
      }

      // Check if password is valid
      const checkPassword = await argon.verify(admin.passcode, dto.passcode);
      if (!checkPassword) {
        throw new BadRequestException('Access denied. Invalid passcode');
      }

      admin.passcode = 'X-X-X';

      return admin;
    } catch (error) {
      throw error;
    }
  }

  async getAllAdmins(): Promise<Admin[]> {
    try {
      return this.prisma.admin.findMany({
        where: { NOT: { id: 1 } },
      });
    } catch (error) {
      throw error;
    }
  }

  async addAddmin(dto: CreateAdminDTO): Promise<void> {
    try {
      const passcode = randomUUID().split('-').slice(1, 4).join('-');
      const hash = await argon.hash(passcode);

      const admin = await this.prisma.admin.create({
        data: {
          ...dto,
          disputes: 0,
          passcode: hash,
        },
      });

      // Send passcode to new admin
      const subject = 'Login Details';
      const content = `Welcome to the team! You're now a dispute resolution admin at ${Secrets.APP_NAME}. Your passcode is: ${passcode}.`;
      await sendEmail(admin.email, subject, content);

      return;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const meta = error.meta as Record<string, any>;

          throw new BadRequestException(
            `This ${meta.target[0]} already exists. Please try again!`,
          );
        }
      }

      throw error;
    }
  }

  async removeAddmin(adminId: number): Promise<string> {
    try {
      const admin = await this.prisma.admin.delete({
        where: { id: adminId },
      });

      return admin.email;
    } catch (error) {
      throw error;
    }
  }

  async getDisputeChats(adminId: number): Promise<Chat[]> {
    try {
      return this.prisma.chat.findMany({
        where: { adminId },
        include: { messages: true },
      });
    } catch (error) {
      throw error;
    }
  }
}
