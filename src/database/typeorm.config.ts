import { ConfigType } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { WeatherAlert } from '../alerts/weather-alert.entity';
import appConfig from '../config/app.config';
import { Subscription } from '../subscriptions/subscription.entity';
import { InitialSqliteSchema1760000000000 } from './migrations/1760000000000-InitialSqliteSchema';
import { AddSubscriptionLocationMetadata1760100000000 } from './migrations/1760100000000-AddSubscriptionLocationMetadata';

export const typeOrmAsyncConfig: TypeOrmModuleAsyncOptions = {
  inject: [appConfig.KEY],
  useFactory: (config: ConfigType<typeof appConfig>) => {
    if (config.database.path !== ':memory:') {
      mkdirSync(dirname(resolve(config.database.path)), { recursive: true });
    }

    return {
      type: 'sqlite',
      database: config.database.path,
      entities: [Subscription, WeatherAlert],
      migrations: [
        InitialSqliteSchema1760000000000,
        AddSubscriptionLocationMetadata1760100000000,
      ],
      migrationsRun: config.nodeEnv === 'production',
      synchronize: config.nodeEnv !== 'production',
    };
  },
};
