import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminApiKeyGuard } from '../common/admin-api-key.guard';
import { AlertQueryDto } from './dto/alert-query.dto';
import { WeatherAlert } from './weather-alert.entity';

@Controller('api/alerts')
export class AlertsController {
  constructor(
    @InjectRepository(WeatherAlert)
    private readonly alertRepository: Repository<WeatherAlert>,
  ) {}

  @Get()
  @UseGuards(AdminApiKeyGuard)
  findAll(@Query() query: AlertQueryDto) {
    const builder = this.alertRepository
      .createQueryBuilder('alert')
      .leftJoinAndSelect('alert.subscription', 'subscription')
      .orderBy('alert.triggeredAt', 'DESC');

    if (query.email) {
      builder.andWhere('LOWER(subscription.email) = LOWER(:email)', {
        email: query.email,
      });
    }

    if (query.location) {
      builder.andWhere('LOWER(alert.locationLabel) LIKE LOWER(:location)', {
        location: `%${query.location}%`,
      });
    }

    return builder.getMany();
  }
}
