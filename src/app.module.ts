import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsModule } from './alerts';
import { AppController } from './app.controller';
import { AppConfigModule } from './config';
import { typeOrmAsyncConfig } from './database';
import { AppService } from './app.service';
import { SubscriptionsModule } from './subscriptions';
import { WeatherModule } from './weather';

@Module({
  imports: [
    AppConfigModule,
    TypeOrmModule.forRootAsync(typeOrmAsyncConfig),
    SubscriptionsModule,
    AlertsModule,
    WeatherModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
