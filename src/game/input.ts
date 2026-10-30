// Управление: клавиатура (физические коды — работает в русской раскладке), мышь, сенсорные элементы
export class Input {
  keys = new Set<string>();
  private pressedOnce = new Set<string>();
  mouseDown = false; mouseClicked = false; rmb = false;
  lookDX = 0; lookDY = 0; zoomDelta = 0;
  locked = false;
  enabled = true;
  // виртуальные (сенсорные)
  joy = { x: 0, y: 0 };
  vbtn = new Set<string>();
  private vOnce = new Set<string>();
  private el: HTMLElement;
  onKey: ((code: string) => void) | null = null;
  private handlers: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  constructor(el: HTMLElement) {
    this.el = el;
    const on = (t: EventTarget, n: string, f: EventListener, o?: AddEventListenerOptions) => { t.addEventListener(n, f, o); this.handlers.push([t, n, f, o]); };
    on(window, 'keydown', ((e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'ControlLeft' || e.code === 'BracketRight' || e.code === 'Backquote') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedOnce.add(e.code);
      this.keys.add(e.code);
      if (!e.repeat) this.onKey?.(e.code);
    }) as EventListener);
    on(window, 'keyup', ((e: KeyboardEvent) => { this.keys.delete(e.code); }) as EventListener);
    on(window, 'blur', () => this.releaseAll());
    on(document, 'visibilitychange', () => this.releaseAll());
    on(el, 'mousedown', ((e: MouseEvent) => {
      if (this.touchMode) return;
      if (e.button === 2) this.rmb = true;
      if (e.button === 0) { if (this.locked || !this.wantLock) { this.mouseDown = true; this.mouseClicked = true; } }
      if (this.wantLock && !this.locked && el.requestPointerLock) { try { const p = el.requestPointerLock() as unknown as Promise<void> | undefined; p?.catch?.(() => {}); } catch { /* */ } }
      this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
    }) as EventListener);
    on(window, 'mouseup', ((e: MouseEvent) => { if (e.button === 2) this.rmb = false; if (e.button === 0) this.mouseDown = false; this.dragging = false; }) as EventListener);
    on(window, 'mousemove', ((e: MouseEvent) => {
      if (this.touchMode) return;
      if (this.locked) { this.lookDX += e.movementX; this.lookDY += e.movementY; }
      else if (this.dragging && !this.wantLock) { this.lookDX += e.clientX - this.lastX; this.lookDY += e.clientY - this.lastY; this.lastX = e.clientX; this.lastY = e.clientY; }
    }) as EventListener);
    on(el, 'wheel', ((e: WheelEvent) => { this.zoomDelta += Math.sign(e.deltaY); e.preventDefault(); }) as EventListener, { passive: false });
    on(document, 'pointerlockchange', () => { this.locked = document.pointerLockElement === el; if (!this.locked) this.mouseDown = false; });
    on(el, 'contextmenu', (e) => e.preventDefault());
  }
  wantLock = true; touchMode = false; private dragging = false; private lastX = 0; private lastY = 0;
  down(code: string) { return this.enabled && this.keys.has(code); }
  pressed(code: string) { return this.enabled && this.pressedOnce.has(code); }
  vDown(n: string) { return this.enabled && this.vbtn.has(n); }
  vPressed(n: string) { return this.enabled && this.vOnce.has(n); }
  setV(n: string, on: boolean) { if (on) { if (!this.vbtn.has(n)) this.vOnce.add(n); this.vbtn.add(n); } else this.vbtn.delete(n); }
  tapV(n: string) { this.vOnce.add(n); }
  /** сброс в конце кадра */
  endFrame() { this.pressedOnce.clear(); this.vOnce.clear(); this.mouseClicked = false; this.lookDX = 0; this.lookDY = 0; this.zoomDelta = 0; }
  releaseAll() { this.keys.clear(); this.vbtn.clear(); this.mouseDown = false; this.rmb = false; this.joy.x = 0; this.joy.y = 0; this.pressedOnce.clear(); this.vOnce.clear(); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock?.(); }
  move() {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    x += this.joy.x; y += this.joy.y;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  dispose() { for (const [t, n, f, o] of this.handlers) t.removeEventListener(n, f, o); this.handlers = []; this.unlock(); }
}
