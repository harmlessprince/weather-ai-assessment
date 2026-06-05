import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import {
  AlertDeliveryStatus,
  WeatherAlert,
} from '../alerts/weather-alert.entity';
import appConfig from '../config/app.config';
import { Subscription } from '../subscriptions';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly transporter?: Transporter;

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {
    if (this.config.email.deliveryEnabled) {
      this.transporter = nodemailer.createTransport({
        host: this.config.email.host,
        port: this.config.email.port,
        secure: this.config.email.secure,
        auth: {
          user: this.config.email.user,
          pass: this.config.email.pass,
        },
      });
    }
  }

  async dispatchAlert(
    alert: WeatherAlert,
    subscription: Subscription,
    now = new Date(),
  ): Promise<WeatherAlert> {
    alert.deliveryAttemptedAt = now;

    if (!this.config.email.deliveryEnabled) {
      alert.deliveryStatus = AlertDeliveryStatus.Logged;
      this.logger.log(
        `EMAIL_DELIVERY_ENABLED=false; alert email logged for ${subscription.email}: ${JSON.stringify(
          this.buildEmail(alert, subscription),
        )}`,
      );

      return alert;
    }

    try {
      await this.transporter?.sendMail(this.buildEmail(alert, subscription));
      alert.deliveryStatus = AlertDeliveryStatus.Sent;
      alert.deliveredAt = now;
      alert.deliveryError = null;
    } catch (error) {
      alert.deliveryStatus = AlertDeliveryStatus.Failed;
      alert.deliveryError = this.describeError(error);
      this.logger.warn(
        `Alert email failed for subscription ${subscription.id}: ${alert.deliveryError}`,
      );
    }

    return alert;
  }

  private buildEmail(alert: WeatherAlert, subscription: Subscription) {
    const subject = `[WeatherAI] ${this.titleCase(alert.alertType)} for ${alert.locationLabel}`;
    const severity = this.titleCase(alert.severity);
    const forecastTime = alert.forecastWindowStart.toISOString();
    const triggeredAt = alert.triggeredAt.toISOString();
    const valueLine = this.formatValueLine(alert);
    const text = [
      `${severity} ${this.titleCase(alert.alertType)}`,
      '',
      alert.summary,
      '',
      `Location: ${alert.locationLabel} (${alert.latitude}, ${alert.longitude})`,
      `Forecast window: ${forecastTime}`,
      `Triggered at: ${triggeredAt}`,
      valueLine,
      '',
      'This demo uses WeatherAI forecast polling and email dispatch because SMS/USSD alert delivery is not available on the free plan.',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      from: this.config.email.from,
      to: subscription.email,
      subject,
      text,
      html: this.toHtml(text),
    };
  }

  private formatValueLine(alert: WeatherAlert): string | undefined {
    if (
      typeof alert.matchedValue !== 'number' ||
      typeof alert.thresholdValue !== 'number'
    ) {
      return undefined;
    }

    return `Matched value: ${alert.matchedValue} (threshold: ${alert.thresholdValue})`;
  }

  private titleCase(value: string): string {
    return value
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private toHtml(text: string): string {
    return text
      .split('\n')
      .map((line) => (line ? `<p>${this.escapeHtml(line)}</p>` : '<br>'))
      .join('');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown email delivery error';
  }
}
