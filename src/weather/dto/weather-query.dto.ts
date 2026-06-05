import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'false') {
      return false;
    }

    if (value === 'true') {
      return true;
    }

    return value;
  })
  @IsBoolean()
  ai?: boolean;
}

export class ForecastQueryDto extends WeatherLocationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  days?: number;
}
