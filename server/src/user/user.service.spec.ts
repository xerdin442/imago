import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BadRequestException } from '@nestjs/common';
import { TestingModule, Test } from '@nestjs/testing';
import { Transaction, User, Wager } from '@prisma/client';
import { DbService } from '@src/db/db.service';
import { UpdateProfileDTO } from './dto';
import { UserService } from './user.service';

describe('User Service', () => {
  let userService: UserService;
  let prisma: DeepMocked<DbService>;

  const user: User = {
    id: 1,
    email: 'user@example.com',
    firstName: 'Cristiano',
    lastName: 'Ronaldo',
    password: 'Password',
    username: 'goat_cr7',
    createdAt: new Date(),
    updatedAt: new Date(),
    profileImage: 'default-image-url',
    twoFASecret: null,
    twoFAEnabled: false,
    balance: 0,
    rewards: 0,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserService],
    })
      .useMocker(createMock)
      .compile();

    userService = module.get<UserService>(UserService);
    prisma = module.get(DbService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Update profile', () => {
    it('should update user profile', async () => {
      const dto: UpdateProfileDTO = { username: 'the_goat_cr7' };
      const updatedUser = { ...user, ...dto };

      (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

      const response = userService.updateProfile(user.id, dto);
      await expect(response).resolves.toEqual(updatedUser);
    });
  });

  describe('Delete Account', () => {
    it('should throw if user balance is greater than $1 and less than $5', async () => {
      const response = userService.deleteAccount({ ...user, balance: 4 });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'Your wallet balance is $4. Create or join a wager to max out your balance before deleting your account',
      );
    });

    it('should throw if user balance is greater than $5', async () => {
      const response = userService.deleteAccount({ ...user, balance: 12 });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'Withdraw your wallet balance before deleting your account',
      );
    });

    it('should delete user account', async () => {
      (prisma.user.delete as jest.Mock).mockResolvedValue(user);

      const response = userService.deleteAccount(user);
      await expect(response).resolves.toBeUndefined();
    });
  });

  describe('Get Wagers', () => {
    it('should return all wagers where the user is a player', async () => {
      const wager: Wager = {
        id: 1,
        amount: 20,
        category: 'FOOTBALL',
        title: 'Madrid Treble',
        conditions: 'Real Madrid wins the treble next season',
        inviteCode: '1234',
        playerOne: user.id,
        playerTwo: 23,
        status: 'ACTIVE',
        winner: null,
        marketplace: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.wager.findMany as jest.Mock).mockResolvedValue([wager]);

      const response = await userService.getWagers(user.id);
      expect(Array.isArray(response)).toBe(true);
    });
  });

  describe('Transaction History', () => {
    it('should return user transaction history', async () => {
      const transaction: Transaction = {
        id: 1,
        amount: 100,
        chain: 'BASE',
        retries: 0,
        status: 'SUCCESS',
        txIdentifier: null,
        type: 'WITHDRAWAL',
        userId: user.id,
        createdAt: new Date(),
      };

      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([
        transaction,
      ]);

      const response = await userService.getTransactionHistory(user.id, {
        chain: 'BASE',
      });
      expect(Array.isArray(response)).toBe(true);
    });
  });

  describe('Funds Transfer', () => {
    it('should transfer funds from one user to another', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue(user);

      const response = userService.transferFunds(user.id, {
        amount: 20,
        username: 'xerdin442',
      });
      await expect(response).resolves.toEqual(user.email);
    });
  });
});
