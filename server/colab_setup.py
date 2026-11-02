# ======================================================================
#  «Лос-Город» — запуск сервера в Colab одной ячейкой.
#
#  Ячейка в блокноте:
#      import urllib.request
#      GH = 'Dimastwa0sopsi/File'
#      for u in (f'https://cdn.jsdelivr.net/gh/{GH}@main/server/colab_setup.py',
#                f'https://cdn.statically.io/gh/{GH}/main/server/colab_setup.py',
#                f'https://raw.githack.com/{GH}/main/server/colab_setup.py'):
#          try: src = urllib.request.urlopen(u, timeout=25).read().decode(); break
#          except Exception: src = None
#      exec(compile(src, 'colab_setup.py', 'exec'), {'__name__': '__main__'})
#
#  Скрипт сам: монтирует Диск, скачивает свежий server.js, ставит зависимости,
#  поднимает node и ngrok, публикует постоянную ссылку и проверяет ChatGIMPT.
#  Повторный запуск ничего не ломает: если сервер уже работает, он переиспользуется
#  (RESTART=1 — принудительный перезапуск).
# ======================================================================
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

# ── настройки: меняйте здесь, остальное трогать не нужно ────────────────
GAME_SITE = os.environ.get('GAME_SITE', 'https://dimastwa0sopsi.github.io/File/')
GH_REPO = os.environ.get('GH_REPO', 'Dimastwa0sopsi/File')
GH_BRANCH = os.environ.get('GH_BRANCH', 'main')
GH_TOKEN = os.environ.get('GH_TOKEN', '')            # contents: write → live.json обновится сам
NGROK_TOKEN = os.environ.get('NGROK_TOKEN', '')      # dashboard.ngrok.com/get-started/your-authtoken
NGROK_DOMAIN = os.environ.get('NGROK_DOMAIN', '')    # статический домен, если есть
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')    # свой ключ ChatGIMPT (необязательно)
PORT = int(os.environ.get('PORT', '3000'))
ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', 'losgorod-admin')
GAME_DIR = os.environ.get('GAME_DIR', '/content/drive/MyDrive/MyGame')
FORCE_UPDATE = os.environ.get('FORCE_UPDATE', '0') == '1'   # 1 — перекачать server.js в любом случае
RESTART = os.environ.get('RESTART', '0') == '1'             # 1 — перезапустить сервер
SHOW_PANEL = os.environ.get('SHOW_PANEL', '1') == '1'       # 0 — без админ-панели

MIRRORS = [
    'https://cdn.jsdelivr.net/gh/{repo}@{br}/server/{name}',
    'https://fastly.jsdelivr.net/gh/{repo}@{br}/server/{name}',
    'https://cdn.statically.io/gh/{repo}/{br}/server/{name}',
    'https://raw.githack.com/{repo}/{br}/server/{name}',
]


def say(icon, text):
    print(f'{icon} {text}', flush=True)


# ── интернет ────────────────────────────────────────────────────────────
def download(name, min_size=2000):
    """скачать файл сервера с зеркал (raw.githubusercontent не используем)"""
    last = None
    for tpl in MIRRORS:
        url = tpl.format(repo=GH_REPO, br=GH_BRANCH, name=name)
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                data = r.read().decode('utf-8')
            if len(data) < min_size:
                raise ValueError(f'файл слишком короткий ({len(data)} байт)')
            return data, url.split('/')[2]
        except Exception as e:                     # noqa: BLE001 — пробуем следующее зеркало
            last = e
            print(f'   мимо {url.split("/")[2]}: {e}')
    raise SystemExit(f'❌ Не удалось скачать {name}: {last}')


def http_json(url, body=None, timeout=20):
    data = None if body is None else json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def server_ok():
    """сервер уже поднят и отвечает?"""
    try:
        r = http_json(f'http://127.0.0.1:{PORT}/health', timeout=3)
        return bool(r.get('ok'))
    except Exception:
        return False


# ── шаги ────────────────────────────────────────────────────────────────
def step_drive():
    try:
        from google.colab import drive          # type: ignore
        if not os.path.ismount('/content/drive'):
            say('💾', 'Монтируем Google Диск…')
            drive.mount('/content/drive')
        else:
            say('💾', 'Google Диск уже смонтирован')
    except Exception as e:                      # noqa: BLE001 — локальный запуск
        say('💾', f'Диск не нужен (запуск не в Colab): {e}')
    os.makedirs(GAME_DIR, exist_ok=True)
    os.chdir(GAME_DIR)


def step_files():
    """server.js и вспомогательные файлы; качаем только если изменились"""
    for name in ('server.js',):
        path = os.path.join(GAME_DIR, name)
        fresh, mirror = download(name)
        old = ''
        if os.path.exists(path):
            try:
                old = open(path, encoding='utf-8').read()
            except Exception:
                old = ''
        if FORCE_UPDATE or old != fresh:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(fresh)
            say('⬇️', f'{name} обновлён с {mirror} ({len(fresh) // 1024} КБ)')
        else:
            say('✅', f'{name} уже свежий ({len(fresh) // 1024} КБ) — не качаем заново')

    # в MyGame не должно быть "type": "module", иначе require() в server.js упадёт
    pkg_path = os.path.join(GAME_DIR, 'package.json')
    try:
        pkg = json.load(open(pkg_path, encoding='utf-8'))
    except Exception:
        pkg = {}
    changed = False
    if pkg.get('type'):
        pkg.pop('type', None)
        changed = True
    if not pkg.get('name'):
        pkg['name'] = 'losgorod-server'
        changed = True
    if changed or not os.path.exists(pkg_path):
        json.dump(pkg, open(pkg_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        say('🧩', 'package.json поправлен (убрано type: module)')
    if not os.path.exists(os.path.join(GAME_DIR, 'node_modules')):
        subprocess.run('npm init -y > /dev/null 2>&1', shell=True)


def step_deps():
    need = []
    for mod, pkg in (('ws', 'ws'), ('better_sqlite3', 'better-sqlite3')):
        try:
            __import__(mod)
        except Exception:
            need.append(pkg)
    if need:
        say('📦', 'Ставим зависимости: ' + ', '.join(need))
        subprocess.run(f'npm install {" ".join(need)} > /dev/null 2>&1', shell=True)
    else:
        say('✅', 'Зависимости на месте (ws, better-sqlite3)')
    try:
        import pyngrok  # noqa: F401
    except Exception:
        say('📦', 'Ставим pyngrok…')
        subprocess.run(f'{sys.executable} -m pip install -q pyngrok', shell=True)


def step_server():
    os.environ['ADMIN_API'] = f'http://127.0.0.1:{PORT}'
    os.environ['ADMIN_TOKEN'] = ADMIN_TOKEN
    os.environ['GAME_DIR'] = GAME_DIR
    os.environ['GAME_URL'] = GAME_SITE
    os.environ['GH_REPO'] = GH_REPO

    if server_ok() and not RESTART:
        say('🟢', f'Сервер уже работает на порту {PORT} — перезапуск не нужен (RESTART=1, чтобы перезапустить)')
        return None

    if server_ok() or RESTART:
        say('🔁', 'Останавливаем старый сервер…')
        subprocess.run('pkill -f "node server.js" || true', shell=True)
        for _ in range(20):
            time.sleep(0.3)
            if not server_ok():
                break

    env = dict(os.environ, DB_FILE=os.path.join(GAME_DIR, 'game.db'), PORT=str(PORT),
               ADMIN_TOKEN=ADMIN_TOKEN, GAME_SITE=GAME_SITE, GH_REPO=GH_REPO, GH_BRANCH=GH_BRANCH)
    if GH_TOKEN:
        env['GH_TOKEN'] = GH_TOKEN
    if GROQ_API_KEY:
        env['GROQ_API_KEY'] = GROQ_API_KEY
    log_path = os.path.join(GAME_DIR, 'server.log')
    log = open(log_path, 'w', encoding='utf-8')
    proc = subprocess.Popen(['node', 'server.js'], cwd=GAME_DIR, env=env,
                            stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    for _ in range(40):
        time.sleep(0.4)
        if server_ok():
            say('🟢', f'Сервер запущен, PID {proc.pid}, лог: {log_path}')
            return proc
        if proc.poll() is not None:
            break
    say('❌', 'Сервер не поднялся. Последние строки лога:')
    try:
        print(open(log_path, encoding='utf-8', errors='replace').read()[-2500:])
    except Exception:
        pass
    raise SystemExit('Смотрите лог выше — чаще всего помогает RESTART=1 и повторный запуск ячейки.')


def step_tunnel():
    """ngrok: переиспользуем уже поднятый, иначе создаём новый"""
    def local_url():
        try:
            data = http_json('http://127.0.0.1:4040/api/tunnels', timeout=3)
            for t in data.get('tunnels') or []:
                u = str(t.get('public_url') or '')
                if u.startswith('https://'):
                    return u
        except Exception:
            pass
        return ''

    url = local_url()
    if url:
        os.environ['PUBLIC_URL'] = url
        say('🌐', f'Туннель уже работает: {url}')
        return url
    saved = os.environ.get('PUBLIC_URL', '')
    if saved.startswith('https://') and 'ngrok' not in saved:
        say('🌐', f'Используем сохранённый адрес: {saved}')
        return saved
    try:
        from pyngrok import ngrok, conf
        token = NGROK_TOKEN.strip()
        if token:
            conf.get_default().auth_token = token
        for t in ngrok.get_tunnels():
            try:
                ngrok.disconnect(t.public_url)
            except Exception:
                pass
        dom = NGROK_DOMAIN.strip().replace('https://', '').replace('http://', '').strip('/')
        url = ngrok.connect(PORT, 'http', domain=dom).public_url if dom else ngrok.connect(PORT, 'http').public_url
        os.environ['PUBLIC_URL'] = url
        say('🌐', f'Туннель поднят: {url}')
        return url
    except Exception as e:                      # noqa: BLE001
        say('⚠️', f'Туннель не поднялся: {e}')
        say('   ', 'Впишите NGROK_TOKEN в настройках вверху и запустите ячейку снова, '
                   'либо поднимите туннель кнопкой «🌐 Поднять туннель» в панели.')
        return ''


def step_publish():
    if GH_TOKEN:
        os.environ['GH_TOKEN'] = GH_TOKEN
    try:
        r = http_json(f'http://127.0.0.1:{PORT}/admin/publish?token={ADMIN_TOKEN}', timeout=30)
    except Exception as e:                      # noqa: BLE001
        return say('⚠️', f'Публикация адреса не удалась: {e}')
    if r.get('ok'):
        say('📡', 'Адрес сервера опубликован в server/live.json — клиент найдёт его сам')
    else:
        say('⚠️', f'Публикация не удалась: {r.get("error")}')
        say('   ', 'Впишите GH_TOKEN (contents: write) или нажмите «📡 Постоянная ссылка» в панели.')


def step_ai():
    try:
        r = http_json(f'http://127.0.0.1:{PORT}/ai/health', timeout=6)
        if r.get('ai'):
            say('🤖', f'ChatGIMPT готов (модель {r.get("model")}), ключ остаётся на сервере')
        else:
            say('🤖', 'ChatGIMPT выключен (AI_OFF=1) — в игре будет работать офлайн-подсказчик')
    except Exception as e:                      # noqa: BLE001
        say('🤖', f'ChatGIMPT не ответил: {e}')


def step_summary(url):
    ws = re.sub(r'^https://', 'wss://', url or '')
    print()
    print('=' * 68)
    print('ИГРОКАМ ДАВАЙТЕ ОДНУ ССЫЛКУ (адрес сервера они не вводят):')
    print('   ', GAME_SITE)
    if ws:
        print('Текущий адрес сервера (клиент находит сам):', ws)
    print('Админ-панель: ниже в этой же ячейке · токен:', ADMIN_TOKEN)
    print('База:', os.path.join(GAME_DIR, 'game.db'), '· лог:', os.path.join(GAME_DIR, 'server.log'))
    print('=' * 68)
    try:
        info = {'site': GAME_SITE, 'server': ws, 'port': PORT, 'admin_token': ADMIN_TOKEN,
                'game_dir': GAME_DIR, 'time': time.strftime('%Y-%m-%d %H:%M:%S')}
        json.dump(info, open(os.path.join(GAME_DIR, 'run_info.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=2)
    except Exception:
        pass


def step_panel():
    """админ-панель (100 кнопок) — грузим из репозитория, чтобы не копировать код"""
    if not SHOW_PANEL:
        return
    try:
        src, mirror = download('colab_admin.py', min_size=5000)
        say('👑', f'Админ-панель загружена с {mirror}')
        exec(compile(src, 'colab_admin.py', 'exec'), {'__name__': '__main__'})   # noqa: S102
    except SystemExit:
        raise
    except Exception as e:                      # noqa: BLE001
        say('⚠️', f'Панель не загрузилась: {e}. Отдельная ячейка «только панель» ниже.')


def main():
    print('🚀 Лос-Город: поднимаем сервер…')
    step_drive()
    step_files()
    step_deps()
    step_server()
    url = step_tunnel()
    step_publish()
    step_ai()
    step_summary(url)
    step_panel()


main()
