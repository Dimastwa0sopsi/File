import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Character } from '../game/character';
import type { Look } from '../game/data';

/**
 * 3D-примерочная в духе GTA San Andreas: персонаж стоит в центре подиума,
 * крутится мышью/пальцем, любая примеряемая вещь применяется мгновенно —
 * сцена не пересоздаётся, меняется только модель.
 */
export function LookPreview({ look, height = 300, autoSpin = true }: { look: Look; height?: number; autoSpin?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const st = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; ch: Character } | null>(null);
  const spin = useRef({ yaw: 0.35, auto: autoSpin });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(el.clientWidth || 320, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.borderRadius = '16px';
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x2b2f3a, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2.4, 4.2, 3.4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ec1ff, 1.2); rim.position.set(-3, 2.2, -3.4); scene.add(rim);
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.12, 32), new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.5, roughness: 0.35 }));
    podium.position.y = -0.05; scene.add(podium);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.02, 8, 48), new THREE.MeshBasicMaterial({ color: 0x8b5cf6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; scene.add(ring);
    const camera = new THREE.PerspectiveCamera(34, 1.4, 0.1, 40);
    const ch = new Character(look);
    scene.add(ch.root);
    st.current = { renderer, scene, camera, ch };
    setReady(true);
    let raf = 0, alive = true, last = performance.now();
    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (spin.current.auto) spin.current.yaw += dt * 0.35;
      ch.pose('idle', now / 1000);
      ch.root.rotation.y = spin.current.yaw;
      const w = el.clientWidth || 320, h = height;
      if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.round(h * renderer.getPixelRatio())) {
        renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
      }
      camera.position.set(0, 1.42, 3.35);
      camera.lookAt(0, 1.02, 0);
      renderer.render(scene, camera);
    };
    loop();
    const el2 = renderer.domElement;
    let drag: number | null = null;
    const down = (e: PointerEvent) => { drag = e.clientX; spin.current.auto = false; el2.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (drag === null) return; spin.current.yaw += (e.clientX - drag) * 0.012; drag = e.clientX; };
    const up = () => { drag = null; };
    el2.addEventListener('pointerdown', down); el2.addEventListener('pointermove', move);
    el2.addEventListener('pointerup', up); el2.addEventListener('pointercancel', up);
    return () => {
      alive = false; cancelAnimationFrame(raf);
      el2.removeEventListener('pointerdown', down); el2.removeEventListener('pointermove', move);
      el2.removeEventListener('pointerup', up); el2.removeEventListener('pointercancel', up);
      ch.dispose(); renderer.dispose(); el2.remove(); st.current = null;
    };
    // сцена создаётся один раз: пересоздание WebGL-контекста на каждый клик по вещи недопустимо
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // примерка на лету: тот же персонаж, новая одежда/лицо
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    s.ch.setLook({ ...look });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(look), ready]);

  const turn = (d: number) => { spin.current.auto = false; spin.current.yaw += d; };
  return (
    <div className="lp">
      <div ref={host} style={{ height }} />
      <div className="lp-hint">🖱 Крутите персонажа · вещь надевается сразу</div>
      <div className="lp-ctrl">
        <button onClick={() => turn(-0.45)} aria-label="повернуть влево">⟲</button>
        <button onClick={() => { spin.current.yaw = 0; spin.current.auto = false; }}>Спереди</button>
        <button onClick={() => { spin.current.yaw = Math.PI; spin.current.auto = false; }}>Сзади</button>
        <button onClick={() => turn(0.45)} aria-label="повернуть вправо">⟳</button>
      </div>
    </div>
  );
}
