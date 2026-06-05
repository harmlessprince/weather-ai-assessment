import { ConfigType } from '@nestjs/config';
import { TypeOrmModuleAsyncOptions } from '@nestjs/typeorm';
import { WeatherAlert } from '../alerts/weather-alert.entity';
import appConfig from '../config/app.config';
import { Subscription } from '../subscriptions/subscription.entity';

export const typeOrmAsyncConfig: TypeOrmModuleAsyncOptions = {
  inject: [appConfig.KEY],
  useFactory: (config: ConfigType<typeof appConfig>) => ({
    type: 'sqlite',
    database: config.database.path,
    entities: [Subscription, WeatherAlert],
    synchronize: config.nodeEnv !== 'production',
  }),
};
