# WeatherAI Alert Subscription Service

Backend assessment submission for WeatherAI. This project consumes WeatherAI forecast data, turns raw weather fields into actionable alert events, stores those events, and delivers or logs notifications for subscribed users.

The assessment brief asked for a simple implementation that integrates WeatherAI APIs and shows architectural approach, API consumption, and problem-solving velocity. I built this as a small NestJS backend because the interesting part of the problem is not only calling `/v1/forecast`; it is deciding how to use a limited API budget safely, how to avoid duplicate alerts, and how to keep the notification layer replaceable when SMS/USSD is not available on the free plan.

## What This App Does

1. A user subscribes an email address to a location and a list of alert types.
2. The app polls WeatherAI forecast data for active subscription locations.
3. The forecast response is normalized into a provider-neutral signal format.
4. The alert engine checks each signal against configurable thresholds.
5. The strongest alert per alert type is selected for the poll cycle.
6. Duplicate alerts are suppressed with fingerprints and cooldown windows.
7. Alerts are persisted in SQLite.
8. Email delivery is attempted when SMTP is enabled; otherwise the alert is logged for demo safety.

Supported alert types:

- `heavy_rain`
- `extreme_heat`
- `frost_warning`
- `storm_alert`
- `high_wind`

## Why This Architecture

WeatherAI's free plan has useful forecast access, but it does not include every production channel that a real last-mile alert product would use. The app is designed around those constraints instead of pretending they do not exist.

| Constraint | Decision |
|---|---|
| Free plan gives 1,000 API calls per month | Poll conservatively and cap demo subscriptions |
| SMS/USSD alerts are not available on the free plan | Use email through a swappable `NotificationService` boundary |
| WeatherAI platform webhooks are not available on the free plan | Own the polling and alert evaluation loop in this backend |
| AI insights and 14-day forecast are Pro+ features | Use `/v1/forecast` with `ai=false` and derive simple alert summaries locally |
| Polling can rediscover the same bad weather window | Store alert fingerprints and apply a cooldown before dispatch |

This keeps the demo honest: it uses the accessible WeatherAI API, respects quota, and still models the same backend workflow a production alert service would need.

## API Call Budget Math

The active plan budget assumed for this assessment is:

```text
1,000 WeatherAI calls / month
1,000 / 30 days = about 33 calls / day
```

This implementation makes one WeatherAI forecast call per subscribed location during each poll cycle.

| Poll interval | Calls per day per location | Calls per month per location | Notes |
|---|---:|---:|---|
| Every 2 hours | 12 | 360 | Works for 1 location, risky for a demo with manual testing |
| Every 6 hours | 4 | 120 | Default; leaves room for multiple locations and curl tests |
| Every 12 hours | 2 | 60 | Very conservative, less responsive |

Default settings:

```text
POLL_INTERVAL_MINUTES=360
MAX_DEMO_SUBSCRIPTIONS=3
```

Worst-case default scheduled usage:

```text
3 subscriptions * 4 calls/day * 30 days = 360 calls/month
```

That leaves roughly `640` calls/month for manual testing, failed retries, deployment checks, and reviewer exploration.

## Request Flow

```text
POST /api/subscriptions
  -> SubscriptionsService validates and stores the subscription

SchedulerService poll cycle
  -> loads active subscriptions
  -> WeatherService calls WeatherAI /v1/forecast with ai=false
  -> weather-normalizer converts raw forecast into alert signals
  -> AlertEvaluatorService checks thresholds and suppresses duplicates
  -> NotificationService sends email or logs the email payload
  -> WeatherAlert record is saved in SQLite

GET /api/alerts
  -> admin-only endpoint to inspect alert history
```

## File-by-File Walkthrough

### Application entry

| File | Purpose |
|---|---|
| `src/main.ts` | Boots NestJS, enables global validation, strips unknown request fields, transforms query/body values, and listens on `PORT` or `3000`. |
| `src/app.module.ts` | Wires the main modules together: config, database, subscriptions, alerts, weather, scheduler, and app health routes. |
| `src/app.controller.ts` | Lightweight root/health-style controller from the Nest app shell. |
| `src/app.service.ts` | Small app-level service used by the app controller. |

### Config and database

| File | Purpose |
|---|---|
| `src/config/app.config.ts` | Central typed config map for WeatherAI credentials, SQLite path, scheduler settings, alert thresholds, demo limits, and SMTP settings. |
| `src/config/env.validation.ts` | Joi schema that validates required environment variables. In `test`, fake keys are allowed; outside test, `ADMIN_API_KEY` and `WEATHER_AI_API_KEY` are required. |
| `src/config/config.module.ts` | Loads and exposes the application config module. |
| `src/config/index.ts` | Barrel export for config files. |
| `src/database/typeorm.config.ts` | Configures TypeORM with SQLite and registers `Subscription` and `WeatherAlert` entities. `synchronize` is disabled in production. |
| `src/database/index.ts` | Barrel export for database config. |

### WeatherAI integration

| File | Purpose |
|---|---|
| `src/weather/weather.controller.ts` | Exposes demo passthrough endpoints: `GET /api/weather/current` and `GET /api/weather/forecast`. |
| `src/weather/weather.service.ts` | Owns WeatherAI HTTP calls, bearer auth, base URL config, `ai=false`, and upstream error handling. |
| `src/weather/weather-normalizer.ts` | Converts WeatherAI `current`, `hourly`, and `daily` response fields into internal alert signals. |
| `src/weather/weather.types.ts` | TypeScript types for WeatherAI forecast responses and normalized forecast signals. |
| `src/weather/dto/weather-query.dto.ts` | Validates latitude, longitude, and optional forecast day count query params. |
| `src/weather/weather.module.ts` | Registers the weather controller/service and HTTP client. |
| `src/weather/index.ts` | Barrel export for weather module APIs. |
| `src/weather/*.spec.ts` | Unit tests for WeatherAI service behavior and normalization. |

WeatherAI calls use:

```http
Authorization: Bearer <WEATHER_AI_API_KEY>
```

The forecast request includes:

```text
ai=false
```

That is intentional. The alert summaries are generated locally so the demo does not consume AI insight quota.

### Subscriptions

| File | Purpose |
|---|---|
| `src/subscriptions/subscriptions.controller.ts` | Creates subscriptions, fetches one subscription, deletes a subscription, and exposes admin-only active subscription listing. |
| `src/subscriptions/subscriptions.service.ts` | Enforces demo subscription cap, normalizes alert aliases, prevents duplicate email/location subscriptions, and marks subscriptions as polled. |
| `src/subscriptions/subscription.entity.ts` | SQLite entity for subscriber email, location, alert preferences, channel, status, and last poll time. |
| `src/subscriptions/dto/create-subscription.dto.ts` | Validates subscription request body: email, location, and alert list. |
| `src/subscriptions/subscriptions.module.ts` | Registers subscription dependencies. |
| `src/subscriptions/index.ts` | Barrel export for subscription module APIs. |

The demo cap is configurable:

```text
MAX_DEMO_SUBSCRIPTIONS=3
```

This is not a product limitation. It is a quota safety control for the assessment deployment.

### Alerts

| File | Purpose |
|---|---|
| `src/alerts/alert-evaluator.service.ts` | Core rule engine. Checks normalized weather signals against thresholds, selects strongest matches, builds alert records, and suppresses duplicate/cooldown alerts. |
| `src/alerts/weather-alert.entity.ts` | SQLite entity for alert history, severity, forecast window, fingerprint, matched values, payload, and delivery status. |
| `src/alerts/alerts.controller.ts` | Admin-only alert history endpoint with optional `email` and `location` filters. |
| `src/alerts/webhook-simulation.controller.ts` | Demo endpoint that simulates a webhook-like evaluation for active subscriptions at a location. Useful because real WeatherAI webhooks are not available on the free plan. |
| `src/alerts/dto/alert-query.dto.ts` | Validates alert history filters. |
| `src/alerts/dto/simulate-webhook.dto.ts` | Validates simulated webhook coordinates. |
| `src/alerts/alerts.module.ts` | Registers alert controllers and alert evaluator dependencies. |
| `src/alerts/index.ts` | Barrel export for alert module APIs. |
| `src/alerts/*.spec.ts` | Unit tests for threshold matching and deduplication logic. |

Default thresholds:

| Alert type | Default trigger |
|---|---|
| Heavy rain | `precipitation_sum >= 25mm` or `precipitation_probability >= 80%` |
| Extreme heat | `temperature >= 35C` |
| Frost warning | `temperature <= 2C` |
| Storm alert | WeatherAI condition code in `95,96,99` |
| High wind | `wind_speed >= 40kph` or `wind_gust >= 60kph` |

Deduplication uses two layers:

1. Fingerprint: `subscription_id:alert_type:signal_source:forecast_window_start`
2. Cooldown: do not resend the same alert type for the same subscription within `ALERT_COOLDOWN_HOURS`

Default cooldown:

```text
ALERT_COOLDOWN_HOURS=12
```

### Scheduler

| File | Purpose |
|---|---|
| `src/scheduler/scheduler.service.ts` | Runs the polling loop when enabled, prevents overlapping poll cycles, evaluates each active subscription, dispatches/logs alerts, saves alert records, and marks subscriptions as polled. |
| `src/scheduler/scheduler.module.ts` | Registers Nest schedule support and scheduler dependencies. |
| `src/scheduler/index.ts` | Barrel export for scheduler module APIs. |
| `src/scheduler/scheduler.service.spec.ts` | Unit tests for scheduler behavior. |

The scheduler is off by default so a local reviewer can start the app without immediately spending WeatherAI quota.

```text
SCHEDULER_ENABLED=false
```

Set it to `true` only when you want automatic polling.

### Notifications

| File | Purpose |
|---|---|
| `src/notifications/notification.service.ts` | Builds alert email content, sends via SMTP when enabled, or logs the email payload when disabled. Updates delivery status on the alert entity. |
| `src/notifications/notifications.module.ts` | Registers notification service. |
| `src/notifications/index.ts` | Barrel export for notification module APIs. |
| `src/notifications/notification.service.spec.ts` | Unit tests for logged/sent/failed notification paths. |

Email delivery is off by default:

```text
EMAIL_DELIVERY_ENABLED=false
```

That means reviewers can trigger alerts without sending real emails. The alert is still persisted with `deliveryStatus=logged`.

### Admin guard

| File | Purpose |
|---|---|
| `src/common/admin-api-key.guard.ts` | Protects admin endpoints using either `x-admin-api-key` or `Authorization: Bearer <ADMIN_API_KEY>`. |

Admin-protected endpoints:

- `GET /api/subscriptions`
- `GET /api/alerts`

### Tests and project config

| File | Purpose |
|---|---|
| `package.json` | Scripts and dependencies for NestJS, TypeORM, SQLite, validation, scheduling, Axios, and Nodemailer. |
| `package-lock.json` | Locked dependency tree for reproducible installs. |
| `test/app.e2e-spec.ts` | End-to-end test entry point. |
| `test/jest-e2e.json` | Jest e2e config. |
| `eslint.config.mjs` | ESLint config. |
| `tsconfig.json` | TypeScript config. |
| `tsconfig.build.json` | Production build TypeScript config. |
| `nest-cli.json` | Nest CLI config. |

## Environment Variables

Required outside `NODE_ENV=test`:

| Variable | Example | Purpose |
|---|---|---|
| `ADMIN_API_KEY` | `change-me-admin-key` | Protects admin endpoints. |
| `WEATHER_AI_API_KEY` | `wai_live_xxx` | Bearer token for WeatherAI API calls. |

Common optional variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP server port. |
| `WEATHER_AI_BASE_URL` | `https://api.weather-ai.co` | WeatherAI API base URL. |
| `DATABASE_PATH` | `data/weather-ai.sqlite` | SQLite database file. |
| `SCHEDULER_ENABLED` | `false` | Enables automatic forecast polling. |
| `POLL_INTERVAL_MINUTES` | `360` | Poll interval. Minimum allowed value is `30`. |
| `MAX_DEMO_SUBSCRIPTIONS` | `3` | Demo cap to protect free-tier quota. |
| `ALERT_COOLDOWN_HOURS` | `12` | Suppresses repeated alerts of the same type. |
| `EMAIL_DELIVERY_ENABLED` | `false` | Sends real SMTP email when `true`; logs payload when `false`. |

Alert threshold variables:

| Variable | Default |
|---|---:|
| `HEAVY_RAIN_MM_THRESHOLD` | `25` |
| `RAIN_PROBABILITY_THRESHOLD` | `80` |
| `EXTREME_HEAT_C_THRESHOLD` | `35` |
| `FROST_C_THRESHOLD` | `2` |
| `HIGH_WIND_KPH_THRESHOLD` | `40` |
| `WIND_GUST_KPH_THRESHOLD` | `60` |
| `STORM_CONDITION_CODES` | `95,96,99` |

SMTP variables required only when `EMAIL_DELIVERY_ENABLED=true`:

| Variable | Example |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_SECURE` | `false` |
| `SMTP_USER` | `alerts@example.com` |
| `SMTP_PASS` | `app-password` |
| `SMTP_FROM` | `alerts@example.com` |

## Local Setup

Install dependencies:

```bash
npm install
```

Start with safe demo settings:

```bash
ADMIN_API_KEY=local-admin-key \
WEATHER_AI_API_KEY=your-weatherai-api-key \
SCHEDULER_ENABLED=false \
EMAIL_DELIVERY_ENABLED=false \
npm run start:dev
```

The API will be available at:

```text
http://localhost:3000
```

Run tests:

```bash
npm test
npm run test:e2e
```

Build:

```bash
npm run build
```

Run production build:

```bash
npm run start:prod
```

## Curl Examples

Set local shell variables:

```bash
BASE_URL=http://localhost:3000
ADMIN_API_KEY=local-admin-key
```

### Check current weather through WeatherAI

```bash
curl "$BASE_URL/api/weather/current?lat=-1.286&lon=36.817"
```

### Fetch forecast through WeatherAI

```bash
curl "$BASE_URL/api/weather/forecast?lat=-1.286&lon=36.817&days=3"
```

### Create a subscription

```bash
curl -X POST "$BASE_URL/api/subscriptions" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "reviewer@example.com",
    "location": {
      "label": "Nairobi CBD",
      "lat": -1.286,
      "lon": 36.817
    },
    "alerts": ["heavy_rain", "storm_alert", "high_wind"]
  }'
```

### Get one subscription

Replace `<subscription_id>` with the `id` returned from create.

```bash
curl "$BASE_URL/api/subscriptions/<subscription_id>"
```

### List active subscriptions as admin

```bash
curl "$BASE_URL/api/subscriptions" \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

Bearer auth also works:

```bash
curl "$BASE_URL/api/subscriptions" \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

### Simulate a webhook-style alert evaluation

This endpoint exists because real WeatherAI platform webhooks are not available on the free plan. It evaluates active subscriptions at the provided coordinates, persists matching alerts, and marks them as logged.

```bash
curl -X POST "$BASE_URL/api/webhook/simulate" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": -1.286,
    "lon": 36.817
  }'
```

### List alert history as admin

```bash
curl "$BASE_URL/api/alerts" \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

Filter by email:

```bash
curl "$BASE_URL/api/alerts?email=reviewer@example.com" \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

Filter by location:

```bash
curl "$BASE_URL/api/alerts?location=Nairobi" \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

### Delete a subscription

```bash
curl -X DELETE "$BASE_URL/api/subscriptions/<subscription_id>"
```

## Deployment Notes

For Render, Railway, Fly.io, or similar Node hosts:

1. Set the build command to:

```bash
npm install && npm run build
```

2. Set the start command to:

```bash
npm run start:prod
```

3. Add required environment variables:

```text
ADMIN_API_KEY=<strong random value>
WEATHER_AI_API_KEY=<WeatherAI key>
SCHEDULER_ENABLED=false
EMAIL_DELIVERY_ENABLED=false
```

4. For a live scheduled demo, enable:

```text
SCHEDULER_ENABLED=true
POLL_INTERVAL_MINUTES=360
MAX_DEMO_SUBSCRIPTIONS=3
```

5. If the platform filesystem is ephemeral, use a managed database for production. SQLite is fine for this assessment demo, but a deployed production service should use Postgres or another durable store.

## Production Improvements

If this were expanded beyond the assessment, the next steps would be:

- Replace SQLite with Postgres and migrations.
- Group subscriptions by coordinate so one WeatherAI call can serve many subscribers in the same location.
- Add retry/backoff for transient WeatherAI and SMTP failures.
- Add a queue for notification delivery.
- Add HMAC verification if WeatherAI platform webhooks become available.
- Add SMS/USSD delivery behind the existing notification boundary once the account has the required WeatherAI plan and approvals.
- Add a small admin dashboard for reviewing subscriptions, alert history, and quota usage.

## Summary

This project demonstrates a quota-aware WeatherAI integration with a realistic alerting workflow. The key design choice is that the app treats WeatherAI forecast data as an upstream signal, normalizes it, evaluates business rules locally, deduplicates noisy events, and keeps delivery transport replaceable.