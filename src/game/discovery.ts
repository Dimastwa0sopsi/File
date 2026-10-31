// Одна постоянная ссылка на игру.
//
// Игрок открывает https://dimastwa0sopsi.github.io/File/ и жмёт «Играть» —
// адрес сервера он нигде не вводит. Клиент сам находит живой сервер Colab:
//   1) ?srv=… в ссылке (для админа) — уже сохранён в браузере модулем net.ts;
//   2) server/live.json в репозитории, который сервер обновляет при старте
//      (Colab-панель или сам server.js при заданном GH_TOKEN);
//   3) последний удачный адрес из прошлой сессии;
//   4) встроенный ONLINE_URL.
// Каждый кандидат проверяется живым WebSocket-подключением, поэтому мёртвый
// туннель никогда не «залипает»: игра сама перейдёт на актуальный.
import { getServerUrl, normalizeServerUrl, probeServer, setServerUrl } from './net';

/** GitHub-репозиторий и файл с актуальным адресом сервера */
const REPO = 'Dimastwa0sopsi/File';
const BRANCH = 'main';
const LIVE_FILE = 'server/live.json';

/** зеркала: raw обновляется быстрее всех, остальные — страховка от блокировок */
export const LIVE_MIRRORS = [
  `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${LIVE_FILE}`,
  `https://cdn.statically.io/gh/${REPO}/${BRANCH}/${LIVE_FILE}`,
  `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/${LIVE_FILE}`,
];

const CACHE_KEY = 'losgorod_live_v1';
/** сколько верим опубликованному адресу, не проверяя GitHub заново */
const TTL = 5 * 60 * 1000;
/** таймаут на одно подключение при проверке кандидатов */
const PROBE = 3500;

interface LiveDoc { url?: string; ws?: string; updated?: number }

function readCache(): { url: string; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { url?: string; ts?: number };
    const url = normalizeServerUrl(o.url ?? '');
    if (!url || !o.ts) return null;
    return { url, ts: o.ts };
  } catch { return null; }
}
function writeCache(url: string) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ url, ts: Date.now() })); } catch { /* приватный режим */ }
}

/** забрать live.json с одного зеркала (без кэша браузера) */
async function fetchDoc(base: string): Promise<LiveDoc | null> {
  if (typeof fetch !== 'function') return null;
  const url = base + (base.includes('?') ? '&' : '?') + 't=' + Date.now();
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), PROBE) : 0;
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctrl?.signal });
    if (!r.ok) return null;
    const doc = (await r.json()) as LiveDoc;
    return doc && typeof doc === 'object' ? doc : null;
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
}

/** адреса из live.json, свежие первыми */
function docsToUrls(docs: (LiveDoc | null)[]): string[] {
  const rows = docs
    .filter((d): d is LiveDoc => !!d)
    .map((d) => ({ url: normalizeServerUrl(String(d.ws || d.url || '')), ts: Number(d.updated) || 0 }))
    .filter((x) => !!x.url)
    .sort((a, b) => b.ts - a.ts);
  return [...new Set(rows.map((r) => r.url))];
}

/** проверить адрес живым WS-подключением (короткий таймаут) */
async function alive(url: string): Promise<boolean> {
  try { await probeServer(url, PROBE); return true; } catch { return false; }
}

/**
 * Актуальный адрес сервера.
 * force — игнорировать кэш и спросить GitHub заново.
 * Возвращает рабочий wss://-адрес либо '' если ни один не ответил.
 */
export async function discoverServer(force = false): Promise<string> {
  const cached = readCache();
  if (!force && cached && Date.now() - cached.ts < TTL && (await alive(cached.url))) return cached.url;

  const docs = await Promise.all(LIVE_MIRRORS.map(fetchDoc));
  const candidates = [...docsToUrls(docs), normalizeServerUrl(getServerUrl())].filter(Boolean);
  for (const url of [...new Set(candidates)]) {
    if (!(await alive(url))) continue;
    writeCache(url); setServerUrl(url);
    return url;
  }
  return '';
}

/**
 * Адрес для входа в онлайн: сначала опубликованный, потом сохранённый.
 * Бросает ошибку, если живой сервер не найден — вызывающая сторона показывает
 * окно «Нет связи» с кнопкой «Повторить вход».
 */
export async function ensureServer(): Promise<string> {
  const url = await discoverServer();
  if (url) return url;
  const fallback = normalizeServerUrl(getServerUrl());
  if (fallback && (await alive(fallback))) return fallback;
  throw new Error('offline');
}

/** прогрев при запуске игры: не блокирует меню, просто заранее ищет сервер */
export function warmServer() {
  void discoverServer(false).catch(() => '');
}
