// Переводы между игроками (/pay и /give): канал sendGift ↔ onGift в net.ts.
// Команды чата звали методы giveMoney / giveItem, которых в Game не было, —
// чат падал с TypeError. Тест гоняет настоящий NetClient на фальшивом сокете.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
(globalThis as any).window = { setTimeout: (f: any, t: number) => setTimeout(f, t), clearTimeout: (h: any) => clearTimeout(h) };

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

const fails: string[] = [];
const ok = (cond: boolean, what: string) => { console.log(`${cond ? '✓' : '✗'} ${what}`); if (!cond) fails.push(what); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** поднимаем клиента с ником и логиним его как server.js */
async function client(nick: string, id: number) {
  const net = new NetClient(nick, 'm', 'wss://test.local', '');
  net.connect();
  await wait(20);
  const ws = sockets[sockets.length - 1];
  ws.push({ type: 'login_success', player: { id, name: nick, money: 1000, x: 0, y: 0, rot: 0 }, caps: {} });
  await wait(10);
  return { net, ws };
}

async function main() {
  // --- отправитель ---
  const ivan = await client('Иван', 1);
  ivan.net.sendGift('money', 500, 1, 'Петя');
  await wait(5);
  const giftMsg = ivan.ws.sent.find((m: any) => typeof m.text === 'string' && m.text.startsWith('§LGT'));
  ok(!!giftMsg, 'перевод ушёл на сервер обычным chat-сообщением');
  {
    const body = JSON.parse(String(giftMsg.text).slice(4));
    ok(body.k === 'money' && body.n === 1, 'в посылке помечен тип «money»');
    ok(body.v === 500, `сумма доехала без потерь (${body.v})`);
    ok(body.nick === 'Петя', 'адресат указан в посылке');
  }
  ivan.net.sendGift('item', 'water', 3, 'Петя');
  await wait(5);
  {
    const items = ivan.ws.sent.filter((m: any) => typeof m.text === 'string' && m.text.startsWith('§LGT'));
    const body = JSON.parse(String(items[items.length - 1].text).slice(4));
    ok(body.k === 'item' && body.v === 'water' && body.n === 3, 'предмет и количество доехали (water ×3)');
  }

  // --- получатель ---
  const petya = await client('Петя', 2);
  const got: any[] = [];
  petya.net.onGift = (from, d) => got.push({ from, ...d });
  petya.ws.push({ type: 'chat', id: 1, name: 'Иван', text: '§LGT' + JSON.stringify({ k: 'money', v: 500, n: 1, nick: 'Петя' }) });
  await wait(10);
  ok(got.length === 1, 'адресат получил перевод');
  ok(got[0]?.v === 500 && got[0]?.from === 1, 'в переводе верны сумма и отправитель');

  petya.ws.push({ type: 'chat', id: 1, name: 'Иван', text: '§LGT' + JSON.stringify({ k: 'item', v: 'water', n: 3, nick: 'петя' }) });
  await wait(10);
  ok(got.length === 2 && got[1].v === 'water' && got[1].n === 3, 'ник сверяется без учёта регистра');

  // --- чужие переводы и мусор ---
  petya.ws.push({ type: 'chat', id: 3, name: 'Маша', text: '§LGT' + JSON.stringify({ k: 'money', v: 999, n: 1, nick: 'Коля' }) });
  await wait(10);
  ok(got.length === 2, 'чужой перевод не зачисляется');

  petya.ws.push({ type: 'chat', id: 2, name: 'Петя', text: '§LGT' + JSON.stringify({ k: 'money', v: 50, n: 1, nick: 'Петя' }) });
  await wait(10);
  ok(got.length === 2, 'свой же перевод не зачисляется дважды');

  petya.ws.push({ type: 'chat', id: 1, name: 'Иван', text: '§LGT{битый json' });
  await wait(10);
  ok(got.length === 2, 'битая посылка не роняет клиента');

  petya.ws.push({ type: 'chat', id: 1, name: 'Иван', text: '§LGT' + JSON.stringify({ k: 'dog', v: 1, n: 1, nick: 'Петя' }) });
  await wait(10);
  ok(got.length === 2, 'неизвестный тип подарка отбрасывается');

  // --- служебные сообщения не попадают в чат ---
  const chat: any[] = [];
  petya.net.onChat = (m: any) => chat.push(m);
  petya.ws.push({ type: 'chat', id: 1, name: 'Иван', text: '§LGT' + JSON.stringify({ k: 'money', v: 10, n: 1, nick: 'Петя' }) });
  await wait(10);
  ok(chat.length === 0, 'служебная посылка не светится в общем чате');

  // --- игра действительно подключает приёмник и умеет отправлять ---
  const game = readFileSync('src/game/game.ts', 'utf8');
  ok(/net\.onGift\s*=/.test(game), 'game.ts подключает net.onGift');
  ok(/giveMoney\(/.test(game) && /giveItem\(/.test(game), 'в Game есть giveMoney и giveItem, которые зовут команды /pay и /give');
  const cmds = readFileSync('src/game/commands.ts', 'utf8');
  ok(/g\.giveMoney\(/.test(cmds) && /g\.giveItem\(/.test(cmds), 'команды /pay и /give ссылаются на существующие методы');

  console.log(fails.length ? `\n✗ провалено проверок: ${fails.length}` : '\n✓ переводы между игроками работают');
  process.exit(fails.length ? 1 : 0);
}
main();
