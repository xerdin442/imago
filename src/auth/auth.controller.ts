import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
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
  ResendOtpDTO,
  SignupDTO,
  Verify2faDTO,
  VerifyOtpDTO,
} from './dto';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import { GetUser } from '../custom/decorators';
import { FileInterceptor } from '@nestjs/platform-express';
import { GoogleAuthGuard } from '../custom/guards/google.guard.';
import { Request, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { AuthService } from './auth.service';
import {
  SocialAuthPayload,
  SocialAuthUser,
  AppleAuthDTO,
} from '@src/common/types';
import { generateCallbackHtml } from './helpers';
import { Logger } from '@src/common/logger';
import { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '@src/common/cache';
import { Secrets } from '@src/common/secrets';
import { AppleAuthHandler } from '@src/common/apple';
import { UploadService } from '@src/common/config/upload';

@Controller('auth')
export class AuthController {
  private readonly logger = Logger(AuthController.name);

  private readonly GOOGLE_REDIRECT_COOKIE_KEY: string =
    'google_auth_redirect_url';

  constructor(
    private readonly authService: AuthService,
    private readonly appleAuthHandler: AppleAuthHandler,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
  ) {}

  @Post('signup')
  @UseInterceptors(
    FileInterceptor('profileImage', {
      fileFilter: UploadService.fileFilter,
      limits: { fileSize: 8 * 1024 * 1024 },
      storage: UploadService.storage('user_profile', 'image'),
    }),
  )
  async signup(
    @Body() dto: SignupDTO | SocialAuthPayload,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ user: User; token: string }> {
    try {
      const response = await this.authService.signup(dto, file?.path);

      this.logger.info(`User signup successful. Email: ${dto.email}`);

      return response;
    } catch (error) {
      this.logger.error(
        `An error occurred during user signup. Error: ${error.message}`,
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

      this.logger.info(`User login successful. Email: ${dto.email}`);

      return response;
    } catch (error) {
      this.logger.error(
        `An error occurred during user login. Error: ${error.message}`,
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
      await this.redis.setEx(
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
      await this.redis.setEx(
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
    }
  }

  @Get('social/details')
  async getSocialAuthDetails(
    @Query('socialAuth') identifier: string,
  ): Promise<{ details: SocialAuthUser }> {
    try {
      const data = await this.redis.get(identifier);
      if (!data) {
        throw new BadRequestException('Invalid social auth identifier');
      }

      return { details: JSON.parse(data) as SocialAuthUser };
    } catch (error) {
      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  async logout(@GetUser() user: User): Promise<{ message: string }> {
    try {
      await this.authService.logout(user.email);

      this.logger.info(`${user.email} logged out of current session.`);

      return { message: 'Logout successful!' };
    } catch (error) {
      this.logger.error(
        `An error occurred while logging out. Error: ${error.message}`,
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

      this.logger.info(`${user.email} enabled two factor authentication.`);

      return { qrcode };
    } catch (error) {
      this.logger.error(
        `An error occurred while enabling two factor authentication. Error: ${error.message}`,
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

      this.logger.info(`${user.email} disabled two factor authentication.`);

      return { message: '2FA disabled successfully' };
    } catch (error) {
      this.logger.error(
        `An error occurred while disabling two factor authentication. Error: ${error.message}`,
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
        this.logger.info(
          `2FA token verified successfully. Email: ${user.email}`,
        );

        return { message: '2FA token verified successfully' };
      } else {
        this.logger.error(
          `Invalid 2FA token could not be verified. Email: ${user.email}`,
        );

        throw new BadRequestException('Invalid token');
      }
    } catch (error) {
      this.logger.error(
        `An error occurred while verifying 2FA token. Error: ${error.message}`,
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
      await this.authService.requestPasswordReset(dto);

      this.logger.info(`Password reset requested by ${dto.email}.`);

      return { message: 'Password reset OTP has been sent to your email' };
    } catch (error) {
      this.logger.error(
        `An error occurred while requesting for password reset. Error: ${error.message}`,
      );

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/resend-otp')
  async resendOtp(@Body() dto: ResendOtpDTO): Promise<{ message: string }> {
    try {
      await this.authService.resendOtp(dto.email);
      this.logger.info(`Password reset OTP re-sent to ${dto.email}.`);

      return { message: 'Another OTP has been sent to your email' };
    } catch (error) {
      this.logger.error(
        `An error occurred while verifying password reset OTP. Error: ${error.message}`,
      );

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDTO): Promise<{ message: string }> {
    try {
      await this.authService.verifyOtp(dto);

      this.logger.info(`OTP verification successful. Email: ${dto.email}`);

      return { message: 'OTP verification successful!' };
    } catch (error) {
      this.logger.error(
        `An error occurred while verifying password reset OTP. Error: ${error.message}`,
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
      await this.authService.changePassword(dto);

      this.logger.info(`Password reset completed by ${dto.email}.`);

      return { message: 'Password reset complete!' };
    } catch (error) {
      this.logger.error(
        `An error occurred while changing password. Error: ${error.message}`,
      );

      throw error;
    }
  }
}
