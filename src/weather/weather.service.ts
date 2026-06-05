import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import appConfig from '../config/app.config';
import { normalizeWeatherAiForecast } from './weather-normalizer';
import { NormalizedForecast, WeatherAiForecastResponse } from './weather.types';

/**
 * Coordinates used when requesting a WeatherAI forecast.
 *
 * The optional day count lets callers control forecast depth while the service
 * keeps API key handling, quota-conscious flags, and error mapping centralized.
 */
export type GetForecastParams = {
  lat: number;
  lon: number;
  days?: number;
};

export type GetCurrentWeatherParams = {
  lat: number;
  lon: number;
};

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(
    private readonly httpService: HttpService,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  /**
   * Fetches the raw forecast from WeatherAI's `/v1/forecast` endpoint.
   *
   * This method owns the external API contract: bearer authentication, base URL
   * configuration, the `ai=false` safeguard for free-tier quota, and conversion
   * of upstream failures into application-level HTTP exceptions.
   */
  async getForecast(
    params: GetForecastParams,
  ): Promise<WeatherAiForecastResponse> {
    return this.getWeatherAi<WeatherAiForecastResponse>('/v1/forecast', {
      lat: params.lat,
      lon: params.lon,
      days: params.days,
      ai: false,
    });
  }

  /**
   * Fetches current conditions from WeatherAI's `/v1/weather` endpoint.
   */
  async getCurrentWeather(
    params: GetCurrentWeatherParams,
  ): Promise<Record<string, unknown>> {
    return this.getWeatherAi<Record<string, unknown>>('/v1/weather', {
      lat: params.lat,
      lon: params.lon,
      ai: false,
    });
  }

  private async getWeatherAi<T>(
    path: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const apiKey = this.config.weatherAi.apiKey;

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'WeatherAI API key is not configured',
      );
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(path, {
          baseURL: this.config.weatherAi.baseUrl,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          params,
        }),
      );

      return response.data;
    } catch (error) {
      console.error(error);
      this.logger.warn(
        `WeatherAI request failed: ${this.describeHttpError(error)}`,
      );

      throw new BadGatewayException('Unable to fetch weather from WeatherAI');
    }
  }

  /**
   * Fetches a forecast and returns normalized alert signals.
   *
   * Alert evaluation should use this method instead of the raw forecast method
   * so rule logic stays independent from WeatherAI-specific field names.
   */
  async getForecastSignals(
    params: GetForecastParams,
  ): Promise<NormalizedForecast> {
    const forecast = await this.getForecast(params);

    return normalizeWeatherAiForecast(forecast);
  }

  /**
   * Produces a safe, compact log message for WeatherAI request failures.
   *
   * We log status or message details for debugging without exposing API keys or
   * dumping full provider responses into application logs.
   */
  private describeHttpError(error: unknown): string {
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      return `status=${axiosError.response.status}`;
    }

    if (axiosError.message) {
      return axiosError.message;
    }

    return 'unknown error';
  }
}
