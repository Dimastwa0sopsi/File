// Процедурные текстуры (Canvas) и кэш материалов
import * as THREE from 'three';
import { RNG } from './config';

export const GFX = { pbr: true };
const texCache = new Map<string, THREE.Texture>();
const matCache = new Map<string, THREE.Material>();

function canvas(w: number, h: number) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}
function toTex(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** детерминированный хэш для процедурного шума */
function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smoothStep = (t: number) => t * t * (3 - 2 * t);
/** сглаженный value-noise в точке (x, y) */
function noise2(x: number, y: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = smoothStep(xf), v = smoothStep(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
/**
 * Реалистичный асфальт: две октавы шума (крупные пятна + мелкое зерно),
 * каменная крошка, поры, лёгкие потёртости. Пишется попиксельно через ImageData.
 */
function asphalt(g: CanvasRenderingContext2D, w: number, h: number, base: string, seed: number) {
  const r = new RNG(seed);
  const [br, bg, bb] = rgbOf(base);
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // крупная пятнистость (пятна масла/ремонта) + мелкое зерно
      const big = noise2(x / 26, y / 26, seed) - 0.5;
      const fine = noise2(x / 2.6, y / 2.6, seed + 17) - 0.5;
      let k = big * 26 + fine * 17;
      // каменная крошка: редкие светлые/тёмные вкрапления
      const sp = hash2(x, y, seed + 91);
      if (sp > 0.986) k += 26 + sp * 30;
      else if (sp < 0.012) k -= 20 + sp * 620;
      // поры: тёмные точки
      if (hash2(x + 7, y - 3, seed + 233) > 0.997) k -= 34;
      const clampC = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
      d[i] = clampC(br + k + r.range(-3, 3));
      d[i + 1] = clampC(bg + k + r.range(-3, 3));
      d[i + 2] = clampC(bb + k * 1.05 + r.range(-3, 3));
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // дополнительные жирные пятна и замасленные участки
  for (let i = 0; i < 10; i++) {
    g.fillStyle = r.chance(0.55) ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.025)';
    g.beginPath(); g.ellipse(r.range(0, w), r.range(0, h), r.range(w * 0.06, w * 0.22), r.range(h * 0.02, h * 0.09), r.next() * 3, 0, 7); g.fill();
  }
}
function noise(g: CanvasRenderingContext2D, w: number, h: number, base: string, amt: number, n: number, seed = 1) {
  const r = new RNG(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(r.range(-amt, amt));
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    const s = r.range(1, 3);
    g.fillRect(r.range(0, w), r.range(0, h), s, s);
  }
}
export function getTex(key: string): THREE.Texture {
  const c0 = texCache.get(key); if (c0) return c0;
  let t: THREE.Texture;
  const W = 128;
  switch (key) {
    case 'road_city': case 'road_highway': case 'road_village': case 'road_industrial': {
      // высокое разрешение: попиксельная зернистость + разметка в удвоенном масштабе
      const [c, g] = canvas(512, 1024);
      asphalt(g, 512, 1024, key === 'road_village' ? '#45464a' : '#37383c', 31);
      g.save(); g.scale(2, 2); // дальше рисуем в «логических» 256×512
      const r = new RNG(key.length * 7);
      // стыки полотна (сварные швы асфальтоукладчика)
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 254, 256, 2); g.fillRect(0, 126, 256, 1);
      // трещины и заплатки
      g.strokeStyle = 'rgba(15,15,18,0.55)'; g.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) { let x = r.range(20, 236), y = r.range(0, 512); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += r.range(-10, 10); y += r.range(4, 16); g.lineTo(x, y); } g.stroke(); }
      for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(${r.chance(0.5) ? '20,20,24' : '70,70,74'},0.35)`; g.fillRect(r.range(30, 180), r.range(0, 470), r.range(20, 50), r.range(16, 40)); }
      // колеи (тёмные полосы от шин)
      g.fillStyle = 'rgba(10,10,12,0.18)'; for (const x of [44, 84, 172, 212]) g.fillRect(x, 0, 16, 512);
      const line = (x: number, w: number, color: string, dash = 0, gap = 0) => {
        g.fillStyle = color;
        if (!dash) { g.fillRect(x, 0, w, 512); return; }
        for (let y = 0; y < 512; y += dash + gap) g.fillRect(x, y, w, dash);
      };
      const paint = 'rgba(240,240,236,0.92)', yel = 'rgba(245,197,24,0.95)';
      if (key === 'road_city') { line(8, 5, paint); line(243, 5, paint); line(125, 6, paint, 160, 96); }
      else if (key === 'road_highway') { line(6, 5, paint); line(245, 5, paint); line(121, 4, yel); line(131, 4, yel); line(63, 4, paint, 120, 136); line(189, 4, paint, 120, 136); }
      else if (key === 'road_village') { line(126, 4, 'rgba(235,235,230,0.8)', 110, 146); g.fillStyle = 'rgba(110,90,60,0.35)'; g.fillRect(0, 0, 10, 512); g.fillRect(246, 0, 10, 512); }
      else { line(8, 5, yel); line(243, 5, yel); }
      // износ разметки и кромки полотна
      g.fillStyle = 'rgba(56,57,61,0.5)'; for (let i = 0; i < 520; i++) g.fillRect(r.range(0, 256), r.range(0, 512), 2, 2);
      const edge = g.createLinearGradient(0, 0, 14, 0);
      edge.addColorStop(0, 'rgba(0,0,0,0.34)'); edge.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = edge; g.fillRect(0, 0, 14, 512);
      const edge2 = g.createLinearGradient(256, 0, 242, 0);
      edge2.addColorStop(0, 'rgba(0,0,0,0.34)'); edge2.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = edge2; g.fillRect(242, 0, 14, 512);
      g.restore();
      t = toTex(c); break;
    }
    case 'road_dirt': {
      const [c, g] = canvas(128, 128);
      noise(g, 128, 128, '#8a6f4d', 30, 3000, 5);
      g.fillStyle = 'rgba(70,52,32,0.55)'; g.fillRect(26, 0, 16, 128); g.fillRect(86, 0, 16, 128);
      g.fillStyle = 'rgba(120,150,70,0.5)'; g.fillRect(56, 0, 16, 128);
      t = toTex(c); break;
    }
    case 'zebra': {
      const [c, g] = canvas(128, 32);
      g.clearRect(0, 0, 128, 32);
      g.fillStyle = '#f0f0f0';
      for (let i = 0; i < 8; i++) g.fillRect(i * 16 + 3, 0, 9, 22);
      g.fillRect(0, 27, 128, 5);
      t = toTex(c, false); break;
    }
    case 'patch': { const [c, g] = canvas(256, 256); asphalt(g, 256, 256, '#38393d', 4); t = toTex(c); break; }
    case 'sidewalk': {
      const [c, g] = canvas(256, 256); const r = new RNG(7);
      g.fillStyle = '#7d7b76'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
        const ox = (y % 2) * 32, l = 150 + r.int(-14, 14);
        g.fillStyle = `rgb(${l},${l - 3},${l - 9})`; g.fillRect(x * 64 + ox + 2, y * 32 + 2, 60, 28);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x * 64 + ox + 2, y * 32 + 2, 60, 3);
        g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x * 64 + ox + 2, y * 32 + 27, 60, 3);
      }
      g.drawImage(c, -256, 0); // повтор сдвинутого ряда
      for (let i = 0; i < 1600; i++) { g.fillStyle = r.chance(0.5) ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)'; g.fillRect(r.range(0, 256), r.range(0, 256), 1.5, 1.5); }
      g.fillStyle = 'rgba(60,70,40,0.25)'; for (let i = 0; i < 30; i++) g.fillRect(r.range(0, 256), r.int(0, 8) * 32, r.range(4, 14), 2);
      t = toTex(c); break;
    }
    case 'grass': {
      const [c, g] = canvas(256, 256); noise(g, 256, 256, '#5a8a38', 22, 6000, 9);
      const r = new RNG(19);
      for (let i = 0; i < 40; i++) { g.fillStyle = r.chance(0.5) ? 'rgba(120,150,60,0.18)' : 'rgba(40,80,30,0.18)'; g.beginPath(); g.arc(r.range(0, 256), r.range(0, 256), r.range(10, 40), 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(150,190,90,0.35)'; for (let i = 0; i < 900; i++) { const x = r.range(0, 256), y = r.range(0, 256); g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-1, 1), y - r.range(2, 5)); g.stroke(); }
      t = toTex(c); break;
    }
    case 'cloud': {
      const [c, g] = canvas(256, 128); const r = new RNG(31);
      for (let i = 0; i < 26; i++) { const x = r.range(50, 206), y = r.range(45, 85), rad = r.range(18, 44); const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
      t = toTex(c, false); break;
    }
    case 'blob': {
      const [c, g] = canvas(64, 64); const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      t = toTex(c, false); break;
    }
    case 'glowdisc': {
      const [c, g] = canvas(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,220,150,0.9)'); gr.addColorStop(0.5, 'rgba(255,200,120,0.35)'); gr.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      t = toTex(c, false); break;
    }
    case 'sand': {
      const [c, g] = canvas(256, 256); noise(g, 256, 256, '#e2cd96', 18, 12000, 11);
      g.strokeStyle = 'rgba(160,130,80,0.18)'; g.lineWidth = 2; for (let y = 10; y < 256; y += 22) { g.beginPath(); for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x / 20 + y) * 4); g.stroke(); }
      t = toTex(c); break;
    }
    case 'soil': {
      const [c, g] = canvas(W, W); noise(g, W, W, '#6b4a2b', 25, 2500, 12);
      g.fillStyle = 'rgba(40,25,10,0.4)'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 16, W, 6);
      t = toTex(c); break;
    }
    case 'wheat': {
      const [c, g] = canvas(64, 64); noise(g, 64, 64, '#d9b44a', 40, 900, 13);
      g.strokeStyle = 'rgba(150,110,30,0.6)'; for (let i = 0; i < 30; i++) { g.beginPath(); const x = (i * 37) % 64; g.moveTo(x, 64); g.lineTo(x + 3, 10); g.stroke(); }
      t = toTex(c); break;
    }
    case 'concrete': {
      const [c, g] = canvas(256, 256); noise(g, 256, 256, '#8f8e89', 16, 8000, 14);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(256, i * 128); g.stroke(); }
      const r = new RNG(15); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,55,45,0.12)'; g.beginPath(); g.arc(r.range(0, 256), r.range(0, 256), r.range(8, 30), 0, 7); g.fill(); }
      t = toTex(c); break;
    }
    case 'asphalt': { const [c, g] = canvas(256, 256); asphalt(g, 256, 256, '#3e3f43', 15); t = toTex(c); break; }
    case 'water': {
      const [c, g] = canvas(W, W); noise(g, W, W, '#2a6f97', 25, 1500, 16);
      g.strokeStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 20; i++) { g.beginPath(); const y = (i * 23) % W; g.moveTo((i * 41) % W, y); g.lineTo(((i * 41) % W) + 20, y + 2); g.stroke(); }
      t = toTex(c); break;
    }
    case 'roof': {
      const [c, g] = canvas(256, 256); noise(g, 256, 256, '#5b5c60', 26, 9000, 17);
      const r = new RNG(18);
      g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); }
      for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(30,30,35,0.25)'; g.beginPath(); g.ellipse(r.range(0, 256), r.range(0, 256), r.range(10, 30), r.range(6, 18), r.next() * 3, 0, 7); g.fill(); }
      t = toTex(c); break;
    }
    case 'tiles': {
      const [c, g] = canvas(64, 64); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 4; i++) g.fillRect(0, i * 16, 64, 2);
      for (let r = 0; r < 4; r++) for (let i = 0; i < 3; i++) g.fillRect(i * 22 + (r % 2) * 11, r * 16, 2, 16);
      t = toTex(c); break;
    }
    case 'parquet': {
      const [c, g] = canvas(128, 128);
      for (let r = 0; r < 8; r++) for (let i = 0; i < 2; i++) { const l = 40 + ((r * 7 + i * 13) % 20); g.fillStyle = `rgb(${150 + l},${100 + l * 0.6},${60})`; g.fillRect(i * 64 + (r % 2) * 32, r * 16, 64, 15); }
      t = toTex(c); break;
    }
    case 'floortile': {
      const [c, g] = canvas(64, 64); g.fillStyle = '#d6d3cd'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#c4c0b8'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
      t = toTex(c); break;
    }
    case 'wallpaper': {
      const [c, g] = canvas(128, 128);
      g.fillStyle = '#e7dfd1'; g.fillRect(0, 0, 128, 128);
      // вертикальные полосы обоев
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? 'rgba(196,180,150,0.55)' : 'rgba(255,255,255,0.35)'; g.fillRect(i * 16, 0, 8, 128); }
      // мелкий ромбовидный узор
      g.fillStyle = 'rgba(160,138,104,0.35)';
      for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) {
        const cx = 8 + i * 32 + (r % 2) * 16, cy = 16 + r * 32;
        g.beginPath(); g.moveTo(cx, cy - 4); g.lineTo(cx + 4, cy); g.lineTo(cx, cy + 4); g.lineTo(cx - 4, cy); g.closePath(); g.fill();
      }
      // бордюр сверху
      g.fillStyle = 'rgba(120,100,70,0.25)'; g.fillRect(0, 0, 128, 7);
      t = toTex(c); break;
    }
    case 'walltile': {
      const [c, g] = canvas(128, 128);
      g.fillStyle = '#dfe7ea'; g.fillRect(0, 0, 128, 128);
      for (let r = 0; r < 8; r++) for (let i = 0; i < 8; i++) {
        const v = 226 + ((i * 7 + r * 13) % 18);
        g.fillStyle = `rgb(${v - 8},${v},${v + 2})`; g.fillRect(i * 16 + 1, r * 16 + 1, 14, 14);
      }
      g.strokeStyle = 'rgba(140,155,160,0.55)'; g.lineWidth = 1;
      for (let k = 0; k <= 8; k++) { g.beginPath(); g.moveTo(k * 16, 0); g.lineTo(k * 16, 128); g.stroke(); g.beginPath(); g.moveTo(0, k * 16); g.lineTo(128, k * 16); g.stroke(); }
      t = toTex(c); break;
    }
    case 'woodpanel': {
      const [c, g] = canvas(128, 128);
      g.fillStyle = '#8b5a2b'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 8; i++) {
        const l = 26 + ((i * 37) % 24);
        g.fillStyle = `rgb(${120 + l},${78 + l * 0.6},${40 + l * 0.35})`;
        g.fillRect(i * 16, 0, 14, 128);
        g.strokeStyle = 'rgba(60,34,14,0.55)'; g.lineWidth = 1;
        for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(i * 16 + 2 + k * 3, 0); g.bezierCurveTo(i * 16 + 4 + k * 3, 40, i * 16 + k * 3, 80, i * 16 + 3 + k * 3, 128); g.stroke(); }
        g.fillStyle = 'rgba(40,22,8,0.5)'; g.fillRect(i * 16 + 14, 0, 2, 128);
      }
      t = toTex(c); break;
    }
    case 'brickwall': {
      const [c, g] = canvas(128, 128); g.fillStyle = '#8f8a84'; g.fillRect(0, 0, 128, 128);
      for (let r = 0; r < 16; r++) for (let i = 0; i < 5; i++) { g.fillStyle = `rgb(${150 + ((r * 31 + i * 17) % 30)},${62 + ((r * 7 + i) % 15)},${45})`; g.fillRect(i * 28 + (r % 2) * 14 - 14, r * 8, 26, 7); }
      t = toTex(c); break;
    }
    default: {
      if (key.startsWith('facade_')) { t = facadeTex(key.slice(7), false); break; }
      if (key.startsWith('facadeE_')) { t = facadeTex(key.slice(8), true); break; }
      if (key.startsWith('sign_')) { t = signTex(key.slice(5)); break; }
      if (key.startsWith('face_')) { t = faceTex(key.slice(5)); break; }
      const [c, g] = canvas(4, 4); g.fillStyle = '#ff00ff'; g.fillRect(0, 0, 4, 4); t = toTex(c);
    }
  }
  texCache.set(key, t);
  return t;
}

/** фасады: 1 тайл = 4x4 окна, 16м x 12.8м */
export const FACADE_TILE = { w: 16, h: 12.8 };
function facadeTex(kind: string, emissive: boolean): THREE.Texture {
  const S = 512, cols = 4, rows = 4, cw = S / cols, rh = S / rows;
  const [c, g] = canvas(S, S);
  const r = new RNG(kind.length * 977 + (emissive ? 3 : 0) + kind.charCodeAt(0));
  const base: Record<string, string> = { glass: '#2f4a63', office: '#c4beb4', brick: '#9a4c38', plaster: '#ddd0b0', panel: '#cfccc5', luxres: '#ece6da', civic: '#d8c9a5', shop: '#cfc8bd', mall: '#aab6c3', factory: '#8a8e93', wood: '#86562f', kiosk: '#d8d8d8' };
  if (emissive) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); }
  else if (kind === 'brick') {
    g.fillStyle = '#7f7a74'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S / 8; y++) for (let x = -1; x < S / 24 + 1; x++) {
      const l = r.int(-18, 14); g.fillStyle = `rgb(${150 + l},${72 + (l >> 1)},${52 + (l >> 2)})`;
      g.fillRect(x * 24 + (y % 2) * 12 + 1, y * 8 + 1, 22, 6);
    }
  } else if (kind === 'wood') {
    g.fillStyle = base.wood; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 16) { const l = r.int(-12, 12); g.fillStyle = `rgb(${134 + l},${86 + l},${47 + l})`; g.fillRect(0, y, S, 14); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y + 14, S, 2); }
  } else if (kind === 'panel') {
    noise(g, S, S, base.panel, 10, 6000, 22);
    g.fillStyle = 'rgba(0,0,0,0.16)'; for (let i = 0; i <= cols; i++) g.fillRect(i * cw - 1, 0, 2, S); for (let i = 0; i <= rows; i++) g.fillRect(0, i * rh - 1, S, 2);
  } else if (kind === 'glass') {
    const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, '#5f87ad'); gr.addColorStop(0.5, '#2c4864'); gr.addColorStop(1, '#456a8d');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  } else noise(g, S, S, base[kind] ?? '#bbb', 12, 7000, 22);
  // межэтажные пояса
  if (!emissive && kind !== 'glass' && kind !== 'factory') { g.fillStyle = 'rgba(0,0,0,0.10)'; for (let y = 0; y < rows; y++) g.fillRect(0, y * rh + rh - 6, S, 6); g.fillStyle = 'rgba(255,255,255,0.12)'; for (let y = 0; y < rows; y++) g.fillRect(0, y * rh + rh - 8, S, 2); }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    let wx = x * cw + cw * 0.2, wy = y * rh + rh * 0.2, ww = cw * 0.6, wh = rh * 0.56;
    if (kind === 'glass') { wx = x * cw + 3; ww = cw - 6; wy = y * rh + 4; wh = rh - 8; }
    if (kind === 'office') { wx = x * cw + 8; ww = cw - 16; }
    if (kind === 'factory') { wy = y * rh + rh * 0.12; wh = rh * 0.3; if (y > 1) continue; }
    if ((kind === 'kiosk' || kind === 'shop' || kind === 'mall') && y === 3) continue;
    if (emissive) {
      const lit = r.chance(kind === 'glass' || kind === 'office' ? 0.45 : 0.38);
      if (!lit) continue;
      const warm = r.chance(0.72);
      const gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, warm ? '#ffe2a6' : '#d9ecff'); gr.addColorStop(1, warm ? '#f4b862' : '#9cc6f0');
      g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
      if (r.chance(0.5)) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(wx + ww * r.range(0.1, 0.6), wy + wh * 0.25, ww * 0.25, wh * 0.75); } // силуэт штор/мебели
      continue;
    }
    // проём: тень, стекло с отражением неба, рама, импост, подоконник
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    const sky = g.createLinearGradient(wx, wy, wx + ww * 0.6, wy + wh);
    if (kind === 'glass') { sky.addColorStop(0, '#a9cbe8'); sky.addColorStop(0.45, '#557c9f'); sky.addColorStop(1, '#2a425a'); }
    else { sky.addColorStop(0, '#8fb3cf'); sky.addColorStop(0.5, '#3e5870'); sky.addColorStop(1, '#253545'); }
    g.fillStyle = sky; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(wx, wy + wh * 0.7); g.lineTo(wx + ww * 0.45, wy); g.lineTo(wx + ww * 0.6, wy); g.lineTo(wx, wy + wh); g.closePath(); g.fill();
    if (r.chance(0.35) && kind !== 'glass') { g.fillStyle = r.chance(0.5) ? 'rgba(240,235,220,0.75)' : 'rgba(180,160,130,0.7)'; g.fillRect(wx + 2, wy + 2, ww * r.range(0.2, 0.45), wh - 4); } // шторы
    const frame = kind === 'glass' ? 'rgba(25,32,42,0.9)' : kind === 'wood' ? '#f3ead8' : '#eeece6';
    g.strokeStyle = frame; g.lineWidth = kind === 'glass' ? 3 : 4; g.strokeRect(wx, wy, ww, wh);
    g.fillStyle = frame; g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); if (kind !== 'glass') g.fillRect(wx, wy + wh * 0.32, ww, 3);
    if (kind !== 'glass') { g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(wx - 6, wy + wh + 2, ww + 12, 5); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(wx - 6, wy + wh + 7, ww + 12, 3); }
    if (kind === 'brick' || kind === 'civic') { g.fillStyle = 'rgba(235,225,205,0.8)'; g.fillRect(wx - 5, wy - 9, ww + 10, 6); }
  }
  if (!emissive && kind === 'glass') { g.fillStyle = 'rgba(20,26,34,0.95)'; for (let y = 0; y <= rows; y++) g.fillRect(0, y * rh - 3, S, 6); for (let x = 0; x <= cols; x++) g.fillRect(x * cw - 2, 0, 4, S); }
  // грязь у низа и вертикальные потёки
  if (!emissive) { const gr = g.createLinearGradient(0, S - 60, 0, S); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(30,25,20,0.18)'); g.fillStyle = gr; g.fillRect(0, S - 60, S, 60); for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(0,0,0,0.04)'; g.fillRect(r.range(0, S), 0, r.range(3, 10), S); } }
  const tx = toTex(c); tx.anisotropy = 8; return tx;
}
function signTex(text: string): THREE.Texture {
  const [c, g] = canvas(512, 96);
  const [label, color] = text.split('|');
  g.fillStyle = color || '#1e3a8a'; g.fillRect(0, 0, 512, 96);
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, 0, 512, 10);
  g.fillStyle = '#fff'; g.font = 'bold 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = 46; while (g.measureText(label).width > 490 && fs > 18) { fs -= 2; g.font = `bold ${fs}px system-ui, sans-serif`; }
  g.fillText(label, 256, 50);
  const t = toTex(c, false); return t;
}
/** лицо: face_<пол>_<тон кожи>_<глаза>_<брови>_<цвет бровей>_<нос>_<губы>_<цвет губ> */
function faceTex(spec: string): THREE.Texture {
  const [gender = 'm', skin = '#f1c9a5', eye = '#3b6ea5', brows = 'straight', browColor = '#3a2a1a', nose = 'straight', lips = 'full', lipColor = ''] = spec.split('_');
  const [c, g] = canvas(64, 64);
  g.fillStyle = skin || '#f1c9a5'; g.fillRect(0, 0, 64, 64);
  // мягкая светотень на скулах и подбородке — лицо перестаёт быть плоским
  const shade = g.createLinearGradient(0, 10, 0, 64);
  shade.addColorStop(0, 'rgba(255,255,255,0.10)'); shade.addColorStop(0.55, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = shade; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(200,120,110,0.16)'; g.beginPath(); g.ellipse(13, 42, 8, 5, 0, 0, 7); g.ellipse(51, 42, 8, 5, 0, 0, 7); g.fill();
  // брови
  g.fillStyle = browColor;
  if (brows !== 'none') {
    if (brows === 'arched') { g.beginPath(); g.moveTo(13, 21); g.quadraticCurveTo(20, 16, 27, 21); g.lineTo(27, 23); g.quadraticCurveTo(20, 18.5, 13, 23); g.fill();
      g.beginPath(); g.moveTo(37, 21); g.quadraticCurveTo(44, 16, 51, 21); g.lineTo(51, 23); g.quadraticCurveTo(44, 18.5, 37, 23); g.fill(); }
    else if (brows === 'thin') { g.fillRect(14, 20, 13, gender === 'f' ? 1.4 : 2); g.fillRect(37, 20, 13, gender === 'f' ? 1.4 : 2); }
    else if (brows === 'thick') { g.fillRect(13, 18, 15, 4.5); g.fillRect(36, 18, 15, 4.5); }
    else if (brows === 'angry') { g.save(); g.translate(20, 21); g.rotate(0.18); g.fillRect(-7, -2, 14, 3.6); g.restore(); g.save(); g.translate(44, 21); g.rotate(-0.18); g.fillRect(-7, -2, 14, 3.6); g.restore(); }
    else { g.fillRect(14, 20, 13, gender === 'f' ? 2 : 3.2); g.fillRect(37, 20, 13, gender === 'f' ? 2 : 3.2); }
  }
  // глаза
  g.fillStyle = '#fff'; g.fillRect(15, 26, 11, 7); g.fillRect(38, 26, 11, 7);
  g.fillStyle = eye; g.fillRect(19, 27, 5, 6); g.fillRect(42, 27, 5, 6);
  g.fillStyle = '#111'; g.fillRect(20, 28, 3, 4); g.fillRect(43, 28, 3, 4);
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(20.5, 29, 1, 1); g.fillRect(43.5, 29, 1, 1);
  // нос: рисуем тень и крылья
  if (nose === 'wide') { g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(27, 32, 10, 7); g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(25, 39, 4, 2); g.fillRect(35, 39, 4, 2); }
  else if (nose === 'small') { g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(30, 34, 4, 4); }
  else if (nose === 'hooked') { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(30, 30, 5, 9); g.fillRect(29, 39, 8, 2.4); }
  else if (nose === 'long') { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(29, 30, 7, 11); g.fillRect(27, 40, 4, 2); g.fillRect(34, 40, 4, 2); }
  else { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(30, 33, 5, 5); g.fillRect(28, 38.5, 3, 1.6); g.fillRect(34, 38.5, 3, 1.6); }
  if (gender === 'f') { g.fillStyle = '#111'; g.fillRect(14, 25, 13, 1.4); g.fillRect(37, 25, 13, 1.4); }
  // губы
  const lc = lipColor || (gender === 'f' ? '#c2185b' : '#8a4a3a');
  g.fillStyle = lc;
  if (lips === 'thin') { g.fillRect(25, 47, 14, 2); }
  else if (lips === 'wide') { g.fillRect(21, 46.5, 22, 3.4); }
  else if (lips === 'bow') { g.beginPath(); g.moveTo(23, 48); g.quadraticCurveTo(29, 43.5, 32, 47); g.quadraticCurveTo(35, 43.5, 41, 48); g.quadraticCurveTo(32, 53, 23, 48); g.fill(); }
  else { g.beginPath(); g.ellipse(32, 47, 8.5, 3.4, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(24, 46.6, 16, 0.8); }
  if (gender === 'm') { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(12, 44, 40, 16); }
  const t = toTex(c, false); t.magFilter = THREE.NearestFilter; return t;
}

// ---------- материалы ----------
export function mat(key: string): THREE.Material {
  const m0 = matCache.get(key); if (m0) return m0;
  let m: THREE.Material;
  const L = (p: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(p);
  if (key.startsWith('c:')) m = L({ color: key.slice(2) });
  else if (key.startsWith('paint:')) m = GFX.pbr ? new THREE.MeshStandardMaterial({ color: key.slice(6), metalness: 0.45, roughness: 0.3 }) : new THREE.MeshPhongMaterial({ color: key.slice(6), shininess: 90, specular: 0x666666 });
  else if (key.startsWith('chrome')) m = GFX.pbr ? new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 1, roughness: 0.12 }) : new THREE.MeshPhongMaterial({ color: 0xdddddd, shininess: 120, specular: 0xffffff });
  else if (key === 'blob') m = new THREE.MeshBasicMaterial({ map: getTex('blob'), transparent: true, depthWrite: false, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  else if (key === 'lampcone') { m = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); m.userData.cone = true; }
  else if (key === 'lamppool') { m = new THREE.MeshBasicMaterial({ map: getTex('glowdisc'), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); m.userData.pool = true; }
  else if (key.startsWith('glow:')) m = new THREE.MeshBasicMaterial({ color: key.slice(5) });
  else if (key.startsWith('glass:')) m = GFX.pbr
    ? new THREE.MeshStandardMaterial({ color: 0x1c2a38, transparent: true, opacity: Math.min(0.95, parseFloat(key.slice(6)) + 0.1), metalness: 0.3, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshPhongMaterial({ color: 0x223344, transparent: true, opacity: parseFloat(key.slice(6)), shininess: 100, depthWrite: false, side: THREE.DoubleSide });
  else if (key.startsWith('facade:')) {
    const [k, tint] = key.slice(7).split(':');
    const p = { map: getTex('facade_' + k), emissiveMap: getTex('facadeE_' + k), emissive: new THREE.Color(0xffffff), emissiveIntensity: 0, color: new THREE.Color(tint || '#ffffff') };
    m = GFX.pbr && (k === 'glass' || k === 'luxres') ? new THREE.MeshStandardMaterial({ ...p, metalness: k === 'glass' ? 0.55 : 0.1, roughness: k === 'glass' ? 0.18 : 0.75 }) : L(p);
    m.userData.night = true;
  } else if (key === 'lamp') {
    m = L({ color: 0xf5f5f0, emissive: new THREE.Color(0xffe2a0), emissiveIntensity: 0 });
    (m as THREE.MeshLambertMaterial).userData.night = true;
  } else if (key.startsWith('sign:')) m = new THREE.MeshBasicMaterial({ map: getTex('sign_' + key.slice(5)) });
  else if (key.startsWith('tex:')) {
    const k = key.slice(4);
    m = L({ map: getTex(k) });
  } else if (key.startsWith('road:')) {
    const k = key.slice(5);
    // асфальт с процедурной картой: при PBR добавляем шероховатость для отблесков на солнце
    m = GFX.pbr && !k.includes('dirt')
      ? new THREE.MeshStandardMaterial({ map: getTex(k), roughness: 0.94, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      : L({ map: getTex(k), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  } else if (key === 'zebra') m = L({ map: getTex('zebra'), transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
  else if (key === 'water') m = GFX.pbr ? new THREE.MeshStandardMaterial({ map: getTex('water'), color: 0x7fb6d8, transparent: true, opacity: 0.9, metalness: 0.35, roughness: 0.12 }) : new THREE.MeshPhongMaterial({ map: getTex('water'), color: 0x88bbdd, transparent: true, opacity: 0.88, shininess: 80 });
  else m = L({ color: 0xff00ff });
  matCache.set(key, m);
  return m;
}
export function allMaterials() { return matCache; }
export function disposeTextures() {
  texCache.forEach((t) => t.dispose()); texCache.clear();
  matCache.forEach((m) => m.dispose()); matCache.clear();
}
