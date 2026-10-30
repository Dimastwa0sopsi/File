// Кинематографичная заставка: камера медленно облетает ночной город.
// Лёгкая отдельная сцена — не грузит игровой мир и работает даже до входа в игру.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/** детерминированный генератор — город всегда одинаковый */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas2d(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

/** текстура фасада: тёмное стекло + редкие тёплые окна */
function windowsTex() {
  const { c, g } = canvas2d(128, 256);
  g.fillStyle = '#131c2b'; g.fillRect(0, 0, 128, 256);
  const r = rng(77);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 6; x++) {
      const lit = r() > 0.52;
      g.fillStyle = lit ? (r() > 0.5 ? 'rgba(255,214,150,0.92)' : 'rgba(190,224,255,0.85)') : 'rgba(26,38,54,0.95)';
      g.fillRect(6 + x * 20, 8 + y * 15, 12, 8);
    }
  }
  // подсветка нижних этажей (витрины)
  g.fillStyle = 'rgba(255,196,120,0.55)'; g.fillRect(0, 244, 128, 12);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** карта города для земли: кварталы и светящиеся улицы */
function groundTex() {
  const { c, g } = canvas2d(512, 512);
  g.fillStyle = '#0b1320'; g.fillRect(0, 0, 512, 512);
  const cell = 44;
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      g.fillStyle = (x + y) % 5 === 0 ? '#16283a' : '#131f2f';
      g.fillRect(x * cell + 7, y * cell + 7, cell - 13, cell - 13);
    }
  }
  g.strokeStyle = '#2c4460'; g.lineWidth = 7;
  for (let i = 0; i <= 12; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(512, i * cell); g.stroke();
  }
  g.strokeStyle = 'rgba(255,186,110,0.55)'; g.lineWidth = 2;
  for (let i = 0; i <= 12; i += 2) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(512, i * cell); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Flyover({ onFail }: { onFail?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  // колбэк в ref: смена состояния экрана не должна пересоздавать WebGL-сцену
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      failRef.current?.();
      return;
    }
    const mobile = window.innerWidth < 760;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.2 : 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'fly-canvas';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x121c2e, 320, 1150);
    const camera = new THREE.PerspectiveCamera(52, 1, 1, 3000);

    /* ---------- небо ---------- */
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1400, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: {
          cTop: { value: new THREE.Color('#050a16') },
          cMid: { value: new THREE.Color('#16294a') },
          cBot: { value: new THREE.Color('#e8945a') },
        },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec3 vP; uniform vec3 cTop; uniform vec3 cMid; uniform vec3 cBot;
          void main(){ float h = normalize(vP).y * 0.5 + 0.5;
            vec3 c = mix(cBot, cMid, smoothstep(0.40, 0.56, h));
            c = mix(c, cTop, smoothstep(0.55, 0.95, h));
            gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    scene.add(sky);

    /* ---------- свет ---------- */
    scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x2a2118, 0.85));
    const sun = new THREE.DirectionalLight(0xffb37a, 1.15);
    sun.position.set(-420, 180, 520);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x5b8cff, 0.5);
    fill.position.set(300, 220, -400);
    scene.add(fill);

    /* ---------- земля, вода, набережная ---------- */
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1500, 1500),
      new THREE.MeshStandardMaterial({ map: groundTex(), color: 0x8fa6c4, roughness: 0.92, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ color: 0x0a2237, roughness: 0.18, metalness: 0.85 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -1.4, -900);
    scene.add(water);
    // полоса пляжа у воды
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(1500, 46), new THREE.MeshStandardMaterial({ color: 0x8a7452, roughness: 1 }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.15, -740);
    scene.add(sand);

    /* ---------- здания ---------- */
    const winTex = windowsTex();
    const towerMat = new THREE.MeshStandardMaterial({ map: winTex, color: 0xbfd0e6, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.75, roughness: 0.55, metalness: 0.25 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const grid = mobile ? 5 : 7;          // кварталов в каждую сторону
    const step = 62;
    const cells: { x: number; z: number; w: number; d: number; h: number }[] = [];
    const r = rng(20261030);
    for (let gx = -grid; gx <= grid; gx++) {
      for (let gz = -grid; gz <= grid; gz++) {
        const cx = gx * step, cz = gz * step;
        const dist = Math.hypot(gx, gz);
        // в центре — небоскрёбы, к краям дома ниже; часть кварталов — парки
        if (r() < 0.12 && dist > 1) continue;
        const perCell = dist < 2 ? 1 : 2;
        for (let k = 0; k < perCell; k++) {
          const ox = perCell === 1 ? 0 : (k ? 11 : -11);
          const oz = perCell === 1 ? 0 : (k ? -9 : 9);
          const w = 9 + r() * 9, d = 9 + r() * 9;
          const base = dist < 1.5 ? 90 : dist < 3 ? 46 : 22;
          const h = Math.max(9, base + (r() - 0.35) * (dist < 3 ? 80 : 30));
          cells.push({ x: cx + ox, z: cz + oz, w, d, h });
        }
      }
    }
    const inst = new THREE.InstancedMesh(box, towerMat, cells.length);
    inst.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    cells.forEach((c, i) => {
      m.makeScale(c.w, c.h, c.d);
      m.setPosition(c.x, c.h / 2, c.z);
      inst.setMatrixAt(i, m);
      const t = 0.55 + r() * 0.45;
      col.setRGB(0.62 * t + 0.1, 0.72 * t + 0.12, 0.9 * t + 0.1);
      inst.setColorAt(i, col);
    });
    inst.instanceColor!.needsUpdate = true;
    scene.add(inst);

    // красные огни на крышах небоскрёбов
    const beaconPos: number[] = [];
    for (const c of cells) if (c.h > 85) beaconPos.push(c.x, c.h + 1, c.z);
    const beacons = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(beaconPos, 3)),
      new THREE.PointsMaterial({ color: 0xff5b4d, size: 3.2, sizeAttenuation: true, transparent: true, opacity: 0.9 }),
    );
    scene.add(beacons);

    /* ---------- поток машин: светящиеся точки по улицам ---------- */
    const CARS = mobile ? 90 : 170;
    const carPos = new Float32Array(CARS * 3);
    const carCol = new Float32Array(CARS * 3);
    const carData: { axis: number; line: number; t: number; spd: number; dir: number }[] = [];
    const span = grid * step + 18;
    for (let i = 0; i < CARS; i++) {
      const axis = i % 2;
      const line = (Math.floor(r() * (grid * 2 + 1)) - grid) * step;
      carData.push({ axis, line, t: (r() * 2 - 1) * span, spd: 12 + r() * 26, dir: r() > 0.5 ? 1 : -1 });
      const warm = r() > 0.45;
      carCol[i * 3] = warm ? 1 : 0.72; carCol[i * 3 + 1] = warm ? 0.82 : 0.88; carCol[i * 3 + 2] = warm ? 0.5 : 1;
    }
    const carGeo = new THREE.BufferGeometry();
    carGeo.setAttribute('position', new THREE.BufferAttribute(carPos, 3));
    carGeo.setAttribute('color', new THREE.BufferAttribute(carCol, 3));
    const cars = new THREE.Points(carGeo, new THREE.PointsMaterial({ size: 2.6, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true }));
    scene.add(cars);

    /* ---------- камера ---------- */
    const target = new THREE.Vector3(0, 34, 0);
    const place = (t: number) => {
      const slow = reduce ? 0.35 : 1;
      const a = t * 0.05 * slow + 0.6;
      const approach = Math.min(1, t / 14);            // плавный подлёт к городу
      const rad = 430 - 130 * approach;
      const y = 168 - 46 * approach + Math.sin(t * 0.13) * 14;
      camera.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      target.set(Math.sin(t * 0.07) * 26, 30 + Math.sin(t * 0.11) * 8, Math.cos(t * 0.05) * 22);
      camera.lookAt(target);
    };

    const resize = () => {
      const w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      place(t);
      for (let i = 0; i < CARS; i++) {
        const c = carData[i];
        c.t += c.spd * c.dir * 0.016;
        if (c.t > span) c.t = -span; else if (c.t < -span) c.t = span;
        if (c.axis === 0) { carPos[i * 3] = c.t; carPos[i * 3 + 1] = 0.9; carPos[i * 3 + 2] = c.line; }
        else { carPos[i * 3] = c.line; carPos[i * 3 + 1] = 0.9; carPos[i * 3 + 2] = c.t; }
      }
      carGeo.attributes.position.needsUpdate = true;
      beacons.visible = Math.floor(t * 1.2) % 2 === 0;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      inst.dispose();
      box.dispose();
      carGeo.dispose();
      beacons.geometry.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      water.geometry.dispose();
      (water.material as THREE.Material).dispose();
      sand.geometry.dispose();
      (sand.material as THREE.Material).dispose();
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
      winTex.dispose();
      (ground.material as THREE.MeshStandardMaterial).map?.dispose();
      (cars.material as THREE.Material).dispose();
      (beacons.material as THREE.Material).dispose();
      towerMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="fly-root" ref={host} aria-hidden="true" />;
}
