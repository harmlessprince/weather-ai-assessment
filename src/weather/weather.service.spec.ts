import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { WeatherService } from './weather.service';

describe('WeatherService', () => {
  const config = {
    weatherAi: {
      baseUrl: 'https://api.weather-ai.co',
      apiKey: 'wai_test_key',
    },
  };

  const createService = (httpService: Partial<HttpService>, overrides = {}) =>
    new WeatherService(
      httpService as HttpService,
      {
        ...config,
        ...overrides,
      } as never,
    );

  it('calls WeatherAI forecast endpoint with bearer auth and ai disabled', async () => {
    const httpService = {
      get: jest.fn().mockReturnValue(
        of({
          data: {
            current: {
              time: '2026-06-05T12:00',
              temperature: 24.3,
            },
          },
        }),
      ),
    };
    const service = createService(httpService);

    await expect(
      service.getForecast({ lat: -1.286, lon: 36.817, days: 3 }),
    ).resolves.toEqual({
      current: {
        time: '2026-06-05T12:00',
        temperature: 24.3,
      },
    });

    expect(httpService.get).toHaveBeenCalledWith('/v1/forecast', {
      baseURL: 'https://api.weather-ai.co',
      headers: {
        Authorization: 'Bearer wai_test_key',
      },
      params: {
        lat: -1.286,
        lon: 36.817,
        days: 3,
        ai: false,
      },
    });
  });

  it('normalizes forecast responses into alert signals', async () => {
    const service = createService({
      get: jest.fn().mockReturnValue(
        of({
          data: {
            hourly: [
              {
                time: '2026-06-05T13:00',
                temperature: 25.1,
                precipitation_probability: 6,
              },
            ],
          },
        }),
      ),
    });

    await expect(
      service.getForecastSignals({ lat: -1.286, lon: 36.817 }),
    ).resolves.toEqual({
      location: undefined,
      signals: [
        {
          source: 'hourly',
          windowStart: '2026-06-05T13:00',
          temperatureC: 25.1,
          precipitationProbability: 6,
          windSpeedKph: undefined,
          windGustKph: undefined,
          conditionCode: undefined,
        },
      ],
    });
  });

  it('fails fast when the WeatherAI API key is missing', async () => {
    const service = createService(
      { get: jest.fn() },
      {
        weatherAi: {
          baseUrl: 'https://api.weather-ai.co',
          apiKey: undefined,
        },
      },
    );

    await expect(
      service.getForecast({ lat: -1.286, lon: 36.817 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('wraps upstream failures in a gateway exception', async () => {
    const service = createService({
      get: jest.fn().mockReturnValue(throwError(() => new Error('timeout'))),
    });

    await expect(
      service.getForecast({ lat: -1.286, lon: 36.817 }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
