// Онлайн-режим: клиент WebSocket под протокол сервера
// Сервер: init {id, players}, players {players}, move {x,y} (хранится), chat {text} -> рассылка {id,name,text}.
// Расширенное состояние и игровые события передаются через chat с префиксами §LG (состояние) и §LGE (событие).
export const ONLINE_URL = 'wss://sandbank-economic-zeppelin.ngrok-free.dev';
const PREFIX = '§LG';
const EV = '§LGE';
const PEDS = '§LGN';
const ME = '§LGM';
const NEWS = '§LGS';

export interface RemoteState {
  x: number; y: number; z: number; a: number; s: number;
  v: string; c: string; seat: number;            // машина, цвет (если водитель)
  r?: number;                                     // id водителя, если едет пассажиром
  n?: string;                                     // ник
  i?: string;                                     // ключ интерьера ('' — улица)
  p?: string; k?: number; w?: number; pt?: number; // поза, фаза 0..1, оружие в руке, наклон прицела
  hp?: number;
  l?: [string, string, string, string, string, string, string, string, string]; // gender, skin, hair, hairColor, top, topColor, bottom, bottomColor, shoes
  lean?: number; wh?: number; lt?: number;
  cr?: number;                                    // присед
  lk?: number;                                    // машина заперта
  em?: number;                                    // время начала эмоции
  tx?: number;                                    // счётчик такси включён
  pr?: [string, number][];                        // недвижимость: [id "b:unit", заперто 0/1]
  ls?: Listing[];                                 // объявления на автобазаре
}
export interface Listing { slot: number; type: string; color: string; year: number; mil: number; cond: number; price: number; tun?: string }
export type NetEvent =
  | { e: 'shot'; o: [number, number, number]; p: [number, number, number]; i: string }
  | { e: 'hit'; t: number; d: number; k: 'fist' | 'gun'; hx: number; hz: number; heavy?: boolean }
  | { e: 'dead'; by: number }
  | { e: 'pedhit'; o: number; i: number; d: number; heavy?: boolean; gun?: boolean; fx: number; fz: number }
  | { e: 'pay'; t: number; amt: number; why: string }
  | { e: 'dm'; t: number; text: string; n: string }
  | { e: 'trade'; t: number; op: 'req' | 'acc' | 'dec' | 'cancel' | 'offer' | 'ready' | 'unready'; items?: [string, number][]; money?: number; h?: string; h2?: string }
  | { e: 'buyreq'; t: number; slot: number; price: number }
  | { e: 'sold'; t: number; slot: number; ok: boolean; car?: { type: string; color: string; year: number; mil: number; cond: number; tun?: string } };
export interface RemotePlayer { id: number; name: string; nick: string | null; color: string; x: number; y: number; st: RemoteState | null; stT: number; seenT: number }
export interface ChatMsg { name: string; text: string; color: string; t: number; me?: boolean; kind?: 'me' | 'news' | 'sys' | 'cmd' }
export type NetStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export class NetClient {
  ws: WebSocket | null = null;
  id: number | null = null;
  status: NetStatus = 'offline';
  players = new Map<number, RemotePlayer>();
  chat: ChatMsg[] = [];
  onChange: (() => void) | null = null;
  onEvent: ((from: number, ev: NetEvent) => void) | null = null;
  onPeds: ((from: number, list: number[][], vehs: (string | number)[][]) => void) | null = null;
  onNews: ((name: string, text: string) => void) | null = null;
  private want = false; private retry = 0; private retryTimer = 0;
  constructor(public nick: string, public url = ONLINE_URL) {}
  connect() { this.want = true; this.open(); }
  private open() {
    if (!this.want) return;
    this.status = this.retry ? 'reconnecting' : 'connecting';
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch { this.scheduleRetry(); return; }
    this.ws = ws;
    ws.onopen = () => { this.status = 'online'; this.retry = 0; this.sys('Подключено к серверу'); };
    ws.onmessage = (e) => { if (typeof e.data === 'string') this.handle(e.data); };
    ws.onerror = () => { /* обработка в onclose */ };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null; this.id = null;
      if (this.want) { this.status = 'reconnecting'; this.scheduleRetry(); } else this.status = 'offline';
    };
  }
  private scheduleRetry() {
    clearTimeout(this.retryTimer);
    this.retry++;
    if (this.retry === 1) this.sys('Соединение потеряно — переподключение…');
    this.retryTimer = window.setTimeout(() => this.open(), Math.min(15000, 1500 * this.retry));
  }
  displayName(id: number) { const p = this.players.get(id); return p ? p.nick ?? p.name : 'Игрок' + id; }
  private handle(raw: string) {
    let m: { type?: string; id?: number; players?: Record<string, { x: number; y: number; color?: string; name?: string }>; text?: string; name?: string };
    try { m = JSON.parse(raw); } catch { return; }
    const now = performance.now();
    if (m.type === 'init' && typeof m.id === 'number') { this.id = m.id; this.players.clear(); }
    if ((m.type === 'init' || m.type === 'players') && m.players) {
      const seen = new Set<number>();
      for (const k in m.players) {
        const id = Number(k); const p = m.players[k]; if (!isFinite(id)) continue;
        seen.add(id);
        const ex = this.players.get(id);
        const x = Number(p.x), y = Number(p.y);
        if (ex) { if (isFinite(x)) ex.x = x; if (isFinite(y)) ex.y = y; ex.name = p.name ?? ex.name; ex.color = p.color ?? ex.color; ex.seenT = now; }
        else this.players.set(id, { id, name: p.name ?? 'Игрок' + id, nick: id === this.id ? this.nick : null, color: p.color ?? '#60a5fa', x: isFinite(x) ? x : 0, y: isFinite(y) ? y : 0, st: null, stT: 0, seenT: now });
      }
      for (const id of [...this.players.keys()]) if (!seen.has(id)) { const p = this.players.get(id)!; this.players.delete(id); if (id !== this.id) this.sys(`${p.nick ?? p.name} вышел`); }
      this.onChange?.();
    }
    if (m.type === 'chat' && typeof m.text === 'string') {
      const id = Number(m.id);
      if (m.text.startsWith(PEDS)) {
        if (id === this.id) return;
        try { const d = JSON.parse(m.text.slice(PEDS.length)) as { p: number[][]; v?: (string | number)[][] }; if (Array.isArray(d.p)) this.onPeds?.(id, d.p, Array.isArray(d.v) ? d.v : []); } catch { /* */ }
      } else if (m.text.startsWith(EV)) {
        if (id === this.id) return;
        try { const ev = JSON.parse(m.text.slice(EV.length)) as NetEvent; if (ev && typeof ev.e === 'string') this.onEvent?.(id, ev); } catch { /* */ }
      } else if (m.text.startsWith(ME) || m.text.startsWith(NEWS)) {
        const p = this.players.get(id); const news = m.text.startsWith(NEWS);
        const nm = p?.nick ?? m.name ?? '?'; const txt = m.text.slice(ME.length).slice(0, 220);
        this.chat.push({ name: nm, text: txt, color: news ? '#facc15' : '#c084fc', t: Date.now(), me: id === this.id, kind: news ? 'news' : 'me' });
        if (this.chat.length > 80) this.chat.shift();
        if (news && id !== this.id) this.onNews?.(nm, txt);
        this.onChange?.();
      } else if (m.text.startsWith(PREFIX)) {
        try {
          const st = JSON.parse(m.text.slice(PREFIX.length)) as RemoteState;
          const p = this.players.get(id);
          if (p && isFinite(st.x) && isFinite(st.z)) {
            if (st.l === undefined && p.st?.l) st.l = p.st.l;
            if (st.n === undefined && p.st?.n) st.n = p.st.n;
            if (st.pr === undefined && p.st?.pr) st.pr = p.st.pr;
            if (st.ls === undefined && p.st?.ls) st.ls = p.st.ls;
            if (st.n) { const nk = String(st.n).slice(0, 16); if (p.nick !== nk) { if (!p.nick && id !== this.id) this.sys(`${nk} в игре`); p.nick = nk; } }
            p.st = st; p.stT = now;
          }
        } catch { /* битое сообщение */ }
      } else {
        const p = this.players.get(id);
        this.chat.push({ name: p?.nick ?? m.name ?? '?', text: m.text.slice(0, 200), color: p?.color ?? '#fff', t: Date.now(), me: id === this.id });
        if (this.chat.length > 60) this.chat.shift();
        this.onChange?.();
      }
    }
  }
  sys(text: string) { this.chat.push({ name: 'Сервер', text, color: '#fbbf24', t: Date.now(), kind: 'sys' }); if (this.chat.length > 60) this.chat.shift(); }
  private send(o: unknown) { if (this.ws && this.ws.readyState === 1) { try { this.ws.send(JSON.stringify(o)); } catch { /* */ } } }
  sendMove(x: number, z: number) { this.send({ type: 'move', x: Math.round(x * 100) / 100, y: Math.round(z * 100) / 100 }); }
  sendState(st: RemoteState) { this.send({ type: 'chat', text: PREFIX + JSON.stringify(st) }); }
  sendMe(text: string) { this.send({ type: 'chat', text: ME + text.slice(0, 200) }); }
  sendNews(text: string) { this.send({ type: 'chat', text: NEWS + text.slice(0, 200) }); }
  findByNick(nick: string) { const n = nick.trim().toLowerCase(); return [...this.players.values()].find((p) => p.id !== this.id && ((p.nick ?? '').toLowerCase() === n || p.name.toLowerCase() === n)) ?? null; }
  sendPeds(list: number[][], vehs: (string | number)[][] = []) { this.send({ type: 'chat', text: PEDS + JSON.stringify({ p: list, v: vehs }) }); }
  sendEvent(ev: NetEvent) { this.send({ type: 'chat', text: EV + JSON.stringify(ev) }); }
  sendChat(text: string) { const t = text.trim().slice(0, 200); if (!t || t.startsWith(PREFIX)) return; this.send({ type: 'chat', text: t }); }
  others() { return [...this.players.values()].filter((p) => p.id !== this.id); }
  close() {
    this.want = false; clearTimeout(this.retryTimer);
    const ws = this.ws; this.ws = null; this.id = null; this.status = 'offline';
    try { ws?.close(); } catch { /* */ }
    this.players.clear();
  }
}
