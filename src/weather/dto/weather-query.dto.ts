import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class WeatherLocationQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lon: number;
}

export class ForecastQueryDto extends WeatherLocationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  days?: number;
}
