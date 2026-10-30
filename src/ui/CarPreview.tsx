import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { VehicleModel } from '../game/vehicleModel';
import { VEHICLES, type Tuning } from '../game/data';

/**
 * 3D-показ машины в автосервисе: отдельная мини-сцена, вращение мышью/пальцем,
 * живое обновление при выборе тюнинга.
 */
export function CarPreview({ type, color, tuning, height = 220 }: { type: string; color: string; tuning: Tuning; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const state = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; model: VehicleModel } | null>(null);
  const spin = useRef({ yaw: 0.7, auto: true });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(el.clientWidth || 320, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.borderRadius = '14px';
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x30343f, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(4, 7, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.1);
    rim.position.set(-5, 3, -6); scene.add(rim);
    const grid = new THREE.GridHelper(12, 12, 0x334155, 0x1e293b);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    scene.add(grid);
    const camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 100);
    const model = new VehicleModel(type, color, tuning);
    scene.add(model.group);
    const spec = VEHICLES[type] ?? VEHICLES.lada;
    const dist = Math.max(6.5, spec.len * 1.9);
    const look = new THREE.Vector3(0, spec.hei * 0.55, 0);
    state.current = { renderer, scene, camera, model };
    setReady(true);
    let raf = 0; let alive = true; let last = performance.now();
    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (spin.current.auto) spin.current.yaw += dt * 0.55;
      const w = el.clientWidth || 320, h = height;
      if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(h * renderer.getPixelRatio())) {
        renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
      }
      camera.position.set(Math.sin(spin.current.yaw) * dist * 0.62, spec.hei * 1.15 + 1.2, Math.cos(spin.current.yaw) * dist * 0.62);
      camera.lookAt(look);
      if (model.tuning.rainbow) model.updateRainbow(now / 1000);
      renderer.render(scene, camera);
    };
    loop();
    const el2 = renderer.domElement;
    let drag: { x: number } | null = null;
    const down = (e: PointerEvent) => { drag = { x: e.clientX }; spin.current.auto = false; el2.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!drag) return; spin.current.yaw += (e.clientX - drag.x) * 0.012; drag.x = e.clientX; };
    const up = () => { drag = null; };
    el2.addEventListener('pointerdown', down); el2.addEventListener('pointermove', move);
    el2.addEventListener('pointerup', up); el2.addEventListener('pointercancel', up);
    return () => {
      alive = false; cancelAnimationFrame(raf);
      el2.removeEventListener('pointerdown', down); el2.removeEventListener('pointermove', move);
      el2.removeEventListener('pointerup', up); el2.removeEventListener('pointercancel', up);
      model.dispose(); renderer.dispose(); el2.remove();
      state.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, color, height]);

  // живое применение тюнинга без пересоздания сцены
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.model.applyTuning({ ...tuning });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(tuning), ready]);

  return (
    <div className="car-preview">
      <div ref={host} style={{ height }} />
      <div className="car-preview-hint">🖱 Крутите модель · радужные фары и неон видны сразу</div>
    </div>
  );
}
