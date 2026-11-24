// 出行建议与当地景点。
// 建议由实时天气 + 未来逐时数据生成；景点来自内置的 China Top Attractions 5A/4A 数据集，
// 按“所在城市/地区”（prefKey）分组，不依赖景点坐标。
import { CHINA_ATTRACTIONS } from '../data/china-attractions.js';
import { conditionMeta } from './icons.js';

const RAIN_CODES = new Set([
  'drizzle',
  'lightRain',
  'rain',
  'heavyRain',
  'shower',
  'heavyShower',
  'thunder',
  'sleet',
  'lightSnow',
  'snow',
  'heavySnow',
  'snowShower',
]);
const SNOW_CODES = new Set(['sleet', 'lightSnow', 'snow', 'heavySnow', 'snowShower']);
const WIND_NAMES = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

function isRainy(code) {
  return RAIN_CODES.has(code);
}

function intlParts(date, timeZone, options) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).formatToParts(date);
  } catch {
    return new Intl.DateTimeFormat('en-GB', options).formatToParts(date);
  }
}

function hourInZone(epoch, timeZone) {
  const parts = intlParts(new Date(epoch), timeZone, { hour: '2-digit', hourCycle: 'h23' });
  return Number(parts.find((part) => part.type === 'hour')?.value || 0);
}

function clockInZone(epoch, timeZone) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(epoch));
  } catch {
    return new Date(epoch).toISOString().slice(11, 16);
  }
}

function dateKeyInZone(date, timeZone) {
  const parts = intlParts(date, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function windLabel(deg) {
  if (!Number.isFinite(deg)) return '风向未知';
  return `${WIND_NAMES[Math.round(deg / 45) % 8]}风`;
}

function clothingFor(temp, wind) {
  let text;
  if (temp <= 0) text = '厚羽绒服或棉服，帽子手套齐全';
  else if (temp <= 8) text = '大衣或厚外套，注意保暖';
  else if (temp <= 16) text = '夹克、针织衫，早晚加一件';
  else if (temp <= 24) text = '长袖或薄外套，体感舒适';
  else if (temp <= 30) text = '短袖或透气衣物，注意补水';
  else text = '轻薄衣物，避开正午暴晒';
  if (Number.isFinite(wind) && wind >= 30) text += '；风力较大，建议防风外套';
  return text;
}

function bestOutingWindow(hourly, timeZone, now) {
  const upcoming = (hourly || [])
    .filter((hour) => Number.isFinite(hour.t) && hour.t >= now.getTime() - 3600 * 1000)
    .slice(0, 18);
  if (upcoming.length < 3) return null;
  let best = null;
  for (let i = 0; i <= upcoming.length - 3; i += 1) {
    const hours = upcoming.slice(i, i + 3);
    const localHour = hourInZone(hours[0].t, timeZone);
    if (localHour < 7 || localHour > 18) continue;
    const rainy = hours.filter((hour) => isRainy(hour.code)).length;
    const temps = hours.map((hour) => hour.temp).filter(Number.isFinite);
    if (!temps.length) continue;
    const avg = temps.reduce((sum, value) => sum + value, 0) / temps.length;
    const score = rainy * 32 + Math.abs(avg - 20) * 1.3 + (avg < 3 || avg > 31 ? 25 : 0);
    if (!best || score < best.score) best = { score, start: hours[0].t, rainy, avg };
  }
  if (!best) {
    const first = upcoming[0];
    best = {
      score: 99,
      start: first.t,
      rainy: upcoming.slice(0, 3).filter((hour) => isRainy(hour.code)).length,
      avg: first.temp,
    };
  }
  const start = clockInZone(best.start, timeZone);
  const end = clockInZone(best.start + 3 * 3600 * 1000, timeZone);
  const today = dateKeyInZone(now, timeZone);
  const targetDay = dateKeyInZone(new Date(best.start), timeZone);
  const prefix = targetDay === today ? '今天' : '明天';
  return {
    text: `${prefix} ${start}–${end} 相对最适合出行${best.rainy ? '（仍有短时降水，带伞）' : '，可优先安排户外景点'}`,
    rainy: best.rainy > 0,
  };
}

export function buildTravelAdvice(weather, city, now = new Date()) {
  if (!weather?.current) return null;
  const current = weather.current;
  const hourly = weather.hourly || [];
  const daily = weather.daily || [];
  const tz = weather.tz || city.tz || 'Asia/Shanghai';
  const temp = current.temp;
  const rainyNow =
    isRainy(current.code) || (Number.isFinite(current.precip) && current.precip > 0.2);
  const rainySoon = hourly
    .filter((hour) => Number.isFinite(hour.t) && hour.t >= now.getTime() - 3600 * 1000)
    .slice(0, 6)
    .some((hour) => isRainy(hour.code));
  const snowy = SNOW_CODES.has(current.code);
  const window = bestOutingWindow(hourly, tz, now);

  let headline = '出行留意天气变化';
  if (rainyNow || rainySoon) headline = '带伞出行，优先室内';
  else if (snowy) headline = '有雪，注意保暖防滑';
  else if (Number.isFinite(temp) && temp <= 0) headline = '天气寒冷，注意保暖';
  else if (Number.isFinite(temp) && temp >= 33) headline = '天气炎热，避开正午';
  else if (current.code === 'clear' || current.code === 'mainlyClear') {
    headline = current.isDay ? '适合出门走走' : '夜间晴朗，注意保暖';
  }

  let rainText = '降水概率低，轻装出行';
  if (snowy) rainText = '有降雪，穿防滑鞋、注意保暖';
  else if (rainyNow) rainText = '正在降水，带伞并留意路面湿滑';
  else if (rainySoon) rainText = '未来 6 小时可能有雨，随身带伞';

  const dayRange =
    daily[0] && Number.isFinite(daily[0].max) && Number.isFinite(daily[0].min)
      ? daily[0].max - daily[0].min
      : null;
  const other = [];
  if (
    current.isDay &&
    (current.code === 'clear' || current.code === 'mainlyClear') &&
    temp >= 24
  ) {
    other.push('日间紫外线较强，注意防晒');
  }
  if (Number.isFinite(current.wind) && current.wind >= 30) other.push('风力较大，注意防风');
  if (dayRange !== null && dayRange >= 10) {
    other.push(`昼夜温差 ${Math.round(dayRange)}°C，早晚加衣`);
  }
  if (!other.length) other.push('天气平稳，正常安排行程即可');

  return {
    headline,
    summary: `${Math.round(temp)}°C · ${conditionMeta(current.code).label} · ${windLabel(current.windDir)} ${
      Number.isFinite(current.wind) ? Math.round(current.wind) : '—'
    } km/h`,
    items: [
      { label: '穿衣', text: clothingFor(temp, current.wind) },
      { label: '雨具', text: rainText },
      {
        label: '最佳时段',
        text: window
          ? window.text
          : '未来 12 小时天气变化较大，建议以室内景点为主',
      },
      { label: '其他', text: other.join('；') },
    ],
    note: '根据未来 12 小时天气自动生成，仅供参考。',
  };
}

function dedupeKey(name, region = '') {
  let value = name.replace(/[\s·•（）()]/g, '');
  if (region && value.startsWith(region)) {
    const stripped = value.slice(region.length).replace(/^市/, '');
    if (stripped.length >= 2) value = stripped;
  }
  value = value.replace(/^[\u4e00-\u9fa5]{2,7}市/, '');
  value = value.replace(
    /(旅游景区|风景名胜区|风景区|旅游区|游览区|景区|博物院|博物馆|古城景区|文化景区|旅游度假区|国家森林公园|森林公园)$/g,
    '',
  );
  return value.length >= 2 ? value : name;
}

function displayName(name, region = '') {
  let value = name.replace(/[\s·•（）()]/g, '');
  if (region && value.startsWith(region)) {
    const stripped = value.slice(region.length).replace(/^市/, '');
    if (stripped.length >= 4) value = stripped;
  }
  value = value.replace(/^[\u4e00-\u9fa5]{2,7}市/, '');
  value = value.replace(
    /(旅游景区|风景名胜区|风景区|旅游区|游览区|景区|古城景区|文化景区|旅游度假区|国家森林公园|森林公园)$/g,
    '',
  );
  return value.length >= 2 ? value : name;
}

function detailScore(item) {
  return (item.ticket ? 1 : 0) + (item.hours ? 1 : 0) + (item.duration ? 1 : 0);
}

/**
 * 按“所在城市/地区”返回当地 5A/4A 景区。
 * 城市对象需带 prefKey（全国城市数据已预计算；境外城市/坐标没有）。
 */
export function findLocalAttractions(city, { limit = 5 } = {}) {
  const isChina = Boolean(city.china || city.country === '中国' || city.prefKey);
  if (!isChina) return { items: [], outOfChina: true, prefKey: null };
  const key = city.prefKey || (city.name || '').replace(/市$/, '');
  const byName = new Map();
  for (const [name, rating, ticket, hours, duration, url, pref] of CHINA_ATTRACTIONS) {
    if (pref !== key) continue;
    const keyName = dedupeKey(name, pref);
    const display = displayName(name, pref);
    const item = {
      name: display,
      fullName: name,
      rating,
      ticket,
      hours,
      duration,
      url,
      region: pref,
    };
    const previous = byName.get(keyName);
    if (
      !previous ||
      (rating === '5A' && previous.rating !== '5A') ||
      (rating === previous.rating && detailScore(item) > detailScore(previous))
    ) {
      byName.set(keyName, item);
    }
  }
  const items = [...byName.values()]
    .sort((a, b) => {
      if (a.rating !== b.rating) return a.rating === '5A' ? -1 : 1;
      const detailDiff = detailScore(b) - detailScore(a);
      if (detailDiff) return detailDiff;
      return a.name.localeCompare(b.name, 'zh');
    })
    .slice(0, limit);
  return { items, outOfChina: false, prefKey: key };
}
