import { IsEmail, MaxLength } from 'class-validator';

export class FindSubscriptionsQueryDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}
