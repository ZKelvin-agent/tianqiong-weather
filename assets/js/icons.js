// 天气现象字典与线性图标。所有图标共用 32×32 画布、1.4px 线宽。
export const CONDITIONS = {
  clear: { label: '晴', icon: 'clear', tone: 'sun' },
  mainlyClear: { label: '晴间多云', icon: 'partly', tone: 'sun' },
  partly: { label: '多云', icon: 'partly', tone: 'sky' },
  cloudy: { label: '阴', icon: 'cloudy', tone: 'cloud' },
  fog: { label: '雾', icon: 'fog', tone: 'fog' },
  drizzle: { label: '毛毛雨', icon: 'rain', tone: 'rain' },
  lightRain: { label: '小雨', icon: 'rain', tone: 'rain' },
  rain: { label: '中雨', icon: 'rain', tone: 'rain' },
  heavyRain: { label: '大雨', icon: 'rain', tone: 'rain' },
  shower: { label: '阵雨', icon: 'shower', tone: 'rain' },
  heavyShower: { label: '强阵雨', icon: 'shower', tone: 'rain' },
  thunder: { label: '雷雨', icon: 'thunder', tone: 'storm' },
  sleet: { label: '雨夹雪', icon: 'sleet', tone: 'snow' },
  lightSnow: { label: '小雪', icon: 'snow', tone: 'snow' },
  snow: { label: '中雪', icon: 'snow', tone: 'snow' },
  heavySnow: { label: '大雪', icon: 'snow', tone: 'snow' },
  snowShower: { label: '阵雪', icon: 'snow', tone: 'snow' },
};

export function conditionMeta(key) {
  return CONDITIONS[key] || CONDITIONS.cloudy;
}

const CLOUD = 'M9.6 22.6h12.2a4.3 4.3 0 0 0 .6-8.55 6.15 6.15 0 0 0-11.75-1.3 4.6 4.6 0 0 0-1.05 9.85Z';
const CLOUD_SMALL = 'M11.2 23.2h11a3.9 3.9 0 0 0 .5-7.75 5.5 5.5 0 0 0-10.5-1.2 4.15 4.15 0 0 0-1 8.95Z';

function sunShape(cx = 16, cy = 15.2, r = 4.1, ray = 2.4) {
  let rays = '';
  for (let i = 0; i < 8; i += 1) {
    const a = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * (r + 1.5);
    const y1 = cy + Math.sin(a) * (r + 1.5);
    const x2 = cx + Math.cos(a) * (r + 1.5 + Math.min(ray, 2.1));
    const y2 = cy + Math.sin(a) * (r + 1.5 + Math.min(ray, 2.1));
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" fill-opacity=".5"/><circle cx="${cx}" cy="${cy}" r="${r}"/>${rays}`;
}

function moonShape(cx = 15.4, cy = 15.4) {
  return `<path d="M21.6 21.2A8 8 0 1 1 12.1 7.4a6.35 6.35 0 0 0 9.5 13.8Z" transform="translate(${cx - 16} ${cy - 16})"/>`;
}

function drop(x, y) {
  return `<path d="M${x} ${y}c1.1 1.7 1.8 2.8 1.8 4a1.8 1.8 0 0 1-3.6 0c0-1.2.7-2.3 1.8-4Z"/>`;
}

function flake(x, y) {
  return `<g><line x1="${x - 1.8}" y1="${y}" x2="${x + 1.8}" y2="${y}"/><line x1="${x - 0.9}" y1="${y - 1.6}" x2="${x + 0.9}" y2="${y + 1.6}"/><line x1="${x - 0.9}" y1="${y + 1.6}" x2="${x + 0.9}" y2="${y - 1.6}"/></g>`;
}

const ICONS = {
  clear: (isDay) => (isDay ? sunShape() : moonShape()),
  partly: (isDay) => `
    <g opacity=".92">${isDay ? sunShape(11.4, 11, 3.7, 2.1) : moonShape(11, 10.6)}</g>
    <path d="${CLOUD_SMALL}" fill="var(--icon-fill, rgba(8,14,22,.82))"/>
  `,
  cloudy: () => `
    <path d="${CLOUD}" fill="var(--icon-fill, rgba(8,14,22,.82))"/>
    <path d="M5.8 18.4h5.1M4.6 22.2h5.4" opacity=".45"/>
  `,
  fog: () => `
    <path d="M8 13.6h12.6M6.8 18h14M8.4 22.4h12.2M10.4 26.2h8.2" opacity=".9"/>
  `,
  rain: () => `
    <path d="${CLOUD}" fill="var(--icon-fill, rgba(8,14,22,.82))"/>
    ${drop(11.4, 24.2)}${drop(16, 24.2)}${drop(20.6, 24.2)}
  `,
  shower: () => `
    <g opacity=".9">${sunShape(10.4, 10.2, 3.1, 1.8)}</g>
    <path d="M12.8 20.3h10.4a3.9 3.9 0 0 0 .5-7.75 5.5 5.5 0 0 0-10.5-1.2 4.15 4.15 0 0 0-.4 8.95Z" fill="var(--icon-fill, rgba(8,14,22,.82))"/>
    ${drop(15.2, 23.4)}${drop(20.2, 23.4)}
  `,
  thunder: () => `
    <path d="${CLOUD}" fill="var(--icon-fill, rgba(8,14,22,.82))"/>
    <path d="M17.4 22.4 13.9 27h3.2l-1.5 4.1 4.6-6.1h-3.1l1.3-2.6Z" fill="currentColor" stroke="none"/>
  `,
  snow: () => `
    <path d="${CLOUD}" fill="var(--icon-fill, rgba(8,14,22,.82))"/>
    ${flake(11.6, 25.8)}${flake(16, 26.8)}${flake(20.4, 25.8)}
  `,
  sleet: () => `
    <path d="${CLOUD}" fill="var(--icon-fill, rgba(8,14,22,.82))"/>
    ${drop(11.6, 24)}${flake(16.4, 26.6)}${drop(20.6, 24)}
  `,
};

export function weatherSvg(key, isDay = true, className = '') {
  const meta = conditionMeta(key);
  const draw = ICONS[meta.icon] || ICONS.cloudy;
  return `<svg class="wx-icon ${className}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${draw(
    isDay,
  )}</svg>`;
}
