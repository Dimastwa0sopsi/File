// Игровой движок «Лос-Город»: цикл, игрок, транспорт, интерьеры, работа, полиция, такси, автопилот
import * as THREE from 'three';
import { CITY_SIZE, CHUNK, clamp, angleDiff, RNG, type Settings, resolveMobile, LANE_OFF } from './config';
import { generateLayout, nearestRoadPoint, astar, type WorldLayout, type Building } from './worldgen';
import { NetClient, type RemoteState, type NetEvent, type Listing, type ChatMsg } from './net';
import { sendTicket } from './support';
import { Combat } from './combat';
import { MapIndex, drawMap, drawIcons, drawPlayerArrow, toScreen, type MapIcon, type MapView } from './mapdraw';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildWorldMeshes, type WorldMeshes } from './worldMesh';
import { Collision } from './collision';
import { Character, type Pose } from './character';
import { Vehicle, AIDriver, playerDrive, heliLanded, nearestNodeFast, type AICtx, type DriveResult } from './vehicles';
import { PedSystem, randomLook, type Ped } from './npc';
import { buildInterior, interiorForBuilding, type Interior, type InteriorKind } from './interiors';
import { Sound } from './audio';
import { Input } from './input';
import { allMaterials, disposeTextures, mat, GFX, getTex } from './textures';
import { T } from './geom';
import { LIMITED, limitedAvailable, CROPS, EMOTES, SCOOTER_RATE, WEAPONS, WEAPON_ORDER, AMMO_NAMES, ITEMS, VEHICLES, TRAFFIC_TYPES, TRAFFIC_WEIGHTS, KIOSK_TYPES, KIOSK_PERIOD, KIOSK_MAX_PERIODS, SHOP_ITEMS, type ShopKind, type Look, type Tuning, defaultTuning, TUNE_PRICES, HAIR_STYLES, TOPS, BOTTOMS } from './data';
import { type GameState, newState, loadState, saveState, type OwnedVehicle, marketOffers, sellPrice, repairCost, carValue, uid, type MarketOffer } from './state';

export interface HudState {
  money: number; health: number; food: number; water: number; energy: number; wanted: number; time: string; night: boolean;
  vehicle: null | { name: string; kmh: number; gear: string; rpm: number; fuel: number; autopilot: boolean; heli: boolean; alt: number; moto: boolean; lights: boolean; canAuto: boolean; manual: boolean; passenger: boolean };
  prompt: string | null; promptKeys: string[]; location: string; job: string | null; taxi: string | null; inside: boolean; weapon: string; ammo: number;
  lying: boolean; fps: number; intro: boolean; carrying: boolean; destination: boolean;
  online: null | { status: string; players: number; id: number | null; nick: string }; chat: { name: string; text: string; color: string }[];
  camera: null | { mode: 'selfie' | 'rear' }; flash: number;
  quest: string | null; rental: null | { min: number; cost: number }; trip: number; emote: string | null; hotbar: { id: string; name: string; key: number }[]; tradeInvite: string | null;
  gain: number; crouch: boolean; editor: boolean; stunt: null | { angle: number; t: number; kind: string };
  gun: null | { mag: number; reserve: number; aiming: boolean; spread: number; reloading: boolean; name: string; ammoName: string; driveBy: boolean }; hitMarker: boolean; hurt: number; blocking: boolean; riding: boolean;
}
export interface Remote { crouch: boolean; listings: Vehicle[]; listKey: string; props: [string, number][]; taxi: boolean; id: number; char: Character; tag: THREE.Sprite; veh: Vehicle | null; vehKey: string; x: number; z: number; y: number; a: number; phase: number; lookKey: string; color: string; name: string; spd: number; flinch: number; inVeh: boolean; ikey: string; visible: boolean; weapon: number; tagName: string; hp: number }
export type Panel =
  | { type: 'shop'; kind: ShopKind; title: string; items: string[] } | { type: 'kiosk'; id: number } | { type: 'market'; sellUid?: string }
  | { type: 'tuning'; uid: string } | { type: 'clothes' } | { type: 'barber' } | { type: 'hospital' } | { type: 'fines'; title: string }
  | { type: 'property'; b: number; unit: number } | { type: 'garage'; id: number } | { type: 'vadmin'; village: string } | { type: 'factory' } | { type: 'bank' }
  | { type: 'pc'; mode: 'office' | 'home' } | { type: 'officehr' } | { type: 'livestock' } | { type: 'dealer'; scooter?: boolean } | { type: 'trucker' } | { type: 'emotes' } | { type: 'passport' } | { type: 'trade' } | { type: 'tradeInvite' } | { type: 'plant'; key: string; basement: boolean } | { type: 'quest' } | { type: 'editor'; fresh: boolean } | { type: 'listing'; uid: string; slot: number } | { type: 'info'; title: string; text: string } | { type: 'map'; mode: 'waypoint' | 'taxi' | 'autopilot' } | { type: 'phone'; tab?: string } | { type: 'onlineJoin' } | { type: 'inventory' } | { type: 'promo' } | { type: 'settings' } | { type: 'farm' };
interface Prompt { text: string; keys: string[]; act: () => void; r?: () => void; l?: () => void }
interface Debris { obj: THREE.Object3D; vx: number; vy: number; vz: number; wx: number; wz: number; rest: boolean }
type TruckOrder = { name: string; x: number; z: number; cargo: string; pay: number; dist: number };
type Job = { type: 'farm'; stage: 'pickup' | 'feed' | 'eggs' | 'crate'; trough: number; cycles: number } | { type: 'truck'; stage: 'toTruck' | 'drive' | 'return'; order: TruckOrder; drop: { x: number; z: number }; truck: Vehicle } | { type: 'factory'; stage: 'pickup' | 'load'; truck: number; trips: number } | { type: 'courier'; stage: 'pickup' | 'drop'; from: Building; to: Building; pay: number } | { type: 'combine'; earned: number; strips: boolean[] } | { type: 'shift'; b: number; served: number; cust: Ped | null; stage: 'enter' | 'wait' | 'leave'; t: number };

export interface GameCallbacks {
  onProgress: (p: number, label: string) => void; onHud: (h: HudState) => void; onPanel: (p: Panel | null) => void;
  onToast: (t: string) => void; onReady: () => void; onIntroEnd: () => void; onError: (e: string) => void;
}

const POI_ICON: Record<string, string> = { shop24: '🛒', supermarket: '🛍️', cafe: '☕', pharmacy: '💊', gunshop: '🔫', service: '🔧', clothes: '👕', barber: '✂️', mall: '🏬', dealer: '🚗', market: '🚙', gas: '⛽', police: '👮', hospital: '🏥', fire: '🚒', cityhall: '🏛️', bank: '🏦', vshop: '🛒', vadmin: '🏛️', checkpoint: '🏭', farm: '🌾' };
export { POI_ICON };
const POI_COLOR: Record<string, string> = { shop24: '#e11d48', supermarket: '#f59e0b', cafe: '#a16207', pharmacy: '#059669', gunshop: '#374151', service: '#2563eb', clothes: '#8b5cf6', barber: '#db2777', mall: '#7c3aed', dealer: '#0ea5e9', market: '#0369a1', gas: '#16a34a', police: '#1d4ed8', hospital: '#dc2626', fire: '#b91c1c', cityhall: '#1e3a8a', bank: '#0f766e', vshop: '#e11d48', vadmin: '#1e3a8a', checkpoint: '#57534e', farm: '#a16207', beach: '#0891b2' };

const r2 = (v: number) => Math.round(v * 100) / 100;
const REMOTE_POSES = new Set(['dance1', 'dance2', 'dance3', 'dance4', 'dance5', 'wave', 'clap', 'sit', 'liedown', 'pushup', 'tread', 'crouch', 'crouchwalk', 'crouchaim', 'idle', 'walk', 'run', 'guard', 'jab', 'cross', 'hook', 'block', 'flinch', 'aim', 'knock', 'lie', 'fall', 'smoke', 'carry', 'swim', 'punch']);
function seatPose(seat: { pose: string }, idx: number): Pose {
  if (seat.pose === 'ride' || seat.pose === 'scoot' || seat.pose === 'ridepass') return seat.pose as Pose;
  return idx === 0 ? 'drive' : 'passenger';
}
const QUEST_STEPS = [
  'Поговорите с дядей Васей у мэрии',
  'Купите бутылку воды в магазине 24/7',
  'Найдите транспорт: сядьте в любую машину или на самокат',
  'Заберите посылку в гаражном кооперативе',
  'Отвезите посылку Лёхе на пляж',
  'Отбейтесь от бандитов',
  'Вернитесь к дяде Васе',
];
const PHOTO_KEY = 'losgorod_photos';
export function loadPhotos(): { t: number; data: string; place: string }[] { try { return JSON.parse(localStorage.getItem(PHOTO_KEY) ?? '[]'); } catch { return []; } }
export function deletePhoto(t: number) { try { localStorage.setItem(PHOTO_KEY, JSON.stringify(loadPhotos().filter((p) => p.t !== t))); } catch { /* */ } }
export class Game {
  cb: GameCallbacks; settings: Settings; mobile: boolean;
  renderer!: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(65, 1, 0.3, 600);
  sun = new THREE.DirectionalLight(0xffffff, 1.6); hemi = new THREE.HemisphereLight(0xcfe8ff, 0x55634a, 0.9);
  L!: WorldLayout; W!: WorldMeshes; col!: Collision; activeCol!: Collision;
  input!: Input; sound = new Sound(); peds!: PedSystem;
  state!: GameState; player!: Character;
  vehGroup = new THREE.Group(); vehicles: Vehicle[] = [];
  px = 0; py = 0; pz = 0; pa = 0; pvy = 0; pvx = 0; pvz = 0; walkPhase = 0;
  inVeh: Vehicle | null = null; passenger = false;
  camYaw = 0; camPitch = 0.25; camDist = 5; lastLook = 0;
  interior: Interior | null = null; interiorKind: InteriorKind | null = null;
  panel: Panel | null = null; prompt: Prompt | null = null;
  weapon = 'fists'; smokeT = 0; dizzyT = 0; fallT = 0;
  netPose: { p: string; k: number; pt: number } = { p: 'idle', k: 0, pt: 0 };
  crouch = false; editorYaw = 0; chatFocus: (() => void) | null = null;
  rideDist = 0; private pedNetT = 0; private bazaarT = 0;
  private pendingBuy: { slot: number; price: number; seller: number; t: number } | null = null;
  combat!: Combat; rideRemote: { id: number; seat: number } | null = null;
  lying = false; carrying = false; autopilot = false; destination: { x: number; z: number } | null = null;
  job: Job | null = null; taxi: { v: Vehicle; stage: 'coming' | 'waiting' | 'riding' | 'arrived' | 'leaving'; dist: number; t: number } | null = null;
  service: { v: Vehicle; kind: 'police' | 'ambulance'; t: number } | null = null;
  debris: Debris[] = []; marker!: THREE.Mesh; flash!: THREE.PointLight; headlight!: THREE.SpotLight; neonLight!: THREE.PointLight;
  bustT = 0; noPoliceT = 0; robbedAt = new Map<number, number>();
  intro: { t: number; dur: number } | null = null;
  private raf = 0; private last = 0; private hudT = 0; private chunkT = 0; private lightT = 0; private saveT = 0; private promptT = 0; private slowT = 0; private envT = 0; private aiT = 0;
  private frameAcc: number[] = []; private fpsWin = 0; private fps = 60; private qualityLevel = 0; private goodWindows = 0;
  private disposed = false; private rng = new RNG(77);
  mapIdx: MapIndex | null = null; gpsRoute: { x: number; z: number }[] | null = null; private gpsT = 0;
  online = false; net: NetClient | null = null; remotes = new Map<number, Remote>();
  private netT = 0; private netMoveT = 0; private netN = 0; private lastSpeed = 0;
  sky: THREE.Mesh | null = null; stars: THREE.Points | null = null; clouds: THREE.Group | null = null; private skyMat: THREE.ShaderMaterial | null = null;
  minimap: HTMLCanvasElement | null = null; private miniT = 0;
  emote: { id: string; t0: number } | null = null;
  camMode: { mode: 'selfie' | 'rear' } | null = null; flashT = 0;
  private npcCars = new Map<string, { v: Vehicle; tx: number; tz: number; ta: number; ts: number; t: number }>();
  private smoke: { s: THREE.Sprite; life: number; vx: number; vz: number }[] = []; private smokeMat = new THREE.SpriteMaterial({ color: 0xd4d4d8, transparent: true, opacity: 0.5, depthWrite: false }); private tireSmokeT = 0;
  rental: { v: Vehicle; t: number; paid: number } | null = null;
  drugT = 0; localChat: ChatMsg[] = [];
  trade: { peer: number; name: string; mine: Record<string, number>; myMoney: number; theirs: Record<string, number>; theirMoney: number; myReady: boolean; theirReady: boolean; th?: string; th2?: string; view: 'theirs' | 'mine' } | null = null;
  tradeInvite: { from: number; name: string; t: number } | null = null;
  private questPeds: { vasya: import('./npc').Ped | null; thugs: import('./npc').Ped[] } = { vasya: null, thugs: [] };
  private plantsGroup = new THREE.Group(); private plantT = 0;
  private lampHeads: { x: number; z: number }[] = []; private lampLights: THREE.PointLight[] = [];
  private cashFx: { left: number; per: number; src: THREE.Vector3; next: number } | null = null;
  private flyBills: { m: THREE.Mesh; t: number; from: THREE.Vector3; amt: number; spin: number }[] = [];
  pickups: { obj: THREE.Group; kind: 'cash' | 'cig'; amt: number; x: number; y: number; z: number; t: number }[] = [];
  private gainAmt = 0; private gainT = 0; private lastMoney = -1;
  private trafficGoal = 20; private resizeObs: (() => void) | null = null;
  private tmpV = new THREE.Vector3();
  constructor(private container: HTMLElement, settings: Settings, cb: GameCallbacks) {
    this.cb = cb; this.settings = { ...settings }; this.mobile = resolveMobile(settings);
  }
  // ================= ЗАГРУЗКА =================
  async init(opts: { newGame: boolean; gender: 'm' | 'f' }) {
    const P = this.cb.onProgress;
    P(0.02, 'Подготовка рендера');
    this.renderer = new THREE.WebGLRenderer({ antialias: this.settings.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';
    this.applyRenderSettings();
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize); this.resizeObs = () => window.removeEventListener('resize', onResize);
    this.resize();
    await new Promise((r) => setTimeout(r, 0));
    P(0.06, 'Генерация города 18×18');
    this.L = generateLayout();
    await new Promise((r) => setTimeout(r, 0));
    P(0.1, 'Коллизии');
    this.col = new Collision(this.L.colliders); this.activeCol = this.col;
    for (const g of this.L.garages) this.col.dynamic.push({ x0: g.x - g.w / 2 + 0.3, x1: g.x + g.w / 2 - 0.3, z0: g.gateZ, z1: g.gateZ + 0.25, y0: 0, y1: 2.6, tag: 'gate' + g.id });
    GFX.pbr = this.settings.quality !== 'low';
    this.W = await buildWorldMeshes(this.L, P);
    if (this.disposed) return;
    this.scene.add(this.W.root);
    P(0.95, 'Жители и транспорт');
    this.setupScene();
    // состояние
    const loaded = opts.newGame ? null : loadState();
    this.state = loaded ?? newState(opts.gender, this.L.playerSpawn);
    this.player = new Character(this.state.look);
    this.scene.add(this.player.root);
    this.combat = new Combat(this);
    this.input = new Input(this.renderer.domElement);
    this.input.wantLock = !this.mobile; this.input.touchMode = this.mobile;
    this.input.onKey = (c) => this.globalKey(c);
    this.peds = new PedSystem(this.L);
    this.scene.add(this.peds.group);
    this.peds.init(Math.round(4 + this.settings.peds * 26), this.state.pos.x, this.state.pos.z);
    this.peds.initVendors();
    this.scene.add(this.plantsGroup);
    for (const d of this.L.scooterDocks) for (let k = 0; k < 3; k++) { const v = new Vehicle('scooter', 'rental'); v.place(d.x - 0.9 + k * 0.9, d.z, Math.PI / 2 + 0.15); this.addVehicle(v); }
    for (const p of this.L.props) if (p.t === 'lamp') this.lampHeads.push({ x: p.x + Math.sin(p.r ?? 0) * 1.3, z: p.z + Math.cos(p.r ?? 0) * 1.3 });
    for (let i = 0; i < 8; i++) { const l = new THREE.PointLight(0xffd29a, 0, 24, 1.5); this.lampLights.push(l); this.scene.add(l); }
    this.state.createdAt ??= Date.now();
    this.state.apps ??= ['camera', 'gallery'];
    this.peds.onDeath = (p, mine) => { if (mine) this.onPedDeath(p); };
    this.scene.add(this.vehGroup);
    this.spawnStaticVehicles();
    this.spawnOwnedVehicles();
    this.spawnAICombines();
    this.trafficGoal = Math.round(this.settings.traffic * (this.mobile ? 22 : 38));
    this.mapIdx = new MapIndex(this.L);
    P(0.98, 'Размещение игрока');
    this.restorePosition();
    this.sound.setVolume(this.settings.volume, this.settings.muted);
    P(1, 'Готово');
    this.setupQuest();
    this.intro = { t: 0, dur: this.state.location ? 0.01 : 9 };
    this.last = performance.now();
    this.loop();
    this.cb.onReady();
  }
  private setupScene() {
    this.scene.background = new THREE.Color(0x9ccbf0);
    this.scene.fog = new THREE.Fog(0x9ccbf0, 150, 400);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.buildSky();
    this.sun.shadow.camera.left = -45; this.sun.shadow.camera.right = 45; this.sun.shadow.camera.top = 45; this.sun.shadow.camera.bottom = -45;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 220; this.sun.shadow.bias = -0.0006;
    this.sun.shadow.mapSize.set(this.settings.quality === 'high' ? 2048 : 1024, this.settings.quality === 'high' ? 2048 : 1024);
    const mk = new THREE.Mesh(T.cylB, new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.45, depthWrite: false }));
    mk.scale.set(0.9, 30, 0.9); mk.visible = false; this.marker = mk; this.scene.add(mk);
    this.flash = new THREE.PointLight(0xffcc66, 0, 8); this.scene.add(this.flash);
    this.headlight = new THREE.SpotLight(0xfff4d6, 0, 45, 0.55, 0.5, 1.2); this.scene.add(this.headlight, this.headlight.target);
    this.neonLight = new THREE.PointLight(0x00e5ff, 0, 5); this.scene.add(this.neonLight);
  }
  private buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color(0x3b7bd4) }, horizon: { value: new THREE.Color(0xbfdcf5) }, bottom: { value: new THREE.Color(0x6b7f8f) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color(0xfff2d0) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 col = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.6), 0.55)) : mix(horizon, bottom, min(1.0, -h * 5.0));
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 10.0) * 0.28 + pow(sd, 3.0) * 0.08);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat);
    sky.frustumCulled = false; sky.renderOrder = -10; this.sky = sky; this.scene.add(sky);
    // звёзды
    const n = 700, pos = new Float32Array(n * 3); const r = new RNG(5);
    for (let i = 0; i < n; i++) { const u = r.next() * 2 - 1, th = r.next() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05, k = Math.sqrt(1 - y * y); pos.set([Math.cos(th) * k * 90, y * 90, Math.sin(th) * k * 90], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -9; this.scene.add(this.stars);
    // облака
    const cg = new THREE.Group(); const cm = new THREE.SpriteMaterial({ map: getTex('cloud'), transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
    for (let i = 0; i < 18; i++) { const sp = new THREE.Sprite(cm); const a = r.next() * Math.PI * 2, d = 0.55 + r.next() * 0.35; sp.position.set(Math.cos(a) * d, 0.22 + r.next() * 0.18, Math.sin(a) * d); const sc = 0.35 + r.next() * 0.3; sp.scale.set(sc, sc * 0.45, 1); cg.add(sp); }
    cg.renderOrder = -8; this.clouds = cg; this.scene.add(cg);
    // окружение для отражений
    if (GFX.pbr) {
      try { const pm = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); } catch { /* без отражений */ }
    }
  }
  applyRenderSettings() {
    if (!this.renderer) return;
    const s = this.settings;
    const scale = clamp(s.renderScale - this.qualityLevel * 0.12, 0.45, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, s.quality === 'high' ? 2 : 1.5) * scale);
    const sh = s.shadows && this.qualityLevel < 2;
    if (sh !== this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = sh; this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true)); else if (m) m.needsUpdate = true; }); }
    this.sun.castShadow = sh;
    this.camera.far = this.drawDist() + 60; this.camera.updateProjectionMatrix();
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.far = this.drawDist(); this.scene.fog.near = this.drawDist() * 0.5; }
  }
  drawDist() { return Math.max(160, this.settings.drawDistance * (this.qualityLevel >= 3 ? 0.75 : 1)); }
  updateSettings(s: Settings) {
    const shadowsChanged = s.shadows !== this.settings.shadows;
    this.settings = { ...s }; this.mobile = resolveMobile(s);
    if (this.input) { this.input.wantLock = !this.mobile; this.input.touchMode = this.mobile; }
    this.applyRenderSettings(); this.sound.setVolume(s.volume, s.muted);
    this.trafficGoal = Math.round(s.traffic * (this.mobile ? 22 : 38));
    void shadowsChanged;
  }
  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  // ================= ТРАНСПОРТ: создание =================
  addVehicle(v: Vehicle) { this.vehicles.push(v); this.vehGroup.add(v.model.group); v.sync(); return v; }
  removeVehicle(v: Vehicle) { const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1); v.dispose(); }
  private spawnStaticVehicles() {
    for (const s of this.L.staticVehicles) { const v = new Vehicle(s.type, 'deco', s.color); v.place(s.x, s.z, s.a); this.addVehicle(v); }
    for (const s of this.L.parked) { const v = new Vehicle(s.type, 'parked'); v.place(s.x, s.z, s.a); this.addVehicle(v); }
    const F = this.L.farm;
    const c = new Vehicle('combine', 'job'); c.place(F.combineSpawn.x, F.combineSpawn.z, F.combineSpawn.a); this.addVehicle(c);
  }
  private spawnAICombines() {
    for (const f of this.L.farm.aiFields) {
      const c = new Vehicle('combine', 'aicombine'); c.place(f.x0 + 6, f.z0 + 6, 0); c.addDummyDriver(); this.addVehicle(c);
      (c as Vehicle & { lane?: number; field?: typeof f }).lane = 0; (c as Vehicle & { field?: typeof f }).field = f;
    }
  }
  private spawnOwnedVehicles() {
    for (const o of this.state.vehicles) {
      const v = new Vehicle(o.type, 'owned', o.color, o);
      const p = o.pos ?? this.freeSpotNear(this.L.dealerLot.x, this.L.dealerLot.z);
      if (!o.pos) o.pos = { ...p, a: 0 };
      v.place(p.x, p.z, o.pos.a ?? 0, 0);
      this.addVehicle(v);
    }
  }
  private freeSpotNear(x: number, z: number) {
    for (let i = 0; i < 40; i++) {
      const a = i * 0.8, r = 2 + i * 0.9; const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const blocked = this.col.query(px, pz, 2.5).some((b) => b.y1 > 0.6) || this.vehicles.some((v) => Math.hypot(v.x - px, v.z - pz) < 5);
      if (!blocked) return { x: px, z: pz };
    }
    return { x, z };
  }
  private roadSpotNear(x: number, z: number) {
    const r = nearestRoadPoint(this.L, x, z);
    const e = this.L.edges[r.e]; const a = this.L.nodes[e.a], b = this.L.nodes[e.b];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const off = e.w / 2 - 1.4;
    return { x: r.x + (-dz / l) * off, z: r.z + (dx / l) * off, a: Math.atan2(dx, dz) };
  }
  private pickTrafficType() {
    let sum = 0; for (const w of TRAFFIC_WEIGHTS) sum += w;
    let r = this.rng.next() * sum;
    for (let i = 0; i < TRAFFIC_TYPES.length; i++) { r -= TRAFFIC_WEIGHTS[i]; if (r <= 0) return TRAFFIC_TYPES[i]; }
    return 'lada';
  }
  private spawnTraffic(near: boolean): Vehicle | null {
    const L = this.L;
    for (let t = 0; t < 15; t++) {
      const n = L.nodes[Math.floor(this.rng.next() * L.nodes.length)];
      const d = Math.hypot(n.x - this.px, n.z - this.pz);
      if (d > 260 || (!near && d < 90) || d < 25 || this.suppressed(n.x, n.z)) continue;
      const opts = L.adj[n.id].filter((x) => L.edges[x.e].kind !== 'dirt');
      if (!opts.length) continue;
      const nb = opts[Math.floor(this.rng.next() * opts.length)];
      const B = L.nodes[nb.n]; const dx = B.x - n.x, dz = B.z - n.z, l = Math.hypot(dx, dz);
      const off = L.edges[nb.e].kind === 'highway' ? 4 : L.edges[nb.e].kind === 'city' || L.edges[nb.e].kind === 'avenue' ? LANE_OFF : 2.1;
      const sx = n.x + (dx / l) * 9 + (-dz / l) * off, sz = n.z + (dz / l) * 9 + (dx / l) * off;
      if (this.vehicles.some((v) => Math.abs(v.x - sx) + Math.abs(v.z - sz) < 14)) continue;
      const type = this.pickTrafficType();
      const v = new Vehicle(type, type === 'police' ? 'police' : 'traffic');
      v.place(sx, sz, Math.atan2(dx, dz));
      v.ai = new AIDriver(); v.ai.route = [n.id, nb.n]; v.ai.speedMul = 0.85 + this.rng.next() * 0.3;
      v.speed = 6; v.hasDriver = true; v.addDummyDriver();
      return this.addVehicle(v);
    }
    return null;
  }
  // ================= ПОЗИЦИЯ / ИНТЕРЬЕРЫ =================
  private restorePosition() {
    const s = this.state;
    const loc = s.location;
    if (loc) {
      const b = this.L.buildings[loc.b];
      if (b && b.enter && this.canEnterSaved(b, loc.unit)) {
        this.placeOutsideAt(b); // корректная точка выхода
        this.enterBuilding(b, true);
        if (loc.unit !== undefined && b.kind === 'apartment') this.enterApartment(b, loc.unit, true);
        else if (loc.sub !== undefined && (b.kind === 'vhouse' || b.kind === 'house')) this.enterBasement(b, true);
        else if (loc.sub !== undefined && b.kind === 'mall') { const k = ['clothes', 'mallfood', 'pharmacy', 'barber', 'shop24', 'gunshop'][loc.sub] as InteriorKind; this.enterMallShop(b, k, loc.sub, true); }
        return;
      }
      s.location = null;
    }
    // проверка, что позиция не внутри стены
    let { x, z } = s.pos;
    if (!isFinite(x) || !isFinite(z) || this.col.solidAt(x, 1, z) || x < this.L.bounds.x0 || x > this.L.bounds.x1 || z < this.L.bounds.z0 || z > this.L.bounds.z1) { x = this.L.playerSpawn.x; z = this.L.playerSpawn.z; }
    this.px = x; this.pz = z; this.pa = s.pos.a; this.py = this.col.groundAt(x, z, 5, 10);
    this.camYaw = this.pa;
  }
  private canEnterSaved(b: Building, unit?: number) {
    if (b.kind === 'house' || b.kind === 'vhouse') return this.state.properties.includes(`${b.id}:0`);
    if (b.kind === 'apartment' && unit !== undefined) return this.state.properties.includes(`${b.id}:${unit}`);
    return true;
  }
  private placeOutsideAt(b: Building) {
    this.px = b.door.x; this.pz = b.door.z; this.pa = b.door.a; this.py = this.col.groundAt(b.door.x, b.door.z, 2, 3); this.camYaw = b.door.a;
  }
  private setInterior(it: Interior, kind: InteriorKind, spot?: { x: number; z: number; a: number; y?: number }) {
    if (this.interior) { this.interior.dispose(); this.peds.clearStatic(); }
    this.interior = it; this.interiorKind = kind;
    this.scene.add(it.group);
    this.activeCol = new Collision(it.colliders, 4);
    this.W.root.visible = false; this.vehGroup.visible = false; this.marker.visible = false;
    const p = spot ?? it.spawn;
    this.px = p.x; this.pz = p.z; this.py = p.y ?? 0; this.pa = p.a; this.camYaw = p.a; this.camPitch = 0.3; this.pvy = 0;
    for (const n of it.npcs) {
      const look = randomLook();
      if (n.role === 'police') { look.top = 'shirt'; look.topColor = '#1e3a8a'; look.bottom = 'trousers'; look.bottomColor = '#111827'; }
      if (n.role === 'doctor') { look.top = 'shirt'; look.topColor = '#f8fafc'; }
      if (n.role === 'cashier') { look.top = 'tshirt'; look.topColor = '#16a34a'; }
      this.peds.addStatic(look, n.x, n.z, n.a, n.role);
    }
    this.scene.background = new THREE.Color(0x1a1a1f);
    this.sun.visible = false;
    if (this.sky) this.sky.visible = false; if (this.stars) this.stars.visible = false; if (this.clouds) this.clouds.visible = false;
  }
  enterBuilding(b: Building, silent = false) {
    const kind = interiorForBuilding(b.kind);
    if (!kind) return;
    if (b.kind === 'house' || b.kind === 'vhouse') {
      const id = `${b.id}:0`;
      if (!this.state.properties.includes(id)) {
        const other = this.takenBy(id);
        if (other) { if (other.locked) { this.toast(`🔒 Дом игрока ${other.name} заперт`); this.sound.error(); return; } this.toast(`Вы в гостях у ${other.name}`); }
        else { if (b.forSale) this.openPanel({ type: 'property', b: b.id, unit: 0 }); else this.toast('Дом занят жильцами — заперто'); return; }
      }
    }
    let owned: boolean[] | undefined;
    if (b.kind === 'apartment') owned = [0, 1, 2, 3].map((u) => this.state.properties.includes(`${b.id}:${u}`));
    const it = buildInterior(kind, { seed: b.id, owned });
    this.setInterior(it, kind);
    this.state.location = { b: b.id };
    if (!silent) this.sound.door();
    this.lastBuilding = b;
  }
  lastBuilding: Building | null = null;
  enterApartment(b: Building, unit: number, silent = false) {
    const id = `${b.id}:${unit}`;
    if (!this.state.properties.includes(id)) {
      const other = this.takenBy(id);
      if (!other) { this.openPanel({ type: 'property', b: b.id, unit }); return; }
      if (other.locked) { this.toast(`🔒 Квартира игрока ${other.name} заперта`); this.sound.error(); return; }
      this.toast(`Вы в гостях у ${other.name}`);
    }
    const kind: InteriorKind = b.cls === 'lux' ? 'apt_lux' : b.cls === 'mid' ? 'apt_mid' : 'apt_eco';
    this.setInterior(buildInterior(kind, { seed: b.id * 10 + unit }), kind);
    this.state.location = { b: b.id, unit };
    if (!silent) this.sound.door();
  }
  enterMallShop(b: Building, kind: InteriorKind, idx: number, silent = false) {
    this.setInterior(buildInterior(kind, { seed: idx }), kind);
    this.state.location = { b: b.id, sub: idx };
    if (!silent) this.sound.door();
  }
  exitInterior() {
    const loc = this.state.location; if (!loc) return;
    const b = this.L.buildings[loc.b];
    this.lying = false;
    if (this.job?.type === 'shift') { this.toast('Смена прервана'); if (this.job.cust) this.peds.removePed(this.job.cust); this.job = null; }
    if (loc.unit !== undefined && b.kind === 'apartment') { // из квартиры — в подъезд этого дома, к её двери
      const owned = [0, 1, 2, 3].map((u) => this.state.properties.includes(`${b.id}:${u}`));
      const it = buildInterior('hall', { seed: b.id, owned });
      this.setInterior(it, 'hall', it.doorSpots['apt' + loc.unit]);
      this.state.location = { b: b.id }; this.sound.door(); return;
    }
    if (loc.sub !== undefined && (b.kind === 'vhouse' || b.kind === 'house')) { // из подвала — в дом, к люку
      const hk: InteriorKind = b.kind === 'house' ? 'house_city' : 'house_village';
      const it = buildInterior(hk, { seed: b.id });
      this.setInterior(it, hk, it.doorSpots['hatch']);
      this.state.location = { b: b.id }; this.sound.door(); return;
    }
    if (loc.sub !== undefined && b.kind === 'mall') { // из магазина — в зал торгового центра
      const it = buildInterior('mall', { seed: b.id });
      this.setInterior(it, 'mall', it.doorSpots['shop' + loc.sub]);
      this.state.location = { b: b.id }; this.sound.door(); return;
    }
    // на улицу к наружной двери именно этого здания
    if (this.interior) { this.interior.dispose(); this.peds.clearStatic(); }
    this.interior = null; this.interiorKind = null; this.activeCol = this.col;
    this.W.root.visible = true; this.vehGroup.visible = true; this.sun.visible = true;
    this.placeOutsideAt(b);
    this.state.location = null; this.sound.door();
  }
  // ================= ГЛОБАЛЬНЫЕ КЛАВИШИ =================
  private globalKey(code: string) {
    if (this.intro) return;
    if (code === 'Tab') { this.togglePanel({ type: 'phone' }); return; }
    if ((code === 'Enter' || code === 'KeyT') && !this.panel && !this.camMode) { this.input.releaseAll(); this.input.unlock(); this.chatFocus?.(); return; }
    if (code === 'Backquote' && !this.input.keys.has('KeyQ')) { if (!this.panel || this.panel.type === 'phone' || this.panel.type === 'onlineJoin') { if (this.panel?.type === 'onlineJoin') this.closePanel(); else this.toggleOnline(); } return; }
    if (code === 'Escape' && this.camMode && !this.panel) { this.stopCamera(); return; }
    if (code === 'Escape') { if (this.panel) this.closePanel(); else this.openPanel({ type: 'settings' }); return; }
    if (this.panel && this.panel.type !== 'map') { if (code === 'KeyI' && this.panel.type === 'inventory') this.closePanel(); return; }
    if (code === 'KeyI') this.togglePanel({ type: 'inventory' });
    else if (code === 'KeyM') this.togglePanel({ type: 'map', mode: 'waypoint' });
    else if (code === 'BracketRight') this.togglePanel({ type: 'promo' });
  }
  togglePanel(p: Panel) { if (this.panel && this.panel.type === p.type) this.closePanel(); else this.openPanel(p); }
  openPanel(p: Panel) { this.panel = p; this.input?.releaseAll(); if (this.input) this.input.enabled = false; this.input?.unlock(); this.cb.onPanel(p); this.sound.click(); }
  closePanel() {
    this.panel = null; if (this.input) { this.input.enabled = true; this.input.releaseAll(); } this.cb.onPanel(null);
  }
  toast(t: string) { this.cb.onToast(t); }
  // ================= ЦИКЛ =================
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const real = (now - this.last) / 1000; this.last = now;
    this.measure(real);
    const dt = Math.min(real, 0.05);
    try { this.update(dt); } catch (e) { console.error(e); }
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };
  private measure(real: number) {
    this.frameAcc.push(real); this.fpsWin += real;
    if (this.fpsWin < 2) return;
    const avg = this.frameAcc.reduce((a, b) => a + b, 0) / this.frameAcc.length;
    this.fps = Math.round(1 / avg); this.frameAcc = []; this.fpsWin = 0;
    if (!this.settings.autoQuality || this.intro) return;
    if (avg > 1 / 32 && this.qualityLevel < 4) { this.qualityLevel++; this.goodWindows = 0; this.applyRenderSettings(); }
    else if (avg < 1 / 55 && this.qualityLevel > 0) { if (++this.goodWindows >= 4) { this.qualityLevel--; this.goodWindows = 0; this.applyRenderSettings(); } }
  }
  private update(dt: number) {
    const s = this.state;
    if (!this.panel) s.playTime += dt;
    // время суток
    const timeMul = this.lying ? 12 : 1;
    if (this.online) s.gameTime = (Date.now() / 1000) % 1440; // единое время для всех игроков (1 сек = 1 игровая минута)
    else s.gameTime = (s.gameTime + dt * timeMul) % 1440;
    this.survival(dt);
    if (this.intro) { this.updateIntro(dt); this.updateWorldSystems(dt); this.emitHud(dt); return; }
    if (!this.panel) this.handleInput(dt);
    this.updatePlayer(dt);
    this.updateWorldSystems(dt);
    this.updateCamera(dt);
    this.emitHud(dt);
    this.saveT += dt; if (this.saveT > 15) { this.saveT = 0; this.save(); }
  }
  private updateWorldSystems(dt: number) {
    const inside = !!this.interior;
    // ИИ транспорт
    this.updateTraffic(dt);
    this.updatePolice(dt);
    this.updateTaxi(dt);
    this.updateService(dt);
    // пешеходы
    const vehs = this.vehicles.filter((v) => Math.abs(v.speed) > 4 && Math.abs(v.x - this.px) + Math.abs(v.z - this.pz) < 150).map((v) => ({ x: v.x, z: v.z, speed: v.speed, r: v.spec.len / 2, mine: v === this.inVeh && !this.passenger }));
    this.peds.update(dt, performance.now() / 1000, {
      px: this.px, pz: this.pz, py: this.py, playerVisible: !this.inVeh && !this.rideRemote && this.state.health > 0, inside, viewDist: this.drawDist(),
      suppress: (x, z) => this.suppressed(x, z), lightState: (n, ew) => this.lightState(n, ew), hitPlayer: (d, fx, fz, heavy) => this.combat.takeHit(d, fx, fz, { heavy }),
      foePos: (id) => { const r = this.remotes.get(id); return r && r.visible && r.hp > 0 && !r.inVeh ? { x: r.x, z: r.z } : null; },
      hitFoe: (id, d, fx, fz, heavy) => this.net?.sendEvent({ e: 'hit', t: id, d: Math.round(d), k: 'fist', hx: r2(fx), hz: r2(fz), heavy }),
      obstacles: (x, z) => this.activeCol.query(x, z, 0.3).some((b) => b.y1 > 0.5), vehicles: vehs,
    });
    this.updateDebris(dt);
    this.combat.updateFx(dt);
    this.updateSmoke(dt);
    this.updateMoneyFx(dt);
    this.updateJobs(dt);
    if (this.online) this.updateNet(dt);
    this.gpsT += dt; if (this.gpsT > 0.7) { this.gpsT = 0; this.updateGps(); }
    this.slowT += dt;
    if (this.slowT > 0.25) {
      this.slowT = 0;
      this.updateLights();
      if (!inside) this.updateChunks();
      this.updateGarages();
      this.updateKiosks();
      this.checkFines();
      this.bazaarT += 0.25; if (this.bazaarT > 5) { this.bazaarT = 0; this.updateBazaar(); }
      this.updateQuest();
      this.plantT += 0.25; if (this.plantT >= 1) { this.plantT = 0; this.updatePlants(); }
    }
    this.envT += dt; if (this.envT > 0.5) { this.envT = 0; this.updateEnvironment(); }
    this.promptT += dt; if (this.promptT > 0.12) { this.promptT = 0; this.updatePrompt(); }
    if (this.minimap) { this.miniT += dt; if (this.miniT > 0.12) { this.miniT = 0; this.drawMinimap(this.minimap); } }
    // вода
    (this.W.water.material as THREE.MeshPhongMaterial).map!.offset.y -= dt * 0.02;
  }
  // ================= ВЫЖИВАНИЕ =================
  private survival(dt: number) {
    const s = this.state; if (this.panel?.type === 'settings') return;
    const run = this.input?.down('ShiftLeft') ? 1.6 : 1;
    s.food = clamp(s.food - dt * 0.055, 0, 100);
    s.water = clamp(s.water - dt * 0.08 * run, 0, 100);
    s.energy = this.lying ? clamp(s.energy + dt * 4, 0, 100) : clamp(s.energy - dt * 0.035 * run, 0, 100);
    if (this.lying && s.health < 100) s.health = Math.min(100, s.health + dt * 0.5);
    if (s.food <= 0 || s.water <= 0 || s.energy <= 0) s.health -= dt * 0.6;
    if (this.smokeT > 0) { this.smokeT -= dt; if (this.smokeT <= 0) this.player.setItem(this.weapon); }
    if (this.drugT > 0) {
      this.drugT -= dt; s.health = Math.max(0, s.health - dt * 0.14); s.water = Math.max(0, s.water - dt * 0.1);
      if (Math.random() < dt * 2.5) this.sound.crackle();
      const cv = this.renderer.domElement;
      if (this.drugT > 0) { const k = Math.min(1, this.drugT / 6); cv.style.filter = `hue-rotate(${Math.round((performance.now() / 8) % 360)}deg) saturate(${1 + 2 * k}) contrast(${1 + 0.15 * k})`; }
      else cv.style.filter = '';
    }
    if (this.dizzyT > 0) this.dizzyT -= dt;
    if (s.health <= 0) this.faint();
  }
  private faint() {
    const s = this.state;
    if (this.rideRemote) this.exitRemoteRide(true);
    if (this.online && this.net && this.combat.lastHitBy >= 0 && performance.now() - this.combat.lastHitT < 15000) {
      const by = this.combat.lastHitBy; this.net.sendEvent({ e: 'dead', by });
      this.net.sys(`💀 ${this.net.displayName(by)} вырубил(а) ${s.nick ?? 'вас'}`);
      this.toast(`Вас вырубил игрок ${this.net.displayName(by)}`);
    }
    this.combat.reset(); this.combat.lastHitBy = -1;
    const fee = Math.min(s.money, 500);
    s.money -= fee; s.health = 60; s.food = Math.max(s.food, 40); s.water = Math.max(s.water, 40); s.energy = Math.max(s.energy, 40); s.wanted = 0;
    if (this.inVeh) this.exitVehicle(true);
    if (this.interior) { const loc = s.location; if (loc) { this.interior.dispose(); this.peds.clearStatic(); this.interior = null; this.activeCol = this.col; this.W.root.visible = true; this.vehGroup.visible = true; this.sun.visible = true; s.location = null; } }
    const hosp = this.L.buildings.filter((b) => b.kind === 'hospital').sort((a, b) => Math.hypot(a.x - this.px, a.z - this.pz) - Math.hypot(b.x - this.px, b.z - this.pz))[0];
    this.lying = false; this.carrying = false; this.job = null;
    if (hosp) this.placeOutsideAt(hosp);
    this.toast(`Вы потеряли сознание и очнулись у больницы. Лечение: $${fee}`);
  }
  damagePlayer(d: number, msg?: string) {
    this.state.health = Math.max(0, this.state.health - d);
    if (msg && Math.random() < 0.3) this.toast(msg);
  }
  // ================= ВВОД =================
  private handleInput(dt: number) {
    const I = this.input;
    if (this.camMode) {
      if (I.mouseClicked || I.pressed('Space') || I.vPressed('shutter')) this.takePhoto();
      if (I.pressed('KeyV')) this.switchCamera();
      const cs = this.settings.sensitivity * (this.mobile ? 0.006 : 0.0028);
      if (I.lookDX || I.lookDY) { this.camYaw -= I.lookDX * cs; this.camPitch = clamp(this.camPitch + I.lookDY * cs, -0.6, 0.9); }
      return;
    }
    const qHeld = I.down('KeyQ') || I.vDown('qmod');
    const v = this.inVeh;
    // оружие
    if (!qHeld) {
      WEAPON_ORDER.forEach((w, i) => { if (I.pressed('Digit' + (i + 1))) this.setWeapon(w); });
      if (I.vPressed('weapon')) this.cycleWeapon();
    }
    if (v && !this.passenger) {
      // передачи
      if (!v.isHeli && qHeld) {
        const manual = this.settings.transmission === 'manual';
        const map: Record<string, number> = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6, Backquote: 6 };
        for (const k in map) if (I.pressed(k)) {
          if (manual) { v.gear = map[k]; this.sound.gear(); }
          else if (map[k] === 1) { v.autoMode = 'N'; this.sound.gear(); }
          else if (map[k] === 2) { v.autoMode = 'D'; this.sound.gear(); }
        }
        if (manual && I.pressed('Digit0')) v.gear = 0;
      }
      if (!v.isHeli) {
        if (I.vPressed('gearUp')) { if (this.settings.transmission === 'manual') v.gear = Math.min(6, v.gear + 1); else v.autoMode = 'D'; this.sound.gear(); }
        if (I.vPressed('gearDown')) { if (this.settings.transmission === 'manual') v.gear = Math.max(0, v.gear - 1); else v.autoMode = 'N'; this.sound.gear(); }
      }
      if (I.pressed('KeyH') || I.vPressed('lights')) { v.model.setLights(!v.model.lightsOn); }
      if (I.pressed('KeyZ') || I.vPressed('autopilot')) this.toggleAutopilot();
    }
    if ((I.pressed('KeyF') || I.vPressed('enter'))) { if (this.inVeh) this.exitVehicle(); else if (this.rideRemote) this.exitRemoteRide(); else this.tryEnterVehicle(); }
    const eKey = (I.pressed('KeyE') && !(v && v.isHeli)) || I.vPressed('interact');
    if (eKey && this.prompt) this.prompt.act();
    if ((I.pressed('KeyR') || I.vPressed('work')) && this.prompt?.r) this.prompt.r();
    else if (I.pressed('KeyR') && !this.lying) this.cycleWeapon();
    if (I.pressed('KeyB') && !this.inVeh) this.togglePanel({ type: 'emotes' });
    if ((I.pressed('KeyL') || I.vPressed('rob')) && this.prompt?.l) this.prompt.l();
    if (I.vPressed('phone')) this.togglePanel({ type: 'phone' });
    if (I.vPressed('inventory')) this.togglePanel({ type: 'inventory' });
    if (I.vPressed('map')) this.togglePanel({ type: 'map', mode: 'waypoint' });
    if (I.vPressed('settings')) this.openPanel({ type: 'settings' });
    // камера
    const sens = this.settings.sensitivity * (this.mobile ? 0.006 : 0.0028);
    if (I.lookDX || I.lookDY) { this.camYaw -= I.lookDX * sens; this.camPitch = clamp(this.camPitch + I.lookDY * sens, -0.35, 1.3); this.lastLook = 0; }
    if (I.zoomDelta) this.camDist = clamp(this.camDist + I.zoomDelta * 0.6, 2, 14);
    this.lastLook += dt;
  }
  ownedWeapons() { return WEAPON_ORDER.filter((w) => w === 'fists' || this.state.inventory[w]); }
  cycleWeapon() { const o = this.ownedWeapons(); const i = o.indexOf(this.weapon); this.setWeapon(o[(i + 1) % o.length]); }
  /** стрельба из машины: прицел ПКМ, огонь ЛКМ; рука и корпус поворачиваются к камере */
  private driveByUpdate(dt: number, v: Vehicle) {
    const I = this.input; const cb = this.combat;
    if (!cb.driveBy) { cb.updateFx(0); return; }
    const panelOpen = !!this.panel;
    cb.update(dt, { attack: !panelOpen && (I.mouseClicked || I.vPressed('attack') || I.vDown('fire')), hold: !panelOpen && (I.mouseDown || I.vDown('fire')), alt: I.rmb || I.vDown('aim'), reload: I.pressed('KeyG') || I.vPressed('reload'), moving: true, moveDir: null });
    if (this.player.item !== this.weapon) this.player.setItem(this.weapon);
    if (cb.aiming || performance.now() - cb.lastShotT < 1200) {
      const rel = clamp(angleDiff(v.heading, this.camYaw), -1.9, 1.9);
      this.player.torso.rotation.y = rel * 0.75; this.player.head.rotation.y = rel * 0.25;
      const pt = -this.camPitch * 0.9 + 0.12;
      this.player.shR.rotation.set(-1.57 - pt, 0, 0); this.player.elR.rotation.set(0, 0, 0);
    }
  }
  setWeapon(w: string) {
    if (w !== 'fists' && !WEAPONS[w]) return;
    if (w !== 'fists' && !this.state.inventory[w]) { this.toast(`Нет оружия «${WEAPONS[w].name}» — купите в оружейном магазине`); return; }
    if (w === this.weapon) return;
    this.weapon = w; this.combat.reset();
    this.player.setItem(this.inVeh && !this.passenger && w === 'fists' ? 'none' : w);
    if (w !== 'fists') { this.toast(`🔫 ${WEAPONS[w].name} · ${this.combat.mag}/${this.combat.reserve}`); if (!this.combat.mag && this.combat.reserve > 0) this.combat.startReload(); }
  }
  // ================= ИГРОК =================
  private updatePlayer(dt: number) {
    const I = this.input;
    if (this.inVeh) { this.updateDriving(dt); return; }
    const ch = this.player;
    if (this.rideRemote) { this.updateRideRemote(); return; }
    if (this.camMode) {
      if (this.camMode.mode === 'selfie') this.pa = this.camYaw + Math.PI;
      ch.root.position.set(this.px, this.py, this.pz); ch.root.rotation.set(0, this.pa, 0);
      ch.pose('selfie', performance.now() / 1000); if (ch.item !== 'phone') ch.setItem('phone');
      ch.root.visible = this.camMode.mode === 'selfie';
      return;
    }
    if (this.lying) {
      const bed = this.interior?.bed;
      if (bed) { ch.root.position.set(bed.x, bed.y, bed.z); ch.root.rotation.y = bed.a; }
      ch.pose('lie', 0);
      return;
    }
    if (this.fallT > 0) {
      this.fallT -= dt;
      this.px += this.pvx * dt; this.pz += this.pvz * dt; this.pvx *= 0.92; this.pvz *= 0.92;
      { const fp = { x: this.px, z: this.pz }; this.activeCol.pushCircle(fp, 0.35, this.py, 1.7, 0.45); this.px = fp.x; this.pz = fp.z; }
      this.py = Math.max(this.activeCol.groundAt(this.px, this.pz, this.py + 0.3, 0.45, 0.25), this.py - 9 * dt);
      ch.root.position.set(this.px, this.py, this.pz); ch.pose('fall', 0);
      return;
    }
    const mv = I.move();
    if (I.pressed('KeyC') || I.vPressed('crouch')) { this.crouch = !this.crouch; }
    let run = (I.down('ShiftLeft') || I.vDown('run')) && !this.carrying;
    if (run && this.crouch && (I.down('ShiftLeft'))) this.crouch = false;
    if (this.crouch) run = false;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const rx = -fz, rz = fx;
    let dx = fx * mv.y + rx * mv.x, dz = fz * mv.y + rz * mv.x;
    const mag = Math.hypot(dx, dz);
    const inWater = !this.interior && this.isWater(this.px, this.pz);
    const cb = this.combat;
    const fighting = cb.busy || cb.blocking || cb.aiming;
    const sp = (this.crouch ? 1.5 : run && !fighting ? 6 : 2.6) * (inWater ? (run ? 0.55 : 0.85) : 1) * (this.carrying ? 0.8 : 1) * (cb.knockT > 0 ? 0 : cb.atk || cb.stagger > 0 ? 0.25 : cb.blocking ? 0.5 : cb.aiming ? 0.7 : 1);
    if (mag > 0.05) {
      dx /= Math.max(1, mag); dz /= Math.max(1, mag);
      const p = { x: this.px + dx * sp * dt, z: this.pz + dz * sp * dt };
      this.activeCol.pushCircle(p, 0.33, this.py, 1.7, 0.45);
      // столкновение с машинами
      for (const v of this.vehicles) {
        if (!this.vehGroup.visible) break;
        const ddx = p.x - v.x, ddz = p.z - v.z; if (Math.abs(ddx) + Math.abs(ddz) > 10) continue;
        const f = Math.sin(v.heading), g = Math.cos(v.heading);
        const lf = ddx * f + ddz * g, ll = ddx * g - ddz * f;
        const hl = v.spec.len / 2 + 0.3, hw = v.spec.wid / 2 + 0.3;
        if (Math.abs(lf) < hl && Math.abs(ll) < hw && this.py < v.y + v.spec.hei) {
          const pl = hl - Math.abs(lf), pw = hw - Math.abs(ll);
          if (pl < pw) { const s = Math.sign(lf); p.x += f * s * pl; p.z += g * s * pl; } else { const s = Math.sign(ll); p.x += g * s * pw; p.z += -f * s * pw; }
        }
      }
      this.px = p.x; this.pz = p.z;
      const want = Math.atan2(dx, dz);
      if (!cb.atk && !cb.aiming && !(cb.gunOut && performance.now() - cb.lastShotT < 900)) this.pa += clamp(angleDiff(this.pa, want), -10 * dt, 10 * dt);
      this.walkPhase += dt * (run ? 11 : 6.5) * Math.min(1, mag);
    }
    // прыжок и гравитация
    const ground = this.activeCol.groundAt(this.px, this.pz, this.py, 0.45, 0.25);
    const onGround = this.py <= ground + 0.05;
    if (onGround && (I.pressed('Space') || I.vPressed('jump'))) { if (this.crouch) this.crouch = false; else this.pvy = 5.2; }
    this.pvy -= 15 * dt; this.py += this.pvy * dt;
    if (this.py <= ground) { this.py = ground; this.pvy = 0; }
    if (inWater) { this.py = 0; this.pvy = 0; this.crouch = false; if (mag > 0.05) this.state.energy = Math.max(0, this.state.energy - dt * 0.12); }
    // бой
    const attack = (I.mouseClicked || I.vPressed('attack') || (cb.gunOut && I.vDown('fire'))) && !this.carrying;
    const alt = I.rmb || I.vDown('block');
    const reload = I.pressed('KeyG') || I.vPressed('reload');
    if (I.vPressed('aim')) cb.mobileAim = !cb.mobileAim;
    cb.update(dt, { attack, hold: (I.mouseDown || I.vDown('fire')) && !this.carrying, alt, reload, moving: mag > 0.05, moveDir: mag > 0.05 ? Math.atan2(dx, dz) : null });
    if (cb.aiming || (cb.gunOut && performance.now() - cb.lastShotT < 900)) this.pa += angleDiff(this.pa, this.camYaw) * Math.min(1, dt * 18);
    this.lastSpeed = mag > 0.05 ? sp : 0;
    let pose: Pose = mag > 0.05 ? (run ? 'run' : 'walk') : 'idle';
    if (this.carrying) pose = 'carry';
    if (inWater) pose = mag > 0.05 ? 'swim' : 'tread';
    let phase = this.walkPhase, lean = 0, move = 0;
    if (this.emote && (mag > 0.05 || attack || inWater || this.carrying || cb.knockT > 0 || cb.stagger > 0)) this.emote = null;
    if (this.emote) { pose = this.emote.id as Pose; phase = 0; }
    const cp = this.carrying || inWater || this.emote ? null : cb.pose(mag > 0.05, this.walkPhase);
    if (cp) { pose = cp.pose; phase = cp.phase; lean = cp.lean; move = cp.move; if (move > 0) this.walkPhase += dt * 4; }
    else if (this.smokeT > 0 && mag < 0.05) pose = 'smoke';
    if (this.crouch && !inWater && !this.carrying && cb.knockT <= 0 && cb.stagger <= 0) {
      if (pose === 'aim') pose = 'crouchaim'; else if (!cb.atk && !cb.blocking) { pose = mag > 0.05 ? 'crouchwalk' : 'crouch'; phase = this.walkPhase; }
    }
    ch.root.position.set(this.px, this.py, this.pz); ch.root.rotation.set(0, this.pa, 0); ch.root.scale.setScalar(1);
    ch.pose(pose, performance.now() / 1000, phase, lean, move);
    this.netPose = { p: pose, k: Math.round(phase * 100) / 100, pt: Math.round(lean * 100) / 100 };
  }
  addWanted(n: number, why: string) {
    const before = this.state.wanted;
    this.state.wanted = clamp(this.state.wanted + n, 0, 3);
    if (this.state.wanted > before) this.toast(`Розыск: ${'★'.repeat(this.state.wanted)} — ${why}`);
    this.noPoliceT = 0;
  }
  policeNear(r: number) { return this.vehicles.some((v) => v.role === 'police' && Math.hypot(v.x - this.px, v.z - this.pz) < r); }
  // ================= ТРАНСПОРТ: посадка =================
  private tryEnterVehicle() {
    if (this.camMode) this.stopCamera();
    if (this.interior) return;
    if (this.carrying) { this.toast('Сначала погрузите деталь'); return; }
    let best: Vehicle | null = null, bd = 4.2;
    for (const v of this.vehicles) { if (v.role === 'npcpuppet' || (v.role === 'remote' && !this.remoteOwnerOf(v))) continue; if (!v.model.group.visible) continue; const d = Math.hypot(v.x - this.px, v.z - this.pz) - v.spec.len * 0.3; const maxSp = v.role === 'traffic' || v.role === 'police' ? 9 : 4; if (d < bd && Math.abs(v.speed) < maxSp) { bd = d; best = v; } }
    if (!best) return;
    const v = best;
    if (this.taxi && v === this.taxi.v) {
      if (this.taxi.stage === 'waiting' || this.taxi.stage === 'coming') { this.taxi.stage = 'waiting'; v.ai!.mode = 'idle'; v.speed = 0; this.seat(v, true); this.openPanel({ type: 'map', mode: 'taxi' }); this.toast('Выберите на карте, куда ехать'); }
      return;
    }
    if (v.role === 'remote') { const lst = this.remoteListingOf(v); if (lst) { this.toast('Это машина на продажу — нажмите E, чтобы купить'); return; } const r = this.remoteOwnerOf(v); if (r) this.startRide(r); return; }
    if (v.owned && this.listingOfUid(v.owned.uid)) { this.toast('Машина выставлена на продажу. Снимите объявление (E)'); return; }
    if (v.role === 'rental') {
      if (this.state.money < SCOOTER_RATE) { this.toast(`Аренда самоката: $${SCOOTER_RATE}/мин — недостаточно денег`); return; }
      this.state.money -= SCOOTER_RATE; this.rental = { v, t: 0, paid: SCOOTER_RATE };
      this.toast(`🛴 Аренда началась: $${SCOOTER_RATE} в минуту. X — трюк, F — завершить`);
    }
    if (v.role === 'deco') { this.toast(v.spec.body === 'semi' ? 'Фура заперта — используется для погрузки' : 'Машина заперта — это товар продавца'); return; }
    if (v.role === 'aicombine') { this.toast('Комбайн занят работой'); return; }
    if (v.role === 'job' && v.spec.body === 'combine') { this.startCombineJob(); }
    if (v.role === 'traffic' || v.role === 'police') {
      if (v.role === 'police') this.addWanted(2, 'Угон полицейской машины'); else if (this.policeNear(60)) this.addWanted(1, 'Угон автомобиля');
      v.ai = null; v.role = 'traffic'; v.sirens = false; v.speed = 0;
      if (v.dummy) { // водитель выброшен из машины
        v.removeDummy();
        const ped = this.peds.peds.find((p) => p.kind === 'city' && p.state !== 'gone' && p.state !== 'down' && Math.hypot(p.x - this.px, p.z - this.pz) > 25) ?? this.peds.peds.find((p) => p.kind === 'city');
        if (ped) { const f = v.forward(); ped.x = v.x + f.z * (v.spec.wid / 2 + 0.9); ped.z = v.z - f.x * (v.spec.wid / 2 + 0.9); ped.state = ped.brave ? 'fight' : 'flee'; ped.timer = 8; ped.foe = undefined; ped.attackCd = 1; }
        this.toast('🚗 Вы угнали машину!');
      }
    }
    if (v.role === 'parked') {
      v.role = 'traffic';
      if (Math.random() < 0.35) { this.toast('🚨 Сработала сигнализация!'); this.sound.sirenSound(false); this.peds.panic(v.x, v.z, 20); if (this.policeNear(150)) this.addWanted(1, 'Угон автомобиля'); }
      else this.toast('🚗 Вы вскрыли машину');
    }
    this.seat(v, false);
  }
  private seat(v: Vehicle, passenger: boolean) {
    this.inVeh = v; this.passenger = passenger; this.lying = false;
    const s = passenger ? v.model.passenger : v.model.driver;
    v.model.body.add(this.player.root);
    this.player.root.position.set(s.x, s.y, s.z); this.player.root.rotation.set(0, 0, 0); this.player.root.scale.setScalar(s.scale);
    this.player.setItem('none');
    if (!passenger) { v.hasDriver = true; if (v.role === 'deco' || v.role === 'traffic') { /* угнанная */ } }
    if (v.isHeli) v.y = Math.max(v.y, this.col.groundAt(v.x, v.z, v.y + 0.5, 1, 1.5));
    this.camDist = Math.max(5, v.spec.len * 1.1 + 2.5);
    this.sound.ensure(); this.sound.door();
    if (v.owned) this.state.lastCar = v.owned.uid;
    if (!passenger) this.questEvent('vehicle');
    this.emote = null;
  }
  exitVehicle(force = false) {
    const v = this.inVeh; if (!v) return;
    if (!force) {
      if (v.isHeli && !heliLanded(v, this.col)) { this.toast('Сначала посадите вертолёт'); return; }
      if (Math.abs(v.speed) > 3 && !this.passenger) { this.toast('Остановитесь, чтобы выйти'); return; }
      if (this.passenger && this.taxi && this.taxi.v === v && this.taxi.stage === 'riding') { this.toast('Такси ещё в пути. Отмените заказ в телефоне, чтобы выйти'); return; }
    }
    if (this.autopilot) this.setAutopilot(false);
    this.scene.add(this.player.root); this.player.root.scale.setScalar(1);
    const f = v.forward(); const lx = f.z, lz = -f.x; // левая сторона (+x локально)
    const side = this.passenger ? -1 : 1;
    const cands = [[side, 0], [-side, 0], [0, -1], [0, 1]];
    let placed = false;
    for (const [sx, sz] of cands) {
      const ox = v.x + lx * sx * (v.spec.wid / 2 + 0.8) - f.x * sz * -(v.spec.len / 2 + 1) * (sz ? 1 : 0);
      const oz = v.z + lz * sx * (v.spec.wid / 2 + 0.8) - f.z * sz * -(v.spec.len / 2 + 1) * (sz ? 1 : 0);
      if (!this.col.solidAt(ox, 1, oz)) { this.px = ox; this.pz = oz; placed = true; break; }
    }
    if (!placed) { this.px = v.x; this.pz = v.z; }
    this.py = this.col.groundAt(this.px, this.pz, v.y + 2, 3); this.pa = v.heading;
    if (!this.passenger) { v.hasDriver = false; v.speed = 0; v.wheelie = 0; v.lean = 0; if (v.isHeli) v.vy = 0; }
    if (this.rental && this.rental.v === v) { const m = Math.max(1, Math.ceil((this.rental.paid / SCOOTER_RATE))); this.toast(`🛴 Аренда завершена: ${m} мин · $${this.rental.paid}`); this.rental = null; }
    if (this.taxi && this.taxi.v === v && this.passenger) {
      if (this.taxi.stage === 'arrived' || this.taxi.stage === 'waiting') { this.taxi.stage = 'leaving'; this.taxi.t = 0; v.ai = new AIDriver(); v.ai.route = [nearestNodeFast(this.L, v.x, v.z)]; v.ai.route.push(this.L.adj[v.ai.route[0]][0].n); v.ai.mode = 'wander'; }
    }
    if (v.role === 'job' && this.job?.type === 'combine') { this.toast(`Смена на комбайне окончена. Заработано: $${this.job.earned}`); this.job = null; }
    this.inVeh = null; this.passenger = false;
    this.headlight.intensity = 0; this.neonLight.intensity = 0;
    this.sound.engine(false, 0, 0, false); this.sound.heliSound(false, 0);
    this.player.setItem(this.weapon);
    this.sound.door();
  }
  // ================= ВОЖДЕНИЕ =================
  private updateDriving(dt: number) {
    const v = this.inVeh!; const I = this.input;
    if (this.passenger) {
      this.px = v.x; this.pz = v.z; this.py = v.y;
      this.player.pose('passenger', 0);
      this.driveByUpdate(dt, v);
      if (v.isHeli) return;
      return;
    }
    const mv = I.move();
    const throttle = Math.max(0, Math.max(mv.y, I.vDown('gas') ? 1 : 0, I.down('KeyW') || I.down('ArrowUp') ? 1 : 0));
    const brake = Math.max(0, Math.max(-mv.y, I.vDown('brake') ? 1 : 0));
    const steer = clamp(mv.x + (I.vDown('steerR') ? 1 : 0) - (I.vDown('steerL') ? 1 : 0), -1, 1);
    let up = 0;
    if (v.isHeli) { if (I.down('KeyQ') || I.vDown('up')) up += 1; if (I.down('KeyE') || I.vDown('down')) up -= 1; }
    const wheelie = (I.down('KeyX') || I.vDown('wheelie')) && v.canStunt;
    let res: DriveResult = { impact: 0, nx: 0, nz: 0 };
    if (this.autopilot && v.ai) {
      if (brake > 0.5 || Math.abs(steer) > 0.5) { this.setAutopilot(false); this.toast('Автопилот отключён'); }
      else {
        v.ai.step(v, dt, this.aiCtx());
        const p = { x: v.x, z: v.z }; const h = this.col.pushCircle(p, v.spec.wid * 0.55, v.y, 1.6, 0.55); if (h) { v.x = p.x; v.z = p.z; v.speed *= 0.5; }
        v.y += (this.col.groundAt(v.x, v.z, v.y, 0.6, 0.5) - v.y) * Math.min(1, dt * 10);
        v.model.animate(v.speed * dt, v.steer * 0.5); v.mileage += Math.abs(v.speed * dt);
        v.gear = v.speed < 0.5 ? 1 : Math.min(6, 1 + Math.floor(v.speed / (v.spec.maxSpeed / 6)));
      }
    }
    if (!this.autopilot) res = playerDrive(v, { throttle, brake, steer, handbrake: I.down('Space') || I.vDown('handbrake'), wheelie, up }, dt, this.col, this.settings.transmission === 'manual', (x, z) => this.isWater(x, z));
    if (v.isHeli) v.hasDriver = true;
    v.sync();
    // столкновения
    if (res.impact > 6) this.crash(v, res.impact);
    if (Math.abs(v.slip) > 0.25 && Math.abs(v.speed) > 6) { this.tireSmokeT -= dt; if (this.tireSmokeT <= 0) { this.tireSmokeT = 0.04; this.spawnSmoke(v); } }
    if (res.flip && this.inVeh === v) {
      this.sound.crash(10); this.spawnDebris(v); v.condition = Math.max(0, v.condition - 0.08);
      const sp = Math.max(5, Math.abs(v.speed)); v.speed *= 0.3;
      this.exitVehicle(true); this.pvx = Math.sin(v.heading) * sp * 0.5; this.pvz = Math.cos(v.heading) * sp * 0.5; this.fallT = 1.8;
      this.damagePlayer(8); this.toast('💥 Мотоцикл перевернулся — вы упали!');
    } else if (res.stunt) {
      const bonus = Math.round(res.stunt.t * 14 + res.stunt.dist * 0.5);
      this.state.money += bonus; this.sound.coin();
      this.toast(`${res.stunt.kind === 'Дрифт' ? '💨' : '🏍'} ${res.stunt.kind}: ${res.stunt.t.toFixed(1)} с · ${Math.round(res.stunt.dist)} м · +$${bonus}`);
    }
    this.vehicleCollisions(v, dt);
    this.px = v.x; this.pz = v.z; this.py = v.y; this.pa = v.heading;
    if (this.job?.type === 'combine' && v.role === 'job') this.harvest(v);
    // поза
    this.player.pose(seatPose(v.model.driver, 0), 0, 0, v.isRide ? v.lean : -v.steer);
    if (this.rental && this.rental.v === v) {
      this.rental.t += dt;
      if (this.rental.t >= 60) { this.rental.t -= 60; if (this.state.money < SCOOTER_RATE) { this.toast('Недостаточно денег — аренда завершена'); this.exitVehicle(true); return; } this.state.money -= SCOOTER_RATE; this.rental.paid += SCOOTER_RATE; }
    }
    this.driveByUpdate(dt, v);
    // фары
    const lights = v.model.lightsOn;
    if (lights) {
      const f = v.forward();
      this.headlight.position.set(v.x + f.x * v.spec.len * 0.5, v.y + 0.9, v.z + f.z * v.spec.len * 0.5);
      this.headlight.target.position.set(v.x + f.x * 20, v.y, v.z + f.z * 20);
      this.headlight.color.set(v.model.tuning.lights); this.headlight.intensity = 30;
    } else this.headlight.intensity = 0;
    if (v.model.tuning.neon) { this.neonLight.color.set(v.model.tuning.neon); this.neonLight.position.set(v.x, v.y + 0.2, v.z); this.neonLight.intensity = this.isNight() ? 3 : 1; } else this.neonLight.intensity = 0;
    // звук
    if (v.isHeli) this.sound.heliSound(true, v.rotorSpeed); else this.sound.engine(true, v.rpm, v.throttle, !!v.spec.ev);
    if (v.owned) { v.owned.mileage = Math.round(v.mileage); v.owned.fuel = v.fuel; v.owned.condition = v.condition; }
    if (v.fuel <= 0 && Math.random() < 0.005) this.toast('Бак пуст — заправьтесь на АЗС');
  }
  private crash(v: Vehicle, impact: number) {
    this.sound.crash(impact);
    v.condition = Math.max(0, v.condition - impact * 0.012);
    const n = impact > 18 ? 3 : impact > 12 ? 2 : impact > 7 ? 1 : 0;
    for (let i = 0; i < n; i++) this.spawnDebris(v);
    if (impact > 20 && Math.random() < 0.5) this.spawnDebris(v, true);
    if (v.isRide && impact > 9 && v === this.inVeh) { // вылет с мотоцикла
      const sp = Math.max(6, impact);
      this.exitVehicle(true);
      this.pvx = Math.sin(v.heading) * sp * 0.6; this.pvz = Math.cos(v.heading) * sp * 0.6; this.fallT = 1.8;
      this.damagePlayer(impact * 1.5); this.toast('Вы вылетели с мотоцикла!');
    } else if (v === this.inVeh) this.damagePlayer(impact * 0.4);
    if (v.owned) v.owned.missing = v.model.missingParts();
  }
  spawnDebris(v: Vehicle, wheel = false) {
    const d = wheel ? v.model.detachWheel() : v.model.detach();
    if (!d) return;
    const local = d.local.clone();
    const wp = local.applyMatrix4(v.model.group.matrixWorld);
    d.mesh.position.copy(wp); d.mesh.rotation.y = v.heading;
    this.scene.add(d.mesh);
    const f = v.forward();
    this.debris.push({ obj: d.mesh, vx: f.x * v.speed * 0.6 + (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, vz: f.z * v.speed * 0.6 + (Math.random() - 0.5) * 3, wx: (Math.random() - 0.5) * 8, wz: (Math.random() - 0.5) * 8, rest: false });
    while (this.debris.length > 70) { const o = this.debris.shift()!; this.scene.remove(o.obj); o.obj.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh && m.geometry !== T.box) m.geometry.dispose(); }); }
    if (v.owned) v.owned.missing = v.model.missingParts();
  }
  private updateDebris(dt: number) {
    for (const d of this.debris) {
      if (d.rest) continue;
      d.vy -= 15 * dt;
      d.obj.position.x += d.vx * dt; d.obj.position.y += d.vy * dt; d.obj.position.z += d.vz * dt;
      d.obj.rotation.x += d.wx * dt; d.obj.rotation.z += d.wz * dt;
      const g = this.col.groundAt(d.obj.position.x, d.obj.position.z, d.obj.position.y, 0.3, 0.1) + 0.06;
      if (d.obj.position.y < g) {
        d.obj.position.y = g; d.vy = -d.vy * 0.3; d.vx *= 0.6; d.vz *= 0.6; d.wx *= 0.5; d.wz *= 0.5;
        if (Math.abs(d.vy) < 0.6 && Math.hypot(d.vx, d.vz) < 0.4) { d.rest = true; d.obj.rotation.x = Math.round(d.obj.rotation.x / Math.PI) * Math.PI; d.obj.rotation.z = Math.round(d.obj.rotation.z / Math.PI) * Math.PI; }
      }
    }
  }
  private vehicleCollisions(v: Vehicle, dt: number) {
    for (const o of this.vehicles) {
      if (o === v || !o.model.group.visible) continue;
      const dx = o.x - v.x, dz = o.z - v.z;
      if (Math.abs(dx) + Math.abs(dz) > 16) continue;
      if (v.isHeli && v.y - o.y > o.spec.hei) continue;
      // ближайшие точки осей
      const f1 = v.forward(), f2 = o.forward();
      let best = Infinity, bx = 0, bz = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const ax = v.x + f1.x * i * (v.spec.len / 2 - v.spec.wid / 2), az = v.z + f1.z * i * (v.spec.len / 2 - v.spec.wid / 2);
        const cx = o.x + f2.x * j * (o.spec.len / 2 - o.spec.wid / 2), cz = o.z + f2.z * j * (o.spec.len / 2 - o.spec.wid / 2);
        const d = Math.hypot(cx - ax, cz - az); if (d < best) { best = d; bx = cx - ax; bz = cz - az; }
      }
      const minD = (v.spec.wid + o.spec.wid) / 2 * 0.95;
      if (best >= minD) continue;
      const nx = bx / (best || 1), nz = bz / (best || 1), push = minD - best;
      const movable = o.role === 'traffic' || o.role === 'police' || o.role === 'taxi' || o.role === 'service';
      if (movable) { v.x -= nx * push * 0.5; v.z -= nz * push * 0.5; o.x += nx * push * 0.5; o.z += nz * push * 0.5; }
      else { v.x -= nx * push; v.z -= nz * push; o.x += nx * push * 0.15; o.z += nz * push * 0.15; }
      o.sync();
      const rel = Math.abs((f1.x * v.speed - f2.x * o.speed) * nx + (f1.z * v.speed - f2.z * o.speed) * nz);
      if (rel > 3) {
        v.speed *= 0.4; o.speed *= 0.3; o.shock = 3;
        if (rel > 6) { this.crash(v, rel); o.condition -= rel * 0.01; if (rel > 9) this.spawnDebris(o); }
        if (o.role === 'police' || o.spec.service === 'police' || o.spec.service === 'ambulance') this.addWanted(1, 'Столкновение со служебным автомобилем');
        else if (o.role === 'traffic' && rel > 6) this.addFine(150, 'ДТП');
      }
    }
    void dt;
  }
  // ================= АВТОПИЛОТ =================
  private toggleAutopilot() {
    const v = this.inVeh; if (!v) return;
    if (!v.spec.autopilot) { this.toast('Автопилот есть только у электромобилей (Электра, Лунь, Тайфун)'); return; }
    if (this.autopilot) { this.setAutopilot(false); this.toast('Автопилот выключен'); return; }
    if (!this.destination) { this.openPanel({ type: 'map', mode: 'autopilot' }); this.toast('Выберите точку назначения на карте'); return; }
    this.startAutopilot();
  }
  private routeFor(v: Vehicle, dest: { x: number; z: number }) {
    const L = this.L;
    const cur = nearestRoadPoint(L, v.x, v.z);
    const ce = L.edges[cur.e];
    const A = L.nodes[ce.a], B = L.nodes[ce.b];
    const f = v.forward();
    const toB = (B.x - A.x) * f.x + (B.z - A.z) * f.z;
    const ahead = toB >= 0 ? ce.b : ce.a, behind = toB >= 0 ? ce.a : ce.b;
    const dr = nearestRoadPoint(L, dest.x, dest.z);
    const de = L.edges[dr.e];
    const ai = new AIDriver();
    let bestRoute: number[] | null = null; let bestEnd = 0;
    for (const end of [de.a, de.b]) {
      if (!ai.setRoute(L, ahead, end, null)) continue;
      if (!bestRoute || ai.route.length < bestRoute.length) { bestRoute = [...ai.route]; bestEnd = end; }
    }
    if (!bestRoute) return null;
    const other = bestEnd === de.a ? de.b : de.a;
    const E = L.nodes[bestEnd], O = L.nodes[other];
    const dx = O.x - E.x, dz = O.z - E.z, l = Math.hypot(dx, dz) || 1;
    const off = de.kind === 'highway' ? 4 : de.kind === 'city' || de.kind === 'avenue' ? LANE_OFF : 2.1;
    const final = { x: dr.x + (-dz / l) * off, z: dr.z + (dx / l) * off };
    ai.route = [behind, ...bestRoute]; ai.k = 0; ai.mode = 'route'; ai.final = final; ai.arrived = false;
    if (ai.route.length >= 2 && ai.route[0] === ai.route[1]) ai.route.shift();
    if (ai.route.length < 2) ai.route = [behind, ahead];
    return ai;
  }
  private startAutopilot() {
    const v = this.inVeh!;
    const ai = this.routeFor(v, this.destination!);
    if (!ai) { this.toast('Маршрут не найден'); return; }
    ai.onArrive = () => { this.setAutopilot(false); v.speed = 0; this.toast('Автопилот: вы прибыли'); this.destination = null; };
    v.ai = ai; this.autopilot = true; this.toast('Автопилот включён: маршрут построен');
  }
  setAutopilot(on: boolean) { this.autopilot = on; if (!on && this.inVeh && (this.inVeh.role === 'owned' || this.inVeh.role === 'traffic')) this.inVeh.ai = null; }
  private aiCtx(): AICtx { return { L: this.L, vehicles: this.vehicles, player: { x: this.px, z: this.pz, inVehicle: this.inVeh }, lightState: (n, ew) => this.lightState(n, ew), rand: () => this.rng.next(), col: this.col }; }
  // ================= ТРАФИК =================
  private updateTraffic(dt: number) {
    const ctx = this.aiCtx();
    let count = 0;
    for (const v of [...this.vehicles]) {
      if (v === this.inVeh && !this.passenger) continue;
      if (v.role === 'aicombine') { this.updateAICombine(v, dt); continue; }
      if (!v.ai) {
        if (v.isHeli && v !== this.inVeh) { if (v.rotorSpeed > 0) { v.rotorSpeed = Math.max(0, v.rotorSpeed - dt * 0.3); if (v.model.rotor) v.model.rotor.rotation.y += v.rotorSpeed * dt * 30; } }
        continue;
      }
      const d = Math.abs(v.x - this.px) + Math.abs(v.z - this.pz);
      if (v.role === 'traffic' || (v.role === 'police' && !v.sirens)) {
        count++;
        if (this.online && this.suppressed(v.x, v.z)) { this.removeVehicle(v); continue; }
        if (d > Math.max(380, this.drawDist() + 40)) { this.removeVehicle(v); continue; }
      }
      if (d > 300 && v.role !== 'taxi' && v.role !== 'service' && !v.sirens) continue; // далеко — заморожен
      v.ai.step(v, dt, ctx);
      if (v.role === 'police' && v.sirens) { const p = { x: v.x, z: v.z }; const h = this.col.pushCircle(p, v.spec.wid * 0.55, 0, 1.6, 0.55); if (h) { v.x = p.x; v.z = p.z; } }
      v.y += (this.col.groundAt(v.x, v.z, v.y, 0.6, 0.4) - v.y) * Math.min(1, dt * 8);
      if (d < 200) { v.model.animate(v.speed * dt, v.steer * 0.6); v.sync(); if (v.sirens) v.model.sirens(performance.now() / 1000); }
    }
    this.aiT += dt;
    if (count < this.trafficGoal && this.aiT > 0.3 && !this.interior) { this.aiT = 0; this.spawnTraffic(this.vehicles.length < 5); }
  }
  private updateAICombine(v: Vehicle, dt: number) {
    const ext = v as Vehicle & { lane: number; field: { x0: number; x1: number; z0: number; z1: number } };
    const f = ext.field; const laneX = f.x0 + 6 + ext.lane * 8;
    const goingDown = ext.lane % 2 === 0;
    const tz = goingDown ? f.z1 - 6 : f.z0 + 6;
    const dx = laneX - v.x, dz = tz - v.z;
    if (Math.hypot(dx, dz) < 2) { ext.lane = (ext.lane + 1) % Math.floor((f.x1 - f.x0 - 12) / 8); }
    const want = Math.atan2(dx, dz);
    v.heading += clamp(angleDiff(v.heading, want), -0.8 * dt, 0.8 * dt);
    v.speed = 3; v.x += Math.sin(v.heading) * v.speed * dt; v.z += Math.cos(v.heading) * v.speed * dt;
    if (v.model.reel) v.model.reel.rotation.x += dt * 4;
    v.model.animate(v.speed * dt, 0); v.sync();
  }
  // ================= ПОЛИЦИЯ =================
  private updatePolice(dt: number) {
    const s = this.state;
    const chasers = this.vehicles.filter((v) => v.role === 'police' && v.sirens);
    if (s.wanted > 0 && !this.interior) {
      if (chasers.length < s.wanted) {
        const nodes = this.L.nodes.filter((n) => { const d = Math.hypot(n.x - this.px, n.z - this.pz); return d > 110 && d < 220; });
        if (nodes.length) {
          const n = nodes[Math.floor(this.rng.next() * nodes.length)];
          const v = new Vehicle('police', 'police'); v.place(n.x + 3, n.z + 3, 0); v.hasDriver = true; v.addDummyDriver();
          v.ai = new AIDriver(); v.ai.mode = 'chase'; v.ai.obeyLights = false; v.ai.route = [n.id, this.L.adj[n.id][0].n];
          v.ai.chaseTarget = () => ({ x: this.inVeh ? this.inVeh.x : this.px, z: this.inVeh ? this.inVeh.z : this.pz });
          v.sirens = true; this.addVehicle(v);
        }
      }
      const near = chasers.some((v) => Math.hypot(v.x - this.px, v.z - this.pz) < 120);
      if (near) this.noPoliceT = 0; else this.noPoliceT += dt;
      if (this.noPoliceT > 30) { s.wanted--; this.noPoliceT = 0; this.toast(s.wanted ? `Розыск снижен: ${'★'.repeat(s.wanted)}` : 'Вы ушли от погони'); }
      // задержание
      const slow = this.inVeh ? Math.abs(this.inVeh.speed) < 1.5 : true;
      const close = chasers.some((v) => Math.hypot(v.x - this.px, v.z - this.pz) < 7.5 && Math.abs(v.speed) < 3);
      if (slow && close) this.bustT += dt; else this.bustT = Math.max(0, this.bustT - dt);
      if (this.bustT > 3) this.busted();
    } else this.bustT = 0;
    if (s.wanted === 0) for (const v of chasers) { v.sirens = false; v.model.sirens(0); v.ai!.mode = 'wander'; v.ai!.obeyLights = true; v.ai!.route = [nearestNodeFast(this.L, v.x, v.z)]; v.ai!.route.push(this.L.adj[v.ai!.route[0]][0].n); v.ai!.k = 0; v.model.rebuild(); }
    this.sound.sirenSound(chasers.some((v) => Math.hypot(v.x - this.px, v.z - this.pz) < 150) && s.wanted > 0);
  }
  private busted() {
    const s = this.state; const fine = 500 * s.wanted;
    if (this.inVeh) this.exitVehicle(true);
    s.money = Math.max(0, s.money - fine); s.wanted = 0; this.bustT = 0;
    const st = this.L.buildings.filter((b) => b.kind === 'police').sort((a, b) => Math.hypot(a.x - this.px, a.z - this.pz) - Math.hypot(b.x - this.px, b.z - this.pz))[0];
    if (st) this.placeOutsideAt(st);
    this.toast(`Вас задержали. Штраф $${fine} списан`);
  }
  addFine(amount: number, reason: string) {
    this.state.fines.push({ amount, reason, t: Date.now() }); this.toast(`Штраф $${amount}: ${reason} (оплата в телефоне)`); }
  private checkFines() {
    const now = Date.now();
    for (const f of this.state.fines) if (now - f.t > 10 * 60 * 1000) { f.t = now; if (this.state.wanted < 1) { this.state.wanted = 1; this.toast('Неоплаченный штраф: объявлен розыск ★'); } }
  }
  payFines(): boolean {
    const total = this.state.fines.reduce((a, f) => a + f.amount, 0);
    if (!total) { this.toast('Штрафов нет'); return false; }
    if (this.state.money < total) { this.toast('Недостаточно денег'); return false; }
    this.state.money -= total; this.state.fines = []; this.toast(`Штрафы оплачены: $${total}`); this.sound.coin(); return true;
  }
  // ================= ТАКСИ И СЛУЖБЫ =================
  callTaxi() {
    if (this.interior) { this.toast('Выйдите на улицу, чтобы вызвать такси'); return; }
    if (this.taxi && this.taxi.stage !== 'leaving') { this.toast('Такси уже вызвано'); return; }
    const n = this.pickSpawnNode(90, 200); if (n < 0) { this.toast('Нет свободных машин'); return; }
    const v = new Vehicle('taxi', 'taxi'); const N0 = this.L.nodes[n]; v.place(N0.x, N0.z, 0); v.hasDriver = true; v.addDummyDriver();
    const spot = this.roadSpotNear(this.px, this.pz);
    const ai = this.routeFor(v, spot);
    if (!ai) { v.dispose(); this.toast('Такси не может проехать к вам'); return; }
    ai.onArrive = () => { if (this.taxi?.v === v && this.taxi.stage === 'coming') { this.taxi.stage = 'waiting'; v.speed = 0; this.toast('Такси прибыло и ждёт вас (F — сесть)'); } };
    v.ai = ai; ai.obeyLights = true; this.addVehicle(v);
    this.taxi = { v, stage: 'coming', dist: 0, t: 0 };
    this.toast('Такси вызвано — следите за значком 🚕 на карте');
  }
  cancelTaxi() {
    const t = this.taxi; if (!t) { this.toast('Нет активного заказа'); return; }
    if (t.stage === 'riding') {
      const fare = Math.round(3 + (t.dist / 1000) * 10);
      this.state.money -= Math.min(this.state.money, fare); t.v.ai!.mode = 'idle'; t.v.speed = 0; t.stage = 'arrived';
      this.toast(`Поездка прервана. Оплата $${fare}. Можно выйти (F)`); return;
    }
    if (this.passenger && this.inVeh === t.v) { t.stage = 'arrived'; this.exitVehicle(true); }
    t.stage = 'leaving'; t.t = 0; t.v.ai = new AIDriver(); t.v.ai.route = [nearestNodeFast(this.L, t.v.x, t.v.z)]; t.v.ai.route.push(this.L.adj[t.v.ai.route[0]][0].n); t.v.ai.mode = 'wander';
    this.toast('Заказ такси отменён');
  }
  private taxiGo(dest: { x: number; z: number }) {
    const t = this.taxi; if (!t) return;
    const ai = this.routeFor(t.v, dest);
    if (!ai) { this.toast('Точка недоступна — выберите другую'); this.openPanel({ type: 'map', mode: 'taxi' }); return; }
    ai.onArrive = () => {
      if (!this.taxi || this.taxi.v !== t.v) return;
      const fare = Math.round(5 + (t.dist / 1000) * 12);
      const pay = Math.min(this.state.money, fare); this.state.money -= pay;
      t.stage = 'arrived'; t.v.speed = 0; this.destination = null; this.gpsRoute = null; this.toast(`Прибыли! Стоимость поездки $${fare}. Нажмите F, чтобы выйти`); this.sound.coin();
    };
    t.v.ai = ai; t.stage = 'riding'; t.dist = 0; this.toast('Едем! Такси построило маршрут');
  }
  private updateTaxi(dt: number) {
    const t = this.taxi; if (!t) return;
    t.dist += Math.abs(t.v.speed * dt);
    if (t.stage === 'leaving') { t.t += dt; if (t.t > 25 || Math.hypot(t.v.x - this.px, t.v.z - this.pz) > 250) { if (this.inVeh !== t.v) this.removeVehicle(t.v); this.taxi = null; } }
  }
  private pickSpawnNode(minD: number, maxD: number) {
    const c = this.L.nodes.filter((n) => { const d = Math.hypot(n.x - this.px, n.z - this.pz); return d > minD && d < maxD && n.gi !== undefined; });
    const c2 = c.length ? c : this.L.nodes.filter((n) => { const d = Math.hypot(n.x - this.px, n.z - this.pz); return d > 40 && d < maxD * 2; });
    return c2.length ? c2[Math.floor(this.rng.next() * c2.length)].id : -1;
  }
  callService(kind: 'police' | 'ambulance') {
    if (this.interior) { this.toast('Выйдите на улицу — машина подъедет к вам'); return; }
    if (this.service) { this.toast('Служба уже едет'); return; }
    const n = this.pickSpawnNode(90, 220); if (n < 0) return;
    const v = new Vehicle(kind === 'police' ? 'police' : 'ambulance', 'service'); const N0 = this.L.nodes[n]; v.place(N0.x, N0.z, 0); v.hasDriver = true; v.addDummyDriver();
    const ai = this.routeFor(v, this.roadSpotNear(this.px, this.pz)); if (!ai) { v.dispose(); return; }
    ai.obeyLights = false; ai.speedMul = 1.3; v.sirens = true; v.ai = ai; this.addVehicle(v);
    ai.onArrive = () => {
      if (kind === 'ambulance') { const fee = Math.min(this.state.money, 250); this.state.money -= fee; this.state.health = 100; this.toast(`Скорая помощь оказала помощь. Счёт: $${fee}`); }
      else this.toast('Патруль прибыл: всё спокойно');
      v.sirens = false; v.model.rebuild(); if (this.service) this.service.t = 0;
    };
    this.service = { v, kind, t: 0 };
    this.toast(kind === 'police' ? 'Полиция выехала к вам' : 'Скорая выехала к вам');
  }
  private updateService(dt: number) {
    const s = this.service; if (!s) return;
    s.t += dt;
    if (s.v.ai?.arrived && s.t > 8) { s.v.ai = new AIDriver(); s.v.ai.route = [nearestNodeFast(this.L, s.v.x, s.v.z)]; s.v.ai.route.push(this.L.adj[s.v.ai.route[0]][0].n); s.v.ai.mode = 'wander'; s.t = 0; (s as { done?: boolean }).done = true; }
    if ((s as { done?: boolean }).done && s.t > 20) { this.removeVehicle(s.v); this.service = null; }
    if (s.t > 120) { this.removeVehicle(s.v); this.service = null; }
  }
  deliverCar(uidv: string) {
    if (this.interior) { this.toast('Выйдите на улицу'); return; }
    const v = this.vehicles.find((x) => x.owned?.uid === uidv); if (!v) return;
    if (v === this.inVeh) { this.toast('Вы уже в этой машине'); return; }
    if (this.state.money < 150) { this.toast('Доставка стоит $150'); return; }
    this.state.money -= 150;
    const spot = v.isHeli ? this.freeSpotNear(this.px + 8, this.pz + 8) : this.roadSpotNear(this.px, this.pz);
    v.place(spot.x, spot.z, (spot as { a?: number }).a ?? 0, this.col.groundAt(spot.x, spot.z, 2, 3)); v.speed = 0;
    this.toast(`${v.spec.name} доставлен к вам ($150)`); this.sound.coin();
  }
  // ================= СВЕТОФОРЫ / ОКРУЖЕНИЕ =================
  isNight() { const h = this.state.gameTime / 60; return h >= 21 || h < 6; }
  lightState(node: number, ew: boolean): 'green' | 'yellow' | 'red' | 'flash' {
    const h = this.state.gameTime / 60;
    if (h >= 1 && h < 5) return 'flash';
    const n = this.L.nodes[node];
    const off = (((n.gi ?? 0) * 7 + (n.gj ?? 0) * 13) % 4) * 3;
    const t = (performance.now() / 1000 + off) % 24;
    if (!ew) return t < 10 ? 'green' : t < 12 ? 'yellow' : 'red';
    return t < 12 ? 'red' : t < 22 ? 'green' : 'yellow';
  }
  private lcol = { r: new THREE.Color(0xff2020), y: new THREE.Color(0xffc400), g: new THREE.Color(0x20ff60), off: new THREE.Color(0x202020) };
  private updateLights() {
    const W = this.W; let changed = false;
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    W.lights.forEach((lt, li) => {
      const ns = this.lightState(lt.node, false), ew = this.lightState(lt.node, true);
      const code = ns === 'flash' ? (blink ? 90 : 91) : ['green', 'yellow', 'red'].indexOf(ns) * 3 + ['green', 'yellow', 'red'].indexOf(ew);
      if (code === lt.state) return;
      lt.state = code; changed = true;
      for (let d = 0; d < 4; d++) {
        const st = d < 2 ? ew : ns; // направления 0,1 — движение по X
        const base = (li * 4 + d) * 3;
        const on = (c: number) => (st === 'flash' ? c === 1 && blink : (st === 'red' && c === 0) || (st === 'yellow' && c === 1) || (st === 'green' && c === 2));
        W.bulbs.setColorAt(base, on(0) ? this.lcol.r : this.lcol.off);
        W.bulbs.setColorAt(base + 1, on(1) ? this.lcol.y : this.lcol.off);
        W.bulbs.setColorAt(base + 2, on(2) ? this.lcol.g : this.lcol.off);
      }
    });
    if (changed && W.bulbs.instanceColor) W.bulbs.instanceColor.needsUpdate = true;
  }
  private updateChunks() {
    const cx = this.camera.position.x, cz = this.camera.position.z, dd = this.drawDist() + CHUNK * 0.71;
    for (const c of this.W.chunks) c.group.visible = Math.hypot(c.cx - cx, c.cz - cz) < dd;
    const vd = this.drawDist() * 0.75;
    for (const v of this.vehicles) if (v.role === 'parked' || v.role === 'rental' || v.role === 'deco' || v.role === 'job' || (v.owned && v !== this.inVeh)) v.model.group.visible = Math.abs(v.x - cx) + Math.abs(v.z - cz) < vd;
  }
  private updateEnvironment() {
    const h = this.state.gameTime / 60;
    const sunH = Math.sin(((h - 6) / 12) * Math.PI); // >0 день
    const day = clamp(sunH * 1.4 + 0.15, 0, 1);
    const nightF = 1 - clamp(day * 1.8, 0, 1);
    const dusk = clamp(1 - Math.abs(sunH) * 3.2, 0, 1); // рассвет/закат
    const inside = !!this.interior;
    const warm = new THREE.Color(0xffa860), white = new THREE.Color(0xfff6e8);
    this.sun.color.copy(white).lerp(warm, dusk * 0.8);
    this.sun.intensity = 0.15 + day * 2.4;
    this.hemi.intensity = inside ? 0.7 : 0.2 + day * 0.9;
    const top = new THREE.Color(0x0a1230).lerp(new THREE.Color(0x2f6fd0), day);
    const hor = new THREE.Color(0x1a2340).lerp(new THREE.Color(0xc4def4), day).lerp(new THREE.Color(0xff9f6b), dusk * 0.65);
    this.hemi.color.copy(hor).lerp(new THREE.Color(0xffffff), 0.3); this.hemi.groundColor.set(0x4a5a3a).multiplyScalar(0.4 + day * 0.6);
    const ang = ((h - 6) / 12) * Math.PI;
    this.tmpV.set(Math.cos(ang) * 80, Math.sin(ang) * 120, 40);
    if (this.skyMat) {
      this.skyMat.uniforms.top.value.copy(top); this.skyMat.uniforms.horizon.value.copy(hor);
      this.skyMat.uniforms.bottom.value.copy(hor).multiplyScalar(0.6);
      this.skyMat.uniforms.sunDir.value.copy(this.tmpV).normalize();
      this.skyMat.uniforms.sunColor.value.copy(white).lerp(warm, dusk).multiplyScalar(sunH > -0.05 ? 1 : 0);
    }
    if (this.sky) this.sky.visible = !inside;
    if (this.stars) { this.stars.visible = !inside && nightF > 0.05; (this.stars.material as THREE.PointsMaterial).opacity = nightF; }
    if (this.clouds) { this.clouds.visible = !inside; for (const c of this.clouds.children) ((c as THREE.Sprite).material as THREE.SpriteMaterial).color.copy(hor).lerp(new THREE.Color(0xffffff), day * 0.75); }
    if (!inside) { this.scene.background = hor.clone(); (this.scene.fog as THREE.Fog).color.copy(hor); }
    if (this.scene.environment) this.scene.environmentIntensity = 0.25 + day * 0.75;
    const tx = this.inVeh ? this.inVeh.x : this.px, tz = this.inVeh ? this.inVeh.z : this.pz;
    this.sun.position.set(tx + this.tmpV.x, Math.max(20, this.tmpV.y), tz + this.tmpV.z); this.sun.target.position.set(tx, 0, tz);
    allMaterials().forEach((m, k) => {
      if (m.userData?.pool) { (m as THREE.MeshBasicMaterial).opacity = nightF * 0.85; return; }
      if (m.userData?.cone) { (m as THREE.MeshBasicMaterial).opacity = nightF * 0.07; return; }
      const lm = m as THREE.MeshLambertMaterial; if (lm.userData?.night) lm.emissiveIntensity = (k === 'lamp' ? 2.2 : 1.1) * nightF;
    });
    this.peds.setBeachDay(h >= 7 && h < 21);
    // настоящий свет от ближайших фонарей
    const cx = this.camera.position.x, cz = this.camera.position.z;
    const near = nightF > 0.25 && !inside ? this.lampHeads.filter((l) => Math.abs(l.x - cx) < 70 && Math.abs(l.z - cz) < 70).sort((a, b) => (a.x - cx) ** 2 + (a.z - cz) ** 2 - (b.x - cx) ** 2 - (b.z - cz) ** 2) : [];
    this.lampLights.forEach((l, i) => { const p = near[i]; if (p) { l.position.set(p.x, 5.6, p.z); l.intensity = 22 * nightF; } else l.intensity = 0; });
  }
  private updateGarages() {
    this.L.garages.forEach((g, i) => {
      const owned = this.state.garages.includes(g.id);
      const tx = this.inVeh ? this.inVeh.x : this.px, tz = this.inVeh ? this.inVeh.z : this.pz;
      const open = owned && Math.hypot(tx - g.x, tz - g.gateZ) < 14;
      const gate = this.W.garageGates[i];
      gate.position.y = open ? 2.85 : 1.3; gate.scale.y = open ? 0.4 : 2.6;
      const dyn = this.col.dynamic.find((b) => b.tag === 'gate' + g.id);
      if (dyn) dyn.y1 = open ? 0 : 2.6;
    });
  }
  private updateKiosks() {
    const now = Date.now();
    for (const k of this.state.kiosks) {
      const kt = KIOSK_TYPES[this.L.kiosks[k.id].type];
      const periods = Math.floor((now - k.last) / (KIOSK_PERIOD * 1000));
      if (periods > 0) { k.acc = Math.min(kt.income * KIOSK_MAX_PERIODS, k.acc + periods * kt.income); k.last += periods * KIOSK_PERIOD * 1000; }
    }
  }
  isWater(x: number, z: number) { return Math.abs(x - this.L.river.center(z)) < this.L.river.half - 2; }
  // ================= ВЗАИМОДЕЙСТВИЯ =================
  private updatePrompt() {
    this.prompt = this.findPrompt();
  }
  private findPrompt(): Prompt | null {
    const px = this.px, pz = this.pz;
    if (this.intro) return null;
    if (this.rideRemote) return { text: 'F — выйти из машины', keys: ['F'], act: () => this.exitRemoteRide() };
    if (this.lying) return { text: 'E — встать · I — еда из холодильника', keys: ['E'], act: () => { this.lying = false; if (this.interior?.bed) { this.px = this.interior.bed.x + 1.2; this.pz = this.interior.bed.z; } } };
    if (this.inVeh) {
      const v = this.inVeh;
      if (this.passenger) {
        if (this.taxi?.v === v && this.taxi.stage === 'waiting') return { text: 'E — выбрать точку на карте', keys: ['E'], act: () => this.openPanel({ type: 'map', mode: 'taxi' }) };
        if (this.taxi?.v === v && this.taxi.stage === 'arrived') return { text: 'F — выйти из такси', keys: ['F'], act: () => this.exitVehicle() };
        return null;
      }
      if (v.owned) {
        const sl = this.L.bazaarSlots.find((q) => Math.hypot(q.x - v.x, q.z - v.z) < 3.2);
        if (sl) return { text: Math.abs(v.speed) < 1 ? `E — выставить на продажу (место ${sl.id + 1})` : 'Остановитесь на месте продажи', keys: ['E'], act: () => { if (Math.abs(v.speed) < 1) this.openPanel({ type: 'listing', uid: v.owned!.uid, slot: sl.id }); } };
        const svc = this.L.buildings.find((b) => b.kind === 'service' && Math.hypot(b.door.x - v.x, b.door.z - v.z) < 15);
        if (svc) return { text: 'E — Автосервис: ремонт и тюнинг', keys: ['E'], act: () => this.openPanel({ type: 'tuning', uid: v.owned!.uid }) };
        const ml = this.L.marketLot.find((m) => Math.hypot(m.x - v.x, m.z - v.z) < 26);
        if (ml) return { text: 'E — Продать машину на авторынке', keys: ['E'], act: () => this.openPanel({ type: 'market', sellUid: v.owned!.uid }) };
      }
      const pump = this.L.props.find((p) => p.t === 'pump' && Math.abs(p.x - v.x) < 7 && Math.abs(p.z - v.z) < 7);
      if (pump && !v.isHeli) {
        const need = Math.round(100 - v.fuel), cost = Math.ceil(need * 0.9);
        return { text: need > 1 ? `E — Заправить (${need} л, $${cost})` : 'Бак полон', keys: ['E'], act: () => { if (need <= 1) return; if (this.state.money < cost) { this.toast('Не хватает денег'); return; } this.state.money -= cost; v.fuel = 100; if (v.owned) v.owned.fuel = 100; this.toast('Бак заправлен'); this.sound.coin(); } };
      }
      if (v.spec.autopilot && !this.autopilot) return { text: 'Z — автопилот', keys: ['Z'], act: () => this.toggleAutopilot() };
      return null;
    }
    if (this.interior) {
      let best: Prompt | null = null; let bd = Infinity;
      for (const a of this.interior.acts) {
        const d = Math.hypot(a.x - px, a.z - pz);
        if (d > a.r || Math.abs((a.y ?? 0) - this.py) > 1.2 || d > bd) continue;
        bd = d; best = this.actPrompt(a.action, a.label);
      }
      if (this.job?.type === 'shift' && this.job.stage === 'wait') {
        const c = this.interior.acts.find((a) => a.action === 'counter');
        if (c && Math.hypot(c.x - px, c.z - pz) < 2.2) return { text: 'E — обслужить покупателя', keys: ['E'], act: () => this.serveCustomer() };
      }
      return best;
    }
    // сюжет: дядя Вася
    const qv = this.questPeds.vasya;
    if (qv && Math.hypot(qv.x - px, qv.z - pz) < 2.4 && this.state.quest && (this.state.quest.step === 0 || this.state.quest.step === 6)) return { text: 'E — поговорить с дядей Васей', keys: ['E'], act: () => this.talkVasya() };
    // огород у своего деревенского дома
    for (const b of this.L.buildings) {
      if (!b.beds || Math.abs(b.x - px) > 40 || Math.abs(b.z - pz) > 40 || !this.state.properties.includes(`${b.id}:0`)) continue;
      const i = b.beds.findIndex((bd) => Math.hypot(bd.x - px, bd.z - pz) < 2.2);
      if (i >= 0) return this.plantPrompt(`${b.id}:bed:${i}`, false);
    }
    // работа: ферма «Зорька»
    if (this.job?.type === 'farm') {
      const j = this.job, F = this.L.livestock;
      if (j.stage === 'pickup' && Math.hypot(F.feed.x - px, F.feed.z - pz) < 3) return { text: 'E — взять мешок корма', keys: ['E'], act: () => { j.stage = 'feed'; this.carrying = true; this.toast(`Насыпьте корм в кормушку №${j.trough + 1}`); } };
      if (j.stage === 'feed') { const t = F.troughs[j.trough]; if (Math.hypot(t.x - px, t.z - pz) < 2.4) return { text: `E — насыпать корм (кормушка №${j.trough + 1})`, keys: ['E'], act: () => this.farmStep() }; }
      if (j.stage === 'eggs' && Math.hypot(F.coop.x - px, F.coop.z - pz) < 2.8) return { text: 'E — собрать яйца в курятнике', keys: ['E'], act: () => { j.stage = 'crate'; this.carrying = true; this.toast('Отнесите лоток с яйцами к ящику у конторы'); } };
      if (j.stage === 'crate' && Math.hypot(F.crate.x - px, F.crate.z - pz) < 2.6) return { text: 'E — сдать яйца', keys: ['E'], act: () => this.farmStep() };
    }
    // работа
    if (this.job?.type === 'factory') {
      const j = this.job;
      if (j.stage === 'pickup') { const p = this.L.industrial.pickup; if (Math.hypot(p.x - px, p.z - pz) < 3.5) return { text: 'E — взять деталь со склада', keys: ['E'], act: () => { j.stage = 'load'; this.carrying = true; this.toast(`Отнесите деталь в фуру №${j.truck + 1}`); } }; }
      else { const t = this.L.industrial.trucks[j.truck]; if (Math.hypot(t.x - px, 570.5 - pz) < 3.5) return { text: `E — загрузить в фуру №${j.truck + 1}`, keys: ['E'], act: () => this.loadTruck() }; }
    }
    if (this.job?.type === 'courier') {
      const j = this.job; const b = j.stage === 'pickup' ? j.from : j.to;
      if (Math.hypot(b.door.x - px, b.door.z - pz) < 3) return { text: j.stage === 'pickup' ? 'E — забрать посылку' : 'E — вручить посылку', keys: ['E'], act: () => this.courierStep() };
    }
    // машины
    let vp: Prompt | null = null;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.x - px, v.z - pz) - v.spec.len * 0.3;
      if (d < 3.2 && Math.abs(v.speed) < 4) {
        const lst = v.role === 'remote' ? this.remoteListingOf(v) : null;
        if (lst) { vp = { text: `E — купить ${v.spec.name} у ${lst.r.name} за $${lst.l.price.toLocaleString('ru')}`, keys: ['E'], act: () => this.requestBuyListing(lst.r.id, lst.l) }; break; }
        const myl = v.owned ? this.listingOfUid(v.owned.uid) : null;
        if (myl) { vp = { text: `Ваше объявление: $${myl.price.toLocaleString('ru')} · E — снять с продажи`, keys: ['E'], act: () => this.unlist(myl.uid) }; break; }
        if (v.role === 'npcpuppet' || (v.role === 'remote' && !this.remoteOwnerOf(v))) continue;
        const owner = v.role === 'remote' ? this.remoteOwnerOf(v) : null;
        const label = v.role === 'rental' ? `F — арендовать самокат ($${SCOOTER_RATE}/мин)` : v.role === 'job' && v.spec.body === 'semi' ? 'F — сесть в фуру (рейс)' : owner ? `F — сесть ${owner.taxi ? 'в такси' : 'пассажиром'} к ${owner.name}` : v.role === 'parked' ? `F — угнать: ${v.spec.name}` : (v.role === 'traffic' && v.dummy) ? `F — выкинуть водителя: ${v.spec.name}` : this.taxi?.v === v ? 'F — сесть в такси' : v.role === 'job' ? 'F — Комбайн: начать уборку поля' : v.owned ? `F — сесть: ${v.spec.name}` : v.role === 'deco' ? `${v.spec.name} — заперто` : `F — сесть: ${v.spec.name}`;
        vp = { text: label, keys: ['F'], act: () => this.tryEnterVehicle() };
        break;
      }
    }
    // двери зданий
    let best: Building | null = null; let bd = 2.4;
    for (const b of this.L.buildings) {
      if (Math.abs(b.door.x - px) > 3 || Math.abs(b.door.z - pz) > 3) continue;
      const d = Math.hypot(b.door.x - px, b.door.z - pz); if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      const b = best;
      if (b.kind === 'market') return { text: 'E — Авторынок: б/у машины', keys: ['E'], act: () => this.openPanel({ type: 'market' }) };
      if (b.kind === 'livestock') return { text: 'E — Ферма «Зорька»: работа на ферме', keys: ['E'], act: () => this.openPanel({ type: 'livestock' }) };
      if (b.kind === 'farm') return { text: 'E — Агрохолдинг: работа на комбайне', keys: ['E'], act: () => this.openPanel({ type: 'farm' }) };
      if (b.enter) {
        if (b.kind === 'house' || b.kind === 'vhouse') {
          const id = `${b.id}:0`; const own = this.state.properties.includes(id); const tk = this.takenBy(id);
          if (own) { const lk = this.isLocked(id); return { text: `E — войти домой · L — ${lk ? 'открыть 🔓' : 'запереть 🔒'}`, keys: ['E', 'L'], act: () => this.enterBuilding(b), l: () => this.toggleLock(id) }; }
          if (tk) return { text: tk.locked ? `🔒 Дом игрока ${tk.name} заперт` : `E — в гости к ${tk.name}`, keys: ['E'], act: () => this.enterBuilding(b) };
          return { text: b.forSale ? `E — Дом на продажу: $${b.price?.toLocaleString('ru')}` : 'Чужой дом — заперто', keys: ['E'], act: () => this.enterBuilding(b) };
        }
        return { text: `E — войти: ${b.name}`, keys: ['E'], act: () => this.enterBuilding(b) };
      }
    }
    // ларьки
    for (const k of this.L.kiosks) if (Math.hypot(k.x + Math.sin(k.a) * 1.8 - px, k.z + Math.cos(k.a) * 1.8 - pz) < 2.2) return { text: `E — Ларёк «${KIOSK_TYPES[k.type].name}»`, keys: ['E'], act: () => this.openPanel({ type: 'kiosk', id: k.id }) };
    // гаражи
    for (const g of this.L.garages) if (Math.hypot(g.x - px, g.gateZ - 1.5 - pz) < 3.5) {
      const own = this.state.garages.includes(g.id);
      return { text: own ? `Гараж №${g.id + 1} (ваш) — ворота открыты` : `E — Гараж №${g.id + 1}: купить за $${g.price.toLocaleString('ru')}`, keys: ['E'], act: () => { if (!own) this.openPanel({ type: 'garage', id: g.id }); } };
    }
    // автобазар: места продажи
    const slotP = this.bazaarPrompt(px, pz); if (slotP) return slotP;
    for (const vd of this.L.vendors) if (Math.hypot(vd.x - px, vd.z - pz) < 2.4) return { text: 'E — Продавец: б/у машины', keys: ['E'], act: () => this.openPanel({ type: 'market' }) };
    // продавцы авторынка (у машин)
    for (const m of this.L.marketLot) if (Math.hypot(m.x - px, m.z - pz) < 14) return vp ?? { text: 'E — Авторынок: поговорить с продавцом', keys: ['E'], act: () => this.openPanel({ type: 'market' }) };
    return vp;
  }
  private actPrompt(action: string, label: string): Prompt {
    const b = this.L.buildings[this.state.location?.b ?? 0];
    if (action === 'exit') return { text: 'E — ' + label, keys: ['E'], act: () => this.exitInterior() };
    if (action === 'counter') {
      const kind = (this.interiorKind === 'gas' ? 'gas' : this.interiorKind) as ShopKind;
      const items = SHOP_ITEMS[kind] ?? SHOP_ITEMS.shop24;
      return { text: label, keys: ['E', 'R', 'L'], act: () => this.openPanel({ type: 'shop', kind, title: b?.name ?? 'Магазин', items }), r: () => this.startShift(), l: () => this.rob() };
    }
    if (action === 'scooterdealer') return { text: 'E — ' + label, keys: ['E'], act: () => this.openPanel({ type: 'dealer', scooter: true }) };
    if (action === 'officehr') return { text: 'E — ' + label, keys: ['E'], act: () => this.openPanel({ type: 'officehr' }) };
    if (action === 'homepc') return { text: 'E — Компьютер: фриланс, LosSt', keys: ['E'], act: () => this.openPanel({ type: 'pc', mode: 'home' }) };
    if (action.startsWith('pc:')) return { text: 'E — Сесть за ' + label, keys: ['E'], act: () => { if (!this.state.officeJob) { this.toast('Сначала устройтесь в отделе кадров «ЛосТех»'); return; } this.openPanel({ type: 'pc', mode: 'office' }); } };
    if (action === 'coffee') return { text: 'E — Кофе ($3, +бодрость)', keys: ['E'], act: () => { if (this.pay(3)) { this.state.energy = Math.min(100, this.state.energy + 25); this.toast('☕ Бодрит!'); } } };
    if (action === 'trucker') return { text: 'E — ' + label, keys: ['E'], act: () => this.openPanel({ type: 'trucker' }) };
    if (action === 'basement') return { text: 'E — ' + label, keys: ['E'], act: () => this.enterBasement(b) };
    if (action.startsWith('pot:')) return this.plantPrompt(`${b.id}:pot:${action.slice(4)}`, true);
    if (action === 'bed') return { text: 'E — ' + label, keys: ['E'], act: () => { this.lying = true; this.toast('Вы отдыхаете. Бодрость восстанавливается (I — холодильник)'); } };
    if (action === 'fridge') return { text: 'E — ' + label, keys: ['E'], act: () => this.openPanel({ type: 'inventory' }) };
    if (action.startsWith('apt:')) {
      const u = +action.slice(4); const id = `${b.id}:${u}`; const own = this.state.properties.includes(id); const tk = this.takenBy(id);
      if (own) { const lk = this.isLocked(id); return { text: `E — войти в квартиру ${u + 1} · L — ${lk ? 'открыть 🔓' : 'запереть 🔒'}`, keys: ['E', 'L'], act: () => this.enterApartment(b, u), l: () => this.toggleLock(id) }; }
      if (tk) return { text: tk.locked ? `🔒 Квартира ${u + 1} игрока ${tk.name} заперта` : `E — в гости к ${tk.name} (кв. ${u + 1})`, keys: ['E'], act: () => this.enterApartment(b, u) };
      return { text: `Квартира ${u + 1} продаётся · E — купить ($${this.unitPrice(b, u).toLocaleString('ru')})`, keys: ['E'], act: () => this.enterApartment(b, u) };
    }
    if (action.startsWith('mallshop:')) { const [, k, i] = action.split(':'); return { text: 'E — ' + label, keys: ['E'], act: () => this.enterMallShop(b, k as InteriorKind, +i) }; }
    const simple: Record<string, () => void> = {
      clothes: () => this.openPanel({ type: 'clothes' }), barber: () => this.openPanel({ type: 'barber' }), hospital: () => this.openPanel({ type: 'hospital' }),
      police: () => this.openPanel({ type: 'fines', title: 'Полиция' }), cityhall: () => this.openPanel({ type: 'fines', title: 'Мэрия' }), bank: () => this.openPanel({ type: 'bank' }),
      dealer: () => this.openPanel({ type: 'dealer' }), factory: () => this.openPanel({ type: 'factory' }), vadmin: () => this.openPanel({ type: 'vadmin', village: b.village ?? '' }),
      'service-info': () => this.openPanel({ type: 'info', title: 'Автосервис', text: 'Подъезжайте на своей машине к воротам автосервиса и нажмите E — откроется меню ремонта и тюнинга.' }),
      'fire-info': () => this.openPanel({ type: 'info', title: 'Пожарная часть', text: 'Случайные пожары в городе отключены. Вызов пожарной службы доступен в телефоне.' }),
    };
    return { text: 'E — ' + label, keys: ['E'], act: simple[action] ?? (() => {}) };
  }
  unitPrice(b: Building, u: number) { return (b.price ?? 25000) + (b.kind === 'apartment' ? u * 1500 : 0); }
  // ================= МАГАЗИНЫ / ПРЕДМЕТЫ =================
  buy(itemId: string, qty = 1) {
    const it = ITEMS[itemId]; if (!it) return;
    const cost = it.price * qty;
    if (this.state.money < cost) { this.toast('Недостаточно денег'); this.sound.error(); return; }
    if (it.weapon && this.state.inventory[itemId]) { this.toast('Это оружие у вас уже есть'); return; }
    this.state.money -= cost;
    if (itemId === 'water') this.questEvent('water');
    if (it.ammo) { const at = it.ammoType ?? 'p'; (this.state.ammoBy ??= {})[at] = (this.state.ammoBy[at] ?? 0) + it.ammo * qty; }
    else this.state.inventory[itemId] = (this.state.inventory[itemId] ?? 0) + qty;
    this.sound.coin(); this.toast(`Куплено: ${it.name}${qty > 1 ? ' ×' + qty : ''}`);
  }
  useItem(id: string, fromFridge = false) {
    const src = fromFridge ? this.homeFridge() : this.state.inventory;
    if (!src || !src[id]) return;
    const it = ITEMS[id];
    if (it.weapon) { this.setWeapon(it.weapon); this.closePanel(); return; }
    src[id]--; if (!src[id]) delete src[id];
    const s = this.state;
    if (it.food) s.food = clamp(s.food + it.food, 0, 100);
    if (it.drink) s.water = clamp(s.water + it.drink, 0, 100);
    if (it.energy) s.energy = clamp(s.energy + it.energy, 0, 100);
    if (it.health) s.health = clamp(s.health + it.health, 0, 100);
    if (it.drug) { this.drugT = 50; this.dizzyT = 55; this.toast('🍁 Вас накрыло… мир плывёт и переливается'); this.sound.crackle(); }
    else if (it.seed) { this.toast('Семена сажают на грядку у деревенского дома (подвал — для «Дурмана»)'); src[id] = (src[id] ?? 0) + 1; return; }
    if (it.smoke) { this.smokeT = 8; this.dizzyT = 22; this.player.setItem('cig'); this.toast('Вы закурили… голова кружится'); }
    else this.toast(`${it.icon} ${it.name}`);
  }
  dropItem(id: string) { const inv = this.state.inventory; if (!inv[id]) return; inv[id]--; if (!inv[id]) delete inv[id]; if (id === this.weapon) this.setWeapon('fists'); this.toast(`Выброшено: ${ITEMS[id].name}`); }
  homeId(): string | null {
    const loc = this.state.location; if (!loc) return null;
    const b = this.L.buildings[loc.b];
    if (b.kind === 'apartment' && loc.unit !== undefined) return `${b.id}:${loc.unit}`;
    if ((b.kind === 'house' || b.kind === 'vhouse') && this.state.properties.includes(`${b.id}:0`)) return `${b.id}:0`;
    return null;
  }
  homeFridge(): Record<string, number> | null { const h = this.homeId(); if (!h) return null; return (this.state.fridges[h] ??= {}); }
  toFridge(id: string) { const f = this.homeFridge(); const inv = this.state.inventory; if (!f || !inv[id]) return; if (!ITEMS[id].fridge) { this.toast('Это нельзя положить в холодильник'); return; } inv[id]--; if (!inv[id]) delete inv[id]; f[id] = (f[id] ?? 0) + 1; }
  fromFridge(id: string) { const f = this.homeFridge(); if (!f || !f[id]) return; f[id]--; if (!f[id]) delete f[id]; this.state.inventory[id] = (this.state.inventory[id] ?? 0) + 1; }
  // ================= РАБОТА =================
  private startShift() {
    if (this.job) { this.toast('Сначала завершите текущую работу'); return; }
    const loc = this.state.location; if (!loc) return;
    this.job = { type: 'shift', b: loc.b, served: 0, cust: null, stage: 'enter', t: 1 };
    this.toast('Смена началась: обслужите 5 покупателей (E у кассы)');
  }
  private updateShift(dt: number) {
    const j = this.job; if (!j || j.type !== 'shift' || !this.interior) return;
    const counter = this.interior.acts.find((a) => a.action === 'counter'); if (!counter) return;
    j.t -= dt;
    if (!j.cust && j.t <= 0 && j.stage === 'enter') {
      const sp = this.interior.spawn;
      j.cust = this.peds.addStatic(randomLook(), sp.x, sp.z, Math.PI, 'customer');
    }
    const c = j.cust; if (!c) return;
    const tx = j.stage === 'leave' ? this.interior.spawn.x : counter.x, tz = j.stage === 'leave' ? this.interior.spawn.z + 0.5 : counter.z + 0.2;
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d > 0.2) { c.a = Math.atan2(dx, dz); const st = Math.min(d, 1.6 * dt); c.x += (dx / d) * st; c.z += (dz / d) * st; c.phase += dt * 6; c.char.pose('walk', 0, c.phase); c.char.root.position.set(c.x, 0, c.z); c.char.root.rotation.y = c.a; c.state = 'gone'; c.char.root.visible = true; }
    else if (j.stage === 'enter') { j.stage = 'wait'; c.a = Math.PI; }
    else if (j.stage === 'leave') { this.peds.removePed(c); j.cust = null; j.stage = 'enter'; j.t = 2; }
    if (j.stage === 'wait') { c.char.pose('idle', performance.now() / 1000); c.char.root.position.set(c.x, 0, c.z); c.char.root.rotation.y = Math.PI; c.char.root.visible = true; }
  }
  private serveCustomer() {
    const j = this.job; if (!j || j.type !== 'shift' || j.stage !== 'wait') return;
    j.served++; j.stage = 'leave'; this.state.money += 35; this.sound.coin();
    if (j.served >= 5) { this.state.money += 80; this.toast('Смена завершена! $35×5 + бонус $80'); if (j.cust) { const c = j.cust; setTimeout(() => this.peds.peds.includes(c) && this.peds.removePed(c), 3000); } this.job = null; }
    else this.toast(`Покупатель обслужен: +$35 (${j.served}/5)`);
  }
  private rob() {
    const gun = this.ownedWeapons().find((w) => w !== 'fists');
    if (!gun) { this.toast('Для ограбления нужно оружие'); return; }
    const loc = this.state.location; if (!loc) return;
    const last = this.robbedAt.get(loc.b) ?? -1e9;
    if (performance.now() - last < 5 * 60 * 1000) { this.toast('Касса пуста — эту точку недавно грабили'); return; }
    this.robbedAt.set(loc.b, performance.now());
    if (this.weapon === 'fists') this.setWeapon(gun);
    const cash = 300 + Math.floor(this.rng.next() * 1300);
    const ct = this.interior?.acts.find((a) => a.action === 'counter');
    const src = new THREE.Vector3(ct ? ct.x : this.px, 1.15, ct ? ct.z - 0.6 : this.pz);
    this.cashFx = { left: cash, per: Math.max(10, Math.ceil(cash / 16)), src, next: 0.6 };
    for (const p of this.peds.peds) if (p.kind === 'static' && p.role === 'cashier') { p.state = 'hands'; p.timer = 9; }
    this.state.wanted = Math.max(1, Math.min(3, this.state.wanted + (this.state.wanted ? 1 : 0)));
    this.sound.shot(0.6);
    this.toast(`💰 Ограбление! Кассир выкладывает $${cash}. Розыск ${'★'.repeat(this.state.wanted)}`);
  }
  factoryHire() {
    if (this.job && this.job.type !== 'factory') { this.toast('Сначала завершите текущую работу'); return; }
    if (this.job?.type === 'factory') { this.job = null; this.carrying = false; this.toast('Вы уволились со смены'); return; }
    this.job = { type: 'factory', stage: 'pickup', truck: Math.floor(this.rng.next() * 3), trips: 0 };
    this.toast('Вы приняты на смену! Заберите деталь на складе (жёлтый маркер)');
  }
  private loadTruck() {
    const j = this.job; if (!j || j.type !== 'factory') return;
    j.trips++; this.carrying = false; this.state.money += 120; this.sound.coin();
    if (j.trips >= 6) { this.state.money += 400; this.toast('Смена окончена! 6 рейсов × $120 + бонус $400'); this.job = null; return; }
    j.truck = Math.floor(this.rng.next() * 3); j.stage = 'pickup';
    this.toast(`Рейс ${j.trips}/6: +$120. Следующая деталь — в фуру №${j.truck + 1}`);
  }
  startCourier() {
    if (this.job) { this.toast('Сначала завершите текущую работу'); return; }
    const shops = this.L.buildings.filter((b) => ['shop24', 'cafe', 'supermarket', 'pharmacy'].includes(b.kind));
    const from = shops.sort((a, b) => Math.hypot(a.x - this.px, a.z - this.pz) - Math.hypot(b.x - this.px, b.z - this.pz))[Math.floor(this.rng.next() * 3)];
    const dests = this.L.buildings.filter((b) => (b.kind === 'apartment' || b.kind === 'house') && Math.hypot(b.x - from.x, b.z - from.z) > 250 && Math.hypot(b.x - from.x, b.z - from.z) < 700);
    const to = dests[Math.floor(this.rng.next() * dests.length)];
    const pay = Math.round(40 + Math.hypot(to.x - from.x, to.z - from.z) * 0.15);
    this.job = { type: 'courier', stage: 'pickup', from, to, pay };
    this.toast(`Курьер: заберите посылку в «${from.name}» (маркер на карте). Оплата $${pay}`);
  }
  private courierStep() {
    const j = this.job; if (!j || j.type !== 'courier') return;
    if (j.stage === 'pickup') { j.stage = 'drop'; this.toast('Посылка у вас. Доставьте по адресу (маркер)'); return; }
    this.state.money += j.pay; this.sound.coin(); this.toast(`Доставлено! +$${j.pay}`); this.job = null;
  }
  quitJob() {
    if (this.job?.type === 'farm') { this.job = null; this.carrying = false; this.toast('Работа на ферме завершена'); return; }
    if (this.job?.type === 'truck') { const t = this.job.truck; if (this.inVeh === t) this.exitVehicle(true); if (this.vehicles.includes(t)) this.removeVehicle(t); this.job = null; this.toast('Рейс отменён'); return; } if (this.job?.type === 'combine' && this.inVeh) this.exitVehicle(true); if (this.job?.type === 'shift' && this.job.cust) this.peds.removePed(this.job.cust); this.job = null; this.carrying = false; this.toast('Работа завершена'); }
  private startCombineJob() {
    if (this.job && this.job.type !== 'combine') { this.toast('Сначала завершите текущую работу'); return; }
    const F = this.L.farm;
    this.job = { type: 'combine', earned: 0, strips: new Array(F.rows / 4).fill(false) };
    if (this.W.wheatCells.every((c) => c.done)) this.regrow();
    this.toast('Работа на комбайне: проезжайте по пшенице. $5 за участок поля, бонус $200 за полосу');
  }
  private regrow() {
    const F = this.L.farm, cw = (F.x1 - F.x0) / F.cols, ch = (F.z1 - F.z0) / F.rows; const m = new THREE.Matrix4();
    this.W.wheatCells.forEach((c, i) => { c.done = false; m.compose(new THREE.Vector3(c.x, 0, c.z), new THREE.Quaternion(), new THREE.Vector3(cw - 0.2, 1.1, ch - 0.2)); this.W.wheat.setMatrixAt(i, m); });
    this.W.wheat.instanceMatrix.needsUpdate = true;
  }
  private harvest(v: Vehicle) {
    const j = this.job; if (!j || j.type !== 'combine' || Math.abs(v.speed) < 0.5) return;
    const F = this.L.farm, cw = (F.x1 - F.x0) / F.cols, ch = (F.z1 - F.z0) / F.rows;
    const f = v.forward(); const hx = v.x + f.x * 3.6, hz = v.z + f.z * 3.6;
    let changed = false; const m = new THREE.Matrix4();
    for (let s = -2; s <= 2; s++) {
      const x = hx + f.z * s, z = hz - f.x * s;
      const c = Math.floor((x - F.x0) / cw), r = Math.floor((z - F.z0) / ch);
      if (c < 0 || r < 0 || c >= F.cols || r >= F.rows) continue;
      const idx = r * F.cols + c; const cell = this.W.wheatCells[idx];
      if (cell.done) continue;
      cell.done = true; changed = true; j.earned += 5; this.state.money += 5;
      m.compose(new THREE.Vector3(cell.x, 0, cell.z), new THREE.Quaternion(), new THREE.Vector3(cw - 0.2, 0.08, ch - 0.2)); this.W.wheat.setMatrixAt(idx, m);
      const strip = Math.floor(r / 4);
      if (!j.strips[strip] && this.W.wheatCells.slice(strip * 4 * F.cols, (strip + 1) * 4 * F.cols).every((x) => x.done)) { j.strips[strip] = true; j.earned += 200; this.state.money += 200; this.toast(`Полоса ${strip + 1} убрана! Бонус $200`); this.sound.coin(); }
    }
    if (changed) this.W.wheat.instanceMatrix.needsUpdate = true;
    if (v.model.reel) v.model.reel.rotation.x += 0.3;
    if (this.W.wheatCells.every((c) => c.done)) { this.state.money += 500; j.earned += 500; this.toast('Поле убрано полностью! Бонус $500'); setTimeout(() => this.regrow(), 60000); }
  }
  private updateJobs(dt: number) {
    this.updateShift(dt);
    // маркер
    let mx: number | null = null, mz = 0;
    if (this.job?.type === 'factory') { if (this.job.stage === 'pickup') { mx = this.L.industrial.pickup.x; mz = this.L.industrial.pickup.z; } else { mx = this.L.industrial.trucks[this.job.truck].x; mz = 570.5; } }
    else if (this.job?.type === 'courier') { const b = this.job.stage === 'pickup' ? this.job.from : this.job.to; mx = b.door.x; mz = b.door.z; }
    else if (this.job?.type === 'farm') { const t = this.gpsTarget()!; mx = t.x; mz = t.z; }
    else if (this.job?.type === 'truck') { const t = this.gpsTarget()!; mx = t.x; mz = t.z; this.updateTruckJob(); }
    else if (this.destination && !this.taxi) { mx = this.destination.x; mz = this.destination.z; }
    if (mx !== null && !this.interior) { this.marker.visible = true; this.marker.position.set(mx, 0, mz); (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(performance.now() / 300) * 0.1; }
    else this.marker.visible = false;
    if (this.destination && !this.autopilot && !(this.taxi && this.passenger)) { const w = this.playerWorldPos(); if (Math.hypot(this.destination.x - w.x, this.destination.z - w.z) < (this.inVeh || this.rideRemote ? 14 : 7)) { this.destination = null; this.gpsRoute = null; this.toast('📍 Вы на месте'); this.sound.coin(); } }
  }
  // ================= ЭКОНОМИКА: покупки =================
  private pay(cost: number) {
    if (this.state.money < cost) { this.toast('Недостаточно денег'); this.sound.error(); return false; } this.state.money -= cost; this.sound.coin(); return true; }
  buyProperty(b: number, unit: number) {
    const bd = this.L.buildings[b]; const id = `${b}:${unit}`;
    if (this.state.properties.includes(id)) return;
    const tk = this.takenBy(id); if (tk) { this.toast(`Уже куплено игроком ${tk.name}`); return; }
    if (!this.pay(this.unitPrice(bd, unit))) return;
    if (!this.state.spawnHome) this.state.spawnHome = id;
    this.state.properties.push(id); this.save();
    this.toast(`Поздравляем с покупкой! ${bd.kind === 'apartment' ? 'Квартира ' + (unit + 1) : 'Дом'} теперь ваш`);
    this.closePanel();
    if (bd.kind === 'apartment' && this.interior) this.enterApartment(bd, unit);
    else if (bd.kind !== 'apartment') this.enterBuilding(bd);
  }
  buyGarage(id: number) { if (this.state.garages.includes(id)) return; const g = this.L.garages[id]; if (!this.pay(g.price)) return; this.state.garages.push(id); this.toast(`Гараж №${id + 1} куплен. Ворота открываются автоматически`); this.closePanel(); this.save(); }
  buyKiosk(id: number) { const kt = KIOSK_TYPES[this.L.kiosks[id].type]; if (this.state.kiosks.some((k) => k.id === id)) return; if (!this.pay(kt.price)) return; this.state.kiosks.push({ id, last: Date.now(), acc: 0 }); this.toast(`Ларёк «${kt.name}» ваш! Доход $${kt.income} каждую минуту`); this.save(); }
  collectKiosks(id?: number) {
    this.updateKiosks();
    let sum = 0; for (const k of this.state.kiosks) if (id === undefined || k.id === id) { sum += k.acc; k.acc = 0; }
    if (!sum) { this.toast('Пока нечего собирать'); return; }
    this.state.money += sum; this.sound.coin(); this.toast(`Доход с бизнеса: +$${sum}`);
  }
  newOwned(type: string, color: string, extra?: Partial<OwnedVehicle>): OwnedVehicle {
    return { uid: uid(), type, color, tuning: defaultTuning(), condition: 1, mileage: 0, year: 2026, fuel: 100, pos: null, missing: [], paid: VEHICLES[type].price, ...extra };
  }
  spawnOwned(o: OwnedVehicle, x: number, z: number, a: number) {
    o.pos = { x, z, a };
    const v = new Vehicle(o.type, 'owned', o.color, o); v.place(x, z, a, this.col.groundAt(x, z, 2, 3)); this.addVehicle(v);
    this.state.vehicles.push(o); this.save(); return v;
  }
  buyVehicle(type: string, color: string) {
    const sp = VEHICLES[type]; if (!this.pay(sp.price)) return;
    const o = this.newOwned(type, color);
    const lb = this.lastBuilding;
    const dl = sp.body === 'scooter' && lb ? { ...this.freeSpotNear(lb.door.x, lb.door.z), a: lb.door.a } : lb && lb.kind === 'dealer' && lb.w < 30 ? this.roadSpotNear(lb.door.x, lb.door.z) : null;
    const spot = sp.body === 'heli' ? this.freeSpotNear(this.L.helipad.x, this.L.helipad.z) : dl ?? this.freeSpotNear(this.L.dealerLot.x, this.L.dealerLot.z);
    this.spawnOwned(o, spot.x, spot.z, dl ? dl.a : this.L.dealerLot.a);
    this.toast(`${sp.name} куплен! Ждёт вас ${sp.body === 'heli' ? 'на вертолётной площадке' : 'на парковке у автосалона'}`);
    this.destination = { x: spot.x, z: spot.z };
    this.closePanel();
  }
  marketPeriod() { return Math.floor(Date.now() / (10 * 60 * 1000)); }
  getOffers(): MarketOffer[] { const sold = new Set(JSON.parse(sessionStorage.getItem('lg_sold') ?? '[]') as string[]); return marketOffers(this.marketPeriod()).filter((o) => !sold.has(o.id)); }
  buyMarket(offerId: string) {
    const o = this.getOffers().find((x) => x.id === offerId); if (!o) return;
    if (!this.pay(o.price)) return;
    const sold = JSON.parse(sessionStorage.getItem('lg_sold') ?? '[]') as string[]; sold.push(o.id); sessionStorage.setItem('lg_sold', JSON.stringify(sold));
    const ml = this.L.marketLot.sort((a, b) => Math.hypot(a.x - this.px, a.z - this.pz) - Math.hypot(b.x - this.px, b.z - this.pz))[0];
    const spot = this.freeSpotNear(ml.x, ml.z);
    const ov = this.newOwned(o.type, o.color, { condition: o.condition, mileage: o.mileage, year: o.year, paid: o.price, fuel: 40 });
    this.spawnOwned(ov, spot.x, spot.z, 0);
    this.toast(`Куплен ${VEHICLES[o.type].name} ${o.year} г. Стоит на площадке рынка`);
  }
  sellVehicle(uidv: string) {
    const v = this.vehicles.find((x) => x.owned?.uid === uidv); const o = this.state.vehicles.find((x) => x.uid === uidv); if (!o) return;
    if (v && !this.L.marketLot.some((m) => Math.hypot(m.x - v.x, m.z - v.z) < 40)) { this.toast('Пригоните машину на площадку авторынка'); return; }
    const price = sellPrice(o, this.marketPeriod());
    if (v && this.inVeh === v) this.exitVehicle(true);
    if (v) this.removeVehicle(v);
    this.state.vehicles = this.state.vehicles.filter((x) => x.uid !== uidv);
    this.state.money += price; this.sound.coin();
    const profit = price - o.paid;
    this.toast(`Продано за $${price.toLocaleString('ru')} (${profit >= 0 ? 'прибыль' : 'убыток'} $${Math.abs(profit).toLocaleString('ru')})`);
    this.closePanel(); this.save();
  }
  repairVehicle(uidv: string) {
    const v = this.vehicles.find((x) => x.owned?.uid === uidv); const o = this.state.vehicles.find((x) => x.uid === uidv); if (!o || !v) return;
    const cost = repairCost({ ...o, missing: v.model.missingParts() }) + v.model.missingWheels() * 150;
    if (cost <= 0) { this.toast('Машина в идеальном состоянии'); return; }
    if (!this.pay(cost)) return;
    v.model.repairAll(); v.condition = 1; o.condition = 1; o.missing = [];
    this.toast(`Ремонт и реставрация выполнены: $${cost}`);
  }
  applyTuning(uidv: string, t: Tuning, cost: number) {
    const v = this.vehicles.find((x) => x.owned?.uid === uidv); const o = this.state.vehicles.find((x) => x.uid === uidv); if (!o || !v) return;
    if (cost <= 0) return;
    if (!this.pay(cost)) return;
    o.tuning = { ...t }; v.model.applyTuning(o.tuning); v.sync(); this.toast(`Тюнинг установлен: $${cost}`); this.save();
  }
  previewTuning(uidv: string, t: Tuning) { const v = this.vehicles.find((x) => x.owned?.uid === uidv); if (v) { v.model.applyTuning(t); v.sync(); } }
  revertTuning(uidv: string) { const v = this.vehicles.find((x) => x.owned?.uid === uidv); const o = this.state.vehicles.find((x) => x.uid === uidv); if (v && o) { v.model.applyTuning(o.tuning); v.sync(); } }
  previewLook(l: Look) { this.player.setLook(l); }
  revertLook() { this.player.setLook(this.state.look); }
  buyLook(l: Look) {
    const old = this.state.look; let cost = 0;
    if (l.hair !== old.hair) cost += HAIR_STYLES.find((h) => h.id === l.hair)?.price ?? 0;
    if (l.hairColor !== old.hairColor) cost += 30;
    if (l.top !== old.top || l.topColor !== old.topColor) cost += TOPS.find((x) => x.id === l.top)?.price ?? 0;
    if (l.bottom !== old.bottom || l.bottomColor !== old.bottomColor) cost += BOTTOMS.find((x) => x.id === l.bottom)?.price ?? 0;
    if (l.shoes !== old.shoes) cost += 40;
    if (!cost) { if (l.skin !== old.skin) { this.state.look = { ...l }; this.player.setLook(this.state.look); this.toast('Готово'); } else this.toast('Без изменений'); return; }
    if (!this.pay(cost)) { this.revertLook(); return; }
    this.state.look = { ...l }; this.player.setLook(this.state.look); this.toast(`Готово! Списано $${cost}`); this.save();
  }
  heal() { if (this.state.health >= 100) { this.toast('Вы здоровы'); return; } if (!this.pay(200)) return; this.state.health = 100; this.toast('Лечение завершено'); }
  changeGender() {
    if (!this.pay(50000)) return;
    const l = this.state.look; const g = l.gender === 'm' ? 'f' : 'm';
    this.state.look = { ...l, gender: g, hair: g === 'f' ? 'long' : 'short' }; this.player.setLook(this.state.look); this.toast('Операция прошла успешно'); this.save();
  }
  redeemPromo(code: string): string {
    if (code.trim() !== '8585') return 'Неверный промокод';
    if (this.state.promoUsed) return 'Промокод уже активирован';
    this.state.promoUsed = true; this.state.money += 100_000_000;
    const o = this.newOwned('ferrato', '#d50000', { paid: 0 });
    const spot = this.interior ? this.freeSpotNear(this.L.dealerLot.x, this.L.dealerLot.z) : this.roadSpotNear(this.px, this.pz);
    this.spawnOwned(o, spot.x, spot.z, (spot as { a?: number }).a ?? 0);
    this.sound.coin(); this.save();
    return 'Активировано: +$100 000 000 и Скорпион V12 (стоит рядом)';
  }
  // ================= КАРТА =================
  mapClick(x: number, z: number, mode: 'waypoint' | 'taxi' | 'autopilot') {
    const L = this.L;
    if (x < L.bounds.x0 || x > L.bounds.x1 || z < L.bounds.z0 || z > L.bounds.z1) { this.toast('Точка вне карты'); return; }
    const r = nearestRoadPoint(L, x, z);
    if (r.d > 250) { this.toast('Рядом нет дорог — выберите другую точку'); return; }
    this.destination = { x: r.x, z: r.z };
    this.closePanel();
    if (mode === 'taxi' && this.taxi && this.passenger) this.taxiGo(this.destination);
    else if (mode === 'autopilot' || (this.inVeh?.spec.autopilot && this.autopilot)) { if (this.inVeh?.spec.autopilot) this.startAutopilot(); }
    else this.toast('Метка установлена' + (this.inVeh?.spec.autopilot ? ' — нажмите Z для автопилота' : ''));
  }
  /** маркеры для карт */
  private poiCache: MapIcon[] | null = null; private poiT = 0;
  markers(): MapIcon[] {
    const out: MapIcon[] = [];
    for (const b of this.L.buildings) {
      const ic = POI_ICON[b.kind];
      if (ic) out.push({ x: b.x, z: b.z, icon: ic, color: POI_COLOR[b.kind] ?? '#334155' });
      else if ((b.kind === 'vhouse' || b.kind === 'house') && b.forSale) {
        const id = `${b.id}:0`; const mine = this.state.properties.includes(id); const tk = mine ? null : this.takenBy(id);
        out.push({ x: b.x, z: b.z, icon: '⌂', color: mine || tk ? '#dc2626' : '#16a34a', size: mine ? 0.95 : 0.62, label: mine ? 'Ваш дом' : tk ? tk.name : undefined, small: !mine });
      }
    }
    for (const id of this.state.properties) { const b = this.L.buildings[+id.split(':')[0]]; if (b && b.kind === 'apartment') out.push({ x: b.x, z: b.z, icon: '⌂', color: '#dc2626', size: 0.95, label: 'Ваша квартира' }); }
    for (const sl of this.L.bazaarSlots) if (sl.id % 4 === 0) out.push({ x: sl.x + 12, z: sl.z - 12, icon: '🏷', color: '#0f766e', size: 0.85 });
    for (const k of this.L.kiosks) { const own = this.state.kiosks.some((o) => o.id === k.id); out.push({ x: k.x, z: k.z, icon: own ? '💰' : '🏪', color: own ? '#ca8a04' : '#0d9488', size: 0.75 }); }
    for (const g of this.L.garages) if (g.id % 3 === 0 || this.state.garages.includes(g.id)) out.push({ x: g.x, z: g.z, icon: this.state.garages.includes(g.id) ? '🅿️' : '🏚️', color: '#475569', size: 0.75 });
    out.push({ x: this.L.beach.x0 + 40, z: (this.L.beach.z0 + this.L.beach.z1) / 2, icon: '🏖️', color: POI_COLOR.beach, size: 0.85 });
    out.push({ x: this.L.helipad.x, z: this.L.helipad.z, icon: '🚁', color: '#334155', size: 0.75 });
    for (const d of this.L.scooterDocks) out.push({ x: d.x, z: d.z, icon: '🛴', color: '#16a34a', size: 0.7, small: true, label: 'Аренда' });
    out.push({ x: this.L.livestock.office.x, z: this.L.livestock.office.z, icon: '🐄', color: '#15803d', label: 'Ферма', small: true });
    for (const b of this.L.buildings) if (b.kind === 'office' || b.kind === 'scootershop') out.push({ x: b.x, z: b.z, icon: b.kind === 'office' ? '💻' : '🛴', color: b.kind === 'office' ? '#0ea5e9' : '#16a34a', size: 0.9 });
    out.push({ x: this.L.depot.office.x, z: this.L.depot.office.z, icon: '🚚', color: '#b45309', label: 'Терминал', small: true });
    for (const lot of this.L.lots) out.push({ x: (lot.x0 + lot.x1) / 2, z: (lot.z0 + lot.z1) / 2, icon: 'P', color: '#1d4ed8', size: 0.85 });
    return out;
  }
  dynMarkers(): MapIcon[] {
    const out: MapIcon[] = [];
    for (const v of this.vehicles) {
      if (v.owned && v !== this.inVeh) out.push({ x: v.x, z: v.z, icon: '🚘', color: '#2563eb', size: 0.8, clamp: false });
      if (v.role === 'police' && v.sirens) out.push({ x: v.x, z: v.z, icon: '🚓', color: Math.floor(performance.now() / 250) % 2 ? '#dc2626' : '#2563eb', size: 0.8 });
    }
    if (this.taxi) out.push({ x: this.taxi.v.x, z: this.taxi.v.z, icon: '🚕', color: '#eab308', clamp: true, pulse: true });
    if (this.service) out.push({ x: this.service.v.x, z: this.service.v.z, icon: this.service.kind === 'ambulance' ? '🚑' : '🚓', color: '#dc2626', clamp: true });
    const t = this.gpsTarget();
    if (t) out.push({ x: t.x, z: t.z, icon: t.job ? '⭐' : '📍', color: t.job ? '#f59e0b' : '#b54dff', clamp: true, pulse: true, size: 1.05 });
    if (this.net) for (const p of this.net.others()) { const r = this.remotes.get(p.id); if (r) { const q = r.ikey ? { x: p.x, z: p.y } : r; out.push({ x: q.x, z: q.z, icon: r.inVeh ? '🚗' : '●', color: r.color, label: r.name, size: 0.75, clamp: true }); } }
    return out;
  }
  playerWorldPos() {
    if (this.interior && this.state.location) { const b = this.L.buildings[this.state.location.b]; return { x: b.door.x, z: b.door.z, a: b.door.a }; }
    if (this.inVeh) return { x: this.inVeh.x, z: this.inVeh.z, a: this.inVeh.heading };
    const rv = this.rideVeh(); if (rv) return { x: rv.x, z: rv.z, a: rv.heading };
    return { x: this.px, z: this.pz, a: this.pa };
  }
  /** цель маршрута GPS */
  gpsTarget(): { x: number; z: number; job: boolean } | null {
    const qt = !this.job && !this.destination ? this.questTarget() : null; if (qt) return { ...qt, job: true };
    if (this.job?.type === 'farm') { const j = this.job, F = this.L.livestock; const p = j.stage === 'pickup' ? F.feed : j.stage === 'feed' ? F.troughs[j.trough] : j.stage === 'eggs' ? F.coop : F.crate; return { ...p, job: true }; }
    if (this.job?.type === 'truck') { const j = this.job; const p = j.stage === 'toTruck' ? { x: j.truck.x, z: j.truck.z } : j.stage === 'drive' ? j.drop : { x: 1220, z: 488 }; return { ...p, job: true }; }
    if (this.job?.type === 'factory') { const p = this.job.stage === 'pickup' ? this.L.industrial.pickup : { x: this.L.industrial.trucks[this.job.truck].x, z: 570.5 }; return { ...p, job: true }; }
    if (this.job?.type === 'courier') { const b = this.job.stage === 'pickup' ? this.job.from : this.job.to; return { x: b.door.x, z: b.door.z, job: true }; }
    if (this.taxi && this.taxi.stage === 'coming') return { x: this.taxi.v.x, z: this.taxi.v.z, job: false };
    if (this.destination) return { ...this.destination, job: false };
    return null;
  }
  private gpsKey = '';
  private updateGps() {
    const t = this.gpsTarget();
    if (!t) { this.gpsRoute = null; this.gpsKey = ''; return; }
    const p = this.playerWorldPos();
    // автопилот/такси — показываем их реальный маршрут
    const ai = this.inVeh?.ai && (this.autopilot || this.passenger) ? this.inVeh.ai : null;
    if (ai && ai.mode === 'route' && ai.route.length > 1) {
      const pts = [{ x: p.x, z: p.z }, ...ai.route.slice(ai.k + 1).map((n) => ({ x: this.L.nodes[n].x, z: this.L.nodes[n].z }))];
      if (ai.final) pts.push(ai.final);
      this.gpsRoute = pts; return;
    }
    const from = nearestNodeFast(this.L, p.x, p.z);
    const r = nearestRoadPoint(this.L, t.x, t.z); const e = this.L.edges[r.e];
    const to = Math.hypot(this.L.nodes[e.a].x - r.x, this.L.nodes[e.a].z - r.z) < Math.hypot(this.L.nodes[e.b].x - r.x, this.L.nodes[e.b].z - r.z) ? e.a : e.b;
    const key = from + ':' + to + ':' + Math.round(t.x) + ':' + Math.round(t.z);
    if (key === this.gpsKey && this.gpsRoute) { this.gpsRoute[0] = { x: p.x, z: p.z }; return; }
    this.gpsKey = key;
    const path = astar(this.L, from, to);
    this.gpsRoute = path ? [{ x: p.x, z: p.z }, ...path.map((n) => ({ x: this.L.nodes[n].x, z: this.L.nodes[n].z })), { x: r.x, z: r.z }, { x: t.x, z: t.z }] : null;
  }
  drawMinimap(cv: HTMLCanvasElement) {
    const g = cv.getContext('2d'); if (!g || !this.mapIdx) return;
    const W = cv.width, H = cv.height, dpr = W / (cv.clientWidth || W);
    const p = this.playerWorldPos();
    const fast = this.inVeh ? Math.min(1, Math.abs(this.inVeh.speed) / 30) : 0;
    const scale = this.settings.minimapZoom * 1.15 * dpr * (1 - fast * 0.4); // пикселей на метр
    const rotate = this.settings.minimapRotate;
    const rot = rotate ? Math.PI + this.camYaw : 0;
    const v: MapView = { cx: p.x, cz: p.z, scale, rot, ox: W / 2, oy: rotate ? H * 0.6 : H / 2 };
    g.save();
    const rr = 14 * dpr;
    g.beginPath(); g.roundRect(0, 0, W, H, rr); g.clip();
    drawMap(g, this.mapIdx, v, W, H, { route: this.gpsRoute, buildings: true });
    this.poiT--; if (!this.poiCache || this.poiT <= 0) { this.poiCache = this.markers(); this.poiT = 30; }
    g.save(); g.scale(dpr, dpr);
    const vS = { ...v, scale: v.scale / dpr, ox: v.ox / dpr, oy: v.oy / dpr };
    drawIcons(g, vS, W / dpr, H / dpr, this.poiCache.map((m) => ({ ...m, size: (m.size ?? 1) * 0.8 })), null);
    drawIcons(g, vS, W / dpr, H / dpr, this.dynMarkers().map((m) => ({ ...m, label: undefined })), 0, true);
    drawPlayerArrow(g, vS.ox, vS.oy, rot + Math.PI - p.a, 0.9);
    // компас: север
    const n = toScreen(vS, p.x, p.z - 1e4); const dx = n.x - vS.ox, dy = n.y - vS.oy;
    const k = Math.max(Math.abs(dx) / (W / dpr / 2 - 12), Math.abs(dy) / (H / dpr / 2 - 12)) || 1;
    const nx = W / dpr / 2 + dx / k * 0.98, ny = H / dpr / 2 + dy / k * 0.98;
    g.fillStyle = '#0f172a'; g.beginPath(); g.arc(nx, ny, 9, 0, 7); g.fill(); g.fillStyle = '#f87171'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('С', nx, ny + 0.5);
    g.restore();
    // рамка
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.5 * dpr; g.beginPath(); g.roundRect(1.25 * dpr, 1.25 * dpr, W - 2.5 * dpr, H - 2.5 * dpr, rr); g.stroke();
  }
  drawBigMap(cv: HTMLCanvasElement, view: { cx: number; cz: number; scale: number }, dpr = 1) {
    const g = cv.getContext('2d'); if (!g || !this.mapIdx) return;
    const W = cv.width, H = cv.height;
    const v: MapView = { cx: view.cx, cz: view.cz, scale: view.scale * dpr, rot: 0, ox: W / 2, oy: H / 2 };
    drawMap(g, this.mapIdx, v, W, H, { route: this.gpsRoute, labels: true, buildings: view.scale > 0.25 });
    g.save(); g.scale(dpr, dpr);
    const vS = { ...v, scale: view.scale, ox: W / dpr / 2, oy: H / dpr / 2 };
    const sz = Math.max(0.75, Math.min(1.3, view.scale * 1.4));
    drawIcons(g, vS, W / dpr, H / dpr, this.markers().map((m) => ({ ...m, size: (m.size ?? 1) * sz })), null);
    drawIcons(g, vS, W / dpr, H / dpr, this.dynMarkers(), null);
    const p = this.playerWorldPos(); const q = toScreen(vS, p.x, p.z);
    drawPlayerArrow(g, q.x, q.y, Math.PI - p.a, 1.1);
    g.restore();
  }
  // ================= ДАЛЬНОБОЙЩИК =================
  truckOrders(): TruckOrder[] {
    const per = Math.floor(Date.now() / (5 * 60 * 1000)); const r = new RNG(per * 13 + 5);
    const cargos = ['Стройматериалы', 'Продукты', 'Электроника', 'Мебель', 'Запчасти', 'Удобрения', 'Металлопрокат', 'Бытовая химия', 'Напитки'];
    const D = this.L.depot; const dests = this.L.truckDests.filter((d) => d.x < D.x0 || d.x > D.x1 || d.z < D.z0 || d.z > D.z1);
    const out: TruckOrder[] = [];
    for (let i = 0; i < 5 && dests.length; i++) {
      const d = dests[Math.floor(r.next() * dests.length)];
      const dist = Math.round(Math.hypot(d.x - 1220, d.z - 480) * 1.3);
      out.push({ name: d.name, x: d.x, z: d.z, cargo: r.pick(cargos), dist, pay: Math.round((260 + dist * 0.85) / 10) * 10 });
    }
    return out;
  }
  hireTrucker() { if (this.state.trucker) return; if (!this.pay(200)) return; this.state.trucker = true; this.toast('🚚 Вы приняты дальнобойщиком в «Восток-Транс»! Выберите первый заказ'); this.save(); }
  takeTruckOrder(o: TruckOrder) {
    if (!this.state.trucker) { this.toast('Сначала устройтесь на работу в офисе «Восток-Транс»'); return; }
    if (this.job) { this.toast('Сначала завершите текущую работу'); return; }
    const bay = this.L.depot.bays.find((b) => !this.vehicles.some((v) => Math.hypot(v.x - b.x, v.z - b.z) < 6)) ?? this.L.depot.bays[0];
    const truck = new Vehicle(['semi', 'magistral2', 'dalnoboy', 'severyanin', 'titanxl', 'refr'][Math.floor(Math.random() * 6)], 'job', ['#9f1239', '#1e40af', '#f8fafc', '#15803d'][Math.floor(Math.random() * 4)]);
    truck.place(bay.x, bay.z, bay.a); truck.fuel = 100; this.addVehicle(truck);
    const drop = this.roadSpotNear(o.x, o.z);
    this.job = { type: 'truck', stage: 'toTruck', order: o, drop: { x: drop.x, z: drop.z }, truck };
    this.closePanel(); this.toast(`🚚 Заказ принят: «${o.cargo}» → ${o.name}. Фура ждёт на площадке`);
  }
  private updateTruckJob() {
    const j = this.job; if (!j || j.type !== 'truck') return;
    const t = j.truck; const inTruck = this.inVeh === t && !this.passenger;
    if (!this.vehicles.includes(t)) { this.job = null; this.toast('Фура потеряна — рейс отменён'); return; }
    if (j.stage === 'toTruck' && inTruck) { j.stage = 'drive'; this.toast(`Везите груз: ${j.order.name} (${(j.order.dist / 1000).toFixed(1)} км). Повреждения снижают оплату`); }
    if (j.stage === 'drive' && inTruck && Math.hypot(t.x - j.drop.x, t.z - j.drop.z) < 18 && Math.abs(t.speed) < 1.5) {
      const pay = Math.round(j.order.pay * (0.5 + 0.5 * t.condition));
      this.state.money += pay; this.sound.coin();
      this.toast(`📦 Груз доставлен: +$${pay}${t.condition < 0.95 ? ` (повреждения −$${j.order.pay - pay})` : ''}. Верните фуру на терминал за бонус или завершите работу`);
      j.stage = 'return';
    }
    if (j.stage === 'return' && inTruck && Math.hypot(t.x - 1220, t.z - 485) < 30 && Math.abs(t.speed) < 1.5) {
      this.state.money += 120; this.sound.coin();
      this.exitVehicle(true); this.removeVehicle(t); this.job = null;
      this.toast('🚚 Фура возвращена: +$120. Новый заказ — у диспетчера');
    }
    if (!inTruck && j.stage !== 'toTruck' && Math.hypot(t.x - this.px, t.z - this.pz) > 220) { if (this.vehicles.includes(t)) this.removeVehicle(t); this.job = null; this.toast('Вы бросили фуру — рейс отменён'); }
  }
  // ================= СЮЖЕТ =================
  setupQuest() {
    this.removeQuestPeds();
    if (this.online) return;
    const q = (this.state.quest ??= { step: 0 });
    if (q.done) return;
    const look = { ...randomLook(false, 4242), gender: 'm' as const, hair: 'bald', top: 'suit', topColor: '#374151', bottom: 'trousers', bottomColor: '#1f2937' };
    this.questPeds.vasya = this.peds.addQuest(look, this.L.playerSpawn.x - 4, this.L.playerSpawn.z - 1.2, 0.6, 'quest');
    if (q.step === 5) q.step = 4; // бандиты не сохраняются — повтор встречи
  }
  removeQuestPeds() {
    if (this.questPeds.vasya) this.peds.removePed(this.questPeds.vasya);
    for (const t of this.questPeds.thugs) if (this.peds.peds.includes(t)) this.peds.removePed(t);
    this.questPeds = { vasya: null, thugs: [] };
  }
  private questAdvance(to: number, msg: string) { const q = this.state.quest; if (!q) return; q.step = to; this.toast(msg); this.sound.coin(); this.save(); }
  questEvent(kind: 'water' | 'vehicle') {
    const q = this.state.quest; if (!q || q.done || this.online) return;
    if (kind === 'water' && q.step === 1) this.questAdvance(2, '✅ Вода куплена. Теперь найдите транспорт — подойдёт любая машина или самокат');
    if (kind === 'vehicle' && q.step === 2) this.questAdvance(3, '✅ Транспорт есть! Езжайте в гаражный кооператив за посылкой (метка на карте)');
  }
  talkVasya() {
    const q = this.state.quest; if (!q) return;
    if (q.step === 0) {
      this.openPanel({ type: 'info', title: '🧔 Дядя Вася', text: 'О, новенький! Добро пожаловать в Лос-Город. Город суровый: сначала попей водички — купи в магазине 24/7. Потом раздобудь колёса, забери мою посылку в гаражах и отвези Лёхе на пляж. Справишься — не обижу.' });
      this.questAdvance(1, '📜 Задание: купите воду в магазине 24/7');
    } else if (q.step === 6) {
      this.state.money += 3000; this.state.inventory.pistol = 1; (this.state.ammoBy ??= {}).p = (this.state.ammoBy.p ?? 0) + 30;
      q.done = true; this.save();
      this.openPanel({ type: 'info', title: '🧔 Дядя Вася', text: 'Бандиты? Ну ты даёшь! Держи $3000 и мой старый пистолет «Оса-9» с патронами — пригодится. Дальше сам: работай, покупай жильё, а если что — заходи.' });
      this.toast('🏆 Сюжет «Новичок» пройден: +$3000 и пистолет'); this.sound.coin();
      setTimeout(() => this.removeQuestPeds(), 8000);
    }
  }
  questTarget(): { x: number; z: number } | null {
    const q = this.state.quest; if (!q || q.done || this.online) return null;
    const p = this.playerWorldPos();
    switch (q.step) {
      case 0: case 6: return this.questPeds.vasya ? { x: this.questPeds.vasya.x, z: this.questPeds.vasya.z } : null;
      case 1: { const b = this.L.buildings.filter((x) => x.kind === 'shop24').sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z))[0]; return b ? { x: b.door.x, z: b.door.z } : null; }
      case 3: return { x: 1 * 60 + 30, z: 5 * 60 + 8 };
      case 4: return { x: -158, z: 480 };
      default: return null;
    }
  }
  questText(): string | null {
    const q = this.state.quest; if (!q || q.done || this.online) return null;
    const t = QUEST_STEPS[q.step] ?? '';
    return q.step === 5 ? `${t} (${q.kills ?? 0}/2)` : t;
  }
  private updateQuest() {
    const q = this.state.quest; if (!q || q.done || this.online) return;
    const w = this.playerWorldPos();
    if (q.step === 3 && Math.hypot(w.x - 90, w.z - 308) < 14) this.questAdvance(4, '📦 Посылка у вас! Отвезите её Лёхе на пляж');
    if (q.step === 4 && Math.hypot(w.x + 158, w.z - 480) < 14 && !this.interior) {
      q.kills = 0; q.step = 5;
      const tl = (seed: number) => ({ ...randomLook(false, seed), gender: 'm' as const, top: 'hoodie', topColor: '#111827', hair: 'buzz' });
      for (let k = 0; k < 2; k++) this.questPeds.thugs.push(this.peds.addQuest(tl(900 + k), w.x + 6 + k * 2, w.z + 4 - k * 6, 0, 'thug', true));
      this.toast('⚠️ Это подстава! Лёхи нет — на вас напали бандиты. Отбейтесь!'); this.sound.hurt();
    }
    if (q.step === 5 && (q.kills ?? 0) >= 2) { for (const t of this.questPeds.thugs) setTimeout(() => this.peds.peds.includes(t) && this.peds.removePed(t), 6000); this.questPeds.thugs = []; this.questAdvance(6, '✅ Бандиты повержены! Вернитесь к дяде Васе'); }
  }
  skipQuest() { const q = this.state.quest; if (!q) return; q.done = true; this.removeQuestPeds(); this.toast('Сюжет пропущен'); this.save(); }
  // ================= ОГОРОД И ПОДВАЛ =================
  enterBasement(b: Building, silent = false) {
    if (!this.state.properties.includes(`${b.id}:0`)) { this.toast('Подвал заперт — это не ваш дом'); return; }
    this.setInterior(buildInterior('basement', { seed: b.id }), 'basement');
    this.state.location = { b: b.id, sub: 1 };
    if (!silent) this.sound.door();
  }
  plantProgress(key: string) { const p = this.state.plants?.[key]; if (!p) return -1; const c = CROPS[p.crop]; return c ? Math.min(1, (Date.now() - p.t) / (c.time * 1000)) : -1; }
  private plantPrompt(key: string, basement: boolean): Prompt {
    const p = this.state.plants?.[key]; const pr = this.plantProgress(key);
    if (!p) return { text: `E — посадить семена (${basement ? 'горшок в подвале' : 'грядка'})`, keys: ['E'], act: () => this.openPanel({ type: 'plant', key, basement }) };
    const c = CROPS[p.crop];
    if (pr >= 1) return { text: `E — собрать урожай: ${c.name}`, keys: ['E'], act: () => this.harvestPlant(key) };
    const left = Math.ceil((1 - pr) * c.time);
    return { text: `${c.name}: растёт ${Math.round(pr * 100)}% · ещё ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, keys: [], act: () => {} };
  }
  plant(key: string, seedId: string) {
    const it = ITEMS[seedId]; const c = it?.seed ? CROPS[it.seed] : null; if (!c || !this.state.inventory[seedId]) return;
    const basement = key.includes(':pot:');
    if (basement && !c.basement) { this.toast('В подвале под лампами растёт только «Дурман»'); return; }
    if (!basement && !c.yard) { this.toast('Это растение нужно выращивать в подвале под лампами'); return; }
    this.state.inventory[seedId]--; if (!this.state.inventory[seedId]) delete this.state.inventory[seedId];
    (this.state.plants ??= {})[key] = { crop: c.id, t: Date.now() };
    this.closePanel(); this.toast(`🌱 Посажено: ${c.name}. Созреет через ${Math.round(c.time / 60)} мин`); this.save(); this.updatePlants();
  }
  harvestPlant(key: string) {
    const p = this.state.plants?.[key]; if (!p || this.plantProgress(key) < 1) return;
    const c = CROPS[p.crop]; const n = c.yield[0] + Math.floor(Math.random() * (c.yield[1] - c.yield[0] + 1));
    this.state.inventory[c.product] = (this.state.inventory[c.product] ?? 0) + n;
    delete this.state.plants![key]; this.sound.coin(); this.toast(`🧺 Собрано: ${ITEMS[c.product].icon} ${ITEMS[c.product].name} ×${n}`); this.save(); this.updatePlants();
  }
  sellProduce(kind: 'veg' | 'drug') {
    const inv = this.state.inventory; let sum = 0, cnt = 0;
    for (const id of Object.keys(inv)) { const it = ITEMS[id]; if (!it?.sell || (kind === 'drug') !== !!it.drug) continue; sum += it.sell * inv[id]; cnt += inv[id]; delete inv[id]; }
    if (!cnt) { this.toast(kind === 'drug' ? 'Нечего сбывать' : 'Нет урожая на продажу'); return; }
    this.state.money += sum; this.sound.coin();
    this.toast(`${kind === 'drug' ? '🍁 Сбыто' : '🧺 Продано'}: ${cnt} шт. за $${sum}`);
    if (kind === 'drug' && Math.random() < 0.3) this.addWanted(1, 'Сбыт запрещённых веществ');
  }
  private plantMesh(g: THREE.Group, x: number, y: number, z: number, crop: string, pr: number) {
    const c = CROPS[crop]; if (!c) return;
    const k = 0.25 + pr * 0.75, tall = crop === 'sunflower' ? 1.6 : crop === 'durman' ? 1.1 : 0.7;
    const stem = new THREE.Mesh(T.cylB, mat('c:#3f6212')); stem.scale.set(0.03, tall * k, 0.03); stem.position.set(x, y, z); g.add(stem);
    const leaf = new THREE.Mesh(T.ico, mat('c:' + c.leaf)); leaf.scale.set(0.28 * k, 0.22 * k, 0.28 * k); leaf.position.set(x, y + tall * k * 0.6, z); g.add(leaf);
    if (crop === 'durman') { for (let i = 0; i < 3; i++) { const l2 = new THREE.Mesh(T.cone, mat('c:#65a30d')); l2.scale.set(0.18 * k, 0.4 * k, 0.05); l2.position.set(x, y + tall * k * (0.4 + i * 0.2), z); l2.rotation.y = i * 2.1; l2.rotation.z = 0.6; g.add(l2); } }
    if (pr >= 1) {
      if (crop === 'sunflower') { const f = new THREE.Mesh(T.cylB, mat('c:' + c.fruit)); f.scale.set(0.22, 0.05, 0.22); f.rotation.x = 1.2; f.position.set(x, y + tall, z + 0.05); g.add(f); }
      else for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(T.sphere, mat('c:' + c.fruit)); f.scale.setScalar(crop === 'cucumber' ? 0.05 : 0.065); f.position.set(x + Math.cos(i * 1.6) * 0.17, y + tall * 0.45 + (i % 2) * 0.12, z + Math.sin(i * 1.6) * 0.17); g.add(f); }
    }
  }
  updatePlants() {
    const g = this.plantsGroup; g.clear();
    const pl = this.state.plants ?? {}; const keys = Object.keys(pl);
    if (!keys.length) return;
    if (this.interior?.pots && this.state.location?.sub === 1) {
      const b = this.state.location.b; const ig = new THREE.Group();
      this.interior.pots.forEach((pt, i) => { const key = `${b}:pot:${i}`; if (pl[key]) this.plantMesh(ig, pt.x, 0.52, pt.z, pl[key].crop, this.plantProgress(key)); });
      g.add(ig); return;
    }
    if (this.interior) return;
    for (const key of keys) {
      const [bs, kind, is] = key.split(':'); if (kind !== 'bed') continue;
      const b = this.L.buildings[+bs]; const bed = b?.beds?.[+is]; if (!bed || Math.abs(bed.x - this.px) > 120 || Math.abs(bed.z - this.pz) > 120) continue;
      const alongZ = b.w > b.d; const pr = this.plantProgress(key);
      for (const o of [-2.3, 0, 2.3]) this.plantMesh(g, bed.x + (alongZ ? 0 : o), 0.37, bed.z + (alongZ ? o : 0), pl[key].crop, pr);
    }
  }
  // ================= ЧАТ И КОМАНДЫ =================
  chatLog(): ChatMsg[] { return this.net?.chat ?? this.localChat; }
  private pushLocal(m: Omit<ChatMsg, 't'>) { const arr = this.net?.chat ?? this.localChat; arr.push({ ...m, t: Date.now() }); if (arr.length > 80) arr.shift(); }
  chatSubmit(raw: string) {
    const text = raw.trim(); if (!text) return;
    if (!text.startsWith('/')) { if (this.net) this.net.sendChat(text); else this.pushLocal({ name: this.state.nick ?? 'Вы', text, color: '#e5e7eb', me: true }); return; }
    const [cmd0, ...rest] = text.split(/\s+/); const cmd = cmd0.toLowerCase(); const arg = rest.join(' ').trim();
    const sys = (t: string) => this.pushLocal({ name: 'Система', text: t, color: '#93c5fd', kind: 'cmd' });
    switch (cmd) {
      case '/me': if (!arg) { sys('Использование: /me действие'); return; } if (this.net) this.net.sendMe(arg); else this.pushLocal({ name: this.state.nick ?? 'Вы', text: arg, color: '#c084fc', kind: 'me', me: true }); return;
      case '/smi': case '/news': case '/сми': {
        if (arg.length < 3) { sys('Использование: /smi текст объявления ($300)'); return; }
        if (this.state.money < 300) { sys('Объявление в СМИ стоит $300 — недостаточно денег'); return; }
        this.state.money -= 300; this.sound.coin();
        if (this.net) this.net.sendNews(arg); else this.pushLocal({ name: this.state.nick ?? 'Вы', text: arg, color: '#facc15', kind: 'news', me: true });
        this.toast('📰 Объявление опубликовано в СМИ'); return;
      }
      case '/mm': this.openPanel({ type: 'passport' }); return;
      case '/lk': this.toggleCarLock(); return;
      case '/home': this.openPanel({ type: 'phone', tab: 'homes' }); return;
      case '/biz': this.openPanel({ type: 'phone', tab: 'biz' }); return;
      case '/e': case '/anim': { const n = parseInt(arg, 10); if (n >= 1 && n <= EMOTES.length) this.playEmote(EMOTES[n - 1].id); else this.openPanel({ type: 'emotes' }); return; }
      case '/obm': case '/trade': {
        if (!this.net) { sys('Обмен доступен только в онлайне'); return; }
        if (!arg) { sys('Использование: /obm ник'); return; }
        if (['да', 'yes', 'принять'].includes(arg.toLowerCase())) { this.tradeAccept(); return; }
        this.tradeRequest(arg); return;
      }
      case '/sellhome': this.sellHome(arg); return;
      case '/sellcar': this.sellCarCmd(arg); return;
      case '/sellbiz': this.sellBizCmd(arg); return;
      case '/cam': case '/selfie': this.startCamera(cmd === '/selfie' ? 'selfie' : 'rear'); return;
      case '/help': case '/помощь':
        sys('Команды: /sellhome /sellcar /sellbiz — быстрая продажа (60%) · /cam /selfie — камера · /me действие · /smi текст ($300, объявление в СМИ) · /obm ник — обмен · /mm — паспорт · /lk — закрыть/открыть авто · /home — дом · /biz — бизнес · /e 1-10 — анимации'); return;
      default: sys(`Неизвестная команда ${cmd}. Введите /help`);
    }
  }
  // ================= ЗАМОК АВТО =================
  toggleCarLock() {
    const w = this.playerWorldPos();
    const v = this.inVeh?.owned ? this.inVeh : this.vehicles.filter((x) => x.owned).sort((a, b) => Math.hypot(a.x - w.x, a.z - w.z) - Math.hypot(b.x - w.x, b.z - w.z))[0];
    if (!v?.owned || (v !== this.inVeh && Math.hypot(v.x - w.x, v.z - w.z) > 25)) { this.toast('Рядом нет вашей машины'); return; }
    v.owned.locked = !v.owned.locked; this.sound.beep(); this.netN = 0;
    if (!this.inVeh) { v.model.setLights(true); setTimeout(() => v.model.setLights(false), 350); }
    this.toast(v.owned.locked ? `🔒 ${v.spec.name}: закрыто — пассажиры не сядут` : `🔓 ${v.spec.name}: открыто`); this.save();
  }
  // ================= АНИМАЦИИ =================
  playEmote(id: string) {
    if (this.inVeh || this.rideRemote) { this.toast('Выйдите из транспорта'); return; }
    if (this.isWater(this.px, this.pz) && !this.interior) return;
    this.emote = { id, t0: performance.now() }; this.lying = false; this.crouch = false; this.closePanel();
  }
  // ================= ОБМЕН =================
  private th(o: Record<string, number>, m: number) { return JSON.stringify(Object.entries(o).filter(([, n]) => n > 0).sort()) + '|' + m; }
  private tsend(op: 'req' | 'acc' | 'dec' | 'cancel' | 'offer' | 'ready' | 'unready', extra: Record<string, unknown> = {}) { if (this.net && (this.trade || this.tradeInvite || op === 'req')) this.net.sendEvent({ e: 'trade', t: (extra.t as number) ?? this.trade?.peer ?? this.tradeInvite?.from ?? -1, op, ...extra } as NetEvent); }
  tradeRequest(nick: string) {
    const p = this.net?.findByNick(nick); if (!p) { this.toast(`Игрок «${nick}» не найден`); return; }
    if (this.trade) { this.toast('Сначала завершите текущий обмен'); return; }
    this.net!.sendEvent({ e: 'trade', t: p.id, op: 'req' }); this.pendingTradeTo = { id: p.id, t: Date.now() };
    this.toast(`🔁 Запрос обмена отправлен игроку ${p.nick ?? p.name}`);
  }
  private pendingTradeTo: { id: number; t: number } | null = null;
  private openTrade(peer: number) {
    this.trade = { peer, name: this.net?.displayName(peer) ?? '?', mine: {}, myMoney: 0, theirs: {}, theirMoney: 0, myReady: false, theirReady: false, view: 'theirs' };
    this.openPanel({ type: 'trade' });
  }
  tradeAccept() { const inv = this.tradeInvite; if (!inv) { this.toast('Нет входящих запросов'); return; } this.tradeInvite = null; this.net?.sendEvent({ e: 'trade', t: inv.from, op: 'acc' }); this.openTrade(inv.from); }
  tradeDecline() { const inv = this.tradeInvite; if (inv) this.net?.sendEvent({ e: 'trade', t: inv.from, op: 'dec' }); this.tradeInvite = null; this.closePanel(); }
  tradeCancel() { if (this.trade) this.tsend('cancel'); this.trade = null; this.closePanel(); this.toast('Обмен отменён'); }
  private tradeChanged() { const t = this.trade; if (!t) return; t.myReady = false; t.theirReady = false; this.tsend('offer', { items: Object.entries(t.mine).filter(([, n]) => n > 0), money: t.myMoney }); }
  tradeAdd(id: string) { const t = this.trade; if (!t) return; const have = this.state.inventory[id] ?? 0; const cur = t.mine[id] ?? 0; if (cur >= have) return; t.mine[id] = cur + 1; this.tradeChanged(); }
  tradeRemove(id: string) { const t = this.trade; if (!t || !t.mine[id]) return; t.mine[id]--; if (!t.mine[id]) delete t.mine[id]; this.tradeChanged(); }
  tradeMoney(m: number) { const t = this.trade; if (!t) return; t.myMoney = clamp(Math.floor(m) || 0, 0, Math.floor(this.state.money)); this.tradeChanged(); }
  tradeReady() {
    const t = this.trade; if (!t) return;
    for (const [id, n] of Object.entries(t.mine)) if ((this.state.inventory[id] ?? 0) < n) { this.toast('У вас больше нет этих предметов'); return; }
    if (this.state.money < t.myMoney) { this.toast('Недостаточно денег'); return; }
    t.myReady = true; this.tsend('ready', { h: this.th(t.mine, t.myMoney), h2: this.th(t.theirs, t.theirMoney) }); this.tryCompleteTrade();
  }
  private tryCompleteTrade() {
    const t = this.trade; if (!t || !t.myReady || !t.theirReady) return;
    if (t.th !== this.th(t.theirs, t.theirMoney) || t.th2 !== this.th(t.mine, t.myMoney)) return;
    const inv = this.state.inventory;
    for (const [id, n] of Object.entries(t.mine)) { inv[id] = (inv[id] ?? 0) - n; if (inv[id] <= 0) delete inv[id]; if (id === this.weapon && !inv[id]) this.setWeapon('fists'); }
    for (const [id, n] of Object.entries(t.theirs)) if (ITEMS[id]) inv[id] = (inv[id] ?? 0) + n;
    this.state.money += t.theirMoney - t.myMoney;
    this.toast(`✅ Обмен с ${t.name} завершён`); this.sound.coin();
    this.trade = null; this.closePanel(); this.save();
  }
  private onTradeEvent(from: number, ev: Extract<NetEvent, { e: 'trade' }>) {
    const name = this.net?.displayName(from) ?? '?';
    if (ev.op === 'req') {
      if (this.trade) { this.net?.sendEvent({ e: 'trade', t: from, op: 'dec' }); return; }
      this.tradeInvite = { from, name, t: Date.now() };
      this.toast(`🔁 ${name} предлагает обмен — /obm да или окно запроса`);
      if (!this.panel) this.openPanel({ type: 'tradeInvite' });
      return;
    }
    if (ev.op === 'acc') { if (this.pendingTradeTo?.id === from && !this.trade) { this.pendingTradeTo = null; this.openTrade(from); } return; }
    if (ev.op === 'dec') { if (this.pendingTradeTo?.id === from) { this.pendingTradeTo = null; this.toast(`${name} отклонил обмен`); } return; }
    const t = this.trade; if (!t || t.peer !== from) return;
    if (ev.op === 'cancel') { this.trade = null; this.closePanel(); this.toast(`${name} отменил обмен`); return; }
    if (ev.op === 'offer') {
      const items: Record<string, number> = {}; for (const [id, n] of ev.items ?? []) if (ITEMS[id] && n > 0) items[id] = Math.min(999, Math.floor(n));
      t.theirs = items; t.theirMoney = Math.max(0, Math.floor(ev.money ?? 0)); t.myReady = false; t.theirReady = false; return;
    }
    if (ev.op === 'ready') { t.theirReady = true; t.th = ev.h; t.th2 = ev.h2; this.tryCompleteTrade(); return; }
  }
  // ================= ОБЩИЙ МИР: кто ведёт NPC =================
  /** NPC и трафик в зоне игрока с меньшим id ведёт он — у остальных они скрыты и показываются его копиями */
  suppressed(x: number, z: number) {
    if (!this.online || !this.net || this.net.id === null) return false;
    for (const r of this.remotes.values()) if (r.id < this.net.id && !r.ikey && Math.abs(r.x - x) + Math.abs(r.z - z) < 200) return true;
    return false;
  }
  private applyCarSnapshot(owner: number, list: (string | number)[][]) {
    const now = performance.now(); const seen = new Set<string>();
    for (const r of list) {
      if (!Array.isArray(r) || r.length < 7) continue;
      const [id, type, color, x, z, a, sp, sir] = r as [number, string, string, number, number, number, number, number];
      if (!VEHICLES[type] || ![x, z, a].every(Number.isFinite)) continue;
      const key = owner + ':' + id; seen.add(key);
      let e = this.npcCars.get(key);
      if (!e) { const v = new Vehicle(type, 'npcpuppet', typeof color === 'string' ? color : undefined); v.place(x, z, a, 0); v.hasDriver = true; v.addDummyDriver(); this.addVehicle(v); e = { v, tx: x, tz: z, ta: a, ts: sp, t: now }; this.npcCars.set(key, e); }
      e.tx = x; e.tz = z; e.ta = a; e.ts = sp; e.t = now; e.v.sirens = !!sir;
    }
    for (const [key, e] of this.npcCars) if (key.startsWith(owner + ':') && !seen.has(key)) { this.removeVehicle(e.v); this.npcCars.delete(key); }
  }
  private updateCarPuppets(dt: number) {
    const now = performance.now();
    for (const [key, e] of this.npcCars) {
      if (now - e.t > 4000) { this.removeVehicle(e.v); this.npcCars.delete(key); continue; }
      const v = e.v; const k = Math.min(1, dt * 6);
      // экстраполяция по скорости + мягкая подтяжка к присланной точке
      v.x += Math.sin(v.heading) * e.ts * dt; v.z += Math.cos(v.heading) * e.ts * dt;
      if (Math.hypot(e.tx - v.x, e.tz - v.z) > 20) { v.x = e.tx; v.z = e.tz; } else { v.x += (e.tx - v.x) * k; v.z += (e.tz - v.z) * k; }
      e.tx += Math.sin(e.ta) * e.ts * dt; e.tz += Math.cos(e.ta) * e.ts * dt;
      v.heading += angleDiff(v.heading, e.ta) * k; v.speed = e.ts;
      v.model.animate(e.ts * dt, 0); if (v.sirens) v.model.sirens(now / 1000); v.sync();
      v.model.group.visible = !this.interior && Math.abs(v.x - this.px) + Math.abs(v.z - this.pz) < this.drawDist();
    }
  }
  removeCarPuppets(owner?: number) { for (const [key, e] of this.npcCars) if (owner === undefined || key.startsWith(owner + ':')) { this.removeVehicle(e.v); this.npcCars.delete(key); } }
  // ================= ДЫМ ОТ ШИН =================
  private spawnSmoke(v: Vehicle) {
    const f = v.forward(); const sx = f.z, sz = -f.x;
    for (const side of [1, -1]) {
      if (this.smoke.length > 60) { const o = this.smoke.shift()!; this.scene.remove(o.s); }
      const s = new THREE.Sprite(this.smokeMat.clone()); const bx = v.x - f.x * v.spec.len * 0.38 + sx * side * v.spec.wid * 0.45, bz = v.z - f.z * v.spec.len * 0.38 + sz * side * v.spec.wid * 0.45;
      s.position.set(bx, v.y + 0.35, bz); s.scale.setScalar(0.6); this.scene.add(s);
      this.smoke.push({ s, life: 1.2, vx: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8 });
    }
  }
  private updateSmoke(dt: number) {
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i]; p.life -= dt;
      p.s.position.x += p.vx * dt; p.s.position.z += p.vz * dt; p.s.position.y += dt * 0.6; p.s.scale.multiplyScalar(1 + dt * 1.6);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.max(0, p.life / 1.2) * 0.45;
      if (p.life <= 0) { this.scene.remove(p.s); (p.s.material as THREE.Material).dispose(); this.smoke.splice(i, 1); }
    }
  }
  // ================= КАМЕРА И ГАЛЕРЕЯ =================
  startCamera(mode: 'selfie' | 'rear') {
    if (this.inVeh || this.rideRemote) { this.toast('Выйдите из транспорта, чтобы фотографировать'); return; }
    this.closePanel(); this.emote = null; this.crouch = false;
    this.camMode = { mode }; this.camPitch = mode === 'selfie' ? 0.1 : 0; if (mode === 'selfie') this.camYaw = this.pa + Math.PI;
  }
  switchCamera() { if (!this.camMode) return; const m = this.camMode.mode === 'selfie' ? 'rear' : 'selfie'; this.camYaw = m === 'selfie' ? this.pa + Math.PI : this.pa; this.camMode = { mode: m }; }
  stopCamera() { this.camMode = null; this.player.root.visible = true; this.player.setItem(this.weapon); }
  takePhoto(): string | null {
    try {
      this.renderer.render(this.scene, this.camera);
      const src = this.renderer.domElement; const w = 720, h = Math.round((src.height / src.width) * w) || 405;
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
      g.drawImage(src, 0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 28, w, 28); g.fillStyle = '#fff'; g.font = 'bold 15px system-ui, sans-serif';
      g.fillText(`📍 ${this.locationName()}  ·  ${new Date().toLocaleString('ru')}`, 10, h - 9);
      g.textAlign = 'right'; g.fillText('LosSt Camera', w - 10, h - 9);
      const data = c.toDataURL('image/jpeg', 0.72);
      const list = loadPhotos(); list.unshift({ t: Date.now(), data, place: this.locationName() });
      while (list.length) { try { localStorage.setItem(PHOTO_KEY, JSON.stringify(list.slice(0, 30))); break; } catch { list.pop(); if (!list.length) break; } }
      this.flashT = 1; setTimeout(() => (this.flashT = 0), 180); this.sound.click();
      return data;
    } catch { this.toast('Не удалось сохранить фото'); return null; }
  }
  // ================= ПРОДАЖА ИМУЩЕСТВА =================
  private pickIndex<T>(list: T[], arg: string, near: (t: T) => number, label: (t: T, i: number) => string, what: string): T | null {
    const n = parseInt(arg, 10);
    if (n >= 1 && n <= list.length) return list[n - 1];
    const close = list.map((t) => ({ t, d: near(t) })).filter((x) => x.d < 25).sort((a, b) => a.d - b.d)[0];
    if (close) return close.t;
    if (list.length === 1) return list[0];
    this.pushLocal({ name: 'Система', text: `Укажите номер: ${list.map((t, i) => label(t, i)).join(' · ')} (пример: ${what} 1)`, color: '#93c5fd', kind: 'cmd' });
    return null;
  }
  sellHome(arg: string) {
    const props = this.state.properties; if (!props.length) { this.toast('У вас нет недвижимости'); return; }
    const w = this.playerWorldPos(); const cur = this.homeId();
    const id = cur && props.includes(cur) && !arg ? cur : this.pickIndex(props, arg, (p) => { const b = this.L.buildings[+p.split(':')[0]]; return b ? Math.hypot(b.door.x - w.x, b.door.z - w.z) : 1e9; }, (p, i) => `${i + 1}) ${this.propertyName(p)}`, '/sellhome');
    if (!id) return;
    const [bi, u] = id.split(':').map(Number); const b = this.L.buildings[bi];
    const price = Math.round(this.unitPrice(b, u) * 0.6);
    if (this.interior && this.state.location?.b === bi) { this.forceOutside(); this.state.location = null; }
    this.state.properties = props.filter((p) => p !== id);
    if (this.state.locks) delete this.state.locks[id];
    if (this.state.spawnHome === id) this.state.spawnHome = undefined;
    for (const k of Object.keys(this.state.plants ?? {})) if (k.startsWith(bi + ':')) delete this.state.plants![k];
    delete this.state.fridges[id];
    this.state.money += price; this.sound.coin(); this.netN = 0; this.save();
    this.toast(`🏠 ${this.propertyName(id)} продан(а) государству за $${price.toLocaleString('ru')}`);
  }
  sellCarCmd(arg: string) {
    const cars = this.state.vehicles; if (!cars.length) { this.toast('У вас нет транспорта'); return; }
    const w = this.playerWorldPos();
    const o = this.inVeh?.owned && !arg ? this.inVeh.owned : this.pickIndex(cars, arg, (c) => { const v = this.vehicles.find((x) => x.owned?.uid === c.uid); return v ? Math.hypot(v.x - w.x, v.z - w.z) : 1e9; }, (c, i) => `${i + 1}) ${VEHICLES[c.type].name}`, '/sellcar');
    if (!o) return;
    const v = this.vehicles.find((x) => x.owned?.uid === o.uid);
    const price = Math.round(carValue(o.type, o.year, o.mileage, o.condition) * 0.6);
    if (v) { if (this.inVeh === v) this.exitVehicle(true); this.removeVehicle(v); }
    this.state.vehicles = cars.filter((x) => x.uid !== o.uid);
    this.state.listings = (this.state.listings ?? []).filter((l) => l.uid !== o.uid);
    this.state.money += price; this.sound.coin(); this.save();
    this.toast(`🚗 ${VEHICLES[o.type].name} сдан в трейд-ин за $${price.toLocaleString('ru')}`);
  }
  sellBizCmd(arg: string) {
    const ks = this.state.kiosks; if (!ks.length) { this.toast('У вас нет бизнеса'); return; }
    const w = this.playerWorldPos();
    const k = this.pickIndex(ks, arg, (q) => { const kk = this.L.kiosks[q.id]; return Math.hypot(kk.x - w.x, kk.z - w.z); }, (q, i) => `${i + 1}) ${KIOSK_TYPES[this.L.kiosks[q.id].type].name}`, '/sellbiz');
    if (!k) return;
    this.updateKiosks();
    const kt = KIOSK_TYPES[this.L.kiosks[k.id].type]; const price = Math.round(kt.price * 0.6) + k.acc;
    this.state.kiosks = ks.filter((x) => x !== k); this.state.money += price; this.sound.coin(); this.save();
    this.toast(`🏪 Ларёк «${kt.name}» продан за $${price.toLocaleString('ru')}${k.acc ? ` (включая доход $${k.acc})` : ''}`);
  }
  // ================= РАБОТА: ОФИС И ФЕРМА =================
  hireOffice() { if (this.state.officeJob) return; if (this.job) { this.toast('Сначала завершите текущую работу'); return; } this.state.officeJob = true; this.state.officeDone = 0; this.save(); this.toast('💻 Вы приняты в «ЛосТех»! Садитесь за любой свободный ПК'); }
  quitOffice() { this.state.officeJob = false; this.save(); this.toast('Вы уволились из «ЛосТех»'); }
  pcReward(mode: 'office' | 'home', ok: boolean) {
    if (!ok) { this.sound.error(); return 0; }
    let pay = mode === 'office' ? 45 : 18;
    if (mode === 'office') {
      this.state.officeDone = (this.state.officeDone ?? 0) + 1;
      if (this.state.officeDone % 8 === 0) { pay += 250; this.toast('💰 Зарплата за смену: +$250 сверху!'); }
    }
    this.state.money += pay; this.state.energy = Math.max(0, this.state.energy - 0.8); this.sound.coin();
    return pay;
  }
  startFarmJob() {
    if (this.job) { this.toast('Сначала завершите текущую работу'); return; }
    this.job = { type: 'farm', stage: 'pickup', trough: 0, cycles: 0 }; this.closePanel();
    this.toast('🐄 Работа на ферме: возьмите мешок корма у стогов сена (метка)');
  }
  private farmStep() {
    const j = this.job; if (!j || j.type !== 'farm') return;
    this.carrying = false;
    if (j.stage === 'feed') {
      this.state.money += 40; this.sound.coin();
      if (j.trough < 2) { j.trough++; j.stage = 'pickup'; this.toast(`+$40. Следующий мешок — в кормушку №${j.trough + 1}`); }
      else { j.stage = 'eggs'; this.toast('+$40. Коровы накормлены! Теперь соберите яйца в курятнике'); }
    } else if (j.stage === 'crate') {
      j.cycles++; this.state.money += 70 + 150; this.sound.coin(); j.trough = 0; j.stage = 'pickup';
      this.toast(`🥚 Яйца сданы: +$70 и бонус за цикл $150 (циклов: ${j.cycles}). Продолжайте или завершите работу в планшете`);
    }
  }
  // ================= LosSt: приложения, доставка, лимитка =================
  hasApp(id: string) { return (this.state.apps ?? []).includes(id); }
  installApp(id: string) { const a = (this.state.apps ??= []); if (!a.includes(id)) a.push(id); this.save(); }
  removeApp(id: string) { this.state.apps = (this.state.apps ?? []).filter((x) => x !== id); this.save(); }
  orderDelivery(place: string, items: string[]) {
    const cost = items.reduce((a, id) => a + (ITEMS[id]?.price ?? 0), 0) + 5;
    if (!items.length) return;
    if (!this.pay(cost)) return;
    this.toast(`🛵 Заказ из «${place}» принят ($${cost}). Курьер будет через 20 секунд`);
    setTimeout(() => { for (const id of items) this.state.inventory[id] = (this.state.inventory[id] ?? 0) + 1; this.toast(`📦 Курьер доставил заказ из «${place}»`); this.sound.coin(); }, 20000);
  }
  buyLimited(id: string) {
    const i = LIMITED.findIndex((x) => x.id === id); const d = LIMITED[i]; if (!d) return;
    if ((this.state.limited ?? []).includes(id)) { this.applyLimited(id); return; }
    if (!limitedAvailable(i)) { this.toast('Этот дроп сейчас недоступен — загляните позже'); return; }
    if (!this.pay(d.price)) return;
    (this.state.limited ??= []).push(id); this.applyLimited(id);
    this.toast(`💎 Лимитка ваша: ${d.name}`);
  }
  applyLimited(id: string) {
    const d = LIMITED.find((x) => x.id === id); if (!d) return;
    const L = { ...this.state.look };
    if (d.kind === 'hair') L.hairColor = d.value; else if (d.kind === 'top') L.topColor = d.value; else if (d.kind === 'bottom') L.bottomColor = d.value; else L.acc = L.acc === d.value ? undefined : d.value;
    this.state.look = L; this.player.setLook(L); this.netN = 0; this.save();
  }
  // ================= ТЕЛЕГРАМ =================
  private npcReply(id: string, text: string) {
    const R: Record<string, string[]> = {
      vasya: ['Здорово! Как жизнь в городе?', 'Работу ищешь? На ферму «Зорька» загляни.', 'Если что — я у мэрии.', 'Не связывайся с бандитами у пляжа!'],
      mama: ['Сынок/доча, ты покушал(а)?', 'Позвони, как будет время ❤️', 'Шапку надень!', 'Горжусь тобой!'],
      support: ['Спасибо за обращение! Подробную жалобу отправьте в приложении «Поддержка» — её прочтут модераторы.', 'Ваш запрос принят в очередь.'],
    };
    const opts = R[id]; if (!opts) return;
    setTimeout(() => this.receiveDm(id, opts[Math.floor(Math.random() * opts.length)]), 1500 + Math.random() * 2000);
    void text;
  }
  sendDm(to: string, text: string) {
    const t = text.trim().slice(0, 300); if (!t) return;
    (this.state.dms ??= {})[to] = [...(this.state.dms[to] ?? []), { me: true, text: t, t: Date.now() }].slice(-60);
    const p = this.net?.findByNick(to);
    if (p && this.net) this.net.sendEvent({ e: 'dm', t: p.id, text: t, n: this.state.nick ?? '' });
    else this.npcReply(to, t);
    this.save();
  }
  receiveDm(from: string, text: string) {
    (this.state.dms ??= {})[from] = [...(this.state.dms[from] ?? []), { me: false, text, t: Date.now() }].slice(-60);
    (this.state.unread ??= {})[from] = (this.state.unread[from] ?? 0) + 1;
    const names: Record<string, string> = { vasya: 'Дядя Вася', mama: 'Мама', support: 'LosSt Поддержка' };
    this.toast(`✉️ ${names[from] ?? from}: ${text.slice(0, 60)}`); this.sound.tick();
  }
  // ================= ДЕНЬГИ: анимации и подбор =================
  private handPos() { this.player.root.updateMatrixWorld(true); return this.player.hand.getWorldPosition(new THREE.Vector3()); }
  private updateMoneyFx(dt: number) {
    const c = this.cashFx;
    if (c) {
      c.next -= dt;
      if (c.next <= 0 && c.left > 0) {
        c.next = 0.085; const amt = Math.min(c.per, c.left); c.left -= amt;
        const m = new THREE.Mesh(T.box, mat('c:#3f9a4a')); m.scale.set(0.17, 0.012, 0.08);
        const from = c.src.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.1, (Math.random() - 0.5) * 0.2));
        m.position.copy(from); this.scene.add(m);
        this.flyBills.push({ m, t: 0, from, amt, spin: (Math.random() - 0.5) * 20 });
      }
      if (c.left <= 0 && !this.flyBills.length) this.cashFx = null;
    }
    if (this.flyBills.length) {
      const hp = this.handPos();
      for (let i = this.flyBills.length - 1; i >= 0; i--) {
        const b = this.flyBills[i]; b.t += dt / 0.55;
        const k = Math.min(1, b.t);
        b.m.position.lerpVectors(b.from, hp, k); b.m.position.y += Math.sin(k * Math.PI) * 0.7;
        b.m.rotation.y += b.spin * dt; b.m.rotation.z = Math.sin(b.t * 9) * 0.6;
        if (b.t >= 1) { this.state.money += b.amt; this.sound.tick(); this.scene.remove(b.m); this.flyBills.splice(i, 1); }
      }
      if (this.player.item !== 'cash' && this.weapon === 'fists') this.player.setItem('cash');
    } else if (this.player.item === 'cash') this.player.setItem(this.weapon);
    // подбираемые предметы
    const now = performance.now() / 1000;
    const w = this.playerWorldPos(); const rad = this.inVeh ? 2.8 : 1.4;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.obj.rotation.y += dt * 2.2; p.obj.position.y = p.y + 0.25 + Math.sin(now * 3 + p.x) * 0.08;
      const near = Math.hypot(p.x - w.x, p.z - w.z) < rad && Math.abs(p.y - (this.inVeh ? this.inVeh.y : this.py)) < 2.5 && !this.passenger;
      if (near) {
        if (p.kind === 'cash') { this.state.money += p.amt; this.sound.coin(); this.toast(`💵 Подобрано $${p.amt}`); }
        else { this.state.inventory.cigarettes = (this.state.inventory.cigarettes ?? 0) + p.amt; this.sound.click(); this.toast(`🚬 Подобрана пачка сигарет`); }
      }
      if (near || now - p.t > 120) { this.scene.remove(p.obj); this.pickups.splice(i, 1); }
    }
  }
  spawnPickup(x: number, z: number, kind: 'cash' | 'cig', amt: number, y?: number) {
    const g = new THREE.Group();
    if (kind === 'cash') {
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(T.box, mat('c:#3f9a4a')); b.scale.set(0.24, 0.035, 0.12); b.position.set((i - 1) * 0.03, i * 0.036, (i % 2) * 0.02); b.rotation.y = i * 0.25; g.add(b); }
      const band = new THREE.Mesh(T.box, mat('c:#f5f5dc')); band.scale.set(0.05, 0.12, 0.13); band.position.y = 0.035; g.add(band);
    } else {
      const b = new THREE.Mesh(T.box, mat('c:#f8fafc')); b.scale.set(0.09, 0.13, 0.05); g.add(b);
      const t = new THREE.Mesh(T.box, mat('c:#dc2626')); t.scale.set(0.092, 0.045, 0.052); t.position.y = 0.045; g.add(t);
    }
    const gy = y ?? this.activeCol.groundAt(x, z, 2, 3);
    g.position.set(x, gy + 0.25, z); this.scene.add(g);
    this.pickups.push({ obj: g, kind, amt, x, y: gy, z, t: performance.now() / 1000 });
    while (this.pickups.length > 40) { const o = this.pickups.shift()!; this.scene.remove(o.obj); }
  }
  /** NPC погиб от игрока — выпадают деньги и иногда сигареты */
  private onPedDeath(p: import('./npc').Ped) {
    if (p.role === 'thug' && this.state.quest?.step === 5) { this.state.quest.kills = (this.state.quest.kills ?? 0) + 1; this.toast(`Бандит повержен (${this.state.quest.kills}/2)`); }
    const rich = p.char.look.top === 'suit' ? 2.5 : p.role === 'cashier' || p.role === 'vendor' ? 2 : 1;
    const amt = Math.round((12 + Math.random() * 110) * rich);
    const a = Math.random() * 6.28;
    this.spawnPickup(p.x + Math.cos(a) * 0.5, p.z + Math.sin(a) * 0.5, 'cash', amt, p.y);
    if (Math.random() < 0.25) this.spawnPickup(p.x - Math.cos(a) * 0.6, p.z - Math.sin(a) * 0.6, 'cig', 1, p.y);
  }
  // ================= НЕДВИЖИМОСТЬ: замки и занятость =================
  isLocked(id: string) { return !!this.state.locks?.[id]; }
  toggleLock(id: string) {
    if (!this.state.properties.includes(id)) return;
    (this.state.locks ??= {})[id] = !this.state.locks[id];
    this.toast(this.state.locks[id] ? '🔒 Заперто — гости не смогут войти' : '🔓 Открыто — игроки могут зайти в гости');
    this.sound.door(); this.save(); this.netN = 0;
  }
  setSpawnHome(id: string) { if (this.state.properties.includes(id)) { this.state.spawnHome = id; this.toast('🏠 Здесь вы будете появляться при входе в онлайн'); this.save(); } }
  /** кем занята недвижимость (другой игрок онлайн) */
  takenBy(id: string): { name: string; locked: boolean; pid: number } | null {
    if (!this.online || !this.net) return null;
    for (const r of this.remotes.values()) { const e = r.props.find((x) => x[0] === id); if (e) return { name: r.name, locked: !!e[1], pid: r.id }; }
    return null;
  }
  propertyName(id: string) { const [b, u] = id.split(':').map(Number); const bd = this.L.buildings[b]; if (!bd) return id; return bd.kind === 'apartment' ? `${bd.name}, кв. ${u + 1}` : bd.village ? `Дом · ${bd.village}` : 'Частный дом'; }
  gotoProperty(id: string) { const bd = this.L.buildings[+id.split(':')[0]]; if (bd) { this.destination = { x: bd.door.x, z: bd.door.z }; this.toast('Маршрут проложен'); } }
  // ================= АВТОБАЗАР =================
  listingOfUid(uid: string) { return this.state.listings?.find((l) => l.uid === uid) ?? null; }
  remoteOwnerOf(v: Vehicle) { for (const r of this.remotes.values()) if (r.veh === v) return r; return null; }
  remoteListingOf(v: Vehicle): { r: Remote; l: Listing } | null {
    for (const r of this.remotes.values()) { const i = r.listings.indexOf(v); if (i >= 0) { const pst = this.net?.players.get(r.id)?.st; const l = pst?.ls?.[i]; if (l) return { r, l }; } }
    return null;
  }
  slotBusy(slot: number) {
    if (this.state.listings?.some((l) => l.slot === slot)) return 'Вы';
    for (const r of this.remotes.values()) if (this.net?.players.get(r.id)?.st?.ls?.some((l) => l.slot === slot)) return r.name;
    return null;
  }
  private bazaarPrompt(px: number, pz: number): Prompt | null {
    for (const sl of this.L.bazaarSlots) {
      if (Math.hypot(sl.x - px, sl.z - pz) > 3.5) continue;
      const busy = this.slotBusy(sl.id);
      return { text: busy ? `Место ${sl.id + 1}: машина продаётся (${busy})` : `Место продажи ${sl.id + 1}: заезжайте сюда на своей машине`, keys: [], act: () => {} };
    }
    return null;
  }
  listCar(uid: string, slot: number, price: number) {
    const v = this.vehicles.find((x) => x.owned?.uid === uid); const sl = this.L.bazaarSlots[slot];
    if (!v || !sl) return;
    const busy = this.slotBusy(slot); if (busy && busy !== 'Вы') { this.toast(`Место занято (${busy})`); return; }
    if (!(price >= 100 && price <= 10_000_000)) { this.toast('Укажите цену от $100'); return; }
    if (this.inVeh === v) this.exitVehicle(true);
    v.place(sl.x, sl.z, sl.a, v.y); v.speed = 0;
    this.state.listings = (this.state.listings ?? []).filter((l) => l.uid !== uid && l.slot !== slot);
    this.state.listings.push({ slot, uid, price: Math.round(price), t: Date.now() });
    this.closePanel(); this.save(); this.netN = 0;
    this.toast(`🏷 ${v.spec.name} выставлен за $${Math.round(price).toLocaleString('ru')}. ${this.online ? 'Игроки и NPC-покупатели' : 'NPC-покупатели'} увидят объявление`);
  }
  unlist(uid: string) { this.state.listings = (this.state.listings ?? []).filter((l) => l.uid !== uid); this.toast('Объявление снято'); this.save(); this.netN = 0; }
  private sellListed(uid: string, price: number, buyer: string) {
    const o = this.state.vehicles.find((x) => x.uid === uid); const v = this.vehicles.find((x) => x.owned?.uid === uid);
    if (!o) return null;
    if (v) { if (this.inVeh === v) this.exitVehicle(true); this.removeVehicle(v); }
    this.state.vehicles = this.state.vehicles.filter((x) => x.uid !== uid);
    this.state.listings = (this.state.listings ?? []).filter((l) => l.uid !== uid);
    this.state.money += price; this.sound.coin();
    this.toast(`💰 ${buyer} купил ваш ${VEHICLES[o.type].name} за $${price.toLocaleString('ru')}`);
    this.save(); this.netN = 0;
    return o;
  }
  /** NPC-покупатели на автобазаре */
  private updateBazaar() {
    for (const l of [...(this.state.listings ?? [])]) {
      const o = this.state.vehicles.find((x) => x.uid === l.uid);
      if (!o) { this.state.listings = this.state.listings!.filter((x) => x !== l); continue; }
      if (Date.now() - l.t < 45000) continue;
      const fair = sellPrice(o, this.marketPeriod()) / 0.9;
      const ratio = l.price / Math.max(300, fair);
      const p = clamp(1.35 - ratio, 0.02, 0.85) * 0.18;
      if (Math.random() < p) this.sellListed(l.uid, l.price, 'NPC-покупатель');
    }
  }
  requestBuyListing(seller: number, l: Listing) {
    if (!this.net) return;
    if (this.pendingBuy) { this.toast('Ждём ответа продавца…'); return; }
    if (this.state.money < l.price) { this.toast('Недостаточно денег'); this.sound.error(); return; }
    this.state.money -= l.price; // задаток до подтверждения
    this.pendingBuy = { slot: l.slot, price: l.price, seller, t: performance.now() };
    this.net.sendEvent({ e: 'buyreq', t: seller, slot: l.slot, price: l.price });
    this.toast('Запрос продавцу отправлен…');
  }
  private carData(o: OwnedVehicle) { return { type: o.type, color: o.color, year: o.year, mil: Math.round(o.mileage), cond: Math.round(o.condition * 100) / 100, tun: JSON.stringify(o.tuning) }; }
  // ================= ОБЩИЕ NPC =================
  /** урон NPC: свои — напрямую, чужие (марионетки) — владельцу по сети */
  hitPed(ped: Ped, dmg: number, fx: number, fz: number, o: { heavy?: boolean; gun?: boolean } = {}) {
    if (ped.kind === 'puppet' && ped.owner !== undefined && this.net) {
      ped.hitByMe = performance.now();
      this.net.sendEvent({ e: 'pedhit', o: ped.owner, i: ped.uid, d: Math.round(dmg), heavy: o.heavy, gun: o.gun, fx: r2(fx), fz: r2(fz) });
      ped.char.pose('flinch', 0, 0.5);
      return ped.netPose === 6 ? 'down' : 'hit';
    }
    return this.peds.damage(ped, dmg, fx, fz, { ...o, obstacles: (x, z) => this.activeCol.query(x, z, 0.3).some((b) => b.y1 > 0.5) });
  }
  // ================= ПОДДЕРЖКА =================
  async sendSupport(category: string, text: string, contact: string) {
    return sendTicket({ category, text, contact, nick: this.state.nick ?? '', online: this.online, place: this.locationName(), money: this.state.money });
  }
  // ================= РЕДАКТОР ВНЕШНОСТИ =================
  openEditor(fresh: boolean) { if (this.inVeh) this.exitVehicle(true); this.editorYaw = 0; this.openPanel({ type: 'editor', fresh }); }
  finishEditor(l: Look) { this.state.look = { ...l }; this.state.customized = true; this.player.setLook(this.state.look); this.save(); this.closePanel(); this.netN = 0; this.toast('Персонаж сохранён'); }
  // ================= ОНЛАЙН =================
  toggleOnline() { if (this.online) this.leaveOnline(); else this.openPanel({ type: 'onlineJoin' }); }
  interiorKey() { const l = this.state.location; return this.interior && l ? `${l.b}:${l.unit ?? ''}:${l.sub ?? ''}` : ''; }
  onlineInfo() {
    const st = loadState(true);
    let nick = st?.nick ?? '';
    try { nick = nick || localStorage.getItem('losgorod_nick') || ''; } catch { /* */ }
    return { exists: !!st, nick, gender: st?.look.gender ?? this.state.look.gender, money: st?.money ?? 0, place: st ? (st.location ? 'в помещении' : 'на улице') : '' };
  }
  private forceOutside() {
    if (!this.interior) return;
    const b = this.state.location ? this.L.buildings[this.state.location.b] : null;
    this.interior.dispose(); this.peds.clearStatic(); this.interior = null; this.interiorKind = null; this.activeCol = this.col;
    this.W.root.visible = true; this.vehGroup.visible = true; this.sun.visible = true; this.lying = false;
    if (b) this.placeOutsideAt(b);
  }
  /** смена активного прогресса (соло ↔ онлайн): сохраняет текущий, выгружает его мир и загружает новый */
  private swapState(next: GameState, nextOnline: boolean) {
    this.closePanel();
    this.save();
    if (this.inVeh) this.exitVehicle(true);
    if (this.rideRemote) this.exitRemoteRide(true);
    this.forceOutside();
    if (this.job?.type === 'shift' && this.job.cust) this.peds.removePed(this.job.cust);
    if (this.job?.type === 'truck' && this.vehicles.includes(this.job.truck)) this.removeVehicle(this.job.truck);
    this.job = null; this.carrying = false; this.autopilot = false; this.destination = null; this.lying = false; this.fallT = 0;
    if (this.taxi) { this.removeVehicle(this.taxi.v); this.taxi = null; }
    if (this.service) { this.removeVehicle(this.service.v); this.service = null; }
    this.rental = null; this.emote = null; this.drugT = 0; this.renderer.domElement.style.filter = '';
    for (const v of [...this.vehicles]) if (v.owned || (v.role === 'police' && v.sirens)) this.removeVehicle(v);
    this.online = nextOnline;
    this.state = next;
    this.weapon = 'fists'; this.player.setItem('none'); this.combat.reset(); this.combat.clearFx();
    this.player.setLook(next.look);
    this.spawnOwnedVehicles();
    this.poiCache = null; this.gpsRoute = null; this.bustT = 0;
    this.restorePosition();
    this.camera.position.set(this.px - Math.sin(this.camYaw) * 5, this.py + 3, this.pz - Math.cos(this.camYaw) * 5);
  }
  enterOnline(nick: string, gender: 'm' | 'f', fresh = false) {
    if (this.intro || this.online) return;
    const clean = nick.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16);
    if (clean.length < 2) { this.toast('Ник должен быть от 2 до 16 символов'); return; }
    let st = fresh ? null : loadState(true);
    if (!st) st = newState(gender, this.L.playerSpawn);
    st.nick = clean;
    try { localStorage.setItem('losgorod_nick', clean); } catch { /* */ }
    // появление дома, если есть жильё
    const home = st.spawnHome && st.properties.includes(st.spawnHome) ? st.spawnHome : st.properties[0];
    if (home) { const [hb, hu] = home.split(':').map(Number); const bd = this.L.buildings[hb]; if (bd) st.location = bd.kind === 'apartment' ? { b: hb, unit: hu } : { b: hb }; }
    this.swapState(st, true);
    saveState(st, true);
    this.net = new NetClient(clean);
    this.net.onEvent = (from, ev) => this.handleNetEvent(from, ev);
    this.peds.onlineMode = false; this.removeQuestPeds();
    this.net.onChange = null;
    this.net.onNews = (nm, txt) => this.toast(`📰 СМИ · ${nm}: ${txt}`);
    this.net.onPeds = (from, list, vehs) => { if (this.remotes.get(from)?.ikey === '' || !this.remotes.has(from)) { this.peds.applySnapshot(from, list); this.applyCarSnapshot(from, vehs); } };
    this.net.connect();
    if (!st.customized) setTimeout(() => this.openEditor(true), 300);
    this.toast(`🌐 Онлайн: ${clean}. Отдельный прогресс сохраняется. Ё — вернуться в одиночную игру`);
    this.sound.coin();
  }
  leaveOnline() {
    if (!this.online) return;
    if (this.rideRemote) this.exitRemoteRide(true);
    this.net?.close(); this.net = null; this.pendingBuy = null;
    for (const r of this.remotes.values()) this.disposeRemote(r);
    this.remotes.clear(); this.peds.clearPuppets(); this.removeCarPuppets(); this.peds.onlineMode = false; this.trade = null; this.tradeInvite = null;
    const solo = loadState(false) ?? newState(this.state.look.gender, this.L.playerSpawn);
    this.swapState(solo, false);
    this.setupQuest();
    this.toast('Вы вернулись в одиночную игру. Онлайн-прогресс сохранён');
  }
  sendChat(text: string) { this.net?.sendChat(text); }
  /** игроки, доступные для атаки (в том же пространстве) */
  remoteTargets(includeVeh = false): Remote[] {
    if (!this.net) return [];
    const key = this.interiorKey();
    return [...this.remotes.values()].filter((r) => r.visible && r.ikey === key && r.hp > 0 && (includeVeh || !r.inVeh));
  }
  private handleNetEvent(from: number, ev: NetEvent) {
    const net = this.net; if (!net) return;
    if (ev.e === 'shot') { if (ev.i === this.interiorKey() && Math.hypot(ev.o[0] - this.px, ev.o[2] - this.pz) < 250) this.combat.remoteShot(ev.o, ev.p); return; }
    if (ev.e === 'hit') {
      if (ev.t !== net.id) { const r = this.remotes.get(ev.t); if (r) r.flinch = 0.3; return; }
      const att = this.remotes.get(from);
      if (att && att.ikey !== this.interiorKey()) return;
      const d = clamp(Number(ev.d) || 0, 0, 100);
      const landed = this.combat.takeHit(d, Number(ev.hx) || this.px, Number(ev.hz) || this.pz, { heavy: !!ev.heavy, gun: ev.k === 'gun', from });
      if (landed && ev.k === 'gun') this.combat.blood(this.px, this.py + 1.3, this.pz, 5);
      if (landed && Math.random() < 0.4) this.toast(`${net.displayName(from)} ${ev.k === 'gun' ? 'стреляет в вас!' : 'бьёт вас!'}`);
      return;
    }
    if (ev.e === 'pedhit') {
      if (ev.o !== net.id) return;
      const ped = this.peds.byUid(Number(ev.i)); if (!ped) return;
      const res = this.peds.damage(ped, clamp(Number(ev.d) || 0, 0, 120), Number(ev.fx), Number(ev.fz), { heavy: !!ev.heavy, gun: !!ev.gun, foe: from, obstacles: (x, z) => this.col.query(x, z, 0.3).some((b) => b.y1 > 0.5) });
      if (ev.gun) this.combat.blood(ped.x, ped.y + 1.3, ped.z, 4);
      void res; return;
    }
    if (ev.e === 'dm') { if (ev.t === net.id) this.receiveDm(String(ev.n || net.displayName(from)).slice(0, 16), String(ev.text).slice(0, 300)); return; }
    if (ev.e === 'trade') { if (ev.t === net.id) this.onTradeEvent(from, ev); return; }
    if (ev.e === 'pay') {
      if (ev.t !== net.id) return;
      const amt = clamp(Math.round(Number(ev.amt) || 0), 0, 1_000_000); if (!amt) return;
      this.state.money += amt; this.sound.coin(); this.toast(`💵 ${net.displayName(from)} заплатил вам $${amt}: ${String(ev.why).slice(0, 40)}`); return;
    }
    if (ev.e === 'buyreq') {
      if (ev.t !== net.id) return;
      const l = this.state.listings?.find((x) => x.slot === ev.slot);
      if (!l || l.price !== ev.price) { net.sendEvent({ e: 'sold', t: from, slot: ev.slot, ok: false }); return; }
      const o = this.sellListed(l.uid, l.price, net.displayName(from));
      net.sendEvent({ e: 'sold', t: from, slot: ev.slot, ok: !!o, car: o ? this.carData(o) : undefined });
      return;
    }
    if (ev.e === 'sold') {
      if (ev.t !== net.id || !this.pendingBuy || this.pendingBuy.seller !== from) return;
      const pb = this.pendingBuy; this.pendingBuy = null;
      if (!ev.ok || !ev.car || !VEHICLES[ev.car.type]) { this.state.money += pb.price; this.toast('Сделка не состоялась — деньги возвращены'); return; }
      let tun = defaultTuning(); try { if (ev.car.tun) tun = { ...tun, ...JSON.parse(ev.car.tun) }; } catch { /* */ }
      const sl = this.L.bazaarSlots[pb.slot] ?? this.L.bazaarSlots[0];
      const o = this.newOwned(ev.car.type, ev.car.color, { year: ev.car.year, mileage: ev.car.mil, condition: clamp(ev.car.cond, 0.05, 1), paid: pb.price, tuning: tun });
      const spot = this.freeSpotNear(sl.x, sl.z - 6);
      this.spawnOwned(o, spot.x, spot.z, sl.a);
      this.toast(`🚗 Вы купили ${VEHICLES[o.type].name} у ${net.displayName(from)} за $${pb.price.toLocaleString('ru')}`); this.sound.coin();
      return;
    }
    if (ev.e === 'dead') {
      const victim = net.displayName(from), killer = ev.by === net.id ? (this.state.nick ?? 'Вы') : net.displayName(ev.by);
      net.sys(`💀 ${killer} вырубил(а) ${victim}`);
      if (ev.by === net.id) this.toast(`Вы вырубили игрока ${victim}`);
    }
  }
  private updateNet(dt: number) {
    const net = this.net; if (!net) return;
    this.netT += dt; this.netMoveT += dt;
    const v = this.inVeh;
    const rr = this.rideRemote ? this.remotes.get(this.rideRemote.id) : null;
    const host = v ?? rr?.veh ?? null;
    const x = host ? host.x : this.px, z = host ? host.z : this.pz;
    if (this.netT > 0.12) {
      this.netT = 0; this.netN++;
      const L = this.state.look;
      const st: RemoteState = {
        x: r2(x), z: r2(z), y: r2(host ? host.y : this.py),
        a: Math.round((host ? host.heading : this.pa) * 1000) / 1000, s: Math.round((host ? host.speed : this.lastSpeed) * 10) / 10,
        v: v ? v.spec.id : '', c: v ? (v.model.tuning.paint ?? v.model.color) : '', seat: v ? (this.passenger ? 1 : 0) : this.rideRemote?.seat ?? 0,
        i: this.interiorKey(), hp: Math.round(this.state.health),
      };
      if (this.rideRemote) st.r = this.rideRemote.id;
      if (v) { st.lean = r2(v.lean); st.wh = r2(v.wheelie); st.lt = v.model.lightsOn ? 1 : 0; }
      if (!host) { st.p = this.lying ? 'lie' : this.fallT > 0 ? 'fall' : this.netPose.p; st.k = this.netPose.k; st.pt = this.netPose.pt; st.w = Math.max(0, WEAPON_ORDER.indexOf(this.weapon)); }
      if (this.crouch && !host) st.cr = 1;
      if (v?.owned?.locked && !this.passenger) st.lk = 1;
      if (v && v.spec.service === 'taxi' && !this.passenger) st.tx = 1;
      if (this.netN % 8 === 1) {
        st.l = [L.gender, L.skin, L.hair, L.hairColor, L.top, L.topColor, L.bottom, L.bottomColor, L.shoes, L.eyes ?? '', String(L.height ?? ''), String(L.build ?? ''), L.beard ?? '', L.lips ?? '', L.acc ?? ''] as unknown as RemoteState['l'];
        st.n = this.state.nick ?? '';
        st.pr = this.state.properties.map((id) => [id, this.isLocked(id) ? 1 : 0] as [string, number]);
        st.ls = (this.state.listings ?? []).map((l) => { const o = this.state.vehicles.find((x) => x.uid === l.uid); return o ? { slot: l.slot, type: o.type, color: o.tuning.paint ?? o.color, year: o.year, mil: Math.round(o.mileage), cond: Math.round(o.condition * 100) / 100, price: l.price } : null; }).filter(Boolean) as Listing[];
      }
      net.sendState(st);
    }
    if (this.netMoveT > 0.5) { this.netMoveT = 0; const w = this.playerWorldPos(); net.sendMove(w.x, w.z); }
    this.pedNetT += dt;
    if (this.pedNetT > 0.25 && !this.interior) {
      this.pedNetT = 0;
      const cars: (string | number)[][] = [];
      for (const cv of this.vehicles) if ((cv.role === 'traffic' || cv.role === 'police') && cv.ai && cv !== this.inVeh && Math.abs(cv.x - x) + Math.abs(cv.z - z) < 220 && cars.length < 18) cars.push([cv.id, cv.spec.id, cv.model.color, r2(cv.x), r2(cv.z), Math.round(cv.heading * 100) / 100, Math.round(cv.speed * 10) / 10, cv.sirens ? 1 : 0]);
      net.sendPeds(this.peds.snapshot(x, z, 170), cars);
    }
    this.updateCarPuppets(dt);
    if (this.pendingBuy && performance.now() - this.pendingBuy.t > 10000) { this.state.money += this.pendingBuy.price; this.pendingBuy = null; this.toast('Продавец не ответил — деньги возвращены'); }
    this.updateRemotes(dt);
  }
  private disposeRemote(r: Remote) {
    for (const lv of r.listings) this.removeVehicle(lv); r.listings = [];
    this.peds.removeOwner(r.id); this.removeCarPuppets(r.id);
    if (this.player.root.parent && r.veh && this.player.root.parent === r.veh.model.body) this.scene.add(this.player.root);
    r.char.dispose(); this.scene.remove(r.tag); (r.tag.material as THREE.SpriteMaterial).map?.dispose(); (r.tag.material as THREE.SpriteMaterial).dispose();
    if (r.veh) this.removeRemoteVeh(r);
  }
  private removeRemoteVeh(r: Remote) {
    const v = r.veh; if (!v) return;
    // вынести всех сидящих из модели перед удалением
    if (this.player.root.parent === v.model.body) this.scene.add(this.player.root);
    for (const q of this.remotes.values()) if (q.char.root.parent === v.model.body) this.scene.add(q.char.root);
    this.removeVehicle(v); r.veh = null;
  }
  private makeTag(name: string, color: string) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(15,23,42,0.75)'; g.beginPath(); g.roundRect(4, 8, 248, 48, 16); g.fill();
    g.fillStyle = color; g.beginPath(); g.arc(30, 32, 10, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 28px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(name.slice(0, 14), 50, 33);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true })); s.scale.set(2.4, 0.6, 1); s.renderOrder = 5;
    return s;
  }
  private seatChar(ch: Character, v: Vehicle, seatIdx: number) {
    const seats = v.model.seats; const seat = seats[Math.min(seatIdx, seats.length - 1)] ?? v.model.passenger;
    if (ch.root.parent !== v.model.body) v.model.body.add(ch.root);
    ch.root.position.set(seat.x, seat.y, seat.z); ch.root.rotation.set(0, 0, 0); ch.root.scale.setScalar(seat.scale);
    ch.setItem('none');
    return seat;
  }
  private updateRemotes(dt: number) {
    const net = this.net!; const now = performance.now();
    const myKey = this.interiorKey();
    const alive = new Set<number>();
    for (const p of net.others()) {
      alive.add(p.id);
      let r = this.remotes.get(p.id);
      const st = p.st && now - p.stT < 15000 ? p.st : null;
      const tx = st ? st.x : p.x, tz = st ? st.z : p.y;
      if (!isFinite(tx) || !isFinite(tz)) continue;
      const display = p.nick ?? p.name;
      if (!r) {
        const char = new Character(randomLook()); this.scene.add(char.root);
        const color = p.color && p.color.startsWith('hsl') ? '#' + new THREE.Color().setStyle(p.color).getHexString() : p.color || '#60a5fa';
        const tag = this.makeTag(display, color); this.scene.add(tag);
        r = { id: p.id, char, tag, veh: null, vehKey: '', x: tx, z: tz, y: st?.y ?? 0, a: st?.a ?? 0, phase: 0, lookKey: '', color, name: display, spd: 0, flinch: 0, inVeh: false, ikey: '', visible: false, weapon: 0, tagName: display, hp: 100, crouch: false, listings: [], listKey: '', props: [], taxi: false };
        this.remotes.set(p.id, r);
      }
      const R = r;
      if (R.tagName !== display) { this.scene.remove(R.tag); (R.tag.material as THREE.SpriteMaterial).map?.dispose(); R.tag = this.makeTag(display, R.color); this.scene.add(R.tag); R.tagName = display; R.name = display; }
      R.ikey = st?.i ?? ''; R.hp = st?.hp ?? 100; R.crouch = !!st?.cr; R.taxi = !!st?.tx;
      if (st?.pr) R.props = st.pr;
      // объявления автобазара другого игрока — показываем его машины на местах продажи
      const lsk = JSON.stringify(st?.ls ?? []);
      if (lsk !== R.listKey) {
        R.listKey = lsk; for (const lv of R.listings) this.removeVehicle(lv); R.listings = [];
        for (const l of st?.ls ?? []) { const sl = this.L.bazaarSlots[l.slot]; if (!sl || !VEHICLES[l.type]) { R.listings.push(new Vehicle('lada', 'remote')); continue; } const lv = new Vehicle(l.type, 'remote', l.color); lv.place(sl.x, sl.z, sl.a, 0.15); this.addVehicle(lv); R.listings.push(lv); }
      }
      if (st?.l) { const k = st.l.join('|'); if (k !== R.lookKey) { R.lookKey = k; const a = st.l as unknown as string[]; const [gender, skin, hair, hairColor, top, topColor, bottom, bottomColor, shoes] = a; const num = (x?: string) => (x && isFinite(+x) && +x > 0.5 && +x < 1.5 ? +x : undefined);
        R.char.setLook({ gender: gender === 'f' ? 'f' : 'm', skin, hair, hairColor, top, topColor, bottom, bottomColor, shoes, eyes: a[9] || undefined, height: num(a[10]), build: num(a[11]), beard: a[12] || undefined, lips: a[13] || undefined, acc: a[14] || undefined }); R.weapon = -1; } }
      // интерполяция
      const k = Math.min(1, dt * 9);
      const jump = Math.hypot(tx - R.x, tz - R.z) > 40;
      R.x = jump ? tx : R.x + (tx - R.x) * k; R.z = jump ? tz : R.z + (tz - R.z) * k;
      const ty = st ? st.y : this.col.groundAt(R.x, R.z, 3, 4);
      R.y = jump ? ty : R.y + (ty - R.y) * k;
      if (st) R.a += angleDiff(R.a, st.a) * k;
      R.spd = st ? st.s : 0;
      R.flinch = Math.max(0, R.flinch - dt);
      R.visible = R.ikey === myKey && Math.abs(R.x - this.px) + Math.abs(R.z - this.pz) < this.drawDist();
      // собственная машина удалённого игрока
      const vk = st && st.v && VEHICLES[st.v] ? st.v + '|' + st.c : '';
      if (vk !== R.vehKey) {
        if (R.veh) this.removeRemoteVeh(R);
        R.vehKey = vk;
        if (vk) { const nv = new Vehicle(st!.v, 'remote', st!.c || undefined); nv.hasDriver = true; this.addVehicle(nv); R.veh = nv; }
      }
      if (R.veh) {
        const nv = R.veh; const ox = nv.x, oz = nv.z;
        nv.x = R.x; nv.z = R.z; nv.y = R.y; nv.heading = R.a; nv.lean = st?.lean ?? 0; nv.wheelie = st?.wh ?? 0; nv.speed = R.spd;
        nv.model.animate(Math.hypot(nv.x - ox, nv.z - oz) * Math.sign(R.spd || 1), 0);
        if (nv.isHeli) { nv.rotorSpeed = 1; if (nv.model.rotor) nv.model.rotor.rotation.y += dt * 30; if (nv.model.tailRotor) nv.model.tailRotor.rotation.x += dt * 40; }
        if (!!st?.lt !== nv.model.lightsOn) nv.model.setLights(!!st?.lt);
        nv.sync(); nv.model.group.visible = R.visible;
      }
    }
    // посадка персонажей (после обновления всех машин)
    for (const p of net.others()) {
      const R = this.remotes.get(p.id); if (!R) continue;
      const st = p.st && now - p.stT < 15000 ? p.st : null;
      let host: Vehicle | null = null; let seatIdx = 0;
      if (R.veh) { host = R.veh; seatIdx = st?.seat ?? 0; }
      else if (st?.r !== undefined) {
        if (st.r === net.id) host = this.inVeh && !this.passenger ? this.inVeh : null;
        else host = this.remotes.get(st.r)?.veh ?? null;
        seatIdx = Math.max(1, st.seat ?? 1);
      }
      R.inVeh = !!host;
      if (host) {
        const seat = this.seatChar(R.char, host, seatIdx);
        R.char.pose(seatPose(seat, seatIdx), 0, 0, host.isRide ? host.lean : 0);
        R.char.root.visible = R.visible || host === this.inVeh;
        R.tag.position.set(host.x, host.y + host.spec.hei + 1.0 + (seatIdx ? 0.35 : 0), host.z);
        R.tag.visible = R.char.root.visible;
        continue;
      }
      if (R.char.root.parent !== this.scene) { this.scene.add(R.char.root); R.char.root.scale.setScalar(1); }
      const w = st?.w ?? 0; if (w !== R.weapon) { R.weapon = w; R.char.setItem(WEAPON_ORDER[w] ?? 'none'); }
      R.char.root.position.set(R.x, R.y, R.z); R.char.root.rotation.set(0, R.a, 0);
      const sp = Math.abs(R.spd);
      R.phase += dt * (sp > 4 ? 11 : 6.5) * Math.min(1, sp / 2);
      let pose = (st?.p && REMOTE_POSES.has(st.p) ? st.p : sp > 4 ? 'run' : sp > 0.3 ? 'walk' : 'idle') as Pose;
      const legPose = pose === 'walk' || pose === 'run' || pose === 'guard' || pose === 'aim' || pose === 'block' || pose === 'crouchwalk' || pose === 'crouchaim';
      let ph = legPose ? R.phase : st?.k ?? 0;
      if (R.flinch > 0 && pose !== 'knock' && pose !== 'fall') { pose = 'flinch'; ph = 1 - R.flinch / 0.35; }
      R.char.pose(pose, now / 1000, ph, st?.pt ?? 0, sp > 0.3 ? 1 : 0);
      if (pose === 'tread' || pose === 'swim') R.char.blob.visible = false;
      R.char.root.visible = R.visible;
      R.tag.position.set(R.x, R.y + 2.35, R.z); R.tag.visible = R.visible;
    }
    for (const [id, r] of this.remotes) if (!alive.has(id)) { if (this.rideRemote?.id === id) this.exitRemoteRide(true); this.disposeRemote(r); this.remotes.delete(id); }
  }
  // ---------- поездка пассажиром у другого игрока ----------
  private startRide(r: Remote) {
    const v = r.veh; const net = this.net; if (!v || !net) return;
    const seats = v.model.seats;
    const used = new Set<number>([0]);
    for (const q of net.others()) if (q.st?.r === r.id) used.add(Math.max(1, q.st.seat ?? 1));
    const pst = net.players.get(r.id)?.st; if (pst && pst.seat) used.add(pst.seat);
    if (pst?.lk) { this.toast(`🔒 Машина игрока ${r.name} заперта`); this.sound.error(); return; }
    let free = -1; for (let i = 1; i < seats.length; i++) if (!used.has(i)) { free = i; break; }
    if (free < 0) { this.toast('В машине нет свободных мест'); return; }
    this.rideRemote = { id: r.id, seat: free }; this.rideDist = 0;
    if (r.taxi) this.toast(`🚕 Такси игрока ${r.name}: $5 посадка + $14 за км, оплата при выходе`);
    this.combat.reset(); this.lying = false;
    this.seatChar(this.player, v, free);
    this.camDist = Math.max(5, v.spec.len * 1.1 + 2.5);
    this.sound.door();
    this.toast(`Вы сели в машину к ${r.name}. F — выйти`);
  }
  private updateRideRemote() {
    const rr = this.rideRemote!; const r = this.remotes.get(rr.id);
    if (!r || !r.veh) { this.exitRemoteRide(true); this.toast('Водитель вышел из машины'); return; }
    const v = r.veh;
    const seat = this.seatChar(this.player, v, rr.seat);
    this.player.pose(seatPose(seat, rr.seat), 0, 0, v.isRide ? v.lean : 0);
    this.driveByUpdate(1 / 60, v);
    this.rideDist += Math.hypot(v.x - this.px, v.z - this.pz);
    this.px = v.x; this.pz = v.z; this.py = v.y; this.pa = v.heading;
  }
  rideFare() { return Math.round(5 + (this.rideDist / 1000) * 14); }
  exitRemoteRide(force = false) {
    const rr = this.rideRemote; if (!rr) return;
    const v = this.remotes.get(rr.id)?.veh ?? null;
    if (!force && v && Math.abs(v.speed) > 4) { this.toast('Машина едет слишком быстро'); return; }
    this.scene.add(this.player.root); this.player.root.scale.setScalar(1);
    if (v) {
      const f = v.forward(); const lx = f.z, lz = -f.x; const side = rr.seat % 2 === 1 ? -1 : 1;
      let placed = false;
      for (const sx of [side, -side]) { const ox = v.x + lx * sx * (v.spec.wid / 2 + 0.8), oz = v.z + lz * sx * (v.spec.wid / 2 + 0.8); if (!this.col.solidAt(ox, 1, oz)) { this.px = ox; this.pz = oz; placed = true; break; } }
      if (!placed) { this.px = v.x - f.x * (v.spec.len / 2 + 1); this.pz = v.z - f.z * (v.spec.len / 2 + 1); }
      this.pa = v.heading;
    }
    this.py = this.col.groundAt(this.px, this.pz, this.py + 3, 4);
    const rem = this.remotes.get(rr.id);
    if (rem?.taxi && this.net && this.rideDist > 30) {
      const fare = Math.min(this.state.money, this.rideFare());
      if (fare > 0) { this.state.money -= fare; this.net.sendEvent({ e: 'pay', t: rr.id, amt: fare, why: `поездка на такси ${(this.rideDist / 1000).toFixed(1)} км` }); this.toast(`🚕 Оплата такси игроку ${rem.name}: $${fare}`); }
    }
    this.rideRemote = null; this.rideDist = 0;
    this.player.setItem(this.weapon);
    this.sound.door();
  }
  // ================= КАМЕРА / ЗАСТАВКА =================
  rideVeh(): Vehicle | null { return this.rideRemote ? this.remotes.get(this.rideRemote.id)?.veh ?? null : null; }
  private camTarget() {
    const rv = this.rideVeh();
    if (rv) return new THREE.Vector3(rv.x, rv.y + Math.min(3, rv.spec.hei * 0.8 + 0.6), rv.z);
    if (this.combat?.gunOut && !this.lying) {
      const f = 0.6 + 0.4 * this.combat.aimF; const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw);
      return new THREE.Vector3(this.px + rx * 0.62 * f, this.py + (this.crouch ? 1.05 : 1.58), this.pz + rz * 0.62 * f);
    }
    if (this.inVeh) { const v = this.inVeh; return this.tmpV.set(v.x, v.y + Math.min(3, v.spec.hei * 0.8 + 0.6), v.z).clone(); }
    if (this.lying && this.interior?.bed) return new THREE.Vector3(this.interior.bed.x, this.interior.bed.y + 0.8, this.interior.bed.z);
    return new THREE.Vector3(this.px, this.py + (this.crouch ? 1.05 : 1.6), this.pz);
  }
  private desiredCam(target: THREE.Vector3) {
    const v = this.inVeh ?? this.rideVeh();
    let dist = v ? Math.max(this.camDist, v.spec.len * 1.1 + 3) : this.camDist;
    if (!v && this.combat?.gunOut) dist = 3.3 + (1.7 - 3.3) * this.combat.aimF;
    if (this.interior) dist = Math.min(dist, 3.4);
    if (v && this.lastLook > 1.4 && Math.abs(v.speed) > 2) this.camYaw += angleDiff(this.camYaw, v.heading + (v.speed < 0 ? Math.PI : 0)) * 0.05;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dir = new THREE.Vector3(-Math.sin(this.camYaw) * cp, sp, -Math.cos(this.camYaw) * cp);
    const c = this.interior ? this.activeCol : this.col;
    const hit = c.ray(target.x, target.y, target.z, dir.x, dir.y, dir.z, dist);
    const d = Math.max(0.6, Math.min(dist, hit - 0.3));
    const pos = target.clone().addScaledVector(dir, d);
    if (this.interior) pos.y = Math.min(pos.y, this.py + (this.interior.bounds.h - 0.3));
    pos.y = Math.max(pos.y, (this.interior ? this.py : 0) + 0.3);
    return pos;
  }
  private updateCamera(dt: number) {
    if (this.camMode && !this.inVeh) {
      const head = new THREE.Vector3(this.px, this.py + 1.62, this.pz);
      if (this.camMode.mode === 'selfie') {
        const a = this.pa; const pitch = clamp(this.camPitch, -0.3, 0.6);
        this.camera.position.set(this.px + Math.sin(a) * 0.95 - Math.cos(a) * 0.2, this.py + 1.68 + pitch * 0.6, this.pz + Math.cos(a) * 0.95 + Math.sin(a) * 0.2);
        this.camera.lookAt(head.x, head.y - 0.05, head.z);
      } else {
        const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
        this.camera.position.set(head.x + Math.sin(this.camYaw) * 0.25, head.y, head.z + Math.cos(this.camYaw) * 0.25);
        this.camera.lookAt(head.x + Math.sin(this.camYaw) * cp * 10, head.y - sp * 10, head.z + Math.cos(this.camYaw) * cp * 10);
      }
      if (Math.abs(this.camera.fov - 60) > 0.05) { this.camera.fov = 60; this.camera.updateProjectionMatrix(); }
      this.followSky(dt); return;
    }
    if (this.panel?.type === 'editor') {
      const a = this.pa + this.editorYaw;
      const wide = window.innerWidth > window.innerHeight;
      const t = new THREE.Vector3(this.px + (wide ? -Math.cos(a) * 0.55 : 0), this.py + (wide ? 1.05 : 0.75), this.pz + (wide ? Math.sin(a) * 0.55 : 0));
      this.camera.position.set(this.px + Math.sin(a) * 2.7, this.py + 1.25, this.pz + Math.cos(a) * 2.7);
      this.camera.lookAt(t); this.followSky(dt);
      this.player.root.position.set(this.px, this.py, this.pz); this.player.root.rotation.set(0, this.pa, 0); this.player.pose('idle', performance.now() / 1000);
      return;
    }
    const target = this.camTarget();
    const pos = this.desiredCam(target);
    const k = this.interior ? 1 : Math.min(1, dt * 12);
    this.camera.position.lerp(pos, k);
    this.camera.lookAt(target);
    const fov = 65 - (WEAPONS[this.weapon]?.zoom ?? 18) * (this.combat?.aimF ?? 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const sh = this.combat?.shake ?? 0;
    if (sh > 0) { this.camera.rotation.x += (Math.random() - 0.5) * sh * 0.08; this.camera.rotation.y += (Math.random() - 0.5) * sh * 0.08; }
    this.followSky(dt);
    if (this.dizzyT > 0) { const a = Math.min(1, this.dizzyT / 5) * (this.drugT > 0 ? 0.2 : 0.06); this.camera.rotation.z += Math.sin(performance.now() / 600) * a; this.camera.rotateY(Math.sin(performance.now() / 900) * a * 0.5); }
  }
  private followSky(dt: number) {
    const c = this.camera.position, far = this.camera.far;
    if (this.sky) this.sky.position.copy(c);
    if (this.stars) { this.stars.position.copy(c); this.stars.scale.setScalar((far * 0.92) / 90); }
    if (this.clouds) { this.clouds.position.copy(c); this.clouds.scale.setScalar(far * 0.9); this.clouds.rotation.y += dt * 0.004; }
  }
  private updateIntro(dt: number) {
    const it = this.intro!; it.t += dt;
    const u = Math.min(1, it.t / it.dur);
    const target = this.camTarget(); const end = this.desiredCam(target);
    const e = u * u * (3 - 2 * u);
    const ang = 0.8 + e * 2.2;
    const start = new THREE.Vector3(CITY_SIZE / 2 + Math.cos(ang) * 520 * (1 - e), 260 * (1 - e) + 4, CITY_SIZE / 2 + Math.sin(ang) * 520 * (1 - e));
    const mid = new THREE.Vector3(target.x + 40, 60, target.z + 40);
    const p = u < 0.7 ? start.lerp(mid, Math.pow(u / 0.7, 2)) : mid.lerp(end, (u - 0.7) / 0.3);
    this.camera.position.copy(p);
    const look = new THREE.Vector3(CITY_SIZE / 2, 0, CITY_SIZE / 2).lerp(target, Math.min(1, e * 1.4));
    this.camera.lookAt(look);
    this.followSky(dt);
    this.player.root.position.set(this.px, this.py, this.pz); this.player.root.rotation.y = this.pa; this.player.pose('idle', it.t);
    if (!this.interior) this.updateChunks();
    if (u >= 1) this.endIntro();
  }
  skipIntro() { if (this.intro) this.endIntro(); }
  private endIntro() { this.intro = null; this.camYaw = this.pa; this.cb.onIntroEnd(); this.sound.ensure(); if (!this.state.customized && !this.state.location) setTimeout(() => this.openEditor(true), 200); }
  // ================= HUD =================
  private emitHud(dt: number) {
    this.hudT += dt; if (this.hudT < 0.12) return;
    const sm = this.state.money;
    if (this.lastMoney >= 0 && sm > this.lastMoney + 0.5) { this.gainAmt += sm - this.lastMoney; this.gainT = 2.6; }
    this.lastMoney = sm; this.gainT -= this.hudT; if (this.gainT <= 0) this.gainAmt = 0;
    this.hudT = 0;
    const s = this.state; const h = Math.floor(s.gameTime / 60), m = Math.floor(s.gameTime % 60);
    const v = this.inVeh;
    const manual = this.settings.transmission === 'manual';
    const gear = !v ? '' : v.isHeli ? '' : v.speed < -0.3 ? 'R' : manual ? (v.gear === 0 ? 'N' : String(v.gear)) : v.autoMode === 'N' ? 'N' : 'D' + v.gear;
    this.cb.onHud({
      money: s.money, health: s.health, food: s.food, water: s.water, energy: s.energy, wanted: s.wanted,
      time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, night: this.isNight(),
      vehicle: v ? { name: v.spec.name, kmh: Math.round(Math.abs(v.speed) * 3.6), gear, rpm: v.rpm, fuel: v.fuel, autopilot: this.autopilot, heli: v.isHeli, alt: Math.round(v.y), moto: v.canStunt, lights: v.model.lightsOn, canAuto: !!v.spec.autopilot, manual, passenger: this.passenger } : null,
      prompt: this.prompt?.text ?? null, promptKeys: this.prompt?.keys ?? [], location: this.locationName(), job: this.jobText(), taxi: this.taxiText(), inside: !!this.interior,
      weapon: this.weapon, ammo: this.combat.reserve, lying: this.lying, fps: this.fps, intro: !!this.intro, carrying: this.carrying, destination: !!this.destination,
      online: this.online && this.net ? { status: this.net.status, players: this.net.players.size, id: this.net.id, nick: s.nick ?? '' } : null,
      gun: this.combat.armed ? { mag: this.combat.mag, reserve: this.combat.reserve, aiming: this.combat.aiming, spread: this.combat.spread, reloading: this.combat.reloadT > 0, name: WEAPONS[this.weapon]?.name ?? '', ammoName: AMMO_NAMES[WEAPONS[this.weapon]?.ammo ?? 'p'], driveBy: this.combat.driveBy } : null,
      camera: this.camMode ? { ...this.camMode } : null, flash: this.flashT,
      quest: this.questText(), rental: this.rental ? { min: Math.ceil(this.rental.paid / SCOOTER_RATE), cost: this.rental.paid } : null, trip: this.drugT > 0 ? Math.min(1, this.drugT / 6) : 0,
      emote: this.emote ? EMOTES.find((e) => e.id === this.emote!.id)?.name ?? null : null,
      hotbar: this.ownedWeapons().map((id) => ({ id, name: id === 'fists' ? 'Кулаки' : WEAPONS[id].name, key: WEAPON_ORDER.indexOf(id) + 1 })), tradeInvite: this.tradeInvite ? this.tradeInvite.name : null,
      gain: Math.round(this.gainAmt), stunt: this.inVeh?.canStunt && Math.abs(this.inVeh.wheelie) > 0.08 ? { angle: this.inVeh.wheelie, t: this.inVeh.stuntT, kind: this.inVeh.wheelie > 0 ? 'Вилли' : 'Стоппи' } : null, crouch: this.crouch && !this.inVeh, editor: this.panel?.type === 'editor',
      hitMarker: this.combat.hitMarker > 0, hurt: this.combat.hurt, blocking: this.combat.blocking, riding: !!this.rideRemote,
      chat: this.online && this.net ? this.net.chat.filter((c) => Date.now() - c.t < 15000).slice(-5).map((c) => ({ name: c.name, text: c.text, color: c.color })) : [],
    });
  }
  private jobText() {
    const j = this.job; if (!j) return null;
    if (j.type === 'factory') return `Завод: рейс ${j.trips + 1}/6 — ${j.stage === 'pickup' ? 'возьмите деталь на складе' : 'загрузите фуру №' + (j.truck + 1)}`;
    if (j.type === 'courier') return `Курьер: ${j.stage === 'pickup' ? 'заберите посылку — ' + j.from.name : 'доставьте посылку'} ($${j.pay})`;
    if (j.type === 'combine') return `Комбайн: заработано $${j.earned}`;
    if (j.type === 'farm') return `Ферма «Зорька»: ${j.stage === 'pickup' ? 'возьмите корм у стогов' : j.stage === 'feed' ? `насыпьте корм в кормушку №${j.trough + 1}` : j.stage === 'eggs' ? 'соберите яйца в курятнике' : 'сдайте яйца в ящик'} · циклов ${j.cycles}`;
    if (j.type === 'truck') return j.stage === 'toTruck' ? 'Дальнобойщик: сядьте в фуру на площадке терминала' : j.stage === 'drive' ? `Дальнобойщик: «${j.order.cargo}» → ${j.order.name} ($${j.order.pay})` : 'Дальнобойщик: верните фуру на терминал (+$120)';
    return `Смена в магазине: ${j.served}/5`;
  }
  private taxiText() { const t = this.taxi; if (!t) return null; return t.stage === 'coming' ? 'Такси едет к вам' : t.stage === 'waiting' ? 'Такси ждёт' : t.stage === 'riding' ? `В пути · ${(t.dist / 1000).toFixed(1)} км` : t.stage === 'arrived' ? 'Такси прибыло' : null; }
  locationName() {
    if (this.online) return '🌐 Онлайн · ' + this.locationNameOffline();
    return this.locationNameOffline();
  }
  locationNameOffline() {
    if (this.interior && this.state.location) { const b = this.L.buildings[this.state.location.b]; return b.kind === 'apartment' ? (this.state.location.unit !== undefined ? `Квартира ${this.state.location.unit + 1}` : 'Подъезд') + ' · ' + b.name : b.name; }
    const p = this.playerWorldPos();
    for (const v of this.L.villages) if (Math.hypot(v.cx - p.x, v.cz - p.z) < 170) return 'Деревня ' + v.name;
    const I = this.L.industrial; if (p.x > I.x0 - 20 && p.x < I.x1 && p.z > I.z0 && p.z < I.z1) return 'Промзона';
    const B = this.L.beach; if (p.x > B.x0 - 40 && p.x < B.x1 + 10 && p.z > B.z0 && p.z < B.z1) return 'Городской пляж';
    const F = this.L.farm; if (p.x > F.x0 - 20 && p.x < 1720 && p.z > F.z0 - 20 && p.z < 1320) return 'Поля «Нива»';
    if (p.x > 0 && p.x < CITY_SIZE && p.z > 0 && p.z < CITY_SIZE) { const c = CITY_SIZE / 2; const d = Math.max(Math.abs(p.x - c), Math.abs(p.z - c)); return d < 200 ? 'Лос-Город · Деловой центр' : (p.z < c ? 'Лос-Город · Северный район' : 'Лос-Город · Южный район'); }
    return 'Пригород';
  }
  // ================= СОХРАНЕНИЕ =================
  save() {
    if (!this.state) return;
    const s = this.state;
    if (!this.interior) { const p = this.playerWorldPos(); s.pos = { x: p.x, z: p.z, a: p.a }; }
    for (const v of this.vehicles) if (v.owned) { v.owned.pos = { x: v.x, z: v.z, a: v.heading }; v.owned.condition = v.condition; v.owned.fuel = v.fuel; v.owned.mileage = Math.round(v.mileage); v.owned.missing = v.model.missingParts(); }
    saveState(s, this.online);
  }
  getState() { return this.state; }
  ownedVehicleNear(uidv: string) { return this.vehicles.find((v) => v.owned?.uid === uidv) ?? null; }
  carValueOf(o: OwnedVehicle) { return carValue(o.type, o.year, o.mileage, o.condition); }
  tuningCost(a: Tuning, b: Tuning) {
    let c = 0;
    if ((a.paint ?? '') !== (b.paint ?? '')) c += TUNE_PRICES.paint;
    if (a.tint !== b.tint) c += TUNE_PRICES.tint;
    if (b.turbo > a.turbo) c += TUNE_PRICES.turbo * (b.turbo - a.turbo);
    if (b.engine > a.engine) c += TUNE_PRICES.engine * (b.engine - a.engine);
    if (a.rims !== b.rims) c += TUNE_PRICES.rims;
    if (a.spoiler !== b.spoiler) c += TUNE_PRICES.spoiler;
    if (a.clearance !== b.clearance) c += TUNE_PRICES.clearance;
    if (a.chrome !== b.chrome) c += TUNE_PRICES.chrome;
    if (a.neon !== b.neon) c += TUNE_PRICES.neon;
    if (a.lights !== b.lights) c += TUNE_PRICES.lights;
    return c;
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.net?.close(); this.net = null;
    try { this.save(); } catch { /* */ }
    this.input?.dispose(); this.sound.dispose(); this.resizeObs?.();
    this.interior?.dispose();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry && !Object.values(T).includes(m.geometry as never)) m.geometry.dispose(); });
    disposeTextures();
    this.renderer?.dispose(); this.renderer?.forceContextLoss?.();
    this.renderer?.domElement.remove();
  }
}
