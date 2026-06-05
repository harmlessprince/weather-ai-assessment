import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AlertType, Subscription } from '../subscriptions/subscription.entity';
import { ForecastSignalSource } from '../weather/weather.types';

export enum AlertDeliveryStatus {
  Pending = 'pending',
  Logged = 'logged',
  Sent = 'sent',
  Failed = 'failed',
}

export enum AlertSeverity {
  Info = 'info',
  Watch = 'watch',
  Warning = 'warning',
  Critical = 'critical',
}

@Entity({ name: 'weather_alerts' })
@Index(['subscriptionId', 'alertType', 'fingerprint'], { unique: true })
@Index(['subscriptionId', 'alertType', 'triggeredAt'])
export class WeatherAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subscription_id', type: 'varchar' })
  subscriptionId: string;

  @ManyToOne(() => Subscription, (subscription) => subscription.alerts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'subscription_id' })
  subscription: Subscription;

  @Column({ name: 'alert_type', type: 'varchar', length: 40 })
  alertType: AlertType;

  @Column({
    type: 'varchar',
    length: 24,
    default: AlertSeverity.Warning,
  })
  severity: AlertSeverity;

  @Column({ name: 'location_label', type: 'varchar', length: 160 })
  locationLabel: string;

  @Column({ type: 'real' })
  latitude: number;

  @Column({ type: 'real' })
  longitude: number;

  @Column({ name: 'signal_source', type: 'varchar', length: 24 })
  signalSource: ForecastSignalSource;

  @Column({ name: 'forecast_window_start', type: 'datetime' })
  forecastWindowStart: Date;

  @Column({ name: 'triggered_at', type: 'datetime' })
  triggeredAt: Date;

  @Column({ type: 'varchar', length: 160 })
  fingerprint: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({ name: 'matched_value', type: 'real', nullable: true })
  matchedValue?: number | null;

  @Column({ name: 'threshold_value', type: 'real', nullable: true })
  thresholdValue?: number | null;

  @Column({ type: 'simple-json', nullable: true })
  payload?: Record<string, unknown> | null;

  @Column({
    name: 'delivery_status',
    type: 'varchar',
    length: 24,
    default: AlertDeliveryStatus.Pending,
  })
  deliveryStatus: AlertDeliveryStatus;

  @Column({ name: 'delivery_attempted_at', type: 'datetime', nullable: true })
  deliveryAttemptedAt?: Date | null;

  @Column({ name: 'delivered_at', type: 'datetime', nullable: true })
  deliveredAt?: Date | null;

  @Column({ name: 'delivery_error', type: 'text', nullable: true })
  deliveryError?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
