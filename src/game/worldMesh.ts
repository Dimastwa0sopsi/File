// Построение 3D-мира из раскладки: чанки, объединённая геометрия, инстансы
import * as THREE from 'three';
import { CHUNK, CELL, ROAD_W, N, SIDEWALK } from './config';
import type { WorldLayout, Building, Prop } from './worldgen';
import { Batcher, T, M, stripQuad } from './geom';
import { FACADE_TILE, mat, GFX } from './textures';
import { KIOSK_TYPES } from './data';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export interface LightIntersection { node: number; x: number; z: number; gi: number; gj: number; state: number }
export interface WorldMeshes {
  root: THREE.Group;
  chunks: { group: THREE.Group; cx: number; cz: number }[];
  lights: LightIntersection[];
  bulbs: THREE.InstancedMesh;
  wheat: THREE.InstancedMesh;
  wheatCells: { x: number; z: number; done: boolean }[];
  garageGates: THREE.Mesh[];
  water: THREE.Mesh;
}

export async function buildWorldMeshes(L: WorldLayout, progress: (p: number, label: string) => void): Promise<WorldMeshes> {
  const root = new THREE.Group();
  root.name = 'world';
  const batchers = new Map<string, Batcher>();
  const B = (x: number, z: number) => {
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    let b = batchers.get(k); if (!b) { b = new Batcher(); batchers.set(k, b); }
    return b;
  };
  // ---------- земля ----------
  progress(0.12, 'Земля и вода');
  const bnd = L.bounds;
  const groundGeo = new THREE.PlaneGeometry(bnd.x1 - bnd.x0 + 800, bnd.z1 - bnd.z0 + 800);
  groundGeo.rotateX(-Math.PI / 2);
  const uv = groundGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 300, uv.getY(i) * 300);
  const ground = new THREE.Mesh(groundGeo, mat('tex:grass'));
  ground.position.set((bnd.x0 + bnd.x1) / 2, 0, (bnd.z0 + bnd.z1) / 2);
  ground.receiveShadow = true; ground.matrixAutoUpdate = false; ground.updateMatrix();
  root.add(ground);
  // река
  const wb = new Batcher(); const bed = new Batcher();
  for (let z = bnd.z0 - 400; z < bnd.z1 + 400; z += 20) {
    const a = L.river.center(z), b = L.river.center(z + 20);
    stripQuad(wb, 'water', a, z, b, z + 20, L.river.half * 2, 0.08, 30);
    stripQuad(bed, 'c:#3b5a4a', a, z, b, z + 20, L.river.half * 2 + 6, 0.012, 30);
  }
  const water = wb.build()[0]; root.add(water);
  bed.build().forEach((m) => root.add(m));
  await tick();
  // ---------- дороги ----------
  progress(0.18, 'Дороги и разметка');
  const isCity = (id: number) => L.nodes[id].gi !== undefined;
  for (const e of L.edges) {
    const a = L.nodes[e.a], b = L.nodes[e.b];
    let ax = a.x, az = a.z, bx = b.x, bz = b.z;
    const len = Math.hypot(bx - ax, bz - az); const ux = (bx - ax) / len, uz = (bz - az) / len;
    if (isCity(e.a)) { ax += ux * ROAD_W / 2; az += uz * ROAD_W / 2; }
    if (isCity(e.b)) { bx -= ux * ROAD_W / 2; bz -= uz * ROAD_W / 2; }
    const key = e.kind === 'dirt' ? 'road:road_dirt' : e.kind === 'avenue' ? 'road:road_highway' : 'road:road_' + e.kind;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const segs = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 60));
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const sx = ax + (bx - ax) * t0, sz = az + (bz - az) * t0, ex = ax + (bx - ax) * t1, ez = az + (bz - az) * t1;
      stripQuad(B((sx + ex) / 2, (sz + ez) / 2), key, sx, sz, ex, ez, e.w, 0.03, e.w * 2, (Math.hypot(sx - ax, sz - az) / (e.w * 2)));
    }
    void mx; void mz;
    // зебры у городских перекрёстков
    if (e.kind === 'city' || e.kind === 'avenue') {
      if (a.light || (a.gi! > 0 && a.gi! < N) || true) {
        stripQuad(B(ax, az), 'zebra', ax + ux * 3.2, az + uz * 3.2, ax + ux * 0.2, az + uz * 0.2, ROAD_W - 0.6, 0.05, 3);
        stripQuad(B(bx, bz), 'zebra', bx - ux * 3.2, bz - uz * 3.2, bx - ux * 0.2, bz - uz * 0.2, ROAD_W - 0.6, 0.05, 3);
      }
    }
  }
  for (const n of L.nodes) {
    const deg = L.adj[n.id].length;
    if (n.gi !== undefined) B(n.x, n.z).add('road:patch', T.plane, M(n.x, 0.035, n.z, 0, ROAD_W, ROAD_W, 1, -Math.PI / 2), 12);
    else if (deg !== 2 || true) {
      const e = L.edges[L.adj[n.id][0].e];
      const key = e.kind === 'dirt' ? 'road:road_dirt' : 'road:patch';
      B(n.x, n.z).add(key, T.circle, M(n.x, 0.032, n.z, 0, e.w / 2, e.w / 2, 1, -Math.PI / 2), 12);
    }
  }
  await tick();
  // ---------- поверхности кварталов ----------
  progress(0.24, 'Кварталы и тротуары');
  for (const bl of L.blocks) {
    const x0 = bl.i * CELL + ROAD_W / 2, z0 = bl.j * CELL + ROAD_W / 2, s = CELL - ROAD_W;
    const b = B(x0 + s / 2, z0 + s / 2);
    b.box('tex:sidewalk', x0 + s / 2, 0, z0 + s / 2, s, 0.15, s, 0, 2.5);
    const cc = 'c:#c9c6bf';
    b.box(cc, x0 + s / 2, 0, z0 + 0.12, s, 0.18, 0.24); b.box(cc, x0 + s / 2, 0, z0 + s - 0.12, s, 0.18, 0.24);
    b.box(cc, x0 + 0.12, 0, z0 + s / 2, 0.24, 0.18, s); b.box(cc, x0 + s - 0.12, 0, z0 + s / 2, 0.24, 0.18, s);
    const ix = x0 + SIDEWALK, iz = z0 + SIDEWALK, is = s - SIDEWALK * 2;
    if (bl.type === 'park' || bl.type === 'private') {
      b.add('tex:grass', T.plane, M(ix + is / 2, 0.155, iz + is / 2, 0, is, is, 1, -Math.PI / 2), 8);
      if (bl.type === 'park') {
        const cx = ix + is / 2, cz = iz + is / 2;
        b.add('tex:sidewalk', T.plane, M(cx, 0.165, cz, 0, 4, is, 1, -Math.PI / 2), 2.5);
        b.add('tex:sidewalk', T.plane, M(cx, 0.166, cz, 0, is, 4, 1, -Math.PI / 2), 2.5);
        for (let k = 0; k < 16; k++) { const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2; stripQuad(b, 'tex:sidewalk', cx + Math.cos(a0) * 13, cz + Math.sin(a0) * 13, cx + Math.cos(a1) * 13, cz + Math.sin(a1) * 13, 3, 0.167, 3); }
      }
    }
    if (['market', 'dealer', 'parking', 'parkade', 'garages', 'storage'].includes(bl.type)) b.add('tex:asphalt', T.plane, M(ix + is / 2, 0.156, iz + is / 2, 0, is, is, 1, -Math.PI / 2), 6);
  }
  // промзона, пляж, парковка, поля
  const ind = L.industrial;
  for (let x = ind.x0; x < ind.x1; x += CHUNK / 2) for (let z = ind.z0; z < ind.z1; z += CHUNK / 2) {
    const w = Math.min(CHUNK / 2, ind.x1 - x), d = Math.min(CHUNK / 2, ind.z1 - z);
    B(x + w / 2, z + d / 2).add('tex:asphalt', T.plane, M(x + w / 2, 0.02, z + d / 2, 0, w, d, 1, -Math.PI / 2), 8);
  }
  const be = L.beach;
  for (let z = be.z0; z < be.z1; z += 50) {
    const d = Math.min(50, be.z1 - z);
    B((be.x0 + be.x1) / 2, z + d / 2).add('tex:sand', T.plane, M((be.x0 + be.x1) / 2, 0.1, z + d / 2, 0, be.x1 - be.x0, d, 1, -Math.PI / 2), 6);
  }
  B(-160, 480).add('tex:asphalt', T.plane, M(-158, 0.025, 480, 0, 22, 40, 1, -Math.PI / 2), 6);
  const F = L.farm;
  for (const f of [F, ...F.aiFields]) {
    for (let x = f.x0; x < f.x1; x += 60) for (let z = f.z0; z < f.z1; z += 60) {
      const w = Math.min(60, f.x1 - x), d = Math.min(60, f.z1 - z);
      B(x + w / 2, z + d / 2).add('tex:soil', T.plane, M(x + w / 2, 0.02, z + d / 2, 0, w, d, 1, -Math.PI / 2), 6);
      if (f !== F) B(x + w / 2, z + d / 2).add('tex:wheat', T.box, M(x + w / 2, 0.55, z + d / 2, 0, w - 1, 1.1, d - 1), 3);
    }
  }
  await tick();
  // ---------- здания ----------
  progress(0.3, 'Здания');
  const BUILD_STEP = 120;
  for (let i = 0; i < L.buildings.length; i++) {
    if (L.buildings[i].kind === 'parkade') buildParkade(B(L.buildings[i].x, L.buildings[i].z), L.buildings[i]); else buildBuilding(B(L.buildings[i].x, L.buildings[i].z), L.buildings[i]);
    if (i % BUILD_STEP === 0) { progress(0.3 + (i / L.buildings.length) * 0.22, `Здания ${i}/${L.buildings.length}`); await tick(); }
  }
  // ---------- гаражи ----------
  const garageGates: THREE.Mesh[] = [];
  for (const g of L.garages) {
    const b = B(g.x, g.z);
    b.box('tex:concrete', g.x, 0, g.z - 1, g.w + 2, 0.08, g.d + 4, 0, 4);
    b.box('tex:brickwall', g.x - g.w / 2 + 0.15, 0, g.z, 0.3, 3.2, g.d, 0, 2);
    b.box('tex:brickwall', g.x + g.w / 2 - 0.15, 0, g.z, 0.3, 3.2, g.d, 0, 2);
    b.box('tex:brickwall', g.x, 0, g.z + g.d / 2 - 0.15, g.w, 3.2, 0.3, 0, 2);
    b.box('tex:brickwall', g.x, 2.6, g.gateZ + 0.15, g.w, 0.6, 0.3, 0, 2);
    b.box('c:#4b5563', g.x, 3.2, g.z, g.w + 0.4, 0.2, g.d + 0.4);
    b.box('c:#6b7280', g.x + g.w / 2 + 0.01, 0, g.z + 2, 0.06, 2.1, 0.9); // боковая дверь
    const gate = new THREE.Mesh(T.box, mat('c:#9ca3af'));
    gate.scale.set(g.w - 0.6, 2.6, 0.1); gate.position.set(g.x, 1.3, g.gateZ + 0.1); gate.castShadow = true;
    for (let k = 0; k < 6; k++) { const rib = new THREE.Mesh(T.box, mat('c:#6b7280')); rib.scale.set(1.02, 0.02, 1.4); rib.position.y = -0.4 + k * 0.17; gate.add(rib); }
    root.add(gate); garageGates.push(gate);
  }
  // ---------- реквизит ----------
  progress(0.55, 'Деревья и объекты');
  for (let i = 0; i < L.props.length; i++) {
    buildProp(B(L.props[i].x, L.props[i].z), L.props[i]);
    if (i % 800 === 0) { progress(0.55 + (i / L.props.length) * 0.15, `Объекты ${i}/${L.props.length}`); await tick(); }
  }
  // ларьки — вывески
  for (const k of L.kiosks) {
    const kt = KIOSK_TYPES[k.type];
    B(k.x, k.z).add(`sign:${kt.name}|${kt.color}`, T.plane, M(k.x + Math.sin(k.a) * 1.02, 2.35, k.z + Math.cos(k.a) * 1.02, k.a, 2.4, 0.42, 1));
  }
  // разметка парковок
  for (const lot of L.lots) for (const sp of lot.spaces) {
    const b = B(sp.x, sp.z); const y = lot.name === 'Парковка' ? 0.165 : 0.03;
    for (const sx of [-1.45, 1.45]) b.add('c:#f1f1ec', T.box, M(sp.x + sx, y, sp.z, 0, 0.1, 0.02, 5));
  }
  // логистический терминал: асфальт
  { const D = L.depot; for (let x = D.x0; x < D.x1; x += 50) for (let z = D.z0; z < D.z1; z += 50) { const w = Math.min(50, D.x1 - x), d = Math.min(50, D.z1 - z); B(x + w / 2, z + d / 2).add('tex:asphalt', T.plane, M(x + w / 2, 0.02, z + d / 2, 0, w, d, 1, -Math.PI / 2), 8); }
    for (const bay of D.bays) { const b = B(bay.x, bay.z); for (const sx of [-2, 2]) b.add('c:#facc15', T.box, M(bay.x + sx, 0.04, bay.z, 0, 0.15, 0.02, 14)); }
    B(1220, 512).add('sign:ЛОГИСТИКА «ВОСТОК»|#0f766e', T.box, M(1220, 4.5, 516, 0, 9, 1.2, 0.1)); for (const sx of [-4.6, 4.6]) B(1220, 512).add('c:#475569', T.box, M(1220 + sx, 2.4, 516, 0, 0.25, 4.8, 0.25)); }
  // места автобазара
  for (const sl of L.bazaarSlots) {
    const b = B(sl.x, sl.z);
    for (const sx of [-1.9, 1.9]) b.add('c:#f8fafc', T.box, M(sl.x + sx, 0.17, sl.z, 0, 0.12, 0.02, 5.6));
    b.add('c:#f8fafc', T.box, M(sl.x, 0.17, sl.z - 2.8, 0, 3.9, 0.02, 0.12));
    b.add(`sign:Место ${sl.id + 1} · продажа|#0f766e`, T.plane, M(sl.x, 1.6, sl.z + 3.1, Math.PI, 2.4, 0.45, 1));
    b.add('c:#334155', T.box, M(sl.x - 1.0, 0.7, sl.z + 3.12, 0, 0.06, 1.4, 0.06)); b.add('c:#334155', T.box, M(sl.x + 1.0, 0.7, sl.z + 3.12, 0, 0.06, 1.4, 0.06));
  }
  // указатели главного шоссе
  for (const ax of [3, 9, 15]) { const x = ax * 60 + 30, z = 540 - 6.6; B(x, z).add('c:#475569', T.cylB, M(x, 0, z, 0, 0.08, 5.2, 0.08)); B(x, z).add('sign:ГЛАВНОЕ ШОССЕ|#15803d', T.box, M(x, 4.6, z, 0, 3.6, 0.7, 0.06)); }
  // вертолётная площадка
  B(L.helipad.x, L.helipad.z).add('sign:H|#334155', T.plane, M(L.helipad.x, 0.17, L.helipad.z, 0, 7, 7, 1, -Math.PI / 2));
  await tick();
  // ---------- объединение чанков ----------
  progress(0.72, 'Объединение геометрии');
  const chunks: WorldMeshes['chunks'] = [];
  let ci = 0;
  for (const [k, b] of batchers) {
    const [cx, cz] = k.split(',').map(Number);
    const g = new THREE.Group(); g.name = 'chunk ' + k;
    for (const m of b.build({ cast: true, receive: true })) g.add(m);
    root.add(g);
    chunks.push({ group: g, cx: (cx + 0.5) * CHUNK, cz: (cz + 0.5) * CHUNK });
    if (++ci % 10 === 0) { progress(0.72 + (ci / batchers.size) * 0.14, 'Объединение геометрии'); await tick(); }
  }
  // ---------- светофоры (инстансы) ----------
  progress(0.88, 'Светофоры');
  const lights: LightIntersection[] = L.nodes.filter((n) => n.light).map((n) => ({ node: n.id, x: n.x, z: n.z, gi: n.gi!, gj: n.gj!, state: -1 }));
  const nL = lights.length * 4;
  const poleM = new THREE.InstancedMesh(T.cylB, mat('c:#2f3337'), nL);
  const armM = new THREE.InstancedMesh(T.box, mat('c:#2f3337'), nL);
  const housM = new THREE.InstancedMesh(T.box, mat('c:#151515'), nL * 2);
  const bulbs = new THREE.InstancedMesh(T.circle, new THREE.MeshBasicMaterial({ color: 0xffffff }), nL * 3);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let li = 0;
  for (const lt of lights) {
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = dirs[d]; // направление движения к перекрёстку
      const rx = -dz, rz = dx; // правая сторона
      const px = lt.x - dx * 7.4 + rx * 7.0, pz = lt.z - dz * 7.4 + rz * 7.0;
      const face = Math.atan2(-dx, -dz);
      poleM.setMatrixAt(li, M(px, 0, pz, 0, 0.12, 5.6, 0.12));
      armM.setMatrixAt(li, M(px - rx * 2.6, 5.5, pz - rz * 2.6, face, 5.2, 0.12, 0.12).clone().multiply(new THREE.Matrix4()) );
      // корпус на консоли и на стойке
      const hx = px - rx * 3.4, hz = pz - rz * 3.4;
      housM.setMatrixAt(li * 2, M(hx, 4.75, hz, face, 0.42, 1.25, 0.32));
      housM.setMatrixAt(li * 2 + 1, M(px + dx * 0.1, 2.6, pz + dz * 0.1, face, 0.34, 1.0, 0.26));
      for (let c = 0; c < 3; c++) {
        bulbs.setMatrixAt(li * 3 + c, M(hx - dx * 0.17, 5.15 - c * 0.38, hz - dz * 0.17, face, 0.13, 0.13, 1));
        bulbs.setColorAt(li * 3 + c, new THREE.Color(0x222222));
      }
      li++;
    }
  }
  // консоль поперёк: исправить ориентацию (по направлению правого вектора)
  li = 0;
  for (const lt of lights) for (let d = 0; d < 4; d++) {
    const [dx, dz] = dirs[d]; const rx = -dz, rz = dx;
    const px = lt.x - dx * 7.4 + rx * 7.0, pz = lt.z - dz * 7.4 + rz * 7.0;
    armM.setMatrixAt(li, M(px - rx * 1.8, 5.55, pz - rz * 1.8, Math.atan2(rx, rz), 0.12, 0.12, 3.8));
    li++;
  }
  for (const im of [poleM, armM, housM, bulbs]) { im.instanceMatrix.needsUpdate = true; im.castShadow = im !== bulbs; im.frustumCulled = false; root.add(im); }
  if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
  // ---------- поле пшеницы (работа) ----------
  progress(0.93, 'Поля');
  const cw = (F.x1 - F.x0) / F.cols, chh = (F.z1 - F.z0) / F.rows;
  const wheat = new THREE.InstancedMesh(T.boxB, mat('tex:wheat'), F.cols * F.rows);
  const wheatCells: WorldMeshes['wheatCells'] = [];
  for (let r = 0; r < F.rows; r++) for (let c = 0; c < F.cols; c++) {
    const x = F.x0 + (c + 0.5) * cw, z = F.z0 + (r + 0.5) * chh;
    wheat.setMatrixAt(wheatCells.length, M(x, 0, z, 0, cw - 0.2, 1.1, chh - 0.2));
    wheatCells.push({ x, z, done: false });
  }
  wheat.instanceMatrix.needsUpdate = true; wheat.receiveShadow = true;
  root.add(wheat);
  await tick();
  return { root, chunks, lights, bulbs, wheat, wheatCells, garageGates, water };
}

// ---------- многоуровневый паркинг ----------
function buildParkade(b: Batcher, bd: Building) {
  const { x, z, w, d, h } = bd; const levels = Math.round(h / 3.2);
  const C = 'tex:concrete';
  for (let lv = 1; lv <= levels; lv++) {
    const y = lv * 3.2;
    b.box(C, x, y - 0.25, z, w, 0.3, d, 0, 4); // перекрытие
    if (lv < levels || true) { b.box('c:#c9c6bf', x, y - 0.25 + 0.3, z - d / 2 + 0.1, w, 0.9, 0.2); b.box('c:#c9c6bf', x - w / 2 + 0.1, y + 0.05, z, 0.2, 0.9, d); b.box('c:#c9c6bf', x + w / 2 - 0.1, y + 0.05, z, 0.2, 0.9, d); } // парапеты
    b.box('c:#1d4ed8', x, y + 0.6, z - d / 2 + 0.02, w, 0.18, 0.04); // синяя полоса
  }
  b.box(C, x, 0, z + d / 2 - 0.15, w, h, 0.3, 0, 4); // задняя стена
  for (let px = -1; px <= 1; px++) for (const pz of [-1, 1]) b.box('c:#b8b5ae', x + px * (w / 2 - 0.5), 0, z + pz * (d / 2 - 0.5), 1, h, 1);
  for (const px of [-10, 10]) b.box('c:#b8b5ae', x + px, 0, z, 0.8, h, 0.8);
  // пандус (декоративный) и машины на ярусах
  b.add(C, T.box, M(x + w / 2 - 4, 1.6, z + 2, 0, 6, 0.3, 14, 0.23));
  const cols = ['#d50000', '#ffffff', '#212121', '#2962ff', '#9e9e9e', '#00c853', '#ffd600'];
  for (let lv = 1; lv < levels; lv++) for (let k = 0; k < 10; k++) {
    if ((k * 7 + lv * 3 + bd.id) % 3 === 0) continue;
    const cx = x - w / 2 + 4 + k * 3.4, cz = z + (k % 2 ? d / 2 - 4 : -d / 2 + 4), y = lv * 3.2 + 0.05;
    const col = 'paint:' + cols[(k + lv) % cols.length];
    b.box(col, cx, y + 0.3, cz, 1.8, 0.65, 4.3); b.box(col, cx, y + 0.95, cz - 0.2, 1.6, 0.5, 2.3); b.box('c:#1c2a38', cx, y + 1.0, cz - 0.2, 1.62, 0.36, 2.0);
  }
  b.add('sign:P · ПАРКИНГ «ЯРУС»|#1d4ed8', T.plane, M(x, h - 1.2, z - d / 2 - 0.05, Math.PI, 12, 1.6, 1));
  b.add('sign:P|#1d4ed8', T.box, M(x - w / 2 - 1.5, 4, z - d / 2 - 1.5, 0, 1.6, 1.6, 0.1)); b.box('c:#475569', x - w / 2 - 1.5, 0, z - d / 2 - 1.5, 0.15, 3.2, 0.15);
}
// ---------- детали фасада: цоколь, карниз, балконы, витрины ----------
const SHOPS = new Set(['shop24', 'supermarket', 'cafe', 'pharmacy', 'gunshop', 'clothes', 'barber', 'service', 'dealer', 'gas', 'vshop']);
function buildingDetails(b: Batcher, bd: Building) {
  const { x, z, w, d, h } = bd;
  const a = bd.door.a, ox = Math.sin(a), oz = Math.cos(a);
  const alongX = Math.abs(oz) > 0.5; // фасад вдоль оси X
  const faceW = alongX ? w : d;
  const fx = x + ox * (alongX ? 0 : w / 2), fz = z + oz * (alongX ? d / 2 : 0); // центр фасада
  const at = (u: number, out: number) => ({ x: fx + (alongX ? u : 0) + ox * out, z: fz + (alongX ? 0 : u) + oz * out });
  const light = bd.facade === 'glass' ? 'c:#9aa4b0' : 'c:#dcd8cf';
  if (bd.kind === 'tower') {
    b.box('c:#1d2733', x, 0, z, w + 0.3, 4.6, d + 0.3); // остеклённый лобби-этаж
    b.box('c:#bfc5cc', x, 4.6, z, w + 0.5, 0.35, d + 0.5);
    b.box('c:#c9ced4', x, h - 0.2, z, w + 0.4, 0.5, d + 0.4); // венчающий пояс
    if (GFX.pbr) for (const sx of [-1, 1]) { b.box('c:#aab2bc', x + sx * (w / 2 + 0.12), 4.9, z, 0.18, h - 5.1, 0.6); b.box('c:#aab2bc', x, 4.9, z + sx * (d / 2 + 0.12), 0.6, h - 5.1, 0.18); }
    return;
  }
  if (bd.kind === 'factory' || bd.kind === 'warehouse' || bd.facade === 'kiosk') return;
  b.box('c:#4b4744', x, 0, z, w + 0.24, 0.9, d + 0.24); // цоколь
  b.box(light, x, h - 0.45, z, w + 0.45, 0.45, d + 0.45); // карниз
  // витрина с маркизой у магазинов
  if (SHOPS.has(bd.kind)) {
    const dw = 1.9, half = (faceW - dw) / 2 - 0.6;
    for (const sgn of [-1, 1]) {
      const c = at(sgn * (dw / 2 + half / 2 + 0.3), 0.05);
      b.add('glass:0.55', T.box, M(c.x, 1.55, c.z, a, half, 2.2, 0.06));
      b.add('c:#2b2f36', T.box, M(c.x, 0.42, c.z, a, half + 0.1, 0.12, 0.12));
      b.add('c:#2b2f36', T.box, M(c.x, 2.68, c.z, a, half + 0.1, 0.1, 0.12));
    }
    const aw = at(0, 0.75);
    b.add('c:' + (bd.color ?? '#7f1d1d'), T.box, M(aw.x, 2.95, aw.z, a, faceW - 0.6, 0.08, 1.5, 0.28));
    b.add('c:#f8fafc', T.box, M(aw.x + ox * 0.72, 2.75, aw.z + oz * 0.72, a, faceW - 0.6, 0.22, 0.04));
  }
  // балконы жилых домов (на среднем и высоком качестве)
  if (bd.kind === 'apartment' && GFX.pbr) {
    const floors = Math.round(h / 3.2);
    const lux = bd.cls === 'lux';
    const base = alongX ? x : z;
    for (let f = 1; f < floors; f++) {
      for (let k = Math.ceil((base - faceW / 2 + 1.6 - 2) / 4); 4 * k + 2 <= base + faceW / 2 - 1.6; k++) {
        if ((k + f + bd.id) % 2) continue;
        const u = 4 * k + 2 - base; const c = at(u, 0.6);
        b.add('c:#d4d0c8', T.box, M(c.x, f * 3.2 + 0.05, c.z, a, 2.8, 0.14, 1.2));
        const rl = at(u, 1.17);
        b.add(lux ? 'glass:0.4' : 'c:#3b3f46', T.box, M(rl.x, f * 3.2 + 0.62, rl.z, a, 2.8, 0.95, 0.05));
        if (!lux) b.add('c:#2a2d33', T.box, M(rl.x, f * 3.2 + 1.1, rl.z, a, 2.85, 0.05, 0.08));
      }
    }
  }
}
// ---------- здание ----------
const FACADE_TINTS: Record<string, string[]> = {
  plaster: ['#ffffff', '#f6e3c4', '#e9d6ec', '#d6ecd9', '#f7cfb3', '#dfe7f5'], panel: ['#ffffff', '#e5e7eb', '#dbeafe', '#fdf0c4', '#f3dede'],
  brick: ['#ffffff', '#d9c4b6', '#c8a08c', '#e8d8cf'], office: ['#ffffff', '#e2e8f0', '#d6d3d1', '#f5ecd9'], glass: ['#ffffff', '#c7ddff', '#b6f0d8', '#e9d5ff', '#ffe2c2'],
  luxres: ['#ffffff', '#ece7e2', '#e2ece9'], wood: ['#ffffff', '#d9b38c', '#b48a6a'],
};
function buildBuilding(b: Batcher, bd: Building) {
  const { x, z, w, d, h } = bd;
  const tints = FACADE_TINTS[bd.facade];
  const facadeKey = 'facade:' + bd.facade + (tints ? ':' + tints[bd.id % tints.length] : '');
  if (bd.roof === 'gable') {
    b.box(facadeKey, x, 0, z, w, h * 0.62, d, 0, [10, 12]);
    b.box('c:#5a554f', x, 0, z, w + 0.2, 0.5, d + 0.2); // фундамент
    const alongX = w >= d;
    b.add('c:' + (bd.color ?? '#7f1d1d'), T.prism, M(x, h * 0.62, z, alongX ? 0 : Math.PI / 2, (alongX ? w : d) + 0.6, h * 0.38, (alongX ? d : w) + 0.8));
    if (bd.kind === 'vhouse' || bd.kind === 'house') b.box('c:#57534e', x + (alongX ? w * 0.25 : 0), h * 0.7, z + (alongX ? 0 : d * 0.25), 0.6, h * 0.45, 0.6);
  } else {
    b.box(facadeKey, x, 0, z, w, h, d, 0, [FACADE_TILE.w, FACADE_TILE.h]);
    buildingDetails(b, bd);
    b.box('tex:roof', x, h, z, w + 0.3, 0.35, d + 0.3, 0, 6);
    if (GFX.pbr && bd.kind !== 'factory' && bd.kind !== 'warehouse') {
      const pc = 'c:#8f9196';
      b.box(pc, x, h + 0.35, z - d / 2, w + 0.3, 0.55, 0.3); b.box(pc, x, h + 0.35, z + d / 2, w + 0.3, 0.55, 0.3);
      b.box(pc, x - w / 2, h + 0.35, z, 0.3, 0.55, d + 0.3); b.box(pc, x + w / 2, h + 0.35, z, 0.3, 0.55, d + 0.3);
      if (bd.kind === 'apartment') { b.box('c:#b0b4ba', x - w * 0.25, h + 0.35, z, 1.4, 0.9, 1.0); b.add('c:#9ca3af', T.cylB, M(x + w * 0.28, h + 0.35, z + d * 0.1, 0, 0.9, 1.8, 0.9)); b.box('c:#57534e', x + w * 0.05, h + 0.35, z - d * 0.2, 1.6, 2.2, 1.6); }
    }
    if (h > 25) { b.box('c:#9ca3af', x + w * 0.2, h + 0.35, z - d * 0.15, 3, 2.2, 3); b.box('c:#6b7280', x - w * 0.25, h + 0.35, z + d * 0.2, 2, 3, 2); }
  }
  // дверь и козырёк
  const a = bd.door.a, ox = Math.sin(a), oz = Math.cos(a);
  const fx = bd.door.x - ox * 1.25, fz = bd.door.z - oz * 1.25; // на фасаде
  const shop = bd.facade === 'shop' || bd.facade === 'mall' || bd.facade === 'glass';
  const dw = bd.kind === 'mall' ? 6 : bd.kind === 'vhouse' ? 1.1 : 1.6;
  if (bd.kind !== 'tower' && bd.kind !== 'factory' && bd.kind !== 'warehouse') {
    b.add(shop ? 'c:#1e3a5f' : 'c:#4a2c17', T.box, M(fx + ox * 0.03, 1.2, fz + oz * 0.03, a, dw, 2.4, 0.12));
    b.add('c:#d1d5db', T.box, M(fx + ox * 0.05, 2.45, fz + oz * 0.05, a, dw + 0.3, 0.15, 0.14));
    if (bd.kind === 'apartment' || bd.kind === 'house') b.add('c:#475569', T.box, M(fx + ox * 0.8, 2.8, fz + oz * 0.8, a, 2.6, 0.12, 1.6));
  } else if (bd.kind === 'tower') {
    b.add('c:#1e293b', T.box, M(fx + ox * 0.05, 1.6, fz + oz * 0.05, a, 4, 3.2, 0.12));
  } else {
    b.add('c:#6b7280', T.box, M(fx + ox * 0.05, 2.5, fz + oz * 0.05, a, 6, 5, 0.12)); // ворота цеха
  }
  // вывеска
  const signed = ['shop24', 'supermarket', 'cafe', 'pharmacy', 'gunshop', 'clothes', 'barber', 'mall', 'dealer', 'service', 'gas', 'police', 'hospital', 'fire', 'cityhall', 'bank', 'vshop', 'vadmin', 'checkpoint', 'farm', 'market', 'warehouse', 'factory'];
  if (signed.includes(bd.kind)) {
    const sw = Math.min(w, d, 14) * (bd.kind === 'mall' || bd.kind === 'cityhall' || bd.kind === 'factory' ? 1.6 : 0.9);
    const sy = bd.roof === 'gable' ? h * 0.62 - 0.9 : Math.min(h - 1.2, bd.kind === 'mall' ? 12 : 3.6);
    b.add(`sign:${bd.name}|${bd.color ?? '#1e3a8a'}`, T.plane, M(fx + ox * 0.08, sy, fz + oz * 0.08, a, sw, sw * 0.19, 1));
  }
  if (bd.kind === 'hospital') b.add('sign:✚|#dc2626', T.plane, M(fx + ox * 0.08, h - 2, fz + oz * 0.08, a, 2.4, 2.4, 1));
  if (bd.kind === 'fire') b.add('c:#b91c1c', T.box, M(fx + ox * 0.04 + Math.cos(a) * 5, 1.9, fz + oz * 0.04 - Math.sin(a) * 5, a, 4, 3.8, 0.1));
}

// ---------- реквизит ----------
function buildProp(b: Batcher, p: Prop) {
  const { x, z } = p; const r = p.r ?? 0; const s = p.h ?? 1;
  switch (p.t) {
    case 'tree':
      if (s <= 0.9) { // уличное дерево — облегчённое
        b.add('c:#5b3a1e', T.box, M(x, 1.1 * s, z, r, 0.26, 2.2 * s, 0.26));
        b.add(Math.abs(Math.round(r)) % 3 === 0 ? 'c:#4f8f33' : 'c:#3f7d2c', T.ico, M(x, 3.3 * s, z, r, 1.6 * s, 1.5 * s, 1.6 * s));
        break;
      }
      b.add('c:#5b3a1e', T.cylB, M(x, 0, z, 0, 0.18 * s, 2.2 * s, 0.18 * s));
      b.add('c:#3f7d2c', T.ico, M(x, 3.2 * s, z, r, 1.7 * s, 1.5 * s, 1.7 * s));
      b.add('c:#4c9a35', T.ico, M(x + 0.4, 3.9 * s, z - 0.3, r + 1, 1.1 * s, 1.0 * s, 1.1 * s));
      break;
    case 'pine':
      b.add('c:#5b3a1e', T.cylB, M(x, 0, z, 0, 0.16 * s, 1.6 * s, 0.16 * s));
      b.add('c:#1f5f3a', T.cone, M(x, 1.2 * s, z, 0, 1.6 * s, 2.6 * s, 1.6 * s));
      b.add('c:#2a7046', T.cone, M(x, 2.6 * s, z, 0, 1.15 * s, 2.2 * s, 1.15 * s));
      break;
    case 'bush': b.add('c:#3e7a2a', T.ico, M(x, 0.6, z, 0, 1.0 * s, 0.7 * s, 1.0 * s)); break;
    case 'lamp':
      b.add('c:#3a3d42', T.cylB, M(x, 0, z, 0, 0.09, 6, 0.09));
      b.add('c:#3a3d42', T.box, M(x + Math.sin(r) * 0.7, 6, z + Math.cos(r) * 0.7, r, 0.1, 0.1, 1.5));
      b.add('lamp', T.box, M(x + Math.sin(r) * 1.3, 5.92, z + Math.cos(r) * 1.3, r, 0.35, 0.12, 0.6));
      b.add('lamppool', T.circle, M(x + Math.sin(r) * 1.4, 0.2, z + Math.cos(r) * 1.4, 0, 5.2, 5.2, 1, -Math.PI / 2));
      b.add('lampcone', T.cone, M(x + Math.sin(r) * 1.3, 5.85, z + Math.cos(r) * 1.3, 0, 2.6, -5.6, 2.6));
      break;
    case 'bench':
      b.add('c:#8b5a2b', T.box, M(x, 0.45, z, r, 1.8, 0.07, 0.5));
      b.add('c:#8b5a2b', T.box, M(x - Math.cos(r) * 0 + Math.sin(r) * -0.22, 0.75, z + Math.cos(r) * -0.22, r, 1.8, 0.4, 0.06));
      b.add('c:#333', T.box, M(x, 0.22, z, r, 1.6, 0.44, 0.08));
      break;
    case 'hydrant': b.add('c:#dc2626', T.cylB, M(x, 0.15, z, 0, 0.15, 0.6, 0.15)); b.add('c:#dc2626', T.box, M(x, 0.5, z, 0, 0.45, 0.1, 0.1)); break;
    case 'trash': b.add('c:#14532d', T.cylB, M(x, 0.15, z, 0, 0.3, 0.8, 0.3)); break;
    case 'swing': {
      const ca = Math.cos(r), sa = Math.sin(r);
      for (const sx of [-1.5, 1.5]) for (const lz of [-0.6, 0.6]) b.add('c:#2563eb', T.box, M(x + ca * sx + sa * lz * 0.5, 1.1, z - sa * sx + ca * lz * 0.5, r, 0.08, 2.3, 0.08, lz * 0.4));
      b.add('c:#2563eb', T.box, M(x, 2.2, z, r, 3.2, 0.1, 0.1));
      for (const sx of [-0.7, 0.7]) { b.add('c:#999', T.box, M(x + ca * sx, 1.4, z - sa * sx, r, 0.03, 1.6, 0.03)); b.add('c:#ef4444', T.box, M(x + ca * sx, 0.6, z - sa * sx, r, 0.5, 0.06, 0.3)); }
      break;
    }
    case 'slide': {
      const ca = Math.cos(r), sa = Math.sin(r);
      b.add('c:#f59e0b', T.box, M(x - sa * 1.4, 0.75, z - ca * 1.4, r, 1, 1.5, 1));
      b.add('c:#ef4444', T.box, M(x + sa * 0.4, 0.85, z + ca * 0.4, r, 0.7, 0.06, 3, 0.5));
      b.add('c:#666', T.box, M(x - sa * 2.2, 0.75, z - ca * 2.2, r, 0.5, 1.5, 0.08, 0.3));
      break;
    }
    case 'sandbox': b.add('c:#a16207', T.box, M(x, 0.12, z, 0, 3, 0.25, 3)); b.add('tex:sand', T.box, M(x, 0.15, z, 0, 2.7, 0.22, 2.7), 3); break;
    case 'carousel': b.add('c:#dc2626', T.cylB, M(x, 0.2, z, 0, 1.3, 0.12, 1.3)); b.add('c:#facc15', T.cylB, M(x, 0.3, z, 0, 0.06, 0.9, 0.06)); b.add('c:#2563eb', T.torus, M(x, 1.1, z, 0, 0.6, 0.6, 0.6, Math.PI / 2)); break;
    case 'fountain': b.add('c:#9ca3af', T.cylB, M(x, 0, z, 0, 2.5, 0.6, 2.5)); b.add('water', T.cylB, M(x, 0.4, z, 0, 2.2, 0.25, 2.2)); b.add('c:#d1d5db', T.cylB, M(x, 0.5, z, 0, 0.35, 1.8, 0.35)); b.add('c:#d1d5db', T.cylB, M(x, 2.2, z, 0, 0.9, 0.15, 0.9)); break;
    case 'fence': {
      const w = p.w ?? 1, d = p.d ?? 0.1, h = p.h ?? 1.2;
      const c = 'c:' + (p.c ?? '#8b6b4a');
      b.box(c, x, 0.15, z, w, h - 0.15, d);
      const len = Math.max(w, d), n = Math.floor(len / 2.5);
      for (let i = 0; i <= n; i++) { const t = n ? i / n - 0.5 : 0; b.box('c:#57534e', x + (w > d ? t * w : 0), 0, z + (w > d ? 0 : t * d), 0.14, h + 0.1, 0.14); }
      break;
    }
    case 'gateleaf': { const w = p.w ?? 1.4; const a = r + 1.2; b.add('c:#7c5a3a', T.box, M(x + Math.cos(a) * w / 2, 0.75, z - Math.sin(a) * w / 2, a, w, 1.1, 0.06)); break; }
    case 'driveway': b.add('c:#9a8f7f', T.box, M(x, 0.02, z, 0, p.w ?? 3, 0.04, p.d ?? 5)); break;
    case 'porch': {
      const ca = Math.cos(r), sa = Math.sin(r);
      b.add('c:#78716c', T.box, M(x, 0.15, z, r, p.w ?? 2.4, 0.3, p.d ?? 1.4));
      for (const sx of [-1, 1]) b.add('c:#a8a29e', T.box, M(x + ca * sx * 1.1, 1.4, z - sa * sx * 1.1, r, 0.1, 2.3, 0.1));
      b.add('c:#7f1d1d', T.box, M(x, 2.55, z, r, 2.8, 0.1, 1.8));
      break;
    }
    case 'bed': b.add('c:#5a3b1d', T.box, M(x, 0.12, z, 0, p.w ?? 1, 0.25, p.d ?? 4)); b.add('c:#4ade80', T.box, M(x, 0.3, z, 0, (p.w ?? 1) * 0.5, 0.14, (p.d ?? 4) * 0.9)); break;
    case 'banya': {
      b.add('facade:wood', T.box, M(x, 1.3, z, r, 4, 2.6, 4), [8, 10]);
      b.add('c:#3f2a17', T.prism, M(x, 2.6, z, r, 4.6, 1.3, 4.8));
      b.add('c:#44403c', T.cylB, M(x + Math.cos(r) * 1.2, 2.6, z - Math.sin(r) * 1.2, 0, 0.18, 1.8, 0.18));
      b.add('c:#3b2412', T.box, M(x + Math.sin(r) * 2.01, 1.0, z + Math.cos(r) * 2.01, r, 0.8, 1.8, 0.06));
      break;
    }
    case 'umbrella': b.add('c:#ddd', T.cylB, M(x, 0, z, 0, 0.04, 2.4, 0.04)); b.add('c:' + (p.c ?? '#ef4444'), T.cone, M(x, 2.0, z, 0, 1.4, 0.55, 1.4)); break;
    case 'towel': b.add('c:' + (p.c ?? '#60a5fa'), T.box, M(x, 0.11, z, 0.2, 0.9, 0.02, 1.8)); break;
    case 'lounger': b.add('c:#f5f5f5', T.box, M(x, 0.3, z, 0.2, 0.65, 0.08, 1.9)); b.add('c:#f5f5f5', T.box, M(x, 0.5, z - 0.7, 0.2, 0.65, 0.06, 0.6, 0.6)); b.add('c:#888', T.box, M(x, 0.13, z, 0.2, 0.6, 0.26, 1.6)); break;
    case 'lifeguard': for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) b.add('c:#fff', T.box, M(x + lx, 1.2, z + lz, 0, 0.12, 2.4, 0.12)); b.add('c:#ef4444', T.box, M(x, 2.5, z, 0, 2, 0.15, 2)); b.add('c:#ef4444', T.box, M(x, 3.4, z, 0, 2.2, 0.1, 2.2)); break;
    case 'container': {
      const c = 'c:' + (p.c ?? '#b91c1c');
      b.add(c, T.box, M(x, 1.3, z, r, 2.5, 2.6, 6));
      for (let i = 0; i < 6; i++) b.add('c:#00000033'.slice(0, 9) === 'c:#000000' ? 'c:#222' : c, T.box, M(x + Math.sin(r) * (-2.5 + i), 1.3, z + Math.cos(r) * (-2.5 + i), r, 2.56, 2.5, 0.08));
      break;
    }
    case 'tank': b.add('c:#d1d5db', T.cylB, M(x, 0, z, 0, p.w ?? 7, p.h ?? 10, p.w ?? 7).clone().multiply(new THREE.Matrix4().makeScale(0.5, 1, 0.5))); b.add('c:#9ca3af', T.cone, M(x, p.h ?? 10, z, 0, (p.w ?? 7) / 2, 1, (p.w ?? 7) / 2)); break;
    case 'crane': {
      const w = p.w ?? 34, d = p.d ?? 50, h = p.h ?? 14;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('c:#f59e0b', T.box, M(x + sx * w / 2 + 2 * -sx * 0, h / 2, z + sz * d / 2.1, 0, 1.2, h, 1.2));
      for (const sz of [-1, 1]) b.add('c:#f59e0b', T.box, M(x, h, z + sz * d / 2.1, 0, w + 2, 1.4, 1.4));
      b.add('c:#d97706', T.box, M(x - 4, h + 0.9, z, 0, 3, 1.5, d * 0.95));
      b.add('c:#374151', T.box, M(x - 4, h - 3, z, 0, 0.1, 6, 0.1));
      break;
    }
    case 'dock': b.box('tex:concrete', x, 0, z, p.w ?? 40, p.h ?? 1.2, p.d ?? 4, 0, 4); b.box('c:#facc15', x, (p.h ?? 1.2) - 0.05, z + (p.d ?? 4) / 2 - 0.1, p.w ?? 40, 0.1, 0.2); break;
    case 'booth': b.box('c:#e5e7eb', x, 0, z, 2.5, 2.6, 2.5); b.box('glass:0.5', x, 1.1, z, 2.55, 1.0, 2.55); b.box('c:#1e3a8a', x, 2.6, z, 2.9, 0.2, 2.9); break;
    case 'barrier': b.box('c:#666', x, 0, z, 0.3, 1.1, 0.3); b.add('c:#dc2626', T.box, M(x, 2.6, z + 0.2, 0, 0.12, 3.4, 0.12, 0, 0.15)); break;
    case 'pump': b.box('c:#e5e7eb', x, 0, z, 0.8, 1.6, 0.5); b.box('c:#16a34a', x, 1.3, z, 0.82, 0.3, 0.52); b.box('glow:#a7f3d0', x, 1.0, z + 0.26, 0.4, 0.2, 0.01); break;
    case 'canopy': {
      const w = p.w ?? 12, d = p.d ?? 7;
      b.box('c:#f8fafc', x, 4.5, z, w, 0.5, d); b.box('c:#16a34a', x, 4.5, z, w + 0.05, 0.25, d + 0.05);
      for (const sx of [-1, 1]) b.box('c:#cbd5e1', x + sx * (w / 2 - 1), 0, z, 0.3, 4.5, 0.3);
      break;
    }
    case 'vsign': {
      const ca = Math.cos(r), sa = Math.sin(r);
      for (const sx of [-1, 1]) b.add('c:#444', T.box, M(x + ca * sx * 0.9, 1.1, z - sa * sx * 0.9, r, 0.08, 2.2, 0.08));
      b.add(`sign:${p.c}|#1e5631`, T.box, M(x, 1.9, z, r, 2.4, 0.6, 0.05));
      break;
    }
    case 'kiosk': {
      b.add('c:#f1f5f9', T.box, M(x, 1.25, z, r, 2.6, 2.5, 2.0));
      b.add('c:' + (p.c ?? '#f97316'), T.box, M(x, 2.6, z, r, 2.9, 0.25, 2.3));
      b.add('glass:0.5', T.box, M(x + Math.sin(r) * 1.0, 1.4, z + Math.cos(r) * 1.0, r, 2.0, 0.9, 0.05));
      b.add('c:' + (p.c ?? '#f97316'), T.box, M(x + Math.sin(r) * 1.4, 2.1, z + Math.cos(r) * 1.4, r, 2.6, 0.06, 0.8, 0.3));
      break;
    }
    case 'chimney': {
      const h = p.h ?? 30;
      for (let i = 0; i < 6; i++) b.add(i % 2 ? 'c:#f8fafc' : 'c:#b91c1c', T.cylB, M(x, (i * h) / 6, z, 0, 1.5 - i * 0.08, h / 6, 1.5 - i * 0.08));
      break;
    }
    case 'pipe': b.add('c:#9ca3af', T.cyl, M(x, p.h ?? 8, z, 0, 0.6, p.w ?? 10, 0.6, 0, Math.PI / 2)); break;
    case 'cow': {
      const ca = Math.cos(r), sa = Math.sin(r);
      b.add('c:#f5f5f4', T.box, M(x, 1.0, z, r, 0.8, 0.75, 1.7)); b.add('c:#1c1917', T.box, M(x + sa * 0.2, 1.05, z + ca * 0.2, r, 0.82, 0.5, 0.6));
      b.add('c:#f5f5f4', T.box, M(x + sa * 1.0, 1.25, z + ca * 1.0, r, 0.42, 0.42, 0.55)); b.add('c:#fda4af', T.box, M(x + sa * 1.3, 1.15, z + ca * 1.3, r, 0.3, 0.2, 0.08));
      for (const [lx, lz] of [[-0.28, 0.6], [0.28, 0.6], [-0.28, -0.6], [0.28, -0.6]]) b.add('c:#e7e5e4', T.box, M(x + ca * lx + sa * lz, 0.32, z - sa * lx + ca * lz, r, 0.16, 0.64, 0.16));
      break;
    }
    case 'chicken': b.add('c:#fafaf9', T.box, M(x, 0.22, z, r, 0.22, 0.2, 0.3)); b.add('c:#fafaf9', T.box, M(x + Math.sin(r) * 0.15, 0.36, z + Math.cos(r) * 0.15, r, 0.12, 0.14, 0.12)); b.add('c:#dc2626', T.box, M(x + Math.sin(r) * 0.15, 0.45, z + Math.cos(r) * 0.15, r, 0.03, 0.05, 0.08)); b.add('c:#f59e0b', T.box, M(x + Math.sin(r) * 0.23, 0.36, z + Math.cos(r) * 0.23, r, 0.04, 0.03, 0.06)); break;
    case 'hay': b.add('c:#d4a537', T.cylB, M(x, 0, z, 0, 0.8, 1.2, 0.8, 0, 0)); b.add('c:#b88a24', T.cylB, M(x, 0, z, 0, 0.82, 0.1, 0.82)); break;
    case 'trough': b.add('c:#78350f', T.box, M(x, 0.35, z, 0, 2.6, 0.7, 0.8)); b.add('c:#84cc16', T.box, M(x, 0.66, z, 0, 2.4, 0.06, 0.6)); break;
    case 'scooterdock': b.add('c:#334155', T.box, M(x, 0.9, z, 0, 0.12, 1.8, 0.12)); b.add('sign:🛴 Вжух · аренда|#16a34a', T.box, M(x, 1.75, z, 0, 0.9, 0.5, 0.05)); b.add('c:#16a34a', T.box, M(x + 1.9, 0.16, z, 0, 3.4, 0.02, 1.2)); break;
    case 'pallet': b.box('c:#a16207', x, 0, z, 1.2, 0.15, 1.0); b.box('c:#1f2937', x, 0.15, z, 0.9, 0.8, 0.9); break;
    default: break;
  }
}
