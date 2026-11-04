// RP #24 — проверка канала «🎁 предметы и инвентарь» между панелью Colab и игроком.
// Гоняется в node со стабами localStorage / window / WebSocket: настоящий NetClient,
// фальшивый сервер шлёт те же сообщения, что server.js, и мы смотрим, что доедет до игры.
/* eslint-disable @typescript-eslint/no-explicit-any */
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
(globalThis as any).window = { setTimeout: (f: any, t: number) => setTimeout(f, t), clearTimeout: (h: any) => clearTimeout(h) };

/** сообщения, которые клиент отправил «серверу» */
const sent: any[] = [];
let socket: FakeWS | null = null;
class FakeWS {
  static OPEN = 1;
  url: string; readyState = 1;
  onopen: any = null; onerror: any = null; onclose: any = null; onmessage: any = null;
  constructor(url: string) { this.url = url; socket = this; setTimeout(() => this.onopen?.(), 1); }
  send(data: string) { try { sent.push(JSON.parse(data)); } catch { sent.push(data); } }
  close() { this.readyState = 3; this.onclose?.({}); }
  /** сервер → клиент */
  push(o: any) { this.onmessage?.({ data: JSON.stringify(o) }); }
}
(globalThis as any).WebSocket = FakeWS;

import { NetClient } from '../src/game/net';

const fails: string[] = [];
const ok = (cond: boolean, what: string) => { console.log(`${cond ? '✓' : '✗'} ${what}`); if (!cond) fails.push(what); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** мини-копия клиентской половины RP #24 (game.ts: grantItem/takeItem/handleAdmin/reportInventory) */
class Player {
  inventory: Record<string, number> = { water: 2 };
  toasts: string[] = [];
  constructor(private net: NetClient) {
    net.onAdmin = (act, m) => this.handleAdmin(act, m as any);
  }
  reportInventory() { this.net.sendInventory(this.inventory); }
  grantItem(id: string, n = 1) {
    const qty = Math.max(1, Math.min(9999, Math.round(n)));
    this.inventory[id] = (this.inventory[id] ?? 0) + qty;
    this.toasts.push(`give ${id} x${qty}`);
  }
  takeItem(id: string, n = 1) {
    const have = this.inventory[id] ?? 0;
    if (have <= 0) { this.toasts.push(`take-empty ${id}`); return; }
    const qty = Math.min(have, Math.max(1, Math.round(n)));
    this.inventory[id] = have - qty;
    if (this.inventory[id] <= 0) delete this.inventory[id];
    this.toasts.push(`take ${id} x${qty}`);
  }
  handleAdmin(act: string, m: any) {
    if (act === 'item') {
      const mode = String(m.mode || 'give');
      if (mode === 'clear') { this.inventory = {}; this.reportInventory(); this.toasts.push('clear'); return; }
      const id = String(m.item || '');
      const n = Math.max(1, Math.min(9999, Math.round(Number(m.qty) || 1)));
      if (!id) return;
      if (mode === 'give') this.grantItem(id, n); else this.takeItem(id, n);
      this.reportInventory();
      return;
    }
    if (act === 'inv_report') { this.reportInventory(); return; }
  }
}

async function main() {
  const net = new NetClient('Тестер', 'm', 'wss://test.local', '');
  const player = new Player(net);
  let logins = 0;
  net.onLogin = () => { logins++; };
  net.connect();
  await wait(20);

  ok(!!socket, 'сокет открыт');
  ok(sent.some((m) => m.type === 'login' && m.name === 'Тестер'), 'клиент отправил login');

  // сервер подтверждает вход (как server.js)
  socket!.push({ type: 'login_success', player: { id: 7, name: 'Тестер', money: 5000, x: 516, y: 491.5, rot: 0 }, caps: { adm: 1 } });
  await wait(5);
  ok(logins === 1, 'onLogin сработал один раз');
  ok(net.id === 7, 'сервер выдал id игрока');

  // 1) 🎁 выдача предмета из панели Colab
  sent.length = 0;
  socket!.push({ type: 'adm', act: 'item', mode: 'give', item: 'medkit', qty: 3 });
  await wait(5);
  ok(player.inventory.medkit === 3, 'adm item give → аптечка ×3 в инвентаре');
  const snap1 = sent.find((m) => m.type === 'inv');
  ok(!!snap1, 'после выдачи клиент отправил снимок инвентаря');
  ok(!!snap1 && snap1.items.medkit === 3 && snap1.items.water === 2, 'снимок содержит и выданное, и старое');

  // 2) 🗑 изъятие больше, чем есть — забираем сколько есть, в минус не уходим
  sent.length = 0;
  socket!.push({ type: 'adm', act: 'item', mode: 'take', item: 'medkit', qty: 99 });
  await wait(5);
  ok(player.inventory.medkit === undefined, 'adm item take → позиция убрана целиком');
  const snap2 = sent.find((m) => m.type === 'inv');
  ok(!!snap2 && snap2.items.medkit === undefined, 'в снимке нет нулевых позиций');

  // 3) 🎒 панель просит свежий инвентарь
  sent.length = 0;
  socket!.push({ type: 'adm', act: 'inv_report' });
  await wait(5);
  ok(sent.some((m) => m.type === 'inv'), 'adm inv_report → клиент прислал снимок');

  // 4) набор «рыбаку»: сервер шлёт несколько item подряд (colab: kit_fish)
  sent.length = 0;
  for (const [item, qty] of [['rod', 1], ['bait', 10], ['sandwich', 2]] as [string, number][])
    socket!.push({ type: 'adm', act: 'item', mode: 'give', item, qty });
  await wait(5);
  ok(player.inventory.rod === 1 && player.inventory.bait === 10 && player.inventory.sandwich === 2, 'набор из нескольких предметов доехал целиком');

  // 5) очистка инвентаря
  sent.length = 0;
  socket!.push({ type: 'adm', act: 'item', mode: 'clear' });
  await wait(5);
  ok(Object.keys(player.inventory).length === 0, 'adm item clear → инвентарь пуст');
  const snap3 = sent.find((m) => m.type === 'inv');
  ok(!!snap3 && Object.keys(snap3.items).length === 0, 'пустой снимок ушёл на сервер');

  // 6) отрицательные и дробные количества не ломают протокол
  sent.length = 0;
  net.sendInventory({ water: 2.4, rod: 0, broken: -5 });
  await wait(5);
  const snap4 = sent.find((m) => m.type === 'inv');
  ok(!!snap4 && snap4.items.water === 2 && snap4.items.rod === undefined && snap4.items.broken === undefined, 'sendInventory чистит мусор (0, минус, дробь)');

  // 7) остальные команды панели по-прежнему различимы
  const acts: string[] = [];
  net.onAdmin = (act) => { acts.push(act); };
  for (const act of ['money', 'tp', 'heal', 'kill', 'freeze', 'unfreeze', 'respawn', 'carspawn', 'toast'])
    socket!.push({ type: 'adm', act });
  await wait(5);
  ok(acts.length === 9, 'все 9 остальных админ-команд дошли до обработчика');

  console.log(fails.length ? `\n✗ провалено: ${fails.length}` : '\n✓ RP #24: канал предметов и инвентаря работает');
  process.exit(fails.length ? 1 : 0);
}
main();
