// Сквозная проверка: настоящий сервер (server/server.js) + два настоящих клиента NetClient.
// Проверяем то, ради чего всё и делалось: игроки видят друг друга, их позы и машины
// доезжают, обмен/бой/переводы/чат ходят между клиентами.
// Серверу нужны ws и better-sqlite3. Их нет в зависимостях сайта, поэтому без них тест
// не падает, а честно сообщает, что пропущен: npm i ws better-sqlite3
/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const req = createRequire(join(process.cwd(), 'package.json'));
let WS: any = null;
try { WS = req('ws'); req.resolve('better-sqlite3'); } catch {
  console.log('⚠ пропущено: серверу нужны ws и better-sqlite3 — установите их командой «npm i ws better-sqlite3»');
  process.exit(0);
}

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
(globalThis as any).window = { setTimeout: (f: any, t: number) => setTimeout(f, t), clearTimeout: (h: any) => clearTimeout(h) };
(globalThis as any).WebSocket = WS;

import { NetClient } from '../src/game/net';

const fails: string[] = [];
const ok = (c: boolean, w: string) => { console.log(`${c ? '✓' : '✗'} ${w}`); if (!c) fails.push(w); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PORT = 3100 + Math.floor(Math.random() * 400);

/** сервер лежит в репозитории с "type": "module", поэтому запускаем его копию рядом с CommonJS-манифестом */
function startServer(): Promise<ChildProcess> {
  const dir = mkdtempSync(join(tmpdir(), 'lg-e2e-'));
  copyFileSync(resolve('server/server.js'), join(dir, 'server.js'));
  writeFileSync(join(dir, 'package.json'), '{"type":"commonjs"}');
  if (!existsSync(join(dir, 'node_modules'))) symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT), DB_FILE: join(dir, 'game.db'), ADMIN_TOKEN: 'e2e', GH_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('сервер не поднялся за 15 секунд')), 15000);
    srv.stdout?.on('data', (b) => { if (String(b).includes('server on')) { clearTimeout(timer); res(srv); } });
    srv.on('exit', (code) => { clearTimeout(timer); rej(new Error('сервер завершился с кодом ' + code)); });
  });
}

async function main() {
  const srv = await startServer();
  const url = `ws://127.0.0.1:${PORT}`;
  try {
    const A = new NetClient('Иван', 'm', url, 'parol123');
    const B = new NetClient('Пётр', 'f', url, 'parol456');
    let aIn = false, bIn = false;
    A.onLogin = () => { aIn = true; }; B.onLogin = () => { bIn = true; };
    A.connect(); B.connect();
    await wait(1500);
    ok(aIn && bIn, 'оба клиента вошли на сервер');
    ok(A.id !== null && B.id !== null && A.id !== B.id, `сервер выдал разные id (${A.id} и ${B.id})`);

    A.sendMove(100, 200, 1); B.sendMove(105, 205, 2);
    await wait(1500);
    ok([...A.players.values()].some((p) => p.id === B.id), 'Иван видит Петра в списке онлайна');
    ok([...B.players.values()].some((p) => p.id === A.id), 'Пётр видит Ивана в списке онлайна');

    // состояние персонажа: поза, машина, здоровье — по нему рисуют чужого игрока
    A.sendState({ x: 100, z: 200, y: 0, a: 1, s: 3.2, v: 'lada', c: '#f00', seat: 0, i: '', hp: 87, p: 'run', k: 0.5 });
    await wait(900);
    const st = B.players.get(A.id as number)?.st as any;
    ok(!!st, 'состояние Ивана доехало до Петра');
    ok(st?.v === 'lada' && st?.hp === 87 && st?.p === 'run', `в состоянии машина, здоровье и поза (${st?.v}, ${st?.hp}, ${st?.p})`);

    // игровые события: обмен и бой
    let gotB: any = null; let fromB = -1;
    B.onEvent = (from, ev) => { fromB = from; gotB = ev; };
    A.sendEvent({ e: 'trade', t: B.id as number, op: 'req' });
    await wait(700);
    ok(gotB?.e === 'trade' && gotB?.op === 'req' && fromB === A.id, 'предложение обмена дошло от Ивана к Петру');

    let gotA: any = null;
    A.onEvent = (_f, ev) => { gotA = ev; };
    B.sendEvent({ e: 'trade', t: A.id as number, op: 'offer', items: [['water', 2]], money: 50 });
    await wait(700);
    ok(gotA?.op === 'offer' && gotA?.money === 50 && gotA?.items?.[0]?.[0] === 'water', 'встречное предложение с предметами и деньгами дошло обратно');

    B.sendEvent({ e: 'hit', t: A.id as number, d: 17, k: 'fist', hx: 1, hz: 2 });
    await wait(700);
    ok(gotA?.e === 'hit' && gotA?.d === 17, 'удар в драке доставлен сопернику');

    // переводы денег
    let gift: any = null;
    B.onGift = (_f, d) => { gift = d; };
    A.sendGift('money', 250, 1, 'Пётр');
    await wait(700);
    ok(gift?.k === 'money' && gift?.v === 250, 'перевод денег дошёл до адресата');

    // общий чат
    B.sendChat('привет всем');
    await wait(700);
    ok(A.chat.some((c) => c.text.includes('привет всем')), 'обычное сообщение видно в общем чате');
    ok(!A.chat.some((c) => c.text.includes('§LG')), 'служебные посылки в чат не попали');

    A.close(); B.close();
  } finally {
    srv.kill('SIGKILL');
  }
  console.log(fails.length ? `\n✗ провалено: ${fails.length}` : '\n✓ сквозная проверка на настоящем сервере пройдена');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.log('✗ ' + (e?.message || e)); process.exit(1); });
