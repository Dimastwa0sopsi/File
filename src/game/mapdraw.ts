// Векторная отрисовка мини-карты и большой карты (чёткая при любом масштабе)
import { CELL, ROAD_W } from './config';
import type { WorldLayout, Building, REdge } from './worldgen';

// запасной вариант для старых браузеров без roundRect
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  (CanvasRenderingContext2D.prototype as unknown as { roundRect: (x: number, y: number, w: number, h: number) => void }).roundRect = function (this: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) { this.rect(x, y, w, h); };
}
export const PAL = {
  land: '#2b2d31', block: '#3a3c41', sidewalk: '#4a4c52', park: '#44474c', priv: '#3f4146', water: '#5d6269', beach: '#6b6d70',
  field: '#4d4f53', ind: '#36383c', bld: '#56585e', tower: '#686b72', house: '#5c5e64', road: '#c9cbcf', highway: '#e6e7e9', dirt: '#8a8c90',
  route: '#b54dff',
};
export interface MapIcon { x: number; z: number; icon: string; color: string; label?: string; size?: number; dyn?: boolean; pulse?: boolean; clamp?: boolean; small?: boolean }
export interface MapView { cx: number; cz: number; scale: number; rot: number; ox: number; oy: number }

export class MapIndex {
  cell = 150;
  b = new Map<string, Building[]>(); e = new Map<string, REdge[]>();
  constructor(public L: WorldLayout) {
    for (const bd of L.buildings) this.put(this.b, bd.x - bd.w / 2, bd.z - bd.d / 2, bd.x + bd.w / 2, bd.z + bd.d / 2, bd);
    for (const ed of L.edges) { const a = L.nodes[ed.a], n = L.nodes[ed.b]; this.put(this.e, Math.min(a.x, n.x) - ed.w, Math.min(a.z, n.z) - ed.w, Math.max(a.x, n.x) + ed.w, Math.max(a.z, n.z) + ed.w, ed); }
  }
  private put<T>(m: Map<string, T[]>, x0: number, z0: number, x1: number, z1: number, v: T) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) { const k = i + ',' + j; let a = m.get(k); if (!a) { a = []; m.set(k, a); } a.push(v); }
  }
  query<T>(m: Map<string, T[]>, x0: number, z0: number, x1: number, z1: number): Set<T> {
    const out = new Set<T>(); const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) { const a = m.get(i + ',' + j); if (a) for (const v of a) out.add(v); }
    return out;
  }
}

/** экранная точка по мировой */
export function toScreen(v: MapView, x: number, z: number) {
  const dx = (x - v.cx) * v.scale, dz = (z - v.cz) * v.scale, c = Math.cos(v.rot), s = Math.sin(v.rot);
  return { x: v.ox + dx * c - dz * s, y: v.oy + dx * s + dz * c };
}
export function toWorld(v: MapView, sx: number, sy: number) {
  const dx = sx - v.ox, dy = sy - v.oy, c = Math.cos(-v.rot), s = Math.sin(-v.rot);
  return { x: v.cx + (dx * c - dy * s) / v.scale, z: v.cz + (dx * s + dy * c) / v.scale };
}

export function drawMap(g: CanvasRenderingContext2D, idx: MapIndex, v: MapView, W: number, H: number, opts: { route?: { x: number; z: number }[] | null; labels?: boolean; buildings?: boolean }) {
  const L = idx.L;
  const R = Math.hypot(W, H) / v.scale; // радиус видимой области в метрах
  const x0 = v.cx - R, x1 = v.cx + R, z0 = v.cz - R, z1 = v.cz + R;
  g.save();
  g.fillStyle = PAL.land; g.fillRect(0, 0, W, H);
  g.translate(v.ox, v.oy); g.rotate(v.rot); g.scale(v.scale, v.scale); g.translate(-v.cx, -v.cz);
  const px = 1 / v.scale;
  // поля, промзона, пляж
  g.fillStyle = PAL.field; for (const f of [L.farm, ...L.farm.aiFields]) g.fillRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
  const I = L.industrial; g.fillStyle = PAL.ind; g.fillRect(I.x0, I.z0, I.x1 - I.x0, I.z1 - I.z0);
  // река
  g.fillStyle = PAL.water; g.beginPath();
  const rz0 = Math.max(z0, L.bounds.z0 - 400), rz1 = Math.min(z1, L.bounds.z1 + 400);
  if (rz1 > rz0) {
    for (let z = rz0; z <= rz1; z += 15) g.lineTo(L.river.center(z) - L.river.half, z);
    for (let z = rz1; z >= rz0; z -= 15) g.lineTo(L.river.center(z) + L.river.half, z);
    g.fill();
  }
  const B = L.beach; g.fillStyle = PAL.beach; g.fillRect(B.x0, B.z0, B.x1 - B.x0, B.z1 - B.z0);
  // кварталы
  for (const bl of L.blocks) {
    const bx = bl.i * CELL + ROAD_W / 2, bz = bl.j * CELL + ROAD_W / 2, s = CELL - ROAD_W;
    if (bx > x1 || bx + s < x0 || bz > z1 || bz + s < z0) continue;
    g.fillStyle = PAL.sidewalk; g.fillRect(bx, bz, s, s);
    g.fillStyle = bl.type === 'park' ? PAL.park : bl.type === 'private' ? PAL.priv : PAL.block; g.fillRect(bx + 3, bz + 3, s - 6, s - 6);
  }
  // дороги
  g.lineCap = 'round'; g.lineJoin = 'round';
  const edges = idx.query(idx.e, x0, z0, x1, z1);
  for (const pass of [0, 1]) for (const e of edges) {
    const a = L.nodes[e.a], n = L.nodes[e.b];
    if (pass === 0) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = e.w + 2 * px; }
    else { g.strokeStyle = e.kind === 'highway' ? PAL.highway : e.kind === 'dirt' ? PAL.dirt : PAL.road; g.lineWidth = Math.max(e.w * 0.9, 2.2 * px); }
    g.beginPath(); g.moveTo(a.x, a.z); g.lineTo(n.x, n.z); g.stroke();
  }
  // здания
  if (opts.buildings !== false) {
    for (const bd of idx.query(idx.b, x0, z0, x1, z1)) {
      g.fillStyle = bd.kind === 'tower' ? PAL.tower : bd.kind === 'house' || bd.kind === 'vhouse' ? PAL.house : PAL.bld;
      g.fillRect(bd.x - bd.w / 2, bd.z - bd.d / 2, bd.w, bd.d);
    }
  }
  // маршрут GPS
  if (opts.route && opts.route.length > 1) {
    for (const [col, w] of [['#ffffff', 7], [PAL.route, 4.5]] as const) {
      g.strokeStyle = col; g.lineWidth = w * px; g.beginPath(); g.moveTo(opts.route[0].x, opts.route[0].z);
      for (let i = 1; i < opts.route.length; i++) g.lineTo(opts.route[i].x, opts.route[i].z);
      g.stroke();
    }
  }
  g.restore();
  // подписи
  if (opts.labels) {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${Math.round(Math.max(11, Math.min(16, v.scale * 30)))}px system-ui, sans-serif`;
    const lab = (t: string, x: number, z: number) => { const q = toScreen(v, x, z); g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(t, q.x, q.y); g.fillStyle = '#fff'; g.fillText(t, q.x, q.y); };
    for (const vl of L.villages) lab(vl.name, vl.cx, vl.cz - 34);
    lab('ПРОМЗОНА', (I.x0 + I.x1) / 2, I.z0 - 12); lab('ПЛЯЖ', B.x1 - 20, B.z0 - 10); lab('ЛОС-ГОРОД', 540, -22); lab('Река', L.river.center(150), 150); lab('Поля «Нива»', (L.farm.x0 + L.farm.x1) / 2, L.farm.z0 - 12);
  }
}

export function drawIcons(g: CanvasRenderingContext2D, v: MapView, W: number, H: number, icons: MapIcon[], clampR: number | null, clampRect = false) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const t = performance.now() / 1000;
  for (const m of icons) {
    let q = toScreen(v, m.x, m.z);
    const out = q.x < 6 || q.y < 6 || q.x > W - 6 || q.y > H - 6;
    if (clampR !== null && m.clamp) {
      const dx = q.x - W / 2, dy = q.y - H / 2;
      if (clampRect) { const k = Math.max(Math.abs(dx) / (W / 2 - 12), Math.abs(dy) / (H / 2 - 12)); if (k > 1) q = { x: W / 2 + dx / k, y: H / 2 + dy / k }; }
      else { const d = Math.hypot(dx, dy); if (d > clampR) q = { x: W / 2 + (dx / d) * clampR, y: H / 2 + (dy / d) * clampR }; }
    } else if (out) continue;
    const r = 9 * (m.size ?? 1);
    if (m.pulse) { g.fillStyle = m.color + '55'; g.beginPath(); g.arc(q.x, q.y, r + 4 + Math.sin(t * 5) * 2, 0, 7); g.fill(); }
    g.fillStyle = m.color; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(q.x, q.y, r, 0, 7); g.fill(); g.stroke();
    g.font = `${Math.round(r * 1.15)}px system-ui, "Segoe UI Emoji", sans-serif`; g.fillStyle = '#fff'; g.fillText(m.icon, q.x, q.y + 0.5);
    if (m.label && (!m.small || v.scale > 1.6)) { g.font = 'bold 11px system-ui, sans-serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(m.label, q.x, q.y - r - 7); g.fillStyle = '#fff'; g.fillText(m.label, q.x, q.y - r - 7); }
  }
}

export function drawPlayerArrow(g: CanvasRenderingContext2D, x: number, y: number, angle: number, size = 1) {
  g.save(); g.translate(x, y); g.rotate(angle); g.scale(size, size);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(0, 2, 11, 0, 7); g.fill();
  g.fillStyle = '#ffffff'; g.strokeStyle = '#0f172a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath(); g.fill(); g.stroke();
  g.restore();
}
