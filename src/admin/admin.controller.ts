import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthDTO, CreateAdminDTO } from './dto';
import { SuperAdminGuard } from '../custom/guards/admin.guard';
import { AdminService } from './admin.service';
import { Logger } from '@src/common/logger';
import { Admin, Chat } from '@prisma/client';

@Controller('admin')
export class AdminController {
  private readonly logger = Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  @Post('signup')
  async signup(@Body() dto: AdminAuthDTO): Promise<{ message: string }> {
    try {
      await this.adminService.signup(dto);

      this.logger.info(`Super Admin profile created by ${dto.email}.`);

      return { message: 'Super Admin created successfully' };
    } catch (error) {
      this.logger.error(
        `An error occurred during super admin signup. Error: ${error.message}.`,
      );

      throw error;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: AdminAuthDTO): Promise<{ admin: Admin }> {
    try {
      const admin = await this.adminService.login(dto);

      this.logger.info(`Admin profile login successful. Email: ${dto.email}.`);

      return { admin };
    } catch (error) {
      this.logger.error(
        `An error occurred during admin login. Error: ${error.message}.`,
      );

      throw error;
    }
  }

  @Get()
  @UseGuards(SuperAdminGuard)
  async getAllAdmins(): Promise<{ admins: Admin[] }> {
    try {
      return { admins: await this.adminService.getAllAdmins() };
    } catch (error) {
      this.logger.error(
        `An error occurred while retrieving profile details of sub admins. Error: ${error.message}.`,
      );

      throw error;
    }
  }

  @Post('add')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuperAdminGuard)
  async addAdmin(@Body() dto: CreateAdminDTO): Promise<{ message: string }> {
    try {
      await this.adminService.addAddmin(dto);

      this.logger.info(
        `${dto.email} has been added as a dispute resolution admin.`,
      );

      return { message: 'New admin added successfully' };
    } catch (error) {
      this.logger.error(
        `An error occurred while adding a new admin. Error: ${error.message}.`,
      );

      throw error;
    }
  }

  @Post('remove/:adminId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuperAdminGuard)
  async removeAdmin(
    @Param('adminId', ParseIntPipe) adminId: number,
  ): Promise<{ message: string }> {
    try {
      const email = await this.adminService.removeAddmin(adminId);

      this.logger.info(
        `${email} has been removed as a dispute resolution admin.`,
      );

      return { message: 'Admin profile deleted successfully' };
    } catch (error) {
      this.logger.error(
        `An error occurred while deleting admin profile. Error: ${error.message}.`,
      );

      throw error;
    }
  }

  @Get('disputes/:adminId')
  async getDisputeChats(
    @Param('adminId', ParseIntPipe) adminId: number,
  ): Promise<{ chats: Chat[] }> {
    try {
      return {
        chats: await this.adminService.getDisputeChats(adminId),
      };
    } catch (error) {
      this.logger.error(
        `An error occurred while retrieving admin's dispute chats. Error: ${error.message}.`,
      );

      throw error;
    }
  }
}
