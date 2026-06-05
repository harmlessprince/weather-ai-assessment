import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DataSource } from 'typeorm';
import appConfig from './config/app.config';

@Injectable()
export class AppService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  getHello(): string {
    return 'WeatherAI alert service is running';
  }

  async getHealth() {
    let sqlite: 'up' | 'down' = 'up';

    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      sqlite = 'down';
    }

    return {
      status: sqlite === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      sqlite,
      schedulerEnabled: this.config.scheduler.enabled,
      emailDeliveryEnabled: this.config.email.deliveryEnabled,
    };
  }
}
