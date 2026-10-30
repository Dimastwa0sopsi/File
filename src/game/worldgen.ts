// Генерация раскладки мира (чистые данные, без Three.js) — проверяемо в node
import { N, CELL, ROAD_W, SIDEWALK, CITY_SIZE, RNG, WORLD_SEED, assertBlock, inGrid, segDist, clamp } from './config';
import { KIOSK_TYPES, VILLAGE_NAMES } from './data';

export type RoadKind = 'city' | 'avenue' | 'highway' | 'village' | 'dirt' | 'industrial';
export const AVENUE_J = 9; // главное шоссе — улица z = 9 * CELL
export interface RNode { id: number; x: number; z: number; light: boolean; gi?: number; gj?: number }
export interface REdge { id: number; a: number; b: number; kind: RoadKind; w: number }
export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; tag?: string }

export type BKind = 'tower' | 'apartment' | 'house' | 'vhouse' | 'shop24' | 'supermarket' | 'cafe' | 'pharmacy' | 'gunshop' | 'clothes' | 'barber' |
  'mall' | 'dealer' | 'market' | 'service' | 'gas' | 'police' | 'hospital' | 'fire' | 'cityhall' | 'bank' | 'vshop' | 'vadmin' |
  'factory' | 'warehouse' | 'checkpoint' | 'garage' | 'farm' | 'parking' | 'parkade' | 'garages' | 'storage' | 'depot' | 'scootershop' | 'office' | 'barn' | 'coop' | 'livestock' |
  'fishshop';
export interface Building {
  id: number; kind: BKind; name: string; x: number; z: number; w: number; d: number; h: number;
  door: { x: number; z: number; a: number }; cls?: 'eco' | 'mid' | 'lux'; price?: number; forSale?: boolean;
  village?: string; facade: string; roof: 'flat' | 'gable'; enter: boolean; color?: string; fenced?: boolean;
  beds?: { x: number; z: number }[];
}
export type PropType = 'tree' | 'pine' | 'bush' | 'lamp' | 'bench' | 'hydrant' | 'trash' | 'swing' | 'slide' | 'sandbox' | 'carousel' |
  'fence' | 'bed' | 'banya' | 'porch' | 'gateleaf' | 'umbrella' | 'towel' | 'lounger' | 'container' | 'tank' | 'crane' | 'dock' | 'booth' |
  'barrier' | 'pump' | 'canopy' | 'vsign' | 'kiosk' | 'fountain' | 'pipe' | 'busstop' | 'driveway' | 'pallet' | 'chimney' | 'lifeguard' | 'scooterdock' | 'cow' | 'chicken' | 'hay' | 'trough' |
  'toilet' | 'shower' | 'palm' | 'volleyball' | 'crop' | 'bridge' | 'bridge_rail' | 'pillar' | 'silo' | 'well' | 'trailer';
export interface Prop { t: PropType; x: number; z: number; r?: number; w?: number; d?: number; h?: number; c?: string; v?: number }
export interface Kiosk { id: number; x: number; z: number; a: number; type: number }
export interface Village { name: string; sx: number; sz: number; ex: number; ez: number; signX: number; signZ: number; cx: number; cz: number }
export interface StaticVehicle { type: string; x: number; z: number; a: number; color?: string; tag?: string }
export interface Garage { id: number; x: number; z: number; w: number; d: number; price: number; gateZ: number }

export interface WorldLayout {
  nodes: RNode[]; edges: REdge[]; adj: { n: number; e: number }[][];
  buildings: Building[]; props: Prop[]; colliders: Box[]; kiosks: Kiosk[]; villages: Village[];
  blocks: { i: number; j: number; type: string; ox?: number; oz?: number }[];
  parks: { x0: number; z0: number; x1: number; z1: number }[];
  staticVehicles: StaticVehicle[]; garages: Garage[];
  lots: { x0: number; z0: number; x1: number; z1: number; spaces: { x: number; z: number; a: number }[]; name: string }[];
  parkades: { x: number; z: number; w: number; d: number; levels: number }[];
  depot: { x0: number; x1: number; z0: number; z1: number; office: { x: number; z: number }; bays: { x: number; z: number; a: number }[] };
  truckDests: { name: string; x: number; z: number }[];
  scooterDocks: { x: number; z: number; a: number }[];
  livestock: { office: { x: number; z: number }; feed: { x: number; z: number }; troughs: { x: number; z: number }[]; coop: { x: number; z: number }; crate: { x: number; z: number } };
  parked: StaticVehicle[]; bazaarSlots: { id: number; x: number; z: number; a: number; market: number }[]; vendors: { x: number; z: number; a: number; car: number }[];
  river: { center: (z: number) => number; half: number };
  /** настилы мостов — по ним можно ехать, вода здесь не мешает */
  bridges: { x0: number; x1: number; z0: number; z1: number; y: number }[];
  newCity: { name: string; x0: number; x1: number; z0: number; z1: number } | null;
  beach: { x0: number; x1: number; z0: number; z1: number };
  industrial: { x0: number; x1: number; z0: number; z1: number; pickup: { x: number; z: number }; trucks: { x: number; z: number; a: number }[]; office: { x: number; z: number } };
  farm: { x0: number; x1: number; z0: number; z1: number; office: { x: number; z: number }; combineSpawn: { x: number; z: number; a: number }; cols: number; rows: number; aiFields: { x0: number; x1: number; z0: number; z1: number }[] };
  playerSpawn: { x: number; z: number; a: number };
  dealerLot: { x: number; z: number; a: number }; marketLot: { x: number; z: number; a: number }[]; helipad: { x: number; z: number };
  bounds: { x0: number; x1: number; z0: number; z1: number };
  roadSegments: { ax: number; az: number; bx: number; bz: number; w: number; kind: RoadKind }[];
}

const SIGN: Record<string, string> = {
  shop24: 'Магазин 24/7', supermarket: 'Супермаркет «Лукошко»', cafe: 'Кафе', pharmacy: 'Аптека', gunshop: 'Оружейный «Арсенал»', clothes: 'Одежда «Мода»',
  barber: 'Парикмахерская', mall: 'ТЦ «Орбита»', dealer: 'Автосалон «Драйв»', market: 'Авторынок', service: 'Автосервис и тюнинг', gas: 'АЗС',
  police: 'Полиция', hospital: 'Больница', fire: 'Пожарная часть', cityhall: 'Мэрия', bank: 'Банк', vshop: 'Сельмаг', vadmin: 'Администрация',
  checkpoint: 'Проходная завода', office: 'Бизнес-центр «ЛосТех»', scootershop: 'Электросамокаты «Вжух Store»', farm: 'Агрохолдинг «Нива»', warehouse: 'Склад деталей', fishshop: 'Рыболовный магазин «Поплавок»',
};

export function generateLayout(): WorldLayout {
  const rng = new RNG(WORLD_SEED);
  const nodes: RNode[] = [];
  const edges: REdge[] = [];
  const buildings: Building[] = [];
  const props: Prop[] = [];
  const colliders: Box[] = [];
  const kiosks: Kiosk[] = [];
  const villages: Village[] = [];
  const staticVehicles: StaticVehicle[] = [];
  const bridges: WorldLayout['bridges'] = [];
  const garages: Garage[] = [];
  const lots: WorldLayout['lots'] = []; const parkades: WorldLayout['parkades'] = [];
  const truckDests: WorldLayout['truckDests'] = [];
  const parked: StaticVehicle[] = []; const parkedLot: StaticVehicle[] = []; const bazaarSlots: WorldLayout['bazaarSlots'] = []; const vendors: WorldLayout['vendors'] = [];
  const parks: WorldLayout['parks'] = [];
  const blocks: WorldLayout['blocks'] = [];

  // ---------- Дорожный граф: город ----------
  const cid = (i: number, j: number) => j * (N + 1) + i;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const interior = i > 0 && j > 0 && i < N && j < N;
    nodes.push({ id: nodes.length, x: i * CELL, z: j * CELL, light: interior, gi: i, gj: j });
  }
  const addEdge = (a: number, b: number, kind: RoadKind, w: number) => { edges.push({ id: edges.length, a, b, kind, w }); };
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    if (i < N) addEdge(cid(i, j), cid(i + 1, j), j === AVENUE_J ? 'avenue' : 'city', ROAD_W);
    if (j < N) addEdge(cid(i, j), cid(i, j + 1), 'city', ROAD_W);
  }
  const addNode = (x: number, z: number) => { nodes.push({ id: nodes.length, x, z, light: false }); return nodes.length - 1; };
  /** проложить дорогу по точкам от существующего узла; возвращает id узлов */
  const addRoad = (start: number, pts: [number, number][], kind: RoadKind, w: number, step = 70): number[] => {
    const ids = [start];
    let prev = start;
    for (const [px, pz] of pts) {
      const p = nodes[prev];
      const L = Math.hypot(px - p.x, pz - p.z);
      const k = Math.max(1, Math.ceil(L / step));
      for (let s = 1; s <= k; s++) {
        const id = addNode(p.x + ((px - p.x) * s) / k, p.z + ((pz - p.z) * s) / k);
        addEdge(prev, id, kind, w);
        prev = id; ids.push(id);
      }
    }
    return ids;
  };

  // ---------- Река и пляж ----------
  const riverCenter = (z: number) => -310 + 22 * Math.sin(z / 260);
  const riverHalf = 34;
  const bankE = (z: number) => riverCenter(z) + riverHalf;

  // ---------- Блоки города ----------
  const parkSet = new Set(['3,3', '14,13', '4,14', '12,3', '8,15', '16,7']);
  type Spec = { kind: BKind; i: number; j: number; q: number | 'full'; name?: string };
  const specials: Spec[] = [];
  const S = (kind: BKind, i: number, j: number, q: number | 'full') => { assertBlock(i, j, kind); specials.push({ kind, i, j, q }); };
  S('parking', 6, 13, 'full'); S('parking', 13, 5, 'full'); S('parkade', 11, 7, 'full'); S('garages', 1, 5, 'full'); S('garages', 16, 11, 'full'); S('storage', 17, 12, 'full');
  S('office', 10, 10, 0); S('scootershop', 7, 7, 1);
  S('mall', 10, 9, 'full'); S('cityhall', 8, 8, 'full'); S('dealer', 15, 9, 'full'); S('market', 2, 15, 'full'); S('market', 16, 14, 'full');
  S('bank', 9, 8, 0); S('police', 6, 9, 1); S('police', 14, 4, 2); S('hospital', 11, 12, 0); S('hospital', 3, 6, 3); S('fire', 7, 12, 1);
  S('gunshop', 3, 10, 0); S('gunshop', 14, 12, 1); S('gunshop', 10, 3, 2);
  S('service', 5, 3, 0); S('service', 12, 15, 1); S('service', 16, 2, 3);
  S('clothes', 7, 6, 2); S('clothes', 11, 14, 0); S('barber', 8, 11, 3);
  S('cafe', 6, 7, 0); S('cafe', 9, 5, 1); S('cafe', 13, 8, 2); S('cafe', 4, 9, 1); S('cafe', 10, 16, 0);
  S('pharmacy', 7, 10, 2); S('pharmacy', 12, 6, 1); S('pharmacy', 5, 15, 0);
  S('shop24', 2, 2, 0); S('shop24', 6, 4, 1); S('shop24', 10, 7, 3); S('shop24', 13, 11, 0); S('shop24', 4, 12, 2); S('shop24', 15, 15, 1); S('shop24', 1, 9, 2); S('shop24', 9, 13, 1);
  S('supermarket', 4, 8, 0); S('supermarket', 13, 10, 3);
  S('gas', 0, 7, 2); S('gas', 17, 9, 1); S('gas', 9, 0, 0); S('gas', 8, 17, 3);
  // магазины внутри города: с шоссе часть точек переехала сюда
  S('clothes', 5, 12, 1); S('clothes', 13, 13, 2); S('clothes', 2, 7, 3); S('clothes', 17, 6, 0);
  S('supermarket', 7, 14, 0); S('supermarket', 15, 7, 3); S('supermarket', 2, 11, 1); S('supermarket', 9, 16, 2);
  S('shop24', 17, 4, 0); S('shop24', 0, 12, 2); S('shop24', 11, 1, 3); S('shop24', 13, 16, 2); S('shop24', 5, 2, 1);
  S('pharmacy', 15, 3, 2); S('pharmacy', 9, 10, 1); S('pharmacy', 3, 14, 3);
  S('barber', 5, 4, 2); S('barber', 12, 13, 0);
  S('fishshop', 2, 5, 0); S('fishshop', 16, 10, 2);
  // главное шоссе: вдоль него магазины, автосалоны и автомеханики
  {
    const taken = new Set(specials.map((x) => (x.q === 'full' ? `${x.i},${x.j}` : `${x.i},${x.j},${x.q}`)));
    const fullB = new Set(specials.filter((x) => x.q === 'full').map((x) => `${x.i},${x.j}`));
    // на шоссе — только автосервисы, салоны и заправки: розницу перенесли в город
    const cycle: [BKind, string][] = [['service', 'Автомеханик «Гайка»'], ['dealer', 'Автосалон «Трасса»'], ['gas', 'АЗС «Трасса»'], ['service', 'Тюнинг «Нитро»'],
      ['dealer', 'Автосалон «Магистраль»'], ['cafe', 'Кафе «Шоссе»'], ['dealer', 'Автосалон «Колесо»'], ['service', 'Автомеханик «Поршень»']];
    let ci = 0;
    for (let i = 0; i < N; i++) for (const [bj, qs] of [[AVENUE_J - 1, [2, 3]], [AVENUE_J, [0, 1]]] as const) {
      if (i % 4 !== 1) continue; // заметно меньше точек вдоль шоссе
      if (fullB.has(`${i},${bj}`) || parkSet.has(`${i},${bj}`)) continue;
      for (const q of qs) { if (taken.has(`${i},${bj},${q}`)) continue; const [k, nm] = cycle[ci++ % cycle.length]; S(k, i, bj, q); specials[specials.length - 1].name = nm; taken.add(`${i},${bj},${q}`); }
    }
  }
  const specAt = new Map<string, Spec>();
  for (const s of specials) {
    const key = s.q === 'full' ? `${s.i},${s.j}` : `${s.i},${s.j},${s.q}`;
    if (specAt.has(key)) throw new Error('Дубликат спецучастка ' + key);
    specAt.set(key, s);
  }

  let bid = 0;
  const addBuilding = (b: Omit<Building, 'id'>, noCollider = false) => {
    const bb: Building = { ...b, id: bid++ };
    buildings.push(bb);
    if (!noCollider) colliders.push({ x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, y0: 0, y1: b.h, tag: 'b' + bb.id });
    return bb;
  };
  const addProp = (p: Prop, col?: { w: number; d: number; h: number }) => {
    props.push(p);
    if (col) colliders.push({ x0: p.x - col.w / 2, x1: p.x + col.w / 2, z0: p.z - col.d / 2, z1: p.z + col.d / 2, y0: 0, y1: col.h });
  };
  const fence = (x0: number, z0: number, x1: number, z1: number, h = 1.2, c = '#8b6b4a') => {
    const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
    if (w < 0.05 && d < 0.05) return;
    const p: Prop = { t: 'fence', x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: Math.max(w, 0.08), d: Math.max(d, 0.08), h, c };
    addProp(p, { w: Math.max(w, 0.12), d: Math.max(d, 0.12), h });
  };
  /** забор вокруг участка дома: четыре стороны + проём под калитку со стороны двери */
  const plotFence = (bd: Building, pad = 2.4, h = 1.25, c = '#8b6b4a') => {
    if (bd.fenced) return;
    bd.fenced = true;
    const x0 = bd.x - bd.w / 2 - pad, x1 = bd.x + bd.w / 2 + pad;
    const z0 = bd.z - bd.d / 2 - pad, z1 = bd.z + bd.d / 2 + pad;
    const gate = 2.6;                        // ширина калитки
    const dx = bd.door.x - bd.x, dz = bd.door.z - bd.z;
    const south = dz > Math.abs(dx), north = -dz > Math.abs(dx), east = dx > Math.abs(dz);
    if (north || south) {
      const fz = north ? z0 : z1;
      const gx = Math.min(x1 - gate, Math.max(x0 + gate, bd.door.x));
      fence(x0, fz, gx - gate / 2, fz, h, c); fence(gx + gate / 2, fz, x1, fz, h, c);
      fence(x0, z0, x0, z1, h, c); fence(x1, z0, x1, z1, h, c);
      fence(x0, north ? z1 : z0, x1, north ? z1 : z0, h, c);
      addProp({ t: 'gateleaf', x: gx - gate / 2, z: fz, r: Math.PI / 2, w: gate / 2 + 0.3 });
      addProp({ t: 'gateleaf', x: gx + gate / 2, z: fz, r: -Math.PI / 2, w: gate / 2 + 0.3 });
    } else {
      const fx = east ? x1 : x0;
      const gz = Math.min(z1 - gate, Math.max(z0 + gate, bd.door.z));
      fence(fx, z0, fx, gz - gate / 2, h, c); fence(fx, gz + gate / 2, fx, z1, h, c);
      fence(x0, z0, x1, z0, h, c); fence(x0, z1, x1, z1, h, c);
      fence(east ? x0 : x1, z0, east ? x0 : x1, z1, h, c);
      addProp({ t: 'gateleaf', x: fx, z: gz - gate / 2, r: 0, w: gate / 2 + 0.3 });
      addProp({ t: 'gateleaf', x: fx, z: gz + gate / 2, r: Math.PI, w: gate / 2 + 0.3 });
    }
  };
  const doorFor = (x: number, z: number, w: number, d: number, face: 'n' | 's' | 'e' | 'w') => {
    switch (face) {
      case 'n': return { x, z: z - d / 2 - 1.3, a: Math.PI };
      case 's': return { x, z: z + d / 2 + 1.3, a: 0 };
      case 'e': return { x: x + w / 2 + 1.3, z, a: Math.PI / 2 };
      default: return { x: x - w / 2 - 1.3, z, a: -Math.PI / 2 };
    }
  };

  /** гараж-бокс с воротами на север (−z) */
  const addGarage = (gx: number, gz: number, price: number) => {
    const g: Garage = { id: garages.length, x: gx, z: gz, w: 7, d: 9, price, gateZ: gz - 4.5 };
    garages.push(g);
    colliders.push({ x0: gx - 3.5, x1: gx - 3.2, z0: gz - 4.5, z1: gz + 4.5, y0: 0, y1: 3.2, tag: 'garage' });
    colliders.push({ x0: gx + 3.2, x1: gx + 3.5, z0: gz - 4.5, z1: gz + 4.5, y0: 0, y1: 3.2, tag: 'garage' });
    colliders.push({ x0: gx - 3.5, x1: gx + 3.5, z0: gz + 4.2, z1: gz + 4.5, y0: 0, y1: 3.2, tag: 'garage' });
  };
  const center = (N - 1) / 2;
  let dealerLot = { x: 0, z: 0, a: 0 }; const marketLot: WorldLayout['marketLot'] = []; let helipad = { x: 0, z: 0 };
  let spawn = { x: CELL * 8 + 30, z: CELL * 8 - 4.5, a: Math.PI };

  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const bx0 = i * CELL + ROAD_W / 2, bz0 = j * CELL + ROAD_W / 2;
    const bx1 = bx0 + (CELL - ROAD_W), bz1 = bz0 + (CELL - ROAD_W);
    const ix0 = bx0 + SIDEWALK, iz0 = bz0 + SIDEWALK, ix1 = bx1 - SIDEWALK, iz1 = bz1 - SIDEWALK;
    const dc = Math.max(Math.abs(i - center), Math.abs(j - center));
    let type = 'res';
    if (parkSet.has(`${i},${j}`)) type = 'park';
    else if (dc <= 2.5) type = 'down';
    else if ((i <= 4 && j >= 11) || (i >= 13 && j <= 4) || (i <= 2 && j <= 3) || (i >= 15 && j >= 15)) type = 'private';
    const full = specAt.get(`${i},${j}`);
    if (full) type = full.kind;
    blocks.push({ i, j, type });
    // Тротуар/поверхность квартала
    colliders.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, y0: 0, y1: 0.15, tag: 'curb' });
    // фонари на углах тротуара
    const mz = (bz0 + bz1) / 2, mx = (bx0 + bx1) / 2;
    for (const [lx, lz, lr] of [[bx0 + 0.5, mz - 8, -Math.PI / 2], [bx1 - 0.5, mz + 8, Math.PI / 2], [mx + 8, bz0 + 0.5, Math.PI], [mx - 8, bz1 - 0.5, 0]] as const) addProp({ t: 'lamp', x: lx, z: lz, r: lr }, { w: 0.3, d: 0.3, h: 6 });
    if ((i + j) % 3 === 0) addProp({ t: 'hydrant', x: mx + 2, z: bz1 - 0.5 }, { w: 0.35, d: 0.35, h: 0.8 });
    // деревья вдоль тротуара (только обычные кварталы без въездов к спецучасткам)
    if ((type === 'res' || type === 'down' || type === 'private') && ![0, 1, 2, 3].some((q) => specAt.has(`${i},${j},${q}`))) {
      for (const tt of [-16, -3, 4.5, 16]) {
        const sz = type === 'down' ? 0.75 : 0.9;
        addProp({ t: 'tree', x: mx + tt, z: bz0 + 0.75, h: sz, r: tt }, { w: 0.5, d: 0.5, h: 3 });
        addProp({ t: 'tree', x: mx + tt, z: bz1 - 0.75, h: sz, r: tt + 1 }, { w: 0.5, d: 0.5, h: 3 });
        addProp({ t: 'tree', x: bx0 + 0.75, z: mz + tt, h: sz, r: tt + 2 }, { w: 0.5, d: 0.5, h: 3 });
        addProp({ t: 'tree', x: bx1 - 0.75, z: mz + tt, h: sz, r: tt + 3 }, { w: 0.5, d: 0.5, h: 3 });
      }
    }
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;

    if (type === 'park') {
      parks.push({ x0: ix0, z0: iz0, x1: ix1, z1: iz1 });
      addProp({ t: 'fountain', x: cx, z: cz }, { w: 5, d: 5, h: 0.7 });
      for (let k = 0; k < 14; k++) {
        const tx = rng.range(ix0 + 2, ix1 - 2), tz = rng.range(iz0 + 2, iz1 - 2);
        if (Math.abs(tx - cx) < 3 || Math.abs(tz - cz) < 3) continue; // дорожки
        if (Math.hypot(tx - cx, tz - cz) < 15 && Math.hypot(tx - cx, tz - cz) > 11) continue; // кольцевая дорожка
        addProp({ t: rng.chance(0.3) ? 'pine' : 'tree', x: tx, z: tz, h: rng.range(0.8, 1.3) }, { w: 0.5, d: 0.5, h: 3 });
      }
      for (const [ox, oz, r] of [[6, 2.6, 0], [-6, -2.6, Math.PI], [2.6, -7, Math.PI / 2], [-2.6, 7, -Math.PI / 2]] as const)
        addProp({ t: 'bench', x: cx + ox, z: cz + oz, r }, { w: Math.abs(r) > 0.1 && Math.abs(r) < 3 ? 0.6 : 1.8, d: Math.abs(r) > 0.1 && Math.abs(r) < 3 ? 1.8 : 0.6, h: 0.5 });
      // детская площадка в углу
      addProp({ t: 'swing', x: ix0 + 6, z: iz1 - 5 }, { w: 3.2, d: 0.4, h: 2.2 });
      addProp({ t: 'slide', x: ix0 + 12, z: iz1 - 6 }, { w: 1, d: 3.6, h: 2 });
      addProp({ t: 'sandbox', x: ix0 + 6, z: iz1 - 11 });
      // ларьки у края парка
      for (const [kx, kz, a] of [[ix1 - 3, iz0 + 2.5, Math.PI], [ix0 + 3, iz0 + 2.5, Math.PI]] as const) {
        if (kiosks.length >= KIOSK_TYPES.length * 2) break;
        const ktype = kiosks.length % KIOSK_TYPES.length;
        kiosks.push({ id: kiosks.length, x: kx, z: kz, a, type: ktype });
        addProp({ t: 'kiosk', x: kx, z: kz, r: a, c: KIOSK_TYPES[ktype].color }, { w: 2.6, d: 2.0, h: 2.6 });
      }
      continue;
    }
    if (full) {
      const kind = full.kind;
      if (kind === 'mall') {
        addBuilding({ kind, name: SIGN.mall, x: cx, z: cz - 2, w: 38, d: 34, h: 16, door: doorFor(cx, cz - 2, 38, 34, 's'), facade: 'mall', roof: 'flat', enter: true });
      } else if (kind === 'cityhall') {
        addBuilding({ kind, name: SIGN.cityhall, x: cx, z: cz + 2, w: 30, d: 22, h: 18, door: doorFor(cx, cz + 2, 30, 22, 'n'), facade: 'civic', roof: 'flat', enter: true });
        addProp({ t: 'fountain', x: cx, z: iz0 + 3 }, { w: 5, d: 5, h: 0.7 });
        spawn = { x: cx + 6, z: iz0 + 2.5, a: Math.PI };
      } else if (kind === 'dealer') {
        addBuilding({ kind, name: SIGN.dealer, x: cx, z: iz0 + 8, w: 34, d: 14, h: 8, door: doorFor(cx, iz0 + 8, 34, 14, 's'), facade: 'glass', roof: 'flat', enter: true });
        dealerLot = { x: cx - 8, z: iz1 - 6, a: Math.PI / 2 };
        helipad = { x: cx + 10, z: iz1 - 9 };
      } else if (kind === 'market') {
        addBuilding({ kind, name: SIGN.market, x: ix0 + 5, z: iz0 + 4, w: 8, d: 6, h: 3.5, door: doorFor(ix0 + 5, iz0 + 4, 8, 6, 's'), facade: 'kiosk', roof: 'flat', enter: false });
        const mi = marketLot.length;
        marketLot.push({ x: cx, z: cz, a: 0 });
        // ряд машин продавцов-NPC
        for (let k = 0; k < 4; k++) { const vx = ix0 + 16 + k * 7, vz = iz0 + 9; staticVehicles.push({ type: ['volga', 'lada', 'taiga', 'kolibri'][(k + mi) % 4], x: vx, z: vz, a: 0, tag: 'market-deco' }); vendors.push({ x: vx + 2.3, z: vz + 1.2, a: -Math.PI / 2, car: staticVehicles.length - 1 }); }
        // места для игроков
        for (let k = 0; k < 4; k++) bazaarSlots.push({ id: bazaarSlots.length, x: ix0 + 6 + k * 9.5, z: iz1 - 7, a: Math.PI, market: mi });
      } else if (kind === 'parking') {
        // открытая парковка: 2 ряда мест с проездом посередине, будка и шлагбаум
        const spaces: { x: number; z: number; a: number }[] = [];
        for (let k = 0; k < 14; k++) { spaces.push({ x: ix0 + 3 + k * 2.9, z: iz0 + 4, a: 0 }); spaces.push({ x: ix0 + 3 + k * 2.9, z: iz1 - 4, a: Math.PI }); }
        lots.push({ x0: ix0, z0: iz0, x1: ix1, z1: iz1, spaces, name: 'Парковка' });
        addProp({ t: 'booth', x: ix1 - 2, z: cz }, { w: 2.5, d: 2.5, h: 2.6 });
        addProp({ t: 'barrier', x: ix1 - 2, z: cz + 3, r: 0 });
        const pr = new RNG(i * 31 + j);
        for (const sp of spaces) if (pr.chance(0.55)) parkedLot.push({ type: pr.pick(['volga', 'lada', 'pchelka', 'kolibri', 'taiga', 'bizon', 'drakon', 'volta', 'fenghuang', 'gazelka']), x: sp.x, z: sp.z, a: sp.a + Math.PI / 2 * 0, tag: 'lot' });
      } else if (kind === 'parkade') {
        // многоуровневый паркинг: открытый первый этаж (можно заехать), верхние ярусы
        const w = 40, d = 34, levels = 4;
        addBuilding({ kind: 'parkade', name: 'Паркинг «Ярус»', x: cx, z: cz, w, d, h: levels * 3.2, door: doorFor(cx, cz, w, d, 'n'), facade: 'office', roof: 'flat', enter: false, color: '#1d4ed8' }, true);
        parkades.push({ x: cx, z: cz, w, d, levels });
        for (let px = -1; px <= 1; px++) for (let pz = -1; pz <= 1; pz += 2) { const ccx = cx + px * (w / 2 - 0.5), ccz = cz + pz * (d / 2 - 0.5); colliders.push({ x0: ccx - 0.5, x1: ccx + 0.5, z0: ccz - 0.5, z1: ccz + 0.5, y0: 0, y1: levels * 3.2 }); }
        for (const px of [-10, 10]) colliders.push({ x0: cx + px - 0.4, x1: cx + px + 0.4, z0: cz - 0.4, z1: cz + 0.4, y0: 0, y1: levels * 3.2 });
        colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz + d / 2 - 0.3, z1: cz + d / 2, y0: 0, y1: levels * 3.2 }); // задняя стена
        colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0: 3.0, y1: levels * 3.2, tag: 'slab' });
        const spaces: { x: number; z: number; a: number }[] = [];
        for (let k = 0; k < 12; k++) { spaces.push({ x: cx - w / 2 + 3 + k * 3, z: cz + d / 2 - 4, a: Math.PI }); spaces.push({ x: cx - w / 2 + 3 + k * 3, z: cz - 2.6, a: 0 }); }
        lots.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, spaces, name: 'Паркинг «Ярус»' });
        const pr = new RNG(77);
        for (const sp of spaces) if (pr.chance(0.5) && Math.abs(sp.x - cx + 10) > 1.6 && Math.abs(sp.x - cx - 10) > 1.6) parkedLot.push({ type: pr.pick(['kolibri', 'volta', 'taiga', 'drakon', 'ferrato', 'fenghuang']), x: sp.x, z: sp.z, a: sp.a, tag: 'lot' });
      } else if (kind === 'garages') {
        // гаражный кооператив: 2 ряда боксов, ворота на север
        for (let row = 0; row < 2; row++) for (let k = 0; k < 4; k++) addGarage(ix0 + 9 + k * 8, iz0 + 10.5 + row * 17, 22000 + row * 2000);
        addProp({ t: 'booth', x: ix1 - 2.5, z: iz0 + 2.5 }, { w: 2.5, d: 2.5, h: 2.6 });
      } else if (kind === 'storage') {
        const w1 = addBuilding({ kind: 'warehouse', name: 'Склады «Портовые»', x: cx - 6, z: iz0 + 9, w: 30, d: 14, h: 8, door: doorFor(cx - 6, iz0 + 9, 30, 14, 's'), facade: 'factory', roof: 'flat', enter: false, color: '#475569' });
        addProp({ t: 'dock', x: cx - 6, z: iz0 + 17, w: 28, d: 2.5, h: 1.2 }, { w: 28, d: 2.5, h: 1.2 });
        for (let k = 0; k < 4; k++) addBuilding({ kind: 'warehouse', name: 'Мини-склад', x: ix0 + 4 + k * 8, z: iz1 - 5, w: 7, d: 7, h: 3.2, door: doorFor(ix0 + 4 + k * 8, iz1 - 5, 7, 7, 'n'), facade: 'brick', roof: 'flat', enter: false });
        for (let k = 0; k < 2; k++) addProp({ t: 'container', x: ix1 - 3, z: cz - 3 + k * 7, r: 0, c: ['#b91c1c', '#1d4ed8'][k] }, { w: 2.6, d: 6.2, h: 2.6 });
        truckDests.push({ name: 'Склады «Портовые»', x: w1.x, z: w1.z + 13 });
      }
      continue;
    }
    // Участки (4 четверти)
    const qw = (ix1 - ix0) / 2;
    let playgroundUsed = type === 'res' && (i * 7 + j * 3) % 5 === 0 ? (i + j) % 4 : -1;
    for (let q = 0; q < 4; q++) {
      const qx0 = ix0 + (q % 2) * qw, qz0 = iz0 + Math.floor(q / 2) * qw;
      const north = q < 2;
      const lx = qx0 + qw / 2;
      const sp = specAt.get(`${i},${j},${q}`);
      if (sp) {
        const k = sp.kind;
        const big = k === 'police' || k === 'hospital' || k === 'fire' || k === 'bank' || k === 'supermarket' || k === 'office';
        const w = big ? 18 : 15, d = big ? 15 : 11, h = k === 'office' ? 46 : k === 'hospital' ? 15 : big ? 9 : 5.5;
        const bz = north ? qz0 + 1 + d / 2 : qz0 + qw - 1 - d / 2;
        if (k === 'gas') {
          addBuilding({ kind: k, name: SIGN.gas, x: lx, z: north ? qz0 + 14 : qz0 + 7, w: 10, d: 7, h: 4, door: doorFor(lx, north ? qz0 + 14 : qz0 + 7, 10, 7, north ? 'n' : 's'), facade: 'shop', roof: 'flat', enter: true, color: '#16a34a' });
          const pz = north ? qz0 + 5 : qz0 + qw - 5;
          addProp({ t: 'canopy', x: lx, z: pz, w: 12, d: 7 });
          addProp({ t: 'pump', x: lx - 3, z: pz }, { w: 0.8, d: 0.6, h: 1.6 });
          addProp({ t: 'pump', x: lx + 3, z: pz }, { w: 0.8, d: 0.6, h: 1.6 });
        } else {
          const facade = k === 'office' ? 'glass' : k === 'police' || k === 'hospital' || k === 'fire' || k === 'bank' ? 'civic' : 'shop';
          const colors: Record<string, string> = { office: '#0ea5e9', scootershop: '#16a34a', dealer: '#0ea5e9', shop24: '#e11d48', supermarket: '#f59e0b', cafe: '#a16207', pharmacy: '#10b981', gunshop: '#374151', clothes: '#8b5cf6', barber: '#ec4899', service: '#2563eb', police: '#1e40af', hospital: '#ef4444', fire: '#b91c1c', bank: '#0f766e' };
          addBuilding({ kind: k, name: sp.name ?? SIGN[k] ?? k, x: lx, z: bz, w, d, h, door: doorFor(lx, bz, w, d, north ? 'n' : 's'), facade, roof: 'flat', enter: true, color: colors[k] });
          if (k === 'service') addProp({ t: 'pallet', x: lx + 5, z: north ? bz + d / 2 + 2 : bz - d / 2 - 2 });
        }
        continue;
      }
      if (q === playgroundUsed) {
        addProp({ t: 'swing', x: lx - 4, z: qz0 + qw / 2 }, { w: 3.2, d: 0.4, h: 2.2 });
        addProp({ t: 'slide', x: lx + 4, z: qz0 + qw / 2 }, { w: 1, d: 3.6, h: 2 });
        addProp({ t: 'carousel', x: lx, z: qz0 + qw / 2 + 5 }, { w: 2.6, d: 2.6, h: 0.9 });
        addProp({ t: 'sandbox', x: lx, z: qz0 + qw / 2 - 5 });
        addProp({ t: 'bench', x: lx - 6, z: qz0 + qw / 2 + 6, r: 0 }, { w: 1.8, d: 0.6, h: 0.5 });
        playgroundUsed = -2;
        continue;
      }
      if (type === 'down') {
        const w = rng.range(14, 18), d = rng.range(14, 18), h = rng.range(32, 95) * (1.2 - dc * 0.12);
        const bz = qz0 + qw / 2;
        addBuilding({ kind: 'tower', name: 'Бизнес-центр', x: lx, z: bz, w, d, h, door: doorFor(lx, bz, w, d, north ? 'n' : 's'), facade: rng.pick(['glass', 'glass', 'office']), roof: 'flat', enter: false });
      } else if (type === 'private') {
        const w = 10, d = 8.5;
        const bz = north ? qz0 + 5 + d / 2 : qz0 + qw - 5 - d / 2;
        const b = addBuilding({ kind: 'house', name: 'Частный дом', x: lx, z: bz, w, d, h: 5.5, door: doorFor(lx, bz, w, d, north ? 'n' : 's'), facade: rng.pick(['brick', 'plaster']), roof: 'gable', enter: true, price: Math.round(rng.range(95, 140)) * 1000, forSale: true, color: rng.pick(['#7f1d1d', '#334155', '#365314', '#78350f']) });
        b.cls = 'mid';
        // забор участка с калиткой
        const fz = north ? qz0 + 0.3 : qz0 + qw - 0.3;
        const fzb = north ? qz0 + qw - 0.3 : qz0 + 0.3;
        fence(qx0 + 0.3, fz, lx - 0.8, fz, 1.1, '#e5e5e5'); fence(lx + 0.8, fz, lx + 3, fz, 1.1, '#e5e5e5'); fence(lx + 6.5, fz, qx0 + qw - 0.3, fz, 1.1, '#e5e5e5');
        fence(qx0 + 0.3, Math.min(fz, fzb), qx0 + 0.3, Math.max(fz, fzb), 1.1, '#e5e5e5');
        fence(qx0 + qw - 0.3, Math.min(fz, fzb), qx0 + qw - 0.3, Math.max(fz, fzb), 1.1, '#e5e5e5');
        fence(qx0 + 0.3, fzb, qx0 + qw - 0.3, fzb, 1.1, '#e5e5e5');
        b.fenced = true;
        addProp({ t: 'tree', x: qx0 + 3, z: north ? qz0 + qw - 4 : qz0 + 4, h: 1 }, { w: 0.5, d: 0.5, h: 3 });
      } else {
        const floors = rng.int(4, 9);
        const cls: 'eco' | 'mid' | 'lux' = dc <= 4.5 ? 'lux' : dc <= 6.5 ? 'mid' : 'eco';
        const w = 17, d = 12;
        const bz = north ? qz0 + 1 + d / 2 : qz0 + qw - 1 - d / 2;
        const base = cls === 'lux' ? 180000 : cls === 'mid' ? 62000 : 25000;
        addBuilding({ kind: 'apartment', name: cls === 'lux' ? 'ЖК «Олимп»' : cls === 'mid' ? 'ЖК «Гнездо»' : 'Дом-панелька', x: lx, z: bz, w, d, h: floors * 3.2, door: doorFor(lx, bz, w, d, north ? 'n' : 's'), facade: cls === 'lux' ? 'luxres' : cls === 'mid' ? 'brick' : 'panel', roof: 'flat', enter: true, cls, price: base + Math.round(rng.range(0, base * 0.3) / 500) * 500 });
        const yz = north ? qz0 + qw - 4 : qz0 + 4;
        addProp({ t: rng.chance(0.5) ? 'tree' : 'bush', x: lx + rng.range(-6, 6), z: yz, h: rng.range(0.8, 1.2) }, { w: 0.5, d: 0.5, h: 2 });
        if (rng.chance(0.5)) addProp({ t: 'bench', x: lx + rng.range(-5, 5), z: north ? bz + d / 2 + 1.2 : bz - d / 2 - 1.2, r: 0 }, { w: 1.8, d: 0.6, h: 0.5 });
      }
    }
  }

  // ---------- Внешние дороги ----------
  const roadSeg = (from: number, pts: [number, number][], kind: RoadKind, w: number) => addRoad(from, pts, kind, w);
  // Пляж
  const beachRoad = roadSeg(cid(0, 8), [[-150, 8 * CELL]], 'village', 9);
  // Промзона — шоссе
  // главное шоссе: 3 полосы в каждую сторону (6 × 3.5 м + обочины)
  const hw = roadSeg(cid(N, 9), [[1360, 9 * CELL]], 'highway', 26);
  // логистический терминал у шоссе
  const depot = { x0: 1150, x1: 1300, z0: 410, z1: 515, office: { x: 0, z: 0 }, bays: [] as { x: number; z: number; a: number }[] };
  {
    const hn = hw.find((id) => Math.abs(nodes[id].x - 1220) < 1)!;
    addRoad(hn, [[1220, 470]], 'industrial', 10);
    const D = depot;
    fence(D.x0, D.z0, D.x1, D.z0, 2.2, '#9ca3af'); fence(D.x0, D.z0, D.x0, D.z1, 2.2, '#9ca3af'); fence(D.x1, D.z0, D.x1, D.z1, 2.2, '#9ca3af');
    fence(D.x0, D.z1, 1206, D.z1, 2.2, '#9ca3af'); fence(1234, D.z1, D.x1, D.z1, 2.2, '#9ca3af');
    const w1 = addBuilding({ kind: 'warehouse', name: 'Терминал «Восток»', x: 1180, z: 440, w: 44, d: 22, h: 11, door: doorFor(1180, 440, 44, 22, 's'), facade: 'factory', roof: 'flat', enter: false, color: '#0f766e' });
    addBuilding({ kind: 'warehouse', name: 'Склад №2', x: 1268, z: 440, w: 40, d: 22, h: 10, door: doorFor(1268, 440, 40, 22, 's'), facade: 'factory', roof: 'flat', enter: false, color: '#0f766e' });
    addProp({ t: 'dock', x: 1180, z: 452.5, w: 40, d: 3, h: 1.2 }, { w: 40, d: 3, h: 1.2 });
    addProp({ t: 'dock', x: 1268, z: 452.5, w: 36, d: 3, h: 1.2 }, { w: 36, d: 3, h: 1.2 });
    const off = addBuilding({ kind: 'depot', name: 'Офис «Восток-Транс»', x: 1262, z: 500, w: 12, d: 7, h: 4, door: doorFor(1262, 500, 12, 7, 'w'), facade: 'brick', roof: 'flat', enter: true, color: '#b45309' });
    D.office = { x: off.door.x, z: off.door.z };
    for (let k = 0; k < 3; k++) D.bays.push({ x: 1170 + k * 14, z: 488, a: Math.PI });
    for (let k = 0; k < 2; k++) staticVehicles.push({ type: 'semi', x: 1262 + k * 14 - 7, z: 466, a: 0, tag: 'depot-deco' });
    for (let k = 0; k < 4; k++) addProp({ t: 'container', x: 1156, z: 470 + k * 0, r: Math.PI / 2, c: '#ca8a04' }, { w: 6.2, d: 2.6, h: 2.6 });
    truckDests.push({ name: 'Терминал «Восток»', x: w1.x, z: 478 });
  }
  // ---------- Развязка «Ворота»: кольцо, съезды и путепровод над шоссе ----------
  {
    const RC = { x: 1180, z: 610 }, R = 28;
    const first = nodes.length;
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; addNode(RC.x + Math.cos(a) * R, RC.z + Math.sin(a) * R); }
    for (let k = 0; k < 10; k++) addEdge(first + k, first + (k + 1) % 10, 'industrial', 12);
    // съезд с шоссе на кольцо (северное плечо) и выезд к воротам промзоны (восток)
    const hwNode = hw.find((id) => Math.abs(nodes[id].x - 1150) < 1) ?? hw[hw.length - 1];
    const rampA = addRoad(hwNode, [[1180, 582]], 'industrial', 10);
    addEdge(rampA[rampA.length - 1], first + 8, 'industrial', 12);
    const rampB = addRoad(first + 5, [[1300, 585], [1352, 546]], 'industrial', 10);
    void rampB;
    // путепровод над шоссе: настил, опоры, перила и подсветка
    addProp({ t: 'bridge', x: 1180, z: 610, w: 15, d: 150, h: 6.4, r: 0 });
    addProp({ t: 'bridge', x: 1180, z: 700, w: 15, d: 30, h: 3.2, r: 0 });
    addProp({ t: 'bridge', x: 1180, z: 520, w: 15, d: 30, h: 3.2, r: 0 });
    for (const side of [-1, 1]) addProp({ t: 'bridge_rail', x: 1180 + side * 7.6, z: 610, w: 0.6, d: 150, h: 1.15, c: '#9ca3af' });
    for (const pz of [500, 570, 640, 690]) for (const side of [-1, 1]) addProp({ t: 'pillar', x: 1180 + side * 14.6, z: pz, w: 2.2, d: 2.2, h: 6.4 });
    for (const pz of [515, 705]) for (const side of [-1, 1]) addProp({ t: 'pillar', x: 1180 + side * 6.4, z: pz, w: 1.8, d: 1.8, h: 3.2 });
    for (const pz of [560, 600, 660]) for (const side of [-1, 1]) addProp({ t: 'lamp', x: 1180 + side * 8.4, z: pz, r: side > 0 ? Math.PI : 0 });
    addProp({ t: 'vsign', x: 1140, z: 566, r: 0.4, c: 'Развязка «Ворота»' }, { w: 0.4, d: 0.4, h: 2.6 });
  }

  const gateNode = hw[hw.length - 1];
  const ind = { x0: 1360, x1: 1700, z0: 380, z1: 700 };
  const indMain = addRoad(gateNode, [[1600, 540], [1690, 540]], 'industrial', 10);
  const crossMid = indMain.find((id) => Math.abs(nodes[id].x - 1600) < 1)!;
  addRoad(crossMid, [[1600, 400]], 'industrial', 10);
  addRoad(crossMid, [[1600, 630]], 'industrial', 10);

  // Деревни
  const vdefs: { name: string; from: number; conn: [number, number][]; street: [number, number] }[] = [
    { name: VILLAGE_NAMES[0], from: cid(5, 0), conn: [[300, -300]], street: [540, -300] },
    { name: VILLAGE_NAMES[1], from: cid(4, N), conn: [[240, 1360]], street: [480, 1360] },
    { name: VILLAGE_NAMES[2], from: cid(15, 0), conn: [[900, -330]], street: [1140, -330] },
    { name: VILLAGE_NAMES[3], from: cid(0, 15), conn: [[-140, 900]], street: [-140, 1140] },
    { name: VILLAGE_NAMES[4], from: cid(N, 15), conn: [[1360, 900]], street: [1360, 1140] },
  ];
  const villageHouseSpots: { x: number; z: number; vi: number; ux: number; uz: number; nx: number; nz: number }[] = [];
  for (let vi = 0; vi < vdefs.length; vi++) {
    const v = vdefs[vi];
    const connIds = roadSeg(v.from, v.conn, 'village', 8);
    const sNode = connIds[connIds.length - 1];
    const sx = nodes[sNode].x, sz = nodes[sNode].z;
    roadSeg(sNode, [v.street], 'village', 8, );
    const ex = v.street[0], ez = v.street[1];
    const L = Math.hypot(ex - sx, ez - sz);
    const ux = (ex - sx) / L, uz = (ez - sz) / L;
    // знак у въезда (на обочине коннектора)
    const cn = nodes[connIds[Math.max(0, connIds.length - 2)]];
    const cdx = sx - cn.x, cdz = sz - cn.z, cl = Math.hypot(cdx, cdz) || 1;
    const signX = sx - (cdx / cl) * 25 + (-cdz / cl) * 6.5, signZ = sz - (cdz / cl) * 25 + (cdx / cl) * 6.5;
    addProp({ t: 'vsign', x: signX, z: signZ, r: Math.atan2(-cdx, -cdz), c: v.name }, { w: 0.4, d: 0.4, h: 2.4 });
    villages.push({ name: v.name, sx, sz, ex, ez, signX, signZ, cx: (sx + ex) / 2, cz: (sz + ez) / 2 });
    // Участки вдоль улицы с обеих сторон
    const slots = [30, 56, 82, 108, 134, 160, 186, 212];
    for (let side = -1; side <= 1; side += 2) {
      const nx = -uz * side, nz = ux * side; // нормаль от улицы к участку
      for (let si = 0; si < slots.length; si++) {
        const u = slots[si];
        const px = sx + ux * u, pz = sz + uz * u;
        const role = side === -1 && si === 1 ? 'shop' : side === -1 && si === 4 ? 'admin' : side === 1 && si === 2 ? 'play' : side === 1 && si === 6 ? 'empty' : 'house';
        if (role === 'empty') continue;
        if (role === 'shop' || role === 'admin') {
          const bw = 12, bd = 9, off = 9.5 + bd / 2;
          const bx = px + nx * off, bzz = pz + nz * off;
          const W = Math.abs(ux) > 0.5 ? bw : bd, D = Math.abs(ux) > 0.5 ? bd : bw;
          const face: 'n' | 's' | 'e' | 'w' = nx > 0.5 ? 'w' : nx < -0.5 ? 'e' : nz > 0.5 ? 'n' : 's';
          addBuilding({ kind: role === 'shop' ? 'vshop' : 'vadmin', name: (role === 'shop' ? 'Сельмаг' : 'Администрация') + ' · ' + v.name, x: bx, z: bzz, w: W, d: D, h: role === 'admin' ? 7 : 4.5, door: doorFor(bx, bzz, W, D, face), facade: role === 'shop' ? 'wood' : 'plaster', roof: 'gable', enter: true, village: v.name, color: role === 'shop' ? '#7c2d12' : '#1e3a8a' });
          continue;
        }
        if (role === 'play') {
          const bx = px + nx * 16, bzz = pz + nz * 16;
          addProp({ t: 'swing', x: bx - ux * 4, z: bzz - uz * 4, r: Math.abs(ux) > 0.5 ? 0 : Math.PI / 2 }, Math.abs(ux) > 0.5 ? { w: 3.2, d: 0.4, h: 2.2 } : { w: 0.4, d: 3.2, h: 2.2 });
          addProp({ t: 'slide', x: bx + ux * 4, z: bzz + uz * 4, r: Math.abs(ux) > 0.5 ? 0 : Math.PI / 2 }, Math.abs(ux) > 0.5 ? { w: 1, d: 3.6, h: 2 } : { w: 3.6, d: 1, h: 2 });
          addProp({ t: 'sandbox', x: bx + nx * 6, z: bzz + nz * 6 });
          addProp({ t: 'carousel', x: bx - nx * 4, z: bzz - nz * 4 }, { w: 2.6, d: 2.6, h: 0.9 });
          continue;
        }
        villageHouseSpots.push({ x: px, z: pz, vi, ux, uz, nx, nz });
      }
    }
  }
  // Дома деревни: фасад в 9.5 м от осевой (≈ длина авто от края дороги)
  let vcount = 0;
  for (const s of villageHouseSpots) {
    const { x: px, z: pz, ux, uz, nx, nz } = s;
    const vname = vdefs[s.vi].name;
    const P = (u: number, n: number) => ({ x: px + ux * u + nx * n, z: pz + uz * n * 0 + uz * u + nz * n });
    const alongX = Math.abs(ux) > 0.5;
    const hw2 = 8, hd = 7.5;
    const hc = P(-3, 9.5 + hd / 2);
    const W = alongX ? hw2 : hd, D = alongX ? hd : hw2;
    const face: 'n' | 's' | 'e' | 'w' = nx > 0.5 ? 'w' : nx < -0.5 ? 'e' : nz > 0.5 ? 'n' : 's';
    const idx = vcount++;
    const forSale = true; void idx;
    const b = addBuilding({ kind: 'vhouse', name: 'Дом · ' + vname, x: hc.x, z: hc.z, w: W, d: D, h: 4.8, door: doorFor(hc.x, hc.z, W, D, face), facade: rng.pick(['wood', 'wood', 'plaster']), roof: 'gable', enter: true, village: vname, price: 6000 + Math.round(rng.range(0, 8000) / 250) * 250, forSale, color: rng.pick(['#7f1d1d', '#14532d', '#1e3a8a', '#57534e']) });
    b.cls = 'eco';
    // крыльцо
    const pc = P(-3, 9.5 - 0.7);
    addProp({ t: 'porch', x: pc.x, z: pc.z, r: Math.atan2(-nx, -nz), w: 2.4, d: 1.4 }, alongX ? { w: 2.4, d: 1.4, h: 0.3 } : { w: 1.4, d: 2.4, h: 0.3 });
    // забор: передняя линия на 5.5 с калиткой (u=-3) и воротами (u=+7)
    const f = (u0: number, n0: number, u1: number, n1: number) => { const a = P(u0, n0), c = P(u1, n1); fence(a.x, a.z, c.x, c.z); };
    f(-11, 5.5, -3.8, 5.5); f(-2.2, 5.5, 5.2, 5.5); f(8.8, 5.5, 11, 5.5);
    f(-11, 5.5, -11, 30); f(11, 5.5, 11, 30); f(-11, 30, 11, 30);
    const g1 = P(-3.8, 5.5); addProp({ t: 'gateleaf', x: g1.x, z: g1.z, r: Math.atan2(nx, nz), w: 1.5 });
    const g2 = P(5.2, 5.5); addProp({ t: 'gateleaf', x: g2.x, z: g2.z, r: Math.atan2(nx, nz), w: 1.8 });
    const g3 = P(8.8, 5.5); addProp({ t: 'gateleaf', x: g3.x, z: g3.z, r: Math.atan2(nx, nz) + Math.PI, w: 1.8 });
    b.fenced = true;
    const dw = P(7, 2.75); addProp({ t: 'driveway', x: dw.x, z: dw.z, w: alongX ? 3.6 : 5.5, d: alongX ? 5.5 : 3.6 });
    const dw2 = P(7, 11); addProp({ t: 'driveway', x: dw2.x, z: dw2.z, w: alongX ? 3.6 : 11, d: alongX ? 11 : 3.6 });
    // огород
    b.beds = [];
    for (let k = 0; k < 4; k++) {
      const bc = P(-8 + k * 2.2, 24);
      addProp({ t: 'bed', x: bc.x, z: bc.z, w: alongX ? 1.4 : 7, d: alongX ? 7 : 1.4 });
      b.beds.push({ x: bc.x, z: bc.z });
    }
    // баня
    const bn = P(6.5, 24);
    addProp({ t: 'banya', x: bn.x, z: bn.z, r: Math.atan2(-nx, -nz) }, { w: 4, d: 4, h: 2.8 });
    // мост к городу у дорог исключён — дома стоят только вдоль главной улицы
  }

  // ---------- Промзона ----------
  // забор вокруг с воротами 24 м на западе и 
  const gz0 = 540 - 13, gz1 = 540 + 13;
  fence(ind.x0, ind.z0, ind.x0, gz0, 2.4, '#9ca3af'); fence(ind.x0, gz1, ind.x0, ind.z1, 2.4, '#9ca3af');
  fence(ind.x0, ind.z0, ind.x1, ind.z0, 2.4, '#9ca3af'); fence(ind.x0, ind.z1, ind.x1, ind.z1, 2.4, '#9ca3af');
  fence(ind.x1, ind.z0, ind.x1, ind.z1, 2.4, '#9ca3af');
  addProp({ t: 'booth', x: ind.x0 + 6, z: gz0 - 3 }, { w: 2.5, d: 2.5, h: 2.6 });
  addProp({ t: 'barrier', x: ind.x0 + 2, z: gz0 - 1, r: 0 });
  const cp = addBuilding({ kind: 'checkpoint', name: SIGN.checkpoint, x: ind.x0 + 16, z: gz0 - 9, w: 12, d: 7, h: 4, door: { x: 0, z: 0, a: 0 }, facade: 'brick', roof: 'flat', enter: true, color: '#334155' });
  cp.door = doorFor(cp.x, cp.z, cp.w, cp.d, 's');
  // заводы
  const f1 = addBuilding({ kind: 'factory', name: 'Завод «Сталь»', x: 1420, z: 450, w: 70, d: 50, h: 16, door: doorFor(1420, 450, 70, 50, 's'), facade: 'factory', roof: 'flat', enter: false });
  const f2 = addBuilding({ kind: 'factory', name: 'Завод «Деталь»', x: 1525, z: 455, w: 60, d: 50, h: 13, door: doorFor(1525, 455, 60, 50, 's'), facade: 'factory', roof: 'flat', enter: false });
  for (const fb of [f1, f2]) for (let k = 0; k < 2; k++) addProp({ t: 'chimney', x: fb.x - fb.w / 4 + k * fb.w / 2, z: fb.z - fb.d / 2 + 6, h: fb.h + 18 });
  addProp({ t: 'pipe', x: 1472, z: 425, w: 10, h: 8 });
  const wh = addBuilding({ kind: 'warehouse', name: SIGN.warehouse, x: 1405, z: 585, w: 26, d: 14, h: 6, door: doorFor(1405, 585, 26, 14, 'n'), facade: 'brick', roof: 'flat', enter: false });
  for (let k = 0; k < 2; k++) addBuilding({ kind: 'warehouse', name: 'Мини-склад', x: 1440 + k * 14, z: 588, w: 11, d: 10, h: 5, door: doorFor(1440 + k * 14, 588, 11, 10, 'n'), facade: 'brick', roof: 'flat', enter: false });
  // погрузочная рампа и фуры
  addProp({ t: 'dock', x: 1535, z: 565, w: 48, d: 4, h: 1.2 }, { w: 48, d: 4, h: 1.2 });
  const trucks: { x: number; z: number; a: number }[] = [];
  for (let k = 0; k < 3; k++) { const t = { x: 1517 + k * 16, z: 575.5, a: 0 }; trucks.push(t); staticVehicles.push({ type: 'semi', x: t.x, z: t.z + 3, a: 0, tag: 'factory-truck-' + k }); }
  staticVehicles.push({ type: 'gazelka', x: 1480, z: 600, a: Math.PI / 2, color: '#e5e7eb' });
  staticVehicles.push({ type: 'titan', x: 1665, z: 520, a: 0 });
  for (let k = 0; k < 3; k++) addProp({ t: 'tank', x: 1635 + k * 20, z: 425, w: 7, h: 10 }, { w: 8, d: 8, h: 10 });
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) addProp({ t: 'container', x: 1625 + r * 9, z: 565 + k * 12, r: Math.PI / 2, c: ['#b91c1c', '#1d4ed8', '#15803d', '#ca8a04'][(r + k) % 4] }, { w: 2.6, d: 6.2, h: 2.6 });
  addProp({ t: 'crane', x: 1634, z: 585, w: 34, d: 50, h: 14 });
  colliders.push({ x0: 1615, x1: 1617, z0: 560, z1: 562, y0: 0, y1: 14 }, { x0: 1651, x1: 1653, z0: 560, z1: 562, y0: 0, y1: 14 }, { x0: 1615, x1: 1617, z0: 608, z1: 610, y0: 0, y1: 14 }, { x0: 1651, x1: 1653, z0: 608, z1: 610, y0: 0, y1: 14 });
  // гаражи (покупаемые) — в южной части, вдали от города
  for (let k = 0; k < 6; k++) addGarage(1395 + k * 9, 665, 15000 + k * 1000);

  // ---------- Ферма ----------
  roadSeg(nodes.findIndex((n) => Math.abs(n.x - 1360) < 0.5 && Math.abs(n.z - 1140) < 0.5), [[1470, 1140], [1650, 1140]], 'dirt', 7);
  const farm = { x0: 1395, x1: 1555, z0: 960, z1: 1120, office: { x: 1480, z: 1152 }, combineSpawn: { x: 1405, z: 1130, a: Math.PI / 2 }, cols: 20, rows: 20, aiFields: [{ x0: 1580, x1: 1700, z0: 960, z1: 1120 }, { x0: 1395, x1: 1555, z0: 1180, z1: 1300 }] };
  addBuilding({ kind: 'farm', name: SIGN.farm, x: 1490, z: 1160, w: 14, d: 8, h: 5, door: doorFor(1490, 1160, 14, 8, 'n'), facade: 'wood', roof: 'gable', enter: false, color: '#7c2d12' });
  farm.office = { x: 1490, z: 1154.5 };

  // ---------- Пляж ----------
  const beach = { x0: bankE(480) - 6, x1: -168, z0: 390, z1: 590 };
  for (let k = 0; k < 14; k++) {
    const ux = beach.x0 + 14 + (k % 7) * 9, uz = beach.z0 + 25 + Math.floor(k / 7) * 70 + (k % 2) * 12;
    addProp({ t: 'umbrella', x: ux, z: uz, c: ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#ec4899'][k % 5] }, { w: 0.2, d: 0.2, h: 2.4 });
    addProp({ t: k % 2 ? 'lounger' : 'towel', x: ux + 1.3, z: uz + 1, c: ['#f472b6', '#60a5fa', '#facc15', '#34d399'][k % 4] });
    addProp({ t: 'towel', x: ux - 1.4, z: uz + 0.8, c: ['#fb923c', '#a78bfa', '#22d3ee'][k % 3] });
  }
  addProp({ t: 'lifeguard', x: beach.x0 + 20, z: (beach.z0 + beach.z1) / 2 }, { w: 2, d: 2, h: 3.5 });
  // прогулочные тропы вдоль пляжа (тропинка из плитки), туалеты, души, пальмы
  for (const pz of [beach.z0 + 20, beach.z0 + 52, beach.z0 + 84, beach.z0 + 116, beach.z0 + 148]) {
    addProp({ t: 'bench', x: beach.x1 - 12, z: pz, r: Math.PI / 2 }, { w: 1.8, d: 0.6, h: 0.5 });
    addProp({ t: 'trash', x: beach.x1 - 9, z: pz + 2 }, { w: 0.5, d: 0.5, h: 0.9 });
    if ((pz | 0) % 3 === 0) addProp({ t: 'lamp', x: beach.x1 - 6, z: pz + 5, r: -Math.PI / 2 }, { w: 0.3, d: 0.3, h: 6 });
  }
  for (let k = 0; k < 6; k++) addProp({ t: 'palm', x: beach.x1 - 16 - (k % 2) * 4, z: beach.z0 + 18 + k * 27, h: rng.range(0.9, 1.25) }, { w: 0.6, d: 0.6, h: 6.5 });
  for (let k = 0; k < 3; k++) {
    const tx = beach.x1 - 26 - k * 18, tz = beach.z0 + 40 + k * 20;
    addProp({ t: 'toilet', x: tx, z: tz, r: Math.PI } , { w: 2.4, d: 2.4, h: 2.8 });
    addProp({ t: 'shower', x: tx + 3.2, z: tz }, { w: 0.6, d: 0.6, h: 2.6 });
  }
  addProp({ t: 'volleyball', x: beach.x0 + 34, z: beach.z0 + 118 }, { w: 8, d: 0.3, h: 2.6 });
  addProp({ t: 'volleyball', x: beach.x0 + 34, z: beach.z0 + 126 }, { w: 8, d: 0.3, h: 2.6 });
  // рыболовный магазин «Поплавок» у пляжа
  const fish = addBuilding({ kind: 'fishshop', name: 'Рыболовный магазин «Поплавок»', x: -140, z: 520, w: 12, d: 9, h: 4.2, door: doorFor(-140, 520, 12, 9, 'w'), facade: 'wood', roof: 'gable', enter: true, color: '#0e7490' });
  addProp({ t: 'vsign', x: fish.door.x - 4, z: fish.door.z + 5, r: 0.4, c: 'Поплавок · удочки' }, { w: 0.4, d: 0.4, h: 2.4 });
  addProp({ t: 'bench', x: -160, z: 540, r: 0.3 }, { w: 1.8, d: 0.6, h: 0.5 });
  truckDests.push({ name: 'Поплавок · пляж', x: fish.door.x, z: fish.door.z });

  // ---------- Второй областной мини-город «Приморск» 5×5 ----------
  {
    const MOX = 660, MOZ = 1180, MN = 5, MNAME = 'Приморск';
    const first = nodes.length;
    for (let j = 0; j <= MN; j++) for (let i = 0; i <= MN; i++) addNode(MOX + i * CELL, MOZ + j * CELL);
    const mid = (i: number, j: number) => first + j * (MN + 1) + i;
    for (let j = 0; j <= MN; j++) for (let i = 0; i <= MN; i++) {
      if (i < MN) addEdge(mid(i, j), mid(i + 1, j), 'city', ROAD_W);
      if (j < MN) addEdge(mid(i, j), mid(i, j + 1), 'city', ROAD_W);
    }
    addEdge(cid(11, N), mid(0, 0), 'village', 9); // выезд из Лос-Города на юг
    const parkBlocks = new Set(['2,2', '0,3']);
    for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
      const bx = MOX + i * CELL + ROAD_W / 2, bz = MOZ + j * CELL + ROAD_W / 2;
      const type = parkBlocks.has(`${i},${j}`) ? 'park' : (i + j) % 3 === 0 ? 'private' : 'res';
      blocks.push({ i, j, type, ox: bx, oz: bz });
      const cx = bx + (CELL - ROAD_W) / 2, cz = bz + (CELL - ROAD_W) / 2;
      for (const [lx, lz] of [[bx + 0.8, bz + 0.8], [bx + 46.5, bz + 46.5]] as const) addProp({ t: 'lamp', x: lx, z: lz }, { w: 0.3, d: 0.3, h: 6 });
      if (type === 'park') {
        parks.push({ x0: bx + 3, z0: bz + 3, x1: bx + 45, z1: bz + 45 });
        addProp({ t: 'fountain', x: cx, z: cz }, { w: 4.2, d: 4.2, h: 0.7 });
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          addProp({ t: k % 2 ? 'bench' : 'tree', x: cx + Math.cos(a) * 13, z: cz + Math.sin(a) * 13, r: -a }, k % 2 ? { w: 1.8, d: 0.6, h: 0.5 } : { w: 0.6, d: 0.6, h: 4 });
        }
        continue;
      }
      const special: Record<string, { kind: BKind; name: string; w: number; d: number }> = {
        '0,0': { kind: 'vadmin', name: 'Управа · ' + MNAME, w: 16, d: 10 },
        '2,0': { kind: 'shop24', name: 'Магазин 24/7 · ' + MNAME, w: 14, d: 10 },
        '4,0': { kind: 'fishshop', name: 'Рыболовный «Поплавок» · ' + MNAME, w: 13, d: 9 },
        '1,2': { kind: 'cafe', name: 'Кафе «Причал» · ' + MNAME, w: 13, d: 9 },
        '3,2': { kind: 'clothes', name: 'Одежда «Бриз» · ' + MNAME, w: 14, d: 10 },
        '4,3': { kind: 'supermarket', name: 'Супермаркет · ' + MNAME, w: 17, d: 12 },
        '2,4': { kind: 'police', name: 'Полиция · ' + MNAME, w: 12, d: 9 },
      };
      const sp = special[`${i},${j}`];
      if (sp) {
        const b = addBuilding({ kind: sp.kind, name: sp.name, x: cx, z: cz, w: sp.w, d: sp.d, h: sp.kind === 'police' ? 7 : 6, door: doorFor(cx, cz, sp.w, sp.d, j === 0 ? 's' : 'n'), facade: sp.kind === 'vadmin' ? 'civic' : sp.kind === 'clothes' ? 'plaster' : 'brick', roof: 'gable', enter: true, color: '#0e7490' });
        if (sp.kind === 'vadmin') { b.village = MNAME; truckDests.push({ name: 'Управа · ' + MNAME, x: b.door.x, z: b.door.z }); }
        continue;
      }
      // высотки Приморска: в части кварталов — деловые башни с панорамным видом
      if ((i * 5 + j * 7) % 4 === 0) {
        addBuilding({ kind: 'tower', name: rng.pick(['БЦ «Парус»', 'ЖК «Морской фасад»', 'БЦ «Маяк»']), x: cx, z: cz, w: 18, d: 16, h: rng.range(48, 96), door: doorFor(cx, cz, 18, 16, j % 2 ? 's' : 'n'), facade: rng.pick(['glass', 'glass', 'office']), roof: 'flat', enter: false, color: '#164e63' });
        addProp({ t: 'lamp', x: cx + 10, z: cz + 10 }, { w: 0.3, d: 0.3, h: 6 });
        continue;
      }
      // жилые дома: по два на квартал, часть продаётся
      for (const sx of [-11, 11]) {
        const hx = cx + sx, hz = cz + (j % 2 ? 8 : -8);
        const hb = addBuilding({ kind: 'house', name: 'Дом · ' + MNAME, x: hx, z: hz, w: 10, d: 8.5, h: 5.2, door: doorFor(hx, hz, 10, 8.5, j % 2 ? 's' : 'n'), facade: rng.pick(['plaster', 'brick']), roof: 'gable', enter: true, price: 18000 + Math.round(rng.range(0, 6000) / 500) * 500, forSale: true, color: rng.pick(['#0e7490', '#7f1d1d', '#14532d', '#a16207']) });
        hb.cls = 'eco';
        addProp({ t: 'tree', x: hx + 7, z: hz + 4.5, h: 1.1 }, { w: 0.5, d: 0.5, h: 3 });
      }
    }
  }

  // ---------- Мост через реку и город «Новоград» 10×10 за рекой ----------
  const newCity = { name: 'Новоград', x0: -1020, x1: -420, z0: -180, z1: 420 };
  {
    // подъезд от города к реке и сам мост
    const approach = roadSeg(cid(0, 2), [[-238, 120]], 'village', 10);
    const bridgeA = approach[approach.length - 1];
    const bridgeRoad = roadSeg(bridgeA, [[-320, 120], [-404, 120]], 'village', 10);
    const bridgeB = bridgeRoad[bridgeRoad.length - 1];
    // настил моста: низкая палуба (машина заезжает без прыжка), перила по краям
    bridges.push({ x0: -412, x1: -230, z0: 112, z1: 128, y: 0.42 });
    colliders.push({ x0: -412, x1: -230, z0: 112, z1: 128, y0: 0, y1: 0.42, tag: 'deck' });
    addProp({ t: 'bridge', x: -321, z: 120, w: 182, d: 15.5, h: 0.42 });
    for (const side of [-1, 1]) {
      const rz = 120 + side * 6.4;
      addProp({ t: 'bridge_rail', x: -321, z: rz, w: 182, d: 0.5, h: 1.15, c: '#d6d3d1' });
      for (let k = -7; k <= 7; k++) addProp({ t: 'pillar', x: -321 + k * 12, z: rz, w: 0.5, d: 0.5, h: 0.42 });
      for (let k = -4; k <= 4; k++) addProp({ t: 'lamp', x: -321 + k * 20, z: rz + side * 0.9, r: side > 0 ? Math.PI : 0 }, { w: 0.3, d: 0.3, h: 6 });
    }
    for (let k = 0; k < 3; k++) for (const side of [-1, 1]) addProp({ t: 'pillar', x: -262 - k * 50, z: 120 + side * 7.6, w: 1.6, d: 1.6, h: 1.2 });
    addProp({ t: 'vsign', x: -222, z: 132, r: -Math.PI / 2, c: 'Новоград →' }, { w: 0.4, d: 0.4, h: 2.6 });
    truckDests.push({ name: 'Мост через реку', x: -300, z: 120 });

    // сам город: 10×10 кварталов
    const { name: CNAME, x0: CX, z0: CZ } = newCity;
    const CN = 10;
    const first = nodes.length;
    for (let j = 0; j <= CN; j++) for (let i = 0; i <= CN; i++) addNode(CX + i * CELL, CZ + j * CELL);
    const nid = (i: number, j: number) => first + j * (CN + 1) + i;
    for (let j = 0; j <= CN; j++) for (let i = 0; i <= CN; i++) {
      if (i < CN) addEdge(nid(i, j), nid(i + 1, j), 'city', ROAD_W);
      if (j < CN) addEdge(nid(i, j), nid(i, j + 1), 'city', ROAD_W);
    }
    addEdge(bridgeB, nid(CN, 5), 'city', ROAD_W); // мост входит в город с востока

    const CX0 = CX + CELL * CN;       // восточная кромка города
    const CZ0 = CZ + CELL * 5;
    addProp({ t: 'vsign', x: CX0 - 12, z: CZ0 - 9, r: Math.PI / 2, c: CNAME }, { w: 0.4, d: 0.4, h: 2.8 });

    const parkBlocks = new Set(['1,1', '4,7', '7,2', '2,8']);
    const spec: Record<string, { kind: BKind; name: string; w: number; d: number }> = {
      '2,2': { kind: 'cityhall', name: 'Мэрия · ' + CNAME, w: 18, d: 13 },
      '5,1': { kind: 'supermarket', name: 'Супермаркет · ' + CNAME, w: 17, d: 12 },
      '1,4': { kind: 'cafe', name: 'Кафе «Мост» · ' + CNAME, w: 13, d: 9 },
      '7,5': { kind: 'shop24', name: 'Магазин 24/7 · ' + CNAME, w: 14, d: 10 },
      '8,7': { kind: 'hospital', name: 'Больница · ' + CNAME, w: 18, d: 14 },
      '3,9': { kind: 'fire', name: 'Пожарная часть · ' + CNAME, w: 16, d: 12 },
      '6,8': { kind: 'mall', name: 'ТЦ «Новый берег»', w: 20, d: 15 },
      '9,3': { kind: 'bank', name: 'Банк · ' + CNAME, w: 15, d: 11 },
      '4,3': { kind: 'clothes', name: 'Одежда «Стиль» · ' + CNAME, w: 13, d: 10 },
      '2,6': { kind: 'barber', name: 'Парикмахерская · ' + CNAME, w: 12, d: 9 },
      '8,2': { kind: 'police', name: 'Полиция · ' + CNAME, w: 15, d: 11 },
      '6,4': { kind: 'dealer', name: 'Автосалон «Новоград»', w: 16, d: 12 },
    };
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
      const bx = CX + i * CELL + ROAD_W / 2, bz = CZ + j * CELL + ROAD_W / 2;
      const park = parkBlocks.has(`${i},${j}`);
      const edge = i === 0 || j === 0 || i === CN - 1 || j === CN - 1;
      const centre = i >= 3 && i <= 6 && j >= 3 && j <= 6;
      const type = park ? 'park' : edge ? 'private' : centre ? 'down' : 'res';
      blocks.push({ i, j, type, ox: bx, oz: bz });
      const cx = bx + (CELL - ROAD_W) / 2, cz = bz + (CELL - ROAD_W) / 2;
      for (const [lx, lz] of [[bx + 1, bz + 1], [bx + CELL - ROAD_W - 1, bz + CELL - ROAD_W - 1]] as const) addProp({ t: 'lamp', x: lx, z: lz }, { w: 0.3, d: 0.3, h: 6 });
      if (park) {
        parks.push({ x0: bx + 3, z0: bz + 3, x1: bx + CELL - ROAD_W - 3, z1: bz + CELL - ROAD_W - 3 });
        addProp({ t: 'fountain', x: cx, z: cz }, { w: 4, d: 4, h: 0.7 });
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          addProp({ t: k % 2 ? 'bench' : 'tree', x: cx + Math.cos(a) * 11, z: cz + Math.sin(a) * 11, r: -a }, k % 2 ? { w: 1.8, d: 0.6, h: 0.5 } : { w: 0.6, d: 0.6, h: 4 });
        }
        continue;
      }
      const sp = spec[`${i},${j}`];
      if (sp) {
        const big = sp.kind === 'mall' || sp.kind === 'cityhall' || sp.kind === 'hospital';
        const b = addBuilding({ kind: sp.kind, name: sp.name, x: cx, z: cz, w: sp.w, d: sp.d, h: big ? 12 : 7, door: doorFor(cx, cz, sp.w, sp.d, j === 0 ? 's' : 'n'), facade: big ? 'civic' : 'shop', roof: 'flat', enter: true, color: '#1e3a8a' });
        if (sp.kind === 'cityhall') { b.village = CNAME; truckDests.push({ name: 'Мэрия · ' + CNAME, x: b.door.x, z: b.door.z }); }
        if (sp.kind === 'supermarket' || sp.kind === 'mall') truckDests.push({ name: sp.name, x: b.door.x, z: b.door.z });
        continue;
      }
      if (type === 'down') {
        const h = rng.range(42, 104);
        if ((i + j) % 3 === 1) {
          addBuilding({ kind: 'tower', name: rng.pick(['БЦ «Нева»', 'ЖК «Берег»', 'БЦ «Форум»']), x: cx, z: cz, w: rng.range(16, 20), d: rng.range(15, 19), h, door: doorFor(cx, cz, 18, 16, 'n'), facade: rng.pick(['glass', 'office']), roof: 'flat', enter: false, color: '#1e3a8a' });
        } else {
          const floors = rng.int(7, 14);
          addBuilding({ kind: 'apartment', name: 'ЖК «Новоград»', x: cx, z: cz, w: 18, d: 13, h: floors * 3.2, door: doorFor(cx, cz, 18, 13, 's'), facade: rng.pick(['brick', 'panel', 'luxres']), roof: 'flat', enter: true, cls: 'mid', price: 52000 });
        }
        addProp({ t: 'tree', x: cx - 14, z: cz + 12, h: 1.1 }, { w: 0.5, d: 0.5, h: 3 });
        continue;
      }
      if (type === 'private') {
        const hx = cx + (j % 2 ? 8 : -8) * 0, hz = cz;
        const hb = addBuilding({ kind: 'house', name: 'Дом · ' + CNAME, x: hx, z: hz, w: 10, d: 8.5, h: 5.2, door: doorFor(hx, hz, 10, 8.5, j === CN - 1 ? 's' : 'n'), facade: rng.pick(['brick', 'plaster']), roof: 'gable', enter: true, price: 24000 + Math.round(rng.range(0, 9000) / 500) * 500, forSale: true, color: rng.pick(['#7f1d1d', '#334155', '#365314', '#78350f']) });
        hb.cls = 'mid';
        plotFence(hb, 2.6, 1.3, '#e5e5e5');
        addProp({ t: 'tree', x: hx + 9, z: hz + 9, h: 1.2 }, { w: 0.5, d: 0.5, h: 3 });
        staticVehicles.push({ type: rng.pick(['volga', 'lada', 'taiga']), x: hx + 2, z: hz + 13, a: Math.PI, tag: 'novo-deco' });
        continue;
      }
      // «res» — городские дома по два на квартал, с заборами и двориками
      for (const sx of [-11, 11]) {
        const hx = cx + sx, hz = cz + (j % 2 ? 7 : -7);
        const hb = addBuilding({ kind: 'house', name: 'Дом · ' + CNAME, x: hx, z: hz, w: 10, d: 8, h: 5.4, door: doorFor(hx, hz, 10, 8, j % 2 ? 's' : 'n'), facade: rng.pick(['plaster', 'brick', 'wood']), roof: 'gable', enter: true, price: 19000 + Math.round(rng.range(0, 7000) / 500) * 500, forSale: true, color: rng.pick(['#7f1d1d', '#14532d', '#57534e']) });
        hb.cls = 'eco';
        plotFence(hb, 2.4, 1.2, rng.pick(['#e5e5e5', '#8b6b4a', '#a8a29e']));
      }
    }
  }

  // ---------- Деревня «Кленовка» с большой фермой ----------
  {
    const VNAME = 'Кленовка';
    const road = roadSeg(cid(10, N), [[600, 1670]], 'village', 8);
    const sNode = road[road.length - 1];
    roadSeg(sNode, [[600, 1820]], 'village', 8);      // главная улица деревни (с севера на юг)
    roadSeg(sNode, [[470, 1670]], 'dirt', 7);          // просёлок к ферме
    roadSeg(sNode, [[600, 1600]], 'dirt', 7);          // выезд на трассу
    villages.push({ name: VNAME, sx: 600, sz: 1670, ex: 600, ez: 1820, signX: 576, signZ: 1654, cx: 600, cz: 1395 });
    addProp({ t: 'vsign', x: 576, z: 1654, r: 0.2, c: VNAME }, { w: 0.4, d: 0.4, h: 2.4 });
    // колодец и лавочки в центре деревни
    addProp({ t: 'well', x: 588, z: 1700 }, { w: 2, d: 2, h: 2.4 });
    addProp({ t: 'bench', x: 584, z: 1712, r: Math.PI / 2 }, { w: 1.8, d: 0.6, h: 0.5 });
    addProp({ t: 'bench', x: 616, z: 1712, r: -Math.PI / 2 }, { w: 1.8, d: 0.6, h: 0.5 });
    // дома вдоль улицы: фасад в 9.5 м от осевой, у каждого — забор, огород, сарай и живность
    const slots = [25, 52, 79, 106, 133];
    for (let si = 0; si < slots.length; si++) {
      for (const side of [-1, 1]) {
        if (side === 1 && si === 2) {
          const sh = addBuilding({ kind: 'vshop', name: 'Сельмаг · ' + VNAME, x: 600 + side * (9.5 + 5.5), z: 1670 + slots[si], w: 11, d: 9, h: 4.5, door: doorFor(600 + side * 15, 1670 + slots[si], 11, 9, 'w'), facade: 'wood', roof: 'gable', enter: true, village: VNAME, color: '#7c2d12' });
          plotFence(sh, 2.2, 1.2, '#8b6b4a');
          continue;
        }
        if (side === 1 && si === 4) {
          const ad = addBuilding({ kind: 'vadmin', name: 'Администрация · ' + VNAME, x: 600 + side * 16, z: 1670 + slots[si], w: 12, d: 9, h: 7, door: doorFor(600 + side * 16, 1670 + slots[si], 12, 9, 'w'), facade: 'plaster', roof: 'gable', enter: true, village: VNAME, color: '#1e3a8a' });
          plotFence(ad, 2.4, 1.3, '#e5e5e5');
          continue;
        }
        const hx = 600 + side * 15.5, hz = 1670 + slots[si];
        const hb = addBuilding({ kind: 'vhouse', name: 'Дом · ' + VNAME, x: hx, z: hz, w: 8, d: 10, h: 4.8, door: doorFor(hx, hz, 8, 10, side < 0 ? 'w' : 'e'), facade: rng.pick(['wood', 'wood', 'plaster']), roof: 'gable', enter: true, village: VNAME, price: 7000 + Math.round(rng.range(0, 6000) / 250) * 250, forSale: si % 2 === 0, color: rng.pick(['#7f1d1d', '#14532d', '#57534e']) });
        hb.cls = 'eco';
        plotFence(hb, 2.6, 1.15, rng.pick(['#8b6b4a', '#a8a29e', '#e5e5e5']));
        // огород за домом, поленница, куры во дворе
        const gx = hx + side * 8;
        for (let k = 0; k < 3; k++) addProp({ t: 'bed', x: gx, z: hz - 6 + k * 3.2, w: 2.2, d: 2.6 });
        for (let k = 0; k < 4; k++) addProp({ t: 'chicken', x: hx + side * 3.5 + (k % 2) * 1.6, z: hz + 5 + Math.floor(k / 2) * 1.8, r: k * 1.2 });
        addProp({ t: 'hay', x: hx + side * 6.4, z: hz + 7.4 }, { w: 1.6, d: 1.6, h: 1.2 });
        addProp({ t: 'tree', x: hx + side * 9, z: hz - 9, h: 1.1 }, { w: 0.5, d: 0.5, h: 3.4 });
      }
    }
    // ферма «Кленовка»: периметр с воротами, амбар, курятник, дом фермера, силосные башни и техника
    const F = { x0: 378, x1: 566, z0: 1698, z1: 1834 };
    fence(F.x0, F.z0, F.x0, F.z1, 1.4, '#8b6b4a'); fence(F.x0, F.z0, 455, F.z0, 1.4, '#8b6b4a');
    fence(495, F.z0, F.x1, F.z0, 1.4, '#8b6b4a'); fence(F.x0, F.z1, F.x1, F.z1, 1.4, '#8b6b4a');
    fence(F.x1, F.z0, F.x1, F.z1, 1.4, '#8b6b4a');
    addProp({ t: 'gateleaf', x: 456, z: F.z0, r: 0, w: 2.4 }); addProp({ t: 'gateleaf', x: 494, z: F.z0, r: Math.PI, w: 2.4 });
    const barn = addBuilding({ kind: 'barn', name: 'Амбар · Кленовка', x: 414, z: 1726, w: 26, d: 14, h: 8.5, door: doorFor(414, 1726, 26, 14, 'e'), facade: 'wood', roof: 'gable', enter: false, color: '#7f1d1d' });
    addBuilding({ kind: 'coop', name: 'Курятник · Кленовка', x: 452, z: 1770, w: 10, d: 8, h: 3.8, door: doorFor(452, 1770, 10, 8, 'w'), facade: 'wood', roof: 'gable', enter: false, color: '#78350f' });
    addBuilding({ kind: 'farm', name: 'Дом фермера · Кленовка', x: 404, z: 1796, w: 13, d: 8, h: 4.4, door: doorFor(404, 1796, 13, 8, 'e'), facade: 'plaster', roof: 'gable', enter: false, color: '#15803d' });
    addBuilding({ kind: 'livestock', name: 'Коровник · Кленовка', x: 500, z: 1806, w: 22, d: 11, h: 6.2, door: doorFor(500, 1806, 22, 11, 'n'), facade: 'wood', roof: 'gable', enter: false, color: '#7f1d1d' });
    for (const [sx, sz] of [[540, 1724], [540, 1752]] as const) addProp({ t: 'silo', x: sx, z: sz, w: 7, d: 7, h: 13 }, { w: 7, d: 7, h: 13 });
    for (let k = 0; k < 3; k++) addProp({ t: 'trough', x: 484 + k * 7, z: 1786, r: 0 }, { w: 2.6, d: 0.8, h: 0.7 });
    for (let k = 0; k < 10; k++) addProp({ t: 'cow', x: 484 + (k % 5) * 7, z: 1756 + Math.floor(k / 5) * 7, r: (k * 1.3) % 6.28 }, { w: 1.0, d: 1.0, h: 1.5 });
    for (let k = 0; k < 14; k++) addProp({ t: 'chicken', x: 462 + (k % 5) * 2.2, z: 1756 + Math.floor(k / 5) * 2.4, r: k });
    for (let k = 0; k < 10; k++) addProp({ t: 'hay', x: 386 + (k % 5) * 3, z: 1744 + Math.floor(k / 5) * 3 }, { w: 1.6, d: 1.6, h: 1.2 });
    addProp({ t: 'pallet', x: 476, z: 1820 }, { w: 1.2, d: 1.2, h: 0.4 });
    addProp({ t: 'trailer', x: 414, z: 1818, r: Math.PI / 2, w: 8, h: 3.2 }, { w: 8, d: 3, h: 3 });
    addProp({ t: 'well', x: 490, z: 1718 }, { w: 2, d: 2, h: 2.4 });
    staticVehicles.push({ type: 'combine', x: 424, z: 1752, a: Math.PI / 2, tag: 'farm-combine' });
    staticVehicles.push({ type: 'titan', x: 450, z: 1740, a: 0, color: '#15803d', tag: 'farm-truck' });
    staticVehicles.push({ type: 'quad', x: 468, z: 1814, a: Math.PI, tag: 'farm-quad' });
    // поля: грядки пшеницы и подсолнухов
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
      addProp({ t: 'crop', x: 388 + c * 44, z: 1774 + r * 8, w: 40, d: 6, c: r % 2 ? '#d9b44a' : '#8fbf4a' }, r % 2 ? { w: 40, d: 6, h: 0.9 } : undefined);
    }
    for (let k = 0; k < 10; k++) addProp({ t: 'bush', x: 330 + (k % 5) * 8, z: 1712 + Math.floor(k / 5) * 96, h: 1 });
    truckDests.push({ name: 'Ферма «Кленовка»', x: 470, z: 1670 });
    truckDests.push({ name: 'Сельмаг · Кленовка', x: 616, z: 1749 });
    void barn;
  }

  // ---------- Подъезд к деревне Сосновка (второй мини-город больше не строим) ----------
  let zCityNode = -1;
  {
    const conn = roadSeg(cid(N, 15), [[1080, 1140], [1080, 1440]], 'village', 9);
    zCityNode = conn[conn.length - 1];
  }

  // ---------- Деревня «Сосновка» с большой фермой на юге ----------
  {
    const VNAME = 'Сосновка';
    const road = roadSeg(zCityNode, [[1110, 1560]], 'village', 8);
    const sNode = road[road.length - 1];
    roadSeg(sNode, [[1050, 1560]], 'village', 8);      // улица деревни (с запада на восток)
    const eastRoad = roadSeg(sNode, [[1290, 1560]], 'village', 8);
    roadSeg(eastRoad[eastRoad.length - 1], [[1300, 1640]], 'dirt', 7);   // просёлок к ферме
    villages.push({ name: VNAME, sx: 1050, sz: 1560, ex: 1290, ez: 1560, signX: 1120, signZ: 1544, cx: 1170, cz: 1560 });
    addProp({ t: 'vsign', x: 1120, z: 1544, r: 0.2, c: VNAME }, { w: 0.4, d: 0.4, h: 2.4 });
    for (let k = 0; k < 4; k++) for (const side of [-1, 1]) addProp({ t: 'lamp', x: 1060 + k * 62, z: 1560 + side * 7.4, r: side > 0 ? 0 : Math.PI });
    addProp({ t: 'well', x: 1112, z: 1572 }, { w: 2, d: 2, h: 2.4 });
    addProp({ t: 'bench', x: 1096, z: 1576, r: Math.PI / 2 }, { w: 1.8, d: 0.6, h: 0.5 });
    for (let k = 0; k < 4; k++) {
      for (const side of [-1, 1]) {
        const hx = 1072 + k * 54, hz = 1560 + side * 14;
        const hb = addBuilding({ kind: 'vhouse', name: 'Дом · ' + VNAME, x: hx, z: hz, w: 10, d: 8.5, h: 5, door: doorFor(hx, hz, 10, 8.5, side > 0 ? 's' : 'n'), facade: rng.pick(['wood', 'wood', 'plaster']), roof: 'gable', enter: true, village: VNAME, price: 9000 + Math.round(rng.range(0, 7000) / 250) * 250, forSale: k % 2 === 0, color: rng.pick(['#7f1d1d', '#14532d', '#57534e']) });
        hb.cls = 'eco';
        plotFence(hb, 2.6, 1.2, rng.pick(['#8b6b4a', '#a8a29e', '#e5e5e5']));
        for (let g = 0; g < 3; g++) addProp({ t: 'bed', x: hx + 6.5, z: hz - 3 + g * 3, w: 1.6, d: 2.4 });
        for (let c = 0; c < 4; c++) addProp({ t: 'chicken', x: hx - 5 + (c % 2) * 1.6, z: hz + side * 6 + Math.floor(c / 2) * 1.6, r: c });
      }
    }
    // ферма «Сосновка»: амбар, курятник, коровник, силосы, техника и поля
    const F = { x0: 1230, x1: 1400, z0: 1620, z1: 1770 };
    fence(F.x0, F.z0, F.x0, F.z1, 1.4, '#8b6b4a');
    fence(F.x0, F.z0, 1286, F.z0, 1.4, '#8b6b4a'); fence(1314, F.z0, F.x1, F.z0, 1.4, '#8b6b4a');
    fence(F.x0, F.z1, F.x1, F.z1, 1.4, '#8b6b4a'); fence(F.x1, F.z0, F.x1, F.z1, 1.4, '#8b6b4a');
    addBuilding({ kind: 'barn', name: 'Амбар · Сосновка', x: 1280, z: 1650, w: 24, d: 13, h: 8, door: doorFor(1280, 1650, 24, 13, 'e'), facade: 'wood', roof: 'gable', enter: false, color: '#7f1d1d' });
    addBuilding({ kind: 'coop', name: 'Курятник · Сосновка', x: 1330, z: 1700, w: 9, d: 8, h: 3.6, door: doorFor(1330, 1700, 9, 8, 'w'), facade: 'wood', roof: 'gable', enter: false, color: '#78350f' });
    addBuilding({ kind: 'livestock', name: 'Коровник · Сосновка', x: 1280, z: 1726, w: 24, d: 11, h: 6, door: doorFor(1280, 1726, 24, 11, 'n'), facade: 'wood', roof: 'gable', enter: false, color: '#7f1d1d' });
    for (const [sx, sz] of [[1370, 1634], [1370, 1662]] as const) addProp({ t: 'silo', x: sx, z: sz, w: 7, d: 7, h: 13 }, { w: 7, d: 7, h: 13 });
    for (let k = 0; k < 3; k++) addProp({ t: 'trough', x: 1252 + k * 7, z: 1712 }, { w: 2.6, d: 0.8, h: 0.7 });
    for (let k = 0; k < 8; k++) addProp({ t: 'cow', x: 1252 + (k % 4) * 7, z: 1684 + Math.floor(k / 4) * 7, r: (k * 1.7) % 6.28 }, { w: 1.0, d: 1.0, h: 1.5 });
    for (let k = 0; k < 12; k++) addProp({ t: 'chicken', x: 1312 + (k % 5) * 2.2, z: 1680 + Math.floor(k / 5) * 2.4, r: k });
    for (let k = 0; k < 8; k++) addProp({ t: 'hay', x: 1240 + (k % 4) * 3, z: 1648 + Math.floor(k / 4) * 3 }, { w: 1.6, d: 1.6, h: 1.2 });
    addProp({ t: 'trailer', x: 1252, z: 1752, r: Math.PI / 2, w: 8, h: 3.2 }, { w: 8, d: 3, h: 3 });
    addProp({ t: 'well', x: 1330, z: 1736 }, { w: 2, d: 2, h: 2.4 });
    staticVehicles.push({ type: 'combine', x: 1264, z: 1612, a: 0, tag: 'sosnovka-combine' });
    staticVehicles.push({ type: 'titan', x: 1300, z: 1614, a: Math.PI, color: '#15803d', tag: 'sosnovka-truck' });
    // поля пшеницы и подсолнухов
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      addProp({ t: 'crop', x: 1244 + c * 46, z: 1662 + r * 8, w: 42, d: 6, c: r % 2 ? '#d9b44a' : '#8fbf4a' }, r % 2 ? { w: 42, d: 6, h: 0.9 } : undefined);
    }
    truckDests.push({ name: 'Ферма «Сосновка»', x: 1290, z: 1636 });
    truckDests.push({ name: 'Сосновка · ферма', x: 1290, z: 1636 });
  }

  // ---------- животноводческая ферма «Зорька» ----------
  const livestock: WorldLayout['livestock'] = { office: { x: 0, z: 0 }, feed: { x: 1612, z: 1178 }, troughs: [], coop: { x: 0, z: 0 }, crate: { x: 1662, z: 1166 } };
  {
    const fc = '#8b6b4a';
    fence(1600, 1152, 1640, 1152, 1.3, fc); fence(1652, 1152, 1700, 1152, 1.3, fc); fence(1600, 1152, 1600, 1250, 1.3, fc); fence(1700, 1152, 1700, 1250, 1.3, fc); fence(1600, 1250, 1700, 1250, 1.3, fc);
    fence(1618, 1196, 1668, 1196, 1.1, fc); // загон коров
    addBuilding({ kind: 'barn', name: 'Коровник «Зорька»', x: 1632, z: 1222, w: 32, d: 16, h: 7.5, door: doorFor(1632, 1222, 32, 16, 'n'), facade: 'wood', roof: 'gable', enter: false, color: '#7f1d1d' });
    const coop = addBuilding({ kind: 'coop', name: 'Курятник', x: 1684, z: 1188, w: 9, d: 8, h: 3.6, door: doorFor(1684, 1188, 9, 8, 'w'), facade: 'wood', roof: 'gable', enter: false, color: '#78350f' });
    livestock.coop = { x: coop.door.x, z: coop.door.z };
    const off = addBuilding({ kind: 'livestock', name: 'Ферма «Зорька»', x: 1622, z: 1164, w: 10, d: 6, h: 3.6, door: doorFor(1622, 1164, 10, 6, 'n'), facade: 'plaster', roof: 'gable', enter: false, color: '#15803d' });
    livestock.office = { x: off.door.x, z: off.door.z };
    for (let k = 0; k < 3; k++) { const t = { x: 1628 + k * 15, z: 1200 }; livestock.troughs.push({ x: t.x, z: t.z - 1.4 }); addProp({ t: 'trough', x: t.x, z: t.z }, { w: 2.6, d: 0.8, h: 0.7 }); }
    for (let k = 0; k < 6; k++) addProp({ t: 'cow', x: 1624 + k * 8, z: 1206 + (k % 2) * 4, r: (k * 1.3) % 6.28 }, { w: 1.0, d: 1.0, h: 1.5 });
    for (let k = 0; k < 10; k++) addProp({ t: 'chicken', x: 1676 + (k % 4) * 2.2, z: 1172 + Math.floor(k / 4) * 2.4, r: k });
    for (let k = 0; k < 4; k++) addProp({ t: 'hay', x: 1608 + (k % 2) * 3, z: 1172 + Math.floor(k / 2) * 3 }, { w: 1.6, d: 1.6, h: 1.2 });
    addProp({ t: 'pallet', x: livestock.crate.x, z: livestock.crate.z + 1.2 });
  }
  // пункты доставки дальнобойщика
  truckDests.push({ name: 'Завод «Сталь»', x: 1600, z: 560 }, { name: 'Агрохолдинг «Нива»', x: 1470, z: 1140 }, { name: 'Ферма «Зорька»', x: 1646, z: 1140 });
  for (const b of buildings) if (b.kind === 'vshop') truckDests.push({ name: 'Сельмаг · ' + (b.village ?? ''), x: b.door.x, z: b.door.z });
  for (const b of buildings) if (b.kind === 'mall' || (b.kind === 'supermarket' && b.name.startsWith('Гипер'))) truckDests.push({ name: b.name, x: b.door.x, z: b.door.z });
  // ---------- Сегменты дорог для проверки свободных полос ----------
  const roadSegments = edges.map((e) => ({ ax: nodes[e.a].x, az: nodes[e.a].z, bx: nodes[e.b].x, bz: nodes[e.b].z, w: e.w, kind: e.kind }));
  // припаркованные машины у бордюров городских улиц (можно угнать)
  {
    const pr = new RNG(WORLD_SEED + 7);
    const types = ['volga', 'lada', 'pchelka', 'kolibri', 'taiga', 'bizon', 'gazelka', 'drakon', 'volta', 'fenghuang', 'strizh', 'quadro'];
    for (const e of edges) {
      if (e.kind !== 'city' || !pr.chance(0.11)) continue;
      const a = nodes[e.a], b = nodes[e.b];
      const dir = pr.chance(0.5) ? 1 : -1;
      const A = dir > 0 ? a : b, B = dir > 0 ? b : a;
      const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz);
      const t = pr.range(0.32, 0.68);
      parked.push({ type: pr.pick(types), x: A.x + dx * t + (-dz / l) * 5.0, z: A.z + dz * t + (dx / l) * 5.0, a: Math.atan2(dx, dz), tag: 'parked' });
    }
  }
  const nearRoad = (x: number, z: number, m: number) => {
    for (const s of roadSegments) if (segDist(x, z, s.ax, s.az, s.bx, s.bz).d < s.w / 2 + m) return true;
    return false;
  };
  // ---------- фонари вдоль шоссе, деревенских и промышленных дорог ----------
  const solidNear = (x: number, z: number, r: number) => colliders.some((c) => c.tag !== 'curb' && c.y1 > 0.3 && x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1);
  const degs = new Map<number, number>(); for (const e of edges) { degs.set(e.a, (degs.get(e.a) ?? 0) + 1); degs.set(e.b, (degs.get(e.b) ?? 0) + 1); }
  const isJunction = (x: number, z: number) => nodes.some((n) => (degs.get(n.id) ?? 0) !== 2 && Math.hypot(n.x - x, n.z - z) < 14);
  for (const e of edges) {
    if (e.kind === 'city' || e.kind === 'avenue' || e.kind === 'dirt' || e.kind === 'village') continue;
    const A = nodes[e.a], Bn = nodes[e.b]; const dx = Bn.x - A.x, dz = Bn.z - A.z, L = Math.hypot(dx, dz); if (L < 20) continue;
    const ux = dx / L, uz = dz / L, step = e.kind === 'highway' ? 38 : 26;
    for (let u = step / 2; u < L; u += step) for (const side of e.kind === 'highway' ? [1, -1] : [((Math.round(u / step)) % 2 ? 1 : -1)]) {
      const off = e.w / 2 + 1.1;
      const x = A.x + ux * u - uz * off * side, z = A.z + uz * u + ux * off * side;
      if (isJunction(x, z) || solidNear(x, z, 0.9) || nearRoad(x, z, 0.4)) continue;
      if (Math.hypot(x - 1180, z - 610) < 46) continue; // развязка освещена своими фонарями
      if (Math.abs(x - riverCenter(z)) < riverHalf + 2) continue;
      addProp({ t: 'lamp', x, z, r: Math.atan2(uz * side, -ux * side) }, { w: 0.3, d: 0.3, h: 6 });
    }
  }
  // ---------- станции электросамокатов ----------
  const scooterDocks: WorldLayout['scooterDocks'] = [];
  {
    const cand: [number, number][] = [];
    for (const i of [1, 4, 7, 10, 13, 16]) cand.push([i, AVENUE_J - 1]);
    for (const k of parkSet) { const [pi, pj] = k.split(',').map(Number); cand.push([pi, pj]); }
    for (const [ci, cj] of cand) {
      if (!inGrid(ci, cj)) continue;
      const bz1 = cj * CELL + CELL - ROAD_W / 2, mx = ci * CELL + CELL / 2;
      for (const ox of [10, -11, 12.5]) {
        const x = mx + ox, z = bz1 - 1.6;
        if (solidNear(x, z, 1.4)) continue;
        scooterDocks.push({ x, z, a: 0 }); addProp({ t: 'scooterdock', x: x - 1.9, z, r: 0 }, { w: 0.3, d: 0.3, h: 2 });
        break;
      }
    }
  }
  const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

  // Деревья за городом (леса), без деревьев на пляже, в воде, на полях и в деревнях
  const villageZones = villages.map((v) => ({ x0: Math.min(v.sx, v.ex) - 40, x1: Math.max(v.sx, v.ex) + 40, z0: Math.min(v.sz, v.ez) - 40, z1: Math.max(v.sz, v.ez) + 40 }));
  const forests = [{ x: 950, z: -450, r: 150, n: 220 }, { x: 150, z: -420, r: 120, n: 120 }, { x: -120, z: 200, r: 90, n: 70 }, { x: 1250, z: 200, r: 120, n: 110 }, { x: 650, z: 1300, r: 140, n: 120 }, { x: 1200, z: 1350, r: 110, n: 80 }];
  for (const fr of forests) for (let k = 0; k < fr.n; k++) {
    const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * fr.r;
    const x = fr.x + Math.cos(a) * r, z = fr.z + Math.sin(a) * r;
    if (x > -20 && x < CITY_SIZE + 20 && z > -20 && z < CITY_SIZE + 20) continue;
    if (Math.abs(x - riverCenter(z)) < riverHalf + 10) continue;   // не в воде
    if (inRect(x, z, { x0: 1590, x1: 1710, z0: 1130, z1: 1260 }, 6) || inRect(x, z, depot, 12) || inRect(x, z, beach, 15) || inRect(x, z, ind, 10) || inRect(x, z, farm, 10) || farm.aiFields.some((f) => inRect(x, z, f, 8))) continue;
    if (inRect(x, z, { x0: 630, x1: 990, z0: 1150, z1: 1510 }, 10)) continue; // мини-город Приморск
    if (inRect(x, z, { x0: -1060, x1: -380, z0: -220, z1: 460 }, 14)) continue; // город Новоград за рекой
    if (inRect(x, z, { x0: 1010, x1: 1420, z0: 1520, z1: 1800 }, 10)) continue;   // деревня Сосновка с фермой
    if (Math.abs(x - 120) < 700 && z > 60 && z < 190 && x > -420) continue;      // подъезд и мост
    if (inRect(x, z, { x0: 360, x1: 640, z0: 1290, z1: 1500 }, 8)) continue;  // деревня Сосновка с фермой
    if (villageZones.some((vz) => inRect(x, z, vz))) continue;
    if (nearRoad(x, z, 5)) continue;
    addProp({ t: rng.chance(0.6) ? 'pine' : 'tree', x, z, h: rng.range(0.9, 1.6) }, { w: 0.6, d: 0.6, h: 4 });
  }
  // деревья вдоль деревенских улиц (за заборами — на задах)
  for (const v of villages) for (let k = 0; k < 18; k++) {
    const t = rng.next();
    const x = v.sx + (v.ex - v.sx) * t, z = v.sz + (v.ez - v.sz) * t;
    const L = Math.hypot(v.ex - v.sx, v.ez - v.sz); const nx = -(v.ez - v.sz) / L, nz = (v.ex - v.sx) / L;
    const side = rng.chance(0.5) ? 1 : -1, off = rng.range(34, 48);
    const px = x + nx * off * side, pz = z + nz * off * side;
    if (nearRoad(px, pz, 4) || Math.abs(px - riverCenter(pz)) < riverHalf + 10) continue;
    addProp({ t: rng.chance(0.5) ? 'pine' : 'tree', x: px, z: pz, h: rng.range(1, 1.5) }, { w: 0.6, d: 0.6, h: 4 });
  }

  // ---------- Озеленение парков: только после проверок nearRoad/solidNear ----------
  const decorRng = new RNG(WORLD_SEED ^ 0x5eed);
  for (const pk of parks) {
    const pcx = (pk.x0 + pk.x1) / 2, pcz = (pk.z0 + pk.z1) / 2;
    for (let k = 0; k < 10; k++) {
      const x = decorRng.range(pk.x0 + 3, pk.x1 - 3), z = decorRng.range(pk.z0 + 3, pk.z1 - 3);
      if (Math.abs(x - pcx) < 6 && Math.abs(z - pcz) < 6) continue;                           // фонтан
      if (Math.hypot(x - pcx, z - pcz) < 15 && Math.hypot(x - pcx, z - pcz) > 10.5) continue; // кольцевая дорожка
      if (nearRoad(x, z, ROAD_W / 2 + 3)) continue;                                           // не на проезжей части
      if (solidNear(x, z, 1.3)) continue;                                                     // не в здании/заборе
      const t = decorRng.chance(0.35) ? 'pine' : decorRng.chance(0.45) ? 'tree' : 'bush';
      addProp({ t, x, z, h: decorRng.range(0.7, 1.2) }, { w: 0.9, d: 0.9, h: t === 'bush' ? 1.1 : 3 });
    }
  }

  // ---------- У каждого дома в игре — собственный забор ----------
  for (const bd of buildings) {
    if ((bd.kind === 'house' || bd.kind === 'vhouse') && !bd.fenced) {
      plotFence(bd, 2.4, 1.2, bd.village ? '#8b6b4a' : '#e5e5e5');
    }
  }

  // ---------- Проверка: ничто твёрдое не стоит на проезжей части ----------
  const blockedTags = colliders.filter((c) => c.tag !== 'curb' && c.tag !== 'deck' && c.y1 > 0.5);
  for (const c of blockedTags) {
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
    for (const s of roadSegments) {
      if (c.x1 < Math.min(s.ax, s.bx) - s.w || c.x0 > Math.max(s.ax, s.bx) + s.w || c.z1 < Math.min(s.az, s.bz) - s.w || c.z0 > Math.max(s.az, s.bz) + s.w) continue;
      // проверка пересечения AABB с полосой дороги (приближённо по углам и центру)
      const pts: [number, number][] = [[cx, cz], [c.x0, c.z0], [c.x1, c.z1], [c.x0, c.z1], [c.x1, c.z0]];
      for (const [px, pz] of pts) {
        if (segDist(px, pz, s.ax, s.az, s.bx, s.bz).d < s.w / 2 - 0.3 && hx < 40 && hz < 40) {
          throw new Error(`Препятствие на дороге (${s.kind}) в точке ${px.toFixed(1)},${pz.toFixed(1)} tag=${c.tag ?? ''}`);
        }
      }
    }
  }

  // смежность
  const adj: { n: number; e: number }[][] = nodes.map(() => []);
  for (const e of edges) { adj[e.a].push({ n: e.b, e: e.id }); adj[e.b].push({ n: e.a, e: e.id }); }
  // Проверка индексов блоков
  for (const b of blocks) if (b.ox === undefined && !inGrid(b.i, b.j)) throw new Error('Блок вне сетки');

  void beachRoad; void wh; void clamp;
  return {
    nodes, edges, adj, buildings, props, colliders, kiosks, villages, blocks, parks, staticVehicles, garages, parked: [...parked, ...parkedLot], scooterDocks, livestock, bazaarSlots, vendors, lots, parkades, depot, truckDests,
    river: { center: riverCenter, half: riverHalf }, beach,
    industrial: { ...ind, pickup: { x: wh.door.x, z: wh.door.z }, trucks, office: { x: cp.door.x, z: cp.door.z } },
    farm, playerSpawn: spawn, dealerLot, marketLot, helipad,
    bridges, newCity,
    bounds: { x0: -1120, x1: 1820, z0: -620, z1: 1920 }, roadSegments,
  };
}

// ---------- Маршрутизация (A*) ----------
export function astar(L: WorldLayout, start: number, goal: number): number[] | null {
  if (start === goal) return [start];
  const n = L.nodes.length;
  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap: number[] = [];
  const push = (id: number) => {
    heap.push(id); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0]; const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
    }
    return top;
  };
  const gx = L.nodes[goal].x, gz = L.nodes[goal].z;
  g[start] = 0; f[start] = Math.hypot(L.nodes[start].x - gx, L.nodes[start].z - gz); push(start);
  while (heap.length) {
    const cur = pop();
    if (cur === goal) {
      const path = [cur]; let c = cur;
      while (came[c] >= 0) { c = came[c]; path.push(c); }
      return path.reverse();
    }
    if (closed[cur]) continue; closed[cur] = 1;
    for (const { n: nb } of L.adj[cur]) {
      if (closed[nb]) continue;
      const a = L.nodes[cur], b = L.nodes[nb];
      const ng = g[cur] + Math.hypot(a.x - b.x, a.z - b.z) + (b.light ? 4 : 0);
      if (ng < g[nb]) { g[nb] = ng; came[nb] = cur; f[nb] = ng + Math.hypot(b.x - gx, b.z - gz); push(nb); }
    }
  }
  return null;
}
/** ближайшая точка на дороге */
export function nearestRoadPoint(L: WorldLayout, x: number, z: number) {
  let best = { d: Infinity, e: -1, t: 0, x: 0, z: 0 };
  for (const e of L.edges) {
    const a = L.nodes[e.a], b = L.nodes[e.b];
    const r = segDist(x, z, a.x, a.z, b.x, b.z);
    if (r.d < best.d) best = { d: r.d, e: e.id, t: r.t, x: r.x, z: r.z };
  }
  return best;
}
export function nearestNode(L: WorldLayout, x: number, z: number) {
  let bi = 0, bd = Infinity;
  for (const n of L.nodes) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; bi = n.id; } }
  return bi;
}
