// Права администратора: серверные админы + локальный промокод.
// Ник администратора во всём интерфейсе подсвечивается красным.
export const ADMIN_COLOR = '#ef4444';

/** ники, которые сервер выдаёт как админские (сравнение без регистра) */
export const ADMIN_NICKS = ['kitty_kittys'];

/** выданные вручную права (промокод «выдать админку» или команда /grantadmin) */
const GRANTS_KEY = 'losgorod_admins';
let grants: string[] | null = null;

function loadGrants(): string[] {
  if (grants) return grants;
  try {
    const raw = JSON.parse(localStorage.getItem(GRANTS_KEY) ?? '[]');
    grants = Array.isArray(raw) ? raw.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [];
  } catch { grants = []; }
  return grants;
}

function saveGrants() {
  try { localStorage.setItem(GRANTS_KEY, JSON.stringify(loadGrants())); } catch { /* приватный режим */ }
}

/** все ники с выданными правами (без серверных) */
export function grantedAdmins(): string[] { return [...loadGrants()]; }

/** выдать права админа нику (локально); false — уже есть */
export function grantAdminNick(nick: string): boolean {
  const n = nick.trim().toLowerCase();
  if (!n) return false;
  if (isAdminNick(n)) return false;
  loadGrants().push(n);
  saveGrants();
  return true;
}

/** снять выданные права; false — нечего снимать */
export function revokeAdminNick(nick: string): boolean {
  const n = nick.trim().toLowerCase();
  const list = loadGrants();
  const i = list.indexOf(n);
  if (i < 0) return false;
  list.splice(i, 1);
  saveGrants();
  return true;
}

export function isAdminNick(nick?: string | null): boolean {
  if (!nick) return false;
  const n = nick.trim().toLowerCase();
  return ADMIN_NICKS.includes(n) || loadGrants().includes(n);
}

/** цвет ника: красный для админа, иначе исходный */
export function nameColor(nick: string | null | undefined, fallback: string, isSelfAdmin = false): string {
  return isSelfAdmin || isAdminNick(nick) ? ADMIN_COLOR : fallback;
}
