# Colab: две короткие ячейки

Всё управление теперь в двух ячейках. Первая поднимает сервер, туннель, публикует
постоянную ссылку и сразу показывает админ-панель. Вторая нужна, только если панель
закрылась или вы переподключились к рантайму.

> `server.js`, `colab_setup.py` и `colab_admin.py` всегда скачиваются из репозитория
> (jsDelivr → fastly.jsDelivr → Statically → raw.githack; `raw.githubusercontent.com`
> не используется). Перезапуск ячейки ничего не ломает: работающий сервер она просто
> переиспользует.

## Ячейка 1 — сервер + туннель + панель

```python
# ===== Лос-Город: настройки (правьте только этот словарь) =====
import os
os.environ.update({
    'NGROK_TOKEN':  '',            # dashboard.ngrok.com/get-started/your-authtoken
    'NGROK_DOMAIN': '',            # необязательно: статический домен ngrok
    'GH_TOKEN':     '',            # необязательно: contents:write → live.json обновится сам
    'GROQ_API_KEY': '',            # необязательно: свой ключ ChatGIMPT вместо встроенного
    'ADMIN_TOKEN':  'losgorod-admin',
    'FORCE_UPDATE': '0',           # '1' — принудительно перекачать server.js
    'RESTART':      '0',           # '1' — перезапустить сервер
    'SHOW_PANEL':   '1',           # '0' — без админ-панели
})

# ===== запуск (ничего менять не нужно) =====
import urllib.request
GH = 'Dimastwa0sopsi/File'
src = None
for u in (f'https://cdn.jsdelivr.net/gh/{GH}@main/server/colab_setup.py',
          f'https://fastly.jsdelivr.net/gh/{GH}@main/server/colab_setup.py',
          f'https://cdn.statically.io/gh/{GH}/main/server/colab_setup.py',
          f'https://raw.githack.com/{GH}/main/server/colab_setup.py'):
    try:
        src = urllib.request.urlopen(u, timeout=30).read().decode('utf-8')
        print('colab_setup.py:', u.split('/')[2]); break
    except Exception as e:
        print('  мимо:', u.split('/')[2], e)
if not src:
    raise SystemExit('Не удалось скачать colab_setup.py — проверьте интернет рантайма')
exec(compile(src, 'colab_setup.py', 'exec'), {'__name__': '__main__'})
```

Что делает ячейка по шагам (в выводе видно каждый шаг):

1. 💾 монтирует Google Диск и создаёт `MyDrive/MyGame`;
2. ⬇️ скачивает `server.js` только если он изменился (хеш сравнивается, лишнего трафика нет);
3. 🧩 убирает `"type": "module"` из `package.json` — иначе `require()` падает;
4. 📦 ставит `ws`, `better-sqlite3`, `pyngrok` только если их нет;
5. 🟢 запускает `node server.js` (или переиспользует уже работающий);
6. 🌐 поднимает ngrok-туннель (или берёт существующий);
7. 📡 публикует адрес в `server/live.json` — игроки адрес сервера не вводят;
8. 🤖 проверяет ChatGIMPT (`/ai/health`) — ключ модели остаётся на сервере;
9. 👑 показывает админ-панель с 100 кнопками.

## Ячейка 2 — только админ-панель

Нужна после переподключения к рантайму или если закрыли вывод первой ячейки.

```python
# ===== Лос-Город: админ-панель (100 кнопок) =====
import os, urllib.request
os.environ.setdefault('ADMIN_API', 'http://127.0.0.1:3000')
os.environ.setdefault('ADMIN_TOKEN', 'losgorod-admin')
os.environ.setdefault('GAME_DIR', '/content/drive/MyDrive/MyGame')
GH = 'Dimastwa0sopsi/File'
src = None
for u in (f'https://cdn.jsdelivr.net/gh/{GH}@main/server/colab_admin.py',
          f'https://fastly.jsdelivr.net/gh/{GH}@main/server/colab_admin.py',
          f'https://cdn.statically.io/gh/{GH}/main/server/colab_admin.py',
          f'https://raw.githack.com/{GH}/main/server/colab_admin.py'):
    try:
        src = urllib.request.urlopen(u, timeout=30).read().decode('utf-8')
        if len(src) > 5000:
            print('панель:', u.split('/')[2]); break
        src = None
    except Exception as e:
        print('  мимо:', u.split('/')[2], e)
if not src:
    raise SystemExit('Не удалось скачать colab_admin.py')
exec(compile(src, 'colab_admin.py', 'exec'), {'__name__': '__main__'})
```

## Частые вопросы

| Ситуация | Что делать |
|---|---|
| Сервер упал, в логе `MODULE_NOT_FOUND` | запустить ячейку 1 заново: она доставит зависимости |
| В игре «Сервер отключен» | панель → «🌐 Поднять туннель» → «📡 Постоянная ссылка» |
| Адрес сервера сменился после перезапуска Colab | так и должно быть; игроки всё равно заходят по постоянной ссылке |
| Нужно обновить серверный код | `FORCE_UPDATE=1`, затем ячейка 1 |
| ChatGIMPT отвечает «по памяти игры» | в панели строка `🤖 ChatGIMPT` покажет «выкл» или «нет ответа»; проверьте `GROQ_API_KEY` |
| Хочу выключить ассистента | `os.environ['AI_OFF'] = '1'` в настройках и `RESTART=1` |
| Нужен чистый старт базы | удалить `MyDrive/MyGame/game.db` (аккаунты пропадут!) |

## Почему не `raw.githubusercontent.com`

Из Colab этот домен отдаёт 429/таймаут. Скрипт использует цепочку зеркал
jsDelivr → fastly → Statically → raw.githack, поэтому обычно хватает первого.
