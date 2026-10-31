// Сервер «Лос-Города»: WebSocket + SQLite (better-sqlite3), база лежит на Google Drive.
// Протокол игры: login / login_success / move / players_list / chat / error, плюс номера машин.
// Управление — не в игре, а через HTTP-панель из ячейки Colab (/admin): деньги, бан, кик, телепорт.
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(9).toString('hex');
const db = new Database(process.env.DB_FILE || 'game.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    gender TEXT NOT NULL DEFAULT 'm',
    money INTEGER NOT NULL DEFAULT 20000,
    car_id TEXT NOT NULL DEFAULT 'lada',
    car_number TEXT NOT NULL DEFAULT '',
    house_id TEXT NOT NULL DEFAULT '',
    pos_x REAL NOT NULL DEFAULT 516,
    pos_z REAL NOT NULL DEFAULT 491.5,
    pos_rot REAL NOT NULL DEFAULT 0,
    is_admin INTEGER NOT NULL DEFAULT 0,
    token TEXT NOT NULL DEFAULT '',
    banned INTEGER NOT NULL DEFAULT 0,
    ban_reason TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS chat_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, text TEXT, t INTEGER
  );
`);

// миграция старых баз: добавляем колонку токена устройства
try { db.exec("ALTER TABLE players ADD COLUMN token TEXT NOT NULL DEFAULT ''"); } catch { /* колонка уже есть */ }
// новые поля для панели из 100 кнопок: предупреждения и запрет чата
try { db.exec('ALTER TABLE players ADD COLUMN warns INTEGER NOT NULL DEFAULT 0'); } catch { /* */ }
try { db.exec('ALTER TABLE players ADD COLUMN muted INTEGER NOT NULL DEFAULT 0'); } catch { /* */ }

const q = {
  byName: db.prepare('SELECT * FROM players WHERE name = ?'),
  create: db.prepare('INSERT INTO players (name, gender, updated_at) VALUES (?, ?, ?)'),
  move: db.prepare('UPDATE players SET pos_x = ?, pos_z = ?, pos_rot = ?, updated_at = ? WHERE id = ?'),
  log: db.prepare('INSERT INTO chat_log (name, text, t) VALUES (?, ?, ?)'),
  all: db.prepare(`SELECT id, name, gender, money, car_id, car_number, house_id,
    pos_x, pos_z, pos_rot, banned, ban_reason, updated_at FROM players ORDER BY updated_at DESC`),
  money: db.prepare('UPDATE players SET money = ? WHERE name = ?'),
  ban: db.prepare('UPDATE players SET banned = 1, ban_reason = ? WHERE name = ?'),
  unban: db.prepare('UPDATE players SET banned = 0, ban_reason = \'\' WHERE name = ?'),
  car: db.prepare('UPDATE players SET car_id = ?, car_number = ? WHERE name = ?'),
  pos: db.prepare('UPDATE players SET pos_x = ?, pos_z = ?, updated_at = ? WHERE name = ?'),
  del: db.prepare('DELETE FROM players WHERE name = ?'),
  token: db.prepare('UPDATE players SET token = ? WHERE name = ?'),
  clearChat: db.prepare('DELETE FROM chat_log'),
  chatTail: db.prepare("SELECT name, text, t FROM chat_log WHERE text NOT LIKE '§%' ORDER BY id DESC LIMIT 40"),
  warn: db.prepare('UPDATE players SET warns = ? WHERE name = ?'),
  muted: db.prepare('UPDATE players SET muted = ? WHERE name = ?'),
  house: db.prepare('UPDATE players SET house_id = ? WHERE name = ?'),
};

const active = new Map(); // id → { ws, row }
const send = (ws, obj) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };

function playersList() {
  return [...active.values()].map(({ row }) => ({
    id: row.id, name: row.name, gender: row.gender, money: row.money,
    x: row.pos_x, z: row.pos_z, rot: row.pos_rot,
    number: row.car_number || '',
  }));
}
const broadcast = (obj) => { const s = JSON.stringify(obj); wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(s); }); };
// players_list нужен для мини-карты и входа/выхода. Раньше он уходил всем на каждое move
// (15 раз в секунду на игрока) — теперь не чаще 4 раз в секунду, но важные изменения шлём сразу.
let playersT = 0; let playersTimer = null;
const pushPlayersNow = () => { playersT = Date.now(); broadcast({ type: 'players_list', players: playersList() }); };
const pushPlayers = () => {
  const now = Date.now();
  if (now - playersT > 250) { if (playersTimer) { clearTimeout(playersTimer); playersTimer = null; } pushPlayersNow(); return; }
  if (!playersTimer) playersTimer = setTimeout(() => { playersTimer = null; pushPlayersNow(); }, 250);
};
const onlineByName = (name) => [...active.values()].find(({ row }) => row.name.toLowerCase() === String(name).toLowerCase());

/* ================= HTTP: health + админ-панель для Colab ================= */
const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
};
const readBody = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
});

function adminState() {
  return {
    ok: true,
    online: [...active.values()].map(({ row }) => row.name),
    players: q.all.all(),
    chat: q.chatTail.all().reverse(),
    limits: { maxMoney: 2_147_483_647 },
    flags: { maintenance: MAINTENANCE, globalMute: GLOBAL_MUTE, frozen: [...FROZEN] },
    groups: ADMIN_GROUPS,
    actions: ADMIN_ACTIONS,
  };
}

// ===================== 100 КНОПОК УПРАВЛЕНИЯ СЕРВЕРОМ =====================
// Каталог отдаётся в /admin/actions, панель Colab строит по нему все кнопки.
const ADMIN_GROUPS = {
  money: '💵 Деньги', mod: '🛡 Модерация', tp: '🚀 Телепорт', car: '🚗 Транспорт',
  chat: '📢 Чат и объявления', player: '👤 Игрок', server: '🖥 Сервер', event: '🎉 События',
};
/** каталог: id, группа, подпись, нужен ли выбранный игрок, нужны ли координаты/текст */
const ADMIN_ACTIONS = [
  // ——— Деньги (14) ———
  { id: 'money_add_1k', g: 'money', t: '+1 000 $', need: true },
  { id: 'money_add_10k', g: 'money', t: '+10 000 $', need: true },
  { id: 'money_add_100k', g: 'money', t: '+100 000 $', need: true },
  { id: 'money_add_1m', g: 'money', t: '+1 000 000 $', need: true },
  { id: 'money_set_0', g: 'money', t: 'Обнулить баланс', need: true },
  { id: 'money_set_20k', g: 'money', t: 'Стартовые 20 000 $', need: true },
  { id: 'money_set_100k', g: 'money', t: 'Ровно 100 000 $', need: true },
  { id: 'money_set_1m', g: 'money', t: 'Ровно 1 000 000 $', need: true },
  { id: 'money_take_10pct', g: 'money', t: 'Налог −10 %', need: true },
  { id: 'money_all_add_10k', g: 'money', t: 'Всем онлайн +10 000 $' },
  { id: 'money_all_add_100k', g: 'money', t: 'Всем онлайн +100 000 $' },
  { id: 'money_all_reset', g: 'money', t: 'Всем онлайн по 20 000 $' },
  { id: 'money_top', g: 'money', t: '🏆 Топ-10 по деньгам' },
  { id: 'money_sum', g: 'money', t: '💰 Всего денег в игре' },
  // ——— Модерация (18) ———
  { id: 'ban', g: 'mod', t: '🚫 Забанить', need: true, confirm: true },
  { id: 'ban_silent', g: 'mod', t: '🔇 Бан без сообщения', need: true },
  { id: 'unban', g: 'mod', t: '✅ Разбанить', need: true },
  { id: 'unban_all', g: 'mod', t: '✅ Разбанить всех', confirm: true },
  { id: 'kick', g: 'mod', t: '👢 Кикнуть', need: true },
  { id: 'kick_all', g: 'mod', t: '👢 Кикнуть всех онлайн', confirm: true },
  { id: 'warn', g: 'mod', t: '⚠️ Предупреждение', need: true },
  { id: 'warns_show', g: 'mod', t: '📋 Показать предупреждения', need: true },
  { id: 'warns_clear', g: 'mod', t: '🧽 Снять предупреждения', need: true },
  { id: 'warns_clear_all', g: 'mod', t: '🧽 Снять у всех' },
  { id: 'mute', g: 'mod', t: '🤐 Запретить чат', need: true },
  { id: 'unmute', g: 'mod', t: '💬 Вернуть чат', need: true },
  { id: 'mute_all', g: 'mod', t: '🤐 Глобальный мут' },
  { id: 'unmute_all', g: 'mod', t: '💬 Снять глобальный мут' },
  { id: 'unbind', g: 'mod', t: '🔓 Сбросить привязку устройства', need: true },
  { id: 'unbind_all', g: 'mod', t: '🔓 Сбросить привязки у всех', confirm: true },
  { id: 'delete', g: 'mod', t: '🗑 Удалить аккаунт', need: true, confirm: true },
  { id: 'delete_offline', g: 'mod', t: '🗑 Удалить всех офлайн', confirm: true },
  // ——— Телепорт (14) ———
  { id: 'tp', g: 'tp', t: '🚀 Телепорт по X/Z', need: true, xy: true },
  { id: 'tp_spawn', g: 'tp', t: '🏠 На спавн', need: true },
  { id: 'tp_hospital', g: 'tp', t: '🏥 Больница', need: true },
  { id: 'tp_police', g: 'tp', t: '👮 Полиция', need: true },
  { id: 'tp_cityhall', g: 'tp', t: '🏛️ Мэрия', need: true },
  { id: 'tp_bank', g: 'tp', t: '🏦 Банк', need: true },
  { id: 'tp_mall', g: 'tp', t: '🏬 ТЦ «Орбита»', need: true },
  { id: 'tp_beach', g: 'tp', t: '🏖️ Пляж', need: true },
  { id: 'tp_farm', g: 'tp', t: '🌾 Ферма', need: true },
  { id: 'tp_village_s', g: 'tp', t: '🌲 Сосновка', need: true },
  { id: 'tp_village_k', g: 'tp', t: '🌲 Кленовка', need: true },
  { id: 'tp_village_o', g: 'tp', t: '🌲 Ольховка', need: true },
  { id: 'tp_player', g: 'tp', t: '👥 К другому игроку', need: true, target: true },
  { id: 'tp_center', g: 'tp', t: '🎯 Центр города', need: true },
  // ——— Транспорт (14) ———
  { id: 'car_set', g: 'car', t: '🚗 Выдать модель', need: true, car: true },
  { id: 'car_premium', g: 'car', t: '💎 Люкс-авто', need: true },
  { id: 'car_sport', g: 'car', t: '🏎️ Спорткар', need: true },
  { id: 'car_suv', g: 'car', t: '🚙 Внедорожник', need: true },
  { id: 'car_moto', g: 'car', t: '🏍️ Мотоцикл', need: true },
  { id: 'car_heli', g: 'car', t: '🚁 Вертолёт', need: true },
  { id: 'car_truck', g: 'car', t: '🚚 Фура', need: true },
  { id: 'car_bus', g: 'car', t: '🚌 Автобус', need: true },
  { id: 'car_scooter', g: 'car', t: '🛴 Самокат', need: true },
  { id: 'car_random', g: 'car', t: '🎲 Случайная модель', need: true },
  { id: 'car_stock', g: 'car', t: '↩️ Сбросить на «Норд-07»', need: true },
  { id: 'car_number', g: 'car', t: '🔢 Задать номер', need: true, number: true },
  { id: 'car_number_random', g: 'car', t: '🎰 Случайный номер', need: true },
  { id: 'car_number_clear', g: 'car', t: '🚫 Снять номер', need: true },
  // ——— Чат (10) ———
  { id: 'announce', g: 'chat', t: '📢 Объявление', text: true },
  { id: 'announce_alert', g: 'chat', t: '🔊 Важное объявление', text: true },
  { id: 'chat_clear', g: 'chat', t: '🧹 Очистить чат' },
  { id: 'chat_tail', g: 'chat', t: '📜 Последние сообщения' },
  { id: 'chat_count', g: 'chat', t: '🔢 Сколько сообщений' },
  { id: 'dm', g: 'chat', t: '✉️ Личное сообщение', need: true, text: true },
  { id: 'dm_all', g: 'chat', t: '📨 Всем онлайн лично', text: true },
  { id: 'say_admin', g: 'chat', t: '🎙️ Написать в чат от админа', text: true },
  { id: 'chat_export', g: 'chat', t: '💾 Выгрузить чат' },
  { id: 'chat_log_clear', g: 'chat', t: '🗑 Удалить историю чата', confirm: true },
  // ——— Игрок (12) ———
  { id: 'player_info', g: 'player', t: '📇 Карточка игрока', need: true },
  { id: 'player_heal', g: 'player', t: '❤️ Вылечить', need: true },
  { id: 'player_kill', g: 'player', t: '💀 Обнулить здоровье', need: true },
  { id: 'player_freeze', g: 'player', t: '🧊 Заморозить', need: true },
  { id: 'player_unfreeze', g: 'player', t: '🔥 Разморозить', need: true },
  { id: 'player_respawn', g: 'player', t: '♻️ Возродить на спавне', need: true },
  { id: 'player_gender_m', g: 'player', t: '👨 Пол: мужской', need: true },
  { id: 'player_gender_f', g: 'player', t: '👩 Пол: женский', need: true },
  { id: 'player_admin_on', g: 'player', t: '👑 Выдать админку', need: true, confirm: true },
  { id: 'player_admin_off', g: 'player', t: '⬇️ Снять админку', need: true },
  { id: 'player_house', g: 'player', t: '🏠 Выдать дом', need: true, house: true },
  { id: 'player_house_clear', g: 'player', t: '🏚️ Забрать дом', need: true },
  // ——— Сервер (10) ———
  { id: 'server_info', g: 'server', t: '📊 Состояние сервера' },
  { id: 'online_list', g: 'server', t: '🟢 Кто в сети' },
  { id: 'online_count', g: 'server', t: '👥 Сколько онлайн' },
  { id: 'db_size', g: 'server', t: '💾 Размер базы' },
  { id: 'backup', g: 'server', t: '🗄️ Сделать резервную копию' },
  { id: 'vacuum', g: 'server', t: '🧼 Оптимизировать базу' },
  { id: 'maintenance_on', g: 'server', t: '🚧 Техработы: закрыть вход', confirm: true },
  { id: 'maintenance_off', g: 'server', t: '🔓 Открыть вход' },
  { id: 'stats_money', g: 'server', t: '📈 Статистика денег' },
  { id: 'stats_cars', g: 'server', t: '🚘 Статистика машин' },
  // ——— События (8) ———
  { id: 'event_party', g: 'event', t: '🎉 Вечеринка у мэрии', confirm: true },
  { id: 'event_reward', g: 'event', t: '🎁 Награда всем +25 000 $', confirm: true },
  { id: 'event_heal_all', g: 'event', t: '❤️‍🩹 Вылечить всех онлайн' },
  { id: 'event_spawn_all', g: 'event', t: '🏠 Всех на спавн' },
  { id: 'event_race', g: 'event', t: '🏁 Объявить гонку' },
  { id: 'event_warning', g: 'event', t: '⚠️ Объявить техработы' },
  { id: 'event_ping', g: 'event', t: '📡 Проверка связи у всех' },
  { id: 'event_reset_world', g: 'event', t: '🌍 Мягкий рестарт мира', confirm: true },
];

/* ---------- рантайм-флаги (живут до перезапуска сервера) ---------- */
let MAINTENANCE = false;       // закрыт вход новым игрокам
let GLOBAL_MUTE = false;       // чат выключен для всех, кроме админов
const FROZEN = new Set();      // ники, которых заморозили

/* ---------- помощники ---------- */
const money = (v) => Math.max(0, Math.min(2147483647, Math.round(v)));
const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');
const nowMs = () => Date.now();
function rowOf(name) { return name ? q.byName.get(name) : null; }
function liveOf(name) { return name ? onlineByName(name) : null; }
function noPlayer() { return { ok: false, error: 'Сначала выберите игрока' }; }
function setMoney(name, value) {
  const v = money(value);
  q.money.run(v, name);
  const on = liveOf(name);
  if (on) { on.row.money = v; send(on.ws, { type: 'adm', act: 'money', money: v }); }
  pushPlayers();
  return v;
}
function addMoney(name, delta) {
  const row = rowOf(name); if (!row) return null;
  return setMoney(name, row.money + delta);
}
function admTo(name, act, extra = {}) {
  const on = liveOf(name);
  if (on) send(on.ws, { type: 'adm', act, ...extra });
  return !!on;
}
function admAll(act, extra = {}) { for (const { ws } of active.values()) send(ws, { type: 'adm', act, ...extra }); }
function tpTo(name, x, z) {
  const px = Math.round(Number(x)), pz = Math.round(Number(z));
  if (!isFinite(px) || !isFinite(pz)) return { ok: false, error: 'Нужны координаты X и Z' };
  q.pos.run(px, pz, nowMs(), name);
  const on = liveOf(name);
  if (on) { on.row.pos_x = px; on.row.pos_z = pz; send(on.ws, { type: 'adm', act: 'tp', x: px, z: pz }); pushPlayers(); }
  return { ok: true, message: `${name} → X ${px}, Z ${pz}` };
}
function banAction(a, notify) {
  if (!a.name) return noPlayer();
  const reason = String(a.reason || a.text || 'Нарушение правил').slice(0, 120);
  q.ban.run(reason, a.name);
  const on = liveOf(a.name);
  if (on) { if (notify) send(on.ws, { type: 'error', text: 'Вы забанены: ' + reason }); try { on.ws.close(); } catch { /* */ } active.delete(on.row.id); pushPlayers(); }
  return { ok: true, message: `${a.name} забанен (${reason})` };
}
function kickPlayer(name, text) {
  const on = liveOf(name); if (!on) return false;
  send(on.ws, { type: 'error', text });
  try { on.ws.close(); } catch { /* */ }
  active.delete(on.row.id);
  pushPlayers();
  return true;
}
function announce(text, important = false) {
  const t = String(text || '').slice(0, 240);
  if (!t) return { ok: false, error: 'Пустой текст объявления' };
  const line = (important ? '🔊 ' : '📢 ') + t;
  broadcast({ type: 'chat', name: 'СИСТЕМА', text: line });
  q.log.run('СИСТЕМА', line, nowMs());
  if (important) admAll('toast', { text: line });
  return { ok: true, message: 'Объявление отправлено' };
}
const TP_POINTS = {
  spawn: [516, 491.5], hospital: [690, 750], police: [390, 570], cityhall: [510, 510], bank: [570, 510],
  mall: [630, 570], beach: [690, -300], farm: [472, 1766], village_s: [420, -300], village_k: [600, 1745],
  village_o: [1170, 1560], center: [540, 540],
};
const CARS = {
  premium: 'ferrato', sport: 'virage', suv: 'taiga', moto: 'moto_sport', heli: 'heli',
  truck: 'semi_flat', bus: 'bus_city', scooter: 'scooter_x1',
};
function setCar(name, carId, number) {
  const id = String(carId || 'lada').slice(0, 32);
  const num = String(number ?? '').slice(0, 9);
  q.car.run(id, num, name);
  const on = liveOf(name);
  if (on) { on.row.car_id = id; on.row.car_number = num; pushPlayers(); }
  return { ok: true, message: `${name}: ${id}${num ? ' · ' + num : ''}` };
}
function randomPlate() {
  const L = 'АВЕКМНОРСТУХ', D = '0123456789';
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  return `${pick(L)}${pick(D)}${pick(D)}${pick(D)}${pick(L)}${pick(L)}`;
}
function onlineRows() { return [...active.values()].map(({ row }) => row); }

/* ---------- обработчики всех 100 кнопок ---------- */
const ADMIN_HANDLERS = {
  // Деньги
  money_add_1k: (a) => addMoneyAction(a, 1000),
  money_add_10k: (a) => addMoneyAction(a, 10000),
  money_add_100k: (a) => addMoneyAction(a, 100000),
  money_add_1m: (a) => addMoneyAction(a, 1000000),
  money_set_0: (a) => setMoneyAction(a, 0),
  money_set_20k: (a) => setMoneyAction(a, 20000),
  money_set_100k: (a) => setMoneyAction(a, 100000),
  money_set_1m: (a) => setMoneyAction(a, 1000000),
  money_take_10pct: (a) => {
    const row = rowOf(a.name); if (!row) return noPlayer();
    const v = setMoney(row.name, Math.floor(row.money * 0.9));
    return { ok: true, message: `${row.name}: налог снят, баланс $${fmt(v)}` };
  },
  money_all_add_10k: () => allMoney(10000, 'add'),
  money_all_add_100k: () => allMoney(100000, 'add'),
  money_all_reset: () => allMoney(20000, 'set'),
  money_top: () => {
    const rows = db.prepare('SELECT name, money FROM players ORDER BY money DESC LIMIT 10').all();
    return { ok: true, rows: rows.map((r) => `${r.name} — $${fmt(r.money)}`), message: 'Топ-10 по деньгам' };
  },
  money_sum: () => {
    const s = db.prepare('SELECT COALESCE(SUM(money),0) s, COUNT(*) c FROM players').get();
    return { ok: true, message: `Всего $${fmt(s.s)} на ${s.c} аккаунтах` };
  },
  // Модерация
  ban: (a) => banAction(a, true),
  ban_silent: (a) => banAction(a, false),
  unban: (a) => {
    if (!a.name) return noPlayer();
    q.unban.run(a.name);
    return { ok: true, message: `${a.name} разбанен` };
  },
  unban_all: () => { const n = db.prepare('UPDATE players SET banned = 0, ban_reason = \'\'').run().changes; return { ok: true, message: `Разбанено: ${n}` }; },
  kick: (a) => (a.name ? (kickPlayer(a.name, 'Вас отключил администратор') ? { ok: true, message: `${a.name} отключён` } : { ok: false, error: 'Игрок не в сети' }) : noPlayer()),
  kick_all: () => {
    let n = 0;
    for (const row of onlineRows()) if (kickPlayer(row.name, 'Сервер закрыт администратором на минуту')) n++;
    return { ok: true, message: `Отключено игроков: ${n}` };
  },
  warn: (a) => {
    const row = rowOf(a.name); if (!row) return noPlayer();
    const warns = (row.warns || 0) + 1;
    q.warn.run(warns, a.name); const on = liveOf(a.name); if (on) on.row.warns = warns;
    admTo(a.name, 'toast', { text: `⚠️ Предупреждение (${warns}) от администратора` });
    return { ok: true, message: `${a.name}: предупреждений ${warns}` };
  },
  warns_show: (a) => (rowOf(a.name) ? { ok: true, message: `${a.name}: предупреждений ${rowOf(a.name).warns || 0}` } : noPlayer()),
  warns_clear: (a) => { if (!a.name) return noPlayer(); q.warn.run(0, a.name); const on = liveOf(a.name); if (on) on.row.warns = 0; return { ok: true, message: `${a.name}: предупреждения сняты` }; },
  warns_clear_all: () => { const n = db.prepare('UPDATE players SET warns = 0').run().changes; return { ok: true, message: `Снято у ${n} игроков` }; },
  mute: (a) => { if (!a.name) return noPlayer(); q.muted.run(1, a.name); const on = liveOf(a.name); if (on) on.row.muted = 1; return { ok: true, message: `${a.name}: чат запрещён` }; },
  unmute: (a) => { if (!a.name) return noPlayer(); q.muted.run(0, a.name); const on = liveOf(a.name); if (on) on.row.muted = 0; return { ok: true, message: `${a.name}: чат разрешён` }; },
  mute_all: () => { GLOBAL_MUTE = true; return { ok: true, message: 'Глобальный мут включён (админы пишут)' }; },
  unmute_all: () => { GLOBAL_MUTE = false; return { ok: true, message: 'Глобальный мут выключен' }; },
  unbind: (a) => { if (!a.name) return noPlayer(); q.token.run('', a.name); return { ok: true, message: `${a.name}: привязка устройства сброшена` }; },
  unbind_all: () => { const n = db.prepare('UPDATE players SET token = \'\'').run().changes; return { ok: true, message: `Привязки сброшены у ${n}` }; },
  delete: (a) => {
    if (!a.name) return noPlayer();
    q.del.run(a.name);
    kickPlayer(a.name, 'Аккаунт удалён администратором');
    return { ok: true, message: `${a.name} удалён из базы` };
  },
  delete_offline: () => {
    const online = new Set(onlineRows().map((r) => r.name));
    let n = 0;
    for (const r of q.all.all()) if (!online.has(r.name)) { q.del.run(r.name); n++; }
    return { ok: true, message: `Удалено офлайн-аккаунтов: ${n}` };
  },
  // Телепорт
  tp: (a) => (a.name ? tpTo(a.name, a.x, a.z) : noPlayer()),
  tp_spawn: (a) => tpPoint(a, 'spawn'), tp_hospital: (a) => tpPoint(a, 'hospital'), tp_police: (a) => tpPoint(a, 'police'),
  tp_cityhall: (a) => tpPoint(a, 'cityhall'), tp_bank: (a) => tpPoint(a, 'bank'), tp_mall: (a) => tpPoint(a, 'mall'),
  tp_beach: (a) => tpPoint(a, 'beach'), tp_farm: (a) => tpPoint(a, 'farm'),
  tp_village_s: (a) => tpPoint(a, 'village_s'), tp_village_k: (a) => tpPoint(a, 'village_k'), tp_village_o: (a) => tpPoint(a, 'village_o'),
  tp_center: (a) => tpPoint(a, 'center'),
  tp_player: (a) => {
    if (!a.name || !a.target) return { ok: false, error: 'Нужны оба игрока: кого перемещаем и к кому' };
    const t = rowOf(a.target); if (!t) return { ok: false, error: 'Второй игрок не найден' };
    return tpTo(a.name, t.pos_x, t.pos_z);
  },
  // Транспорт
  car_set: (a) => (a.name ? setCar(a.name, a.carId, a.number) : noPlayer()),
  car_premium: (a) => (a.name ? setCar(a.name, CARS.premium) : noPlayer()),
  car_sport: (a) => (a.name ? setCar(a.name, CARS.sport) : noPlayer()),
  car_suv: (a) => (a.name ? setCar(a.name, CARS.suv) : noPlayer()),
  car_moto: (a) => (a.name ? setCar(a.name, CARS.moto) : noPlayer()),
  car_heli: (a) => (a.name ? setCar(a.name, CARS.heli) : noPlayer()),
  car_truck: (a) => (a.name ? setCar(a.name, CARS.truck) : noPlayer()),
  car_bus: (a) => (a.name ? setCar(a.name, CARS.bus) : noPlayer()),
  car_scooter: (a) => (a.name ? setCar(a.name, CARS.scooter) : noPlayer()),
  car_random: (a) => {
    if (!a.name) return noPlayer();
    const list = ['volga', 'lada', 'pchelka', 'kolibri', 'taiga', 'bizon', 'gazelka', 'virage', 'ferrato'];
    return setCar(a.name, list[Math.floor(Math.random() * list.length)]);
  },
  car_stock: (a) => (a.name ? setCar(a.name, 'lada', '') : noPlayer()),
  car_number: (a) => (a.name ? setCar(a.name, rowOf(a.name)?.car_id || 'lada', a.number) : noPlayer()),
  car_number_random: (a) => (a.name ? setCar(a.name, rowOf(a.name)?.car_id || 'lada', randomPlate()) : noPlayer()),
  car_number_clear: (a) => (a.name ? setCar(a.name, rowOf(a.name)?.car_id || 'lada', '') : noPlayer()),
  // Чат
  announce: (a) => announce(a.text, false),
  announce_alert: (a) => announce(a.text, true),
  chat_clear: () => { q.clearChat.run(); admAll('toast', { text: '🧹 Чат очищен администратором' }); return { ok: true, message: 'Чат очищен' }; },
  chat_tail: () => {
    const rows = q.chatTail.all().reverse();
    return { ok: true, rows: rows.map((r) => `${r.name}: ${r.text}`), message: `Последние ${rows.length} сообщений` };
  },
  chat_count: () => ({ ok: true, message: `Сообщений в базе: ${db.prepare('SELECT COUNT(*) c FROM chat_log').get().c}` }),
  dm: (a) => {
    if (!a.name) return noPlayer();
    const t = String(a.text || '').slice(0, 200); if (!t) return { ok: false, error: 'Пустое сообщение' };
    admTo(a.name, 'toast', { text: '✉️ Админ: ' + t });
    const on = liveOf(a.name); if (on) send(on.ws, { type: 'chat', name: 'АДМИН', text: t });
    return { ok: true, message: `Личное сообщение отправлено ${a.name}` };
  },
  dm_all: (a) => {
    const t = String(a.text || '').slice(0, 200); if (!t) return { ok: false, error: 'Пустое сообщение' };
    for (const { ws } of active.values()) { send(ws, { type: 'adm', act: 'toast', text: '📨 Админ: ' + t }); send(ws, { type: 'chat', name: 'АДМИН', text: t }); }
    return { ok: true, message: 'Сообщение отправлено всем в сети' };
  },
  say_admin: (a) => { const t = String(a.text || '').slice(0, 200); if (!t) return { ok: false, error: 'Пустой текст' }; broadcast({ type: 'chat', name: 'АДМИН', text: t }); q.log.run('АДМИН', t, nowMs()); return { ok: true, message: 'Сообщение в общий чат' }; },
  chat_export: () => {
    const rows = db.prepare('SELECT name, text, t FROM chat_log ORDER BY id DESC LIMIT 300').all().reverse();
    return { ok: true, rows: rows.map((r) => `[${new Date(r.t).toLocaleString('ru-RU')}] ${r.name}: ${r.text}`), message: 'Выгрузка: 300 последних сообщений' };
  },
  chat_log_clear: () => { const n = db.prepare('DELETE FROM chat_log').run().changes; return { ok: true, message: `Удалено сообщений: ${n}` }; },
  // Игрок
  player_info: (a) => {
    const p = rowOf(a.name); if (!p) return noPlayer();
    const on = !!liveOf(a.name);
    return {
      ok: true, message: `${p.name} · ${on ? 'в сети' : 'офлайн'}`,
      rows: [
        `Деньги: $${fmt(p.money)}`, `Машина: ${p.car_id} ${p.car_number || ''}`,
        `Дом: ${p.house_id || '—'}`, `Позиция: ${Math.round(p.pos_x)}; ${Math.round(p.pos_z)}`,
        `Пол: ${p.gender === 'f' ? 'женский' : 'мужской'}`, `Предупреждений: ${p.warns || 0}`,
        `Чат: ${p.muted ? 'запрещён' : 'разрешён'}`, `Бан: ${p.banned ? p.ban_reason : 'нет'}`,
        `Админ: ${p.is_admin ? 'да' : 'нет'}`,
      ],
    };
  },
  player_heal: (a) => (a.name ? (admTo(a.name, 'heal') ? { ok: true, message: `${a.name} вылечен` } : { ok: false, error: 'Игрок не в сети' }) : noPlayer()),
  player_kill: (a) => (a.name ? (admTo(a.name, 'kill') ? { ok: true, message: `${a.name}: здоровье обнулено` } : { ok: false, error: 'Игрок не в сети' }) : noPlayer()),
  player_freeze: (a) => { if (!a.name) return noPlayer(); FROZEN.add(a.name.toLowerCase()); admTo(a.name, 'freeze'); return { ok: true, message: `${a.name} заморожен` }; },
  player_unfreeze: (a) => { if (!a.name) return noPlayer(); FROZEN.delete(a.name.toLowerCase()); admTo(a.name, 'unfreeze'); return { ok: true, message: `${a.name} разморожен` }; },
  player_respawn: (a) => (a.name ? (admTo(a.name, 'respawn') ? { ok: true, message: `${a.name} возрождён` } : { ok: false, error: 'Игрок не в сети' }) : noPlayer()),
  player_gender_m: (a) => setGender(a, 'm'), player_gender_f: (a) => setGender(a, 'f'),
  player_admin_on: (a) => { if (!a.name) return noPlayer(); db.prepare('UPDATE players SET is_admin = 1 WHERE name = ?').run(a.name); return { ok: true, message: `${a.name}: админка выдана` }; },
  player_admin_off: (a) => { if (!a.name) return noPlayer(); db.prepare('UPDATE players SET is_admin = 0 WHERE name = ?').run(a.name); return { ok: true, message: `${a.name}: админка снята` }; },
  player_house: (a) => { if (!a.name) return noPlayer(); q.house.run(String(a.house || 'house_1').slice(0, 32), a.name); return { ok: true, message: `${a.name}: дом ${a.house || 'house_1'}` }; },
  player_house_clear: (a) => { if (!a.name) return noPlayer(); q.house.run('', a.name); return { ok: true, message: `${a.name}: дом забран` }; },
  // Сервер
  server_info: () => ({
    ok: true, message: 'Состояние сервера',
    rows: [
      `Аптайм: ${Math.floor(process.uptime() / 60)} мин`, `Онлайн: ${active.size}`,
      `Память: ${Math.round(process.memoryUsage().rss / 1048576)} МБ`,
      `Аккаунтов: ${db.prepare('SELECT COUNT(*) c FROM players').get().c}`,
      `Техработы: ${MAINTENANCE ? 'включены' : 'выключены'}`, `Глобальный мут: ${GLOBAL_MUTE ? 'да' : 'нет'}`,
      `Заморожено: ${FROZEN.size}`,
    ],
  }),
  online_list: () => ({ ok: true, rows: [...active.values()].map(({ row }) => `${row.name} · $${fmt(row.money)} · ${Math.round(row.pos_x)};${Math.round(row.pos_z)}`), message: 'Кто в сети' }),
  online_count: () => ({ ok: true, message: `Онлайн: ${active.size}` }),
  db_size: () => { const s = fs.existsSync(db.name) ? fs.statSync(db.name).size : 0; return { ok: true, message: `База ${db.name}: ${(s / 1048576).toFixed(2)} МБ` }; },
  backup: () => {
    const name = `${db.name}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    db.exec(`VACUUM INTO '${name.replace(/'/g, "''")}'`);
    return { ok: true, message: `Копия сделана: ${name}` };
  },
  vacuum: () => { db.exec('VACUUM'); return { ok: true, message: 'База оптимизирована' }; },
  maintenance_on: () => { MAINTENANCE = true; broadcast({ type: 'chat', name: 'СИСТЕМА', text: '🚧 Сервер на техобслуживании — новые входы закрыты' }); return { ok: true, message: 'Техработы включены' }; },
  maintenance_off: () => { MAINTENANCE = false; return { ok: true, message: 'Вход открыт' }; },
  stats_money: () => {
    const s = db.prepare('SELECT COALESCE(SUM(money),0) s, COALESCE(AVG(money),0) a, COUNT(*) c FROM players').get();
    return { ok: true, message: `Сумма $${fmt(s.s)} · средний $${fmt(Math.round(s.a))} · аккаунтов ${s.c}` };
  },
  stats_cars: () => {
    const rows = db.prepare('SELECT car_id, COUNT(*) c FROM players GROUP BY car_id ORDER BY c DESC LIMIT 10').all();
    return { ok: true, rows: rows.map((r) => `${r.car_id || '—'} — ${r.c}`), message: 'Самые частые машины' };
  },
  // События
  event_party: () => {
    for (const row of onlineRows()) tpTo(row.name, ...TP_POINTS.cityhall);
    announce('Вечеринка у мэрии — все приглашены!', true);
    return { ok: true, message: 'Все собраны у мэрии' };
  },
  event_reward: () => { allMoney(25000, 'add'); announce('Государственная награда: всем +25 000 $', true); return { ok: true, message: 'Награда выдана' }; },
  event_heal_all: () => { admAll('heal'); return { ok: true, message: 'Все вылечены' }; },
  event_spawn_all: () => { for (const row of onlineRows()) tpTo(row.name, ...TP_POINTS.spawn); return { ok: true, message: 'Все на спавне' }; },
  event_race: () => announce('Гонка по Главному шоссе: сбор у ТЦ «Орбита» через 5 минут', true),
  event_warning: () => announce('Через 10 минут — технические работы. Сохраните прогресс!', true),
  event_ping: () => { admAll('toast', { text: '📡 Проверка связи от администратора' }); return { ok: true, message: 'Проверка отправлена всем' }; },
  event_reset_world: () => {
    for (const row of onlineRows()) tpTo(row.name, ...TP_POINTS.spawn);
    announce('Мир обновлён: все возвращены на спавн', true);
    return { ok: true, message: 'Мягкий рестарт мира' };
  },
};

/* вспомогательные обёртки для обработчиков */
function addMoneyAction(a, delta) {
  if (!a.name) return noPlayer();
  const v = addMoney(a.name, delta);
  return v === null ? { ok: false, error: 'Игрок не найден' } : { ok: true, message: `${a.name}: +$${fmt(delta)} → $${fmt(v)}` };
}
function setMoneyAction(a, value) {
  if (!a.name) return noPlayer();
  if (!rowOf(a.name)) return { ok: false, error: 'Игрок не найден' };
  const v = setMoney(a.name, value);
  return { ok: true, message: `${a.name}: баланс $${fmt(v)}` };
}
function allMoney(value, mode) {
  let n = 0;
  for (const row of onlineRows()) { setMoney(row.name, mode === 'add' ? row.money + value : value); n++; }
  return { ok: true, message: `Игроков обработано: ${n}` };
}
function tpPoint(a, key) {
  if (!a.name) return noPlayer();
  const p = TP_POINTS[key]; if (!p) return { ok: false, error: 'Точка не найдена' };
  return tpTo(a.name, p[0], p[1]);
}
function setGender(a, g) {
  if (!a.name) return noPlayer();
  db.prepare('UPDATE players SET gender = ? WHERE name = ?').run(g, a.name);
  const on = liveOf(a.name); if (on) { on.row.gender = g; pushPlayers(); }
  return { ok: true, message: `${a.name}: пол ${g === 'f' ? 'женский' : 'мужской'}` };
}

/** выполнить действие панели по id */
function adminAction(a) {
  const id = String(a.action || '');
  const h = ADMIN_HANDLERS[id];
  if (!h) return { ok: false, error: 'Неизвестное действие: ' + id };
  const def = ADMIN_ACTIONS.find((x) => x.id === id);
  const name = String(a.name ?? '').trim();
  if (def && def.need && !name) return { ok: false, error: 'Сначала выберите игрока' };
  return h({ ...a, name });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Los-Gorod server OK'); return; }
  if (!url.pathname.startsWith('/admin')) { json(res, 404, { ok: false, error: 'not found' }); return; }
  const token = url.searchParams.get('token') || req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) { json(res, 403, { ok: false, error: 'Неверный токен админ-панели' }); return; }
  if (req.method === 'GET' && url.pathname === '/admin/state') { json(res, 200, adminState()); return; }
  if (req.method === 'GET' && url.pathname === '/admin/actions') { json(res, 200, { ok: true, groups: ADMIN_GROUPS, actions: ADMIN_ACTIONS }); return; }
  if (req.method === 'POST' && url.pathname === '/admin/action') {
    const body = await readBody(req);
    try { json(res, 200, adminAction(body || {})); }
    catch (e) { json(res, 200, { ok: false, error: String(e && e.message ? e.message : e) }); }
    return;
  }
  json(res, 404, { ok: false, error: 'not found' });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let me = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.type === 'login') {
      const name = String(m.name || '').trim().slice(0, 16);
      if (name.length < 2) return send(ws, { type: 'error', text: 'Ник должен быть от 2 до 16 символов' });
      const token = String(m.token || '').slice(0, 64);
      let row = q.byName.get(name);
      if (!row) { q.create.run(name, m.gender === 'f' ? 'f' : 'm', Date.now()); row = q.byName.get(name); }
      if (row.banned) return send(ws, { type: 'error', text: row.ban_reason || 'Вы забанены' });
      // техработы: пускаем только админов
      if (MAINTENANCE && !row.is_admin) return send(ws, { type: 'error', text: 'Сервер на техобслуживании — зайдите позже' });
      // ник привязан к устройству: чужой не может войти под этим ником и получить чужой прогресс
      if (!row.token) { if (token) { q.token.run(token, row.name); row.token = token; } }
      else if (token !== row.token) {
        return send(ws, { type: 'error', text: `Ник «${row.name}» уже закреплён за другим устройством. Возьмите другой ник или попросите администратора сбросить привязку.` });
      }
      // один игрок — одна сессия (раньше два клиента с одним ником ломали players_list)
      const busy = onlineByName(row.name);
      if (busy) return send(ws, { type: 'error', text: `Ник «${row.name}» уже в сети. Второй вход под тем же ником запрещён.` });
      // деньги — только серверные: локальный сейв клиента в онлайн не переносится
      me = row; active.set(row.id, { ws, row }); ws.playerId = row.id;
      send(ws, { type: 'login_success', token: row.token || '', caps: { state: 1, peds: 1, adm: 1, relay: 1 }, player: {
        id: row.id, name: row.name, gender: row.gender, money: row.money,
        x: row.pos_x, z: row.pos_z, rot: row.pos_rot, number: row.car_number, carNumber: row.car_number,
      } });
      pushPlayers();
      return;
    }

    if (!me) return;
    const row = me;

    if (m.type === 'move') {
      const x = Number(m.x), z = Number(m.z), rot = Number(m.rot) || 0;
      if (!isFinite(x) || !isFinite(z)) return;
      q.move.run(x, z, rot, Date.now(), row.id);
      row.pos_x = x; row.pos_z = z; row.pos_rot = rot;
      pushPlayers();
      return;
    }

    if (m.type === 'chat') {
      // §LG / §LGN / §LGE / §LGM / §LGS — служебный протокол игры: пересылаем как есть,
      // не режем до 200 символов и не пишем в историю чата.
      const raw = String(m.text || '');
      const proto = raw.charAt(0) === '§';
      const text = raw.slice(0, proto ? 20000 : 200);
      if (!text) return;
      if (proto) { broadcast({ type: 'chat', id: row.id, name: row.name, text }); return; }
      if (row.muted) { send(ws, { type: 'chat', name: 'СИСТЕМА', text: 'Чат вам запрещён администратором' }); return; }
      if (GLOBAL_MUTE && !row.is_admin) { send(ws, { type: 'chat', name: 'СИСТЕМА', text: 'Чат временно отключён администратором' }); return; }
      q.log.run(row.name, text, Date.now());
      broadcast({ type: 'chat', id: row.id, name: row.name, text });
      return;
    }

    if (m.type === 'save') {
      const money = Number(m.money);
      if (isFinite(money)) {
        const next = Math.max(0, Math.min(2147483647, Math.round(money)));
        if (next !== row.money) { q.money.run(next, row.name); row.money = next; }
      }
      return;
    }

    if (m.type === 'set_plate') {
      const num = String(m.number || '').slice(0, 9);
      q.car.run(String(m.carId || row.car_id || 'lada'), num, row.name);
      row.car_number = num; pushPlayers();
      send(ws, { type: 'chat', name: 'СИСТЕМА', text: `номер ${num} сохранён` });
    }
  });
  ws.on('close', () => { if (ws.playerId) { active.delete(ws.playerId); pushPlayers(); } });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Los-Gorod server on :${PORT}, db=${db.name}`);
  console.log(`Админ-панель — ячейка colab_admin.py в Colab · токен: ${ADMIN_TOKEN}`);
});
