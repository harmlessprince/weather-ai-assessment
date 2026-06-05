import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig from '../config/app.config';
import { AlertEvaluatorService } from './alert-evaluator.service';
import { WeatherAlert } from './weather-alert.entity';

/**
 * Registers alert evaluation services and alert-history repositories.
 *
 * Import this module anywhere the app needs threshold evaluation or cooldown
 * deduplication for WeatherAI alert candidates.
 */
@Module({
  imports: [
    ConfigModule.forFeature(appConfig),
    TypeOrmModule.forFeature([WeatherAlert]),
  ],
  providers: [AlertEvaluatorService],
  exports: [AlertEvaluatorService],
})
export class AlertsModule {}
