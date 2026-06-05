import { MoreThanOrEqual, Repository } from 'typeorm';
import {
  AlertType,
  NotificationChannel,
  SubscriptionStatus,
} from '../subscriptions';
import { NormalizedForecast } from '../weather';
import { AlertEvaluatorService } from './alert-evaluator.service';
import {
  AlertDeliveryStatus,
  AlertSeverity,
  WeatherAlert,
} from './weather-alert.entity';

const config = {
  alerts: {
    cooldownHours: 12,
    thresholds: {
      heavyRainMm: 25,
      rainProbability: 80,
      extremeHeatC: 35,
      frostC: 2,
      highWindKph: 40,
      windGustKph: 60,
      stormConditionCodes: ['95', '96', '99'],
    },
  },
};

const subscription = {
  id: 'sub_123',
  email: 'demo@example.com',
  locationLabel: 'Nairobi CBD',
  latitude: -1.286,
  longitude: 36.817,
  alertTypes: [
    AlertType.HeavyRain,
    AlertType.ExtremeHeat,
    AlertType.FrostWarning,
    AlertType.StormAlert,
    AlertType.HighWind,
  ],
  notificationChannel: NotificationChannel.Email,
  status: SubscriptionStatus.Active,
  alerts: [],
  createdAt: new Date('2026-06-05T00:00:00Z'),
  updatedAt: new Date('2026-06-05T00:00:00Z'),
};

const createRepository = (overrides: Partial<Repository<WeatherAlert>> = {}) =>
  ({
    create: jest.fn((value) => value as WeatherAlert),
    findOne: jest.fn(),
    save: jest.fn((alert) => Promise.resolve(alert as WeatherAlert)),
    ...overrides,
  }) as unknown as jest.Mocked<Repository<WeatherAlert>>;

describe('AlertEvaluatorService', () => {
  it('evaluates forecast signals against configured thresholds', () => {
    const repository = createRepository();
    const service = new AlertEvaluatorService(repository, config as never);
    const forecast: NormalizedForecast = {
      signals: [
        {
          source: 'daily',
          windowStart: '2026-06-06',
          precipitationMm: 40,
          precipitationProbability: 88,
          tempMaxC: 38,
          windSpeedKph: 43,
          conditionCode: '95',
        },
      ],
    };

    const alerts = service.evaluate(subscription, forecast);

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          alertType: AlertType.HeavyRain,
          deliveryStatus: AlertDeliveryStatus.Pending,
          locationLabel: 'Nairobi CBD',
          matchedValue: 40,
          severity: AlertSeverity.Warning,
        }),
        expect.objectContaining({
          alertType: AlertType.ExtremeHeat,
          matchedValue: 38,
        }),
        expect.objectContaining({
          alertType: AlertType.HighWind,
          matchedValue: 43,
        }),
        expect.objectContaining({
          alertType: AlertType.StormAlert,
          severity: AlertSeverity.Warning,
        }),
      ]),
    );
    expect(alerts).toHaveLength(4);
  });

  it('keeps the strongest matching forecast window per alert type', () => {
    const repository = createRepository();
    const service = new AlertEvaluatorService(repository, config as never);
    const forecast: NormalizedForecast = {
      signals: [
        {
          source: 'hourly',
          windowStart: '2026-06-05T12:00:00Z',
          precipitationProbability: 82,
        },
        {
          source: 'hourly',
          windowStart: '2026-06-05T18:00:00Z',
          precipitationProbability: 97,
        },
      ],
    };

    const alerts = service.evaluate(subscription, forecast);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual(
      expect.objectContaining({
        alertType: AlertType.HeavyRain,
        forecastWindowStart: new Date('2026-06-05T18:00:00Z'),
        matchedValue: 97,
        severity: AlertSeverity.Critical,
      }),
    );
  });

  it('suppresses exact forecast fingerprints already stored in alert history', async () => {
    const repository = createRepository({
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ id: 'alert_existing' } as WeatherAlert),
    });
    const service = new AlertEvaluatorService(repository, config as never);

    const result = await service.evaluateNewAlerts(
      subscription,
      {
        signals: [
          {
            source: 'daily',
            windowStart: '2026-06-06',
            precipitationMm: 30,
          },
        ],
      },
      new Date('2026-06-05T12:00:00Z'),
    );

    expect(result.alerts).toEqual([]);
    expect(result.suppressed).toEqual([
      expect.objectContaining({
        alertType: AlertType.HeavyRain,
        reason: 'duplicate_fingerprint',
        existingAlertId: 'alert_existing',
      }),
    ]);
  });

  it('suppresses same-type alerts inside the configured cooldown window', async () => {
    const repository = createRepository({
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'alert_recent' } as WeatherAlert),
    });
    const service = new AlertEvaluatorService(repository, config as never);

    const result = await service.evaluateNewAlerts(
      subscription,
      {
        signals: [
          {
            source: 'daily',
            windowStart: '2026-06-06',
            precipitationMm: 30,
          },
        ],
      },
      new Date('2026-06-05T12:00:00Z'),
    );

    expect(result.alerts).toEqual([]);
    expect(result.suppressed).toEqual([
      expect.objectContaining({
        alertType: AlertType.HeavyRain,
        reason: 'cooldown',
        existingAlertId: 'alert_recent',
      }),
    ]);
    expect(repository.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          alertType: AlertType.HeavyRain,
          subscriptionId: 'sub_123',
          triggeredAt: MoreThanOrEqual(new Date('2026-06-05T00:00:00Z')),
        }),
      }),
    );
  });
});
