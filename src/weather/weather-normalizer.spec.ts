import { normalizeWeatherAiForecast } from './weather-normalizer';
import { WeatherAiForecastResponse } from './weather.types';

describe('normalizeWeatherAiForecast', () => {
  it('maps current, hourly, and daily WeatherAI data into alert signals', () => {
    const forecast: WeatherAiForecastResponse = {
      location: {
        lat: 6.602458,
        lon: 3.31916,
        timezone: 'Africa/Lagos',
        country: 'NG',
      },
      current: {
        time: '2026-06-05T12:00',
        temperature: 24.3,
        wind_speed: 6.8,
        wind_gust: 24.5,
        condition_code: 2,
      },
      hourly: [
        {
          time: '2026-06-05T13:00',
          temperature: 25.1,
          precipitation_probability: 6,
          wind_speed: 8.7,
          wind_gust: 24.5,
          condition_code: '2',
        },
      ],
      daily: [
        {
          date: '2026-06-05',
          temp_min: 13.3,
          temp_max: 25.9,
          precipitation_sum: 8.2,
          precipitation_probability: 45,
          wind_max: 10.9,
          condition_code: '51',
        },
      ],
    };

    expect(normalizeWeatherAiForecast(forecast)).toEqual({
      location: forecast.location,
      signals: [
        {
          source: 'current',
          windowStart: '2026-06-05T12:00',
          temperatureC: 24.3,
          windSpeedKph: 6.8,
          windGustKph: 24.5,
          conditionCode: '2',
        },
        {
          source: 'hourly',
          windowStart: '2026-06-05T13:00',
          temperatureC: 25.1,
          precipitationProbability: 6,
          windSpeedKph: 8.7,
          windGustKph: 24.5,
          conditionCode: '2',
        },
        {
          source: 'daily',
          windowStart: '2026-06-05',
          tempMinC: 13.3,
          tempMaxC: 25.9,
          precipitationMm: 8.2,
          precipitationProbability: 45,
          windSpeedKph: 10.9,
          conditionCode: '51',
        },
      ],
    });
  });

  it('skips forecast windows that do not have a timestamp', () => {
    const normalized = normalizeWeatherAiForecast({
      current: { temperature: 18 },
      hourly: [{ temperature: 19 }],
      daily: [{ temp_max: 27 }],
    });

    expect(normalized.signals).toEqual([]);
  });
});
