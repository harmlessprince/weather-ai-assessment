import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';

@Controller('api/subscriptions')
export class ManualPollingController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post(':id/poll')
  @HttpCode(200)
  pollSubscription(@Param('id') id: string) {
    return this.schedulerService.pollSubscription(id);
  }
}
