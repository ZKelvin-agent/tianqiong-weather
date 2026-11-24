// 城市目录：默认上球的观测站 + 可搜索的扩展城市。
// 坐标与 IANA 时区用于展示本地时间；天气数据由 providers.js 获取。

export const CITY_CATALOG = [
  { id: 'beijing', name: '北京', en: 'Beijing', country: '中国', lat: 39.9042, lon: 116.4074, tz: 'Asia/Shanghai', featured: true, aliases: ['bj', 'peking'] },
  { id: 'shanghai', name: '上海', en: 'Shanghai', country: '中国', lat: 31.2304, lon: 121.4737, tz: 'Asia/Shanghai', featured: true, aliases: ['sh'] },
  { id: 'guangzhou', name: '广州', en: 'Guangzhou', country: '中国', lat: 23.1291, lon: 113.2644, tz: 'Asia/Shanghai', aliases: ['gz', 'canton'] },
  { id: 'shenzhen', name: '深圳', en: 'Shenzhen', country: '中国', lat: 22.5431, lon: 114.0579, tz: 'Asia/Shanghai', aliases: ['sz'] },
  { id: 'chengdu', name: '成都', en: 'Chengdu', country: '中国', lat: 30.5728, lon: 104.0668, tz: 'Asia/Shanghai' },
  { id: 'chongqing', name: '重庆', en: 'Chongqing', country: '中国', lat: 29.563, lon: 106.5516, tz: 'Asia/Shanghai' },
  { id: 'hangzhou', name: '杭州', en: 'Hangzhou', country: '中国', lat: 30.2741, lon: 120.1551, tz: 'Asia/Shanghai' },
  { id: 'xian', name: '西安', en: "Xi'an", country: '中国', lat: 34.3416, lon: 108.9398, tz: 'Asia/Shanghai' },
  { id: 'harbin', name: '哈尔滨', en: 'Harbin', country: '中国', lat: 45.8038, lon: 126.5349, tz: 'Asia/Shanghai' },
  { id: 'kunming', name: '昆明', en: 'Kunming', country: '中国', lat: 25.0389, lon: 102.7183, tz: 'Asia/Shanghai' },
  { id: 'lhasa', name: '拉萨', en: 'Lhasa', country: '中国', lat: 29.652, lon: 91.1721, tz: 'Asia/Shanghai' },
  { id: 'urumqi', name: '乌鲁木齐', en: 'Urumqi', country: '中国', lat: 43.8256, lon: 87.6168, tz: 'Asia/Shanghai' },
  { id: 'hongkong', name: '香港', en: 'Hong Kong', country: '中国', lat: 22.3193, lon: 114.1694, tz: 'Asia/Hong_Kong', featured: true, aliases: ['hk'] },
  { id: 'taipei', name: '台北', en: 'Taipei', country: '中国', lat: 25.033, lon: 121.5654, tz: 'Asia/Taipei' },
  { id: 'tokyo', name: '东京', en: 'Tokyo', country: '日本', lat: 35.6762, lon: 139.6503, tz: 'Asia/Tokyo', featured: true, aliases: ['tokio'] },
  { id: 'osaka', name: '大阪', en: 'Osaka', country: '日本', lat: 34.6937, lon: 135.5023, tz: 'Asia/Tokyo' },
  { id: 'seoul', name: '首尔', en: 'Seoul', country: '韩国', lat: 37.5665, lon: 126.978, tz: 'Asia/Seoul' },
  { id: 'singapore', name: '新加坡', en: 'Singapore', country: '新加坡', lat: 1.3521, lon: 103.8198, tz: 'Asia/Singapore', featured: true },
  { id: 'bangkok', name: '曼谷', en: 'Bangkok', country: '泰国', lat: 13.7563, lon: 100.5018, tz: 'Asia/Bangkok' },
  { id: 'jakarta', name: '雅加达', en: 'Jakarta', country: '印度尼西亚', lat: -6.2088, lon: 106.8456, tz: 'Asia/Jakarta' },
  { id: 'manila', name: '马尼拉', en: 'Manila', country: '菲律宾', lat: 14.5995, lon: 120.9842, tz: 'Asia/Manila' },
  { id: 'hanoi', name: '河内', en: 'Hanoi', country: '越南', lat: 21.0278, lon: 105.8342, tz: 'Asia/Ho_Chi_Minh' },
  { id: 'kualalumpur', name: '吉隆坡', en: 'Kuala Lumpur', country: '马来西亚', lat: 3.139, lon: 101.6869, tz: 'Asia/Kuala_Lumpur' },
  { id: 'mumbai', name: '孟买', en: 'Mumbai', country: '印度', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata', featured: true, aliases: ['bombay'] },
  { id: 'newdelhi', name: '新德里', en: 'New Delhi', country: '印度', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata', aliases: ['delhi'] },
  { id: 'dhaka', name: '达卡', en: 'Dhaka', country: '孟加拉国', lat: 23.8103, lon: 90.4125, tz: 'Asia/Dhaka' },
  { id: 'karachi', name: '卡拉奇', en: 'Karachi', country: '巴基斯坦', lat: 24.8607, lon: 67.0011, tz: 'Asia/Karachi' },
  { id: 'colombo', name: '科伦坡', en: 'Colombo', country: '斯里兰卡', lat: 6.9271, lon: 79.8612, tz: 'Asia/Colombo' },
  { id: 'dubai', name: '迪拜', en: 'Dubai', country: '阿联酋', lat: 25.2048, lon: 55.2708, tz: 'Asia/Dubai', featured: true },
  { id: 'riyadh', name: '利雅得', en: 'Riyadh', country: '沙特阿拉伯', lat: 24.7136, lon: 46.6753, tz: 'Asia/Riyadh' },
  { id: 'telaviv', name: '特拉维夫', en: 'Tel Aviv', country: '以色列', lat: 32.0853, lon: 34.7818, tz: 'Asia/Jerusalem' },
  { id: 'istanbul', name: '伊斯坦布尔', en: 'Istanbul', country: '土耳其', lat: 41.0082, lon: 28.9784, tz: 'Europe/Istanbul' },
  { id: 'moscow', name: '莫斯科', en: 'Moscow', country: '俄罗斯', lat: 55.7558, lon: 37.6173, tz: 'Europe/Moscow', featured: true },
  { id: 'london', name: '伦敦', en: 'London', country: '英国', lat: 51.5074, lon: -0.1278, tz: 'Europe/London', featured: true },
  { id: 'paris', name: '巴黎', en: 'Paris', country: '法国', lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris', featured: true },
  { id: 'berlin', name: '柏林', en: 'Berlin', country: '德国', lat: 52.52, lon: 13.405, tz: 'Europe/Berlin' },
  { id: 'rome', name: '罗马', en: 'Rome', country: '意大利', lat: 41.9028, lon: 12.4964, tz: 'Europe/Rome' },
  { id: 'madrid', name: '马德里', en: 'Madrid', country: '西班牙', lat: 40.4168, lon: -3.7038, tz: 'Europe/Madrid' },
  { id: 'amsterdam', name: '阿姆斯特丹', en: 'Amsterdam', country: '荷兰', lat: 52.3676, lon: 4.9041, tz: 'Europe/Amsterdam' },
  { id: 'stockholm', name: '斯德哥尔摩', en: 'Stockholm', country: '瑞典', lat: 59.3293, lon: 18.0686, tz: 'Europe/Stockholm' },
  { id: 'reykjavik', name: '雷克雅未克', en: 'Reykjavik', country: '冰岛', lat: 64.1466, lon: -21.9426, tz: 'Atlantic/Reykjavik' },
  { id: 'athens', name: '雅典', en: 'Athens', country: '希腊', lat: 37.9838, lon: 23.7275, tz: 'Europe/Athens' },
  { id: 'cairo', name: '开罗', en: 'Cairo', country: '埃及', lat: 30.0444, lon: 31.2357, tz: 'Africa/Cairo', featured: true },
  { id: 'nairobi', name: '内罗毕', en: 'Nairobi', country: '肯尼亚', lat: -1.2921, lon: 36.8219, tz: 'Africa/Nairobi' },
  { id: 'lagos', name: '拉各斯', en: 'Lagos', country: '尼日利亚', lat: 6.5244, lon: 3.3792, tz: 'Africa/Lagos' },
  { id: 'capetown', name: '开普敦', en: 'Cape Town', country: '南非', lat: -33.9249, lon: 18.4241, tz: 'Africa/Johannesburg', featured: true },
  { id: 'johannesburg', name: '约翰内斯堡', en: 'Johannesburg', country: '南非', lat: -26.2041, lon: 28.0473, tz: 'Africa/Johannesburg' },
  { id: 'casablanca', name: '卡萨布兰卡', en: 'Casablanca', country: '摩洛哥', lat: 33.5731, lon: -7.5898, tz: 'Africa/Casablanca' },
  { id: 'newyork', name: '纽约', en: 'New York', country: '美国', lat: 40.7128, lon: -74.006, tz: 'America/New_York', featured: true, aliases: ['nyc'] },
  { id: 'losangeles', name: '洛杉矶', en: 'Los Angeles', country: '美国', lat: 34.0522, lon: -118.2437, tz: 'America/Los_Angeles', featured: true, aliases: ['la'] },
  { id: 'sanfrancisco', name: '旧金山', en: 'San Francisco', country: '美国', lat: 37.7749, lon: -122.4194, tz: 'America/Los_Angeles' },
  { id: 'seattle', name: '西雅图', en: 'Seattle', country: '美国', lat: 47.6062, lon: -122.3321, tz: 'America/Los_Angeles' },
  { id: 'chicago', name: '芝加哥', en: 'Chicago', country: '美国', lat: 41.8781, lon: -87.6298, tz: 'America/Chicago' },
  { id: 'washington', name: '华盛顿', en: 'Washington', country: '美国', lat: 38.9072, lon: -77.0369, tz: 'America/New_York' },
  { id: 'miami', name: '迈阿密', en: 'Miami', country: '美国', lat: 25.7617, lon: -80.1918, tz: 'America/New_York' },
  { id: 'toronto', name: '多伦多', en: 'Toronto', country: '加拿大', lat: 43.6532, lon: -79.3832, tz: 'America/Toronto' },
  { id: 'vancouver', name: '温哥华', en: 'Vancouver', country: '加拿大', lat: 49.2827, lon: -123.1207, tz: 'America/Vancouver' },
  { id: 'mexicocity', name: '墨西哥城', en: 'Mexico City', country: '墨西哥', lat: 19.4326, lon: -99.1332, tz: 'America/Mexico_City' },
  { id: 'saopaulo', name: '圣保罗', en: 'São Paulo', country: '巴西', lat: -23.5505, lon: -46.6333, tz: 'America/Sao_Paulo', featured: true, aliases: ['sao paulo'] },
  { id: 'riodejaneiro', name: '里约热内卢', en: 'Rio de Janeiro', country: '巴西', lat: -22.9068, lon: -43.1729, tz: 'America/Sao_Paulo', aliases: ['rio'] },
  { id: 'buenosaires', name: '布宜诺斯艾利斯', en: 'Buenos Aires', country: '阿根廷', lat: -34.6037, lon: -58.3816, tz: 'America/Argentina/Buenos_Aires' },
  { id: 'lima', name: '利马', en: 'Lima', country: '秘鲁', lat: -12.0464, lon: -77.0428, tz: 'America/Lima' },
  { id: 'santiago', name: '圣地亚哥', en: 'Santiago', country: '智利', lat: -33.4489, lon: -70.6693, tz: 'America/Santiago' },
  { id: 'sydney', name: '悉尼', en: 'Sydney', country: '澳大利亚', lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney', featured: true },
  { id: 'melbourne', name: '墨尔本', en: 'Melbourne', country: '澳大利亚', lat: -37.8136, lon: 144.9631, tz: 'Australia/Melbourne' },
  { id: 'perth', name: '珀斯', en: 'Perth', country: '澳大利亚', lat: -31.9505, lon: 115.8605, tz: 'Australia/Perth' },
  { id: 'auckland', name: '奥克兰', en: 'Auckland', country: '新西兰', lat: -36.8509, lon: 174.7645, tz: 'Pacific/Auckland' },
  { id: 'honolulu', name: '檀香山', en: 'Honolulu', country: '美国', lat: 21.3069, lon: -157.8583, tz: 'Pacific/Honolulu' },
  { id: 'anchorage', name: '安克雷奇', en: 'Anchorage', country: '美国', lat: 61.2181, lon: -149.9003, tz: 'America/Anchorage' },
  { id: 'ulaanbaatar', name: '乌兰巴托', en: 'Ulaanbaatar', country: '蒙古', lat: 47.8864, lon: 106.9057, tz: 'Asia/Ulaanbaatar' },
  { id: 'tashkent', name: '塔什干', en: 'Tashkent', country: '乌兹别克斯坦', lat: 41.2995, lon: 69.2401, tz: 'Asia/Tashkent' },
];

export const DEFAULT_CITIES = CITY_CATALOG.filter((c) => c.featured);

export function searchCities(query, limit = 6) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const city of CITY_CATALOG) {
    const haystacks = [city.name, city.en, city.country, ...(city.aliases || [])].map((s) => s.toLowerCase());
    let score = 0;
    for (const h of haystacks) {
      if (h === q) score = Math.max(score, 100);
      else if (h.startsWith(q)) score = Math.max(score, 80);
      else if (h.includes(q)) score = Math.max(score, 50);
    }
    if (score) scored.push({ city, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.city.name.localeCompare(b.city.name, 'zh'))
    .slice(0, limit)
    .map((s) => s.city);
}

export function parseCoordinates(input) {
  const match = input.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,，\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function coordinateCity(lat, lon, tz = 'UTC') {
  const fmt = (v, pos, neg) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;
  const id = `point-${lat.toFixed(2)}-${lon.toFixed(2)}`;
  return {
    id,
    name: `${fmt(lat, 'N', 'S')} ${fmt(lon, 'E', 'W')}`,
    en: 'Custom point',
    country: '自定义坐标',
    lat,
    lon,
    tz,
    featured: false,
    custom: true,
  };
}
