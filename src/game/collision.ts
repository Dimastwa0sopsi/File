// Пространственная сетка коллизий (AABB), высота пола, выталкивание, лучи
import type { Box } from './worldgen';

export class Collision {
  private cell: number;
  private grid = new Map<number, Box[]>();
  private stamp = 0;
  private marks = new WeakMap<Box, number>();
  dynamic: Box[] = [];
  constructor(boxes: Box[], cell = 16) {
    this.cell = cell;
    for (const b of boxes) this.insert(b);
  }
  private key(ix: number, iz: number) { return (ix + 4096) * 8192 + (iz + 4096); }
  insert(b: Box) {
    const c = this.cell;
    for (let ix = Math.floor(b.x0 / c); ix <= Math.floor(b.x1 / c); ix++)
      for (let iz = Math.floor(b.z0 / c); iz <= Math.floor(b.z1 / c); iz++) {
        const k = this.key(ix, iz); let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(b);
      }
  }
  query(x: number, z: number, r: number, out: Box[] = []): Box[] {
    out.length = 0;
    const c = this.cell; this.stamp++;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++)
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const arr = this.grid.get(this.key(ix, iz)); if (!arr) continue;
        for (const b of arr) { if (this.marks.get(b) === this.stamp) continue; this.marks.set(b, this.stamp); if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) out.push(b); }
      }
    for (const b of this.dynamic) if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) out.push(b);
    return out;
  }
  private tmp: Box[] = [];
  /** высота опоры под точкой (с учётом ступеньки) */
  groundAt(x: number, z: number, feetY: number, step = 0.5, r = 0.2): number {
    let g = 0;
    for (const b of this.query(x, z, r, this.tmp)) if (b.y1 <= feetY + step && b.y1 > g) g = b.y1;
    return g;
  }
  /** вытолкнуть круг из стен; возвращает нормаль удара (или null) */
  pushCircle(p: { x: number; z: number }, r: number, feetY: number, height: number, step = 0.5): { nx: number; nz: number; depth: number } | null {
    let hit: { nx: number; nz: number; depth: number } | null = null;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.query(p.x, p.z, r, this.tmp)) {
        if (b.y1 <= feetY + step || b.y0 >= feetY + height) continue;
        const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
        let dx = p.x - cx, dz = p.z - cz; let d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d < 1e-4) { // центр внутри — выталкиваем к ближайшей грани
          const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bt = b.z1 - p.z; const m = Math.min(l, rr, t, bt);
          if (m === l) { dx = -1; dz = 0; d = 0; p.x = b.x0 - r; } else if (m === rr) { dx = 1; dz = 0; p.x = b.x1 + r; } else if (m === t) { dx = 0; dz = -1; p.z = b.z0 - r; } else { dx = 0; dz = 1; p.z = b.z1 + r; }
          hit = { nx: dx, nz: dz, depth: r }; continue;
        }
        const push = r - d; dx /= d; dz /= d;
        p.x += dx * push; p.z += dz * push;
        if (!hit || push > hit.depth) hit = { nx: dx, nz: dz, depth: push };
      }
    }
    return hit;
  }
  /** проверка точки внутри твёрдого объёма */
  solidAt(x: number, y: number, z: number): boolean {
    for (const b of this.query(x, z, 0.01, this.tmp)) if (y > b.y0 && y < b.y1 && b.y1 - b.y0 > 0.5) return true;
    return false;
  }
  /** луч: расстояние до первого пересечения (или maxD) */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number): number {
    let best = maxD;
    const steps = Math.ceil(maxD / (this.cell * 0.5));
    this.stamp++;
    const seen = new Set<Box>();
    for (let s = 0; s <= steps; s++) {
      const t = (s / steps) * maxD;
      const px = ox + dx * t, pz = oz + dz * t;
      for (const b of this.query(px, pz, this.cell * 0.5, this.tmp)) {
        if (seen.has(b)) continue; seen.add(b);
        if (b.y1 - b.y0 < 0.3 && b.y1 < 0.4) continue;
        const h = rayBox(ox, oy, oz, dx, dy, dz, b);
        if (h >= 0 && h < best) best = h;
      }
      if (t > best) break;
    }
    return best;
  }
}
export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box): number {
  let tmin = -Infinity, tmax = Infinity;
  const ax: [number, number, number, number][] = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for (const [o, d, lo, hi] of ax) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}
