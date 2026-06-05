import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from '../config/app.config';
import { WeatherService } from './weather.service';

@Module({
  imports: [HttpModule, ConfigModule.forFeature(appConfig)],
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
