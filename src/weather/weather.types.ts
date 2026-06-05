export type ForecastSignalSource = 'current' | 'hourly' | 'daily';

/**
 * Provider-neutral forecast window used by alert rules.
 *
 * The normalizer produces this shape so threshold checks can compare weather
 * values without knowing whether they came from current, hourly, or daily data.
 */
export type ForecastAlertSignal = {
  source: ForecastSignalSource;
  windowStart: string;
  temperatureC?: number;
  tempMinC?: number;
  tempMaxC?: number;
  precipitationMm?: number;
  precipitationProbability?: number;
  windSpeedKph?: number;
  windGustKph?: number;
  conditionCode?: string;
};

/**
 * Location metadata returned by WeatherAI for the requested coordinates.
 */
export type WeatherAiLocation = {
  lat?: number;
  lon?: number;
  timezone?: string;
  requested_lat?: number;
  requested_lon?: number;
  country?: string;
};

/**
 * Raw `current` forecast fields from WeatherAI.
 *
 * These names intentionally mirror WeatherAI's API response so the service can
 * deserialize provider data without lossy field renaming at the boundary.
 */
export type WeatherAiCurrentForecast = {
  time?: string;
  temperature?: number;
  wind_speed?: number;
  wind_direction?: number;
  condition_code?: string | number;
  humidity?: number;
  feels_like?: number;
  uv_index?: number;
  wind_gust?: number;
  icon?: string;
  icon_path?: string;
};

export type WeatherAiHourlyForecast = WeatherAiCurrentForecast & {
  precipitation_probability?: number;
};

/**
 * Raw `daily` forecast fields from WeatherAI.
 */
export type WeatherAiDailyForecast = {
  date?: string;
  temp_min?: number;
  temp_max?: number;
  precipitation_sum?: number;
  precipitation_probability?: number;
  wind_max?: number;
  condition_code?: string | number;
  sunrise?: string;
  sunset?: string;
  icon?: string;
  icon_path?: string;
};

/**
 * Raw WeatherAI `/v1/forecast` response used by the API client.
 */
export type WeatherAiForecastResponse = {
  location?: WeatherAiLocation;
  current?: WeatherAiCurrentForecast;
  hourly?: WeatherAiHourlyForecast[];
  daily?: WeatherAiDailyForecast[];
};

/**
 * Forecast payload after provider data has been translated for alert matching.
 */
export type NormalizedForecast = {
  location?: WeatherAiLocation;
  signals: ForecastAlertSignal[];
};
