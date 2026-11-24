// 太阳几何：用于地球昼夜分界线、城市昼夜判断与日出日落。
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const norm360 = (v) => ((v % 360) + 360) % 360;
const norm24 = (v) => ((v % 24) + 24) % 24;

/**
 * 当前太阳直射点（纬度、经度，单位：度）。
 * 低阶天文近似，误差在 0.1° 量级，足够用于可视化。
 */
export function subsolarPoint(date = new Date()) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const meanLongitude = norm360(280.46 + 0.9856474 * n);
  const meanAnomaly = norm360(357.528 + 0.9856003 * n) * RAD;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const gmst = norm24(18.697374558 + 24.06570982441908 * n);
  let lon = rightAscension * DEG - gmst * 15;
  lon = ((lon + 540) % 360) - 180;
  return { lat: declination * DEG, lon };
}

/** 太阳高度角（度）。 */
export function sunAltitude(lat, lon, date = new Date()) {
  const sun = subsolarPoint(date);
  const hourAngle = (lon - sun.lon) * RAD;
  const phi = lat * RAD;
  const dec = sun.lat * RAD;
  const sinAlt =
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
}

export function isDaytime(lat, lon, date = new Date()) {
  return sunAltitude(lat, lon, date) > -0.833;
}

function dateKeyInZone(date, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** 日出/日落（城市本地时间），极昼/极夜返回标记。 */
export function sunTimes(lat, lon, timeZone, date = new Date()) {
  const key = dateKeyInZone(date, timeZone);
  const noonUTC = new Date(`${key}T12:00:00Z`);
  const sun = subsolarPoint(noonUTC);
  const dec = sun.lat * RAD;
  const phi = lat * RAD;
  const cosH =
    (Math.cos(90.833 * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));

  if (cosH > 1) return { polar: 'night', sunrise: null, sunset: null, dayLength: 0 };
  if (cosH < -1) return { polar: 'day', sunrise: null, sunset: null, dayLength: 24 };

  const h0 = Math.acos(cosH) * DEG;
  // 当天 12:00 UTC 的直射点经度，用来修正均时差
  const lon0 = sun.lon;
  const solarNoonUTC = 12 + (lon0 - lon) / 15;
  const sunriseUTC = solarNoonUTC - h0 / 15;
  const sunsetUTC = solarNoonUTC + h0 / 15;

  const toLocal = (hoursUTC) => {
    const ms = Date.UTC(
      Number(key.slice(0, 4)),
      Number(key.slice(5, 7)) - 1,
      Number(key.slice(8, 10)),
    );
    const d = new Date(ms + hoursUTC * 3600000);
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    } catch {
      return d.toISOString().slice(11, 16);
    }
  };

  return {
    polar: null,
    sunrise: toLocal(sunriseUTC),
    sunset: toLocal(sunsetUTC),
    dayLength: (2 * h0) / 15,
  };
}

export function formatLatLon(lat, lon) {
  const ns = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;
  const ew = `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
  return { ns, ew };
}
