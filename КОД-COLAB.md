# Код для Colab — запуск сервера «Лос-Города»

Ячейка одна. Копируете, вставляете в Colab, запускаете — она сама скачает свежую панель,
поднимет сервер, туннель и покажет админку со 100 кнопками.
Повторный запуск ничего не ломает: старый процесс на порту заменяется сам.

---

## Шаг 1. Токен ngrok — в «Секреты», а не в код

Слева в Colab значок **🔑 (Секреты)** → «Добавить новый секрет»:

| Имя секрета    | Значение                                        | Обязателен |
|----------------|-------------------------------------------------|------------|
| `NGROK_TOKEN`  | токен из личного кабинета ngrok                  | да, иначе не будет туннеля |
| `ADMIN_TOKEN`  | свой пароль к админ-панели (например `moi-parol`) | нет, по умолчанию `losgorod-admin` |
| `GH_TOKEN`     | токен GitHub с правом `contents:write`           | нет, нужен только для автопубликации адреса |

Напротив каждого секрета включите переключатель **«Доступ для этого блокнота»**.

> ⚠️ Прежний токен ngrok (`3LIMieFr…`) лежал прямо в коде в публичном репозитории —
> его видел кто угодно. **Отзовите его** в кабинете ngrok (Your Authtoken → Revoke),
> выпустите новый и положите в секрет. Из кода токен теперь убран.

---

## Шаг 2. Ячейка (копировать целиком)

```python
# ======================================================================
#  «Лос-Город» — Colab, ячейка-загрузчик.
#  Качает свежий server/colab_cell.py из репозитория и выполняет его.
#  Токены брать не из кода, а из «Секретов» Colab: NGROK_TOKEN, GH_TOKEN, ADMIN_TOKEN.
# ======================================================================
import base64
import json
import os
import urllib.request

REPO = 'Dimastwa0sopsi/File'
PATH = 'server/colab_cell.py'
# первая доступная ветка побеждает; чтобы попробовать ещё не влитую правку,
# впишите её первой строкой: BRANCHES = ['arena/40171a84-file', 'main']
BRANCHES = ['main']
API = 'https://api.github.com/repos/{repo}/contents/{path}?ref={ref}'
MIRRORS = [
    'https://cdn.jsdelivr.net/gh/{repo}@{ref}/{path}',
    'https://fastly.jsdelivr.net/gh/{repo}@{ref}/{path}',
    'https://cdn.statically.io/gh/{repo}/{ref}/{path}',
]
LOCAL = '/content/colab_cell.py'


def fetch():
    """GitHub API → jsDelivr → fastly → Statically (raw.githubusercontent не используем)"""
    for ref in BRANCHES:
        try:
            req = urllib.request.Request(API.format(repo=REPO, path=PATH, ref=ref),
                                         headers={'User-Agent': 'losgorod-colab'})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = base64.b64decode(json.loads(r.read().decode())['content']).decode('utf-8')
            if len(data) > 20000:
                return data, f'api.github.com @ {ref}'
        except Exception as e:                             # noqa: BLE001
            print(f'   мимо api @ {ref}: {e}')
    for ref in BRANCHES:
        for tpl in MIRRORS:
            url = tpl.format(repo=REPO, ref=ref, path=PATH)
            try:
                with urllib.request.urlopen(url, timeout=30) as r:
                    data = r.read().decode('utf-8')
                if len(data) > 20000:
                    return data, f'{url.split("/")[2]} @ {ref}'
            except Exception as e:                         # noqa: BLE001
                print(f'   мимо {url.split("/")[2]} @ {ref}: {e}')
    raise SystemExit('❌ Не удалось скачать colab_cell.py — проверьте интернет и ветку в BRANCHES')


src, where = fetch()
open(LOCAL, 'w', encoding='utf-8').write(src)
# сервер скачиваем из той же ветки, что и саму ячейку
os.environ.setdefault('GH_BRANCH', where.split('@')[-1].strip())
print(f'⬇️ colab_cell.py: {len(src) // 1024} КБ с {where} → {LOCAL}', flush=True)
exec(compile(src, LOCAL, 'exec'), {'__name__': '__main__', '__file__': LOCAL})
```

Этот же текст лежит в репозитории: `server/colab_boot.py`.

---

## Что увидите при запуске

```
⬇️ colab_cell.py: 72 КБ с api.github.com @ main → /content/colab_cell.py
🚀 Лос-Город: поднимаем сервер…  режим: 🌍 онлайн
💾 Диск смонтирован: /content/drive/MyDrive/MyGame
✅ server.js с api.github.com (76 КБ)
✅ Зависимости на месте (ws, better-sqlite3)
🟢 Сервер запущен, PID 1234
🌐 Туннель поднят: https://xxxx-yy-zz.ngrok-free.app
🔗 Постоянная ссылка опубликована в server/live.json
```

Дальше открывается панель: выбор игрока одним списком, 💵 деньги (включая «💰 Миллион»
и «💵 Ровно 1 000 000»), 🎁 предметы и инвентарь, «👢 Выгнать всех», вкладки каталога —
**100 кнопок в 8 группах**: 💵 Деньги 15, 🛡 Модерация 17, 🚀 Телепорт 19, 🚗 Транспорт 12,
📢 Чат 10, 👤 Игрок 10, 🖥 Сервер 9, 🎉 События 8.

Игроки заходят по постоянной ссылке **https://dimastwa0sopsi.github.io/File/** —
адрес туннеля она берёт сама из `server/live.json`, вручную ничего вводить не нужно.

---

## Настройки, которые иногда нужны

Задаются секретом Colab или переменной окружения — в код лезть не надо:

| Имя            | Зачем                                                        |
|----------------|--------------------------------------------------------------|
| `GH_BRANCH`    | откуда брать `server.js` (по умолчанию `main`)                |
| `PORT`         | порт сервера, по умолчанию `3000`                             |
| `RESTART`      | `1` — перезапустить сервер, даже если он уже работает         |
| `FORCE_UPDATE` | `1` — перекачать `server.js`, игнорируя кэш                   |
| `OFFLINE`      | `1` — совсем без сети: локальный сервер и панель               |
| `SHOW_PANEL`   | `0` — без панели (сервер поднимется молча)                     |
| `NGROK_DOMAIN` | постоянный домен ngrok, если он у вас есть                     |

Пример прямо в блокноте, до запуска ячейки:

```python
import os
os.environ['RESTART'] = '1'      # перезапустить сервер
os.environ['GH_BRANCH'] = 'main' # ветка, откуда берём server.js
```

---

## Если что-то пошло не так

| Что видно                                   | Что делать |
|---------------------------------------------|------------|
| `Туннель не поднялся`                        | нет или просрочен `NGROK_TOKEN`: выпустите новый и положите в секрет 🔑 |
| `Не удалось скачать colab_cell.py`           | Colab без сети либо ветка в `BRANCHES` не существует |
| `Каталог предметов не загрузился: 404`       | на порту висит старый `server.js`: запустите с `FORCE_UPDATE=1` и `RESTART=1` |
| Панель не рисуется, вместо неё текст          | в рантайме нет `ipywidgets` — текстовая панель умеет то же самое, игрок выбирается номером |
| `Придумайте пароль` у игрока при входе        | это нормально: онлайн требует пароль от 4 символов, он привязывается к нику при первом входе |
| Игроки не видят друг друга                    | обновите страницу игры: мультиплеер приезжает на сайт после слияния PR #54 |

---

## Проверено

- Ячейка прогнана целиком в офлайн-режиме: нашла `server.js`, поправила `package.json`,
  нашла зависимости, подняла сервер и выдала сводку.
- `GET /admin/actions` отвечает каталогом: **100 кнопок, 8 групп**, в том числе группа
  `car` из 12 кнопок (`car_give_sport`, `car_give_heli`, `car_plate_random`, …).
- Из корневой копии `colab_cell.py` убраны шесть кнопок-пустышек («Спорткар», «Внедорожник»,
  «Мотоцикл», «Случайная», «Новый номер», «Снять номер»): они звали действия `car_sport`,
  которых на сервере нет. Настоящая группа «🚗 Транспорт» приходит из каталога сервера.
- Обе копии ячейки (`colab_cell.py` в корне и `server/colab_cell.py`) теперь совпадают байт в байт.
