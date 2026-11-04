// Модели транспорта: детальные, с отрываемыми деталями и тюнингом
import * as THREE from 'three';
import { T, M, Batcher } from './geom';
import { VEHICLES, type VSpec, type Tuning, defaultTuning } from './data';
import { mat } from './textures';

interface Item { mat: string; tpl: THREE.BufferGeometry; m: THREE.Matrix4 }
export interface Part { name: string; items: Item[]; detachable: boolean; attached: boolean; center: THREE.Vector3; visible: boolean }

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
/**
 * Колесо: покрышка с протектором и боковиной, литой диск с «тарелкой», спицами,
 * ступичной гайкой, тормозным диском и суппортом. Всё слито в один меш с цветами вершин.
 */
function wheelGeo(r: number, w: number, rim: string, style: number) {
  const key = `${r}|${w}|${rim}|${style}`;
  let g = wheelCache.get(key); if (g) return g;
  const parts: { geo: THREE.BufferGeometry; m: THREE.Matrix4; c: THREE.Color }[] = [];
  const tire = new THREE.Color('#141416'), side = new THREE.Color('#232326'), tread = new THREE.Color('#0d0d0f');
  const rc = new THREE.Color(rim), hub = new THREE.Color('#4a4d53'), dark = new THREE.Color('#16181b');
  const disc = new THREE.Color('#9aa0a8'), cal = new THREE.Color('#b45309');
  const push = (geo: THREE.BufferGeometry, m: THREE.Matrix4, c: THREE.Color) => parts.push({ geo, m: m.clone(), c });
  // покрышка: основное тело + боковины чуть уже
  push(T.cyl16, M(0, 0, 0, 0, r, w, r, 0, Math.PI / 2), tire);
  for (const sx of [1, -1]) push(T.cyl16, M(sx * (w / 2 + 0.004), 0, 0, 0, r * 0.995, 0.02, r * 0.995, 0, Math.PI / 2), side);
  // протектор: 18 шашечек по ободу
  const blocks = 18;
  for (let i = 0; i < blocks; i++) {
    const a = (i / blocks) * Math.PI * 2;
    for (const sx of [1, -1]) {
      push(T.box, M(sx * w * 0.26, Math.cos(a) * (r + 0.004), Math.sin(a) * (r + 0.004), 0, w * 0.4, 0.04, 0.1, a).clone(), tread);
    }
  }
  // тормозной диск и суппорт (видны сквозь спицы)
  push(T.cyl, M(0, 0, 0, 0, r * 0.72, w * 0.22, r * 0.72, 0, Math.PI / 2), dark);
  push(T.cyl, M(0, 0, 0, 0, r * 0.62, w * 0.3, r * 0.62, 0, Math.PI / 2), disc);
  push(T.box, M(w * 0.34, r * 0.44, 0, 0, 0.05, r * 0.24, r * 0.3, 0.4).clone(), cal);
  // диск: тарелка, обод и спицы
  const spokes = style === 2 ? 8 : style === 1 ? 6 : style === 3 ? 10 : 5;
  const rimR = r * 0.66;
  for (const sx of [1, -1]) push(T.cyl, M(sx * (w / 2 - 0.02), 0, 0, 0, rimR, 0.03, rimR, 0, Math.PI / 2), rc);
  push(T.cyl, M(0, 0, 0, 0, rimR * 0.94, w * 0.72, rimR * 0.94, 0, Math.PI / 2), rc);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    for (const sx of [1, -1]) {
      // спица от ступицы к ободу, слегка наклонённая «в тарелку»
      const len = rimR * 0.92;
      push(T.box, M(sx * (w / 2 - 0.028), -Math.sin(a) * len * 0.42, Math.cos(a) * len * 0.42, 0, 0.035, len, style === 3 ? 0.05 : 0.085, a).clone(), style === 3 ? hub : rc);
      // тонкая спица-«раздвоение» для многолучевых дисков
      if (style === 2 || style === 3) push(T.box, M(sx * (w / 2 - 0.03), -Math.sin(a + 0.09) * len * 0.4, Math.cos(a + 0.09) * len * 0.4, 0, 0.03, len * 0.82, 0.03, a + 0.09).clone(), rc);
    }
  }
  // ступица, колпачок и гайки
  push(T.cyl, M(0, 0, 0, 0, rimR * 0.3, w * 0.8, rimR * 0.3, 0, Math.PI / 2), hub);
  for (const sx of [1, -1]) push(T.cyl, M(sx * (w / 2 - 0.005), 0, 0, 0, rimR * 0.16, 0.03, rimR * 0.16, 0, Math.PI / 2), dark);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    push(T.cyl, M(w / 2 - 0.01, Math.cos(a) * rimR * 0.42, Math.sin(a) * rimR * 0.42, 0, 0.022, 0.03, 0.022, 0, Math.PI / 2), hub);
  }
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
/** сторона остекления: лобовое, заднее, левое (x>0) и правое (x<0) */
export type WindowSide = 'front' | 'rear' | 'left' | 'right';
interface GlassPane { side: WindowSide; m: THREE.Matrix4; w: number; h: number; yMin: number; yMax: number; matKey: string; mesh: THREE.Mesh | null; broken: boolean }
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
  /** базовая высота кузова (от неё считается гидравлика) */
  bodyBaseY = 0;
  /** подъём кузова гидравликой, м (колёса остаются на земле) */
  bodyLift = 0;
  neon: THREE.Mesh | null = null;
  /** отдельные стёкла: каждое можно разбить выстрелом */
  glassPanes: GlassPane[] = [];
  private glassGroup = new THREE.Group();
  /** номерной знак X000XX 00 (CanvasTexture на заднем бампере) */
  plate: THREE.Mesh | null = null;
  plateKey = '';
  headGlow: string[] = [];
  spec: VSpec; color: string; tuning: Tuning;
  private cur!: Part;
  private steerHandle: THREE.Object3D | null = null;
  lightsOn = false;
  /** горят ли стоп-сигналы */
  braking = false;
  /** аварийка */
  hazards = false;
  private hazardMeshes: THREE.Mesh[] = [];
  private tailMeshes: THREE.Mesh[] = [];
  private sirenMeshes: THREE.Mesh[] = [];
  /** налипшая грязь: пятна по низу кузова, включаются уровнем загрязнения */
  private mudMeshes: THREE.Mesh[] = [];
  dirtLevel = 0;
  constructor(type: string, color?: string, tuning?: Tuning) {
    this.spec = VEHICLES[type] ?? VEHICLES.lada;
    this.color = color ?? this.spec.colors[0];
    this.tuning = tuning ?? defaultTuning();
    this.group.add(this.body);
    this.glassGroup.matrixAutoUpdate = true;
    this.body.add(this.glassGroup);
    this.driver = { x: 0.36, y: 0.55, z: 0, pose: 'drive', scale: 0.92 };
    this.passenger = { x: -0.36, y: 0.55, z: -1, pose: 'passenger', scale: 0.92 };
    this.construct();
    this.rebuild();
    if (this.spec.body !== 'heli' && this.spec.body !== 'scooter') {
      const blob = new THREE.Mesh(T.plane, mat('blob'));
      blob.rotation.x = -Math.PI / 2; blob.scale.set(this.spec.wid + 0.7, this.spec.len + 0.6, 1); blob.position.y = 0.04; blob.renderOrder = 1;
      this.group.add(blob);
      this.buildMud();
    }
  }
  /** пятна грязи на порогах и арках — видны при уровне > 0.15 */
  private buildMud() {
    const L = this.spec.len, W = this.spec.wid;
    const spots: [number, number, number, number, number, number][] = [
      [W * 0.5 + 0.01, 0.42, L * 0.18, 0.03, 0.3, L * 0.5],
      [-W * 0.5 - 0.01, 0.42, L * 0.18, 0.03, 0.3, L * 0.5],
      [W * 0.5 + 0.01, 0.36, -L * 0.3, 0.03, 0.34, L * 0.28],
      [-W * 0.5 - 0.01, 0.36, -L * 0.3, 0.03, 0.34, L * 0.28],
      [0, 0.3, L * 0.48, W * 0.6, 0.2, 0.04],
      [0, 0.3, -L * 0.48, W * 0.6, 0.2, 0.04],
    ];
    for (const [x, y, z, w, h, d] of spots) {
      const m = new THREE.Mesh(T.box, mat('c:#6b5540'));
      m.position.set(x, y, z); m.scale.set(w, h, d); m.visible = false;
      m.userData.matKey = 'c:#6b5540';
      this.group.add(m); this.mudMeshes.push(m);
    }
  }
  /** уровень грязи 0…1 (визуально) */
  setDirt(level: number) {
    this.dirtLevel = Math.max(0, Math.min(1, level));
    const on = this.dirtLevel > 0.15 ? Math.ceil((this.dirtLevel - 0.15) / 0.85 * this.mudMeshes.length) : 0;
    this.mudMeshes.forEach((m, i) => (m.visible = i < on));
  }
  /** заменить/подкачать колёса: возвращает сколько колёс восстановлено */
  repairWheels(): number {
    let n = 0;
    for (const w of this.wheels) {
      if (!w.visible || w.userData.flat) n++;
      w.visible = true; w.userData.flat = false;
      const mesh = (w.userData.spin as THREE.Group).children[0] as THREE.Mesh | undefined;
      if (mesh) mesh.scale.set(1, 1, 1);
    }
    return n;
  }
  flatCount() { return this.wheels.filter((w) => w.userData.flat).length; }
  // ---------- построение деталей ----------
  private part(name: string, detachable = true) { this.cur = { name, items: [], detachable, attached: true, center: new THREE.Vector3(), visible: true }; this.parts.push(this.cur); return this.cur; }
  private add(matKey: string, tpl: THREE.BufferGeometry, m: THREE.Matrix4) { this.cur.items.push({ mat: matKey, tpl, m: m.clone() }); }
  private box(mk: string, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) { this.add(mk, T.box, M(x, y, z, ry, w, h, d, rx, rz)); }
  private cyl(mk: string, x: number, y: number, z: number, r: number, len: number, axis: 'x' | 'y' | 'z') {
    this.add(mk, T.cyl, axis === 'y' ? M(x, y, z, 0, r, len, r) : axis === 'x' ? M(x, y, z, 0, r, len, r, 0, Math.PI / 2) : M(x, y, z, 0, r, len, r, Math.PI / 2));
  }
  /** лобовое/заднее стекло — отдельная деталь, чтобы его можно было прострелить */
  private glassPane(x: number, y0: number, z0: number, y1: number, z1: number, w: number) {
    const dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dy, dz);
    const side: WindowSide = z0 + z1 >= 0 ? 'front' : 'rear';
    this.addPane(side, M(x, (y0 + y1) / 2, (z0 + z1) / 2, 0, w, len, 1, Math.atan2(dz, dy)),
      w, len, Math.min(y0, y1), Math.max(y0, y1));
  }
  /** боковое стекло */
  private sideGlass(x: number, y0: number, y1: number, z0: number, z1: number) {
    this.addPane(x >= 0 ? 'left' : 'right',
      M(x, (y0 + y1) / 2, (z0 + z1) / 2, Math.PI / 2, Math.abs(z1 - z0), y1 - y0, 1),
      Math.abs(z1 - z0), y1 - y0, Math.min(y0, y1), Math.max(y0, y1));
  }
  private addPane(side: WindowSide, m: THREE.Matrix4, w: number, h: number, yMin: number, yMax: number) {
    this.glassPanes.push({ side, m: m.clone(), w, h, yMin, yMax, matKey: '', mesh: null, broken: false });
  }
  /** собрать стёкла отдельными мешами (разбитые остаются разбитыми) */
  private buildGlass() {
    const key = this.resolveMat('GLASS');
    for (const p of this.glassPanes) {
      if (p.broken) { if (p.mesh) p.mesh.visible = false; continue; }
      if (p.mesh && p.matKey === key) { p.mesh.visible = true; continue; }
      if (p.mesh) { this.glassGroup.remove(p.mesh); p.mesh = null; }
      const mesh = new THREE.Mesh(T.plane, mat(key));
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(p.m);
      mesh.matrixWorldNeedsUpdate = true;
      mesh.renderOrder = 3;
      mesh.userData.glass = true;
      p.mesh = mesh; p.matKey = key;
      this.glassGroup.add(mesh);
    }
  }
  /** сколько стёкол целых */
  glassLeft() { return this.glassPanes.filter((p) => !p.broken).length; }
  /** разбить стекло нужной стороны; возвращает true, если что-то разбилось */
  breakWindow(side?: WindowSide): boolean {
    const list = this.glassPanes.filter((p) => !p.broken && (!side || p.side === side));
    const p = list[0] ?? null;
    if (!p) return false;
    p.broken = true; if (p.mesh) p.mesh.visible = false;
    return true;
  }
  /** попадание в кузов: по локальным координатам определяем, какое стекло пробито */
  breakWindowAt(lx: number, ly: number, lz: number): WindowSide | null {
    const halfW = this.spec.wid / 2;
    let side: WindowSide = Math.abs(lx) > halfW * 0.62 ? (lx > 0 ? 'left' : 'right') : (lz > 0 ? 'front' : 'rear');
    const fits = (p: GlassPane) => ly >= p.yMin - 0.14 && ly <= p.yMax + 0.16;
    let p = this.glassPanes.find((g) => !g.broken && g.side === side && fits(g));
    if (!p) p = this.glassPanes.find((g) => !g.broken && fits(g));
    if (!p) return null;
    p.broken = true; if (p.mesh) p.mesh.visible = false;
    return p.side;
  }
  /** все стёкла целы (для ремонта) */
  repairGlass() {
    for (const p of this.glassPanes) { p.broken = false; if (p.mesh) p.mesh.visible = true; }
  }
  private construct() {
    const brokenSides = new Set(this.glassPanes.filter((p) => p.broken).map((p) => p.side));
    this.glassPanes = [];
    this.extraSeats = [];
    const s = this.spec;
    const PAINT = 'PAINT', DARK = 'c:#1f2024', TRIM = 'TRIM', HEAD = 'HEAD', TAIL = 'glow:#ff1a1a', INT = 'c:#3a3a41', PLATE = 'c:#f1f1f1';
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
    // колёсные арки (тёмные) + расширители арок и брызговики
    const axleZ = [L / 2 - L * 0.19, -L / 2 + L * 0.2];
    for (const zz of axleZ) for (const sx of [1, -1]) {
      this.box(DARK, sx * (W / 2 - 0.02), clear + r * 0.45, zz, 0.06, r * 0.9, r * 2.3);
      this.box(PAINT, sx * (W / 2 - 0.01), clear + r * 1.42, zz, 0.05, 0.07, r * 2.5);         // расширитель арки
      this.box('c:#111', sx * (W / 2 - 0.14), clear - 0.08, zz + (zz > 0 ? -r * 1.1 : r * 1.1), 0.05, 0.26, 0.12); // брызговик
    }
    // пороги под дверями
    for (const sx of [1, -1]) this.box(DARK, sx * (W / 2 - 0.06), clear + 0.02, (z0 + z1) / 2, 0.1, 0.11, Math.abs(z1 - z0) * 0.94);
    // салон
    this.part('interior', false);
    this.box(INT, 0, clear + 0.08, (z0 + z1) / 2, W - 0.2, 0.06, z1 - z0); // пол
    const seatY = clear + 0.18;
    const sf = z1 - 0.95 - (s.body === 'van' ? 0.2 : 0);
    for (const sx of [0.36, -0.36]) { this.box(INT, sx * W / 1.8, seatY, sf, 0.48, 0.14, 0.5); this.box(INT, sx * W / 1.8, seatY + 0.35, sf - 0.27, 0.48, 0.62, 0.12, -0.15); }
    if (c.doors === 4) { this.box(INT, 0, seatY, sf - 0.9, W - 0.3, 0.14, 0.5); this.box(INT, 0, seatY + 0.33, sf - 1.15, W - 0.3, 0.6, 0.12, -0.12); }
    const dashZ = z1 - 0.5;                       // задняя кромка торпедо (к водителю)
    this.box('c:#232327', 0, beltY - 0.05, dashZ + 0.2, W - 0.2, 0.26, 0.4); // торпедо
    this.box('c:#2c2c32', 0, beltY + 0.08, dashZ + 0.22, W - 0.24, 0.04, 0.36); // накладка сверху
    this.box('glow:#7dd3fc', W * 0.2, beltY + 0.03, dashZ + 0.02, 0.25, 0.07, 0.02); // подсветка приборов
    // — подробности салона: консоль, щиток приборов, рычаг, ручник, педали, подголовники, карты дверей
    const consZ = dashZ - 0.24;
    this.box('c:#26262b', 0, (clear + beltY) / 2 - 0.02, consZ, 0.24, beltY - clear - 0.04, 0.46); // центральная консоль
    this.box('glow:#38bdf8', 0, beltY - 0.2, consZ - 0.2, 0.18, 0.13, 0.02);   // медиаэкран
    this.box('c:#0b0b0d', 0, beltY - 0.02, consZ - 0.2, 0.2, 0.06, 0.06);      // дефлекторы
    this.box('c:#101012', 0, beltY - 0.11, consZ - 0.12, 0.16, 0.03, 0.1);      // полка консоли
    // щиток приборов перед водителем: два циферблата со стрелками
    const ix = W * 0.2, clusterZ = dashZ - 0.02;
    this.box('c:#0b0b0d', ix, beltY - 0.02, clusterZ, 0.44, 0.2, 0.05);
    this.add('c:#e5e7eb', T.torus, M(ix - 0.1, beltY - 0.02, clusterZ - 0.04, 0, 0.075, 0.075, 0.05));
    this.add('c:#e5e7eb', T.torus, M(ix + 0.1, beltY - 0.02, clusterZ - 0.04, 0, 0.075, 0.075, 0.05));
    this.box('c:#f97316', ix - 0.1, beltY - 0.02, clusterZ - 0.07, 0.012, 0.055, 0.012, 0, 0, 0.5);
    this.box('c:#38bdf8', ix + 0.1, beltY - 0.02, clusterZ - 0.07, 0.012, 0.055, 0.012, 0, 0, -0.4);
    // рычаг КПП и ручник
    this.box('c:#111114', 0.04, clear + 0.3, consZ + 0.04, 0.045, 0.3, 0.045, 0.34);
    this.add('c:#27272a', T.sphere, M(0.06, clear + 0.46, consZ - 0.08, 0, 0.055, 0.05, 0.055));
    this.box('c:#111114', -0.16, clear + 0.26, consZ + 0.12, 0.045, 0.26, 0.045, -0.75);
    // педали
    this.box('c:#111114', W * 0.13, clear + 0.12, dashZ + 0.02, 0.1, 0.12, 0.03, 0.25);
    this.box('c:#111114', W * 0.27, clear + 0.12, dashZ + 0.02, 0.1, 0.12, 0.03, 0.25);
    // подголовники и боковая поддержка кресел
    for (const sx of [0.36, -0.36]) {
      this.box(INT, sx * W / 1.8, seatY + 0.66, sf - 0.32, 0.32, 0.17, 0.1);
      this.box(INT, sx * W / 1.8 - 0.26, seatY + 0.2, sf, 0.07, 0.18, 0.46);
      this.box(INT, sx * W / 1.8 + 0.26, seatY + 0.2, sf, 0.07, 0.18, 0.46);
      this.box('c:#4b4b52', sx * W / 1.8, seatY + 0.38, sf - 0.18, 0.07, 0.5, 0.02, -0.14); // ремень
    }
    // карты дверей с ручками и подлокотниками
    for (const sx of [1, -1]) {
      const xw = sx * (W / 2 - 0.14);
      this.box('c:#2f2f35', xw, (clear + beltY) / 2, (z0 + z1) / 2, 0.06, beltY - clear - 0.1, (z1 - z0) * 0.86);
      this.box('chrome', sx * (W / 2 - 0.2), beltY - 0.16, z1 - 0.55, 0.05, 0.05, 0.16);
      this.box('c:#36363c', xw + sx * 0.06, (clear + beltY) / 2 - 0.06, (z0 + z1) / 2, 0.12, 0.07, (z1 - z0) * 0.5);
    }
    // салонное зеркало, козырьки, потолок, плафон
    this.box('c:#111114', 0, H - 0.13, (roofF + z1) / 2 - 0.05, 0.24, 0.07, 0.04);
    for (const sx of [1, -1]) this.box('c:#33333a', sx * W * 0.22, H - 0.1, roofF - 0.12, W * 0.3, 0.02, 0.18);
    this.box('c:#33333a', 0, H - 0.1, (roofF + roofR) / 2, W - 0.36, 0.02, roofF - roofR - 0.05);
    this.box('glow:#fef9c3', 0, H - 0.13, (roofF + roofR) / 2, 0.16, 0.03, 0.1);
    // посадка: голова (с причёской) гарантированно ниже крыши
    const dy = seatY + 0.07, sc = Math.min(0.9, (H - 0.08 - dy) / 0.97);
    this.driver = { x: W * 0.2, y: dy, z: sf, pose: 'drive', scale: sc };
    this.passenger = { x: -W * 0.2, y: dy, z: sf, pose: 'passenger', scale: sc };
    this.extraSeats = c.doors === 4 ? [{ x: W * 0.2, y: dy, z: sf - 0.85, pose: 'passenger', scale: sc * 0.97 }, { x: -W * 0.2, y: dy, z: sf - 0.85, pose: 'passenger', scale: sc * 0.97 }] : [];
    // руль
    this.part('steer', false);
    const swZ = sf + 0.34;
    this.add('c:#26262c', T.torus, M(W * 0.2, beltY + 0.03, swZ, 0, 0.18, 0.18, 0.18, -0.5));
    this.add('c:#3a3a44', T.cyl, M(W * 0.2, beltY + 0.03, swZ, 0, 0.06, 0.05, 0.06, -0.5, Math.PI / 2));
    for (const a of [0, 2.1, -2.1]) this.box('c:#33333a', W * 0.2 + Math.sin(a) * 0.08, beltY + 0.03 + Math.cos(a) * 0.08, swZ, 0.03, 0.16, 0.03, -0.5, 0, a);
    this.box('c:#1d1d22', W * 0.2, beltY - 0.05, swZ + 0.12, 0.05, 0.05, 0.3, -0.5);
    // крыша, стойки, стёкла
    this.part('roof', false);
    // дворники на лобовом
    if (s.body !== 'van') for (const sx of [1, -1]) this.box('c:#111114', sx * W * 0.17, beltY + 0.09, z1 - 0.06, 0.015, 0.36, 0.015, -0.9, 0, sx * 0.15);
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
      // антенна-плавник
      if (s.body !== 'pickup') this.box(DARK, -W * 0.3, H + 0.09, roofR + 0.18, 0.05, 0.1, 0.22, 0.35);
      // третий стоп-сигнал и рейлинги-водостоки
      this.box('glow:#ff1a1a', 0, H - 0.06, z0 - 0.02, W * 0.4, 0.04, 0.02);
      for (const sx of [1, -1]) this.box(DARK, sx * (W / 2 - 0.06), H - 0.02, (roofF + roofR) / 2, 0.03, 0.03, roofF - roofR);
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
      else {
        this.box('c:#141416', sx * W * 0.36, bodyTop - 0.13, L / 2 - 0.02, W * 0.21, (old ? 0.16 : 0.1) + 0.03, 0.05); // корпус фары
        this.box(HEAD, sx * W * 0.36, bodyTop - 0.13, L / 2 + 0.005, W * 0.18, old ? 0.16 : 0.1, 0.05);
      }
      this.box('c:#141416', sx * W * 0.38, bodyTop - 0.1, -L / 2 - 0.005, W * 0.19, 0.12, 0.04); // корпус фонаря
      this.box(TAIL, sx * W * 0.38, bodyTop - 0.1, -L / 2 - 0.02, W * 0.18, 0.1, 0.04);
      // повторители поворота на крыле и катафоты в бампере
      this.box('glow:#f59e0b', sx * (W / 2 + 0.02), beltY - 0.22, z1 - 0.3, 0.02, 0.05, 0.11);
      this.box(TAIL, sx * W * 0.33, clear + 0.14, -L / 2 - 0.14, W * 0.1, 0.04, 0.02);
    }
    if (ev) { this.box(HEAD, 0, bodyTop - 0.08, L / 2 + 0.005, W * 0.35, 0.025, 0.04); this.box(TAIL, 0, bodyTop - 0.1, -L / 2 - 0.005, W * 0.8, 0.03, 0.04); }
    // противотуманки в бампере
    for (const sx of [1, -1]) this.box(HEAD, sx * W * 0.28, clear + 0.13, L / 2 + 0.1, W * 0.11, 0.06, 0.03);
    this.part('bumperR');
    this.box(bumperMat, 0, clear + 0.1, -L / 2 - 0.06, W + 0.04, 0.22, 0.16);
    this.box(PLATE, 0, clear + 0.28, -L / 2 - 0.02, 0.5, 0.12, 0.02);
    if (!ev) { this.part('exhaust'); this.cyl('chrome', W * 0.3, clear + 0.02, -L / 2 - 0.1, 0.04, 0.3, 'z'); if (s.body === 'sport') this.cyl('chrome', -W * 0.3, clear + 0.02, -L / 2 - 0.1, 0.05, 0.3, 'z'); }
    if (this.tuning.spoiler || s.body === 'sport') {
      this.part('spoiler');
      this.box(PAINT, 0, beltY + 0.25, -L / 2 + 0.2, W - 0.2, 0.04, 0.3);
      for (const sx of [1, -1]) this.box('c:#111', sx * W * 0.32, beltY + 0.12, -L / 2 + 0.22, 0.04, 0.22, 0.08);
    }
    // ---------- стилевой пакет: у каждой линейки свой характер ----------
    this.part('trim', false);
    const trim: 'classic' | 'modern' | 'ev' | 'sport' | 'lux' | 'offroad' = s.body === 'sport' ? 'sport' : ev ? 'ev'
      : old ? 'classic' : s.body === 'suv' || s.body === 'pickup' ? 'offroad' : s.price >= 400000 ? 'lux' : 'modern';
    const sillZ = (z0 + z1) / 2, sillLen = Math.abs(z1 - z0) * 0.9;
    if (trim === 'classic') {
      // круглые фары в хромированных ободах, хром по борту, шильдик
      for (const sx of [1, -1]) {
        this.add('chrome', T.torus, M(sx * W * 0.36, bodyTop - 0.13, L / 2 + 0.04, 0, W * 0.09, W * 0.1, 0.05));
        this.box('chrome', sx * (W / 2 + 0.015), beltY - 0.06, sillZ, 0.02, 0.035, sillLen);
        this.box('c:#1b1b1e', sx * (W / 2 + 0.01), clear + 0.02, sillZ, 0.02, 0.06, sillLen * 0.9);
      }
      this.box('chrome', 0, clear + 0.34, L / 2 + 0.035, W * 0.46, 0.02, 0.02);
      this.box('chrome', 0, bodyTop + 0.05, z1 + hoodLen / 2, 0.03, 0.02, hoodLen * 0.7);
    } else if (trim === 'modern') {
      // светодиодная нить фар, чёрные накладки, шильдик
      for (const sx of [1, -1]) {
        this.box(HEAD, sx * W * 0.34, bodyTop - 0.055, L / 2 + 0.03, W * 0.2, 0.02, 0.03);
        this.box('c:#0d0d0f', sx * (W / 2 + 0.012), clear + 0.16, sillZ, 0.02, 0.09, sillLen * 0.86);
      }
      this.box('chrome', 0, bodyTop - 0.24, L / 2 + 0.05, W * 0.52, 0.03, 0.02);
    } else if (trim === 'ev') {
      // закрытая морда, световая полоса, розетка на крыле, гладкое днище
      this.box(PAINT, 0, (clear + 0.24 + bodyTop) / 2, L / 2 + 0.03, W * 0.62, bodyTop - clear - 0.32, 0.04);
      this.box('c:#0b1a24', 0, (clear + 0.24 + bodyTop) / 2, L / 2 + 0.055, W * 0.5, 0.04, 0.01);
      this.box('glow:#7dd3fc', W / 2 + 0.02, beltY - 0.26, z1 - 0.16, 0.02, 0.11, 0.11);
      this.box('c:#0f1115', 0, clear - 0.02, 0, W - 0.1, 0.05, L * 0.9);
      for (const sx of [1, -1]) this.box('c:#e2e8f0', sx * W * 0.2, beltY - 0.32, -L / 2 - 0.02, W * 0.16, 0.02, 0.01);
    } else if (trim === 'sport') {
      // сплиттер, диффузор, юбки, жабры на крыльях
      this.box('c:#111114', 0, clear - 0.03, L / 2 + 0.08, W * 0.94, 0.05, 0.22);
      this.box('c:#111114', 0, clear - 0.03, -L / 2 - 0.06, W * 0.9, 0.05, 0.2);
      for (let i = -2; i <= 2; i++) this.box('c:#1d1d21', i * W * 0.13, clear + 0.02, -L / 2 - 0.05, 0.03, 0.14, 0.16);
      for (const sx of [1, -1]) {
        this.box(PAINT, sx * (W / 2 + 0.03), clear + 0.04, sillZ, 0.05, 0.1, sillLen);
        for (let i = 0; i < 3; i++) this.box('c:#111114', sx * (W / 2 + 0.03), beltY - 0.34, z1 - 0.55 - i * 0.14, 0.03, 0.05, 0.08);
      }
      this.box(PAINT, 0, H + 0.02, (roofF + roofR) / 2, W * 0.34, 0.03, 0.5);
    } else if (trim === 'lux') {
      // хром-молдинг, панорамная крыша, рамка решётки
      for (const sx of [1, -1]) {
        this.box('chrome', sx * (W / 2 + 0.015), beltY - 0.055, sillZ, 0.022, 0.03, sillLen);
        this.box('c:#0e0e11', sx * (W / 2 + 0.012), clear + 0.13, sillZ, 0.02, 0.1, sillLen * 0.9);
        this.add('chrome', T.torus, M(sx * W * 0.36, bodyTop - 0.13, L / 2 + 0.05, 0, W * 0.1, W * 0.11, 0.05));
      }
      this.box('glass:0.4', 0, H - 0.005, (roofF + roofR) / 2, W * 0.72, 0.02, Math.max(0.4, (roofF - roofR) * 0.72));
      this.box('chrome', 0, H - 0.04, (roofF + roofR) / 2, W * 0.78, 0.02, Math.max(0.5, (roofF - roofR) * 0.8));
      this.box('chrome', 0, clear + 0.3, L / 2 + 0.035, W * 0.66, 0.02, 0.02);
    } else {
      // offroad: защита, трубы-пороги, шноркель, лебёдка, люстра на крыше
      this.box('c:#3f4650', 0, clear - 0.05, L * 0.28, W - 0.2, 0.05, L * 0.34);
      for (const sx of [1, -1]) {
        this.cyl('c:#2a2f36', sx * (W / 2 + 0.02), clear + 0.02, sillZ, 0.07, sillLen, 'z');   // труба-порог вдоль борта
        this.box('c:#22262b', sx * (W / 2 + 0.01), clear + 0.24, z1 - 0.1, 0.03, 0.3, 0.5);
      }
      this.add('c:#1c1f24', T.cyl, M(W * 0.24, clear + 0.26, L / 2 + 0.2, 0, 0.09, 0.12, 0.09, 0, Math.PI / 2));
      this.box('c:#2b3037', W * 0.42, beltY + 0.15, z1 - 0.06, 0.09, 0.5, 0.09);
      if (s.body !== 'van') {
        this.box('c:#1b1f24', 0, H + 0.06, roofF - 0.14, W * 0.8, 0.07, 0.08);
        for (const sx of [1, -1]) this.box(HEAD, sx * W * 0.28, H + 0.06, roofF - 0.1, W * 0.16, 0.05, 0.05);
        for (const sx of [1, -1]) this.box('c:#22262b', sx * (W / 2 - 0.14), H + 0.03, (roofF + roofR) / 2, 0.05, 0.05, roofF - roofR);
      }
    }
    // шильдик и эмблема
    this.box('chrome', 0, bodyTop - 0.2, -L / 2 - 0.005, 0.16, 0.035, 0.02);
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
    // ---------- «качество»: линии кузова, хром, мелкие детали ----------
    this.part('body_detail', false);
    const sideY = beltY - 0.26;
    for (const sx of [1, -1]) {
      // ребро-подштамповка по борту и нижний молдинг
      this.box(PAINT, sx * (W / 2 + 0.006), sideY, (z0 + z1) / 2, 0.012, 0.05, Math.abs(z1 - z0) * 0.98);
      this.box('c:#1b1d21', sx * (W / 2 + 0.004), clear + 0.1, (z0 + z1) / 2, 0.016, 0.05, Math.abs(z1 - z0) * 0.9);
      // хромированная окантовка стёкол по поясу
      this.box(trim === 'lux' || trim === 'classic' ? 'chrome' : 'c:#0d0d10', sx * (W / 2 + 0.002), beltY - 0.03, (z0 + z1) / 2, 0.022, 0.03, Math.abs(z1 - z0) * 0.96);
      // лючок бензобака и антенна
      this.box('c:#15171b', sx * (W / 2 + 0.004), beltY - 0.34, -L * 0.3, 0.014, 0.16, 0.16);
      // брызговики перед задним колесом и подсветка порога
      this.box('c:#101114', sx * (W / 2 - 0.06), clear - 0.02, (z0 + z1) / 2, 0.03, 0.03, Math.abs(z1 - z0) * 0.7);
    }
    // нижняя защита и «тень» под кузовом
    this.box('c:#16181c', 0, clear - 0.09, 0, W - 0.24, 0.06, L * 0.82);
    // капот: две линии жёсткости, замок и форсунки омывателя
    for (const sx of [1, -1]) this.box(PAINT, sx * W * 0.16, bodyTop + 0.05, z1 + hoodLen * 0.5, 0.04, 0.03, hoodLen * 0.8);
    this.box('c:#101114', 0, clear + 0.12, L / 2 + 0.02, W * 0.2, 0.08, 0.05);
    for (const sx of [1, -1]) this.box('c:#0d0d10', sx * W * 0.22, bodyTop + 0.05, z1 + 0.08, 0.05, 0.02, 0.05);
    // спойлер-«губа» под передним бампером и диффузор сзади
    this.box('c:#141518', 0, clear - 0.02, L / 2 + 0.02, W * 0.86, 0.06, 0.22);
    if (s.body !== 'van') this.box('c:#141518', 0, clear - 0.02, -L / 2 - 0.02, W * 0.8, 0.06, 0.18);
    // крыша с плавным скатом (визуально не «коробка»)
    if (s.body !== 'van' && s.body !== 'pickup') {
      this.box(PAINT, 0, H + 0.005, (roofF + roofR) / 2, W * 0.86, 0.05, Math.max(0.3, roofF - roofR - 0.1));
      for (const sx of [1, -1]) this.box(PAINT, sx * W * 0.42, H - 0.02, (roofF + roofR) / 2, 0.08, 0.06, Math.max(0.3, roofF - roofR - 0.2));
    }
    // индивидуальные акценты по модели
    const id = s.id;
    if (s.body === 'pickup') {
      // кузов: вкладыш, рейлинги борта, ящик и петли
      this.box('c:#2b2f34', 0, bodyTop + 0.06, (-L / 2 + z0) / 2, W - 0.2, 0.04, z0 + L / 2 - 0.28);
      for (const sx of [1, -1]) this.box('chrome', sx * (W / 2 - 0.05), beltY + 0.02, (-L / 2 + z0) / 2, 0.05, 0.05, z0 + L / 2 - 0.2);
      this.box('c:#3f3f46', -(W * 0.3), bodyTop + 0.18, -L / 2 + 0.55, W * 0.3, 0.28, 0.4);
      this.box('chrome', 0, beltY - 0.06, -L / 2 - 0.05, 0.5, 0.07, 0.03);
    }
    if (s.body === 'van') {
      this.box('c:#d1d5db', 0, H + 0.06, L * 0.02, 0.7, 0.12, 0.7);          // вентиляция на крыше
      for (const sx of [1, -1]) this.box('chrome', sx * W * 0.26, beltY + 0.2, -L / 2 - 0.05, 0.06, 0.1, 0.03); // ручки задних дверей
      this.box('c:#111', 0, beltY - 0.02, -L / 2 - 0.03, W * 0.9, 0.03, 0.02);
    }
    if (s.body === 'suv') {
      for (const sx of [1, -1]) this.box('c:#22262b', sx * (W / 2 + 0.02), clear + 0.16, (z0 + z1) / 2 + 0.3, 0.08, 0.06, Math.abs(z1 - z0) * 0.6); // подножки
      this.box('c:#9ca3af', W * 0.3, clear - 0.04, L / 2 + 0.12, 0.1, 0.1, 0.12); // буксировочный крюк
    }
    if (s.body === 'hatch') this.box(PAINT, 0, beltY + 0.34, z0 - 0.06, W * 0.7, 0.05, 0.22, -0.15);
    if (trim === 'sport' || id === 'ferrato' || id === 'noir' || id === 'eclipse' || id === 'phoenix' || id === 'velaris' || id === 'losx' || id === 'turtle') {
      // V8/V12: воздухозаборники, жабры, сдвоенный выхлоп, карбон
      for (const sx of [1, -1]) {
        this.box('c:#0b0b0e', sx * W * 0.24, bodyTop + 0.06, z1 + hoodLen * 0.35, W * 0.14, 0.045, 0.5);
        for (let i = 0; i < 3; i++) this.box('c:#111', sx * (W / 2 + 0.012), beltY - 0.42, -0.1 - i * 0.16, 0.02, 0.05, 0.1);
      }
      this.part('exhaust');
      for (const sx of [1, -1]) this.cyl('chrome', sx * W * 0.22, clear + 0.02, -L / 2 - 0.1, 0.055, 0.3, 'z');
    }
    if (trim === 'lux') {
      this.box('chrome', 0, beltY - 0.02, L / 2 + 0.03, W * 0.5, 0.03, 0.02);
      for (const sx of [1, -1]) this.box('chrome', sx * (W / 2 + 0.012), beltY - 0.03, (z0 + z1) / 2, 0.02, 0.035, Math.abs(z1 - z0) * 0.9);
    }
    // колёса
    const wz = [L / 2 - L * 0.19, -L / 2 + L * 0.2];
    for (const zz of wz) for (const sx of [1, -1]) this.addWheel(sx * (W / 2 - 0.12), r, zz, r, 0.24, zz > 0);
    // неон
    this.addNeon(W, L);
    for (const p of this.glassPanes) if (brokenSides.has(p.side)) p.broken = true;
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
      this.glassPane(0, H * 0.36, L / 2, H * 0.9, L / 2, W - 0.15);
      this.sideGlass(-W / 2 - 0.015, H * 0.42, H * 0.85, L / 2 - 2.2, L / 2 - 0.4);
      this.cyl('c:#111', -W / 2 - 0.02, H * 0.45, L / 2 - 1.4, 0.03, H * 0.75, 'z');
      this.box('c:#111', -W / 2 - 0.02, H * 0.45, -0.5, 0.03, H * 0.75, 1.1);
      this.box('glow:#fbbf24', 0, H - 0.22, L / 2 + 0.02, W * 0.6, 0.2, 0.02);
      this.driver = { x: W * 0.25, y: 1.05, z: L / 2 - 1.2, pose: 'drive', scale: 1 };
      this.passenger = { x: -W * 0.25, y: 1.05, z: L / 2 - 2.6, pose: 'passenger', scale: 1 };
      this.extraSeats = [0, 1, 2, 3, 4, 5].map((i) => ({ x: (i % 2 ? -1 : 1) * W * 0.25, y: 1.05, z: L / 2 - 4.0 - Math.floor(i / 2) * 1.6, pose: 'passenger' as const, scale: 1 }));
      this.part('interior', false);
      this.box(INT, 0, 0.95, L / 2 - 1.9, W - 0.7, 0.12, 2.6);                       // пол кабины
      this.box('c:#18181b', W * 0.25, 1.35, L / 2 - 1.0, 1.6, 0.5, 0.35);             // торпедо
      this.box('glow:#7dd3fc', W * 0.25, 1.5, L / 2 - 1.18, 0.7, 0.22, 0.02);         // приборы
      this.box(INT, W * 0.25, 1.05, L / 2 - 1.5, 0.6, 0.16, 0.6);                     // сиденье
      this.box(INT, W * 0.25, 1.45, L / 2 - 1.78, 0.6, 0.8, 0.14, -0.12);             // спинка
      this.box(INT, W * 0.25, 1.95, L / 2 - 1.85, 0.36, 0.2, 0.12);                   // подголовник
      for (let i = 0; i < 6; i++) this.box(INT, (i % 2 ? -1 : 1) * W * 0.25, 1.05, L / 2 - 4.0 - Math.floor(i / 2) * 1.6, 0.55, 0.14, 0.55);
      this.box('glow:#fef9c3', 0, 2.55, 0, W * 0.5, 0.05, 0.4);                       // плафон салона
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
      this.glassPane(0, H * 0.5, cz + cabL / 2, H * 0.86, cz + cabL / 2, W - 0.2);
      for (const sx of [1, -1]) this.sideGlass(sx * (W / 2 + 0.015), H * 0.52, H * 0.84, cz + 0.1, cz + cabL / 2 - 0.15);
      if (!nose) this.box('chrome', 0, 1.0, L / 2 + 0.02, W * 0.6, 0.6, 0.04);
      this.box(INT, 0, 1.4, cz - 0.3, W - 0.3, 0.2, 0.6);                              // моторный тоннель
      this.box('c:#18181b', W * 0.25, 1.7, cz + cabL / 2 - 0.25, 1.5, 0.45, 0.3);      // торпедо
      this.box('glow:#7dd3fc', W * 0.25, 1.85, cz + cabL / 2 - 0.42, 0.6, 0.2, 0.02);  // приборы
      this.box(INT, W * 0.25, 1.5, cz - 0.3, 0.55, 0.16, 0.55);                        // сиденье
      this.box(INT, W * 0.25, 1.9, cz - 0.6, 0.55, 0.75, 0.12, -0.1);                  // спинка
      this.box(INT, W * 0.25, 2.35, cz - 0.66, 0.34, 0.2, 0.12);                       // подголовник
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
    // доп. детали шасси: топливный бак, ресиверы, брызговики, ступеньки, задний брус
    this.part('chassis2', false);
    if (s.body !== 'bus') {
      this.cyl('chrome', -(W / 2 - 0.2), 0.7, L * 0.1, 0.22, 1.2, 'z');
      for (const sx of [1, -1]) this.cyl('c:#4b5563', sx * 0.55, 0.74, -L * 0.08, 0.13, 0.7, 'z');
      for (const sx of [1, -1]) this.box('c:#111', sx * (W / 2 - 0.32), 0.3, -L / 2 + 1.7, 0.42, 0.5, 0.08);
      for (const sx of [1, -1]) this.box('c:#22262b', sx * (W / 2 - 0.03), 0.5, L / 2 - 2.2, 0.07, 0.5, 0.5);
      this.box('c:#111', 0, 0.42, -L / 2 + 0.08, W - 0.4, 0.12, 0.1);
      this.box('c:#f1f1f1', 0, 0.62, -L / 2 - 0.02, 0.5, 0.12, 0.02);
    } else {
      for (const sx of [1, -1]) {
        this.box('c:#0e1116', sx * (W / 2 + 0.02), 0.95, L / 2 - 3.3, 0.03, 1.5, 1.05);   // двери
        this.box('c:#0e1116', sx * (W / 2 + 0.02), 0.95, -1.2, 0.03, 1.5, 1.05);
        for (let i = 0; i < 4; i++) this.add('c:#e5e7eb', T.cyl, M(sx * (W / 2 - 0.16), H * 0.62, L / 2 - 1.2 - i * 1.3, 0, 0.022, 0.9, 0.022)); // поручни
      }
      this.box('c:#111', 0, 0.55, L / 2 + 0.02, W * 0.5, 0.2, 0.06);
    }
    const wz = s.body === 'semi' ? [L / 2 - 1.2 - (s.variant === 'nose' ? 1.4 : 0), L / 2 - 3.6 - (s.variant === 'nose' ? 1.6 : 0), -L / 2 + 3.4, -L / 2 + 2.2, -L / 2 + 1.0] : s.body === 'truck' ? [L / 2 - 1.2, -L / 2 + 2.0, -L / 2 + 0.9] : [L / 2 - 2.0, -L / 2 + 2.4];
    wz.forEach((zz, i) => { for (const sx of [1, -1]) this.addWheel(sx * (W / 2 - 0.2), r, zz, r, 0.35, i === 0); });
  }
  private buildMoto() {
    const PAINT = 'PAINT';
    const style: 'naked' | 'sport' | 'cruiser' | 'enduro' = this.spec.moto ?? (this.spec.id === 'molnia' ? 'sport' : 'naked');
    const sport = style === 'sport', cruiser = style === 'cruiser', enduro = style === 'enduro';
    const BLK = 'c:#16171a', GRY = 'c:#3c3f45', AL = 'chrome', ENG = 'c:#8d939b', RUB = 'c:#101114';
    // геометрия: у каждого стиля своя база, высота седла и колесо
    const r = sport ? 0.33 : cruiser ? 0.35 : enduro ? 0.34 : 0.32;
    this.wheelR = r;
    const zf = sport ? 0.74 : cruiser ? 0.84 : enduro ? 0.76 : 0.72;
    const zr = cruiser ? -0.78 : sport ? -0.7 : -0.72;
    const seatY = enduro ? 0.98 : sport ? 0.86 : cruiser ? 0.76 : 0.84;
    const wb = zf - zr;
    // ---- рама, маятник, двигатель ----
    this.part('frame', false);
    if (cruiser) {
      // стальная рама-«колыбель», V-образный двигатель, кожаные кофры
      this.box(GRY, 0, 0.62, zf - 0.06, 0.08, 0.08, 0.5, -0.55);
      this.box(GRY, 0, 0.4, 0.1, 0.08, 0.08, 0.9, 0.12);
      for (const sx of [1, -1]) this.box(GRY, sx * 0.1, 0.3, 0.2, 0.05, 0.05, 0.62, 0.5);
      this.box(BLK, 0, 0.36, -0.02, 0.3, 0.24, 0.4);                       // картер
      for (const sx of [1, -1]) this.add('c:#5b6068', T.cylB, M(sx * 0.14, 0.42, 0.16, 0, 0.1, 0.34, 0.1, -0.42, sx * 0.5));
      for (let i = 0; i < 6; i++) this.add('c:#6f747c', T.torus, M(0, 0.3 + i * 0.035, 0.14, 0, 0.13, 0.13, 0.03));
      this.cyl('c:#2b2d31', 0, 0.34, -0.12, 0.13, 0.28, 'x');              // корзина сцепления
      this.box('c:#1d2126', 0, 0.5, 0.4, 0.32, 0.2, 0.1, -0.3);            // радиатор
    } else {
      this.box(GRY, 0, 0.66, 0.12, 0.07, 0.07, 0.95, -0.42);              // верхняя труба рамы
      for (const sx of [1, -1]) this.box(GRY, sx * 0.08, 0.5, 0.18, 0.04, 0.32, 0.04, 0.5); // нижние трубы
      this.box(BLK, 0, 0.42, -0.02, 0.26, 0.26, 0.44);                    // картер
      if (enduro) {
        this.add(ENG, T.cylB, M(0, 0.5, 0.14, 0, 0.13, 0.34, 0.13, -0.25));           // высокий цилиндр
        for (let i = 0; i < 6; i++) this.box('c:#6b7078', 0, 0.58 + i * 0.035, 0.11, 0.3, 0.014, 0.13, -0.25); // рёбра
      } else {
        for (let i = 0; i < 2; i++) this.box('c:#55595f', 0, 0.62, 0.12 + i * 0.06, 0.24, 0.2, 0.04, -0.3); // цилиндры
        for (let i = 0; i < 5; i++) this.box('c:#6b7078', 0, 0.56 + i * 0.03, 0.14, 0.27, 0.012, 0.11, -0.3); // рёбра охлаждения
      }
      this.cyl('c:#2b2d31', 0, 0.38, -0.06, 0.11, 0.3, 'x');               // крышка сцепления
      this.box('c:#1f2937', 0, sport ? 0.6 : 0.62, 0.36, sport ? 0.32 : 0.3, sport ? 0.24 : 0.2, 0.05, -0.25); // радиатор
    }
    // маятник, цепь, амортизаторы
    for (const sx of [1, -1]) this.box(GRY, sx * 0.1, r + 0.04, (zr - 0.05) / 2, 0.045, 0.07, Math.abs(zr) + 0.12, 0.08);
    if (cruiser) { for (const sx of [1, -1]) this.box(AL, sx * 0.15, r + 0.12, zr + 0.2, 0.05, 0.05, 0.5, 0.32); }
    this.box(BLK, -0.12, r + 0.02, (zr - 0.05) / 2, 0.02, 0.09, Math.abs(zr), 0.08); // цепь
    for (const sx of sport ? [1, -1] : [0]) this.box('c:#8b8f96', sx * 0.1, 0.6, -0.34, 0.045, 0.3, 0.045, -0.42); // амортизатор
    // подножки
    for (const sx of [1, -1]) {
      this.box(AL, sx * (cruiser ? 0.26 : enduro ? 0.19 : 0.2), enduro ? 0.4 : 0.33, cruiser ? -0.14 : enduro ? -0.16 : -0.2, 0.14, 0.025, 0.04);
      if (enduro) this.box(RUB, sx * 0.16, 0.34, -0.02, 0.03, 0.02, 0.12); // зубчатая подножка
    }
    // ---- бак ----
    this.part('tank');
    if (cruiser) {
      this.add(PAINT, profile('mototankTear', [[-0.5, 0], [-0.45, 0.6], [-0.15, 1], [0.3, 0.92], [0.5, 0.4], [0.5, 0]]), M(0, seatY - 0.04, 0.14, 0, 0.44, 0.24, 0.68));
      this.box(AL, 0, seatY + 0.19, 0.12, 0.1, 0.02, 0.1);                 // хромированная крышка
      for (const sx of [1, -1]) this.box(PAINT, sx * 0.22, seatY - 0.08, 0.14, 0.06, 0.14, 0.5); // «капли» бака
    } else if (enduro) {
      this.add(PAINT, profile('mototankSmall', [[-0.5, 0], [-0.5, 0.7], [0.1, 1], [0.5, 0.5], [0.5, 0]]), M(0, seatY - 0.08, 0.16, 0, 0.28, 0.24, 0.46));
      this.box('c:#f8fafc', 0, seatY + 0.08, 0.1, 0.12, 0.06, 0.24);     // накладка с номером
    } else {
      this.add(PAINT, profile('mototank', [[-0.5, 0], [-0.5, 0.55], [-0.2, 1], [0.35, 0.95], [0.5, 0.45], [0.5, 0]]), M(0, 0.72, 0.18, 0, sport ? 0.36 : 0.32, sport ? 0.24 : 0.22, 0.52));
      this.box('chrome', 0, sport ? 0.97 : 0.95, 0.17, 0.07, 0.02, 0.07);  // крышка бака
    }
    // ---- седло ----
    this.part('seat', false);
    if (cruiser) {
      this.box(RUB, 0, seatY + 0.02, -0.3, 0.3, 0.09, 0.6, 0.05);          // диван
      this.box(RUB, 0, seatY + 0.12, -0.62, 0.28, 0.09, 0.22, 0.16);       // пассажирская подушка
      this.box(AL, 0, seatY + 0.34, -0.78, 0.03, 0.44, 0.03, 0.18);        // спинка-«сиссибар»
      this.box(AL, 0, seatY + 0.54, -0.82, 0.24, 0.04, 0.04);
    } else if (enduro) {
      this.box(RUB, 0, seatY + 0.02, -0.24, 0.2, 0.07, 0.66, 0.02);        // длинное узкое седло
      this.box(RUB, 0, seatY + 0.1, -0.6, 0.18, 0.06, 0.2, 0.1);
    } else {
      this.box(RUB, 0, seatY, -0.27, 0.27, 0.08, sport ? 0.42 : 0.5, 0.04);
      if (!sport) this.box(RUB, 0, seatY + 0.03, -0.56, 0.24, 0.07, 0.2, 0.12);
      if (sport) this.box(RUB, 0, seatY + 0.08, -0.56, 0.18, 0.05, 0.16, 0.2); // «горб» пассажира
    }
    // ---- хвост и фонарь ----
    this.part('tail');
    if (sport) {
      this.add(PAINT, profile('mototailSport', [[-0.5, 0], [-0.5, 0.55], [0.15, 1], [0.5, 0.85], [0.5, 0]]), M(0, 0.8, -0.62, 0, 0.24, 0.2, 0.44));
      this.box('c:#0b0b0e', 0, 0.9, -0.82, 0.2, 0.12, 0.06, -0.3);
    } else if (enduro) {
      this.box(PAINT, 0, seatY - 0.02, -0.62, 0.2, 0.1, 0.34, -0.15);
      this.box('c:#111', 0, seatY + 0.14, -0.72, 0.26, 0.05, 0.16);         // багажная площадка
    } else {
      this.add(PAINT, profile('mototail', [[-0.5, 0], [-0.5, 0.7], [0.5, 1], [0.5, 0]]), M(0, 0.76, -0.62, 0, 0.22, 0.14, 0.42));
    }
    this.box('glow:#ff1a1a', 0, seatY, zr - 0.1, cruiser ? 0.18 : 0.13, 0.05, 0.03);
    for (const sx of [1, -1]) this.box('glow:#f59e0b', sx * 0.17, seatY - 0.02, zr - 0.04, 0.05, 0.04, 0.03);
    this.box('c:#f1f1f1', 0, r + 0.24, zr - 0.14, 0.16, 0.09, 0.01, 0.35);  // номер
    this.box(BLK, 0, r + 0.3, zr - 0.06, 0.05, 0.12, 0.05, 0.6);
    // ---- выхлоп ----
    this.part('exhaust');
    if (sport) {
      this.box(AL, -0.12, 0.42, 0.2, 0.05, 0.05, 0.22, -0.9);
      this.box(AL, -0.15, 0.32, -0.08, 0.05, 0.05, 0.42, 0.05);
      for (const sx of [1, -1]) { this.cyl(AL, sx * 0.1, seatY - 0.04, -0.5, 0.055, 0.42, 'z'); this.cyl('c:#111', sx * 0.1, seatY - 0.04, -0.72, 0.035, 0.02, 'z'); }
    } else if (cruiser) {
      for (const sx of [1, -1]) { this.box(AL, sx * 0.16, 0.34, 0.16, 0.06, 0.06, 0.5, -0.5); this.cyl(AL, sx * 0.2, 0.24, -0.4, 0.06, 0.8, 'z'); this.cyl('c:#111', sx * 0.2, 0.24, -0.8, 0.04, 0.02, 'z'); }
    } else if (enduro) {
      this.box(AL, 0.12, 0.5, 0.1, 0.05, 0.05, 0.3, -0.8);
      this.cyl(AL, 0.2, 0.66, -0.3, 0.055, 0.5, 'z');
      this.cyl('c:#111', 0.2, 0.66, -0.56, 0.04, 0.02, 'z');
    } else {
      this.box(AL, -0.12, 0.42, 0.2, 0.05, 0.05, 0.22, -0.9);
      this.box(AL, -0.15, 0.32, -0.08, 0.05, 0.05, 0.42, 0.05);
      this.cyl(AL, -0.17, 0.42, -0.5, 0.055, 0.5, 'z');
      this.cyl('c:#111', -0.17, 0.42, -0.76, 0.04, 0.02, 'z');
    }
    // ---- вилка, руль, приборы ----
    this.part('fork', false);
    const rake = enduro ? 0.5 : cruiser ? 0.5 : sport ? 0.4 : 0.38;
    const fy = 0.62, fz = zf - 0.1;
    const barY = enduro ? 1.06 : cruiser ? 0.98 : sport ? 0.94 : 0.98;
    const barZ = zf - (cruiser ? 0.36 : enduro ? 0.24 : 0.26);
    for (const sx of [1, -1]) {
      this.box(AL, sx * 0.075, fy, fz, 0.04, enduro ? 0.74 : 0.62, 0.04, rake);
      this.box(BLK, sx * 0.075, fy - 0.2, fz + 0.075, 0.05, enduro ? 0.26 : 0.22, 0.05, rake);
      if (sport) this.box('c:#c2410c', sx * 0.075, fy + 0.28, fz - 0.1, 0.055, 0.05, 0.16, rake); // регулировки вилки
    }
    this.box(GRY, 0, barY - 0.06, barZ + 0.06, 0.2, 0.04, 0.08, rake);     // траверса
    this.box(BLK, 0, barY, barZ, cruiser ? 0.8 : enduro ? 0.78 : sport ? 0.6 : 0.66, 0.03, 0.03); // руль
    for (const sx of [1, -1]) {
      this.box('c:#0a0a0a', sx * (cruiser ? 0.36 : enduro ? 0.35 : sport ? 0.27 : 0.3), barY, barZ, 0.1, 0.045, 0.045); // грипсы
      this.box(AL, sx * 0.24, barY + 0.1, barZ + 0.04, 0.015, 0.16, 0.015);   // стойки зеркал
      this.box(AL, sx * 0.24, barY + 0.19, barZ + 0.04, 0.09, 0.05, 0.02);    // зеркала
      this.box('c:#cfd3da', sx * 0.3, barY - 0.02, barZ - 0.06, 0.14, 0.015, 0.015, 0, 0, sx * 0.12); // рычаги
    }
    if (cruiser) this.box(AL, 0, barY + 0.02, barZ + 0.1, 0.3, 0.06, 0.02, -0.2); // хромированная панель
    this.box('c:#111', 0, barY + 0.02, barZ - 0.06, cruiser ? 0.16 : 0.12, 0.06, 0.06); // приборка
    this.box('glow:#7dd3fc', 0, barY + 0.05, barZ - 0.07, 0.08, 0.02, 0.04);
    // ---- свет ----
    this.part('lightsF', false);
    if (sport) {
      for (const sx of [1, -1]) this.box('HEAD', sx * 0.07, seatY - 0.02, zf + 0.0, 0.09, 0.05, 0.04, -0.5);
    } else if (enduro) {
      this.box('HEAD', 0, seatY - 0.06, fz + 0.1, 0.18, 0.14, 0.05, -0.2);   // прямоугольная маска
      this.add('c:#111', T.torus, M(0, seatY - 0.06, fz + 0.13, 0, 0.13, 0.12, 0.05));
      this.box('c:#000000', 0, seatY + 0.06, fz + 0.06, 0.14, 0.1, 0.02, -0.3); // номер на маске
    } else {
      this.add('HEAD', T.cyl, M(0, cruiser ? 0.92 : 0.86, fz - 0.04, 0, cruiser ? 0.1 : 0.09, 0.06, cruiser ? 0.1 : 0.09, Math.PI / 2));
      this.add('chrome', T.cyl, M(0, cruiser ? 0.92 : 0.86, fz - 0.08, 0, cruiser ? 0.11 : 0.1, 0.06, cruiser ? 0.11 : 0.1, Math.PI / 2));
    }
    // ---- обвес / ветровик / крылья ----
    if (sport) {
      this.part('fairing');
      this.add(PAINT, profile('motofair', [[-0.5, 0], [-0.5, 0.75], [-0.1, 1], [0.5, 0.35], [0.5, 0]]), M(0, 0.6, zf - 0.32, 0, 0.36, 0.42, 0.42));
      this.box('GLASS', 0, 1.02, zf - 0.22, 0.26, 0.16, 0.02, -0.7);
      for (const sx of [1, -1]) this.box(PAINT, sx * 0.17, 0.5, 0.12, 0.02, 0.24, 0.5);
      this.box(PAINT, 0, 0.34, -0.1, 0.26, 0.1, 0.5);                       // нижний обвес
      this.box(PAINT, 0, 0.7, -0.72, 0.2, 0.05, 0.3, -0.35);
    } else if (cruiser) {
      this.part('fairing');
      this.box('glass:0.3', 0, barY + 0.34, barZ + 0.06, 0.4, 0.42, 0.02, -0.3);  // высокий ветровик
      for (const sx of [1, -1]) this.box(AL, sx * 0.2, barY + 0.16, barZ + 0.06, 0.02, 0.3, 0.02);
    } else if (enduro) {
      this.part('fairing');
      this.box(PAINT, 0, 0.72, zf - 0.1, 0.3, 0.16, 0.1, -0.2);              // щиток
      for (const sx of [1, -1]) this.box('c:#1f2937', sx * 0.11, 0.5, 0.02, 0.03, 0.2, 0.24); // защиты радиатора
    }
    this.part('fenderF');
    if (enduro) this.box(PAINT, 0, r + 0.34, zf + 0.06, 0.18, 0.04, 0.5, -0.12); // высокое крыло
    else this.add(PAINT, T.torus, M(0, r, zf, Math.PI / 2, r + 0.05, r + 0.05, cruiser ? 0.5 : 0.4, 0, 0));
    this.part('fenderR');
    this.box(PAINT, 0, r + (enduro ? 0.4 : 0.3), zr + 0.05, enduro ? 0.2 : 0.16, 0.03, enduro ? 0.4 : 0.36, -0.3);
    // ---- тормоза, звезда, подножка ----
    for (const zz of [zf, zr]) {
      this.add('c:#b8bcc4', T.cyl, M(0, r, zz, 0, r * (cruiser ? 0.66 : 0.72), 0.018, r * (cruiser ? 0.66 : 0.72), 0, Math.PI / 2));
      this.add('c:#d4d4d8', T.cyl, M(0, r, zz, 0, r * 0.3, 0.02, r * 0.3, 0, Math.PI / 2));
      for (const sx of [1, -1]) this.box('c:#c2410c', sx * 0.09, r + r * 0.45, zz, 0.05, 0.1, 0.13, 0.3);
    }
    this.add('c:#6b7078', T.cyl, M(-0.11, r, zr, 0, r * 0.42, 0.02, r * 0.42, 0, Math.PI / 2));
    this.box('c:#222', -0.13, r + 0.12, (zr + 0.1) / 2, 0.02, 0.06, Math.abs(zr) * 0.8, 0.09);
    this.box('c:#3c3f45', -0.18, 0.28, -0.1, 0.04, 0.3, 0.04, 0, 0, 0.5);   // боковая подножка
    this.box('c:#222', -0.25, 0.15, -0.1, 0.1, 0.03, 0.05);
    // ---- колёса (крутятся вместе с корпусом: станты) ----
    this.addWheel(0, r, zf, r, sport ? 0.13 : cruiser ? 0.12 : 0.11, true, sport ? 2 : enduro ? 3 : 2, this.body);
    this.addWheel(0, r, zr, r, cruiser ? 0.2 : sport ? 0.18 : 0.14, false, sport ? 2 : enduro ? 3 : 2, this.body);
    this.driver = { x: 0, y: seatY + 0.07, z: cruiser ? -0.26 : -0.22, pose: 'ride', scale: 1 };
    this.passenger = { x: 0, y: seatY + (cruiser ? 0.17 : 0.13), z: -0.52, pose: 'ridepass', scale: 1 };
    this.axles = { f: zf, r: zr };
    void ENG; void wb;
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
    // суппорт тормоза остаётся на месте, когда колесо вращается
    const cal = new THREE.Mesh(T.box, mat('c:#c2410c'));
    cal.scale.set(0.055, r * 0.26, r * 0.3); cal.position.set(w * 0.34, r * 0.42, 0); cal.rotation.x = 0.4;
    pivot.add(cal);
    pivot.userData.spin = spin; pivot.userData.r = r; pivot.userData.x = x; pivot.userData.w = w; pivot.userData.y = y;
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
    if (k === 'HEAD') return 'glow:' + (this.tuning.rainbow ? '#ff00e5' : this.lightsOn ? '#ffffff' : this.tuning.lights === '#fff8e0' ? '#e8e4cf' : this.tuning.lights);
    if (k === 'SIREN_R') return 'glow:#ef4444';
    if (k === 'SIREN_B') return 'glow:#3b82f6';
    if (k === 'TRIM') return 'c:#222';
    return k;
  }
  rebuild() {
    for (const m of this.meshes) { this.body.remove(m); m.geometry.dispose(); }
    this.meshes = [];
    const b = new Batcher();
    for (const p of this.parts) if (p.attached && p.visible !== false) for (const it of p.items) b.add(this.resolveMat(it.mat), it.tpl, it.m);
    const ms = b.build({ cast: true });
    for (const m of ms) { this.body.add(m); this.meshes.push(m); }
    this.sirenMeshes = ms.filter((m) => m.userData.matKey === 'glow:#ef4444' || m.userData.matKey === 'glow:#3b82f6');
    this.tailMeshes = ms.filter((m) => m.userData.matKey === 'glow:#ff1a1a');
    this.hazardMeshes = ms.filter((m) => m.userData.matKey === 'glow:#f59e0b');
    this.applyBrakeMat();
    this.bodyBaseY = this.spec.body === 'heli' || this.spec.body === 'combine' || this.spec.body === 'moto' || this.spec.body === 'scooter' ? 0 : this.tuning.clearance * 0.06;
    this.applyLift();
    // стёкла — отдельными мешами, чтобы разбивать по одному
    for (const p of this.glassPanes) { if (p.mesh) { this.glassGroup.remove(p.mesh); p.mesh = null; } }
    this.buildGlass();
  }
  /** показать/скрыть внешнюю оболочку машины (для вида салона изнутри в первом лице) */
  setExteriorVisible(visible: boolean) {
    for (const p of this.parts) {
      const isInterior = p.name === 'interior' || p.name === 'steer';
      p.visible = visible || isInterior;
    }
    for (const w of this.wheels) w.visible = visible;
    if (this.plate) { this.plate.visible = visible; }
    if (this.neon) { this.neon.visible = visible; }
    this.rebuild();
  }
  /** гидравлика: кузов поднимается, колёса остаются на дороге */
  applyLift() {
    this.body.position.y = this.bodyBaseY + this.bodyLift;
    for (const w of this.wheels) {
      if (w.parent !== this.body) continue;                       // колёса на кузове — компенсируем подъём
      w.position.y = ((w.userData.y as number) ?? 0) - this.bodyLift;
    }
  }
  setLights(on: boolean) { if (on !== this.lightsOn) { this.lightsOn = on; this.rebuild(); } }
  /** включить/выключить стоп-сигналы (ярче обычных габаритов) */
  setBrake(on: boolean) { if (on !== this.braking) { this.braking = on; this.applyBrakeMat(); } }
  setHazard(on: boolean) { this.hazards = on; for (const m of this.hazardMeshes) m.visible = on; }
  /** мигание аварийки (вызывать каждый кадр) */
  updateHazard(t: number) { if (!this.hazards) return; const v = Math.floor(t * 2.2) % 2 === 0; for (const m of this.hazardMeshes) m.visible = v; }
  private applyBrakeMat() {
    const key = this.braking ? 'glow:#ff5a3c' : 'glow:#ff1a1a';
    const m = mat(key);
    for (const t of this.tailMeshes) t.material = m;
  }
  sirens(t: number) { for (const m of this.sirenMeshes) m.visible = (Math.floor(t * 4) + (m.userData.matKey.includes('ef4444') ? 0 : 1)) % 2 === 0; }
  /** задний номерной знак: CanvasTexture, обновляется при смене номера */
  updatePlate() {
    const num = (this.tuning.plate ?? '').trim();
    const key = num || '';
    if (key === this.plateKey && (this.plate || !num)) return;
    this.plateKey = key;
    if (this.plate) { this.group.remove(this.plate); (this.plate.material as THREE.MeshBasicMaterial).map?.dispose(); this.plate = null; }
    if (!num || this.spec.body === 'heli' || this.spec.body === 'moto' || this.spec.body === 'scooter' || this.spec.body === 'combine') return;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = '#f8fafc'; g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#1f2937'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 60);
    g.fillStyle = '#000000'; g.font = 'bold 38px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(num, 128, 34);
    g.fillStyle = '#1d4ed8'; g.fillRect(200, 0, 56, 22);
    g.fillStyle = '#fff'; g.font = 'bold 15px system-ui, sans-serif'; g.fillText('RUS', 228, 11);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const w = Math.min(0.62, this.spec.wid * 0.32), h = w * 0.25;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: false }));
    m.position.set(0, this.spec.hei * 0.3, -this.spec.len / 2 - 0.02);
    m.rotation.y = Math.PI;
    this.plate = m;
    this.group.add(m);
  }
  /** перелив радужных фар (вызывается каждый кадр) */
  updateRainbow(t: number) {
    if (!this.tuning.rainbow) return;
    const hue = (t * 0.25) % 1;
    const col = new THREE.Color().setHSL(hue, 1, 0.6);
    for (const mesh of this.meshes) {
      const mat = mesh.material as THREE.MeshBasicMaterial & { color?: THREE.Color };
      if (mat && mat.color && (mat as unknown as { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial) mat.color.copy(col);
    }
  }
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
    this.updatePlate();
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
  /** попадание в шину: локальные координаты точки — спускаем ближайшее колесо */
  deflateTire(lx: number, ly: number, lz: number): THREE.Object3D | null {
    let best: THREE.Object3D | null = null; let bd = 1e9;
    for (const w of this.wheels) {
      if (w.userData.flat || !w.visible) continue;
      const r = w.userData.r as number;
      const dz = Math.abs(w.position.z - lz), dx = Math.abs(w.position.x - lx);
      if (dz > 1.15 || dx > 1.5) continue;
      if (ly > w.position.y + r * 1.9 || ly < 0) continue;
      const d = Math.hypot(dz, dx);
      if (d < bd) { bd = d; best = w; }
    }
    if (!best) return null;
    best.userData.flat = true;
    const spin = best.userData.spin as THREE.Group;
    const mesh = spin.children[0] as THREE.Mesh | undefined;
    if (mesh) mesh.scale.set(1.06, 0.66, 1.06);   // спущенная шина «расплющена»
    return best;
  }
  /** сколько шин спущено */
  flatTires() { return this.wheels.filter((w) => w.userData.flat).length; }
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
  repairAll() {
    this.parts.forEach((p) => (p.attached = true));
    this.wheels.forEach((w) => {
      w.visible = true; w.userData.flat = false;
      const mesh = (w.userData.spin as THREE.Group).children[0] as THREE.Mesh | undefined;
      if (mesh) mesh.scale.set(1, 1, 1);
    });
    this.repairGlass(); this.rebuild();
  }
  /** поставить на место все отлетевшие кузовные детали */
  repairParts(): number {
    let n = 0;
    for (const p of this.parts) if (!p.attached) { p.attached = true; n++; }
    if (n) this.rebuild();
    return n;
  }
  setMissing(names: string[]) { this.parts.forEach((p) => { if (names.includes(p.name)) p.attached = false; }); this.rebuild(); }
  /** анимация колёс и руля */
  animate(dist: number, steer: number) {
    for (const w of this.wheels) { (w.userData.spin as THREE.Group).rotation.x += dist / (w.userData.r as number); }
    // знак зеркальный: при steer > 0 машина поворачивает влево, значит и колёса влево
    for (const w of this.frontWheels) w.rotation.y = -steer * 0.5;
    if (this.steerHandle) this.steerHandle.rotation.z = -steer;
  }
  dispose() { for (const m of this.meshes) m.geometry.dispose(); this.group.parent?.remove(this.group); }
}
