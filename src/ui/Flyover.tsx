// Кинематографичная заставка: камера медленно облетает ОСНОВНОЙ город игры — Лос-Город.
// Лёгкая отдельная сцена (без игрового мира): 18×18 кварталов, небоскрёбы в центре,
// частные дома на окраинах, река и пляж на западе. Работает ещё до входа в игру.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const BLOCKS = 18;          // как в игре: N = 18 кварталов
const CELL = 60;            // шаг квартала, м
const HALF = (BLOCKS * CELL) / 2;

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
  g.fillStyle = 'rgba(255,196,120,0.55)'; g.fillRect(0, 244, 128, 12);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** карта кварталов: 18×18 клеток, улицы, бульвар посередине */
function groundTex() {
  const { c, g } = canvas2d(1024, 1024);
  g.fillStyle = '#0c141f'; g.fillRect(0, 0, 1024, 1024);
  const cell = 1024 / BLOCKS;
  const road = 12 / CELL * cell;               // ширина улиц как в игре (12 м)
  for (let y = 0; y < BLOCKS; y++) {
    for (let x = 0; x < BLOCKS; x++) {
      const park = (x === 3 && y === 3) || (x === 14 && y === 13) || (x === 4 && y === 14) || (x === 12 && y === 3);
      g.fillStyle = park ? '#13281f' : (x + y) % 7 === 0 ? '#1b2a3b' : '#16222f';
      g.fillRect(x * cell + road / 2, y * cell + road / 2, cell - road, cell - road);
    }
  }
  // асфальт улиц
  g.fillStyle = '#0a0f16';
  for (let i = 0; i <= BLOCKS; i++) {
    g.fillRect(i * cell - road / 2, 0, road, 1024);
    g.fillRect(0, i * cell - road / 2, 1024, road);
  }
  // тёплая подсветка главного шоссе (z = 9 клеток) и центральных улиц
  g.fillStyle = 'rgba(255,186,110,0.35)';
  g.fillRect(0, 9 * cell - road / 2, 1024, road);
  g.fillStyle = 'rgba(255,186,110,0.18)';
  for (let i = 0; i <= BLOCKS; i += 3) g.fillRect(i * cell - road / 4, 0, road / 2, 1024);
  // разметка
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
  for (let i = 0; i <= BLOCKS; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, 1024); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(1024, i * cell); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
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
    scene.fog = new THREE.Fog(0x121c2e, 420, 1500);
    const camera = new THREE.PerspectiveCamera(52, 1, 1, 4000);

    /* ---------- небо ---------- */
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1800, 24, 16),
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

    /* ---------- земля, река и пляж (река у Лос-Города на западе) ---------- */
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(4200, 4200),
      new THREE.MeshStandardMaterial({ color: 0x0d1620, roughness: 1 }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.4;
    scene.add(outer);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(BLOCKS * CELL, BLOCKS * CELL),
      new THREE.MeshStandardMaterial({ map: groundTex(), color: 0x93a8c4, roughness: 0.92, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 3200),
      new THREE.MeshStandardMaterial({ color: 0x0a2237, roughness: 0.16, metalness: 0.85 }),
    );
    river.rotation.x = -Math.PI / 2;
    river.position.set(-HALF - 130, -0.9, 0);
    scene.add(river);

    const sand = new THREE.Mesh(new THREE.PlaneGeometry(44, 900), new THREE.MeshStandardMaterial({ color: 0x8a7452, roughness: 1 }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(-HALF - 52, 0.12, 180);
    scene.add(sand);

    /* ---------- здания ---------- */
    const winTex = windowsTex();
    const towerMat = new THREE.MeshStandardMaterial({ map: winTex, color: 0xbfd0e6, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.75, roughness: 0.55, metalness: 0.25 });
    const houseMat = new THREE.MeshStandardMaterial({ color: 0x6d7d92, roughness: 0.85, metalness: 0.08 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cells: { x: number; z: number; w: number; d: number; h: number; house: boolean }[] = [];
    const r = rng(20261030);
    const parks = new Set(['3,3', '14,13', '4,14', '12,3', '8,15', '16,7']);
    for (let i = 0; i < BLOCKS; i++) {
      for (let j = 0; j < BLOCKS; j++) {
        if (parks.has(`${i},${j}`)) continue;
        const cx = (i + 0.5) * CELL - HALF;
        const cz = (j + 0.5) * CELL - HALF;
        const dc = Math.max(Math.abs(i - (BLOCKS - 1) / 2), Math.abs(j - (BLOCKS - 1) / 2));
        if (dc <= 2.5) {
          // деловой центр — небоскрёбы
          const w = 16 + r() * 8, d = 16 + r() * 8, h = 58 + r() * 78;
          cells.push({ x: cx, z: cz, w, d, h, house: false });
        } else if (dc <= 6.5) {
          // средняя застройка: 2 дома на квартал
          for (const sx of [-10, 10]) {
            const w = 12 + r() * 5, d = 11 + r() * 5, h = 12 + r() * 26;
            cells.push({ x: cx + sx, z: cz + (r() - 0.5) * 8, w, d, h, house: false });
          }
        } else {
          // окраины — частные дома с участками (как в игре)
          for (let k = 0; k < 4; k++) {
            const ox = (k % 2 ? 11 : -11), oz = (k > 1 ? 11 : -11);
            const w = 8 + r() * 3, d = 7 + r() * 3, h = 5 + r() * 4;
            cells.push({ x: cx + ox, z: cz + oz, w, d, h, house: true });
          }
        }
      }
    }
    const towerCells = cells.filter((c) => !c.house);
    const houseCells = cells.filter((c) => c.house);

    const inst = new THREE.InstancedMesh(box, towerMat, towerCells.length);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    towerCells.forEach((c, i) => {
      m.makeScale(c.w, c.h, c.d);
      m.setPosition(c.x, c.h / 2, c.z);
      inst.setMatrixAt(i, m);
      const t = 0.55 + r() * 0.45;
      col.setRGB(0.62 * t + 0.1, 0.72 * t + 0.12, 0.9 * t + 0.1);
      inst.setColorAt(i, col);
    });
    inst.instanceColor!.needsUpdate = true;
    scene.add(inst);

    const houses = new THREE.InstancedMesh(box, houseMat, houseCells.length);
    houseCells.forEach((c, i) => {
      m.makeScale(c.w, c.h, c.d);
      m.setPosition(c.x, c.h / 2, c.z);
      houses.setMatrixAt(i, m);
    });
    scene.add(houses);

    // красные огни на крышах небоскрёбов
    const beaconPos: number[] = [];
    for (const c of towerCells) if (c.h > 95) beaconPos.push(c.x, c.h + 1.2, c.z);
    const beacons = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(beaconPos, 3)),
      new THREE.PointsMaterial({ color: 0xff5b4d, size: 3.2, sizeAttenuation: true, transparent: true, opacity: 0.9 }),
    );
    scene.add(beacons);

    /* ---------- поток машин: светящиеся точки по улицам ---------- */
    const CARS = mobile ? 110 : 210;
    const carPos = new Float32Array(CARS * 3);
    const carCol = new Float32Array(CARS * 3);
    const carData: { axis: number; line: number; t: number; spd: number; dir: number }[] = [];
    const span = HALF;
    for (let i = 0; i < CARS; i++) {
      const axis = i % 2;
      const line = (Math.floor(r() * BLOCKS) - BLOCKS / 2 + 0.5) * CELL;
      carData.push({ axis, line, t: (r() * 2 - 1) * span, spd: 14 + r() * 28, dir: r() > 0.5 ? 1 : -1 });
      const warm = r() > 0.45;
      carCol[i * 3] = warm ? 1 : 0.72; carCol[i * 3 + 1] = warm ? 0.82 : 0.88; carCol[i * 3 + 2] = warm ? 0.5 : 1;
    }
    const carGeo = new THREE.BufferGeometry();
    carGeo.setAttribute('position', new THREE.BufferAttribute(carPos, 3));
    carGeo.setAttribute('color', new THREE.BufferAttribute(carCol, 3));
    const cars = new THREE.Points(carGeo, new THREE.PointsMaterial({ size: 2.6, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true }));
    scene.add(cars);

    /* ---------- камера: плавный облёт Лос-Города ---------- */
    const target = new THREE.Vector3(0, 30, 0);
    const place = (t: number) => {
      const slow = reduce ? 0.35 : 1;
      const a = t * 0.045 * slow + 0.7;
      const approach = Math.min(1, t / 16);            // плавный подлёт к городу
      const rad = 900 - 340 * approach;
      const y = 420 - 210 * approach + Math.sin(t * 0.12) * 12;
      camera.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      target.set(Math.sin(t * 0.06) * 24, 30 + Math.sin(t * 0.1) * 6, Math.cos(t * 0.05) * 20);
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
      houses.dispose();
      box.dispose();
      carGeo.dispose();
      beacons.geometry.dispose();
      outer.geometry.dispose();
      (outer.material as THREE.Material).dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      river.geometry.dispose();
      (river.material as THREE.Material).dispose();
      sand.geometry.dispose();
      (sand.material as THREE.Material).dispose();
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
      winTex.dispose();
      (ground.material as THREE.MeshStandardMaterial).map?.dispose();
      (cars.material as THREE.Material).dispose();
      (beacons.material as THREE.Material).dispose();
      towerMat.dispose();
      houseMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="fly-root" ref={host} aria-hidden="true" />;
}
