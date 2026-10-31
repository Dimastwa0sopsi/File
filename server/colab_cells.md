# Готовые ячейки Colab (копировать целиком)

Две ячейки заменяют всю ручную возню: адрес сервера игроки больше не вводят,
`server.js` всегда скачивается из репозитория, а панель берётся из `server/colab_admin.py`.

## Ячейка 1 — сервер, туннель и публикация постоянной ссылки

```python
# ===== Лос-Город: сервер + ngrok + публикация постоянной ссылки =====
import os, subprocess, time, json, urllib.request

GAME_SITE    = 'https://dimastwa0sopsi.github.io/File/'   # ОДНА постоянная ссылка для игроков
GH_REPO      = 'Dimastwa0sopsi/File'
GH_TOKEN     = ''                    # необязательно: токен GitHub (contents: write) → live.json обновится сам
NGROK_TOKEN  = 'ВСТАВЬТЕ_ТОКЕН_NGROK' # https://dashboard.ngrok.com/get-started/your-authtoken
NGROK_DOMAIN = ''                    # необязательно: статический домен ('мой.ngrok-free.app')
PORT         = 3000
ADMIN_TOKEN  = 'losgorod-admin'
GAME_DIR     = '/content/drive/MyDrive/MyGame'
FORCE_UPDATE = 1                     # 1 — всегда перекачивать server.js из репозитория

def src_list(name):
    return [
        f'https://cdn.jsdelivr.net/gh/{GH_REPO}@main/server/{name}',
        f'https://fastly.jsdelivr.net/gh/{GH_REPO}@main/server/{name}',
        f'https://cdn.statically.io/gh/{GH_REPO}/main/server/{name}',
        f'https://raw.githack.com/{GH_REPO}/main/server/{name}',
    ]

def download(name):
    last = None
    for u in src_list(name):
        try:
            data = urllib.request.urlopen(u, timeout=25).read().decode('utf-8')
            if len(data) < 2000:
                raise ValueError('файл слишком короткий')
            return data
        except Exception as e:
            last = e
            print('  мимо:', u.split('/')[2], e)
    raise SystemExit(f'Не удалось скачать {name}: {last}')

# ── Диск и папка игры ────────────────────────────────────────────────
try:
    from google.colab import drive
    if not os.path.isdir('/content/drive/MyDrive'):
        drive.mount('/content/drive')
except Exception as e:
    print('Drive не смонтирован (локальный режим):', e)

os.makedirs(GAME_DIR, exist_ok=True)
os.chdir(GAME_DIR)

# ── server.js всегда свежий ──────────────────────────────────────────
if FORCE_UPDATE or not os.path.exists('server.js') or os.path.getsize('server.js') < 2000:
    print('Скачиваем server.js…')
    open('server.js', 'w', encoding='utf-8').write(download('server.js'))
print('server.js:', os.path.getsize('server.js'), 'байт')

# в MyGame не должно быть "type": "module", иначе require() в server.js упадёт
try:
    pkg = json.load(open('package.json'))
except Exception:
    pkg = {}
if pkg.get('type'):
    pkg.pop('type', None)
    json.dump(pkg, open('package.json', 'w'), ensure_ascii=False, indent=2)

# ── зависимости и перезапуск ─────────────────────────────────────────
subprocess.run('npm init -y > /dev/null 2>&1', shell=True)
subprocess.run('npm install ws better-sqlite3 > /dev/null 2>&1', shell=True)
subprocess.run('pip install -q pyngrok', shell=True)
subprocess.run('pkill -f "node server.js" || true', shell=True)
time.sleep(1)

DB_FILE = os.path.join(GAME_DIR, 'game.db')
env = dict(os.environ, DB_FILE=DB_FILE, PORT=str(PORT), ADMIN_TOKEN=ADMIN_TOKEN,
           GAME_SITE=GAME_SITE, GH_REPO=GH_REPO)
if GH_TOKEN:
    env['GH_TOKEN'] = GH_TOKEN
log = open(os.path.join(GAME_DIR, 'server.log'), 'w')
proc = subprocess.Popen(['node', 'server.js'], cwd=GAME_DIR, env=env,
                        stdout=log, stderr=subprocess.STDOUT)
time.sleep(2.5)
if proc.poll() is not None:
    print('❌ Сервер упал. Лог:')
    print(open(os.path.join(GAME_DIR, 'server.log')).read()[-3000:])
    raise SystemExit('Смотрите лог выше')

os.environ['ADMIN_API'] = f'http://127.0.0.1:{PORT}'
os.environ['ADMIN_TOKEN'] = ADMIN_TOKEN
print('✅ Сервер запущен, PID', proc.pid)

# ── туннель ──────────────────────────────────────────────────────────
from pyngrok import ngrok, conf
if NGROK_TOKEN and 'ВСТАВЬТЕ' not in NGROK_TOKEN:
    conf.get_default().auth_token = NGROK_TOKEN
for t in ngrok.get_tunnels():
    try:
        ngrok.disconnect(t.public_url)
    except Exception:
        pass
url = (ngrok.connect(PORT, 'http', domain=NGROK_DOMAIN).public_url
       if NGROK_DOMAIN else ngrok.connect(PORT, 'http').public_url)
os.environ['PUBLIC_URL'] = url
print('Туннель:', url)

# ── публикуем адрес: клиент найдёт его сам ───────────────────────────
time.sleep(1.5)
try:
    r = json.loads(urllib.request.urlopen(
        f'http://127.0.0.1:{PORT}/admin/publish?token={ADMIN_TOKEN}', timeout=20).read().decode('utf-8'))
    if r.get('ok'):
        print('📡 Адрес опубликован в server/live.json')
    else:
        print('⚠️ Публикация не удалась:', r.get('error'),
              '\n   (впишите GH_TOKEN выше или нажмите «📡 Постоянная ссылка» в панели)')
except Exception as e:
    print('⚠️ Публикация не удалась:', e)

print('\n' + '=' * 62)
print('ПОСТОЯННАЯ ССЫЛКА ДЛЯ ИГРОКОВ (адрес сервера вводить не нужно):')
print('   ', GAME_SITE)
print('Текущий адрес сервера (клиент находит сам):', url.replace('https://', 'wss://'))
print('Токен админ-панели:', ADMIN_TOKEN, '· база:', DB_FILE)
print('=' * 62)
```

## Ячейка 2 — админ-панель (100 кнопок, логи, рестарт)

```python
# ===== Лос-Город: админ-панель из репозитория =====
import urllib.request
GH_REPO = 'Dimastwa0sopsi/File'
FILES = [
    f'https://cdn.jsdelivr.net/gh/{GH_REPO}@main/server/colab_admin.py',
    f'https://fastly.jsdelivr.net/gh/{GH_REPO}@main/server/colab_admin.py',
    f'https://cdn.statically.io/gh/{GH_REPO}/main/server/colab_admin.py',
    f'https://raw.githack.com/{GH_REPO}/main/server/colab_admin.py',
]
src, err = None, None
for u in FILES:
    try:
        src = urllib.request.urlopen(u, timeout=25).read().decode('utf-8')
        if len(src) > 5000:
            print('Панель загружена:', u.split('/')[2])
            break
        src = None
    except Exception as e:
        err = e
if not src:
    raise SystemExit(f'Не удалось загрузить панель: {err}')

exec(compile(src, 'colab_admin.py', 'exec'), {'__name__': '__main__'})
```

> Панель в ячейке 2 — это ровно файл `server/colab_admin.py` (можно вставить его и вручную).
