import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  LoginDTO,
  NewPasswordDTO,
  PasswordResetDTO,
  SignupDTO,
  Verify2faDTO,
  VerifyOtpDTO,
} from './dto';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import { GetUser } from '../custom/decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { GoogleAuthGuard } from '../custom/guards/google.guard.';
import { Request, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { AuthService } from './auth.service';
import {
  SocialAuthPayload,
  SocialAuthUser,
  SessionData,
  AppleAuthDTO,
} from '@src/common/types';
import { generateCallbackHtml } from './helpers';
import logger from '@src/common/logger';
import { RedisClientType } from 'redis';
import { connectToRedis } from '@src/common/config/redis';
import { Secrets } from '@src/common/secrets';
import { AppleAuthHandler } from '@src/common/apple';

@Controller('auth')
export class AuthController {
  private readonly context: string = AuthController.name;

  private sessionData: SessionData = {};
  private readonly GOOGLE_REDIRECT_COOKIE_KEY: string =
    'google_auth_redirect_url';

  constructor(
    private readonly authService: AuthService,
    private readonly appleAuthHandler: AppleAuthHandler,
  ) {}

  @Post('signup')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      storage: multer.memoryStorage(),
      limits: { fieldSize: 8 * 1024 * 1024 },
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: multer.FileFilterCallback,
      ): void => {
        const allowedMimetypes: string[] = [
          'image/png',
          'image/heic',
          'image/jpeg',
          'image/webp',
          'image/heif',
        ];

        if (allowedMimetypes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
    }),
  )
  async signup(
    @Body() dto: SignupDTO | SocialAuthPayload,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ user: User; token: string }> {
    try {
      const response = await this.authService.signup(dto, file);

      logger.info(
        `[${this.context}] User signup successful. Email: ${dto.email}\n`,
      );

      return response;
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred during user signup. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDTO,
  ): Promise<{ token: string; twoFactorAuth: boolean }> {
    try {
      const response = await this.authService.login(dto);

      logger.info(
        `[${this.context}] User login successful. Email: ${dto.email}\n`,
      );

      return response;
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred during user login. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @UseGuards(GoogleAuthGuard)
  @Get('google')
  googleLogin(): void {}

  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const redis: RedisClientType = await connectToRedis(
      Secrets.REDIS_URL,
      'Social Authentication',
      Secrets.SOCIAL_AUTH_STORE_INDEX,
    );

    try {
      const authenticatedUser = req.user as SocialAuthUser;

      if (!authenticatedUser || !authenticatedUser.token) {
        res.clearCookie(this.GOOGLE_REDIRECT_COOKIE_KEY);
        throw new UnauthorizedException('Google authentication error');
      }

      const nonce = randomBytes(16).toString('base64');
      const redirectUrl =
        (req.cookies?.[this.GOOGLE_REDIRECT_COOKIE_KEY] as string) || '/';
      const identifier = randomUUID();

      // Store social authentication details for retrieval by client
      await redis.setEx(
        identifier,
        3600,
        JSON.stringify({ ...authenticatedUser }),
      );

      // Add CSP header to protect against cross-site origin attacks
      res.setHeader(
        'Content-Security-Policy',
        `script-src 'self' 'nonce-${nonce}'`,
      );

      // Return social authentication success page
      res
        .status(HttpStatus.OK)
        .send(generateCallbackHtml(identifier, redirectUrl, nonce));
    } catch (error) {
      throw error;
    } finally {
      redis.destroy();
    }
  }

  @Get('apple')
  appleLogin(
    @Query('redirectUrl') redirectUrl: string,
    @Res() res: Response,
  ): void {
    try {
      const appleAuthUrl = new URL('https://appleid.apple.com/auth/authorize');
      appleAuthUrl.searchParams.set('response_type', 'code id_token');
      appleAuthUrl.searchParams.set('response_mode', 'form_post');
      appleAuthUrl.searchParams.set('client_id', Secrets.APPLE_CLIENT_ID);
      appleAuthUrl.searchParams.set('redirect_uri', Secrets.APPLE_CALLBACK_URL);
      appleAuthUrl.searchParams.set('scope', 'name email');
      appleAuthUrl.searchParams.set('state', redirectUrl);

      return res.redirect(appleAuthUrl.toString());
    } catch (error) {
      throw error;
    }
  }

  @Post('apple/callback')
  async appleCallback(
    @Body() dto: AppleAuthDTO,
    @Res() res: Response,
  ): Promise<void> {
    const redis: RedisClientType = await connectToRedis(
      Secrets.REDIS_URL,
      'Social Authentication',
      Secrets.SOCIAL_AUTH_STORE_INDEX,
    );

    try {
      const payload = await this.appleAuthHandler.verifyIdToken(dto.id_token);
      const authenticatedUser = await this.appleAuthHandler.authenticateUser(
        payload,
        dto,
      );

      const nonce = randomBytes(16).toString('base64');
      const identifier = randomUUID();
      // Extract the redirect URL from the 'state' parameter in the authorization URL
      const redirectUrl = dto.state.trim();

      // Store social authentication details for retrieval by client
      await redis.setEx(
        identifier,
        3600,
        JSON.stringify({ ...authenticatedUser }),
      );

      // Add CSP header to protect against cross-site origin attacks
      res.setHeader(
        'Content-Security-Policy',
        `script-src 'self' 'nonce-${nonce}'`,
      );

      // Return social authentication success page
      res
        .status(HttpStatus.OK)
        .send(generateCallbackHtml(identifier, redirectUrl, nonce));
    } catch (error) {
      throw error;
    } finally {
      redis.destroy();
    }
  }

  @Get('social/details')
  async getSocialAuthDetails(
    @Query('socialAuth') identifier: string,
  ): Promise<{ details: SocialAuthUser }> {
    const redis: RedisClientType = await connectToRedis(
      Secrets.REDIS_URL,
      'Social Authentication',
      Secrets.SOCIAL_AUTH_STORE_INDEX,
    );

    try {
      const data = await redis.get(identifier);
      if (!data) {
        throw new BadRequestException('Invalid social auth identifier');
      }

      return { details: JSON.parse(data) as SocialAuthUser };
    } catch (error) {
      throw error;
    } finally {
      redis.destroy();
    }
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  async logout(@GetUser() user: User): Promise<{ message: string }> {
    try {
      await this.authService.logout(user.email);

      logger.info(
        `[${this.context}] ${user.email} logged out of current session.\n`,
      );

      return { message: 'Logout successful!' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while logging out. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/enable')
  async enable2fa(@GetUser() user: User): Promise<{ qrcode: string }> {
    try {
      const qrcode = await this.authService.enable2fa(user.id);

      logger.info(
        `[${this.context}] ${user.email} enabled two factor authentication.\n`,
      );

      return { qrcode };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while enabling two factor authentication. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/disable')
  async disable2fa(@GetUser() user: User): Promise<{ message: string }> {
    try {
      await this.authService.disable2fa(user.id);

      logger.info(
        `[${this.context}] ${user.email} disabled two factor authentication.\n`,
      );

      return { message: '2FA disabled successfully' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while disabling two factor authentication. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/verify')
  async verify2fa(
    @GetUser() user: User,
    @Body() dto: Verify2faDTO,
  ): Promise<{ message: string }> {
    try {
      const verified = await this.authService.verify2fa(user.id, dto);

      if (verified) {
        logger.info(
          `[${this.context}] 2FA token verified successfully. Email: ${user.email}\n`,
        );

        return { message: '2FA token verified successfully' };
      } else {
        logger.error(
          `[${this.context}] Invalid 2FA token could not be verified. Email: ${user.email}\n`,
        );

        throw new BadRequestException('Invalid token');
      }
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while verifying 2FA token. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/reset')
  async requestPasswordReset(
    @Body() dto: PasswordResetDTO,
  ): Promise<{ message: string }> {
    try {
      await this.authService.requestPasswordReset(dto, this.sessionData);

      logger.info(
        `[${this.context}] Password reset requested by ${dto.email}.\n`,
      );

      return { message: 'Password reset OTP has been sent to your email' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while requesting for password reset. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/resend-otp')
  async resendOtp(): Promise<{ message: string }> {
    try {
      await this.authService.resendOtp(this.sessionData);
      logger.info(
        `[${this.context}] Password reset OTP re-sent to ${this.sessionData.email}.\n`,
      );

      return { message: 'Another OTP has been sent to your email' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while verifying password reset OTP. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDTO): Promise<{ message: string }> {
    try {
      await this.authService.verifyOtp(dto, this.sessionData);

      logger.info(
        `[${this.context}] OTP verification successful. Email: ${this.sessionData.email}\n`,
      );

      return { message: 'OTP verification successful!' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while verifying password reset OTP. Error: ${error.message}\n`,
      );

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/new')
  async changePassword(
    @Body() dto: NewPasswordDTO,
  ): Promise<{ message: string }> {
    try {
      const email = this.sessionData.email;
      await this.authService.changePassword(dto, this.sessionData);

      logger.info(`[${this.context}] Password reset completed by ${email}.\n`);

      return { message: 'Password reset complete!' };
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while changing password. Error: ${error.message}\n`,
      );

      throw error;
    }
  }
}
