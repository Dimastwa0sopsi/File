// Минимальные заглушки DOM для headless-проверок (canvas нужен текстурам машин).
/* eslint-disable @typescript-eslint/no-explicit-any */
function makeCanvas(w = 256, h = 256) {
  const canvas: any = { width: w, height: h, style: {}, toDataURL: () => 'data:,' };
  const grad: any = { addColorStop() { /* */ } };
  const base: any = {
    canvas,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
    measureText: () => ({ width: 40 }),
    getImageData: (x: number, y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
  };
  const ctx: any = new Proxy(base, {
    get(t: any, k: string) {
      if (k === 'canvas') return canvas;
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t: any, k: string, v: any) { t[k] = v; return true; },
  });
  canvas.getContext = () => ctx;
  return canvas;
}
(globalThis as any).document = {
  createElement: (tag: string) => (tag === 'canvas' ? makeCanvas() : { style: {}, appendChild() { /* */ } }),
  createElementNS: () => makeCanvas(),
  body: { appendChild() { /* */ }, style: {} },
};
if (!(globalThis as any).window) (globalThis as any).window = {};
(globalThis as any).window.matchMedia = () => ({ matches: false, addEventListener() { /* */ }, removeEventListener() { /* */ } });
(globalThis as any).HTMLCanvasElement = class { /* */ };
export {};
