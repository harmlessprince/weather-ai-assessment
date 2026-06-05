import {
  ForecastAlertSignal,
  NormalizedForecast,
  WeatherAiForecastResponse,
} from './weather.types';

const hasValue = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

const conditionCodeToString = (value?: string | number): string | undefined =>
  hasValue(value) ? String(value) : undefined;

/**
 * Converts WeatherAI's raw forecast payload into the smaller signal model used
 * by the alert engine.
 *
 * We keep this mapping in one place so later alert rules can work with stable
 * domain names instead of depending directly on WeatherAI response field names.
 */
export const normalizeWeatherAiForecast = (
  forecast: WeatherAiForecastResponse,
): NormalizedForecast => {
  const signals: ForecastAlertSignal[] = [];

  if (forecast.current?.time) {
    signals.push({
      source: 'current',
      windowStart: forecast.current.time,
      temperatureC: forecast.current.temperature,
      windSpeedKph: forecast.current.wind_speed,
      windGustKph: forecast.current.wind_gust,
      conditionCode: conditionCodeToString(forecast.current.condition_code),
    });
  }

  for (const hour of forecast.hourly ?? []) {
    if (!hour.time) {
      continue;
    }

    signals.push({
      source: 'hourly',
      windowStart: hour.time,
      temperatureC: hour.temperature,
      precipitationProbability: hour.precipitation_probability,
      windSpeedKph: hour.wind_speed,
      windGustKph: hour.wind_gust,
      conditionCode: conditionCodeToString(hour.condition_code),
    });
  }

  for (const day of forecast.daily ?? []) {
    if (!day.date) {
      continue;
    }

    signals.push({
      source: 'daily',
      windowStart: day.date,
      tempMinC: day.temp_min,
      tempMaxC: day.temp_max,
      precipitationMm: day.precipitation_sum,
      precipitationProbability: day.precipitation_probability,
      windSpeedKph: day.wind_max,
      conditionCode: conditionCodeToString(day.condition_code),
    });
  }

  return {
    location: forecast.location,
    signals,
  };
};
