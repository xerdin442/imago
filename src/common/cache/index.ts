import { Global, Module } from '@nestjs/common';
import { createClient } from 'redis';
import { Secrets } from '@src/common/secrets';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: async () => {
        const client = createClient({ url: Secrets.REDIS_URL });
        await client.connect();

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
