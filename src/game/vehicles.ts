// Транспорт: сущность, физика игрока (передачи, станты, вертолёт), ИИ-водитель по дорожному графу
import * as THREE from 'three';
import { VehicleModel } from './vehicleModel';
import type { VSpec } from './data';
import type { WorldLayout } from './worldgen';
import { astar } from './worldgen';
import type { Collision } from './collision';
import { angleDiff, clamp } from './config';
import { T } from './geom';
import { mat } from './textures';
import type { OwnedVehicle } from './state';

export type VRole = 'traffic' | 'police' | 'taxi' | 'static' | 'owned' | 'service' | 'aicombine' | 'job' | 'deco' | 'remote' | 'parked' | 'rental' | 'npcpuppet';
let VID = 1;
const GEAR_TOP = [0, 0.22, 0.38, 0.55, 0.72, 0.87, 1.0];
const GEAR_ACC = [0, 1.45, 1.2, 1.0, 0.82, 0.68, 0.56];

export interface DriveInput { throttle: number; brake: number; steer: number; handbrake: boolean; wheelie: boolean; up: number }
export class Vehicle {
  id = VID++;
  model: VehicleModel; spec: VSpec; role: VRole;
  x = 0; y = 0; z = 0; heading = 0; speed = 0; vy = 0; steer = 0;
  gear = 1; autoMode: 'N' | 'D' = 'D'; rpm = 800; throttle = 0;
  condition = 1; fuel = 100; mileage = 0;
  owned: OwnedVehicle | null = null;
  ai: AIDriver | null = null;
  dummy: THREE.Object3D | null = null;
  slip = 0; driftT = 0; driftScore = 0; wheelie = 0; wheelieV = 0; stuntT = 0; stuntDist = 0; lean = 0; pitch = 0; heliPower = 0; rotorSpeed = 0;
  shock = 0; // время «оглушения» после удара
  hasDriver = false;
  sirens = false;
  constructor(type: string, role: VRole, color?: string, owned?: OwnedVehicle) {
    this.model = new VehicleModel(type, color ?? owned?.color, owned?.tuning);
    this.spec = this.model.spec; this.role = role;
    if (owned) { this.owned = owned; this.condition = owned.condition; this.fuel = owned.fuel; this.mileage = owned.mileage; if (owned.missing.length) this.model.setMissing(owned.missing); }
  }
  get isMoto() { return this.spec.body === 'moto'; }
  get isHeli() { return this.spec.body === 'heli'; }
  get isRide() { return this.spec.body === 'moto' || this.spec.body === 'quad' || this.spec.body === 'scooter'; }
  get canStunt() { return this.spec.body === 'moto' || this.spec.body === 'scooter'; }
  get isScooter() { return this.spec.body === 'scooter'; }
  get radius() { return Math.max(this.spec.wid, this.spec.len) / 2; }
  addDummyDriver() {
    if (this.dummy || this.isHeli) return;
    const g = new THREE.Group();
    const s = this.model.driver;
    const torso = new THREE.Mesh(T.box, mat('c:' + ['#1d4ed8', '#dc2626', '#16a34a', '#111827', '#f59e0b'][this.id % 5]));
    torso.scale.set(0.38, 0.5, 0.22); torso.position.set(0, 0.3, 0);
    const head = new THREE.Mesh(T.box, mat('c:' + ['#f1c9a5', '#c68642', '#e0ac69'][this.id % 3]));
    head.scale.set(0.2, 0.23, 0.21); head.position.set(0, 0.7, 0);
    g.add(torso, head); g.position.set(s.x, s.y, s.z);
    if (this.isRide) { torso.rotation.x = 0.35; head.position.z = 0.2; }
    this.model.body.add(g); this.dummy = g;
  }
  removeDummy() { if (this.dummy) { this.dummy.parent?.remove(this.dummy); this.dummy = null; } }
  place(x: number, z: number, a: number, y = 0) { this.x = x; this.z = z; this.heading = a; this.y = y; this.sync(); }
  sync() {
    const g = this.model.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.set(0, this.heading, 0);
    const body = this.model.body;
    if (this.canStunt) {
      // наклон в повороте — вокруг пятна контакта; вилли/стоппи — вокруг оси заднего/переднего колеса
      g.rotateZ(this.lean);
      const th = this.wheelie, a = -th; const r = this.model.wheelR;
      const pz = th >= 0 ? this.model.axles.r : this.model.axles.f;
      const ca = Math.cos(a), sa = Math.sin(a);
      body.rotation.set(a, 0, 0);
      body.position.set(0, r - (r * ca - pz * sa), pz - (r * sa + pz * ca));
      return;
    }
    g.rotation.y = this.heading + this.slip; // занос: кузов развёрнут относительно траектории
    body.rotation.set(-this.wheelie * 0.5 + this.pitch, 0, this.lean);
  }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  dispose() { this.model.dispose(); }
}

// ---------- физика игрока ----------
export interface DriveResult { impact: number; nx: number; nz: number; flip?: boolean; stunt?: { kind: string; t: number; dist: number } }
export function playerDrive(v: Vehicle, inp: DriveInput, dt: number, col: Collision, manual: boolean, waterAt: (x: number, z: number) => boolean): DriveResult {
  const s = v.spec;
  if (v.isHeli) return heliDrive(v, inp, dt, col);
  const tun = v.model.tuning;
  let maxSp = s.maxSpeed * (1 + tun.turbo * 0.08 + tun.engine * 0.05);
  let acc = s.accel * (1 + tun.turbo * 0.25 + tun.engine * 0.15);
  if (v.condition < 0.2) maxSp *= 0.5;
  const mw = v.model.missingWheels(); if (mw > 0) maxSp *= v.isMoto ? 0.1 : 0.3;
  if (v.isScooter) v.fuel = 100;
  if (v.fuel <= 0) acc = 0;
  const inWater = waterAt(v.x, v.z);
  if (inWater) maxSp = Math.min(maxSp, 2.5);
  // передачи
  let g = v.gear;
  if (!manual) {
    if (v.autoMode === 'N') g = 0;
    else { // автомат: подбор передачи по скорости
      const ratio = Math.abs(v.speed) / maxSp; g = 1; while (g < 6 && ratio > GEAR_TOP[g] * 0.92) g++;
      v.gear = g;
    }
  }
  const forwardSp = v.speed;
  let a = 0;
  if (inp.throttle > 0 && g > 0) {
    const top = GEAR_TOP[g] * maxSp, low = g > 1 ? GEAR_TOP[g - 1] * maxSp * 0.45 : -1;
    let k = GEAR_ACC[g];
    if (manual && forwardSp < low) k *= 0.35; // «дёргается» на высокой передаче
    if (forwardSp < top) a = acc * k * inp.throttle; else a = -2; // отсечка
    if (forwardSp < -0.5) a = acc * 2; // движемся назад — газ тормозит
  }
  if (inp.brake > 0) {
    if (forwardSp > 0.5) a -= 11 * inp.brake;
    else if (g !== 0 || !manual) a = -acc * 0.6 * inp.brake; // задний ход
  }
  // дрифт: на пробел на скорости заднюю ось срывает — машина идёт боком, теряя скорость медленно
  const canDrift = !v.isRide && !v.isHeli && v.spec.body !== 'combine';
  const drifting = canDrift && inp.handbrake && Math.abs(forwardSp) > 7 && (Math.abs(inp.steer) > 0.15 || Math.abs(v.slip) > 0.2);
  if (inp.handbrake && !drifting) a -= Math.sign(forwardSp) * 14;
  if (drifting) { a *= 0.45; a -= Math.sign(forwardSp) * (2.4 + Math.abs(v.slip) * 2.8); }
  // сопротивление
  a -= Math.sign(forwardSp) * (0.6 + Math.abs(forwardSp) * 0.025);
  let ns = forwardSp + a * dt;
  if (Math.sign(ns) !== Math.sign(forwardSp) && forwardSp !== 0 && inp.throttle === 0 && inp.brake === 0) ns = 0;
  if (Math.abs(ns) < 0.05 && inp.throttle === 0 && inp.brake === 0) ns = 0;
  ns = clamp(ns, -maxSp * 0.25, maxSp);
  v.speed = ns;
  // обороты
  if (g === 0) v.rpm += ((800 + inp.throttle * 6000) - v.rpm) * Math.min(1, dt * 6);
  else { const top = GEAR_TOP[g] * maxSp; v.rpm = clamp(900 + (Math.abs(v.speed) / top) * 6100, 850, 7300); }
  v.throttle = inp.throttle;
  if (inp.throttle > 0) v.fuel = Math.max(0, v.fuel - dt * 0.06 * inp.throttle * (s.ev ? 0.7 : 1));
  // руль
  let driftRes: DriveResult['stunt'] | undefined;
  v.steer += (inp.steer - v.steer) * Math.min(1, dt * (inp.steer === 0 ? 5 : 3.2)); // руль набирается плавнее
  const maxSteer = (v.isRide ? 0.6 : 0.52) / (1 + Math.abs(v.speed) * 0.065); // на скорости руль менее острый
  const wb = Math.max(1.2, s.len * 0.6);
  const grip = 1 - Math.min(0.35, Math.max(0, Math.abs(v.speed) - 16) * 0.012 * Math.abs(v.steer)); // снос на скорости
  const slipping = Math.abs(v.slip) > 0.12;
  v.heading -= (v.speed / wb) * Math.tan(v.steer * maxSteer) * dt * (drifting ? 1.3 : slipping ? 1.15 : 1) * (drifting ? 1 : grip);
  if (canDrift) {
    const target = drifting ? clamp(-v.steer * 0.85, -0.85, 0.85) * Math.min(1, Math.abs(v.speed) / 14) : 0;
    v.slip += (target - v.slip) * Math.min(1, dt * (drifting ? 2.6 : 2.2));
    if (Math.abs(v.slip) > 0.25 && Math.abs(v.speed) > 6) { v.driftT += dt; v.driftScore += Math.abs(v.slip) * Math.abs(v.speed) * dt; }
    else if (v.driftT > 0 && Math.abs(v.slip) < 0.12) { if (v.driftT > 1) driftRes = { kind: 'Дрифт', t: v.driftT, dist: v.driftScore }; v.driftT = 0; v.driftScore = 0; }
  } else v.slip = 0;
  if (grip < 0.98) v.speed *= 1 - (1 - grip) * dt * 0.8;
  // стант — только мотоциклы
  let stuntRes: DriveResult['stunt'] | undefined = driftRes; let flip = false;
  if (v.canStunt) {
    const th = v.wheelie; const sc = v.isScooter; const now = performance.now() / 1000;
    let target = 0, k = 16, c = 6;
    if (inp.wheelie && v.speed > (sc ? 1.5 : 3) && th >= -0.02 && !(inp.brake > 0.5 && th < 0.08 && v.speed > 7)) {
      // вилли: Ctrl поднимает, газ — выше (риск), тормоз — ниже; лёгкое раскачивание растёт со временем
      target = (sc ? 0.32 : 0.5) + inp.throttle * (sc ? 0.22 : 0.36) - inp.brake * 0.45 + Math.sin(now * 2.3 + v.id) * 0.05 * (1 + v.stuntT * 0.15);
      k = 9; c = 3.2;
    } else if (inp.wheelie && inp.brake > 0.5 && v.speed > (sc ? 3 : 6) && th <= 0.02) {
      // стоппи: Ctrl + тормоз — заднее колесо в воздухе
      target = (sc ? -0.22 : -0.3) - inp.brake * 0.12 + Math.sin(now * 3.1) * 0.03; k = 10; c = 3.5;
      v.speed = Math.max(0, v.speed - 4 * dt);
    }
    if (v.speed < 2) target = 0;
    v.wheelieV += ((target - th) * k - v.wheelieV * c) * dt;
    v.wheelie = th + v.wheelieV * dt;
    if (Math.abs(v.wheelie) > 0.15) { v.stuntT += dt; v.stuntDist += Math.abs(v.speed) * dt; }
    else if (v.stuntT > 0 && Math.abs(v.wheelie) < 0.06) { if (v.stuntT > 1.2) stuntRes = { kind: sc ? (th >= 0 ? 'Мэньюал' : 'Нос-мэньюал') : th >= 0 ? 'Вилли' : 'Стоппи', t: v.stuntT, dist: v.stuntDist }; v.stuntT = 0; v.stuntDist = 0; }
    if (v.wheelie > (sc ? 0.75 : 1.08) || v.wheelie < (sc ? -0.45 : -0.62)) { flip = true; v.wheelie = 0; v.wheelieV = 0; v.stuntT = 0; v.stuntDist = 0; }
    if (Math.abs(v.wheelie) > 0.2) v.steer *= 0.85;
  } else v.wheelie = 0;
  v.lean += ((v.isRide ? -v.steer * Math.min(1, Math.abs(v.speed) / 12) * 0.45 : 0) - v.lean) * Math.min(1, dt * 5);
  // перемещение
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const ox = v.x, oz = v.z;
  v.x += fx * v.speed * dt; v.z += fz * v.speed * dt;
  v.mileage += Math.abs(v.speed * dt);
  // коллизии: цепочка кругов вдоль кузова
  const r = s.wid * 0.55; const n = s.len > 6 ? 3 : 2;
  let impact = 0, hnx = 0, hnz = 0;
  for (let i = 0; i < n; i++) {
    const off = (i / (n - 1) - 0.5) * (s.len - s.wid * 0.9);
    const p = { x: v.x + fx * off, z: v.z + fz * off };
    const h = col.pushCircle(p, r, v.y, 1.6, 0.55);
    if (h) {
      v.x += p.x - (v.x + fx * off); v.z += p.z - (v.z + fz * off);
      const into = -(fx * h.nx + fz * h.nz) * v.speed;
      if (into > impact) { impact = into; hnx = h.nx; hnz = h.nz; }
    }
  }
  if (impact > 2.5) v.speed *= -0.2; else if (impact > 0) v.speed *= 0.96;
  if (!isFinite(v.x) || !isFinite(v.z)) { v.x = ox; v.z = oz; v.speed = 0; }
  // высота
  const gy = col.groundAt(v.x, v.z, v.y, 0.6, 0.5);
  v.y += (gy - v.y) * Math.min(1, dt * 12);
  if (inWater) v.y = -0.3;
  v.model.animate(v.speed * dt, v.steer);
  return { impact, nx: hnx, nz: hnz, flip, stunt: stuntRes };
}
function heliDrive(v: Vehicle, inp: DriveInput, dt: number, col: Collision): DriveResult {
  const ground = col.groundAt(v.x, v.z, v.y + 0.5, 1.0, 1.5);
  const onGround = v.y - ground < 0.15;
  v.rotorSpeed = Math.min(1, v.rotorSpeed + dt * (v.hasDriver ? 0.5 : -0.3));
  v.rotorSpeed = Math.max(0, v.rotorSpeed);
  const lift = v.rotorSpeed >= 0.95 ? inp.up : -1;
  v.vy += (lift * 6 - v.vy) * Math.min(1, dt * 1.6);
  if (!v.hasDriver) v.vy = -4;
  v.y += v.vy * dt;
  if (v.y < ground) { v.y = ground; v.vy = 0; }
  if (v.y > 320) { v.y = 320; v.vy = 0; }
  const airborne = v.y - ground > 0.5;
  // горизонталь
  const targetSp = airborne ? inp.throttle * v.spec.maxSpeed - inp.brake * v.spec.maxSpeed * 0.4 : 0;
  v.speed += (targetSp - v.speed) * Math.min(1, dt * 0.9);
  if (airborne) v.heading -= inp.steer * 1.4 * dt;
  v.pitch += ((airborne ? (inp.throttle - inp.brake) * 0.18 : 0) - v.pitch) * Math.min(1, dt * 3);
  v.lean += ((airborne ? -inp.steer * 0.22 : 0) - v.lean) * Math.min(1, dt * 3);
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  v.x += fx * v.speed * dt; v.z += fz * v.speed * dt;
  const p = { x: v.x, z: v.z };
  const h = col.pushCircle(p, 2.2, v.y, 3, 0.3);
  let impact = 0;
  if (h) { impact = Math.abs(v.speed) * 0.5; v.x = p.x; v.z = p.z; v.speed *= 0.3; }
  if (v.model.rotor) v.model.rotor.rotation.y += v.rotorSpeed * dt * 30;
  if (v.model.tailRotor) v.model.tailRotor.rotation.x += v.rotorSpeed * dt * 40;
  v.rpm = 800 + v.rotorSpeed * 5000; v.heliPower = Math.max(0, inp.up);
  void onGround;
  return { impact, nx: h?.nx ?? 0, nz: h?.nz ?? 0 };
}
export function heliLanded(v: Vehicle, col: Collision) { return v.y - col.groundAt(v.x, v.z, v.y + 0.5, 1.0, 1.5) < 0.3 && Math.abs(v.speed) < 2; }

// ---------- ИИ-водитель ----------
export interface AICtx {
  L: WorldLayout; vehicles: Vehicle[]; player: { x: number; z: number; inVehicle: Vehicle | null };
  lightState: (node: number, axisEW: boolean) => 'green' | 'yellow' | 'red' | 'flash';
  rand: () => number; col?: Collision;
}
const laneOff = (kind: string) => (kind === 'highway' ? 4 : kind === 'city' || kind === 'avenue' ? 3 : kind === 'village' ? 2.1 : kind === 'industrial' ? 2.5 : 1.6);
const cruiseFor = (kind: string) => (kind === 'highway' ? 22 : kind === 'avenue' ? 15 : kind === 'city' ? 13 : kind === 'village' ? 11 : kind === 'industrial' ? 8 : 8);

export class AIDriver {
  route: number[] = []; k = 0;
  mode: 'wander' | 'route' | 'chase' | 'idle' = 'wander';
  final: { x: number; z: number } | null = null;
  onArrive: (() => void) | null = null;
  obeyLights = true; speedMul = 1;
  chaseTarget: (() => { x: number; z: number }) | null = null;
  private replan = 0; arrived = false;
  setRoute(L: WorldLayout, from: number, to: number, final: { x: number; z: number } | null): boolean {
    const p = astar(L, from, to);
    if (!p) return false;
    this.route = p; this.k = 0; this.mode = 'route'; this.final = final; this.arrived = false;
    return true;
  }
  private edgeKind(L: WorldLayout, a: number, b: number) { const e = L.adj[a].find((x) => x.n === b); return e ? L.edges[e.e].kind : 'city'; }
  private lanePt(L: WorldLayout, a: number, b: number, atB: boolean) {
    const A = L.nodes[a], B = L.nodes[b];
    const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 1;
    const o = laneOff(this.edgeKind(L, a, b));
    const rx = (-dz / l) * o, rz = (dx / l) * o;
    return atB ? { x: B.x + rx, z: B.z + rz } : { x: A.x + rx, z: A.z + rz };
  }
  step(v: Vehicle, dt: number, ctx: AICtx): { desired: number; target: number } {
    const L = ctx.L;
    if (this.mode === 'idle') return this.apply(v, dt, v.heading, 0);
    if (this.mode === 'chase' && this.chaseTarget) {
      const t = this.chaseTarget();
      const d = Math.hypot(t.x - v.x, t.z - v.z);
      this.replan -= dt;
      if (d < 40) {
        const desired = Math.atan2(t.x - v.x, t.z - v.z);
        return this.apply(v, dt, desired, clamp((d - 5) * 0.6, 0, v.spec.maxSpeed * 0.6), ctx);
      }
      if (this.replan <= 0 || this.k >= this.route.length - 1) {
        this.replan = 3;
        const from = nearestNodeFast(L, v.x, v.z), to = nearestNodeFast(L, t.x, t.z);
        const p = astar(L, from, to); if (p && p.length > 1) { this.route = p; this.k = 0; }
      }
    }
    // продлить маршрут при блуждании
    if (this.mode === 'wander') {
      while (this.route.length - this.k < 3) {
        const last = this.route[this.route.length - 1], prev = this.route[this.route.length - 2];
        const opts = L.adj[last].filter((x) => x.n !== prev && L.edges[x.e].kind !== 'dirt');
        const pick = opts.length ? opts[Math.floor(ctx.rand() * opts.length)] : L.adj[last][0];
        this.route.push(pick.n);
      }
      if (this.k > 20) { this.route.splice(0, this.k); this.k = 0; }
    }
    if (this.route.length < 2) { this.mode = 'idle'; return this.apply(v, dt, v.heading, 0); }
    // текущий отрезок
    let a = this.route[this.k], b = this.route[this.k + 1];
    if (b === undefined) return this.finish(v, dt, ctx);
    let B = this.lanePt(L, a, b, true);
    const A = this.lanePt(L, a, b, false);
    const segL = Math.hypot(B.x - A.x, B.z - A.z) || 1;
    const t = ((v.x - A.x) * (B.x - A.x) + (v.z - A.z) * (B.z - A.z)) / (segL * segL);
    const remain = (1 - t) * segL;
    const kind = this.edgeKind(L, a, b);
    if (remain < Math.max(3, Math.abs(v.speed) * 0.35)) {
      this.k++;
      if (this.k >= this.route.length - 1) return this.finish(v, dt, ctx);
      a = this.route[this.k]; b = this.route[this.k + 1]; B = this.lanePt(L, a, b, true);
    }
    // точка преследования
    const look = 4 + Math.abs(v.speed) * 0.45;
    const A2 = this.lanePt(L, a, b, false);
    const sl = Math.hypot(B.x - A2.x, B.z - A2.z) || 1;
    let tt = ((v.x - A2.x) * (B.x - A2.x) + (v.z - A2.z) * (B.z - A2.z)) / (sl * sl);
    tt = clamp(tt + look / sl, 0, 1);
    let tx = A2.x + (B.x - A2.x) * tt, tz = A2.z + (B.z - A2.z) * tt;
    if (tt >= 1 && this.k + 2 < this.route.length) { const N2 = this.lanePt(L, b, this.route[this.k + 2], false); tx = (tx + N2.x) / 2; tz = (tz + N2.z) / 2; }
    if (this.mode === 'route' && this.final && this.k === this.route.length - 2 && tt >= 1) { tx = this.final.x; tz = this.final.z; }
    const desired = Math.atan2(tx - v.x, tz - v.z);
    // скорость
    let target = cruiseFor(kind) * this.speedMul;
    if (this.mode === 'chase') target = v.spec.maxSpeed * 0.7;
    target = Math.min(target, v.spec.maxSpeed);
    const distB = Math.hypot(B.x - v.x, B.z - v.z);
    if (this.k + 2 < this.route.length) {
      const C = L.nodes[this.route[this.k + 2]], Bn = L.nodes[b], An = L.nodes[a];
      const turn = Math.abs(angleDiff(Math.atan2(Bn.x - An.x, Bn.z - An.z), Math.atan2(C.x - Bn.x, C.z - Bn.z)));
      if (turn > 0.4) target = Math.min(target, Math.sqrt(6 * 6 + 2 * 5 * Math.max(0, distB - 4)));
    } else if (this.mode === 'route') target = Math.min(target, Math.sqrt(2 * 4 * Math.max(0, distB - 2)) + 1);
    // светофор
    const bn = L.nodes[b];
    if (this.obeyLights && bn.light) {
      const An = L.nodes[a];
      const ew = Math.abs(bn.x - An.x) > Math.abs(bn.z - An.z);
      const st = ctx.lightState(b, ew);
      const dn = Math.hypot(bn.x - v.x, bn.z - v.z) - 10.5;
      if ((st === 'red' || (st === 'yellow' && dn > 4)) && dn > -1.5) target = Math.min(target, Math.sqrt(2 * 5 * Math.max(0, dn)) * 0.9);
      if (st === 'flash' && dn < 12) target = Math.min(target, 7);
    }
    return this.apply(v, dt, desired, target, ctx);
  }
  private finish(v: Vehicle, dt: number, ctx: AICtx) {
    if (this.mode === 'chase') { this.replan = 0; return this.apply(v, dt, v.heading, 2, ctx); }
    if (this.mode === 'wander') { return this.apply(v, dt, v.heading, 0, ctx); }
    if (this.mode === 'route' && this.final) {
      const d = Math.hypot(this.final.x - v.x, this.final.z - v.z);
      if (d > 3 && !this.arrived) return this.apply(v, dt, Math.atan2(this.final.x - v.x, this.final.z - v.z), clamp(d * 0.8, 0, 8), ctx);
    }
    if (!this.arrived) { this.arrived = true; this.mode = 'idle'; this.onArrive?.(); }
    return this.apply(v, dt, v.heading, 0, ctx);
  }
  private apply(v: Vehicle, dt: number, desired: number, target: number, ctx?: AICtx) {
    // препятствия впереди
    if (ctx && target > 0) {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const check = (ox: number, oz: number, rad: number) => {
        const dx = ox - v.x, dz = oz - v.z;
        const f = dx * fx + dz * fz, l = dx * fz - dz * fx;
        const lim = v.spec.len / 2 + 14;
        if (f > 0 && f < lim && Math.abs(l) < 1.6 + rad) target = Math.min(target, Math.max(0, (f - v.spec.len / 2 - rad - 2.5) * 0.9));
      };
      for (const o of ctx.vehicles) { if (o === v || !o.model.group.visible) continue; const dd = Math.abs(o.x - v.x) + Math.abs(o.z - v.z); if (dd < 30) check(o.x, o.z, Math.max(0.1, (o.spec.wid + v.spec.wid) / 2 + 0.15 - 1.6)); }
      if (!ctx.player.inVehicle) check(ctx.player.x, ctx.player.z, 0.4);
    }
    if (v.shock > 0) { v.shock -= dt; target = 0; }
    const diff = angleDiff(v.heading, desired);
    const tr = (1.6 / (1 + Math.abs(v.speed) * 0.04)) * dt * Math.min(1, Math.abs(v.speed) / 2 + 0.2);
    v.heading += clamp(diff, -tr, tr);
    if (Math.abs(diff) > 1.2) target = Math.min(target, 4);
    const accel = v.spec.accel * 0.8, brake = 9;
    if (v.speed < target) v.speed = Math.min(target, v.speed + accel * dt); else v.speed = Math.max(target, v.speed - brake * dt);
    v.steer = clamp(diff * 2, -1, 1);
    v.x += Math.sin(v.heading) * v.speed * dt; v.z += Math.cos(v.heading) * v.speed * dt;
    v.rpm = 900 + (v.speed / v.spec.maxSpeed) * 5000;
    return { desired, target };
  }
}
export function nearestNodeFast(L: WorldLayout, x: number, z: number) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < L.nodes.length; i++) { const n = L.nodes[i]; const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z); if (d < bd) { bd = d; bi = i; } }
  return bi;
}
