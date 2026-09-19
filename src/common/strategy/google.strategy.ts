import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { SocialAuthPayload, SocialAuthUser } from '../types';
import { Request } from 'express';
import { Logger } from '../logger';
import { LoginDTO } from '@src/auth/dto';
import { DbService } from '@src/db/db.service';
import { Secrets } from '../secrets';
import { AuthService } from '@src/auth/auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy) {
  private readonly logger = Logger(GoogleStrategy.name);

  constructor(
    private readonly prisma: DbService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: Secrets.GOOGLE_CLIENT_ID,
      clientSecret: Secrets.GOOGLE_CLIENT_SECRET,
      callbackURL: Secrets.GOOGLE_CALLBACK_URL,
      passReqToCallback: true,
      scope: ['profile', 'email'],
    });
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { emails, name, photos } = profile;
    if (!emails || !name) {
      return done(
        new UnauthorizedException('Google authentication failed'),
        undefined,
      );
    }

    try {
      // Check if user exists with the retrieved email address
      const user = await this.prisma.user.findUnique({
        where: { email: emails[0].value },
      });

      if (user) {
        const dto: LoginDTO = {
          email: user.email,
          password: Secrets.SOCIAL_AUTH_PASSWORD,
        };

        // Sign in existing user
        const authResponse: SocialAuthUser = await this.authService.login(dto);

        this.logger.info(`User login successful. Email: ${dto.email}`);

        return done(null, authResponse);
      } else {
        const details: SocialAuthPayload = {
          email: emails[0].value,
          firstName: name.givenName,
          lastName: name.familyName,
          profileImage: photos ? photos[0].value : '',
        };

        // Sign up and onboard new user
        const authResponse: SocialAuthUser =
          await this.authService.signup(details);

        this.logger.info(`User signup successful. Email: ${details.email}`);

        return done(null, authResponse);
      }
    } catch (error) {
      this.logger.error(
        `An error occurred while validating Google authentication strategy. Error: ${error.message}`,
      );

      if (error instanceof BadRequestException) return done(error, undefined);
      throw error;
    }
  }
}
