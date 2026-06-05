import { Controller, Get, Query } from '@nestjs/common';
import {
  ForecastQueryDto,
  WeatherLocationQueryDto,
} from './dto/weather-query.dto';
import { WeatherService } from './weather.service';

@Controller('api/weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get('current')
  getCurrent(@Query() query: WeatherLocationQueryDto) {
    return this.weatherService.getCurrentWeather(query);
  }

  @Get('forecast')
  getForecast(@Query() query: ForecastQueryDto) {
    return this.weatherService.getForecast(query);
  }
}
