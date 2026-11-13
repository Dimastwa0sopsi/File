# Готовый код: группа «🚗 Транспорт» в Colab-панели (85 → 100 кнопок)

Это **рабочий, проверенный код** для части 3 промта `ПРОМТ-ОБНОВЛЕНИЕ-RP23.md`.
Правится **один файл** — `server/server.js`. Файл `server/colab_cell.py` **трогать не нужно**:
функция `catalog_button(d)` (строка 815) строит кнопку из флагов `need / car / number / confirm`
автоматически, а в списке `order` группа `'car'` уже есть — она просто не рисовалась,
потому что в каталоге под неё не было ни одной кнопки (`if items:`).

Вкладка в панели уже подписана **«🎛 100 кнопок»** (`colab_cell.py:1272`), хотя кнопок было 85.
После этой правки подпись станет правдой.

Проверено на копии файла:

```
node --check server/server.js        ✓
кнопок: 100  (было 85)
группы: money 15, mod 17, tp 19, car 12, chat 10, player 10, server 9, event 8
дубли id: нет
кнопка без обработчика: нет
```

---

## Вставка 1 — три точки телепорта на пляж

**Файл:** `server/server.js`, объект `TP_POINTS` (строка ~579).

НАЙТИ последнюю строку объекта:

```js
  village_o: [1170, 1560], center: [540, 540], fishshop: [-140, 520],
};
```

ЗАМЕНИТЬ на:

```js
  village_o: [1170, 1560], center: [540, 540], fishshop: [-140, 520],
  // пляж RP #23: три зоны берега отдельными точками
  beach_sport: [-232, 508], beach_boats: [-244, 540], beach_cabins: [-191, 498],
};
```

> Координаты не выдуманы — это фактические центры групп пропов в `worldgen.ts`:
> волейбольные сетки `(-236, 508)`, лодки и причал `(-249, 559) / (-251, 540)`,
> кабинки и души `(-191, 498) / (-188, 497)`.

---

## Вставка 2 — 15 кнопок в каталог

**Файл:** `server/server.js`, массив `ADMIN_ACTIONS` (строка ~272).

НАЙТИ стык групп «Телепорт» и «Чат»:

```js
  { id: 'tp_all_to_player', g: 'tp', t: '👥 Всех к игроку', need: false, target: true },
  // ——— Чат (10) ———
```

ЗАМЕНИТЬ на:

```js
  { id: 'tp_all_to_player', g: 'tp', t: '👥 Всех к игроку', need: false, target: true },
  { id: 'tp_beach_sport', g: 'tp', t: '🏐 Пляж · спортзона', need: true },
  { id: 'tp_beach_boats', g: 'tp', t: '🛶 Пляж · лодочная станция', need: true },
  { id: 'tp_beach_cabins', g: 'tp', t: '🚿 Пляж · кабинки и души', need: true },
  // ——— Транспорт (12) ———
  // группа car была объявлена в ADMIN_GROUPS, но стояла пустой: вкладка в Colab не открывалась
  { id: 'car_set', g: 'car', t: '✏️ Выдать модель из поля', need: true, car: true, number: true },
  { id: 'car_spawn', g: 'car', t: '🎁 Заспавнить рядом (без собственности)', need: true, car: true },
  { id: 'car_give_premium', g: 'car', t: '🏎 Премиум «Феррато»', need: true },
  { id: 'car_give_sport', g: 'car', t: '🚘 Спорткар «Вираж»', need: true },
  { id: 'car_give_suv', g: 'car', t: '🚙 Внедорожник «Тайга»', need: true },
  { id: 'car_give_moto', g: 'car', t: '🏍 Спортбайк', need: true },
  { id: 'car_give_heli', g: 'car', t: '🚁 Вертолёт', need: true },
  { id: 'car_give_truck', g: 'car', t: '🚛 Фура с платформой', need: true },
  { id: 'car_give_bus', g: 'car', t: '🚌 Городской автобус', need: true },
  { id: 'car_give_scooter', g: 'car', t: '🛴 Самокат «X1»', need: true },
  { id: 'car_plate_random', g: 'car', t: '🎲 Случайный номер', need: true },
  { id: 'car_clear', g: 'car', t: '🗑 Забрать транспорт', need: true, confirm: true },
  // ——— Чат (10) ———
```

Заодно поправьте счётчик в комментарии выше по файлу (строка ~307):
`// ——— Телепорт (14) ———` → `// ——— Телепорт (19) ———`.

---

## Вставка 3 — хелпер `giveCar`

**Файл:** `server/server.js`, перед функцией `randomPlate()` (строка ~597).

НАЙТИ:

```js
function randomPlate() {
```

ЗАМЕНИТЬ на:

```js
/** выдать пресет из CARS, номер оставляем прежний */
function giveCar(a, key) {
  if (!a.name) return noPlayer();
  const row = rowOf(a.name); if (!row) return { ok: false, error: `Игрок ${a.name} не найден` };
  const id = CARS[key]; if (!id) return { ok: false, error: 'Неизвестный пресет: ' + key };
  return setCar(a.name, id, row.car_number || '');
}
function randomPlate() {
```

> Константа `CARS` (строка 585) до этой правки **нигде не использовалась** — теперь она в деле:
> `premium:'ferrato'`, `sport:'virage'`, `suv:'taiga'`, `moto:'moto_sport'`,
> `heli:'heli'`, `truck:'semi_flat'`, `bus:'bus_city'`, `scooter:'scooter_x1'`.

---

## Вставка 4 — обработчики транспорта

**Файл:** `server/server.js`, объект `ADMIN_HANDLERS`, сразу после готового `car_spawn` (строка ~715).

НАЙТИ:

```js
    send(on.ws, { type: 'adm', act: 'carspawn', carId });
    return { ok: true, message: `${a.name}: ${carId} появилась рядом (не в собственности)` };
  },
```

ЗАМЕНИТЬ на:

```js
    send(on.ws, { type: 'adm', act: 'carspawn', carId });
    return { ok: true, message: `${a.name}: ${carId} появилась рядом (не в собственности)` };
  },
  // пресеты из CARS — быстрая выдача популярных моделей одной кнопкой
  car_give_premium: (a) => giveCar(a, 'premium'),
  car_give_sport: (a) => giveCar(a, 'sport'),
  car_give_suv: (a) => giveCar(a, 'suv'),
  car_give_moto: (a) => giveCar(a, 'moto'),
  car_give_heli: (a) => giveCar(a, 'heli'),
  car_give_truck: (a) => giveCar(a, 'truck'),
  car_give_bus: (a) => giveCar(a, 'bus'),
  car_give_scooter: (a) => giveCar(a, 'scooter'),
  // номер по ГОСТу: три цифры и три буквы из допустимого алфавита
  car_plate_random: (a) => {
    if (!a.name) return noPlayer();
    const row = rowOf(a.name); if (!row) return { ok: false, error: `Игрок ${a.name} не найден` };
    if (!row.car_id) return { ok: false, error: `${a.name}: сначала выдайте транспорт` };
    return setCar(a.name, row.car_id, randomPlate());
  },
  car_clear: (a) => {
    if (!a.name) return noPlayer();
    const row = rowOf(a.name); if (!row) return { ok: false, error: `Игрок ${a.name} не найден` };
    if (!row.car_id) return { ok: false, error: `${a.name}: транспорта и так нет` };
    const had = row.car_id;
    q.car.run('', '', a.name);
    const on = liveOf(a.name);
    if (on) { on.row.car_id = ''; on.row.car_number = ''; pushPlayers(); }
    return { ok: true, message: `${a.name}: транспорт «${had}» забран` };
  },
```

---

## Вставка 5 — обработчики пляжных телепортов

**Файл:** `server/server.js`, объект `ADMIN_HANDLERS` (строка ~688).

НАЙТИ:

```js
  tp_fishshop: (a) => tpPoint(a, 'fishshop'),
```

ЗАМЕНИТЬ на:

```js
  tp_fishshop: (a) => tpPoint(a, 'fishshop'),
  tp_beach_sport: (a) => tpPoint(a, 'beach_sport'), tp_beach_boats: (a) => tpPoint(a, 'beach_boats'),
  tp_beach_cabins: (a) => tpPoint(a, 'beach_cabins'),
```

---

## Проверка (обязательна после правок)

```bash
node --check server/server.js
```

И скрипт-сторож — сохраните как `scripts/admincheck.cjs`, запуск `node scripts/admincheck.cjs`:

```js
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
```

Ожидаемый вывод:

```
✓ админ-каталог: 100 кнопок, 8 групп {"money":15,"mod":17,"tp":19,"car":12,"chat":10,"player":10,"server":9,"event":8}
```

---

## Чего делать НЕЛЬЗЯ

1. **Не править `colab_cell.py` в корне репозитория.** Это расходящийся дубликат (1623 строки против
   1619 в `server/`); ячейка Colab качает именно серверную копию. Если правка в Python всё-таки
   понадобится — делать её синхронно в **обеих** копиях.
2. **Не публиковать ngrok-токен.** В `colab_cell.py:30` захардкожен authtoken,
   а `ADMIN_TOKEN` по умолчанию `losgorod-admin`. Репозиторий публичный — токен нужно отозвать.
3. **Не дублировать `car_set` и `car_spawn`** — их обработчики уже есть в `ADMIN_HANDLERS`
   (строки 706–715), им не хватало только кнопок в каталоге.
4. **Не менять формат ответа.** Обработчик возвращает `{ ok: true, message }` либо
   `{ ok: false, error }`; для таблиц можно добавить `rows: [...]`.
5. **Не добавлять лодки как управляемый транспорт** — в `VEHICLES` 120 моделей, лодок нет,
   водной физики тоже.
