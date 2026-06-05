import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WeatherAlert } from '../alerts/weather-alert.entity';
import { AdminApiKeyGuard } from '../common/admin-api-key.guard';
import appConfig from '../config/app.config';
import { Subscription } from './subscription.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    TypeOrmModule.forFeature([Subscription, WeatherAlert]),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, AdminApiKeyGuard],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
