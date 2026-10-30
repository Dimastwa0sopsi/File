// 50 команд чата: имущество, транспорт, бизнес, деньги и навигация.
// Каждая команда делает что-то настоящее — без «заглушек ради галочки».
import type { Game } from './game';
import { KIOSK_TYPES, VEHICLES, ITEMS, SHOP_ITEMS } from './data';
import { carValue, repairCost } from './state';

export type CmdCat = 'prop' | 'car' | 'biz' | 'money' | 'world' | 'admin';
export interface Cmd { name: string; aliases?: string[]; args?: string; cat: CmdCat; desc: string; run: (g: Game, arg: string) => void }
export const CAT_NAMES: Record<CmdCat, string> = { prop: '🏠 Недвижимость', car: '🚘 Транспорт', biz: '🏪 Бизнес', money: '💵 Деньги и розыск', world: '🧭 Мир и сервис', admin: '👑 Админ' };

const $ = (n: number) => '$' + Math.round(n).toLocaleString('ru');
const say = (g: Game, t: string) => g.sysMsg(t);
const near = (g: Game) => g.playerWorldPos();
const num = (arg: string, d = 1) => { const n = parseInt(arg, 10); return Number.isFinite(n) && n > 0 ? n : d; };

/** ближайшая к игроку своя машина (или мировая сущность по uid) */
function myCar(g: Game, arg: string) {
  const cars = g.getState().vehicles;
  if (!cars.length) { say(g, 'У вас нет транспорта'); return null; }
  const n = parseInt(arg, 10);
  if (n >= 1 && n <= cars.length) return cars[n - 1];
  const p = near(g);
  const withDist = cars.map((c) => {
    const v = g.vehicles.find((x) => x.owned?.uid === c.uid);
    return { c, d: v ? Math.hypot(v.x - p.x, v.z - p.z) : 1e9 };
  }).sort((a, b) => a.d - b.d);
  if (withDist[0].d > 60 && cars.length > 1) {
    say(g, `Укажите номер: ${cars.map((c, i) => `${i + 1}) ${VEHICLES[c.type]?.name ?? c.type}`).join(' · ')}`);
    return null;
  }
  return withDist[0].c;
}
function myHome(g: Game, arg: string) {
  const props = g.getState().properties;
  if (!props.length) { say(g, 'У вас нет недвижимости'); return null; }
  const n = parseInt(arg, 10);
  if (n >= 1 && n <= props.length) return props[n - 1];
  const cur = g.homeId();
  if (cur) return cur;
  const p = near(g);
  return props.map((id) => {
    const b = g.L.buildings[+id.split(':')[0]];
    return { id, d: b ? Math.hypot(b.door.x - p.x, b.door.z - p.z) : 1e9 };
  }).sort((a, b) => a.d - b.d)[0].id;
}
function myBiz(g: Game, arg: string) {
  const ks = g.getState().kiosks;
  if (!ks.length) { say(g, 'У вас нет бизнеса'); return null; }
  const n = parseInt(arg, 10);
  if (n >= 1 && n <= ks.length) return ks[n - 1];
  return ks[0];
}

export const COMMANDS: Cmd[] = [
  // ---------- недвижимость ----------
  { name: 'sellhouse', aliases: ['sellhome'], args: '[номер]', cat: 'prop', desc: 'продать дом/квартиру государству за 60%', run: (g, a) => g.sellHome(a) },
  { name: 'myhouses', aliases: ['homes'], cat: 'prop', desc: 'список вашей недвижимости', run: (g) => {
    const p = g.getState().properties;
    say(g, p.length ? `🏠 Недвижимость (${p.length}): ${p.map((id, i) => `${i + 1}) ${g.propertyName(id)}${g.isLocked(id) ? ' 🔒' : ''}`).join(' · ')}` : 'У вас нет недвижимости');
  } },
  { name: 'housevalue', args: '[номер]', cat: 'prop', desc: 'оценка жилья и цена продажи государству', run: (g, a) => {
    const id = myHome(g, a); if (!id) return;
    const [bi, u] = id.split(':').map(Number); const b = g.L.buildings[bi];
    const price = g.unitPrice(b, u);
    say(g, `${g.propertyName(id)}: рыночная ${$(price)} · государству ${$(Math.round(price * 0.6))}`);
  } },
  { name: 'sethome', args: '[номер]', cat: 'prop', desc: 'сделать жильё точкой появления', run: (g, a) => {
    const id = myHome(g, a); if (!id) return;
    g.getState().spawnHome = id; g.saveGame();
    say(g, `🏠 Точка появления: ${g.propertyName(id)}`);
  } },
  { name: 'lockhome', args: '[номер]', cat: 'prop', desc: 'запереть или открыть жильё', run: (g, a) => {
    const id = myHome(g, a); if (!id) return;
    g.toggleLock(id);
    say(g, `${g.isLocked(id) ? '🔒 Закрыто' : '🔓 Открыто'}: ${g.propertyName(id)}`);
  } },
  { name: 'homeinfo', cat: 'prop', desc: 'где вы живёте и сколько это стоит', run: (g) => {
    const p = g.getState().properties;
    if (!p.length) { say(g, 'Жилья нет. Дома продаются в деревнях и в Приморске, квартиры — в городе'); return; }
    const total = p.reduce((acc, id) => { const [bi, u] = id.split(':').map(Number); return acc + g.unitPrice(g.L.buildings[bi], u); }, 0);
    say(g, `🏠 Объектов: ${p.length} · суммарная стоимость ${$(total)} · точка появления: ${g.getState().spawnHome ? g.propertyName(g.getState().spawnHome!) : 'по умолчанию'}`);
  } },
  { name: 'sellallhouses', cat: 'prop', desc: 'продать всю недвижимость государству', run: (g) => {
    const total = g.getState().properties.length;
    if (!total) { say(g, 'У вас нет недвижимости'); return; }
    const before = g.getState().money;
    for (let i = 0; i < total && g.getState().properties.length; i++) g.sellHome('1');
    say(g, `🏠 Продано объектов: ${total - g.getState().properties.length}. Выручка ${$(g.getState().money - before)}`);
  } },
  { name: 'property', cat: 'prop', desc: 'открыть планшет → «Имущество»', run: (g) => g.openTablet('estate') },
  { name: 'garage', cat: 'prop', desc: 'купить ближайший гараж', run: (g) => {
    const p = near(g);
    const list = g.L.garages.map((gr) => ({ gr, d: Math.hypot(gr.x - p.x, gr.gateZ - p.z) })).sort((a, b) => a.d - b.d);
    const g0 = list[0]?.gr; if (!g0) { say(g, 'Гаражи не найдены'); return; }
    if (g.getState().garages.includes(g0.id)) { say(g, `Гараж №${g0.id + 1} уже ваш`); g.destination = { x: g0.x, z: g0.gateZ }; return; }
    g.buyGarage(g0.id);
  } },
  { name: 'sellgarage', cat: 'prop', desc: 'продать гараж государству (60%)', run: (g) => {
    const own = g.getState().garages; if (!own.length) { say(g, 'У вас нет гаража'); return; }
    g.sellGarage(own[own.length - 1]);
  } },

  // ---------- транспорт ----------
  { name: 'sellcar', args: '[номер]', cat: 'car', desc: 'сдать машину в трейд-ин (60%)', run: (g, a) => g.sellCarCmd(a) },
  { name: 'mycars', cat: 'car', desc: 'список машин с состоянием', run: (g) => {
    const c = g.getState().vehicles;
    if (!c.length) { say(g, 'У вас нет транспорта. Автосалоны — на шоссе и в городе'); return; }
    say(g, c.map((o, i) => `${i + 1}) ${VEHICLES[o.type]?.name ?? o.type} · ${Math.round(o.condition * 100)}% · ${Math.round(o.fuel)}%⛽ · ${Math.round(o.mileage / 1000)} тыс.км`).join(' | '));
  } },
  { name: 'carvalue', args: '[номер]', cat: 'car', desc: 'оценка машины', run: (g, a) => {
    const o = myCar(g, a); if (!o) return;
    say(g, `${VEHICLES[o.type]?.name}: рынок ${$(carValue(o.type, o.year, o.mileage, o.condition))} · государству ${$(Math.round(carValue(o.type, o.year, o.mileage, o.condition) * 0.6))}`);
  } },
  { name: 'lockcar', aliases: ['lk'], cat: 'car', desc: 'запереть/открыть ближайшую машину', run: (g) => g.toggleCarLock() },
  { name: 'repair', args: '[номер]', cat: 'car', desc: 'отремонтировать машину (нужно быть рядом)', run: (g, a) => {
    const o = myCar(g, a); if (!o) return;
    const v = g.vehicles.find((x) => x.owned?.uid === o.uid);
    if (!v) { say(g, 'Машина далеко — ремонт возможен только рядом с ней'); return; }
    const cost = repairCost({ ...o, missing: v.model.missingParts() });
    say(g, `Стоимость ремонта ${$(cost)}`);
    g.repairVehicle(o.uid);
  } },
  { name: 'refuel', args: '[номер]', cat: 'car', desc: 'заправить машину ($3/л, нужна АЗС рядом)', run: (g, a) => {
    const o = myCar(g, a); if (!o) return;
    const v = g.vehicles.find((x) => x.owned?.uid === o.uid);
    if (!v) { say(g, 'Машина далеко'); return; }
    if (v.fuel >= 99) { say(g, 'Бак полон'); return; }
    const p = near(g);
    const gas = g.L.buildings.filter((b) => b.kind === 'gas' || b.kind === 'service').sort((b1, b2) => Math.hypot(b1.door.x - p.x, b1.door.z - p.z) - Math.hypot(b2.door.x - p.x, b2.door.z - p.z))[0];
    if (!gas || Math.hypot(gas.door.x - p.x, gas.door.z - p.z) > 60) { say(g, 'Подъезжайте к АЗС'); return; }
    const need = 100 - v.fuel; const cost = Math.ceil(need * 3);
    if (g.getState().money < cost) { say(g, `Нужно ${$(cost)}`); return; }
    g.getState().money -= cost; v.fuel = 100; o.fuel = 100; g.saveGame();
    say(g, `⛽ Бак полон: ${$(cost)}`);
  } },
  { name: 'deliver', args: '[номер]', cat: 'car', desc: 'доставить машину к вам', run: (g, a) => {
    const o = myCar(g, a); if (!o) return;
    g.deliverCar(o.uid);
  } },
  { name: 'plate', args: '[номер] X000XX 00', cat: 'car', desc: 'поставить номерной знак', run: (g, a) => {
    const parts = a.trim().split(/\s+/);
    const n = parts.length > 1 && /^\d+$/.test(parts[0]) ? parts.shift()! : '';
    const o = myCar(g, n); if (!o) return;
    say(g, g.setPlate(o.uid, parts.join(' ')));
  } },
  { name: 'park', args: '[номер]', cat: 'car', desc: 'убрать машину с улицы (сохранится)', run: (g, a) => {
    const o = myCar(g, a); if (!o) return;
    const v = g.vehicles.find((x) => x.owned?.uid === o.uid);
    if (v) { if (g.inVeh === v) g.exitVehicle(true); g.removeVehicle(v); }
    o.pos = null; g.saveGame();
    say(g, `🅿️ ${VEHICLES[o.type]?.name} убрана с улицы — вызовете командой /deliver`);
  } },
  { name: 'sellallcars', cat: 'car', desc: 'продать весь транспорт государству', run: (g) => {
    const total = g.getState().vehicles.length;
    if (!total) { say(g, 'У вас нет транспорта'); return; }
    const before = g.getState().money;
    for (let i = 0; i < total && g.getState().vehicles.length; i++) g.sellCarCmd('1');
    say(g, `🚗 Продано машин: ${total - g.getState().vehicles.length}. Выручка ${$(g.getState().money - before)}`);
  } },
  { name: 'insure', cat: 'car', desc: 'страховка на 7 дней: скидка на ремонт', run: (g) => {
    const s = g.getState();
    if (Date.now() < (s.insuredUntil ?? 0)) { say(g, `Страховка уже действует до ${new Date(s.insuredUntil!).toLocaleDateString('ru')}`); return; }
    const cost = 2500;
    if (s.money < cost) { say(g, `Страховка стоит ${$(cost)}`); return; }
    s.money -= cost; s.insuredUntil = Date.now() + 7 * 24 * 3600 * 1000; g.saveGame();
    say(g, '🛡️ Страховка оформлена: ремонт в сервисе дешевле 7 дней');
  } },
  { name: 'carstats', cat: 'car', desc: 'сводка по автопарку', run: (g) => {
    const c = g.getState().vehicles;
    if (!c.length) { say(g, 'Автопарк пуст'); return; }
    const total = c.reduce((a, o) => a + carValue(o.type, o.year, o.mileage, o.condition), 0);
    const broken = c.filter((o) => o.condition < 0.45).length;
    say(g, `🚘 Машин: ${c.length} · стоимость ${$(total)} · требуют ремонта: ${broken} · пробег ${Math.round(c.reduce((a, o) => a + o.mileage, 0) / 1000)} тыс.км`);
  } },

  // ---------- бизнес ----------
  { name: 'sellbiz', args: '[номер]', cat: 'biz', desc: 'продать бизнес государству', run: (g, a) => g.sellBizCmd(a) },
  { name: 'mybiz', cat: 'biz', desc: 'список бизнеса и доходность', run: (g) => {
    const ks = g.getState().kiosks;
    if (!ks.length) { say(g, 'Бизнеса нет. Ларьки покупаются у парков и на набережной'); return; }
    say(g, ks.map((k, i) => { const kt = KIOSK_TYPES[g.L.kiosks[k.id].type]; return `${i + 1}) ${kt.name} · ${k.closed ? 'закрыт' : 'открыт'} · ${$(k.acc)} в кассе`; }).join(' | '));
  } },
  { name: 'bizcollect', cat: 'biz', desc: 'собрать доход со всего бизнеса', run: (g) => g.collectKiosks() },
  { name: 'bizopen', args: '[номер]', cat: 'biz', desc: 'открыть бизнес (доход капает)', run: (g, a) => {
    const k = myBiz(g, a); if (!k) return;
    k.closed = false; k.last = Date.now(); g.saveGame();
    say(g, `🏪 ${KIOSK_TYPES[g.L.kiosks[k.id].type].name} открыт`);
  } },
  { name: 'bizclose', args: '[номер]', cat: 'biz', desc: 'закрыть бизнес (доход на паузе)', run: (g, a) => {
    const k = myBiz(g, a); if (!k) return;
    g.collectKiosks(k.id);
    k.closed = true; g.saveGame();
    say(g, `🔒 ${KIOSK_TYPES[g.L.kiosks[k.id].type].name} закрыт — доход остановлен`);
  } },
  { name: 'bizincome', cat: 'biz', desc: 'доход в минуту и окупаемость', run: (g) => {
    const ks = g.getState().kiosks;
    if (!ks.length) { say(g, 'Бизнеса нет'); return; }
    const inc = ks.reduce((a, k) => a + (k.closed ? 0 : KIOSK_TYPES[g.L.kiosks[k.id].type].income), 0);
    say(g, `💰 Доход: ${$(inc)}/мин · ${$(inc * 60)}/час · открыто ${ks.filter((k) => !k.closed).length} из ${ks.length}`);
  } },
  { name: 'buybiz', cat: 'biz', desc: 'купить ближайший свободный ларёк', run: (g) => {
    const p = near(g);
    const free = g.L.kiosks.map((k) => ({ k, d: Math.hypot(k.x - p.x, k.z - p.z) })).filter((x) => !g.getState().kiosks.some((o) => o.id === x.k.id)).sort((a, b) => a.d - b.d)[0];
    if (!free || free.d > 120) { say(g, 'Рядом нет свободного ларька'); return; }
    g.buyKiosk(free.k.id);
  } },
  { name: 'bizprice', cat: 'biz', desc: 'прайс ларьков', run: (g) => say(g, KIOSK_TYPES.map((k, i) => `${i + 1}) ${k.name} — ${$(k.price)} · ${$(k.income)}/мин`).join(' | ')) },
  { name: 'bizlist', cat: 'biz', desc: 'ближайшие ларьки и их статус', run: (g) => {
    const p = near(g);
    const list = g.L.kiosks.map((k) => ({ k, d: Math.hypot(k.x - p.x, k.z - p.z) })).sort((a, b) => a.d - b.d).slice(0, 6);
    say(g, list.map(({ k, d }) => `${KIOSK_TYPES[k.type].name} (${Math.round(d)} м) — ${g.getState().kiosks.some((o) => o.id === k.id) ? 'ваш' : 'свободен'}`).join(' · '));
  } },
  { name: 'bizsellall', cat: 'biz', desc: 'продать весь бизнес', run: (g) => {
    const total = g.getState().kiosks.length; if (!total) { say(g, 'Бизнеса нет'); return; }
    for (let i = 0; i < total && g.getState().kiosks.length; i++) g.sellBizCmd('1');
    say(g, `🏪 Продано бизнесов: ${total - g.getState().kiosks.length}`);
  } },

  // ---------- деньги и розыск ----------
  { name: 'pay', args: '<ник> <сумма>', cat: 'money', desc: 'перевести деньги игроку', run: (g, a) => {
    const [nick, sum] = a.trim().split(/\s+/);
    const amt = Math.round(Number(sum) || 0);
    if (!nick || amt <= 0) { say(g, 'Использование: /pay ник 500'); return; }
    g.giveMoney(nick, amt);
  } },
  { name: 'give', args: '<ник> <предмет> <кол-во>', cat: 'money', desc: 'передать предмет игроку', run: (g, a) => {
    const [nick, item, cnt] = a.trim().split(/\s+/);
    if (!nick || !item) { say(g, 'Использование: /give ник water 2 (id предмета — /inv)'); return; }
    g.giveItem(nick, item.toLowerCase(), num(cnt ?? '1'));
  } },
  { name: 'balance', aliases: ['cash'], cat: 'money', desc: 'баланс и розыск', run: (g) => {
    const s = g.getState();
    say(g, `💵 Баланс ${$(s.money)} · розыск ★${s.wanted || 0} · штрафов нет`);
  } },
  { name: 'wanted', aliases: ['search'], cat: 'money', desc: 'уровень розыска и как его сбросить', run: (g) => {
    const s = g.getState();
    say(g, (s.wanted || 0) > 0 ? `В розыске: ${'★'.repeat(s.wanted)} — уходите от погони или /charity` : 'Вы не в розыске 👍');
  } },
  { name: 'police', cat: 'money', desc: 'телефон полиции (штрафов в городе нет)', run: (g) => {
    const s = g.getState();
    say(g, `🚓 Полиция Лос-Города: камеры только фиксируют нарушения. Штрафов нет · розыск ★${s.wanted || 0}`);
  } },
  { name: 'bonus', cat: 'money', desc: 'забрать ежедневный бонус ($500)', run: (g) => {
    const s = g.getState();
    const last = s.lastBonus ?? 0;
    if (Date.now() - last < 20 * 3600 * 1000) { say(g, `Бонус уже получен. Следующий через ${Math.ceil((20 * 3600 * 1000 - (Date.now() - last)) / 3600000)} ч`); return; }
    s.lastBonus = Date.now(); s.money += 500; g.saveGame(); say(g, '🎁 Ежедневный бонус: +$500');
  } },
  { name: 'lottery', cat: 'money', desc: 'лотерея: билет $100, приз до $10 000', run: (g) => {
    const s = g.getState();
    if (s.money < 100) { say(g, 'Билет стоит $100'); return; }
    s.money -= 100;
    const roll = Math.random();
    const win = roll > 0.995 ? 10000 : roll > 0.97 ? 2000 : roll > 0.9 ? 500 : roll > 0.75 ? 150 : 0;
    if (win) { s.money += win; say(g, `🎰 Выигрыш ${$(win)}!`); } else say(g, '🎰 Не повезло. Попробуйте ещё');
    g.saveGame();
  } },
  { name: 'charity', cat: 'money', desc: 'пожертвовать $1000 в приют (минус розыск)', run: (g) => {
    const s = g.getState();
    if (s.money < 1000) { say(g, 'Нужно $1000'); return; }
    s.money -= 1000; s.wanted = Math.max(0, (s.wanted || 0) - 1); g.saveGame();
    say(g, '❤️ Спасибо! Город стал добрее, розыск снижен');
  } },

  // ---------- мир ----------
  { name: 'help', cat: 'world', desc: 'список команд по категориям', run: (g) => { for (const c of Object.keys(CAT_NAMES) as CmdCat[]) g.sysMsg(`${CAT_NAMES[c]}: ${COMMANDS.filter((x) => x.cat === c).map((x) => '/' + x.name).join(' ')}`); } },
  { name: 'cmds', args: '[категория]', cat: 'world', desc: 'подробная справка по командам', run: (g, a) => {
    const cat = (Object.keys(CAT_NAMES) as CmdCat[]).find((c) => c === a || CAT_NAMES[c].toLowerCase().includes(a.toLowerCase()));
    const list = cat ? COMMANDS.filter((c) => c.cat === cat) : COMMANDS;
    for (const c of list) g.sysMsg(`/${c.name}${c.args ? ' ' + c.args : ''} — ${c.desc}`);
  } },
  { name: 'where', cat: 'world', desc: 'где вы находитесь', run: (g) => { const p = near(g); say(g, `📍 ${g.locationName()} · X ${Math.round(p.x)} · Z ${Math.round(p.z)}`); } },
  { name: 'online', cat: 'world', desc: 'игроки в сети', run: (g) => say(g, g.net ? [...g.net.players.values()].filter((p) => p.id !== g.net!.id).map((p) => p.nick ?? p.name).join(', ') || 'Кроме вас никого' : 'Вы в одиночной игре') },
  { name: 'time', cat: 'world', desc: 'игровое время и погода', run: (g) => { const s = g.getState(); say(g, `🕒 ${String(Math.floor(s.gameTime / 60)).padStart(2, '0')}:${String(Math.floor(s.gameTime % 60)).padStart(2, '0')} · ${g.isNight() ? 'ночь' : 'день'}`); } },
  { name: 'stats', cat: 'world', desc: 'полная статистика персонажа', run: (g) => {
    const s = g.getState();
    say(g, `👤 ${s.nick ?? 'Вы'} · ${$(s.money)} · ❤${Math.round(s.health)}% 🍗${Math.round(s.food)}% 💧${Math.round(s.water)}% ⚡${Math.round(s.energy)}% · 🏠${s.properties.length} 🚘${s.vehicles.length} 🏪${s.kiosks.length} · в игре ${Math.floor(s.playTime / 60)} мин`);
  } },
  { name: 'quest', cat: 'world', desc: 'текущее задание сюжета', run: (g) => say(g, g.questText() ?? 'Сюжет пройден — все задания выполнены') },
  { name: 'beach', cat: 'world', desc: 'маршрут на пляж', run: (g) => { g.destination = { x: -175, z: 480 }; say(g, '🏖️ Маршрут на пляж проложен: тропы, души, туалеты, волейбол'); } },
  { name: 'fishshop', cat: 'world', desc: 'маршрут к магазину удочек', run: (g) => {
    const p = near(g);
    const b = g.L.buildings.filter((x) => x.kind === 'fishshop').sort((a, c) => Math.hypot(a.door.x - p.x, a.door.z - p.z) - Math.hypot(c.door.x - p.x, c.door.z - p.z))[0];
    if (!b) { say(g, 'Магазин не найден'); return; }
    g.destination = { x: b.door.x, z: b.door.z }; say(g, `🎣 Маршрут к «${b.name}» проложен · снасти: ${SHOP_ITEMS.fishshop.map((i) => ITEMS[i].name).join(', ')}`);
  } },
  { name: 'minicity', cat: 'world', desc: 'маршрут в областной город Приморск', run: (g) => {
    g.destination = { x: 780, z: 1300 };
    say(g, '🏙️ Приморск: 5×5 кварталов, высотки, управа, магазины и рыболовный магазин');
  } },
  { name: 'village', aliases: ['farm'], cat: 'world', desc: 'маршрут к деревне с фермой', run: (g) => {
    const p = near(g);
    const klen = Math.hypot(600 - p.x, 1745 - p.z), sosn = Math.hypot(1200 - p.x, 1600 - p.z);
    if (sosn < klen) { g.destination = { x: 1200, z: 1600 }; say(g, '🌾 Ольховка: дома с заборами, амбар, коровник, силосы, техника и поля'); }
    else { g.destination = { x: 600, z: 1745 }; say(g, '🌾 Кленовка: сельмаг, дома и ферма с амбаром, курятником и полями'); }
  } },

  // ---------- админ ----------
  { name: 'setmoney', aliases: ['adminmoney', 'givemoney', 'money'], args: '[сумма]', cat: 'admin', desc: 'выдать себе деньги (по умолчанию $1 000 000)', run: (g, a) => {
    const n = Math.round(Number(a.replace(/\s/g, '')) || 1_000_000);
    g.adminMoney(n);
  } },
  { name: 'takemoney', args: '[сумма]', cat: 'admin', desc: 'списать у себя деньги', run: (g, a) => g.adminTakeMoney(Number(a) || 1_000_000) },
  { name: 'grantadmin', aliases: ['makeadmin'], args: '<ник>', cat: 'admin', desc: 'выдать админку другому игроку', run: (g, a) => {
    if (!a.trim()) { say(g, 'Использование: /grantadmin ник'); return; }
    g.grantAdmin(a);
  } },
  { name: 'revokeadmin', args: '<ник>', cat: 'admin', desc: 'снять выданную админку', run: (g, a) => g.revokeAdmin(a) },
  { name: 'heal', cat: 'admin', desc: 'восстановить здоровье, еду и воду (админ)', run: (g) => g.adminHeal() },
  { name: 'fixcars', aliases: ['fixall'], cat: 'admin', desc: 'отремонтировать и заправить весь транспорт', run: (g) => g.adminFixCars() },
  { name: 'tp', aliases: ['teleport'], args: '[x z]', cat: 'admin', desc: 'телепорт к метке на карте или по координатам', run: (g, a) => {
    const [x, z] = a.trim().split(/\s+/).map(Number);
    g.adminTeleport(Number.isFinite(x) && Number.isFinite(z) ? x : undefined, Number.isFinite(x) && Number.isFinite(z) ? z : undefined);
  } },
  { name: 'god', aliases: ['godmode'], cat: 'admin', desc: 'включить/выключить бессмертие', run: (g) => g.adminGod() },
  { name: 'admins', cat: 'admin', desc: 'кто получил админку от вас', run: (g) => {
    const list = g.adminList();
    say(g, list.length ? `👑 Выданная админка (${list.length}): ${list.join(', ')}` : 'Выданных админок пока нет. /grantadmin ник');
  } },
];

export const CMD_INDEX = new Map<string, Cmd>();
for (const c of COMMANDS) { CMD_INDEX.set(c.name, c); for (const a of c.aliases ?? []) CMD_INDEX.set(a, c); }

/** выполнить команду: true — команда найдена и обработана */
export function runCommand(g: Game, raw: string): boolean {
  const t = raw.trim();
  if (!t.startsWith('/')) return false;
  const [head, ...rest] = t.split(/\s+/);
  const cmd = CMD_INDEX.get(head.slice(1).toLowerCase());
  if (!cmd) return false;
  try { cmd.run(g, rest.join(' ').trim()); } catch (e) { g.sysMsg('Ошибка команды: ' + (e instanceof Error ? e.message : 'неизвестно')); }
  return true;
}

/** используется в подсказке чата */
export const CMD_COUNT = COMMANDS.length;
export const CMD_NAMES = COMMANDS.map((c) => '/' + c.name);