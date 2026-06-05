import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AlertQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;
}
