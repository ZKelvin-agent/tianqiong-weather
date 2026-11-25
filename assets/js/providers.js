// 实时天气数据源。
// 主源 Open-Meteo（一次批量请求，字段最全，无需密钥）；
// 备源 MET Norway（官方开放数据，逐城市请求，无需密钥）。
// 任一源不可达时自动切换，并把可用源记在本地。
import { isDaytime } from './solar.js';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const MET_NO = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const OM_TIMEOUT = 5000;
const MET_TIMEOUT = 9000;
const MET_CONCURRENCY = 6;
const MET_OVERALL_TIMEOUT = 12000;

function metCondition(symbol) {
  const base = String(symbol || '')
    .toLowerCase()
    .replace(/_(day|night|polartwilight)$/, '');
  if (!base) return 'cloudy';
  if (base.includes('thunder')) return 'thunder';
  if (base.includes('sleet')) return 'sleet';
  if (base.includes('snow')) {
    if (base.includes('shower')) return 'snowShower';
    if (base.includes('heavy')) return 'heavySnow';
    if (base.includes('light')) return 'lightSnow';
    return 'snow';
  }
  if (base.includes('rain')) {
    if (base.includes('shower')) return base.includes('heavy') ? 'heavyShower' : 'shower';
    if (base.includes('heavy')) return 'heavyRain';
    if (base.includes('light')) return 'lightRain';
    return 'rain';
  }
  if (base === 'clearsky') return 'clear';
  if (base === 'fair') return 'mainlyClear';
  if (base === 'partlycloudy' || base === 'lightcloud') return 'partly';
  if (base === 'fog') return 'fog';
  if (base.includes('cloud')) return 'cloudy';
  return 'cloudy';
}

function wmoCondition(code) {
  if (code === 0) return 'clear';
  if (code === 1) return 'mainlyClear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code === 51 || code === 53 || code === 55) return 'drizzle';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'sleet';
  if (code === 61) return 'lightRain';
  if (code === 63) return 'rain';
  if (code === 65) return 'heavyRain';
  if (code === 80 || code === 81) return 'shower';
  if (code === 82) return 'heavyShower';
  if (code === 71 || code === 77) return 'lightSnow';
  if (code === 73) return 'snow';
  if (code === 75) return 'heavySnow';
  if (code === 85 || code === 86) return 'snowShower';
  if (code === 95 || code === 96 || code === 99) return 'thunder';
  return 'cloudy';
}

function dewPoint(temp, humidity) {
  if (!Number.isFinite(temp) || !Number.isFinite(humidity) || humidity <= 0) return null;
  const gamma = Math.log(humidity / 100) + (17.62 * temp) / (243.12 + temp);
  const dew = (243.12 * gamma) / (17.62 - gamma);
  return Number.isFinite(dew) ? dew : null;
}

function round(value, digits = 0) {
  if (!Number.isFinite(value)) return null;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

async function fetchJson(url, { timeout = 8000, signal, headers } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  const onAbort = () => controller.abort(signal.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(headers || {}) },
      cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function localDateKey(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function metHourlyTime(iso) {
  return Date.parse(iso);
}

function omLocalToEpoch(local, offsetSeconds) {
  const withSeconds = local.length === 16 ? `${local}:00Z` : `${local}Z`;
  return Date.parse(withSeconds) - offsetSeconds * 1000;
}

/* ------------------------------- Open-Meteo ------------------------------- */

async function fetchOpenMeteo(cities, signal) {
  const lats = cities.map((c) => c.lat.toFixed(4)).join(',');
  const lons = cities.map((c) => c.lon.toFixed(4)).join(',');
  const params = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,cloud_cover,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,dew_point_2m',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    temperature_unit: 'celsius',
    forecast_days: '6',
    wind_speed_unit: 'kmh',
  });
  const json = await fetchJson(`${OPEN_METEO}?${params}`, { timeout: OM_TIMEOUT, signal });
  const entries = Array.isArray(json) ? json : [json];
  if (entries.length !== cities.length) throw new Error('Open-Meteo returned an unexpected payload');

  const items = cities.map((city, index) => {
    const entry = entries[index];
    if (!entry || !entry.current) throw new Error('Open-Meteo entry missing');
    const c = entry.current;
    const offset = entry.utc_offset_seconds || 0;
    const hourlyTimes = entry.hourly?.time || [];
    const currentTime = c.time;
    let start = hourlyTimes.findIndex((t) => t >= currentTime);
    if (start < 0) start = 0;
    const hourly = [];
    for (let i = start; i < Math.min(start + 24, hourlyTimes.length); i += 1) {
      hourly.push({
        t: omLocalToEpoch(hourlyTimes[i], offset),
        temp: round(entry.hourly.temperature_2m[i], 1),
        code: wmoCondition(entry.hourly.weather_code[i]),
        precip: entry.hourly.precipitation_probability?.[i] ?? null,
      });
    }
    const daily = (entry.daily?.time || []).slice(0, 6).map((date, i) => ({
      date,
      min: round(entry.daily.temperature_2m_min[i], 1),
      max: round(entry.daily.temperature_2m_max[i], 1),
      code: wmoCondition(entry.daily.weather_code[i]),
    }));

    return {
      id: city.id,
      tz: entry.timezone || city.tz,
      dataTime: omLocalToEpoch(currentTime, offset),
      current: {
        temp: round(c.temperature_2m, 1),
        humidity: round(c.relative_humidity_2m),
        wind: round(c.wind_speed_10m),
        windDir: round(c.wind_direction_10m),
        pressure: round(c.surface_pressure),
        cloud: round(c.cloud_cover),
        precip: round(c.precipitation, 1),
        dew: round(c.dew_point_2m, 1),
        code: wmoCondition(c.weather_code),
        isDay: Boolean(c.is_day),
      },
      hourly,
      daily,
    };
  });

  return { provider: 'open-meteo', label: 'Open-Meteo', items };
}

/* -------------------------------- MET Norway ------------------------------- */

async function fetchMetOne(city, signal) {
  const url = `${MET_NO}?lat=${city.lat.toFixed(4)}&lon=${city.lon.toFixed(4)}`;
  const json = await fetchJson(url, { timeout: MET_TIMEOUT, signal });
  const props = json?.properties;
  const series = props?.timeseries;
  if (!Array.isArray(series) || !series.length) throw new Error('MET payload missing timeseries');

  const now = Date.now();
  const first = series[0];
  const currentData = first.data;
  const details = currentData.instant.details;
  const symbol =
    currentData.next_1_hours?.summary?.symbol_code ||
    currentData.next_6_hours?.summary?.symbol_code ||
    currentData.next_12_hours?.summary?.symbol_code;
  const precip =
    currentData.next_1_hours?.details?.precipitation_amount ??
    currentData.next_6_hours?.details?.precipitation_amount ??
    null;
  const temp = round(details.air_temperature, 1);
  const humidity = round(details.relative_humidity);

  const hourly = series
    .filter((ts) => Date.parse(ts.time) >= now - 3600 * 1000)
    .slice(0, 24)
    .map((ts) => ({
      t: metHourlyTime(ts.time),
      temp: round(ts.data.instant.details.air_temperature, 1),
      code: metCondition(
        ts.data.next_1_hours?.summary?.symbol_code ||
          ts.data.next_6_hours?.summary?.symbol_code ||
          ts.data.next_12_hours?.summary?.symbol_code,
      ),
      precip: ts.data.next_1_hours?.details?.precipitation_amount ?? null,
    }));

  const dayMap = new Map();
  for (const ts of series.slice(0, 24 * 6)) {
    const date = localDateKey(new Date(ts.time), city.tz);
    const localHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: city.tz,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(ts.time)),
    );
    const tempNow = ts.data.instant.details.air_temperature;
    const code = metCondition(
      ts.data.next_1_hours?.summary?.symbol_code ||
        ts.data.next_6_hours?.summary?.symbol_code ||
        ts.data.next_12_hours?.summary?.symbol_code,
    );
    if (!dayMap.has(date)) {
      dayMap.set(date, { date, min: tempNow, max: tempNow, noonCode: null, noonDistance: 99, codes: new Map() });
    }
    const day = dayMap.get(date);
    day.min = Math.min(day.min, tempNow);
    day.max = Math.max(day.max, tempNow);
    const distance = Math.abs(localHour - 12);
    if (distance < day.noonDistance) {
      day.noonDistance = distance;
      day.noonCode = code;
    }
    day.codes.set(code, (day.codes.get(code) || 0) + 1);
  }

  const daily = [...dayMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6)
    .map((day) => {
      let code = day.noonCode;
      if (!code) {
        code = [...day.codes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'cloudy';
      }
      return {
        date: day.date,
        min: round(day.min, 1),
        max: round(day.max, 1),
        code,
      };
    });

  return {
    id: city.id,
    tz: city.tz,
    dataTime: Date.parse(props.meta.updated_at),
    current: {
      temp,
      humidity,
      wind: round(details.wind_speed * 3.6),
      windDir: round(details.wind_from_direction),
      pressure: round(details.air_pressure_at_sea_level),
      cloud: round(details.cloud_area_fraction),
      precip: round(precip, 1),
      dew: round(dewPoint(temp, humidity), 1),
      code: metCondition(symbol),
      isDay: isDaytime(city.lat, city.lon, new Date()),
    },
    hourly,
    daily,
  };
}

async function fetchMet(cities, signal) {
  const items = new Array(cities.length);
  let cursor = 0;
  let successes = 0;
  let lastError = null;

  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new DOMException('provider timeout', 'TimeoutError')),
    MET_OVERALL_TIMEOUT,
  );
  const onAbort = () => deadline.abort(signal.reason);
  if (signal) {
    if (signal.aborted) deadline.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  async function worker() {
    while (cursor < cities.length && !deadline.signal.aborted) {
      const index = cursor;
      cursor += 1;
      try {
        items[index] = await fetchMetOne(cities[index], deadline.signal);
        successes += 1;
      } catch (error) {
        lastError = error;
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(MET_CONCURRENCY, cities.length) }, worker));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (successes === 0) throw lastError || new Error('MET Norway unavailable');
  if (successes < Math.ceil(cities.length * 0.6)) {
    throw lastError || new Error('MET Norway partially unavailable');
  }
  return { provider: 'met', label: 'MET Norway', items: items.filter(Boolean) };
}

/* --------------------------------- 对外接口 -------------------------------- */

export async function loadWeather(cities, { preferred = null, signal } = {}) {
  if (!cities.length) return { provider: preferred || 'open-meteo', label: '—', items: [] };
  const order = preferred === 'met' ? ['met', 'open-meteo'] : ['open-meteo', 'met'];
  const errors = [];
  for (const provider of order) {
    try {
      const result =
        provider === 'met' ? await fetchMet(cities, signal) : await fetchOpenMeteo(cities, signal);
      if (!result.items.length) throw new Error('no data');
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      errors.push(`${provider}: ${error?.message || error}`);
    }
  }
  throw new Error(errors.join(' / ') || '所有天气数据源均不可用');
}

