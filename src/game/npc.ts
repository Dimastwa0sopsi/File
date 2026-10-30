// Пешеходы: тротуары и переходы, деревни, пляж (день/ночь), реакции на удары
import * as THREE from 'three';
import { Character, type Pose } from './character';
import { type Look, SKINS, HAIR_COLORS, CLOTH_COLORS, EYE_COLORS } from './data';
import { CELL, ROAD_W, SIDEWALK, N, RNG, clamp, angleDiff } from './config';
import type { WorldLayout } from './worldgen';

export type PedKind = 'city' | 'village' | 'beach' | 'static' | 'vendor' | 'puppet';
export const POSE_CODES: Pose[] = ['idle', 'walk', 'run', 'lie', 'swim', 'shoot', 'dead', 'guard', 'jab', 'cross', 'hook', 'block', 'flinch', 'knock', 'sitbench', 'punch'];
export interface Ped {
  char: Character; kind: PedKind; x: number; z: number; y: number; a: number; speed: number;
  state: 'walk' | 'idle' | 'flee' | 'fight' | 'down' | 'lie' | 'swim' | 'leave' | 'gone' | 'stand' | 'hands' | 'knocked';
  stagger: number; atkT: number; atkKind: number; atkHit: boolean; blockT: number; knockT: number; combo: number; comboMax: number; strafe: number; hurtFlash: number;
  hp: number; phase: number; timer: number; tx: number; tz: number;
  // город: квартал и угол
  bi: number; bj: number; corner: number; crossing: boolean; waitAxisEW: boolean | null; crossNode: number;
  // деревня/пляж
  homeX: number; homeZ: number; spot: number; lineA?: { x: number; z: number }; lineB?: { x: number; z: number };
  attackCd: number; role?: string; brave: boolean; active: boolean;
  foe?: number; hitByMe?: number; dropped?: boolean; seed: number; uid: number; lastPose: Pose; lastPh: number; owner?: number; netT?: number; netPose?: number; netPh?: number; tx2?: number; tz2?: number; ta?: number;
}

const rng = new RNG(4242);
export function randomLook(swim = false, seed?: number): Look {
  const r = seed === undefined ? rng : new RNG(seed * 7919 + 13);
  const f = r.chance(0.5);
  return {
    gender: f ? 'f' : 'm', skin: r.pick(SKINS), hair: f ? r.pick(['long', 'bob', 'ponytail', 'bun']) : r.pick(['short', 'buzz', 'side', 'bald', 'short']),
    hairColor: r.pick(HAIR_COLORS.slice(0, 6)), top: swim ? 'swim' : f && r.chance(0.25) ? 'dress' : r.pick(['tshirt', 'hoodie', 'shirt', 'suit', 'tank']),
    topColor: r.pick(CLOTH_COLORS), bottom: swim ? (f ? 'swim' : 'shorts') : f && r.chance(0.3) ? 'skirt' : r.pick(['jeans', 'trousers', 'shorts']),
    bottomColor: r.pick(CLOTH_COLORS), shoes: r.pick(['#111', '#fff', '#78350f', '#1e3a8a']), eyes: r.pick(EYE_COLORS),
  };
}
const corner = (i: number, j: number, c: number) => {
  // углы тротуарного кольца: 0 NW,1 NE,2 SE,3 SW
  const x0 = i * CELL + ROAD_W / 2 + SIDEWALK / 2, z0 = j * CELL + ROAD_W / 2 + SIDEWALK / 2;
  const x1 = (i + 1) * CELL - ROAD_W / 2 - SIDEWALK / 2, z1 = (j + 1) * CELL - ROAD_W / 2 - SIDEWALK / 2;
  return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }][c];
};

export const POSE_HANDS = 'handsup';
const NPC_ATK: { pose: Pose; dur: number; hitAt: number; dmg: number; range: number; lunge: number }[] = [
  { pose: 'jab', dur: 0.42, hitAt: 0.45, dmg: 4.5, range: 1.35, lunge: 0.25 },
  { pose: 'cross', dur: 0.48, hitAt: 0.5, dmg: 6, range: 1.4, lunge: 0.3 },
  { pose: 'hook', dur: 0.75, hitAt: 0.55, dmg: 11, range: 1.35, lunge: 0.35 },
];
/** пересечение луча с вертикальным цилиндром; возвращает t или null */
export function rayCylinder(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number, h: number): number | null {
  const fx = ox - cx, fz = oz - cz;
  const a = dx * dx + dz * dz; if (a < 1e-9) return null;
  const b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c; if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) { if (t < 0) continue; const y = oy + dy * t - cy; if (y >= 0 && y <= h) return t; }
  return null;
}
export class PedSystem {
  onlineMode = false;
  onDeath: ((p: Ped, byPlayer: boolean) => void) | null = null;
  peds: Ped[] = [];
  group = new THREE.Group();
  L: WorldLayout;
  private dayBeach = true;
  constructor(L: WorldLayout) { this.L = L; }
  private uidN = 0;
  private make(kind: PedKind, look?: Look, seed?: number): Ped {
    const sd = seed ?? Math.floor(rng.next() * 1e6);
    const char = new Character(look ?? randomLook(kind === 'beach', sd));
    this.group.add(char.root);
    const p: Ped = { char, kind, x: 0, z: 0, y: 0, a: 0, speed: 1.3 + rng.next() * 0.5, state: 'walk', hp: 100, phase: rng.next() * 6, timer: 0, tx: 0, tz: 0, bi: 0, bj: 0, corner: 0, crossing: false, waitAxisEW: null, crossNode: -1, homeX: 0, homeZ: 0, spot: 0, attackCd: 0, brave: rng.chance(0.4), active: true, seed: sd, uid: this.uidN++, lastPose: 'idle', lastPh: 0, stagger: 0, atkT: 0, atkKind: 0, atkHit: false, blockT: 0, knockT: 0, combo: 0, comboMax: 2, strafe: rng.chance(0.5) ? 1 : -1, hurtFlash: 0 };
    this.peds.push(p);
    return p;
  }
  /** создать пул пешеходов */
  init(cityCount: number, playerX: number, playerZ: number) {
    for (let i = 0; i < cityCount; i++) { const p = this.make('city'); this.respawnCity(p, playerX, playerZ, true); }
    // деревни: по 3 жителя
    for (const v of this.L.villages) for (let k = 0; k < 3; k++) {
      const p = this.make('village');
      const L = Math.hypot(v.ex - v.sx, v.ez - v.sz); const nx = -(v.ez - v.sz) / L, nz = (v.ex - v.sx) / L;
      const side = k % 2 ? 4.8 : -4.8;
      p.lineA = { x: v.sx + nx * side + (v.ex - v.sx) * 0.1, z: v.sz + nz * side + (v.ez - v.sz) * 0.1 };
      p.lineB = { x: v.sx + nx * side + (v.ex - v.sx) * 0.9, z: v.sz + nz * side + (v.ez - v.sz) * 0.9 };
      const t = rng.next(); p.x = p.lineA.x + (p.lineB.x - p.lineA.x) * t; p.z = p.lineA.z + (p.lineB.z - p.lineA.z) * t;
      p.tx = k % 3 === 0 ? p.lineA.x : p.lineB.x; p.tz = k % 3 === 0 ? p.lineA.z : p.lineB.z; p.speed = 1.1;
    }
    // пляж: много отдыхающих
    const b = this.L.beach;
    for (let k = 0; k < 26; k++) {
      const p = this.make('beach');
      const mode = k % 4; // 0 лежит, 1 стоит, 2 гуляет, 3 плавает
      p.homeX = mode === 3 ? b.x0 - 4 - rng.next() * 10 : b.x0 + 10 + rng.next() * (b.x1 - b.x0 - 20);
      p.homeZ = b.z0 + 15 + rng.next() * (b.z1 - b.z0 - 30);
      p.spot = mode; p.x = p.homeX; p.z = p.homeZ; p.a = rng.next() * 6;
      p.state = mode === 0 ? 'lie' : mode === 1 ? 'stand' : mode === 3 ? 'swim' : 'walk';
      p.tx = p.homeX; p.tz = p.homeZ + 30; p.speed = 1.0;
    }
  }
  addQuest(look: Look, x: number, z: number, a: number, role: string, brave = false) { const p = this.make('vendor', look); p.x = x; p.z = z; p.a = a; p.homeX = x; p.homeZ = z; p.y = 0.15; p.role = role; p.state = brave ? 'fight' : 'stand'; p.brave = brave; p.attackCd = 1; return p; }
  initVendors() {
    for (const v of this.L.vendors) { const p = this.make('vendor'); p.x = v.x; p.z = v.z; p.a = v.a; p.homeX = v.x; p.homeZ = v.z; p.state = 'stand'; p.role = 'vendor'; p.y = 0.15; }
  }
  addStatic(look: Look, x: number, z: number, a: number, role: string, y = 0) {
    const p = this.make('static', look); p.x = x; p.z = z; p.a = a; p.y = y; p.state = 'stand'; p.role = role; p.homeX = x; p.homeZ = z;
    return p;
  }
  removePed(p: Ped) { p.char.dispose(); this.peds.splice(this.peds.indexOf(p), 1); }
  respawnCity(p: Ped, px: number, pz: number, initial = false) {
    // квартал рядом с игроком, но вне непосредственной видимости (кроме первичного)
    for (let tries = 0; tries < 12; tries++) {
      const ci = clamp(Math.floor(px / CELL) + rng.int(-3, 3), 0, N - 1), cj = clamp(Math.floor(pz / CELL) + rng.int(-3, 3), 0, N - 1);
      const c = rng.int(0, 3);
      const pt = corner(ci, cj, c), nx = corner(ci, cj, (c + 1) % 4);
      const t = rng.next();
      const x = pt.x + (nx.x - pt.x) * t, z = pt.z + (nx.z - pt.z) * t;
      const d = Math.hypot(x - px, z - pz);
      if (!initial && d < 45) continue;
      p.bi = ci; p.bj = cj; p.corner = (c + 1) % 4; p.x = x; p.z = z; p.tx = nx.x; p.tz = nx.z;
      p.state = 'walk'; p.hp = 100; p.crossing = false; p.stagger = 0; p.atkT = 0; p.knockT = 0; p.blockT = 0; p.waitAxisEW = null; p.y = 0.15; p.char.root.visible = true;
      return;
    }
  }
  /** дневной цикл пляжа */
  setBeachDay(day: boolean) {
    if (day === this.dayBeach) return;
    this.dayBeach = day;
    for (const p of this.peds) if (p.kind === 'beach') {
      if (!day) { p.state = 'leave'; p.tx = -165; p.tz = 480 + (rng.next() - 0.5) * 20; }
      else { p.char.root.visible = true; p.x = -165; p.z = 480; p.state = 'walk'; p.tx = p.homeX; p.tz = p.homeZ; p.timer = -1; }
    }
  }
  update(dt: number, t: number, ctx: { px: number; pz: number; py: number; playerVisible: boolean; lightState: (node: number, ew: boolean) => string; hitPlayer: (dmg: number, fx: number, fz: number, heavy: boolean) => boolean; foePos?: (id: number) => { x: number; z: number } | null; suppress?: (x: number, z: number) => boolean; hitFoe?: (id: number, dmg: number, fx: number, fz: number, heavy: boolean) => void; inside: boolean; viewDist: number; obstacles: (x: number, z: number) => boolean; vehicles: { x: number; z: number; speed: number; r: number; mine?: boolean }[] }) {
    for (const p of this.peds) {
      if (p.state === 'gone') { p.char.root.visible = false; continue; }
      if (this.onlineMode && p.kind !== 'puppet' && p.role !== 'police') { p.active = false; p.char.root.visible = false; continue; }
      const far = Math.abs(p.x - ctx.px) + Math.abs(p.z - ctx.pz);
      if (p.kind === 'static') { p.active = ctx.inside; } else if (p.kind === 'puppet') { p.active = !ctx.inside && performance.now() - (p.netT ?? 0) < 3000; } else p.active = !ctx.inside;
      if (!p.active) { p.char.root.visible = false; continue; }
      if (p.kind !== 'puppet' && p.kind !== 'static' && ctx.suppress?.(p.x, p.z)) { p.active = false; p.char.root.visible = false; continue; }
      if (p.kind === 'city' && far > 260) { this.respawnCity(p, ctx.px, ctx.pz); continue; }
      const visible = far < Math.min(ctx.viewDist, 140);
      p.char.root.visible = visible;
      if (p.kind === 'puppet') { this.updatePuppet(p, dt, t, visible); continue; }
      if (far > 220 && p.kind !== 'city') continue; // далеко — не обновляем
      p.attackCd -= dt;
      let moving = false; let pose: Pose = 'idle'; let ph = -1; let mv = 0;
      const toward = (tx: number, tz: number, sp: number) => {
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        if (d < 0.05) return d;
        const want = Math.atan2(dx, dz);
        p.a += clamp(angleDiff(p.a, want), -6 * dt, 6 * dt);
        const step = Math.min(d, sp * dt);
        const nx = p.x + Math.sin(p.a) * step, nz = p.z + Math.cos(p.a) * step;
        if (!ctx.obstacles(nx, nz) || p.kind === 'static') { p.x = nx; p.z = nz; }
        else { p.a += 1.2; }
        moving = true; return d;
      };
      // удар машиной
      if (p.state !== 'down' && p.kind !== 'static') for (const v of ctx.vehicles) {
        if (Math.abs(v.speed) > 4 && Math.hypot(v.x - p.x, v.z - p.z) < v.r + 0.4) { p.state = 'down'; p.timer = 12; p.hp = 0; p.atkT = 0; this.onDeath?.(p, !!v.mine); break; }
      }
      switch (p.state) {
        case 'walk': {
          if (p.kind === 'city' && p.waitAxisEW !== null) pose = 'idle';
          if (p.kind === 'city') {
            if (p.waitAxisEW !== null) { p.timer -= dt; if (p.timer <= 0) p.waitAxisEW = null; break; }
            const d = toward(p.tx, p.tz, p.speed);
            if (p.crossing) {
              if (d < 0.3) { p.crossing = false; }
            } else if (d < 0.3) this.nextCity(p, ctx);
          } else if (p.kind === 'village' && p.lineA && p.lineB) {
            const d = toward(p.tx, p.tz, p.speed);
            if (d < 0.3) { const atA = Math.hypot(p.tx - p.lineA.x, p.tz - p.lineA.z) < 1; p.tx = atA ? p.lineB.x : p.lineA.x; p.tz = atA ? p.lineB.z : p.lineA.z; p.state = 'idle'; p.timer = 3 + rng.next() * 4; }
          } else if (p.kind === 'beach') {
            const d = toward(p.tx, p.tz, p.speed);
            if (d < 0.4) {
              if (p.timer === -1) { p.timer = 0; p.state = p.spot === 0 ? 'lie' : p.spot === 1 ? 'stand' : p.spot === 3 ? 'swim' : 'walk'; p.tx = p.homeX; p.tz = p.homeZ + (p.tz > p.homeZ ? -30 : 30); }
              else { p.tz = p.tz > p.homeZ ? p.homeZ - 30 : p.homeZ + 30; }
            }
          }
          pose = 'walk';
          if (p.waitAxisEW !== null) { moving = false; pose = 'idle'; }
          break;
        }
        case 'idle': p.timer -= dt; if (p.timer <= 0) p.state = 'walk'; break;
        case 'stand': pose = 'idle'; break;
        case 'lie': pose = 'lie'; break;
        case 'swim': pose = 'swim'; p.phase += dt * 3; break;
        case 'hands': pose = 'handsup'; p.timer -= dt; if (p.timer <= 0) p.state = 'stand'; break;
        case 'leave': { const d = toward(p.tx, p.tz, 1.4); pose = 'walk'; if (d < 0.5) { p.state = 'gone'; p.char.root.visible = false; } break; }
        case 'flee': {
          const ff = p.foe !== undefined ? ctx.foePos?.(p.foe) ?? null : null;
          const ax = p.x - (ff ? ff.x : ctx.px), az = p.z - (ff ? ff.z : ctx.pz), l = Math.hypot(ax, az) || 1;
          toward(p.x + (ax / l) * 5, p.z + (az / l) * 5, 5.2); pose = 'run';
          p.timer -= dt; if (p.timer <= 0) { p.state = p.kind === 'static' || p.kind === 'vendor' ? 'stand' : 'walk'; if (p.kind === 'static' || p.kind === 'vendor') { p.x = p.homeX; p.z = p.homeZ; } else if (p.kind === 'city') this.respawnCity(p, ctx.px, ctx.pz, true); }
          break;
        }
        case 'fight': {
          const fp = p.foe !== undefined ? ctx.foePos?.(p.foe) ?? null : null;
          if (p.foe !== undefined && !fp) p.foe = undefined;
          const tgx = fp ? fp.x : ctx.px, tgz = fp ? fp.z : ctx.pz;
          const dx = tgx - p.x, dz = tgz - p.z, d = Math.hypot(dx, dz) || 0.01;
          const face = Math.atan2(dx, dz);
          if (d > 30 || (!fp && !ctx.playerVisible)) { p.state = p.kind === 'static' || p.kind === 'vendor' ? 'stand' : 'walk'; p.atkT = 0; break; }
          if (p.hp < 25 && !p.brave && p.role !== 'police') { p.state = 'flee'; p.timer = 8; p.atkT = 0; break; }
          if (p.stagger > 0) { p.stagger -= dt; pose = 'flinch'; ph = 1 - p.stagger / 0.35; break; }
          if (p.atkT > 0) {
            const A = NPC_ATK[p.atkKind]; p.atkT -= dt; const prog = 1 - p.atkT / A.dur;
            pose = A.pose; ph = prog;
            p.a += clamp(angleDiff(p.a, face), -4 * dt, 4 * dt);
            if (prog < 0.5) { const st = A.lunge * dt / (A.dur * 0.5); const nx = p.x + Math.sin(p.a) * st, nz = p.z + Math.cos(p.a) * st; if (d > 0.75 && !ctx.obstacles(nx, nz)) { p.x = nx; p.z = nz; } }
            if (!p.atkHit && prog >= A.hitAt) {
              p.atkHit = true;
              if (d < A.range && Math.abs(angleDiff(p.a, face)) < 0.9) { const dm = A.dmg * (0.85 + rng.next() * 0.3); if (fp && p.foe !== undefined) ctx.hitFoe?.(p.foe, dm, p.x, p.z, p.atkKind === 2); else ctx.hitPlayer(dm, p.x, p.z, p.atkKind === 2); }
            }
            break;
          }
          if (p.blockT > 0) { p.blockT -= dt; pose = 'block'; p.a += clamp(angleDiff(p.a, face), -6 * dt, 6 * dt); break; }
          p.a += clamp(angleDiff(p.a, face), -6 * dt, 6 * dt);
          if (d > 1.15) {
            const sp = d > 4 ? 3.6 : 1.8;
            const nx = p.x + (dx / d) * sp * dt, nz = p.z + (dz / d) * sp * dt;
            if (!ctx.obstacles(nx, nz)) { p.x = nx; p.z = nz; } else p.strafe *= -1;
            moving = true; pose = d > 4 ? 'run' : 'guard'; mv = 1; if (pose === 'run') ph = -1;
          } else {
            // кружит вокруг цели
            const sx = (-dz / d) * p.strafe * 0.7 * dt, sz = (dx / d) * p.strafe * 0.7 * dt;
            if (!ctx.obstacles(p.x + sx, p.z + sz)) { p.x += sx; p.z += sz; } else p.strafe *= -1;
            if (d < 0.7) { p.x -= (dx / d) * 0.6 * dt; p.z -= (dz / d) * 0.6 * dt; }
            pose = 'guard'; mv = 0.5; moving = true;
            if (rng.chance(dt * 0.3)) p.strafe *= -1;
            if (p.attackCd <= 0) {
              p.atkKind = p.combo >= p.comboMax - 1 ? 2 : p.combo % 2;
              p.atkT = NPC_ATK[p.atkKind].dur; p.atkHit = false; p.combo++;
              if (p.atkKind === 2) { p.combo = 0; p.comboMax = 2 + rng.int(0, 2); p.attackCd = 1.4 + rng.next() * 1.0; }
              else p.attackCd = NPC_ATK[p.atkKind].dur + 0.12 + rng.next() * 0.25;
            }
          }
          break;
        }
        case 'knocked': {
          p.knockT -= dt;
          const total = 2.4;
          const el = total - p.knockT;
          pose = 'knock'; ph = p.knockT < 0.45 ? p.knockT / 0.45 : Math.min(1, el / 0.25);
          if (p.knockT <= 0) { p.state = p.brave || p.role === 'police' ? 'fight' : 'flee'; p.timer = 8; p.attackCd = 0.6; }
          break;
        }
        case 'down': { pose = 'dead'; p.timer -= dt; if (p.timer <= 0) { if (p.kind === 'city') this.respawnCity(p, ctx.px, ctx.pz); else { p.state = p.kind === 'static' || p.kind === 'vendor' || p.kind === 'beach' ? 'stand' : 'walk'; p.hp = 100; if (p.kind === 'static' || p.kind === 'vendor') { p.x = p.homeX; p.z = p.homeZ; } } } break; }
      }
      if (moving && pose === 'walk') p.phase += dt * p.speed * 4.2;
      if (moving && pose === 'run') p.phase += dt * 11;
      if (moving && pose === 'guard') p.phase += dt * 7;
      if (visible) {
        p.char.root.position.set(p.x, p.y + (p.kind === 'beach' && p.state === 'lie' ? 0.12 : 0), p.z);
        p.char.root.rotation.y = p.a;
        p.char.pose(pose, t + p.phase, ph >= 0 ? ph : p.phase, 0, mv);
      }
      p.lastPose = pose; p.lastPh = ph >= 0 ? ph : p.phase;
    }
  }
  private nextCity(p: Ped, ctx: { lightState: (node: number, ew: boolean) => string }) {
    // на углу: продолжить по кольцу или перейти улицу по зебре
    const c = p.corner;
    if (rng.chance(0.35)) {
      // переход: из угла c в соседний квартал
      const opts: { di: number; dj: number; nc: number; ew: boolean; node: [number, number] }[] = [];
      const i = p.bi, j = p.bj;
      // угол 0 (NW): на север (j-1, угол 3) — пересекаем дорогу вдоль X (движение EW); на запад (i-1, угол 1) — дорога вдоль Z
      if (c === 0) { opts.push({ di: 0, dj: -1, nc: 3, ew: true, node: [i, j] }, { di: -1, dj: 0, nc: 1, ew: false, node: [i, j] }); }
      if (c === 1) { opts.push({ di: 0, dj: -1, nc: 2, ew: true, node: [i + 1, j] }, { di: 1, dj: 0, nc: 0, ew: false, node: [i + 1, j] }); }
      if (c === 2) { opts.push({ di: 0, dj: 1, nc: 1, ew: true, node: [i + 1, j + 1] }, { di: 1, dj: 0, nc: 3, ew: false, node: [i + 1, j + 1] }); }
      if (c === 3) { opts.push({ di: 0, dj: 1, nc: 0, ew: true, node: [i, j + 1] }, { di: -1, dj: 0, nc: 2, ew: false, node: [i, j + 1] }); }
      const valid = opts.filter((o) => i + o.di >= 0 && i + o.di < N && j + o.dj >= 0 && j + o.dj < N);
      if (valid.length) {
        const o = rng.pick(valid);
        const nodeId = o.node[1] * (N + 1) + o.node[0];
        const node = this.L.nodes[nodeId];
        // пешеход идёт, когда для машин, пересекающих зебру, горит красный
        if (node.light) {
          const st = ctx.lightState(nodeId, o.ew);
          if (st !== 'red') { p.waitAxisEW = o.ew; p.crossNode = nodeId; p.timer = 1.5; return; }
        }
        p.waitAxisEW = null;
        p.bi = i + o.di; p.bj = j + o.dj; p.corner = o.nc;
        const tgt = corner(p.bi, p.bj, o.nc); p.tx = tgt.x; p.tz = tgt.z; p.crossing = true;
        return;
      }
    }
    p.corner = (c + 1) % 4;
    const nx = corner(p.bi, p.bj, p.corner); p.tx = nx.x; p.tz = nx.z;
    if (rng.chance(0.08)) { p.state = 'idle'; p.timer = 2 + rng.next() * 3; }
  }
  /** ближайшая цель для удара в секторе перед игроком */
  target(px: number, pz: number, a: number, range: number, cone: number): Ped | null {
    let best: Ped | null = null, bs = Infinity;
    for (const p of this.peds) {
      if (!p.active || p.state === 'gone' || p.state === 'down' || !p.char.root.visible) continue;
      const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz);
      if (d > range) continue;
      const ad = Math.abs(angleDiff(a, Math.atan2(dx, dz)));
      if (ad > cone) continue;
      const score = d + ad * 1.5;
      if (score < bs) { bs = score; best = p; }
    }
    return best;
  }
  /** игрок начал атаку — бойцы рядом могут поставить блок */
  onPlayerAttack(px: number, pz: number) {
    for (const p of this.peds) if (p.state === 'fight' && p.atkT <= 0 && p.stagger <= 0 && Math.hypot(p.x - px, p.z - pz) < 2.2 && rng.chance(p.brave ? 0.35 : 0.2)) p.blockT = 0.45 + rng.next() * 0.25;
  }
  /** урон NPC; возвращает результат */
  damage(p: Ped, dmg: number, fx: number, fz: number, o: { heavy?: boolean; gun?: boolean; obstacles?: (x: number, z: number) => boolean; foe?: number } = {}): 'blocked' | 'hit' | 'knocked' | 'down' {
    if (p.state === 'down') return 'down';
    p.foe = o.foe;
    const dx = p.x - fx, dz = p.z - fz, l = Math.hypot(dx, dz) || 1;
    const facing = Math.abs(angleDiff(p.a, Math.atan2(-dx, -dz))) < 1.2;
    let res: 'blocked' | 'hit' | 'knocked' | 'down' = 'hit';
    if (!o.gun && p.blockT > 0 && facing) { dmg *= 0.2; res = 'blocked'; }
    p.hp -= dmg; p.hurtFlash = 0.2;
    // отброс
    const push = res === 'blocked' ? 0.15 : o.heavy ? 0.7 : 0.3;
    const nx = p.x + (dx / l) * push, nz = p.z + (dz / l) * push;
    if (!o.obstacles || !o.obstacles(nx, nz)) { p.x = nx; p.z = nz; }
    if (p.state === 'lie' || p.state === 'swim' || p.state === 'stand' || p.state === 'hands') p.y = p.kind === 'static' ? p.y : p.y;
    if (p.hp <= 0) { p.state = 'down'; p.timer = 20; p.atkT = 0; this.onDeath?.(p, o.foe === undefined); this.panic(p.x, p.z, o.gun ? 30 : 10, p); return 'down'; }
    if (res !== 'blocked') {
      p.atkT = 0; p.blockT = 0;
      if (o.heavy && (p.hp < 55 || rng.chance(0.35)) && p.state !== 'knocked') { p.state = 'knocked'; p.knockT = 2.4; res = 'knocked'; }
      else p.stagger = 0.35;
    }
    if (p.state !== 'knocked') {
      const fight = p.role === 'police' || (!o.gun && p.brave && p.role !== 'cashier' && p.role !== 'customer');
      if (p.state !== 'fight' || !fight) { p.state = fight ? 'fight' : 'flee'; p.timer = 8; p.attackCd = 0.5 + rng.next() * 0.4; }
    }
    this.panic(p.x, p.z, o.gun ? 30 : 10, p);
    return res;
  }
  /** паника свидетелей */
  panic(x: number, z: number, r: number, except?: Ped) {
    for (const o of this.peds) {
      if (o === except || !o.active || o.state === 'down' || o.state === 'knocked' || o.state === 'fight' || o.state === 'gone') continue;
      if (Math.hypot(o.x - x, o.z - z) > r) continue;
      if (r > 15 || !o.brave) { o.state = 'flee'; o.timer = 6 + rng.next() * 4; }
    }
  }
  /** луч выстрела: вертикальный цилиндр персонажа; head — попадание в голову */
  shoot(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number, minD = 0): { ped: Ped; d: number; head: boolean } | null {
    let best: { ped: Ped; d: number; head: boolean } | null = null;
    for (const p of this.peds) {
      if (!p.active || p.state === 'gone' || !p.char.root.visible) continue;
      const lying = p.state === 'down' || p.state === 'lie' || (p.state === 'knocked' && p.knockT > 0.45);
      const h = lying ? 0.45 : p.state === 'swim' ? 0.6 : 1.8;
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, p.x, p.y, p.z, lying ? 0.55 : 0.32, h);
      if (t === null || t < minD || t > maxD) continue;
      if (!best || t < best.d) best = { ped: p, d: t, head: !lying && oy + dy * t - p.y > 1.48 };
    }
    return best;
  }
  // ---------- синхронизация NPC по сети ----------
  /** снимок своих NPC для отправки: [uid, x, z, a, pose, phase, seed, kind] */
  snapshot(px: number, pz: number, r: number): number[][] {
    const out: number[][] = [];
    for (const p of this.peds) {
      if (p.kind === 'puppet' || p.kind === 'static' || p.state === 'gone' || !p.active) continue;
      if (Math.abs(p.x - px) + Math.abs(p.z - pz) > r) continue;
      out.push([p.uid, Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, Math.round(p.a * 100) / 100, Math.max(0, POSE_CODES.indexOf(p.lastPose)), Math.round(p.lastPh * 100) / 100, p.seed, p.kind === 'beach' ? 2 : p.kind === 'vendor' ? 3 : 0]);
      if (out.length >= 36) break;
    }
    return out;
  }
  private puppets = new Map<string, Ped>();
  /** применить снимок NPC другого игрока */
  applySnapshot(owner: number, list: number[][]) {
    const now = performance.now(); const seen = new Set<string>();
    for (const r of list) {
      if (!Array.isArray(r) || r.length < 8) continue;
      const [uid, x, z, a, pc, ph, seed, kc] = r;
      if (![x, z, a].every(Number.isFinite)) continue;
      const key = owner + ':' + uid; seen.add(key);
      let p = this.puppets.get(key);
      if (!p || p.seed !== seed) {
        if (p) this.removePed(p);
        p = this.make('puppet', randomLook(kc === 2, seed), seed);
        p.owner = owner; p.uid = uid; p.x = x; p.z = z; p.a = a; p.y = 0.15; p.role = kc === 3 ? 'vendor' : undefined;
        this.puppets.set(key, p);
      }
      p.tx2 = x; p.tz2 = z; p.ta = a; p.netPose = pc; p.netPh = ph; p.netT = now;
    }
    for (const [key, p] of this.puppets) if (p.owner === owner && !seen.has(key)) { this.removePed(p); this.puppets.delete(key); }
  }
  removeOwner(owner: number) { for (const [key, p] of this.puppets) if (p.owner === owner) { this.removePed(p); this.puppets.delete(key); } }
  clearPuppets() { for (const p of this.puppets.values()) this.removePed(p); this.puppets.clear(); }
  byUid(uid: number) { return this.peds.find((p) => p.uid === uid && p.kind !== 'puppet') ?? null; }
  private updatePuppet(p: Ped, dt: number, t: number, visible: boolean) {
    const k = Math.min(1, dt * 8);
    if (Math.hypot((p.tx2 ?? p.x) - p.x, (p.tz2 ?? p.z) - p.z) > 15) { p.x = p.tx2 ?? p.x; p.z = p.tz2 ?? p.z; }
    p.x += ((p.tx2 ?? p.x) - p.x) * k; p.z += ((p.tz2 ?? p.z) - p.z) * k; p.a += angleDiff(p.a, p.ta ?? p.a) * k;
    const pose = POSE_CODES[p.netPose ?? 0] ?? 'idle';
    if (pose === 'dead') { if (!p.dropped && p.hitByMe && performance.now() - p.hitByMe < 4000) { p.dropped = true; this.onDeath?.(p, true); } } else p.dropped = false;
    p.state = pose === 'dead' ? 'down' : pose === 'knock' ? 'knocked' : pose === 'lie' ? 'lie' : pose === 'swim' ? 'swim' : 'walk';
    p.knockT = pose === 'knock' ? 1 : 0;
    const legs = pose === 'walk' || pose === 'run' || pose === 'guard';
    if (legs) p.phase += dt * (pose === 'run' ? 11 : 6);
    if (visible) {
      p.char.root.position.set(p.x, p.y + (pose === 'lie' ? 0.12 : 0), p.z); p.char.root.rotation.y = p.a;
      p.char.pose(pose, t, legs ? p.phase : p.netPh ?? 0, 0, pose === 'guard' ? 1 : 0);
    }
  }
  clearStatic() { for (const p of [...this.peds]) if (p.kind === 'static') this.removePed(p); }
  dispose() { for (const p of this.peds) p.char.dispose(); this.peds = []; this.group.parent?.remove(this.group); }
}
