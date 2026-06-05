import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from '../config/app.config';
import { NotificationService } from './notification.service';

@Module({
  imports: [ConfigModule.forFeature(appConfig)],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
