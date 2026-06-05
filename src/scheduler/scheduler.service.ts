import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  AlertEvaluatorService,
  type AlertSuppression,
  WeatherAlert,
} from '../alerts';
import appConfig from '../config/app.config';
import { NotificationService } from '../notifications';
import { Subscription, SubscriptionsService } from '../subscriptions';
import { WeatherService } from '../weather';

const ALERT_POLL_INTERVAL_NAME = 'weather-alert-polling';

type ManualPollResult = {
  subscriptionId: string;
  alertsSentOrLogged: number;
  suppressed: AlertSuppression[];
  alerts: WeatherAlert[];
};

@Injectable()
export class SchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SchedulerService.name);
  private isPolling = false;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly weatherService: WeatherService,
    private readonly alertEvaluatorService: AlertEvaluatorService,
    private readonly notificationService: NotificationService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.scheduler.enabled) {
      this.logger.log('SCHEDULER_ENABLED=false; alert polling is disabled');
      return;
    }

    const intervalMs = this.config.scheduler.pollIntervalMinutes * 60 * 1000;
    const interval = setInterval(() => {
      void this.pollActiveSubscriptions();
    }, intervalMs);

    this.schedulerRegistry.addInterval(ALERT_POLL_INTERVAL_NAME, interval);
    this.logger.log(
      `Alert polling scheduled every ${this.config.scheduler.pollIntervalMinutes} minutes`,
    );

    void this.pollActiveSubscriptions();
  }

  onApplicationShutdown() {
    if (
      this.schedulerRegistry.doesExist('interval', ALERT_POLL_INTERVAL_NAME)
    ) {
      this.schedulerRegistry.deleteInterval(ALERT_POLL_INTERVAL_NAME);
    }
  }

  async pollActiveSubscriptions(now = new Date()) {
    if (!this.config.scheduler.enabled) {
      return {
        subscriptionsEvaluated: 0,
        alertsSentOrLogged: 0,
        suppressed: 0,
        skipped: 'scheduler_disabled',
      };
    }

    if (this.isPolling) {
      this.logger.warn('Previous alert polling cycle is still running');
      return {
        subscriptionsEvaluated: 0,
        alertsSentOrLogged: 0,
        suppressed: 0,
        skipped: 'poll_already_running',
      };
    }

    this.isPolling = true;

    try {
      const subscriptions = await this.subscriptionsService.findActive();
      const results: ManualPollResult[] = [];

      for (const subscription of subscriptions) {
        try {
          results.push(await this.pollSubscriptionRecord(subscription, now));
        } catch (error) {
          this.logger.error(error);
          console.log(error);
          this.logger.warn(
            `Polling failed for subscription ${subscription.id}: ${this.describeError(
              error,
            )}`,
          );
        }
      }

      const alertsSentOrLogged = results.reduce(
        (total, result) => total + result.alertsSentOrLogged,
        0,
      );
      const suppressed = results.reduce(
        (total, result) => total + result.suppressed.length,
        0,
      );

      this.logger.log(
        `Alert polling complete: subscriptions=${subscriptions.length}, alerts=${alertsSentOrLogged}, suppressed=${suppressed}`,
      );

      return {
        subscriptionsEvaluated: subscriptions.length,
        alertsSentOrLogged,
        suppressed,
      };
    } finally {
      this.isPolling = false;
    }
  }

  async pollSubscription(
    id: string,
    now = new Date(),
  ): Promise<ManualPollResult> {
    const subscription = await this.subscriptionsService.findOne(id);

    return this.pollSubscriptionRecord(subscription, now);
  }

  private async pollSubscriptionRecord(
    subscription: Subscription,
    now: Date,
  ): Promise<ManualPollResult> {
    const forecast = await this.weatherService.getForecastSignals({
      lat: subscription.latitude,
      lon: subscription.longitude,
      ai: false,
    });
    const result = await this.alertEvaluatorService.evaluateNewAlerts(
      subscription,
      forecast,
      now,
    );
    const alerts: WeatherAlert[] = [];

    for (const alert of result.alerts) {
      await this.notificationService.dispatchAlert(alert, subscription, now);
      alerts.push(await this.alertEvaluatorService.saveAlert(alert));
    }

    await this.subscriptionsService.markPolled(subscription, now);

    return {
      subscriptionId: subscription.id,
      alertsSentOrLogged: alerts.length,
      suppressed: result.suppressed,
      alerts,
    };
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'unknown error';
  }
}
