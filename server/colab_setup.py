# ======================================================================
#  Ячейка Colab №2 из 4: запуск сервера «Лос-Города» + туннель ngrok
#  Запускайте ПОСЛЕ ячейки, которая записала server.js через %%writefile.
#  Ничего вставлять вручную не нужно, кроме токена ngrok ниже.
# ======================================================================
import os, subprocess, time, json

# ── настройки ─────────────────────────────────────────────────────────
NGROK_TOKEN = 'ВСТАВЬТЕ_ТОКЕН_NGROK'      # https://dashboard.ngrok.com/get-started/your-authtoken
ADMIN_TOKEN = 'losgorod-admin'            # токен админ-панели (кнопки в 4-й ячейке)
PORT = 3000
GAME_DIR = '/content/drive/MyDrive/MyGame'

# ── Диск и файлы ──────────────────────────────────────────────────────
try:
    from google.colab import drive
    if not os.path.isdir('/content/drive/MyDrive'):
        drive.mount('/content/drive')
except Exception as e:
    print('Drive не смонтирован (запускаем локально):', e)

os.makedirs(GAME_DIR, exist_ok=True)
os.chdir(GAME_DIR)

if not os.path.exists('server.js'):
    raise SystemExit('Нет server.js: сначала выполните ячейку с %%writefile /content/drive/MyDrive/MyGame/server.js')

# в MyGame не должно быть "type": "module", иначе require() в server.js упадёт
try:
    pkg = json.load(open('package.json'))
except Exception:
    pkg = {}
if pkg.get('type'):
    pkg.pop('type', None)
    json.dump(pkg, open('package.json', 'w'), ensure_ascii=False, indent=2)
    print('Из package.json убрано поле "type" (нужно для require)')

# ── зависимости ───────────────────────────────────────────────────────
print('Ставим npm-пакеты…')
subprocess.run('npm init -y > /dev/null 2>&1', shell=True)
subprocess.run('npm install ws better-sqlite3 > /dev/null 2>&1', shell=True)
subprocess.run('pip install -q pyngrok', shell=True)

# ── перезапуск сервера ────────────────────────────────────────────────
subprocess.run('pkill -f "node server.js" || true', shell=True)
time.sleep(1)

DB_FILE = os.path.join(GAME_DIR, 'game.db')
env = dict(os.environ, DB_FILE=DB_FILE, PORT=str(PORT), ADMIN_TOKEN=ADMIN_TOKEN)
log = open(os.path.join(GAME_DIR, 'server.log'), 'w')
proc = subprocess.Popen(['node', 'server.js'], cwd=GAME_DIR, env=env, stdout=log, stderr=subprocess.STDOUT)
time.sleep(2.5)

os.environ['ADMIN_API'] = f'http://127.0.0.1:{PORT}'
os.environ['ADMIN_TOKEN'] = ADMIN_TOKEN

if proc.poll() is not None:
    print('❌ Сервер упал. Лог:')
    print(open(os.path.join(GAME_DIR, 'server.log')).read()[-3000:])
    raise SystemExit('Смотрите лог выше')
print('✅ Сервер запущен, PID', proc.pid)

# ── проверка HTTP ─────────────────────────────────────────────────────
try:
    import requests
    print('Health:', requests.get(f'http://127.0.0.1:{PORT}/', timeout=5).text.strip())
except Exception as e:
    print('Health-проверка не прошла:', e)

# ── туннель ───────────────────────────────────────────────────────────
from pyngrok import ngrok, conf
if NGROK_TOKEN and 'ВСТАВЬТЕ' not in NGROK_TOKEN:
    conf.get_default().auth_token = NGROK_TOKEN
for t in ngrok.get_tunnels():
    try:
        ngrok.disconnect(t.public_url)
    except Exception:
        pass
url = ngrok.connect(PORT, 'http').public_url
ws = url.replace('https://', 'wss://').replace('http://', 'ws://')
print('\n' + '=' * 60)
print('АДРЕС ДЛЯ ИГРЫ (вставьте в меню → «Адрес сервера»):')
print('   ', ws)
print('Токен админ-панели:', ADMIN_TOKEN)
print('База:', DB_FILE)
print('=' * 60)
