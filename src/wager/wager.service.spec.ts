import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { getQueueToken } from '@nestjs/bull';
import { TestingModule, Test } from '@nestjs/testing';
import { Queue } from 'bull';
import { Message, User, Wager } from '@prisma/client';
import { DbService } from '@src/db/db.service';
import { CreateWagerDTO } from './dto';
import { WagerService } from './wager.service';
import { BadRequestException } from '@nestjs/common';

describe('Wager Service', () => {
  let wagerService: WagerService;
  let prisma: DeepMocked<DbService>;
  let wagerQueue: DeepMocked<Queue>;

  const playerOne: User = {
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
    balance: 25,
  };

  const playerTwo: User = {
    ...playerOne,
    id: 2,
    email: 'xerdin@example.com',
    firstName: 'Xerdin',
    lastName: 'Ludac',
    username: 'xerdin442',
  };

  const createWagerDto: CreateWagerDTO = {
    category: 'FOOTBALL',
    title: 'Madrid Treble',
    conditions: 'Real Madrid wins the treble next season',
    stake: 10,
  };

  const wager: Wager = {
    id: 1,
    amount: createWagerDto.stake * 2,
    inviteCode: '1234',
    ...createWagerDto,
    playerOne: playerOne.id,
    playerTwo: null,
    status: 'PENDING',
    winner: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WagerService,
        {
          provide: getQueueToken('wager-queue'),
          useValue: createMock<Queue>(),
        },
      ],
    })
      .useMocker(createMock)
      .compile();

    wagerService = module.get<WagerService>(WagerService);
    prisma = module.get(DbService);
    wagerQueue = module.get(getQueueToken('wager-queue'));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Create Wager', () => {
    beforeEach(() => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(playerOne);
    });

    it('should throw if stake is below allowed minimum', async () => {
      const response = wagerService.createWager(playerOne.id, {
        ...createWagerDto,
        stake: 0.5,
      });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow('Minimum stake is $1');
    });

    it('should throw if user has insufficient balance to fund wager', async () => {
      const response = wagerService.createWager(playerOne.id, {
        ...createWagerDto,
        stake: 100,
      });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow('Insufficient balance');
    });

    it('should create a new wager', async () => {
      (prisma.wager.create as jest.Mock).mockResolvedValue(wager);
      (prisma.user.update as jest.Mock).mockResolvedValue(playerOne);

      const response = wagerService.createWager(playerOne.id, createWagerDto);
      await expect(response).resolves.toEqual(wager);
    });
  });

  describe('Update Wager', () => {
    beforeEach(() => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(playerOne);
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue(wager);
    });

    it('should throw if the creator is not the one updating the wager', async () => {
      const response = wagerService.updateWager(23, wager.id, {});

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'Details of a wager can only be modified by its creator',
      );
    });

    it('should throw if the wager is already active', async () => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...wager,
        status: 'ACTIVE',
      });

      const response = wagerService.updateWager(playerOne.id, wager.id, {});

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'Details of an active wager cannot be modified',
      );
    });

    it('should throw if updated stake is less than the allowed minimum', async () => {
      const response = wagerService.updateWager(playerOne.id, wager.id, {
        stake: 0.9,
      });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow('Minimum stake is $1');
    });

    it('should throw if the user balance is less than the updated stake', async () => {
      const response = wagerService.updateWager(playerOne.id, wager.id, {
        stake: 100,
      });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow('Insufficient balance');
    });

    it('should update an existing wager', async () => {
      (prisma.wager.update as jest.Mock).mockResolvedValue(wager);

      const response = wagerService.updateWager(playerOne.id, wager.id, {
        title: 'New Title',
      });
      await expect(response).resolves.toBeUndefined();
    });
  });

  describe('Find Wager by Invite Code', () => {
    it('should throw if invite code is invalid', async () => {
      (prisma.wager.findUnique as jest.Mock).mockResolvedValue(null);

      const response = wagerService.findWagerByInviteCode({
        inviteCode: 'WrongCode',
      });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow('Invalid wager invite code');
    });

    it('should return wager details using valid invite code', async () => {
      (prisma.wager.findUnique as jest.Mock).mockResolvedValue(wager);

      const response = wagerService.findWagerByInviteCode({ ...wager });
      await expect(response).resolves.toEqual(wager);
    });
  });

  describe('Join Wager', () => {
    beforeEach(() => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue(wager);
    });

    it('should throw if creator attempts to join the wager', async () => {
      const response = wagerService.joinWager(playerOne.id, wager.id);

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'The creator of a wager cannot join the wager. Please invite another user',
      );
    });

    it('should throw if the wager already has two players', async () => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...wager,
        playerTwo: playerTwo.id,
      });

      const response = wagerService.joinWager(playerTwo.id, wager.id);

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'This wager cannot have more than two players',
      );
    });

    it('should throw if the user has insufficient balance to join the wager', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...playerTwo,
        balance: 3,
      });

      const response = wagerService.joinWager(playerTwo.id, wager.id);

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow('Insufficient balance');
    });

    it('should add a second player to the wager', async () => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(playerTwo);
      (prisma.user.update as jest.Mock).mockResolvedValue(playerTwo);
      (prisma.wager.update as jest.Mock).mockResolvedValue(wager);

      const response = wagerService.joinWager(playerTwo.id, wager.id);
      await expect(response).resolves.toEqual(wager.title);

      // Update wager details
      wager.playerTwo = playerTwo.id;
      wager.status = 'ACTIVE';
    });
  });

  describe('Wager Details', () => {
    it('should return wager details', async () => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue(wager);

      const response = wagerService.getWagerDetails(wager.id);
      await expect(response).resolves.toEqual(wager);
    });
  });

  describe('Claim Wager', () => {
    beforeEach(() => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue(wager);
    });

    it('should throw if the wager is already settled', async () => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...wager,
        status: 'SETTLED',
      });

      const response = wagerService.claimWager(playerOne.id, wager.id);

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'This wager has already been settled!',
      );
    });

    it('should throw if the wager is claimed by a non-player', async () => {
      const response = wagerService.claimWager(50, wager.id);

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'A prize can only be claimed by any of the two players in this wager',
      );
    });

    it('should claim wager', async () => {
      (prisma.wager.update as jest.Mock).mockResolvedValue(wager);
      (wagerQueue.add as jest.Mock).mockResolvedValue({ id: 1 });

      const response = wagerService.claimWager(playerOne.id, wager.id);
      await expect(response).resolves.toEqual(wager.title);

      // Update wager details
      wager.winner = playerOne.id;
    });
  });

  describe('Accept Wager Claim', () => {
    beforeEach(() => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue(wager);
    });

    it('should throw if the wager is already settled', async () => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...wager,
        status: 'SETTLED',
      });

      const response = wagerService.acceptWagerClaim(wager.id);

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'This wager has already been settled!',
      );
    });

    it('should accept wager claim', async () => {
      (prisma.wager.update as jest.Mock).mockResolvedValue(wager);
      (prisma.user.update as jest.Mock).mockResolvedValue(playerOne);
      (wagerQueue.removeJobs as jest.Mock).mockResolvedValue(undefined);

      const response = wagerService.acceptWagerClaim(wager.id);
      await expect(response).resolves.toBeUndefined();
    });
  });

  describe('Contest Wager Claim', () => {
    beforeEach(() => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue(wager);
    });

    it('should throw if the wager is already settled', async () => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...wager,
        status: 'SETTLED',
      });

      const response = wagerService.contestWagerClaim(wager.id);

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'This wager has already been settled!',
      );
    });

    it('should contest wager claim', async () => {
      (prisma.wager.update as jest.Mock).mockResolvedValue(wager);
      (wagerQueue.removeJobs as jest.Mock).mockResolvedValue(undefined);
      (wagerQueue.add as jest.Mock).mockResolvedValue({ id: 1 });

      const response = wagerService.acceptWagerClaim(wager.id);
      await expect(response).resolves.toBeUndefined();

      // Update wager details
      wager.winner = null;
      wager.status = 'DISPUTE';
    });
  });

  describe('Delete Wager', () => {
    it('should throw if the player deleting the wager is not the creator', async () => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue(wager);

      const response = wagerService.deleteWager(playerTwo.id, wager.id);

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'A wager can only be deleted by its creator',
      );
    });

    it('should throw if the wager is active', async () => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...wager,
        status: 'ACTIVE',
      });

      const response = wagerService.deleteWager(playerOne.id, wager.id);

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'An active wager cannot be deleted',
      );
    });

    it('should delete the wager', async () => {
      (prisma.wager.findUniqueOrThrow as jest.Mock).mockResolvedValue({
        ...wager,
        status: 'PENDING',
      });
      (prisma.wager.delete as jest.Mock).mockResolvedValue(wager);

      const response = wagerService.deleteWager(playerOne.id, wager.id);
      await expect(response).resolves.toBeUndefined();
    });
  });

  describe('Dispute Chat Messages', () => {
    const message: Message = {
      id: 1,
      createdAt: new Date(),
      author: 'Xerdin',
      content: 'This is a dispute chat message',
      chatId: 2,
    };

    it('should return all messages in a dispute chat', async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([message]);

      const response = await wagerService.getDisputeChatMessages(wager.id);
      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Assign Winner after Resolution', () => {
    it('should throw if username is invalid', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const response = wagerService.assignWinnerAfterResolution(wager.id, {
        username: 'invalidUsername',
      });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow('Invalid username');
    });

    it('should assign wager winner after resolution', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(playerOne);
      (prisma.user.update as jest.Mock).mockResolvedValue(playerOne);
      (prisma.wager.update as jest.Mock).mockResolvedValue(wager);
      (prisma.chat.update as jest.Mock).mockResolvedValue({
        id: 1,
        status: 'CLOSED',
        wagerId: wager.id,
      });

      const response = wagerService.assignWinnerAfterResolution(wager.id, {
        ...playerOne,
      });
      await expect(response).resolves.toBeUndefined();
    });
  });
});
