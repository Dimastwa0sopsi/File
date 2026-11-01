// Погода: ясно / облачно / дождь. Дождь — процедурные капли (Points), которые летят вокруг игрока.
import * as THREE from 'three';

export type WeatherMode = 'clear' | 'cloud' | 'rain';

const DROPS = 1600;
const SPAN = 46;   // радиус куба вокруг камеры
const TOP = 26;    // высота, с которой падают капли

export class Weather {
  group = new THREE.Group();
  mode: WeatherMode = 'clear';
  /** 0..1 — плавно нарастающая сила дождя */
  intensity = 0;
  private pts: THREE.Points;
  private pos: Float32Array;
  private spd: Float32Array;
  private phase = 0;
  private nextT = 75;
  private onMode: ((m: WeatherMode) => void) | null = null;

  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(DROPS * 3);
    this.spd = new Float32Array(DROPS);
    for (let i = 0; i < DROPS; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * SPAN * 2;
      this.pos[i * 3 + 1] = Math.random() * TOP;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * SPAN * 2;
      this.spd[i] = 16 + Math.random() * 12;
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xbcd8f0, size: 0.19, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
    this.pts = new THREE.Points(g, m);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 4;
    this.group.add(this.pts);
    this.group.visible = false;
  }
  /** подписка на смену погоды (для тостов/звука) */
  onSwitch(fn: ((m: WeatherMode) => void) | null) { this.onMode = fn; }
  setMode(m: WeatherMode, quiet = false) {
    if (m === this.mode) return;
    this.mode = m;
    if (!quiet) this.onMode?.(m);
  }
  get label() { return this.mode === 'rain' ? 'дождь' : this.mode === 'cloud' ? 'облачно' : 'ясно'; }
  get wet() { return this.intensity > 0.25; }
  update(dt: number, cx: number, cz: number) {
    // смена погоды по таймеру: ясно → облачно → дождь → облачно → ...
    this.nextT -= dt;
    if (this.nextT <= 0) {
      this.nextT = 90 + Math.random() * 150;
      const r = Math.random();
      if (this.mode === 'rain') this.setMode(r < 0.65 ? 'cloud' : 'clear');
      else if (this.mode === 'cloud') this.setMode(r < 0.55 ? 'rain' : 'clear');
      else this.setMode(r < 0.3 ? 'cloud' : r < 0.42 ? 'rain' : 'clear');
    }
    const want = this.mode === 'rain' ? 1 : this.mode === 'cloud' ? 0.12 : 0;
    this.intensity += (want - this.intensity) * Math.min(1, dt * 0.45);
    const vis = this.intensity > 0.16;
    this.group.visible = vis;
    if (!vis) return;
    this.group.position.set(cx, 0, cz);
    const arr = this.pos;
    const wind = 5.5 + Math.sin(this.phase * 0.7) * 2.5;
    this.phase += dt;
    const k = Math.min(1, (this.intensity - 0.1) / 0.9);
    for (let i = 0; i < DROPS; i++) {
      const j = i * 3;
      arr[j + 1] -= this.spd[i] * dt;
      arr[j] += wind * dt * 0.55;
      arr[j + 2] += wind * dt * 0.2;
      if (arr[j + 1] < -1) {
        arr[j + 1] = TOP;
        arr[j] = (Math.random() - 0.5) * SPAN * 2;
        arr[j + 2] = (Math.random() - 0.5) * SPAN * 2;
      } else if (arr[j] > SPAN) arr[j] -= SPAN * 2;
      else if (arr[j] < -SPAN) arr[j] += SPAN * 2;
      if (arr[j + 2] > SPAN) arr[j + 2] -= SPAN * 2;
      else if (arr[j + 2] < -SPAN) arr[j + 2] += SPAN * 2;
    }
    (this.pts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.pts.material as THREE.PointsMaterial).opacity = 0.55 * k;
    (this.pts.material as THREE.PointsMaterial).color.setHSL(0.56, 0.4, 0.72 + Math.sin(this.phase) * 0.02);
  }
  dispose() {
    this.pts.geometry.dispose();
    (this.pts.material as THREE.Material).dispose();
    this.group.clear();
  }
}
