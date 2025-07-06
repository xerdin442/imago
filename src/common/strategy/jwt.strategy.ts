import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { DbService } from '@src/db/db.service';
import { Secrets } from '../secrets';
import logger from '../logger';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly context = JwtStrategy.name;

  constructor(private readonly prisma: DbService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true,
      secretOrKey: Secrets.JWT_SECRET,
    });
  }

  async validate(payload: Record<string, any>): Promise<User> {
    try {
      // Prompt user to login if token has expired
      const currentTime = Math.floor(Date.now() / 1000);
      if (payload.exp < currentTime) {
        throw new UnauthorizedException('Session expired. Please log in.');
      }

      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: payload.sub as number },
      });
      user.password = 'X-X-X';

      return user;
    } catch (error) {
      logger.error(
        `[${this.context}] An error occurred while validating authorization token. Error: ${error.message}\n`,
      );

      throw error;
    }
  }
}
