// Сторож админ-каталога: ровно 100 кнопок, нет пустых групп,
// нет дублей id, у каждой кнопки есть обработчик.
const fs = require('fs');
const s = fs.readFileSync('server/server.js', 'utf8');
const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1; };

const cat = s.match(/const ADMIN_ACTIONS = \[[\s\S]*?\n\];/)[0];
const ids = [...cat.matchAll(/\{ id: '([a-z_0-9]+)'/g)].map((m) => m[1]);
const groupIds = [...s.match(/const ADMIN_GROUPS = \{[\s\S]*?\n\};/)[0]
  .matchAll(/(\w+):\s*'/g)].map((m) => m[1]);

const blk = (n) => { const b = s.indexOf(`const ${n} = {`); return s.slice(b, s.indexOf('\n};', b)); };
const keys = (t) => [...t.matchAll(/(?:^|[\s,{])([a-z_0-9]+):\s*\(/gm)].map((m) => m[1]);
const handlers = new Set([...keys(blk('ADMIN_HANDLERS')), ...keys(blk('ITEM_HANDLERS'))]);

const counts = {};
for (const m of cat.matchAll(/g: '(\w+)'/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;

if (ids.length !== 100) fail(`кнопок ${ids.length}, ожидается 100`);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
if (dup.length) fail('дублирующиеся id: ' + dup.join(', '));
const empty = groupIds.filter((g) => !counts[g]);
if (empty.length) fail('пустые группы: ' + empty.join(', '));
const orphan = ids.filter((i) => !handlers.has(i));
if (orphan.length) fail('кнопки без обработчика: ' + orphan.join(', '));
const unknown = Object.keys(counts).filter((g) => !groupIds.includes(g));
if (unknown.length) fail('кнопки в необъявленной группе: ' + unknown.join(', '));

if (!process.exitCode) {
  console.log('✓ админ-каталог: 100 кнопок, 8 групп', JSON.stringify(counts));
}
