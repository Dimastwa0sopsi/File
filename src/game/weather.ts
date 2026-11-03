// Погода: ясно / облачно / дождь / снег.
// Дождь — это полосы капель (LineSegments), а не «точки»: дешевле и выглядит как настоящая
// стена дождя. Снег — мягкие пушинки, падают медленно и качаются на ветру.
// Осадки НЕ влияют на игру: сцепление всегда как по сухому, фары сами не включаются,
// расход топлива и скорость не меняются. Это только картинка.
import * as THREE from 'three';

export type WeatherMode = 'clear' | 'cloud' | 'rain' | 'snow';

const RAIN = 900;
const SNOW = 700;
const SPAN = 44;    // половина куба вокруг камеры
const TOP = 24;     // высота, с которой падают осадки

/** круглая снежинка одной текстурой 32×32 */
function flakeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(16, 16, 15, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

export class Weather {
  group = new THREE.Group();
  mode: WeatherMode = 'clear';
  /** 0..1 — плавно нарастающая сила осадков */
  intensity = 0;
  /** показывать частицы осадков (настройка «Эффекты») */
  fx = true;
  private rainPos: Float32Array;
  private rainSpd: Float32Array;
  private snowPos: Float32Array;
  private snowSpd: Float32Array;
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private phase = 0;
  private nextT = 75;
  private onMode: ((m: WeatherMode) => void) | null = null;

  constructor() {
    // ---- дождь: каждая капля — отрезок длиной 0.6–1.2 м, летящий вниз ----
    this.rainPos = new Float32Array(RAIN * 6);
    this.rainSpd = new Float32Array(RAIN);
    for (let i = 0; i < RAIN; i++) {
      const x = (Math.random() - 0.5) * SPAN * 2, y = Math.random() * TOP, z = (Math.random() - 0.5) * SPAN * 2;
      const len = 0.6 + Math.random() * 0.7;
      this.rainPos[i * 6] = x; this.rainPos[i * 6 + 1] = y; this.rainPos[i * 6 + 2] = z;
      this.rainPos[i * 6 + 3] = x; this.rainPos[i * 6 + 4] = y - len; this.rainPos[i * 6 + 5] = z;
      this.rainSpd[i] = 16 + Math.random() * 12;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    const rm = new THREE.LineBasicMaterial({ color: 0xa8c6e8, transparent: true, opacity: 0.55, depthWrite: false });
    this.rain = new THREE.LineSegments(rg, rm);
    this.rain.frustumCulled = false;

    // ---- снег: пушинки с собственной скоростью и фазой качания ----
    this.snowPos = new Float32Array(SNOW * 3);
    this.snowSpd = new Float32Array(SNOW);
    for (let i = 0; i < SNOW; i++) {
      this.snowPos[i * 3] = (Math.random() - 0.5) * SPAN * 2;
      this.snowPos[i * 3 + 1] = Math.random() * TOP;
      this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * SPAN * 2;
      this.snowSpd[i] = 1.6 + Math.random() * 2.2;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    const sm = new THREE.PointsMaterial({
      size: 0.22, map: flakeTexture(), transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.snow = new THREE.Points(sg, sm);
    this.snow.frustumCulled = false;

    this.rain.visible = false; this.snow.visible = false;
    this.group.add(this.rain, this.snow);
    this.group.visible = false;
  }

  /** подписка на смену погоды (для тостов/звука) */
  onSwitch(fn: ((m: WeatherMode) => void) | null) { this.onMode = fn; }
  setMode(m: WeatherMode, quiet = false) {
    if (m === this.mode) return;
    this.mode = m;
    if (!quiet) this.onMode?.(m);
  }
  get label() {
    return this.mode === 'rain' ? 'дождь' : this.mode === 'snow' ? 'снег' : this.mode === 'cloud' ? 'облачно' : 'ясно';
  }
  /** идёт дождь (для иконки в HUD); на управление не влияет */
  get wet() { return this.mode === 'rain' && this.intensity > 0.25; }
  /** идёт снег (для иконки в HUD); на управление не влияет */
  get snowy() { return this.mode === 'snow' && this.intensity > 0.25; }
  /** сцепление всегда как по сухому: дождь и снег — только картинка */
  get grip() { return 1; }

  update(dt: number, cx: number, cz: number, fx = true) {
    // «Эффекты» выключают только частицы: погода (иконка, небо) остаётся
    this.fx = fx;
    this.nextT -= dt;
    if (this.nextT <= 0) {
      this.nextT = 110 + Math.random() * 170;
      const r = Math.random();
      const winter = this.winter();
      if (this.mode === 'rain' || this.mode === 'snow') this.setMode(r < 0.7 ? 'cloud' : 'clear');
      else if (this.mode === 'cloud') this.setMode(r < 0.4 ? (winter ? 'snow' : 'rain') : 'clear');
      else this.setMode(r < 0.26 ? 'cloud' : r < 0.4 ? (winter ? 'snow' : 'rain') : 'clear');
    }
    const want = this.mode === 'rain' || this.mode === 'snow' ? 1 : this.mode === 'cloud' ? 0.12 : 0;
    this.intensity += (want - this.intensity) * Math.min(1, dt * 0.45);
    const vis = fx && this.intensity > 0.16;
    this.group.visible = vis;
    this.phase += dt;
    if (!vis) return;
    this.group.position.set(cx, 0, cz);
    const k = Math.min(1, (this.intensity - 0.1) / 0.9);
    const wind = 4.5 + Math.sin(this.phase * 0.7) * 2.5;
    if (this.mode === 'snow') { this.rain.visible = false; this.snow.visible = true; this.stepSnow(dt, k, wind); }
    else if (this.mode === 'rain') { this.snow.visible = false; this.rain.visible = true; this.stepRain(dt, k, wind); }
    else { this.rain.visible = false; this.snow.visible = false; }
  }

  private stepRain(dt: number, k: number, wind: number) {
    const p = this.rainPos;
    const n = Math.floor(RAIN * (0.35 + 0.65 * k));
    for (let i = 0; i < n; i++) {
      const j = i * 6;
      const fall = this.rainSpd[i] * dt;
      p[j + 1] -= fall; p[j + 4] -= fall;
      p[j] += wind * dt * 0.35; p[j + 3] += wind * dt * 0.35;
      if (p[j + 1] < 0) {
        const x = (Math.random() - 0.5) * SPAN * 2, z = (Math.random() - 0.5) * SPAN * 2;
        const len = 0.6 + Math.random() * 0.7;
        p[j] = x; p[j + 1] = TOP; p[j + 2] = z;
        p[j + 3] = x; p[j + 4] = TOP - len; p[j + 5] = z;
      }
    }
    for (let i = n; i < RAIN; i++) { p[i * 6 + 1] = -100; p[i * 6 + 4] = -100; }
    (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private stepSnow(dt: number, k: number, wind: number) {
    const p = this.snowPos;
    const n = Math.floor(SNOW * (0.35 + 0.65 * k));
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      p[j + 1] -= this.snowSpd[i] * dt;
      p[j] += Math.sin(this.phase * 1.4 + i) * 0.55 * dt + wind * 0.06 * dt;
      p[j + 2] += Math.cos(this.phase * 1.1 + i * 0.7) * 0.45 * dt;
      if (p[j + 1] < 0) {
        p[j] = (Math.random() - 0.5) * SPAN * 2;
        p[j + 1] = TOP;
        p[j + 2] = (Math.random() - 0.5) * SPAN * 2;
      }
    }
    (this.snow.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** зимой чаще снег, летом — дождь (сезон берём из системного месяца) */
  private winter() {
    const m = new Date().getMonth();
    return m === 11 || m <= 1;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mm = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mm)) mm.forEach((x) => x.dispose()); else mm?.dispose();
    });
    this.group.parent?.remove(this.group);
  }
}
