import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { IoAdapter } from '@nestjs/platform-socket.io';
import logger from './common/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;

  app.enableCors();
  app.use(helmet());
  app.use(cookieParser());
  app.useWebSocketAdapter(new IoAdapter(app));
  app.setGlobalPrefix('/api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(port, '0.0.0.0');
  logger.info(`Application is running on port ${port}\n`);
}
void bootstrap();
