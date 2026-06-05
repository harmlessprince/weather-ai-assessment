import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class SubscriptionLocationDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lon: number;

  @IsString()
  @MaxLength(160)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;
}

export class CreateSubscriptionDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ValidateNested()
  @Type(() => SubscriptionLocationDto)
  location: SubscriptionLocationDto;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  alerts: string[];
}
