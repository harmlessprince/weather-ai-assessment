# WeatherAI Alert Subscription Service Architecture

## System Context

```mermaid
flowchart LR
  farmer[Farmer / Demo User]
  admin[Admin Reviewer]
  client[Static Demo Client<br/>client/index.html + index.js]
  api[NestJS API<br/>AppModule]
  weatherai[WeatherAI API<br/>/v1/weather + /v1/forecast]
  smtp[SMTP Provider<br/>optional email delivery]
  sqlite[(SQLite Database<br/>subscriptions + weather_alerts)]
  docker[Docker Runtime<br/>Node 22 + /app/data volume]

  farmer -->|uses browser UI| client
  client -->|REST requests| api
  admin -->|x-admin-api-key| api
  api -->|bearer token requests| weatherai
  api -->|TypeORM repositories| sqlite
  api -->|Nodemailer when enabled| smtp
  docker -. hosts .-> api
  docker -. persists .-> sqlite
```

## Application Components

```mermaid
flowchart TB
  subgraph entry["HTTP Entry Points"]
    weatherController[WeatherController<br/>GET /api/weather/current<br/>GET /api/weather/forecast]
    subscriptionsController[SubscriptionsController<br/>POST /api/subscriptions<br/>POST /api/subscriptions/by-email<br/>GET /api/subscriptions/:id/alerts]
    alertsController[AlertsController<br/>GET /api/alerts]
    manualPollingController[ManualPollingController<br/>POST /api/subscriptions/:id/poll]
    health[AppController<br/>GET /health]
  end

  subgraph core["NestJS Modules and Services"]
    config[AppConfigModule<br/>Joi env validation]
    weather[WeatherModule<br/>WeatherService]
    normalizer[Weather normalizer<br/>provider response to alert signals]
    subscriptions[SubscriptionsModule<br/>SubscriptionsService]
    alerts[AlertsModule<br/>AlertEvaluatorService]
    scheduler[SchedulerModule<br/>SchedulerService]
    notifications[NotificationsModule<br/>NotificationService]
    guard[AdminApiKeyGuard]
  end

  subgraph persistence["Persistence"]
    subEntity[Subscription entity]
    alertEntity[WeatherAlert entity]
    db[(SQLite via TypeORM)]
  end

  subgraph external["External Systems"]
    weatherai[WeatherAI API]
    smtp[SMTP server or log-only delivery]
  end

  weatherController --> weather
  subscriptionsController --> subscriptions
  alertsController --> guard
  alertsController --> alertEntity
  manualPollingController --> scheduler
  scheduler --> subscriptions
  scheduler --> weather
  scheduler --> alerts
  scheduler --> notifications
  weather --> weatherai
  weather --> normalizer
  alerts --> alertEntity
  subscriptions --> subEntity
  subscriptions --> alertEntity
  notifications --> smtp
  subEntity --> db
  alertEntity --> db
  config --> weather
  config --> subscriptions
  config --> alerts
  config --> scheduler
  config --> notifications
```

## Alert Polling Flow

```mermaid
sequenceDiagram
  participant User as Farmer / Demo Client
  participant Poll as ManualPollingController or SchedulerService
  participant Subs as SubscriptionsService
  participant Weather as WeatherService
  participant WAI as WeatherAI API
  participant Eval as AlertEvaluatorService
  participant Notify as NotificationService
  participant DB as SQLite / TypeORM

  User->>Poll: POST /api/subscriptions/:id/poll
  Poll->>Subs: findOne(subscriptionId)
  Subs->>DB: read subscription
  DB-->>Subs: active subscription
  Poll->>Weather: getForecastSignals(lat, lon, ai=false)
  Weather->>WAI: GET /v1/forecast
  WAI-->>Weather: raw forecast
  Weather-->>Poll: normalized forecast signals
  Poll->>Eval: evaluateNewAlerts(subscription, forecast)
  Eval->>DB: check fingerprint and cooldown history
  DB-->>Eval: existing matching alerts, if any
  Eval-->>Poll: new alerts + suppressed alerts

  loop for each new alert
    Poll->>Notify: dispatchAlert(alert, subscription)
    alt EMAIL_DELIVERY_ENABLED=true
      Notify-->>Poll: sent or failed status
    else log-only demo mode
      Notify-->>Poll: logged status
    end
    Poll->>Eval: saveAlert(alert)
    Eval->>DB: insert weather_alerts row
  end

  Poll->>Subs: markPolled(subscription)
  Subs->>DB: update last_polled_at
  Poll-->>User: alerts, suppressed alerts, counts
```

## Data Model

```mermaid
erDiagram
  subscriptions ||--o{ weather_alerts : produces

  subscriptions {
    uuid id PK
    varchar email
    varchar location_label
    varchar location_timezone
    varchar location_country
    real latitude
    real longitude
    json alertTypes
    varchar notificationChannel
    varchar status
    datetime last_polled_at
    datetime created_at
    datetime updated_at
  }

  weather_alerts {
    uuid id PK
    varchar subscription_id FK
    varchar alert_type
    varchar severity
    varchar location_label
    real latitude
    real longitude
    varchar signal_source
    datetime forecast_window_start
    datetime triggered_at
    varchar fingerprint
    text summary
    real matched_value
    real threshold_value
    json payload
    varchar delivery_status
    datetime delivery_attempted_at
    datetime delivered_at
    text delivery_error
    datetime created_at
  }
```

## Notes

- `WeatherService` owns WeatherAI authentication, base URL configuration, and upstream error mapping.
- Forecast polling uses `ai=false` because the alert engine only needs numeric/provider-neutral signals.
- `AlertEvaluatorService` keeps alert thresholds, strongest-match selection, fingerprint deduplication, and cooldown suppression behind one service boundary.
- `NotificationService` is the delivery boundary. It sends through SMTP when enabled and logs the notification payload in demo mode.
- SQLite is created through TypeORM and persists in `data/` locally or `/app/data` in Docker.
