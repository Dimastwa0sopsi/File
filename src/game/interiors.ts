// Интерьеры: отдельные помещения с полом, стенами, потолком, светом, мебелью и коллизиями.
// Все сцены переделаны: у каждой свой план, материалы, мебель и подсветка.
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
export type InteriorKind = 'shop24' | 'supermarket' | 'cafe' | 'pharmacy' | 'gunshop' | 'clothes' | 'barber' | 'police' | 'hospital' | 'cityhall' | 'bank' | 'fishshop' |
  'dealer' | 'service' | 'mall' | 'hall' | 'apt_eco' | 'apt_mid' | 'apt_lux' | 'house_city' | 'house_village' | 'vshop' | 'vpharmacy' | 'vguntruck' | 'vadmin' | 'checkpoint' | 'fire' | 'gas' | 'mallfood' | 'basement' | 'truckoffice' | 'office' | 'scootershop';

const WALLS = {
  white: 'c:#f1efe9', beige: 'c:#e8dcc4', mint: 'c:#d1e7dd', grey: 'c:#d4d4d8', blue: 'c:#c7d2fe', wood: 'c:#b08060', dark: 'c:#3f3f46',
  pink: 'c:#fbcfe8', brick: 'tex:brickwall', paper: 'tex:wallpaper', paperPink: 'c:#f3d7e3', tile: 'tex:walltile', panel: 'tex:woodpanel',
  clinic: 'c:#e6f0f4', olive: 'tex:woodpanel', sand: 'c:#e7dcc7',
};
const GOODS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#14b8a6', '#eab308', '#ec4899', '#0ea5e9'];

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
    // плинтус по периметру + потолочный карниз
    const bb = (x: number, z: number, w2: number, d2: number) => this.f('c:#d6d3d1', x, 0, z, w2, 0.11, d2, false);
    bb(0, -d / 2 + 0.06, w, 0.06); bb(0, d / 2 - 0.06, w, 0.06); bb(-w / 2 + 0.06, 0, 0.06, d); bb(w / 2 - 0.06, 0, 0.06, d);
    bb(0, -d / 2 + 0.08, w, 0.05); bb(0, d / 2 - 0.08, w, 0.05);
  }
  /** витрина-стеллаж: металлический каркас, 4 полки, товары и ценники */
  shelf(x: number, z: number, len: number, ry: number, seed: number) {
    const along = Math.abs(ry) < 0.5;
    const w = along ? len : 0.62, d = along ? 0.62 : len;
    this.f('c:#cbd5e1', x, 0, z, w, 0.12, d, true);
    for (const sx of [-1, 1]) for (const sz of [0]) {
      const px = x + (along ? sx * (len / 2 - 0.04) : 0), pz = z + (along ? 0 : sx * (len / 2 - 0.04));
      this.f('c:#94a3b8', px, 0, pz, along ? 0.07 : 0.58, 1.85, along ? 0.58 : 0.07, false);
    }
    for (let lv = 0; lv < 4; lv++) {
      const y = 0.16 + lv * 0.44;
      this.f('c:#e2e8f0', x, y, z, along ? len : 0.56, 0.05, along ? 0.56 : len, false);
      for (let i = 0; i < Math.floor(len / 0.42); i++) {
        const t = -len / 2 + 0.22 + i * 0.42;
        const c = GOODS[(i * 3 + lv * 5 + seed) % GOODS.length];
        const px = x + (along ? t : 0), pz = z + (along ? 0 : t);
        this.f('c:' + c, px, y + 0.05, pz + (along ? 0.12 : 0), along ? 0.26 : 0.3, 0.26, along ? 0.3 : 0.26, false);
        this.f('c:' + GOODS[(i + lv + 2) % GOODS.length], px + (along ? 0 : -0.13), y + 0.05, pz + (along ? -0.13 : 0), along ? 0.2 : 0.14, 0.2, along ? 0.14 : 0.2, false);
      }
      // ценник на полке
      this.f('c:#fde68a', x, y + 0.05, z + (along ? 0.3 : 0), along ? len - 0.1 : 0.02, 0.04, along ? 0.02 : len - 0.1, false);
    }
    this.plane(`sign:СКИДКИ|#dc2626`, x, 2.05, z, Math.min(len * 0.7, 2.4), 0.3, ry);
  }
  fridgeCase(x: number, z: number, len: number) {
    this.f('c:#334155', x, 0, z, len, 2.15, 0.85, true);
    for (let i = 0; i < len / 0.42; i++) for (let lv = 0; lv < 4; lv++)
      this.f('c:' + ['#2563eb', '#dc2626', '#16a34a', '#f8fafc', '#f59e0b'][(i + lv) % 5], x - len / 2 + 0.21 + i * 0.42, 0.28 + lv * 0.44, z + 0.44, 0.22, 0.3, 0.06, false);
    this.f('glass:0.22', x, 0.1, z + 0.47, len, 1.95, 0.03, false);
    for (const sx of [-1, 1]) this.f('c:#475569', x + sx * (len / 2 - 0.02), 0, z + 0.47, 0.05, 1.95, 0.06, false);
    this.f('glow:#60a5fa', x, 2.02, z + 0.42, len - 0.1, 0.05, 0.05, false);
    this.plane(`sign:ХОЛОД|#0ea5e9`, x, 2.25, z, Math.min(len * 0.6, 2), 0.26, 0);
  }
  counter(x: number, z: number, w: number, label: string, action: string, cashier = true, ry = 0) {
    const along = Math.abs(ry) < 0.5;
    this.f('c:#78350f', x, 0, z, w, 0.95, 0.75, true, ry);
    this.f('c:#e7e5e4', x, 0.95, z, w + 0.14, 0.07, 0.86, false, ry);
    this.f('c:#111827', x + (along ? w / 2 - 0.35 : 0), 1.02, z + (along ? 0 : w / 2 - 0.35), 0.4, 0.32, 0.3, false, ry);
    this.f('glow:#22c55e', x + (along ? w / 2 - 0.35 : 0), 1.34, z + (along ? 0 : w / 2 - 0.35), 0.3, 0.02, 0.22, false, ry); // терминал оплаты
    this.f('c:#a8a29e', x - (along ? w / 2 - 0.5 : 0), 1.02, z - (along ? 0 : w / 2 - 0.5), 0.26, 0.18, 0.2, false, ry); // сканер
    this.f('c:#1f2937', x, 1.55, z - (along ? 0 : 0.3), w * 0.8, 0.06, 0.12, false, ry); // монитор на кронштейне
    this.act(x, z + (along ? 1.1 : 0), 1.5, label, action);
    if (cashier) this.npc(x, z - 0.9, 0, 'cashier');
  }
  table(x: number, z: number, chairs = 4, c = '#92400e') {
    this.f('c:' + c, x, 0.72, z, 1.1, 0.05, 1.1, false); this.f('c:#333', x, 0, z, 0.1, 0.72, 0.1); this.col(x - 0.55, z - 0.55, x + 0.55, z + 0.55, 0, 0.77);
    const ps = [[0, 0.85], [0, -0.85], [0.85, 0], [-0.85, 0]].slice(0, chairs);
    for (const [dx, dz] of ps) { this.f('c:#57534e', x + dx, 0.45, z + dz, 0.45, 0.05, 0.45, false); this.f('c:#57534e', x + dx * 1.25, 0.45, z + dz * 1.25, Math.abs(dx) > 0 ? 0.05 : 0.45, 0.5, Math.abs(dz) > 0 ? 0.05 : 0.45, false); this.col(x + dx - 0.22, z + dz - 0.22, x + dx + 0.22, z + dz + 0.22, 0, 0.5); }
    // салфетки и вазочка
    this.cyl('c:#f1f5f9', x, 0.77, z, 0.07, 0.12); this.cyl('c:#0f766e', x + 0.3, 0.77, z - 0.25, 0.05, 0.18);
  }
  sofa(x: number, z: number, w: number, ry: number, c = '#475569') {
    const along = Math.abs(Math.sin(ry)) < 0.5;
    this.f('c:' + c, x, 0, z, along ? w : 0.9, 0.45, along ? 0.9 : w, true, ry);
    this.f('c:' + c, x - Math.sin(ry) * 0.38, 0.45, z - Math.cos(ry) * 0.38, along ? w : 0.2, 0.45, along ? 0.2 : w, false, ry);
    for (const s of [-1, 1]) this.f('c:' + c, x + (along ? s * (w / 2 - 0.1) : 0), 0.3, z + (along ? 0 : s * (w / 2 - 0.1)), 0.16, 0.35, 0.86, false, ry);
    for (let i = 0; i < Math.max(1, Math.floor(w / 0.9)); i++) this.f('c:#e2e8f0', x + (along ? -w / 2 + 0.5 + i * 0.9 : 0), 0.46, z + (along ? 0 : -w / 2 + 0.5 + i * 0.9), along ? 0.4 : 0.55, 0.12, along ? 0.55 : 0.4, false, ry);
  }
  tv(x: number, z: number, w: number, ry: number) {
    this.f('c:#0a0a0a', x, 1.0, z, Math.abs(Math.sin(ry)) > 0.5 ? 0.06 : w, w * 0.56, Math.abs(Math.sin(ry)) > 0.5 ? w : 0.06, false);
    this.f('glow:#1e3a8a', x + Math.sin(ry) * 0.04, 1.03, z + Math.cos(ry) * 0.04, Math.abs(Math.sin(ry)) > 0.5 ? 0.01 : w - 0.1, w * 0.5, Math.abs(Math.sin(ry)) > 0.5 ? w - 0.1 : 0.01, false);
    this.f('c:#292524', x, 0, z, 0.5, 0.6, 0.35, true);
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
  plant(x: number, z: number) { this.cyl('c:#a16207', x, 0, z, 0.22, 0.45); this.b.add('c:#16a34a', T.ico, M(this.ox + x, 0.95, this.oz + z, 0, 0.45, 0.6, 0.45)); this.b.add('c:#15803d', T.ico, M(this.ox + x + 0.18, 1.2, this.oz + z - 0.12, 0.7, 0.3, 0.4, 0.3)); this.col(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 0, 1); }
  rug(x: number, z: number, w: number, d: number, c: string) { this.f('c:' + c, x, 0.004, z, w, 0.012, d, false); }
  painting(x: number, y: number, z: number, ry: number, c: string) {
    this.plane('c:' + c, x, y, z, 1.0, 0.7, ry);
    this.plane('c:#1c1917', x, y, z - Math.cos(ry) * 0.01, 1.12, 0.82, ry);
    this.plane('c:' + c, x, y, z - Math.cos(ry) * 0.015, 1.0, 0.7, ry);
  }
  /** окно с рамой, подоконником и шторами */
  window(x: number, y: number, z: number, w: number, h: number, ry: number) {
    this.plane('glass:0.35', x, y, z, w, h, ry);
    const along = Math.abs(Math.sin(ry)) > 0.5; // окно на боковой стене
    this.f('c:#e7e5e4', x + (along ? 0 : 0), y + h / 2, z - (along ? 0 : 0), along ? 0.14 : w + 0.14, 0.1, along ? w + 0.14 : 0.14, false, ry);
    this.f('c:#e7e5e4', x, y - h / 2, z, along ? 0.16 : w + 0.16, 0.1, along ? w + 0.16 : 0.16, false, ry);
    this.f('c:#d6d3d1', x, y - h / 2 - 0.05, z, along ? 0.3 : w + 0.3, 0.08, along ? w + 0.3 : 0.3, false, ry);
    this.f('c:#f1f5f9', x - (along ? 0 : w / 2 + 0.25), y, z - (along ? w / 2 + 0.25 : 0), along ? 0.16 : 0.4, h + 0.2, along ? 0.4 : 0.16, false, ry);
    this.f('c:#f1f5f9', x + (along ? 0 : w / 2 + 0.25), y, z + (along ? w / 2 + 0.25 : 0), along ? 0.16 : 0.4, h + 0.2, along ? 0.4 : 0.16, false, ry);
  }
  /** медицинская кушетка: лежанка, подушка, каркас, стойка и место пациента */
  examBed(x: number, z: number, ry = 0) {
    this.f('c:#cbd5e1', x, 0, z, 1.15, 0.5, 2.1, true, ry);
    this.f('c:#bfdbfe', x, 0.5, z, 1.05, 0.14, 1.95, false, ry);
    this.f('c:#f8fafc', x, 0.64, z - 0.7, 0.85, 0.12, 0.5, false, ry);
    this.f('chrome', x + 0.62, 0, z, 0.06, 1.0, 0.06, false);
    this.f('c:#e2e8f0', x + 0.62, 1.0, z, 0.3, 0.06, 0.5, false, ry);
    this.act(x, z, 1.9, 'Кушетка пациента', 'patient');
  }
  /** медицинский шкаф с препаратами (кликабельный) */
  medCabinet(x: number, z: number, idx: number, name: string, ry = 0) {
    const along = Math.abs(ry) < 0.5;
    this.f('c:#e2e8f0', x, 0, z, along ? 1.4 : 0.5, 2.0, along ? 0.5 : 1.4, true, ry);
    for (let lv = 0; lv < 4; lv++) for (let i = 0; i < 4; i++) {
      const t = -0.5 + i * 0.34;
      this.f('c:' + ['#f8fafc', '#bbf7d0', '#bfdbfe', '#fecaca'][(i + lv) % 4], x + (along ? t : 0), 0.3 + lv * 0.42, z + (along ? 0 : t), along ? 0.26 : 0.24, 0.22, along ? 0.24 : 0.26, false, ry);
    }
    this.f('glass:0.25', x, 0.1, z + (along ? 0.28 : 0), along ? 1.36 : 0.04, 1.85, along ? 0.04 : 1.36, false, ry);
    this.plane(`sign:${name}|#0f766e`, x, 2.1, z, along ? 1.3 : 1.3, 0.26, ry);
    this.act(x + (along ? 0 : -0.9), z + (along ? -0.9 : 0), 1.3, `Шкаф: ${name}`, `med:${idx}`);
  }
  /** монитор диагностики */
  monitor(x: number, z: number, ry: number, action: string, label: string) {
    this.f('c:#1f2937', x, 0.75, z, 0.7, 0.5, 0.12, false, ry);
    this.f('glow:#22d3ee', x, 0.78, z + Math.cos(ry) * 0.07, 0.6, 0.4, 0.01, false, ry);
    this.f('c:#374151', x, 0.35, z, 0.12, 0.4, 0.12, false);
    this.f('c:#374151', x, 0, z, 0.5, 0.06, 0.5, true);
    this.act(x, z + 0.9, 1.3, label, action);
  }
  /** ширма-занавес */
  curtain(x0: number, z0: number, x1: number, z1: number, h: number) {
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
    this.f('c:#dbeafe', (x0 + x1) / 2, 0.05, (z0 + z1) / 2, 0.08, h, len, false, a);
    this.f('chrome', x0, 0, z0, 0.06, h + 0.2, 0.06, false);
    this.f('chrome', x1, 0, z1, 0.06, h + 0.2, 0.06, false);
  }
  /** прилавок-витрина с подсветкой (аптека, пекарня, ювелирка) */
  display(x: number, z: number, w: number, ry: number) {
    const along = Math.abs(ry) < 0.5;
    this.f('c:#f8fafc', x, 0, z, along ? w : 0.7, 0.95, along ? 0.7 : w, true, ry);
    this.f('glass:0.25', x, 0.95, z, along ? w : 0.72, 0.5, along ? 0.72 : w, false, ry);
    for (let i = 0; i < Math.floor(w / 0.4); i++) {
      const t = -w / 2 + 0.25 + i * 0.4;
      this.f('c:' + GOODS[(i + 3) % GOODS.length], x + (along ? t : 0), 1.0, z + (along ? 0 : t), along ? 0.22 : 0.3, 0.18, along ? 0.3 : 0.22, false, ry);
    }
    this.f('glow:#fef9c3', x, 1.45, z, along ? w - 0.1 : 0.06, 0.04, along ? 0.06 : w - 0.1, false, ry);
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
    const alongX = Math.abs(Math.sin(ry)) < 0.5;
    this.f('c:#f5f5f4', x, 0, z, alongX ? len : 0.65, 0.9, alongX ? 0.65 : len);
    this.f('c:#44403c', x, 0.9, z, alongX ? len + 0.02 : 0.67, 0.04, alongX ? 0.67 : len + 0.02, false);
    this.f('c:#111', x + (alongX ? len / 4 : 0), 0.94, z + (alongX ? 0 : len / 4), 0.55, 0.02, 0.5, false);
    this.f('chrome', x - (alongX ? len / 4 : 0), 0.93, z - (alongX ? 0 : len / 4), 0.5, 0.03, 0.4, false);
    // верхние шкафы и вытяжка
    this.f('c:#e7e5e4', x + (alongX ? len / 3 : 0), 1.6, z + (alongX ? 0 : len / 3), alongX ? len * 0.4 : 0.34, 0.6, alongX ? 0.34 : len * 0.4, false, ry);
    this.f('c:#78716c', x - (alongX ? len / 3 : 0), 1.55, z - (alongX ? 0 : len / 3), alongX ? 0.6 : 0.34, 0.25, alongX ? 0.34 : 0.6, false, ry);
    this.f('c:#f59e0b', x, 1.1, z - (alongX ? 0 : 0.3), alongX ? 0.5 : 0.04, 0.3, alongX ? 0.04 : 0.5, false);
  }
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

export function buildInterior(kind: InteriorKind, opts: { seed?: number; owned?: boolean[]; units?: number; name?: string } = {}): Interior {
  const ib = new IB();
  const seed = opts.seed ?? 1;
  let W = 12, D = 10, H = 3.4;
  const S = (w: number, d: number, h = 3.4) => { W = w; D = d; H = h; };
  switch (kind) {
    // ---------------- ПРОДУКТОВЫЙ МАГАЗИН ----------------
    case 'shop24': case 'vshop': case 'gas': {
      const village = kind === 'vshop';
      S(14, 11, 3.3); ib.room(W, D, H, 'tex:floortile', village ? WALLS.wood : WALLS.white);
      // вход: корзины, коврик, объявление
      ib.f('c:#334155', -5.6, 0, D / 2 - 1.6, 0.9, 0.5, 0.7);
      ib.f('c:#dc2626', -5.6, 0.5, D / 2 - 1.6, 0.7, 0.1, 0.5, false);
      ib.f('c:#1f2937', 5.9, 0, D / 2 - 1.5, 0.7, 0.5, 0.7);
      ib.rug(0, D / 2 - 1.0, 3, 1.6, '#94a3b8');
      // три ряда стеллажей в центре и пристенные полки
      for (let i = 0; i < 3; i++) ib.shelf(-4 + i * 3.7, -1.6, 4.6, 1, i + seed);
      ib.f('c:#e2e8f0', 0, 0, -D / 2 + 0.35, W - 1.2, 2.2, 0.55);
      for (let i = 0; i < 26; i++) for (let lv = 0; lv < 4; lv++)
        ib.f('c:' + GOODS[(i + lv * 3) % GOODS.length], -6 + i * 0.46, 0.25 + lv * 0.46, -D / 2 + 0.66, 0.28, 0.26, 0.1, false);
      ib.fridgeCase(-4.4, -D / 2 + 1.0, 3.2);
      ib.fridgeCase(-0.6, -D / 2 + 1.0, 3.2);
      // касса с лентой и корзиной для мелочи
      ib.counter(5.2, 2.2, 3.0, village ? 'Сельмаг: E — купить · R — смена · L — ограбление' : 'Касса: E — купить · R — смена · L — ограбление', 'counter');
      ib.f('c:#111827', 2.7, 0, 2.2, 2.6, 0.9, 0.72, true);
      ib.f('c:#374151', 2.7, 0.9, 2.2, 2.4, 0.05, 0.55, false);
      ib.act(5.2, 4.4, 1.6, 'Смена продавца · R', 'counter');
      if (kind === 'gas') {
        // АЗС: кофемашина и полка автотоваров
        ib.f('c:#1f2937', -6.1, 0, 3.4, 0.9, 1.6, 0.7, true);
        ib.f('glow:#fde68a', -6.05, 1.1, 3.4, 0.7, 0.35, 0.02, false);
        ib.act(-5.0, 3.4, 1.2, 'Кофе на АЗС', 'coffee');
        ib.shelf(5.6, -1.0, 3.4, Math.PI / 2, 9);
      } else {
        ib.plant(-6.2, 4.4); ib.plant(6.2, -4.2);
      }
      ib.plane(`sign:${village ? 'СЕЛЬМАГ' : kind === 'gas' ? 'АЗС · МАГАЗИН' : '24 / 7'}|#dc2626`, 0, 2.85, -D / 2 + 0.16, 4.4, 0.6, 0);
      ib.window(-W / 2 + 0.15, 1.9, 1.0, 3.2, 1.5, Math.PI / 2);
      ib.window(W / 2 - 0.15, 1.9, -2.6, 2.6, 1.5, -Math.PI / 2);
      ib.light(-3, H - 0.25, -1, 1.2, 0xffffff, 16); ib.light(3, H - 0.25, 1.5, 1.2, 0xffffff, 16); ib.light(0, H - 0.25, 4, 0.9, 0xfff3d6, 12);
      break;
    }
    // ---------------- СУПЕРМАРКЕТ ----------------
    case 'supermarket': {
      S(26, 19, 4.2); ib.room(W, D, H, 'tex:floortile', WALLS.tile);
      // центральный проход, 6 стеллажей, витрины у стен
      for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) ib.shelf(-9 + i * 4.4, -4.5 + r * 5.5, 5.2, 1, i + r * 2 + seed);
      ib.fridgeCase(-7.5, -D / 2 + 1.0, 6.5);
      ib.fridgeCase(0.5, -D / 2 + 1.0, 6.5);
      ib.fridgeCase(8.5, -D / 2 + 1.0, 5.5);
      // овощной отдел: ящики с зеленью
      for (let i = 0; i < 4; i++) {
        const x = -10.5 + i * 1.5;
        ib.f('c:#a16207', x, 0, 1.2, 1.3, 0.55, 1.1, true);
        ib.f('c:' + ['#22c55e', '#f59e0b', '#ef4444', '#84cc16'][i], x, 0.4, 1.2, 1.2, 0.3, 1.0, false);
        ib.act(x, 2.2, 1.1, 'Овощи: взвесить и купить', 'counter');
      }
      // пекарня: витрина с подсветкой
      ib.display(9.4, 2.6, 4.4, 0);
      ib.f('c:#78350f', 9.4, 0, 4.4, 4.6, 1.0, 0.7, true);
      ib.plane('sign:ПЕКАРНЯ|#b45309', 9.4, 2.6, -D / 2 + 0.16, 3, 0.5, 0);
      // две кассы
      ib.counter(-6.5, 6.6, 3.0, 'Касса №1: E — купить · R — смена · L — ограбление', 'counter');
      ib.counter(1.5, 6.6, 3.0, 'Касса №2: E — купить · R — смена · L — ограбление', 'counter');
      ib.f('c:#111827', -6.5, 0, 5.0, 2.2, 0.9, 0.7, true);
      ib.f('c:#111827', 1.5, 0, 5.0, 2.2, 0.9, 0.7, true);
      // тележки и корзины у входа
      for (let i = 0; i < 5; i++) { ib.f('chrome', 8 + i * 0.5, 0, D / 2 - 1.4, 0.45, 0.9, 0.6, false); ib.f('c:#dc2626', 8 + i * 0.5, 0.9, D / 2 - 1.4, 0.4, 0.3, 0.55, false); }
      ib.f('c:#1d4ed8', -11.4, 0, D / 2 - 1.4, 1.2, 0.7, 0.9, true);
      ib.plane('sign:СУПЕРМАРКЕТ «ЛУКОШКО»|#f59e0b', 0, 3.7, -D / 2 + 0.18, 8, 0.9, 0);
      ib.plane('sign:АКЦИЯ · −30%|#dc2626', 0, 3.0, D / 2 - 0.16, 4, 0.6, Math.PI);
      ib.rug(-2.5, 6.6, 5, 2, '#cbd5e1');
      ib.light(-8, H - 0.3, -3, 1.4, 0xffffff, 22); ib.light(2, H - 0.3, -3, 1.4, 0xffffff, 22);
      ib.light(-4, H - 0.3, 5, 1.2, 0xffffff, 18); ib.light(8, H - 0.3, 4, 1.2, 0xfff3d6, 18);
      break;
    }
    // ---------------- КАФЕ ----------------
    case 'cafe': case 'mallfood': {
      S(15, 12, 3.4); ib.room(W, D, H, 'tex:parquet', WALLS.paper, kind === 'mallfood' ? 'Выйти в торговый центр' : 'Выйти на улицу');
      // барная стойка с кофемашиной, витриной десертов и бутылками
      ib.counter(-3.6, -3.6, 5.2, 'Заказ: E — купить · R — смена · L — ограбление', 'counter');
      ib.f('c:#1f2937', -5.6, 1.05, -3.6, 0.6, 0.5, 0.4, false);
      ib.f('glow:#fbbf24', -5.6, 1.35, -3.75, 0.4, 0.2, 0.02, false);
      ib.display(-0.9, -3.6, 2.2, 0);
      ib.f('c:#78350f', -3.6, 1.3, -D / 2 + 0.45, 4.6, 0.08, 0.35, false); // полка бутылок
      for (let i = 0; i < 10; i++) ib.cyl('c:' + ['#166534', '#7c2d12', '#f59e0b'][i % 3], -5.6 + i * 0.44, 1.38, -D / 2 + 0.45, 0.07, 0.28);
      // столики у окон
      for (const [x, z] of [[3.4, -2.6], [6.2, -2.6], [3.4, 0.8], [6.2, 0.8], [0.6, 2.6]]) ib.table(x, z, 4);
      for (let i = 0; i < 3; i++) ib.window(-4 + i * 4.5, 1.8, D / 2 - 0.15, 2.8, 1.5, Math.PI);
      ib.sofa(-5.6, 1.8, 2.4, Math.PI / 2, '#7c2d12');
      ib.plant(-6.3, 4.4); ib.plant(6.6, 4.4); ib.plant(0.0, -1.2);
      ib.plane('sign:МЕНЮ · КОФЕ · ВЫПЕЧКА|#b45309', 0, 2.75, -D / 2 + 0.17, 4.6, 0.55, 0);
      ib.painting(6.9, 2.0, -D / 2 + 0.14, 0, '#b45309');
      ib.rug(-3.6, 0.4, 4, 2.6, '#7c2d12');
      ib.light(-3.6, H - 0.3, -2.6, 1.2, 0xffd7a0, 14); ib.light(4.8, H - 0.3, 0.6, 1.1, 0xffd7a0, 14); ib.light(-5.4, H - 0.3, 3, 0.8, 0xffd7a0, 10);
      break;
    }
    // ---------------- АПТЕКА (город) ----------------
    case 'pharmacy': {
      S(12, 10, 3.2); ib.room(W, D, H, 'tex:floortile', WALLS.tile);
      // шкафы с лекарствами по задней стене
      for (let c = 0; c < 3; c++) {
        const x = -3.4 + c * 3.4;
        ib.f('c:#f8fafc', x, 0, -D / 2 + 0.4, 3.1, 2.2, 0.6, true);
        for (let i = 0; i < 7; i++) for (let lv = 0; lv < 5; lv++)
          ib.f('c:' + ['#ffffff', '#10b981', '#60a5fa', '#fca5a5', '#fde68a'][(i + lv) % 5], x - 1.4 + i * 0.42, 0.22 + lv * 0.4, -D / 2 + 0.7, 0.28, 0.24, 0.1, false);
      }
      ib.f('glass:0.2', 0, 0.1, -D / 2 + 0.75, W - 1.2, 2.0, 0.03, false);
      // витрина и касса
      ib.display(-2.6, 1.0, 3.6, 0);
      ib.counter(3.4, 1.0, 3.0, 'Аптека: E — купить · R — смена · L — ограбление', 'counter');
      ib.f('c:#ffffff', 3.4, 0, -1.6, 2.4, 1.9, 0.6, true); ib.f('glass:0.2', 3.4, 1.0, -1.25, 2.3, 0.8, 0.03, false);
      ib.act(-2.6, 2.0, 1.2, 'Витрина: витамины и уход', 'counter');
      // аптечные весы, касса-аппарат, стул фармацевта
      ib.cyl('c:#e2e8f0', 1.6, 0.95, 1.0, 0.22, 0.12); ib.cyl('c:#0f766e', 1.6, 1.07, 1.0, 0.16, 0.05);
      ib.f('c:#0f766e', 3.4, 0, 2.2, 0.5, 0.45, 0.5, false);
      // лавка ожидания, кулер, растения
      ib.sofa(-4.4, 3.4, 2.6, Math.PI, '#0f766e'); ib.f('c:#e2e8f0', 3.2, 0, 3.6, 0.5, 1.1, 0.5, true);
      ib.f('c:#38bdf8', 3.2, 1.1, 3.6, 0.4, 0.5, 0.4, false);
      ib.plant(-5.3, -3.6); ib.plant(5.3, 3.6);
      ib.plane('sign:✚ АПТЕКА · 24 ЧАСА|#10b981', 0, 2.7, -D / 2 + 0.18, 4.2, 0.6, 0);
      ib.window(-W / 2 + 0.15, 1.8, 0, 3.4, 1.5, Math.PI / 2);
      ib.light(-2, H - 0.3, 0, 1.3, 0xffffff, 16); ib.light(3, H - 0.3, 2, 1.1, 0xffffff, 14);
      break;
    }
    // ---------------- АПТЕКА В ДЕРЕВНЕ ----------------
    case 'vpharmacy': {
      S(11, 9, 3.1); ib.room(W, D, H, 'tex:wood', WALLS.panel);
      ib.rug(0, 1.0, 4, 2.4, '#a16207');
      // деревянные полки с банками и травами
      for (let c = 0; c < 3; c++) {
        const x = -3.2 + c * 3.2;
        ib.f('c:#78350f', x, 0, -D / 2 + 0.45, 2.9, 2.1, 0.55, true);
        for (let lv = 0; lv < 4; lv++) {
          ib.f('c:#92400e', x, 0.5 + lv * 0.42, -D / 2 + 0.45, 2.8, 0.05, 0.55, false);
          for (let i = 0; i < 6; i++) ib.cyl('c:' + ['#65a30d', '#0d9488', '#e2e8f0', '#f59e0b'][(i + lv) % 4], x - 1.2 + i * 0.48, 0.55 + lv * 0.42, -D / 2 + 0.45, 0.1, 0.24);
        }
      }
      // прилавок с весами и ящиками
      ib.counter(2.4, 0.4, 3.4, 'Сельская аптека: E — купить · R — смена · L — ограбление', 'counter');
      ib.f('c:#78350f', 2.4, 0, -1.6, 3.2, 0.8, 0.8, true);
      ib.cyl('c:#e7e5e4', 1.4, 0.82, -1.6, 0.2, 0.16);
      for (let i = 0; i < 4; i++) ib.f('c:#a16207', 4.6 + (i % 2) * 0.5, 0, -2.4 + Math.floor(i / 2) * 0.6, 0.45, 0.45, 0.45, true);
      // скамья и печка
      ib.f('c:#78350f', -3.6, 0, 3.2, 2.6, 0.45, 0.6, true); ib.f('c:#57534e', -4.8, 0, 3.2, 0.1, 0.5, 0.6, false);
      ib.f('c:#e7e5e4', 4.4, 0, 2.8, 1.3, 1.7, 1.3, true); ib.cyl('c:#44403c', 4.4, 1.7, 2.8, 0.14, 1.0);
      ib.act(2.4, 1.5, 1.6, 'Смена фармацевта · R', 'counter');
      ib.plane('sign:✚ СЕЛЬСКАЯ АПТЕКА|#0f766e', 0, 2.55, -D / 2 + 0.18, 3.8, 0.5, 0);
      ib.painting(-4.2, 2.0, -D / 2 + 0.16, 0, '#166534');
      ib.window(W / 2 - 0.15, 1.7, 1.6, 2.4, 1.3, -Math.PI / 2);
      ib.light(-2, H - 0.3, 0, 1.0, 0xffe0b0, 12); ib.light(3, H - 0.3, 2, 0.9, 0xffe0b0, 12);
      break;
    }
    // ---------------- РЫБОЛОВНЫЙ МАГАЗИН ----------------
    case 'fishshop': {
      S(13, 10, 3.3); ib.room(W, D, H, 'tex:wood', WALLS.panel);
      // стена удочек и снастей
      for (let i = 0; i < 11; i++) {
        ib.f('c:#78350f', -5 + i, 2.2, -D / 2 + 0.2, 0.06, 1.6, 0.06, false);
        ib.cyl('c:#1f2937', -5 + i, 1.3 + (i % 3) * 0.35, -D / 2 + 0.24, 0.022, 1.0);
      }
      // аквариумы с рыбой
      for (let i = 0; i < 3; i++) {
        ib.f('c:#0e7490', 2.0 + i * 1.6, 0, -D / 2 + 0.8, 1.4, 0.9, 0.7, true);
        ib.f('c:#38bdf8', 2.0 + i * 1.6, 0.9, -D / 2 + 0.8, 1.3, 0.5, 0.6, false);
        ib.f('glow:#7dd3fc', 2.0 + i * 1.6, 1.45, -D / 2 + 0.8, 1.2, 0.06, 0.5, false);
      }
      // прилавок со льдом и весами
      ib.f('c:#0e7490', -1.4, 0, 0.4, 5.0, 0.95, 0.9, true);
      ib.f('c:#e0f2fe', -1.4, 0.95, 0.4, 4.8, 0.12, 0.8, false);
      ib.act(-1.4, 1.6, 1.7, 'Прилавок: E — купить снасти · R — смена', 'counter'); ib.npc(-1.4, -0.6, 0, 'cashier');
      ib.cyl('c:#e2e8f0', 1.0, 1.07, 0.4, 0.18, 0.16);
      // сети, ящики, лодка-декор
      ib.f('c:#78716c', 5.2, 0, 1.2, 0.9, 0.6, 0.9, true); ib.f('c:#57534e', 5.2, 0.6, 1.2, 0.94, 0.08, 0.94, false);
      ib.f('c:#166534', -5.6, 0, 2.0, 2.8, 0.9, 1.4, true);
      ib.plane('sign:РЫБАЛКА «ПОПЛАВОК»|#0e7490', 0, 2.75, -D / 2 + 0.18, 4.2, 0.55, 0);
      ib.plant(-5.8, 4.2);
      ib.light(0, H - 0.3, 0, 1.1, 0xd8f3ff, 16); ib.light(4, H - 0.3, -2, 0.9, 0xd8f3ff, 12);
      break;
    }
    // ---------------- ОРУЖЕЙНЫЙ МАГАЗИН ----------------
    case 'gunshop': {
      S(11, 9, 3.2); ib.room(W, D, H, 'tex:parquet', WALLS.dark);
      // стена оружия: подсвеченные витрины
      for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
        const x = -3.8 + i * 1.7, y = 1.3 + r * 0.7;
        ib.f('c:#111111', x, y, -D / 2 + 0.14, 1.1, 0.12, 0.1, false);
        ib.f('c:#78350f', x - 0.3, y - 0.02, -D / 2 + 0.15, 0.34, 0.1, 0.11, false);
        ib.f('glow:#fef3c7', x, y + 0.16, -D / 2 + 0.16, 1.0, 0.03, 0.03, false);
      }
      // патронные ящики и сейф
      for (let i = 0; i < 5; i++) ib.f('c:#365314', -4.2 + i * 0.9, 0, -2.2, 0.8, 0.55, 0.6, true);
      ib.f('c:#1c1917', 4.2, 0, -2.2, 1.2, 1.6, 0.8, true); ib.cyl('c:#a8a29e', 4.2, 0.9, -1.75, 0.16, 0.06);
      // прилавок с витриной и мишень
      ib.f('c:#1f2937', 0, 0, 0.4, 5.4, 1.0, 0.8, true);
      ib.f('glass:0.28', 0, 1.0, 0.4, 5.4, 0.4, 0.8, false);
      ib.f('c:#f8fafc', 4.85, 1.2, 2.4, 0.05, 1.2, 0.9, false); ib.cyl('c:#dc2626', 4.8, 1.75, 2.4, 0.25, 0.02);
      ib.act(0, 1.5, 1.7, 'Оружейная: E — купить · R — смена · L — ограбление', 'counter'); ib.npc(0, -0.7, 0, 'cashier');
      ib.plane('sign:ОРУЖЕЙНЫЙ «АРСЕНАЛ»|#b91c1c', 0, 2.7, -D / 2 + 0.18, 4.6, 0.55, 0);
      ib.light(0, H - 0.3, 0, 1.1, 0xffe4c4, 14); ib.light(4, H - 0.3, 2, 0.8, 0xffe4c4, 10);
      break;
    }
    // ---------------- ОРУЖЕЙНЫЙ ГРУЗОВИК (деревня) ----------------
    case 'vguntruck': {
      S(3.6, 9.6, 2.5); ib.room(W, D, H, 'tex:wood', WALLS.olive, 'Выйти из грузовика');
      // узкий фургон: ружейные стойки по стенам, патронные ящики, откидной прилавок
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const z = -3.4 + i * 1.5;
        ib.f('c:#111111', side * (W / 2 - 0.16), 1.15, z, 0.1, 0.12, 1.1, false);
        ib.f('c:#78350f', side * (W / 2 - 0.17), 1.13, z - 0.3, 0.11, 0.1, 0.34, false);
        ib.f('glow:#fef3c7', side * (W / 2 - 0.14), 1.5, z, 0.02, 0.03, 1.0, false);
      }
      for (let i = 0; i < 4; i++) ib.f('c:#365314', -1.0 + (i % 2) * 1.5, 0, -2.8 + Math.floor(i / 2) * 0.8, 0.6, 0.5, 0.5, true);
      ib.f('c:#1f2937', 0, 0, 0.6, 2.2, 0.95, 0.7, true);
      ib.f('c:#e7e5e4', 0, 0.95, 0.6, 2.3, 0.06, 0.8, false);
      ib.f('c:#111827', -0.9, 1.01, 0.6, 0.3, 0.26, 0.24, false);
      ib.act(0, 1.7, 1.5, 'Оружейный грузовик: E — купить · R — смена', 'counter'); ib.npc(0.7, -0.4, Math.PI, 'cashier');
      ib.f('c:#4b5320', 0, 0, D / 2 - 0.5, 1.4, 2.0, 0.12, false);
      ib.f('chrome', 0.45, 1.0, D / 2 - 0.44, 0.12, 0.04, 0.06, false);
      ib.f('c:#1c1917', 0, 0, -D / 2 + 0.3, W - 0.4, 1.2, 0.5, true); // ящик у кабины
      ib.plane('sign:ОРУЖИЕ · ПАТРОНЫ|#3f6212', 0, 2.15, -D / 2 + 0.18, 2.8, 0.4, 0);
      ib.f('glow:#fef9c3', 0, H - 0.12, 0, W - 0.5, 0.03, D - 1.4, false);
      ib.light(0, H - 0.2, 1.5, 0.8, 0xfff1d6, 7); ib.light(0, H - 0.2, -2.5, 0.7, 0xfff1d6, 7);
      break;
    }
    // ---------------- МАГАЗИН ОДЕЖДЫ ----------------
    case 'clothes': {
      S(15, 11, 3.5); ib.room(W, D, H, 'tex:parquet', WALLS.paper);
      // три рейла с одеждой
      for (let r = 0; r < 3; r++) {
        const x = -4.8 + r * 3.6;
        ib.f('chrome', x, 1.55, -2.0, 3.0, 0.05, 0.05, false);
        ib.f('chrome', x - 1.45, 0, -2.0, 0.06, 1.55, 0.06); ib.f('chrome', x + 1.45, 0, -2.0, 0.06, 1.55, 0.06);
        for (let i = 0; i < 10; i++) ib.f('c:' + GOODS[(i + r) % GOODS.length], x - 1.25 + i * 0.28, 0.72, -2.0, 0.06, 0.82, 0.5, false);
        ib.col(x - 1.5, -2.3, x + 1.5, -1.7, 0, 1.6);
      }
      // примерочные с шторами
      for (let i = 0; i < 2; i++) {
        const x = 4.4 + i * 1.6;
        ib.f('c:#7c3aed', x, 0, -2.4, 0.08, 2.3, 1.6, false);
        ib.f('c:#7c3aed', x, 0, -1.55, 1.6, 2.3, 0.08, false);
        ib.curtain(x - 0.7, -1.5, x - 0.7, -3.2, 2.1);
        ib.f('c:#e2e8f0', x, 0, -1.2, 0.8, 0.02, 0.8, false);
      }
      ib.act(4.4, -0.9, 1.4, 'Примерочная: выбрать одежду', 'clothes');
      ib.act(6.0, -0.9, 1.4, 'Примерочная №2', 'clothes');
      // зеркала, манекены, касса
      ib.plane('glass:0.4', W / 2 - 0.14, 1.5, 2.4, 2.0, 2.0, -Math.PI / 2);
      ib.f('chrome', W / 2 - 0.16, 0.5, 2.4, 0.04, 2.0, 2.0, false);
      for (const [x, z] of [[-6.0, 3.2], [-4.4, 3.2]]) { ib.cyl('c:#a8a29e', x, 0, z, 0.25, 0.6); ib.f('c:#1d4ed8', x, 0.6, z, 0.5, 0.6, 0.35, false); ib.cyl('c:#d6d3d1', x, 0.4, z, 0.22, 1.2); }
      ib.f('c:#78350f', -4.2, 0, 4.0, 2.8, 0.95, 0.7, true);
      ib.act(-4.2, 5.1, 1.5, 'Касса — примерка и покупка одежды', 'clothes');
      ib.npc(-4.2, 3.2, 0, 'clerk');
      ib.shelf(-W / 2 + 0.75, 1.2, 3.0, Math.PI / 2, 4); // полка обуви
      ib.plane('sign:МОДА · СКИДКИ|#8b5cf6', 0, 2.9, -D / 2 + 0.18, 4, 0.55, 0);
      ib.plant(-6.5, -4.2); ib.plant(6.5, 4.4);
      ib.light(-3, H - 0.3, -1, 1.2, 0xffffff, 16); ib.light(3, H - 0.3, 2, 1.2, 0xffffff, 16);
      break;
    }
    // ---------------- ПАРИКМАХЕРСКАЯ ----------------
    case 'barber': {
      S(11, 9, 3.3); ib.room(W, D, H, 'tex:floortile', WALLS.paperPink);
      // три рабочих места: кресло, зеркало, столик с инструментами
      for (let i = 0; i < 3; i++) {
        const x = -3.4 + i * 3.4;
        ib.f('c:#111827', x, 0, -2.4, 0.72, 0.55, 0.72);
        ib.f('c:#111827', x, 0.55, -2.8, 0.72, 0.7, 0.12, false);
        ib.f('c:#374151', x, 0.05, -1.9, 0.5, 0.12, 0.5, false);
        ib.plane('glass:0.3', x, 1.35, -D / 2 + 0.14, 1.1, 1.5, 0);
        ib.f('chrome', x, 0.55, -D / 2 + 0.16, 1.24, 1.5, 0.05, false);
        ib.f('glow:#fef3c7', x, 1.95, -D / 2 + 0.2, 1.3, 0.06, 0.18, false);
        ib.f('c:#ffffff', x + 0.75, 0.8, -2.7, 0.5, 0.12, 0.4, false); // столик
        ib.cyl('c:#a8a29e', x + 0.75, 0, -2.7, 0.05, 0.8);
      }
      ib.act(0, -1.0, 1.8, 'Сесть в кресло: стрижка и окраска', 'barber');
      ib.npc(1.6, -1.6, Math.PI, 'barber');
      // зона ожидания: диван, журнальный столик, полка средств
      ib.sofa(-3.9, 2.6, 2.6, Math.PI, '#be185d');
      ib.f('c:#78350f', -1.2, 0, 3.2, 1.4, 0.45, 0.7, true);
      ib.f('c:#f8fafc', -1.2, 0.45, 3.2, 1.0, 0.06, 0.5, false);
      ib.shelf(4.6, 1.6, 2.6, Math.PI / 2, 6);
      ib.cyl('c:#f8fafc', 4.2, 0, -0.6, 0.22, 0.5); // мойка
      ib.plant(-4.9, 4.2); ib.plant(4.9, 4.2);
      ib.plane('sign:БАРБЕРШОП · СТРИЖКИ|#ec4899', 0, 2.75, -D / 2 + 0.18, 4.2, 0.55, 0);
      ib.rug(0, 0.4, 4.4, 3, '#831843');
      ib.light(0, H - 0.3, 0, 1.2, 0xffffff, 16); ib.light(-4, H - 0.3, 2.6, 0.8, 0xfff0d0, 10);
      break;
    }
    // ---------------- ПОЛИЦИЯ ----------------
    case 'police': {
      S(18, 13, 3.6); ib.room(W, D, H, 'tex:floortile', WALLS.grey);
      // дежурная часть с бронестеклом
      ib.f('c:#1e40af', 0, 0, -2.6, 6.0, 1.1, 0.9, true);
      ib.f('c:#e2e8f0', 0, 1.1, -2.6, 6.1, 0.08, 1.0, false);
      ib.f('glass:0.3', 0, 1.18, -3.05, 6.0, 0.9, 0.05, false);
      ib.act(0, -1.3, 1.7, 'Дежурная часть: розыск и страховка', 'police'); ib.npc(0, -3.4, 0, 'police');
      ib.f('c:#111827', -2.2, 1.18, -2.6, 0.4, 0.3, 0.3, false);
      // камеры за решёткой
      for (let i = 0; i < 2; i++) {
        const x = -6.4 + i * 3.1;
        ib.wall(x - 1.4, -D / 2, x - 1.4, -D / 2 + 3.0, H, WALLS.grey);
        for (let k = 0; k < 9; k++) ib.f('c:#52525b', x - 1.2 + k * 0.3, 0, -D / 2 + 3.0, 0.05, 2.5, 0.05);
        ib.f('c:#71717a', x - 1.2, 0, -D / 2 + 3.0, 2.6, 0.08, 0.08, false);
        ib.col(x - 1.3, -D / 2 + 2.9, x + 1.2, -D / 2 + 3.1, 0, 2.5);
        ib.f('c:#a1a1aa', x - 0.3, 0, -D / 2 + 1.3, 0.9, 0.45, 1.9, true); // шконка
      }
      // пост, доска розыска, шкафчики, скамьи
      ib.f('c:#1e293b', W / 2 - 0.4, 0, -5.4, 0.5, 1.5, 3.0, true); ib.npc(W / 2 - 1.4, -5.4, -Math.PI / 2, 'police');
      for (let i = 0; i < 4; i++) ib.f('c:#334155', 6.6, 0, -1.4 + i * 0.7, 1.4, 2.1, 0.6, true);
      ib.plane('sign:РОЗЫСК|#b91c1c', 3.0, 2.2, -D / 2 + 0.16, 3.4, 1.2, 0);
      ib.f('c:#78350f', 2.4, 0, 2.4, 3.2, 0.45, 0.7, true); ib.f('c:#78350f', 2.4, 0.45, 2.4, 3.2, 0.5, 0.1, true); // лавка
      ib.sofa(-4.6, 3.6, 3, Math.PI, '#1e3a8a');
      ib.f('c:#e2e8f0', 5.6, 0, 3.6, 0.6, 1.0, 0.6, true); ib.f('c:#38bdf8', 5.6, 1.0, 3.6, 0.45, 0.5, 0.45, false); // кулер
      ib.plane('sign:ПОЛИЦИЯ|#1e40af', 0, 3.0, -D / 2 + 0.18, 4.4, 0.7, 0);
      ib.light(-4, H - 0.3, -1, 1.2, 0xffffff, 18); ib.light(4, H - 0.3, 1, 1.2, 0xffffff, 18);
      break;
    }
    // ---------------- БОЛЬНИЦА С КАБИНЕТОМ ВРАЧА ----------------
    case 'hospital': {
      S(21, 15, 3.6); ib.room(W, D, H, 'tex:floortile', WALLS.clinic);
      // перегородка: кабинет врача на севере, приёмное отделение на юге
      ib.wall(-W / 2, -1.2, W / 2, -1.2, H, WALLS.clinic, [[-3.0, 1.8]]);
      // ---- приёмное отделение ----
      ib.f('c:#0e7490', -6.2, 0, 2.0, 4.6, 1.05, 0.9, true);
      ib.f('c:#e2e8f0', -6.2, 1.05, 2.0, 4.7, 0.08, 1.0, false);
      ib.f('glass:0.25', -6.2, 1.13, 1.55, 4.4, 0.8, 0.05, false);
      ib.act(-6.2, 3.2, 1.8, 'Регистратура: лечение · смена пола', 'hospital'); ib.npc(-6.2, 0.8, 0, 'doctor');
      // стойка записи на смену врача
      ib.f('c:#0f766e', 0.6, 0, 1.6, 3.2, 1.05, 0.8, true);
      ib.f('c:#111827', 0.6, 1.05, 1.6, 0.4, 0.28, 0.26, false);
      ib.act(0.6, 2.6, 1.7, 'Смена врача: приём пациентов', 'doctorhire');
      // зона ожидания: два ряда кресел, столик, кулер, информационный стенд
      for (let i = 0; i < 4; i++) for (const z of [4.6, 6.0]) {
        ib.f('c:#1d4ed8', -6.4 + i * 1.15, 0, z, 0.95, 0.48, 0.9, true);
        ib.f('c:#1d4ed8', -6.4 + i * 1.15, 0.48, z + 0.36, 0.95, 0.55, 0.12, false);
      }
      ib.f('c:#78350f', -2.6, 0, 5.3, 1.6, 0.45, 0.7, true);
      for (let i = 0; i < 4; i++) ib.f('c:' + GOODS[i], -3.2 + i * 0.4, 0.47, 5.3, 0.3, 0.06, 0.4, false);
      ib.f('c:#e2e8f0', 1.8, 0, 5.4, 0.6, 1.05, 0.6, true); ib.f('c:#38bdf8', 1.8, 1.05, 5.4, 0.45, 0.5, 0.45, false);
      ib.plane('sign:РЕЖИМ РАБОТЫ · ПРИЁМ ВРАЧА|#0e7490', 4.4, 2.3, 6.2, 5.4, 1.4, Math.PI);
      ib.f('c:#0e7490', 4.4, 0, 6.2, 5.6, 1.6, 0.1, false);
      ib.plane('sign:✚ БОЛЬНИЦА|#dc2626', 0, 3.0, -D / 2 + 0.18, 4.4, 0.7, 0);
      ib.plane('sign:ХИРУРГИЯ · ТЕРАПИЯ|#0e7490', -3.0, 2.3, -1.05, 3.6, 0.5, 0);
      ib.plant(-9.2, 5.8); ib.plant(8.6, 1.8); ib.rug(-4.4, 5.3, 5, 2, '#bae6fd');
      // ---- кабинет врача (северная половина) ----
      // кушетка у левой стены
      ib.examBed(-6.8, -5.4, 0);
      ib.curtain(-4.6, -6.9, -4.6, -3.6, 2.5);
      // монитор диагностики
      ib.monitor(-3.9, -6.6, 0, 'diagnose', 'Монитор: осмотр пациента');
      // шкафы с препаратами у правой/задней стены
      ib.medCabinet(1.0, -D / 2 + 0.4, 0, 'Антигриппин', 0);
      ib.medCabinet(3.4, -D / 2 + 0.4, 1, 'Обезболивающее', 0);
      ib.medCabinet(5.8, -D / 2 + 0.4, 2, 'Антисептик', 0);
      // рабочий стол врача, карта пациента, весы, ростомер, раковина
      ib.f('c:#78350f', 3.2, 0, -4.0, 3.2, 0.95, 1.0, true);
      ib.f('c:#f8fafc', 3.2, 0.95, -4.0, 3.0, 0.06, 0.8, false);
      ib.f('c:#0a0a0a', 3.8, 1.01, -4.0, 0.7, 0.42, 0.06, false); ib.f('glow:#60a5fa', 3.8, 1.04, -4.05, 0.62, 0.34, 0.01, false);
      ib.cyl('c:#111827', 2.4, 0, -3.0, 0.24, 0.48);
      ib.f('c:#e2e8f0', 6.2, 0, -2.4, 0.8, 1.6, 0.8, true); // весы
      ib.f('c:#a8a29e', 7.6, 0, -D / 2 + 0.4, 0.2, 2.2, 0.2, false); // ростомер
      ib.f('c:#f8fafc', 8.6, 0, -2.0, 0.6, 0.8, 1.2, true); ib.cyl('chrome', 8.6, 0.8, -2.0, 0.06, 0.3);
      ib.f('c:#dc2626', 8.75, 1.1, -2.7, 0.3, 0.5, 0.3, false); // огнетушитель/аптечка
      // стулья для посетителей кабинета
      ib.f('c:#334155', 1.0, 0, -3.2, 0.5, 0.5, 0.5, true); ib.f('c:#334155', 1.0, 0.5, -3.5, 0.5, 0.5, 0.1, false);
      ib.window(-W / 2 + 0.15, 2.0, -4.4, 2.6, 1.2, Math.PI / 2);
      ib.window(W / 2 - 0.15, 2.0, -4.4, 2.6, 1.2, -Math.PI / 2);
      ib.rug(2.4, -5.6, 3.2, 2.4, '#e0f2fe');
      ib.light(0, H - 0.3, 2.6, 1.3, 0xffffff, 20); ib.light(-6.4, H - 0.3, 4.4, 1.0, 0xffffff, 14);
      ib.light(-5.6, H - 0.3, -4.6, 1.2, 0xf0f9ff, 16); ib.light(3.4, H - 0.3, -4.6, 1.2, 0xf0f9ff, 16);
      break;
    }
    // ---------------- МЭРИЯ ----------------
    case 'cityhall': {
      S(34, 24, 5.4);
      ib.room(W, D, H, 'tex:parquet', WALLS.beige);
      // парадная лестница и балкон
      for (let k = 0; k < 8; k++) ib.f('c:#d6d3d1', 0, 0, -D / 2 + 1.2 + k * 0.55, 9 - k * 0.4, 0.34 * (k + 1), 0.6);
      ib.f('c:#d6d3d1', 0, 2.7, -D / 2 + 6.6, 9, 0.3, 2.4);
      ib.col(-4.5, -D / 2 + 1, 4.5, -D / 2 + 7.6, 0, 3.0);
      for (const x of [-4.6, 4.6]) ib.f('c:#a8a29e', x, 0, -D / 2 + 4.2, 0.25, 3.0, 6.4, false);
      ib.f('c:#e7e5e4', 0, 3.9, -D / 2 + 3.4, W - 2, 0.3, 6.2, false);
      ib.f('c:#a8a29e', 0, 4.2, -D / 2 + 6.4, W - 2, 1.0, 0.12);
      // колонны
      for (const x of [-8, 8]) for (const z of [-7, 0, 7]) ib.cyl('c:#f5f5f4', x, 0, z, 0.45, H, true);
      for (const x of [-8, 8]) for (const z of [-7, 0, 7]) { ib.cyl('c:#e7e5e4', x, H - 0.5, z, 0.62, 0.3); ib.cyl('c:#e7e5e4', x, 0, z, 0.62, 0.35); }
      // левое крыло: кабинеты
      ib.wall(-9, -D / 2, -9, D / 2, H, WALLS.beige, [[-7.5, 1.4], [1.5, 1.4], [8.5, 1.4]]);
      ib.wall(-W / 2, -3.0, -9, -3.0, H, WALLS.beige);
      ib.wall(-W / 2, 4.6, -9, 4.6, H, WALLS.beige);
      ib.f('c:#78350f', -13, 0, -8.4, 5.4, 0.95, 2.2);
      ib.f('c:#1c1917', -13, 0.95, -8.4, 1.2, 0.05, 0.6, false);
      ib.cyl('c:#1f2937', -15.6, 0, -9.4, 0.35, 1.1);
      for (const x of [-16.5, -14.5, -12.5, -10.5]) ib.f('c:#57534e', x, 0, -4.2, 0.6, 0.9, 0.6, true);
      ib.f('c:#0f172a', -13, 1.9, -D / 2 + 0.14, 4.2, 1.5, 0.06, false);
      ib.f('glow:#fde68a', -13, 2.2, -D / 2 + 0.2, 3.9, 0.9, 0.02, false);
      ib.rug(-13, -6.2, 5, 3.4, '#7f1d1d');
      ib.act(-13, -5.2, 2.0, 'Кабинет мэра', 'cityhall'); ib.npc(-13, -9.6, Math.PI, 'clerk');
      ib.counter(-13, -0.4, 5.2, 'Отдел недвижимости', 'cityhall', false);
      ib.npc(-15.4, -1.2, 0, 'clerk'); ib.npc(-11.2, -1.2, 0, 'clerk');
      for (const z of [-2.2, 1.0, 2.6]) ib.f('c:#2563eb', -W / 2 + 0.16, 1.4, z, 0.04, 0.9, 1.2, false);
      ib.table(-12.6, 2.4, 4);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) ib.f('c:#57534e', -16.4 + k * 2.4, 0, 6.4 + r * 1.6, 2.2, 2.3, 0.55, true);
      ib.f('c:#111827', -13, 0, 11.2, 1.6, 0.75, 0.9);
      ib.act(-16.4, 9.6, 1.8, 'Архив: справки и выписки', 'cityhall');
      // правое крыло
      ib.counter(11.5, -6.5, 6, 'Приёмная: недвижимость и справки', 'cityhall', false);
      ib.npc(9.4, -7.4, 0, 'clerk'); ib.npc(13.6, -7.4, 0, 'clerk');
      ib.wall(9, 6.2, W / 2, 6.2, H, 'c:#c9c2b4', [[12, 1.2]]);
      for (const x of [10.4, 12.4, 14.4]) { ib.f('c:#78350f', x, 0, 8.4, 1.4, 0.75, 0.8); ib.cyl('c:#1f2937', x, 0, 9.6, 0.22, 0.45); }
      ib.f('c:#e5e7eb', W / 2 - 0.4, 0, 8.4, 0.7, 1.9, 3.2, true);
      ib.act(W / 2 - 1.3, 8.4, 1.3, 'Буфет: кофе', 'coffee');
      ib.f('c:#1e293b', W / 2 - 0.3, 0, -9, 0.5, 1.4, 3, true); ib.npc(W / 2 - 1.2, -9, -Math.PI / 2, 'guard');
      // декор зала
      ib.rug(0, 0, 4.2, 17, '#7f1d1d');
      for (const z of [-3, 3, 9]) for (const x of [-6, 6]) ib.sofa(x, z, 2.6, x > 0 ? Math.PI / 2 : -Math.PI / 2, '#1e3a8a');
      ib.f('c:#e7e5e4', 0, 1.2, D / 2 - 0.2, 5.4, 2.6, 0.1, false);
      ib.plane('sign:МЭРИЯ ЛОС-ГОРОДА|#1e3a8a', 0, 4.2, D / 2 - 0.16, 7.5, 1.0, Math.PI);
      ib.f('c:#64748b', -W / 2 + 0.5, 0, -11.4, 0.06, 3.4, 0.06, false);
      ib.f('c:#64748b', -W / 2 + 0.5, 0, -10.9, 0.06, 3.4, 0.06, false);
      ib.f('glow:#e5e7eb', -W / 2 + 1.3, 2.8, -11.4, 1.6, 0.9, 0.04, false);
      ib.f('glow:#dc2626', -W / 2 + 1.3, 2.8, -10.9, 1.6, 0.9, 0.04, false);
      ib.plane('sign:КАРТА ГОРОДА|#0f766e', 12, 2.4, -D / 2 + 0.14, 6, 2.6, 0);
      ib.plant(-7.6, 11); ib.plant(7.6, 11); ib.plant(-7.6, -11); ib.plant(7.6, -11); ib.plant(-9.8, -2.2); ib.plant(9.6, 5.4);
      ib.light(-11, H - 0.6, 6, 1.2, 0xfff0d0, 16); ib.light(-11, H - 0.6, -6, 1.2, 0xfff0d0, 16);
      ib.light(0, H - 0.4, -2, 1.6, 0xfff3d6, 24); ib.light(0, H - 0.4, 7, 1.4, 0xfff3d6, 22); ib.light(12, H - 0.5, -4, 1.2, 0xffffff, 16);
      break;
    }
    // ---------------- БАНК ----------------
    case 'bank': {
      S(16, 11, 4.2); ib.room(W, D, H, 'tex:floortile', WALLS.beige);
      // три окошка кассиров с латунными рамами
      for (let i = 0; i < 3; i++) {
        const x = -4.6 + i * 4.4;
        ib.f('c:#78350f', x, 0, -2.4, 3.6, 1.1, 0.9, true);
        ib.f('c:#d6d3d1', x, 1.1, -2.4, 3.7, 0.08, 1.0, false);
        ib.f('glass:0.28', x, 1.18, -2.85, 3.5, 1.0, 0.05, false);
        ib.f('c:#b45309', x, 2.25, -2.86, 3.6, 0.12, 0.1, false);
        ib.f('c:#111827', x + 1.2, 1.18, -2.4, 0.35, 0.28, 0.28, false);
      }
      ib.act(0, -1.0, 2.0, 'Банк: доход бизнесов', 'bank'); ib.npc(-2, -3.4, 0, 'clerk'); ib.npc(2.6, -3.4, 0, 'clerk');
      // сейфовая дверь, банкомат, очередь
      ib.cyl('c:#9ca3af', 6.6, 0.2, -D / 2 + 0.35, 1.4, 0.3);
      ib.f('c:#6b7280', 6.6, 0, -D / 2 + 0.2, 3.0, 2.9, 0.12, false);
      ib.f('c:#4b5563', 6.6, 1.4, -D / 2 + 0.28, 0.25, 0.25, 0.1, false);
      ib.f('c:#1f2937', W / 2 - 0.5, 0, 1.6, 0.6, 1.9, 1.0, true);
      ib.f('glow:#38bdf8', W / 2 - 0.82, 1.25, 1.6, 0.03, 0.5, 0.7, false);
      ib.act(W / 2 - 1.0, 2.6, 1.2, 'Банкомат: снять доход', 'bank');
      for (let i = 0; i < 3; i++) ib.f('chrome', -3.6 + i * 2.2, 0, 1.0, 0.12, 1.0, 0.12, false);
      ib.f('c:#dc2626', -3.6, 1.0, 1.0, 0.5, 0.14, 0.04, false);
      ib.sofa(-6.0, 3.4, 3.0, Math.PI, '#78350f'); ib.sofa(6.0, 3.4, 3.0, Math.PI, '#78350f');
      ib.plant(-7.2, 4.4); ib.plant(7.2, 4.4); ib.rug(0, 0.6, 6, 3, '#78350f');
      ib.f('c:#e5e7eb', -W / 2 + 0.4, 0, 3.2, 0.7, 1.2, 2.0, true); ib.f('c:#38bdf8', -W / 2 + 0.75, 1.0, 3.2, 0.3, 0.4, 0.4, false);
      ib.plane('sign:БАНК · КАССА|#0f766e', 0, 3.2, -D / 2 + 0.18, 4.4, 0.7, 0);
      ib.light(0, H - 0.3, 0, 1.5, 0xfff3d6, 22); ib.light(0, H - 0.3, 3, 1.0, 0xfff3d6, 14);
      break;
    }
    // ---------------- АВТОСАЛОН ----------------
    case 'dealer': {
      S(26, 16, 6.2); ib.room(W, D, H, 'tex:floortile', WALLS.white);
      // подиумы с машинами (упрощённые силуэты)
      for (const [x, col] of [[-8, '#d50000'], [0, '#ffffff'], [8, '#1d4ed8']] as const) {
        ib.f('c:#e2e8f0', x, 0, -1.0, 5.2, 0.18, 8.0, true);
        ib.f('c:' + col, x, 0.18, -1.0, 1.9, 0.7, 4.4, false);
        ib.f('c:' + col, x, 0.88, -1.2, 1.7, 0.55, 2.4, false);
        ib.f('glass:0.5', x, 1.05, -1.2, 1.55, 0.4, 2.0, false);
        for (const dz of [-1.5, 1.5]) for (const sx of [-0.95, 0.95]) ib.f('c:#111827', x + sx, 0.18, -1.0 + dz, 0.22, 0.4, 0.9, false);
        ib.cyl('c:#9ca3af', x, 0.9, 3.6, 0.35, 1.2); // стойка с инфо
      }
      // стойка менеджера и зона ожидания
      ib.f('c:#111827', 10.6, 0, -4.4, 3.0, 0.85, 1.2, true); ib.npc(10.6, -5.3, 0, 'clerk');
      ib.act(10.6, -2.9, 2.0, 'Автосалон: купить новую машину', 'dealer');
      ib.sofa(-10.6, 4.6, 3.0, Math.PI, '#0f172a'); ib.f('c:#78350f', -7.4, 0, 4.6, 1.6, 0.45, 0.8, true);
      ib.f('c:#0ea5e9', -W / 2 + 0.2, 1.6, 0, 0.06, 1.2, 5.0, false);
      ib.plane('sign:АВТОСАЛОН · ТЕСТ-ДРАЙВ|#0ea5e9', 0, 4.4, D / 2 - 0.18, 6.4, 1.0, Math.PI);
      ib.plane('sign:НОВИНКИ 2026|#0ea5e9', 0, 3.4, -D / 2 + 0.18, 5.2, 0.8, 0);
      ib.plant(-12.2, 6.6); ib.plant(12.2, 6.6);
      ib.light(-8, H - 0.5, -1, 1.8, 0xffffff, 24); ib.light(0, H - 0.5, -1, 1.8, 0xffffff, 24); ib.light(8, H - 0.5, -1, 1.8, 0xffffff, 24);
      ib.light(0, H - 0.5, 5, 1.2, 0xffffff, 18);
      break;
    }
    // ---------------- АВТОСЕРВИС ----------------
    case 'service': {
      S(18, 14, 5.2); ib.room(W, D, H, 'tex:concrete', WALLS.grey);
      // подъёмник с машиной, инструментальная стена, шины, бочки
      ib.f('c:#334155', -3.0, 0, -1.0, 3.4, 0.3, 6.4, true);
      ib.f('c:#64748b', -3.0, 0.3, -1.0, 2.6, 0.14, 5.4, false);
      ib.f('c:#b91c1c', -3.0, 0.44, -1.0, 1.9, 0.7, 4.4, false);
      ib.f('c:#b91c1c', -3.0, 1.14, -1.2, 1.7, 0.5, 2.3, false);
      ib.f('glass:0.4', -3.0, 1.3, -1.2, 1.55, 0.35, 1.9, false);
      for (const dz of [-1.5, 1.5]) for (const sx of [-0.95, 0.95]) ib.f('c:#111827', -3.0 + sx, 0.2, -1.0 + dz, 0.22, 0.38, 0.9, false);
      ib.f('c:#facc15', -4.8, 0, -3.4, 0.2, 2.6, 0.2, true); ib.f('c:#facc15', -4.8, 0, 1.4, 0.2, 2.6, 0.2, true);
      ib.f('c:#facc15', -1.2, 0, -3.4, 0.2, 2.6, 0.2, true); ib.f('c:#facc15', -1.2, 0, 1.4, 0.2, 2.6, 0.2, true);
      ib.f('c:#374151', -3.0, 2.6, -1.0, 3.6, 0.14, 6.6, false);
      // стена инструментов
      for (let i = 0; i < 14; i++) { ib.f('c:#9ca3af', 7.8, 1.2 + (i % 4) * 0.35, -5.2 + Math.floor(i / 4) * 1.2, 0.1, 0.1, 0.5, false); }
      ib.f('c:#1f2937', 8.2, 0, -1.0, 0.6, 2.2, 4.4, true);
      for (let i = 0; i < 8; i++) { ib.cyl('c:#111827', 6.0 + (i % 4) * 0.9, 0, 2.6 + Math.floor(i / 4) * 0.9, 0.38, 0.28, true); }
      for (let i = 0; i < 4; i++) ib.cyl('c:' + ['#b91c1c', '#1d4ed8', '#365314', '#a16207'][i], -7.6 + i * 0.8, 0, 2.4, 0.3, 0.9, true);
      ib.f('c:#78350f', -7.4, 0, -4.4, 2.6, 0.95, 1.0, true); ib.f('c:#111827', -7.4, 0.95, -4.4, 1.4, 0.1, 0.5, false);
      // мастер и менеджер
      ib.f('c:#b91c1c', 5.0, 0, -5.4, 3.0, 1.4, 0.8, true);
      ib.act(3.5, -3.8, 2.0, 'Мастер: ремонт и тюнинг (подъезжайте на машине к воротам)', 'service-info');
      ib.npc(5.2, -4.5, Math.PI, 'mechanic'); ib.npc(-6.2, -3.2, 0.5, 'mechanic');
      ib.f('c:#1e293b', 8.2, 0, 4.6, 2.4, 0.9, 1.0, true); ib.act(8.2, 3.6, 1.5, 'Касса автосервиса', 'service-info');
      ib.plane('sign:АВТОСЕРВИС · ТЮНИНГ|#2563eb', 0, 4.0, -D / 2 + 0.18, 6, 0.8, 0);
      ib.light(-4, H - 0.4, 0, 1.6, 0xffffff, 22); ib.light(5, H - 0.4, 1, 1.4, 0xffffff, 20);
      break;
    }
    // ---------------- ПОЖАРНАЯ ЧАСТЬ ----------------
    case 'fire': {
      S(16, 12, 5.4); ib.room(W, D, H, 'tex:concrete', WALLS.grey);
      // пожарная машина
      ib.f('c:#b91c1c', -3.4, 0.2, -1.0, 2.4, 2.0, 7.4, true);
      ib.f('c:#b91c1c', -3.4, 2.2, -1.0, 2.2, 0.5, 5.0, false);
      ib.f('glass:0.45', -3.4, 1.6, -4.5, 2.0, 0.9, 0.12, false);
      for (const dz of [-2.6, -0.4, 2.4]) for (const sx of [-1.2, 1.2]) ib.f('c:#111827', -3.4 + sx, 0.2, -1.0 + dz, 0.28, 0.8, 1.2, false);
      ib.f('c:#dc2626', -3.4, 2.8, -1.0, 0.5, 0.4, 6.0, false); // лестница на крыше
      // стойки с экипировкой
      for (let i = 0; i < 6; i++) { ib.f('c:#1f2937', 5.6 + (i % 3) * 0.7, 0, -4.4, 0.6, 1.9, 0.6, true); ib.cyl('c:#facc15', 5.6 + (i % 3) * 0.7, 1.9, -4.4, 0.22, 0.28); }
      for (let i = 0; i < 4; i++) ib.cyl('c:#dc2626', 5.4 + i * 0.7, 0, 1.0, 0.24, 0.3); // рукава
      ib.f('c:#1e293b', 4.8, 0, 3.8, 3.4, 1.0, 0.9, true); ib.npc(4.8, 2.9, 0, 'fireman');
      ib.act(3.2, 3.8, 1.6, 'Диспетчер: вызовы через телефон', 'fire-info');
      ib.plane('sign:ПОЖАРНАЯ ЧАСТЬ · 01|#b91c1c', 0, 4.2, -D / 2 + 0.18, 5.6, 0.8, 0);
      ib.plane('sign:ВЫЕЗД 24/7|#dc2626', 0, 3.4, D / 2 - 0.16, 4.0, 0.6, Math.PI);
      ib.light(-3, H - 0.4, 0, 1.5, 0xffffff, 24); ib.light(5, H - 0.4, 1, 1.2, 0xffffff, 18);
      break;
    }
    // ---------------- ДЕРЕВЕНСКАЯ АДМИНИСТРАЦИЯ ----------------
    case 'vadmin': {
      S(17, 13, 3.7); ib.room(W, D, H, 'tex:parquet', WALLS.beige);
      ib.wall(-2, -D / 2, -2, D / 2, H, WALLS.beige, [[-2.6, 1.2]]);
      ib.wall(-2, 1.4, W / 2, 1.4, H, WALLS.beige, [[5, 1.1]]);
      // приёмная с окошком
      ib.f('c:#78350f', 0.6, 0, -2.2, 3.6, 0.9, 1.0);
      ib.f('glass:0.3', 0.6, 0.9, -2.6, 3.6, 0.9, 0.05, false);
      ib.f('c:#92400e', 0.6, 1.8, -2.6, 3.8, 0.12, 0.12, false);
      ib.npc(0.6, -3.2, 0, 'clerk');
      ib.act(0.6, -1.0, 1.6, 'Администрация: дома на продажу', 'vadmin');
      ib.f('c:#2563eb', -W / 2 + 0.16, 1.3, -3.2, 0.04, 0.9, 1.4, false);
      ib.plane('sign:ДОМА · ЗЕМЛЯ · СПРАВКИ|#1e3a8a', 3.0, 2.1, -D / 2 + 0.16, 4.2, 0.5, 0);
      for (const z of [2.6, 4.4]) ib.sofa(3.6, z, 2.0, Math.PI / 2, '#78350f');
      ib.f('c:#78350f', 6.4, 0, 1.9, 1.2, 0.45, 0.6, true); // стол ожидания
      // кабинет главы
      ib.f('c:#78350f', -6.4, 0, -3.4, 3.2, 0.95, 1.5);
      ib.cyl('c:#1f2937', -6.4, 0, -4.8, 0.3, 1.0);
      ib.f('c:#0f172a', -6.4, 1.7, -D / 2 + 0.12, 2.4, 1.0, 0.06, false);
      ib.rug(-6.4, -1.6, 3.6, 2.6, '#7f1d1d');
      ib.act(-6.4, -1.4, 1.6, 'Глава администрации', 'vadmin');
      ib.f('c:#166534', -W / 2 + 0.2, 1.4, 2.0, 0.05, 0.9, 3.0, false); // стенд с планом
      ib.plant(-7.4, 4.6);
      // архив
      for (let k = 0; k < 3; k++) ib.f('c:#57534e', 3.6 + k * 2.2, 0, 3.4, 2.0, 2.2, 0.5, true);
      for (let k = 0; k < 3; k++) for (let lv = 0; lv < 4; lv++) ib.f('c:#e7e5e4', 3.6 + k * 2.2, 0.4 + lv * 0.45, 3.7, 1.8, 0.3, 0.1, false);
      ib.f('c:#e5e7eb', 8.6, 0, 4.4, 1.4, 1.0, 0.8);
      ib.light(-6, H - 0.3, -1, 1.0, 0xfff0d0, 12); ib.light(2, H - 0.3, 3, 1.0, 0xfff0d0, 12);
      break;
    }
    // ---------------- ПРОХОДНАЯ ЗАВОДА ----------------
    case 'checkpoint': {
      S(11, 8, 3.2); ib.room(W, D, H, 'tex:concrete', WALLS.grey);
      // будка охраны с остеклением и турникет
      ib.f('glass:0.3', -2.4, 0, -1.4, 3.0, 2.4, 0.08);
      ib.f('c:#d1d5db', -2.4, 0, -2.4, 3.0, 0.95, 0.8, true);
      ib.f('c:#111827', -2.4, 0.95, -2.4, 0.4, 0.3, 0.3, false);
      ib.npc(-2.4, -2.9, 0, 'guard');
      ib.act(-2.4, 0, 1.7, 'Отдел кадров: работа на заводе', 'factory');
      ib.f('chrome', 2.2, 0, -1.2, 0.16, 1.5, 0.16, false);
      for (const a of [0, Math.PI / 2, Math.PI]) ib.f('c:#9ca3af', 2.2 + Math.sin(a) * 0.9, 0.9, -1.2 + Math.cos(a) * 0.9, 0.12, 0.08, 1.6, false, a);
      ib.f('c:#facc15', 0.4, 0, -1.2, 2.8, 0.06, 0.4, false); // разметка
      ib.plane('sign:ПРОХОДНАЯ · ПРОПУСКА|#334155', 0, 2.7, -D / 2 + 0.16, 4.0, 0.55, 0);
      for (let i = 0; i < 4; i++) ib.f('c:#334155', 4.4, 0, -2.6 + i * 0.7, 0.9, 2.0, 0.55, true);
      ib.light(0, H - 0.3, 0, 1.1, 0xffffff, 12);
      break;
    }
    // ---------------- ПОДВАЛ (гроурум) ----------------
    case 'basement': {
      S(9, 8, 2.6); ib.room(W, D, H, 'tex:concrete', 'tex:brickwall', 'Подняться в дом');
      ib.f('c:#57534e', 0, 0, D / 2 - 0.6, 0.7, 2.4, 0.12, false);
      for (let k = 0; k < 6; k++) ib.f('c:#78716c', 0, 0.3 + k * 0.38, D / 2 - 0.5, 0.65, 0.05, 0.25, false);
      ib.f('c:#78350f', 3.4, 0, 0.4, 0.6, 1.5, 2.6, true); // стеллаж
      for (let k = 0; k < 8; k++) ib.f('c:' + ['#166534', '#a16207', '#7c2d12'][k % 3], 3.4, 0.3 + (k % 4) * 0.3, -0.6 + Math.floor(k / 4) * 1.2, 0.4, 0.22, 0.8, false);
      for (let k = 0; k < 6; k++) {
        const x = -2.6 + (k % 3) * 2.6, z = -1.9 + Math.floor(k / 3) * 2.0;
        ib.cyl('c:#3f2a1d', x, 0, z, 0.38, 0.5, true); ib.cyl('c:#2b1d12', x, 0.5, z, 0.34, 0.02);
        ib.f('glow:#d946ef', x, H - 0.35, z, 0.9, 0.05, 0.25, false); ib.f('c:#1f2937', x, H - 0.3, z, 1.0, 0.06, 0.32, false);
        ib.act(x, z + 0.7, 0.9, `Горшок ${k + 1}`, 'pot:' + k);
        ib.pots.push({ x, z });
      }
      ib.f('c:#1f2937', W / 2 - 0.4, 0, -D / 2 + 0.6, 0.6, 1.2, 0.8); ib.f('glow:#22c55e', W / 2 - 0.4, 1.0, -D / 2 + 0.95, 0.2, 0.06, 0.02, false);
      for (let i = 0; i < 3; i++) ib.cyl('c:#111827', -3.0 + i * 0.8, 0, 2.2, 0.12, 1.2); // вентиляция
      ib.light(0, H - 0.3, -1, 1.2, 0xe879f9, 10); ib.light(0, H - 0.3, 1.5, 0.7, 0xfff1d6, 8);
      break;
    }
    // ---------------- ОФИС «ЛОС-ТЕХ» ----------------
    case 'office': {
      S(24, 16, 3.6); ib.room(W, D, H, 'tex:floortile', WALLS.panel);
      ib.f('glass:0.35', 0, 0.6, -D / 2 + 0.15, W - 1, 2.6, 0.05, false); // панорамное окно
      // опенспейс 8 мест
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const i = r * 4 + c; ib.pc(-8 + c * 4.8, -4.6 + r * 4.6, 0, 'pc:' + i, `Рабочий ПК №${i + 1}`, (i % 3) === 1); }
      ib.f('c:#94a3b8', -1.0, 0.75, -2.3, 12.0, 0.06, 0.4, false); // перегородка между рядами столов
      // переговорная, HR, кофе, диваны
      ib.f('glass:0.25', 6.4, 0.6, 3.4, 0.08, 2.4, 5.0, false);
      ib.f('c:#78350f', 8.6, 0, 5.6, 4.2, 0.75, 1.4, true);
      for (let i = 0; i < 6; i++) ib.f('c:#334155', 7.2 + (i % 3) * 1.4, 0, 4.4 + Math.floor(i / 3) * 2.4, 0.5, 0.5, 0.5, false);
      ib.act(8.6, 4.4, 1.2, 'Переговорная', 'info');
      ib.counter(7.5, -5.8, 3.4, 'Отдел кадров «ЛосТех»: устройство в офис', 'officehr', false); ib.npc(7.5, -6.6, 0, 'clerk');
      ib.f('c:#1f2937', -10.4, 0, 5.6, 1.2, 1.0, 0.7); ib.f('c:#7c2d12', -10.4, 1.0, 5.6, 0.4, 0.4, 0.4, false);
      ib.act(-10.4, 4.6, 1.2, 'Кофемашина', 'coffee');
      ib.sofa(-4.0, 6.2, 2.6, Math.PI, '#0ea5e9'); ib.f('c:#78350f', -1.4, 0, 6.2, 1.6, 0.45, 0.7, true);
      ib.plane('sign:«ЛосТех» · IT & ДАННЫЕ|#0ea5e9', 0, 2.9, D / 2 - 0.18, 5.4, 0.65, Math.PI);
      ib.plane('sign:ОПЕНСПЕЙС|#0ea5e9', -4.0, 2.9, -D / 2 + 0.18, 4.0, 0.5, 0);
      ib.plant(-10.8, -6.8); ib.plant(10.8, -6.8); ib.plant(10.8, 6.8);
      ib.rug(-4.0, 5.4, 6, 2.4, '#0f172a');
      ib.light(-6, H - 0.3, -3, 1.3, 0xffffff, 18); ib.light(3, H - 0.3, -3, 1.3, 0xffffff, 18);
      ib.light(0, H - 0.3, 5, 1.0, 0xffffff, 14); ib.light(8, H - 0.3, 4, 1.0, 0xfff3d6, 12);
      break;
    }
    // ---------------- САМОКАТЫ ----------------
    case 'scootershop': {
      S(15, 11, 4.2); ib.room(W, D, H, 'tex:floortile', WALLS.tile);
      for (let i = 0; i < 8; i++) {
        const x = -5.6 + (i % 4) * 3.8, z = -3.6 + Math.floor(i / 4) * 3.6;
        ib.cyl('c:#e2e8f0', x, 0, z, 0.95, 0.12); ib.col(x - 0.95, z - 0.95, x + 0.95, z + 0.95, 0, 0.12);
        ib.f('c:' + ['#16a34a', '#0ea5e9', '#f59e0b', '#111827'][i % 4], x, 0.14, z, 0.16, 0.06, 1.0, false);
        ib.f('c:#111827', x, 0.2, z + 0.45, 0.05, 1.05, 0.05, false);
        ib.f('c:#111827', x, 1.25, z + 0.45, 0.52, 0.04, 0.04, false);
        ib.cyl('c:#111827', x, 0.14, z - 0.5, 0.14, 0.14);
      }
      ib.counter(5.4, 2.4, 3.2, 'Продавец: электросамокаты (20 моделей)', 'scooterdealer', false); ib.npc(5.4, 1.5, 0, 'clerk');
      ib.f('c:#16a34a', -W / 2 + 0.2, 0, 3.4, 0.08, 1.6, 3.0, false); // баннер с зарядками
      ib.plane('sign:🛴 ВЖУХ STORE · ТЕСТ-ДРАЙВ|#16a34a', 0, 3.2, -D / 2 + 0.18, 5.2, 0.7, 0);
      ib.plant(-6.4, 4.2); ib.plant(6.4, -4.2);
      ib.light(-3, H - 0.4, -1, 1.5, 0xffffff, 18); ib.light(4, H - 0.4, 1, 1.3, 0xffffff, 16);
      break;
    }
    // ---------------- ДИСПЕТЧЕРСКАЯ ----------------
    case 'truckoffice': {
      S(13, 10, 3.4); ib.room(W, D, H, 'tex:floortile', WALLS.grey);
      ib.counter(0, -3.0, 4.4, 'Диспетчер: устройство на работу и заказы', 'trucker', false); ib.npc(0, -3.9, 0, 'clerk');
      ib.plane('sign:«ВОСТОК-ТРАНС» · ГРУЗОПЕРЕВОЗКИ|#b45309', 0, 2.7, -D / 2 + 0.16, 5.4, 0.6, 0);
      ib.f('c:#1e293b', -4.9, 1.2, -D / 2 + 0.15, 2.6, 1.5, 0.05, false); ib.f('glow:#38bdf8', -4.9, 1.3, -D / 2 + 0.18, 2.4, 1.3, 0.01, false); // карта маршрутов
      for (const [x, z] of [[-3.6, 1.6], [3.6, 1.6]]) { ib.f('c:#78350f', x, 0, z, 1.7, 0.75, 0.85); ib.f('c:#111827', x, 0.75, z, 0.5, 0.35, 0.05, false); ib.cyl('c:#111', x, 0, z + 0.9, 0.22, 0.48); ib.f('glow:#38bdf8', x, 0.78, z - 0.2, 0.42, 0.3, 0.02, false); }
      ib.sofa(0, 4.2, 2.6, Math.PI, '#b45309'); ib.f('c:#78350f', 3.6, 0, 4.2, 1.4, 0.45, 0.7, true);
      ib.f('c:#e2e8f0', -5.2, 0, 3.0, 0.6, 1.1, 0.6, true); ib.f('c:#38bdf8', -5.2, 1.1, 3.0, 0.45, 0.5, 0.45, false);
      ib.plant(5.4, 3.6); ib.plane('sign:ЗАКАЗЫ · РЕЙСЫ · ПУТЕВЫЕ ЛИСТЫ|#b45309', 0, 2.4, -D / 2 + 0.2, 4.6, 0.4, 0);
      ib.light(-2, H - 0.3, 0, 1.2, 0xffffff, 14); ib.light(3, H - 0.3, 2, 1.0, 0xffffff, 12);
      break;
    }
    // ---------------- ТОРГОВЫЙ ЦЕНТР ----------------
    case 'mall': {
      S(44, 32, 9); ib.room(W, D, H, 'tex:floortile', WALLS.tile);
      ib.ceil(-W / 2, -D / 2, W / 2, D / 2, H, '#e2e8f0');
      // второй этаж-галерея и световые люки
      ib.f('c:#cbd5e1', 0, 4.2, -D / 2 + 1.5, W, 0.25, 3, false);
      ib.f('glass:0.3', 0, 4.45, -D / 2 + 3, W, 1.0, 0.05, false);
      for (const x of [-12, 0, 12]) { ib.f('glow:#e0f2fe', x, H - 0.09, 0, 6, 0.02, 6, false); ib.f('c:#94a3b8', x, H - 0.12, 0, 6.4, 0.04, 6.4, false); }
      const shops: [string, string, string][] = [['clothes', 'Одежда «Стиль»', '#8b5cf6'], ['mallfood', 'Фуд-корт «Вкусно»', '#f97316'], ['pharmacy', 'Аптека «Здоровье»', '#10b981'], ['barber', 'Барбершоп', '#ec4899'], ['shop24', 'Продукты 24/7', '#e11d48'], ['gunshop', 'Охота и рыбалка', '#374151']];
      shops.forEach(([k, name, color], i) => {
        const left = i < 3; const z = -10 + (i % 3) * 8;
        const x = left ? -W / 2 + 0.25 : W / 2 - 0.25;
        const ry = left ? Math.PI / 2 : -Math.PI / 2;
        ib.f('glass:0.35', x + (left ? 0.1 : -0.1), 0.3, z - 2.2, 0.08, 2.6, 3, false);
        ib.f('c:' + color, x + (left ? 0.05 : -0.05), 0, z + 1.4, 0.12, 2.4, 1.6, false);
        ib.plane(`sign:${name}|${color}`, x + (left ? 0.2 : -0.2), 3.2, z - 0.5, 5, 0.9, ry);
        for (let n = 0; n < 5; n++) ib.f('c:' + GOODS[(n + i) % GOODS.length], x + (left ? 0.6 : -0.6), 0.3, z - 3.2 + n * 0.55, 0.3, 1.3 + (n % 2) * 0.5, 0.4, false);
        ib.f('c:#f1f5f9', x + (left ? 0.3 : -0.3), 3.7, z - 0.5, 0.6, 0.12, 5.2, false); // козырёк
        ib.act(x + (left ? 1.0 : -1.0), z + 1.4, 1.4, `Войти: ${name}`, `mallshop:${k}:${i}`);
        ib.doorSpots['shop' + i] = { x: ib.ox + x + (left ? 1.4 : -1.4), z: ib.oz + z + 1.4, a: left ? Math.PI / 2 : -Math.PI / 2, y: 0 };
      });
      // фонтан, эскалатор-декор, зоны отдыха
      ib.cyl('c:#9ca3af', 0, 0, 0, 3, 0.7, true); ib.cyl('water', 0, 0.5, 0, 2.7, 0.25); ib.cyl('c:#e5e7eb', 0, 0.7, 0, 0.4, 2.5);
      ib.f('glass:0.25', 4.6, 0.6, -D / 2 + 6.0, 3.2, 3.4, 0.06, false);
      for (let i = 0; i < 8; i++) ib.f('c:#94a3b8', 4.6, 0.1 + i * 0.42, -D / 2 + 6.0 - i * 0.6, 3.0, 0.1, 0.6, false);
      for (const [x, z] of [[-6, 6], [6, 6], [-6, -6], [6, -6]]) { ib.sofa(x, z, 2.4, x > 0 ? -Math.PI / 2 : Math.PI / 2, '#334155'); ib.plant(x, z + (z > 0 ? 2 : -2)); ib.cyl('c:#78350f', x + 2, 0, z, 0.4, 0.7); }
      ib.npc(-8, 3, 1, 'shopper'); ib.npc(9, -3, -2, 'shopper'); ib.npc(3, 9, 3, 'shopper'); ib.npc(-3, -9, 0.4, 'shopper');
      ib.plane('sign:ТЦ «ОРБИТА» · 2 ЭТАЖА|#0ea5e9', 0, 6.0, D / 2 - 0.2, 8, 1.1, Math.PI);
      ib.rug(0, 3.4, 8, 3, '#0f172a');
      ib.light(-12, H - 0.5, 0, 1.6, 0xffffff, 26); ib.light(12, H - 0.5, 0, 1.6, 0xffffff, 26); ib.light(0, H - 0.5, 8, 1.4, 0xffffff, 22); ib.light(0, H - 0.5, -8, 1.4, 0xffffff, 22);
      break;
    }
    // ---------------- ПОДЪЕЗД ----------------
    case 'hall': {
      S(10, 12, 6.6); ib.room(W, D, H, 'tex:floortile', WALLS.mint, 'Выйти из подъезда');
      for (let i = 0; i < 6; i++) for (let r = 0; r < 2; r++) {
        ib.f('c:#1e3a8a', -W / 2 + 0.2, 1.1 + r * 0.32, 2.4 + i * 0.33, 0.12, 0.28, 0.3, false);
        ib.f('chrome', -W / 2 + 0.27, 1.16 + r * 0.32, 2.4 + i * 0.33, 0.02, 0.04, 0.16, false);
      }
      // лестница
      const steps = 10, rise = 3.0 / steps;
      for (let s = 0; s < steps; s++) { const z = 2.6 - s * 0.38; ib.f('c:#a8a29e', 3.3, 0, z, 2.2, rise * (s + 1), 0.38); ib.f('c:#78716c', 3.3, rise * (s + 1) - 0.02, z + 0.14, 2.2, 0.04, 0.08, false); }
      ib.f('c:#a8a29e', 0.5, 2.85, -3.15, 7.6, 0.15, 4.3, false); ib.col(-3.3, -5.4, 4.3, -1.0, 2.85, 3.0);
      for (let s = 0; s <= steps; s += 2) ib.f('c:#44403c', 2.2, rise * s, 2.6 - s * 0.38, 0.05, 1.0, 0.05, false);
      ib.f('c:#78350f', 2.2, 2.5, 0.7, 0.07, 0.07, 4.2, false);
      ib.col(2.1, -0.9, 2.25, 2.8, 0, 2.2);
      ib.f('c:#44403c', -0.6, 3.0, -1.05, 5.4, 1.0, 0.05); ib.f('c:#78350f', -0.6, 4.0, -1.05, 5.4, 0.07, 0.08, false);
      // 4 двери квартир, коврик, коляска, велосипед
      const doors = [[-W / 2 + 0.12, -0.3, Math.PI / 2, 0], [-W / 2 + 0.12, 2.4, Math.PI / 2, 0], [-2.2, -D / 2 + 0.12, 0, 3.0], [1.4, -D / 2 + 0.12, 0, 3.0]];
      doors.forEach(([x, z, ry, y], u) => {
        const owned = opts.owned?.[u];
        ib.f(owned ? 'c:#166534' : 'c:#7c2d12', x, y, z, ry ? 0.06 : 1.0, 2.1, ry ? 1.0 : 0.06, false);
        ib.f('chrome', x + (ry ? 0.05 : 0.35), y + 1.0, z + (ry ? 0.35 : 0.05), 0.05, 0.05, 0.05, false);
        ib.plane(`sign:${u + 1}|#334155`, x + (ry ? 0.04 : 0), y + 2.25, z + (ry ? 0 : 0.04), 0.3, 0.2, ry);
        ib.f('c:#57534e', x + (ry ? 0.55 : 0), y, z + (ry ? 0 : 0.55), ry ? 0.9 : 1.2, 0.03, ry ? 1.2 : 0.9, false); // коврик
        const ax = x + (ry ? 0.9 : 0), az = z + (ry ? 0 : 0.9);
        ib.act(ax, az, 1.2, `Квартира ${u + 1}`, 'apt:' + u, y);
        ib.doorSpots['apt' + u] = { x: ib.ox + ax, z: ib.oz + az, a: ry ? Math.PI / 2 : 0, y };
      });
      ib.f('chrome', 4.0, 0, 4.6, 0.1, 1.0, 1.4, true); ib.cyl('c:#111', 3.4, 0, 4.6, 0.3, 0.08); // велосипед-декор
      ib.f('c:#f8fafc', -3.6, 0, 5.0, 1.4, 0.9, 0.5, false); ib.f('c:#94a3b8', -3.6, 0.9, 5.0, 1.4, 0.3, 0.5, false);
      ib.f('c:#166534', W / 2 - 0.2, 1.4, 3.4, 0.06, 1.0, 1.6, false); // доска объявлений
      ib.light(0, 2.6, 2, 1.1, 0xfff3d6, 12); ib.light(0, H - 0.4, -3.6, 1.0, 0xfff3d6, 12);
      break;
    }
    // ---------------- КВАРТИРА-СТУДИЯ ----------------
    case 'apt_eco': {
      S(10, 9, 2.9); ib.room(W, D, H, 'tex:parquet', WALLS.paper, 'Выйти в подъезд');
      ib.wall(-1.4, -D / 2, -1.4, 1.2, H, WALLS.white, [[-2.4, 0.9]]);
      ib.wall(-W / 2, 1.2, -1.4, 1.2, H, WALLS.white, [[-3.4, 0.9]]);
      ib.wall(2.2, 1.4, W / 2, 1.4, H, WALLS.white, [[3.4, 0.8]]);
      ib.wall(2.2, 1.4, 2.2, D / 2, H, WALLS.white);
      ib.bedAt(-3.2, -2.2, 1.5, 0, '#c7d2fe');
      ib.f('c:#78350f', -4.4, 0, -3.2, 0.55, 1.7, 1.2);
      ib.rug(-3.2, -0.2, 2.4, 1.6, '#a16207');
      ib.painting(-3.2, 1.9, -D / 2 + 0.12, 0, '#0f766e');
      ib.kitchen(1.4, -D / 2 + 0.4, 3.0, 0); ib.fridgeAt(W / 2 - 0.45, -1.8, -Math.PI / 2);
      ib.table(1.0, 0.4, 2); ib.rug(1.0, 2.6, 2.6, 1.6, '#9a3412');
      ib.sofa(0.6, 3.4, 2.2, Math.PI, '#475569'); ib.tv(3.6, 3.0, 1.2, -Math.PI / 2);
      ib.f('c:#ffffff', 3.6, 0, 2.6, 0.6, 0.45, 0.7); ib.f('c:#f1f5f9', 4.3, 0, 1.9, 0.8, 0.85, 0.5);
      ib.plant(-1.9, 3.9); ib.window(4.4, 1.8, -2.8, 2.2, 1.3, -Math.PI / 2);
      ib.light(-2.6, H - 0.3, -1.6, 0.8); ib.light(1.5, H - 0.3, 1.8, 1.0);
      break;
    }
    // ---------------- КВАРТИРА СРЕДНЕГО КЛАССА ----------------
    case 'apt_mid': {
      S(12, 10, 2.95); ib.room(W, D, H, 'tex:parquet', WALLS.paper, 'Выйти в подъезд');
      ib.wall(-1.6, -D / 2, -1.6, D / 2, H, WALLS.blue, [[0.9, 1.0]]);
      // спальня
      ib.bedAt(-3.8, -2.8, 1.7, 0, '#bfdbfe');
      ib.f('c:#78350f', -5.3, 0, 1.6, 0.6, 2.1, 1.6); ib.f('c:#78350f', -2.5, 0, -4.2, 1.4, 0.5, 0.5);
      ib.plant(-2.2, 4.0); ib.rug(-3.8, -0.4, 2.6, 2, '#7c2d12');
      ib.pc(-3.8, 4.3, Math.PI, 'homepc', 'Компьютер');
      // кухня-гостиная
      ib.kitchen(3.0, -D / 2 + 0.4, 4.2, 0); ib.fridgeAt(W / 2 - 0.45, -2.6, -Math.PI / 2);
      ib.table(2.8, -1.6, 4); ib.sofa(2.6, 3.2, 2.8, Math.PI); ib.tv(2.6, -0.1, 1.5, 0); ib.f('c:#292524', 2.6, 0, -0.1, 1.7, 0.6, 0.4);
      ib.f('c:#57534e', 5.3, 0, 1.2, 0.6, 0.45, 1.8, true); // тумба
      ib.rug(2.6, 1.7, 3.2, 1.9, '#475569');
      // санузел
      ib.wall(4.0, 2.6, W / 2, 2.6, H, WALLS.white, [[4.6, 0.8]]);
      ib.f('c:#ffffff', 5.2, 0, 4.0, 0.7, 0.5, 0.6); ib.f('c:#f1f5f9', 4.2, 0, 4.6, 0.8, 0.85, 0.5);
      ib.plane('glass:0.3', W / 2 - 0.14, 1.5, 3.6, 1.6, 1.0, -Math.PI / 2);
      ib.window(-W / 2 + 0.14, 1.8, 3.2, 2.4, 1.3, Math.PI / 2);
      ib.plant(1.2, 4.4);
      ib.light(-3.6, H - 0.3, 0, 0.9); ib.light(2.6, H - 0.3, 0, 1.1); ib.light(2.6, H - 0.3, 3.4, 0.7, 0xffe0b0, 8);
      break;
    }
    // ---------------- ЛЮКС ----------------
    case 'apt_lux': {
      S(19, 15, 3.3); ib.room(W, D, H, 'tex:parquet', WALLS.white, 'Выйти в подъезд');
      ib.wall(-3.2, -D / 2, -3.2, D / 2, H, WALLS.beige, [[-3.6, 1.2], [4.0, 1.1]]);
      ib.wall(-W / 2, 1.2, -3.2, 1.2, H, WALLS.beige, [[-6.2, 1.0]]);
      ib.wall(4.6, -D / 2, 4.6, -1.6, H, WALLS.white, [[-2.7, 1.0]]);
      ib.wall(4.6, -1.6, W / 2, -1.6, H, WALLS.white);
      // спальня
      ib.bedAt(-6.4, -4.6, 2.1, 0, '#f5f5f4');
      ib.f('c:#d6d3d1', -8.0, 0, -6.3, 0.6, 0.5, 0.5); ib.f('c:#d6d3d1', -4.8, 0, -6.3, 0.6, 0.5, 0.5);
      ib.f('glow:#fde68a', -8.0, 0.5, -6.3, 0.2, 0.35, 0.2, false); ib.f('glow:#fde68a', -4.8, 0.5, -6.3, 0.2, 0.35, 0.2, false);
      ib.painting(-6.4, 2.1, -D / 2 + 0.12, 0, '#0f766e'); ib.rug(-6.4, -2.6, 3.2, 2.2, '#d4d4d8');
      ib.pc(-9.2, -1.4, Math.PI / 2, 'homepc', 'Компьютер');
      ib.f('c:#78350f', -3.4, 0, -5.4, 0.5, 1.6, 1.4); // комод
      // гардероб
      ib.f('c:#57534e', -W / 2 + 0.4, 0, 4.2, 0.7, 2.4, 5.2); ib.f('c:#57534e', -4.4, 0, 6.9, 3.6, 2.4, 0.6);
      ib.plane('glass:0.14', -5.8, 1.2, 7.15, 1.1, 2.1, 0.02);
      for (let i = 0; i < 6; i++) ib.f('c:' + GOODS[i + 2], -6.5 + i * 0.5, 1.6, 7.4, 0.35, 0.7, 0.06, false);
      // гостиная
      ib.sofa(1.0, 5.0, 4.2, Math.PI, '#334155'); ib.sofa(-1.6, 2.9, 2.6, Math.PI / 2, '#334155');
      ib.f('c:#78716c', 1.0, 0, 2.9, 1.7, 0.4, 0.95); ib.rug(1.0, 3.3, 5.2, 3.6, '#a8a29e');
      ib.tv(1.0, -0.2, 2.8, 0); ib.f('c:#1c1917', 1.0, 0, -0.2, 3.4, 0.5, 0.45);
      // кухня с островом
      ib.f('c:#f5f5f4', W / 2 - 0.35, 0, 3.4, 0.65, 0.9, 5.4); ib.f('c:#1c1917', W / 2 - 0.35, 0.9, 3.4, 0.67, 0.04, 5.42, false);
      ib.fridgeAt(W / 2 - 0.45, -0.7, -Math.PI / 2);
      ib.f('c:#e7e5e4', 6.5, 0, 3.4, 1.3, 0.95, 2.7); ib.f('c:#292524', 6.5, 0.95, 3.4, 1.4, 0.05, 2.8, false);
      for (const z of [2.4, 3.4, 4.4]) { ib.cyl('c:#111', 5.4, 0, z, 0.2, 0.75); ib.cyl('c:#d6d3d1', 5.4, 0.75, z, 0.24, 0.06); }
      ib.f('glow:#fef3c7', 6.5, 2.4, 3.4, 2.0, 0.05, 0.3, false);
      // ванная
      ib.f('c:#ffffff', 7.8, 0, -6.0, 1.9, 0.6, 0.9); ib.f('c:#ffffff', 5.4, 0, -6.6, 0.5, 0.45, 0.6); ib.f('c:#ffffff', 8.6, 0, -3.2, 0.6, 0.85, 0.5);
      ib.f('glass:0.2', 8.8, 0.9, -3.2, 0.02, 0.8, 0.6, false);
      ib.cyl('chrome', 7.8, 0.6, -6.4, 0.05, 1.4); ib.plane('glass:0.22', 9.3, 1.4, -5.6, 1.6, 1.6, -Math.PI / 2);
      ib.plant(-2.6, 6.6); ib.plant(4.2, 0.6); ib.painting(1.0, 2.3, D / 2 - 0.12, Math.PI, '#b45309');
      ib.light(-6.4, H - 0.3, -3, 0.9); ib.light(1, H - 0.3, 2.6, 1.2); ib.light(7.2, H - 0.3, 3, 0.9); ib.light(7.6, H - 0.3, -4.6, 0.7, 0xe0f2fe, 8);
      break;
    }
    // ---------------- ДОМ (город/деревня) ----------------
    case 'house_village': case 'house_city': {
      const city = kind === 'house_city';
      S(city ? 11 : 9, city ? 11 : 10, 2.85);
      ib.room(W, D, H, 'tex:parquet', city ? WALLS.paper : WALLS.panel, 'Выйти на крыльцо');
      // сени
      ib.wall(-W / 2, D / 2 - 2.5, W / 2, D / 2 - 2.5, H, city ? WALLS.white : 'c:#8b6b4a', [[0.6, 1.1]]);
      ib.wall(-1.6, D / 2 - 2.5, -1.6, D / 2, H, city ? WALLS.white : 'c:#8b6b4a');
      ib.f('c:#57534e', -1.0, 0, D / 2 - 0.7, 0.5, 1.7, 0.5); // вешалка
      for (let i = 0; i < 3; i++) ib.f('c:' + GOODS[i], -1.0, 1.5, D / 2 - 1.0 + i * 0.2, 0.35, 0.5, 0.06, false);
      ib.f('c:#3f3f46', 1.6, 0, D / 2 - 0.5, 1.0, 0.06, 0.6, false); // коврик
      ib.f('c:#78350f', 2.0, 0, D / 2 - 1.9, 0.5, 0.45, 1.0); // скамья
      // комнаты
      ib.wall(-2.4, -D / 2, -2.4, 0.8, H, city ? WALLS.white : 'c:#8b6b4a', [[-1.0, 1.0]]);
      if (city) {
        ib.wall(2.6, -2.8, W / 2, -2.8, H, WALLS.white, [[4.4, 1.0]]);
        ib.wall(2.6, -D / 2, 2.6, -2.8, H, WALLS.white);
        ib.f('c:#ffffff', 4.6, 0, -4.6, 0.55, 0.5, 0.6); ib.f('c:#f1f5f9', 3.4, 0, -D / 2 + 0.45, 0.9, 0.85, 0.5);
        ib.f('glass:0.2', 3.4, 0.85, -D / 2 + 0.45, 0.9, 0.9, 0.04, false); ib.cyl('chrome', 4.6, 0.5, -4.6, 0.05, 0.4);
        ib.f('c:#e2e8f0', 5.0, 0, -3.4, 0.8, 0.9, 0.5, true); // стиральная машина
      } else {
        ib.wall(2.4, D / 2 - 3.6, W / 2, D / 2 - 3.6, H, 'c:#8b6b4a', [[3.6, 0.9]]);
        ib.f('c:#e7e5e4', -W / 2 + 0.9, 0, 1.0, 1.7, 1.9, 1.4); ib.f('c:#57534e', -W / 2 + 0.9, 1.9, 1.0, 0.4, 1.1, 0.4, false);
        ib.f('glow:#f59e0b', -W / 2 + 0.9, 0.45, 1.72, 0.7, 0.4, 0.02, false); // топка
        ib.cyl('c:#3f3f46', -W / 2 + 0.9, 3.0, 1.0, 0.12, 2.0); // труба
      }
      // спальня
      ib.bedAt(-W / 2 + 1.2, -D / 2 + 1.5, 1.5, 0, city ? '#e0e7ff' : '#fde68a');
      ib.f('c:#78350f', -W / 2 + 0.35, 0, -D / 2 + 3.6, 0.6, 1.8, 1.7);
      ib.rug(-W / 2 + 1.3, -D / 2 + 3.4, 2.4, 1.8, city ? '#94a3b8' : '#a16207');
      ib.painting(-W / 2 + 1.2, 2.1, -D / 2 + 0.12, 0, city ? '#0f766e' : '#b45309');
      // кухня-гостиная
      ib.fridgeAt(W / 2 - 0.45, -1.9, -Math.PI / 2);
      ib.kitchen(W / 2 - 0.35, 1.4, 2.4, Math.PI / 2);
      ib.table(0.4, -0.6, 3);
      ib.sofa(0.2, 2.6, 2.3, Math.PI, city ? '#475569' : '#7f1d1d');
      if (city) {
        ib.tv(-W / 2 + 0.15, -1.4, 1.2, Math.PI / 2);
        ib.pc(1.6, -D / 2 + 0.5, 0, 'homepc', 'Компьютер');
      }
      // подвал
      ib.f('c:#5b3a1e', 2.0, 0.005, 1.4, 1.0, 0.02, 1.0, false); ib.f('c:#3b2412', 2.0, 0.02, 1.4, 0.9, 0.01, 0.9, false);
      ib.f('chrome', 2.35, 0.03, 1.4, 0.12, 0.03, 0.04, false);
      ib.act(2.0, 1.4, 1.1, 'Спуститься в подвал', 'basement');
      ib.doorSpots['hatch'] = { x: ib.ox + 2.0, z: ib.oz + 0.5, a: Math.PI, y: 0 };
      ib.plant(-W / 2 + 0.6, D / 2 - 3.4);
      ib.window(-W / 2 + 0.15, 1.7, 3.0, 2.2, 1.2, Math.PI / 2);
      ib.window(W / 2 - 0.15, 1.7, -3.2, 2.2, 1.2, -Math.PI / 2);
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
    house: 'house_city', vhouse: 'house_village', vshop: 'vshop', vpharmacy: 'vpharmacy', vguntruck: 'vguntruck', vadmin: 'vadmin',
    checkpoint: 'checkpoint', fire: 'fire', gas: 'gas', depot: 'truckoffice', office: 'office', scootershop: 'scootershop', fishshop: 'fishshop',
  };
  void cls;
  return m[kind] ?? null;
}
