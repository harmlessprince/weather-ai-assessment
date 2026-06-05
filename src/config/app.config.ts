import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  adminApiKey: process.env.ADMIN_API_KEY,
  weatherAi: {
    baseUrl: process.env.WEATHER_AI_BASE_URL ?? 'https://api.weather-ai.co',
    apiKey: process.env.WEATHER_AI_API_KEY,
  },
  database: {
    path: process.env.DATABASE_PATH ?? 'data/weather-ai.sqlite',
  },
  scheduler: {
    enabled: process.env.SCHEDULER_ENABLED === 'true',
    pollIntervalMinutes: Number(process.env.POLL_INTERVAL_MINUTES ?? 360),
  },
  alerts: {
    cooldownHours: Number(process.env.ALERT_COOLDOWN_HOURS ?? 12),
    maxDemoSubscriptions: Number(process.env.MAX_DEMO_SUBSCRIPTIONS ?? 3),
  },
  email: {
    deliveryEnabled: process.env.EMAIL_DELIVERY_ENABLED === 'true',
    from: process.env.SMTP_FROM,
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
}));
