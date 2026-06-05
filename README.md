# WeatherAI Alert Subscription Service

This project consumes WeatherAI forecast data, turns raw weather fields into actionable alert events, stores those events, and delivers or logs notifications for subscribed users.

The assessment brief asked for a simple implementation that integrates WeatherAI APIs and shows architectural approach, API consumption, and problem-solving velocity. I built the core as a small NestJS backend because the interesting part of the problem is not only calling `/v1/forecast`; it is deciding how to use a limited API budget safely, how to avoid duplicate alerts, and how to keep the notification layer replaceable when SMS/USSD is not available on the free plan.

I also included a lightweight client application for demo purposes. The client makes the use case easier to inspect: a farmer can save an email address, create subscriptions for multiple farms or plots, choose the alert types that matter for each location, manually trigger a poll for a subscription, and view alert history per farm. The UI is intentionally simple; it exists to make the backend workflow visible without requiring the reviewer to replay the whole journey through curl.

## Live Deployment

- Client: https://taofeeq-weather-ai.netlify.app/
- Backend API: https://weather-ai.taoforge.org

## What This App Does

1. A farmer subscribes an email address to one or more farm locations.
2. Each farm subscription can track its own alert types, such as heavy rain, frost, storm, heat, or wind.
3. The app polls WeatherAI forecast data for active subscription locations.
4. The forecast response is normalized into a provider-neutral signal format.
5. The alert engine checks each signal against configurable thresholds.
6. The strongest alert per alert type is selected for the poll cycle.
7. Duplicate alerts are suppressed with fingerprints and cooldown windows.
8. Alerts are persisted in SQLite and linked back to the subscription that triggered them.
9. Email delivery is attempted when SMTP is enabled; otherwise the alert is logged for demo safety.

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

## Client Application

The `client/` folder contains a small static demo app. It is not required for the backend to run, but it helps show the product experience around the API:

- Save the farmer's email address for lookup.
- Create separate weather alert subscriptions for different farms or plots.
- Choose relevant alert types per farm.
- Preview current/forecast weather for a coordinate.
- Trigger a manual poll for one subscription during the demo.
- View alert history tied to the selected subscription.

This keeps the UI useful without turning the assessment into a frontend-heavy project. The backend remains the source of truth; the client simply makes the subscription and alert workflow visible.

For local demos, start the API and open `client/index.html` in a browser. The client defaults to `http://localhost:3000` locally and to the deployed backend when served from the Netlify demo host. The API base URL can also be edited inside the UI.

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
| `DATABASE_PATH` | Environment-specific | SQLite database file. Defaults to `data/weather-ai.development.sqlite`, `data/weather-ai.test.sqlite`, or `data/weather-ai.production.sqlite` based on `NODE_ENV`. |
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

Tests use a separate SQLite file:

```text
data/weather-ai.test.sqlite
```

Build:

```bash
npm run build
```

Run production build:

```bash
npm run start:prod
```

By default, each runtime environment uses a separate SQLite file:

| Environment | Default SQLite path |
|---|---|
| `development` | `data/weather-ai.development.sqlite` |
| `test` | `data/weather-ai.test.sqlite` |
| `production` | `data/weather-ai.production.sqlite` |

You can override this with `DATABASE_PATH` when needed.

## Curl Examples

Set local shell variables:

```bash
BASE_URL=http://localhost:3000
ADMIN_API_KEY=local-admin-key
```

For the deployed backend, use:

```bash
BASE_URL=https://weather-ai.taoforge.org
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

### Manually poll one subscription

Replace `<subscription_id>` with the `id` returned from create. This triggers the same alert evaluation and notification/logging flow used by the scheduler.

```bash
curl -X POST "$BASE_URL/api/subscriptions/<subscription_id>/poll"
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

### Docker

Build the production image:

```bash
docker build -t weather-ai-assessment-backend .
```

Run it with a durable SQLite mount:

```bash
docker run --rm \
  -p 3000:3000 \
  -v weather_ai_data:/app/data \
  -e ADMIN_API_KEY=change-me-admin-key \
  -e WEATHER_AI_API_KEY=your-weatherai-api-key \
  -e SCHEDULER_ENABLED=false \
  -e EMAIL_DELIVERY_ENABLED=false \
  weather-ai-assessment-backend
```

Or use Docker Compose:

```bash
ADMIN_API_KEY=change-me-admin-key \
WEATHER_AI_API_KEY=your-weatherai-api-key \
docker compose up --build
```

The container stores production SQLite data at:

```text
/app/data/weather-ai.production.sqlite
```

The `docker-compose.yml` file mounts `/app/data` to a named volume so data survives container restarts. In `NODE_ENV=production`, TypeORM runs the initial schema migration and keeps `synchronize` disabled.

### Node hosts

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
DATABASE_PATH=data/weather-ai.production.sqlite
SCHEDULER_ENABLED=false
EMAIL_DELIVERY_ENABLED=false
```

4. For a live scheduled demo, enable:

```text
SCHEDULER_ENABLED=true
POLL_INTERVAL_MINUTES=360
MAX_DEMO_SUBSCRIPTIONS=3
```

5. If the platform filesystem is ephemeral, mount a persistent disk or use a managed database. SQLite is fine for this assessment demo, but a deployed production service should use Postgres or another durable store.

## Production Improvements

If this were expanded beyond the assessment, the next steps would be:

- Replace SQLite with Postgres and a fuller migration workflow.
- Group subscriptions by coordinate so one WeatherAI call can serve many subscribers in the same location.
- Add retry/backoff for transient WeatherAI and SMTP failures.
- Add a queue for notification delivery.
- Add SMS/USSD delivery behind the existing notification boundary once the account has the required WeatherAI plan and approvals.
- Add a small admin dashboard for reviewing subscriptions, alert history, and quota usage.

## Summary

This project demonstrates a quota-aware WeatherAI integration with a realistic alerting workflow. The key design choice is that the app treats WeatherAI forecast data as an upstream signal, normalizes it, evaluates business rules locally, deduplicates noisy events, and keeps delivery transport replaceable.
