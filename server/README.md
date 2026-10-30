# Сервер и база данных

## Что внутри
- `server.js` — WebSocket-сервер + SQLite (`better-sqlite3`). Протокол совпадает с клиентом игры:
  `login` → `login_success`, `move`, `players_list`, `chat`, `error`; дополнительно `set_plate` и поля `car_id` / `car_number`.
- `colab_setup.py` — ячейка Colab: монтирует Google Диск, ставит зависимости, поднимает сервер и ngrok-туннель.

## Быстрый старт в Colab
1. Загрузите `server.js` в `MyDrive/MyGame/`.
2. Откройте новую ячейку и вставьте код из `colab_setup.py`, впишите токен ngrok.
3. Скопируйте выведенный адрес `wss://...` и вставьте его в меню игры («Адрес сервера»), либо в `VITE_ONLINE_URL`.

## Схема базы (SQLite)
| Таблица | Поля |
|---|---|
| `players` | id, name (уникальный), gender, money, car_id, car_number, house_id, pos_x, pos_z, pos_rot, is_admin, banned, ban_reason, updated_at |
| `chat_log` | id, name, text, t |

## Почему SQLite на Google Диске — рабочий вариант
- База — один файл `game.db` в `MyDrive/MyGame`, поэтому данные не теряются при перезапуске Colab.
- WAL-режим + запись `move` на каждое сообщение даёт до ~15 записей/сек на игрока; для 10–20 игроков это нормально.
- Если игроков станет больше, база легко переносится в Postgres (Supabase) — структура таблиц та же, меняется только драйвер.
- Токен ngrok храните приватно: с ним можно перехватить туннель.

## Проверка
```
node server.js            # локально: база game.db рядом
curl localhost:3000       # ответ: Los-Gorod server OK
```
