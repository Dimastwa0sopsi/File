// Права администратора: серверные админы + локальный промокод.
// Ник администратора во всём интерфейсе подсвечивается красным.
export const ADMIN_COLOR = '#ef4444';

/** ники, которые сервер выдаёт как админские (сравнение без регистра) */
export const ADMIN_NICKS = ['kitty_kittys'];

export function isAdminNick(nick?: string | null): boolean {
  if (!nick) return false;
  return ADMIN_NICKS.includes(nick.trim().toLowerCase());
}

/** цвет ника: красный для админа, иначе исходный */
export function nameColor(nick: string | null | undefined, fallback: string, isSelfAdmin = false): string {
  return isSelfAdmin || isAdminNick(nick) ? ADMIN_COLOR : fallback;
}
