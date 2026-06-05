# WeatherAI Backend Engineer — Application Handover

## Context

**Candidate:** Taofeeq Adewuyi
**Role:** Backend Engineer at WeatherAI (weather-ai.co)  
**Application email:** hello@weather-ai.co  
**Current stage:** Technical assignment (48-hour deadline from receipt of assignment email)

---

## About WeatherAI

- Weather intelligence platform focused on last-mile delivery via SMS/USSD to feature phones across Africa
- Core tech: AI-enriched forecasts, SMPP gateway (direct carrier connections), DLR webhook pipeline, developer dashboard
- Stack inferred: Node.js/TypeScript, REST APIs, webhook systems
- Docs: https://weather-ai.co/docs

---

## Candidate Profile

- 5 years backend engineering experience
- Core stack: Java/Spring Boot, Node.js/TypeScript, Python, AWS
- Background: fintech (Altara Credit, Cavidel), public sector (FMCIDE / 3MTT programme as Team Lead)
- Strengths relevant to role: REST API design, async job processing, webhook systems, payment event pipelines, multi-tenant SaaS architecture

---

## Cover Email (Sent)

**Subject:** Backend Engineer Application — Taofeeq Adewuyi
**To:** hello@weather-ai.co

Key angles used:
- Named their actual tech (SMPP, DLR webhooks, USSD) to signal deep reading
- Framed fintech experience around reliability patterns they need
- Mentioned interest in designing agent-friendly forecast/alert endpoints
- Attached CV

---

## Assignment Details

From Claire L. Montgomery (Technical Project Manager, Weather-AI):

> Build a simple application or implementation of your choice that integrates any of WeatherAI's APIs from their developer platform. Demonstrate how you consume their data and translate it into a clean, functional project.

**Submission requirements:**
1. Public GitHub repo with clean `README.md` and setup instructions
2. Live deployment link (Render, Railway, Firebase, Netlify, etc.)

---

## Plan Constraints & Architectural Decisions

### Project Concept

Build a **WeatherAI alert subscription service**:
- Users subscribe an email address and location to specific weather alert types.
- The backend polls WeatherAI forecast data on a quota-aware schedule.
- The alert engine evaluates configured thresholds.
- Matching alerts are persisted, deduplicated, and sent via SMTP email.
- Admin/demo endpoints expose alert history and subscription state behind `ADMIN_API_KEY`.

The main assessment story should be: **consume WeatherAI forecast data, translate it into actionable alert events, and deliver those alerts through a clean backend workflow.**

### Active Plan: Free (KES 0/mo)

| Limit | Value |
|---|---|
| API calls | 1,000 / month |
| SMS/USSD alerts | ❌ Not available (Scale plan only, approval required) |
| Webhooks & alerts | ❌ Not available (Pro plan only) |
| AI-powered insights (`/v1/insights`) | ❌ Pro+ only |
| 14-day forecast (`/v1/forecast14`) | ❌ Pro+ only |
| IP lookup (`/v1/ip-lookup`) | ❌ Pro+ only |

### How Constraints Shape Architecture

**1. No outbound SMS/USSD**  
WeatherAI's SMS delivery sits behind the Scale plan (KES 2,340/mo) and requires carrier approval. We cannot call any SMS dispatch endpoint.  
→ **Decision:** Replace with email delivery via Nodemailer + SMTP. The alert dispatch layer is abstracted behind a `NotificationService` interface so the transport is swappable — in production you'd plug in the WeatherAI SMS endpoint with no logic changes.

**2. No platform webhooks**  
WeatherAI's webhook system (configure endpoint URL + receive POST on alert condition) is a Pro feature. We cannot register a webhook URL on their dashboard and receive pushes.  
→ **Decision:** Implement a **polling scheduler** instead. A cron job runs on a conservative interval, calls WeatherAI's forecast endpoint per subscribed location, evaluates thresholds in-process, and fires alerts directly. This is architecturally equivalent — we own the detection loop rather than delegating it to their platform.

**3. No AI insights endpoint**  
AI-enriched summaries are not required for this assignment and may consume additional AI quota.
→ **Decision:** Do not rely on AI insights. Add `ai=false` to WeatherAI API calls wherever supported. If a summary field is desired in alert payloads, generate a simple template string from raw forecast fields (e.g. "Heavy rain expected — 82mm over 6 hours").

**4. API call budget**  
1,000 calls/month ÷ 30 days = ~33 calls/day budget. At one WeatherAI API call per subscribed location:
- Every 2 hours = 12 calls/day/location ≈ 360 calls/month/location
- Every 6 hours = 4 calls/day/location ≈ 120 calls/month/location
- Every 12 hours = 2 calls/day/location ≈ 60 calls/month/location

→ **Decision:** Default to polling every **6 hours** for the live bare-metal demo. This leaves room for manual testing and multiple sample subscriptions while staying within the free-tier budget.
→ **Safeguard:** Cap subscriptions at 3 locations in the demo. Add a `POLL_INTERVAL_MINUTES` env var (default: 360) so it's configurable. Document the call math clearly in the README.

**5. Alert deduplication**
Polling can rediscover the same forecast condition multiple times. Re-sending the same email every poll would create noise and make the system look immature.
→ **Decision:** Add an alert cooldown. Do not send the same alert type for the same subscription/location again within `ALERT_COOLDOWN_HOURS` (default: 12).
→ **Implementation detail:** Store alert records in SQLite with enough fields to query duplicates, e.g. `subscription_id`, `alert_type`, `location_label`, `triggered_at`, `forecast_window`, and `fingerprint`.

**6. Demo safety controls**
The project needs to be easy to test without accidentally burning API quota or sending real emails.
→ **Decision:** Add runtime switches:
- `SCHEDULER_ENABLED=true|false`
- `EMAIL_DELIVERY_ENABLED=true|false`

When email delivery is disabled, persist the alert and log the email payload instead of sending.

---

## WeatherAI APIs to Call

Base URL: `https://api.weather-ai.co` (confirm from docs)  
Auth: `Authorization: Bearer <WEATHER_AI_API_KEY>` header on all requests

Important: pass `ai=false` where supported so the demo does not consume AI summary quota unnecessarily.

### 1. `GET /v1/forecast`
**Purpose:** Check upcoming forecast periods for threshold conditions — rain probability, max temp, storm risk, wind

**When called:** Every poll cycle, per subscribed location  
**Key query params:**

| Param | Type | Required | Notes |
|---|---|---|---|
| `lat` | float | ✅ | Latitude of location |
| `lon` | float | ✅ | Longitude of location |
| `days` | int | optional | Number of forecast days |
| `ai` | boolean | optional | Use `false` to avoid AI quota use |

**Used for:** Heavy Rain, Extreme Heat, Frost Warning, Storm Alert, High Wind Speed detection

Sample Response

```json
{
  "location": {
    "lat": -1.3005272,
    "lon": 36.824646,
    "timezone": "Africa/Nairobi",
    "requested_lat": -1.286,
    "requested_lon": 36.817,
    "country": "KE"
  },
  "current": {
    "time": "2026-06-05T12:00",
    "temperature": 24.3,
    "wind_speed": 6.8,
    "wind_direction": 88,
    "condition_code": "2",
    "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
    "humidity": 48,
    "feels_like": 25.8,
    "uv_index": 8.05,
    "wind_gust": 24.5,
    "icon_path": "icons/weather/png/wmo-2-day-128.png"
  },
  "hourly": [
    {
      "time": "2026-06-05T00:00",
      "temperature": 16.6,
      "precipitation_probability": 0,
      "wind_speed": 3.8,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_night.svg",
      "humidity": 83,
      "feels_like": 17.2,
      "wind_gust": 7.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-0-night-128.png"
    },
    {
      "time": "2026-06-05T01:00",
      "temperature": 15.9,
      "precipitation_probability": 0,
      "wind_speed": 2,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_night.svg",
      "humidity": 84,
      "feels_like": 16.6,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-0-night-128.png"
    },
    {
      "time": "2026-06-05T02:00",
      "temperature": 15.2,
      "precipitation_probability": 0,
      "wind_speed": 1.5,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_night.svg",
      "humidity": 86,
      "feels_like": 15.9,
      "wind_gust": 7.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-0-night-128.png"
    },
    {
      "time": "2026-06-05T03:00",
      "temperature": 14.8,
      "precipitation_probability": 0,
      "wind_speed": 2.4,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 85,
      "feels_like": 15.2,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-05T04:00",
      "temperature": 14.2,
      "precipitation_probability": 0,
      "wind_speed": 4.3,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 87,
      "feels_like": 14.2,
      "wind_gust": 7.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-05T05:00",
      "temperature": 13.5,
      "precipitation_probability": 0,
      "wind_speed": 4.2,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 89,
      "feels_like": 13.4,
      "wind_gust": 4.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-05T06:00",
      "temperature": 13.3,
      "precipitation_probability": 0,
      "wind_speed": 1.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 89,
      "feels_like": 13.4,
      "wind_gust": 7.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-05T07:00",
      "temperature": 13.5,
      "precipitation_probability": 0,
      "wind_speed": 2.9,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 88,
      "feels_like": 13.6,
      "wind_gust": 10.1,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-05T08:00",
      "temperature": 16.1,
      "precipitation_probability": 0,
      "wind_speed": 3.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 79,
      "feels_like": 16.3,
      "wind_gust": 11.5,
      "uv_index": 0.95,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-05T09:00",
      "temperature": 18.1,
      "precipitation_probability": 0,
      "wind_speed": 2.1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 72,
      "feels_like": 18.7,
      "wind_gust": 10.4,
      "uv_index": 2.8,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-05T10:00",
      "temperature": 19.8,
      "precipitation_probability": 2,
      "wind_speed": 3.1,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 67,
      "feels_like": 21,
      "wind_gust": 14.8,
      "uv_index": 4.8,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-05T11:00",
      "temperature": 22.4,
      "precipitation_probability": 4,
      "wind_speed": 5.7,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 55,
      "feels_like": 23.9,
      "wind_gust": 21.6,
      "uv_index": 6.75,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-05T12:00",
      "temperature": 24.3,
      "precipitation_probability": 6,
      "wind_speed": 6.8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 48,
      "feels_like": 25.8,
      "wind_gust": 24.5,
      "uv_index": 8.05,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-05T13:00",
      "temperature": 25.1,
      "precipitation_probability": 6,
      "wind_speed": 8.7,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 43,
      "feels_like": 26.1,
      "wind_gust": 24.5,
      "uv_index": 8.45,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-05T14:00",
      "temperature": 25.9,
      "precipitation_probability": 5,
      "wind_speed": 8.2,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 40,
      "feels_like": 26.6,
      "wind_gust": 24.8,
      "uv_index": 7.55,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-05T15:00",
      "temperature": 25.3,
      "precipitation_probability": 6,
      "wind_speed": 9.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 41,
      "feels_like": 25.1,
      "wind_gust": 28.1,
      "uv_index": 6.65,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-05T16:00",
      "temperature": 24.9,
      "precipitation_probability": 11,
      "wind_speed": 9.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 43,
      "feels_like": 24,
      "wind_gust": 28.4,
      "uv_index": 5,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-05T17:00",
      "temperature": 23.7,
      "precipitation_probability": 17,
      "wind_speed": 10.7,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "humidity": 48,
      "feels_like": 22.8,
      "wind_gust": 29.5,
      "uv_index": 1.7,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "time": "2026-06-05T18:00",
      "temperature": 22.2,
      "precipitation_probability": 20,
      "wind_speed": 10.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 56,
      "feels_like": 21.6,
      "wind_gust": 29.5,
      "uv_index": 0.6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-05T19:00",
      "temperature": 20.5,
      "precipitation_probability": 14,
      "wind_speed": 8.1,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 63,
      "feels_like": 20.3,
      "wind_gust": 25.2,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-05T20:00",
      "temperature": 19,
      "precipitation_probability": 5,
      "wind_speed": 9.2,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 76,
      "feels_like": 19.1,
      "wind_gust": 19.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-05T21:00",
      "temperature": 18.2,
      "precipitation_probability": 0,
      "wind_speed": 9.4,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 79,
      "feels_like": 18.3,
      "wind_gust": 20.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-05T22:00",
      "temperature": 17.7,
      "precipitation_probability": 5,
      "wind_speed": 5.6,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 79,
      "feels_like": 18.2,
      "wind_gust": 20.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-05T23:00",
      "temperature": 17.8,
      "precipitation_probability": 15,
      "wind_speed": 7.9,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 80,
      "feels_like": 18,
      "wind_gust": 19.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-06T00:00",
      "temperature": 17.2,
      "precipitation_probability": 24,
      "wind_speed": 5.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 84,
      "feels_like": 17.8,
      "wind_gust": 15.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-06T01:00",
      "temperature": 16.6,
      "precipitation_probability": 33,
      "wind_speed": 2.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 90,
      "feels_like": 17.8,
      "wind_gust": 11.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T02:00",
      "temperature": 16.8,
      "precipitation_probability": 42,
      "wind_speed": 0.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 90,
      "feels_like": 18.5,
      "wind_gust": 10.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T03:00",
      "temperature": 16.8,
      "precipitation_probability": 45,
      "wind_speed": 1.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 91,
      "feels_like": 18.3,
      "wind_gust": 11.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T04:00",
      "temperature": 16.7,
      "precipitation_probability": 37,
      "wind_speed": 2.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 18.2,
      "wind_gust": 11.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T05:00",
      "temperature": 16.6,
      "precipitation_probability": 23,
      "wind_speed": 1.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 94,
      "feels_like": 18.2,
      "wind_gust": 8.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T06:00",
      "temperature": 16.3,
      "precipitation_probability": 12,
      "wind_speed": 0,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 94,
      "feels_like": 18,
      "wind_gust": 9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T07:00",
      "temperature": 16.1,
      "precipitation_probability": 9,
      "wind_speed": 1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 96,
      "feels_like": 17.7,
      "wind_gust": 9,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-06T08:00",
      "temperature": 16.9,
      "precipitation_probability": 8,
      "wind_speed": 2.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 91,
      "feels_like": 18.3,
      "wind_gust": 8.3,
      "uv_index": 0.9,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T09:00",
      "temperature": 18.6,
      "precipitation_probability": 8,
      "wind_speed": 2.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 80,
      "feels_like": 19.9,
      "wind_gust": 10.4,
      "uv_index": 2.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T10:00",
      "temperature": 19.7,
      "precipitation_probability": 6,
      "wind_speed": 3.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 73,
      "feels_like": 20.8,
      "wind_gust": 15.8,
      "uv_index": 4.95,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T11:00",
      "temperature": 21.5,
      "precipitation_probability": 5,
      "wind_speed": 3.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 64,
      "feels_like": 22.4,
      "wind_gust": 16.6,
      "uv_index": 6.8,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-06T12:00",
      "temperature": 23.3,
      "precipitation_probability": 4,
      "wind_speed": 3,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_day.svg",
      "humidity": 57,
      "feels_like": 24.9,
      "wind_gust": 16.6,
      "uv_index": 8,
      "icon_path": "icons/weather/png/wmo-0-day-128.png"
    },
    {
      "time": "2026-06-06T13:00",
      "temperature": 24.9,
      "precipitation_probability": 3,
      "wind_speed": 5.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 49,
      "feels_like": 27.2,
      "wind_gust": 16.2,
      "uv_index": 8.5,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T14:00",
      "temperature": 25.7,
      "precipitation_probability": 3,
      "wind_speed": 7.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 46,
      "feels_like": 27.3,
      "wind_gust": 15.8,
      "uv_index": 8.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T15:00",
      "temperature": 25.7,
      "precipitation_probability": 6,
      "wind_speed": 8.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 46,
      "feels_like": 26.3,
      "wind_gust": 19.1,
      "uv_index": 6.85,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T16:00",
      "temperature": 25.3,
      "precipitation_probability": 17,
      "wind_speed": 10,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_day.svg",
      "humidity": 46,
      "feels_like": 24.6,
      "wind_gust": 23.4,
      "uv_index": 5.05,
      "icon_path": "icons/weather/png/wmo-1-day-128.png"
    },
    {
      "time": "2026-06-06T17:00",
      "temperature": 23.9,
      "precipitation_probability": 32,
      "wind_speed": 12.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 49,
      "feels_like": 22.7,
      "wind_gust": 25.6,
      "uv_index": 2.95,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T18:00",
      "temperature": 22,
      "precipitation_probability": 39,
      "wind_speed": 10.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 60,
      "feels_like": 21.7,
      "wind_gust": 25.6,
      "uv_index": 0.6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T19:00",
      "temperature": 20.4,
      "precipitation_probability": 31,
      "wind_speed": 7.5,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 69,
      "feels_like": 20.8,
      "wind_gust": 27.7,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-06T20:00",
      "temperature": 19.3,
      "precipitation_probability": 16,
      "wind_speed": 7.5,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 77,
      "feels_like": 19.9,
      "wind_gust": 25.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-06T21:00",
      "temperature": 18.9,
      "precipitation_probability": 4,
      "wind_speed": 6.3,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 80,
      "feels_like": 19.8,
      "wind_gust": 20.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-06T22:00",
      "temperature": 19,
      "precipitation_probability": 1,
      "wind_speed": 7.8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 73,
      "feels_like": 19.1,
      "wind_gust": 21.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-06T23:00",
      "temperature": 18,
      "precipitation_probability": 1,
      "wind_speed": 5.4,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 75,
      "feels_like": 18.4,
      "wind_gust": 18.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-07T00:00",
      "temperature": 17.9,
      "precipitation_probability": 2,
      "wind_speed": 6.3,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_night.svg",
      "humidity": 79,
      "feels_like": 18.3,
      "wind_gust": 13.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-0-night-128.png"
    },
    {
      "time": "2026-06-07T01:00",
      "temperature": 16.3,
      "precipitation_probability": 2,
      "wind_speed": 5.8,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 86,
      "feels_like": 16.7,
      "wind_gust": 12.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-07T02:00",
      "temperature": 16.5,
      "precipitation_probability": 2,
      "wind_speed": 4.7,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_night.svg",
      "humidity": 85,
      "feels_like": 17.1,
      "wind_gust": 9.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-0-night-128.png"
    },
    {
      "time": "2026-06-07T03:00",
      "temperature": 15.9,
      "precipitation_probability": 2,
      "wind_speed": 4.2,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 89,
      "feels_like": 16.5,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-07T04:00",
      "temperature": 15.5,
      "precipitation_probability": 3,
      "wind_speed": 4.1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 91,
      "feels_like": 16.2,
      "wind_gust": 7.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-07T05:00",
      "temperature": 15.8,
      "precipitation_probability": 4,
      "wind_speed": 4.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 91,
      "feels_like": 16.5,
      "wind_gust": 5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-07T06:00",
      "temperature": 15.6,
      "precipitation_probability": 4,
      "wind_speed": 5.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 93,
      "feels_like": 16.2,
      "wind_gust": 4.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-07T07:00",
      "temperature": 15.9,
      "precipitation_probability": 3,
      "wind_speed": 6.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 92,
      "feels_like": 16.4,
      "wind_gust": 4,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-07T08:00",
      "temperature": 17.2,
      "precipitation_probability": 2,
      "wind_speed": 2.7,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 85,
      "feels_like": 18.4,
      "wind_gust": 9,
      "uv_index": 0.95,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-07T09:00",
      "temperature": 18.3,
      "precipitation_probability": 2,
      "wind_speed": 4.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 81,
      "feels_like": 19.3,
      "wind_gust": 14.4,
      "uv_index": 2.8,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-07T10:00",
      "temperature": 20.3,
      "precipitation_probability": 6,
      "wind_speed": 6.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 69,
      "feels_like": 20.8,
      "wind_gust": 18.4,
      "uv_index": 4.9,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T11:00",
      "temperature": 21.4,
      "precipitation_probability": 11,
      "wind_speed": 6.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 63,
      "feels_like": 21.8,
      "wind_gust": 21.6,
      "uv_index": 6.75,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T12:00",
      "temperature": 22.7,
      "precipitation_probability": 16,
      "wind_speed": 7.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 57,
      "feels_like": 23.1,
      "wind_gust": 25.9,
      "uv_index": 8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T13:00",
      "temperature": 23.9,
      "precipitation_probability": 18,
      "wind_speed": 7.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 53,
      "feels_like": 25.5,
      "wind_gust": 28.8,
      "uv_index": 8.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T14:00",
      "temperature": 24.5,
      "precipitation_probability": 18,
      "wind_speed": 7.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 49,
      "feels_like": 25.6,
      "wind_gust": 31.3,
      "uv_index": 8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T15:00",
      "temperature": 25.1,
      "precipitation_probability": 20,
      "wind_speed": 9.4,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 47,
      "feels_like": 25.4,
      "wind_gust": 33.1,
      "uv_index": 6.85,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-07T16:00",
      "temperature": 25,
      "precipitation_probability": 26,
      "wind_speed": 12.2,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_day.svg",
      "humidity": 46,
      "feels_like": 24,
      "wind_gust": 33.8,
      "uv_index": 4.95,
      "icon_path": "icons/weather/png/wmo-1-day-128.png"
    },
    {
      "time": "2026-06-07T17:00",
      "temperature": 23.7,
      "precipitation_probability": 32,
      "wind_speed": 12.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 49,
      "feels_like": 22.6,
      "wind_gust": 33.8,
      "uv_index": 2.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T18:00",
      "temperature": 21.5,
      "precipitation_probability": 35,
      "wind_speed": 12.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 62,
      "feels_like": 21,
      "wind_gust": 32.4,
      "uv_index": 0.45,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T19:00",
      "temperature": 19.8,
      "precipitation_probability": 28,
      "wind_speed": 4.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 75,
      "feels_like": 21,
      "wind_gust": 29.5,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-07T20:00",
      "temperature": 19.1,
      "precipitation_probability": 17,
      "wind_speed": 7.4,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 79,
      "feels_like": 19.7,
      "wind_gust": 27,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-07T21:00",
      "temperature": 18.2,
      "precipitation_probability": 12,
      "wind_speed": 8.9,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 82,
      "feels_like": 18.6,
      "wind_gust": 23.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-07T22:00",
      "temperature": 18.4,
      "precipitation_probability": 18,
      "wind_speed": 10.2,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 81,
      "feels_like": 18.5,
      "wind_gust": 18,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-07T23:00",
      "temperature": 17.7,
      "precipitation_probability": 29,
      "wind_speed": 8.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 84,
      "feels_like": 18.1,
      "wind_gust": 12.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T00:00",
      "temperature": 17.4,
      "precipitation_probability": 39,
      "wind_speed": 5.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 88,
      "feels_like": 18.4,
      "wind_gust": 11.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T01:00",
      "temperature": 17.1,
      "precipitation_probability": 46,
      "wind_speed": 5.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 18.2,
      "wind_gust": 11.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T02:00",
      "temperature": 17.2,
      "precipitation_probability": 51,
      "wind_speed": 6.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 18.3,
      "wind_gust": 10.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T03:00",
      "temperature": 16.7,
      "precipitation_probability": 55,
      "wind_speed": 7.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 94,
      "feels_like": 17.6,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T04:00",
      "temperature": 16.4,
      "precipitation_probability": 56,
      "wind_speed": 6.3,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 97,
      "feels_like": 17.5,
      "wind_gust": 4.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-08T05:00",
      "temperature": 16.3,
      "precipitation_probability": 54,
      "wind_speed": 6,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 97,
      "feels_like": 17.4,
      "wind_gust": 4.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-08T06:00",
      "temperature": 16.1,
      "precipitation_probability": 53,
      "wind_speed": 3.8,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 98,
      "feels_like": 17.5,
      "wind_gust": 4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-08T07:00",
      "temperature": 16.2,
      "precipitation_probability": 52,
      "wind_speed": 4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 98,
      "feels_like": 17.6,
      "wind_gust": 5,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T08:00",
      "temperature": 16.5,
      "precipitation_probability": 52,
      "wind_speed": 5.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 95,
      "feels_like": 17.6,
      "wind_gust": 6.5,
      "uv_index": 0.75,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T09:00",
      "temperature": 17.9,
      "precipitation_probability": 51,
      "wind_speed": 6.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 88,
      "feels_like": 18.8,
      "wind_gust": 13.3,
      "uv_index": 2.2,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T10:00",
      "temperature": 19.9,
      "precipitation_probability": 50,
      "wind_speed": 7.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 73,
      "feels_like": 20.5,
      "wind_gust": 16.2,
      "uv_index": 3.85,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T11:00",
      "temperature": 20.9,
      "precipitation_probability": 50,
      "wind_speed": 6.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 68,
      "feels_like": 21.4,
      "wind_gust": 19.1,
      "uv_index": 5.2,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T12:00",
      "temperature": 22.1,
      "precipitation_probability": 47,
      "wind_speed": 7.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 61,
      "feels_like": 23.5,
      "wind_gust": 21.6,
      "uv_index": 7.2,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T13:00",
      "temperature": 23,
      "precipitation_probability": 40,
      "wind_speed": 7.6,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "humidity": 58,
      "feels_like": 25.1,
      "wind_gust": 23.8,
      "uv_index": 8.4,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "time": "2026-06-08T14:00",
      "temperature": 23.5,
      "precipitation_probability": 31,
      "wind_speed": 9.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 57,
      "feels_like": 24.7,
      "wind_gust": 25.9,
      "uv_index": 8.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T15:00",
      "temperature": 23.3,
      "precipitation_probability": 25,
      "wind_speed": 10.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 56,
      "feels_like": 24,
      "wind_gust": 27.4,
      "uv_index": 6.85,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T16:00",
      "temperature": 23,
      "precipitation_probability": 24,
      "wind_speed": 9.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 57,
      "feels_like": 22.9,
      "wind_gust": 28.8,
      "uv_index": 5.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T17:00",
      "temperature": 23.1,
      "precipitation_probability": 25,
      "wind_speed": 11.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 55,
      "feels_like": 22.4,
      "wind_gust": 29.5,
      "uv_index": 2.95,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-08T18:00",
      "temperature": 21.8,
      "precipitation_probability": 25,
      "wind_speed": 10.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 58,
      "feels_like": 21.3,
      "wind_gust": 29.5,
      "uv_index": 1.05,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-08T19:00",
      "temperature": 20.4,
      "precipitation_probability": 22,
      "wind_speed": 10.1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 63,
      "feels_like": 19.9,
      "wind_gust": 27.7,
      "uv_index": 0.1,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-08T20:00",
      "temperature": 19.6,
      "precipitation_probability": 19,
      "wind_speed": 8.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 64,
      "feels_like": 19.2,
      "wind_gust": 25.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-08T21:00",
      "temperature": 19.2,
      "precipitation_probability": 18,
      "wind_speed": 7.2,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 67,
      "feels_like": 19,
      "wind_gust": 21.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-08T22:00",
      "temperature": 18.4,
      "precipitation_probability": 22,
      "wind_speed": 6.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 73,
      "feels_like": 18.6,
      "wind_gust": 16.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T23:00",
      "temperature": 17.6,
      "precipitation_probability": 29,
      "wind_speed": 5.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 82,
      "feels_like": 18.2,
      "wind_gust": 11.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T00:00",
      "temperature": 17,
      "precipitation_probability": 35,
      "wind_speed": 4.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 89,
      "feels_like": 18,
      "wind_gust": 7.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T01:00",
      "temperature": 16.8,
      "precipitation_probability": 41,
      "wind_speed": 4.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.9,
      "wind_gust": 6.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T02:00",
      "temperature": 16.7,
      "precipitation_probability": 46,
      "wind_speed": 4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.9,
      "wind_gust": 6.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T03:00",
      "temperature": 16.6,
      "precipitation_probability": 47,
      "wind_speed": 3.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 17.8,
      "wind_gust": 7.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T04:00",
      "temperature": 16.1,
      "precipitation_probability": 39,
      "wind_speed": 4.9,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 95,
      "feels_like": 17.2,
      "wind_gust": 5.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T05:00",
      "temperature": 15.6,
      "precipitation_probability": 26,
      "wind_speed": 6.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 98,
      "feels_like": 16.3,
      "wind_gust": 4.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T06:00",
      "temperature": 15.5,
      "precipitation_probability": 18,
      "wind_speed": 6.9,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 98,
      "feels_like": 16.2,
      "wind_gust": 4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T07:00",
      "temperature": 16,
      "precipitation_probability": 19,
      "wind_speed": 4.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 96,
      "feels_like": 17.2,
      "wind_gust": 6.5,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T08:00",
      "temperature": 16.8,
      "precipitation_probability": 24,
      "wind_speed": 3.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 92,
      "feels_like": 18.1,
      "wind_gust": 10.1,
      "uv_index": 0.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T09:00",
      "temperature": 18,
      "precipitation_probability": 29,
      "wind_speed": 7.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 86,
      "feels_like": 18.8,
      "wind_gust": 14,
      "uv_index": 2.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T10:00",
      "temperature": 19.5,
      "precipitation_probability": 33,
      "wind_speed": 8.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 76,
      "feels_like": 20,
      "wind_gust": 17.3,
      "uv_index": 4.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T11:00",
      "temperature": 21.3,
      "precipitation_probability": 37,
      "wind_speed": 9.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 66,
      "feels_like": 21.5,
      "wind_gust": 20.9,
      "uv_index": 6.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T12:00",
      "temperature": 22.8,
      "precipitation_probability": 37,
      "wind_speed": 9.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 59,
      "feels_like": 23.4,
      "wind_gust": 23.8,
      "uv_index": 7.9,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T13:00",
      "temperature": 23.9,
      "precipitation_probability": 30,
      "wind_speed": 9.8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 54,
      "feels_like": 24.9,
      "wind_gust": 26.6,
      "uv_index": 8.35,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-09T14:00",
      "temperature": 24.7,
      "precipitation_probability": 19,
      "wind_speed": 10.1,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_day.svg",
      "humidity": 50,
      "feels_like": 25.7,
      "wind_gust": 28.8,
      "uv_index": 7.95,
      "icon_path": "icons/weather/png/wmo-1-day-128.png"
    },
    {
      "time": "2026-06-09T15:00",
      "temperature": 24.9,
      "precipitation_probability": 12,
      "wind_speed": 10.5,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_day.svg",
      "humidity": 49,
      "feels_like": 25.4,
      "wind_gust": 30.6,
      "uv_index": 6.8,
      "icon_path": "icons/weather/png/wmo-1-day-128.png"
    },
    {
      "time": "2026-06-09T16:00",
      "temperature": 24.2,
      "precipitation_probability": 12,
      "wind_speed": 11.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 51,
      "feels_like": 23.9,
      "wind_gust": 31.7,
      "uv_index": 5.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T17:00",
      "temperature": 23,
      "precipitation_probability": 16,
      "wind_speed": 11.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 55,
      "feels_like": 22.4,
      "wind_gust": 32,
      "uv_index": 1.15,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T18:00",
      "temperature": 21.8,
      "precipitation_probability": 18,
      "wind_speed": 11.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 60,
      "feels_like": 21.2,
      "wind_gust": 31.3,
      "uv_index": 0.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T19:00",
      "temperature": 20.6,
      "precipitation_probability": 15,
      "wind_speed": 10,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 66,
      "feels_like": 20.5,
      "wind_gust": 28.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-09T20:00",
      "temperature": 19.4,
      "precipitation_probability": 10,
      "wind_speed": 8.4,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 74,
      "feels_like": 19.7,
      "wind_gust": 25.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-09T21:00",
      "temperature": 18.5,
      "precipitation_probability": 8,
      "wind_speed": 7.7,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 80,
      "feels_like": 19,
      "wind_gust": 21.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-09T22:00",
      "temperature": 17.8,
      "precipitation_probability": 13,
      "wind_speed": 7.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 85,
      "feels_like": 18.4,
      "wind_gust": 17.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T23:00",
      "temperature": 17.3,
      "precipitation_probability": 22,
      "wind_speed": 7.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 88,
      "feels_like": 18,
      "wind_gust": 12.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T00:00",
      "temperature": 17,
      "precipitation_probability": 29,
      "wind_speed": 7.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 91,
      "feels_like": 17.8,
      "wind_gust": 9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T01:00",
      "temperature": 16.8,
      "precipitation_probability": 35,
      "wind_speed": 5.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.7,
      "wind_gust": 7.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T02:00",
      "temperature": 16.7,
      "precipitation_probability": 40,
      "wind_speed": 4.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.8,
      "wind_gust": 7.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T03:00",
      "temperature": 16.6,
      "precipitation_probability": 41,
      "wind_speed": 3.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.9,
      "wind_gust": 7.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T04:00",
      "temperature": 16.3,
      "precipitation_probability": 35,
      "wind_speed": 3.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 93,
      "feels_like": 17.5,
      "wind_gust": 6.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-10T05:00",
      "temperature": 16,
      "precipitation_probability": 26,
      "wind_speed": 4.9,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 95,
      "feels_like": 16.9,
      "wind_gust": 5.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-10T06:00",
      "temperature": 16,
      "precipitation_probability": 20,
      "wind_speed": 5.3,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 95,
      "feels_like": 16.9,
      "wind_gust": 5.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-10T07:00",
      "temperature": 16.4,
      "precipitation_probability": 21,
      "wind_speed": 4.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 93,
      "feels_like": 17.4,
      "wind_gust": 8.6,
      "uv_index": 0.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T08:00",
      "temperature": 17,
      "precipitation_probability": 26,
      "wind_speed": 7.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 91,
      "feels_like": 17.8,
      "wind_gust": 13,
      "uv_index": 0.3,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T09:00",
      "temperature": 18.1,
      "precipitation_probability": 31,
      "wind_speed": 10,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 85,
      "feels_like": 18.5,
      "wind_gust": 16.9,
      "uv_index": 1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T10:00",
      "temperature": 19.7,
      "precipitation_probability": 36,
      "wind_speed": 10.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 75,
      "feels_like": 19.9,
      "wind_gust": 19.4,
      "uv_index": 2.6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T11:00",
      "temperature": 21.7,
      "precipitation_probability": 40,
      "wind_speed": 10.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 64,
      "feels_like": 21.7,
      "wind_gust": 21.2,
      "uv_index": 4.75,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T12:00",
      "temperature": 23.3,
      "precipitation_probability": 41,
      "wind_speed": 10.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 57,
      "feels_like": 24.1,
      "wind_gust": 23,
      "uv_index": 6.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T13:00",
      "temperature": 24.2,
      "precipitation_probability": 33,
      "wind_speed": 11.3,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 53,
      "feels_like": 25.3,
      "wind_gust": 24.8,
      "uv_index": 7.4,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-10T14:00",
      "temperature": 24.8,
      "precipitation_probability": 22,
      "wind_speed": 12.1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 50,
      "feels_like": 25.7,
      "wind_gust": 26.6,
      "uv_index": 7.95,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-10T15:00",
      "temperature": 24.8,
      "precipitation_probability": 14,
      "wind_speed": 12.2,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 50,
      "feels_like": 25.2,
      "wind_gust": 28.1,
      "uv_index": 7.8,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-10T16:00",
      "temperature": 23.9,
      "precipitation_probability": 14,
      "wind_speed": 11.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 52,
      "feels_like": 23.6,
      "wind_gust": 29.9,
      "uv_index": 6.5,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T17:00",
      "temperature": 22.5,
      "precipitation_probability": 19,
      "wind_speed": 10.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 56,
      "feels_like": 22,
      "wind_gust": 31.3,
      "uv_index": 4.45,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T18:00",
      "temperature": 21.1,
      "precipitation_probability": 22,
      "wind_speed": 9.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 62,
      "feels_like": 20.9,
      "wind_gust": 31,
      "uv_index": 2.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T19:00",
      "temperature": 19.9,
      "precipitation_probability": 22,
      "wind_speed": 6.8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 68,
      "feels_like": 20.1,
      "wind_gust": 28.1,
      "uv_index": 1.5,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-10T20:00",
      "temperature": 18.7,
      "precipitation_probability": 20,
      "wind_speed": 6.5,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 75,
      "feels_like": 19.1,
      "wind_gust": 23.4,
      "uv_index": 0.6,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-10T21:00",
      "temperature": 17.8,
      "precipitation_probability": 20,
      "wind_speed": 7.8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 82,
      "feels_like": 18.2,
      "wind_gust": 19.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-10T22:00",
      "temperature": 17.3,
      "precipitation_probability": 23,
      "wind_speed": 7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 86,
      "feels_like": 17.9,
      "wind_gust": 15.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T23:00",
      "temperature": 17.1,
      "precipitation_probability": 28,
      "wind_speed": 5.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 89,
      "feels_like": 18.1,
      "wind_gust": 12.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T00:00",
      "temperature": 17,
      "precipitation_probability": 32,
      "wind_speed": 4.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 91,
      "feels_like": 18.1,
      "wind_gust": 10.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T01:00",
      "temperature": 16.5,
      "precipitation_probability": 36,
      "wind_speed": 5.3,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 91,
      "feels_like": 17.4,
      "wind_gust": 9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-11T02:00",
      "temperature": 16.5,
      "precipitation_probability": 39,
      "wind_speed": 5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 92,
      "feels_like": 17.5,
      "wind_gust": 9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-11T03:00",
      "temperature": 16.5,
      "precipitation_probability": 41,
      "wind_speed": 4.9,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 93,
      "feels_like": 17.5,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-11T04:00",
      "temperature": 16.5,
      "precipitation_probability": 42,
      "wind_speed": 4.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 17.5,
      "wind_gust": 6.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T05:00",
      "temperature": 16.5,
      "precipitation_probability": 41,
      "wind_speed": 5.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 17.5,
      "wind_gust": 4.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T06:00",
      "temperature": 16.6,
      "precipitation_probability": 41,
      "wind_speed": 5.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.5,
      "wind_gust": 3.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T07:00",
      "temperature": 16.8,
      "precipitation_probability": 40,
      "wind_speed": 5.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 91,
      "feels_like": 17.7,
      "wind_gust": 5.8,
      "uv_index": 0.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T08:00",
      "temperature": 17.1,
      "precipitation_probability": 39,
      "wind_speed": 6.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 89,
      "feels_like": 17.9,
      "wind_gust": 9.7,
      "uv_index": 0.3,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T09:00",
      "temperature": 17.6,
      "precipitation_probability": 39,
      "wind_speed": 6.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 85,
      "feels_like": 18.2,
      "wind_gust": 13.7,
      "uv_index": 0.95,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T10:00",
      "temperature": 18.4,
      "precipitation_probability": 39,
      "wind_speed": 7.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 79,
      "feels_like": 18.8,
      "wind_gust": 16.9,
      "uv_index": 2.45,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T11:00",
      "temperature": 19.7,
      "precipitation_probability": 40,
      "wind_speed": 9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 71,
      "feels_like": 19.7,
      "wind_gust": 20.2,
      "uv_index": 4.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T12:00",
      "temperature": 21,
      "precipitation_probability": 41,
      "wind_speed": 10.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 64,
      "feels_like": 20.8,
      "wind_gust": 23,
      "uv_index": 6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T13:00",
      "temperature": 22.3,
      "precipitation_probability": 42,
      "wind_speed": 11.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 57,
      "feels_like": 22.4,
      "wind_gust": 25.9,
      "uv_index": 7.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T14:00",
      "temperature": 23.3,
      "precipitation_probability": 42,
      "wind_speed": 12.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 53,
      "feels_like": 23.3,
      "wind_gust": 29.2,
      "uv_index": 7.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T15:00",
      "temperature": 23.6,
      "precipitation_probability": 41,
      "wind_speed": 12.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 52,
      "feels_like": 23.4,
      "wind_gust": 31,
      "uv_index": 7.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T16:00",
      "temperature": 23.3,
      "precipitation_probability": 38,
      "wind_speed": 12.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 53,
      "feels_like": 22.5,
      "wind_gust": 31.7,
      "uv_index": 6.6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T17:00",
      "temperature": 22.3,
      "precipitation_probability": 33,
      "wind_speed": 11.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 58,
      "feels_like": 21.7,
      "wind_gust": 31.7,
      "uv_index": 4.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T18:00",
      "temperature": 21.1,
      "precipitation_probability": 29,
      "wind_speed": 10.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 64,
      "feels_like": 20.8,
      "wind_gust": 30.6,
      "uv_index": 3,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T19:00",
      "temperature": 19.7,
      "precipitation_probability": 25,
      "wind_speed": 10.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 72,
      "feels_like": 19.7,
      "wind_gust": 28.4,
      "uv_index": 1.75,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T20:00",
      "temperature": 18.5,
      "precipitation_probability": 22,
      "wind_speed": 9.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 80,
      "feels_like": 18.7,
      "wind_gust": 25.2,
      "uv_index": 0.75,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T21:00",
      "temperature": 17.6,
      "precipitation_probability": 22,
      "wind_speed": 8.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 86,
      "feels_like": 18,
      "wind_gust": 22.3,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T22:00",
      "temperature": 17,
      "precipitation_probability": 27,
      "wind_speed": 8.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 90,
      "feels_like": 17.6,
      "wind_gust": 20.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T23:00",
      "temperature": 16.7,
      "precipitation_probability": 34,
      "wind_speed": 7.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 17.4,
      "wind_gust": 18.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    }
  ],
  "daily": [
    {
      "date": "2026-06-05",
      "temp_min": 13.3,
      "temp_max": 25.9,
      "precipitation_sum": 1.1,
      "sunrise": "2026-06-05T06:29",
      "sunset": "2026-06-05T18:32",
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "precipitation_probability": 20,
      "wind_max": 10.9,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "date": "2026-06-06",
      "temp_min": 16.1,
      "temp_max": 25.7,
      "precipitation_sum": 1.8,
      "sunrise": "2026-06-06T06:29",
      "sunset": "2026-06-06T18:32",
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "precipitation_probability": 45,
      "wind_max": 12.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "date": "2026-06-07",
      "temp_min": 15.5,
      "temp_max": 25.1,
      "precipitation_sum": 1.4,
      "sunrise": "2026-06-07T06:30",
      "sunset": "2026-06-07T18:33",
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "precipitation_probability": 35,
      "wind_max": 12.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "date": "2026-06-08",
      "temp_min": 16.1,
      "temp_max": 23.5,
      "precipitation_sum": 6.3,
      "sunrise": "2026-06-08T06:30",
      "sunset": "2026-06-08T18:33",
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "precipitation_probability": 56,
      "wind_max": 11.7,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "date": "2026-06-09",
      "temp_min": 15.5,
      "temp_max": 24.9,
      "precipitation_sum": 2.1,
      "sunrise": "2026-06-09T06:30",
      "sunset": "2026-06-09T18:33",
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "precipitation_probability": 47,
      "wind_max": 11.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "date": "2026-06-10",
      "temp_min": 16,
      "temp_max": 24.8,
      "precipitation_sum": 2.2,
      "sunrise": "2026-06-10T06:30",
      "sunset": "2026-06-10T18:33",
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "precipitation_probability": 41,
      "wind_max": 12.2,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "date": "2026-06-11",
      "temp_min": 16.5,
      "temp_max": 23.6,
      "precipitation_sum": 4.9,
      "sunrise": "2026-06-11T06:30",
      "sunset": "2026-06-11T18:33",
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "precipitation_probability": 42,
      "wind_max": 12.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    }
  ],
  "client_geo": {
    "country": "ZZ",
    "ip_hash": "f2bbfbb19f617ba7"
  }
}
```
---

### 2. `GET /v1/weather`
**Purpose:** Return current weather conditions for a location

**When called:** On HTTP request, not in the polling scheduler

**Key query params:**

| Param | Type | Required | Notes |
|---|---|---|---|
| `lat` | float | ✅ | Latitude of location |
| `lon` | float | ✅ | Longitude of location |
| `ai` | boolean | optional | Use `false` to avoid AI quota use |

**Used for:** Exposing a real-time conditions lookup in the project's own API
Response Sample
```json
{
  "location": {
    "lat": -1.3005272,
    "lon": 36.824646,
    "timezone": "Africa/Nairobi",
    "requested_lat": -1.286,
    "requested_lon": 36.817,
    "country": "KE"
  },
  "current": {
    "time": "2026-06-05T11:45",
    "temperature": 23.9,
    "wind_speed": 6.4,
    "wind_direction": 98,
    "condition_code": "2",
    "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
    "icon_path": "icons/weather/png/wmo-2-day-128.png"
  },
  "hourly": [
    {
      "time": "2026-06-05T00:00",
      "temperature": 16.6,
      "precipitation_probability": 0,
      "wind_speed": 3.8,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_night.svg",
      "humidity": 83,
      "feels_like": 17.2,
      "wind_gust": 7.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-0-night-128.png"
    },
    {
      "time": "2026-06-05T01:00",
      "temperature": 15.9,
      "precipitation_probability": 0,
      "wind_speed": 2,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_night.svg",
      "humidity": 84,
      "feels_like": 16.6,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-0-night-128.png"
    },
    {
      "time": "2026-06-05T02:00",
      "temperature": 15.2,
      "precipitation_probability": 0,
      "wind_speed": 1.5,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_night.svg",
      "humidity": 86,
      "feels_like": 15.9,
      "wind_gust": 7.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-0-night-128.png"
    },
    {
      "time": "2026-06-05T03:00",
      "temperature": 14.8,
      "precipitation_probability": 0,
      "wind_speed": 2.4,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 85,
      "feels_like": 15.2,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-05T04:00",
      "temperature": 14.2,
      "precipitation_probability": 0,
      "wind_speed": 4.3,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 87,
      "feels_like": 14.2,
      "wind_gust": 7.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-05T05:00",
      "temperature": 13.5,
      "precipitation_probability": 0,
      "wind_speed": 4.2,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 89,
      "feels_like": 13.4,
      "wind_gust": 4.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-05T06:00",
      "temperature": 13.3,
      "precipitation_probability": 0,
      "wind_speed": 1.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 89,
      "feels_like": 13.4,
      "wind_gust": 7.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-05T07:00",
      "temperature": 13.5,
      "precipitation_probability": 0,
      "wind_speed": 2.9,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 88,
      "feels_like": 13.6,
      "wind_gust": 10.1,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-05T08:00",
      "temperature": 16.1,
      "precipitation_probability": 0,
      "wind_speed": 3.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 79,
      "feels_like": 16.3,
      "wind_gust": 11.5,
      "uv_index": 0.95,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-05T09:00",
      "temperature": 18.1,
      "precipitation_probability": 0,
      "wind_speed": 2.1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 72,
      "feels_like": 18.7,
      "wind_gust": 10.4,
      "uv_index": 2.8,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-05T10:00",
      "temperature": 19.8,
      "precipitation_probability": 2,
      "wind_speed": 3.1,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 67,
      "feels_like": 21,
      "wind_gust": 14.8,
      "uv_index": 4.8,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-05T11:00",
      "temperature": 22.4,
      "precipitation_probability": 4,
      "wind_speed": 5.7,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 55,
      "feels_like": 23.9,
      "wind_gust": 21.6,
      "uv_index": 6.75,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-05T12:00",
      "temperature": 24.3,
      "precipitation_probability": 6,
      "wind_speed": 6.8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 48,
      "feels_like": 25.8,
      "wind_gust": 24.5,
      "uv_index": 8.05,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-05T13:00",
      "temperature": 25.1,
      "precipitation_probability": 6,
      "wind_speed": 8.7,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 43,
      "feels_like": 26.1,
      "wind_gust": 24.5,
      "uv_index": 8.45,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-05T14:00",
      "temperature": 25.9,
      "precipitation_probability": 5,
      "wind_speed": 8.2,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 40,
      "feels_like": 26.6,
      "wind_gust": 24.8,
      "uv_index": 7.55,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-05T15:00",
      "temperature": 25.3,
      "precipitation_probability": 6,
      "wind_speed": 9.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 41,
      "feels_like": 25.1,
      "wind_gust": 28.1,
      "uv_index": 6.65,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-05T16:00",
      "temperature": 24.9,
      "precipitation_probability": 11,
      "wind_speed": 9.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 43,
      "feels_like": 24,
      "wind_gust": 28.4,
      "uv_index": 5,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-05T17:00",
      "temperature": 23.7,
      "precipitation_probability": 17,
      "wind_speed": 10.7,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "humidity": 48,
      "feels_like": 22.8,
      "wind_gust": 29.5,
      "uv_index": 1.7,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "time": "2026-06-05T18:00",
      "temperature": 22.2,
      "precipitation_probability": 20,
      "wind_speed": 10.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 56,
      "feels_like": 21.6,
      "wind_gust": 29.5,
      "uv_index": 0.6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-05T19:00",
      "temperature": 20.5,
      "precipitation_probability": 14,
      "wind_speed": 8.1,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 63,
      "feels_like": 20.3,
      "wind_gust": 25.2,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-05T20:00",
      "temperature": 19,
      "precipitation_probability": 5,
      "wind_speed": 9.2,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 76,
      "feels_like": 19.1,
      "wind_gust": 19.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-05T21:00",
      "temperature": 18.2,
      "precipitation_probability": 0,
      "wind_speed": 9.4,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 79,
      "feels_like": 18.3,
      "wind_gust": 20.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-05T22:00",
      "temperature": 17.7,
      "precipitation_probability": 5,
      "wind_speed": 5.6,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 79,
      "feels_like": 18.2,
      "wind_gust": 20.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-05T23:00",
      "temperature": 17.8,
      "precipitation_probability": 15,
      "wind_speed": 7.9,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 80,
      "feels_like": 18,
      "wind_gust": 19.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-06T00:00",
      "temperature": 17.2,
      "precipitation_probability": 24,
      "wind_speed": 5.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 84,
      "feels_like": 17.8,
      "wind_gust": 15.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-06T01:00",
      "temperature": 16.6,
      "precipitation_probability": 33,
      "wind_speed": 2.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 90,
      "feels_like": 17.8,
      "wind_gust": 11.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T02:00",
      "temperature": 16.8,
      "precipitation_probability": 42,
      "wind_speed": 0.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 90,
      "feels_like": 18.5,
      "wind_gust": 10.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T03:00",
      "temperature": 16.8,
      "precipitation_probability": 45,
      "wind_speed": 1.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 91,
      "feels_like": 18.3,
      "wind_gust": 11.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T04:00",
      "temperature": 16.7,
      "precipitation_probability": 37,
      "wind_speed": 2.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 18.2,
      "wind_gust": 11.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T05:00",
      "temperature": 16.6,
      "precipitation_probability": 23,
      "wind_speed": 1.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 94,
      "feels_like": 18.2,
      "wind_gust": 8.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T06:00",
      "temperature": 16.3,
      "precipitation_probability": 12,
      "wind_speed": 0,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 94,
      "feels_like": 18,
      "wind_gust": 9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T07:00",
      "temperature": 16.1,
      "precipitation_probability": 9,
      "wind_speed": 1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 96,
      "feels_like": 17.7,
      "wind_gust": 9,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-06T08:00",
      "temperature": 16.9,
      "precipitation_probability": 8,
      "wind_speed": 2.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 91,
      "feels_like": 18.3,
      "wind_gust": 8.3,
      "uv_index": 0.9,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T09:00",
      "temperature": 18.6,
      "precipitation_probability": 8,
      "wind_speed": 2.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 80,
      "feels_like": 19.9,
      "wind_gust": 10.4,
      "uv_index": 2.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T10:00",
      "temperature": 19.7,
      "precipitation_probability": 6,
      "wind_speed": 3.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 73,
      "feels_like": 20.8,
      "wind_gust": 15.8,
      "uv_index": 4.95,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T11:00",
      "temperature": 21.5,
      "precipitation_probability": 5,
      "wind_speed": 3.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 64,
      "feels_like": 22.4,
      "wind_gust": 16.6,
      "uv_index": 6.8,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-06T12:00",
      "temperature": 23.3,
      "precipitation_probability": 4,
      "wind_speed": 3,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_day.svg",
      "humidity": 57,
      "feels_like": 24.9,
      "wind_gust": 16.6,
      "uv_index": 8,
      "icon_path": "icons/weather/png/wmo-0-day-128.png"
    },
    {
      "time": "2026-06-06T13:00",
      "temperature": 24.9,
      "precipitation_probability": 3,
      "wind_speed": 5.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 49,
      "feels_like": 27.2,
      "wind_gust": 16.2,
      "uv_index": 8.5,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T14:00",
      "temperature": 25.7,
      "precipitation_probability": 3,
      "wind_speed": 7.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 46,
      "feels_like": 27.3,
      "wind_gust": 15.8,
      "uv_index": 8.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T15:00",
      "temperature": 25.7,
      "precipitation_probability": 6,
      "wind_speed": 8.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 46,
      "feels_like": 26.3,
      "wind_gust": 19.1,
      "uv_index": 6.85,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T16:00",
      "temperature": 25.3,
      "precipitation_probability": 17,
      "wind_speed": 10,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_day.svg",
      "humidity": 46,
      "feels_like": 24.6,
      "wind_gust": 23.4,
      "uv_index": 5.05,
      "icon_path": "icons/weather/png/wmo-1-day-128.png"
    },
    {
      "time": "2026-06-06T17:00",
      "temperature": 23.9,
      "precipitation_probability": 32,
      "wind_speed": 12.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 49,
      "feels_like": 22.7,
      "wind_gust": 25.6,
      "uv_index": 2.95,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T18:00",
      "temperature": 22,
      "precipitation_probability": 39,
      "wind_speed": 10.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 60,
      "feels_like": 21.7,
      "wind_gust": 25.6,
      "uv_index": 0.6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T19:00",
      "temperature": 20.4,
      "precipitation_probability": 31,
      "wind_speed": 7.5,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 69,
      "feels_like": 20.8,
      "wind_gust": 27.7,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-06T20:00",
      "temperature": 19.3,
      "precipitation_probability": 16,
      "wind_speed": 7.5,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 77,
      "feels_like": 19.9,
      "wind_gust": 25.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-06T21:00",
      "temperature": 18.9,
      "precipitation_probability": 4,
      "wind_speed": 6.3,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 80,
      "feels_like": 19.8,
      "wind_gust": 20.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-06T22:00",
      "temperature": 19,
      "precipitation_probability": 1,
      "wind_speed": 7.8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 73,
      "feels_like": 19.1,
      "wind_gust": 21.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-06T23:00",
      "temperature": 18,
      "precipitation_probability": 1,
      "wind_speed": 5.4,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 75,
      "feels_like": 18.4,
      "wind_gust": 18.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-07T00:00",
      "temperature": 17.9,
      "precipitation_probability": 2,
      "wind_speed": 6.3,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_night.svg",
      "humidity": 79,
      "feels_like": 18.3,
      "wind_gust": 13.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-0-night-128.png"
    },
    {
      "time": "2026-06-07T01:00",
      "temperature": 16.3,
      "precipitation_probability": 2,
      "wind_speed": 5.8,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 86,
      "feels_like": 16.7,
      "wind_gust": 12.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-07T02:00",
      "temperature": 16.5,
      "precipitation_probability": 2,
      "wind_speed": 4.7,
      "condition_code": "0",
      "icon": "https://cdn.weather-ai.co/icons/default/0_clear_night.svg",
      "humidity": 85,
      "feels_like": 17.1,
      "wind_gust": 9.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-0-night-128.png"
    },
    {
      "time": "2026-06-07T03:00",
      "temperature": 15.9,
      "precipitation_probability": 2,
      "wind_speed": 4.2,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 89,
      "feels_like": 16.5,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-07T04:00",
      "temperature": 15.5,
      "precipitation_probability": 3,
      "wind_speed": 4.1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 91,
      "feels_like": 16.2,
      "wind_gust": 7.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-07T05:00",
      "temperature": 15.8,
      "precipitation_probability": 4,
      "wind_speed": 4.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 91,
      "feels_like": 16.5,
      "wind_gust": 5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-07T06:00",
      "temperature": 15.6,
      "precipitation_probability": 4,
      "wind_speed": 5.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 93,
      "feels_like": 16.2,
      "wind_gust": 4.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-07T07:00",
      "temperature": 15.9,
      "precipitation_probability": 3,
      "wind_speed": 6.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 92,
      "feels_like": 16.4,
      "wind_gust": 4,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-07T08:00",
      "temperature": 17.2,
      "precipitation_probability": 2,
      "wind_speed": 2.7,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 85,
      "feels_like": 18.4,
      "wind_gust": 9,
      "uv_index": 0.95,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-07T09:00",
      "temperature": 18.3,
      "precipitation_probability": 2,
      "wind_speed": 4.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 81,
      "feels_like": 19.3,
      "wind_gust": 14.4,
      "uv_index": 2.8,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-07T10:00",
      "temperature": 20.3,
      "precipitation_probability": 6,
      "wind_speed": 6.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 69,
      "feels_like": 20.8,
      "wind_gust": 18.4,
      "uv_index": 4.9,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T11:00",
      "temperature": 21.4,
      "precipitation_probability": 11,
      "wind_speed": 6.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 63,
      "feels_like": 21.8,
      "wind_gust": 21.6,
      "uv_index": 6.75,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T12:00",
      "temperature": 22.7,
      "precipitation_probability": 16,
      "wind_speed": 7.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 57,
      "feels_like": 23.1,
      "wind_gust": 25.9,
      "uv_index": 8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T13:00",
      "temperature": 23.9,
      "precipitation_probability": 18,
      "wind_speed": 7.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 53,
      "feels_like": 25.5,
      "wind_gust": 28.8,
      "uv_index": 8.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T14:00",
      "temperature": 24.5,
      "precipitation_probability": 18,
      "wind_speed": 7.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 49,
      "feels_like": 25.6,
      "wind_gust": 31.3,
      "uv_index": 8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T15:00",
      "temperature": 25.1,
      "precipitation_probability": 20,
      "wind_speed": 9.4,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 47,
      "feels_like": 25.4,
      "wind_gust": 33.1,
      "uv_index": 6.85,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-07T16:00",
      "temperature": 25,
      "precipitation_probability": 26,
      "wind_speed": 12.2,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_day.svg",
      "humidity": 46,
      "feels_like": 24,
      "wind_gust": 33.8,
      "uv_index": 4.95,
      "icon_path": "icons/weather/png/wmo-1-day-128.png"
    },
    {
      "time": "2026-06-07T17:00",
      "temperature": 23.7,
      "precipitation_probability": 32,
      "wind_speed": 12.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 49,
      "feels_like": 22.6,
      "wind_gust": 33.8,
      "uv_index": 2.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T18:00",
      "temperature": 21.5,
      "precipitation_probability": 35,
      "wind_speed": 12.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 62,
      "feels_like": 21,
      "wind_gust": 32.4,
      "uv_index": 0.45,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T19:00",
      "temperature": 19.8,
      "precipitation_probability": 28,
      "wind_speed": 4.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 75,
      "feels_like": 21,
      "wind_gust": 29.5,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-07T20:00",
      "temperature": 19.1,
      "precipitation_probability": 17,
      "wind_speed": 7.4,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 79,
      "feels_like": 19.7,
      "wind_gust": 27,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-07T21:00",
      "temperature": 18.2,
      "precipitation_probability": 12,
      "wind_speed": 8.9,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 82,
      "feels_like": 18.6,
      "wind_gust": 23.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-07T22:00",
      "temperature": 18.4,
      "precipitation_probability": 18,
      "wind_speed": 10.2,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 81,
      "feels_like": 18.5,
      "wind_gust": 18,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-07T23:00",
      "temperature": 17.7,
      "precipitation_probability": 29,
      "wind_speed": 8.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 84,
      "feels_like": 18.1,
      "wind_gust": 12.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T00:00",
      "temperature": 17.4,
      "precipitation_probability": 39,
      "wind_speed": 5.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 88,
      "feels_like": 18.4,
      "wind_gust": 11.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T01:00",
      "temperature": 17.1,
      "precipitation_probability": 46,
      "wind_speed": 5.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 18.2,
      "wind_gust": 11.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T02:00",
      "temperature": 17.2,
      "precipitation_probability": 51,
      "wind_speed": 6.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 18.3,
      "wind_gust": 10.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T03:00",
      "temperature": 16.7,
      "precipitation_probability": 55,
      "wind_speed": 7.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 94,
      "feels_like": 17.6,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T04:00",
      "temperature": 16.4,
      "precipitation_probability": 56,
      "wind_speed": 6.3,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 97,
      "feels_like": 17.5,
      "wind_gust": 4.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-08T05:00",
      "temperature": 16.3,
      "precipitation_probability": 54,
      "wind_speed": 6,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 97,
      "feels_like": 17.4,
      "wind_gust": 4.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-08T06:00",
      "temperature": 16.1,
      "precipitation_probability": 53,
      "wind_speed": 3.8,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 98,
      "feels_like": 17.5,
      "wind_gust": 4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-08T07:00",
      "temperature": 16.2,
      "precipitation_probability": 52,
      "wind_speed": 4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 98,
      "feels_like": 17.6,
      "wind_gust": 5,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T08:00",
      "temperature": 16.5,
      "precipitation_probability": 52,
      "wind_speed": 5.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 95,
      "feels_like": 17.6,
      "wind_gust": 6.5,
      "uv_index": 0.75,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T09:00",
      "temperature": 17.9,
      "precipitation_probability": 51,
      "wind_speed": 6.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 88,
      "feels_like": 18.8,
      "wind_gust": 13.3,
      "uv_index": 2.2,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T10:00",
      "temperature": 19.9,
      "precipitation_probability": 50,
      "wind_speed": 7.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 73,
      "feels_like": 20.5,
      "wind_gust": 16.2,
      "uv_index": 3.85,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T11:00",
      "temperature": 20.9,
      "precipitation_probability": 50,
      "wind_speed": 6.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 68,
      "feels_like": 21.4,
      "wind_gust": 19.1,
      "uv_index": 5.2,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T12:00",
      "temperature": 22.1,
      "precipitation_probability": 47,
      "wind_speed": 7.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 61,
      "feels_like": 23.5,
      "wind_gust": 21.6,
      "uv_index": 7.2,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T13:00",
      "temperature": 23,
      "precipitation_probability": 40,
      "wind_speed": 7.6,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "humidity": 58,
      "feels_like": 25.1,
      "wind_gust": 23.8,
      "uv_index": 8.4,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "time": "2026-06-08T14:00",
      "temperature": 23.5,
      "precipitation_probability": 31,
      "wind_speed": 9.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 57,
      "feels_like": 24.7,
      "wind_gust": 25.9,
      "uv_index": 8.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T15:00",
      "temperature": 23.3,
      "precipitation_probability": 25,
      "wind_speed": 10.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 56,
      "feels_like": 24,
      "wind_gust": 27.4,
      "uv_index": 6.85,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T16:00",
      "temperature": 23,
      "precipitation_probability": 24,
      "wind_speed": 9.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 57,
      "feels_like": 22.9,
      "wind_gust": 28.8,
      "uv_index": 5.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T17:00",
      "temperature": 23.1,
      "precipitation_probability": 25,
      "wind_speed": 11.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 55,
      "feels_like": 22.4,
      "wind_gust": 29.5,
      "uv_index": 2.95,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-08T18:00",
      "temperature": 21.8,
      "precipitation_probability": 25,
      "wind_speed": 10.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 58,
      "feels_like": 21.3,
      "wind_gust": 29.5,
      "uv_index": 1.05,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-08T19:00",
      "temperature": 20.4,
      "precipitation_probability": 22,
      "wind_speed": 10.1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 63,
      "feels_like": 19.9,
      "wind_gust": 27.7,
      "uv_index": 0.1,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-08T20:00",
      "temperature": 19.6,
      "precipitation_probability": 19,
      "wind_speed": 8.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 64,
      "feels_like": 19.2,
      "wind_gust": 25.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-08T21:00",
      "temperature": 19.2,
      "precipitation_probability": 18,
      "wind_speed": 7.2,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 67,
      "feels_like": 19,
      "wind_gust": 21.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-08T22:00",
      "temperature": 18.4,
      "precipitation_probability": 22,
      "wind_speed": 6.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 73,
      "feels_like": 18.6,
      "wind_gust": 16.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-08T23:00",
      "temperature": 17.6,
      "precipitation_probability": 29,
      "wind_speed": 5.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 82,
      "feels_like": 18.2,
      "wind_gust": 11.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T00:00",
      "temperature": 17,
      "precipitation_probability": 35,
      "wind_speed": 4.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 89,
      "feels_like": 18,
      "wind_gust": 7.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T01:00",
      "temperature": 16.8,
      "precipitation_probability": 41,
      "wind_speed": 4.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.9,
      "wind_gust": 6.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T02:00",
      "temperature": 16.7,
      "precipitation_probability": 46,
      "wind_speed": 4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.9,
      "wind_gust": 6.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T03:00",
      "temperature": 16.6,
      "precipitation_probability": 47,
      "wind_speed": 3.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 17.8,
      "wind_gust": 7.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T04:00",
      "temperature": 16.1,
      "precipitation_probability": 39,
      "wind_speed": 4.9,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 95,
      "feels_like": 17.2,
      "wind_gust": 5.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T05:00",
      "temperature": 15.6,
      "precipitation_probability": 26,
      "wind_speed": 6.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 98,
      "feels_like": 16.3,
      "wind_gust": 4.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T06:00",
      "temperature": 15.5,
      "precipitation_probability": 18,
      "wind_speed": 6.9,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 98,
      "feels_like": 16.2,
      "wind_gust": 4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T07:00",
      "temperature": 16,
      "precipitation_probability": 19,
      "wind_speed": 4.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 96,
      "feels_like": 17.2,
      "wind_gust": 6.5,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T08:00",
      "temperature": 16.8,
      "precipitation_probability": 24,
      "wind_speed": 3.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 92,
      "feels_like": 18.1,
      "wind_gust": 10.1,
      "uv_index": 0.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T09:00",
      "temperature": 18,
      "precipitation_probability": 29,
      "wind_speed": 7.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 86,
      "feels_like": 18.8,
      "wind_gust": 14,
      "uv_index": 2.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T10:00",
      "temperature": 19.5,
      "precipitation_probability": 33,
      "wind_speed": 8.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 76,
      "feels_like": 20,
      "wind_gust": 17.3,
      "uv_index": 4.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T11:00",
      "temperature": 21.3,
      "precipitation_probability": 37,
      "wind_speed": 9.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 66,
      "feels_like": 21.5,
      "wind_gust": 20.9,
      "uv_index": 6.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T12:00",
      "temperature": 22.8,
      "precipitation_probability": 37,
      "wind_speed": 9.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 59,
      "feels_like": 23.4,
      "wind_gust": 23.8,
      "uv_index": 7.9,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T13:00",
      "temperature": 23.9,
      "precipitation_probability": 30,
      "wind_speed": 9.8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 54,
      "feels_like": 24.9,
      "wind_gust": 26.6,
      "uv_index": 8.35,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-09T14:00",
      "temperature": 24.7,
      "precipitation_probability": 19,
      "wind_speed": 10.1,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_day.svg",
      "humidity": 50,
      "feels_like": 25.7,
      "wind_gust": 28.8,
      "uv_index": 7.95,
      "icon_path": "icons/weather/png/wmo-1-day-128.png"
    },
    {
      "time": "2026-06-09T15:00",
      "temperature": 24.9,
      "precipitation_probability": 12,
      "wind_speed": 10.5,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_day.svg",
      "humidity": 49,
      "feels_like": 25.4,
      "wind_gust": 30.6,
      "uv_index": 6.8,
      "icon_path": "icons/weather/png/wmo-1-day-128.png"
    },
    {
      "time": "2026-06-09T16:00",
      "temperature": 24.2,
      "precipitation_probability": 12,
      "wind_speed": 11.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 51,
      "feels_like": 23.9,
      "wind_gust": 31.7,
      "uv_index": 5.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T17:00",
      "temperature": 23,
      "precipitation_probability": 16,
      "wind_speed": 11.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 55,
      "feels_like": 22.4,
      "wind_gust": 32,
      "uv_index": 1.15,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T18:00",
      "temperature": 21.8,
      "precipitation_probability": 18,
      "wind_speed": 11.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 60,
      "feels_like": 21.2,
      "wind_gust": 31.3,
      "uv_index": 0.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T19:00",
      "temperature": 20.6,
      "precipitation_probability": 15,
      "wind_speed": 10,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 66,
      "feels_like": 20.5,
      "wind_gust": 28.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-09T20:00",
      "temperature": 19.4,
      "precipitation_probability": 10,
      "wind_speed": 8.4,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 74,
      "feels_like": 19.7,
      "wind_gust": 25.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-09T21:00",
      "temperature": 18.5,
      "precipitation_probability": 8,
      "wind_speed": 7.7,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 80,
      "feels_like": 19,
      "wind_gust": 21.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-09T22:00",
      "temperature": 17.8,
      "precipitation_probability": 13,
      "wind_speed": 7.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 85,
      "feels_like": 18.4,
      "wind_gust": 17.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T23:00",
      "temperature": 17.3,
      "precipitation_probability": 22,
      "wind_speed": 7.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 88,
      "feels_like": 18,
      "wind_gust": 12.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T00:00",
      "temperature": 17,
      "precipitation_probability": 29,
      "wind_speed": 7.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 91,
      "feels_like": 17.8,
      "wind_gust": 9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T01:00",
      "temperature": 16.8,
      "precipitation_probability": 35,
      "wind_speed": 5.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.7,
      "wind_gust": 7.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T02:00",
      "temperature": 16.7,
      "precipitation_probability": 40,
      "wind_speed": 4.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.8,
      "wind_gust": 7.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T03:00",
      "temperature": 16.6,
      "precipitation_probability": 41,
      "wind_speed": 3.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.9,
      "wind_gust": 7.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T04:00",
      "temperature": 16.3,
      "precipitation_probability": 35,
      "wind_speed": 3.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 93,
      "feels_like": 17.5,
      "wind_gust": 6.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-10T05:00",
      "temperature": 16,
      "precipitation_probability": 26,
      "wind_speed": 4.9,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 95,
      "feels_like": 16.9,
      "wind_gust": 5.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-10T06:00",
      "temperature": 16,
      "precipitation_probability": 20,
      "wind_speed": 5.3,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 95,
      "feels_like": 16.9,
      "wind_gust": 5.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-10T07:00",
      "temperature": 16.4,
      "precipitation_probability": 21,
      "wind_speed": 4.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 93,
      "feels_like": 17.4,
      "wind_gust": 8.6,
      "uv_index": 0.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T08:00",
      "temperature": 17,
      "precipitation_probability": 26,
      "wind_speed": 7.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 91,
      "feels_like": 17.8,
      "wind_gust": 13,
      "uv_index": 0.3,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T09:00",
      "temperature": 18.1,
      "precipitation_probability": 31,
      "wind_speed": 10,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 85,
      "feels_like": 18.5,
      "wind_gust": 16.9,
      "uv_index": 1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T10:00",
      "temperature": 19.7,
      "precipitation_probability": 36,
      "wind_speed": 10.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 75,
      "feels_like": 19.9,
      "wind_gust": 19.4,
      "uv_index": 2.6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T11:00",
      "temperature": 21.7,
      "precipitation_probability": 40,
      "wind_speed": 10.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 64,
      "feels_like": 21.7,
      "wind_gust": 21.2,
      "uv_index": 4.75,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T12:00",
      "temperature": 23.3,
      "precipitation_probability": 41,
      "wind_speed": 10.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 57,
      "feels_like": 24.1,
      "wind_gust": 23,
      "uv_index": 6.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T13:00",
      "temperature": 24.2,
      "precipitation_probability": 33,
      "wind_speed": 11.3,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 53,
      "feels_like": 25.3,
      "wind_gust": 24.8,
      "uv_index": 7.4,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-10T14:00",
      "temperature": 24.8,
      "precipitation_probability": 22,
      "wind_speed": 12.1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 50,
      "feels_like": 25.7,
      "wind_gust": 26.6,
      "uv_index": 7.95,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-10T15:00",
      "temperature": 24.8,
      "precipitation_probability": 14,
      "wind_speed": 12.2,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 50,
      "feels_like": 25.2,
      "wind_gust": 28.1,
      "uv_index": 7.8,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-10T16:00",
      "temperature": 23.9,
      "precipitation_probability": 14,
      "wind_speed": 11.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 52,
      "feels_like": 23.6,
      "wind_gust": 29.9,
      "uv_index": 6.5,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T17:00",
      "temperature": 22.5,
      "precipitation_probability": 19,
      "wind_speed": 10.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 56,
      "feels_like": 22,
      "wind_gust": 31.3,
      "uv_index": 4.45,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T18:00",
      "temperature": 21.1,
      "precipitation_probability": 22,
      "wind_speed": 9.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 62,
      "feels_like": 20.9,
      "wind_gust": 31,
      "uv_index": 2.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T19:00",
      "temperature": 19.9,
      "precipitation_probability": 22,
      "wind_speed": 6.8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 68,
      "feels_like": 20.1,
      "wind_gust": 28.1,
      "uv_index": 1.5,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-10T20:00",
      "temperature": 18.7,
      "precipitation_probability": 20,
      "wind_speed": 6.5,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 75,
      "feels_like": 19.1,
      "wind_gust": 23.4,
      "uv_index": 0.6,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-10T21:00",
      "temperature": 17.8,
      "precipitation_probability": 20,
      "wind_speed": 7.8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 82,
      "feels_like": 18.2,
      "wind_gust": 19.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-10T22:00",
      "temperature": 17.3,
      "precipitation_probability": 23,
      "wind_speed": 7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 86,
      "feels_like": 17.9,
      "wind_gust": 15.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T23:00",
      "temperature": 17.1,
      "precipitation_probability": 28,
      "wind_speed": 5.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 89,
      "feels_like": 18.1,
      "wind_gust": 12.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T00:00",
      "temperature": 17,
      "precipitation_probability": 32,
      "wind_speed": 4.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 91,
      "feels_like": 18.1,
      "wind_gust": 10.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T01:00",
      "temperature": 16.5,
      "precipitation_probability": 36,
      "wind_speed": 5.3,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 91,
      "feels_like": 17.4,
      "wind_gust": 9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-11T02:00",
      "temperature": 16.5,
      "precipitation_probability": 39,
      "wind_speed": 5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 92,
      "feels_like": 17.5,
      "wind_gust": 9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-11T03:00",
      "temperature": 16.5,
      "precipitation_probability": 41,
      "wind_speed": 4.9,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 93,
      "feels_like": 17.5,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-11T04:00",
      "temperature": 16.5,
      "precipitation_probability": 42,
      "wind_speed": 4.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 17.5,
      "wind_gust": 6.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T05:00",
      "temperature": 16.5,
      "precipitation_probability": 41,
      "wind_speed": 5.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 17.5,
      "wind_gust": 4.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T06:00",
      "temperature": 16.6,
      "precipitation_probability": 41,
      "wind_speed": 5.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 92,
      "feels_like": 17.5,
      "wind_gust": 3.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T07:00",
      "temperature": 16.8,
      "precipitation_probability": 40,
      "wind_speed": 5.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 91,
      "feels_like": 17.7,
      "wind_gust": 5.8,
      "uv_index": 0.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T08:00",
      "temperature": 17.1,
      "precipitation_probability": 39,
      "wind_speed": 6.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 89,
      "feels_like": 17.9,
      "wind_gust": 9.7,
      "uv_index": 0.3,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T09:00",
      "temperature": 17.6,
      "precipitation_probability": 39,
      "wind_speed": 6.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 85,
      "feels_like": 18.2,
      "wind_gust": 13.7,
      "uv_index": 0.95,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T10:00",
      "temperature": 18.4,
      "precipitation_probability": 39,
      "wind_speed": 7.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 79,
      "feels_like": 18.8,
      "wind_gust": 16.9,
      "uv_index": 2.45,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T11:00",
      "temperature": 19.7,
      "precipitation_probability": 40,
      "wind_speed": 9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 71,
      "feels_like": 19.7,
      "wind_gust": 20.2,
      "uv_index": 4.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T12:00",
      "temperature": 21,
      "precipitation_probability": 41,
      "wind_speed": 10.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 64,
      "feels_like": 20.8,
      "wind_gust": 23,
      "uv_index": 6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T13:00",
      "temperature": 22.3,
      "precipitation_probability": 42,
      "wind_speed": 11.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 57,
      "feels_like": 22.4,
      "wind_gust": 25.9,
      "uv_index": 7.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T14:00",
      "temperature": 23.3,
      "precipitation_probability": 42,
      "wind_speed": 12.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 53,
      "feels_like": 23.3,
      "wind_gust": 29.2,
      "uv_index": 7.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T15:00",
      "temperature": 23.6,
      "precipitation_probability": 41,
      "wind_speed": 12.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 52,
      "feels_like": 23.4,
      "wind_gust": 31,
      "uv_index": 7.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T16:00",
      "temperature": 23.3,
      "precipitation_probability": 38,
      "wind_speed": 12.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 53,
      "feels_like": 22.5,
      "wind_gust": 31.7,
      "uv_index": 6.6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T17:00",
      "temperature": 22.3,
      "precipitation_probability": 33,
      "wind_speed": 11.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 58,
      "feels_like": 21.7,
      "wind_gust": 31.7,
      "uv_index": 4.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T18:00",
      "temperature": 21.1,
      "precipitation_probability": 29,
      "wind_speed": 10.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 64,
      "feels_like": 20.8,
      "wind_gust": 30.6,
      "uv_index": 3,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T19:00",
      "temperature": 19.7,
      "precipitation_probability": 25,
      "wind_speed": 10.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 72,
      "feels_like": 19.7,
      "wind_gust": 28.4,
      "uv_index": 1.75,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T20:00",
      "temperature": 18.5,
      "precipitation_probability": 22,
      "wind_speed": 9.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 80,
      "feels_like": 18.7,
      "wind_gust": 25.2,
      "uv_index": 0.75,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T21:00",
      "temperature": 17.6,
      "precipitation_probability": 22,
      "wind_speed": 8.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 86,
      "feels_like": 18,
      "wind_gust": 22.3,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T22:00",
      "temperature": 17,
      "precipitation_probability": 27,
      "wind_speed": 8.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 90,
      "feels_like": 17.6,
      "wind_gust": 20.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T23:00",
      "temperature": 16.7,
      "precipitation_probability": 34,
      "wind_speed": 7.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 17.4,
      "wind_gust": 18.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    }
  ],
  "daily": [
    {
      "date": "2026-06-05",
      "temp_min": 13.3,
      "temp_max": 25.9,
      "precipitation_sum": 1.1,
      "sunrise": "2026-06-05T06:29",
      "sunset": "2026-06-05T18:32",
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "precipitation_probability": 20,
      "wind_max": 10.9,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "date": "2026-06-06",
      "temp_min": 16.1,
      "temp_max": 25.7,
      "precipitation_sum": 1.8,
      "sunrise": "2026-06-06T06:29",
      "sunset": "2026-06-06T18:32",
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "precipitation_probability": 45,
      "wind_max": 12.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "date": "2026-06-07",
      "temp_min": 15.5,
      "temp_max": 25.1,
      "precipitation_sum": 1.4,
      "sunrise": "2026-06-07T06:30",
      "sunset": "2026-06-07T18:33",
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "precipitation_probability": 35,
      "wind_max": 12.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "date": "2026-06-08",
      "temp_min": 16.1,
      "temp_max": 23.5,
      "precipitation_sum": 6.3,
      "sunrise": "2026-06-08T06:30",
      "sunset": "2026-06-08T18:33",
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "precipitation_probability": 56,
      "wind_max": 11.7,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "date": "2026-06-09",
      "temp_min": 15.5,
      "temp_max": 24.9,
      "precipitation_sum": 2.1,
      "sunrise": "2026-06-09T06:30",
      "sunset": "2026-06-09T18:33",
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "precipitation_probability": 47,
      "wind_max": 11.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "date": "2026-06-10",
      "temp_min": 16,
      "temp_max": 24.8,
      "precipitation_sum": 2.2,
      "sunrise": "2026-06-10T06:30",
      "sunset": "2026-06-10T18:33",
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "precipitation_probability": 41,
      "wind_max": 12.2,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "date": "2026-06-11",
      "temp_min": 16.5,
      "temp_max": 23.6,
      "precipitation_sum": 4.9,
      "sunrise": "2026-06-11T06:30",
      "sunset": "2026-06-11T18:33",
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "precipitation_probability": 42,
      "wind_max": 12.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    }
  ],
  "client_geo": {
    "country": "ZZ",
    "ip_hash": "f2bbfbb19f617ba7"
  }
}
```
---

### 3. `GET /v1/weather-geo`
**Purpose:** Return current weather conditions for a named location

**When called:** On HTTP request (not polled)  
**Key query params:**

| Param | Type | Required | Notes |
|---|---|---|---|
| `location` | string | ✅ | City, region, or named location |
| `ai` | boolean | optional | Use `false` to avoid AI quota use |

**Used for:** Optional user-friendly lookup before storing a subscription
```json
{
  "location": {
    "lat": 6.4323373,
    "lon": 3.3948028,
    "timezone": "Africa/Lagos",
    "requested_lat": 6.4474,
    "requested_lon": 3.3903,
    "country": "NG"
  },
  "current": {
    "time": "2026-06-05T09:45",
    "temperature": 28,
    "wind_speed": 4.4,
    "wind_direction": 249,
    "condition_code": "3",
    "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
    "icon_path": "icons/weather/png/wmo-3-day-128.png"
  },
  "hourly": [
    {
      "time": "2026-06-05T00:00",
      "temperature": 27.9,
      "precipitation_probability": 8,
      "wind_speed": 11.2,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 81,
      "feels_like": 32.5,
      "wind_gust": 15.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-05T01:00",
      "temperature": 27.7,
      "precipitation_probability": 10,
      "wind_speed": 5.2,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 83,
      "feels_like": 33.3,
      "wind_gust": 13.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-05T02:00",
      "temperature": 27.2,
      "precipitation_probability": 13,
      "wind_speed": 3.4,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 87,
      "feels_like": 33.3,
      "wind_gust": 11.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-05T03:00",
      "temperature": 27,
      "precipitation_probability": 17,
      "wind_speed": 4.9,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 89,
      "feels_like": 33.1,
      "wind_gust": 7.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-05T04:00",
      "temperature": 26.9,
      "precipitation_probability": 20,
      "wind_speed": 5.2,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 90,
      "feels_like": 32.9,
      "wind_gust": 5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-05T05:00",
      "temperature": 26.5,
      "precipitation_probability": 21,
      "wind_speed": 5.4,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 91,
      "feels_like": 32.5,
      "wind_gust": 4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-05T06:00",
      "temperature": 26.3,
      "precipitation_probability": 22,
      "wind_speed": 4.6,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 92,
      "feels_like": 32.3,
      "wind_gust": 5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-05T07:00",
      "temperature": 26.3,
      "precipitation_probability": 24,
      "wind_speed": 4.4,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 92,
      "feels_like": 32.3,
      "wind_gust": 4.7,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-05T08:00",
      "temperature": 26.6,
      "precipitation_probability": 26,
      "wind_speed": 4.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 88,
      "feels_like": 32.4,
      "wind_gust": 7.6,
      "uv_index": 0.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-05T09:00",
      "temperature": 26.9,
      "precipitation_probability": 29,
      "wind_speed": 2.8,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "humidity": 87,
      "feels_like": 32.9,
      "wind_gust": 9.7,
      "uv_index": 2.2,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "time": "2026-06-05T10:00",
      "temperature": 28.3,
      "precipitation_probability": 37,
      "wind_speed": 4.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 78,
      "feels_like": 33.8,
      "wind_gust": 11.2,
      "uv_index": 4.1,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-05T11:00",
      "temperature": 29,
      "precipitation_probability": 55,
      "wind_speed": 5.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 75,
      "feels_like": 34.5,
      "wind_gust": 14.8,
      "uv_index": 5.9,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-05T12:00",
      "temperature": 29,
      "precipitation_probability": 78,
      "wind_speed": 8.3,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 76,
      "feels_like": 34.9,
      "wind_gust": 18.4,
      "uv_index": 7.4,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-05T13:00",
      "temperature": 29.1,
      "precipitation_probability": 94,
      "wind_speed": 12.2,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 75,
      "feels_like": 35.4,
      "wind_gust": 20.5,
      "uv_index": 8.25,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-05T14:00",
      "temperature": 29.1,
      "precipitation_probability": 98,
      "wind_speed": 13.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 75,
      "feels_like": 35,
      "wind_gust": 23.4,
      "uv_index": 5.85,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-05T15:00",
      "temperature": 28.7,
      "precipitation_probability": 96,
      "wind_speed": 14.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 76,
      "feels_like": 33.9,
      "wind_gust": 24.5,
      "uv_index": 6.75,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-05T16:00",
      "temperature": 28.6,
      "precipitation_probability": 92,
      "wind_speed": 15.5,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "humidity": 77,
      "feels_like": 32.4,
      "wind_gust": 25.9,
      "uv_index": 5,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "time": "2026-06-05T17:00",
      "temperature": 28.3,
      "precipitation_probability": 87,
      "wind_speed": 15.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 77,
      "feels_like": 32,
      "wind_gust": 27.4,
      "uv_index": 2.6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-05T18:00",
      "temperature": 27.8,
      "precipitation_probability": 79,
      "wind_speed": 15.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 80,
      "feels_like": 31.6,
      "wind_gust": 27.4,
      "uv_index": 0.95,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-05T19:00",
      "temperature": 27.5,
      "precipitation_probability": 69,
      "wind_speed": 14.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 82,
      "feels_like": 31.7,
      "wind_gust": 25.2,
      "uv_index": 0.1,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-05T20:00",
      "temperature": 26.6,
      "precipitation_probability": 53,
      "wind_speed": 11.8,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 86,
      "feels_like": 31,
      "wind_gust": 21.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-05T21:00",
      "temperature": 26.7,
      "precipitation_probability": 34,
      "wind_speed": 12.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 86,
      "feels_like": 31.2,
      "wind_gust": 20.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-05T22:00",
      "temperature": 26.9,
      "precipitation_probability": 22,
      "wind_speed": 12.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 86,
      "feels_like": 31.4,
      "wind_gust": 22.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-05T23:00",
      "temperature": 27.2,
      "precipitation_probability": 21,
      "wind_speed": 13.4,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 84,
      "feels_like": 31.4,
      "wind_gust": 22.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-06T00:00",
      "temperature": 26.9,
      "precipitation_probability": 26,
      "wind_speed": 13.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 85,
      "feels_like": 31.1,
      "wind_gust": 20.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T01:00",
      "temperature": 26.3,
      "precipitation_probability": 35,
      "wind_speed": 11.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 86,
      "feels_like": 30.7,
      "wind_gust": 17.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T02:00",
      "temperature": 25,
      "precipitation_probability": 48,
      "wind_speed": 7.5,
      "condition_code": "81",
      "icon": "https://cdn.weather-ai.co/icons/default/81_rain_showers_moderate_night.svg",
      "humidity": 93,
      "feels_like": 29.8,
      "wind_gust": 14.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-81-night-128.png"
    },
    {
      "time": "2026-06-06T03:00",
      "temperature": 25.3,
      "precipitation_probability": 65,
      "wind_speed": 2,
      "condition_code": "80",
      "icon": "https://cdn.weather-ai.co/icons/default/80_rain_showers_light_night.svg",
      "humidity": 92,
      "feels_like": 30.9,
      "wind_gust": 13,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-80-night-128.png"
    },
    {
      "time": "2026-06-06T04:00",
      "temperature": 25.3,
      "precipitation_probability": 76,
      "wind_speed": 1.5,
      "condition_code": "80",
      "icon": "https://cdn.weather-ai.co/icons/default/80_rain_showers_light_night.svg",
      "humidity": 91,
      "feels_like": 31,
      "wind_gust": 11.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-80-night-128.png"
    },
    {
      "time": "2026-06-06T05:00",
      "temperature": 24.6,
      "precipitation_probability": 77,
      "wind_speed": 7.8,
      "condition_code": "80",
      "icon": "https://cdn.weather-ai.co/icons/default/80_rain_showers_light_night.svg",
      "humidity": 94,
      "feels_like": 29.2,
      "wind_gust": 9.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-80-night-128.png"
    },
    {
      "time": "2026-06-06T06:00",
      "temperature": 24.5,
      "precipitation_probability": 73,
      "wind_speed": 3.4,
      "condition_code": "63",
      "icon": "https://cdn.weather-ai.co/icons/default/63_rain_moderate_night.svg",
      "humidity": 92,
      "feels_like": 29.5,
      "wind_gust": 7.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-63-night-128.png"
    },
    {
      "time": "2026-06-06T07:00",
      "temperature": 24.5,
      "precipitation_probability": 69,
      "wind_speed": 4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 91,
      "feels_like": 29.3,
      "wind_gust": 5.4,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T08:00",
      "temperature": 25,
      "precipitation_probability": 65,
      "wind_speed": 4.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 89,
      "feels_like": 29.9,
      "wind_gust": 6.5,
      "uv_index": 0.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T09:00",
      "temperature": 26.1,
      "precipitation_probability": 62,
      "wind_speed": 2.2,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_day.svg",
      "humidity": 85,
      "feels_like": 31.5,
      "wind_gust": 8.3,
      "uv_index": 2.15,
      "icon_path": "icons/weather/png/wmo-1-day-128.png"
    },
    {
      "time": "2026-06-06T10:00",
      "temperature": 27.4,
      "precipitation_probability": 63,
      "wind_speed": 1.3,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 80,
      "feels_like": 33,
      "wind_gust": 8.6,
      "uv_index": 1.25,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-06T11:00",
      "temperature": 28.1,
      "precipitation_probability": 73,
      "wind_speed": 7.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 78,
      "feels_like": 33.6,
      "wind_gust": 15.1,
      "uv_index": 1.55,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T12:00",
      "temperature": 27.4,
      "precipitation_probability": 88,
      "wind_speed": 10.2,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "humidity": 81,
      "feels_like": 32.3,
      "wind_gust": 20.5,
      "uv_index": 4.25,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "time": "2026-06-06T13:00",
      "temperature": 28,
      "precipitation_probability": 98,
      "wind_speed": 13.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 79,
      "feels_like": 33,
      "wind_gust": 22.7,
      "uv_index": 7.95,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T14:00",
      "temperature": 27.6,
      "precipitation_probability": 100,
      "wind_speed": 14.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 81,
      "feels_like": 32.9,
      "wind_gust": 22.7,
      "uv_index": 7.15,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T15:00",
      "temperature": 28,
      "precipitation_probability": 100,
      "wind_speed": 13.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 77,
      "feels_like": 32.9,
      "wind_gust": 23.4,
      "uv_index": 6.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T16:00",
      "temperature": 27.9,
      "precipitation_probability": 96,
      "wind_speed": 17,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 77,
      "feels_like": 31.1,
      "wind_gust": 23.4,
      "uv_index": 4.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T17:00",
      "temperature": 27.8,
      "precipitation_probability": 88,
      "wind_speed": 17.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 76,
      "feels_like": 30.7,
      "wind_gust": 21.6,
      "uv_index": 3,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T18:00",
      "temperature": 27.2,
      "precipitation_probability": 76,
      "wind_speed": 14.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 80,
      "feels_like": 30.8,
      "wind_gust": 21.6,
      "uv_index": 1.5,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-06T19:00",
      "temperature": 27.2,
      "precipitation_probability": 65,
      "wind_speed": 12.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 80,
      "feels_like": 31.2,
      "wind_gust": 21.2,
      "uv_index": 0.3,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T20:00",
      "temperature": 26.5,
      "precipitation_probability": 53,
      "wind_speed": 9.8,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 84,
      "feels_like": 30.8,
      "wind_gust": 20.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-06T21:00",
      "temperature": 26.3,
      "precipitation_probability": 41,
      "wind_speed": 9.2,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 89,
      "feels_like": 31.2,
      "wind_gust": 17.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-06T22:00",
      "temperature": 26.3,
      "precipitation_probability": 35,
      "wind_speed": 8.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 90,
      "feels_like": 31.3,
      "wind_gust": 15.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-06T23:00",
      "temperature": 26.2,
      "precipitation_probability": 40,
      "wind_speed": 9.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 89,
      "feels_like": 31.1,
      "wind_gust": 15.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-07T00:00",
      "temperature": 25.9,
      "precipitation_probability": 52,
      "wind_speed": 9.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 90,
      "feels_like": 30.6,
      "wind_gust": 14.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-07T01:00",
      "temperature": 26,
      "precipitation_probability": 63,
      "wind_speed": 7.4,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 91,
      "feels_like": 31.2,
      "wind_gust": 13.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-07T02:00",
      "temperature": 25.7,
      "precipitation_probability": 70,
      "wind_speed": 6.9,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 91,
      "feels_like": 30.9,
      "wind_gust": 12.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-07T03:00",
      "temperature": 25.4,
      "precipitation_probability": 76,
      "wind_speed": 5.5,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 94,
      "feels_like": 30.9,
      "wind_gust": 11.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-07T04:00",
      "temperature": 25.6,
      "precipitation_probability": 80,
      "wind_speed": 3.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 31.3,
      "wind_gust": 8.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-07T05:00",
      "temperature": 25,
      "precipitation_probability": 82,
      "wind_speed": 5.7,
      "condition_code": "80",
      "icon": "https://cdn.weather-ai.co/icons/default/80_rain_showers_light_night.svg",
      "humidity": 94,
      "feels_like": 30.1,
      "wind_gust": 10.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-80-night-128.png"
    },
    {
      "time": "2026-06-07T06:00",
      "temperature": 25.2,
      "precipitation_probability": 82,
      "wind_speed": 2.4,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 92,
      "feels_like": 30.8,
      "wind_gust": 9.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-07T07:00",
      "temperature": 25.5,
      "precipitation_probability": 82,
      "wind_speed": 3.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 91,
      "feels_like": 31,
      "wind_gust": 12.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T08:00",
      "temperature": 25.5,
      "precipitation_probability": 83,
      "wind_speed": 7.9,
      "condition_code": "55",
      "icon": "https://cdn.weather-ai.co/icons/default/55_drizzle_dense_day.svg",
      "humidity": 90,
      "feels_like": 30.3,
      "wind_gust": 11.5,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-55-day-128.png"
    },
    {
      "time": "2026-06-07T09:00",
      "temperature": 25.7,
      "precipitation_probability": 85,
      "wind_speed": 5.9,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "humidity": 88,
      "feels_like": 30.7,
      "wind_gust": 10.8,
      "uv_index": 1.7,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "time": "2026-06-07T10:00",
      "temperature": 26.9,
      "precipitation_probability": 88,
      "wind_speed": 4.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 82,
      "feels_like": 32,
      "wind_gust": 9.7,
      "uv_index": 3.75,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T11:00",
      "temperature": 27.4,
      "precipitation_probability": 92,
      "wind_speed": 6.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 81,
      "feels_like": 32.4,
      "wind_gust": 10.1,
      "uv_index": 5.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T12:00",
      "temperature": 28.3,
      "precipitation_probability": 97,
      "wind_speed": 5.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 78,
      "feels_like": 34.7,
      "wind_gust": 17.6,
      "uv_index": 7.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T13:00",
      "temperature": 28.5,
      "precipitation_probability": 100,
      "wind_speed": 10.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 76,
      "feels_like": 34.3,
      "wind_gust": 20.5,
      "uv_index": 7.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T14:00",
      "temperature": 28,
      "precipitation_probability": 100,
      "wind_speed": 13,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 78,
      "feels_like": 33,
      "wind_gust": 21.6,
      "uv_index": 7.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T15:00",
      "temperature": 27.9,
      "precipitation_probability": 100,
      "wind_speed": 12.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 78,
      "feels_like": 32.9,
      "wind_gust": 21.6,
      "uv_index": 5.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T16:00",
      "temperature": 28,
      "precipitation_probability": 94,
      "wind_speed": 10.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 77,
      "feels_like": 32.4,
      "wind_gust": 21.6,
      "uv_index": 4.9,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T17:00",
      "temperature": 27.8,
      "precipitation_probability": 81,
      "wind_speed": 11.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 78,
      "feels_like": 32,
      "wind_gust": 21.6,
      "uv_index": 1.9,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-07T18:00",
      "temperature": 27.5,
      "precipitation_probability": 65,
      "wind_speed": 11.3,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_day.svg",
      "humidity": 80,
      "feels_like": 31.7,
      "wind_gust": 21.2,
      "uv_index": 0.2,
      "icon_path": "icons/weather/png/wmo-1-day-128.png"
    },
    {
      "time": "2026-06-07T19:00",
      "temperature": 27.2,
      "precipitation_probability": 49,
      "wind_speed": 8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 81,
      "feels_like": 32,
      "wind_gust": 20.9,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-07T20:00",
      "temperature": 27.2,
      "precipitation_probability": 36,
      "wind_speed": 7.3,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 83,
      "feels_like": 32.2,
      "wind_gust": 18.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-07T21:00",
      "temperature": 26.9,
      "precipitation_probability": 24,
      "wind_speed": 5.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 84,
      "feels_like": 32.1,
      "wind_gust": 16.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-07T22:00",
      "temperature": 26.8,
      "precipitation_probability": 16,
      "wind_speed": 4.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 86,
      "feels_like": 32.4,
      "wind_gust": 13.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-07T23:00",
      "temperature": 26.8,
      "precipitation_probability": 15,
      "wind_speed": 5,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 88,
      "feels_like": 32.5,
      "wind_gust": 11.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-08T00:00",
      "temperature": 26.6,
      "precipitation_probability": 18,
      "wind_speed": 5.1,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 90,
      "feels_like": 32.4,
      "wind_gust": 9.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-08T01:00",
      "temperature": 26.4,
      "precipitation_probability": 20,
      "wind_speed": 5.6,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_night.svg",
      "humidity": 91,
      "feels_like": 32.1,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-1-night-128.png"
    },
    {
      "time": "2026-06-08T02:00",
      "temperature": 26,
      "precipitation_probability": 20,
      "wind_speed": 5.6,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 93,
      "feels_like": 31.8,
      "wind_gust": 8.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-08T03:00",
      "temperature": 25.8,
      "precipitation_probability": 19,
      "wind_speed": 5.6,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 94,
      "feels_like": 31.5,
      "wind_gust": 7.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-08T04:00",
      "temperature": 25.6,
      "precipitation_probability": 20,
      "wind_speed": 4.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 94,
      "feels_like": 31.4,
      "wind_gust": 8.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-08T05:00",
      "temperature": 25.4,
      "precipitation_probability": 23,
      "wind_speed": 5.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 94,
      "feels_like": 30.9,
      "wind_gust": 8.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-08T06:00",
      "temperature": 25.3,
      "precipitation_probability": 26,
      "wind_speed": 6.4,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 92,
      "feels_like": 30.4,
      "wind_gust": 10.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-08T07:00",
      "temperature": 25.3,
      "precipitation_probability": 29,
      "wind_speed": 5.7,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 92,
      "feels_like": 30.5,
      "wind_gust": 10.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-08T08:00",
      "temperature": 26.1,
      "precipitation_probability": 28,
      "wind_speed": 5.9,
      "condition_code": "1",
      "icon": "https://cdn.weather-ai.co/icons/default/1_mainly_clear_day.svg",
      "humidity": 89,
      "feels_like": 31.4,
      "wind_gust": 11.5,
      "uv_index": 0.75,
      "icon_path": "icons/weather/png/wmo-1-day-128.png"
    },
    {
      "time": "2026-06-08T09:00",
      "temperature": 27.3,
      "precipitation_probability": 27,
      "wind_speed": 6.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 82,
      "feels_like": 32.4,
      "wind_gust": 13,
      "uv_index": 2.35,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-08T10:00",
      "temperature": 28.3,
      "precipitation_probability": 31,
      "wind_speed": 6.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 77,
      "feels_like": 33.2,
      "wind_gust": 14.8,
      "uv_index": 4.25,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T11:00",
      "temperature": 28.7,
      "precipitation_probability": 46,
      "wind_speed": 8.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 75,
      "feels_like": 33.5,
      "wind_gust": 17.3,
      "uv_index": 6.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T12:00",
      "temperature": 29,
      "precipitation_probability": 67,
      "wind_speed": 9.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 77,
      "feels_like": 34.9,
      "wind_gust": 20.2,
      "uv_index": 5.5,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T13:00",
      "temperature": 28.9,
      "precipitation_probability": 84,
      "wind_speed": 13.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 79,
      "feels_like": 34.4,
      "wind_gust": 22.7,
      "uv_index": 5.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T14:00",
      "temperature": 29,
      "precipitation_probability": 92,
      "wind_speed": 14.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 77,
      "feels_like": 34.4,
      "wind_gust": 24.1,
      "uv_index": 4.1,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T15:00",
      "temperature": 28.1,
      "precipitation_probability": 96,
      "wind_speed": 16.4,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "humidity": 79,
      "feels_like": 31.9,
      "wind_gust": 24.8,
      "uv_index": 5.25,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "time": "2026-06-08T16:00",
      "temperature": 28.3,
      "precipitation_probability": 96,
      "wind_speed": 12.4,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "humidity": 78,
      "feels_like": 32.6,
      "wind_gust": 25.2,
      "uv_index": 4.8,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "time": "2026-06-08T17:00",
      "temperature": 28.4,
      "precipitation_probability": 93,
      "wind_speed": 12.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 78,
      "feels_like": 32.6,
      "wind_gust": 24.8,
      "uv_index": 3.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T18:00",
      "temperature": 28.1,
      "precipitation_probability": 86,
      "wind_speed": 11.1,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 80,
      "feels_like": 32.7,
      "wind_gust": 24.1,
      "uv_index": 0.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-08T19:00",
      "temperature": 26.5,
      "precipitation_probability": 75,
      "wind_speed": 9.8,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 88,
      "feels_like": 31.3,
      "wind_gust": 22.3,
      "uv_index": 0.3,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-08T20:00",
      "temperature": 25.8,
      "precipitation_probability": 55,
      "wind_speed": 7.3,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 91,
      "feels_like": 31,
      "wind_gust": 19.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-08T21:00",
      "temperature": 25.2,
      "precipitation_probability": 31,
      "wind_speed": 4.2,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 93,
      "feels_like": 30.7,
      "wind_gust": 15.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-08T22:00",
      "temperature": 24.8,
      "precipitation_probability": 16,
      "wind_speed": 1.8,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 95,
      "feels_like": 30.6,
      "wind_gust": 12.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-08T23:00",
      "temperature": 24.8,
      "precipitation_probability": 17,
      "wind_speed": 0.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 94,
      "feels_like": 30.6,
      "wind_gust": 10.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T00:00",
      "temperature": 24.9,
      "precipitation_probability": 26,
      "wind_speed": 1.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 30.6,
      "wind_gust": 8.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T01:00",
      "temperature": 25,
      "precipitation_probability": 35,
      "wind_speed": 2.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 91,
      "feels_like": 30.5,
      "wind_gust": 7.2,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T02:00",
      "temperature": 25,
      "precipitation_probability": 40,
      "wind_speed": 3.2,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 92,
      "feels_like": 30.3,
      "wind_gust": 6.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T03:00",
      "temperature": 24.8,
      "precipitation_probability": 45,
      "wind_speed": 4.6,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 93,
      "feels_like": 30,
      "wind_gust": 5.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T04:00",
      "temperature": 24.7,
      "precipitation_probability": 51,
      "wind_speed": 5.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 94,
      "feels_like": 29.8,
      "wind_gust": 5.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T05:00",
      "temperature": 24.6,
      "precipitation_probability": 58,
      "wind_speed": 6,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 95,
      "feels_like": 29.6,
      "wind_gust": 5.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T06:00",
      "temperature": 24.5,
      "precipitation_probability": 66,
      "wind_speed": 6,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 95,
      "feels_like": 29.5,
      "wind_gust": 6.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T07:00",
      "temperature": 24.7,
      "precipitation_probability": 71,
      "wind_speed": 5.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 94,
      "feels_like": 29.8,
      "wind_gust": 7.6,
      "uv_index": 0.05,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-09T08:00",
      "temperature": 25.5,
      "precipitation_probability": 70,
      "wind_speed": 4.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 91,
      "feels_like": 30.9,
      "wind_gust": 9,
      "uv_index": 0.8,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-09T09:00",
      "temperature": 26.7,
      "precipitation_probability": 65,
      "wind_speed": 4.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 86,
      "feels_like": 32.1,
      "wind_gust": 10.8,
      "uv_index": 2.1,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-09T10:00",
      "temperature": 27.6,
      "precipitation_probability": 65,
      "wind_speed": 6.5,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 82,
      "feels_like": 32.8,
      "wind_gust": 13,
      "uv_index": 4.3,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-09T11:00",
      "temperature": 27.9,
      "precipitation_probability": 74,
      "wind_speed": 9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 80,
      "feels_like": 32.7,
      "wind_gust": 16.2,
      "uv_index": 3.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T12:00",
      "temperature": 27.9,
      "precipitation_probability": 87,
      "wind_speed": 11.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 79,
      "feels_like": 32.2,
      "wind_gust": 19.4,
      "uv_index": 1.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T13:00",
      "temperature": 27.9,
      "precipitation_probability": 96,
      "wind_speed": 13.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 79,
      "feels_like": 31.8,
      "wind_gust": 22,
      "uv_index": 2.75,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T14:00",
      "temperature": 28,
      "precipitation_probability": 96,
      "wind_speed": 14.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 78,
      "feels_like": 31.9,
      "wind_gust": 22.7,
      "uv_index": 7.6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T15:00",
      "temperature": 28.2,
      "precipitation_probability": 92,
      "wind_speed": 15.4,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 78,
      "feels_like": 32.1,
      "wind_gust": 22.3,
      "uv_index": 6.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T16:00",
      "temperature": 28.2,
      "precipitation_probability": 86,
      "wind_speed": 15.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 78,
      "feels_like": 32,
      "wind_gust": 22,
      "uv_index": 4.9,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T17:00",
      "temperature": 27.9,
      "precipitation_probability": 78,
      "wind_speed": 14.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 79,
      "feels_like": 31.8,
      "wind_gust": 21.6,
      "uv_index": 2.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T18:00",
      "temperature": 27.6,
      "precipitation_probability": 69,
      "wind_speed": 12.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 81,
      "feels_like": 31.7,
      "wind_gust": 20.9,
      "uv_index": 1.35,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-09T19:00",
      "temperature": 27.3,
      "precipitation_probability": 57,
      "wind_speed": 11.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 82,
      "feels_like": 31.6,
      "wind_gust": 19.4,
      "uv_index": 0.3,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-09T20:00",
      "temperature": 27.2,
      "precipitation_probability": 41,
      "wind_speed": 10.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 83,
      "feels_like": 31.6,
      "wind_gust": 16.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T21:00",
      "temperature": 27.1,
      "precipitation_probability": 23,
      "wind_speed": 9.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 83,
      "feels_like": 31.8,
      "wind_gust": 13.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T22:00",
      "temperature": 27.1,
      "precipitation_probability": 10,
      "wind_speed": 8.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 84,
      "feels_like": 32,
      "wind_gust": 10.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-09T23:00",
      "temperature": 27,
      "precipitation_probability": 5,
      "wind_speed": 8.1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 86,
      "feels_like": 32.2,
      "wind_gust": 8.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-10T00:00",
      "temperature": 26.8,
      "precipitation_probability": 4,
      "wind_speed": 8.2,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 88,
      "feels_like": 32.1,
      "wind_gust": 7.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-10T01:00",
      "temperature": 26.6,
      "precipitation_probability": 4,
      "wind_speed": 7.9,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 90,
      "feels_like": 32,
      "wind_gust": 6.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-10T02:00",
      "temperature": 26.2,
      "precipitation_probability": 5,
      "wind_speed": 5.8,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 91,
      "feels_like": 31.8,
      "wind_gust": 6.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-10T03:00",
      "temperature": 25.7,
      "precipitation_probability": 7,
      "wind_speed": 3.3,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 92,
      "feels_like": 31.5,
      "wind_gust": 6.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-10T04:00",
      "temperature": 25.4,
      "precipitation_probability": 10,
      "wind_speed": 3.6,
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_night.svg",
      "humidity": 93,
      "feels_like": 31,
      "wind_gust": 6.5,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-53-night-128.png"
    },
    {
      "time": "2026-06-10T05:00",
      "temperature": 25.2,
      "precipitation_probability": 12,
      "wind_speed": 3.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 94,
      "feels_like": 30.9,
      "wind_gust": 6.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T06:00",
      "temperature": 25.2,
      "precipitation_probability": 14,
      "wind_speed": 3.5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 96,
      "feels_like": 31,
      "wind_gust": 5.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T07:00",
      "temperature": 25.5,
      "precipitation_probability": 18,
      "wind_speed": 3.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 95,
      "feels_like": 31.4,
      "wind_gust": 6.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T08:00",
      "temperature": 26.3,
      "precipitation_probability": 23,
      "wind_speed": 2.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 90,
      "feels_like": 32.3,
      "wind_gust": 7.2,
      "uv_index": 0.55,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-10T09:00",
      "temperature": 27.5,
      "precipitation_probability": 29,
      "wind_speed": 2.8,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 83,
      "feels_like": 33.4,
      "wind_gust": 8.6,
      "uv_index": 1.3,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-10T10:00",
      "temperature": 28.4,
      "precipitation_probability": 39,
      "wind_speed": 4.1,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_day.svg",
      "humidity": 78,
      "feels_like": 34,
      "wind_gust": 10.8,
      "uv_index": 2.35,
      "icon_path": "icons/weather/png/wmo-2-day-128.png"
    },
    {
      "time": "2026-06-10T11:00",
      "temperature": 28.8,
      "precipitation_probability": 58,
      "wind_speed": 6.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 77,
      "feels_like": 34.4,
      "wind_gust": 14,
      "uv_index": 3.95,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T12:00",
      "temperature": 28.9,
      "precipitation_probability": 81,
      "wind_speed": 9.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 76,
      "feels_like": 34.8,
      "wind_gust": 18,
      "uv_index": 5.75,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T13:00",
      "temperature": 29,
      "precipitation_probability": 98,
      "wind_speed": 11.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 76,
      "feels_like": 35,
      "wind_gust": 20.9,
      "uv_index": 6.85,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T14:00",
      "temperature": 29.1,
      "precipitation_probability": 100,
      "wind_speed": 12,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 76,
      "feels_like": 35,
      "wind_gust": 22.3,
      "uv_index": 6.7,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T15:00",
      "temperature": 29.1,
      "precipitation_probability": 100,
      "wind_speed": 11.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 76,
      "feels_like": 34.8,
      "wind_gust": 22.7,
      "uv_index": 5.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T16:00",
      "temperature": 29,
      "precipitation_probability": 96,
      "wind_speed": 10.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 77,
      "feels_like": 34,
      "wind_gust": 22.3,
      "uv_index": 4.75,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T17:00",
      "temperature": 28.8,
      "precipitation_probability": 82,
      "wind_speed": 10.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 78,
      "feels_like": 33.7,
      "wind_gust": 21.6,
      "uv_index": 3.5,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T18:00",
      "temperature": 28.4,
      "precipitation_probability": 62,
      "wind_speed": 9.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 79,
      "feels_like": 33.3,
      "wind_gust": 19.8,
      "uv_index": 2.05,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-10T19:00",
      "temperature": 28,
      "precipitation_probability": 49,
      "wind_speed": 8.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 81,
      "feels_like": 33.1,
      "wind_gust": 18.4,
      "uv_index": 0.9,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-10T20:00",
      "temperature": 27.8,
      "precipitation_probability": 48,
      "wind_speed": 7.4,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 84,
      "feels_like": 33.2,
      "wind_gust": 16.6,
      "uv_index": 0.35,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-10T21:00",
      "temperature": 27.5,
      "precipitation_probability": 54,
      "wind_speed": 5.9,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 87,
      "feels_like": 33.4,
      "wind_gust": 14.8,
      "uv_index": 0.1,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-10T22:00",
      "temperature": 27.3,
      "precipitation_probability": 55,
      "wind_speed": 5.2,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 89,
      "feels_like": 33.5,
      "wind_gust": 13.3,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-10T23:00",
      "temperature": 27.2,
      "precipitation_probability": 46,
      "wind_speed": 5.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 89,
      "feels_like": 33.2,
      "wind_gust": 11.9,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-11T00:00",
      "temperature": 27,
      "precipitation_probability": 33,
      "wind_speed": 5.4,
      "condition_code": "2",
      "icon": "https://cdn.weather-ai.co/icons/default/2_partly_cloudy_night.svg",
      "humidity": 91,
      "feels_like": 33.2,
      "wind_gust": 10.8,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-2-night-128.png"
    },
    {
      "time": "2026-06-11T01:00",
      "temperature": 26.8,
      "precipitation_probability": 24,
      "wind_speed": 5.2,
      "condition_code": "95",
      "icon": "https://cdn.weather-ai.co/icons/default/95_thunderstorm_night.svg",
      "humidity": 93,
      "feels_like": 33,
      "wind_gust": 10.1,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-95-night-128.png"
    },
    {
      "time": "2026-06-11T02:00",
      "temperature": 26.6,
      "precipitation_probability": 22,
      "wind_speed": 5.2,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 32.8,
      "wind_gust": 9.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T03:00",
      "temperature": 26.3,
      "precipitation_probability": 24,
      "wind_speed": 5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 94,
      "feels_like": 32.4,
      "wind_gust": 9.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T04:00",
      "temperature": 26.1,
      "precipitation_probability": 27,
      "wind_speed": 5,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 94,
      "feels_like": 32.1,
      "wind_gust": 9.7,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T05:00",
      "temperature": 25.9,
      "precipitation_probability": 31,
      "wind_speed": 4.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 31.8,
      "wind_gust": 9.4,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T06:00",
      "temperature": 25.8,
      "precipitation_probability": 37,
      "wind_speed": 4.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_night.svg",
      "humidity": 93,
      "feels_like": 31.6,
      "wind_gust": 8.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-night-128.png"
    },
    {
      "time": "2026-06-11T07:00",
      "temperature": 25.9,
      "precipitation_probability": 43,
      "wind_speed": 3.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 92,
      "feels_like": 31.7,
      "wind_gust": 8.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T08:00",
      "temperature": 26.1,
      "precipitation_probability": 51,
      "wind_speed": 2.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 90,
      "feels_like": 31.9,
      "wind_gust": 9.7,
      "uv_index": 0.6,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T09:00",
      "temperature": 26.5,
      "precipitation_probability": 59,
      "wind_speed": 2.7,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 88,
      "feels_like": 32.3,
      "wind_gust": 11.5,
      "uv_index": 1.5,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T10:00",
      "temperature": 26.9,
      "precipitation_probability": 67,
      "wind_speed": 4.9,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 85,
      "feels_like": 32.4,
      "wind_gust": 13.7,
      "uv_index": 2.5,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T11:00",
      "temperature": 27.4,
      "precipitation_probability": 75,
      "wind_speed": 7.6,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 83,
      "feels_like": 32.5,
      "wind_gust": 16.6,
      "uv_index": 3.65,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T12:00",
      "temperature": 27.7,
      "precipitation_probability": 82,
      "wind_speed": 9.8,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 81,
      "feels_like": 32.9,
      "wind_gust": 19.4,
      "uv_index": 4.9,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T13:00",
      "temperature": 28,
      "precipitation_probability": 88,
      "wind_speed": 11.3,
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "humidity": 80,
      "feels_like": 33.3,
      "wind_gust": 22,
      "uv_index": 5.8,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "time": "2026-06-11T14:00",
      "temperature": 28,
      "precipitation_probability": 91,
      "wind_speed": 12,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 80,
      "feels_like": 33.2,
      "wind_gust": 23.4,
      "uv_index": 6.3,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-11T15:00",
      "temperature": 27.9,
      "precipitation_probability": 92,
      "wind_speed": 11.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 80,
      "feels_like": 32.8,
      "wind_gust": 24.5,
      "uv_index": 6.4,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-11T16:00",
      "temperature": 27.8,
      "precipitation_probability": 91,
      "wind_speed": 11.7,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 81,
      "feels_like": 32.2,
      "wind_gust": 25.2,
      "uv_index": 6.05,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-11T17:00",
      "temperature": 27.6,
      "precipitation_probability": 90,
      "wind_speed": 11.1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 82,
      "feels_like": 32.2,
      "wind_gust": 26.3,
      "uv_index": 4.9,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-11T18:00",
      "temperature": 27.4,
      "precipitation_probability": 87,
      "wind_speed": 10.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_day.svg",
      "humidity": 83,
      "feels_like": 32,
      "wind_gust": 27.4,
      "uv_index": 3.2,
      "icon_path": "icons/weather/png/wmo-3-day-128.png"
    },
    {
      "time": "2026-06-11T19:00",
      "temperature": 27.3,
      "precipitation_probability": 82,
      "wind_speed": 10.4,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 83,
      "feels_like": 32,
      "wind_gust": 27,
      "uv_index": 1.8,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-11T20:00",
      "temperature": 27.3,
      "precipitation_probability": 74,
      "wind_speed": 10.1,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 84,
      "feels_like": 32,
      "wind_gust": 24.5,
      "uv_index": 0.95,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-11T21:00",
      "temperature": 27.3,
      "precipitation_probability": 64,
      "wind_speed": 9.8,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 84,
      "feels_like": 32.2,
      "wind_gust": 20.9,
      "uv_index": 0.4,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-11T22:00",
      "temperature": 27.3,
      "precipitation_probability": 54,
      "wind_speed": 9.4,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 84,
      "feels_like": 32.3,
      "wind_gust": 18,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    },
    {
      "time": "2026-06-11T23:00",
      "temperature": 27.4,
      "precipitation_probability": 45,
      "wind_speed": 9,
      "condition_code": "3",
      "icon": "https://cdn.weather-ai.co/icons/default/3_overcast_night.svg",
      "humidity": 84,
      "feels_like": 32.4,
      "wind_gust": 16.6,
      "uv_index": 0,
      "icon_path": "icons/weather/png/wmo-3-night-128.png"
    }
  ],
  "daily": [
    {
      "date": "2026-06-05",
      "temp_min": 26.3,
      "temp_max": 29.1,
      "precipitation_sum": 3.6,
      "sunrise": "2026-06-05T06:30",
      "sunset": "2026-06-05T18:59",
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "precipitation_probability": 98,
      "wind_max": 15.6,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "date": "2026-06-06",
      "temp_min": 24.5,
      "temp_max": 28.1,
      "precipitation_sum": 18.8,
      "sunrise": "2026-06-06T06:30",
      "sunset": "2026-06-06T18:59",
      "condition_code": "81",
      "icon": "https://cdn.weather-ai.co/icons/default/81_rain_showers_moderate_day.svg",
      "precipitation_probability": 100,
      "wind_max": 17.8,
      "icon_path": "icons/weather/png/wmo-81-day-128.png"
    },
    {
      "date": "2026-06-07",
      "temp_min": 25,
      "temp_max": 28.5,
      "precipitation_sum": 8.8,
      "sunrise": "2026-06-07T06:30",
      "sunset": "2026-06-07T18:59",
      "condition_code": "80",
      "icon": "https://cdn.weather-ai.co/icons/default/80_rain_showers_light_day.svg",
      "precipitation_probability": 100,
      "wind_max": 13,
      "icon_path": "icons/weather/png/wmo-80-day-128.png"
    },
    {
      "date": "2026-06-08",
      "temp_min": 24.8,
      "temp_max": 29,
      "precipitation_sum": 6.3,
      "sunrise": "2026-06-08T06:30",
      "sunset": "2026-06-08T19:00",
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "precipitation_probability": 96,
      "wind_max": 16.4,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "date": "2026-06-09",
      "temp_min": 24.5,
      "temp_max": 28.2,
      "precipitation_sum": 2.4,
      "sunrise": "2026-06-09T06:31",
      "sunset": "2026-06-09T19:00",
      "condition_code": "51",
      "icon": "https://cdn.weather-ai.co/icons/default/51_drizzle_light_day.svg",
      "precipitation_probability": 96,
      "wind_max": 15.4,
      "icon_path": "icons/weather/png/wmo-51-day-128.png"
    },
    {
      "date": "2026-06-10",
      "temp_min": 25.2,
      "temp_max": 29.1,
      "precipitation_sum": 3.9,
      "sunrise": "2026-06-10T06:31",
      "sunset": "2026-06-10T19:00",
      "condition_code": "53",
      "icon": "https://cdn.weather-ai.co/icons/default/53_drizzle_moderate_day.svg",
      "precipitation_probability": 100,
      "wind_max": 12,
      "icon_path": "icons/weather/png/wmo-53-day-128.png"
    },
    {
      "date": "2026-06-11",
      "temp_min": 25.8,
      "temp_max": 28,
      "precipitation_sum": 4.2,
      "sunrise": "2026-06-11T06:31",
      "sunset": "2026-06-11T19:00",
      "condition_code": "95",
      "icon": "https://cdn.weather-ai.co/icons/default/95_thunderstorm_day.svg",
      "precipitation_probability": 92,
      "wind_max": 12,
      "icon_path": "icons/weather/png/wmo-95-day-128.png"
    }
  ],
  "client_geo": {
    "country": "ZZ",
    "ip_hash": "f2bbfbb19f617ba7"
  },
  "ip_geo": {
    "country": "NG",
    "region": "Lagos",
    "city": "Lagos",
    "lat": 6.4474,
    "lon": 3.3903,
    "asn": 329024,
    "org": "LFCS1-AS",
    "ip_hash": "f2bbfbb19f617ba7",
    "source": "maxmind"
  }
}
```
---

## Project API — Endpoints Exposed

### Subscriptions

**`POST /api/subscriptions`**  
Subscribe an email + location to weather alerts.

Request body:
```json
{
  "email": "user@example.com",
  "location": {
    "lat": 6.5244,
    "lon": 3.3792,
    "label": "Lagos, Nigeria"
  },
  "alerts": ["heavy_rain", "extreme_heat", "storm", "frost", "high_wind"]
}
```
Response: `201` with subscription object including generated `id`.

---

**`GET /api/subscriptions/:id`**  
Fetch a subscription by ID.

Response: `200` with full subscription object, or `404`.

---

**`DELETE /api/subscriptions/:id`**  
Remove a subscription. Stops future alerts for that email/location pair.

Response: `204 No Content`.

---

**`GET /api/subscriptions`**  
List all active subscriptions (admin/demo use). Must require `ADMIN_API_KEY`.

Response: `200` with array.

---

### Weather (proxied + enriched)

**`GET /api/weather/current`**  
Returns current conditions for a location by calling WeatherAI `/v1/weather` under the hood.

Query params: `lat`, `lon`

---

**`GET /api/weather/forecast`**  
Returns forecast data for a location by calling WeatherAI `/v1/forecast`.

Query params: `lat`, `lon`, `days` (optional)

---

### Alerts

**`GET /api/alerts`**  
List all alerts that have been triggered and dispatched. Useful for demo/audit. Must require `ADMIN_API_KEY`.

Query params: `email` (optional filter), `location` (optional filter)

---

### Operations

**`GET /health`**
Return service health for bare-metal hosting.

Response should include:
- app status
- uptime
- SQLite connectivity
- scheduler enabled/disabled
- email delivery enabled/disabled

---

### Webhook Simulation (Demo Only)

**`POST /api/webhook/simulate`**  
Manually trigger the alert evaluation pipeline for a given location without waiting for the cron cycle. For demo and testing purposes.

Request body:
```json
{
  "lat": 6.5244,
  "lon": 3.3792
}
```
Response: `200` with any alerts that would have fired.

---

## Alert Thresholds (Default, Configurable via Env)

| Alert Type | Field | Condition |
|---|---|---|
| Heavy Rain | `precipitation_mm` | > 20mm in 24h |
| Storm Alert | `wind_speed_kph` | > 80 kph |
| Extreme Heat | `temp_max_c` | > 38°C |
| Frost Warning | `temp_min_c` | < 2°C |
| High Wind Speed | `wind_speed_kph` | > 50 kph |

All thresholds overridable via env vars (e.g. `THRESHOLD_HEAVY_RAIN_MM=20`).

---

## Stack

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node.js/TypeScript | Matches WeatherAI's inferred stack |
| Framework | Fastify | Lightweight, schema-first, good for API-only services |
| Scheduler | node-cron | Simple, no external dependency |
| Notification | Nodemailer + SMTP | Free replacement for locked SMS feature |
| Storage | SQLite | Simple persistent database for bare-metal deployment |
| Configuration | dotenv + `.env` | Keeps deployment secrets and runtime settings outside source control |
| Deployment | Bare metal | Candidate will host directly; use PM2/systemd + reverse proxy |

---

## Project Structure

```
src/
  index.ts                  # Entry point
  config.ts                 # Env vars + thresholds
  routes/
    subscriptions.ts
    weather.ts
    alerts.ts
    webhook.ts
  services/
    weatherService.ts       # Wraps WeatherAI API calls
    alertService.ts         # Threshold evaluation logic
    notificationService.ts  # Email dispatch (swappable interface)
    schedulerService.ts     # node-cron polling loop
  db/
    connection.ts           # SQLite connection/bootstrap
    migrations.ts           # Creates required tables
    repositories/
      subscriptionRepository.ts
      alertRepository.ts
  types/
    index.ts
```

---

## Environment Variables

```env
WEATHER_AI_API_KEY=         # WeatherAI API key from dashboard
DATABASE_URL=file:./data/weatherai.sqlite
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=                 # SMTP username / Gmail address
SMTP_PASSWORD=             # SMTP password / Gmail app password
SMTP_FROM="WeatherAI Alerts <alerts@example.com>"
POLL_INTERVAL_MINUTES=360  # How often to poll per location (default 6hrs)
MAX_SUBSCRIPTIONS=3         # Cap for free tier API budget
ALERT_COOLDOWN_HOURS=12     # Prevent duplicate alert emails across poll cycles
SCHEDULER_ENABLED=true      # Disable locally to avoid API usage during setup
EMAIL_DELIVERY_ENABLED=true # Disable locally to inspect email payloads without sending
ADMIN_API_KEY=              # Required for admin/demo listing endpoints
PORT=3000
```

---

## Testing Scope

Keep tests focused but meaningful:
- Alert threshold detection fires when forecast values exceed configured limits.
- Alert threshold detection does not fire below configured limits.
- Alert cooldown prevents duplicate alert emails.
- Subscription creation validates email, location, and allowed alert types.
- WeatherAI client sends Bearer auth, required query params, and `ai=false`.
- Health endpoint reports SQLite status.

---

## README Requirements

The README should make the WeatherAI integration impossible to miss:
- Clear project summary: "WeatherAI alert subscription service"
- WeatherAI endpoints used and why
- Auth format: `Authorization: Bearer <WEATHER_AI_API_KEY>`
- `ai=false` quota-preservation note
- Free-tier call budget math
- SQLite setup and migration notes
- SMTP setup notes
- Bare-metal deployment commands
- Curl examples for subscription, forecast lookup, simulated evaluation, health, and admin alert listing

---

## Next Steps for Agent

1. Scaffold project with Fastify + TypeScript
2. Implement SQLite bootstrap/migrations and repositories for subscriptions + alerts
3. Implement `weatherService.ts` — wrap `/v1/forecast`, `/v1/weather`, optional `/v1/weather-geo`; use Bearer auth and `ai=false`
4. Implement `alertService.ts` — threshold evaluation against configurable limits
5. Implement alert deduplication/cooldown using SQLite alert history
6. Implement `notificationService.ts` — Nodemailer email dispatch with `EMAIL_DELIVERY_ENABLED`
7. Implement `schedulerService.ts` — node-cron loop calling evaluate per subscription with `SCHEDULER_ENABLED`
8. Wire up all routes, including `GET /health`
9. Add admin protection for list-all subscription and alert audit endpoints
10. Add focused tests for alert evaluation, cooldown, validation, WeatherAI client, and health
11. Prepare bare-metal deployment instructions (`.env`, build, PM2/systemd, reverse proxy)
12. Write README — architecture decisions, call budget math, curl examples
13. Reply to claire@weather-ai.co with GitHub repo + live URL
