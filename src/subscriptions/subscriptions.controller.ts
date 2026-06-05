import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminApiKeyGuard } from '../common/admin-api-key.guard';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('api/subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  create(@Body() dto: CreateSubscriptionDto) {
    return this.subscriptionsService.create(dto);
  }

  @Get()
  @UseGuards(AdminApiKeyGuard)
  findAll() {
    return this.subscriptionsService.findActive();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subscriptionsService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.subscriptionsService.remove(id);
  }
}
