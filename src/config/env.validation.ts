import * as Joi from 'joi';
import { getDefaultDatabasePath } from './database-path';

const requiredOutsideTest = Joi.when('NODE_ENV', {
  is: 'test',
  then: Joi.string().optional().default('test-key'),
  otherwise: Joi.string().required(),
});

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  ADMIN_API_KEY: requiredOutsideTest,
  WEATHER_AI_API_KEY: requiredOutsideTest,
  WEATHER_AI_BASE_URL: Joi.string().uri().default('https://api.weather-ai.co'),

  DATABASE_PATH: Joi.string().default((parent: { NODE_ENV?: string }) =>
    getDefaultDatabasePath(parent.NODE_ENV),
  ),

  SCHEDULER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  POLL_INTERVAL_MINUTES: Joi.number().integer().min(30).default(360),

  ALERT_COOLDOWN_HOURS: Joi.number().integer().min(1).default(12),
  MAX_DEMO_SUBSCRIPTIONS: Joi.number().integer().min(1).default(3),
  HEAVY_RAIN_MM_THRESHOLD: Joi.number().min(1).default(25),
  RAIN_PROBABILITY_THRESHOLD: Joi.number().min(1).max(100).default(80),
  EXTREME_HEAT_C_THRESHOLD: Joi.number().default(35),
  FROST_C_THRESHOLD: Joi.number().default(2),
  HIGH_WIND_KPH_THRESHOLD: Joi.number().min(1).default(40),
  WIND_GUST_KPH_THRESHOLD: Joi.number().min(1).default(60),
  STORM_CONDITION_CODES: Joi.string()
    .pattern(/^\d+(,\d+)*$/)
    .default('95,96,99'),

  EMAIL_DELIVERY_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  SMTP_HOST: Joi.when('EMAIL_DELIVERY_ENABLED', {
    is: true,
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.when('EMAIL_DELIVERY_ENABLED', {
    is: true,
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }),
  SMTP_PASS: Joi.when('EMAIL_DELIVERY_ENABLED', {
    is: true,
    then: Joi.string().required(),
    otherwise: Joi.string().optional(),
  }),
  SMTP_FROM: Joi.when('EMAIL_DELIVERY_ENABLED', {
    is: true,
    then: Joi.string().email().required(),
    otherwise: Joi.string().email().optional(),
  }),
});
