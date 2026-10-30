// Модель персонажа: лицо, причёски, одежда, позы
import * as THREE from 'three';
import { type Look, DRESSES } from './data';
import { mat, getTex } from './textures';

const UB = new THREE.BoxGeometry(1, 1, 1);
const FACE = new THREE.PlaneGeometry(1, 1);
const faceMats = new Map<string, THREE.Material>();
function faceMat(L: Look) {
  const k = ['face', L.gender, L.skin, L.eyes ?? '#3b6ea5'].join('_');
  let m = faceMats.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ map: getTex(k) }); faceMats.set(k, m); }
  return m;
}
const SPH = new THREE.SphereGeometry(1, 10, 8);
function sp(parent: THREE.Object3D, color: string, rx: number, ry: number, rz: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(SPH, color.startsWith('@') ? specialMat(color) : mat('c:' + color)); m.scale.set(rx, ry, rz); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}
const specialMats = new Map<string, THREE.Material>();
function stripeTex(colors: string[], vertical = false, stars = false) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d')!;
  if (stars) { g.fillStyle = '#0b0530'; g.fillRect(0, 0, 64, 64); const gr = g.createRadialGradient(20, 24, 2, 32, 32, 44); gr.addColorStop(0, 'rgba(168,85,247,0.9)'); gr.addColorStop(0.5, 'rgba(59,130,246,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; for (let i = 0; i < 40; i++) g.fillRect((i * 37) % 64, (i * 53) % 64, 1 + (i % 7 === 0 ? 1 : 0), 1 + (i % 7 === 0 ? 1 : 0)); }
  else { const n = colors.length; colors.forEach((col, i) => { g.fillStyle = col; if (vertical) g.fillRect(0, (i * 64) / n, 64, 64 / n + 1); else g.fillRect((i * 64) / n, 0, 64 / n + 1, 64); }); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
/** особые «лимитированные» материалы: @rainbow @gold @neon @galaxy @chrome @fire */
export function specialMat(key: string): THREE.Material {
  let m = specialMats.get(key); if (m) return m;
  switch (key) {
    case '@rainbow': m = new THREE.MeshLambertMaterial({ map: stripeTex(['#ff0040', '#ff8c00', '#ffe600', '#22e05a', '#00b4ff', '#8a2be2'], true), emissive: 0x222222 }); break;
    case '@fire': m = new THREE.MeshLambertMaterial({ map: stripeTex(['#ffe259', '#ffa751', '#ff512f', '#dd2476'], true), emissive: 0x551100 }); break;
    case '@galaxy': m = new THREE.MeshLambertMaterial({ map: stripeTex([], false, true), emissive: 0x1a0b40 }); break;
    case '@gold': m = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 1, roughness: 0.22 }); break;
    case '@chrome': m = new THREE.MeshStandardMaterial({ color: 0xf2f4f7, metalness: 1, roughness: 0.08 }); break;
    case '@neon': m = new THREE.MeshBasicMaterial({ color: 0x39ff14 }); break;
    default: m = mat('c:#ff00ff');
  }
  m.userData.special = true; specialMats.set(key, m); return m;
}
function bx(parent: THREE.Object3D, color: string, w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0) {
  const m = new THREE.Mesh(UB, color.startsWith('@') ? specialMat(color) : mat('c:' + color));
  m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true;
  parent.add(m); return m;
}
const VC_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
/** объединить прямые дочерние меши группы в один меш с цветами вершин (меньше draw calls) */
function mergeChildren(g: THREE.Object3D, keep: THREE.Object3D[]) {
  const ms = g.children.filter((c) => (c as THREE.Mesh).isMesh && !keep.includes(c) && !((c as THREE.Mesh).material as THREE.MeshLambertMaterial).map && !((c as THREE.Mesh).material as THREE.Material).userData?.special) as THREE.Mesh[];
  if (ms.length < 2) return;
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const m of ms) {
    m.updateMatrix(); nm.getNormalMatrix(m.matrix);
    const c = ((m.material as THREE.MeshLambertMaterial).color ?? new THREE.Color(1, 1, 1));
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const P = geo.getAttribute('position'), N = geo.getAttribute('normal');
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrix); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b); }
    if (geo !== m.geometry) geo.dispose();
    g.remove(m);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  bg.computeBoundingSphere();
  const mesh = new THREE.Mesh(bg, VC_MAT); mesh.castShadow = true; mesh.userData.merged = true;
  g.add(mesh);
}
const clampN = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export type Pose = 'idle' | 'walk' | 'run' | 'drive' | 'ride' | 'passenger' | 'punch' | 'lie' | 'carry' | 'smoke' | 'shoot' | 'swim' | 'sitbench' | 'dead' | 'fall'
  | 'dance1' | 'dance2' | 'dance3' | 'dance4' | 'dance5' | 'wave' | 'clap' | 'sit' | 'liedown' | 'pushup' | 'scoot' | 'ridepass' | 'tread' | 'selfie'
  | 'handsup' | 'guard' | 'jab' | 'cross' | 'hook' | 'block' | 'flinch' | 'aim' | 'knock' | 'crouch' | 'crouchwalk' | 'crouchaim';

export class Character {
  root = new THREE.Group();
  hips = new THREE.Group(); torso = new THREE.Group(); head = new THREE.Group();
  shL = new THREE.Group(); shR = new THREE.Group(); elL = new THREE.Group(); elR = new THREE.Group();
  hipL = new THREE.Group(); hipR = new THREE.Group(); knL = new THREE.Group(); knR = new THREE.Group();
  hand = new THREE.Group(); // предмет в правой руке
  carryBox: THREE.Mesh;
  look: Look; blob!: THREE.Mesh;
  private visual = new THREE.Group();
  constructor(look: Look) {
    this.look = look;
    this.root.add(this.visual);
    this.carryBox = new THREE.Mesh(UB, mat('c:#a16207'));
    this.carryBox.scale.set(0.5, 0.35, 0.4); this.carryBox.visible = false;
    const blob = new THREE.Mesh(FACE, mat('blob')); blob.rotation.x = -Math.PI / 2; blob.scale.set(0.9, 0.9, 1); blob.position.y = 0.03; blob.renderOrder = 1;
    this.blob = blob; this.root.add(blob);
    this.build();
  }
  setLook(look: Look) { this.look = look; this.build(); }
  private build() {
    const L = this.look;
    this.visual.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.merged) m.geometry.dispose(); });
    this.visual.clear();
    this.visual.scale.setScalar(1);
    const f = L.gender === 'f';
    const skin = L.skin, top = L.topColor, bot = L.bottomColor;
    const sleeves = L.top === 'hoodie' || L.top === 'shirt' || L.top === 'suit';
    const bareTop = L.top === 'swim';
    const dress = DRESSES.has(L.top);
    const shortsLike = L.bottom === 'shorts' || L.bottom === 'skirt' || L.bottom === 'swim' || dress;
    const skirtLen: Record<string, number> = { dress: 0.32, minidress: 0.2, sundress: 0.42, cocktail: 0.36, evening: 0.86 };
    const bareArms = bareTop || L.top === 'tank' || dress;
    this.visual.add(this.hips);
    this.hips.position.set(0, 0.92, 0);
    this.hips.clear(); this.torso.clear(); this.head.clear();
    [this.shL, this.shR, this.elL, this.elR, this.hipL, this.hipR, this.knL, this.knR, this.hand].forEach((g) => g.clear());
    // таз
    bx(this.hips, dress ? top : bot, f ? 0.36 : 0.34, 0.16, 0.22, 0, 0.0, 0);
    if (dress) {
      const len = skirtLen[L.top] ?? 0.32, flare = L.top === 'cocktail' ? 0.5 : L.top === 'evening' ? 0.46 : 0.42;
      bx(this.hips, top, flare - 0.04, len * 0.55, 0.27, 0, -0.04 - len * 0.27, 0);
      bx(this.hips, top, flare, len * 0.5, 0.31, 0, -0.04 - len * 0.75, 0);
      if (L.top === 'cocktail') bx(this.hips, '#111', 0.37, 0.04, 0.23, 0, 0.05, 0); // пояс
    } else if (L.bottom === 'skirt') bx(this.hips, bot, f ? 0.42 : 0.4, 0.32, 0.27, 0, -0.18, 0);
    // торс
    this.hips.add(this.torso); this.torso.position.set(0, 0.06, 0);
    const tc = bareTop ? skin : top;
    bx(this.torso, tc, f ? 0.3 : 0.36, 0.26, 0.2, 0, 0.13, 0); // талия
    bx(this.torso, tc, f ? 0.36 : 0.42, 0.24, 0.22, 0, 0.36, 0); // грудь/плечи
    if (bareTop && f) { bx(this.torso, top, 0.37, 0.09, 0.23, 0, 0.38, 0); }
    if (dress && (L.top === 'sundress' || L.top === 'evening' || L.top === 'cocktail')) { bx(this.torso, skin, f ? 0.34 : 0.4, 0.07, 0.205, 0, 0.455, 0); for (const sx of [1, -1]) bx(this.torso, top, 0.03, 0.08, 0.21, sx * 0.1, 0.48, 0); } // открытые плечи и бретели
    if (L.top === 'evening') bx(this.torso, '#e5e7eb', 0.04, 0.04, 0.02, 0.06, 0.38, 0.12); // брошь
    if (f && !bareTop) bx(this.torso, tc, 0.28, 0.1, 0.06, 0, 0.36, 0.12);
    if (L.top === 'suit') { bx(this.torso, '#f8fafc', 0.1, 0.3, 0.01, 0, 0.3, 0.111); bx(this.torso, '#7f1d1d', 0.04, 0.24, 0.012, 0, 0.3, 0.115); }
    if (L.top === 'hoodie') bx(this.torso, top, 0.3, 0.12, 0.12, 0, 0.5, -0.12);
    // шея и голова
    bx(this.torso, skin, 0.1, 0.08, 0.1, 0, 0.51, 0);
    this.torso.add(this.head); this.head.position.set(0, 0.55, 0);
    bx(this.head, skin, 0.22, 0.25, 0.23, 0, 0.13, 0);
    const face = new THREE.Mesh(FACE, faceMat(L)); face.scale.set(0.215, 0.245, 1); face.position.set(0, 0.13, 0.1155); this.head.add(face);
    bx(this.head, skin, 0.045, 0.06, 0.05, 0, 0.11, 0.13); // нос
    bx(this.head, skin, 0.03, 0.06, 0.05, 0.115, 0.13, 0); bx(this.head, skin, 0.03, 0.06, 0.05, -0.115, 0.13, 0); // уши
    this.buildHair();
    // руки
    for (const [sh, el, sg] of [[this.shL, this.elL, 1], [this.shR, this.elR, -1]] as const) {
      this.torso.add(sh); sh.position.set(sg * (f ? 0.22 : 0.26), 0.44, 0);
      bx(sh, bareArms ? skin : top, 0.1, 0.3, 0.11, 0, -0.14, 0);
      sh.add(el); el.position.set(0, -0.29, 0);
      bx(el, sleeves ? top : skin, 0.09, 0.26, 0.1, 0, -0.12, 0);
      bx(el, skin, 0.08, 0.08, 0.09, 0, -0.29, 0.0);
    }
    this.elR.add(this.hand); this.hand.position.set(0, -0.3, 0.05);
    this.hand.add(this.carryBox);
    // ноги
    for (const [hp, kn, sg] of [[this.hipL, this.knL, 1], [this.hipR, this.knR, -1]] as const) {
      this.hips.add(hp); hp.position.set(sg * 0.09, -0.04, 0);
      if (shortsLike) {
        bx(hp, dress || L.bottom === 'skirt' ? skin : bot, 0.14, 0.2, 0.15, 0, -0.1, 0);
        bx(hp, skin, 0.12, 0.26, 0.13, 0, -0.32, 0);
      } else bx(hp, bot, 0.14, 0.46, 0.15, 0, -0.22, 0);
      hp.add(kn); kn.position.set(0, -0.44, 0);
      bx(kn, shortsLike ? skin : bot, 0.12, 0.42, 0.13, 0, -0.2, 0);
      bx(kn, L.shoes, 0.13, 0.08, 0.26, 0, -0.43, 0.05);
    }
    for (const g of [this.hips, this.torso, this.head, this.shL, this.shR, this.elL, this.elR, this.hipL, this.hipR, this.knL, this.knR]) mergeChildren(g, [this.carryBox]);
    if (this.item !== 'none') this.setItem(this.item);
  }
  private buildHair() {
    const h = this.head, c = this.look.hairColor;
    const cap = () => { bx(h, c, 0.25, 0.075, 0.26, 0, 0.275, 0); bx(h, c, 0.25, 0.13, 0.05, 0, 0.2, -0.115); };
    switch (this.look.hair) {
      case 'bald': break;
      case 'buzz': bx(h, c, 0.23, 0.04, 0.24, 0, 0.265, 0); break;
      case 'short': bx(h, c, 0.24, 0.07, 0.25, 0, 0.27, 0); bx(h, c, 0.24, 0.14, 0.05, 0, 0.2, -0.11); break;
      case 'side': bx(h, c, 0.25, 0.08, 0.26, 0.01, 0.275, 0); bx(h, c, 0.06, 0.12, 0.24, 0.1, 0.23, 0.01); bx(h, c, 0.24, 0.16, 0.05, 0, 0.19, -0.11); break;
      case 'mohawk': bx(h, c, 0.06, 0.16, 0.26, 0, 0.33, 0); break;
      case 'long': // до лопаток
        cap(); bx(h, c, 0.24, 0.05, 0.04, 0, 0.255, 0.11);
        bx(h, c, 0.27, 0.66, 0.07, 0, -0.04, -0.125); bx(h, c, 0.045, 0.46, 0.2, 0.128, 0.06, -0.01); bx(h, c, 0.045, 0.46, 0.2, -0.128, 0.06, -0.01); break;
      case 'verylong': // до пояса
        cap(); bx(h, c, 0.24, 0.05, 0.04, 0, 0.255, 0.11);
        bx(h, c, 0.28, 0.95, 0.07, 0, -0.18, -0.13); bx(h, c, 0.24, 0.12, 0.05, 0, -0.68, -0.14); bx(h, c, 0.045, 0.62, 0.2, 0.13, -0.02, -0.01); bx(h, c, 0.045, 0.62, 0.2, -0.13, -0.02, -0.01); break;
      case 'rocker': // мужские до плеч
        cap(); bx(h, c, 0.26, 0.42, 0.07, 0, 0.08, -0.12); bx(h, c, 0.045, 0.32, 0.18, 0.125, 0.12, -0.02); bx(h, c, 0.045, 0.32, 0.18, -0.125, 0.12, -0.02); bx(h, c, 0.2, 0.06, 0.04, 0.02, 0.24, 0.11); break;
      case 'manbun': cap(); sp(h, c, 0.065, 0.06, 0.065, 0, 0.27, -0.13); bx(h, c, 0.02, 0.02, 0.06, 0, 0.27, -0.1); break;
      case 'mullet': bx(h, c, 0.24, 0.08, 0.25, 0, 0.275, 0); bx(h, c, 0.25, 0.48, 0.06, 0, 0.02, -0.12); break;
      case 'dreads': cap(); for (let i = 0; i < 9; i++) { const a = (i / 8) * Math.PI - Math.PI / 2, len = 0.5 + (i % 3) * 0.08; bx(h, c, 0.045, len, 0.045, Math.sin(a) * 0.12, 0.2 - len / 2, -0.1 - Math.cos(a) * 0.03); } break;
      case 'bob': bx(h, c, 0.26, 0.08, 0.27, 0, 0.275, 0); bx(h, c, 0.27, 0.26, 0.06, 0, 0.13, -0.115); bx(h, c, 0.04, 0.26, 0.22, 0.13, 0.13, 0); bx(h, c, 0.04, 0.26, 0.22, -0.13, 0.13, 0); break;
      case 'ponytail': cap(); bx(h, c, 0.075, 0.5, 0.075, 0, -0.03, -0.17); sp(h, c, 0.05, 0.05, 0.05, 0, 0.18, -0.15); break;
      case 'bun': cap(); bx(h, c, 0.12, 0.1, 0.12, 0, 0.32, -0.08); break;
      case 'wavy': bx(h, c, 0.255, 0.08, 0.265, 0, 0.275, 0); sp(h, c, 0.15, 0.36, 0.07, 0, -0.04, -0.11); sp(h, c, 0.05, 0.3, 0.11, 0.12, 0.0, -0.02); sp(h, c, 0.05, 0.3, 0.11, -0.12, 0.0, -0.02); bx(h, c, 0.2, 0.05, 0.04, 0.02, 0.25, 0.11); break;
      case 'pigtails': cap(); for (const sx of [1, -1]) { sp(h, c, 0.04, 0.04, 0.04, sx * 0.13, 0.2, -0.05); bx(h, c, 0.06, 0.48, 0.06, sx * 0.16, -0.06, -0.06); } break;
      case 'pixie': bx(h, c, 0.245, 0.075, 0.255, 0, 0.27, 0); bx(h, c, 0.16, 0.05, 0.05, 0.04, 0.24, 0.11); bx(h, c, 0.245, 0.12, 0.05, 0, 0.2, -0.11); break;
      case 'braid': cap(); for (let i = 0; i < 10; i++) sp(h, c, 0.048, 0.048, 0.048, 0, 0.12 - i * 0.07, -0.15 - i * 0.006); break;
    }
    // аксессуары
    switch (this.look.acc) {
      case 'crown': bx(h, '@gold', 0.24, 0.07, 0.25, 0, 0.33, 0); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; bx(h, '@gold', 0.04, 0.08, 0.04, Math.sin(a) * 0.11, 0.39, Math.cos(a) * 0.11); } bx(h, '#dc2626', 0.035, 0.035, 0.02, 0, 0.33, 0.13); break;
      case 'halo': { const m = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 20), new THREE.MeshBasicMaterial({ color: 0xfff1a8 })); m.rotation.x = Math.PI / 2; m.position.y = 0.45; h.add(m); break; }
      case 'cap': bx(h, '#111827', 0.255, 0.08, 0.265, 0, 0.3, 0); bx(h, '#111827', 0.22, 0.02, 0.13, 0, 0.27, 0.17); bx(h, '#7c5cff', 0.06, 0.04, 0.005, 0, 0.3, 0.134); break;
      case 'phones': bx(h, '#111', 0.27, 0.03, 0.04, 0, 0.3, 0); for (const sx of [1, -1]) { bx(h, '@neon', 0.04, 0.09, 0.09, sx * 0.13, 0.14, 0); } break;
    }
  }
  item = 'none';
  setItem(kind: string) {
    this.item = kind;
    this.hand.children.filter((ch) => ch !== this.carryBox).forEach((ch) => this.hand.remove(ch));
    this.carryBox.visible = false;
    const H = this.hand, M = '#1f2023', W = '#6b4423', S = '#3a3d42';
    // ствол направлен по +Z руки (вперёд при позе прицеливания)
    switch (kind) {
      case 'pistol': bx(H, M, 0.04, 0.12, 0.05, 0, -0.02, 0.02); bx(H, S, 0.045, 0.05, 0.2, 0, 0.04, 0.08); break;
      case 'revolver': bx(H, W, 0.04, 0.12, 0.05, 0, -0.03, 0.0); bx(H, S, 0.06, 0.06, 0.07, 0, 0.04, 0.05); bx(H, '#9ca3af', 0.03, 0.03, 0.22, 0, 0.055, 0.17); break;
      case 'smg': bx(H, M, 0.045, 0.09, 0.32, 0, 0.04, 0.1); bx(H, M, 0.035, 0.18, 0.045, 0, -0.07, 0.12); bx(H, S, 0.025, 0.025, 0.1, 0, 0.06, 0.3); bx(H, M, 0.03, 0.06, 0.12, 0, 0.03, -0.1); break;
      case 'shotgun': bx(H, W, 0.05, 0.08, 0.3, 0, 0.0, -0.18); bx(H, M, 0.05, 0.07, 0.2, 0, 0.04, 0.05); bx(H, S, 0.035, 0.035, 0.55, 0, 0.07, 0.38); bx(H, W, 0.05, 0.05, 0.16, 0, 0.02, 0.3); break;
      case 'rifle': bx(H, W, 0.05, 0.08, 0.26, 0, -0.01, -0.17); bx(H, M, 0.05, 0.09, 0.32, 0, 0.04, 0.1); bx(H, M, 0.035, 0.17, 0.06, 0, -0.07, 0.14, 0.35); bx(H, W, 0.05, 0.05, 0.16, 0, 0.03, 0.3); bx(H, S, 0.025, 0.025, 0.24, 0, 0.065, 0.45); break;
      case 'sniper': bx(H, W, 0.05, 0.09, 0.32, 0, -0.01, -0.18); bx(H, M, 0.05, 0.07, 0.34, 0, 0.04, 0.12); bx(H, S, 0.025, 0.025, 0.6, 0, 0.06, 0.55); bx(H, M, 0.05, 0.05, 0.22, 0, 0.13, 0.12); bx(H, '#60a5fa', 0.04, 0.04, 0.01, 0, 0.13, 0.235); break;
      case 'cig': bx(H, '#f5f5f5', 0.012, 0.012, 0.08, 0.02, 0.02, 0.06); bx(H, '#ff5722', 0.014, 0.014, 0.012, 0.02, 0.02, 0.105); break;
      case 'cash': bx(H, '#3f9a4a', 0.12, 0.03, 0.06, 0, 0, 0.05); break;
      case 'phone': bx(H, '#111827', 0.075, 0.15, 0.012, 0, 0.02, 0.06); bx(H, '#60a5fa', 0.065, 0.13, 0.004, 0, 0.02, 0.054); break;
    }
  }
  /** t — время в секундах, k — фаза ходьбы, lean — наклон */
  pose(p: Pose, t: number, phase = 0, lean = 0, move = 0) {
    const s = Math.sin(phase);
    this.visual.rotation.set(0, 0, 0); this.visual.position.set(0, 0, 0);
    this.hips.position.set(0, 0.92, 0); this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0);
    const zero = (g: THREE.Group) => g.rotation.set(0, 0, 0);
    [this.shL, this.shR, this.elL, this.elR, this.hipL, this.hipR, this.knL, this.knR].forEach(zero);
    this.carryBox.visible = false;
    this.blob.visible = !['drive', 'passenger', 'ride', 'ridepass', 'swim', 'tread', 'lie', 'liedown', 'pushup', 'scoot'].includes(p);
    switch (p) {
      case 'idle': {
        const b = Math.sin(t * 1.6) * 0.02;
        this.torso.rotation.x = b; this.shL.rotation.z = 0.06; this.shR.rotation.z = -0.06; this.elL.rotation.x = -0.1; this.elR.rotation.x = -0.1;
        break;
      }
      case 'walk': case 'run': {
        const a = p === 'run' ? 0.9 : 0.55;
        this.hipL.rotation.x = s * a; this.hipR.rotation.x = -s * a;
        this.knL.rotation.x = Math.max(0, -s) * a * 1.4; this.knR.rotation.x = Math.max(0, s) * a * 1.4;
        this.shL.rotation.x = -s * a * 0.9; this.shR.rotation.x = s * a * 0.9;
        this.elL.rotation.x = -0.3 - (p === 'run' ? 0.9 : 0); this.elR.rotation.x = -0.3 - (p === 'run' ? 0.9 : 0);
        this.hips.position.y = 0.92 + Math.abs(Math.cos(phase)) * (p === 'run' ? 0.06 : 0.03);
        if (p === 'run') this.torso.rotation.x = 0.18;
        break;
      }
      case 'drive': case 'passenger': {
        this.hips.position.y = 0; // относительно сиденья
        this.hipL.rotation.x = -1.45; this.hipR.rotation.x = -1.45; this.knL.rotation.x = 1.35; this.knR.rotation.x = 1.35;
        this.torso.rotation.x = -0.12;
        if (p === 'drive') { this.shL.rotation.x = -1.05; this.shR.rotation.x = -1.05; this.shL.rotation.z = -0.25; this.shR.rotation.z = 0.25; this.elL.rotation.x = -0.55; this.elR.rotation.x = -0.55; this.shL.rotation.x += lean * 0.3; this.shR.rotation.x -= lean * 0.3; }
        else { this.shL.rotation.x = -0.4; this.shR.rotation.x = -0.4; this.elL.rotation.x = -0.9; this.elR.rotation.x = -0.9; }
        break;
      }
      case 'ride': {
        this.hips.position.y = 0;
        this.hipL.rotation.x = -1.15; this.hipR.rotation.x = -1.15; this.hipL.rotation.z = 0.3; this.hipR.rotation.z = -0.3;
        this.knL.rotation.x = 1.5; this.knR.rotation.x = 1.5;
        this.torso.rotation.x = 0.38; this.head.rotation.x = -0.3;
        this.shL.rotation.x = -1.25; this.shR.rotation.x = -1.25; this.shL.rotation.z = -0.15; this.shR.rotation.z = 0.15; this.elL.rotation.x = -0.25; this.elR.rotation.x = -0.25;
        this.torso.rotation.z = lean * 0.4;
        break;
      }
      case 'punch': {
        const k = Math.sin(Math.min(1, phase) * Math.PI);
        this.shR.rotation.x = -1.55 * k; this.elR.rotation.x = -0.6 * (1 - k); this.torso.rotation.y = 0.35 * k;
        this.shL.rotation.x = -0.9; this.elL.rotation.x = -1.6;
        break;
      }
      case 'guard': case 'block': case 'jab': case 'cross': case 'hook': case 'flinch': {
        // ноги: стойка или шаги
        const legs = move > 0.05 ? Math.sin(phase) * 0.45 * Math.min(1, move) : 0;
        this.hipL.rotation.x = legs - 0.15; this.hipR.rotation.x = -legs + 0.2; this.knL.rotation.x = 0.3 + Math.max(0, -legs); this.knR.rotation.x = 0.3 + Math.max(0, legs);
        this.hips.position.y = 0.88; this.torso.rotation.x = 0.12; this.head.rotation.x = -0.08;
        // защитная стойка рук
        this.shL.rotation.x = -1.05; this.elL.rotation.x = -1.85; this.shL.rotation.z = -0.15;
        this.shR.rotation.x = -0.95; this.elR.rotation.x = -1.95; this.shR.rotation.z = 0.15;
        const k = Math.sin(clampN(phase, 0, 1) * Math.PI); // 0→1→0
        if (p === 'jab') { this.shL.rotation.x = -1.05 - 0.5 * k; this.elL.rotation.x = -1.85 * (1 - k); this.torso.rotation.y = -0.25 * k; }
        if (p === 'cross') { this.shR.rotation.x = -0.95 - 0.62 * k; this.elR.rotation.x = -1.95 * (1 - k); this.torso.rotation.y = 0.45 * k; this.hipR.rotation.x -= 0.15 * k; }
        if (p === 'hook') { this.torso.rotation.y = 0.55 - 1.3 * k; this.shR.rotation.x = -1.45; this.shR.rotation.z = 0.15 + 1.0 * k; this.elR.rotation.x = -1.45; this.hips.position.y = 0.85; }
        if (p === 'block') { this.shL.rotation.x = -1.75; this.elL.rotation.x = -2.1; this.shL.rotation.z = -0.45; this.shR.rotation.x = -1.75; this.elR.rotation.x = -2.1; this.shR.rotation.z = 0.45; this.head.rotation.x = 0.25; this.torso.rotation.x = 0.25; }
        if (p === 'flinch') { this.torso.rotation.x = -0.35 * k; this.head.rotation.x = -0.45 * k; this.shL.rotation.z = -0.6 * k; this.shR.rotation.z = 0.6 * k; this.hips.position.z = -0.08 * k; }
        break;
      }
      case 'handsup': this.shL.rotation.x = -2.9; this.shR.rotation.x = -2.9; this.shL.rotation.z = -0.3; this.shR.rotation.z = 0.3; this.elL.rotation.x = -0.5; this.elR.rotation.x = -0.5; this.head.rotation.x = 0.1; break;
      case 'crouch': case 'crouchwalk': case 'crouchaim': {
        const mvk = p === 'crouchwalk' || (p === 'crouchaim' && move > 0.05) ? Math.sin(phase) * 0.35 : 0;
        this.hips.position.y = 0.52;
        this.hipL.rotation.x = -1.35 + mvk; this.hipR.rotation.x = -0.75 - mvk; this.knL.rotation.x = 2.05 - mvk * 0.5; this.knR.rotation.x = 1.6 + mvk * 0.5;
        this.hipR.rotation.z = -0.1; this.hipL.rotation.z = 0.08;
        this.torso.rotation.x = 0.32; this.head.rotation.x = -0.28;
        if (p === 'crouchaim') { const pt = clampN(lean, -0.9, 0.9); this.shR.rotation.x = -1.57 - pt - 0.3; this.shL.rotation.x = -1.45 - pt - 0.3; this.shL.rotation.z = -0.62; this.elL.rotation.x = -0.25; }
        else { this.shL.rotation.x = -0.5 + mvk * 0.6; this.shR.rotation.x = -0.5 - mvk * 0.6; this.elL.rotation.x = -0.9; this.elR.rotation.x = -0.9; }
        break;
      }
      case 'aim': {
        const legs = move > 0.05 ? Math.sin(phase) * 0.5 * Math.min(1, move) : 0;
        this.hipL.rotation.x = legs; this.hipR.rotation.x = -legs; this.knL.rotation.x = Math.max(0, -legs) * 1.2; this.knR.rotation.x = Math.max(0, legs) * 1.2;
        const pt = clampN(lean, -0.9, 0.9);
        this.torso.rotation.y = 0.12; this.head.rotation.x = -pt * 0.5;
        this.shR.rotation.x = -1.57 - pt; this.elR.rotation.x = 0;
        this.shL.rotation.x = -1.45 - pt; this.shL.rotation.z = -0.62; this.elL.rotation.x = -0.25;
        break;
      }
      case 'knock': this.visual.rotation.x = -Math.PI / 2 * clampN(phase, 0, 1); this.visual.position.set(0, 0.12 * clampN(phase, 0, 1), 0.85 * clampN(phase, 0, 1)); this.shL.rotation.z = 0.9; this.shR.rotation.z = -0.7; break;
      case 'shoot': this.shR.rotation.x = -1.57; this.head.rotation.y = 0; this.shL.rotation.x = -1.3; this.shL.rotation.z = -0.5; break;
      case 'carry': this.shL.rotation.x = -1.0; this.shR.rotation.x = -1.0; this.elL.rotation.x = -0.6; this.elR.rotation.x = -0.6; this.shL.rotation.z = -0.25; this.shR.rotation.z = 0.25;
        this.hipL.rotation.x = s * 0.4; this.hipR.rotation.x = -s * 0.4; this.carryBox.visible = true; this.carryBox.position.set(-0.18, -0.05, 0.25); break;
      case 'smoke': {
        const k = (Math.sin(t * 1.3) + 1) / 2;
        this.shR.rotation.x = -0.4 - k * 0.5; this.elR.rotation.x = -1.6 - k * 0.6; this.shR.rotation.z = 0.3; break;
      }
      case 'lie': this.visual.rotation.x = -Math.PI / 2; this.visual.position.set(0, 0.12, 0.85); this.shL.rotation.z = 0.2; this.shR.rotation.z = -0.2; break;
      case 'dead': case 'fall': this.visual.rotation.x = -Math.PI / 2; this.visual.position.set(0, 0.12, 0.85); this.shL.rotation.z = 1.2; this.shR.rotation.z = -1.0; this.hipL.rotation.z = 0.2; break;
      case 'sitbench': this.hips.position.y = 0.5; this.hipL.rotation.x = -1.5; this.hipR.rotation.x = -1.5; this.knL.rotation.x = 1.5; this.knR.rotation.x = 1.5; this.shL.rotation.x = -0.3; this.shR.rotation.x = -0.3; break;
      case 'swim': // кроль у поверхности: тело горизонтально, голова над водой
        this.visual.rotation.x = 1.38; this.visual.position.set(0, 0.05, -0.75);
        this.head.rotation.x = -0.9; this.shL.rotation.x = -2.6 + s * 1.2; this.shR.rotation.x = -2.6 - s * 1.2; this.elL.rotation.x = -0.3; this.elR.rotation.x = -0.3;
        this.hipL.rotation.x = s * 0.35; this.hipR.rotation.x = -s * 0.35; break;
      case 'tread': { // держится на воде вертикально
        const k = Math.sin(t * 3);
        this.visual.position.y = -1.22 + k * 0.03; this.shL.rotation.z = 0.9 + k * 0.3; this.shR.rotation.z = -0.9 - k * 0.3; this.elL.rotation.x = -0.5; this.elR.rotation.x = -0.5;
        this.hipL.rotation.x = -0.3 + k * 0.4; this.hipR.rotation.x = -0.3 - k * 0.4; this.knL.rotation.x = 0.6; this.knR.rotation.x = 0.6; break;
      }
      case 'scoot': // стоя на самокате
        this.hips.position.y = 0.92; this.hipL.rotation.x = -0.12; this.hipR.rotation.x = 0.18; this.knL.rotation.x = 0.2; this.knR.rotation.x = 0.1;
        this.torso.rotation.x = 0.1 + Math.max(0, -lean) * 0; this.torso.rotation.z = lean * 0.5;
        this.shL.rotation.x = -0.95; this.shR.rotation.x = -0.95; this.shL.rotation.z = -0.22; this.shR.rotation.z = 0.22; this.elL.rotation.x = -0.35; this.elR.rotation.x = -0.35; break;
      case 'ridepass': // пассажир на мотоцикле держится за водителя
        this.hips.position.y = 0; this.hipL.rotation.x = -1.2; this.hipR.rotation.x = -1.2; this.hipL.rotation.z = 0.32; this.hipR.rotation.z = -0.32; this.knL.rotation.x = 1.55; this.knR.rotation.x = 1.55;
        this.torso.rotation.x = 0.3; this.torso.rotation.z = lean * 0.4; this.shL.rotation.x = -1.05; this.shR.rotation.x = -1.05; this.shL.rotation.z = 0.35; this.shR.rotation.z = -0.35; this.elL.rotation.x = -0.6; this.elR.rotation.x = -0.6; break;
      case 'dance1': { // диско: рука вверх-вниз по диагонали, бёдра качаются
        const b = Math.sin(t * 7), h = Math.sin(t * 3.5);
        this.hips.rotation.z = h * 0.12; this.hips.position.y = 0.9 + Math.abs(b) * 0.04; this.torso.rotation.z = -h * 0.15;
        this.shR.rotation.x = h > 0 ? -2.8 : -0.3; this.shR.rotation.z = h > 0 ? 0.4 : -0.3; this.elR.rotation.x = 0;
        this.shL.rotation.z = 0.15; this.elL.rotation.x = -1.4; this.hipL.rotation.x = Math.max(0, b) * 0.4; this.knL.rotation.x = Math.max(0, b) * 0.6; break;
      }
      case 'dance2': { // робот: рывками по 4 позам
        const st = Math.floor(t * 3) % 4;
        this.shL.rotation.x = [-1.57, 0, -1.57, -0.8][st]; this.elL.rotation.x = [-1.57, 0, 0, -1.57][st];
        this.shR.rotation.x = [0, -1.57, -0.8, -1.57][st]; this.elR.rotation.x = [0, -1.57, -1.57, 0][st];
        this.head.rotation.y = [0.5, -0.5, 0, 0][st]; this.torso.rotation.y = [0.2, -0.2, 0.2, -0.2][st]; this.hips.position.y = 0.9; break;
      }
      case 'dance3': { // хип-хоп: пружинит, руки перед собой
        const b = Math.abs(Math.sin(t * 5));
        this.hips.position.y = 0.82 + b * 0.08; this.hipL.rotation.x = -0.4 * (1 - b); this.hipR.rotation.x = -0.4 * (1 - b); this.knL.rotation.x = 0.8 * (1 - b); this.knR.rotation.x = 0.8 * (1 - b);
        this.torso.rotation.x = 0.25; this.head.rotation.x = Math.sin(t * 10) * 0.15;
        this.shL.rotation.x = -1.1 + Math.sin(t * 5) * 0.4; this.shR.rotation.x = -1.1 - Math.sin(t * 5) * 0.4; this.elL.rotation.x = -1.2; this.elR.rotation.x = -1.2; this.shL.rotation.z = 0.4; this.shR.rotation.z = -0.4; break;
      }
      case 'dance4': { // волна: руки по очереди, волна телом
        const w = t * 4;
        this.shL.rotation.z = 1.4 + Math.sin(w) * 0.5; this.shR.rotation.z = -1.4 + Math.sin(w + 1.2) * 0.5; this.elL.rotation.z = Math.sin(w + 0.6) * 0.8; this.elR.rotation.z = Math.sin(w + 1.8) * 0.8;
        this.torso.rotation.z = Math.sin(w + 2.4) * 0.12; this.hips.rotation.z = Math.sin(w + 3) * 0.1; this.head.rotation.z = Math.sin(w + 3.6) * 0.15; break;
      }
      case 'dance5': // кружение с раскинутыми руками
        this.visual.rotation.y = t * 4; this.shL.rotation.z = 1.5; this.shR.rotation.z = -1.5; this.hips.position.y = 0.92 + Math.abs(Math.sin(t * 8)) * 0.04;
        this.hipL.rotation.x = Math.sin(t * 8) * 0.3; this.hipR.rotation.x = -Math.sin(t * 8) * 0.3; this.head.rotation.x = -0.2; break;
      case 'selfie': this.shR.rotation.x = -1.75; this.shR.rotation.z = 0.25; this.elR.rotation.x = -0.35; this.head.rotation.x = -0.05; this.shL.rotation.z = 0.12; this.hips.rotation.z = 0.05; break;
      case 'wave': this.shR.rotation.x = -2.9; this.shR.rotation.z = 0.25 + Math.sin(t * 9) * 0.35; this.elR.rotation.z = Math.sin(t * 9) * 0.3; this.head.rotation.y = 0.1; break;
      case 'clap': { const k = (Math.sin(t * 12) + 1) / 2; this.shL.rotation.x = -1.3; this.shR.rotation.x = -1.3; this.shL.rotation.z = -0.25 - k * 0.3; this.shR.rotation.z = 0.25 + k * 0.3; this.elL.rotation.x = -0.4; this.elR.rotation.x = -0.4; break; }
      case 'sit': // сидя на земле
        this.hips.position.y = 0.18; this.hipL.rotation.x = -1.45; this.hipR.rotation.x = -1.3; this.knL.rotation.x = 0.3; this.knR.rotation.x = 0.9;
        this.torso.rotation.x = -0.15; this.shL.rotation.x = 0.5; this.shR.rotation.x = 0.5; this.elL.rotation.x = -0.2; this.elR.rotation.x = -0.2; break;
      case 'liedown': // на спине, руки за головой
        this.visual.rotation.x = Math.PI / 2; this.visual.position.set(0, 0.14, -0.85); this.shL.rotation.x = -2.8; this.shR.rotation.x = -2.8; this.elL.rotation.x = -2.2; this.elR.rotation.x = -2.2; this.knL.rotation.x = 0.6; this.hipL.rotation.x = -0.6; break;
      case 'pushup': { // отжимания
        const k = (Math.sin(t * 4) + 1) / 2;
        this.visual.rotation.x = 1.25 + k * 0.12; this.visual.position.set(0, 0.06 + (1 - k) * 0.12, -0.2);
        this.shL.rotation.x = -1.6 + (1 - k) * 0.9; this.shR.rotation.x = -1.6 + (1 - k) * 0.9; this.elL.rotation.x = -(1 - k) * 1.6; this.elR.rotation.x = -(1 - k) * 1.6;
        this.shL.rotation.z = -0.3; this.shR.rotation.z = 0.3; this.head.rotation.x = -0.6; break;
      }
    }
  }
  dispose() { this.root.parent?.remove(this.root); this.visual.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.merged) m.geometry.dispose(); }); }
}
