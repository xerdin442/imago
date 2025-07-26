import { Injectable } from '@nestjs/common';
import * as jwksClient from 'jwks-rsa';
import * as jwt from 'jsonwebtoken';
import {
  AppleAuthDTO,
  AppleAuthPayload,
  SocialAuthPayload,
  SocialAuthUser,
} from '../types';
import { DbService } from '@src/db/db.service';
import { AuthService } from '@src/auth/auth.service';
import logger from '../logger';

@Injectable()
export class AppleAuthHandler {
  private readonly context: string = AppleAuthHandler.name;

  private readonly client = jwksClient({
    jwksUri: 'https://appleid.apple.com/auth/oauth2/v2/keys',
    cache: true,
    rateLimit: true,
    timeout: 30000,
  });

  constructor(
    private readonly prisma: DbService,
    private readonly authService: AuthService,
  ) {}

  getAppleSigningKey(kid: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client.getSigningKey(kid, (err, key: jwksClient.SigningKey) => {
        if (err) return reject(err);
        resolve(key.getPublicKey());
      });
    });
  }

  async verifyIdToken(idToken: string): Promise<AppleAuthPayload> {
    const decodedHeader = jwt.decode(idToken, { complete: true });
    if (!decodedHeader || typeof decodedHeader === 'string') {
      throw new Error('Invalid Apple ID token');
    }

    const signingKey = await this.getAppleSigningKey(
      decodedHeader.header.kid as string,
    );

    return new Promise((resolve, reject) => {
      jwt.verify(
        idToken,
        signingKey,
        {
          algorithms: ['ES256'],
          issuer: 'https://appleid.apple.com',
        },
        (err, payload) => {
          if (err) return reject(err);
          resolve(payload as AppleAuthPayload);
        },
      );
    });
  }

  async authenticateUser(
    payload: AppleAuthPayload,
    dto: AppleAuthDTO,
  ): Promise<SocialAuthUser> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { appleAuthId: payload.sub },
      });

      if (user) {
        // Sign in existing user
        const authResponse: SocialAuthUser = await this.authService.login(user);

        logger.info(
          `[${this.context}] User login successful. Email: ${user.email}\n`,
        );

        return authResponse;
      } else {
        // Sign up and onboard new user
        if (dto.user) {
          const details: SocialAuthPayload = {
            email: dto.user?.email,
            firstName: dto.user?.name.firstName,
            lastName: dto.user?.name.lastName,
            authId: payload.sub,
          };

          const authResponse: SocialAuthUser =
            await this.authService.signup(details);

          logger.info(
            `[${this.context}] User signup successful. Email: ${details.email}\n`,
          );

          return authResponse;
        } else {
          throw new Error('Apple authentication failed');
        }
      }
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while validating Apple authentication credentials. Error: ${error.message}\n`,
      );

      throw error;
    }
  }
}
