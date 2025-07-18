import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon from 'argon2';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { Admin } from '@prisma/client';
import * as MailService from '@src/common/config/mail';
import { AdminService } from '@src/admin/admin.service';
import { AdminAuthDTO, CreateAdminDTO } from '@src/admin/dto';
import { DbService } from '@src/db/db.service';
import { BadRequestException } from '@nestjs/common';

// Mock randomUUID() for consistent string output
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'part1-part2-part3-part4'),
}));

jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    getOrThrow: jest.fn((key: string) => {
      if (key === 'APP_NAME') return 'Wager Application';

      return undefined;
    }),
  })),
}));

describe('Admin Service', () => {
  let adminService: AdminService;
  let prisma: DeepMocked<DbService>;

  const authDto: AdminAuthDTO = {
    email: 'super-admin@example.com',
    passcode: 'Passcode',
  };

  const createAdminDto: CreateAdminDTO = {
    category: 'FOOTBALL',
    email: 'admin2@example.com',
    name: 'Admin Two',
  };

  const admin: Admin = {
    id: 2,
    ...createAdminDto,
    passcode: 'Passcode',
    disputes: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService],
    })
      .useMocker(createMock)
      .compile();

    adminService = module.get<AdminService>(AdminService);
    prisma = module.get(DbService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Signup', () => {
    const superAdmin: Admin = {
      ...admin,
      id: 1,
      email: authDto.email,
    };

    it('should signup and create Super Admin profile', async () => {
      (prisma.admin.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.admin.create as jest.Mock).mockResolvedValue(superAdmin);

      const response = adminService.signup(authDto);
      await expect(response).resolves.toBeUndefined();
    });

    it('should throw if Super Admin profile already exists', async () => {
      (prisma.admin.findMany as jest.Mock).mockResolvedValue([superAdmin]);

      const response = adminService.signup(authDto);
      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'Only one Super Admin profile can be created',
      );
    });
  });

  describe('Add Admin', () => {
    it('should add new admin', async () => {
      (prisma.admin.create as jest.Mock).mockResolvedValue(admin);

      jest.spyOn(MailService, 'sendEmail').mockResolvedValue(undefined);

      const response = adminService.addAddmin(createAdminDto);
      await expect(response).resolves.toBeUndefined();
    });

    it('should throw if an admin exists with email', async () => {
      (prisma.admin.create as jest.Mock).mockRejectedValue(
        new PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`email`)',
          {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['email'] },
          },
        ),
      );

      const response = adminService.addAddmin(createAdminDto);
      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'This email already exists. Please try again!',
      );
    });
  });

  describe('Login', () => {
    beforeEach(() => {
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue(admin);
    });

    it('should throw if no admin exists with email', async () => {
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue(null);

      const response = adminService.login({
        ...authDto,
        email: 'invalidEmail@gmail.com',
      });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'No admin found with that email address',
      );
    });

    it('should throw if passcode is invalid', async () => {
      jest.spyOn(argon, 'verify').mockResolvedValue(false);

      const response = adminService.login({
        ...authDto,
        passcode: 'invalidPasscode',
      });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow('Access denied. Invalid passcode');
    });

    it('should login', async () => {
      jest.spyOn(argon, 'verify').mockResolvedValue(true);

      const response = adminService.login(authDto);
      await expect(response).resolves.toEqual(admin);
    });
  });

  describe('Get All Admins', () => {
    it('should return all admins', async () => {
      (prisma.admin.findMany as jest.Mock).mockResolvedValue([admin]);

      const response = await adminService.getAllAdmins();
      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Get Dispute Chats', () => {
    it('should return all dispute chats', async () => {
      (prisma.chat.findMany as jest.Mock).mockResolvedValue([
        {
          id: 1,
          adminId: admin.id,
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const response = await adminService.getDisputeChats(admin.id);
      expect(Array.isArray(response)).toBe(true);
    });
  });

  describe('Remove Admin', () => {
    it('should remove existing admin', async () => {
      (prisma.admin.delete as jest.Mock).mockResolvedValue(admin);

      const response = adminService.removeAddmin(admin.id);
      await expect(response).resolves.toEqual(admin.email);
    });
  });
});
