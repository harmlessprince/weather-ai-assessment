import { Body, Controller, Post } from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions';
import { WeatherService } from '../weather';
import { AlertEvaluatorService } from './alert-evaluator.service';
import { SimulateWebhookDto } from './dto/simulate-webhook.dto';
import { AlertDeliveryStatus, WeatherAlert } from './weather-alert.entity';

@Controller('api/webhook')
export class WebhookSimulationController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly weatherService: WeatherService,
    private readonly alertEvaluatorService: AlertEvaluatorService,
  ) {}

  @Post('simulate')
  async simulate(@Body() dto: SimulateWebhookDto) {
    const subscriptions = await this.subscriptionsService.findActiveByLocation(
      dto.lat,
      dto.lon,
    );

    if (subscriptions.length === 0) {
      return {
        subscriptionsEvaluated: 0,
        alerts: [],
        suppressed: [],
      };
    }

    const forecast = await this.weatherService.getForecastSignals({
      lat: dto.lat,
      lon: dto.lon,
    });
    const alerts: WeatherAlert[] = [];
    const suppressed: Record<string, unknown>[] = [];
    const now = new Date();

    for (const subscription of subscriptions) {
      const result = await this.alertEvaluatorService.evaluateNewAlerts(
        subscription,
        forecast,
        now,
      );

      for (const alert of result.alerts) {
        alert.deliveryStatus = AlertDeliveryStatus.Logged;
        alert.deliveryAttemptedAt = now;
        alerts.push(await this.alertEvaluatorService.saveAlert(alert));
      }

      suppressed.push(
        ...result.suppressed.map((suppression) => ({
          subscriptionId: subscription.id,
          ...suppression,
        })),
      );

      await this.subscriptionsService.markPolled(subscription, now);
    }

    return {
      subscriptionsEvaluated: subscriptions.length,
      alerts,
      suppressed,
    };
  }
}
