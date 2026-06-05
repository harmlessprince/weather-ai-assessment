import {
  AlertDeliveryStatus,
  AlertSeverity,
  WeatherAlert,
} from '../alerts/weather-alert.entity';
import {
  AlertType,
  NotificationChannel,
  SubscriptionStatus,
} from '../subscriptions';
import { SchedulerService } from './scheduler.service';

const subscription = {
  id: 'sub_123',
  email: 'demo@example.com',
  locationLabel: 'Nairobi CBD',
  latitude: -1.286,
  longitude: 36.817,
  alertTypes: [AlertType.HeavyRain],
  notificationChannel: NotificationChannel.Email,
  status: SubscriptionStatus.Active,
  alerts: [],
  createdAt: new Date('2026-06-05T00:00:00Z'),
  updatedAt: new Date('2026-06-05T00:00:00Z'),
};

const alert = {
  id: 'alert_123',
  subscriptionId: subscription.id,
  alertType: AlertType.HeavyRain,
  severity: AlertSeverity.Warning,
  locationLabel: 'Nairobi CBD',
  latitude: -1.286,
  longitude: 36.817,
  signalSource: 'daily',
  forecastWindowStart: new Date('2026-06-06T00:00:00Z'),
  triggeredAt: new Date('2026-06-05T12:00:00Z'),
  fingerprint: 'fingerprint',
  summary: 'Heavy rain expected: 40mm forecast.',
  deliveryStatus: AlertDeliveryStatus.Pending,
  createdAt: new Date('2026-06-05T12:00:00Z'),
} as WeatherAlert;

const createService = (enabled = true) => {
  const schedulerRegistry = {
    addInterval: jest.fn(),
    doesExist: jest.fn().mockReturnValue(false),
    deleteInterval: jest.fn(),
  };
  const subscriptionsService = {
    findActive: jest.fn().mockResolvedValue([subscription]),
    markPolled: jest.fn().mockResolvedValue(undefined),
  };
  const weatherService = {
    getForecastSignals: jest.fn().mockResolvedValue({ signals: [] }),
  };
  const alertEvaluatorService = {
    evaluateNewAlerts: jest.fn().mockResolvedValue({
      alerts: [alert],
      suppressed: [{ reason: 'cooldown' }],
    }),
    saveAlert: jest.fn().mockResolvedValue(alert),
  };
  const notificationService = {
    dispatchAlert: jest.fn().mockResolvedValue(alert),
  };
  const service = new SchedulerService(
    schedulerRegistry as never,
    subscriptionsService as never,
    weatherService as never,
    alertEvaluatorService as never,
    notificationService as never,
    {
      scheduler: {
        enabled,
        pollIntervalMinutes: 360,
      },
    } as never,
  );

  return {
    service,
    schedulerRegistry,
    subscriptionsService,
    weatherService,
    alertEvaluatorService,
    notificationService,
  };
};

describe('SchedulerService', () => {
  it('polls active subscriptions and persists dispatched alerts', async () => {
    const {
      service,
      subscriptionsService,
      weatherService,
      alertEvaluatorService,
      notificationService,
    } = createService();
    const now = new Date('2026-06-05T12:00:00Z');

    const result = await service.pollActiveSubscriptions(now);

    expect(weatherService.getForecastSignals).toHaveBeenCalledWith({
      lat: subscription.latitude,
      lon: subscription.longitude,
    });
    expect(alertEvaluatorService.evaluateNewAlerts).toHaveBeenCalledWith(
      subscription,
      { signals: [] },
      now,
    );
    expect(notificationService.dispatchAlert).toHaveBeenCalledWith(
      alert,
      subscription,
      now,
    );
    expect(alertEvaluatorService.saveAlert).toHaveBeenCalledWith(alert);
    expect(subscriptionsService.markPolled).toHaveBeenCalledWith(
      subscription,
      now,
    );
    expect(result).toEqual({
      subscriptionsEvaluated: 1,
      alertsSentOrLogged: 1,
      suppressed: 1,
    });
  });

  it('skips polling when the scheduler flag is disabled', async () => {
    const { service, subscriptionsService } = createService(false);

    const result = await service.pollActiveSubscriptions();

    expect(subscriptionsService.findActive).not.toHaveBeenCalled();
    expect(result).toEqual({
      subscriptionsEvaluated: 0,
      alertsSentOrLogged: 0,
      suppressed: 0,
      skipped: 'scheduler_disabled',
    });
  });
});
