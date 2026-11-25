import {
  CHINA_STATS,
  DEFAULT_CITIES,
  coordinateCity,
  isChinaCitiesLoaded,
  loadChinaCities,
  nearestChinaPrefKey,
  parseCoordinates,
  searchCities,
} from './cities.js';
import { loadWeather } from './providers.js';
import { WeatherGlobe } from './globe.js';
import { conditionMeta, weatherSvg } from './icons.js';
import {
  buildTravelAdvice,
  findLocalAttractions,
  isAttractionsLoaded,
  loadAttractions,
} from './travel.js';
import { formatLatLon, subsolarPoint, sunTimes } from './solar.js';

const REFRESH_MS = 10 * 60 * 1000;
const RETRY_MS = 90 * 1000;
const CACHE_TTL = 6 * 60 * 60 * 1000;
const KEYS = {
  weather: 'tianqiong.weather.v1',
  provider: 'tianqiong.provider.v1',
  added: 'tianqiong.added.v1',
};
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TONE_COLORS = {
  sun: '#ffc46b',
  sky: '#9ad9d0',
  cloud: '#b3bec9',
  fog: '#93a1b0',
  rain: '#7cc8f5',
  storm: '#ffc46b',
  snow: '#d7e9ff',
};
const TEMP_STOPS = [
  [-25, [111, 155, 255]],
  [0, [127, 214, 255]],
  [12, [116, 224, 200]],
  [22, [255, 212, 121]],
  [30, [255, 159, 92]],
  [38, [255, 91, 91]],
];

const $ = (id) => document.getElementById(id);

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the page still works for this session */
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatInZone(date, timeZone, options, fallbackLocale = 'zh-CN') {
  try {
    return new Intl.DateTimeFormat(fallbackLocale, { timeZone, ...options }).format(date);
  } catch {
    try {
      return new Intl.DateTimeFormat(fallbackLocale, options).format(date);
    } catch {
      return '—';
    }
  }
}

function clockInZone(date, timeZone) {
  return formatInZone(date, timeZone, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function hourInZone(date, timeZone) {
  return formatInZone(date, timeZone, { hour: '2-digit', hour12: false }, 'en-GB').replace(/[^0-9]/g, '').slice(0, 2);
}

function detailDateInZone(date, timeZone) {
  const monthDay = formatInZone(date, timeZone, { month: 'numeric', day: 'numeric' });
  const weekday = formatInZone(date, timeZone, { weekday: 'short' });
  return `${monthDay} · ${weekday}`;
}

function zoneOffsetLabel(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    const name = parts.find((part) => part.type === 'timeZoneName')?.value || '';
    return name.replace('GMT', 'UTC');
  } catch {
    return prettyZone(timeZone);
  }
}

function prettyZone(timeZone) {
  if (!timeZone) return 'UTC';
  const match = timeZone.match(/^Etc\/GMT([+-])(\d{1,2})$/);
  if (match) return `UTC${match[1] === '-' ? '+' : '-'}${match[2]}`;
  if (timeZone === 'Etc/GMT') return 'UTC+0';
  return timeZone.replace(/_/g, ' ');
}

function timezoneForLongitude(lon) {
  const offset = Math.round(lon / 15);
  if (offset === 0) return 'Etc/GMT';
  return `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

function tempColor(temp) {
  if (!Number.isFinite(temp)) return 'rgba(195,190,179,.7)';
  if (temp <= TEMP_STOPS[0][0]) {
    const [r, g, b] = TEMP_STOPS[0][1];
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (temp >= TEMP_STOPS[TEMP_STOPS.length - 1][0]) {
    const [r, g, b] = TEMP_STOPS[TEMP_STOPS.length - 1][1];
    return `rgb(${r}, ${g}, ${b})`;
  }
  for (let i = 0; i < TEMP_STOPS.length - 1; i += 1) {
    const [t0, c0] = TEMP_STOPS[i];
    const [t1, c1] = TEMP_STOPS[i + 1];
    if (temp >= t0 && temp <= t1) {
      const k = (temp - t0) / (t1 - t0);
      const mix = c0.map((v, index) => Math.round(v + (c1[index] - v) * k));
      return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
    }
  }
  return 'rgba(195,190,179,.7)';
}

function windName(deg) {
  if (!Number.isFinite(deg)) return '—';
  const names = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return `${names[Math.round(deg / 45) % 8]}风`;
}

function formatNum(value, digits = 0, fallback = '—') {
  if (!Number.isFinite(value)) return fallback;
  return value.toFixed(digits);
}

function formatDayLength(hours) {
  if (!Number.isFinite(hours)) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function dayLabel(dateStr, index) {
  if (index === 0) return '今天';
  if (index === 1) return '明天';
  const date = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return formatInZone(date, 'UTC', { weekday: 'short' });
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

const state = {
  cities: [],
  weather: new Map(),
  provider: safeStorageGet(KEYS.provider) || null,
  sourceLabel: '—',
  lastFetch: 0,
  nextAt: 0,
  selectedId: null,
  selectedRenderedId: null,
  loading: false,
  fromCache: false,
  error: null,
  detailTab: 'weather',
  searchItems: [],
  searchIndex: -1,
  globeReady: false,
  globeFailed: false,
  lastErrorAt: 0,
  failed: new Set(),
};

const el = {};
const markerEls = new Map();
const tickerEls = new Map();
let globe = null;

/* ------------------------------- bootstrapping ---------------------------- */

function cacheDom() {
  el.scene = $('scene');
  el.markerLayer = $('markerLayer');
  el.ticker = $('ticker');
  el.statusState = $('statusState');
  el.statusUpdated = $('statusUpdated');
  el.statusNext = $('statusNext');
  el.solarSubpoint = $('solarSubpoint');
  el.solarUtc = $('solarUtc');
  el.solarSource = $('solarSource');
  el.searchWrap = $('searchWrap');
  el.searchInput = $('searchInput');
  el.searchResults = $('searchResults');
  el.locateBtn = $('locateBtn');
  el.refreshBtn = $('refreshBtn');
  el.detail = $('detail');
  el.detailScroll = el.detail.querySelector('.detail-scroll');
  el.detailClose = $('detailClose');
  el.detailCountry = $('detailCountry');
  el.detailName = $('detailName');
  el.detailTemp = $('detailTemp');
  el.detailIcon = $('detailIcon');
  el.detailDesc = $('detailDesc');
  el.detailLocal = $('detailLocal');
  el.detailDate = $('detailDate');
  el.detailMetrics = $('detailMetrics');
  el.detailChart = $('detailChart');
  el.detailDaily = $('detailDaily');
  el.detailSun = $('detailSun');
  el.detailSource = $('detailSource');
  el.tabWeather = $('tabWeather');
  el.tabTravel = $('tabTravel');
  el.paneWeather = $('paneWeather');
  el.paneTravel = $('paneTravel');
  el.detailAdvice = $('detailAdvice');
  el.detailAttractions = $('detailAttractions');
  el.detailAttractionNote = $('detailAttractionNote');
  el.cursorCoords = $('cursorCoords');
  el.toast = $('toast');
  el.emptyNote = $('emptyNote');
  el.emptyText = $('emptyText');
  el.emptyRetry = $('emptyRetry');
  el.boot = $('boot');
  el.bootText = $('bootText');
  el.bordersToggle = $('bordersToggle');
  el.globeFallback = $('globeFallback');
}

function restoreCities() {
  const cities = DEFAULT_CITIES.map((city) => ({ ...city }));
  let added = [];
  try {
    added = JSON.parse(safeStorageGet(KEYS.added) || '[]');
  } catch {
    added = [];
  }
  if (Array.isArray(added)) {
    for (const item of added.slice(0, 24)) {
      if (!item || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
      if (cities.some((city) => city.id === item.id)) continue;
      cities.push({
        id: String(item.id || `point-${item.lat}-${item.lon}`),
        name: String(item.name || '自定义位置'),
        en: String(item.en || ''),
        country: String(item.country || '自定义坐标'),
        province: item.province || '',
        cityName: item.cityName || '',
        context: item.context || '',
        level: item.level || '',
        kind: item.kind || '',
        prefKey: item.prefKey || '',
        lat: item.lat,
        lon: item.lon,
        tz: item.tz || timezoneForLongitude(item.lon),
        custom: true,
      });
    }
  }
  state.cities = cities;
}

function persistAddedCities() {
  const added = state.cities
    .filter((city) => !city.featured && city.id !== 'geo')
    .map((city) => ({
      id: city.id,
      name: city.name,
      en: city.en,
      country: city.country,
      province: city.province || '',
      cityName: city.cityName || '',
      context: city.context || '',
      level: city.level || '',
      kind: city.kind || '',
      prefKey: city.prefKey || '',
      lat: city.lat,
      lon: city.lon,
      tz: city.tz,
      custom: Boolean(city.custom),
    }))
    .slice(0, 24);
  safeStorageSet(KEYS.added, JSON.stringify(added));
}

/* ---------------------------------- cache --------------------------------- */

function loadCachedWeather() {
  let cache = null;
  try {
    cache = JSON.parse(safeStorageGet(KEYS.weather) || 'null');
  } catch {
    cache = null;
  }
  if (!cache || !Array.isArray(cache.items)) return;
  if (!cache.savedAt || Date.now() - cache.savedAt > CACHE_TTL) return;
  for (const item of cache.items) {
    if (item && item.id) state.weather.set(item.id, item);
  }
  if (!state.weather.size) return;
  state.fromCache = true;
  state.lastFetch = cache.savedAt;
  state.provider = cache.provider || state.provider;
  state.sourceLabel = cache.label || '缓存';
}

function saveCachedWeather() {
  if (!state.weather.size) return;
  try {
    const payload = {
      savedAt: Date.now(),
      provider: state.provider,
      label: state.sourceLabel,
      items: [...state.weather.values()],
    };
    safeStorageSet(KEYS.weather, JSON.stringify(payload));
  } catch {
    /* ignore quota errors */
  }
}

/* -------------------------------- data flow -------------------------------- */

async function refresh() {
  if (state.loading) return;
  state.loading = true;
  state.error = null;
  el.refreshBtn.classList.add('is-loading');
  updateStatus();

  try {
    const result = await loadWeather(state.cities, { preferred: state.provider });
    const now = Date.now();
    for (const item of result.items) {
      state.weather.set(item.id, item);
      const city = state.cities.find((entry) => entry.id === item.id);
      if (city?.custom && item.tz && result.provider === 'open-meteo') city.tz = item.tz;
    }
    state.provider = result.provider;
    state.sourceLabel = result.label;
    state.lastFetch = now;
    state.nextAt = now + REFRESH_MS;
    state.fromCache = false;
    safeStorageSet(KEYS.provider, result.provider);
    saveCachedWeather();
    renderWeather();
    updateStatus();
    if (state.selectedId) renderDetail(state.selectedId);
    el.emptyNote.hidden = true;
  } catch (error) {
    console.error('天气数据刷新失败', error);
    state.error = error;
    state.fromCache = state.weather.size > 0;
    state.nextAt = Date.now() + RETRY_MS;
    updateStatus();
    announceFailure();
  } finally {
    state.loading = false;
    el.refreshBtn.classList.remove('is-loading');
    updateStatus();
  }
}

async function ensureWeatherFor(city) {
  if (state.weather.has(city.id) && !state.fromCache) return;
  try {
    const result = await loadWeather([city], { preferred: state.provider });
    for (const item of result.items) {
      state.weather.set(item.id, item);
      if (city.custom && item.tz && result.provider === 'open-meteo') city.tz = item.tz;
    }
    state.failed.delete(city.id);
    state.provider = result.provider;
    state.sourceLabel = result.label;
    safeStorageSet(KEYS.provider, result.provider);
    saveCachedWeather();
    renderWeather();
    if (state.selectedId === city.id) renderDetail(city.id);
  } catch (error) {
    console.error('城市天气获取失败', error);
    state.failed.add(city.id);
    if (state.selectedId === city.id) renderDetail(city.id);
    toast(`无法获取「${city.name}」的天气数据`, { type: 'error', duration: 5000 });
  }
}

function announceFailure() {
  const now = Date.now();
  if (now - state.lastErrorAt < 30000) return;
  state.lastErrorAt = now;
  if (state.weather.size) {
    const time = state.lastFetch
      ? new Date(state.lastFetch).toLocaleTimeString('zh-CN', { hour12: false })
      : '—';
    toast(`实时数据连接失败，正在显示 ${time} 的缓存`, {
      type: 'warm',
      action: '重试',
      onAction: refresh,
      duration: 9000,
    });
    el.emptyNote.hidden = true;
  } else {
    el.emptyText.textContent = '实时数据暂不可用，请检查网络连接';
    el.emptyNote.hidden = false;
    toast('无法连接气象数据源', { type: 'error', action: '重试', onAction: refresh, duration: 8000 });
  }
}

/* --------------------------------- chrome --------------------------------- */

function addCity(city) {
  const existing = state.cities.find((entry) => entry.id === city.id);
  if (existing) return existing;
  state.cities.push({ ...city });
  persistAddedCities();
  syncCityChrome();
  return city;
}

function syncCityChrome() {
  if (globe) globe.setCities(state.cities);
  const ids = new Set(state.cities.map((city) => city.id));

  for (const [id, node] of markerEls) {
    if (!ids.has(id)) {
      node.remove();
      markerEls.delete(id);
    }
  }
  for (const city of state.cities) {
    if (!markerEls.has(city.id)) markerEls.set(city.id, createMarker(city));
  }

  renderTicker();
  renderWeather();
  if (state.selectedId) globe?.setActive(state.selectedId);
}

function createMarker(city) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'marker';
  button.dataset.id = city.id;
  button.setAttribute('aria-label', `${city.name} 天气`);
  button.style.opacity = '0';
  button.style.pointerEvents = 'none';

  const main = document.createElement('span');
  main.className = 'marker-main';
  const icon = document.createElement('span');
  icon.className = 'marker-icon';
  const temp = document.createElement('span');
  temp.className = 'marker-temp';
  temp.textContent = '—';
  main.append(icon, temp);

  const name = document.createElement('span');
  name.className = 'marker-name';
  name.textContent = city.name;

  button.append(main, name);
  button.addEventListener('click', () => selectCity(city.id, { focus: false }));
  el.markerLayer.appendChild(button);
  return button;
}

function renderTicker() {
  const scroll = el.ticker.scrollLeft;
  el.ticker.textContent = '';
  tickerEls.clear();
  const fragment = document.createDocumentFragment();
  for (const city of state.cities) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'ticker-card';
    card.dataset.id = city.id;

    const icon = document.createElement('span');
    icon.className = 'tc-icon';
    const main = document.createElement('span');
    main.className = 'tc-main';
    const name = document.createElement('span');
    name.className = 'tc-name';
    name.textContent = city.name;
    const time = document.createElement('span');
    time.className = 'tc-time';
    time.textContent = '—';
    main.append(name, time);
    const temp = document.createElement('span');
    temp.className = 'tc-temp';
    temp.textContent = '—';
    card.append(icon, main, temp);
    card.addEventListener('click', () => selectCity(city.id, { focus: true }));
    fragment.appendChild(card);
    tickerEls.set(city.id, { card, icon, time, temp });
  }
  el.ticker.appendChild(fragment);
  el.ticker.scrollLeft = scroll;
}

function renderWeather() {
  for (const city of state.cities) {
    const weather = state.weather.get(city.id);
    const marker = markerEls.get(city.id);
    const ticker = tickerEls.get(city.id);
    if (marker) {
      const icon = marker.querySelector('.marker-icon');
      const temp = marker.querySelector('.marker-temp');
      if (weather?.current) {
        const meta = conditionMeta(weather.current.code);
        const color = tempColor(weather.current.temp);
        icon.innerHTML = weatherSvg(weather.current.code, weather.current.isDay);
        icon.style.color = TONE_COLORS[meta.tone] || TONE_COLORS.cloud;
        temp.textContent = `${Math.round(weather.current.temp)}°C`;
        temp.style.color = color;
        marker.setAttribute(
          'aria-label',
          `${city.name} ${Math.round(weather.current.temp)} 摄氏度 ${meta.label}`,
        );
        globe?.setMarkerColor(city.id, color);
      } else {
        icon.innerHTML = '';
        temp.textContent = '—';
        temp.style.color = 'var(--muted)';
      }
    }
    if (ticker) {
      if (weather?.current) {
        const meta = conditionMeta(weather.current.code);
        ticker.icon.innerHTML = weatherSvg(weather.current.code, weather.current.isDay);
        ticker.icon.style.color = TONE_COLORS[meta.tone] || TONE_COLORS.cloud;
        ticker.temp.textContent = `${Math.round(weather.current.temp)}°C`;
        ticker.temp.style.color = tempColor(weather.current.temp);
      } else {
        ticker.icon.innerHTML = '';
        ticker.temp.textContent = '—';
      }
      ticker.time.textContent = clockInZone(new Date(), city.tz);
    }
  }
  if (state.selectedId) updateActiveCards();
  updateStatus();
}

function updateActiveCards() {
  for (const [id, node] of markerEls) node.classList.toggle('is-active', id === state.selectedId);
  for (const [id, entry] of tickerEls) {
    entry.card.classList.toggle('is-active', id === state.selectedId);
  }
}

function selectCity(id, { focus = true } = {}) {
  const city = state.cities.find((entry) => entry.id === id);
  if (!city) return;
  state.selectedId = id;
  globe?.setActive(id);
  globe?.setLocked(true);
  updateActiveCards();
  requestAnimationFrame(() => {
    const card = tickerEls.get(id)?.card;
    if (!card) return;
    const tickerRect = el.ticker.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const target = el.ticker.scrollLeft + (cardRect.left - tickerRect.left) - (el.ticker.clientWidth - cardRect.width) / 2;
    el.ticker.scrollTo({
      left: clamp(target, 0, el.ticker.scrollWidth - el.ticker.clientWidth),
      behavior: REDUCED_MOTION ? 'auto' : 'smooth',
    });
  });
  renderDetail(id);
  openDetail();
  if (focus) globe?.focus(city.lat, city.lon);
  ensureWeatherFor(city);
}

function openDetail() {
  el.detail.inert = false;
  el.detail.classList.add('is-open');
  el.detail.setAttribute('aria-hidden', 'false');
}

function closeDetail() {
  if (!state.selectedId) return;
  el.detail.inert = true;
  state.selectedId = null;
  state.selectedRenderedId = null;
  el.detail.classList.remove('is-open');
  el.detail.setAttribute('aria-hidden', 'true');
  globe?.setActive(null);
  globe?.setLocked(false);
  updateActiveCards();
}

/* --------------------------------- detail --------------------------------- */

function renderDetail(id) {
  const city = state.cities.find((entry) => entry.id === id);
  if (!city) return;
  const weather = state.weather.get(id);
  const now = new Date();
  const tz = weather?.tz || city.tz;

  el.detailCountry.textContent = `${city.context || city.country} · ${zoneOffsetLabel(tz)}`;
  el.detailName.textContent = city.name;
  el.detailLocal.textContent = clockInZone(now, tz);
  el.detailDate.textContent = detailDateInZone(now, tz);

  if (weather?.current) {
    const meta = conditionMeta(weather.current.code);
    const color = tempColor(weather.current.temp);
    el.detailTemp.textContent = String(Math.round(weather.current.temp));
    el.detailDesc.textContent = meta.label;
    el.detailIcon.innerHTML = weatherSvg(weather.current.code, weather.current.isDay);
    el.detailIcon.style.color = TONE_COLORS[meta.tone] || TONE_COLORS.cloud;
    el.detail.style.setProperty('--detail-accent', color);
    el.detailMetrics.innerHTML = buildMetrics(weather.current);
    el.detailChart.innerHTML = buildChart(weather.hourly, tz);
    el.detailDaily.innerHTML = buildDaily(weather.daily);
    el.detailSun.innerHTML = buildSun(city, tz);
    el.detailSource.textContent = sourceLine(weather, tz);
  } else {
    const failed = state.failed.has(id) || (state.error && !state.loading);
    el.detailTemp.textContent = '—';
    el.detailDesc.textContent = failed ? '暂无数据' : '正在获取…';
    el.detailIcon.innerHTML = '';
    el.detail.style.setProperty('--detail-accent', 'var(--amber)');
    el.detailMetrics.innerHTML = '';
    el.detailChart.innerHTML = `<p class="chart-empty">${failed ? '暂无逐时数据' : '正在获取逐时数据…'}</p>`;
    el.detailDaily.innerHTML = '';
    el.detailSun.innerHTML = buildSun(city, tz);
    el.detailSource.textContent = failed ? '数据连接失败 · 可点击刷新重试' : '数据连接中';
  }

  applyDetailTab();
  renderTravel(city, weather);

  if (state.selectedRenderedId !== id) {
    el.detailScroll.scrollTop = 0;
    state.selectedRenderedId = id;
  }
}

function applyDetailTab() {
  const tab = state.detailTab === 'travel' ? 'travel' : 'weather';
  el.tabWeather.classList.toggle('is-active', tab === 'weather');
  el.tabTravel.classList.toggle('is-active', tab === 'travel');
  el.tabWeather.setAttribute('aria-selected', tab === 'weather');
  el.tabTravel.setAttribute('aria-selected', tab === 'travel');
  el.tabWeather.tabIndex = tab === 'weather' ? 0 : -1;
  el.tabTravel.tabIndex = tab === 'travel' ? 0 : -1;
  el.paneWeather.hidden = tab !== 'weather';
  el.paneTravel.hidden = tab !== 'travel';
}

function setDetailTab(tab, focus = false) {
  state.detailTab = tab === 'travel' ? 'travel' : 'weather';
  applyDetailTab();
  el.detailScroll.scrollTop = 0;
  if (state.detailTab === 'travel' && state.selectedId) {
    const city = state.cities.find((entry) => entry.id === state.selectedId);
    if (city) renderTravel(city, state.weather.get(city.id));
  }
  if (focus) {
    (state.detailTab === 'travel' ? el.tabTravel : el.tabWeather).focus();
  }
}

async function renderTravel(city, weather) {
  const advice = weather ? buildTravelAdvice(weather, city) : null;
  if (advice) {
    el.detailAdvice.innerHTML = `
      <div class="advice-hero">
        <p class="advice-kicker">今日出行</p>
        <h4 class="advice-title">${escapeHtml(advice.headline)}</h4>
        <p class="advice-sub">${escapeHtml(advice.summary)}</p>
      </div>
      <div class="advice-grid">
        ${advice.items
          .map(
            (item) =>
              `<div class="advice-item"><span>${escapeHtml(item.label)}</span><p>${escapeHtml(item.text)}</p></div>`,
          )
          .join('')}
      </div>
      <p class="advice-note">${escapeHtml(advice.note)}</p>`;
  } else {
    el.detailAdvice.innerHTML = '<p class="travel-empty">正在获取天气数据…</p>';
  }

  if (!isAttractionsLoaded() && state.detailTab !== 'travel') {
    el.detailAttractionNote.textContent = '5A / 4A';
    el.detailAttractions.innerHTML =
      '<p class="travel-empty">打开「出行 & 景点」后加载当地景点</p>';
    return;
  }
  if (!isAttractionsLoaded()) {
    el.detailAttractionNote.textContent = '5A / 4A';
    el.detailAttractions.innerHTML = '<p class="travel-empty">正在加载当地景点…</p>';
    try {
      await loadAttractions();
    } catch (error) {
      console.error('景点数据加载失败', error);
      if (state.selectedId === city.id) {
        el.detailAttractions.innerHTML =
          '<p class="travel-empty">当地景点数据加载失败，重新切换「出行 & 景点」重试。</p>';
      }
      return;
    }
    if (state.selectedId !== city.id) return;
  }
  const result = findLocalAttractions(city);
  if (result.outOfChina) {
    el.detailAttractionNote.textContent = '中国境内';
    el.detailAttractions.innerHTML =
      '<p class="travel-empty">景点推荐目前覆盖中国境内；该城市位于境外。</p>';
    return;
  }
  if (!result.items.length) {
    el.detailAttractionNote.textContent = '5A / 4A';
    el.detailAttractions.innerHTML = `<p class="travel-empty">${escapeHtml(
      result.prefKey || '所在地区',
    )}暂无 4A/5A 景区收录。</p>`;
    return;
  }
  el.detailAttractionNote.textContent = `${result.prefKey} · ${result.items.length} 个 5A/4A`;
  el.detailAttractions.innerHTML = result.items
    .map((item, index) => {
      const rating = `<em class="attr-rating ${item.rating === '5A' ? 'is-5a' : 'is-4a'}">${item.rating}</em>`;
      const meta = [item.region, item.ticket ? `门票 ${item.ticket}` : null]
        .filter(Boolean)
        .join(' · ');
      const sub = [item.duration ? `建议 ${item.duration}` : null, item.hours || null]
        .filter(Boolean)
        .join(' · ');
      const body = `<span class="attr-rank">${String(index + 1).padStart(2, '0')}</span>
        <span class="attr-main">
          <span class="attr-title"><b title="${escapeHtml(item.fullName)}">${escapeHtml(item.name)}</b>${rating}</span>
          <span class="attr-meta">${escapeHtml(meta)}</span>
          ${sub ? `<span class="attr-hours">${escapeHtml(sub)}</span>` : ''}
        </span>`;
      return item.url
        ? `<a class="attraction" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${body}<span class="attr-arrow">↗</span></a>`
        : `<div class="attraction">${body}</div>`;
    })
    .join('');
}

function metricValue(value, unit, digits = 0) {
  if (!Number.isFinite(value)) return '<span class="metric-empty">—</span>';
  return `${formatNum(value, digits)}<small>${unit}</small>`;
}

function buildMetrics(current) {
  const windArrow = Number.isFinite(current.windDir) && Number.isFinite(current.wind)
    ? `<span class="wind-arrow" style="transform: rotate(${current.windDir}deg)" aria-hidden="true">
         <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1.2v7.2M2.4 3.8 5 8.6l2.6-4.8"/></svg>
       </span>`
    : '';
  const windLabel = Number.isFinite(current.windDir)
    ? `风速 · ${windName(current.windDir).replace('风', '')}`
    : '风速';
  const items = [
    ['humidity', '湿度', metricValue(current.humidity, '%')],
    ['wind', windLabel, `${metricValue(current.wind, 'km/h')}${windArrow}`],
    ['pressure', '气压', metricValue(current.pressure, 'hPa')],
    ['cloud', '云量', metricValue(current.cloud, '%')],
    ['precip', '降水 · 1h', metricValue(current.precip, 'mm', 1)],
    ['dew', '露点', metricValue(current.dew, '°C', 1)],
  ];
  return items
    .map(
      ([key, label, value]) =>
        `<div class="metric metric-${key}"><span class="metric-label">${label}</span><span class="metric-value">${value}</span></div>`,
    )
    .join('');
}

function chartPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let path = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return path;
}

function buildChart(hourly, tz) {
  if (!Array.isArray(hourly) || hourly.length < 2) {
    return '<p class="chart-empty">暂无逐时数据</p>';
  }
  const points = hourly.filter((hour) => Number.isFinite(hour.temp)).slice(0, 24);
  if (points.length < 2) return '<p class="chart-empty">暂无逐时数据</p>';

  const W = 340;
  const H = 134;
  const pad = { left: 4, right: 4, top: 18, bottom: 24 };
  const temps = points.map((hour) => hour.temp);
  const actualMin = Math.min(...temps);
  const actualMax = Math.max(...temps);
  let min = actualMin;
  let max = actualMax;
  if (max - min < 4) {
    const mid = (max + min) / 2;
    min = mid - 2;
    max = mid + 2;
  }
  const span = max - min;
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const coords = points.map((hour, index) => {
    const x = pad.left + (index / (points.length - 1)) * plotW;
    const y = pad.top + (1 - (hour.temp - min) / span) * plotH;
    return [x, y];
  });
  const line = chartPath(coords);
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${(H - pad.bottom).toFixed(1)} L${pad.left},${(H - pad.bottom).toFixed(1)} Z`;
  const ticks = [0, 6, 12, 18, 23].filter((index) => index < points.length);
  const tickLabels = ticks
    .map((index) => {
      const x = pad.left + (index / (points.length - 1)) * plotW;
      const label = hourInZone(new Date(points[index].t), tz);
      return `<text x="${x.toFixed(1)}" y="${H - 7}" text-anchor="${index === 0 ? 'start' : index === 23 ? 'end' : 'middle'}" class="chart-tick">${label}</text>`;
    })
    .join('');
  const dots = points
    .map((hour, index) => {
      if (index % 4 !== 0) return '';
      const [x, y] = coords[index];
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" class="chart-dot"/>`;
    })
    .join('');
  const zeroInRange = min < 0 && max > 0;
  const zeroY = zeroInRange ? pad.top + (1 - (0 - min) / span) * plotH : null;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="未来 24 小时气温曲线">
    <defs>
      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffb15c" stop-opacity=".26"/>
        <stop offset="100%" stop-color="#ffb15c" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="${pad.left}" y1="${pad.top}" x2="${W - pad.right}" y2="${pad.top}" class="chart-grid"/>
    <line x1="${pad.left}" y1="${H - pad.bottom}" x2="${W - pad.right}" y2="${H - pad.bottom}" class="chart-grid"/>
    ${zeroY !== null ? `<line x1="${pad.left}" y1="${zeroY.toFixed(1)}" x2="${W - pad.right}" y2="${zeroY.toFixed(1)}" class="chart-zero"/><text x="${W - pad.right}" y="${(zeroY - 4).toFixed(1)}" text-anchor="end" class="chart-tick">0°</text>` : ''}
    <path d="${area}" fill="url(#chartFill)"/>
    <path d="${line}" class="chart-line" fill="none" stroke="#ffb15c" stroke-width="1.5" stroke-linecap="round"/>
    ${dots}
    ${tickLabels}
    <text x="${pad.left}" y="11" class="chart-label">${Math.round(actualMax)}°</text>
    <text x="${pad.left}" y="${(H - pad.bottom - 3).toFixed(1)}" class="chart-label chart-label-dim">${Math.round(actualMin)}°</text>
  </svg>`;
}

function buildDaily(dailyFull) {
  const daily = Array.isArray(dailyFull) ? dailyFull.slice(0, 5) : [];
  if (!daily.length) return '<p class="chart-empty">暂无预报数据</p>';
  const min = Math.min(...daily.map((day) => day.min));
  const max = Math.max(...daily.map((day) => day.max));
  const span = Math.max(max - min, 1);
  return daily
    .map((day, index) => {
      const start = ((day.min - min) / span) * 100;
      const width = Math.max(((day.max - day.min) / span) * 100, 4);
      const meta = conditionMeta(day.code);
      return `<div class="day-row">
        <span class="day-name">${dayLabel(day.date, index)}</span>
        <span class="day-icon" title="${meta.label}" style="color:${TONE_COLORS[meta.tone] || TONE_COLORS.cloud}">${weatherSvg(day.code, true)}</span>
        <span class="day-range"><i style="left:${start.toFixed(1)}%; width:${width.toFixed(1)}%"></i></span>
        <span class="day-temps"><b>${Math.round(day.max)}°C</b><span>${Math.round(day.min)}°C</span></span>
      </div>`;
    })
    .join('');
}

function buildSun(city, tz) {
  const times = sunTimes(city.lat, city.lon, tz, new Date());
  if (times.polar === 'day') {
    return `<div class="sun-item"><span class="sun-label">日出</span><span class="sun-value">极昼</span></div>
      <div class="sun-item"><span class="sun-label">日落</span><span class="sun-value">极昼</span></div>
      <div class="sun-item"><span class="sun-label">昼长</span><span class="sun-value">24h</span></div>`;
  }
  if (times.polar === 'night') {
    return `<div class="sun-item"><span class="sun-label">日出</span><span class="sun-value">极夜</span></div>
      <div class="sun-item"><span class="sun-label">日落</span><span class="sun-value">极夜</span></div>
      <div class="sun-item"><span class="sun-label">昼长</span><span class="sun-value">0h</span></div>`;
  }
  return `<div class="sun-item"><span class="sun-label">日出</span><span class="sun-value">${times.sunrise || '—'}</span></div>
    <div class="sun-item"><span class="sun-label">日落</span><span class="sun-value">${times.sunset || '—'}</span></div>
    <div class="sun-item"><span class="sun-label">昼长</span><span class="sun-value">${formatDayLength(times.dayLength)}</span></div>`;
}

function sourceLine(weather, tz) {
  const observed = weather.dataTime
    ? formatInZone(new Date(weather.dataTime), tz, { hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';
  const page = state.lastFetch
    ? new Date(state.lastFetch).toLocaleTimeString('zh-CN', { hour12: false })
    : '—';
  return `${state.sourceLabel} · 数据 ${observed} (${prettyZone(tz)}) · 页面更新 ${page}${state.fromCache ? ' · 缓存' : ''}`;
}

/* --------------------------------- status --------------------------------- */

function updateStatus() {
  const hasData = state.weather.size > 0;
  let cls = '';
  let label = '连接中';
  if (state.loading && !hasData) {
    cls = 'is-loading';
    label = '连接中';
  } else if (state.error) {
    if (hasData) {
      cls = 'is-stale';
      label = '缓存';
    } else {
      cls = 'is-error';
      label = '离线';
    }
  } else if (state.fromCache) {
    cls = 'is-stale';
    label = '缓存';
  } else if (hasData) {
    cls = '';
    label = '实时';
  } else {
    cls = 'is-loading';
    label = '连接中';
  }
  el.statusState.className = `status-pill ${cls}`.trim();
  el.statusState.querySelector('b').textContent = label;

  const time = state.lastFetch
    ? new Date(state.lastFetch).toLocaleTimeString('zh-CN', { hour12: false })
    : null;
  el.statusUpdated.textContent = time ? `更新于 ${time}` : '等待数据';
  if (state.loading) el.statusNext.textContent = '正在同步…';
  else if (!state.nextAt) el.statusNext.textContent = '—';
  else {
    const remaining = Math.max(0, state.nextAt - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const suffix = state.error ? '后重试' : '后刷新';
    el.statusNext.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${suffix}`;
  }
  el.solarSource.textContent = state.sourceLabel;
}

function updateSolar() {
  const sun = subsolarPoint(new Date());
  const { ns, ew } = formatLatLon(sun.lat, sun.lon);
  el.solarSubpoint.textContent = `${ns} · ${ew}`;
}

function tick() {
  const now = new Date();
  const iso = now.toISOString();
  el.solarUtc.textContent =
    window.innerWidth <= 900
      ? `${iso.slice(11, 19)} UTC`
      : `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
  updateStatus();
  if (state.selectedId) {
    const city = state.cities.find((entry) => entry.id === state.selectedId);
    if (city) {
      const tz = state.weather.get(city.id)?.tz || city.tz;
      el.detailLocal.textContent = clockInZone(now, tz);
      el.detailDate.textContent = detailDateInZone(now, tz);
    }
  }
  state.tickCount = (state.tickCount || 0) + 1;
  if (state.tickCount % 30 === 0) {
    updateSolar();
    for (const city of state.cities) {
      const entry = tickerEls.get(city.id);
      if (entry) entry.time.textContent = clockInZone(now, city.tz);
    }
  }
  if (!state.loading && state.nextAt && Date.now() >= state.nextAt && !document.hidden) {
    refresh();
  }
}

/* --------------------------------- search --------------------------------- */

function updateSearchResults() {
  const query = el.searchInput.value.trim();
  if (!query) {
    closeSearch();
    return;
  }
  if (!isChinaCitiesLoaded()) {
    el.searchResults.hidden = false;
    el.searchInput.setAttribute('aria-expanded', 'true');
    state.searchItems = [];
    state.searchIndex = -1;
    el.searchResults.innerHTML = '<div class="search-meta">正在加载全国城市…</div>';
    loadChinaCities()
      .then(() => {
        if (el.searchInput.value.trim()) updateSearchResults();
      })
      .catch(() => {
        el.searchResults.innerHTML = '<div class="search-meta">全国城市数据加载失败，请重试</div>';
      });
    return;
  }
  const items = [];
  const coord = parseCoordinates(query);
  if (coord) items.push({ type: 'coord', lat: coord.lat, lon: coord.lon });
  for (const city of searchCities(query, 8)) {
    items.push({ type: 'city', city });
  }
  state.searchItems = items;
  state.searchIndex = items.length ? 0 : -1;
  renderSearchResults();
}

function renderSearchResults() {
  const items = state.searchItems;
  el.searchResults.hidden = false;
  el.searchInput.setAttribute('aria-expanded', 'true');
  const meta = CHINA_STATS.total
    ? `<div class="search-meta">全国 ${CHINA_STATS.cities} 市 · ${CHINA_STATS.countyCities} 县级市 · ${CHINA_STATS.districts} 区县</div>`
    : '<div class="search-meta">正在加载全国城市…</div>';
  if (!items.length) {
    el.searchResults.innerHTML = `${meta}<div class="search-empty">未找到匹配的城市或区县</div>`;
    return;
  }
  el.searchResults.innerHTML =
    meta +
    items
      .map((item, index) => {
        if (item.type === 'coord') {
          const { ns, ew } = formatLatLon(item.lat, item.lon);
          return `<button type="button" class="search-item ${index === state.searchIndex ? 'is-active' : ''}" data-index="${index}" role="option">
          <span class="search-item-main">
            <span class="search-item-name">${ns} · ${ew}</span>
            <span class="search-item-meta">自定义坐标 · 点击添加到球面</span>
          </span>
          <span class="search-item-flag">坐标</span>
        </button>`;
        }
        const { city } = item;
        const onGlobe = state.cities.some((entry) => entry.id === city.id);
        const { ns, ew } = formatLatLon(city.lat, city.lon);
        const areaMeta = city.china
          ? `${city.context} · ${ns} ${ew}`
          : `${city.country} · ${ns} ${ew}${city.en ? ` · ${city.en}` : ''}`;
        const level = city.kind
          ? `<span class="search-item-level">${escapeHtml(city.kind)}</span>`
          : '';
        return `<button type="button" class="search-item ${index === state.searchIndex ? 'is-active' : ''}" data-index="${index}" role="option">
        <span class="search-item-main">
          <span class="search-item-name">${escapeHtml(city.name)}</span>
          <span class="search-item-meta">${escapeHtml(areaMeta)}</span>
        </span>
        ${level}
        <span class="search-item-flag">${onGlobe ? '球面' : '添加'}</span>
      </button>`;
      })
      .join('');
}

function closeSearch() {
  el.searchResults.hidden = true;
  el.searchInput.setAttribute('aria-expanded', 'false');
  state.searchIndex = -1;
}

function selectSearchItem(index) {
  const item = state.searchItems[index];
  if (!item) return;
  closeSearch();
  el.searchInput.value = '';
  el.searchInput.blur();
  if (item.type === 'coord') {
    const city = coordinateCity(item.lat, item.lon, timezoneForLongitude(item.lon));
    const prefKey = nearestChinaPrefKey(item.lat, item.lon);
    if (prefKey) city.prefKey = prefKey;
    addCity(city);
    selectCity(city.id, { focus: true });
  } else {
    const city = addCity(item.city);
    selectCity(city.id, { focus: true });
  }
}

function moveSearchIndex(delta) {
  if (!state.searchItems.length) return;
  state.searchIndex =
    (state.searchIndex + delta + state.searchItems.length) % state.searchItems.length;
  renderSearchResults();
  const active = el.searchResults.querySelector('.search-item.is-active');
  active?.scrollIntoView({ block: 'nearest' });
}

/* -------------------------------- geolocation ------------------------------ */

async function locateMe() {
  if (!navigator.geolocation) {
    toast('当前浏览器不支持定位', { type: 'error' });
    return;
  }
  el.locateBtn.classList.add('is-loading');
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 60000,
      });
    });
    const { latitude: lat, longitude: lon } = position.coords;
    let name = '我的位置';
    let country = '当前位置';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&localityLanguage=zh`,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      if (response.ok) {
        const data = await response.json();
        name = data.city || data.locality || data.principalSubdivision || name;
        country = (data.countryName || country).replace(/^中华人民共和国$/, '中国');
      }
    } catch {
      /* reverse geocoding is best effort */
    }
    const city = {
      id: 'geo',
      name,
      en: 'My location',
      country,
      lat,
      lon,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      prefKey: nearestChinaPrefKey(lat, lon),
      geo: true,
    };
    const existing = state.cities.find((entry) => entry.id === 'geo');
    if (existing) {
      Object.assign(existing, city);
      state.weather.delete('geo');
    } else {
      state.cities.push(city);
    }
    syncCityChrome();
    selectCity('geo', { focus: true });
    toast(`已定位到「${name}」`, { duration: 3500 });
  } catch (error) {
    const denied = error?.code === 1;
    toast(denied ? '定位权限被拒绝，请在浏览器中允许访问位置' : '无法获取当前位置', {
      type: 'error',
      duration: 6000,
    });
  } finally {
    el.locateBtn.classList.remove('is-loading');
  }
}

/* ---------------------------------- toast --------------------------------- */

let toastTimer = null;

function toast(message, { type = 'info', action = null, onAction = null, duration = 6000 } = {}) {
  clearTimeout(toastTimer);
  el.toast.className = `toast ${type === 'error' ? 'is-error' : type === 'warm' ? 'is-warm' : ''}`.trim();
  el.toast.textContent = '';
  const text = document.createElement('span');
  text.textContent = message;
  el.toast.appendChild(text);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-btn';
    button.textContent = action;
    button.addEventListener('click', () => {
      el.toast.classList.remove('is-open');
      onAction?.();
    });
    el.toast.appendChild(button);
  }
  el.toast.classList.add('is-open');
  toastTimer = setTimeout(() => el.toast.classList.remove('is-open'), duration);
}

/* ---------------------------------- boot ---------------------------------- */

function hideBoot() {
  el.boot.classList.add('is-hidden');
}

function showGlobeFallback(reason = 'WebGL unavailable') {
  if (state.globeFailed) return;
  state.globeFailed = true;
  console.warn('3D globe disabled, using static fallback:', reason);
  el.globeFallback.hidden = false;
  el.scene.classList.add('is-failed');
  el.markerLayer.hidden = true;
  hideBoot();
}

/* ---------------------------------- frame --------------------------------- */

function updateMarkerPositions() {
  if (!globe || !state.globeReady) return;
  const visible = [];
  for (const city of state.cities) {
    const node = markerEls.get(city.id);
    if (!node) continue;
    const projection = globe.project(city.lat, city.lon);
    if (!projection.visible) {
      node.style.opacity = '0';
      node.style.pointerEvents = 'none';
      continue;
    }
    visible.push({
      city,
      node,
      projection,
      active: city.id === state.selectedId,
    });
  }
  visible.sort((a, b) => Number(b.active) - Number(a.active) || b.projection.facing - a.projection.facing);
  const placed = [];
  for (const item of visible) {
    const { x, y } = item.projection;
    const collides = placed.some((point) => Math.hypot(point.x - x, point.y - y) < 44);
    if (collides && !item.active) {
      item.node.style.opacity = '0';
      item.node.style.pointerEvents = 'none';
      continue;
    }
    placed.push({ x, y });
    const fade = clamp((item.projection.facing - 0.08) / 0.24, 0, 1);
    item.node.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - 9).toFixed(1)}px, 0) translate(-50%, -100%)`;
    item.node.style.opacity = String(0.35 + fade * 0.65);
    item.node.style.pointerEvents = 'auto';
    item.node.style.zIndex = item.active ? '2' : '1';
  }
}

/* ---------------------------------- events -------------------------------- */

function wireEvents() {
  el.bordersToggle?.addEventListener('click', () => {
    const next = el.bordersToggle.getAttribute('aria-pressed') !== 'true';
    el.bordersToggle.setAttribute('aria-pressed', String(next));
    globe.setBorders(next);
  });

  el.refreshBtn.addEventListener('click', () => {
    if (state.loading) {
      toast('正在同步，请稍候', { duration: 2200 });
      return;
    }
    refresh();
    toast('正在刷新实时数据…', { duration: 2200 });
  });
  el.locateBtn.addEventListener('click', locateMe);
  el.emptyRetry.addEventListener('click', refresh);
  el.detailClose.addEventListener('click', closeDetail);

  el.tabWeather.addEventListener('click', () => setDetailTab('weather'));
  el.tabTravel.addEventListener('click', () => setDetailTab('travel'));
  for (const tab of [el.tabWeather, el.tabTravel]) {
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        setDetailTab(state.detailTab === 'weather' ? 'travel' : 'weather', true);
      }
    });
  }

  el.searchInput.addEventListener('input', updateSearchResults);
  el.searchInput.addEventListener('focus', () => {
    if (el.searchInput.value.trim()) updateSearchResults();
  });
  el.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (el.searchResults.hidden) updateSearchResults();
      else moveSearchIndex(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSearchIndex(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectSearchItem(state.searchIndex);
    } else if (event.key === 'Escape') {
      closeSearch();
      el.searchInput.blur();
    }
  });
  el.searchResults.addEventListener('click', (event) => {
    const button = event.target.closest('.search-item');
    if (!button) return;
    selectSearchItem(Number(button.dataset.index));
  });
  document.addEventListener('pointerdown', (event) => {
    if (!el.searchWrap.contains(event.target)) closeSearch();
  });

  el.ticker.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      el.ticker.scrollLeft += event.deltaY;
      event.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('keydown', (event) => {
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
    if (event.key === 'Escape' && state.selectedId && !typing) closeDetail();
    if ((event.key === '/' || (event.key === 'k' && (event.metaKey || event.ctrlKey))) && !typing) {
      event.preventDefault();
      el.searchInput.focus();
      el.searchInput.select();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.nextAt && Date.now() >= state.nextAt) refresh();
  });

  globe?.onFail(showGlobeFallback);
  globe?.onFrame(updateMarkerPositions);
  globe?.onHover((point) => {
    if (!point) {
      el.cursorCoords.hidden = true;
      return;
    }
    const { ns, ew } = formatLatLon(point.lat, point.lon);
    el.cursorCoords.hidden = false;
    el.cursorCoords.textContent = `光标 ${ns} · ${ew}`;
  });
}

/* ----------------------------------- init --------------------------------- */

function init() {
  cacheDom();
  el.detail.inert = true;
  applyDetailTab();
  restoreCities();
  loadCachedWeather();

  globe = new WeatherGlobe(el.scene, { reducedMotion: REDUCED_MOTION });
  state.globeReady = true;
  wireEvents();
  syncCityChrome();
  updateSolar();
  updateStatus();

  globe.whenReady().then(() => {
    if (globe.failed) {
      showGlobeFallback(globe.failReason);
      return;
    }
    renderWeather();
    globe.setActive(state.selectedId);
    setTimeout(hideBoot, 650);
  });
  setTimeout(hideBoot, 5000);
  setTimeout(() => {
    if (!el.boot.classList.contains('is-hidden')) {
      el.bootText.textContent =
        '加载较慢？如使用飞书内置浏览器，请点右上角 ··· → 在浏览器中打开';
    }
  }, 7000);

  loadChinaCities()
    .then(() => {
      if (!el.searchResults.hidden) renderSearchResults();
    })
    .catch((error) => console.error('全国城市数据加载失败', error));

  state.nextAt = Date.now() + 500;
  setInterval(tick, 1000);
  tick();
  setTimeout(refresh, 250);
}

init();
