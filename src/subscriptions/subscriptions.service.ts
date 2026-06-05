import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import appConfig from '../config/app.config';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import {
  AlertType,
  NotificationChannel,
  Subscription,
  SubscriptionStatus,
} from './subscription.entity';

const ALERT_ALIASES: Record<string, AlertType> = {
  heavy_rain: AlertType.HeavyRain,
  extreme_heat: AlertType.ExtremeHeat,
  frost: AlertType.FrostWarning,
  frost_warning: AlertType.FrostWarning,
  storm: AlertType.StormAlert,
  storm_alert: AlertType.StormAlert,
  high_wind: AlertType.HighWind,
};

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async create(dto: CreateSubscriptionDto): Promise<Subscription> {
    const activeCount = await this.subscriptionRepository.count({
      where: { status: SubscriptionStatus.Active },
    });

    if (activeCount >= this.config.alerts.maxDemoSubscriptions) {
      throw new ConflictException(
        `Demo subscription limit reached (${this.config.alerts.maxDemoSubscriptions})`,
      );
    }

    const subscription = this.subscriptionRepository.create({
      email: dto.email.toLowerCase(),
      locationLabel: dto.location.label,
      latitude: dto.location.lat,
      longitude: dto.location.lon,
      alertTypes: this.normalizeAlertTypes(dto.alerts),
      notificationChannel: NotificationChannel.Email,
      status: SubscriptionStatus.Active,
    });

    try {
      return await this.subscriptionRepository.save(subscription);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'Subscription already exists for this email and location',
        );
      }

      throw error;
    }
  }

  async findOne(id: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return subscription;
  }

  findActive(): Promise<Subscription[]> {
    return this.subscriptionRepository.find({
      where: { status: SubscriptionStatus.Active },
      order: { createdAt: 'DESC' },
    });
  }

  async findActiveByLocation(
    lat: number,
    lon: number,
  ): Promise<Subscription[]> {
    const subscriptions = await this.findActive();
    const epsilon = 0.0001;

    return subscriptions.filter(
      (subscription) =>
        Math.abs(subscription.latitude - lat) <= epsilon &&
        Math.abs(subscription.longitude - lon) <= epsilon,
    );
  }

  async remove(id: string): Promise<void> {
    const result = await this.subscriptionRepository.delete({ id });

    if (!result.affected) {
      throw new NotFoundException('Subscription not found');
    }
  }

  async markPolled(subscription: Subscription, date = new Date()) {
    await this.subscriptionRepository.update(subscription.id, {
      lastPolledAt: date,
    });
  }

  private normalizeAlertTypes(values: string[]): AlertType[] {
    const normalized = values.map((value) => ALERT_ALIASES[value]);

    if (normalized.some((value) => !value)) {
      throw new BadRequestException(
        `Unsupported alert type. Use one of: ${Object.keys(ALERT_ALIASES).join(', ')}`,
      );
    }

    return [...new Set(normalized)];
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'SQLITE_CONSTRAINT'
    );
  }
}
