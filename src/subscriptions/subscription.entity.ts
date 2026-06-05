import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WeatherAlert } from '../alerts/weather-alert.entity';

export enum AlertType {
  HeavyRain = 'heavy_rain',
  ExtremeHeat = 'extreme_heat',
  FrostWarning = 'frost_warning',
  StormAlert = 'storm_alert',
  HighWind = 'high_wind',
}

export enum SubscriptionStatus {
  Active = 'active',
  Paused = 'paused',
}

export enum NotificationChannel {
  Email = 'email',
}

@Entity({ name: 'subscriptions' })
@Index(['email', 'latitude', 'longitude'], { unique: true })
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ name: 'location_label', type: 'varchar', length: 160 })
  locationLabel: string;

  @Column({
    name: 'location_timezone',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  locationTimezone?: string | null;

  @Column({
    name: 'location_country',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  locationCountry?: string | null;

  @Column({ type: 'real' })
  latitude: number;

  @Column({ type: 'real' })
  longitude: number;

  @Column({
    type: 'simple-json',
    default: JSON.stringify([AlertType.HeavyRain, AlertType.StormAlert]),
  })
  alertTypes: AlertType[];

  @Column({
    type: 'varchar',
    length: 24,
    default: NotificationChannel.Email,
  })
  notificationChannel: NotificationChannel;

  @Column({
    type: 'varchar',
    length: 24,
    default: SubscriptionStatus.Active,
  })
  status: SubscriptionStatus;

  @Column({ name: 'last_polled_at', type: 'datetime', nullable: true })
  lastPolledAt?: Date | null;

  @OneToMany(() => WeatherAlert, (alert) => alert.subscription)
  alerts: WeatherAlert[];

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;
}
