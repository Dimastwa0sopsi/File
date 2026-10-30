// Локальные аккаунты игроков: регистрация и вход без сервера (localStorage).
// Пароль хранится только в виде необратимого хэша с индивидуальной солью.
const ACC_KEY = 'losgorod_accounts';
const CUR_KEY = 'losgorod_account';
/** сейв соло-игры и владелец текущего слота */
const SAVE_KEY = 'losgorod_save';
const OWNER_KEY = 'losgorod_save_owner';
const accSaveKey = (login: string) => `losgorod_save_acc_${login.toLowerCase()}`;

export interface Account {
  login: string;
  /** игровой ник (по умолчанию совпадает с логином) */
  nick: string;
  gender: 'm' | 'f';
  salt: string;
  hash: string;
  created: number;
  last: number;
  plays: number;
}

export type AuthResult = { ok: true; acc: Account } | { ok: false; error: string };

/* ---------- хэширование ---------- */
/** FNV-1a 32 бита — быстрый детерминированный хэш */
function fnv(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
/** многократное перемешивание: подобрать пароль по хэшу без перебора нельзя */
export function hashPass(pass: string, salt: string): string {
  let h = fnv(`${salt}:${pass}:losgorod`);
  for (let i = 0; i < 12; i++) h = fnv(`${h.toString(16)}|${salt}|${i}|${pass.length}`);
  return h.toString(16).padStart(8, '0');
}
function makeSalt(): string {
  try {
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return a[0].toString(36) + a[1].toString(36);
  } catch {
    return Math.random().toString(36).slice(2, 12);
  }
}

/* ---------- хранилище ---------- */
function read(): Record<string, Account> {
  try {
    const raw = localStorage.getItem(ACC_KEY);
    const o = raw ? (JSON.parse(raw) as Record<string, Account>) : {};
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}
function write(all: Record<string, Account>) {
  try { localStorage.setItem(ACC_KEY, JSON.stringify(all)); } catch { /* приватный режим / квота */ }
}
const keyOf = (login: string) => login.trim().toLowerCase();

export function listAccounts(): Account[] {
  return Object.values(read()).sort((a, b) => b.last - a.last);
}

export function currentAccount(): Account | null {
  try {
    const k = localStorage.getItem(CUR_KEY);
    if (!k) return null;
    return read()[k] ?? null;
  } catch {
    return null;
  }
}

export function logout() {
  try { localStorage.removeItem(CUR_KEY); } catch { /* */ }
}

/** сохранить изменения текущего аккаунта (пол, ник, статистика) */
export function updateAccount(login: string, patch: Partial<Pick<Account, 'nick' | 'gender' | 'last' | 'plays'>>) {
  const all = read();
  const k = keyOf(login);
  const acc = all[k];
  if (!acc) return;
  all[k] = { ...acc, ...patch };
  write(all);
}
function setCurrent(acc: Account) {
  const all = read();
  all[keyOf(acc.login)] = acc;
  write(all);
  try { localStorage.setItem(CUR_KEY, keyOf(acc.login)); } catch { /* */ }
}

/* ---------- проверки ---------- */
export const LOGIN_RE = /^[\p{L}\p{N}_.-]{3,16}$/u;
export function checkLogin(login: string): string | null {
  const s = login.trim();
  if (s.length < 3) return 'Логин — минимум 3 символа';
  if (s.length > 16) return 'Логин — максимум 16 символов';
  if (!LOGIN_RE.test(s)) return 'В логине можно буквы, цифры, . _ -';
  return null;
}
export function checkPass(pass: string): string | null {
  if (pass.length < 4) return 'Пароль — минимум 4 символа';
  if (pass.length > 32) return 'Пароль — максимум 32 символа';
  return null;
}

/* ---------- регистрация / вход ---------- */
export function register(login: string, pass: string, pass2: string, gender: 'm' | 'f'): AuthResult {
  const err = checkLogin(login) ?? checkPass(pass);
  if (err) return { ok: false, error: err };
  if (pass !== pass2) return { ok: false, error: 'Пароли не совпадают' };
  const all = read();
  const k = keyOf(login);
  if (all[k]) return { ok: false, error: 'Такой логин уже занят — войдите или выберите другой' };
  const salt = makeSalt();
  const acc: Account = {
    login: login.trim(), nick: login.trim().slice(0, 16), gender,
    salt, hash: hashPass(pass, salt), created: Date.now(), last: Date.now(), plays: 0,
  };
  all[k] = acc;
  write(all);
  setCurrent(acc);
  return { ok: true, acc };
}

export function login(loginStr: string, pass: string): AuthResult {
  const k = keyOf(loginStr);
  const acc = read()[k];
  if (!acc) return { ok: false, error: 'Аккаунт не найден. Нажмите «Регистрация»' };
  if (hashPass(pass, acc.salt) !== acc.hash) return { ok: false, error: 'Неверный пароль' };
  const next: Account = { ...acc, last: Date.now(), plays: (acc.plays ?? 0) + 1 };
  setCurrent(next);
  return { ok: true, acc: next };
}

/** быстрый вход: аккаунт уже сохранён на устройстве, пароль не спрашиваем */
export function quickLogin(loginStr: string): AuthResult {
  const all = read();
  const acc = all[keyOf(loginStr)];
  if (!acc) return { ok: false, error: 'Аккаунт не найден на этом устройстве' };
  const next: Account = { ...acc, last: Date.now(), plays: (acc.plays ?? 0) + 1 };
  setCurrent(next);
  return { ok: true, acc: next };
}

/** удалить аккаунт с устройства вместе с его сохранением прогресса */
export function removeAccount(loginStr: string) {
  const k = keyOf(loginStr);
  const all = read();
  if (!all[k]) return;
  delete all[k];
  write(all);
  try {
    localStorage.removeItem(accSaveKey(k));
    if (localStorage.getItem(CUR_KEY) === k) localStorage.removeItem(CUR_KEY);
    if (localStorage.getItem(OWNER_KEY) === k) {
      localStorage.removeItem(OWNER_KEY);
      localStorage.removeItem(SAVE_KEY);
    }
  } catch { /* приватный режим */ }
}

/** сколько всего аккаунтов создано — для подсказки на экране входа */
export function accountsCount(): number {
  return Object.keys(read()).length;
}

/* ---------- сохранения по аккаунтам ---------- */
/** переключить активный слот сохранения на аккаунт: у каждого логина свой прогресс */
export function activateAccountSave(login: string) {
  try {
    const owner = localStorage.getItem(OWNER_KEY);
    const cur = localStorage.getItem(SAVE_KEY);
    // первый вход в браузере: текущий прогресс гостя становится прогрессом аккаунта
    if (!owner) {
      if (cur) localStorage.setItem(accSaveKey(login), cur);
      localStorage.setItem(OWNER_KEY, login);
      return;
    }
    if (owner !== login && cur) localStorage.setItem(accSaveKey(owner), cur); // прогресс прошлого аккаунта
    if (owner === login) return;
    const mine = localStorage.getItem(accSaveKey(login));
    if (mine) localStorage.setItem(SAVE_KEY, mine);
    else localStorage.removeItem(SAVE_KEY);
    localStorage.setItem(OWNER_KEY, login);
  } catch { /* приватный режим */ }
}
/** записать текущий прогресс в слот аккаунта */
export function flushAccountSave(login: string) {
  try {
    const cur = localStorage.getItem(SAVE_KEY);
    if (!cur) return;
    localStorage.setItem(accSaveKey(login), cur);
    localStorage.setItem(OWNER_KEY, login);
  } catch { /* */ }
}
