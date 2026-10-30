// Поддержка: жалобы отправляются в Telegram-бота всем, кто с ним общался.
// Telegram не даёт боту список подписчиков, поэтому:
//  1) chat_id собираются из getUpdates (сообщения /start, добавление в группы и т.п.);
//  2) накопленный список хранится постоянно в скрытом описании бота (language_code = 'yo'),
//     чтобы получатели не терялись через 24 часа, когда Telegram удаляет апдейты;
//  3) дополнительно кэшируется в localStorage.
const TOKEN = '9242015959:AAFFaPKr7ZcgK4CgegRf-9Ii_AnPo8CuhzE';
const API = `https://api.telegram.org/bot${TOKEN}`;
export const SUPPORT_BOT = '@fojgfdhgudfdgbot';
const REG_LANG = 'yo';
const REG_PREFIX = 'LG_IDS:';
const LS_KEY = 'losgorod_tg_ids';

async function call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${API}/${method}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json() as { ok: boolean; result: T; description?: string };
  if (!j.ok) throw new Error(j.description ?? 'Ошибка Telegram');
  return j.result;
}
interface Upd { message?: { chat: { id: number } }; edited_message?: { chat: { id: number } }; my_chat_member?: { chat: { id: number }; new_chat_member?: { status: string } }; channel_post?: { chat: { id: number } }; callback_query?: { message?: { chat: { id: number } } } }

export async function collectRecipients(): Promise<number[]> {
  const ids = new Set<number>();
  try { for (const v of JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as number[]) if (Number.isFinite(v)) ids.add(v); } catch { /* */ }
  let registry = '';
  try { registry = (await call<{ description: string }>(`getMyDescription?language_code=${REG_LANG}`)).description ?? ''; } catch { /* */ }
  if (registry.startsWith(REG_PREFIX)) for (const p of registry.slice(REG_PREFIX.length).split(',')) { const n = Number(p); if (p && Number.isFinite(n)) ids.add(n); }
  const removed = new Set<number>();
  try {
    const ups = await call<Upd[]>('getUpdates?limit=100&timeout=0');
    for (const u of ups) {
      const c = u.message?.chat ?? u.edited_message?.chat ?? u.channel_post?.chat ?? u.callback_query?.message?.chat ?? u.my_chat_member?.chat;
      if (!c) continue;
      const st = u.my_chat_member?.new_chat_member?.status;
      if (st === 'kicked' || st === 'left') { removed.add(c.id); ids.delete(c.id); } else if (!removed.has(c.id)) ids.add(c.id);
    }
  } catch { /* вебхук или сеть */ }
  const list = [...ids];
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* */ }
  const reg = REG_PREFIX + list.join(',');
  if (reg !== registry && reg.length <= 512) { try { await call('setMyDescription', { description: reg, language_code: REG_LANG }); } catch { /* */ } }
  return list;
}

export interface Ticket { category: string; text: string; nick: string; online: boolean; place: string; money: number; contact?: string }
export async function sendTicket(t: Ticket): Promise<{ sent: number; failed: number }> {
  const recipients = await collectRecipients();
  if (!recipients.length) throw new Error(`Нет получателей: никто ещё не написал боту ${SUPPORT_BOT}. Откройте бота в Telegram и нажмите «Старт», затем повторите.`);
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
  const msg = [
    '🆘 <b>Обращение в поддержку «Лос-Город»</b>',
    `📂 Тема: <b>${esc(t.category)}</b>`,
    `👤 Игрок: ${esc(t.nick || 'без ника')} (${t.online ? 'онлайн' : 'одиночная игра'})`,
    t.contact ? `📨 Связь: ${esc(t.contact)}` : '',
    `📍 Место: ${esc(t.place)} · 💵 $${Math.round(t.money).toLocaleString('ru')}`,
    `🕒 ${new Date().toLocaleString('ru')}`,
    '',
    `📝 ${esc(t.text)}`,
  ].filter((x) => x !== '').join('\n');
  let sent = 0, failed = 0;
  for (const id of recipients) {
    try { await call('sendMessage', { chat_id: id, text: msg.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }); sent++; }
    catch { failed++; }
  }
  if (!sent) throw new Error('Не удалось доставить сообщение ни одному получателю');
  return { sent, failed };
}
