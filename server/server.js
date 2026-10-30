// Сервер «Лос-Города»: WebSocket + SQLite (better-sqlite3), база лежит на Google Drive.
// Протокол: login / login_success / move / players_list / chat / error, плюс номера машин.
const http = require('http');
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const db = new Database(process.env.DB_FILE || 'game.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    gender TEXT NOT NULL DEFAULT 'm',
    money INTEGER NOT NULL DEFAULT 500,
    car_id TEXT NOT NULL DEFAULT 'lada',
    car_number TEXT NOT NULL DEFAULT '',
    house_id TEXT NOT NULL DEFAULT '',
    pos_x REAL NOT NULL DEFAULT 516,
    pos_z REAL NOT NULL DEFAULT 491.5,
    pos_rot REAL NOT NULL DEFAULT 0,
    is_admin INTEGER NOT NULL DEFAULT 0,
    banned INTEGER NOT NULL DEFAULT 0,
    ban_reason TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS chat_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, text TEXT, t INTEGER
  );
`);

const q = {
  byName: db.prepare('SELECT * FROM players WHERE name = ?'),
  create: db.prepare('INSERT INTO players (name, gender, updated_at) VALUES (?, ?, ?)'),
  admin: db.prepare('UPDATE players SET is_admin = 1 WHERE name = ?'),
  ban: db.prepare('UPDATE players SET banned = 1, ban_reason = ? WHERE name = ?'),
  move: db.prepare('UPDATE players SET pos_x = ?, pos_z = ?, pos_rot = ?, updated_at = ? WHERE id = ?'),
  money: db.prepare('UPDATE players SET money = ? WHERE id = ?'),
  car: db.prepare('UPDATE players SET car_id = ?, car_number = ? WHERE id = ?'),
  log: db.prepare('INSERT INTO chat_log (name, text, t) VALUES (?, ?, ?)'),
};

// админ по умолчанию
if (!q.byName.get('Kitty_Kittys')) q.create.run('Kitty_Kittys', 'f', Date.now());
q.admin.run('Kitty_Kittys');

const active = new Map(); // id → { ws, row }
const server = http.createServer((_, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Los-Gorod server OK'); });
const wss = new WebSocket.Server({ server });

const send = (ws, obj) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); };
const broadcast = (obj) => { const s = JSON.stringify(obj); wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(s); }); };

function playersList() {
  return [...active.values()].map(({ row }) => ({
    id: row.id, name: row.name, gender: row.gender, money: row.money,
    x: row.pos_x, z: row.pos_z, rot: row.pos_rot,
    vehicle: row.car_id || null, number: row.car_number || '',
  }));
}
const pushPlayers = () => broadcast({ type: 'players_list', players: playersList() });

wss.on('connection', (ws) => {
  let me = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.type === 'login') {
      const name = String(m.name || '').trim().slice(0, 16);
      if (name.length < 2) return send(ws, { type: 'error', text: 'Ник должен быть от 2 до 16 символов' });
      let row = q.byName.get(name);
      if (!row) { q.create.run(name, m.gender === 'f' ? 'f' : 'm', Date.now()); row = q.byName.get(name); }
      if (row.banned) return send(ws, { type: 'error', text: row.ban_reason || 'Вы забанены' });
      me = row; active.set(row.id, { ws, row }); ws.playerId = row.id;
      send(ws, { type: 'login_success', player: {
        id: row.id, name: row.name, gender: row.gender, money: row.money,
        x: row.pos_x, z: row.pos_z, rot: row.pos_rot, carNumber: row.car_number,
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
      if (text.startsWith('/') && row.is_admin === 1) {
        const [, cmd, arg] = text.trim().split(/\s+/);
        if (cmd === '/ban' && arg) { q.ban.run('Нарушение правил', arg); send(ws, { type: 'chat', name: 'СИСТЕМА', text: `${arg} забанен` }); return; }
        if (cmd === '/admin' && arg) { q.admin.run(arg); send(ws, { type: 'chat', name: 'СИСТЕМА', text: `${arg} теперь админ` }); return; }
        if (cmd === '/money' && arg) { const v = Number(arg) | 0; q.money.run(v, row.id); row.money = v; send(ws, { type: 'chat', name: 'СИСТЕМА', text: `баланс ${v}` }); return; }
      }
      q.log.run(row.name, text, Date.now());
      broadcast({ type: 'chat', id: row.id, name: row.name, text });
      return;
    }

    if (m.type === 'set_plate') {
      const num = String(m.number || '').slice(0, 9);
      q.car.run(String(m.carId || row.car_id || 'lada'), num, row.id);
      row.car_number = num; pushPlayers();
      send(ws, { type: 'chat', name: 'СИСТЕМА', text: `номер ${num} сохранён` });
    }
  });
  ws.on('close', () => { if (ws.playerId) { active.delete(ws.playerId); pushPlayers(); } });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Los-Gorod server on :${PORT}, db=${db.name}`));
