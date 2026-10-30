// Состояние игры, экономика, сохранение с версионированием и миграцией
import { SAVE_KEY, SAVE_KEY_ONLINE, SAVE_VERSION, START_MONEY, RNG } from './config';
import { type Look, type Tuning, defaultLook, defaultTuning, VEHICLES, SELLER_NAMES } from './data';

export interface OwnedVehicle {
  uid: string; type: string; color: string; tuning: Tuning; condition: number; mileage: number; year: number; fuel: number;
  pos: { x: number; z: number; a: number } | null; missing: string[]; paid: number; locked?: boolean;
}
export interface Location { b: number; unit?: number; sub?: number }
export interface KioskOwn { id: number; last: number; acc: number }
export interface GameState {
  version: number; money: number; health: number; food: number; water: number; energy: number;
  look: Look; inventory: Record<string, number>; ammo: number;
  properties: string[]; fridges: Record<string, Record<string, number>>; garages: number[];
  vehicles: OwnedVehicle[]; kiosks: KioskOwn[]; promoUsed: boolean; fines: { amount: number; reason: string; t: number }[];
  wanted: number; pos: { x: number; z: number; a: number }; location: Location | null; gameTime: number; playTime: number;
  lastCar: string | null; created: boolean; nick?: string; mag?: number; ammoBy?: Record<string, number>; magBy?: Record<string, number>;
  plants?: Record<string, { crop: string; t: number }>; apps?: string[]; dms?: Record<string, { me: boolean; text: string; t: number }[]>; unread?: Record<string, number>; limited?: string[]; officeJob?: boolean; officeDone?: number; farmJob?: boolean; quest?: { step: number; done?: boolean; kills?: number }; trucker?: boolean; createdAt?: number;
  locks?: Record<string, boolean>; spawnHome?: string; customized?: boolean; listings?: { slot: number; uid: string; price: number; t: number }[];
}
export function newState(gender: 'm' | 'f', spawn: { x: number; z: number; a: number }): GameState {
  return {
    version: SAVE_VERSION, money: START_MONEY, health: 100, food: 80, water: 80, energy: 90, look: defaultLook(gender),
    inventory: { water: 2, sandwich: 1 }, ammo: 0, properties: [], fridges: {}, garages: [], vehicles: [], kiosks: [],
    promoUsed: false, fines: [], wanted: 0, pos: { ...spawn }, location: null, gameTime: 9 * 60, playTime: 0, lastCar: null, created: true,
  };
}
export function hasSave(online = false): boolean { try { return !!localStorage.getItem(online ? SAVE_KEY_ONLINE : SAVE_KEY); } catch { return false; } }
export function loadState(online = false): GameState | null {
  try {
    const raw = localStorage.getItem(online ? SAVE_KEY_ONLINE : SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<GameState> & { version?: number };
    return migrate(s);
  } catch { return null; }
}
/** безопасная миграция: недостающие поля заполняются, старые позиции сбрасываются */
function migrate(s: Partial<GameState>): GameState | null {
  if (!s || typeof s !== 'object') return null;
  const base = newState(s.look?.gender === 'f' ? 'f' : 'm', s.pos ?? { x: 516, z: 491.5, a: Math.PI });
  const out: GameState = { ...base, ...s } as GameState;
  if ((s.version ?? 0) < SAVE_VERSION) {
    // старые сохранения: интерьер мог отсутствовать — выводим игрока на улицу у точки появления
    out.location = null;
    out.pos = base.pos;
    out.vehicles = (out.vehicles ?? []).filter((v) => VEHICLES[v.type]).map((v) => ({ ...v, tuning: { ...defaultTuning(), ...(v.tuning ?? {}) }, missing: v.missing ?? [], pos: null }));
  }
  // миграция боеприпасов на новую систему оружия
  if (!out.ammoBy) { out.ammoBy = { p: (out.ammo ?? 0) }; out.magBy = { pistol: out.mag ?? 0 }; out.ammo = 0; out.mag = 0; }
  out.version = SAVE_VERSION;
  out.inventory = out.inventory ?? {};
  out.fridges = out.fridges ?? {};
  out.look = { ...defaultLook(out.look?.gender ?? 'm'), ...(out.look ?? {}) };
  for (const k of ['money', 'health', 'food', 'water', 'energy'] as const) if (typeof out[k] !== 'number' || !isFinite(out[k])) out[k] = base[k];
  out.vehicles = (out.vehicles ?? []).filter((v) => VEHICLES[v.type]);
  return out;
}
export function saveState(s: GameState, online = false) { try { localStorage.setItem(online ? SAVE_KEY_ONLINE : SAVE_KEY, JSON.stringify(s)); } catch { /* квота */ } }
export function resetSave(online = false) { try { localStorage.removeItem(online ? SAVE_KEY_ONLINE : SAVE_KEY); } catch { /* */ } }

// ---------- экономика авто ----------
const CUR_YEAR = 2026;
export function carValue(type: string, year: number, mileage: number, condition: number): number {
  const spec = VEHICLES[type]; if (!spec) return 0;
  const base = spec.price || 5000;
  const age = Math.max(0, CUR_YEAR - year);
  const ageF = spec.old ? Math.max(0.55, 1 - age * 0.004) : Math.max(0.3, 1 - age * 0.06);
  const milF = Math.max(0.5, 1 - mileage / 600000);
  const condF = 0.35 + 0.65 * Math.max(0, Math.min(1, condition));
  return Math.round(base * ageF * milF * condF);
}
export function repairCost(v: { type: string; year: number; mileage: number; condition: number; missing?: string[] }) {
  const full = carValue(v.type, v.year, v.mileage, 1);
  return Math.round(full * (1 - v.condition) * 0.4 + (v.missing?.length ?? 0) * 120);
}
export interface MarketOffer { id: string; type: string; color: string; year: number; mileage: number; condition: number; price: number; seller: string }
/** предложения авторынка — меняются каждые 10 минут реального времени */
export function marketOffers(period: number): MarketOffer[] {
  const r = new RNG(9000 + period);
  const types = Object.values(VEHICLES).filter((v) => v.forSale === 'dealer' || v.forSale === 'market').filter((v) => v.body !== 'heli' && v.price < 120000);
  const out: MarketOffer[] = [];
  for (let i = 0; i < 8; i++) {
    const sp = r.pick(types);
    const year = sp.old ? r.int(1982, 1999) : r.int(2008, 2024);
    const mileage = Math.round(r.range(20000, 320000) / 1000) * 1000;
    const condition = Math.round(r.range(0.3, 0.95) * 100) / 100;
    const val = carValue(sp.id, year, mileage, condition);
    const margin = r.range(0.82, 1.12); // иногда выгодно, иногда переплата
    out.push({ id: `${period}-${i}`, type: sp.id, color: r.pick(sp.colors), year, mileage, condition, price: Math.max(500, Math.round((val * margin) / 50) * 50), seller: r.pick(SELLER_NAMES) });
  }
  return out;
}
/** спрос на модель: колеблется во времени 0.85..1.15 */
export function demand(type: string, period: number) {
  const r = new RNG(type.length * 131 + period * 7);
  return 0.85 + r.next() * 0.3;
}
export function sellPrice(v: OwnedVehicle, period: number) {
  return Math.round(carValue(v.type, v.year, v.mileage, v.condition) * demand(v.type, period) * 0.9);
}
export const uid = () => Math.random().toString(36).slice(2, 10);
