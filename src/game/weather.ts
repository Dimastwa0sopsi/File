// Погода: ясно / облачно / дождь / снег.
// Дождь — не «точки», а настоящие полосы капель (LineSegments): дешевле и не выглядит
// как россыпь пикселей. Снег — мягкие пушинки, которые падают медленно и качаются на ветру.
// Настройка «Эффекты» в графике выключает только частицы: сама погода (мокрый асфальт,
// снежный оттенок неба, скользкая дорога) остаётся — мир не ломается без эффектов.
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
    const rm = new THREE.LineBasicMaterial({ color: 0xa8c8e8, transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.LineSegments(rg, rm);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 4;
    this.group.add(this.rain);

    // ---- снег: мягкие пушинки с покачиванием ----
    this.snowPos = new Float32Array(SNOW * 3);
    this.snowSpd = new Float32Array(SNOW);
    for (let i = 0; i < SNOW; i++) {
      this.snowPos[i * 3] = (Math.random() - 0.5) * SPAN * 2;
      this.snowPos[i * 3 + 1] = Math.random() * TOP;
      this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * SPAN * 2;
      this.snowSpd[i] = 1.6 + Math.random() * 1.8;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    const sm = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.32, map: flakeTexture(), transparent: true, opacity: 0,
      depthWrite: false, sizeAttenuation: true, alphaTest: 0.02,
    });
    this.snow = new THREE.Points(sg, sm);
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 5;
    this.group.add(this.snow);
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
  /** дождь идёт (для иконки в HUD); на сцепление, фары и расход не влияет */
  get wet() { return this.mode === 'rain' && this.intensity > 0.25; }
  /** снег: дорога скользкая, тормозной путь длиннее */
  get snowy() { return this.mode === 'snow' && this.intensity > 0.25; }
  /** сцепление всегда как по сухому: дождь и снег — только картинка, без эффекта на управление */
  get grip() { return 1; }

  update(dt: number, cx: number, cz: number, fx = true) {
    this.fx = fx;
    // смена погоды по таймеру: ясно → облачно → дождь/снег → облачно → ...
    this.nextT -= dt;
    if (this.nextT <= 0) {
      this.nextT = 90 + Math.random() * 150;
      const r = Math.random();
      const winter = this.winter();
      if (this.mode !== 'clear' && this.mode !== 'cloud') this.setMode(r < 0.65 ? 'cloud' : 'clear');
      else if (this.mode === 'cloud') this.setMode(r < 0.55 ? (winter ? 'snow' : 'rain') : 'clear');
      else this.setMode(r < 0.3 ? 'cloud' : r < 0.42 ? (winter ? 'snow' : 'rain') : 'clear');
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
    if (this.mode === 'snow') this.stepSnow(dt, k, wind);
    else this.stepRain(dt, k, wind);
  }
  /** зимой чаще снег, летом — дождь (сезон берём из системного месяца) */
  private winter() {
    const m = new Date().getMonth();
    return m === 11 || m <= 1;
  }

  private stepRain(dt: number, k: number, wind: number) {
    const a = this.rainPos;
    this.snow.visible = false;
    this.rain.visible = true;
    for (let i = 0; i < RAIN; i++) {
      const j = i * 6;
      const dy = this.rainSpd[i] * dt;
      a[j + 1] -= dy; a[j + 4] -= dy;
      const dx = wind * dt * 0.55, dz = wind * dt * 0.2;
      a[j] += dx; a[j + 3] += dx; a[j + 2] += dz; a[j + 5] += dz;
      if (a[j + 1] < -1) {
        const len = 0.6 + Math.random() * 0.7;
        const x = (Math.random() - 0.5) * SPAN * 2, z = (Math.random() - 0.5) * SPAN * 2;
        a[j] = x; a[j + 1] = TOP; a[j + 2] = z;
        a[j + 3] = x; a[j + 4] = TOP - len; a[j + 5] = z;
      } else if (a[j] > SPAN) { a[j] -= SPAN * 2; a[j + 3] -= SPAN * 2; }
      else if (a[j] < -SPAN) { a[j] += SPAN * 2; a[j + 3] += SPAN * 2; }
      if (a[j + 2] > SPAN) { a[j + 2] -= SPAN * 2; a[j + 5] -= SPAN * 2; }
      else if (a[j + 2] < -SPAN) { a[j + 2] += SPAN * 2; a[j + 5] += SPAN * 2; }
    }
    (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.rain.material as THREE.LineBasicMaterial).opacity = 0.5 * k;
  }

  private stepSnow(dt: number, k: number, wind: number) {
    const a = this.snowPos;
    this.rain.visible = false;
    this.snow.visible = true;
    for (let i = 0; i < SNOW; i++) {
      const j = i * 3;
      a[j + 1] -= this.snowSpd[i] * dt;
      a[j] += (wind * 0.35 + Math.sin(this.phase * 1.3 + i) * 0.55) * dt;
      a[j + 2] += (wind * 0.14 + Math.cos(this.phase * 1.1 + i * 0.7) * 0.45) * dt;
      if (a[j + 1] < -0.5) {
        a[j] = (Math.random() - 0.5) * SPAN * 2;
        a[j + 1] = TOP;
        a[j + 2] = (Math.random() - 0.5) * SPAN * 2;
      } else if (a[j] > SPAN) a[j] -= SPAN * 2;
      else if (a[j] < -SPAN) a[j] += SPAN * 2;
      if (a[j + 2] > SPAN) a[j + 2] -= SPAN * 2;
      else if (a[j + 2] < -SPAN) a[j + 2] += SPAN * 2;
    }
    (this.snow.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.snow.material as THREE.PointsMaterial).opacity = 0.9 * k;
  }

  dispose() {
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    const sm = this.snow.material as THREE.PointsMaterial;
    sm.map?.dispose(); sm.dispose();
    this.snow.geometry.dispose();
    this.group.clear();
  }
}
