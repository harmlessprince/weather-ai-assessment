import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

export class SimulateWebhookDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lon: number;
}
