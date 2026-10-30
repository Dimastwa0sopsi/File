// Интерьеры: отдельные помещения с полом, стенами, потолком, светом, мебелью и коллизиями
import * as THREE from 'three';
import { Batcher, T, M } from './geom';
import type { Box } from './worldgen';
import { INTERIOR_ORIGIN } from './config';

export interface Interact { x: number; z: number; r: number; label: string; action: string; y?: number }
export interface Interior {
  group: THREE.Group; colliders: Box[]; acts: Interact[]; spawn: { x: number; z: number; a: number; y?: number };
  npcs: { x: number; z: number; a: number; role: string }[]; bounds: { x0: number; x1: number; z0: number; z1: number; h: number };
  bed?: { x: number; z: number; y: number; a: number }; doorSpots: Record<string, { x: number; z: number; a: number; y: number }>;
  pots?: { x: number; z: number }[];
  dispose: () => void;
}
export type InteriorKind = 'shop24' | 'supermarket' | 'cafe' | 'pharmacy' | 'gunshop' | 'clothes' | 'barber' | 'police' | 'hospital' | 'cityhall' | 'bank' |
  'dealer' | 'service' | 'mall' | 'hall' | 'apt_eco' | 'apt_mid' | 'apt_lux' | 'house_city' | 'house_village' | 'vshop' | 'vadmin' | 'checkpoint' | 'fire' | 'gas' | 'mallfood' | 'basement' | 'truckoffice' | 'office' | 'scootershop';

class IB {
  b = new Batcher(); cols: Box[] = []; acts: Interact[] = []; npcs: Interior['npcs'] = []; lights: THREE.Light[] = []; group = new THREE.Group();
  ox = INTERIOR_ORIGIN.x; oz = INTERIOR_ORIGIN.z; doorSpots: Interior['doorSpots'] = {};
  bed?: Interior['bed']; pots: { x: number; z: number }[] = [];
  floor(x0: number, z0: number, x1: number, z1: number, mk: string, s = 2, y = 0) { this.b.add(mk, T.box, M(this.ox + (x0 + x1) / 2, y - 0.05, this.oz + (z0 + z1) / 2, 0, x1 - x0, 0.1, z1 - z0), s); }
  ceil(x0: number, z0: number, x1: number, z1: number, h: number, c = '#f4f4f0') { this.b.add('c:' + c, T.box, M(this.ox + (x0 + x1) / 2, h + 0.05, this.oz + (z0 + z1) / 2, 0, x1 - x0, 0.1, z1 - z0)); }
  col(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) { this.cols.push({ x0: this.ox + Math.min(x0, x1), x1: this.ox + Math.max(x0, x1), z0: this.oz + Math.min(z0, z1), z1: this.oz + Math.max(z0, z1), y0, y1 }); }
  /** осевая стена с дверными проёмами [центр, ширина] */
  wall(x0: number, z0: number, x1: number, z1: number, h: number, mk: string, doors: [number, number][] = [], y0 = 0) {
    const horiz = Math.abs(z1 - z0) < 0.01;
    const a = horiz ? Math.min(x0, x1) : Math.min(z0, z1), bb = horiz ? Math.max(x0, x1) : Math.max(z0, z1);
    const segs: [number, number][] = []; let cur = a;
    const ds = [...doors].sort((p, q) => p[0] - q[0]);
    for (const [c, w] of ds) { segs.push([cur, c - w / 2]); cur = c + w / 2; }
    segs.push([cur, bb]);
    const t = 0.2;
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 0.02) continue;
      const m = (s0 + s1) / 2, L = s1 - s0;
      if (horiz) { this.b.add(mk, T.box, M(this.ox + m, y0 + h / 2, this.oz + z0, 0, L, h, t), 2.5); this.col(s0, z0 - t / 2, s1, z0 + t / 2, y0, y0 + h); }
      else { this.b.add(mk, T.box, M(this.ox + x0, y0 + h / 2, this.oz + m, 0, t, h, L), 2.5); this.col(x0 - t / 2, s0, x0 + t / 2, s1, y0, y0 + h); }
    }
    for (const [c, w] of ds) { // перемычка + наличник
      const lh = h - 2.3;
      if (horiz) { this.b.add(mk, T.box, M(this.ox + c, y0 + 2.3 + lh / 2, this.oz + z0, 0, w, lh, t), 2.5); this.b.add('c:#e7e5e4', T.box, M(this.ox + c, y0 + 2.32, this.oz + z0, 0, w + 0.2, 0.08, t + 0.04)); }
      else { this.b.add(mk, T.box, M(this.ox + x0, y0 + 2.3 + lh / 2, this.oz + c, 0, t, lh, w), 2.5); this.b.add('c:#e7e5e4', T.box, M(this.ox + x0, y0 + 2.32, this.oz + c, 0, t + 0.04, 0.08, w + 0.2)); }
    }
  }
  /** мебель: y — низ */
  f(mk: string, x: number, y: number, z: number, w: number, h: number, d: number, collide = true, ry = 0) {
    this.b.add(mk, T.box, M(this.ox + x, y + h / 2, this.oz + z, ry, w, h, d));
    if (collide) { const rw = Math.abs(Math.cos(ry)) * w + Math.abs(Math.sin(ry)) * d, rd = Math.abs(Math.sin(ry)) * w + Math.abs(Math.cos(ry)) * d; this.col(x - rw / 2, z - rd / 2, x + rw / 2, z + rd / 2, y, y + h); }
  }
  cyl(mk: string, x: number, y: number, z: number, r: number, h: number, collide = false) { this.b.add(mk, T.cylB, M(this.ox + x, y, this.oz + z, 0, r, h, r)); if (collide) this.col(x - r, z - r, x + r, z + r, y, y + h); }
  plane(mk: string, x: number, y: number, z: number, w: number, h: number, ry: number) { this.b.add(mk, T.plane, M(this.ox + x, y, this.oz + z, ry, w, h, 1)); }
  act(x: number, z: number, r: number, label: string, action: string, y = 0) { this.acts.push({ x: this.ox + x, z: this.oz + z, r, label, action, y }); }
  light(x: number, y: number, z: number, i = 1.4, c = 0xfff1d6, dist = 18) {
    const l = new THREE.PointLight(c, i, dist, 1.3); l.position.set(this.ox + x, y, this.oz + z); this.group.add(l); this.lights.push(l);
    this.b.add('glow:#fff8e7', T.box, M(this.ox + x, y + 0.25, this.oz + z, 0, 1.2, 0.04, 1.2));
  }
  npc(x: number, z: number, a: number, role: string) { this.npcs.push({ x: this.ox + x, z: this.oz + z, a, role }); }
  /** базовая комната с выходной дверью на юге (z = d/2) */
  room(w: number, d: number, h: number, floorMk: string, wallMk: string, exitLabel = 'Выйти на улицу') {
    this.floor(-w / 2, -d / 2, w / 2, d / 2, floorMk);
    this.ceil(-w / 2, -d / 2, w / 2, d / 2, h);
    this.wall(-w / 2, -d / 2, w / 2, -d / 2, h, wallMk);
    this.wall(-w / 2, -d / 2, -w / 2, d / 2, h, wallMk);
    this.wall(w / 2, -d / 2, w / 2, d / 2, h, wallMk);
    this.wall(-w / 2, d / 2, w / 2, d / 2, h, wallMk, [[0, 1.6]]);
    this.f('c:#5b3a1e', 0, 0, d / 2 + 0.02, 1.5, 2.25, 0.08); // дверь
    this.f('chrome', 0.55, 1.0, d / 2 - 0.05, 0.12, 0.04, 0.06, false);
    this.act(0, d / 2 - 0.9, 1.3, exitLabel, 'exit');
  }
  shelf(x: number, z: number, len: number, ry: number, seed: number) {
    this.f('c:#e5e7eb', x, 0, z, ry ? 0.6 : len, 1.8, ry ? len : 0.6, true);
    const cols = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#14b8a6', '#eab308'];
    for (let lv = 0; lv < 4; lv++) for (let i = 0; i < Math.floor(len / 0.45); i++) {
      const t = -len / 2 + 0.25 + i * 0.45;
      const c = cols[(i * 3 + lv * 5 + seed) % cols.length];
      const px = ry ? x : x + t, pz = ry ? z + t : z;
      this.f('c:' + c, px + (ry ? 0.33 : 0), 0.2 + lv * 0.42, pz + (ry ? 0 : 0.33), ry ? 0.08 : 0.3, 0.28, ry ? 0.3 : 0.08, false);
      this.f('c:' + c, px - (ry ? 0.33 : 0), 0.2 + lv * 0.42, pz - (ry ? 0 : 0.33), ry ? 0.08 : 0.3, 0.28, ry ? 0.3 : 0.08, false);
    }
  }
  fridgeCase(x: number, z: number, len: number) { // холодильные витрины у задней стены
    this.f('c:#cbd5e1', x, 0, z, len, 2.1, 0.8);
    for (let i = 0; i < len / 0.4; i++) for (let lv = 0; lv < 4; lv++) this.f('c:' + ['#2563eb', '#dc2626', '#16a34a', '#f8fafc'][(i + lv) % 4], x - len / 2 + 0.2 + i * 0.4, 0.3 + lv * 0.42, z + 0.42, 0.18, 0.3, 0.05, false);
    this.f('glass:0.25', x, 0.1, z + 0.45, len, 1.95, 0.03, false);
  }
  counter(x: number, z: number, w: number, label: string, action: string, cashier = true, ry = 0) {
    this.f('c:#78350f', x, 0, z, w, 1.0, 0.7, true, ry);
    this.f('c:#d6d3d1', x, 1.0, z, w + 0.1, 0.05, 0.8, false, ry);
    this.f('c:#111827', x + 0.4, 1.05, z, 0.4, 0.3, 0.3, false, ry);
    this.act(x, z + (ry ? 0 : 1.1), 1.5, label, action);
    if (cashier) this.npc(x, z - 0.9, 0, 'cashier');
  }
  table(x: number, z: number, chairs = 4, c = '#92400e') {
    this.f('c:' + c, x, 0.72, z, 1.1, 0.05, 1.1, false); this.f('c:#333', x, 0, z, 0.1, 0.72, 0.1); this.col(x - 0.55, z - 0.55, x + 0.55, z + 0.55, 0, 0.77);
    const ps = [[0, 0.85], [0, -0.85], [0.85, 0], [-0.85, 0]].slice(0, chairs);
    for (const [dx, dz] of ps) { this.f('c:#57534e', x + dx, 0.45, z + dz, 0.45, 0.05, 0.45, false); this.f('c:#57534e', x + dx * 1.25, 0.45, z + dz * 1.25, Math.abs(dx) > 0 ? 0.05 : 0.45, 0.5, Math.abs(dz) > 0 ? 0.05 : 0.45, false); this.col(x + dx - 0.22, z + dz - 0.22, x + dx + 0.22, z + dz + 0.22, 0, 0.5); }
  }
  bedAt(x: number, z: number, w: number, a: number, linen = '#e0e7ff') {
    const d = 2.1; const rot = a;
    this.f('c:#6b4f3a', x, 0, z, w, 0.45, d, true, rot);
    this.f('c:' + linen, x, 0.45, z, w - 0.1, 0.12, d - 0.1, false, rot);
    const hx = x + Math.sin(rot) * -(d / 2 - 0.25), hz = z + Math.cos(rot) * -(d / 2 - 0.25);
    this.f('c:#ffffff', hx, 0.57, hz, w * 0.7, 0.12, 0.4, false, rot);
    this.f('c:#4b3621', x + Math.sin(rot) * -(d / 2), 0, z + Math.cos(rot) * -(d / 2), rot ? 0.1 : w, 1.1, rot ? w : 0.1, true);
    this.bed = { x: this.ox + x, z: this.oz + z, y: 0.6, a: rot + Math.PI };
    this.act(x + Math.cos(rot) * (w / 2 + 0.5), z - Math.sin(rot) * (w / 2 + 0.5), 1.4, 'Лечь на кровать', 'bed');
  }
  fridgeAt(x: number, z: number, ry: number) {
    this.f('c:#e5e7eb', x, 0, z, 0.7, 1.9, 0.7, true, ry);
    this.f('c:#9ca3af', x + Math.sin(ry) * 0.36 + Math.cos(ry) * 0.25, 0.9, z + Math.cos(ry) * 0.36, ry ? 0.03 : 0.04, 0.5, ry ? 0.04 : 0.03, false);
    this.act(x + Math.sin(ry) * 1.0, z + Math.cos(ry) * 1.0, 1.3, 'Холодильник', 'fridge');
  }
  kitchen(x: number, z: number, len: number, ry: number) {
    // вдоль стены: тумбы + плита + мойка
    const alongX = Math.abs(Math.sin(ry)) < 0.5;
    this.f('c:#f5f5f4', x, 0, z, alongX ? len : 0.65, 0.9, alongX ? 0.65 : len);
    this.f('c:#44403c', x, 0.9, z, alongX ? len + 0.02 : 0.67, 0.04, alongX ? 0.67 : len + 0.02, false);
    this.f('c:#111', x + (alongX ? len / 4 : 0), 0.94, z + (alongX ? 0 : len / 4), 0.55, 0.02, 0.5, false);
    this.f('chrome', x - (alongX ? len / 4 : 0), 0.93, z - (alongX ? 0 : len / 4), 0.5, 0.03, 0.4, false);
  }
  sofa(x: number, z: number, w: number, ry: number, c = '#475569') {
    this.f('c:' + c, x, 0, z, w, 0.45, 0.9, true, ry);
    this.f('c:' + c, x - Math.sin(ry) * 0.38, 0.45, z - Math.cos(ry) * 0.38, Math.abs(Math.sin(ry)) > 0.5 ? 0.2 : w, 0.45, Math.abs(Math.sin(ry)) > 0.5 ? w : 0.2, false);
  }
  tv(x: number, z: number, w: number, ry: number) {
    this.f('c:#0a0a0a', x, 1.0, z, Math.abs(Math.sin(ry)) > 0.5 ? 0.06 : w, w * 0.56, Math.abs(Math.sin(ry)) > 0.5 ? w : 0.06, false);
    this.f('glow:#1e3a8a', x + Math.sin(ry) * 0.04, 1.03, z + Math.cos(ry) * 0.04, Math.abs(Math.sin(ry)) > 0.5 ? 0.01 : w - 0.1, w * 0.5, Math.abs(Math.sin(ry)) > 0.5 ? w - 0.1 : 0.01, false);
  }
  /** рабочее место с ПК: ry=0 — пользователь сидит со стороны +z */
  pc(x: number, z: number, ry: number, action: string, label: string, person = false) {
    const s = Math.sin(ry), c = Math.cos(ry);
    this.f('c:#57534e', x, 0, z, 1.3, 0.75, 0.65, true, ry);
    this.f('c:#0a0a0a', x - s * 0.15, 0.78, z - c * 0.15, 0.62, 0.4, 0.04, false, ry);
    this.f('glow:#60a5fa', x - s * 0.125, 0.8, z - c * 0.125, 0.56, 0.34, 0.01, false, ry);
    this.f('c:#111827', x - s * 0.15, 0.75, z - c * 0.15, 0.08, 0.06, 0.08, false, ry);
    this.f('c:#1f2937', x + s * 0.12, 0.76, z + c * 0.12, 0.45, 0.02, 0.15, false, ry);
    this.f('c:#e5e7eb', x + s * 0.12 + c * 0.32, 0.76, z + c * 0.12 - s * 0.32, 0.07, 0.03, 0.1, false, ry);
    this.cyl('c:#111827', x + s * 0.72, 0, z + c * 0.72, 0.24, 0.48); this.f('c:#111827', x + s * 0.95, 0.48, z + c * 0.95, 0.42, 0.5, 0.06, false, ry);
    this.act(x + s * 1.1, z + c * 1.1, 1.0, label, action);
    if (person) this.npc(x + s * 0.72, z + c * 0.72, ry + Math.PI, 'worker');
  }
  plant(x: number, z: number) { this.cyl('c:#a16207', x, 0, z, 0.22, 0.45); this.b.add('c:#16a34a', T.ico, M(this.ox + x, 0.95, this.oz + z, 0, 0.45, 0.6, 0.45)); this.col(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 0, 1); }
  rug(x: number, z: number, w: number, d: number, c: string) { this.f('c:' + c, x, 0.005, z, w, 0.015, d, false); }
  painting(x: number, y: number, z: number, ry: number, c: string) { this.plane('c:' + c, x, y, z, 1.0, 0.7, ry); }
  finish(spawn: Interior['spawn'], bounds: Interior['bounds']): Interior {
    for (const m of this.b.build({ receive: true })) this.group.add(m);
    const g = this.group;
    return {
      group: g, colliders: this.cols, acts: this.acts, npcs: this.npcs, spawn: { ...spawn, x: this.ox + spawn.x, z: this.oz + spawn.z },
      bounds: { x0: this.ox + bounds.x0, x1: this.ox + bounds.x1, z0: this.oz + bounds.z0, z1: this.oz + bounds.z1, h: bounds.h },
      bed: this.bed, doorSpots: this.doorSpots, pots: this.pots.map((p) => ({ x: this.ox + p.x, z: this.oz + p.z })),
      dispose: () => { g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); }); g.parent?.remove(g); },
    };
  }
}

const WALLS = { white: 'c:#f1efe9', beige: 'c:#e8dcc4', mint: 'c:#d1e7dd', grey: 'c:#d4d4d8', blue: 'c:#c7d2fe', wood: 'c:#b08060', dark: 'c:#3f3f46', pink: 'c:#fbcfe8', brick: 'tex:brickwall' };

export function buildInterior(kind: InteriorKind, opts: { seed?: number; owned?: boolean[]; units?: number; name?: string } = {}): Interior {
  const ib = new IB();
  const seed = opts.seed ?? 1;
  let W = 12, D = 10, H = 3.4;
  const S = (w: number, d: number, h = 3.4) => { W = w; D = d; H = h; };
  switch (kind) {
    case 'shop24': case 'vshop': case 'gas': {
      S(12, 10); ib.room(W, D, H, 'tex:floortile', kind === 'vshop' ? WALLS.wood : WALLS.white);
      for (let i = 0; i < 3; i++) ib.shelf(-3.5 + i * 3.3, -1.0, 4, 1, i + seed);
      ib.fridgeCase(0, -D / 2 + 0.5, 8);
      ib.counter(3.8, 2.6, 2.4, 'Касса: E — купить · R — смена · L — ограбление', 'counter');
      ib.f('c:#facc15', 3.8, 2.2, 3.4 - 1, 0.01, 0.01, 0.01, false);
      ib.light(-2, H - 0.3, 0); ib.light(3, H - 0.3, 0, 1.0);
      break;
    }
    case 'supermarket': {
      S(22, 16); ib.room(W, D, H + 0.6, 'tex:floortile', WALLS.white);
      H += 0.6;
      for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) ib.shelf(-8 + i * 3.6, -4 + r * 5, 4.2, 1, i + r * 2);
      ib.fridgeCase(-2, -D / 2 + 0.5, 16);
      ib.counter(6, 5.5, 2.2, 'Касса: E — купить · R — смена · L — ограбление', 'counter');
      ib.f('c:#78350f', 2, 0, 5.5, 2.2, 1.0, 0.7);
      ib.light(-6, H - 0.3, -2, 1.3, 0xffffff, 22); ib.light(5, H - 0.3, 1, 1.3, 0xffffff, 22);
      break;
    }
    case 'cafe': case 'mallfood': {
      S(12, 10); ib.room(W, D, H, 'tex:parquet', WALLS.beige, kind === 'mallfood' ? 'Выйти в торговый центр' : 'Выйти на улицу');
      ib.counter(-3, -3.2, 4, 'Заказ: E — купить · R — смена · L — ограбление', 'counter');
      ib.f('c:#1f2937', -4.5, 1.05, -3.2, 0.5, 0.5, 0.4, false);
      for (const [x, z] of [[2, -2.5], [4.2, -2.5], [2, 0.5], [4.2, 0.5], [-1, 1.5]]) ib.table(x, z, 4);
      ib.painting(0, 2, -D / 2 + 0.12, 0, '#b45309'); ib.plant(5.4, 4.2); ib.plant(-5.4, 4.2);
      ib.light(-2, H - 0.3, -1, 1.0, 0xffd7a0); ib.light(3, H - 0.3, 0, 1.0, 0xffd7a0);
      break;
    }
    case 'pharmacy': {
      S(10, 8); ib.room(W, D, H, 'tex:floortile', WALLS.mint);
      ib.f('c:#ffffff', 0, 0, -D / 2 + 0.4, W - 1, 2.2, 0.6);
      for (let i = 0; i < 14; i++) for (let lv = 0; lv < 4; lv++) ib.f('c:' + ['#ffffff', '#10b981', '#60a5fa', '#fca5a5'][(i + lv) % 4], -4 + i * 0.6, 0.3 + lv * 0.45, -D / 2 + 0.75, 0.3, 0.25, 0.1, false);
      ib.counter(0, -1.5, 3.5, 'Аптека: E — купить · R — смена · L — ограбление', 'counter');
      ib.plane('sign:✚ АПТЕКА|#10b981', 0, 2.8, -D / 2 + 0.75, 3, 0.55, 0);
      ib.light(0, H - 0.3, 0, 1.4, 0xffffff);
      break;
    }
    case 'gunshop': {
      S(10, 8); ib.room(W, D, H, 'tex:parquet', WALLS.dark);
      for (let i = 0; i < 8; i++) { ib.f('c:#111', -3.5 + i, 1.2 + (i % 2) * 0.5, -D / 2 + 0.15, 0.8, 0.12, 0.08, false); ib.f('c:#78350f', -3.2 + i, 1.15 + (i % 2) * 0.5, -D / 2 + 0.15, 0.3, 0.1, 0.09, false); }
      ib.f('c:#1f2937', 0, 0, -1.2, 5, 1.0, 0.7); ib.f('glass:0.3', 0, 1.0, -1.2, 5, 0.35, 0.7, false);
      ib.act(0, -0.1, 1.6, 'Оружейная: E — купить · R — смена · L — ограбление', 'counter'); ib.npc(0, -2.2, 0, 'cashier');
      ib.f('c:#f8fafc', 4.85, 1.2, 1, 0.05, 1.2, 0.9, false); ib.cyl('c:#dc2626', 4.8, 1.75, 1, 0.25, 0.02);
      ib.light(0, H - 0.3, 0, 1.2, 0xffe4c4);
      break;
    }
    case 'clothes': {
      S(14, 10); ib.room(W, D, H, 'tex:parquet', WALLS.pink);
      for (let r = 0; r < 3; r++) {
        const x = -4 + r * 4;
        ib.f('chrome', x, 1.5, -1, 2.6, 0.05, 0.05, false); ib.f('chrome', x - 1.3, 0, -1, 0.05, 1.5, 0.05); ib.f('chrome', x + 1.3, 0, -1, 0.05, 1.5, 0.05);
        for (let i = 0; i < 8; i++) ib.f('c:' + ['#1d4ed8', '#dc2626', '#16a34a', '#f59e0b', '#111827', '#ffffff', '#7c3aed', '#db2777'][(i + r) % 8], x - 1.1 + i * 0.31, 0.75, -1, 0.06, 0.75, 0.45, false);
        ib.col(x - 1.3, -1.3, x + 1.3, -0.7, 0, 1.6);
      }
      ib.f('glass:0.15', -W / 2 + 0.15, 0.2, 2, 0.05, 2.0, 1.0, false); ib.f('chrome', -W / 2 + 0.12, 0.2, 2, 0.04, 2.0, 1.1, false);
      ib.f('c:#7c3aed', 5.5, 0, -3.5, 1.8, 2.3, 0.05); ib.f('c:#7c3aed', 4.6, 0, -2.6, 0.05, 2.3, 1.8);
      ib.act(5.2, -2.4, 1.6, 'Примерочная: выбрать одежду', 'clothes');
      ib.counter(-4, -3.8, 2, 'Касса — примерка и покупка одежды', 'clothes');
      ib.light(-2, H - 0.3, 0, 1.2, 0xffffff); ib.light(3, H - 0.3, 0, 1.0, 0xffffff);
      break;
    }
    case 'barber': {
      S(10, 8); ib.room(W, D, H, 'tex:floortile', WALLS.blue);
      for (let i = 0; i < 3; i++) {
        const x = -3 + i * 3;
        ib.f('c:#111827', x, 0, -2.6, 0.7, 0.55, 0.7); ib.f('c:#111827', x, 0.55, -2.95, 0.7, 0.7, 0.1, false);
        ib.f('glass:0.15', x, 1.0, -D / 2 + 0.12, 1.1, 1.2, 0.02, false); ib.f('chrome', x, 0.98, -D / 2 + 0.11, 1.2, 1.24, 0.01, false);
        ib.f('c:#ffffff', x, 0.85, -D / 2 + 0.3, 1.0, 0.08, 0.3, false);
      }
      ib.act(0, -1.3, 1.8, 'Сесть в кресло: стрижка и окраска', 'barber');
      ib.npc(1.5, -1.8, Math.PI, 'barber');
      ib.sofa(-3.5, 2.8, 2, Math.PI);
      ib.light(0, H - 0.3, 0, 1.3, 0xffffff);
      break;
    }
    case 'police': {
      S(16, 12); ib.room(W, D, H, 'tex:floortile', WALLS.grey);
      ib.counter(0, -2, 4, 'Дежурная часть: оплатить штрафы', 'police', false);
      ib.npc(0, -2.9, 0, 'police');
      for (let i = 0; i < 3; i++) { const x = -6 + i * 2.3; ib.wall(x - 1.1, -D / 2, x - 1.1, -D / 2 + 2.6, H, WALLS.grey); for (let k = 0; k < 8; k++) ib.f('c:#52525b', x - 0.9 + k * 0.26, 0, -D / 2 + 2.6, 0.05, 2.4, 0.05); ib.col(x - 1.1, -D / 2 + 2.5, x + 1.2, -D / 2 + 2.7, 0, 2.4); }
      ib.sofa(4.5, 3.6, 3, Math.PI, '#1e3a8a'); ib.plane('sign:ПОЛИЦИЯ|#1e40af', 0, 2.7, -D / 2 + 0.12, 4, 0.7, 0);
      ib.light(-3, H - 0.3, 0, 1.2, 0xffffff); ib.light(4, H - 0.3, 0, 1.2, 0xffffff);
      break;
    }
    case 'hospital': {
      S(16, 12); ib.room(W, D, H, 'tex:floortile', WALLS.white);
      ib.counter(-3, -1, 3.5, 'Регистратура: лечение · смена пола', 'hospital', false); ib.npc(-3, -1.9, 0, 'doctor');
      for (let i = 0; i < 3; i++) { const x = 1.5 + i * 2.2; ib.f('c:#e5e7eb', x, 0, -D / 2 + 1.3, 0.95, 0.6, 2); ib.f('c:#bfdbfe', x, 0.6, -D / 2 + 1.3, 0.9, 0.1, 1.9, false); ib.f('c:#93c5fd', x + 1.05, 0, -D / 2 + 1.3, 0.04, 2, 2.2, false); }
      ib.sofa(-5, 3.5, 3, Math.PI, '#0e7490');
      ib.plane('sign:✚ БОЛЬНИЦА|#dc2626', -3, 2.7, -D / 2 + 0.12, 4, 0.7, 0);
      ib.light(-3, H - 0.3, 0, 1.3, 0xffffff); ib.light(4, H - 0.3, -2, 1.3, 0xffffff);
      break;
    }
    case 'cityhall': {
      S(20, 14, 5); ib.room(W, D, H, 'tex:parquet', WALLS.beige);
      for (const x of [-6, -2, 2, 6]) for (const z of [-2, 2.5]) ib.cyl('c:#f5f5f4', x, 0, z, 0.35, H, true);
      ib.counter(0, -4.6, 6, 'Приёмная: штрафы, недвижимость', 'cityhall', false); ib.npc(-1, -5.4, 0, 'clerk'); ib.npc(1.5, -5.4, 0, 'clerk');
      ib.rug(0, 0.5, 3, 10, '#7f1d1d');
      ib.f('c:#1d4ed8', -8.5, 0, -6.6, 0.05, 3, 1, false); ib.f('c:#ffffff', -8.5, 2, -6.6, 0.06, 1, 1, false); ib.cyl('c:#888', -8.5, 0, -6.1, 0.04, 3.2);
      ib.plane('sign:МЭРИЯ ЛОС-ГОРОДА|#1e3a8a', 0, 3.8, -D / 2 + 0.12, 6, 0.9, 0);
      ib.light(-4, H - 0.4, 0, 1.4, 0xfff0d0, 22); ib.light(4, H - 0.4, 0, 1.4, 0xfff0d0, 22);
      break;
    }
    case 'bank': {
      S(14, 10, 4); ib.room(W, D, H, 'tex:floortile', WALLS.beige);
      ib.f('c:#78350f', 0, 0, -1.8, 9, 1.1, 0.7); ib.f('glass:0.25', 0, 1.1, -1.8, 9, 1.2, 0.05, false);
      ib.act(0, -0.6, 2, 'Банк: доход бизнесов, штрафы', 'bank'); ib.npc(-2, -2.6, 0, 'clerk'); ib.npc(2, -2.6, 0, 'clerk');
      ib.cyl('c:#9ca3af', 0, 0.3, -D / 2 + 0.2, 1.3, 0.2); ib.f('c:#6b7280', 0, 0, -D / 2 + 0.15, 2.8, 2.8, 0.1, false);
      ib.plant(-6, 4); ib.plant(6, 4);
      ib.light(0, H - 0.3, 0, 1.4, 0xffffff, 20);
      break;
    }
    case 'dealer': {
      S(24, 14, 6); ib.room(W, D, H, 'tex:floortile', WALLS.white);
      ib.f('c:#111827', 8, 0, -4, 3, 0.8, 1.2); ib.npc(8, -4.9, 0, 'clerk');
      ib.act(8, -2.6, 2, 'Автосалон: купить новую машину', 'dealer');
      for (const x of [-7, 0]) { ib.cyl('c:#e5e7eb', x, 0, -1, 3, 0.15); ib.col(x - 3, -4, x + 3, 2, 0, 0.15); }
      ib.npc(-3, 3, Math.PI, 'clerk');
      ib.light(-6, H - 0.4, 0, 1.6, 0xffffff, 25); ib.light(6, H - 0.4, 0, 1.6, 0xffffff, 25);
      break;
    }
    case 'service': {
      S(16, 12, 5); ib.room(W, D, H, 'tex:concrete', WALLS.grey);
      ib.f('c:#facc15', -3, 0, -1, 0.3, 1.8, 4); ib.f('c:#facc15', 0, 0, -1, 0.3, 1.8, 4); ib.f('c:#374151', -1.5, 1.6, -1, 3.2, 0.12, 4.2, false);
      ib.f('c:#b91c1c', 6, 0, -5, 3, 1.4, 0.7); ib.act(4.5, -3.5, 2, 'Мастер: ремонт и тюнинг (подъезжайте на машине к воротам)', 'service-info'); ib.npc(6, -4.4, Math.PI, 'mechanic');
      ib.light(0, H - 0.4, 0, 1.4, 0xffffff, 20);
      break;
    }
    case 'fire': {
      S(14, 10, 5); ib.room(W, D, H, 'tex:concrete', WALLS.grey);
      ib.f('c:#b91c1c', -3, 0, -1, 2.4, 2.6, 7); ib.f('c:#111', -3, 2.6, 1.5, 2.2, 0.4, 1.5, false);
      ib.counter(4, -2, 2.5, 'Пожарная часть: вызовы через телефон', 'fire-info', false); ib.npc(4, -2.9, 0, 'fireman');
      ib.light(0, H - 0.4, 0, 1.3, 0xffffff, 20);
      break;
    }
    case 'vadmin': {
      S(10, 8); ib.room(W, D, H, 'tex:parquet', WALLS.beige);
      ib.f('c:#78350f', 0, 0, -2, 3, 0.8, 1.1); ib.npc(0, -2.9, 0, 'clerk');
      ib.act(0, -0.9, 1.5, 'Администрация: дома на продажу', 'vadmin');
      ib.f('c:#1d4ed8', -4, 0, -3.6, 0.05, 2.5, 0.8, false); ib.table(3, 1.5, 4);
      ib.light(0, H - 0.3, 0, 1.2);
      break;
    }
    case 'checkpoint': {
      S(10, 7); ib.room(W, D, H, 'tex:concrete', WALLS.grey);
      ib.f('glass:0.3', -2, 0, -1, 3, 2.4, 0.08); ib.f('c:#d1d5db', -2, 0, -2, 2.8, 0.9, 0.8); ib.npc(-2, -2.6, 0, 'guard');
      ib.f('chrome', 2, 0, -1, 0.15, 1.0, 0.15); ib.f('chrome', 2, 0.9, -1, 1.0, 0.06, 0.06, false);
      ib.act(-2, 0, 1.6, 'Отдел кадров: работа на заводе', 'factory');
      ib.light(0, H - 0.3, 0, 1.2, 0xffffff);
      break;
    }
    case 'basement': {
      S(8, 7, 2.5); ib.room(W, D, H, 'tex:concrete', 'tex:brickwall', 'Подняться в дом');
      ib.f('c:#57534e', 0, 0, D / 2 - 0.6, 0.7, 2.4, 0.12, false); for (let k = 0; k < 6; k++) ib.f('c:#78716c', 0, 0.3 + k * 0.38, D / 2 - 0.5, 0.65, 0.05, 0.25, false); // лестница
      for (let k = 0; k < 6; k++) {
        const x = -2.6 + (k % 3) * 2.6, z = -1.9 + Math.floor(k / 3) * 2.0;
        ib.cyl('c:#3f2a1d', x, 0, z, 0.38, 0.5, true); ib.cyl('c:#2b1d12', x, 0.5, z, 0.34, 0.02);
        ib.f('glow:#d946ef', x, H - 0.35, z, 0.9, 0.05, 0.25, false); ib.f('c:#1f2937', x, H - 0.3, z, 0.95, 0.06, 0.3, false);
        ib.act(x, z + 0.7, 0.9, `Горшок ${k + 1}`, 'pot:' + k);
        ib.pots.push({ x, z });
      }
      ib.f('c:#1f2937', W / 2 - 0.4, 0, -D / 2 + 0.6, 0.6, 1.2, 0.8); ib.f('glow:#22c55e', W / 2 - 0.4, 1.0, -D / 2 + 0.95, 0.2, 0.06, 0.02, false); // щиток вентиляции
      ib.light(0, H - 0.3, -1, 1.2, 0xe879f9, 12); ib.light(0, H - 0.3, 1.5, 0.6, 0xfff1d6, 8);
      break;
    }
    case 'office': {
      S(22, 15, 3.4); ib.room(W, D, H, 'tex:floortile', WALLS.white);
      ib.f('glass:0.35', 0, 0.6, -D / 2 + 0.15, W - 1, 2.4, 0.05, false); // панорамное окно
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const i = r * 4 + c; ib.pc(-8 + c * 4.6, -4.2 + r * 4.4, 0, 'pc:' + i, `Рабочий ПК №${i + 1}`, (i % 3) === 1); }
      ib.counter(7.5, 4.6, 3.2, 'Отдел кадров «ЛосТех»: устройство в офис', 'officehr', false); ib.npc(7.5, 3.7, 0, 'clerk');
      ib.f('c:#1f2937', -9.6, 0, 5.4, 1.2, 1.0, 0.7); ib.f('c:#7c2d12', -9.6, 1.0, 5.4, 0.4, 0.4, 0.4, false); ib.act(-9.6, 4.5, 1.2, 'Кофемашина', 'coffee');
      ib.plane('sign:«ЛосТех» · IT & ДАННЫЕ|#0ea5e9', 0, 2.7, D / 2 - 0.12, 5, 0.6, Math.PI);
      ib.plant(-10.3, -6.6); ib.plant(10.3, -6.6); ib.sofa(-3, 5.9, 2.6, Math.PI, '#0ea5e9');
      ib.light(-6, H - 0.3, -2, 1.2, 0xffffff, 18); ib.light(4, H - 0.3, -2, 1.2, 0xffffff, 18); ib.light(0, H - 0.3, 4, 1.0, 0xffffff, 14);
      break;
    }
    case 'scootershop': {
      S(14, 10, 4); ib.room(W, D, H, 'tex:floortile', WALLS.mint);
      for (let i = 0; i < 6; i++) {
        const x = -5 + (i % 3) * 4.2, z = -3.4 + Math.floor(i / 3) * 3.4;
        ib.cyl('c:#e5e7eb', x, 0, z, 0.9, 0.12); ib.f('c:#16a34a', x, 0.14, z, 0.18, 0.06, 1.0, false); ib.f('c:#111827', x, 0.2, z + 0.45, 0.05, 1.0, 0.05, false); ib.f('c:#111827', x, 1.2, z + 0.45, 0.5, 0.03, 0.03, false);
        ib.col(x - 0.9, z - 0.9, x + 0.9, z + 0.9, 0, 0.12);
      }
      ib.counter(4.5, 2.6, 3, 'Продавец: электросамокаты (20 моделей)', 'scooterdealer', false); ib.npc(4.5, 1.7, 0, 'clerk');
      ib.plane('sign:🛴 ВЖУХ STORE|#16a34a', 0, 3.1, -D / 2 + 0.12, 4.5, 0.7, 0);
      ib.light(-3, H - 0.4, -1, 1.4, 0xffffff, 18); ib.light(3, H - 0.4, 1, 1.2, 0xffffff, 16);
      break;
    }
    case 'truckoffice': {
      S(12, 9); ib.room(W, D, H, 'tex:floortile', WALLS.grey);
      ib.counter(0, -2.6, 4, 'Диспетчер: устройство на работу и заказы', 'trucker', false); ib.npc(0, -3.5, 0, 'clerk');
      ib.plane('sign:«ВОСТОК-ТРАНС» · ГРУЗОПЕРЕВОЗКИ|#b45309', 0, 2.6, -D / 2 + 0.12, 5, 0.6, 0);
      ib.f('c:#1e293b', -4.5, 1.2, -D / 2 + 0.15, 2.4, 1.4, 0.05, false); ib.f('glow:#38bdf8', -4.5, 1.3, -D / 2 + 0.18, 2.2, 1.2, 0.01, false); // карта маршрутов
      for (const [x, z] of [[-3.5, 1.5], [3.5, 1.5]]) { ib.f('c:#78350f', x, 0, z, 1.6, 0.75, 0.8); ib.f('c:#111827', x, 0.75, z, 0.5, 0.35, 0.05, false); ib.cyl('c:#111', x, 0, z + 0.8, 0.22, 0.48); }
      ib.sofa(0, 3.4, 2.4, Math.PI, '#b45309'); ib.plant(5.4, 3.6);
      ib.light(-2, H - 0.3, 0, 1.2, 0xffffff); ib.light(3, H - 0.3, 0, 1.0, 0xffffff);
      break;
    }
    case 'mall': {
      S(44, 32, 9); ib.room(W, D, H, 'tex:floortile', WALLS.white);
      ib.ceil(-W / 2, -D / 2, W / 2, D / 2, H, '#e2e8f0');
      // галерея второго этажа (декоративная) и витрины
      ib.f('c:#cbd5e1', 0, 4.2, -D / 2 + 1.5, W, 0.25, 3, false);
      ib.f('glass:0.3', 0, 4.45, -D / 2 + 3, W, 1.0, 0.05, false);
      const shops: [string, string, string][] = [['clothes', 'Одежда «Стиль»', '#8b5cf6'], ['mallfood', 'Фуд-корт «Вкусно»', '#f97316'], ['pharmacy', 'Аптека', '#10b981'], ['barber', 'Барбершоп', '#ec4899'], ['shop24', 'Продукты', '#e11d48'], ['gunshop', 'Охота и рыбалка', '#374151']];
      shops.forEach(([k, name, color], i) => {
        const left = i < 3; const z = -10 + (i % 3) * 8;
        const x = left ? -W / 2 + 0.25 : W / 2 - 0.25;
        const ry = left ? Math.PI / 2 : -Math.PI / 2;
        ib.f('glass:0.35', x + (left ? 0.1 : -0.1), 0.3, z - 2.2, 0.08, 2.6, 3, false);
        ib.f('c:' + color, x + (left ? 0.05 : -0.05), 0, z + 1.4, 0.12, 2.4, 1.6, false);
        ib.plane(`sign:${name}|${color}`, x + (left ? 0.2 : -0.2), 3.2, z - 0.5, 5, 0.9, ry);
        for (let n = 0; n < 4; n++) ib.f('c:' + ['#f43f5e', '#3b82f6', '#22c55e', '#eab308'][(n + i) % 4], x + (left ? 0.6 : -0.6), 0.3, z - 3.2 + n * 0.6, 0.3, 1.4 + (n % 2) * 0.4, 0.4, false);
        ib.act(x + (left ? 1.0 : -1.0), z + 1.4, 1.4, `Войти: ${name}`, `mallshop:${k}:${i}`);
        ib.doorSpots['shop' + i] = { x: ib.ox + x + (left ? 1.4 : -1.4), z: ib.oz + z + 1.4, a: left ? Math.PI / 2 : -Math.PI / 2, y: 0 };
      });
      ib.cyl('c:#9ca3af', 0, 0, 0, 3, 0.7, true); ib.cyl('water', 0, 0.5, 0, 2.7, 0.25); ib.cyl('c:#e5e7eb', 0, 0.7, 0, 0.4, 2.5);
      for (const [x, z] of [[-6, 6], [6, 6], [-6, -6], [6, -6]]) { ib.sofa(x, z, 2.2, x > 0 ? -Math.PI / 2 : Math.PI / 2, '#334155'); ib.plant(x, z + (z > 0 ? 2 : -2)); }
      ib.npc(-8, 3, 1, 'shopper'); ib.npc(9, -3, -2, 'shopper'); ib.npc(3, 9, 3, 'shopper');
      ib.light(-12, H - 0.5, 0, 1.5, 0xffffff, 26); ib.light(12, H - 0.5, 0, 1.5, 0xffffff, 26); ib.light(0, H - 0.5, 8, 1.2, 0xffffff, 22);
      break;
    }
    case 'hall': {
      // подъезд: лестница на площадку, перила, почтовые ящики, 4 двери квартир
      S(9, 11, 6.6); ib.room(W, D, H, 'tex:floortile', WALLS.mint, 'Выйти из подъезда');
      // почтовые ящики
      for (let i = 0; i < 6; i++) for (let r = 0; r < 2; r++) ib.f('c:#1e3a8a', -W / 2 + 0.2, 1.1 + r * 0.32, 2.4 + i * 0.33, 0.12, 0.28, 0.3, false);
      // лестница вдоль правой стены вверх к площадке (z от 3 к -1)
      const steps = 10, rise = 3.0 / steps;
      for (let s = 0; s < steps; s++) { const z = 2.6 - s * 0.38; ib.f('c:#a8a29e', 3.2, 0, z, 2.2, rise * (s + 1), 0.38); }
      ib.f('c:#a8a29e', 0.5, 2.85, -3.15, 7.6, 0.15, 4.3, false); ib.col(-3.3, -5.4, 4.3, -1.0, 2.85, 3.0); // площадка
      // перила
      for (let s = 0; s <= steps; s += 2) ib.f('c:#44403c', 2.1, rise * s, 2.6 - s * 0.38, 0.05, 1.0, 0.05, false);
      ib.f('c:#78350f', 2.1, 1.0 + 1.5, 0.7, 0.07, 0.07, 4.2, false, 0);
      ib.col(2.0, -0.9, 2.15, 2.8, 0, 2.2); // ограждение лестницы
      ib.f('c:#44403c', -0.6, 3.0, -1.05, 5.4, 1.0, 0.05); ib.f('c:#78350f', -0.6, 4.0, -1.05, 5.4, 0.07, 0.08, false);
      // двери квартир: 0,1 внизу (левая стена и задняя), 2,3 на площадке
      const doors = [[-W / 2 + 0.12, -0.3, Math.PI / 2, 0], [-W / 2 + 0.12, -1.0 + 2.4, Math.PI / 2, 0], [-2.2, -D / 2 + 0.12, 0, 3.0], [1.4, -D / 2 + 0.12, 0, 3.0]];
      doors.forEach(([x, z, ry, y], u) => {
        const owned = opts.owned?.[u];
        ib.f(owned ? 'c:#166534' : 'c:#7c2d12', x, y, z, ry ? 0.06 : 1.0, 2.1, ry ? 1.0 : 0.06, false);
        ib.f('chrome', x + (ry ? 0.05 : 0.35), y + 1.0, z + (ry ? 0.35 : 0.05), 0.05, 0.05, 0.05, false);
        ib.plane(`sign:${u + 1}|#334155`, x + (ry ? 0.04 : 0), y + 2.25, z + (ry ? 0 : 0.04), 0.3, 0.2, ry);
        const ax = x + (ry ? 0.9 : 0), az = z + (ry ? 0 : 0.9);
        ib.act(ax, az, 1.2, `Квартира ${u + 1}`, 'apt:' + u, y);
        ib.doorSpots['apt' + u] = { x: ib.ox + ax, z: ib.oz + az, a: ry ? Math.PI / 2 : 0, y };
      });
      ib.light(0, 2.6, 2, 1.0, 0xfff3d6, 12); ib.light(0, H - 0.4, -3.6, 1.0, 0xfff3d6, 12);
      break;
    }
    case 'apt_eco': {
      S(7, 7, 2.9); ib.room(W, D, H, 'tex:parquet', WALLS.beige, 'Выйти в подъезд');
      ib.bedAt(-2.3, -1.9, 1.4, 0, '#c7d2fe');
      ib.kitchen(1.6, -D / 2 + 0.35, 2.6, 0); ib.fridgeAt(W / 2 - 0.45, -1.2, -Math.PI / 2);
      ib.table(1.2, 0.8, 2); ib.wall(-W / 2, 1.6, -1.5, 1.6, H, WALLS.white, [[-2.5, 0.8]]); // санузел
      ib.f('c:#ffffff', -3.0, 0, 2.8, 0.6, 0.45, 0.7); ib.rug(-0.5, 0, 2, 1.4, '#9a3412');
      ib.tv(W / 2 - 0.15, 1.6, 1.0, -Math.PI / 2); ib.light(0, H - 0.3, 0, 1.0);
      break;
    }
    case 'apt_mid': {
      S(11, 9, 2.9); ib.room(W, D, H, 'tex:parquet', WALLS.beige, 'Выйти в подъезд');
      // спальня слева, стена с проёмом
      ib.wall(-1.5, -D / 2, -1.5, D / 2, H, WALLS.blue, [[0.8, 1.0]]);
      ib.bedAt(-3.6, -2.6, 1.6, 0, '#bfdbfe'); ib.f('c:#78350f', -5.0, 0, 1.5, 0.6, 2.1, 1.6); ib.plant(-2.1, 3.8);
      ib.pc(-3.6, 3.95, Math.PI, 'homepc', 'Компьютер');
      // кухня-гостиная
      ib.kitchen(2.8, -D / 2 + 0.35, 4, 0); ib.fridgeAt(W / 2 - 0.45, -2.4, -Math.PI / 2);
      ib.table(2.6, -1.5, 4); ib.sofa(2.5, 2.9, 2.6, Math.PI); ib.tv(2.5, -0.1, 1.4, 0); ib.f('c:#292524', 2.5, 0, -0.1, 1.6, 0.6, 0.4);
      ib.rug(2.5, 1.6, 3, 1.8, '#475569');
      // санузел в углу
      ib.wall(3.8, 2.5, W / 2, 2.5, H, WALLS.white, [[4.4, 0.8]]);
      ib.f('c:#ffffff', 5.0, 0, 3.8, 0.7, 0.5, 0.6);
      ib.light(-3.5, H - 0.3, 0, 0.9); ib.light(2.5, H - 0.3, 0, 1.1);
      break;
    }
    case 'apt_lux': {
      S(18, 14, 3.2); ib.room(W, D, H, 'tex:parquet', WALLS.white, 'Выйти в подъезд');
      // планировка: спальня (лево-зад), гардероб (лево-перед), ванная (право-зад), гостиная+кухня (центр/право)
      ib.wall(-3, -D / 2, -3, D / 2, H, WALLS.beige, [[-3.5, 1.1], [3.8, 1.0]]); // стена между спальнями/гостиной
      ib.wall(-W / 2, 1.0, -3, 1.0, H, WALLS.beige, [[-6, 1.0]]); // спальня | гардероб
      ib.wall(4.5, -D / 2, 4.5, -1.5, H, WALLS.white, [[-2.6, 1.0]]); // ванная
      ib.wall(4.5, -1.5, W / 2, -1.5, H, WALLS.white);
      // спальня
      ib.bedAt(-6, -4.4, 2.0, 0, '#f5f5f4'); ib.f('c:#d6d3d1', -7.6, 0, -5.9, 0.6, 0.5, 0.5); ib.f('c:#d6d3d1', -4.4, 0, -5.9, 0.6, 0.5, 0.5);
      ib.f('glow:#fde68a', -7.6, 0.5, -5.9, 0.2, 0.35, 0.2, false); ib.painting(-6, 2, -D / 2 + 0.12, 0, '#0f766e'); ib.rug(-6, -2.4, 3, 2, '#d4d4d8');
      ib.pc(-8.55, -1.4, Math.PI / 2, 'homepc', 'Компьютер');
      // гардероб
      ib.f('c:#57534e', -W / 2 + 0.4, 0, 4, 0.7, 2.4, 5); ib.f('c:#57534e', -4.2, 0, 6.6, 3.5, 2.4, 0.6);
      ib.f('glass:0.15', -5.5, 0.1, 6.85, 1, 2, 0.02, false);
      // гостиная: угловой диван, большая ТВ-панель
      ib.sofa(1, 4.6, 4, Math.PI, '#334155'); ib.sofa(-1.4, 2.6, 2.4, Math.PI / 2, '#334155');
      ib.f('c:#78716c', 1, 0, 2.6, 1.6, 0.4, 0.9); ib.rug(1, 3, 5, 3.5, '#a8a29e');
      ib.tv(1, -0.2, 2.6, 0); ib.f('c:#1c1917', 1, 0, -0.2, 3.2, 0.5, 0.45);
      // кухня с островом
            ib.f('c:#f5f5f4', W / 2 - 0.35, 0, 3.2, 0.65, 0.9, 5); ib.f('c:#1c1917', W / 2 - 0.35, 0.9, 3.2, 0.67, 0.04, 5.02, false);
      ib.fridgeAt(W / 2 - 0.45, -0.6, -Math.PI / 2);
      ib.f('c:#e7e5e4', 6.2, 0, 3.2, 1.2, 0.95, 2.6); ib.f('c:#292524', 6.2, 0.95, 3.2, 1.3, 0.05, 2.7, false);
      for (const z of [2.4, 3.2, 4.0]) ib.cyl('c:#111', 5.2, 0, z, 0.2, 0.75);
      ib.f('glow:#fef3c7', 6.2, 2.4, 3.2, 0.3, 0.3, 0.3, false);
      // ванная
      ib.f('c:#ffffff', 7.6, 0, -5.8, 1.8, 0.6, 0.8); ib.f('c:#ffffff', 5.3, 0, -6.4, 0.5, 0.45, 0.6); ib.f('c:#ffffff', 8.4, 0, -3.0, 0.6, 0.85, 0.5);
      ib.f('glass:0.2', 8.6, 0.9, -3.0, 0.02, 0.8, 0.6, false);
      ib.plant(-2.5, 6.3); ib.plant(4, 0.5); ib.painting(1, 2.2, D / 2 - 0.12, Math.PI, '#b45309');
      ib.light(-6, H - 0.3, -3, 0.9); ib.light(1, H - 0.3, 2.5, 1.2); ib.light(7, H - 0.3, 3, 0.9); ib.light(7, H - 0.3, -4.5, 0.7, 0xe0f2fe, 8);
      break;
    }
    case 'house_village': case 'house_city': {
      const city = kind === 'house_city';
      S(city ? 10 : 8, city ? 10 : 9, 2.8);
      ib.room(W, D, H, 'tex:parquet', city ? WALLS.beige : WALLS.wood, 'Выйти на крыльцо');
      // сени: тамбур у входа
      ib.wall(-W / 2, D / 2 - 2.4, W / 2, D / 2 - 2.4, H, city ? WALLS.white : 'c:#8b6b4a', [[0, 1.0]]);
      ib.wall(-1.4, D / 2 - 2.4, -1.4, D / 2, H, city ? WALLS.white : 'c:#8b6b4a');
      ib.f('c:#57534e', -0.9, 0, D / 2 - 0.6, 0.5, 1.6, 0.5); ib.f('c:#3f3f46', 1.2, 0, D / 2 - 0.4, 1.0, 0.1, 0.5, false); // вешалка, коврик
      ib.f('c:#78350f', 1.8, 0, D / 2 - 1.8, 0.5, 0.45, 1.0); // скамья в сенях
      // комната
      ib.bedAt(-W / 2 + 1.0, -D / 2 + 1.4, 1.4, 0, city ? '#e0e7ff' : '#fde68a');
      ib.fridgeAt(W / 2 - 0.45, -D / 2 + 1.0, -Math.PI / 2);
      ib.kitchen(W / 2 - 0.35, 0.2, 2.2, Math.PI / 2);
      ib.table(0.5, -0.5, 3);
      if (!city) {
        ib.f('c:#e7e5e4', -W / 2 + 0.9, 0, 0.5, 1.6, 1.8, 1.4); ib.f('c:#57534e', -W / 2 + 0.9, 1.8, 0.5, 0.4, 1.0, 0.4, false); // печь
        ib.f('c:#5b3a1e', 1.9, 0.005, 1.3, 1.0, 0.02, 1.0, false); ib.f('c:#3b2412', 1.9, 0.02, 1.3, 0.9, 0.01, 0.9, false); ib.f('chrome', 2.25, 0.03, 1.3, 0.12, 0.03, 0.04, false); // люк
        ib.act(1.9, 1.3, 1.1, 'Спуститься в подвал', 'basement');
        ib.doorSpots['hatch'] = { x: ib.ox + 1.9, z: ib.oz + 0.4, a: Math.PI, y: 0 };
      }
      else {
        ib.sofa(-2.5, 1.2, 2.4, Math.PI / 2); ib.tv(-W / 2 + 0.15, -1.3, 1.2, Math.PI / 2);
        ib.pc(1.5, -D / 2 + 0.5, 0, 'homepc', 'Компьютер');
        ib.f('c:#5b3a1e', 1.9, 0.005, 1.3, 1.0, 0.02, 1.0, false); ib.f('c:#3b2412', 1.9, 0.02, 1.3, 0.9, 0.01, 0.9, false); ib.f('chrome', 2.25, 0.03, 1.3, 0.12, 0.03, 0.04, false);
        ib.act(1.9, 1.3, 1.1, 'Спуститься в подвал', 'basement');
        ib.doorSpots['hatch'] = { x: ib.ox + 1.9, z: ib.oz + 0.4, a: Math.PI, y: 0 };
      }
      ib.light(0, H - 0.3, -1, 1.0, 0xffe0b0); ib.light(0, H - 0.3, D / 2 - 1.2, 0.5, 0xffe0b0, 6);
      break;
    }
  }
  const spawnZ = D / 2 - 1.6;
  return ib.finish({ x: 0, z: spawnZ, a: Math.PI }, { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2, h: H });
}

export function interiorForBuilding(kind: string, cls?: string): InteriorKind | null {
  const m: Record<string, InteriorKind> = {
    shop24: 'shop24', supermarket: 'supermarket', cafe: 'cafe', pharmacy: 'pharmacy', gunshop: 'gunshop', clothes: 'clothes', barber: 'barber',
    police: 'police', hospital: 'hospital', cityhall: 'cityhall', bank: 'bank', dealer: 'dealer', service: 'service', mall: 'mall', apartment: 'hall',
    house: 'house_city', vhouse: 'house_village', vshop: 'vshop', vadmin: 'vadmin', checkpoint: 'checkpoint', fire: 'fire', gas: 'gas', depot: 'truckoffice', office: 'office', scootershop: 'scootershop',
  };
  void cls;
  return m[kind] ?? null;
}
