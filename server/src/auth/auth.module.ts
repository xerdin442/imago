import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BullModule } from '@nestjs/bull';
import { JwtModule } from '@nestjs/jwt';
import { Secrets } from '@src/common/secrets';
import { JwtStrategy } from '@src/common/strategy/jwt.strategy';
import { MetricsService } from '@src/metrics/metrics.service';
import { SessionService } from '@src/common/session';
import { AuthProcessor } from './auth.processor';
import { GoogleStrategy } from '@src/common/strategy/google.strategy';
import { AppleAuthService } from '@src/common/apple';

@Module({
  imports: [
    JwtModule.register({
      secret: Secrets.JWT_SECRET,
      signOptions: { expiresIn: '1h' },
    }),
    BullModule.registerQueue({
      name: 'auth-queue',
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    MetricsService,
    SessionService,
    AuthProcessor,
    GoogleStrategy,
    AppleAuthService,
  ],
})
export class AuthModule {}
