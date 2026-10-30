// Справочники: предметы, транспорт, магазины, одежда, тюнинг
export interface ItemDef { id: string; name: string; icon: string; price: number; food?: number; drink?: number; energy?: number; health?: number; smoke?: boolean; weapon?: string; ammo?: number; ammoType?: string; seed?: string; drug?: boolean; sell?: number; fridge?: boolean }
export const ITEMS: Record<string, ItemDef> = {
  water: { id: 'water', name: 'Вода 0.5л', icon: '💧', price: 2, drink: 35, fridge: true },
  cola: { id: 'cola', name: 'Кола', icon: '🥤', price: 3, drink: 30, energy: 5, fridge: true },
  juice: { id: 'juice', name: 'Сок', icon: '🧃', price: 4, drink: 35, food: 5, fridge: true },
  milk: { id: 'milk', name: 'Молоко', icon: '🥛', price: 3, drink: 20, food: 12, fridge: true },
  coffee: { id: 'coffee', name: 'Кофе', icon: '☕', price: 4, drink: 15, energy: 30 },
  tea: { id: 'tea', name: 'Чай', icon: '🍵', price: 2, drink: 25, energy: 8 },
  energy: { id: 'energy', name: 'Энергетик', icon: '⚡', price: 5, drink: 15, energy: 45, health: -2, fridge: true },
  bread: { id: 'bread', name: 'Хлеб', icon: '🍞', price: 2, food: 20, fridge: true },
  sandwich: { id: 'sandwich', name: 'Сэндвич', icon: '🥪', price: 5, food: 35, fridge: true },
  burger: { id: 'burger', name: 'Бургер', icon: '🍔', price: 8, food: 55, fridge: true },
  pizza: { id: 'pizza', name: 'Пицца', icon: '🍕', price: 10, food: 60, fridge: true },
  shawarma: { id: 'shawarma', name: 'Шаурма', icon: '🌯', price: 6, food: 50, fridge: true },
  soup: { id: 'soup', name: 'Суп', icon: '🍲', price: 6, food: 40, drink: 15 },
  sausage: { id: 'sausage', name: 'Колбаса', icon: '🌭', price: 6, food: 30, fridge: true },
  apple: { id: 'apple', name: 'Яблоко', icon: '🍎', price: 1, food: 10, drink: 5, fridge: true },
  banana: { id: 'banana', name: 'Банан', icon: '🍌', price: 1, food: 12, fridge: true },
  chips: { id: 'chips', name: 'Чипсы', icon: '🥔', price: 3, food: 15, drink: -5 },
  chocolate: { id: 'chocolate', name: 'Шоколад', icon: '🍫', price: 3, food: 15, energy: 10, fridge: true },
  icecream: { id: 'icecream', name: 'Мороженое', icon: '🍦', price: 3, food: 12, drink: 8, fridge: true },
  croissant: { id: 'croissant', name: 'Круассан', icon: '🥐', price: 3, food: 22 },
  cigarettes: { id: 'cigarettes', name: 'Сигареты', icon: '🚬', price: 7, smoke: true, health: -3, energy: 5 },
  medkit: { id: 'medkit', name: 'Аптечка', icon: '🩹', price: 60, health: 50 },
  pills: { id: 'pills', name: 'Обезболивающее', icon: '💊', price: 15, health: 20 },
  vitamins: { id: 'vitamins', name: 'Витамины', icon: '🧪', price: 12, health: 8, energy: 15 },
  pistol: { id: 'pistol', name: 'Пистолет «Оса-9»', icon: '🔫', price: 1500, weapon: 'pistol' },
  revolver: { id: 'revolver', name: 'Револьвер «Шериф»', icon: '🔫', price: 2600, weapon: 'revolver' },
  smg: { id: 'smg', name: 'Пистолет-пулемёт «Шмель»', icon: '🔫', price: 5200, weapon: 'smg' },
  shotgun: { id: 'shotgun', name: 'Дробовик «Медведь»', icon: '🔫', price: 4800, weapon: 'shotgun' },
  rifle: { id: 'rifle', name: 'Автомат «Ураган»', icon: '🔫', price: 9500, weapon: 'rifle' },
  sniper: { id: 'sniper', name: 'Винтовка «Ястреб»', icon: '🔭', price: 14000, weapon: 'sniper' },
  // семена и урожай
  seed_tomato: { id: 'seed_tomato', name: 'Семена томатов', icon: '🌱', price: 12, seed: 'tomato' },
  seed_potato: { id: 'seed_potato', name: 'Семенной картофель', icon: '🌱', price: 10, seed: 'potato' },
  seed_cucumber: { id: 'seed_cucumber', name: 'Семена огурцов', icon: '🌱', price: 12, seed: 'cucumber' },
  seed_strawberry: { id: 'seed_strawberry', name: 'Рассада клубники', icon: '🌱', price: 18, seed: 'strawberry' },
  seed_sunflower: { id: 'seed_sunflower', name: 'Семена подсолнуха', icon: '🌱', price: 8, seed: 'sunflower' },
  seed_durman: { id: 'seed_durman', name: 'Семена «Дурман» (нелегально)', icon: '🌿', price: 150, seed: 'durman' },
  tomato: { id: 'tomato', name: 'Томат', icon: '🍅', price: 4, food: 12, drink: 6, fridge: true, sell: 9 },
  potato: { id: 'potato', name: 'Картофель', icon: '🥔', price: 3, food: 16, fridge: true, sell: 7 },
  cucumber: { id: 'cucumber', name: 'Огурец', icon: '🥒', price: 3, food: 8, drink: 12, fridge: true, sell: 8 },
  strawberry: { id: 'strawberry', name: 'Клубника', icon: '🍓', price: 6, food: 10, energy: 6, fridge: true, sell: 14 },
  sunflower: { id: 'sunflower', name: 'Семечки', icon: '🌻', price: 3, food: 9, sell: 6 },
  durman: { id: 'durman', name: 'Дурман-трава', icon: '🍁', price: 0, drug: true, health: -14, energy: 12, sell: 110 },
  ammo: { id: 'ammo', name: 'Патроны 9 мм ×30', icon: '📦', price: 60, ammo: 30, ammoType: 'p' },
  ammo_m: { id: 'ammo_m', name: 'Патроны .357 ×18', icon: '📦', price: 70, ammo: 18, ammoType: 'm' },
  shells: { id: 'shells', name: 'Патроны 12 калибр ×16', icon: '🧨', price: 80, ammo: 16, ammoType: 's' },
  ammo_r: { id: 'ammo_r', name: 'Винтовочные ×30', icon: '📦', price: 140, ammo: 30, ammoType: 'r' },
};

export type ShopKind = 'shop24' | 'supermarket' | 'cafe' | 'pharmacy' | 'gunshop' | 'vshop' | 'gas' | 'mallfood';
export const SHOP_ITEMS: Record<ShopKind, string[]> = {
  shop24: ['water', 'cola', 'coffee', 'bread', 'sandwich', 'chips', 'chocolate', 'energy', 'cigarettes'],
  supermarket: ['seed_tomato', 'seed_cucumber', 'seed_strawberry', 'water', 'cola', 'juice', 'milk', 'bread', 'sausage', 'pizza', 'apple', 'banana', 'chocolate', 'icecream', 'chips', 'cigarettes'],
  cafe: ['coffee', 'tea', 'burger', 'pizza', 'soup', 'croissant', 'juice'],
  pharmacy: ['medkit', 'pills', 'vitamins', 'water'],
  gunshop: ['seed_durman', 'pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'sniper', 'ammo', 'ammo_m', 'shells', 'ammo_r'],
  vshop: ['seed_tomato', 'seed_potato', 'seed_cucumber', 'seed_strawberry', 'seed_sunflower', 'bread', 'milk', 'water', 'sausage', 'apple', 'cigarettes', 'tea'],
  gas: ['water', 'cola', 'coffee', 'sandwich', 'chips', 'cigarettes', 'energy'],
  mallfood: ['burger', 'pizza', 'cola', 'icecream', 'coffee'],
};

export interface WeaponDef { id: string; name: string; slot: number; dmg: number; rpm: number; mag: number; reload: number; spread: number; pellets: number; auto: boolean; range: number; ammo: string; zoom: number; recoil: number; heavy: boolean; vol: number }
export const WEAPONS: Record<string, WeaponDef> = {
  pistol: { id: 'pistol', name: 'Оса-9', slot: 2, dmg: 30, rpm: 300, mag: 12, reload: 1.3, spread: 0.016, pellets: 1, auto: false, range: 110, ammo: 'p', zoom: 18, recoil: 0.022, heavy: false, vol: 1 },
  revolver: { id: 'revolver', name: 'Шериф', slot: 3, dmg: 60, rpm: 110, mag: 6, reload: 2.1, spread: 0.012, pellets: 1, auto: false, range: 130, ammo: 'm', zoom: 22, recoil: 0.05, heavy: true, vol: 1.3 },
  smg: { id: 'smg', name: 'Шмель', slot: 4, dmg: 17, rpm: 780, mag: 30, reload: 1.8, spread: 0.03, pellets: 1, auto: true, range: 90, ammo: 'p', zoom: 16, recoil: 0.012, heavy: false, vol: 0.85 },
  shotgun: { id: 'shotgun', name: 'Медведь', slot: 5, dmg: 15, rpm: 70, mag: 6, reload: 2.6, spread: 0.075, pellets: 8, auto: false, range: 45, ammo: 's', zoom: 14, recoil: 0.07, heavy: true, vol: 1.5 },
  rifle: { id: 'rifle', name: 'Ураган', slot: 6, dmg: 26, rpm: 600, mag: 30, reload: 2.2, spread: 0.018, pellets: 1, auto: true, range: 160, ammo: 'r', zoom: 26, recoil: 0.016, heavy: false, vol: 1.15 },
  sniper: { id: 'sniper', name: 'Ястреб', slot: 7, dmg: 110, rpm: 45, mag: 5, reload: 2.8, spread: 0.002, pellets: 1, auto: false, range: 320, ammo: 'r', zoom: 46, recoil: 0.09, heavy: true, vol: 1.6 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'sniper'];
export const AMMO_NAMES: Record<string, string> = { p: '9 мм', m: '.357', s: '12 кал.', r: 'винт.' };
export interface CropDef { id: string; name: string; product: string; time: number; yield: [number, number]; leaf: string; fruit: string; basement: boolean; yard: boolean }
export const CROPS: Record<string, CropDef> = {
  tomato: { id: 'tomato', name: 'Томаты', product: 'tomato', time: 180, yield: [3, 5], leaf: '#2f7d32', fruit: '#e53935', basement: false, yard: true },
  potato: { id: 'potato', name: 'Картофель', product: 'potato', time: 150, yield: [4, 7], leaf: '#558b2f', fruit: '#c8a165', basement: false, yard: true },
  cucumber: { id: 'cucumber', name: 'Огурцы', product: 'cucumber', time: 160, yield: [3, 6], leaf: '#388e3c', fruit: '#2e7d32', basement: false, yard: true },
  strawberry: { id: 'strawberry', name: 'Клубника', product: 'strawberry', time: 200, yield: [4, 6], leaf: '#43a047', fruit: '#d81b60', basement: false, yard: true },
  sunflower: { id: 'sunflower', name: 'Подсолнух', product: 'sunflower', time: 140, yield: [3, 5], leaf: '#689f38', fruit: '#fbc02d', basement: false, yard: true },
  durman: { id: 'durman', name: 'Дурман-трава', product: 'durman', time: 300, yield: [2, 4], leaf: '#4caf50', fruit: '#7cb342', basement: true, yard: false },
};
export const EMOTES: { id: string; name: string; icon: string; dance?: boolean }[] = [
  { id: 'dance1', name: 'Диско', icon: '🕺', dance: true }, { id: 'dance2', name: 'Робот', icon: '🤖', dance: true }, { id: 'dance3', name: 'Хип-хоп', icon: '🎧', dance: true },
  { id: 'dance4', name: 'Волна', icon: '🌊', dance: true }, { id: 'dance5', name: 'Кружение', icon: '💫', dance: true },
  { id: 'wave', name: 'Помахать', icon: '👋' }, { id: 'clap', name: 'Аплодисменты', icon: '👏' }, { id: 'sit', name: 'Сесть', icon: '🧘' }, { id: 'liedown', name: 'Прилечь', icon: '😴' }, { id: 'pushup', name: 'Отжимания', icon: '💪' },
];
export const SCOOTER_RATE = 9; // в минуту
export type BodyKind = 'sedan' | 'hatch' | 'suv' | 'pickup' | 'van' | 'truck' | 'semi' | 'bus' | 'sport' | 'moto' | 'quad' | 'heli' | 'combine' | 'scooter';
export interface VSpec {
  id: string; name: string; body: BodyKind; len: number; wid: number; hei: number;
  maxSpeed: number; accel: number; price: number; autopilot?: boolean; old?: boolean; ev?: boolean;
  service?: 'police' | 'taxi' | 'ambulance'; colors: string[]; forSale?: 'dealer' | 'market' | 'none' | 'scooter'; year?: number;
  variant?: 'box' | 'nose' | 'tank' | 'flat' | 'reefer'; sc?: { r: number; deck: number; seat?: boolean; dual?: boolean; susp?: boolean };
}
export const VEHICLES: Record<string, VSpec> = {
  volga: { id: 'volga', name: 'Бриз-24', body: 'sedan', len: 4.8, wid: 1.8, hei: 1.45, maxSpeed: 40, accel: 4.5, price: 5200, old: true, colors: ['#e8e1c8', '#2b3a55', '#5a2a27', '#1d1d1d'], forSale: 'market', year: 1986 },
  lada: { id: 'lada', name: 'Норд-07', body: 'sedan', len: 4.2, wid: 1.65, hei: 1.42, maxSpeed: 38, accel: 4.8, price: 3600, old: true, colors: ['#b8312f', '#e6e6e6', '#2f6b3a', '#c9a227'], forSale: 'market', year: 1995 },
  pchelka: { id: 'pchelka', name: 'Искра', body: 'hatch', len: 3.7, wid: 1.65, hei: 1.45, maxSpeed: 42, accel: 5.5, price: 7500, colors: ['#f2c12e', '#3c8dde', '#ef6c57', '#ffffff'], forSale: 'dealer' },
  kolibri: { id: 'kolibri', name: 'Вираж GT', body: 'hatch', len: 4.1, wid: 1.75, hei: 1.45, maxSpeed: 52, accel: 7, price: 16000, colors: ['#ffffff', '#c41e3a', '#1e3a8a', '#111111'], forSale: 'dealer' },
  taiga: { id: 'taiga', name: 'Медведь 4x4', body: 'suv', len: 4.6, wid: 1.9, hei: 1.85, maxSpeed: 45, accel: 5.5, price: 29000, colors: ['#3d4a3a', '#1c1c1c', '#c0c0c0', '#7a2e1d'], forSale: 'dealer' },
  bizon: { id: 'bizon', name: 'Буйвол пикап', body: 'pickup', len: 5.2, wid: 1.95, hei: 1.8, maxSpeed: 46, accel: 5.5, price: 23000, colors: ['#8b1e1e', '#e0e0e0', '#22313f', '#556b2f'], forSale: 'dealer' },
  gazelka: { id: 'gazelka', name: 'Курьер', body: 'van', len: 5.4, wid: 2.0, hei: 2.3, maxSpeed: 36, accel: 3.8, price: 18000, colors: ['#f5f5f5', '#2563eb', '#facc15'], forSale: 'dealer' },
  titan: { id: 'titan', name: 'Атлант грузовик', body: 'truck', len: 7.5, wid: 2.4, hei: 3.0, maxSpeed: 30, accel: 2.8, price: 45000, colors: ['#1f4e79', '#b45309', '#e5e7eb'], forSale: 'dealer' },
  semi: { id: 'semi', name: 'Тягач «Магистраль»', body: 'semi', len: 12, wid: 2.5, hei: 3.6, maxSpeed: 28, accel: 2.2, price: 90000, colors: ['#9f1239', '#1e40af', '#f8fafc'], forSale: 'none' },
  bus: { id: 'bus', name: 'Городской автобус', body: 'bus', len: 11, wid: 2.5, hei: 3.1, maxSpeed: 22, accel: 2.2, price: 80000, colors: ['#f59e0b', '#16a34a'], forSale: 'none' },
  police: { id: 'police', name: 'Полиция', body: 'sedan', len: 4.8, wid: 1.85, hei: 1.5, maxSpeed: 55, accel: 8, price: 0, service: 'police', colors: ['#f8fafc'], forSale: 'none' },
  taxi: { id: 'taxi', name: 'Такси', body: 'sedan', len: 4.7, wid: 1.8, hei: 1.48, maxSpeed: 42, accel: 5.5, price: 18000, service: 'taxi', colors: ['#facc15'], forSale: 'dealer' },
  ambulance: { id: 'ambulance', name: 'Скорая', body: 'van', len: 5.4, wid: 2.0, hei: 2.4, maxSpeed: 42, accel: 4.5, price: 0, service: 'ambulance', colors: ['#ffffff'], forSale: 'none' },
  strizh: { id: 'strizh', name: 'Оса 250', body: 'moto', len: 2.0, wid: 0.7, hei: 1.1, maxSpeed: 40, accel: 7, price: 5500, colors: ['#dc2626', '#111827', '#2563eb'], forSale: 'dealer' },
  molnia: { id: 'molnia', name: 'Гром 1000R', body: 'moto', len: 2.1, wid: 0.75, hei: 1.15, maxSpeed: 70, accel: 12, price: 19000, colors: ['#16a34a', '#f97316', '#111827'], forSale: 'dealer' },
  quadro: { id: 'quadro', name: 'Барс ATV', body: 'quad', len: 2.0, wid: 1.2, hei: 1.1, maxSpeed: 30, accel: 6, price: 7200, colors: ['#ea580c', '#65a30d', '#1d4ed8'], forSale: 'dealer' },
  ferrato: { id: 'ferrato', name: 'Скорпион V12', body: 'sport', len: 4.6, wid: 2.0, hei: 1.2, maxSpeed: 92, accel: 15, price: 250000, colors: ['#d50000', '#ffd600', '#111111', '#ffffff'], forSale: 'dealer' },
  volta: { id: 'volta', name: 'Электра S', body: 'sedan', len: 4.95, wid: 1.95, hei: 1.44, maxSpeed: 70, accel: 12, price: 85000, autopilot: true, ev: true, colors: ['#f1f5f9', '#0f172a', '#b91c1c', '#475569'], forSale: 'dealer' },
  drakon: { id: 'drakon', name: 'Лунь EV7', body: 'sedan', len: 4.8, wid: 1.88, hei: 1.46, maxSpeed: 60, accel: 9.5, price: 42000, autopilot: true, ev: true, colors: ['#0ea5e9', '#e2e8f0', '#334155', '#65a30d'], forSale: 'dealer' },
  fenghuang: { id: 'fenghuang', name: 'Тайфун X9', body: 'suv', len: 4.9, wid: 1.95, hei: 1.7, maxSpeed: 58, accel: 9, price: 56000, autopilot: true, ev: true, colors: ['#a3a3a3', '#1e293b', '#ffffff', '#7c3aed'], forSale: 'dealer' },
  strekoza: { id: 'strekoza', name: 'Вертолёт «Сокол»', body: 'heli', len: 9, wid: 2.4, hei: 3, maxSpeed: 55, accel: 6, price: 100000, colors: ['#1e3a8a', '#b91c1c', '#f8fafc'], forSale: 'dealer' },
  scooter: { id: 'scooter', name: 'Электросамокат «Вжух»', body: 'scooter', len: 1.15, wid: 0.5, hei: 1.15, maxSpeed: 7.5, accel: 3.2, price: 0, ev: true, colors: ['#22c55e'], forSale: 'none' },
  combine: { id: 'combine', name: 'Комбайн «Колос-М»', body: 'combine', len: 7.5, wid: 3.4, hei: 3.8, maxSpeed: 9, accel: 2, price: 0, colors: ['#15803d'], forSale: 'none' },
};
// ---------- расширенный модельный ряд ----------
const PALETTES = [['#e5e7eb', '#111827', '#991b1b', '#1e3a8a'], ['#f8fafc', '#334155', '#0f766e', '#ca8a04'], ['#7f1d1d', '#d4d4d8', '#1f2937', '#065f46'], ['#fbbf24', '#2563eb', '#dc2626', '#f5f5f4'], ['#a3a3a3', '#0c0a09', '#7c3aed', '#be123c']];
type Row = [string, string, BodyKind, number, number, number, number, number, number, string?];
// id, название, кузов, длина, ширина, высота, макс.км/ч, разгон, цена, флаги (o — ретро, e — электро+автопилот)
const MORE: Row[] = [
  ['briz21', 'Бриз-21 «Классик»', 'sedan', 4.5, 1.7, 1.42, 135, 4.2, 4200, 'o'], ['nord05', 'Норд-05', 'sedan', 4.1, 1.62, 1.4, 130, 4.4, 3100, 'o'], ['sokol3110', 'Сокол-3110', 'sedan', 4.9, 1.8, 1.47, 150, 4.6, 6800, 'o'],
  ['raketa01', 'Ракета-2101', 'sedan', 4.05, 1.61, 1.38, 125, 4.0, 2900, 'o'], ['vega', 'Вега Седан', 'sedan', 4.6, 1.78, 1.45, 175, 6.0, 14500], ['altair', 'Альтаир Комфорт', 'sedan', 4.75, 1.82, 1.46, 190, 6.5, 21000],
  ['orion', 'Орион Бизнес', 'sedan', 4.95, 1.86, 1.47, 210, 7.2, 38000], ['sirius', 'Сириус GT', 'sedan', 4.7, 1.84, 1.4, 240, 9.0, 52000], ['kosmos', 'Космос Премьер', 'sedan', 5.05, 1.9, 1.48, 230, 8.2, 64000],
  ['avrora', 'Аврора Люкс', 'sedan', 5.15, 1.92, 1.49, 245, 8.8, 89000], ['megapolis', 'Мегаполис S', 'sedan', 4.85, 1.85, 1.44, 220, 7.8, 46000], ['grandtour', 'Гранд Турер', 'sedan', 5.0, 1.9, 1.42, 255, 9.5, 97000],
  ['baron', 'Барон V8', 'sedan', 5.1, 1.93, 1.46, 260, 10, 118000], ['president', 'Президент Лимузин', 'sedan', 6.2, 1.98, 1.5, 210, 7, 175000],
  ['iskrasport', 'Искра Спорт', 'hatch', 3.9, 1.7, 1.42, 195, 7.5, 13000], ['kroha', 'Кроха', 'hatch', 3.3, 1.55, 1.48, 140, 4.6, 5200], ['pulya', 'Пуля', 'hatch', 3.8, 1.72, 1.4, 215, 8.5, 19000],
  ['ezhik', 'Ёжик', 'hatch', 3.5, 1.62, 1.5, 150, 5.0, 6900], ['sinitsa', 'Синица', 'hatch', 3.7, 1.66, 1.46, 165, 5.5, 8800], ['kometamini', 'Комета Мини', 'hatch', 3.6, 1.68, 1.44, 180, 6.4, 11500],
  ['gorod_e', 'Город-Е', 'hatch', 3.9, 1.74, 1.5, 160, 7.5, 24000, 'e'], ['veterok', 'Ветерок', 'hatch', 3.75, 1.67, 1.45, 170, 5.8, 9900], ['shustrik', 'Шустрик', 'hatch', 3.45, 1.6, 1.47, 155, 5.2, 7400],
  ['virazhrs', 'Вираж RS', 'hatch', 4.15, 1.78, 1.38, 245, 10, 33000],
  ['medvedclassic', 'Медведь Классик', 'suv', 4.2, 1.75, 1.82, 130, 3.8, 7800, 'o'], ['gorny', 'Горный', 'suv', 4.5, 1.86, 1.8, 165, 5.0, 22000], ['tundra', 'Тундра XL', 'suv', 5.2, 2.0, 1.92, 185, 5.8, 58000],
  ['vezdehod', 'Вездеход-469', 'suv', 4.0, 1.78, 2.0, 115, 3.5, 6500, 'o'], ['kordon', 'Кордон', 'suv', 4.7, 1.9, 1.78, 190, 6.2, 34000], ['arktika', 'Арктика', 'suv', 4.9, 1.96, 1.85, 200, 6.6, 47000],
  ['buran', 'Буран', 'suv', 5.0, 2.0, 1.9, 210, 7.0, 72000], ['sever7', 'Север-7', 'suv', 4.8, 1.92, 1.8, 205, 6.9, 61000], ['granit', 'Гранит', 'suv', 5.1, 2.02, 1.95, 220, 7.4, 99000],
  ['ataman', 'Атаман', 'suv', 5.3, 2.05, 1.98, 230, 7.8, 135000], ['tayfun7', 'Тайфун X7', 'suv', 4.85, 1.95, 1.72, 210, 9.5, 69000, 'e'], ['feniks', 'Феникс EV', 'suv', 4.95, 1.98, 1.7, 225, 10.5, 92000, 'e'],
  ['buyvolhd', 'Буйвол HD', 'pickup', 5.6, 2.02, 1.9, 175, 5.6, 36000], ['fermer', 'Фермер', 'pickup', 5.0, 1.88, 1.8, 150, 4.6, 15000], ['kovboy', 'Ковбой', 'pickup', 5.4, 2.0, 1.86, 185, 6.2, 41000],
  ['lesnik', 'Лесник', 'pickup', 5.1, 1.92, 1.88, 160, 5.0, 19500], ['tyagun', 'Тягун', 'pickup', 5.5, 2.0, 1.92, 170, 5.4, 28000], ['kazak', 'Казак', 'pickup', 5.2, 1.94, 1.84, 180, 5.8, 31000],
  ['ranger', 'Рейнджер', 'pickup', 5.35, 1.98, 1.88, 190, 6.4, 45000],
  ['kuriermax', 'Курьер Макс', 'van', 5.9, 2.05, 2.5, 140, 3.6, 24000], ['semya', 'Минивэн «Семья»', 'van', 5.0, 1.92, 1.9, 175, 5.0, 29000], ['kemper', 'Кемпер «Дорога»', 'van', 6.0, 2.1, 2.7, 135, 3.4, 52000],
  ['hlebovoz', 'Хлебовоз', 'van', 4.9, 1.9, 2.2, 110, 3.0, 8500, 'o'], ['pochta', 'Почта', 'van', 5.3, 1.98, 2.3, 135, 3.6, 19000], ['shuttle', 'Шаттл', 'van', 5.6, 2.0, 2.35, 150, 3.8, 33000],
  ['scorpiongt', 'Скорпион GT', 'sport', 4.55, 1.98, 1.18, 310, 14, 210000], ['gepard', 'Гепард', 'sport', 4.4, 1.95, 1.2, 290, 13, 165000], ['pantera', 'Пантера RS', 'sport', 4.5, 1.96, 1.16, 300, 13.5, 185000],
  ['molot', 'Молот V10', 'sport', 4.6, 2.0, 1.17, 325, 15, 260000], ['vihr', 'Вихрь', 'sport', 4.3, 1.9, 1.22, 270, 12, 120000], ['strela', 'Стрела Купе', 'sport', 4.45, 1.88, 1.25, 255, 11, 88000],
  ['kometas', 'Комета S', 'sport', 4.35, 1.9, 1.2, 280, 12.5, 140000], ['fantom', 'Фантом', 'sport', 4.7, 2.02, 1.15, 335, 15.5, 320000], ['barrakuda', 'Барракуда', 'sport', 4.5, 1.94, 1.21, 285, 12.8, 150000],
  ['elektrarod', 'Электра Родстер', 'sport', 4.2, 1.9, 1.15, 300, 16, 230000, 'e'], ['tornado', 'Торнадо', 'sport', 4.55, 1.97, 1.18, 315, 14.5, 245000],
];
MORE.forEach((r, i) => {
  const [id, name, body, len, wid, hei, kmh, accel, price, fl] = r;
  VEHICLES[id] = { id, name, body, len, wid, hei, maxSpeed: kmh / 3.6 * 0.72, accel, price, colors: PALETTES[i % PALETTES.length], forSale: fl === 'o' ? 'market' : 'dealer', old: fl === 'o', ev: fl === 'e', autopilot: fl === 'e' };
});
// ---------- фуры дальнобойщиков ----------
const SEMIS: [string, string, BodyKind, number, string, string[], number][] = [
  ['dalnoboy', 'Тягач «Дальнобой» (капотный)', 'semi', 14, 'nose', ['#b91c1c', '#1e3a8a', '#f8fafc'], 135000], ['severyanin', 'Бензовоз «Северянин»', 'semi', 12.5, 'tank', ['#e5e7eb', '#f59e0b', '#15803d'], 118000],
  ['titanxl', 'Платформа «Титан-XL»', 'semi', 13, 'flat', ['#1f2937', '#ca8a04', '#2563eb'], 112000], ['refr', 'Рефрижератор «Холод»', 'semi', 12.5, 'reefer', ['#f8fafc', '#0ea5e9'], 125000],
  ['magistral2', 'Тягач «Магистраль-2»', 'semi', 12, 'box', ['#7c3aed', '#16a34a', '#0f172a'], 98000],
];
for (const [id, name, body, len, variant, colors, price] of SEMIS) VEHICLES[id] = { id, name, body, len, wid: 2.5, hei: variant === 'flat' ? 3.2 : 3.6, maxSpeed: 27, accel: 2.3, price, colors, forSale: 'dealer', variant: variant as VSpec['variant'] };
VEHICLES.semi.variant = 'box'; VEHICLES.semi.forSale = 'dealer';
// ---------- электросамокаты (20 моделей) ----------
type SRow = [string, string, number, number, number, number, number, boolean?, boolean?, boolean?, string[]?];
// id, название, км/ч, разгон, цена, радиус колеса, длина деки, сиденье, двойная стойка, подвеска, цвета
const SCOOTERS: SRow[] = [
  ['s_m365', 'Сяо M365', 25, 2.6, 450, 0.11, 1.08], ['s_m365pro', 'Сяо M365 Pro', 25, 3.0, 620, 0.11, 1.1], ['s_pro2', 'Сяо Pro 2', 25, 3.1, 700, 0.11, 1.12], ['s_1s', 'Сяо 1S', 25, 2.8, 520, 0.11, 1.08],
  ['s_ess', 'Сяо Essential', 20, 2.4, 380, 0.1, 1.05], ['s_ultra4', 'Сяо Ultra 4', 25, 3.4, 980, 0.13, 1.2, false, false, true], ['nb_max', 'Найн Max G30', 30, 3.2, 850, 0.13, 1.18],
  ['k_s1', 'Кугу S1', 30, 3.2, 480, 0.11, 1.1, false, false, true], ['k_s1pro', 'Кугу S1 Pro', 30, 3.4, 560, 0.11, 1.12, false, false, true], ['k_s3', 'Кугу S3', 35, 3.6, 640, 0.11, 1.12, false, false, true],
  ['k_s3pro', 'Кугу S3 Pro', 35, 3.8, 720, 0.12, 1.14, false, false, true], ['k_m4', 'Кугу M4 (сиденье)', 45, 3.8, 1100, 0.14, 1.25, true, false, true], ['k_m4pro', 'Кугу M4 Pro (сиденье)', 50, 4.2, 1350, 0.14, 1.28, true, false, true],
  ['k_c1', 'Кугу C1', 40, 3.6, 900, 0.13, 1.2, true, false, true], ['k_g1', 'Кугу G1', 50, 4.4, 1450, 0.14, 1.3, false, false, true], ['k_g2pro', 'Кугу G2 Pro', 50, 4.8, 1600, 0.14, 1.32, false, false, true],
  ['k_gmax', 'Кугу G-Max', 55, 5.2, 1900, 0.15, 1.34, false, false, true], ['k_gbooster', 'Кугу G-Booster', 55, 6.0, 2200, 0.15, 1.36, false, true, true],
  ['x1', 'X1 Dual', 60, 6.8, 2900, 0.15, 1.38, false, true, true, ['#111827', '#ea580c']], ['maxspeed', 'Max Speed 80', 80, 8.5, 4500, 0.16, 1.42, false, true, true, ['#dc2626', '#111827']],
];
for (const [id, name, kmh, accel, price, r, deck, seat, dual, susp, colors] of SCOOTERS) VEHICLES[id] = { id, name, body: 'scooter', len: deck + 0.25, wid: 0.55, hei: 1.15, maxSpeed: kmh / 3.6, accel, price, ev: true, colors: colors ?? ['#1f2937', '#e5e7eb', '#16a34a', '#2563eb'], forSale: 'scooter', sc: { r, deck, seat, dual, susp } };
export const TRAFFIC_TYPES = ['volga', 'lada', 'pchelka', 'kolibri', 'taiga', 'bizon', 'gazelka', 'volta', 'drakon', 'fenghuang', 'taxi', 'titan', 'bus', 'strizh', 'police', 'semi', ...MORE.map((r) => r[0]).filter((id) => VEHICLES[id].price < 150000), 'dalnoboy', 'severyanin', 'titanxl', 'refr'];
export const TRAFFIC_WEIGHTS = [5, 5, 5, 4, 3, 3, 2, 2, 2, 2, 3, 2, 2, 2, 0.6, 1, ...MORE.filter((r) => VEHICLES[r[0]].price < 150000).map(() => 0.9), 0.5, 0.5, 0.5, 0.5];

export interface Tuning {
  paint?: string; tint: number; turbo: number; engine: number; rims: number; spoiler: boolean;
  clearance: number; chrome: boolean; neon: string | null; lights: string;
}
export const defaultTuning = (): Tuning => ({ tint: 0, turbo: 0, engine: 0, rims: 0, spoiler: false, clearance: 0, chrome: false, neon: null, lights: '#fff8e0' });
export const TUNE_PRICES = { paint: 800, tint: 300, turbo: 4500, engine: 3000, rims: 1200, spoiler: 900, clearance: 500, chrome: 1500, neon: 1100, lights: 400 };
export const PAINT_COLORS = ['#d50000', '#ff6d00', '#ffd600', '#00c853', '#00b8d4', '#2962ff', '#6200ea', '#c51162', '#ffffff', '#9e9e9e', '#212121', '#795548', '#1b5e20', '#0d47a1'];
export const NEON_COLORS = ['#00e5ff', '#ff00e5', '#76ff03', '#ff1744', '#ffea00', '#ffffff'];
export const LIGHT_COLORS = ['#fff8e0', '#cfe8ff', '#7fb2ff', '#ffd27f', '#c084fc'];

// Внешность
export interface Look {
  gender: 'm' | 'f'; skin: string; hair: string; hairColor: string; top: string; topColor: string; bottom: string; bottomColor: string; shoes: string;
  eyes?: string; height?: number; build?: number; beard?: string; lips?: string; acc?: string;
}
export const EYE_COLORS = ['#3b6ea5', '#5b8c3a', '#6b4423', '#2b2b2b', '#7a8ea0', '#9a6b2f'];
export const LIP_COLORS = ['#c2185b', '#e57373', '#b5651d', '#8e244d', '#d81b60', '#c98a7a'];
export const BEARDS: { id: string; name: string }[] = [{ id: 'none', name: 'Нет' }, { id: 'stubble', name: 'Щетина' }, { id: 'goatee', name: 'Эспаньолка' }, { id: 'full', name: 'Борода' }, { id: 'mustache', name: 'Усы' }];
export const SKINS = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
export const HAIR_STYLES: { id: string; name: string; price: number }[] = [
  { id: 'short', name: 'Короткая', price: 25 }, { id: 'buzz', name: 'Под машинку', price: 15 }, { id: 'side', name: 'Пробор', price: 35 },
  { id: 'mohawk', name: 'Ирокез', price: 60 }, { id: 'long', name: 'Длинные', price: 45 }, { id: 'bob', name: 'Каре', price: 45 },
  { id: 'ponytail', name: 'Хвост', price: 40 }, { id: 'bun', name: 'Пучок', price: 40 }, { id: 'bald', name: 'Лысый', price: 10 },
  { id: 'wavy', name: 'Локоны', price: 70 }, { id: 'pigtails', name: 'Два хвоста', price: 50 }, { id: 'pixie', name: 'Пикси', price: 45 }, { id: 'braid', name: 'Коса', price: 60 },
  { id: 'verylong', name: 'Очень длинные', price: 90 }, { id: 'rocker', name: 'Рокер (до плеч)', price: 70 }, { id: 'manbun', name: 'Мэн-бан', price: 55 }, { id: 'mullet', name: 'Маллет', price: 50 }, { id: 'dreads', name: 'Дреды', price: 110 },
];
/** лимитированные предметы: доступны только в своё «окно» (меняется каждые 3 часа реального времени), ограниченный тираж */
export interface LimitedDef { id: string; name: string; icon: string; kind: 'hair' | 'top' | 'bottom' | 'acc'; value: string; price: number; stock: number }
export const LIMITED: LimitedDef[] = [
  { id: 'lh_rainbow', name: 'Радужные волосы', icon: '🌈', kind: 'hair', value: '@rainbow', price: 25000, stock: 500 },
  { id: 'lh_gold', name: 'Золотые волосы', icon: '✨', kind: 'hair', value: '@gold', price: 40000, stock: 300 },
  { id: 'lh_neon', name: 'Неоновые волосы', icon: '💡', kind: 'hair', value: '@neon', price: 30000, stock: 400 },
  { id: 'lh_fire', name: 'Огненные волосы', icon: '🔥', kind: 'hair', value: '@fire', price: 35000, stock: 350 },
  { id: 'lt_galaxy', name: 'Худи «Галактика»', icon: '🌌', kind: 'top', value: '@galaxy', price: 45000, stock: 250 },
  { id: 'lt_gold', name: 'Золотой костюм', icon: '🥇', kind: 'top', value: '@gold', price: 90000, stock: 120 },
  { id: 'lt_rainbow', name: 'Радужная футболка', icon: '🌈', kind: 'top', value: '@rainbow', price: 30000, stock: 450 },
  { id: 'lb_chrome', name: 'Хромированные брюки', icon: '🪩', kind: 'bottom', value: '@chrome', price: 50000, stock: 200 },
  { id: 'la_crown', name: 'Корона', icon: '👑', kind: 'acc', value: 'crown', price: 150000, stock: 50 },
  { id: 'la_halo', name: 'Нимб', icon: '😇', kind: 'acc', value: 'halo', price: 120000, stock: 80 },
  { id: 'la_cap', name: 'Кепка LosSt', icon: '🧢', kind: 'acc', value: 'cap', price: 8000, stock: 1500 },
  { id: 'la_phones', name: 'Неон-наушники', icon: '🎧', kind: 'acc', value: 'phones', price: 20000, stock: 600 },
];
export function limitedWindow() { return Math.floor(Date.now() / (3 * 3600 * 1000)); }
export function limitedAvailable(i: number) { return (limitedWindow() + i) % 3 !== 0; }
export function limitedLeft(d: LimitedDef, i: number) { const t = (Date.now() / (3 * 3600 * 1000)) % 1; return Math.max(1, Math.round(d.stock * (1 - t * 0.85) - ((i * 37) % 23))); }
export const DRESSES = new Set(['dress', 'minidress', 'sundress', 'cocktail', 'evening']);
export const HAIR_COLORS = ['#1a1a1a', '#4a2f1b', '#8b5a2b', '#d9b26a', '#b5462b', '#9e9e9e', '#3b82f6', '#ec4899'];
export const TOPS: { id: string; name: string; price: number }[] = [
  { id: 'tshirt', name: 'Футболка', price: 30 }, { id: 'hoodie', name: 'Худи', price: 70 }, { id: 'shirt', name: 'Рубашка', price: 60 },
  { id: 'suit', name: 'Пиджак', price: 300 }, { id: 'tank', name: 'Майка', price: 20 }, { id: 'dress', name: 'Платье', price: 150 },
  { id: 'minidress', name: 'Мини-платье', price: 180 }, { id: 'sundress', name: 'Сарафан', price: 160 }, { id: 'cocktail', name: 'Коктейльное платье', price: 320 }, { id: 'evening', name: 'Вечернее платье в пол', price: 650 },
];
export const BOTTOMS: { id: string; name: string; price: number }[] = [
  { id: 'jeans', name: 'Джинсы', price: 60 }, { id: 'trousers', name: 'Брюки', price: 90 }, { id: 'shorts', name: 'Шорты', price: 30 }, { id: 'skirt', name: 'Юбка', price: 50 },
];
export const CLOTH_COLORS = ['#ffffff', '#111827', '#1d4ed8', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#db2777', '#6b7280', '#92400e', '#0e7490', '#f5f5dc'];
export const defaultLook = (g: 'm' | 'f'): Look => g === 'm'
  ? { gender: 'm', skin: SKINS[0], hair: 'short', hairColor: HAIR_COLORS[1], top: 'tshirt', topColor: '#1d4ed8', bottom: 'jeans', bottomColor: '#1e3a5f', shoes: '#222222' }
  : { gender: 'f', skin: SKINS[0], hair: 'long', hairColor: HAIR_COLORS[3], top: 'tshirt', topColor: '#db2777', bottom: 'jeans', bottomColor: '#1e3a5f', shoes: '#ffffff' };

export const KIOSK_TYPES = [
  { name: 'Шаурма «Вертел»', items: ['shawarma', 'cola', 'water'], price: 18000, income: 140, color: '#f97316' },
  { name: 'Кофе с собой', items: ['coffee', 'croissant', 'tea'], price: 12000, income: 95, color: '#78350f' },
  { name: 'Мороженое', items: ['icecream', 'water', 'juice'], price: 8000, income: 60, color: '#38bdf8' },
  { name: 'Пресса и табак', items: ['cigarettes', 'chocolate', 'energy'], price: 15000, income: 115, color: '#4b5563' },
  { name: 'Фрукты', items: ['apple', 'banana', 'juice'], price: 10000, income: 80, color: '#16a34a' },
  { name: 'Хот-доги', items: ['sausage', 'cola', 'chips'], price: 22000, income: 175, color: '#dc2626' },
];
export const KIOSK_PERIOD = 60; // секунд реального времени между начислениями
export const KIOSK_MAX_PERIODS = 120;

export const VILLAGE_NAMES = ['Сосновка', 'Берёзово', 'Лесной Край', 'Тихая Гавань', 'Дубрава'];
export const SELLER_NAMES = ['Гиви', 'Пётр Палыч', 'Арсен', 'Толик', 'Марина', 'Ринат', 'Семёныч', 'Оксана'];
