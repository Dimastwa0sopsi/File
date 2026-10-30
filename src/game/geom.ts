// Общие геометрии и батчер, объединяющий статичную геометрию по материалам
import * as THREE from 'three';
import { mat } from './textures';

function prep(g: THREE.BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.getAttribute('normal')) n.computeVertexNormals();
  return n;
}
export const T = {
  box: prep(new THREE.BoxGeometry(1, 1, 1)),
  boxB: prep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), // низ в 0
  cyl: prep(new THREE.CylinderGeometry(1, 1, 1, 10)),
  cylB: prep(new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0)),
  cyl16: prep(new THREE.CylinderGeometry(1, 1, 1, 16)),
  cone: prep(new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0)),
  sphere: prep(new THREE.SphereGeometry(1, 10, 7)),
  ico: prep(new THREE.IcosahedronGeometry(1, 0)),
  plane: prep(new THREE.PlaneGeometry(1, 1)), // в XY, нормаль +Z
  torus: prep(new THREE.TorusGeometry(1, 0.18, 6, 14)),
  circle: prep(new THREE.CircleGeometry(1, 10)),
  prism: (() => { // треугольная призма для двускатной крыши: основание 1x1, высота 1, конёк по X
    const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); g.rotateY(Math.PI / 2);
    return prep(g);
  })(),
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function M(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

interface Buf { pos: number[]; nor: number[]; uv: number[] }
export class Batcher {
  bufs = new Map<string, Buf>();
  count = 0;
  private nm = new THREE.Matrix3();
  add(matKey: string, geo: THREE.BufferGeometry, m: THREE.Matrix4, worldUV?: number | [number, number]) {
    let b = this.bufs.get(matKey);
    if (!b) { b = { pos: [], nor: [], uv: [] }; this.bufs.set(matKey, b); }
    const P = geo.getAttribute('position').array as ArrayLike<number>;
    const Nn = geo.getAttribute('normal').array as ArrayLike<number>;
    const U = geo.getAttribute('uv')?.array as ArrayLike<number> | undefined;
    const e = m.elements;
    this.nm.getNormalMatrix(m); const n = this.nm.elements;
    const vc = P.length / 3;
    const su = Array.isArray(worldUV) ? worldUV[0] : worldUV ?? 0, sv = Array.isArray(worldUV) ? worldUV[1] : worldUV ?? 0;
    for (let i = 0; i < vc; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = Nn[i * 3], bb = Nn[i * 3 + 1], c = Nn[i * 3 + 2];
      let nx = n[0] * a + n[3] * bb + n[6] * c, ny = n[1] * a + n[4] * bb + n[7] * c, nz = n[2] * a + n[5] * bb + n[8] * c;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      b.pos.push(wx, wy, wz); b.nor.push(nx, ny, nz);
      if (su) {
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (ay >= ax && ay >= az) b.uv.push(wx / su, wz / su);
        else if (ax >= az) b.uv.push((nx > 0 ? -wz : wz) / su, wy / sv);
        else b.uv.push((nz > 0 ? wx : -wx) / su, wy / sv);
      } else if (U) b.uv.push(U[i * 2], U[i * 2 + 1]);
      else b.uv.push(0, 0);
    }
    this.count += vc;
  }
  box(matKey: string, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0, worldUV?: number | [number, number]) {
    this.add(matKey, T.box, M(x, y + h / 2, z, ry, w, h, d), worldUV);
  }
  /** сырые треугольники (позиции), нормали считаются по граням */
  raw(matKey: string, positions: number[], uvs?: number[]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    this.add(matKey, g, _m.identity());
    g.dispose();
  }
  build(opts: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    this.bufs.forEach((b, key) => {
      if (!b.pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const material = mat(key);
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = !!opts.cast && !(material as THREE.Material).transparent;
      mesh.receiveShadow = !!opts.receive;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      mesh.userData.matKey = key;
      out.push(mesh);
    });
    return out;
  }
}

/** Полоса (дорога/река) из отрезка: в плоскости y, ширина w, v вдоль длины */
export function stripQuad(b: Batcher, matKey: string, ax: number, az: number, bx: number, bz: number, w: number, y: number, vScale: number, v0 = 0) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
  const nx = (-dz / L) * (w / 2), nz = (dx / L) * (w / 2);
  const v1 = v0 + L / vScale;
  const p = [ax - nx, y, az - nz, ax + nx, y, az + nz, bx + nx, y, bz + nz, ax - nx, y, az - nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz];
  // обеспечить нормаль вверх
  const cross = (p[3] - p[0]) * (p[8] - p[2]) - (p[5] - p[2]) * (p[6] - p[0]);
  const uv = [0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1];
  if (cross > 0) { // перевернуть порядок
    b.raw(matKey, [p[0], p[1], p[2], p[6], p[7], p[8], p[3], p[4], p[5], p[9], p[10], p[11], p[15], p[16], p[17], p[12], p[13], p[14]], [uv[0], uv[1], uv[4], uv[5], uv[2], uv[3], uv[6], uv[7], uv[10], uv[11], uv[8], uv[9]]);
  } else b.raw(matKey, p, uv);
}
export function disposeMeshes(obj: THREE.Object3D) {
  obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry && !Object.values(T).includes(m.geometry as never)) m.geometry.dispose(); });
}
