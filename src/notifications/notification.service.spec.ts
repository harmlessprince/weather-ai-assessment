import nodemailer from 'nodemailer';
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
import { NotificationService } from './notification.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(),
  },
}));

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

const createAlert = (): WeatherAlert =>
  ({
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
    matchedValue: 40,
    thresholdValue: 25,
    deliveryStatus: AlertDeliveryStatus.Pending,
    createdAt: new Date('2026-06-05T12:00:00Z'),
  }) as WeatherAlert;

describe('NotificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs email payloads when delivery is disabled', async () => {
    const service = new NotificationService({
      email: {
        deliveryEnabled: false,
      },
    } as never);
    const alert = createAlert();

    await service.dispatchAlert(
      alert,
      subscription,
      new Date('2026-06-05T12:30:00Z'),
    );

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(alert.deliveryStatus).toBe(AlertDeliveryStatus.Logged);
    expect(alert.deliveryAttemptedAt).toEqual(new Date('2026-06-05T12:30:00Z'));
  });

  it('sends alert emails when delivery is enabled', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'msg_123' });
    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as never);
    const service = new NotificationService({
      email: {
        deliveryEnabled: true,
        from: 'alerts@example.com',
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: 'smtp-user',
        pass: 'smtp-pass',
      },
    } as never);
    const alert = createAlert();

    await service.dispatchAlert(
      alert,
      subscription,
      new Date('2026-06-05T12:30:00Z'),
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'alerts@example.com',
        to: 'demo@example.com',
        subject: '[WeatherAI] Heavy Rain for Nairobi CBD',
      }),
    );
    expect(alert.deliveryStatus).toBe(AlertDeliveryStatus.Sent);
    expect(alert.deliveredAt).toEqual(new Date('2026-06-05T12:30:00Z'));
  });
});
