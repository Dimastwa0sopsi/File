// Сервер «Лос-Города»: WebSocket + SQLite (better-sqlite3), база лежит на Google Drive.
// Протокол игры: login / login_success / move / players_list / chat / error, плюс номера машин.
// Управление — не в игре, а через HTTP-панель из ячейки Colab (/admin): деньги, бан, кик, телепорт.
const http = require('http');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(9).toString('hex');
// Привязка ника к устройству. 0 (по умолчанию) — новый браузер просто забирает ник обратно,
// иначе после чистки localStorage игрок навсегда терял вход. 1 — строго, как раньше.
const STRICT_DEVICE = process.env.STRICT_DEVICE === '1';
// Постоянная ссылка на игру: сайт не меняется никогда, а адрес туннеля сервер
// сам публикует в server/live.json репозитория — клиент читает его при запуске.
const GAME_SITE = process.env.GAME_SITE || 'https://dimastwa0sopsi.github.io/File/';
const GH_TOKEN = String(process.env.GH_TOKEN || '').trim();
const GH_REPO = String(process.env.GH_REPO || 'Dimastwa0sopsi/File').trim();
const GH_BRANCH = String(process.env.GH_BRANCH || 'main').trim();
const LIVE_PATH = 'server/live.json';
// отпечаток кода: ячейка Colab сверяет его с файлом на Диске и понимает,
// что на порту висит старый процесс (после обновления сервера он перезапускается сам)
const BUILD = (() => {
  try { return crypto.createHash('sha1').update(fs.readFileSync(__filename)).digest('hex').slice(0, 12); }
  catch { return 'dev'; }
})();
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
    password TEXT NOT NULL DEFAULT '',
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
// пароль аккаунта (хранится как bcrypt-хеш)
try { db.exec("ALTER TABLE players ADD COLUMN password TEXT NOT NULL DEFAULT ''"); } catch { /* колонка уже есть */ }
// новые поля для панели из 100 кнопок: предупреждения и запрет чата
try { db.exec('ALTER TABLE players ADD COLUMN warns INTEGER NOT NULL DEFAULT 0'); } catch { /* */ }
try { db.exec('ALTER TABLE players ADD COLUMN muted INTEGER NOT NULL DEFAULT 0'); } catch { /* */ }
// последний присланный инвентарь: панель показывает его и у офлайн-игроков
try { db.exec("ALTER TABLE players ADD COLUMN inventory TEXT NOT NULL DEFAULT ''"); } catch { /* */ }

const q = {
  byName: db.prepare('SELECT * FROM players WHERE name = ?'),
  create: db.prepare('INSERT INTO players (name, gender, updated_at) VALUES (?, ?, ?)'),
  move: db.prepare('UPDATE players SET pos_x = ?, pos_z = ?, pos_rot = ?, updated_at = ? WHERE id = ?'),
  log: db.prepare('INSERT INTO chat_log (name, text, t) VALUES (?, ?, ?)'),
  all: db.prepare(`SELECT id, name, gender, money, car_id, car_number, house_id, warns, muted, is_admin,
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
  inv: db.prepare('UPDATE players SET inventory = ? WHERE name = ?'),
};

/* ---------- настройки панели (живут в базе, переживают перезапуск) ---------- */
db.exec('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)');
const settingsGet = (k, def) => { try { const r = db.prepare('SELECT v FROM settings WHERE k = ?').get(k); return r ? r.v : def; } catch { return def; } };
const settingsSet = (k, v) => { try { db.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v)); } catch { /* */ } };

/** настройки выдачи денег: сколько по умолчанию, потолок за операцию, писать ли в журнал */
function moneyCfg() {
  return {
    amount: Math.max(0, Math.min(100_000_000, Math.round(Number(settingsGet('money_amount', '5000')) || 0))),
    cap: Math.max(1000, Math.min(2_147_483_647, Math.round(Number(settingsGet('money_cap', '1000000')) || 0))),
    step: Math.max(0, Math.min(1_000_000, Math.round(Number(settingsGet('money_step', '1000')) || 0))),
    allowNegative: settingsGet('money_negative', '0') === '1',
    strict: settingsGet('money_strict', '1') === '1',
  };
}
function setMoneyCfg(cfg) {
  if (cfg.amount !== undefined) settingsSet('money_amount', Math.max(0, Math.min(100_000_000, Math.round(Number(cfg.amount) || 0))));
  if (cfg.cap !== undefined) settingsSet('money_cap', Math.max(1000, Math.min(2_147_483_647, Math.round(Number(cfg.cap) || 0))));
  if (cfg.step !== undefined) settingsSet('money_step', Math.max(0, Math.min(1_000_000, Math.round(Number(cfg.step) || 0))));
  if (cfg.allowNegative !== undefined) settingsSet('money_negative', cfg.allowNegative ? '1' : '0');
  if (cfg.strict !== undefined) settingsSet('money_strict', cfg.strict ? '1' : '0');
  return moneyCfg();
}

/* ---------- журнал действий панели (последние 200) ---------- */
const ADMIN_LOG = [];
function adminLog(text) {
  ADMIN_LOG.push({ t: Date.now(), text: String(text).slice(0, 240) });
  if (ADMIN_LOG.length > 200) ADMIN_LOG.shift();
  console.log('[admin]', text);
}

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
    money: moneyCfg(),
    log: ADMIN_LOG.slice(-60),
    groups: ADMIN_GROUPS,
    actions: ADMIN_ACTIONS,
    buttons: ADMIN_ACTIONS.length,
    items: ITEMS.length,
    itemActions: ITEM_ACTIONS.length,
    inventories: INVENTORY.size,
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
  { id: 'money_all_reset', g: 'money', t: 'Всем онлайн по 20 000 $' },
  { id: 'money_give', g: 'money', t: '💵 Выдать сумму из настроек', need: true },
  { id: 'money_give_all', g: 'money', t: '💵 Выдать сумму всем онлайн' },
  { id: 'money_settings_save', g: 'money', t: '⚙️ Настройки выдачи денег' },
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
  { id: 'tp_field', g: 'tp', t: '🌾 В поле (ферма)', need: true },
  { id: 'tp_all_to_player', g: 'tp', t: '👥 Всех к игроку', need: false, target: true },
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
  { id: 'player_house', g: 'player', t: '🏠 Выдать дом', need: true, house: true },
  { id: 'player_house_clear', g: 'player', t: '🏚️ Забрать дом', need: true },
  // ——— Сервер (10) ———
  { id: 'server_info', g: 'server', t: '📊 Состояние сервера' },
  { id: 'online_list', g: 'server', t: '🟢 Кто в сети' },
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

// ===================== 🎁 ПРЕДМЕТЫ: каталог и выдача из Colab =====================
// Инвентарь живёт на клиенте (localStorage), сервер его только запоминает:
// игрок присылает снимок раз в несколько секунд, панель показывает его и может
// выдать/забрать предметы — команда уходит клиенту, а он уже меняет инвентарь.
const ITEM_GROUPS = {
  drink: '🥤 Напитки', food: '🍔 Еда', med: '💊 Здоровье', weapon: '🔫 Оружие',
  ammo: '🧨 Патроны', farm: '🌱 Ферма', fish: '🎣 Рыбалка', auto: '🔧 Запчасти', other: '📦 Прочее',
};
/** [id, название, иконка, цена, группа] — тот же набор, что src/game/data.ts */
const ITEMS = [
  ['water', 'Вода 0.5л', '💧', 2, 'drink'],
  ['cola', 'Кола', '🥤', 3, 'drink'],
  ['juice', 'Сок', '🧃', 4, 'drink'],
  ['milk', 'Молоко', '🥛', 3, 'drink'],
  ['coffee', 'Кофе', '☕', 4, 'drink'],
  ['tea', 'Чай', '🍵', 2, 'drink'],
  ['energy', 'Энергетик', '⚡', 5, 'drink'],
  ['bread', 'Хлеб', '🍞', 2, 'food'],
  ['sandwich', 'Сэндвич', '🥪', 5, 'food'],
  ['burger', 'Бургер', '🍔', 8, 'food'],
  ['pizza', 'Пицца', '🍕', 10, 'food'],
  ['shawarma', 'Шаурма', '🌯', 6, 'food'],
  ['soup', 'Суп', '🍲', 6, 'food'],
  ['sausage', 'Колбаса', '🌭', 6, 'food'],
  ['apple', 'Яблоко', '🍎', 1, 'food'],
  ['banana', 'Банан', '🍌', 1, 'food'],
  ['chips', 'Чипсы', '🥔', 3, 'food'],
  ['chocolate', 'Шоколад', '🍫', 3, 'food'],
  ['icecream', 'Мороженое', '🍦', 3, 'food'],
  ['croissant', 'Круассан', '🥐', 3, 'food'],
  ['cigarettes', 'Сигареты', '🚬', 7, 'med'],
  ['canister', 'Канистра 20 л', '⛽', 120, 'auto'],
  ['spare_wheel', 'Колесо в сборе', '🛞', 180, 'auto'],
  ['spare_glass', 'Комплект стёкол', '🪟', 260, 'auto'],
  ['spare_body', 'Кузовная деталь', '🔩', 320, 'auto'],
  ['medkit', 'Аптечка', '🩹', 60, 'med'],
  ['pills', 'Обезболивающее', '💊', 15, 'med'],
  ['vitamins', 'Витамины', '🧪', 12, 'med'],
  ['pistol', 'Пистолет «Оса-9»', '🔫', 1500, 'weapon'],
  ['revolver', 'Револьвер «Шериф»', '🔫', 2600, 'weapon'],
  ['smg', 'Пистолет-пулемёт «Шмель»', '🔫', 5200, 'weapon'],
  ['shotgun', 'Дробовик «Медведь»', '🔫', 4800, 'weapon'],
  ['rifle', 'Автомат «Ураган»', '🔫', 9500, 'weapon'],
  ['sniper', 'Винтовка «Ястреб»', '🔭', 14000, 'weapon'],
  ['knife', 'Нож «Финка»', '🔪', 900, 'weapon'],
  ['machete', 'Тесак «Тайга»', '🗡️', 1900, 'weapon'],
  ['seed_tomato', 'Семена томатов', '🌱', 12, 'farm'],
  ['seed_potato', 'Семенной картофель', '🌱', 10, 'farm'],
  ['seed_cucumber', 'Семена огурцов', '🌱', 12, 'farm'],
  ['seed_strawberry', 'Рассада клубники', '🌱', 18, 'farm'],
  ['seed_sunflower', 'Семена подсолнуха', '🌱', 8, 'farm'],
  ['seed_durman', 'Семена «Дурман» (нелегально)', '🌿', 150, 'farm'],
  ['tomato', 'Томат', '🍅', 4, 'farm'],
  ['potato', 'Картофель', '🥔', 3, 'farm'],
  ['cucumber', 'Огурец', '🥒', 3, 'farm'],
  ['strawberry', 'Клубника', '🍓', 6, 'farm'],
  ['sunflower', 'Семечки', '🌻', 3, 'farm'],
  ['durman', 'Дурман-трава', '🍁', 0, 'farm'],
  ['ammo', 'Патроны 9 мм ×30', '📦', 60, 'ammo'],
  ['ammo_m', 'Патроны .357 ×18', '📦', 70, 'ammo'],
  ['shells', 'Патроны 12 калибр ×16', '🧨', 80, 'ammo'],
  ['ammo_r', 'Винтовочные ×30', '📦', 140, 'ammo'],
  ['rod', 'Удочка «Кандакс»', '🎣', 900, 'fish'],
  ['rod_pro', 'Спиннинг «Барракуда»', '🎣', 3200, 'fish'],
  ['bait', 'Наживка (×10)', '🪱', 15, 'fish'],
  ['lure', 'Блесна', '✨', 120, 'fish'],
  ['net', 'Подсак', '🕸️', 450, 'fish'],
  ['bucket', 'Ведро', '🪣', 90, 'fish'],
  ['fish', 'Карась', '🐟', 3, 'fish'],
  ['fish_big', 'Щука', '🐠', 10, 'fish'],
];
const ITEM_BY_ID = new Map(ITEMS.map(([id, name, icon, price, g]) => [id, { id, name, icon, price, g }]));
/** кнопки вкладки «🎁 Предметы»: id, группа, подпись, нужен ли игрок/предмет */
const ITEM_ACTIONS = [
  { id: 'item_give', g: 'give', t: '🎁 Выдать выбранному', need: true, item: true },
  { id: 'item_take', g: 'give', t: '🗑 Забрать у выбранного', need: true, item: true },
  { id: 'item_give_all', g: 'give', t: '📢 Выдать всем онлайн', item: true },
  { id: 'item_take_all', g: 'give', t: '🧹 Забрать у всех онлайн', item: true, confirm: true },
  { id: 'item_clear', g: 'give', t: '🗑 Очистить инвентарь', need: true, confirm: true },
  { id: 'inv_view', g: 'give', t: '🎒 Показать инвентарь', need: true },
  { id: 'inv_report_all', g: 'give', t: '🔄 Запросить инвентарь у всех' },
  { id: 'kit_start', g: 'kit', t: '🎒 Стартовый набор', need: true },
  { id: 'kit_fish', g: 'kit', t: '🎣 Набор рыбака', need: true },
  { id: 'kit_weapon', g: 'kit', t: '🔫 Набор оружия', need: true },
  { id: 'kit_auto', g: 'kit', t: '🔧 Набор автомобилиста', need: true },
  { id: 'kit_food', g: 'kit', t: '🍔 Набор еды и воды', need: true },
];
const ITEM_GROUPS_TITLES = { give: '🎁 Выдача и инвентарь', kit: '📦 Готовые наборы' };
/** готовые наборы: id предмета → количество */
const KITS = {
  kit_start: { water: 5, bread: 3, medkit: 1, canister: 1, spare_wheel: 1 },
  kit_fish: { rod_pro: 1, bait: 20, lure: 10, bucket: 1, net: 1 },
  kit_weapon: { pistol: 1, ammo: 60, medkit: 2 },
  kit_auto: { canister: 3, spare_wheel: 2, spare_glass: 1, spare_body: 2 },
  kit_food: { pizza: 3, burger: 3, cola: 5, water: 5, icecream: 2 },
};
/** последний известный инвентарь игрока: name(в нижнем регистре) → { item: qty } */
const INVENTORY = new Map();
// при старте поднимаем сохранённые снимки: панель видит инвентарь и у офлайн-игроков
try {
  for (const r of db.prepare("SELECT name, inventory FROM players WHERE inventory <> ''").all()) {
    try { INVENTORY.set(String(r.name).toLowerCase(), JSON.parse(r.inventory || '{}')); } catch { /* битый json */ }
  }
} catch { /* старая база без колонки */ }
const invOf = (name) => INVENTORY.get(String(name || '').toLowerCase()) || null;
function invRows(name) {
  const inv = invOf(name);
  if (!inv) return [`Инвентарь ${name} ещё не приходил — нажмите «🔄 Запросить инвентарь»`];
  const entries = Object.entries(inv).filter(([, n]) => Number(n) > 0);
  if (!entries.length) return [`У ${name} инвентарь пуст`];
  return entries
    .sort((a, b) => (ITEM_BY_ID.get(b[0])?.price || 0) - (ITEM_BY_ID.get(a[0])?.price || 0))
    .map(([id, n]) => {
      const it = ITEM_BY_ID.get(id);
      return `${it ? it.icon + ' ' + it.name : id} ×${fmt(n)}${it ? ' · $' + fmt(it.price) : ''}`;
    });
}
/** выдать/забрать предметы: онлайн — уходит клиенту сразу, офлайн — сохраняется в БД и дошлётся при входе */
function itemTo(name, item, qty, mode) {
  const it = ITEM_BY_ID.get(String(item || ''));
  if (!it) return { ok: false, error: 'Неизвестный предмет: ' + item };
  const n = Math.max(1, Math.min(9999, Math.round(Number(qty) || 1)));
  const inv = invOf(name) || {};
  const cur = Number(inv[it.id] || 0);
  let next;
  if (mode === 'give') next = cur + n;
  else next = Math.max(0, cur - n);
  if (next <= 0) { delete inv[it.id]; } else { inv[it.id] = next; }
  INVENTORY.set(String(name).toLowerCase(), inv);
  try { q.inv.run(JSON.stringify(inv), name); } catch { /* старая база без колонки inventory */ }
  const on = liveOf(name);
  if (on) {
    send(on.ws, { type: 'adm', act: 'item', mode, item: it.id, qty: n });
    return { ok: true, message: `${name}: ${mode === 'take' ? 'забрали' : 'выдали'} ${it.icon} ${it.name} ×${n}` };
  }
  return { ok: true, message: `${name}: ${mode === 'take' ? 'забрали' : 'выдали'} ${it.icon} ${it.name} ×${n} (сохранено — выдастся при входе)` };
}

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
/** синхронизация денег клиента с сервером: принимаем любые изменения от клиента */
function acceptClientMoney(row, money) {
  const next = Math.max(0, Math.min(2147483647, Math.round(money)));
  if (next === row.money) return;
  q.money.run(next, row.name); row.money = next; pushPlayers();
  // оповещаем клиента, чтобы он сразу увидел актуальный баланс
  const on = liveOf(row.name);
  if (on) send(on.ws, { type: 'adm', act: 'money', money: next });
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
// Координаты сверены с генератором мира (worldgen): пляж «Волжская» теперь
// на западе (x ≈ −200, z ≈ 480), ферма — в поле (1490, 1150), сёла — по своим центрам.
const TP_POINTS = {
  spawn: [516, 491.5], hospital: [680, 729], police: [401, 549], cityhall: [510, 500], bank: [560, 489],
  mall: [630, 586], beach: [-200, 480], promenade: [-176, 470], field: [1640, 1040],
  farm: [1490, 1150], village_s: [420, -300], village_k: [650, 1780],
  village_o: [1170, 1560], center: [540, 540], fishshop: [-140, 520],
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
  money_give: (a) => giveMoneyCustom(a, false),
  money_give_all: (a) => giveMoneyCustom(a, true),
  money_settings_save: () => {
    const c = moneyCfg();
    return { ok: true, message: `Настройки денег: по умолчанию $${fmt(c.amount)} · потолок $${fmt(c.cap)} · шаг $${fmt(c.step)} · минус ${c.allowNegative ? 'можно' : 'нельзя'}`, rows: moneySettingsRows() };
  },
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
  tp_field: (a) => tpPoint(a, 'field'), tp_promenade: (a) => tpPoint(a, 'promenade'),
  tp_fishshop: (a) => tpPoint(a, 'fishshop'),
  tp_player: (a) => {
    if (!a.name) return noPlayer();
    const target = String(a.target || '').trim();
    if (!target) return { ok: false, error: 'Выберите, к кому телепортировать (поле «К кому»)' };
    if (target.toLowerCase() === a.name.toLowerCase()) return { ok: false, error: 'Это тот же игрок — выберите другого' };
    const t = rowOf(target); if (!t) return { ok: false, error: `Игрок ${target} не найден` };
    const r = tpTo(a.name, t.pos_x, t.pos_z);
    if (r.ok) r.message = `${a.name} → к ${t.name} (X ${Math.round(t.pos_x)}, Z ${Math.round(t.pos_z)})`;
    return r;
  },
  tp_all_to_player: (a) => {
    const target = String(a.target || '').trim();
    const t = rowOf(target); if (!t) return { ok: false, error: 'Выберите игрока-цель' };
    let n = 0;
    for (const row of onlineRows()) if (row.name !== t.name) { tpTo(row.name, t.pos_x, t.pos_z); n++; }
    return { ok: true, message: `Собрали ${n} игроков у ${t.name}` };
  },
  // Транспорт
  car_set: (a) => (a.name ? setCar(a.name, a.carId, a.number) : noPlayer()),
  // спавн машины рядом с игроком: в базу и в собственность ничего не пишется
  car_spawn: (a) => {
    if (!a.name) return noPlayer();
    const carId = String(a.carId || 'volga').slice(0, 32);
    const on = liveOf(a.name);
    if (!on) return { ok: false, error: `${a.name} не в сети — спавн возможен только онлайн` };
    send(on.ws, { type: 'adm', act: 'carspawn', carId });
    return { ok: true, message: `${a.name}: ${carId} появилась рядом (не в собственности)` };
  },
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

/* ---------- 🎁 выдача предметов: отдельный набор действий панели ---------- */
const ITEM_HANDLERS = {
  item_give: (a) => {
    if (!a.name) return noPlayer();
    return itemTo(a.name, a.item, a.qty, 'give');
  },
  item_take: (a) => {
    if (!a.name) return noPlayer();
    return itemTo(a.name, a.item, a.qty, 'take');
  },
  item_give_all: (a) => {
    const it = ITEM_BY_ID.get(String(a.item || ''));
    if (!it) return { ok: false, error: 'Неизвестный предмет: ' + a.item };
    const n = Math.max(1, Math.min(9999, Math.round(Number(a.qty) || 1)));
    let cnt = 0;
    for (const { ws } of active.values()) { send(ws, { type: 'adm', act: 'item', mode: 'give', item: it.id, qty: n }); cnt++; }
    if (!cnt) return { ok: false, error: 'Никого нет онлайн' };
    return { ok: true, message: `${it.icon} ${it.name} ×${n} — всем онлайн (${cnt})` };
  },
  item_take_all: (a) => {
    const it = ITEM_BY_ID.get(String(a.item || ''));
    if (!it) return { ok: false, error: 'Неизвестный предмет: ' + a.item };
    const n = Math.max(1, Math.min(9999, Math.round(Number(a.qty) || 1)));
    let cnt = 0;
    for (const { ws } of active.values()) { send(ws, { type: 'adm', act: 'item', mode: 'take', item: it.id, qty: n }); cnt++; }
    return { ok: cnt > 0, message: `Забрали ${it.name} ×${n} у ${cnt} игроков`, error: cnt ? '' : 'Никого нет онлайн' };
  },
  item_clear: (a) => {
    if (!a.name) return noPlayer();
    const on = liveOf(a.name);
    INVENTORY.set(String(a.name).toLowerCase(), {});
    try { q.inv.run('{}', a.name); } catch { /* */ }
    if (on) send(on.ws, { type: 'adm', act: 'item', mode: 'clear' });
    return { ok: true, message: `${a.name}: инвентарь очищен${on ? '' : ' (сохранено — очистится при входе)'}` };
  },
  inv_view: (a) => {
    if (!a.name) return noPlayer();
    admTo(a.name, 'inv_report');
    return { ok: true, rows: invRows(a.name), message: `Инвентарь ${a.name}: ${Object.keys(invOf(a.name) || {}).length} видов` };
  },
  inv_report_all: () => {
    let n = 0;
    for (const { ws } of active.values()) { send(ws, { type: 'adm', act: 'inv_report' }); n++; }
    return { ok: n > 0, message: `Запросили инвентарь у ${n} игроков — откройте «🎒 Показать инвентарь» через 2 секунды`, error: n ? '' : 'Никого нет онлайн' };
  },
};
for (const kitId of Object.keys(KITS)) {
  ITEM_HANDLERS[kitId] = (a) => {
    if (!a.name) return noPlayer();
    const kit = KITS[kitId];
    const inv = invOf(a.name) || {};
    let changed = false;
    for (const [item, qty] of Object.entries(kit)) {
      inv[item] = Number(inv[item] || 0) + qty;
      changed = true;
    }
    if (changed) {
      INVENTORY.set(String(a.name).toLowerCase(), inv);
      try { q.inv.run(JSON.stringify(inv), a.name); } catch { /* */ }
    }
    const on = liveOf(a.name);
    if (on) {
      for (const [item, qty] of Object.entries(kit)) send(on.ws, { type: 'adm', act: 'item', mode: 'give', item, qty });
    }
    const names = Object.entries(kit).map(([id, q]) => `${ITEM_BY_ID.get(id)?.icon || ''}${ITEM_BY_ID.get(id)?.name || id}×${q}`).join(', ');
    return { ok: true, message: `${a.name}: набор ${on ? 'выдан' : 'сохранён — выдастся при входе'} (${names})` };
  };
}

/* выдача денег по настройкам панели: сумма из запроса или из настроек, режим add/sub/set */
function moneySettingsRows() {
  const c = moneyCfg();
  return [
    `Сумма по умолчанию: $${fmt(c.amount)}`,
    `Шаг кнопок: $${fmt(c.step)}`,
    `Потолок за операцию: $${fmt(c.cap)}`,
    `Отрицательный баланс: ${c.allowNegative ? 'разрешён' : 'запрещён'}`,
    `Защита от накрутки клиентом: ${c.strict ? 'включена' : 'выключена'}`,
  ];
}
function giveMoneyCustom(a, all) {
  const c = moneyCfg();
  const raw = a.amount === undefined || a.amount === '' ? c.amount : Number(a.amount);
  if (!isFinite(raw)) return { ok: false, error: 'Сумма должна быть числом' };
  let amount = Math.floor(Math.abs(raw));
  if (amount > c.cap) return { ok: false, error: `Больше потолка $${fmt(c.cap)} за операцию` };
  const mode = ['add', 'sub', 'set'].includes(a.mode) ? a.mode : 'add';
  if (all) {
    const rows = onlineRows();
    if (!rows.length) return { ok: false, error: 'Никого нет в сети' };
    let n = 0;
    for (const row of rows) {
      const next = mode === 'add' ? row.money + amount : mode === 'sub' ? row.money - amount : amount;
      const v = setMoney(row.name, c.allowNegative ? Math.max(-2147483647, next) : Math.max(0, next));
      adminLog(`💵 ${moneyWord(mode)} $${fmt(amount)} → ${row.name} (теперь $${fmt(v)})`);
      n++;
    }
    return { ok: true, message: `${moneyWord(mode)} $${fmt(amount)} всем онлайн: ${n} игрок(ов)` };
  }
  if (!a.name) return noPlayer();
  const row = rowOf(a.name);
  if (!row) return { ok: false, error: 'Игрок не найден' };
  const next = mode === 'add' ? row.money + amount : mode === 'sub' ? row.money - amount : amount;
  const v = setMoney(a.name, c.allowNegative ? Math.max(-2147483647, next) : Math.max(0, next));
  adminLog(`💵 ${moneyWord(mode)} $${fmt(amount)} → ${a.name} (теперь $${fmt(v)})`);
  return { ok: true, message: `${a.name}: ${moneyWord(mode)} $${fmt(amount)} → $${fmt(v)}` };
}
function moneyWord(mode) { return mode === 'add' ? 'начислено' : mode === 'sub' ? 'списано' : 'установлено'; }

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
  const h = ADMIN_HANDLERS[id] || ITEM_HANDLERS[id];
  if (!h) return { ok: false, error: 'Неизвестное действие: ' + id };
  const def = ADMIN_ACTIONS.find((x) => x.id === id) || ITEM_ACTIONS.find((x) => x.id === id);
  const name = String(a.name ?? '').trim();
  if (def && def.need && !name) return { ok: false, error: 'Сначала выберите игрока' };
  let res;
  try { res = h({ ...a, name }); } catch (e) { res = { ok: false, error: String(e && e.message ? e.message : e) }; }
  adminLog(`${res && res.ok ? '✅' : '⚠️'} ${def ? def.t : id}${name ? ' · ' + name : ''}${res && res.message ? ' — ' + res.message : res && res.error ? ' — ' + res.error : ''}`);
  return res;
}

/* ---------- публичный адрес туннеля (ngrok / Cloudflare / PUBLIC_URL) ---------- */
function httpGetJson(port, path, timeout = 900) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout }, (r) => {
      let data = '';
      r.on('data', (c) => { data += c; if (data.length > 2e5) r.destroy(); });
      r.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}
async function tunnelInfo() {
  // 1) адрес, заданный вручную в Colab
  const env = String(process.env.PUBLIC_URL || '').trim();
  if (env) return { ok: true, url: env, ws: toWs(env), source: 'PUBLIC_URL' };
  // 2) локальный API ngrok
  const t = await httpGetJson(4040, '/api/tunnels');
  const list = (t && Array.isArray(t.tunnels)) ? t.tunnels : [];
  const https = list.find((x) => String(x.public_url || '').startsWith('https://')) || list[0];
  if (https && https.public_url) {
    const url = String(https.public_url);
    return { ok: true, url, ws: toWs(url), source: 'ngrok' };
  }
  return { ok: true, url: '', ws: '', source: 'none' };
}
function toWs(u) { return String(u).trim().replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:'); }

/* ---------- публикация актуального адреса в GitHub (одна постоянная ссылка) ---------- */
function ghRequest(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      host: 'api.github.com', path, method,
      headers: {
        'User-Agent': 'los-gorod-server',
        Accept: 'application/vnd.github+json',
        Authorization: `token ${GH_TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
      timeout: 9000,
    }, (r) => {
      let out = '';
      r.on('data', (c) => { out += c; if (out.length > 5e5) r.destroy(); });
      r.on('end', () => { let parsed = null; try { parsed = JSON.parse(out); } catch { /* не JSON */ } resolve({ status: r.statusCode || 0, body: parsed }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: null }); });
    req.on('error', () => resolve({ status: 0, body: null }));
    if (data) req.write(data);
    req.end();
  });
}

/** записать актуальный адрес туннеля в server/live.json репозитория */
async function publishLive() {
  if (!GH_TOKEN) return { ok: false, error: 'Нет GH_TOKEN: впишите токен GitHub (право contents:write) в Colab-панели' };
  const t = await tunnelInfo();
  if (!t.url && !t.ws) return { ok: false, error: 'Туннель не найден: поднимите ngrok или задайте PUBLIC_URL' };
  const doc = { url: t.url, ws: t.ws, updated: Date.now(), source: t.source, server: 'los-gorod' };
  const content = Buffer.from(JSON.stringify(doc, null, 2) + '\n', 'utf8').toString('base64');
  const path = `/repos/${GH_REPO}/contents/${LIVE_PATH}`;
  const cur = await ghRequest('GET', `${path}?ref=${encodeURIComponent(GH_BRANCH)}`);
  const sha = cur.body && cur.body.sha ? String(cur.body.sha) : '';
  const put = await ghRequest('PUT', path, { message: 'server: актуальный адрес сервера', content, branch: GH_BRANCH, ...(sha ? { sha } : {}) });
  if (put.status === 200 || put.status === 201) {
    const link = t.ws ? `${GAME_SITE}?srv=${encodeURIComponent(t.ws)}` : GAME_SITE;
    console.log(`[live] опубликован адрес ${t.ws || t.url}`);
    return { ok: true, url: t.url, ws: t.ws, link, site: GAME_SITE, updated: doc.updated };
  }
  if (!put.status) return { ok: false, error: 'GitHub не ответил: проверьте интернет в Colab' };
  if (put.status === 401 || put.status === 403) return { ok: false, error: 'GitHub отклонил токен: нужен fine-grained token с правом Contents: Read and write' };
  if (put.status === 404) return { ok: false, error: `Репозиторий ${GH_REPO} или ветка ${GH_BRANCH} не найдены` };
  return { ok: false, error: `GitHub вернул ${put.status}${put.body && put.body.message ? ': ' + put.body.message : ''}` };
}

/* ---------- ИИ-помощника больше нет: ни чата с моделью, ни лимитов запросов ---------- */


const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Los-Gorod server OK'); return; }
  if (url.pathname === '/health') {
    json(res, 200, { ok: true, online: active.size, uptime: Math.round(process.uptime()), maintenance: MAINTENANCE, build: BUILD, caps: { state: 1, adm: 1 } });
    return;
  }
  if (url.pathname === '/version') { json(res, 200, { ok: true, build: BUILD }); return; }
  if (!url.pathname.startsWith('/admin')) { json(res, 404, { ok: false, error: 'not found' }); return; }
  const token = url.searchParams.get('token') || req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) { json(res, 403, { ok: false, error: 'Неверный токен админ-панели' }); return; }
  if (req.method === 'GET' && url.pathname === '/admin/tunnel') {
    tunnelInfo().then((t) => json(res, 200, t)).catch(() => json(res, 200, { ok: true, url: '', ws: '', source: 'none' }));
    return;
  }
  if (url.pathname === '/admin/publish') {
    publishLive().then((r) => {
      if (r.ok) console.log(`[publish] постоянная ссылка: ${r.site || GAME_SITE}`);
      json(res, 200, r);
    }).catch((e) => json(res, 200, { ok: false, error: String(e && e.message ? e.message : e) }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/admin/state') { json(res, 200, adminState()); return; }
  if (url.pathname === '/admin/money') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      const cfg = setMoneyCfg(body || {});
      adminLog(`⚙️ настройки денег: $${fmt(cfg.amount)} · потолок $${fmt(cfg.cap)} · шаг $${fmt(cfg.step)}`);
      json(res, 200, { ok: true, money: cfg, rows: moneySettingsRows() });
      return;
    }
    json(res, 200, { ok: true, money: moneyCfg(), rows: moneySettingsRows() });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/admin/log') { json(res, 200, { ok: true, log: ADMIN_LOG.slice(-200) }); return; }
  if (req.method === 'GET' && url.pathname === '/admin/actions') { json(res, 200, { ok: true, groups: ADMIN_GROUPS, actions: ADMIN_ACTIONS }); return; }
  // 🎁 каталог предметов и кнопки выдачи (отдельно от 100 кнопок сервера)
  if (req.method === 'GET' && url.pathname === '/admin/items') {
    json(res, 200, {
      ok: true, groups: ITEM_GROUPS, groupTitles: ITEM_GROUPS_TITLES,
      items: ITEMS.map(([id, name, icon, price, g]) => ({ id, name, icon, price, g })),
      actions: ITEM_ACTIONS, kits: Object.keys(KITS),
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/admin/inventory') {
    const name = String(url.searchParams.get('name') || '').trim();
    if (!name) { json(res, 200, { ok: false, error: 'Нужен ник' }); return; }
    const inv = invOf(name) || {};
    json(res, 200, { ok: true, name, items: inv, rows: invRows(name), live: !!liveOf(name) });
    return;
  }
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
      if (name.length < 2) return send(ws, { type: 'error', code: 'name', text: 'Ник должен быть от 2 до 16 символов' });
      const token = String(m.token || '').slice(0, 64);
      const gender = m.gender === 'f' ? 'f' : 'm';
      const pass = String(m.password || '');
      // пароль хранится как pbkdf2-хеш: hash$salt (100k итераций, sha256)
      function pwHash(p, s) { return crypto.pbkdf2Sync(p, s, 100000, 32, 'sha256').toString('hex'); }
      function pwCheck(p, stored) {
        if (!stored || !stored.includes('$')) return false;
        const [hash, salt] = stored.split('$');
        return hash === pwHash(p, salt);
      }
      function pwSet(p) { const s = crypto.randomBytes(16).toString('hex'); return pwHash(p, s) + '$' + s; }
      let row = q.byName.get(name);
      if (!row) {
        // новый аккаунт: обязателен пароль и пол
        if (!pass || pass.length < 4) return send(ws, { type: 'error', code: 'pass', text: 'Придумайте пароль (минимум 4 символа)' });
        q.create.run(name, gender, Date.now());
        const stored = pwSet(pass);
        db.prepare('UPDATE players SET password = ? WHERE name = ?').run(stored, name);
        row = q.byName.get(name);
        console.log(`[register] ${name} created account`);
      } else {
        // существующий аккаунт: проверяем пароль (или создаём, если ещё не было)
        if (!row.password) {
          if (!pass || pass.length < 4) return send(ws, { type: 'error', code: 'setpass', text: 'Придумайте пароль для аккаунта (минимум 4 символа)' });
          const stored = pwSet(pass);
          db.prepare('UPDATE players SET password = ? WHERE name = ?').run(stored, name);
          row.password = stored;
        } else if (!pwCheck(pass, row.password)) {
          return send(ws, { type: 'error', code: 'pass', text: 'Неверный пароль' });
        }
        // обновим пол если изменился
        if (row.gender !== gender) { db.prepare('UPDATE players SET gender = ? WHERE name = ?').run(gender, name); row.gender = gender; }
      }
      if (row.banned) return send(ws, { type: 'error', code: 'banned', text: row.ban_reason || 'Вы забанены' });
      // техработы: пускаем только админов
      if (MAINTENANCE && !row.is_admin) return send(ws, { type: 'error', code: 'maintenance', text: 'Сервер на техобслуживании — зайдите позже' });
      // привязка к устройству: по умолчанию мягкая (новое устройство забирает ник),
      // строгая — только при STRICT_DEVICE=1, иначе чистка localStorage навсегда закрывала вход
      if (!row.token) { if (token) { q.token.run(token, row.name); row.token = token; } }
      else if (token !== row.token) {
        if (STRICT_DEVICE && !row.is_admin) {
          return send(ws, { type: 'error', code: 'device', text: `Ник «${row.name}» закреплён за другим устройством. Сбросьте привязку в админ-панели или возьмите другой ник.` });
        }
        q.token.run(token, row.name); row.token = token;
        console.log(`[login] ${row.name}: новое устройство, привязка обновлена`);
      }
      // один игрок — одна сессия: старую сессию закрываем и пускаем новую.
      // Раньше второй вход отклонялся, и после перезагрузки страницы игрок не мог зайти,
      // пока сервер не заметит мёртвый сокет.
      const busy = onlineByName(row.name);
      if (busy && busy.ws !== ws) {
        send(busy.ws, { type: 'error', code: 'replaced', text: 'Вход выполнен с другого устройства — эта сессия закрыта' });
        try { busy.ws.close(); } catch { /* */ }
        active.delete(busy.row.id);
      }
      // деньги — только серверные: локальный сейв клиента в онлайн не переносится
      me = row; active.set(row.id, { ws, row }); ws.playerId = row.id;
      console.log(`[login] ${row.name} вошёл (онлайн: ${active.size})`);
      send(ws, { type: 'login_success', token: row.token || '', caps: { state: 1, peds: 1, adm: 1, relay: 1 }, player: {
        id: row.id, name: row.name, gender: row.gender, money: row.money,
        x: row.pos_x, z: row.pos_z, rot: row.pos_rot, number: row.car_number, carNumber: row.car_number,
      } });
      // досылаем предметы, выданные пока игрока не было онлайн
      const pend = invOf(row.name);
      if (pend && Object.keys(pend).length) {
        for (const [item, qty] of Object.entries(pend)) {
          if (Number(qty) > 0) send(ws, { type: 'adm', act: 'item', mode: 'give', item, qty: Number(qty) });
        }
      }
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
      // Деньги в онлайне — серверные. Клиент присылает локальный баланс после
      // заработка; принимаем только правдоподобные изменения, иначе откатываем.
      const money = Number(m.money);
      if (isFinite(money) && moneyCfg().strict) acceptClientMoney(row, money);
      return;
    }

    if (m.type === 'inv') {
      // снимок инвентаря от клиента: панель показывает его, ничего не навязывая
      const src = m.items && typeof m.items === 'object' ? m.items : {};
      const clean = {};
      for (const [k, v] of Object.entries(src)) {
        const n = Math.round(Number(v));
        if (n > 0 && ITEM_BY_ID.has(String(k))) clean[String(k)] = Math.min(99999, n);
      }
      INVENTORY.set(row.name.toLowerCase(), clean);
      q.inv.run(JSON.stringify(clean), row.name);
      return;
    }

    if (m.type === 'set_plate') {
      const num = String(m.number || '').slice(0, 9);
      q.car.run(String(m.carId || row.car_id || 'lada'), num, row.name);
      row.car_number = num; pushPlayers();
      send(ws, { type: 'chat', name: 'СИСТЕМА', text: `номер ${num} сохранён` });
    }
  });
  ws.on('close', () => {
    // удаляем только свою запись: иначе закрытие старого сокета снимало новую сессию того же игрока
    if (ws.playerId && active.get(ws.playerId)?.ws === ws) {
      active.delete(ws.playerId); pushPlayers();
      console.log(`[logout] ${ws.playerId} (онлайн: ${active.size})`);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Los-Gorod server on :${PORT}, db=${db.name}`);
  console.log(`Админ-панель — ячейка colab_admin.py в Colab · токен: ${ADMIN_TOKEN}`);
  console.log(`Постоянная ссылка на игру: ${GAME_SITE}`);
  // если задан GH_TOKEN — сами обновляем адрес туннеля в live.json, чтобы
  // игроки всегда заходили по одной и той же ссылке
  if (GH_TOKEN) {
    let tries = 0;
    const tick = async () => {
      tries++;
      const r = await publishLive().catch((e) => ({ ok: false, error: String(e) }));
      if (!r.ok) {
        console.log(`[live] публикация не удалась (попытка ${tries}): ${r.error}`);
        if (tries < 6) setTimeout(tick, 5000);
      }
    };
    setTimeout(tick, 2500);
  }
});
