// Боевая система игрока: рукопашный бой (комбо, блок, оглушение, нокдаун) и огнестрел (прицел, магазин, перезарядка, урон NPC и игрокам)
import * as THREE from 'three';
import type { Game } from './game';
import type { Pose } from './character';
import { rayCylinder } from './npc';
import { rayBox } from './collision';
import { angleDiff, clamp } from './config';
import { T } from './geom';
import { WEAPONS, type WeaponDef } from './data';

const MAX_ANGLE_IN_CAR = 2.6;
interface Atk { pose: Pose; dur: number; hitAt: number; dmg: number; range: number; lunge: number; heavy: boolean }
const ATK: Atk[] = [
  { pose: 'jab', dur: 0.34, hitAt: 0.4, dmg: 11, range: 1.65, lunge: 0.35, heavy: false },
  { pose: 'cross', dur: 0.38, hitAt: 0.42, dmg: 14, range: 1.7, lunge: 0.4, heavy: false },
  { pose: 'hook', dur: 0.56, hitAt: 0.5, dmg: 24, range: 1.65, lunge: 0.5, heavy: true },
];
interface Particle { m: THREE.Mesh; vx: number; vy: number; vz: number; life: number }

const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
const bloodMat = new THREE.MeshBasicMaterial({ color: 0x9b1111 });
const holeMat = new THREE.MeshBasicMaterial({ color: 0x151515 });
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
const flashMat = new THREE.SpriteMaterial({ color: 0xffc860, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });

export class Combat {
  atk: { kind: number; t: number; hit: boolean } | null = null;
  private combo = 0; private comboT = 0; private buffered = false;
  blocking = false; stagger = 0; knockT = 0; guardT = 0;
  aiming = false; aimF = 0; reloadT = 0; private fireCd = 0; lastShotT = 0; spread = 0.015;
  hitMarker = 0; hurt = 0; shake = 0; lastHitBy = -1; lastHitT = 0; mobileAim = false;
  private parts: Particle[] = []; private tracers: { l: THREE.Line; life: number }[] = []; private holes: THREE.Mesh[] = [];
  private flash: THREE.Sprite; private flashLight: THREE.PointLight; private flashT = 0;
  private tmp = new THREE.Vector3();
  constructor(private g: Game) {
    this.flash = new THREE.Sprite(flashMat); this.flash.scale.setScalar(0.5); this.flash.visible = false; g.scene.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffc060, 0, 9, 2); g.scene.add(this.flashLight);
  }
  get wdef(): WeaponDef | null { return WEAPONS[this.g.weapon] ?? null; }
  get gunOut() { return !!this.wdef && !this.g.inVeh && !this.g.rideRemote; }
  /** стрельба из транспорта (водитель или пассажир) */
  get driveBy() { return !!this.wdef && (!!this.g.inVeh || !!this.g.rideRemote) && !(this.g.inVeh?.isHeli && !this.g.passenger); }
  get armed() { return this.gunOut || this.driveBy; }
  get busy() { return !!this.atk || this.stagger > 0 || this.knockT > 0; }
  get mag() { const w = this.wdef; return w ? this.g.state.magBy?.[w.id] ?? 0 : 0; }
  set mag(v: number) { const w = this.wdef; if (w) (this.g.state.magBy ??= {})[w.id] = v; }
  get reserve() { const w = this.wdef; return w ? this.g.state.ammoBy?.[w.ammo] ?? 0 : 0; }
  set reserve(v: number) { const w = this.wdef; if (w) (this.g.state.ammoBy ??= {})[w.ammo] = v; }
  reset() { this.fireCd = Math.min(this.fireCd, 0.25); this.atk = null; this.blocking = false; this.stagger = 0; this.knockT = 0; this.aiming = false; this.reloadT = 0; this.mobileAim = false; }

  // ---------- ввод и обновление ----------
  update(dt: number, inp: { attack: boolean; hold?: boolean; alt: boolean; reload: boolean; moving: boolean; moveDir: number | null }) {
    const g = this.g;
    this.hitMarker = Math.max(0, this.hitMarker - dt); this.hurt = Math.max(0, this.hurt - dt); this.shake = Math.max(0, this.shake - dt * 2);
    this.fireCd -= dt; this.comboT += dt; this.guardT = Math.max(0, this.guardT - dt);
    if (this.stagger > 0) this.stagger -= dt;
    if (this.knockT > 0) { this.knockT -= dt; this.atk = null; this.blocking = false; return; }
    // огнестрел
    const gun = this.armed; const W = this.wdef;
    this.aiming = gun && (inp.alt || this.mobileAim) && this.reloadT <= 0;
    this.aimF += ((this.aiming && !this.driveBy ? 1 : 0) - this.aimF) * Math.min(1, dt * 12);
    if (gun && W) {
      this.blocking = false; this.atk = null;
      if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.finishReload(); }
      else if (inp.reload && this.mag < W.mag) this.startReload();
      const trig = inp.attack || (W.auto && inp.hold);
      if (trig && this.reloadT <= 0) this.fire();
      const base = W.spread * (this.driveBy ? 1.6 : 1);
      this.spread += ((this.aiming ? base * 0.35 : inp.moving ? base * 2.2 : base) - this.spread) * Math.min(1, dt * 8);
      return;
    }
    // рукопашный бой
    this.blocking = inp.alt && !this.atk && this.stagger <= 0 && !g.carrying;
    if (this.blocking) this.guardT = 3;
    if (this.atk) {
      const A = ATK[this.atk.kind];
      this.atk.t += dt;
      const prog = this.atk.t / A.dur;
      if (inp.attack && prog > 0.3) this.buffered = true;
      if (prog < 0.5) this.lunge(A.lunge * dt / (A.dur * 0.5));
      if (!this.atk.hit && prog >= A.hitAt) { this.atk.hit = true; this.resolveMelee(A); }
      if (prog >= 1) {
        this.atk = null; this.comboT = 0;
        if (this.buffered) { this.buffered = false; this.startAttack(inp.moveDir); }
      }
    } else if (inp.attack && this.stagger <= 0 && !g.carrying) this.startAttack(inp.moveDir);
  }
  private startAttack(moveDir: number | null) {
    const g = this.g;
    if (this.comboT > 0.75) this.combo = 0;
    const kind = this.combo % 3; this.combo++;
    this.atk = { kind, t: 0, hit: false }; this.guardT = 3; this.buffered = false;
    // мягкий захват цели
    const base = moveDir ?? g.camYaw;
    const tg = this.findTarget(base, 3.4, 1.1);
    g.pa = tg ? Math.atan2(tg.x - g.px, tg.z - g.pz) : base;
    g.peds.onPlayerAttack(g.px, g.pz);
    g.sound.swing();
  }
  private lunge(step: number) {
    const g = this.g;
    const tg = this.findTarget(g.pa, 1.6, 0.6);
    if (tg && Math.hypot(tg.x - g.px, tg.z - g.pz) < 0.85) return;
    const p = { x: g.px + Math.sin(g.pa) * step, z: g.pz + Math.cos(g.pa) * step };
    g.activeCol.pushCircle(p, 0.33, g.py, 1.7, 0.45);
    g.px = p.x; g.pz = p.z;
  }
  /** ближайшая цель (NPC или игрок) в секторе */
  findTarget(dir: number, range: number, cone: number): { x: number; z: number } | null {
    const g = this.g;
    let best: { x: number; z: number } | null = null; let bs = Infinity;
    const ped = g.peds.target(g.px, g.pz, dir, range, cone);
    if (ped) { best = ped; bs = Math.hypot(ped.x - g.px, ped.z - g.pz); }
    for (const r of g.remoteTargets()) {
      const d = Math.hypot(r.x - g.px, r.z - g.pz); if (d > range || d >= bs) continue;
      if (Math.abs(angleDiff(dir, Math.atan2(r.x - g.px, r.z - g.pz))) > cone) continue;
      best = r; bs = d;
    }
    return best;
  }
  private resolveMelee(A: Atk) {
    const g = this.g;
    let landed = false;
    const ped = g.peds.target(g.px, g.pz, g.pa, A.range, 0.8);
    if (ped) {
      const res = g.hitPed(ped, A.dmg, g.px, g.pz, { heavy: A.heavy });
      landed = true;
      if (res === 'blocked') g.sound.block(); else { g.sound.punch(); this.blood(ped.x, ped.y + 1.55, ped.z, 3); }
      if (res === 'down' && !g.interior && g.policeNear(80)) g.addWanted(1, 'Нападение на прохожего');
    }
    for (const r of g.remoteTargets()) {
      const d = Math.hypot(r.x - g.px, r.z - g.pz);
      if (d > A.range || Math.abs(angleDiff(g.pa, Math.atan2(r.x - g.px, r.z - g.pz))) > 0.8) continue;
      g.net?.sendEvent({ e: 'hit', t: r.id, d: A.dmg, k: 'fist', hx: g.px, hz: g.pz, heavy: A.heavy });
      r.flinch = 0.35; landed = true; g.sound.punch();
    }
    if (landed) { this.hitMarker = 0.2; this.shake = Math.max(this.shake, 0.08); }
  }
  /** по игроку попали (NPC или другой игрок). Возвращает true, если урон прошёл */
  takeHit(dmg: number, fx: number, fz: number, o: { heavy?: boolean; gun?: boolean; from?: number } = {}) {
    const g = this.g;
    if (g.state.health <= 0) return false;
    if (o.from !== undefined) { this.lastHitBy = o.from; this.lastHitT = performance.now(); }
    if (g.inVeh || g.rideRemote) { if (!o.gun) return false; dmg *= 0.5; }
    const toA = Math.atan2(fx - g.px, fz - g.pz);
    if (!o.gun && this.blocking && Math.abs(angleDiff(g.pa, toA)) < 1.3) {
      g.damagePlayer(dmg * 0.25); g.sound.block(); this.shake = 0.1; this.knock(fx, fz, 0.12);
      return false;
    }
    g.damagePlayer(dmg); this.hurt = 0.45; this.shake = o.heavy ? 0.35 : 0.2;
    if (!g.inVeh && !g.rideRemote) {
      this.atk = null; this.buffered = false;
      if (o.heavy && g.state.health < 35 && !o.gun) { this.knockT = 1.7; this.knock(fx, fz, 0.9); }
      else { this.stagger = 0.3; this.knock(fx, fz, o.heavy ? 0.6 : o.gun ? 0.1 : 0.3); }
    }
    g.sound.hurt();
    return true;
  }
  private knock(fx: number, fz: number, dist: number) {
    const g = this.g; if (g.inVeh || g.rideRemote) return;
    const dx = g.px - fx, dz = g.pz - fz, l = Math.hypot(dx, dz) || 1;
    const p = { x: g.px + (dx / l) * dist, z: g.pz + (dz / l) * dist };
    g.activeCol.pushCircle(p, 0.33, g.py, 1.7, 0.45); g.px = p.x; g.pz = p.z;
  }
  /** поза игрока */
  pose(moving: boolean, walkPhase: number): { pose: Pose; phase: number; move: number; lean: number } | null {
    const g = this.g;
    if (this.knockT > 0) { const ph = this.knockT < 0.4 ? this.knockT / 0.4 : Math.min(1, (1.7 - this.knockT) / 0.2); return { pose: 'knock', phase: ph, move: 0, lean: 0 }; }
    if (this.stagger > 0) return { pose: 'flinch', phase: 1 - this.stagger / 0.3, move: 0, lean: 0 };
    if (this.gunOut) {
      if (this.reloadT > 0) return { pose: 'aim', phase: walkPhase, move: moving ? 1 : 0, lean: -0.7 };
      if (this.aiming || performance.now() - this.lastShotT < 900) return { pose: 'aim', phase: walkPhase, move: moving ? 1 : 0, lean: -g.camPitch * 0.9 + 0.12 };
      return null;
    }
    if (this.atk) { const A = ATK[this.atk.kind]; return { pose: A.pose, phase: this.atk.t / A.dur, move: 0, lean: 0 }; }
    if (this.blocking) return { pose: 'block', phase: 0, move: moving ? 1 : 0, lean: 0 };
    if (this.guardT > 0) return { pose: 'guard', phase: walkPhase, move: moving ? 1 : 0, lean: 0 };
    return null;
  }
  // ---------- огнестрел ----------
  startReload() {
    const W = this.wdef; if (!W) return;
    if (this.reserve <= 0) { this.g.toast('Нет патронов — купите в оружейном магазине'); this.g.sound.error(); this.fireCd = 0.5; return; }
    if (this.reloadT > 0 || this.mag >= W.mag) return;
    this.reloadT = W.reload; this.g.sound.reload();
  }
  private finishReload() {
    const W = this.wdef; if (!W) return;
    const take = Math.min(W.mag - this.mag, this.reserve);
    this.mag = this.mag + take; this.reserve = this.reserve - take;
  }
  /** собственная машина стрелка (её не простреливаем) */
  private ownVehicle() { return this.g.inVeh ?? this.g.rideVeh(); }
  private fire() {
    const g = this.g; const W = this.wdef; if (!W) return;
    if (this.fireCd > 0) return;
    if (this.mag <= 0) { if (this.reserve > 0) this.startReload(); else { g.sound.dry(); this.fireCd = 0.35; g.toast('Нет патронов'); } return; }
    // в машине нельзя стрелять сквозь себя назад
    const own = this.ownVehicle();
    if (own) { const rel = angleDiff(own.heading, g.camYaw); if (Math.abs(rel) > MAX_ANGLE_IN_CAR) { this.fireCd = 0.1; return; } }
    this.fireCd = 60 / W.rpm; this.mag = this.mag - 1; this.lastShotT = performance.now();
    if (!own) { g.pa = g.camYaw; g.player.pose('aim', 0, 0, -g.camPitch * 0.9 + 0.12); }
    g.player.root.updateMatrixWorld(true);
    const muzzle = g.player.hand.getWorldPosition(new THREE.Vector3());
    const cam = g.camera; const C = cam.position.clone(); const aimDir = new THREE.Vector3(); cam.getWorldDirection(aimDir);
    muzzle.addScaledVector(new THREE.Vector3(aimDir.x, 0, aimDir.z).normalize(), 0.3);
    const assisted = g.mobile && !this.aiming ? this.aimAssist(C, aimDir) : null;
    if (assisted) aimDir.copy(assisted);
    const tp = Math.max(0, (muzzle.x - C.x) * aimDir.x + (muzzle.y - C.y) * aimDir.y + (muzzle.z - C.z) * aimDir.z) + 0.2;
    const O = C.clone().addScaledVector(aimDir, tp);
    const MAX = W.range;
    let firstP: THREE.Vector3 | null = null; let anyHit = false; let killed = false;
    for (let pi = 0; pi < W.pellets; pi++) {
      const dir = aimDir.clone(); const sp = this.spread;
      dir.x += (Math.random() - 0.5) * sp * 2; dir.y += (Math.random() - 0.5) * sp * 2; dir.z += (Math.random() - 0.5) * sp * 2; dir.normalize();
      const tWall = g.activeCol.ray(O.x, O.y, O.z, dir.x, dir.y, dir.z, MAX);
      let hit: { kind: 'ped' | 'remote' | 'veh' | 'wall' | 'none'; t: number; ref?: unknown; head?: boolean } = { kind: tWall < MAX ? 'wall' : 'none', t: tWall };
      const ph = g.peds.shoot(O.x, O.y, O.z, dir.x, dir.y, dir.z, hit.t);
      if (ph) hit = { kind: 'ped', t: ph.d, ref: ph.ped, head: ph.head };
      for (const r of g.remoteTargets(true)) {
        if (own && r.veh === own) continue;
        if (own && g.rideRemote && r.id === g.rideRemote.id) continue;
        const h = r.inVeh ? 1.3 : r.crouch ? 1.2 : 1.8;
        const t = rayCylinder(O.x, O.y, O.z, dir.x, dir.y, dir.z, r.x, r.y + (r.inVeh ? 0.3 : 0), r.z, 0.34, h);
        if (t !== null && t < hit.t) hit = { kind: 'remote', t, ref: r, head: !r.inVeh && O.y + dir.y * t - r.y > 1.48 };
      }
      if (!g.interior) for (const v of g.vehicles) {
        if (v === own || !v.model.group.visible || Math.abs(v.x - O.x) + Math.abs(v.z - O.z) > MAX + 10) continue;
        const t = rayVehicle(O, dir, v.x, v.y, v.z, v.heading, v.spec.wid, v.spec.hei, v.spec.len);
        if (t !== null && t < hit.t) hit = { kind: 'veh', t, ref: v };
      }
      const P = O.clone().addScaledVector(dir, Math.min(hit.t, MAX));
      // от ствола до точки — стены не простреливаются
      const md = P.clone().sub(muzzle); const ml = md.length(); md.normalize();
      if (ml > 0.3) { const tw = g.activeCol.ray(muzzle.x, muzzle.y, muzzle.z, md.x, md.y, md.z, ml); if (tw < ml - 0.2) { hit = { kind: 'wall', t: 0 }; P.copy(muzzle).addScaledVector(md, tw); } }
      if (!firstP) firstP = P.clone();
      if (W.pellets === 1 || pi % 2 === 0) this.tracer(muzzle, P);
      const dist = hit.t; const fall = W.pellets > 1 ? clamp(1.2 - dist / W.range, 0.25, 1) : 1;
      if (hit.kind === 'ped') {
        const ped = hit.ref as import('./npc').Ped;
        const res = g.hitPed(ped, (hit.head ? W.dmg * 3 : W.dmg) * fall, g.px, g.pz, { gun: true, heavy: W.heavy });
        this.blood(P.x, P.y, P.z, 5); anyHit = true;
        if (res === 'down') killed = true;
      } else if (hit.kind === 'remote') {
        const r = hit.ref as { id: number; flinch: number };
        g.net?.sendEvent({ e: 'hit', t: r.id, d: Math.round((hit.head ? W.dmg * 2.4 : W.dmg) * fall * 0.85), k: 'gun', hx: g.px, hz: g.pz });
        r.flinch = 0.3; this.blood(P.x, P.y, P.z, 5); anyHit = true;
      } else if (hit.kind === 'veh') {
        const v = hit.ref as import('./vehicles').Vehicle;
        v.condition = Math.max(0, v.condition - 0.012 * (W.dmg / 30)); if (v.owned) v.owned.condition = v.condition;
        this.sparks(P.x, P.y, P.z, 4); anyHit = true;
        // пассажиры и водитель внутри задеты
        if (v.dummy && Math.random() < 0.35) { v.shock = 4; }
        if (v.role === 'police' || v.spec.service) g.addWanted(1, 'Стрельба по служебной машине');
      } else if (hit.kind === 'wall') { this.sparks(P.x, P.y, P.z, 3); if (pi < 3) this.hole(P, dir); }
    }
    if (anyHit) this.hitMarker = 0.22;
    if (killed && !g.interior && g.policeNear(200)) g.addWanted(1, 'Стрельба по людям');
    this.muzzle(muzzle); g.sound.shot(W.vol);
    const rec = W.recoil * (this.aiming ? 0.7 : 1);
    g.camPitch = clamp(g.camPitch - rec, -0.35, 1.3); g.camYaw += (Math.random() - 0.5) * rec * 0.6; this.shake = Math.max(this.shake, W.heavy ? 0.12 : 0.05);
    const P0 = firstP ?? muzzle;
    g.net?.sendEvent({ e: 'shot', o: [r2(muzzle.x), r2(muzzle.y), r2(muzzle.z)], p: [r2(P0.x), r2(P0.y), r2(P0.z)], i: g.interiorKey() });
    g.peds.panic(g.px, g.pz, 30);
    if (!g.interior && g.policeNear(150)) g.addWanted(1, 'Стрельба');
  }
  private aimAssist(C: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 | null {
    const g = this.g; let best: THREE.Vector3 | null = null; let bd = 0.14;
    const test = (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x - C.x, y - C.y, z - C.z); const l = v.length(); if (l > 45 || l < 1) return;
      v.divideScalar(l); const a = Math.acos(clamp(v.dot(dir), -1, 1)); if (a < bd) { bd = a; best = v; }
    };
    for (const p of g.peds.peds) if (p.active && p.char.root.visible && p.state !== 'down' && p.state !== 'gone') test(p.x, p.y + 1.25, p.z);
    for (const r of g.remoteTargets(true)) test(r.x, r.y + 1.25, r.z);
    return best;
  }
  /** выстрел другого игрока — эффекты */
  remoteShot(o: [number, number, number], p: [number, number, number]) {
    const g = this.g; const O = new THREE.Vector3(...o), P = new THREE.Vector3(...p);
    this.muzzle(O); this.tracer(O, P); this.sparks(P.x, P.y, P.z, 3);
    const d = Math.hypot(O.x - g.camera.position.x, O.z - g.camera.position.z);
    g.sound.shot(clamp(1 - d / 160, 0.05, 0.9));
  }
  // ---------- эффекты ----------
  private muzzle(p: THREE.Vector3) { this.flash.position.copy(p); this.flash.visible = true; this.flash.material.rotation = Math.random() * 6; this.flashLight.position.copy(p); this.flashLight.intensity = 8; this.flashT = 0.05; }
  private tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(geo, tracerMat); this.g.scene.add(l); this.tracers.push({ l, life: 0.06 });
  }
  private burst(x: number, y: number, z: number, n: number, m: THREE.Material, sp: number, size: number) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 90) { const o = this.parts.shift()!; this.g.scene.remove(o.m); }
      const mesh = new THREE.Mesh(T.box, m); mesh.scale.setScalar(size); mesh.position.set(x, y, z); this.g.scene.add(mesh);
      this.parts.push({ m: mesh, vx: (Math.random() - 0.5) * sp, vy: Math.random() * sp * 0.8, vz: (Math.random() - 0.5) * sp, life: 0.35 + Math.random() * 0.25 });
    }
  }
  sparks(x: number, y: number, z: number, n: number) { this.burst(x, y, z, n, sparkMat, 4, 0.04); }
  blood(x: number, y: number, z: number, n: number) { this.burst(x, y, z, n, bloodMat, 2.5, 0.06); }
  private hole(p: THREE.Vector3, dir: THREE.Vector3) {
    const m = new THREE.Mesh(T.box, holeMat); m.scale.setScalar(0.09); m.position.copy(p).addScaledVector(dir, -0.02);
    this.g.scene.add(m); this.holes.push(m);
    if (this.holes.length > 40) this.g.scene.remove(this.holes.shift()!);
  }
  updateFx(dt: number) {
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; } }
    for (let i = this.tracers.length - 1; i >= 0; i--) { const t = this.tracers[i]; t.life -= dt; if (t.life <= 0) { this.g.scene.remove(t.l); t.l.geometry.dispose(); this.tracers.splice(i, 1); } }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life -= dt; p.vy -= 12 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      if (p.life <= 0 || p.m.position.y < -1) { this.g.scene.remove(p.m); this.parts.splice(i, 1); }
    }
    void this.tmp;
  }
  clearFx() {
    for (const p of this.parts) this.g.scene.remove(p.m); this.parts = [];
    for (const t of this.tracers) { this.g.scene.remove(t.l); t.l.geometry.dispose(); } this.tracers = [];
    for (const h of this.holes) this.g.scene.remove(h); this.holes = [];
  }
  dispose() { this.clearFx(); this.g.scene.remove(this.flash, this.flashLight); }
}
const r2 = (v: number) => Math.round(v * 100) / 100;
/** луч против повёрнутого параллелепипеда машины */
export function rayVehicle(O: THREE.Vector3, d: THREE.Vector3, x: number, y: number, z: number, a: number, w: number, h: number, l: number): number | null {
  const c = Math.cos(-a), s = Math.sin(-a);
  const ox = O.x - x, oz = O.z - z;
  const lox = ox * c + oz * s, loz = -ox * s + oz * c;
  const ldx = d.x * c + d.z * s, ldz = -d.x * s + d.z * c;
  const t = rayBox(lox, O.y - y, loz, ldx, d.y, ldz, { x0: -w / 2, x1: w / 2, y0: 0.2, y1: h, z0: -l / 2, z1: l / 2 });
  return t >= 0 ? t : null;
}
