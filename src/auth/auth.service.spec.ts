import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { JwtService } from '@nestjs/jwt';
import { Queue } from 'bull';
import { TestingModule, Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { User } from '@prisma/client';
import * as argon from 'argon2';
import * as speakeasy from 'speakeasy';
import * as qrCode from 'qrcode';
import { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '@src/common/cache';
import { SocialAuthPayload, SessionData } from '@src/common/types';
import { DbService } from '@src/db/db.service';
import { MetricsService } from '@src/metrics/metrics.service';
import { AuthService } from './auth.service';
import { SignupDTO, NewPasswordDTO } from './dto';
import { BadRequestException } from '@nestjs/common';

// Mock randomUUID() for consistent string output
const mockUuid: string = 'part1-part2-part3-part4';
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => mockUuid),
}));

jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    getOrThrow: jest.fn((key: string) => {
      if (key === 'APP_NAME') return 'Wager Application';
      if (key === 'SOCIAL_AUTH_PASSWORD') return 'social-auth-password';

      return undefined;
    }),
  })),
}));

describe('Auth Service', () => {
  let authService: AuthService;
  let jwt: DeepMocked<JwtService>;
  let prisma: DeepMocked<DbService>;
  let metrics: DeepMocked<MetricsService>;
  let authQueue: DeepMocked<Queue>;

  const redis = {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  } as unknown as RedisClientType;

  const signupDto: SignupDTO = {
    email: 'user@example.com',
    firstName: 'Cristiano',
    lastName: 'Ronaldo',
    password: 'Password',
    confirmPassword: 'Password',
    username: 'goat_cr7',
  };

  const authPayload: SocialAuthPayload = {
    email: 'user@example.com',
    firstName: 'Xerdin',
    lastName: 'Ludac',
  };

  const user: User = {
    id: 1,
    ...signupDto,
    createdAt: new Date(),
    updatedAt: new Date(),
    profileImage: 'default-image-url',
    twoFASecret: null,
    twoFAEnabled: false,
    balance: 0,
    rewards: 0,
    appleAuthId: null,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getQueueToken('auth-queue'),
          useValue: createMock<Queue>(),
        },
        {
          provide: REDIS_CLIENT,
          useValue: redis,
        },
      ],
    })
      .useMocker(createMock)
      .compile();

    authService = module.get<AuthService>(AuthService);
    jwt = module.get(JwtService);
    prisma = module.get(DbService);
    metrics = module.get(MetricsService);
    authQueue = module.get(getQueueToken('auth-queue'));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Create New User', () => {
    it('should throw if password confirmation check fails in custom authentication', async () => {
      const response = authService.createNewUser({
        ...signupDto,
        confirmPassword: 'Wrong Password',
      });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'Passwords do not match. Try again!',
      );
    });

    it('should create new user through custom authentication', async () => {
      (prisma.user.create as jest.Mock).mockResolvedValue(user);

      const response = authService.createNewUser(signupDto);
      await expect(response).resolves.toEqual(user);
    });

    it('should create new user through social authentication', async () => {
      const socialAuthUser: User = {
        id: 1,
        ...authPayload,
        username:
          authPayload.firstName.toLowerCase() + `_${mockUuid.split('-')[3]}`,
        password: 'social-auth-password',
        createdAt: new Date(),
        updatedAt: new Date(),
        profileImage: 'default-image-url',
        twoFASecret: null,
        twoFAEnabled: false,
        balance: 0,
        rewards: 0,
        appleAuthId: null,
      };
      (prisma.user.create as jest.Mock).mockResolvedValue(socialAuthUser);

      const response = authService.createNewUser(authPayload);
      await expect(response).resolves.toEqual(socialAuthUser);
    });

    it('should throw if a user exists with given email', async () => {
      (prisma.user.create as jest.Mock).mockRejectedValue(
        new PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`email`)',
          {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['email'] },
          },
        ),
      );

      const response = authService.createNewUser(authPayload);
      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'This email already exists. Please try again!',
      );
    });
  });

  describe('Signup', () => {
    it('should sign up a user', async () => {
      (authQueue.add as jest.Mock).mockResolvedValue({ id: 1 });
      jwt.signAsync.mockResolvedValue('signed-jwt-string');

      const createNewUser = jest
        .spyOn(authService, 'createNewUser')
        .mockResolvedValue(user);

      const response = authService.signup(signupDto);

      expect(createNewUser).toHaveBeenCalledTimes(1);
      await expect(response).resolves.toEqual({
        user,
        token: 'signed-jwt-string',
      });
    });
  });

  describe('Login', () => {
    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
    });

    it('should throw if no user exists with email', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const response = authService.login({
        ...signupDto,
        email: 'invalidEmail@gmail.com',
      });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow(
        'No user found with that email address',
      );
    });

    it('should throw if password is invalid', async () => {
      jest.spyOn(argon, 'verify').mockResolvedValue(false);

      const response = authService.login({
        ...signupDto,
        password: 'invalidPassword',
      });

      await expect(response).rejects.toBeInstanceOf(BadRequestException);
      await expect(response).rejects.toThrow('Invalid password');
    });

    it('should login', async () => {
      jwt.signAsync.mockResolvedValue('signed-jwt-string');
      jest.spyOn(argon, 'verify').mockResolvedValue(true);

      const response = authService.login({ ...signupDto });
      await expect(response).resolves.toEqual({
        token: 'signed-jwt-string',
        twoFactorAuth: user.twoFAEnabled,
      });
    });
  });

  describe('Logout', () => {
    it('should log out a user', async () => {
      (redis.del as jest.Mock).mockResolvedValue(1);

      const response = await authService.logout(user.email);
      expect(response).toBeFalsy();
      expect(redis.del).toHaveBeenCalledWith(user.email);
    });
  });

  describe('2FA', () => {
    beforeEach(() => {
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user);
      metrics.updateGauge.mockReturnValue(undefined);
    });

    it('should enable two factor auth', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...user,
        twoFASecret: 'base32_secret',
        twoFAEnabled: true,
      });

      jest.spyOn(speakeasy, 'generateSecret').mockReturnValue({
        ascii: 'ascii',
        base32: 'base32_secret',
        hex: 'hex',
        otpauth_url: 'otpauth_url',
        google_auth_qr: 'google_auth_qr',
      });

      const toDataURLSpy = jest.spyOn(qrCode, 'toDataURL') as jest.Mock;
      toDataURLSpy.mockResolvedValue('qrcode-image-url');

      const response = authService.enable2fa(user.id);
      await expect(response).resolves.toEqual('qrcode-image-url');
    });

    it('should disable two factor auth', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...user,
        twoFASecret: null,
        twoFAEnabled: false,
      });

      const response = authService.disable2fa(user.id);
      await expect(response).resolves.toBeUndefined();
    });

    it('should return false if 2fa token is invalid', async () => {
      jest.spyOn(speakeasy.totp, 'verify').mockReturnValue(false);

      const response = authService.verify2fa(user.id, { token: 'wrongToken' });
      await expect(response).resolves.toBe(false);
    });

    it('should successfully verify a valid 2fa token', async () => {
      jest.spyOn(speakeasy.totp, 'verify').mockReturnValue(true);

      const response = authService.verify2fa(user.id, { token: '123456' });
      await expect(response).resolves.toBe(true);
    });
  });

  describe('Password Reset', () => {
    const currentTime = Date.now();
    const randomNumber = Math.random();
    const otp = `${randomNumber * 10 ** 16}`.slice(3, 7);

    // Represents the session payload AuthService would have written to
    // Redis after a successful requestPasswordReset call.
    const session: SessionData = {
      email: user.email,
      otp,
      otpExpiration: currentTime + 60 * 60 * 1000,
    };

    beforeEach(() => {
      jest.spyOn(Math, 'random').mockReturnValue(randomNumber);
      jest.spyOn(Date, 'now').mockReturnValue(currentTime);

      (authQueue.add as jest.Mock).mockResolvedValue({ id: 1 });
      (redis.set as jest.Mock).mockResolvedValue('OK');
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(session));
    });

    describe('Request Reset', () => {
      it('should throw if no user is found with email in reset request', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

        const response = authService.requestPasswordReset({
          email: 'wrongemail@example.com',
        });

        await expect(response).rejects.toBeInstanceOf(BadRequestException);
        await expect(response).rejects.toThrow(
          'No user found with that email address',
        );
      });

      it('should request password reset and send otp', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);

        const response = authService.requestPasswordReset({
          email: user.email,
        });

        await expect(response).resolves.toBeUndefined();
        expect(redis.set).toHaveBeenCalledWith(
          user.email,
          JSON.stringify(session),
        );
      });
    });

    describe('Resend OTP', () => {
      it('should throw if no user is found in session', async () => {
        (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({}));

        const response = authService.resendOtp(user.email);
        await expect(response).rejects.toBeInstanceOf(BadRequestException);
        await expect(response).rejects.toThrow('Email not found in session');
      });

      it('should resend password reset otp', async () => {
        const response = authService.resendOtp(user.email);
        await expect(response).resolves.toBeUndefined();
      });
    });

    describe('Verify OTP', () => {
      it('should throw if reset otp is invalid', async () => {
        const response = authService.verifyOtp({
          email: user.email,
          otp: 'WrongOTP',
        });

        await expect(response).rejects.toBeInstanceOf(BadRequestException);
        await expect(response).rejects.toThrow('Invalid OTP');
      });

      it('should throw if reset otp has expired', async () => {
        (redis.get as jest.Mock).mockResolvedValue(
          JSON.stringify({ ...session, otpExpiration: currentTime - 1000 }),
        );

        const response = authService.verifyOtp({
          email: user.email,
          otp: session.otp as string,
        });

        await expect(response).rejects.toBeInstanceOf(BadRequestException);
        await expect(response).rejects.toThrow('This OTP has expired');
      });

      it('should successfully verify a vaild and unexpired reset otp', async () => {
        const response = authService.verifyOtp({
          email: user.email,
          otp: session.otp as string,
        });
        await expect(response).resolves.toBeUndefined();
      });
    });

    describe('Change Password', () => {
      it('should throw if old password is same as new password during password change', async () => {
        (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user);
        jest.spyOn(argon, 'verify').mockResolvedValue(true);

        const dto: NewPasswordDTO = {
          email: user.email,
          newPassword: user.password,
        };
        const response = authService.changePassword(dto);

        await expect(response).rejects.toBeInstanceOf(BadRequestException);
        await expect(response).rejects.toThrow(
          'New password cannot be the same value as previous password',
        );
      });

      it('should change password and complete reset', async () => {
        (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user);
        (prisma.user.update as jest.Mock).mockResolvedValue(user);
        jest.spyOn(argon, 'verify').mockResolvedValue(false);

        const dto: NewPasswordDTO = {
          email: user.email,
          newPassword: 'newSecurePassword',
        };
        const response = authService.changePassword(dto);

        await expect(response).resolves.toBeUndefined();
        expect(redis.del).toHaveBeenCalledWith(user.email);
      });
    });
  });
});
