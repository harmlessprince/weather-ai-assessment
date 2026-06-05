const STORAGE_KEYS = {
  email: 'weatherai.email',
  apiBaseUrl: 'weatherai.apiBaseUrl',
};

const LOCAL_API_BASE_URL = 'http://localhost:3000';
const PRODUCTION_API_BASE_URL = 'https://weather-ai.taoforge.org';
const PRODUCTION_HOSTS = new Set(['taofeeq-weather-ai.netlify.app']);

const ALERT_TYPES = [
  ['heavy_rain', 'Heavy rain'],
  ['extreme_heat', 'Extreme heat'],
  ['frost_warning', 'Frost warning'],
  ['storm_alert', 'Storm alert'],
  ['high_wind', 'High wind'],
];

const DEFAULT_ALERTS = new Set(['heavy_rain', 'storm_alert']);

const state = {
  email: localStorage.getItem(STORAGE_KEYS.email) || '',
  apiBaseUrl:
    localStorage.getItem(STORAGE_KEYS.apiBaseUrl) || defaultApiBaseUrl(),
  selectedSubscriptionId: '',
};

const elements = {
  emailForm: document.querySelector('#emailForm'),
  email: document.querySelector('#email'),
  clearEmail: document.querySelector('#clearEmail'),
  emailStatus: document.querySelector('#emailStatus'),
  apiBaseUrl: document.querySelector('#apiBaseUrl'),
  subscriptionForm: document.querySelector('#subscriptionForm'),
  useLocation: document.querySelector('#useLocation'),
  geoHint: document.querySelector('#geoHint'),
  lat: document.querySelector('#lat'),
  lon: document.querySelector('#lon'),
  label: document.querySelector('#label'),
  alertTypes: document.querySelector('#alertTypes'),
  subscriptionStatus: document.querySelector('#subscriptionStatus'),
  activeEmail: document.querySelector('#activeEmail'),
  refreshSubscriptions: document.querySelector('#refreshSubscriptions'),
  subscriptionsList: document.querySelector('#subscriptionsList'),
  listStatus: document.querySelector('#listStatus'),
  previewWeather: document.querySelector('#previewWeather'),
  weatherStatus: document.querySelector('#weatherStatus'),
  weatherOutput: document.querySelector('#weatherOutput'),
  selectedSubscription: document.querySelector('#selectedSubscription'),
  alertsStatus: document.querySelector('#alertsStatus'),
  alertsOutput: document.querySelector('#alertsOutput'),
};

function init() {
  elements.email.value = state.email;
  elements.apiBaseUrl.value = state.apiBaseUrl;
  renderAlertTypes();
  renderSession();
  updatePreviewAvailability();
  bindEvents();

  if (state.email) {
    loadSubscriptions();
  }
}

function bindEvents() {
  elements.emailForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = elements.email.value.trim().toLowerCase();

    if (!email) {
      showStatus(elements.emailStatus, 'Enter an email address first.', 'error');
      return;
    }

    state.email = email;
    localStorage.setItem(STORAGE_KEYS.email, email);
    renderSession();
    showStatus(elements.emailStatus, `Using ${email}.`, 'success');
    loadSubscriptions();
  });

  elements.clearEmail.addEventListener('click', () => {
    state.email = '';
    localStorage.removeItem(STORAGE_KEYS.email);
    elements.email.value = '';
    renderSession();
    elements.subscriptionsList.innerHTML = '';
    clearSelectedSubscription();
    showStatus(elements.emailStatus, 'Email cleared.', 'info');
  });

  elements.apiBaseUrl.addEventListener('change', () => {
    state.apiBaseUrl = cleanBaseUrl(elements.apiBaseUrl.value);
    elements.apiBaseUrl.value = state.apiBaseUrl;
    localStorage.setItem(STORAGE_KEYS.apiBaseUrl, state.apiBaseUrl);
  });

  elements.useLocation.addEventListener('click', requestLocation);
  elements.subscriptionForm.addEventListener('submit', createSubscription);
  elements.refreshSubscriptions.addEventListener('click', loadSubscriptions);
  elements.previewWeather.addEventListener('click', previewWeather);
  elements.lat.addEventListener('input', updatePreviewAvailability);
  elements.lon.addEventListener('input', updatePreviewAvailability);
}

function renderAlertTypes() {
  elements.alertTypes.innerHTML = ALERT_TYPES.map(
    ([value, label]) => `
      <label class="check">
        <input
          type="checkbox"
          name="alerts"
          value="${value}"
          ${DEFAULT_ALERTS.has(value) ? 'checked' : ''}
        />
        <span>${label}</span>
      </label>
    `,
  ).join('');
}

function renderSession() {
  elements.activeEmail.textContent = state.email
    ? `Showing subscriptions for ${state.email}.`
    : 'No email selected.';
}

async function requestLocation() {
  if (!navigator.geolocation) {
    showStatus(
      elements.subscriptionStatus,
      'This browser does not support location access. Enter coordinates manually.',
      'warning',
    );
    return;
  }

  elements.useLocation.disabled = true;
  elements.geoHint.textContent = 'Waiting for browser permission...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      elements.lat.value = latitude.toFixed(6);
      elements.lon.value = longitude.toFixed(6);
      updatePreviewAvailability();
      elements.geoHint.textContent = 'Coordinates filled from your browser.';
      showStatus(
        elements.subscriptionStatus,
        'Location captured. Add a label before subscribing.',
        'success',
      );
      elements.useLocation.disabled = false;
    },
    (error) => {
      elements.geoHint.textContent = 'Manual entry is available.';
      showStatus(
        elements.subscriptionStatus,
        describeGeolocationError(error),
        'warning',
      );
      elements.useLocation.disabled = false;
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 300000,
    },
  );
}

async function createSubscription(event) {
  event.preventDefault();

  const payload = buildSubscriptionPayload();
  if (!payload) {
    return;
  }

  setFormBusy(true);
  showStatus(elements.subscriptionStatus, 'Creating subscription...', 'info');

  try {
    await apiFetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    showStatus(elements.subscriptionStatus, 'Subscription created.', 'success');
    await loadSubscriptions();
  } catch (error) {
    showStatus(elements.subscriptionStatus, error.message, 'error');
  } finally {
    setFormBusy(false);
    updatePreviewAvailability();
  }
}

function buildSubscriptionPayload() {
  if (!state.email) {
    showStatus(
      elements.subscriptionStatus,
      'Enter and save your email before creating a subscription.',
      'error',
    );
    return null;
  }

  const lat = Number(elements.lat.value);
  const lon = Number(elements.lon.value);
  const coordinateError = validateCoordinates();
  const label = elements.label.value.trim();
  const alerts = selectedAlerts();

  if (coordinateError) {
    showStatus(elements.subscriptionStatus, coordinateError, 'error');
    return null;
  }

  if (!label) {
    showStatus(elements.subscriptionStatus, 'Enter a location label.', 'error');
    return null;
  }

  if (alerts.length === 0) {
    showStatus(elements.subscriptionStatus, 'Select at least one alert type.', 'error');
    return null;
  }

  return {
    email: state.email,
    location: { lat, lon, label },
    alerts,
  };
}

async function loadSubscriptions() {
  if (!state.email) {
    showStatus(elements.listStatus, 'Enter an email to load subscriptions.', 'warning');
    return;
  }

  elements.refreshSubscriptions.disabled = true;
  showStatus(elements.listStatus, 'Loading subscriptions...', 'info');

  try {
    const subscriptions = await apiFetch('/api/subscriptions/by-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: state.email }),
    });
    if (
      state.selectedSubscriptionId &&
      !subscriptions.some(
        (subscription) => subscription.id === state.selectedSubscriptionId,
      )
    ) {
      clearSelectedSubscription();
    }
    renderSubscriptions(subscriptions);
    showStatus(
      elements.listStatus,
      subscriptions.length
        ? `${subscriptions.length} subscription${subscriptions.length === 1 ? '' : 's'} loaded.`
        : 'No subscriptions found for this email.',
      subscriptions.length ? 'success' : 'info',
    );
  } catch (error) {
    showStatus(elements.listStatus, error.message, 'error');
  } finally {
    elements.refreshSubscriptions.disabled = false;
  }
}

function renderSubscriptions(subscriptions) {
  elements.subscriptionsList.innerHTML = subscriptions
    .map(
      (subscription) => `
        <article class="subscription ${subscription.id === state.selectedSubscriptionId ? 'is-selected' : ''}">
          <div class="subscription-top">
            <div>
              <h3>${escapeHtml(subscription.locationLabel)}</h3>
              <p class="meta">${subscription.latitude}, ${subscription.longitude}</p>
            </div>
            <div class="button-row">
              <button class="secondary" type="button" data-poll-id="${subscription.id}" data-poll-label="${escapeHtml(subscription.locationLabel)}">
                Poll now
              </button>
              <button class="secondary" type="button" data-alert-id="${subscription.id}" data-alert-label="${escapeHtml(subscription.locationLabel)}">
                View alerts
              </button>
              <button class="danger" type="button" data-delete-id="${subscription.id}">
                Delete
              </button>
            </div>
          </div>
          <div class="tags">
            ${(subscription.alertTypes || [])
              .map((type) => `<span class="tag">${formatAlertType(type)}</span>`)
              .join('')}
          </div>
          <p class="tiny">Created ${formatDate(subscription.createdAt)}</p>
          <p class="tiny">Last polled ${formatDate(subscription.lastPolledAt)}</p>
        </article>
      `,
    )
    .join('');

  elements.subscriptionsList.querySelectorAll('[data-poll-id]').forEach((button) => {
    button.addEventListener('click', () =>
      pollSubscription(button.dataset.pollId, button.dataset.pollLabel, button),
    );
  });

  elements.subscriptionsList.querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', () => deleteSubscription(button.dataset.deleteId));
  });

  elements.subscriptionsList.querySelectorAll('[data-alert-id]').forEach((button) => {
    button.addEventListener('click', () =>
      loadSubscriptionAlerts(button.dataset.alertId, button.dataset.alertLabel),
    );
  });
}

async function pollSubscription(id, label, button) {
  button.disabled = true;
  showStatus(elements.listStatus, `Polling ${label || 'subscription'} now...`, 'info');

  try {
    const result = await apiFetch(
      `/api/subscriptions/${encodeURIComponent(id)}/poll`,
      {
        method: 'POST',
      },
    );
    const alertCount = result.alertsSentOrLogged || 0;
    const suppressedCount = (result.suppressed || []).length;

    if (state.selectedSubscriptionId === id) {
      await loadSubscriptionAlerts(id, label);
    } else {
      await loadSubscriptions();
    }

    showStatus(
      elements.listStatus,
      `Poll complete: ${alertCount} alert${alertCount === 1 ? '' : 's'} sent or logged, ${suppressedCount} suppressed.`,
      'success',
    );
  } catch (error) {
    showStatus(elements.listStatus, error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function deleteSubscription(id) {
  showStatus(elements.listStatus, 'Deleting subscription...', 'info');

  try {
    await apiFetch(`/api/subscriptions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (state.selectedSubscriptionId === id) {
      clearSelectedSubscription();
    }
    showStatus(elements.listStatus, 'Subscription deleted.', 'success');
    await loadSubscriptions();
  } catch (error) {
    showStatus(elements.listStatus, error.message, 'error');
  }
}

async function previewWeather() {
  const coordinateError = validateCoordinates();

  if (coordinateError) {
    showStatus(elements.weatherStatus, coordinateError, 'error');
    return;
  }

  const lat = Number(elements.lat.value);
  const lon = Number(elements.lon.value);

  elements.previewWeather.disabled = true;
  showStatus(elements.weatherStatus, 'Loading forecast...', 'info');
  elements.weatherOutput.innerHTML = '<p class="empty">Loading forecast...</p>';

  try {
    const forecast = await apiFetch(
      `/api/weather/forecast?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&days=3`,
    );
    renderForecast(forecast);
    showStatus(elements.weatherStatus, 'Forecast loaded.', 'success');
  } catch (error) {
    showStatus(elements.weatherStatus, error.message, 'error');
    elements.weatherOutput.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  } finally {
    updatePreviewAvailability();
  }
}

function validateCoordinates() {
  const latValue = elements.lat.value.trim();
  const lonValue = elements.lon.value.trim();

  if (!latValue || !lonValue) {
    return 'Enter latitude and longitude before continuing.';
  }

  const lat = Number(latValue);
  const lon = Number(lonValue);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return 'Latitude must be between -90 and 90.';
  }

  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return 'Longitude must be between -180 and 180.';
  }

  return '';
}

function updatePreviewAvailability() {
  elements.previewWeather.disabled = Boolean(validateCoordinates());
}

function renderForecast(forecast) {
  const current = forecast.current || {};
  const location = forecast.location || {};
  const daily = Array.isArray(forecast.daily) ? forecast.daily.slice(0, 3) : [];
  const locationText = [
    location.country,
    location.timezone,
    coordinatePair(location.lat, location.lon),
  ]
    .filter(Boolean)
    .join(' · ');

  elements.weatherOutput.innerHTML = `
    <div>
      <h3>${locationText ? escapeHtml(locationText) : 'Forecast preview'}</h3>
      <p class="meta">${current.time ? `Updated ${formatDate(current.time)}` : 'Current weather details'}</p>
    </div>
    <div class="metric-grid">
      ${weatherMetric('Temperature', formatUnit(current.temperature, '°C'))}
      ${weatherMetric('Feels like', formatUnit(current.feels_like, '°C'))}
      ${weatherMetric('Humidity', formatUnit(current.humidity, '%'))}
      ${weatherMetric('Wind', formatUnit(current.wind_speed, ' kph'))}
      ${weatherMetric('Gusts', formatUnit(current.wind_gust, ' kph'))}
      ${weatherMetric('UV index', formatValue(current.uv_index))}
      ${weatherMetric('Condition', formatValue(current.condition_code))}
    </div>
    ${
      daily.length
        ? `<div class="forecast-days">
            ${daily.map(renderDailyForecast).join('')}
          </div>`
        : '<p class="empty">No daily forecast details were returned.</p>'
    }
  `;
}

function renderDailyForecast(day) {
  return `
    <article class="day-card">
      <div>
        <h3>${escapeHtml(day.date || 'Forecast day')}</h3>
        <p class="meta">${formatValue(day.condition_code, 'Condition unavailable')}</p>
      </div>
      <div class="metric-grid">
        ${weatherMetric('Low', formatUnit(day.temp_min, '°C'))}
        ${weatherMetric('High', formatUnit(day.temp_max, '°C'))}
        ${weatherMetric('Rain total', formatUnit(day.precipitation_sum, ' mm'))}
        ${weatherMetric('Rain chance', formatUnit(day.precipitation_probability, '%'))}
        ${weatherMetric('Wind max', formatUnit(day.wind_max, ' kph'))}
        ${weatherMetric('Sunrise', formatTime(day.sunrise))}
        ${weatherMetric('Sunset', formatTime(day.sunset))}
      </div>
    </article>
  `;
}

function weatherMetric(label, value) {
  return `
    <div class="metric">
      <span class="tiny">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

async function loadSubscriptionAlerts(id, label) {
  state.selectedSubscriptionId = id;
  elements.selectedSubscription.textContent = `Alerts for ${label || 'selected subscription'}.`;
  elements.alertsOutput.innerHTML = '<p class="empty">Loading alerts...</p>';
  showStatus(elements.alertsStatus, 'Loading alert history...', 'info');
  elements.subscriptionsList.querySelectorAll('.subscription').forEach((card) => {
    card.classList.toggle(
      'is-selected',
      card.querySelector('[data-alert-id]')?.dataset.alertId === id,
    );
  });

  try {
    const alerts = await apiFetch(
      `/api/subscriptions/${encodeURIComponent(id)}/alerts`,
    );
    renderAlerts(alerts);
    showStatus(
      elements.alertsStatus,
      alerts.length
        ? `${alerts.length} alert${alerts.length === 1 ? '' : 's'} loaded.`
        : 'No alerts have been recorded for this subscription.',
      alerts.length ? 'success' : 'info',
    );
    await loadSubscriptions();
  } catch (error) {
    showStatus(elements.alertsStatus, error.message, 'error');
    elements.alertsOutput.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    elements.alertsOutput.innerHTML =
      '<p class="empty">No alert history is available for this subscription yet.</p>';
    return;
  }

  elements.alertsOutput.innerHTML = `
    <div class="alert-cards">
      ${alerts.map(renderAlertCard).join('')}
    </div>
  `;
}

function renderAlertCard(alert) {
  return `
    <article class="alert-card ${escapeHtml(alert.severity || '')}">
      <div>
        <h3>${formatAlertType(alert.alertType)} · ${formatValue(alert.severity)}</h3>
        <p class="meta">${escapeHtml(alert.locationLabel || 'Unknown location')} · ${formatDate(alert.triggeredAt)}</p>
      </div>
      <p>${escapeHtml(alert.summary || 'No summary provided.')}</p>
      <div class="metric-grid">
        ${weatherMetric('Forecast window', formatDate(alert.forecastWindowStart))}
        ${weatherMetric('Matched value', formatValue(alert.matchedValue))}
        ${weatherMetric('Threshold', formatValue(alert.thresholdValue))}
        ${weatherMetric('Delivery', formatValue(alert.deliveryStatus))}
      </div>
    </article>
  `;
}

function clearSelectedSubscription() {
  state.selectedSubscriptionId = '';
  elements.selectedSubscription.textContent = 'Select a subscription to view alerts.';
  elements.alertsOutput.innerHTML = '<p class="empty">No subscription selected.</p>';
  elements.alertsStatus.className = 'status';
  elements.alertsStatus.textContent = '';
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${cleanBaseUrl(state.apiBaseUrl)}${path}`, options);
  const text = await response.text();
  const data = text ? parseJson(text) : null;

  if (!response.ok) {
    throw new Error(extractApiError(data, response.status));
  }

  return data;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractApiError(data, status) {
  if (data && typeof data === 'object') {
    if (Array.isArray(data.message)) {
      return data.message.join(' ');
    }

    if (typeof data.message === 'string') {
      return data.message;
    }

    if (typeof data.error === 'string') {
      return data.error;
    }
  }

  return `Request failed with status ${status}.`;
}

function selectedAlerts() {
  return [...document.querySelectorAll('input[name="alerts"]:checked')].map(
    (input) => input.value,
  );
}

function setFormBusy(isBusy) {
  elements.subscriptionForm
    .querySelectorAll('button, input')
    .forEach((element) => {
      element.disabled = isBusy;
    });
}

function showStatus(element, message, type = 'info') {
  element.textContent = message;
  element.className = `status is-visible ${type}`;
}

function cleanBaseUrl(value) {
  return (value || defaultApiBaseUrl()).trim().replace(/\/+$/, '');
}

function defaultApiBaseUrl() {
  if (PRODUCTION_HOSTS.has(window.location.hostname)) {
    return PRODUCTION_API_BASE_URL;
  }

  return LOCAL_API_BASE_URL;
}

function describeGeolocationError(error) {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Location permission was denied. Enter latitude, longitude, and label manually.';
  }

  if (error.code === error.TIMEOUT) {
    return 'Location lookup timed out. Enter latitude, longitude, and label manually.';
  }

  return 'Unable to get location. Enter latitude, longitude, and label manually.';
}

function formatAlertType(type) {
  const match = ALERT_TYPES.find(([value]) => value === type);
  return match ? match[1] : type;
}

function formatDate(value) {
  if (!value) {
    return 'unknown date';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatTime(value) {
  if (!value) {
    return 'Unavailable';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    timeStyle: 'short',
  }).format(date);
}

function formatValue(value, fallback = 'Unavailable') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return String(value);
}

function formatUnit(value, unit) {
  if (value === null || value === undefined || value === '') {
    return 'Unavailable';
  }

  return `${value}${unit}`;
}

function coordinatePair(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return '';
  }

  return `${lat}, ${lon}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

init();
