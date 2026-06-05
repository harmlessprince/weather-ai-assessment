import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AlertDeliveryStatus,
  AlertSeverity,
  WeatherAlert,
} from '../src/alerts/weather-alert.entity';
import {
  AlertType,
  Subscription,
  SubscriptionStatus,
} from '../src/subscriptions/subscription.entity';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let subscriptionRepository: Repository<Subscription>;
  let alertRepository: Repository<WeatherAlert>;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SCHEDULER_ENABLED = 'false';
    process.env.EMAIL_DELIVERY_ENABLED = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
    subscriptionRepository = moduleFixture.get<Repository<Subscription>>(
      getRepositoryToken(Subscription),
    );
    alertRepository = moduleFixture.get<Repository<WeatherAlert>>(
      getRepositoryToken(WeatherAlert),
    );
    await alertRepository.clear();
    await subscriptionRepository.clear();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('WeatherAI alert service is running');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            status: 'ok',
            sqlite: 'up',
            schedulerEnabled: false,
            emailDeliveryEnabled: false,
          }),
        );
      });
  });

  it('/api/subscriptions/by-email (GET) returns active subscriptions by email', async () => {
    await subscriptionRepository.save([
      subscriptionRepository.create({
        email: 'demo@example.com',
        locationLabel: 'Lagos',
        latitude: 6.5244,
        longitude: 3.3792,
        alertTypes: [AlertType.HeavyRain, AlertType.StormAlert],
        status: SubscriptionStatus.Active,
      }),
      subscriptionRepository.create({
        email: 'other@example.com',
        locationLabel: 'Abuja',
        latitude: 9.0765,
        longitude: 7.3986,
        alertTypes: [AlertType.HighWind],
        status: SubscriptionStatus.Active,
      }),
      subscriptionRepository.create({
        email: 'demo@example.com',
        locationLabel: 'Inactive Lagos',
        latitude: 6.5245,
        longitude: 3.3793,
        alertTypes: [AlertType.ExtremeHeat],
        status: SubscriptionStatus.Paused,
      }),
    ]);

    return request(app.getHttpServer())
      .get('/api/subscriptions/by-email')
      .query({ email: 'DEMO@example.com' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            email: 'demo@example.com',
            locationLabel: 'Lagos',
            status: SubscriptionStatus.Active,
          }),
        );
      });
  });

  it('/api/subscriptions/by-email (GET) validates email query', () => {
    return request(app.getHttpServer())
      .get('/api/subscriptions/by-email')
      .query({ email: 'not-an-email' })
      .expect(400);
  });

  it('/api/subscriptions (GET) remains admin protected', () => {
    return request(app.getHttpServer()).get('/api/subscriptions').expect(401);
  });

  it('/api/subscriptions/:id/alerts (GET) returns alerts for one subscription', async () => {
    const [lagos, abuja] = await subscriptionRepository.save([
      subscriptionRepository.create({
        email: 'demo@example.com',
        locationLabel: 'Lagos',
        latitude: 6.5244,
        longitude: 3.3792,
        alertTypes: [AlertType.HeavyRain],
        status: SubscriptionStatus.Active,
      }),
      subscriptionRepository.create({
        email: 'demo@example.com',
        locationLabel: 'Abuja',
        latitude: 9.0765,
        longitude: 7.3986,
        alertTypes: [AlertType.HighWind],
        status: SubscriptionStatus.Active,
      }),
    ]);

    await alertRepository.save([
      alertRepository.create({
        subscriptionId: lagos.id,
        alertType: AlertType.HeavyRain,
        severity: AlertSeverity.Warning,
        locationLabel: 'Lagos',
        latitude: 6.5244,
        longitude: 3.3792,
        signalSource: 'daily',
        forecastWindowStart: new Date('2026-06-06T00:00:00.000Z'),
        triggeredAt: new Date('2026-06-05T12:00:00.000Z'),
        fingerprint: 'lagos-heavy-rain',
        summary: 'Heavy rain expected in Lagos.',
        matchedValue: 40,
        thresholdValue: 25,
        deliveryStatus: AlertDeliveryStatus.Logged,
      }),
      alertRepository.create({
        subscriptionId: abuja.id,
        alertType: AlertType.HighWind,
        severity: AlertSeverity.Watch,
        locationLabel: 'Abuja',
        latitude: 9.0765,
        longitude: 7.3986,
        signalSource: 'hourly',
        forecastWindowStart: new Date('2026-06-06T03:00:00.000Z'),
        triggeredAt: new Date('2026-06-05T13:00:00.000Z'),
        fingerprint: 'abuja-high-wind',
        summary: 'High wind expected in Abuja.',
        matchedValue: 48,
        thresholdValue: 40,
        deliveryStatus: AlertDeliveryStatus.Logged,
      }),
    ]);

    return request(app.getHttpServer())
      .get(`/api/subscriptions/${lagos.id}/alerts`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toEqual(
          expect.objectContaining({
            subscriptionId: lagos.id,
            alertType: AlertType.HeavyRain,
            locationLabel: 'Lagos',
            summary: 'Heavy rain expected in Lagos.',
          }),
        );
      });
  });

  it('/api/subscriptions/:id/alerts (GET) returns 404 for an unknown subscription', () => {
    return request(app.getHttpServer())
      .get('/api/subscriptions/00000000-0000-4000-8000-000000000000/alerts')
      .expect(404);
  });
});
