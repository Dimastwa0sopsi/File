// Модели транспорта: детальные, с отрываемыми деталями и тюнингом
import * as THREE from 'three';
import { T, M, Batcher } from './geom';
import { VEHICLES, type VSpec, type Tuning, defaultTuning } from './data';
import { mat } from './textures';

interface Item { mat: string; tpl: THREE.BufferGeometry; m: THREE.Matrix4 }
export interface Part { name: string; items: Item[]; detachable: boolean; attached: boolean; center: THREE.Vector3 }

const profileCache = new Map<string, THREE.BufferGeometry>();
/** выдавленный боковой профиль кузова: z∈[-0.5,0.5], y∈[0,1], ширина x∈[-0.5,0.5] */
function profile(key: string, pts: [number, number][]) {
  let g = profileCache.get(key);
  if (g) return g;
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  const e = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  e.translate(0, 0, -0.5); e.rotateY(-Math.PI / 2);
  g = e.index ? e.toNonIndexed() : e;
  profileCache.set(key, g);
  return g;
}

const wheelCache = new Map<string, THREE.BufferGeometry>();
const wheelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function wheelGeo(r: number, w: number, rim: string, style: number) {
  const key = `${r}|${w}|${rim}|${style}`;
  let g = wheelCache.get(key); if (g) return g;
  const parts: { geo: THREE.BufferGeometry; m: THREE.Matrix4; c: THREE.Color }[] = [];
  const tire = new THREE.Color('#1b1b1b'), rc = new THREE.Color(rim), hub = new THREE.Color('#555');
  parts.push({ geo: T.cyl16, m: M(0, 0, 0, 0, r, w, r, 0, Math.PI / 2).clone(), c: tire });
  parts.push({ geo: T.cyl16, m: M(0, 0, 0, 0, r * 0.62, w + 0.02, r * 0.62, 0, Math.PI / 2).clone(), c: rc });
  const spokes = style === 2 ? 8 : style === 1 ? 6 : 5;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    for (const sx of [1, -1]) parts.push({ geo: T.box, m: M((w / 2 + 0.015) * sx, -Math.sin(a) * r * 0.3, Math.cos(a) * r * 0.3, 0, 0.02, r * 0.12, r * 0.6, a).clone(), c: style === 3 ? hub : rc });
  }
  parts.push({ geo: T.cyl, m: M(0, 0, 0, 0, r * 0.18, w + 0.06, r * 0.18, 0, Math.PI / 2).clone(), c: hub });
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const p of parts) {
    const P = p.geo.getAttribute('position'), Nn = p.geo.getAttribute('normal');
    nm.getNormalMatrix(p.m);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(p.m); n.fromBufferAttribute(Nn, i).applyMatrix3(nm).normalize();
      pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); col.push(p.c.r, p.c.g, p.c.b);
    }
  }
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  wheelCache.set(key, g);
  return g;
}

export interface SeatInfo { x: number; y: number; z: number; pose: 'drive' | 'ride' | 'passenger' | 'scoot' | 'ridepass'; scale: number }
const RIM_COLORS = ['#c0c0c0', '#202020', '#d4af37', '#e5e7eb'];

export class VehicleModel {
  group = new THREE.Group();
  body = new THREE.Group();
  meshes: THREE.Mesh[] = [];
  wheels: THREE.Object3D[] = [];
  frontWheels: THREE.Object3D[] = [];
  parts: Part[] = [];
  rotor: THREE.Object3D | null = null;
  tailRotor: THREE.Object3D | null = null;
  reel: THREE.Object3D | null = null;
  driver: SeatInfo; passenger: SeatInfo; extraSeats: SeatInfo[] = [];
  get seats(): SeatInfo[] { return [this.driver, this.passenger, ...this.extraSeats]; }
  wheelR = 0.33;
  neon: THREE.Mesh | null = null;
  headGlow: string[] = [];
  spec: VSpec; color: string; tuning: Tuning;
  private cur!: Part;
  private steerHandle: THREE.Object3D | null = null;
  lightsOn = false;
  private sirenMeshes: THREE.Mesh[] = [];
  constructor(type: string, color?: string, tuning?: Tuning) {
    this.spec = VEHICLES[type] ?? VEHICLES.lada;
    this.color = color ?? this.spec.colors[0];
    this.tuning = tuning ?? defaultTuning();
    this.group.add(this.body);
    this.driver = { x: 0.36, y: 0.55, z: 0, pose: 'drive', scale: 0.92 };
    this.passenger = { x: -0.36, y: 0.55, z: -1, pose: 'passenger', scale: 0.92 };
    this.construct();
    this.rebuild();
    if (this.spec.body !== 'heli' && this.spec.body !== 'scooter') {
      const blob = new THREE.Mesh(T.plane, mat('blob'));
      blob.rotation.x = -Math.PI / 2; blob.scale.set(this.spec.wid + 0.7, this.spec.len + 0.6, 1); blob.position.y = 0.04; blob.renderOrder = 1;
      this.group.add(blob);
    }
  }
  // ---------- построение деталей ----------
  private part(name: string, detachable = true) { this.cur = { name, items: [], detachable, attached: true, center: new THREE.Vector3() }; this.parts.push(this.cur); return this.cur; }
  private add(matKey: string, tpl: THREE.BufferGeometry, m: THREE.Matrix4) { this.cur.items.push({ mat: matKey, tpl, m: m.clone() }); }
  private box(mk: string, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) { this.add(mk, T.box, M(x, y, z, ry, w, h, d, rx, rz)); }
  private cyl(mk: string, x: number, y: number, z: number, r: number, len: number, axis: 'x' | 'y' | 'z') {
    this.add(mk, T.cyl, axis === 'y' ? M(x, y, z, 0, r, len, r) : axis === 'x' ? M(x, y, z, 0, r, len, r, 0, Math.PI / 2) : M(x, y, z, 0, r, len, r, Math.PI / 2));
  }
  private glassPane(x: number, y0: number, z0: number, y1: number, z1: number, w: number) {
    const dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dy, dz);
    this.add('GLASS', T.plane, M(x, (y0 + y1) / 2, (z0 + z1) / 2, 0, w, len, 1, Math.atan2(dz, dy)));
  }
  private sideGlass(x: number, y0: number, y1: number, z0: number, z1: number) {
    this.add('GLASS', T.plane, M(x, (y0 + y1) / 2, (z0 + z1) / 2, Math.PI / 2, Math.abs(z1 - z0), y1 - y0, 1));
  }
  private construct() {
    this.extraSeats = [];
    const s = this.spec;
    const PAINT = 'PAINT', DARK = 'c:#1f2024', TRIM = 'TRIM', HEAD = 'HEAD', TAIL = 'glow:#ff1a1a', INT = 'c:#2b2b2e', PLATE = 'c:#f1f1f1';
    const L = s.len, W = s.wid, H = s.hei;
    if (s.body === 'moto') return this.buildMoto();
    if (s.body === 'scooter') return this.buildScooter();
    if (s.body === 'quad') return this.buildQuad();
    if (s.body === 'heli') return this.buildHeli();
    if (s.body === 'combine') return this.buildCombine();
    const big = s.body === 'truck' || s.body === 'semi' || s.body === 'bus';
    const cfg: Record<string, { belt: number; cab0: number; cab1: number; hood: number; r: number; clear: number; doors: number; rearSlope: number; frontSlope: number }> = {
      sedan: { belt: 0.64, cab0: -0.3, cab1: 0.13, hood: 0.3, r: 0.33, clear: 0.3, doors: 4, rearSlope: 0.5, frontSlope: 0.75 },
      hatch: { belt: 0.62, cab0: -0.46, cab1: 0.13, hood: 0.28, r: 0.31, clear: 0.28, doors: 4, rearSlope: 0.15, frontSlope: 0.75 },
      suv: { belt: 0.6, cab0: -0.46, cab1: 0.15, hood: 0.27, r: 0.4, clear: 0.42, doors: 4, rearSlope: 0.08, frontSlope: 0.6 },
      pickup: { belt: 0.6, cab0: -0.08, cab1: 0.18, hood: 0.28, r: 0.4, clear: 0.42, doors: 2, rearSlope: 0.05, frontSlope: 0.6 },
      sport: { belt: 0.62, cab0: -0.22, cab1: 0.1, hood: 0.38, r: 0.34, clear: 0.2, doors: 2, rearSlope: 0.9, frontSlope: 1.1 },
      van: { belt: 0.45, cab0: -0.5, cab1: 0.32, hood: 0.15, r: 0.36, clear: 0.35, doors: 2, rearSlope: 0, frontSlope: 0.6 },
    };
    if (big) return this.buildBig(PAINT, DARK, HEAD, TAIL, INT);
    const c = cfg[s.body] ?? cfg.sedan;
    const r = c.r; this.wheelR = r;
    const clear = c.clear, beltY = H * c.belt;
    const z0 = c.cab0 * L, z1 = c.cab1 * L;
    const roofF = z1 - (H - beltY) * c.frontSlope, roofR = z0 + (H - beltY) * c.rearSlope;
    const ev = !!s.ev, old = !!s.old;
    // --- шасси/кузов
    this.part('chassis', false);
    const prof: Record<string, [number, number][]> = {
      sedan: [[-0.5, 0.08], [-0.5, 0.8], [-0.48, 1], [0.47, 1], [0.5, 0.72], [0.5, 0.08]],
      hatch: [[-0.5, 0.08], [-0.5, 0.95], [-0.49, 1], [0.47, 1], [0.5, 0.7], [0.5, 0.08]],
      suv: [[-0.5, 0.05], [-0.5, 1], [0.47, 1], [0.5, 0.75], [0.5, 0.05]],
      pickup: [[-0.5, 0.05], [-0.5, 1], [0.47, 1], [0.5, 0.75], [0.5, 0.05]],
      sport: [[-0.5, 0.1], [-0.5, 0.85], [-0.45, 1], [0.35, 0.95], [0.5, 0.45], [0.5, 0.1]],
      van: [[-0.5, 0.03], [-0.5, 1], [0.5, 1], [0.5, 0.03]],
    };
    const bodyTop = s.body === 'pickup' ? beltY - 0.3 : beltY;
    this.add(PAINT, profile(s.body, prof[s.body] ?? prof.sedan), M(0, clear, 0, 0, W, bodyTop - clear, L));
    if (s.body === 'pickup') {
      // передняя часть до пояса + кузов-платформа
      this.box(PAINT, 0, (bodyTop + beltY) / 2, (z0 + L / 2) / 2, W, beltY - bodyTop, L / 2 - z0);
      this.box(DARK, 0, bodyTop + 0.02, (-L / 2 + z0) / 2, W - 0.16, 0.04, z0 + L / 2 - 0.2);
      this.box(PAINT, W / 2 - 0.04, beltY - 0.15, (-L / 2 + z0) / 2 - 0.05, 0.08, 0.3, z0 + L / 2 - 0.2);
      this.box(PAINT, -W / 2 + 0.04, beltY - 0.15, (-L / 2 + z0) / 2 - 0.05, 0.08, 0.3, z0 + L / 2 - 0.2);
    }
    if (s.body === 'van') {
      this.box(PAINT, 0, (beltY + H) / 2, -L * 0.08, W, H - beltY, L * 0.84); // высокий короб
    }
    // колёсные арки (тёмные)
    for (const zz of [L / 2 - L * 0.19, -L / 2 + L * 0.2]) for (const sx of [1, -1]) this.box(DARK, sx * (W / 2 - 0.02), clear + r * 0.45, zz, 0.06, r * 0.9, r * 2.3);
    // салон
    this.box(INT, 0, clear + 0.08, (z0 + z1) / 2, W - 0.2, 0.06, z1 - z0); // пол
    const seatY = clear + 0.18;
    const sf = z1 - 0.95 - (s.body === 'van' ? 0.2 : 0);
    for (const sx of [0.36, -0.36]) { this.box(INT, sx * W / 1.8, seatY, sf, 0.48, 0.14, 0.5); this.box(INT, sx * W / 1.8, seatY + 0.35, sf - 0.27, 0.48, 0.62, 0.12, -0.15); }
    if (c.doors === 4) { this.box(INT, 0, seatY, sf - 0.9, W - 0.3, 0.14, 0.5); this.box(INT, 0, seatY + 0.33, sf - 1.15, W - 0.3, 0.6, 0.12, -0.12); }
    this.box('c:#18181b', 0, beltY - 0.08, z1 - 0.3, W - 0.2, 0.22, 0.4); // торпедо
    this.box('glow:#7dd3fc', W * 0.2, beltY + 0.04, z1 - 0.42, 0.25, 0.08, 0.02); // приборы
    // посадка: голова (с причёской) гарантированно ниже крыши
    const dy = seatY + 0.07, sc = Math.min(0.9, (H - 0.08 - dy) / 0.97);
    this.driver = { x: W * 0.2, y: dy, z: sf, pose: 'drive', scale: sc };
    this.passenger = { x: -W * 0.2, y: dy, z: sf, pose: 'passenger', scale: sc };
    this.extraSeats = c.doors === 4 ? [{ x: W * 0.2, y: dy, z: sf - 0.85, pose: 'passenger', scale: sc * 0.97 }, { x: -W * 0.2, y: dy, z: sf - 0.85, pose: 'passenger', scale: sc * 0.97 }] : [];
    // руль
    this.part('steer', false);
    this.add('c:#111', T.torus, M(W * 0.2, beltY + 0.02, sf + 0.5, 0, 0.17, 0.17, 0.17, -0.5));
    this.box('c:#111', W * 0.2, beltY - 0.06, sf + 0.62, 0.05, 0.05, 0.3, -0.5);
    // крыша, стойки, стёкла
    this.part('roof', false);
    if (s.body !== 'van') {
      this.box(PAINT, 0, H - 0.035, (roofF + roofR) / 2, W - 0.18, 0.07, roofF - roofR);
      for (const sx of [1, -1]) {
        const xw = sx * (W / 2 - 0.1);
        const aLen = Math.hypot(H - beltY, z1 - roofF), aAng = Math.atan2(roofF - z1, H - beltY);
        this.box(PAINT, xw, (beltY + H) / 2, (z1 + roofF) / 2, 0.07, aLen, 0.07, aAng);
        const cLen = Math.hypot(H - beltY, roofR - z0), cAng = Math.atan2(roofR - z0, H - beltY);
        this.box(PAINT, xw, (beltY + H) / 2, (z0 + roofR) / 2, 0.07, cLen, Math.max(0.07, c.rearSlope < 0.2 ? 0.25 : 0.07), cAng);
        if (c.doors === 4) this.box(PAINT, xw, (beltY + H) / 2, (z0 + z1) / 2 + 0.05, 0.07, H - beltY, 0.09);
        this.sideGlass(sx * (W / 2 - 0.09), beltY + 0.02, H - 0.08, Math.max(roofR, z0 + 0.1), Math.min(roofF + (z1 - roofF) * 0.5, z1));
        this.sideGlass(sx * (W / 2 - 0.09), beltY + 0.02, beltY + (H - beltY) * 0.45, z0 + 0.05, z1 - 0.05);
      }
      this.glassPane(0, beltY, z1, H - 0.05, roofF, W - 0.24);
      this.glassPane(0, beltY, z0, H - 0.05, roofR, W - 0.24);
      if (s.body === 'suv' || s.body === 'hatch') this.box(PAINT, 0, (beltY + H) / 2, z0 - 0.02, W - 0.1, (H - beltY), 0.06);
      if (s.body === 'suv') { for (const sx of [1, -1]) this.box('c:#222', sx * (W / 2 - 0.2), H + 0.04, (roofF + roofR) / 2, 0.05, 0.05, roofF - roofR); }
    } else {
      this.box(PAINT, 0, H - 0.03, -L * 0.08, W, 0.06, L * 0.84);
      this.glassPane(0, beltY + 0.05, L * 0.47, H - 0.15, L * 0.34, W - 0.2);
      for (const sx of [1, -1]) { this.sideGlass(sx * (W / 2 + 0.01), beltY + 0.15, H - 0.25, L * 0.18, L * 0.33); this.sideGlass(sx * (W / 2 + 0.01), beltY + 0.4, H - 0.3, -L * 0.3, L * 0.1); }
      this.box('c:#111', 0, (beltY + H) / 2, L * 0.34, W - 0.02, 0.06, 0.06);
    }
    // капот / багажник
    this.part('hood');
    const hoodLen = L / 2 - z1 - 0.12;
    this.box(PAINT, 0, bodyTop + (s.body === 'pickup' ? 0.3 : 0) + 0.02, z1 + hoodLen / 2 + 0.05, W - 0.12, 0.05, hoodLen, 0.04);
    if (s.body === 'sport' || s.body === 'suv') this.box('c:#111', 0, beltY + 0.05, z1 + hoodLen * 0.6, 0.5, 0.03, 0.4);
    if (s.body === 'sedan' || s.body === 'sport') {
      this.part('trunk');
      const tl = -L / 2 + 0.1, tr = z0 - 0.02;
      this.box(PAINT, 0, beltY + 0.02, (tl + tr) / 2, W - 0.12, 0.05, tr - tl);
    } else if (s.body === 'pickup') {
      this.part('tailgate');
      this.box(PAINT, 0, (bodyTop + beltY) / 2, -L / 2 + 0.05, W - 0.1, beltY - bodyTop + 0.05, 0.07);
    } else {
      this.part('reardoor');
      this.box(PAINT, 0, (clear + beltY) / 2 + 0.1, -L / 2 - 0.02, W - 0.15, beltY - clear - 0.15, 0.05);
      if (s.body === 'suv') { this.part('spare'); this.cyl('c:#1b1b1b', 0, (clear + beltY) / 2 + 0.1, -L / 2 - 0.18, r * 0.95, 0.24, 'z'); }
    }
    // двери
    const dsplit = c.doors === 4 ? (z0 + z1) / 2 + 0.05 : z0;
    const doorSpans: [string, number, number][] = c.doors === 4 ? [['F', dsplit, z1], ['R', z0 + 0.05, dsplit]] : [['F', z0 + (s.body === 'van' ? L * 0.68 : 0.05), z1]];
    for (const sx of [1, -1]) for (const [nm, a, b] of doorSpans) {
      this.part('door' + nm + (sx > 0 ? 'L' : 'R'));
      const x = sx * (W / 2 + 0.025);
      this.box(PAINT, x, (clear + 0.1 + beltY) / 2, (a + b) / 2, 0.05, beltY - clear - 0.12, b - a - 0.04);
      this.box('c:#141414', x + sx * 0.005, (clear + 0.1 + beltY) / 2, b - 0.02, 0.052, beltY - clear - 0.12, 0.018);
      this.box('chrome', x + sx * 0.03, beltY - 0.12, b - 0.25, 0.03, 0.04, 0.14);
    }
    // зеркала
    for (const sx of [1, -1]) { this.part('mirror' + (sx > 0 ? 'L' : 'R')); this.box(PAINT, sx * (W / 2 + 0.13), beltY + 0.1, z1 - 0.1, 0.18, 0.12, 0.1); this.box('chrome', sx * (W / 2 + 0.13), beltY + 0.1, z1 - 0.15, 0.15, 0.09, 0.01); }
    // бамперы, решётка, фары
    const bumperMat = old || this.tuning.chrome ? 'chrome' : s.body === 'sport' || ev ? PAINT : 'c:#2a2a2d';
    this.part('bumperF');
    this.box(bumperMat, 0, clear + 0.1, L / 2 + 0.06, W + 0.04, 0.22, 0.16);
    this.box(PLATE, 0, clear + 0.12, L / 2 + 0.15, 0.5, 0.12, 0.02);
    if (!ev) {
      this.box(old ? 'chrome' : 'c:#0d0d0d', 0, (clear + 0.25 + bodyTop) / 2 + 0.02, L / 2 + 0.01, W * 0.45, bodyTop - clear - 0.3, 0.05);
      for (let i = 0; i < 4; i++) this.box('chrome', 0, clear + 0.32 + i * 0.07, L / 2 + 0.035, W * 0.44, 0.015, 0.02);
    }
    this.part('lightsF', false);
    for (const sx of [1, -1]) {
      if (ev) this.box(HEAD, sx * W * 0.32, bodyTop - 0.08, L / 2 + 0.005, W * 0.3, 0.05, 0.04);
      else this.box(HEAD, sx * W * 0.36, bodyTop - 0.13, L / 2 + 0.005, W * 0.18, old ? 0.16 : 0.1, 0.05);
      this.box(TAIL, sx * W * 0.38, bodyTop - 0.1, -L / 2 - 0.005, W * 0.18, 0.1, 0.04);
    }
    if (ev) { this.box(HEAD, 0, bodyTop - 0.08, L / 2 + 0.005, W * 0.35, 0.025, 0.04); this.box(TAIL, 0, bodyTop - 0.1, -L / 2 - 0.005, W * 0.8, 0.03, 0.04); }
    this.part('bumperR');
    this.box(bumperMat, 0, clear + 0.1, -L / 2 - 0.06, W + 0.04, 0.22, 0.16);
    this.box(PLATE, 0, clear + 0.28, -L / 2 - 0.02, 0.5, 0.12, 0.02);
    if (!ev) { this.part('exhaust'); this.cyl('chrome', W * 0.3, clear + 0.02, -L / 2 - 0.1, 0.04, 0.3, 'z'); if (s.body === 'sport') this.cyl('chrome', -W * 0.3, clear + 0.02, -L / 2 - 0.1, 0.05, 0.3, 'z'); }
    if (this.tuning.spoiler || s.body === 'sport') {
      this.part('spoiler');
      this.box(PAINT, 0, beltY + 0.25, -L / 2 + 0.2, W - 0.2, 0.04, 0.3);
      for (const sx of [1, -1]) this.box('c:#111', sx * W * 0.32, beltY + 0.12, -L / 2 + 0.22, 0.04, 0.22, 0.08);
    }
    // ливреи
    if (s.service) {
      this.part('livery', false);
      const stripe = s.service === 'police' ? 'c:#1d4ed8' : s.service === 'ambulance' ? 'c:#dc2626' : 'c:#111';
      for (const sx of [1, -1]) this.box(stripe, sx * (W / 2 + 0.055), (clear + beltY) / 2 + 0.05, 0, 0.01, 0.14, L * 0.62);
      if (s.service === 'taxi') { this.box('c:#111', 0, H + 0.1, (roofF + roofR) / 2, 0.6, 0.18, 0.25); this.box('glow:#fde047', 0, H + 0.1, (roofF + roofR) / 2, 0.62, 0.1, 0.27); }
      else {
        const lb = s.body === 'van' ? H + 0.08 : H + 0.06;
        const lz = s.body === 'van' ? L * 0.3 : (roofF + roofR) / 2;
        this.box('c:#222', 0, lb, lz, W * 0.7, 0.08, 0.25);
        this.box('SIREN_R', -W * 0.18, lb + 0.07, lz, W * 0.3, 0.1, 0.22);
        this.box('SIREN_B', W * 0.18, lb + 0.07, lz, W * 0.3, 0.1, 0.22);
      }
    }
    // колёса
    const wz = [L / 2 - L * 0.19, -L / 2 + L * 0.2];
    for (const zz of wz) for (const sx of [1, -1]) this.addWheel(sx * (W / 2 - 0.12), r, zz, r, 0.24, zz > 0);
    // неон
    this.addNeon(W, L);
  }
  private buildBig(PAINT: string, DARK: string, HEAD: string, TAIL: string, INT: string) {
    const s = this.spec, L = s.len, W = s.wid, H = s.hei;
    const r = s.body === 'bus' ? 0.5 : 0.52; this.wheelR = r;
    this.part('chassis', false);
    this.box(DARK, 0, 0.55, 0, W - 0.3, 0.3, L - 0.4);
    if (s.body === 'bus') {
      this.box(PAINT, 0, 0.4 + (H - 0.4) / 2, 0, W, H - 0.4, L);
      for (const sx of [1, -1]) {
        this.box('GLASSBUS', sx * (W / 2 + 0.01), H * 0.68, -0.4, 0.02, H * 0.36, L - 2.2);
        for (let i = 0; i < 7; i++) this.box('c:#111', sx * (W / 2 + 0.02), H * 0.68, -L / 2 + 1 + i * 1.45, 0.03, H * 0.36, 0.08);
      }
      this.box('GLASSBUS', 0, H * 0.62, L / 2 + 0.01, W - 0.15, H * 0.55, 0.02);
      this.box('c:#111', -W / 2 - 0.02, H * 0.45, L / 2 - 1.4, 0.03, H * 0.75, 1.1);
      this.box('c:#111', -W / 2 - 0.02, H * 0.45, -0.5, 0.03, H * 0.75, 1.1);
      this.box('glow:#fbbf24', 0, H - 0.22, L / 2 + 0.02, W * 0.6, 0.2, 0.02);
      this.driver = { x: W * 0.25, y: 1.05, z: L / 2 - 1.2, pose: 'drive', scale: 1 };
      this.passenger = { x: -W * 0.25, y: 1.05, z: L / 2 - 2.6, pose: 'passenger', scale: 1 };
      this.extraSeats = [0, 1, 2, 3, 4, 5].map((i) => ({ x: (i % 2 ? -1 : 1) * W * 0.25, y: 1.05, z: L / 2 - 4.0 - Math.floor(i / 2) * 1.6, pose: 'passenger' as const, scale: 1 }));
      this.part('steer', false); this.add('c:#111', T.torus, M(W * 0.25, 1.6, L / 2 - 0.7, 0, 0.22, 0.22, 0.22, -1.0));
    } else {
      const nose = s.variant === 'nose' ? 1.9 : 0; // капот американского тягача
      const cabL = 2.4;
      const cz = L / 2 - cabL / 2 - nose;
      if (nose) {
        this.box(PAINT, 0, 0.75 + 0.75, L / 2 - nose / 2, W - 0.3, 1.5, nose); // капот
        this.box('chrome', 0, 1.35, L / 2 + 0.03, W * 0.62, 1.1, 0.05); for (let i = 0; i < 7; i++) this.box('c:#111', 0, 0.9 + i * 0.13, L / 2 + 0.06, W * 0.6, 0.03, 0.02);
        for (const sx of [1, -1]) { this.cyl('chrome', sx * (W / 2 - 0.05), H + 0.2, cz - cabL / 2 + 0.15, 0.08, 1.6, 'y'); this.box(PAINT, sx * (W / 2 - 0.2), 0.95, L / 2 - nose / 2, 0.45, 0.08, nose * 0.9); } // трубы и крылья
      }
      this.box(PAINT, 0, 0.7 + (H - 0.7) / 2 - 0.1, cz, W, H - 0.9, cabL);
      this.box(PAINT, 0, H - 0.15, cz - 0.2, W, 0.3, cabL - 0.4);
      this.box('GLASSBUS', 0, H * 0.66, cz + cabL / 2 + 0.01, W - 0.2, H * 0.32, 0.02);
      for (const sx of [1, -1]) this.box('GLASSBUS', sx * (W / 2 + 0.01), H * 0.66, cz + 0.4, 0.02, H * 0.3, 1.0);
      if (!nose) this.box('chrome', 0, 1.0, L / 2 + 0.02, W * 0.6, 0.6, 0.04);
      this.box(INT, 0, 1.4, cz - 0.3, W - 0.3, 0.2, 0.6);
      this.driver = { x: W * 0.25, y: 1.55, z: cz - 0.2, pose: 'drive', scale: 1 };
      this.passenger = { x: -W * 0.25, y: 1.55, z: cz - 0.2, pose: 'passenger', scale: 1 };
      this.part('steer', false); this.add('c:#111', T.torus, M(W * 0.25, 2.05, cz + 0.4, 0, 0.22, 0.22, 0.22, -1.0));
      this.part('cargo', false);
      const boxL = L - cabL - 0.3 - nose;
      const bz = -L / 2 + boxL / 2;
      const v = s.body === 'semi' ? s.variant ?? 'box' : 'box';
      if (v === 'tank') { // цистерна
        this.box('c:#374151', 0, 1.0, bz, W - 0.4, 0.2, boxL);
        this.add('chrome', T.cyl16, M(0, 2.05, bz, 0, 1.15, boxL - 0.4, 0.95, Math.PI / 2));
        for (let i = 0; i < 3; i++) this.box('c:#9ca3af', 0, 3.05, bz - boxL / 3 + i * boxL / 3, 0.6, 0.15, 0.6);
        this.box(PAINT, 0, 2.05, bz, 2.34, 0.35, boxL - 1.2); this.box('c:#374151', 0, 3.1, bz, 0.4, 0.06, boxL - 0.6);
      } else if (v === 'flat') { // платформа с грузом
        this.box('c:#374151', 0, 1.15, bz, W, 0.18, boxL);
        for (let i = 0; i < 2; i++) this.box(['c:#b91c1c', 'c:#1d4ed8'][i], 0, 1.24 + 1.3, bz - boxL / 4 + i * boxL / 2, W - 0.1, 2.5, boxL / 2 - 0.5);
        for (let i = 0; i < 4; i++) this.box('c:#facc15', 0, 1.24 + 1.3, bz - boxL / 2 + 0.6 + i * (boxL - 1.2) / 3, W + 0.04, 2.55, 0.06);
      } else {
        const boxCol = v === 'reefer' ? 'c:#f8fafc' : s.body === 'semi' ? 'c:#e5e7eb' : 'c:#9ca3af';
        this.box(boxCol, 0, 1.0 + (H + 0.2 - 1.0) / 2, bz, W, H + 0.2 - 1.0, boxL);
        if (s.body === 'semi') this.box(PAINT, 0, 2.2, bz, W + 0.02, 0.5, boxL - 1);
        if (v === 'reefer') { this.box('c:#334155', 0, 2.4, bz + boxL / 2 + 0.25, W * 0.7, 1.2, 0.5); this.box('glow:#38bdf8', 0, 2.4, bz + boxL / 2 + 0.51, W * 0.4, 0.1, 0.01); }
      }
      for (const sx of [1, -1]) this.box('glow:#f59e0b', sx * (W / 2 + 0.01), 1.1, bz, 0.02, 0.06, boxL * 0.9);
    }
    this.part('bumperF'); this.box('c:#333', 0, 0.55, L / 2 + 0.08, W + 0.04, 0.3, 0.16);
    this.part('lightsF', false);
    for (const sx of [1, -1]) { this.box(HEAD, sx * W * 0.38, 0.85, L / 2 + 0.03, 0.35, 0.18, 0.04); this.box(TAIL, sx * W * 0.4, 0.9, -L / 2 - 0.02, 0.3, 0.18, 0.04); }
    for (const sx of [1, -1]) { this.part('mirror' + (sx > 0 ? 'L' : 'R')); this.box('c:#111', sx * (W / 2 + 0.2), H * 0.65, L / 2 - 0.3, 0.06, 0.4, 0.2); }
    this.part('bumperR'); this.box('c:#333', 0, 0.55, -L / 2 - 0.06, W, 0.25, 0.12);
    const wz = s.body === 'semi' ? [L / 2 - 1.2 - (s.variant === 'nose' ? 1.4 : 0), L / 2 - 3.6 - (s.variant === 'nose' ? 1.6 : 0), -L / 2 + 3.4, -L / 2 + 2.2, -L / 2 + 1.0] : s.body === 'truck' ? [L / 2 - 1.2, -L / 2 + 2.0, -L / 2 + 0.9] : [L / 2 - 2.0, -L / 2 + 2.4];
    wz.forEach((zz, i) => { for (const sx of [1, -1]) this.addWheel(sx * (W / 2 - 0.2), r, zz, r, 0.35, i === 0); });
  }
  private buildMoto() {
    const PAINT = 'PAINT', sport = this.spec.id === 'molnia';
    const r = sport ? 0.33 : 0.32; this.wheelR = r;
    const zf = sport ? 0.74 : 0.7, zr = -0.7;
    const BLK = 'c:#16171a', GRY = 'c:#3c3f45', AL = 'chrome';
    // ---- рама и двигатель ----
    this.part('frame', false);
    this.box(GRY, 0, 0.66, 0.12, 0.07, 0.07, 0.95, -0.42);              // верхняя труба рамы
    for (const sx of [1, -1]) this.box(GRY, sx * 0.08, 0.5, 0.18, 0.04, 0.32, 0.04, 0.5); // нижние трубы
    this.box(BLK, 0, 0.42, -0.02, 0.26, 0.26, 0.44);                    // картер
    for (let i = 0; i < 2; i++) { this.box('c:#55595f', 0, 0.62, 0.12 + i * 0.06, 0.24, 0.2, 0.04, -0.3); } // цилиндры
    for (let i = 0; i < 5; i++) this.box('c:#6b7078', 0, 0.56 + i * 0.03, 0.14, 0.27, 0.012, 0.11, -0.3); // рёбра охлаждения
    this.cyl('c:#2b2d31', 0, 0.38, -0.06, 0.11, 0.3, 'x');               // крышка сцепления
    this.box('c:#1f2937', 0, 0.62, 0.36, 0.3, 0.2, 0.05, -0.25);         // радиатор
    // маятник и цепь
    for (const sx of [1, -1]) this.box(GRY, sx * 0.1, r + 0.04, (zr - 0.05) / 2, 0.04, 0.06, Math.abs(zr) + 0.1, 0.08);
    this.box(BLK, -0.12, r + 0.02, (zr - 0.05) / 2, 0.02, 0.09, Math.abs(zr), 0.08); // цепь
    this.box('c:#8b8f96', 0.06, 0.62, -0.32, 0.04, 0.26, 0.04, -0.4);    // амортизатор
    // подножки
    for (const sx of [1, -1]) this.box(AL, sx * 0.2, 0.33, -0.2, 0.12, 0.025, 0.04);
    // ---- бак, седло, хвост ----
    this.part('tank');
    this.add(PAINT, profile('mototank', [[-0.5, 0], [-0.5, 0.55], [-0.2, 1], [0.35, 0.95], [0.5, 0.45], [0.5, 0]]), M(0, 0.72, 0.18, 0, 0.32, 0.22, 0.52));
    this.box('chrome', 0, 0.95, 0.17, 0.07, 0.02, 0.07); // крышка бака
    this.part('seat', false);
    this.box('c:#111214', 0, 0.83, -0.27, 0.27, 0.08, 0.5, 0.04);
    if (!sport) this.box('c:#111214', 0, 0.86, -0.56, 0.24, 0.07, 0.2, 0.12);
    this.part('tail');
    this.add(PAINT, profile('mototail', [[-0.5, 0], [-0.5, 0.7], [0.5, 1], [0.5, 0]]), M(0, 0.76, -0.62, 0, 0.22, 0.14, 0.42));
    this.box('glow:#ff1a1a', 0, 0.82, -0.84, 0.13, 0.04, 0.03);
    this.box('c:#f1f1f1', 0, 0.62, -0.86, 0.16, 0.09, 0.01, 0.35); // номер
    this.box(BLK, 0, 0.67, -0.78, 0.05, 0.12, 0.05, 0.6);
    // ---- выхлоп ----
    this.part('exhaust');
    this.box(AL, -0.12, 0.42, 0.2, 0.05, 0.05, 0.22, -0.9);
    this.box(AL, -0.15, 0.32, -0.08, 0.05, 0.05, 0.42, 0.05);
    this.cyl(AL, -0.17, 0.42, -0.5, sport ? 0.065 : 0.055, sport ? 0.4 : 0.5, 'z');
    this.cyl('c:#111', -0.17, 0.42, -0.76, 0.04, 0.02, 'z');
    // ---- вилка и руль ----
    this.part('fork', false);
    const rake = 0.38, fy = 0.62, fz = zf - 0.1;
    for (const sx of [1, -1]) { this.box(AL, sx * 0.075, fy, fz, 0.04, 0.62, 0.04, rake); this.box(BLK, sx * 0.075, fy - 0.2, fz + 0.075, 0.05, 0.22, 0.05, rake); }
    this.box(GRY, 0, 0.92, zf - 0.22, 0.2, 0.04, 0.08, rake);           // траверса
    this.box(BLK, 0, 0.98, zf - 0.26, 0.66, 0.03, 0.03);                 // руль
    for (const sx of [1, -1]) { this.box('c:#0a0a0a', sx * 0.36, 0.98, zf - 0.26, 0.1, 0.045, 0.045); this.box(GRY, sx * 0.24, 1.08, zf - 0.22, 0.015, 0.16, 0.015); this.box(AL, sx * 0.24, 1.17, zf - 0.22, 0.09, 0.05, 0.02); } // ручки, зеркала
    this.box('c:#111', 0, 1.0, zf - 0.32, 0.12, 0.06, 0.06);             // приборка
    this.box('glow:#7dd3fc', 0, 1.03, zf - 0.33, 0.08, 0.02, 0.04);
    this.part('lightsF', false);
    if (sport) this.box('HEAD', 0, 0.86, zf + 0.02, 0.18, 0.06, 0.04, -0.5);
    else { this.add('HEAD', T.cyl, M(0, 0.86, zf - 0.04, 0, 0.09, 0.06, 0.09, Math.PI / 2)); this.add('chrome', T.cyl, M(0, 0.86, zf - 0.08, 0, 0.1, 0.06, 0.1, Math.PI / 2)); }
    // ---- обтекатель (спорт) ----
    if (sport) {
      this.part('fairing');
      this.add(PAINT, profile('motofair', [[-0.5, 0], [-0.5, 0.75], [-0.1, 1], [0.5, 0.35], [0.5, 0]]), M(0, 0.6, zf - 0.32, 0, 0.36, 0.42, 0.42));
      this.box('GLASS', 0, 1.02, zf - 0.22, 0.26, 0.16, 0.02, -0.7);
      for (const sx of [1, -1]) this.box(PAINT, sx * 0.17, 0.5, 0.12, 0.02, 0.24, 0.5);
    }
    this.part('fenderF'); this.add(PAINT, T.torus, M(0, r, zf, Math.PI / 2, r + 0.05, r + 0.05, 0.4, 0, 0)); 
    this.part('fenderR'); this.box(PAINT, 0, r + 0.3, zr + 0.05, 0.16, 0.03, 0.36, -0.3);
    // колёса: вращаются вместе с корпусом (для стантов)
    this.addWheel(0, r, zf, r, sport ? 0.13 : 0.11, true, 2, this.body);
    this.addWheel(0, r, zr, r, sport ? 0.18 : 0.14, false, 2, this.body);
    this.driver = { x: 0, y: 0.9, z: -0.2, pose: 'ride', scale: 1 };
    this.passenger = { x: 0, y: 0.97, z: -0.56, pose: 'ridepass', scale: 1 };
    this.axles = { f: zf, r: zr };
  }
  private buildScooter() {
    const PAINT = 'PAINT', cfg = this.spec.sc ?? { r: 0.1, deck: 0.9 };
    const r = cfg.r; this.wheelR = r;
    const half = cfg.deck / 2, zf = half - 0.02, zr = -half + 0.04, BLK = 'c:#17181b', dy = r + 0.04;
    this.part('frame', false);
    this.box(BLK, 0, dy, -0.02, 0.17, 0.06, cfg.deck * 0.78);                 // дека
    this.box('c:#2b2d31', 0, dy + 0.035, -0.04, 0.15, 0.008, cfg.deck * 0.68);  // грип
    this.box(PAINT, 0, dy - 0.01, -0.02, 0.18, 0.035, cfg.deck * 0.8);          // боковины
    this.box(PAINT, 0, r * 2 + 0.02, zr + 0.02, 0.1, 0.03, 0.26, 0.35);        // заднее крыло
    this.box('glow:#ff1a1a', 0, r * 2, zr - 0.1, 0.06, 0.02, 0.02);
    const stems = cfg.dual ? [-0.07, 0.07] : [0];
    for (const sx of stems) this.box(PAINT, sx, 0.62, zf - 0.1, 0.055, 1.02, 0.055, -0.12);  // рулевая стойка
    if (cfg.susp) for (const z of [zf, zr]) { this.box('c:#f59e0b', 0.07, r + 0.07, z - Math.sign(z) * 0.05, 0.03, 0.14, 0.03, Math.sign(z) * 0.5); }
    this.box(BLK, 0, r + 0.08, zf - 0.02, 0.05, 0.16, 0.08, -0.4);            // вилка
    this.box(BLK, 0, 1.11, zf - 0.13, cfg.dual ? 0.62 : 0.5, 0.03, 0.03);    // руль
    for (const sx of [1, -1]) this.box('c:#0a0a0a', sx * (cfg.dual ? 0.28 : 0.22), 1.11, zf - 0.13, 0.08, 0.04, 0.04);
    this.box('c:#111', 0, 1.1, zf - 0.1, 0.08, 0.03, 0.06); this.box('glow:#7dd3fc', 0, 1.12, zf - 0.1, 0.05, 0.005, 0.04);
    if (cfg.seat) { this.box('c:#333', 0, 0.42, -0.1, 0.04, 0.6, 0.04); this.box('c:#111', 0, 0.74, -0.12, 0.22, 0.06, 0.28); }
    if (this.spec.id === 'scooter') this.box('c:#f8fafc', 0, 0.95, zf - 0.04, 0.06, 0.14, 0.02, -0.12); // табличка аренды
    this.part('lightsF', false); this.box('HEAD', 0, 0.85, zf - 0.03, cfg.dual ? 0.12 : 0.05, 0.04, 0.03);
    this.addWheel(0, r, zf, r, cfg.r > 0.13 ? 0.09 : 0.05, true, 3, this.body);
    this.addWheel(0, r, zr, r, cfg.r > 0.13 ? 0.09 : 0.05, false, 3, this.body);
    this.driver = cfg.seat ? { x: 0, y: 0.6, z: -0.16, pose: 'ride', scale: 1 } : { x: 0, y: dy + 0.04, z: -0.08, pose: 'scoot', scale: 1 };
    this.passenger = { x: 0, y: dy + 0.04, z: -0.32, pose: 'scoot', scale: 1 };
    this.axles = { f: zf, r: zr };
  }
  private buildQuad() {
    const PAINT = 'PAINT', r = 0.3; this.wheelR = r;
    this.part('frame', false);
    this.box('c:#222', 0, 0.42, 0, 0.5, 0.15, 1.5);
    this.box('c:#333', 0, 0.5, 0, 0.42, 0.28, 0.5);
    this.box(PAINT, 0, 0.72, 0.15, 0.55, 0.22, 0.45);
    this.box('c:#111', 0, 0.82, -0.25, 0.36, 0.1, 0.6);
    this.box('c:#111', 0, 0.98, 0.42, 0.7, 0.04, 0.04);
    this.box('c:#222', 0, 0.85, 0.4, 0.05, 0.25, 0.05, 0.3);
    this.box('HEAD', 0, 0.68, 0.82, 0.3, 0.08, 0.04);
    this.part('fenderF'); this.box(PAINT, 0, 0.66, 0.62, 1.15, 0.05, 0.5);
    this.part('fenderR'); this.box(PAINT, 0, 0.66, -0.62, 1.15, 0.05, 0.55);
    this.box('glow:#ff1a1a', 0, 0.64, -0.9, 0.3, 0.05, 0.02);
    this.part('exhaust'); this.cyl('chrome', 0.2, 0.45, -0.85, 0.04, 0.3, 'z');
    for (const zz of [0.6, -0.6]) for (const sx of [1, -1]) this.addWheel(sx * 0.48, r, zz, r, 0.28, zz > 0);
    this.driver = { x: 0, y: 0.86, z: -0.2, pose: 'ride', scale: 1 };
    this.passenger = { x: 0, y: 0.9, z: -0.55, pose: 'ride', scale: 1 };
  }
  private buildHeli() {
    const PAINT = 'PAINT';
    this.part('body', false);
    this.add(PAINT, T.sphere, M(0, 1.35, 0.6, 0, 1.1, 1.0, 1.9));
    this.add('GLASS', T.sphere, M(0, 1.55, 1.55, 0, 0.95, 0.75, 0.9));
    this.box(PAINT, 0, 1.6, -2.6, 0.3, 0.3, 4.2);
    this.box(PAINT, 0, 2.1, -4.6, 0.1, 1.0, 0.6);
    this.box(PAINT, 0, 1.6, -4.4, 1.2, 0.06, 0.4);
    this.box('c:#333', 0, 2.45, 0.3, 0.3, 0.3, 0.5);
    for (const sx of [1, -1]) { this.box('c:#333', sx * 0.8, 0.12, 0.4, 0.07, 0.07, 3.2); this.box('c:#333', sx * 0.65, 0.45, 1.0, 0.05, 0.6, 0.05, 0, 0, sx * 0.3); this.box('c:#333', sx * 0.65, 0.45, -0.3, 0.05, 0.6, 0.05, 0, 0, sx * 0.3); }
    this.box('c:#222', 0.32, 0.85, 1.0, 0.45, 0.12, 0.45); this.box('c:#222', -0.32, 0.85, 1.0, 0.45, 0.12, 0.45);
    this.box('glow:#22c55e', 1.1, 1.35, 0.6, 0.03, 0.08, 0.08); this.box('glow:#ef4444', -1.1, 1.35, 0.6, 0.03, 0.08, 0.08);
    const rotor = new THREE.Group(); rotor.position.set(0, 2.65, 0.3);
    for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(T.box, mat('c:#1f2937')); b.scale.set(0.25, 0.04, 9.5); b.rotation.y = (i * Math.PI) / 2; rotor.add(b); }
    this.body.add(rotor); this.rotor = rotor;
    const tr = new THREE.Group(); tr.position.set(0.12, 2.1, -4.7);
    for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(T.box, mat('c:#1f2937')); b.scale.set(0.03, 1.4, 0.12); b.rotation.x = (i * Math.PI) / 2; tr.add(b); }
    this.body.add(tr); this.tailRotor = tr;
    this.driver = { x: 0.32, y: 0.95, z: 1.0, pose: 'drive', scale: 0.95 };
    this.passenger = { x: -0.32, y: 0.95, z: 1.0, pose: 'passenger', scale: 0.95 };
    this.part('steer', false); this.box('c:#111', 0.32, 1.1, 1.45, 0.04, 0.5, 0.04, 0.3);
  }
  private buildCombine() {
    const PAINT = 'PAINT';
    this.part('body', false);
    this.box(PAINT, 0, 2.0, -0.6, 2.8, 2.2, 4.8);
    this.box(PAINT, 0, 3.4, -1.4, 2.6, 0.9, 2.6);
    this.box('GLASS', 0, 3.3, 1.5, 1.6, 1.4, 1.6);
    this.box(PAINT, 0, 4.05, 1.5, 1.7, 0.08, 1.7);
    this.box('c:#222', 0, 2.25, 1.0, 1.6, 0.1, 1.6);
    this.box(PAINT, 1.5, 3.4, -1.2, 0.25, 0.25, 3.0, 0, 0.5);
    this.box('c:#c0a000', 0, 0.9, 3.4, 4.6, 0.5, 1.2);
    this.box('c:#444', 0, 1.2, 2.5, 1.2, 0.6, 1.6, 0.4);
    const reel = new THREE.Group(); reel.position.set(0, 1.35, 3.6);
    const core = new THREE.Mesh(T.cyl, mat('c:#b91c1c')); core.scale.set(0.15, 4.4, 0.15); core.rotation.z = Math.PI / 2; reel.add(core);
    for (let i = 0; i < 5; i++) { const bar = new THREE.Mesh(T.box, mat('c:#fbbf24')); bar.scale.set(4.4, 0.05, 0.05); const a = (i / 5) * Math.PI * 2; bar.position.set(0, Math.sin(a) * 0.45, Math.cos(a) * 0.45); reel.add(bar); }
    this.body.add(reel); this.reel = reel;
    this.box('HEAD', 0.6, 4.0, 2.3, 0.3, 0.15, 0.05); this.box('HEAD', -0.6, 4.0, 2.3, 0.3, 0.15, 0.05);
    this.addWheel(1.35, 0.85, 1.2, 0.85, 0.6, false); this.addWheel(-1.35, 0.85, 1.2, 0.85, 0.6, false);
    this.addWheel(1.2, 0.55, -2.4, 0.55, 0.4, true); this.addWheel(-1.2, 0.55, -2.4, 0.55, 0.4, true);
    this.driver = { x: 0, y: 2.45, z: 1.3, pose: 'drive', scale: 1 };
    this.passenger = { x: 0.5, y: 2.45, z: 1.0, pose: 'passenger', scale: 1 };
    this.part('steer', false); this.add('c:#111', T.torus, M(0, 2.95, 1.85, 0, 0.18, 0.18, 0.18, -0.8));
  }
  axles = { f: 1, r: -1 };
  private addWheel(x: number, y: number, z: number, r: number, w: number, front: boolean, style?: number, parent?: THREE.Object3D) {
    const rimC = RIM_COLORS[this.tuning.rims % RIM_COLORS.length];
    const wm = new THREE.Mesh(wheelGeo(r, w, rimC, style ?? this.tuning.rims), wheelMat);
    wm.castShadow = true;
    const pivot = new THREE.Group(); pivot.position.set(x, y, z);
    const spin = new THREE.Group(); spin.add(wm); pivot.add(spin);
    pivot.userData.spin = spin; pivot.userData.r = r; pivot.userData.x = x; pivot.userData.w = w;
    (parent ?? this.group).add(pivot);
    this.wheels.push(pivot);
    if (front) this.frontWheels.push(pivot);
  }
  private addNeon(W: number, L: number) {
    if (this.neon) { this.group.remove(this.neon); this.neon = null; }
    if (!this.tuning.neon) return;
    const m = new THREE.Mesh(T.plane, new THREE.MeshBasicMaterial({ color: this.tuning.neon, transparent: true, opacity: 0.55, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.scale.set(W + 0.6, L + 0.4, 1); m.position.y = 0.04; m.renderOrder = 2;
    this.group.add(m); this.neon = m;
  }
  // ---------- сборка мешей ----------
  private resolveMat(k: string): string {
    if (k === 'PAINT') return 'paint:' + (this.tuning.paint ?? this.color);
    if (k === 'GLASS') return 'glass:' + (0.35 + this.tuning.tint * 0.2).toFixed(2);
    if (k === 'GLASSBUS') return 'glass:0.6';
    if (k === 'HEAD') return 'glow:' + (this.lightsOn ? '#ffffff' : this.tuning.lights === '#fff8e0' ? '#e8e4cf' : this.tuning.lights);
    if (k === 'SIREN_R') return 'glow:#ef4444';
    if (k === 'SIREN_B') return 'glow:#3b82f6';
    if (k === 'TRIM') return 'c:#222';
    return k;
  }
  rebuild() {
    for (const m of this.meshes) { this.body.remove(m); m.geometry.dispose(); }
    this.meshes = [];
    const b = new Batcher();
    for (const p of this.parts) if (p.attached) for (const it of p.items) b.add(this.resolveMat(it.mat), it.tpl, it.m);
    const ms = b.build({ cast: true });
    for (const m of ms) { this.body.add(m); this.meshes.push(m); }
    this.sirenMeshes = ms.filter((m) => m.userData.matKey === 'glow:#ef4444' || m.userData.matKey === 'glow:#3b82f6');
    this.body.position.y = this.spec.body === 'heli' || this.spec.body === 'combine' || this.spec.body === 'moto' || this.spec.body === 'scooter' ? 0 : this.tuning.clearance * 0.06;
  }
  setLights(on: boolean) { if (on !== this.lightsOn) { this.lightsOn = on; this.rebuild(); } }
  sirens(t: number) { for (const m of this.sirenMeshes) m.visible = (Math.floor(t * 4) + (m.userData.matKey.includes('ef4444') ? 0 : 1)) % 2 === 0; }
  applyTuning(t: Tuning) {
    const rimsChanged = t.rims !== this.tuning.rims;
    const spoilerChanged = t.spoiler !== this.tuning.spoiler || t.chrome !== this.tuning.chrome;
    this.tuning = { ...t };
    if (spoilerChanged || rimsChanged) {
      // полная перестройка деталей
      const detached = this.parts.filter((p) => !p.attached).map((p) => p.name);
      this.parts = []; this.wheels.forEach((w) => w.parent?.remove(w)); this.wheels = []; this.frontWheels = [];
      this.construct();
      this.parts.forEach((p) => { if (detached.includes(p.name)) p.attached = false; });
    }
    this.addNeon(this.spec.wid, this.spec.len);
    this.rebuild();
  }
  detachables() { return this.parts.filter((p) => p.detachable && p.attached); }
  /** оторвать деталь: возвращает отдельный меш в локальных координатах машины */
  detach(name?: string): { mesh: THREE.Object3D; local: THREE.Vector3; name: string } | null {
    const list = this.detachables();
    if (!list.length) return null;
    const p = name ? list.find((x) => x.name === name) : list[Math.floor(Math.random() * list.length)];
    if (!p) return null;
    p.attached = false;
    const center = new THREE.Vector3(); let n = 0;
    for (const it of p.items) { center.add(new THREE.Vector3().setFromMatrixPosition(it.m)); n++; }
    center.divideScalar(n || 1);
    const b = new Batcher();
    const off = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
    for (const it of p.items) b.add(this.resolveMat(it.mat), it.tpl, off.clone().multiply(it.m));
    const g = new THREE.Group(); for (const m of b.build({ cast: true })) { m.matrixAutoUpdate = true; g.add(m); }
    this.rebuild();
    center.y += this.body.position.y;
    return { mesh: g, local: center, name: p.name };
  }
  detachWheel(): { mesh: THREE.Object3D; local: THREE.Vector3 } | null {
    const w = this.wheels.find((x) => x.visible);
    if (!w) return null;
    w.visible = false;
    const m = (w.userData.spin as THREE.Group).children[0] as THREE.Mesh;
    const copy = new THREE.Mesh(m.geometry, m.material); copy.castShadow = true;
    const g = new THREE.Group(); g.add(copy);
    return { mesh: g, local: w.position.clone() };
  }
  missingWheels() { return this.wheels.filter((w) => !w.visible).length; }
  missingParts() { return this.parts.filter((p) => !p.attached).map((p) => p.name); }
  repairAll() { this.parts.forEach((p) => (p.attached = true)); this.wheels.forEach((w) => (w.visible = true)); this.rebuild(); }
  setMissing(names: string[]) { this.parts.forEach((p) => { if (names.includes(p.name)) p.attached = false; }); this.rebuild(); }
  /** анимация колёс и руля */
  animate(dist: number, steer: number) {
    for (const w of this.wheels) { (w.userData.spin as THREE.Group).rotation.x += dist / (w.userData.r as number); }
    for (const w of this.frontWheels) w.rotation.y = steer * 0.5;
    if (this.steerHandle) this.steerHandle.rotation.z = steer;
  }
  dispose() { for (const m of this.meshes) m.geometry.dispose(); this.group.parent?.remove(this.group); }
}
