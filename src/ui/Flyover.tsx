// Стартовая заставка: кинематографичный облёт Лос-Города на canvas.
// Рисуем процедурный город в перспективе (без текстур и сторонних библиотек):
// небо с закатом, сетка улиц, река, пляж и дома с подсвеченными окнами.
import { useEffect, useRef } from 'react';

type Box = { x: number; z: number; w: number; d: number; h: number; c: string; win: boolean };
type V3 = { x: number; y: number; z: number };

/** детерминированный генератор: город всегда одинаковый */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACE = ['#6b7a8f', '#8493a6', '#c8ccd4', '#d8c7b4', '#b7c3cf', '#a9b6a8', '#e3d5c3'];

function buildFar(): Box[] {
  const r = rng(777);
  const out: Box[] = [];
  for (let i = 0; i < 260; i++) {
    const a = -Math.PI * (0.15 + r() * 0.7), rad = 320 + r() * 900;
    out.push({ x: Math.cos(a) * rad, z: -120 - Math.abs(Math.sin(a)) * rad, w: 16 + r() * 22, d: 16 + r() * 22, h: 10 + r() * 55, c: FACE[Math.floor(r() * FACE.length)], win: false });
  }
  return out.sort((a, b) => b.z - a.z);
}

function buildCity(): Box[] {
  const r = rng(20251231);
  const out: Box[] = [];
  const N = 11;
  const cell = 46;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const cx = (i - N / 2) * cell, cz = (j - N / 2) * cell;
    const dc = Math.hypot(i - (N - 1) / 2, j - (N - 1) / 2);
    const near = Math.max(0, 1 - dc / (N * 0.62));
    // в центре — небоскрёбы, на окраинах — малоэтажные дома
    const blocks = dc < 2.4 ? 1 : 2;
    for (let k = 0; k < blocks; k++) {
      const ox = blocks === 1 ? 0 : (k ? 1 : -1) * 11;
      const w = 12 + r() * 6, d = 12 + r() * 6;
      const h = 8 + near * near * 120 * (0.35 + r() * 0.9) + r() * 10;
      out.push({
        x: cx + ox, z: cz + (r() - 0.5) * 8, w, d, h,
        c: FACE[Math.floor(r() * FACE.length)],
        win: h > 22,
      });
    }
  }
  return out.sort((a, b) => b.z - a.z);
}

export function Flyover({ className }: { className?: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = cv.current!;
    const g = c.getContext('2d')!;
    const city = [...buildFar(), ...buildCity()];
    let raf = 0;
    let alive = true;
    const start = performance.now();
    const dpr = () => Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const k = dpr();
      const w = Math.round(c.clientWidth * k), h = Math.round(c.clientHeight * k);
      if (w > 0 && h > 0 && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
    };

    const draw = () => {
      if (!alive) return;
      resize();
      const W = c.width, H = c.height;
      if (!W || !H) { raf = requestAnimationFrame(draw); return; }
      const t = (performance.now() - start) / 1000;
      const k = H / 720; // масштаб под размер экрана

      // ---- небо ----
      const sky = g.createLinearGradient(0, 0, 0, H * 0.72);
      sky.addColorStop(0, '#0b1730');
      sky.addColorStop(0.45, '#2b3f63');
      sky.addColorStop(0.72, '#8a6a74');
      sky.addColorStop(1, '#e0a273');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // солнце у горизонта
      const sunX = W * (0.62 + Math.sin(t * 0.05) * 0.02), sunY = H * 0.6;
      const glow = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.55);
      glow.addColorStop(0, 'rgba(255,196,138,.55)');
      glow.addColorStop(0.4, 'rgba(255,150,110,.18)');
      glow.addColorStop(1, 'rgba(255,150,110,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, H);
      // облака
      g.fillStyle = 'rgba(255,235,225,.10)';
      for (let i = 0; i < 7; i++) {
        const cx = ((i * 317 + t * 6) % (W + 500)) - 250, cy = H * (0.16 + (i % 4) * 0.07);
        g.beginPath(); g.ellipse(cx, cy, 190 * k, 26 * k, 0, 0, 7); g.fill();
      }

      // ---- камера ----
      const camX = Math.sin(t * 0.06) * 90, camZ = -150 + Math.cos(t * 0.045) * 40;
      const camY = 120 + Math.sin(t * 0.08) * 12;
      const yaw = Math.sin(t * 0.06) * 0.10;
      const pitch = -0.045;
      const fov = H * 1.55;
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const project = (p: V3) => {
        // мир → камера
        let dx = p.x - camX, dy = p.y - camY, dz = p.z - camZ;
        const rx = dx * cosY - dz * sinY, rz = dx * sinY + dz * cosY;
        dx = rx; dz = rz;
        const cp = Math.cos(pitch), sp = Math.sin(pitch);
        const up = dy * cp - dz * sp, fwd = dy * sp + dz * cp;
        if (fwd < 8) return null;
        return { x: W / 2 + (dx * fov) / fwd / 2.2, y: H / 2 - (up * fov) / fwd / 2.2, d: fwd };
      };
      const quad = (pts: (ReturnType<typeof project>)[], fill: string) => {
        if (pts.some((p) => !p)) return;
        g.beginPath();
        const a = pts[0]!;
        g.moveTo(a.x, a.y);
        for (let i = 1; i < pts.length; i++) { const p = pts[i]!; g.lineTo(p.x, p.y); }
        g.closePath(); g.fillStyle = fill; g.fill();
      };

      // ---- земля ----
      g.fillStyle = '#243522';
      g.beginPath();
      const far = project({ x: camX, y: 0, z: camZ + 4000 });
      if (far) g.rect(0, far.y, W, H * 2); else g.rect(0, 0, W, H);
      g.fill();

      // ---- сетка улиц (дальние — светлее) ----
      const N = 11, cell = 46, span = (N / 2) * cell + 30;
      for (let i = 0; i <= N + 1; i++) {
        const u = -span + i * cell;
        const a = project({ x: u, y: 0, z: -span }), b = project({ x: u, y: 0, z: span });
        if (!a || !b) continue;
        g.strokeStyle = 'rgba(120,138,150,.35)'; g.lineWidth = Math.max(1, 7 * k);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        const a2 = project({ x: -span, y: 0, z: u }), b2 = project({ x: span, y: 0, z: u });
        if (!a2 || !b2) continue;
        g.beginPath(); g.moveTo(a2.x, a2.y); g.lineTo(b2.x, b2.y); g.stroke();
      }
      // река и пляж
      const river = (z: number) => Math.round(-310 + 22 * Math.sin(z / 260));
      g.beginPath();
      let first = true;
      for (let z = -span; z <= span; z += 12) { const p = project({ x: river(z) - 34, y: 0.4, z }); if (!p) continue; first ? (g.moveTo(p.x, p.y), first = false) : g.lineTo(p.x, p.y); }
      for (let z = span; z >= -span; z -= 12) { const p = project({ x: river(z) + 34, y: 0.4, z }); if (p) g.lineTo(p.x, p.y); }
      g.closePath(); g.fillStyle = 'rgba(96,132,160,.75)'; g.fill();

      // ---- дома: дальние сначала ----
      for (const b of city) {
        const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
        const base = [
          project({ x: x0, y: 0, z: z0 }), project({ x: x1, y: 0, z: z0 }),
          project({ x: x1, y: 0, z: z1 }), project({ x: x0, y: 0, z: z1 }),
        ];
        const top = [
          project({ x: x0, y: b.h, z: z0 }), project({ x: x1, y: b.h, z: z0 }),
          project({ x: x1, y: b.h, z: z1 }), project({ x: x0, y: b.h, z: z1 }),
        ];
        if (base.some((p) => !p) || top.some((p) => !p)) continue;
        const shade = (f: number) => {
          const n = parseInt(b.c.slice(1), 16);
          const r = Math.round(((n >> 16) & 255) * f), gg = Math.round(((n >> 8) & 255) * f), bb = Math.round((n & 255) * f);
          return `rgb(${r},${gg},${bb})`;
        };
        // боковые стены: какие видны — зависит от знака
        quad([base[0], base[1], top[1], top[0]], shade(0.82));
        quad([base[1], base[2], top[2], top[1]], shade(0.62));
        quad([base[3], base[2], top[2], top[3]], shade(0.7));
        quad([base[0], base[3], top[3], top[0]], shade(0.9));
        quad(top, shade(1.08));
        // окна у высоких домов
        if (b.win && b.h > 26) {
          const rows = Math.min(14, Math.floor(b.h / 7));
          for (let r = 1; r < rows; r++) {
            const y = (b.h * r) / rows;
            const lit = ((r * 31 + Math.round(b.x)) % 7) < 3;
            if (!lit) continue;
            const p1 = project({ x: x0 + 1.5, y, z: z0 - 0.1 }), p2 = project({ x: x1 - 1.5, y, z: z0 - 0.1 });
            if (!p1 || !p2) continue;
            g.strokeStyle = 'rgba(255,214,150,.5)'; g.lineWidth = Math.max(1, 1.6 * k);
            g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
          }
        }
      }
      // лёгкая дымка у горизонта
      const haze = g.createLinearGradient(0, H * 0.30, 0, H * 0.62);
      haze.addColorStop(0, 'rgba(226,178,140,0)');
      haze.addColorStop(1, 'rgba(226,178,140,.30)');
      g.fillStyle = haze; g.fillRect(0, H * 0.30, W, H * 0.34);
      // виньетка: тёмные края, центр светлее — читаемая заставка под панелью входа
      const vg = g.createRadialGradient(W * 0.5, H * 0.45, H * 0.25, W * 0.5, H * 0.5, H * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,8,16,.62)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      raf = requestAnimationFrame(draw);
    };
    draw();
    const onVis = () => { if (!document.hidden) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return <canvas ref={cv} className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
