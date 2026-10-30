// Сервер «Лос-Города»: WebSocket + SQLite (better-sqlite3), база лежит на Google Drive.
// Протокол игры: login / login_success / move / players_list / chat / error, плюс номера машин.
// Управление — не в игре, а через HTTP-панель из ячейки Colab (/admin): деньги, бан, кик, телепорт.
const http = require('http');
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
  chatTail: db.prepare('SELECT name, text, t FROM chat_log ORDER BY id DESC LIMIT 40'),
};

const active = new Map(); // id → { ws, row }
const send = (ws, obj) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };

function playersList() {
  return [...active.values()].map(({ row }) => ({
    id: row.id, name: row.name, gender: row.gender, money: row.money,
    x: row.pos_x, z: row.pos_z, rot: row.pos_rot,
    vehicle: row.car_id || null, number: row.car_number || '',
  }));
}
const broadcast = (obj) => { const s = JSON.stringify(obj); wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(s); }); };
const pushPlayers = () => broadcast({ type: 'players_list', players: playersList() });
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
  };
}

function adminAction(a) {
  const name = String(a.name ?? '').trim();
  const online = name ? onlineByName(name) : null;
  switch (a.action) {
    case 'money': {
      if (!name) return { ok: false, error: 'Не указан игрок' };
      const row = q.byName.get(name);
      if (!row) return { ok: false, error: 'Игрок не найден' };
      const amount = Math.round(Number(a.amount) || 0);
      const next = a.mode === 'add' ? row.money + amount : amount;
      if (!isFinite(next)) return { ok: false, error: 'Неверная сумма' };
      const value = Math.max(0, Math.min(2147483647, Math.round(next)));
      q.money.run(value, row.name);
      row.money = value;
      if (online) { online.row.money = value; send(online.ws, { type: 'login_success', player: { ...online.row } }); }
      pushPlayers();
      return { ok: true, message: `${row.name}: баланс $${value.toLocaleString('ru')}` };
    }
    case 'ban': {
      if (!name) return { ok: false, error: 'Не указан игрок' };
      const reason = String(a.reason || 'Нарушение правил').slice(0, 120);
      q.ban.run(reason, name);
      if (online) { send(online.ws, { type: 'error', text: reason + ' · вы забанены' }); try { online.ws.close(); } catch { /* */ } active.delete(online.row.id); }
      pushPlayers();
      return { ok: true, message: `${name} забанен: ${reason}` };
    }
    case 'unban': {
      if (!name) return { ok: false, error: 'Не указан игрок' };
      q.unban.run(name);
      return { ok: true, message: `${name} разбанен` };
    }
    case 'kick': {
      if (!online) return { ok: false, error: 'Игрок не в сети' };
      send(online.ws, { type: 'error', text: 'Вас отключил администратор' });
      try { online.ws.close(); } catch { /* */ }
      active.delete(online.row.id);
      pushPlayers();
      return { ok: true, message: `${name} отключён` };
    }
    case 'tp': {
      if (!name) return { ok: false, error: 'Не указан игрок' };
      const x = Number(a.x), z = Number(a.z);
      if (!isFinite(x) || !isFinite(z)) return { ok: false, error: 'Нужны координаты X и Z' };
      q.pos.run(x, z, Date.now(), name);
      if (online) {
        online.row.pos_x = x; online.row.pos_z = z;
        send(online.ws, { type: 'adm', act: 'tp', x, z });
        pushPlayers();
      }
      return { ok: true, message: `${name} → X ${Math.round(x)}, Z ${Math.round(z)}` };
    }
    case 'car': {
      if (!name) return { ok: false, error: 'Не указан игрок' };
      const carId = String(a.carId || 'lada');
      const number = String(a.number || '').slice(0, 9);
      q.car.run(carId, number, name);
      const row = q.byName.get(name);
      if (online && row) { online.row.car_id = carId; online.row.car_number = number; pushPlayers(); }
      return { ok: true, message: `${name}: машина ${carId}${number ? ' · ' + number : ''}` };
    }
    case 'announce': {
      const text = String(a.text || '').slice(0, 200);
      if (!text) return { ok: false, error: 'Пустое объявление' };
      broadcast({ type: 'chat', name: 'СИСТЕМА', text });
      q.log.run('СИСТЕМА', text, Date.now());
      return { ok: true, message: 'Объявление отправлено' };
    }
    case 'unbind': {
      if (!name) return { ok: false, error: 'Не указан игрок' };
      q.token.run('', name);
      return { ok: true, message: `${name}: привязка устройства сброшена, можно войти с другого` };
    }
    case 'clearchat': {
      q.clearChat.run();
      return { ok: true, message: 'Чат очищен' };
    }
    case 'delete': {
      if (!name) return { ok: false, error: 'Не указан игрок' };
      q.del.run(name);
      if (online) { send(online.ws, { type: 'error', text: 'Аккаунт удалён администратором' }); try { online.ws.close(); } catch { /* */ } active.delete(online.row.id); }
      pushPlayers();
      return { ok: true, message: `${name} удалён из базы` };
    }
    case 'resetpos': {
      if (!name) return { ok: false, error: 'Не указан игрок' };
      q.pos.run(516, 491.5, Date.now(), name);
      if (online) { online.row.pos_x = 516; online.row.pos_z = 491.5; send(online.ws, { type: 'adm', act: 'tp', x: 516, z: 491.5 }); pushPlayers(); }
      return { ok: true, message: `${name} на точке появления` };
    }
    default:
      return { ok: false, error: 'Неизвестное действие: ' + a.action };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Los-Gorod server OK'); return; }
  if (!url.pathname.startsWith('/admin')) { json(res, 404, { ok: false, error: 'not found' }); return; }
  const token = url.searchParams.get('token') || req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) { json(res, 403, { ok: false, error: 'Неверный токен админ-панели' }); return; }
  if (req.method === 'GET' && url.pathname === '/admin/state') { json(res, 200, adminState()); return; }
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
      send(ws, { type: 'login_success', token: row.token || '', player: {
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
      const text = String(m.text || '').slice(0, 200);
      if (!text) return;
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
