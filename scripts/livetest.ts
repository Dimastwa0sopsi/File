// Проверка «одной постоянной ссылки»: клиент сам находит живой сервер.
// Гоняется в node со стаба­ми localStorage / fetch / WebSocket.
/* eslint-disable @typescript-eslint/no-explicit-any */
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};
(globalThis as any).window = { setTimeout: (f: any, t: number) => setTimeout(f, t), clearTimeout: (h: any) => clearTimeout(h) };

const DEAD = 'wss://dead.ngrok-free.dev';
const LIVE = 'wss://live.ngrok-free.dev';
let sockets: string[] = [];
class FakeWS {
  url: string; onopen: any; onerror: any; onclose: any; onmessage: any = null;
  constructor(url: string) {
    this.url = url; sockets.push(url);
    setTimeout(() => { if (url === LIVE) this.onopen?.(); else this.onerror?.({}); }, 5);
  }
  send() { /* */ }
  close() { this.onclose?.({}); }
  addEventListener() { /* */ }
  removeEventListener() { /* */ }
}
(globalThis as any).WebSocket = FakeWS;

// зеркала: первое недоступно, второе отдаёт старый адрес, третье — актуальный
const docs: Record<string, any> = {
  'raw.githubusercontent.com': { url: 'https://live.ngrok-free.dev', ws: LIVE, updated: 2000 },
  'cdn.statically.io': { url: 'https://dead.ngrok-free.dev', ws: DEAD, updated: 1000 },
};
(globalThis as any).fetch = async (url: string) => {
  const doc = Object.keys(docs).find((host) => url.includes(host));
  if (!doc) throw new Error('offline');
  return { ok: true, json: async () => docs[doc] };
};

async function main() {
  const { discoverServer, ensureServer, LIVE_MIRRORS } = await import('../src/game/discovery');
  let bad = 0;
  const ok = (cond: boolean, name: string) => { console.log((cond ? '✅ ' : '❌ ') + name); if (!cond) bad++; };

  ok(LIVE_MIRRORS.length === 3, 'три зеркала live.json');
  const url = await discoverServer();
  ok(url === LIVE, `discoverServer выбрал живой адрес (${url})`);
  ok(store.get('losgorod_server') === LIVE, 'адрес сохранён в localStorage');
  ok(!sockets.includes(DEAD), 'свежий живой адрес проверяется первым — до мёртвого дело не дошло');

  // второй вызов берёт кэш и не ходит в сеть заново
  sockets = [];
  const again = await discoverServer();
  ok(again === LIVE && sockets.length === 1, 'повторный вызов использует кэш (1 проверка)');

  // force — перечитать live.json (кэш игнорируется, но живой адрес по-прежнему первый)
  sockets = [];
  ok((await discoverServer(true)) === LIVE, 'force перечитывает live.json');

  // свежий адрес в live.json мёртвый → клиент сам уходит на предыдущий живой
  docs['raw.githubusercontent.com'] = { url: 'https://dead2.ngrok-free.dev', ws: 'wss://dead2.ngrok-free.dev', updated: 5000 };
  docs['cdn.statically.io'] = { url: 'https://live.ngrok-free.dev', ws: LIVE, updated: 500 };
  store.delete('losgorod_live_v1');
  store.delete('losgorod_server');
  sockets = [];
  const fallback = await discoverServer(true);
  ok(fallback === LIVE, `мёртвый свежий адрес пропущен, взят живой (${fallback})`);
  ok(sockets.length >= 2, 'оба кандидата проверены подключением');

  // сервер жив — ensureServer возвращает адрес
  ok((await ensureServer()) === LIVE, 'ensureServer вернул рабочий адрес');

  // всё умерло: live.json отдаёт мёртвый адрес, сохранённый тоже мёртвый
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({ ws: DEAD, updated: 3000 }) });
  store.set('losgorod_server', DEAD);
  store.delete('losgorod_live_v1');
  let threw = false;
  try { await ensureServer(); } catch { threw = true; }
  ok(threw, 'нет живого сервера — понятная ошибка (окно «Нет связи»)');

  console.log(bad ? `\n❌ провалов: ${bad}` : '\n✅ одна постоянная ссылка работает');
  process.exit(bad ? 1 : 0);
}
void main();
