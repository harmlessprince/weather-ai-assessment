import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertsModule } from '../alerts';
import appConfig from '../config/app.config';
import { NotificationsModule } from '../notifications';
import { SubscriptionsModule } from '../subscriptions';
import { WeatherModule } from '../weather';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    ScheduleModule.forRoot(),
    AlertsModule,
    NotificationsModule,
    SubscriptionsModule,
    WeatherModule,
  ],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
