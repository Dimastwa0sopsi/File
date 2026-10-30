// Единый источник размеров мира. Все модули берут размеры только отсюда.
export const N = 18; // город N x N кварталов
export const CELL = 60; // шаг сетки улиц (м)
export const ROAD_W = 12; // ширина проезжей части городской улицы
export const SIDEWALK = 3; // ширина тротуара (часть квартала)
export const BLOCK = CELL - ROAD_W; // размер квартала вместе с тротуаром (48)
export const CITY_SIZE = N * CELL; // 1080
export const LANE_OFF = 3; // смещение полосы от осевой
export const CHUNK = 120; // размер чанка мира
export const INTERIOR_ORIGIN = { x: 6000, z: 6000 };
export const SAVE_KEY = 'losgorod_save';
export const SAVE_KEY_ONLINE = 'losgorod_save_online';
export const SETTINGS_KEY = 'losgorod_settings';
export const SAVE_VERSION = 4;
export const START_MONEY = 20000;
export const DAY_LENGTH = 24 * 60; // реальных секунд на игровые сутки (1 мин = 1 час)
export const WORLD_SEED = 1337;

export function inGrid(i: number, j: number): boolean {
  return Number.isInteger(i) && Number.isInteger(j) && i >= 0 && j >= 0 && i < N && j < N;
}
export function assertBlock(i: number, j: number, what: string): void {
  if (!inGrid(i, j)) throw new Error(`Квартал вне сетки ${N}x${N}: ${what} (${i},${j})`);
}
/** Центр квартала (i,j) */
export function blockCenter(i: number, j: number) {
  return { x: i * CELL + CELL / 2, z: j * CELL + CELL / 2 };
}
/** Позиция перекрёстка (i,j), i,j в 0..N */
export function nodePos(i: number, j: number) {
  return { x: i * CELL, z: j * CELL };
}

// ---------- RNG ----------
export class RNG {
  s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function angleDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function dist2(ax: number, az: number, bx: number, bz: number) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
/** расстояние от точки до отрезка */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t, qz = az + dz * t;
  return { d: Math.hypot(px - qx, pz - qz), t, x: qx, z: qz };
}

export const isMobileDevice = () =>
  typeof window !== 'undefined' &&
  (('ontouchstart' in window && navigator.maxTouchPoints > 0) || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));

// ---------- Настройки ----------
export interface Settings {
  control: 'auto' | 'pc' | 'mobile';
  quality: 'low' | 'medium' | 'high';
  drawDistance: number; // м
  renderScale: number; // 0.5..1
  shadows: boolean;
  effects: boolean;
  traffic: number; // 0..1
  peds: number; // 0..1
  volume: number; // 0..1
  muted: boolean;
  sensitivity: number; // 0.3..2
  minimapZoom: number; // 0.5..3
  minimapRotate: boolean;
  transmission: 'auto' | 'manual';
  autoQuality: boolean;
}
export function defaultSettings(): Settings {
  const mob = isMobileDevice();
  return {
    control: 'auto', quality: mob ? 'low' : 'medium', drawDistance: mob ? 260 : 420,
    renderScale: mob ? 0.75 : 1, shadows: !mob, effects: !mob, traffic: mob ? 0.4 : 0.7,
    peds: mob ? 0.4 : 0.7, volume: 0.6, muted: false, sensitivity: 1, minimapZoom: 1.2,
    minimapRotate: true, transmission: 'auto', autoQuality: true,
  };
}
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultSettings();
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function resolveMobile(s: Settings) {
  return s.control === 'mobile' || (s.control === 'auto' && isMobileDevice());
}
