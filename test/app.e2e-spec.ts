import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TestingModule, Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import * as request from 'supertest';
import * as path from 'path';
import {
  LoginDTO,
  NewPasswordDTO,
  PasswordResetDTO,
  SignupDTO,
  Verify2faDTO,
  VerifyOtpDTO,
} from '../src/auth/dto';
import { AdminAuthDTO, CreateAdminDTO } from '../src/admin/dto';
import { FundsTransferDTO, UpdateProfileDTO } from '../src/user/dto';
import { DepositDTO, WithdrawalDTO } from '../src/wallet/dto';
import {
  CreateWagerDTO,
  UpdateWagerDTO,
  WagerInviteDTO,
} from '../src/wager/dto';
import * as argon from 'argon2';
import { randomUUID } from 'crypto';
import { DbService } from '@src/db/db.service';
import { SessionService } from '@src/common/session';

describe('E2E Tests', () => {
  const requestTimeout: number = 100000;

  const userOne: SignupDTO = {
    email: 'xerdinludac@gmail.com',
    password: 'Xerdin442!',
    firstName: 'Xerdin',
    lastName: 'Ludac',
    username: 'xerdin442',
  };
  const userTwo: SignupDTO = {
    email: 'jadawills3690@gmail.com',
    firstName: 'Jada',
    lastName: 'Williams',
    password: 'Jada987@',
    username: 'jada_wills',
  };

  const admin: CreateAdminDTO = {
    email: 'ozunabiraz3@hotmail.com',
    category: 'FOOTBALL',
    name: 'Ozuna Biraz',
  };
  const superAdmin: AdminAuthDTO = {
    email: 'mudianthonio27@gmail.com',
    passcode: 'SuperAdminPasscode',
  };

  let app: INestApplication<App>;
  let prisma: DbService;
  let session: SessionService;
  let userOneToken: string;
  let userTwoToken: string;
  let wagerId: number;
  let wagerInviteCode: string;
  let adminId: number;

  beforeAll(async () => {
    jest.useRealTimers();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
      }),
    );

    // Clean database and session store before running tests
    prisma = app.get(DbService);
    await prisma.cleanDb();

    session = app.get(SessionService);
    await session.onModuleInit();
    await session.clear();

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Signup', () => {
    it('should throw if email format is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          ...userOne,
          email: 'Invalid email',
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message[0]).toEqual(
        'Please enter a valid email address',
      );
    });

    it('should throw if password is not strong enough', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          ...userOne,
          password: 'Weak password',
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message[0]).toEqual(
        'Password must contain at least one uppercase and lowercase letter, one digit and one symbol',
      );
    });

    it('should throw if request body is empty', async () => {
      const response = await request(app.getHttpServer()).post('/auth/signup');

      expect(response.status).toEqual(400);
      expect(Array.isArray(response.body.message)).toBe(true);
      expect(response.body.message.length).toBeGreaterThan(1);
    });

    it(
      'should signup without file upload',
      async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/signup')
          .send(userOne);

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('token');
      },
      requestTimeout,
    );

    it(
      'should signup with file upload',
      async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/signup')
          .field({ ...userTwo })
          .attach('profileImage', path.resolve(__dirname, 'test-image.jpg'));

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('token');

        // Store JWT to access authorized endpoints
        userTwoToken = response.body.token as string;
      },
      requestTimeout,
    );
  });

  describe('Login', () => {
    const loginDto: LoginDTO = { ...userOne };

    it('should throw if email format is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          ...loginDto,
          email: 'Invalid email',
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message[0]).toEqual(
        'Please enter a valid email address',
      );
    });

    it('should login user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('twoFactorAuth');

      // Store JWT to access authorized endpoints
      userOneToken = response.body.token as string;
    });
  });

  describe('Google Auth', () => {
    it('should redirect to Google login page', async () => {
      return request(app.getHttpServer())
        .get('/auth/google?redirectUrl=/dashboard')
        .expect(302);
    });
  });

  describe('2FA', () => {
    it('should enable 2FA and return QRcode image', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/2fa/enable')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('qrcode');
    });

    it('should verify 2FA token', async () => {
      const dto: Verify2faDTO = {
        token: '123456',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Invalid token');
    });

    it('should disable 2FA', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/2fa/disable')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('2FA disabled successfully');
    });
  });

  describe('Password Reset', () => {
    it('should send password reset OTP to user email', async () => {
      const dto: PasswordResetDTO = { ...userOne };

      const response = await request(app.getHttpServer())
        .post('/auth/password/reset')
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Password reset OTP has been sent to your email',
      );
    });

    it('should re-send password reset OTP to user email', async () => {
      const response = await request(app.getHttpServer()).post(
        '/auth/password/resend-otp',
      );

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Another OTP has been sent to your email',
      );
    });

    it('should verify password reset OTP', async () => {
      const dto: VerifyOtpDTO = {
        otp: '1234',
      };
      const response = await request(app.getHttpServer())
        .post('/auth/password/verify-otp')
        .send(dto);

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Invalid OTP');
    });

    it('should change password and complete reset', async () => {
      const dto: NewPasswordDTO = {
        newPassword: 'PassWord12!',
      };
      const response = await request(app.getHttpServer())
        .post('/auth/password/new')
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Password reset complete!');
    });
  });

  describe('Profile', () => {
    it('should throw if access token is missing', async () => {
      const response = await request(app.getHttpServer()).get('/user/profile');

      expect(response.status).toEqual(401);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Unauthorized');
    });

    it('should retrieve user profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/profile')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('user');
    });

    it(
      'should update user profile',
      async () => {
        const dto: UpdateProfileDTO = { firstName: 'Cristiano' };

        const response = await request(app.getHttpServer())
          .patch('/user/profile')
          .set('Authorization', `Bearer ${userOneToken}`)
          .field({ ...dto })
          .attach('profileImage', path.resolve(__dirname, 'test-image.jpg'));

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toEqual('Profile updated successfully');
      },
      requestTimeout,
    );

    it('should return all wagers for a user', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/wagers')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('wagers');
      expect(Array.isArray(response.body.wagers)).toBe(true);
    });

    it('should return all transactions for a user', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/transactions')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('transactions');
      expect(Array.isArray(response.body.transactions)).toBe(true);
    });
  });

  describe('Admins', () => {
    it('should create super admin profile', async () => {
      const response = await request(app.getHttpServer())
        .post('/admin/signup')
        .send(superAdmin);

      expect(response.status).toEqual(201);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Super Admin created successfully');
    });

    it('should login admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/admin/login')
        .send(superAdmin);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('admin');
    });

    it('should add new admin', async () => {
      const response = await request(app.getHttpServer())
        .post(`/admin/add?email=${superAdmin.email}`)
        .send(admin);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('New admin added successfully');
    });

    it('should remove existing admin', async () => {
      const deletedAdmin = await prisma.admin.create({
        data: {
          ...admin,
          email: 'admin2@example.com',
          disputes: 0,
          passcode: await argon.hash('AdminPasscode'),
        },
      });

      const response = await request(app.getHttpServer()).post(
        `/admin/remove/${deletedAdmin.id}?email=${superAdmin.email}`,
      );

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Admin profile deleted successfully',
      );
    });

    it('should retrieve all admins', async () => {
      const response = await request(app.getHttpServer()).get(
        `/admin?email=${superAdmin.email}`,
      );

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('admins');
      expect(Array.isArray(response.body.admins)).toBe(true);
    });

    it('should retrieve all dispute resolution chats for an admin', async () => {
      const newAdmin = await prisma.admin.create({
        data: {
          ...admin,
          email: 'admin@example.com',
          disputes: 0,
          passcode: await argon.hash('AdminPasscode'),
        },
      });
      adminId = newAdmin.id;

      const response = await request(app.getHttpServer()).get(
        `/admin/disputes/${adminId}`,
      );

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('chats');
      expect(Array.isArray(response.body.chats)).toBe(true);
    });

    it('should throw if a protected endpoint is not accessed by the super admin', async () => {
      const response = await request(app.getHttpServer())
        .post(`/admin/add?email=${admin.email}`)
        .send(admin);

      expect(response.status).toEqual(401);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Only the Super Admin is authorized to perform this operation',
      );
    });
  });

  describe('Deposit', () => {
    const dto: DepositDTO = {
      amount: 10,
      chain: 'BASE',
      depositor: '0x6c6fD71806E6E5B16afB119628966E0AF24a3E6F',
      txIdentifier:
        '0x39046319e2d4b467539475f04b50ec50437601529aef98dd3270ce16e942aca2',
    };

    it('should throw if chain is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/deposit')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send({ ...dto, chain: 'INVALID' });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message[0]).toEqual(
        'Invalid chain parameter. Expected "BASE" or "SOLANA"',
      );
    });

    describe('BASE', () => {
      it('should throw if transaction identifier is invalid', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/deposit')
          .set('Authorization', `Bearer ${userOneToken}`)
          .send({ ...dto, txIdentifier: 'invalid-tx-identifier' });

        expect(response.status).toEqual(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toEqual('Invalid transaction identifier');
      });

      it('should throw if depositor address is invalid', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/deposit')
          .set('Authorization', `Bearer ${userOneToken}`)
          .send({ ...dto, depositor: 'invalid-depositor-address' });

        expect(response.status).toEqual(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toEqual('Invalid depositor address');
      });

      it('should return pending transaction and inititate processing of deposit', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/deposit')
          .set('Authorization', `Bearer ${userOneToken}`)
          .send(dto);

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('transaction');
        expect(response.body.transaction.amount).toEqual(dto.amount);
        expect(response.body.transaction.chain).toEqual(dto.chain);
        expect(response.body.transaction.status).toEqual('PENDING');
        expect(response.body.transaction.type).toEqual('DEPOSIT');
      });
    });

    describe('SOLANA', () => {
      const solanaDto: DepositDTO = {
        amount: 10,
        chain: 'SOLANA',
        depositor: 'FNHYDHQubHyq9Y5qt9jKWFx9qvnQgUzDxzRnJoRRzwnL',
        txIdentifier:
          'TZEfx8RRXmTve21DM68EWzDGQdPU3zXdLJLmXwwwCsH5LGaVDSAfB9ixpLRAtjY4d4t6diigQ53NXoapwkmo4kE',
      };

      it('should throw if transaction identifier is invalid', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/deposit')
          .set('Authorization', `Bearer ${userTwoToken}`)
          .send({ ...solanaDto, txIdentifier: 'TZEfx8RRXmTv1DM68EWzDGQd4kE' });

        expect(response.status).toEqual(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toEqual('Invalid transaction identifier');
      });

      it('should throw if depositor address is invalid', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/deposit')
          .set('Authorization', `Bearer ${userTwoToken}`)
          .send({ ...solanaDto, depositor: 'invalid-depositor-address' });

        expect(response.status).toEqual(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toEqual('Invalid depositor address');
      });

      it('should return pending transaction and inititate processing of deposit', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/deposit')
          .set('Authorization', `Bearer ${userTwoToken}`)
          .send(solanaDto);

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('transaction');
        expect(response.body.transaction.amount).toEqual(solanaDto.amount);
        expect(response.body.transaction.chain).toEqual(solanaDto.chain);
        expect(response.body.transaction.status).toEqual('PENDING');
        expect(response.body.transaction.type).toEqual('DEPOSIT');
      });
    });
  });

  describe('Create Wager', () => {
    const dto: CreateWagerDTO = {
      category: 'FOOTBALL',
      conditions: 'Real Madrid wins the Champions League',
      stake: 20,
      title: 'UCL Winner',
    };

    it('should throw if wager category is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/wagers/create')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send({
          ...dto,
          category: 'INVALID CATEGORY',
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message[0]).toEqual('Invalid wager category value');
    });

    it('should create a new wager', async () => {
      // Update user balances
      await prisma.$transaction([
        prisma.user.update({
          where: { email: userOne.email },
          data: { balance: { increment: 100 } },
        }),
        prisma.user.update({
          where: { email: userTwo.email },
          data: { balance: { increment: 100 } },
        }),
      ]);

      const response = await request(app.getHttpServer())
        .post('/wagers/create')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(201);
      expect(response.body).toHaveProperty('wager');

      wagerId = response.body.wager.id as number;
      wagerInviteCode = response.body.wager.inviteCode as string;
    });

    it('should return wager details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/wagers/${wagerId}`)
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('wager');
      expect(response.body.wager.id).toEqual(wagerId);
    });
  });

  describe('Update Wager', () => {
    const dto: UpdateWagerDTO = {
      conditions: 'Real Madrid wins the UCL at the end of the season',
    };

    it('should update wager details', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/wagers/${wagerId}`)
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Wager updated successfully');
    });
  });

  describe('Wager Invite', () => {
    it('should return wager details from invite code', async () => {
      const dto: WagerInviteDTO = { inviteCode: wagerInviteCode };
      const response = await request(app.getHttpServer())
        .post(`/wagers/invite`)
        .set('Authorization', `Bearer ${userTwoToken}`)
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('wager');
      expect(response.body.wager.inviteCode).toEqual(wagerInviteCode);
    });
  });

  describe('Join Wager', () => {
    it('should join wager', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/join`)
        .set('Authorization', `Bearer ${userTwoToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Successfully joined wager');
    });
  });

  describe('Wager Claim', () => {
    it('should claim wager prize', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/claim`)
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Prize claimed successfully, awaiting response from opponent',
      );
    });

    it('should accept wager prize claim', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/claim/accept`)
        .set('Authorization', `Bearer ${userTwoToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Wager claim accepted, better luck next time!',
      );
    });

    it('should contest wager prize claim', async () => {
      await prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'ACTIVE' },
      });

      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/claim/contest`)
        .set('Authorization', `Bearer ${userTwoToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Wager claim contested, dispute resolution has been initiated.',
      );
    });
  });

  describe('Dispute Resolution', () => {
    it('should retrieve all dispute chat messages as a player', async () => {
      const response = await request(app.getHttpServer())
        .get(`/wagers/${wagerId}/dispute/chat`)
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('messages');
      expect(Array.isArray(response.body.messages)).toBe(true);
    });

    it('should assign winner after dispute resolution', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/dispute/resolve?admin=${admin.email}`)
        .send({ username: userOne.username });

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Dispute resolution successful');
    });

    it('should throw if a non-admin attempts to assign winner after dispute resolution', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/dispute/resolve?admin=${userTwo.email}`)
        .send({ username: userOne.username });

      expect(response.status).toEqual(401);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Only an Admin can perform this operation',
      );
    });
  });

  describe('Funds Transfer', () => {
    it('should transfer funds from user wallet to another user', async () => {
      const dto: FundsTransferDTO = {
        amount: 20,
        username: userTwo.username,
      };

      const response = await request(app.getHttpServer())
        .post('/user/wallet/transfer')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        `$${dto.amount} transfer to @${dto.username} was successful!`,
      );

      // Confirm funds transfer
      const playerTwo = await prisma.user.findUniqueOrThrow({
        where: { email: userTwo.email },
      });
      expect(playerTwo.balance).toEqual(100);
    });
  });

  describe('Withdrawal', () => {
    const dto: WithdrawalDTO = {
      address: '0xb781Dd91EbdD6a63680b1f9e255a2F0a11E82d1D',
      amount: 6,
      chain: 'BASE',
    };

    it('should throw if chain is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/withdraw')
        .set('Authorization', `Bearer ${userOneToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ ...dto, chain: 'INVALID' });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message[0]).toEqual(
        'Invalid chain parameter. Expected "BASE" or "SOLANA"',
      );
    });

    it('should throw if idempotency key is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/withdraw')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        '"Idempotency-Key" header is required',
      );
    });

    it('should throw if domain name is unsupported', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/withdraw')
        .set('Authorization', `Bearer ${userOneToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ ...dto, address: 'xerdin442.eth' });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Only Basenames and SNS domains are supported at this time',
      );
    });

    it('should throw if user has insufficient balance', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/withdraw')
        .set('Authorization', `Bearer ${userTwoToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ ...dto, amount: 1000 });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Insufficient funds. Your balance is $100',
      );
    });

    it('should throw if withdrawal amount is below allowed minimum', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/withdraw')
        .set('Authorization', `Bearer ${userOneToken}`)
        .set('Idempotency-Key', randomUUID())
        .send({ ...dto, amount: 4 });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Minimum withdrawal amount is $5');
    });

    describe('BASE', () => {
      it('should throw if Basename is invalid or unregistered', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/withdraw')
          .set('Authorization', `Bearer ${userOneToken}`)
          .set('Idempotency-Key', randomUUID())
          .send({ ...dto, address: 'xerdin442.base.eth' });

        expect(response.status).toEqual(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toEqual(
          'Invalid or unregistered Basename',
        );
      });

      it('should throw if withdrawal address is invalid', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/withdraw')
          .set('Authorization', `Bearer ${userOneToken}`)
          .set('Idempotency-Key', randomUUID())
          .send({ ...dto, address: 'invalid-recipient-address' });

        expect(response.status).toEqual(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toEqual('Invalid recipient address');
      });

      it('should return pending transaction and inititate processing of withdrawal', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/withdraw')
          .set('Authorization', `Bearer ${userOneToken}`)
          .set('Idempotency-Key', randomUUID())
          .send(dto);

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('transaction');
        expect(response.body.transaction.amount).toEqual(dto.amount);
        expect(response.body.transaction.chain).toEqual(dto.chain);
        expect(response.body.transaction.status).toEqual('PENDING');
        expect(response.body.transaction.type).toEqual('WITHDRAWAL');
      });
    });

    describe('SOLANA', () => {
      const solanaDto: WithdrawalDTO = {
        amount: 6,
        chain: 'SOLANA',
        address: '3BrAsMnKo7WVvFSVYRJF1JDKDuxZ2FaAorMzMM5t8VCt',
      };
      const idempotencyKey: string = randomUUID();

      it('should throw if SNS domain is invalid or unregistered', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/withdraw')
          .set('Authorization', `Bearer ${userOneToken}`)
          .set('Idempotency-Key', randomUUID())
          .send({ ...solanaDto, address: 'xerdin442.sol' });

        expect(response.status).toEqual(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toEqual(
          'Invalid or unregistered SNS domain',
        );
      });

      it('should throw if withdrawal address is invalid', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/withdraw')
          .set('Authorization', `Bearer ${userTwoToken}`)
          .set('Idempotency-Key', randomUUID())
          .send({ ...solanaDto, address: 'invalid-recipient-address' });

        expect(response.status).toEqual(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toEqual('Invalid recipient address');
      });

      it('should return pending transaction and inititate processing of withdrawal', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/withdraw')
          .set('Authorization', `Bearer ${userTwoToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send(solanaDto);

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('transaction');
        expect(response.body.transaction.amount).toEqual(solanaDto.amount);
        expect(response.body.transaction.chain).toEqual(solanaDto.chain);
        expect(response.body.transaction.status).toEqual('PENDING');
        expect(response.body.transaction.type).toEqual('WITHDRAWAL');
      });

      it('should return processing status if similar withdrawal was attempted within the last 15 mins', async () => {
        const response = await request(app.getHttpServer())
          .post('/wallet/withdraw')
          .set('Authorization', `Bearer ${userTwoToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send(solanaDto);

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toEqual(
          `Your withdrawal of ${solanaDto.amount} is being processed`,
        );
      });
    });
  });

  describe('End tests', () => {
    it('should delete wager', async () => {
      await prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'PENDING' },
      });

      const response = await request(app.getHttpServer())
        .delete(`/wagers/${wagerId}`)
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Wager deleted successfully');
    });

    it('should log out user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Logout successful!');
    });

    it('should delete user profile', async () => {
      await prisma.user.update({
        where: { email: userTwo.email },
        data: { balance: 0 },
      });

      const response = await request(app.getHttpServer())
        .delete('/user/profile')
        .set('Authorization', `Bearer ${userTwoToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Account deleted successfully');
    });
  });
});
