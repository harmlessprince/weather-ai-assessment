import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import appConfig from '../config/app.config';
import { AlertType, Subscription } from '../subscriptions';
import { ForecastAlertSignal, NormalizedForecast } from '../weather';
import {
  AlertDeliveryStatus,
  AlertSeverity,
  WeatherAlert,
} from './weather-alert.entity';

export type AlertEvaluationResult = {
  alerts: WeatherAlert[];
  suppressed: AlertSuppression[];
};

export type AlertSuppression = {
  alertType: AlertType;
  fingerprint: string;
  reason: 'duplicate_fingerprint' | 'cooldown';
  existingAlertId?: string;
};

type AlertRuleMatch = {
  alertType: AlertType;
  severity: AlertSeverity;
  signal: ForecastAlertSignal;
  summary: string;
  matchedValue?: number;
  thresholdValue?: number;
  score: number;
};

const hasNumber = (value?: number): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Evaluates normalized forecast signals against subscription alert preferences.
 *
 * The service keeps alert rule matching, candidate creation, and SQLite-backed
 * deduplication in one boundary so schedulers/controllers can request only the
 * new alerts that are safe to dispatch.
 */
@Injectable()
export class AlertEvaluatorService {
  constructor(
    @InjectRepository(WeatherAlert)
    private readonly alertRepository: Repository<WeatherAlert>,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  /**
   * Converts a forecast into unsaved alert candidates for one subscription.
   *
   * This method applies configured thresholds and returns the strongest match
   * per alert type without consulting alert history.
   */
  evaluate(
    subscription: Subscription,
    forecast: NormalizedForecast,
    now = new Date(),
  ): WeatherAlert[] {
    const selectedTypes = new Set(subscription.alertTypes);
    const matches = forecast.signals.flatMap((signal) =>
      this.evaluateSignal(signal).filter((match) =>
        selectedTypes.has(match.alertType),
      ),
    );

    return this.bestMatchPerAlertType(matches).map((match) =>
      this.toAlertEntity(subscription, match, now),
    );
  }

  /**
   * Evaluates a forecast and removes candidates already present in history.
   *
   * Suppression happens in two passes: exact fingerprint deduplication first,
   * then same-subscription/same-type cooldown checks against recent alerts.
   */
  async evaluateNewAlerts(
    subscription: Subscription,
    forecast: NormalizedForecast,
    now = new Date(),
  ): Promise<AlertEvaluationResult> {
    const candidates = this.evaluate(subscription, forecast, now);
    const alerts: WeatherAlert[] = [];
    const suppressed: AlertSuppression[] = [];

    for (const candidate of candidates) {
      const suppression = await this.findSuppression(candidate, now);

      if (suppression) {
        suppressed.push(suppression);
        continue;
      }

      alerts.push(candidate);
    }

    return { alerts, suppressed };
  }

  /**
   * Persists an alert candidate after downstream delivery decisions are made.
   */
  async saveAlert(alert: WeatherAlert): Promise<WeatherAlert> {
    return this.alertRepository.save(alert);
  }

  /**
   * Runs every alert rule against a single provider-neutral forecast signal.
   */
  private evaluateSignal(signal: ForecastAlertSignal): AlertRuleMatch[] {
    return [
      this.matchHeavyRain(signal),
      this.matchExtremeHeat(signal),
      this.matchFrost(signal),
      this.matchStorm(signal),
      this.matchHighWind(signal),
    ].filter((match): match is AlertRuleMatch => Boolean(match));
  }

  /**
   * Detects heavy rain from precipitation volume or precipitation probability.
   */
  private matchHeavyRain(
    signal: ForecastAlertSignal,
  ): AlertRuleMatch | undefined {
    const thresholds = this.config.alerts.thresholds;
    const precipitationMm = signal.precipitationMm;
    const probability = signal.precipitationProbability;
    const mmMatched =
      hasNumber(precipitationMm) && precipitationMm >= thresholds.heavyRainMm;
    const probabilityMatched =
      hasNumber(probability) && probability >= thresholds.rainProbability;

    if (!mmMatched && !probabilityMatched) {
      return undefined;
    }

    const matchedValue = (mmMatched ? precipitationMm : probability) as number;
    const thresholdValue = mmMatched
      ? thresholds.heavyRainMm
      : thresholds.rainProbability;
    const severity =
      (hasNumber(precipitationMm) &&
        precipitationMm >= thresholds.heavyRainMm * 2) ||
      (hasNumber(probability) && probability >= 95)
        ? AlertSeverity.Critical
        : AlertSeverity.Warning;

    return {
      alertType: AlertType.HeavyRain,
      severity,
      signal,
      summary: mmMatched
        ? `Heavy rain expected: ${precipitationMm}mm forecast.`
        : `Heavy rain risk: ${probability}% precipitation probability.`,
      matchedValue,
      thresholdValue,
      score: matchedValue / thresholdValue,
    };
  }

  /**
   * Detects extreme heat using daily max temperature or instantaneous reading.
   */
  private matchExtremeHeat(
    signal: ForecastAlertSignal,
  ): AlertRuleMatch | undefined {
    const threshold = this.config.alerts.thresholds.extremeHeatC;
    const temperature = signal.tempMaxC ?? signal.temperatureC;

    if (!hasNumber(temperature) || temperature < threshold) {
      return undefined;
    }

    return {
      alertType: AlertType.ExtremeHeat,
      severity:
        temperature >= threshold + 5
          ? AlertSeverity.Critical
          : AlertSeverity.Warning,
      signal,
      summary: `Extreme heat expected: ${temperature}C forecast.`,
      matchedValue: temperature,
      thresholdValue: threshold,
      score: temperature - threshold,
    };
  }

  /**
   * Detects frost risk using daily min temperature or instantaneous reading.
   */
  private matchFrost(signal: ForecastAlertSignal): AlertRuleMatch | undefined {
    const threshold = this.config.alerts.thresholds.frostC;
    const temperature = signal.tempMinC ?? signal.temperatureC;

    if (!hasNumber(temperature) || temperature > threshold) {
      return undefined;
    }

    return {
      alertType: AlertType.FrostWarning,
      severity:
        temperature <= 0 ? AlertSeverity.Critical : AlertSeverity.Warning,
      signal,
      summary: `Frost risk expected: ${temperature}C forecast.`,
      matchedValue: temperature,
      thresholdValue: threshold,
      score: threshold - temperature,
    };
  }

  /**
   * Detects storm alerts from configured WeatherAI condition codes.
   */
  private matchStorm(signal: ForecastAlertSignal): AlertRuleMatch | undefined {
    const conditionCode = signal.conditionCode;

    if (
      !conditionCode ||
      !this.config.alerts.thresholds.stormConditionCodes.includes(conditionCode)
    ) {
      return undefined;
    }

    return {
      alertType: AlertType.StormAlert,
      severity: ['96', '99'].includes(conditionCode)
        ? AlertSeverity.Critical
        : AlertSeverity.Warning,
      signal,
      summary: `Storm conditions expected: WeatherAI condition ${conditionCode}.`,
      thresholdValue: Number(conditionCode),
      score: Number(conditionCode),
    };
  }

  /**
   * Detects high wind from sustained wind speed or gust thresholds.
   */
  private matchHighWind(
    signal: ForecastAlertSignal,
  ): AlertRuleMatch | undefined {
    const thresholds = this.config.alerts.thresholds;
    const windSpeedMatched =
      hasNumber(signal.windSpeedKph) &&
      signal.windSpeedKph >= thresholds.highWindKph;
    const windGustMatched =
      hasNumber(signal.windGustKph) &&
      signal.windGustKph >= thresholds.windGustKph;

    if (!windSpeedMatched && !windGustMatched) {
      return undefined;
    }

    const matchedValue = (
      windGustMatched ? signal.windGustKph : signal.windSpeedKph
    ) as number;
    const thresholdValue = windGustMatched
      ? thresholds.windGustKph
      : thresholds.highWindKph;

    return {
      alertType: AlertType.HighWind,
      severity:
        matchedValue >= thresholdValue * 1.5
          ? AlertSeverity.Critical
          : AlertSeverity.Warning,
      signal,
      summary: windGustMatched
        ? `High wind gusts expected: ${signal.windGustKph}kph forecast.`
        : `High winds expected: ${signal.windSpeedKph}kph forecast.`,
      matchedValue,
      thresholdValue,
      score: matchedValue / thresholdValue,
    };
  }

  /**
   * Keeps one strongest alert candidate per type for the current poll cycle.
   */
  private bestMatchPerAlertType(matches: AlertRuleMatch[]): AlertRuleMatch[] {
    const bestMatches = new Map<AlertType, AlertRuleMatch>();

    for (const match of matches) {
      const current = bestMatches.get(match.alertType);

      if (!current || match.score > current.score) {
        bestMatches.set(match.alertType, match);
      }
    }

    return [...bestMatches.values()];
  }

  /**
   * Translates an internal rule match into a TypeORM alert entity.
   */
  private toAlertEntity(
    subscription: Subscription,
    match: AlertRuleMatch,
    triggeredAt: Date,
  ): WeatherAlert {
    const forecastWindowStart = new Date(match.signal.windowStart);
    const fingerprint = this.buildFingerprint(subscription, match);

    return this.alertRepository.create({
      subscriptionId: subscription.id,
      alertType: match.alertType,
      severity: match.severity,
      locationLabel: subscription.locationLabel,
      latitude: subscription.latitude,
      longitude: subscription.longitude,
      signalSource: match.signal.source,
      forecastWindowStart,
      triggeredAt,
      fingerprint,
      summary: match.summary,
      matchedValue: match.matchedValue,
      thresholdValue: match.thresholdValue,
      payload: match.signal,
      deliveryStatus: AlertDeliveryStatus.Pending,
    });
  }

  /**
   * Creates the stable key used to prevent resending the same forecast window.
   */
  private buildFingerprint(
    subscription: Subscription,
    match: AlertRuleMatch,
  ): string {
    return [
      subscription.id,
      match.alertType,
      match.signal.source,
      match.signal.windowStart,
    ].join(':');
  }

  /**
   * Looks up alert history for exact duplicates or cooldown-window matches.
   */
  private async findSuppression(
    alert: WeatherAlert,
    now: Date,
  ): Promise<AlertSuppression | undefined> {
    const existingFingerprint = await this.alertRepository.findOne({
      where: {
        subscriptionId: alert.subscriptionId,
        alertType: alert.alertType,
        fingerprint: alert.fingerprint,
      },
    });

    if (existingFingerprint) {
      return {
        alertType: alert.alertType,
        fingerprint: alert.fingerprint,
        reason: 'duplicate_fingerprint',
        existingAlertId: existingFingerprint.id,
      };
    }

    const cooldownStartedAt = new Date(
      now.getTime() - this.config.alerts.cooldownHours * 60 * 60 * 1000,
    );
    const existingCooldownAlert = await this.alertRepository.findOne({
      where: {
        subscriptionId: alert.subscriptionId,
        alertType: alert.alertType,
        triggeredAt: MoreThanOrEqual(cooldownStartedAt),
      },
      order: {
        triggeredAt: 'DESC',
      },
    });

    if (!existingCooldownAlert) {
      return undefined;
    }

    return {
      alertType: alert.alertType,
      fingerprint: alert.fingerprint,
      reason: 'cooldown',
      existingAlertId: existingCooldownAlert.id,
    };
  }
}
