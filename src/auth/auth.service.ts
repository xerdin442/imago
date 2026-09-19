import { InjectQueue } from '@nestjs/bull';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Queue } from 'bull';
import * as argon from 'argon2';
import * as speakeasy from 'speakeasy';
import * as qrCode from 'qrcode';
import { User } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import {
  LoginDTO,
  NewPasswordDTO,
  PasswordResetDTO,
  SignupDTO,
  Verify2faDTO,
  VerifyOtpDTO,
} from './dto';
import { randomUUID } from 'crypto';
import { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '@src/common/cache';
import { SessionData, SocialAuthPayload } from '@src/common/types';
import { DbService } from '@src/db/db.service';
import { MetricsService } from '@src/metrics/metrics.service';
import { Secrets } from '@src/common/secrets';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: DbService,
    private readonly jwt: JwtService,
    private readonly metrics: MetricsService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
    @InjectQueue('auth-queue') private readonly authQueue: Queue,
  ) {}

  private async getSession(key: string): Promise<SessionData> {
    const data = await this.redis.get(key);
    return JSON.parse(data as string) as SessionData;
  }

  private async setSession(key: string, data: SessionData): Promise<void> {
    await this.redis.set(key, JSON.stringify(data));
  }

  async createNewUser(
    details: SignupDTO | SocialAuthPayload,
    filePath?: string,
  ): Promise<User> {
    try {
      const defaultImage = Secrets.DEFAULT_IMAGE;
      const { email, firstName, lastName } = details;

      // Create new user through custom authentication
      if ('password' in details) {
        // Check if password and confirmation string match
        if (details.password !== details.confirmPassword) {
          throw new BadRequestException('Passwords do not match. Try again!');
        }

        const user = await this.prisma.user.create({
          data: {
            email,
            firstName,
            lastName,
            username: details.username,
            password: await argon.hash(details.password),
            profileImage: filePath || defaultImage,
          },
        });

        return user;
      }

      // Create new user through social authentication
      const username =
        details.firstName.toLowerCase() + `_${randomUUID().split('-')[3]}`;
      const password = await argon.hash(Secrets.SOCIAL_AUTH_PASSWORD);

      const user = await this.prisma.user.create({
        data: {
          email,
          firstName,
          lastName,
          password,
          username,
          balance: 0,
          profileImage: details.profileImage || defaultImage,
          appleAuthId: details.authId,
        },
      });

      return user;
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

  async signup(
    details: SignupDTO | SocialAuthPayload,
    filePath?: string,
  ): Promise<{ user: User; token: string }> {
    try {
      const user = await this.createNewUser(details, filePath);

      // Send an onboarding email to the new user
      await this.authQueue.add('signup', { email: user.email });

      user.password = 'X-X-X'; // Sanitize user output

      const payload = { sub: user.id, email: user.email }; // Create JWT payload

      return { user, token: await this.jwt.signAsync(payload) };
    } catch (error) {
      throw error;
    }
  }

  async login(
    dto: LoginDTO,
  ): Promise<{ token: string; twoFactorAuth: boolean }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      // Check if user is found with given email address
      if (!user) {
        throw new BadRequestException('No user found with that email address');
      }

      // Check if password is valid
      const checkPassword = await argon.verify(user.password, dto.password);
      if (!checkPassword) throw new BadRequestException('Invalid password');

      // Create JWT payload
      const payload = { sub: user.id, email: user.email };

      return {
        token: await this.jwt.signAsync(payload),
        twoFactorAuth: user.twoFAEnabled,
      };
    } catch (error) {
      throw error;
    }
  }

  async logout(email: string): Promise<void> {
    try {
      await this.redis.del(email);
    } catch (error) {
      throw error;
    }
  }

  async enable2fa(userId: number): Promise<string> {
    try {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      const secret = speakeasy.generateSecret({
        name: `${Secrets.APP_NAME}:${user.email}`,
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFAEnabled: true,
          twoFASecret: secret.base32,
        },
      });

      // Update metrics value
      this.metrics.updateGauge('two_fa_enabled_users', 'inc');

      // Create a QRcode image with the generated secret
      return qrCode.toDataURL(secret.otpauth_url as string, {
        errorCorrectionLevel: 'high',
      });
    } catch (error) {
      throw error;
    }
  }

  async disable2fa(userId: number): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFAEnabled: false,
          twoFASecret: null,
        },
      });

      this.metrics.updateGauge('two_fa_enabled_users', 'dec'); // Update metrics value
      return;
    } catch (error) {
      throw error;
    }
  }

  async verify2fa(userId: number, dto: Verify2faDTO): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });

      return speakeasy.totp.verify({
        secret: user.twoFASecret as string,
        token: dto.token,
        encoding: 'base32',
      });
    } catch (error) {
      throw error;
    }
  }

  async requestPasswordReset(dto: PasswordResetDTO): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (user) {
        const session: SessionData = {
          email: dto.email,
          otp: `${Math.random() * 10 ** 16}`.slice(3, 7),
          otpExpiration: Date.now() + 60 * 60 * 1000,
        };

        await this.setSession(dto.email, session);

        // Send the OTP via email
        await this.authQueue.add('otp', {
          email: user.email,
          otp: session.otp,
        });

        return;
      } else {
        throw new BadRequestException('No user found with that email address');
      }
    } catch (error) {
      throw error;
    }
  }

  async resendOtp(email: string): Promise<void> {
    try {
      // Retrieve existing session data
      const session = await this.getSession(email);
      if (session.email) {
        // Reset the OTP value and expiration time
        session.otp = `${Math.random() * 10 ** 16}`.slice(3, 7);
        session.otpExpiration = Date.now() + 60 * 60 * 1000;
        await this.setSession(email, session);

        // Send another email with the new OTP
        await this.authQueue.add('otp', { email, otp: session.otp });

        return;
      } else {
        throw new BadRequestException('Email not found in session');
      }
    } catch (error) {
      throw error;
    }
  }

  async verifyOtp(dto: VerifyOtpDTO): Promise<void> {
    try {
      // Retrieve existing session data
      const session = await this.getSession(dto.email);

      // Check if OTP is invalid or expired
      if (session.email) {
        if (session.otp !== dto.otp) {
          throw new BadRequestException('Invalid OTP');
        }

        if ((session.otpExpiration as number) < Date.now()) {
          throw new BadRequestException('This OTP has expired');
        }
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  async changePassword(dto: NewPasswordDTO): Promise<void> {
    try {
      // Retrieve existing session data
      const session = await this.getSession(dto.email);
      // Find user with email stored in session
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { email: session.email },
      });

      // Check if the previous password is same as the new password
      const samePassword = await argon.verify(user.password, dto.newPassword);
      if (samePassword) {
        throw new BadRequestException(
          'New password cannot be the same value as previous password',
        );
      }

      // Hash new password and update the user's password
      const hash = await argon.hash(dto.newPassword);
      await this.prisma.user.update({
        where: { email: session.email },
        data: { password: hash },
      });

      // Clear session data now that password reset is complete
      await this.redis.del(user.email);

      return;
    } catch (error) {
      throw error;
    }
  }
}
