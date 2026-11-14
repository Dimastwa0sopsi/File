// Сторож мультиплеера: обмен предметами, доставка игровых событий и присутствие других игроков.
// PR #44 вырезал из game.ts весь онлайн-код: чужие игроки перестали появляться в мире,
// обмен отвечал «только в соло-режиме», а события боя никуда не уходили.
// Тест работает на настоящих методах Game (через прототип) и настоящем NetClient с фальшивым сокетом.
/* eslint-disable @typescript-eslint/no-explicit-any */
import './domstub';
import { readFileSync } from 'node:fs';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
(globalThis as any).window = { ...(globalThis as any).window, setTimeout: (f: any, t: number) => setTimeout(f, t), clearTimeout: (h: any) => clearTimeout(h) };

const sockets: FakeWS[] = [];
class FakeWS {
  static OPEN = 1;
  url: string; readyState = 1; sent: any[] = [];
  onopen: any = null; onerror: any = null; onclose: any = null; onmessage: any = null;
  constructor(url: string) { this.url = url; sockets.push(this); setTimeout(() => this.onopen?.(), 1); }
  send(data: string) { try { this.sent.push(JSON.parse(data)); } catch { this.sent.push(data); } }
  close() { this.readyState = 3; this.onclose?.({}); }
  push(o: any) { this.onmessage?.({ data: JSON.stringify(o) }); }
}
(globalThis as any).WebSocket = FakeWS;

import { NetClient } from '../src/game/net';
import { Game } from '../src/game/game';

const fails: string[] = [];
const ok = (cond: boolean, what: string) => { console.log(`${cond ? '✓' : '✗'} ${what}`); if (!cond) fails.push(what); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const P = Game.prototype as any;

/** игрок-пустышка: настоящие методы Game на минимальном окружении */
function makePlayer(money = 1000, inventory: Record<string, number> = { water: 5, burger: 2 }) {
  const sent: any[] = [];
  const toasts: string[] = [];
  const panels: any[] = [];
  const g: any = Object.create(P);
  g.online = true;
  g.px = 0; g.pz = 0; g.py = 0; g.pa = 0;
  g.interior = null;
  g.state = { money, inventory, nick: 'Тест', location: null, health: 100 };
  g.trade = null; g.tradeInvite = null; g.panel = null;
  g.remotes = new Map();
  g.rideRemote = null; g.rideDist = 0;
  g.sound = new Proxy({}, { get: () => () => undefined });
  g.toast = (t: string) => { toasts.push(t); };
  g.save = () => undefined;
  g.reportInventory = () => undefined;
  g.openPanel = (p: any) => { g.panel = p; panels.push(p); };
  g.closePanel = () => { g.panel = null; };
  g.scene = { add() { /* */ }, remove() { /* */ } };
  g.player = { root: { parent: null, scale: { setScalar() { /* */ } } }, setItem() { /* */ } };
  g.col = { groundAt: () => 0, solidAt: () => false };
  g.combat = { reset() { /* */ } };
  g.weapon = 'fists';
  g.net = {
    id: 1,
    sendEvent: (ev: any) => { sent.push(ev); },
    displayName: (id: number) => 'Игрок' + id,
    players: new Map(),
    others: () => [],
  };
  return { g, sent, toasts, panels };
}

/** добавить «другого игрока» в список присутствующих */
function addRemote(g: any, id: number, over: Record<string, any> = {}) {
  const r: any = {
    id, name: 'Петя' + id, tagName: '', color: '#60a5fa',
    char: { root: { parent: null, visible: true, scale: { setScalar() { /* */ } } }, dispose() { /* */ }, pose() { /* */ }, setItem() { /* */ } },
    tag: { position: { set() { /* */ } }, visible: true, material: { map: null, dispose() { /* */ } } },
    x: 1, y: 0, z: 1, a: 0, spd: 0, phase: 0,
    veh: null, vehKey: '', plate: '', driving: false, vehSeat: 0, vehIdle: 0,
    inVeh: false, visible: true, crouch: false, taxi: false, hp: 100, flinch: 0, weapon: 0,
    lookKey: '', ikey: '', listings: [], listKey: '', props: [],
    ...over,
  };
  g.remotes.set(id, r);
  return r;
}

async function main() {
  // ======================= ОБМЕН =======================
  {
    const A = makePlayer(1000, { water: 5, burger: 2 });
    addRemote(A.g, 2, { name: 'Петя', x: 3, z: 0 });
    ok(A.g.tradeStart('петя') === true, 'обмен начинается по нику без учёта регистра');
    ok(A.sent.some((e) => e.e === 'trade' && e.op === 'req' && e.t === 2), 'приглашение ушло адресату');
    A.g.remotes.get(2).x = 400;
    A.g.trade = null;
    ok(A.g.tradeStart('Петя') === false, 'издалека обмен не начать');
  }
  {
    // партнёр согласился — панель обмена открылась
    const A = makePlayer();
    addRemote(A.g, 2, { name: 'Петя' });
    A.g.tradeEvent(2, { e: 'trade', t: 1, op: 'acc' });
    ok(A.g.trade === null, 'чужое «согласен» без нашего запроса игнорируется');
    A.g.tradeStart('Петя');
    A.g.tradeEvent(2, { e: 'trade', t: 1, op: 'acc' });
    ok(!!A.g.trade && A.g.trade.peer === 2, 'после согласия создана сделка');
    ok(A.g.panel?.type === 'trade', 'панель обмена открыта автоматически');

    // кладём предметы
    ok(A.g.tradeAdd('water', 2) === true, 'предмет кладётся в предложение');
    ok(A.g.trade.mine.water === 2, 'в предложении ровно два предмета');
    A.g.tradeAdd('water', 99);
    ok(A.g.trade.mine.water === 5, 'больше, чем есть в рюкзаке, положить нельзя');
    ok(A.g.tradeAdd('нетакого', 1) === false, 'несуществующий предмет не кладётся');
    A.g.tradeRemove('water', 5);
    ok(A.g.trade.mine.water === undefined, 'после снятия всех штук ключ исчезает');

    // деньги
    A.g.tradeMoney(999999);
    ok(A.g.trade.myMoney === 1000, 'в обмен нельзя поставить больше своего баланса');
    A.g.tradeMoney(-50);
    ok(A.g.trade.myMoney === 0, 'отрицательная сумма превращается в ноль');

    // каждое изменение шлёт предложение и сбрасывает согласие
    A.g.trade.myReady = true; A.g.trade.theirReady = true;
    A.g.tradeAdd('burger', 1);
    const offer = [...A.sent].reverse().find((e) => e.op === 'offer');
    ok(!!offer && offer.money === 0 && JSON.stringify(offer.items) === '[["burger",1]]', 'предложение уходит партнёру целиком');
    ok(A.g.trade.myReady === false && A.g.trade.theirReady === false, 'правка предложения сбрасывает оба согласия');
  }
  {
    // честная сделка: вещи и деньги меняются местами
    const A = makePlayer(500, { water: 3 });
    A.g.trade = { peer: 2, name: 'Петя', mine: { water: 2 }, myMoney: 100, theirs: { burger: 1 }, theirMoney: 50, myReady: false, theirReady: false, view: 'mine' };
    // партнёр подтверждает: h — отпечаток его предложения, h2 — то, как он видит наше
    A.g.tradeEvent(2, { e: 'trade', t: 1, op: 'ready', h: 'burger:1|50', h2: 'water:2|100' });
    ok(A.g.trade !== null && A.g.trade.theirReady === true, 'чужое согласие принято, но сделку одно оно не закрывает');
    A.g.tradeReady();
    ok(A.g.trade === null, 'после обоюдного согласия сделка закрыта');
    ok(A.g.state.inventory.water === 1, 'свои предметы списаны (3 − 2)');
    ok(A.g.state.inventory.burger === 1, 'чужой предмет зачислен');
    ok(A.g.state.money === 450, 'деньги разошлись верно (500 − 100 + 50)');
  }
  {
    // отпечатки разошлись — сделки нет, вещи целы
    const A = makePlayer(500, { water: 3 });
    A.g.trade = { peer: 2, name: 'Петя', mine: { water: 2 }, myMoney: 0, theirs: { burger: 1 }, theirMoney: 0, myReady: true, theirReady: false, view: 'mine' };
    A.g.tradeEvent(2, { e: 'trade', t: 1, op: 'ready', h: 'burger:7|0', h2: 'water:2|0' });
    ok(A.g.trade === null, 'расхождение предложений отменяет обмен');
    ok(A.g.state.inventory.water === 3 && A.g.state.inventory.burger === undefined, 'при отмене ничего не списалось');
    ok(A.sent.some((e) => e.op === 'cancel'), 'партнёру ушла отмена');
  }
  {
    // нечего отдавать — согласие не проходит
    const A = makePlayer(10, { water: 1 });
    A.g.trade = { peer: 2, name: 'Петя', mine: { water: 5 }, myMoney: 0, theirs: {}, theirMoney: 0, myReady: false, theirReady: true, view: 'mine' };
    ok(A.g.tradeReady() === false, 'нельзя согласиться на обмен вещами, которых уже нет');
    ok(A.g.trade !== null && A.g.trade.myReady === false, 'сделка при этом не сорвана, предложение поправлено');
    A.g.trade = { peer: 2, name: 'Петя', mine: {}, myMoney: 900, theirs: {}, theirMoney: 0, myReady: false, theirReady: true, view: 'mine' };
    ok(A.g.tradeReady() === false && A.g.trade.myMoney === 10, 'сумма больше баланса срезается до остатка');
  }
  {
    // приглашения
    const A = makePlayer();
    A.g.tradeEvent(2, { e: 'trade', t: 1, op: 'req' });
    ok(A.g.tradeInvite?.from === 2, 'входящее приглашение сохранено');
    A.g.tradeEvent(3, { e: 'trade', t: 1, op: 'req' });
    ok(A.sent.some((e) => e.op === 'dec' && e.t === 3), 'второе приглашение вежливо отклонено');
    A.g.tradeAccept();
    ok(A.sent.some((e) => e.op === 'acc' && e.t === 2) && !!A.g.trade, 'принятие приглашения открывает сделку');
    A.g.tradeCancel();
    ok(A.g.trade === null && A.sent.some((e) => e.op === 'cancel'), 'отмена закрывает сделку и уведомляет партнёра');

    A.g.tradeEvent(4, { e: 'trade', t: 1, op: 'req' });
    A.g.tradeDecline();
    ok(A.g.tradeInvite === null && A.sent.some((e) => e.op === 'dec' && e.t === 4), 'отказ отправлен и приглашение убрано');
  }
  {
    // чужое предложение фильтруется от мусора
    const A = makePlayer();
    A.g.trade = { peer: 2, name: 'Петя', mine: {}, myMoney: 0, theirs: {}, theirMoney: 0, myReady: true, theirReady: true, view: 'mine' };
    A.g.tradeEvent(2, { e: 'trade', t: 1, op: 'offer', items: [['water', 2], ['такого-нет', 5], ['burger', -3]], money: -10 });
    ok(A.g.trade.theirs.water === 2 && !('такого-нет' in A.g.trade.theirs) && !('burger' in A.g.trade.theirs), 'из чужого предложения отброшены несуществующие и пустые позиции');
    ok(A.g.trade.theirMoney === 0, 'отрицательные чужие деньги обнулены');
    ok(A.g.trade.myReady === false, 'новое предложение снова требует подтверждения');
  }

  // =============== ДОСТАВКА СОБЫТИЙ ПО СЕТИ ===============
  {
    const net = new NetClient('Иван', 'm', 'wss://test.local', '');
    net.connect();
    await wait(20);
    const ws = sockets[sockets.length - 1];
    ws.push({ type: 'login_success', player: { id: 1, name: 'Иван', money: 100, x: 0, y: 0, rot: 0 }, caps: {} });
    await wait(10);
    net.sendEvent({ e: 'trade', t: 2, op: 'req' });
    await wait(5);
    const ev = ws.sent.find((m: any) => typeof m.text === 'string' && m.text.startsWith('§LGE'));
    ok(!!ev, 'событие ушло на сервер и без «устаревшего» режима');
    ok(JSON.parse(String(ev.text).slice(4)).op === 'req', 'в посылке то самое событие');

    let got: any = null; let gotFrom = -1;
    net.onEvent = (from, e) => { gotFrom = from; got = e; };
    ws.push({ type: 'chat', id: 2, name: 'Петя', text: '§LGE' + JSON.stringify({ e: 'trade', t: 1, op: 'acc' }) });
    await wait(5);
    ok(got?.op === 'acc' && gotFrom === 2, 'входящее событие разобрано и помечено отправителем');
    ws.push({ type: 'chat', id: 1, name: 'Иван', text: '§LGE' + JSON.stringify({ e: 'trade', t: 2, op: 'dec' }) });
    await wait(5);
    ok(got?.op === 'acc', 'собственное событие обратно не применяется');
    ok(!net.chat.some((c) => c.text.includes('§LG')), 'служебные события не мусорят в общем чате');
  }

  // ============== ПРИСУТСТВИЕ ДРУГИХ ИГРОКОВ ==============
  {
    const A = makePlayer();
    const near = addRemote(A.g, 2, { x: 5, z: 5 });
    const inside = addRemote(A.g, 3, { ikey: '12::' });
    const dead = addRemote(A.g, 4, { hp: 0 });
    const driver = addRemote(A.g, 5, { inVeh: true });
    const hidden = addRemote(A.g, 6, { visible: false });
    const t = A.g.remoteTargets();
    ok(t.length === 1 && t[0] === near, 'под удар попадает только живой сосед на улице');
    ok(!t.includes(inside) && !t.includes(dead) && !t.includes(hidden), 'игроки в помещении, без сознания и вне поля зрения исключены');
    ok(A.g.remoteTargets(true).includes(driver), 'сидящего в машине видно при стрельбе');
  }
  {
    // кто считает трафик: клиент с меньшим id
    const A = makePlayer();
    A.g.net.id = 5;
    addRemote(A.g, 2, { x: 10, z: 10 });
    ok(A.g.suppressed(0, 0) === true, 'рядом со «старшим» клиентом свой трафик не плодим');
    ok(A.g.suppressed(900, 900) === false, 'вдалеке трафик считаем сами');
    A.g.net.id = 1;
    ok(A.g.suppressed(0, 0) === false, 'клиент с меньшим id остаётся хозяином трафика');
    A.g.online = false;
    ok(A.g.suppressed(0, 0) === false, 'в соло подавления нет вовсе');
  }
  {
    // поездка пассажиром и счётчик такси
    const A = makePlayer(1000, {});
    const veh: any = {
      x: 10, z: 0, y: 0, heading: 0, speed: 0, spec: { len: 4, wid: 2, hei: 1.4, name: 'Лада' },
      forward: () => ({ x: 0, z: 1 }), model: { body: {}, seats: [], passenger: {} },
    };
    const taxi = addRemote(A.g, 7, { name: 'Таксист', veh, taxi: true, driving: true });
    A.g.rideRemote = { id: 7, seat: 1 };
    ok(A.g.rideVeh() === veh, 'пассажир видит машину своего водителя');
    A.g.rideDist = 2000;
    ok(A.g.rideFare() === 33, 'счётчик такси: $5 посадка + $14 за километр');
    A.g.exitRemoteRide(true);
    ok(A.g.rideRemote === null, 'после выхода поездка завершена');
    ok(A.g.state.money === 967, 'оплата такси списана с пассажира');
    const pay = A.sent.find((e) => e.e === 'pay');
    ok(!!pay && pay.t === 7 && pay.amt === 33, 'деньги ушли водителю сетевым событием');
    void taxi;
  }

  // ============ СВЯЗЬ С ИНТЕРФЕЙСОМ И БОЕМ ============
  const game = readFileSync('src/game/game.ts', 'utf8');
  const combat = readFileSync('src/game/combat.ts', 'utf8');
  const extra = readFileSync('src/ui/Extra.tsx', 'utf8');
  const used = [...extra.matchAll(/g\.(trade[A-Za-z]*)\(/g)].map((m) => m[1]);
  ok(used.length > 0 && used.every((m) => typeof P[m] === 'function'), `панель обмена зовёт ${new Set(used).size} метода(ов), и все они есть в Game`);
  ok(/case 'trade':\s*\n\s*if \(ev\.t === net\.id\) this\.tradeEvent/.test(game), 'сетевые события обмена разбираются в handleNetEvent');
  ok(/case '\/obm': case '\/trade':/.test(game) && /this\.tradeStart\(/.test(game), 'команда /obm начинает настоящий обмен');
  ok(/tradeInvite: this\.tradeInvite\?\.name \?\? null/.test(game), 'подсказка о приглашении уходит в HUD');
  ok(/this\.updateRemotes\(dt\)/.test(game) && /net\.sendState\(st\)/.test(game), 'игра шлёт своё состояние и рисует остальных');
  ok(/new Character\(randomLook\(\)\)/.test(game) && /this\.makeTag\(display, color\)/.test(game), 'у чужого игрока есть тело и табличка с ником');
  ok(/sendEvent\(\{ e: 'hit'/.test(combat) && /sendEvent\(\{ e: 'shot'/.test(combat), 'бой снова сообщает другим об ударах и выстрелах');
  ok(/for \(const r of g\.remoteTargets\(true\)\)/.test(combat), 'пули проверяют попадание в других игроков');

  console.log(fails.length ? `\n✗ провалено: ${fails.length}` : '\n✓ мультиплеер на месте: обмен, события и другие игроки');
  process.exit(fails.length ? 1 : 0);
}

main();
