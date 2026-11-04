# ======================================================================
#  «Лос-Город» — Colab, ячейка 1: сервер + туннель + панель (онлайн И офлайн)
#  Копируйте целиком и запускайте. Повторный запуск ничего не ломает.
# ======================================================================
#  Что делает:
#   1) монтирует Google Диск (если он есть), создаёт папку игры
#   2) берёт server.js по возможности без сети: папка игры → кэш
#      server.cache.js → зеркала (jsDelivr → fastly → Statically → raw.githack).
#      Каждое зеркало проверяется по нужным панели отделам, поэтому старая
#      копия с кэша CDN больше не подменяет рабочую и не даёт «404»
#   3) правит на сервере список игроков (варны и мут нужны панели)
#   4) ставит ws / better-sqlite3 / pyngrok только если их нет и есть сеть
#   5) запускает сервер; если на порту висит старый процесс — сам его меняет
#   6) поднимает туннель, если сеть есть; без сети спокойно работает локально
#   7) публикует адрес в server/live.json (постоянная ссылка для игроков)
#   8) показывает админ-панель: выбор игрока одним списком, 💵 деньги
#      (в том числе миллион одним нажатием), 🎁 предметы и инвентарь,
#      «кикнуть всех», 100 кнопок, чат, сервер и логи
#   9) если ipywidgets нет — включает текстовую панель с выбором игрока
#      по номеру: работает и без интернета
# ======================================================================
#  Офлайн: менять настройки не нужно — нет сети, значит берём локальную
#  копию сервера. Принудительно: CFG['OFFLINE'] = '1'.
# ======================================================================

# ─────────────────────────── 1. НАСТРОЙКИ ───────────────────────────
import os

CFG = {
    'NGROK_TOKEN':  '3LIMieFrzz3NgqQXEOr5RxxsoIG_3gZMCtBAoXKmMPDxgCzET',   # автозапуск туннеля без ручного ввода
    'NGROK_DOMAIN': '',                        # необязательно: статический домен ngrok
    'GH_TOKEN':     '',                        # необязательно: contents:write → live.json обновится сам
    'ADMIN_TOKEN':  'losgorod-admin',
    'PORT':         3000,
    'GAME_DIR':     '/content/drive/MyDrive/MyGame',
    'GAME_SITE':    'https://dimastwa0sopsi.github.io/File/',
    'GH_REPO':      'Dimastwa0sopsi/File',
    'GH_BRANCH':    'main',
    'FORCE_UPDATE': 0,                         # 1 — перекачать server.js в любом случае
    'RESTART':      '0',                       # '1' — перезапустить сервер
    'SHOW_PANEL':   '1',                       # '0' — без панели
    'OFFLINE':      'auto',                    # '1' — совсем без сети (только локальные копии)
    'PIN':          '',                        # необязательно: коммит вместо ветки для зеркал
}

CFG['GAME_DIR'] = os.environ.get('GAME_DIR', CFG['GAME_DIR'])
GAME_DIR = CFG['GAME_DIR']
PORT = int(CFG['PORT'])
ADMIN_TOKEN = CFG['ADMIN_TOKEN']
API = f'http://127.0.0.1:{PORT}'
# офлайн: сеть не трогаем вообще
OFFLINE = str(CFG['OFFLINE']).strip().lower() in ('1', 'true', 'yes', 'on', 'да', 'офлайн')
# рабочая копия сервера на Диске — пригодится, когда сети нет
SERVER_CACHE = os.path.join(GAME_DIR, 'server.cache.js')
STATE = {'source': '', 'net': None}
os.environ.update({'ADMIN_API': API, 'ADMIN_TOKEN': ADMIN_TOKEN, 'GAME_DIR': GAME_DIR,
                   'GAME_URL': CFG['GAME_SITE'], 'GH_REPO': CFG['GH_REPO']})
for _k in ('NGROK_TOKEN', 'NGROK_DOMAIN', 'GH_TOKEN'):
    if CFG[_k]:
        os.environ[_k] = CFG[_k]


def say(icon, text):
    print(f'{icon} {text}', flush=True)


# ─────────────────────────── 2. ЗЕРКАЛА И HTTP ───────────────────────────
import hashlib
import json
import re
import subprocess
import sys
import time
import urllib.request

# {ref} — ветка main или конкретный коммит из CFG['PIN']
MIRRORS = [
    'https://cdn.jsdelivr.net/gh/{repo}@{ref}/server/{name}',
    'https://fastly.jsdelivr.net/gh/{repo}@{ref}/server/{name}',
    'https://cdn.statically.io/gh/{repo}/{ref}/server/{name}',
    'https://raw.githack.com/{repo}/{ref}/server/{name}',
]

# что обязательно должно быть в server.js, чтобы панель работала целиком.
# по этим меткам ячейка понимает, что перед ней рабочий сервер, и не путается
# в старых копиях с кэша CDN (из-за них раньше падало «Каталог предметов 404»)
REQUIRED = {
    'server.js': [
        "'/admin/items'",        # 🎁 каталог предметов
        "'/admin/inventory'",    # 🎒 инвентарь игрока
        "'/admin/actions'",      # 100 кнопок сервера
        "'inv_report'",          # запрос снимка инвентаря у клиента
        "'tp_all_to_player'",    # собрать всех у игрока
        "'kick_all'",            # выгнать всех онлайн
        "'money_add_1m'",        # миллион одним нажатием
    ],
}


def is_fresh(text, name='server.js'):
    """в файле есть всё, на что рассчитывает панель"""
    return bool(text) and all(mark in text for mark in REQUIRED.get(name, []))


def read_text(path):
    try:
        return open(path, encoding='utf-8').read()
    except Exception:                            # noqa: BLE001 — нет файла или нет прав
        return ''


def write_text(path, text):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)


def net_ok(timeout=3):
    """есть ли выход в интернет (быстрая проверка, без тяжёлых запросов)"""
    for url in ('https://cdn.jsdelivr.net/gh/Dimastwa0sopsi/File@main/README.md',
                'https://pypi.org/simple/', 'https://api.github.com'):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                r.read(32)
            return True
        except Exception:                        # noqa: BLE001
            continue
    return False


def have_net(force=False):
    """сеть проверяем один раз за запуск ячейки"""
    if force or STATE.get('net') is None:
        STATE['net'] = False if OFFLINE else net_ok()
    return bool(STATE['net'])


def download(name, min_size=2000):
    """скачать файл сервера с зеркал (raw.githubusercontent не используем — отдаёт 429).
    Каждое зеркало проверяется: если оно отдало старую версию из кэша CDN —
    идём к следующему. Возвращает (текст, имя зеркала)."""
    ref = (CFG.get('PIN') or CFG['GH_BRANCH']).strip()
    problems = []
    for tpl in MIRRORS:
        url = tpl.format(repo=CFG['GH_REPO'], ref=ref, name=name)
        host = url.split('/')[2]
        try:
            with urllib.request.urlopen(url, timeout=25) as r:
                data = r.read().decode('utf-8')
        except Exception as e:                   # noqa: BLE001 — пробуем следующее зеркало
            problems.append(f'{host}: {e}')
            continue
        if len(data) < min_size:
            problems.append(f'{host}: короткий файл ({len(data)} байт)')
            continue
        if name == 'server.js' and not is_fresh(data, name):
            problems.append(f'{host}: старая версия сервера')
            continue
        return data, host
    raise RuntimeError('ни одно зеркало не отдало рабочий ' + name + ' (' + '; '.join(problems) + ')')


def http_json(url, body=None, timeout=20):
    data = None if body is None else json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def server_alive():
    try:
        return bool(http_json(f'{API}/health', timeout=3).get('ok'))
    except Exception:                                # noqa: BLE001
        return False


def file_build(path):
    """тот же отпечаток, что считает server.js при старте"""
    try:
        return hashlib.sha1(open(path, 'rb').read()).hexdigest()[:12]
    except Exception:                                # noqa: BLE001
        return ''


def running_build():
    try:
        return str(http_json(f'{API}/version', timeout=3).get('build') or '')
    except Exception:                                # noqa: BLE001
        return ''


def port_pids(port):
    """PID-ы, которые слушают порт (ss → lsof → fuser, что найдётся)"""
    pids = set()
    for cmd in (f'ss -ltnp 2>/dev/null | grep ":{port} "',
                f'lsof -ti tcp:{port} 2>/dev/null',
                f'fuser -n tcp {port} 2>/dev/null'):
        try:
            out = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10).stdout
        except Exception:                        # noqa: BLE001
            continue
        found = re.findall(r'pid=(\d+)', out) + re.findall(r'^\s*(\d+)\s*$', out, re.M) + re.findall(r'\b(\d+)/tcp', out)
        for pid in found:
            try:
                pids.add(int(pid))
            except ValueError:
                pass
    return sorted(pids)


def stop_server():
    """остановить сервер на нашем порту, даже если он запущен другой командой"""
    subprocess.run('pkill -f "node .*server\\.js" || true', shell=True)
    for pid in port_pids(PORT):
        if pid == os.getpid():
            continue
        try:
            os.kill(pid, 15)
        except Exception:                        # noqa: BLE001
            pass
    for _ in range(25):
        time.sleep(0.3)
        if not server_alive():
            return True
    for pid in port_pids(PORT):                  # не помогло — SIGKILL
        try:
            os.kill(pid, 9)
        except Exception:                        # noqa: BLE001
            pass
    time.sleep(0.6)
    return not server_alive()


# ─────────────────────── 3. ФИКС СПИСКА ИГРОКОВ (патч server.js) ───────────────────────
ALL_SQL_OLD = """  all: db.prepare(`SELECT id, name, gender, money, car_id, car_number, house_id,
    pos_x, pos_z, pos_rot, banned, ban_reason, updated_at FROM players ORDER BY updated_at DESC`),"""

ALL_SQL_NEW = """  all: db.prepare(`SELECT id, name, gender, money, car_id, car_number, house_id, warns, muted, is_admin,
    pos_x, pos_z, pos_rot, banned, ban_reason, updated_at FROM players ORDER BY updated_at DESC`),"""


def patch_server(src):
    """идемпотентно: варны, мут и признак админа в списке игроков (без них панель их не видит)"""
    notes = []
    if 'warns, muted, is_admin' not in src and ALL_SQL_OLD in src:
        src = src.replace(ALL_SQL_OLD, ALL_SQL_NEW, 1)
        notes.append('варны и мут в панели')
    return src, notes


# ─────────────────── 4. ДИСК, ФАЙЛЫ, ЗАВИСИМОСТИ, СЕРВЕР ───────────────────
def step_drive():
    try:
        from google.colab import drive            # type: ignore
        if not os.path.ismount('/content/drive'):
            say('💾', 'Монтируем Google Диск…')
            drive.mount('/content/drive')
        else:
            say('💾', 'Google Диск уже смонтирован')
    except Exception as e:                        # noqa: BLE001 — запуск не в Colab
        say('💾', f'Диск не нужен: {e}')
    os.makedirs(GAME_DIR, exist_ok=True)
    os.chdir(GAME_DIR)


def step_files():
    """server.js: сеть → папка игры → кэш на Диске. Работает и совсем без сети."""
    path = os.path.join(GAME_DIR, 'server.js')
    old = read_text(path)
    cached = read_text(SERVER_CACHE)
    src, source = '', ''

    if have_net():
        try:
            src, source = download('server.js')
            say('⬇️', f'server.js скачан: {source} ({len(src) // 1024} КБ)')
        except Exception as e:                    # noqa: BLE001 — живём на локальной копии
            say('⚠️', f'зеркала не дали рабочий server.js: {e}')
    else:
        say('🛩', 'сети нет — берём локальную копию сервера, ничего не качаем')

    if not src:
        if is_fresh(old):
            src, source = old, 'папка игры'
            say('✅', f'server.js из папки игры ({len(src) // 1024} КБ)')
        elif is_fresh(cached):
            src, source = cached, 'кэш server.cache.js'
            say('🗄', f'server.js из кэша на Диске ({len(src) // 1024} КБ)')
        else:
            raise SystemExit(
                '❌ Нет рабочего server.js и нет сети.\n'
                '   Что делать (хватит любого варианта):\n'
                '   1) включите интернет в Colab и запустите ячейку снова;\n'
                f'   2) положите server.js из репозитория в папку {GAME_DIR};\n'
                '   3) если файл когда-то скачивался, он лежит рядом как server.cache.js.')

    src, notes = patch_server(src)
    if notes:
        say('🩹', 'Правки сервера: ' + ', '.join(notes))
    STATE['source'] = source
    if old != src:
        write_text(path, src)
        say('💾', f'server.js записан ({len(src) // 1024} КБ, источник: {source})')
        if source != 'кэш server.cache.js':
            try:
                write_text(SERVER_CACHE, src)     # запас на случай, когда сети нет
            except Exception as e:                # noqa: BLE001
                say('⚠️', f'кэш не сохранился: {e}')
    else:
        say('✅', 'server.js уже такой же — перезаписывать не нужно')
    pkg_path = os.path.join(GAME_DIR, 'package.json')
    try:
        pkg = json.load(open(pkg_path, encoding='utf-8'))
    except Exception:                            # noqa: BLE001
        pkg = {}
    changed = not os.path.exists(pkg_path)
    if pkg.get('type'):
        pkg.pop('type', None)
        changed = True
    if not pkg.get('name'):
        pkg['name'] = 'losgorod-server'
        changed = True
    if changed:
        json.dump(pkg, open(pkg_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        say('🧩', 'package.json поправлен (убрано type: module)')


def node_module(name):
    return os.path.isdir(os.path.join(GAME_DIR, 'node_modules', name))


def step_deps():
    """модули ставим только если их нет И есть сеть: папка игры переживает перезапуск"""
    need = [pkg for pkg, mod in (('ws', 'ws'), ('better-sqlite3', 'better-sqlite3'))
            if not node_module(mod)]
    if not need:
        say('✅', 'Зависимости на месте (ws, better-sqlite3)')
    elif have_net():
        say('📦', 'Ставим: ' + ', '.join(need))
        r = subprocess.run(f'npm install {" ".join(need)}', shell=True, cwd=GAME_DIR,
                           capture_output=True, text=True)
        if r.returncode:
            say('⚠️', f'npm install не сработал: {(r.stderr or r.stdout or "").strip()[-300:]}')
        else:
            say('✅', 'Поставлено: ' + ', '.join(need))
    else:
        say('⚠️', 'Нет модулей: ' + ', '.join(need) + ' — без сети их не поставить.')
        say('   ', 'Один раз запустите ячейку с интернетом: модули останутся в папке игры '
                   'и дальше офлайн будут подхватываться сами.')
        raise SystemExit('❌ Без ws и better-sqlite3 сервер не запустится.')
    import importlib.util
    if importlib.util.find_spec('pyngrok') is None:
        if have_net():
            say('📦', 'Ставим pyngrok…')
            subprocess.run(f'{sys.executable} -m pip install -q pyngrok', shell=True)
        else:
            say('ℹ️', 'pyngrok нет — офлайн он и не нужен, поставится при первом онлайн-запуске')


def _launch_server(env_extra: dict, log_path: str, say_cb, timeout_sec: int = 40,
                   sleep: float = 0.4, max_tries: int | None = None) -> bool:
    """Запустить node server.js с окружением, ждать ответа, вернуть True/False."""
    env = dict(os.environ, DB_FILE=os.path.join(GAME_DIR, 'game.db'), PORT=str(PORT),
               ADMIN_TOKEN=ADMIN_TOKEN, GAME_SITE=CFG['GAME_SITE'], GH_REPO=CFG['GH_REPO'],
               GH_BRANCH=CFG['GH_BRANCH'])
    env.update(env_extra)
    if CFG['GH_TOKEN']:
        env['GH_TOKEN'] = CFG['GH_TOKEN']
    log = open(log_path, 'w', encoding='utf-8')
    proc = subprocess.Popen(['node', 'server.js'], cwd=GAME_DIR, env=env,
                            stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    tries = max_tries if max_tries is not None else int(timeout_sec / sleep)
    for _ in range(tries):
        time.sleep(sleep)
        if server_alive():
            say_cb('🟢', f'Сервер запущен, PID {proc.pid}')
            return True
        if proc.poll() is not None:
            break
    say_cb('❌', 'Сервер не поднялся, лог ниже:')
    try:
        print(open(log_path, encoding='utf-8', errors='replace').read()[-2500:])
    except Exception:                            # noqa: BLE001
        pass
    return False


def start_server():
    return _launch_server({}, os.path.join(GAME_DIR, 'server.log'), say)


def step_server():
    disk = file_build(os.path.join(GAME_DIR, 'server.js'))
    if server_alive():
        running = running_build()
        if running and running == disk and CFG['RESTART'] != '1':
            say('🟢', f'Сервер уже работает на порту {PORT} — переиспользуем (RESTART="1" для перезапуска)')
            return
        if CFG['RESTART'] != '1':
            say('🔁', f'На порту старый сервер ({running or "без отпечатка"}) — меняем на свежий ({disk})')
        else:
            say('🔁', 'Останавливаем сервер…')
        if not stop_server():
            say('⚠️', f'Порт {PORT} всё ещё занят — закройте старый процесс вручную')
    if not start_server():
        raise SystemExit('Лог выше. Обычно помогает RESTART="1" и повторный запуск ячейки.')


def step_tunnel():
    """Туннель нужен только онлайну. Без сети спокойно работаем локально."""
    if OFFLINE or not have_net():
        saved = os.environ.get('PUBLIC_URL', '')
        say('🛩', 'туннель не поднимаем: сети нет, сервер и панель работают локально')
        return saved

    def local_url():
        try:
            data = http_json('http://127.0.0.1:4040/api/tunnels', timeout=3)
            for t in data.get('tunnels') or []:
                u = str(t.get('public_url') or '')
                if u.startswith('https://'):
                    return u
        except Exception:                        # noqa: BLE001
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
    except Exception:                            # noqa: BLE001
        say('ℹ️', 'pyngrok не установлен — работаем без туннеля')
        return ''
    try:
        token = CFG['NGROK_TOKEN'].strip()
        if token:
            conf.get_default().auth_token = token
        for t in ngrok.get_tunnels():
            try:
                ngrok.disconnect(t.public_url)
            except Exception:                    # noqa: BLE001
                pass
        dom = CFG['NGROK_DOMAIN'].strip().replace('https://', '').replace('http://', '').strip('/')
        url = ngrok.connect(PORT, 'http', domain=dom).public_url if dom else ngrok.connect(PORT, 'http').public_url
        os.environ['PUBLIC_URL'] = url
        say('🌐', f'Туннель поднят: {url}')
        return url
    except Exception as e:                        # noqa: BLE001
        say('⚠️', f'Туннель не поднялся: {e}')
        say('   ', 'Впишите NGROK_TOKEN в настройках и запустите ячейку снова.')
        return ''


def step_publish(url=''):
    if OFFLINE or not have_net():
        say('🛩', 'офлайн: live.json не публикуем — это нужно только онлайну')
        return
    if not url:
        say('ℹ️', 'Туннеля нет — постоянную ссылку не публикуем')
        return
    if CFG['GH_TOKEN']:
        os.environ['GH_TOKEN'] = CFG['GH_TOKEN']
    try:
        r = http_json(f'{API}/admin/publish?token={ADMIN_TOKEN}', timeout=30)
        if r.get('ok'):
            say('📡', 'Адрес опубликован в server/live.json — игроки берут его сами')
        else:
            say('⚠️', f'Публикация: {r.get("error")}')
    except Exception as e:                        # noqa: BLE001
        say('⚠️', f'Публикация не удалась: {e}')


# ─────────────────────── 5. УДОБНАЯ АДМИН-ПАНЕЛЬ ───────────────────────
RISKY = {'ban', 'ban_silent', 'delete', 'delete_offline', 'unban_all', 'kick_all', 'money_all_reset',
         'event_reset_world', 'vacuum', 'chat_clear', 'chat_log_clear', 'warns_clear_all', 'mute_all',
         'unmute_all', 'unbind_all', 'money_set_0'}


def ensure_widgets():
    """ipywidgets в Colab иногда слетает после перезапуска — ставим сами и говорим об этом."""
    try:
        import ipywidgets  # noqa: F401
        return True, ''
    except Exception as first:                    # noqa: BLE001
        say('📦', f'ipywidgets не найден ({first}) — ставлю заново…')
        subprocess.run(f'{sys.executable} -m pip install -q ipywidgets', shell=True)
        try:
            import ipywidgets  # noqa: F401
            return True, ''
        except Exception as second:               # noqa: BLE001
            return False, str(second)


def panel_diag():
    """Печатает, что именно готово для панели: сервер, каталог кнопок, настройки денег."""
    rows = []
    alive = server_alive()
    if OFFLINE:
        rows.append(('режим', '🛩 офлайн — так задано в настройках (OFFLINE="1")'))
    elif have_net():
        rows.append(('режим', '🌐 онлайн — сеть есть'))
    else:
        rows.append(('режим', '🛩 офлайн — сети нет, работаем на локальной копии'))
    rows.append(('server.js', (STATE.get('source') or '—') +
                 (f' · build {running_build()}' if alive else '')))
    rows.append(('сервер', 'отвечает' if alive else 'НЕ ОТВЕЧАЕТ — запустите ячейку снова'))
    try:
        cat = http_json(f'{API}/admin/actions?token={ADMIN_TOKEN}', timeout=8)
        rows.append(('кнопки', f"{len(cat.get('actions') or [])} в {len(cat.get('groups') or {})} группах"))
    except Exception as e:                        # noqa: BLE001
        rows.append(('кнопки', f'каталог не пришёл: {e}'))
    try:
        m = http_json(f'{API}/admin/money?token={ADMIN_TOKEN}', timeout=8).get('money') or {}
        rows.append(('деньги', f"по умолчанию ${m.get('amount', 0):,} · потолок ${m.get('cap', 0):,}".replace(',', ' ')))
    except Exception as e:                        # noqa: BLE001
        rows.append(('деньги', f'настройки не пришли: {e}'))
    try:
        st = http_json(f'{API}/admin/state?token={ADMIN_TOKEN}', timeout=8)
        rows.append(('игроки', f"аккаунтов {len(st.get('players') or [])}, в сети {len(st.get('online') or [])}"))
        if st.get('items'):
            rows.append(('предметы', f"{st.get('items')} в каталоге · {st.get('itemActions') or 0} кнопок выдачи"))
    except Exception as e:                        # noqa: BLE001
        rows.append(('игроки', f'состояние не пришло: {e}'))
    try:
        it = http_json(f'{API}/admin/items?token={ADMIN_TOKEN}', timeout=8)
        rows.append(('каталог 🎁', f"{len(it.get('items') or [])} предметов в {len(it.get('groups') or {})} группах"))
    except Exception as e:                        # noqa: BLE001
        rows.append(('каталог 🎁', f'не пришёл: {e}'))
    say('🔎', 'Панель: ' + ' · '.join(f'{k}: {v}' for k, v in rows))
    return rows


def show_panel():
    """Поиск игроков, карточка быстрых действий, 100 серверных кнопок, чат, сервер, логи."""
    ok, err = ensure_widgets()
    if not ok:
        print('❌ Админ-панель не может запуститься: нет ipywidgets.')
        print('   Что делать: выполните в новой ячейке  !pip install -q ipywidgets  и перезапустите эту.')
        print('   Сервер при этом работает — панель только не рисуется.', err)
        panel_diag()
        print('⌨️  Включаю текстовую панель: игрок выбирается номером, работает без интернета.')
        panel_text()
        return
    import ipywidgets as W
    from IPython.display import display
    panel_diag()
    mode_offline = OFFLINE or not have_net()

    L = W.Layout
    LOG_PATH = os.path.join(GAME_DIR, 'server.log')

    def api(path, body=None, timeout=25):
        return http_json(f'{API}{path}{"&" if "?" in path else "?"}token={ADMIN_TOKEN}', body, timeout)

    def act(aid, **kw):
        try:
            return api('/admin/action', {'action': aid, **kw})
        except Exception as e:                    # noqa: BLE001
            return {'ok': False, 'error': f'Сервер не ответил: {e}'}

    def pill(text, bg='#1e293b', fg='#e2e8f0'):
        return (f'<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:{bg};'
                f'color:{fg};font-size:12px;margin:0 4px 4px 0">{text}</span>')

    def box(inner, bg='#0b1220'):
        return (f'<div style="padding:10px 12px;border-radius:12px;background:{bg};'
                f'border:1px solid #1e293b;margin:4px 0">{inner}</div>')

    def head(text):
        return W.HTML(f'<b style="font-size:13px;color:#cbd5e1">{text}</b>')

    status, msg = W.HTML(), W.HTML(pill('Готово. Выберите игрока и нажмите кнопку.'))
    result, card = W.HTML(), W.HTML(pill('Игрок не выбран'))
    search = W.Text(placeholder='поиск по нику…', layout=L(width='200px'))
    filt = W.Dropdown(options=[('все', 'all'), ('в сети', 'online'), ('офлайн', 'offline'), ('в бане', 'banned')],
                      value='all', description='Кто', layout=L(width='180px'))
    sort = W.Dropdown(options=[('по нику', 'name'), ('по деньгам', 'money'), ('по варнам', 'warns')],
                      value='name', description='Сорт.', layout=L(width='200px'))
    players = W.Select(options=[], rows=11, layout=L(width='300px'))
    # один общий выбор: и список, и все кнопки, и телепорт «К игроку» берут игрока отсюда
    who = W.Dropdown(options=[('— выберите игрока —', '')], value='', description='Игрок',
                     layout=L(width='430px'))
    danger = W.Checkbox(value=False, description='Разрешить опасные действия')
    reason = W.Text(value='Нарушение правил', description='Причина', layout=L(width='300px'))
    px_x, px_z = W.Text(description='X', layout=L(width='140px')), W.Text(description='Z', layout=L(width='140px'))
    car_id = W.Text(value='ferrato', description='Модель', layout=L(width='220px'))
    car_num = W.Text(description='Номер', layout=L(width='180px'))
    house_id = W.Text(value='house_1', description='Дом', layout=L(width='200px'))
    announce = W.Text(description='Текст', layout=L(width='540px'))
    # к кому телепортировать: отдельный список, иначе «К другому игроку» летел к самому себе
    target = W.Dropdown(options=[('— к кому —', '')], value='', description='К кому',
                        layout=L(width='300px'))
    state = {'players': [], 'online': set(), 'chat': []}
    SYNC = {'busy': False}                       # защита от зацикливания списка и выпадашки

    def picked():
        return players.value or ''

    def say_msg(ok, text):
        msg.value = pill(('✅ ' if ok else '⚠️ ') + str(text), '#065f46' if ok else '#7f1d1d', '#fff')

    def run(aid, **kw):
        r = act(aid, **kw)
        rows = r.get('rows') or []
        result.value = box(''.join(f'<div>{x}</div>' for x in rows)) if rows else ''
        say_msg(bool(r.get('ok')), r.get('message') or r.get('error') or 'готово')
        reload_players()
        return r

    def button(label, aid, style='', width='145px'):
        b = W.Button(description=label, button_style=style, layout=L(width=width, margin='2px'))

        def on_click(_b):
            if not picked():
                say_msg(False, 'Сначала выберите игрока в списке')
                return
            if aid in RISKY and not danger.value:
                say_msg(False, 'Поставьте галочку «Разрешить опасные действия»')
                return
            kw = {'name': picked()}
            if aid in ('ban', 'ban_silent', 'warn'):
                kw['reason'] = reason.value.strip() or 'Нарушение правил'
            run(aid, **kw)

        b.on_click(on_click)
        return b

    def plain(label, cb, style='', width='165px'):
        b = W.Button(description=label, button_style=style, layout=L(width=width, margin='2px'))
        b.on_click(lambda _b: cb())
        return b

    def reload_players(_b=None):
        try:
            st = api('/admin/state')
        except Exception as e:                    # noqa: BLE001
            card.value = pill(f'Нет связи с сервером: {e}', '#7f1d1d', '#fff')
            return
        state['players'] = st.get('players') or []
        state['online'] = set(st.get('online') or [])
        state['chat'] = st.get('chat') or []
        # список целей телепорта: онлайн-игроки (к кому можно переместить)
        keep_target = target.value
        names = [p['name'] for p in state['players'] if p['name'] in state['online']]
        names.sort(key=lambda n: n.lower())
        target.options = [('— к кому —', '')] + [(f'👥 {n}', n) for n in names]
        if keep_target and any(v == keep_target for _, v in target.options):
            target.value = keep_target
        draw_status(st)
        draw_list()
        draw_card()

    def draw_status(st=None):
        flags = (st or {}).get('flags') or {}
        mode_chip = (pill('🛩 офлайн', '#1e3a8a', '#dbeafe') if mode_offline
                     else pill('🌐 онлайн', '#1e3a8a', '#dbeafe'))
        chips = [mode_chip,
                 pill(f'🟢 в сети: {len(state["online"])}', '#065f46', '#d1fae5'),
                 pill(f'👥 аккаунтов: {len(state["players"])}')]
        try:
            h = http_json(f'{API}/health', timeout=4)
            chips.append(pill(f'🖥 сервер: {h.get("build") or "—"} · {h.get("uptime", 0)} с'))
        except Exception:                         # noqa: BLE001
            chips.append(pill('🖥 сервер не отвечает', '#7f1d1d', '#fff'))
        if flags.get('maintenance'):
            chips.append(pill('🚧 техработы', '#78350f', '#fde68a'))
        if flags.get('globalMute'):
            chips.append(pill('🤐 общий мут', '#7c2d12', '#fed7aa'))
        status.value = ''.join(chips)

    def draw_list():
        rows = [p for p in state['players'] if not search.value.strip()
                or search.value.strip().lower() in str(p['name']).lower()]
        if filt.value == 'online':
            rows = [p for p in rows if p['name'] in state['online']]
        elif filt.value == 'offline':
            rows = [p for p in rows if p['name'] not in state['online']]
        elif filt.value == 'banned':
            rows = [p for p in rows if p.get('banned')]
        key = {'name': lambda p: str(p['name']).lower(), 'money': lambda p: -(p.get('money') or 0),
               'warns': lambda p: -(p.get('warns') or 0)}[sort.value]
        rows.sort(key=key)
        # выпадашка «Игрок» сверху — обновляем первую, чтобы on_pick не ловил пустые опции
        SYNC['busy'] = True
        try:
            who.options = [('— выберите игрока —', '')] + [
                (('🟢 ' if p['name'] in state['online'] else '⚪ ') + str(p['name'])
                 + ' · $' + f'{int(p.get("money") or 0):,}'.replace(',', ' '), p['name']) for p in rows]
            if picked() and any(v == picked() for _, v in who.options):
                who.value = picked()
        finally:
            SYNC['busy'] = False
        keep = players.value
        players.options = [(('🟢 ' if p['name'] in state['online'] else '⚪ ') + str(p['name'])
                            + ' · $' + f'{int(p.get("money") or 0):,}'.replace(',', ' ')
                            + (f' · {p["warns"]}в' if p.get('warns') else ''), p['name']) for p in rows]
        if keep and any(v == keep for _, v in players.options):
            players.value = keep

    def draw_card():
        p = next((x for x in state['players'] if x['name'] == picked()), None)
        if not p:
            card.value = pill('Игрок не выбран — кликните по нику в списке')
            return
        extra = (['🔇 мут'] if p.get('muted') else []) + \
                (['🚫 бан: ' + str(p.get('ban_reason') or 'да')] if p.get('banned') else [])
        money = f'{int(p.get("money") or 0):,}'.replace(',', ' ')
        card.value = box(
            f'<div style="font-size:15px;color:#e2e8f0"><b>{p["name"]}</b> '
            + ('<span style="color:#34d399">в сети</span>' if p['name'] in state['online']
               else '<span style="color:#94a3b8">офлайн</span>')
            + f'</div><div style="color:#93c5fd;font-size:16px;margin:3px 0">${money}</div>'
            f'<div style="color:#94a3b8;font-size:12px">машина: {p.get("car_id") or "—"} '
            f'{p.get("car_number") or ""} · X {round(p.get("pos_x") or 0)}, Z {round(p.get("pos_z") or 0)} · '
            f'варнов {p.get("warns") or 0}' + (' · ' + ' · '.join(extra) if extra else '') + '</div>')

    def on_pick(_c=None):
        draw_card()
        if picked() and who.value != picked():
            # who.value можно менять только если значение есть в текущих опциях (защита от краша после фильтра/сортировки)
            if any(v == picked() for _, v in who.options):
                SYNC['busy'] = True
                try:
                    who.value = picked()
                finally:
                    SYNC['busy'] = False
        p = next((x for x in state['players'] if x['name'] == picked()), None)
        if p:
            px_x.value, px_z.value = str(round(p.get('pos_x') or 0)), str(round(p.get('pos_z') or 0))

    for w in (search, filt, sort):
        w.observe(lambda _c: draw_list(), names='value')
    players.observe(on_pick, names='value')

    def on_who(_c=None):
        if SYNC['busy'] or not who.value:
            return
        SYNC['busy'] = True
        try:
            if any(v == who.value for _, v in players.options):
                players.value = who.value
        finally:
            SYNC['busy'] = False
        on_pick()

    who.observe(on_who, names='value')

    # ——— быстрые действия: одно нажатие, без полей ———
    def quick(aid, ok_text):
        if not picked():
            return say_msg(False, 'Выберите игрока — поле «Игрок» сверху или список слева')
        r = act(aid, name=picked())
        say_msg(bool(r.get('ok')), r.get('message') or r.get('error') or ok_text)
        reload_players()

    def quick_million():
        quick('money_add_1m', 'миллион выдан')

    def quick_set_million():
        quick('money_set_1m', 'баланс ровно 1 000 000')

    def quick_medkit():
        if not picked():
            return say_msg(False, 'Выберите игрока')
        run('item_give', name=picked(), item='medkit', qty=5)

    def quick_kick_all():
        if not danger.value:
            return say_msg(False, '«Выгнать всех»: включите галочку «Разрешить опасные действия»')
        r = act('kick_all')
        say_msg(bool(r.get('ok')), r.get('message') or r.get('error') or 'готово')
        reload_players()

    tab_players = W.VBox([
        W.HBox([search, filt, sort, plain('🔄 Обновить', reload_players, width='130px')]),
        W.HBox([players, W.VBox([
            card, head('Деньги'),
            W.HBox([button('+1 000', 'money_add_1k'), button('+10 000', 'money_add_10k', 'success'),
                    button('+100 000', 'money_add_100k', 'success'), button('−10 %', 'money_take_10pct'),
                    button('Обнулить', 'money_set_0', 'danger')]),
            head('Одним нажатием'),
            W.HBox([plain('💰 Миллион', quick_million, 'success', width='150px'),
                    plain('💵 Ровно 1 000 000', quick_set_million, width='200px'),
                    plain('🎁 Аптечка ×5', quick_medkit, width='165px'),
                    plain('👢 Выгнать всех', quick_kick_all, 'danger', width='185px')]),
            head('Игрок'),
            W.HBox([button('Инфо', 'player_info'), button('Вылечить', 'player_heal', 'success'),
                    button('Убить', 'player_kill', 'danger'), button('Заморозить', 'player_freeze'),
                    button('Разморозить', 'player_unfreeze')]),
            head('Телепорт'),
            W.HBox([button('В больницу', 'tp_hospital'), button('В полицию', 'tp_police'),
                    button('На пляж', 'tp_beach'), button('К игроку', 'tp_player'),
                    button('На спавн', 'tp_spawn')]),
        ], layout=L(width='770px'))]),
        head('Транспорт'),
        W.HBox([button('Спорткар', 'car_sport', 'info'), button('Внедорожник', 'car_suv'),
                button('Мотоцикл', 'car_moto'), button('Случайная', 'car_random'),
                button('Новый номер', 'car_number_random'), button('Снять номер', 'car_number_clear')]),
        head('Модерация'),
        W.HBox([button('Варн', 'warn'), button('Снять варны', 'warns_clear'), button('Мут', 'mute'),
                button('Размут', 'unmute'), button('Кик', 'kick', 'warning'), button('Бан', 'ban', 'danger'),
                button('Разбан', 'unban', 'success')]),
    ])

    # ——— 100 кнопок из каталога сервера ———
    try:
        cat = api('/admin/actions')
        groups, actions = cat.get('groups') or {}, cat.get('actions') or []
    except Exception as e:                        # noqa: BLE001
        groups, actions = {}, []
        say_msg(False, f'Каталог кнопок не загрузился: {e}')

    def catalog_button(d):
        b = W.Button(description=d['t'], layout=L(width='232px', margin='2px'),
                     button_style='danger' if d.get('confirm') else ('info' if d.get('need') else ''))

        def on_click(_b):
            kw = {}
            if d.get('need'):
                if not picked():
                    return say_msg(False, 'Сначала выберите игрока')
                kw['name'] = picked()
            if d.get('xy'):
                try:
                    kw['x'], kw['z'] = float(px_x.value or 0), float(px_z.value or 0)
                except ValueError:
                    return say_msg(False, 'X и Z должны быть числами')
            if d.get('car'):
                kw['carId'] = car_id.value.strip() or 'lada'
            if d.get('number'):
                kw['number'] = car_num.value.strip()[:9]
            if d.get('house'):
                kw['house'] = house_id.value.strip() or 'house_1'
            if d.get('text'):
                if not announce.value.strip():
                    return say_msg(False, 'Введите текст в поле «Текст»')
                kw['text'] = announce.value.strip()
            if d.get('target'):
                if not target.value:
                    return say_msg(False, 'Выберите, к кому — поле «К кому» сверху')
                kw['target'] = target.value
            if d['id'] in ('ban', 'ban_silent', 'warn'):
                kw['reason'] = reason.value.strip() or 'Нарушение правил'
            if (d.get('confirm') or d['id'] in RISKY) and not danger.value:
                return say_msg(False, f'«{d["t"]}» необратимо — галочка «Разрешить опасные»')
            run(d['id'], **kw)

        b.on_click(on_click)
        return b

    order = ['money', 'mod', 'tp', 'car', 'chat', 'player', 'server', 'event']
    order += [g for g in groups if g not in order]
    sub_children, sub_titles = [], []
    for gid in order:
        items = [d for d in actions if d.get('g') == gid]
        if items:
            sub_children.append(W.VBox([
                W.HTML(f'<div style="color:#94a3b8;font-size:12px">кнопок: {len(items)}</div>'),
                W.GridBox([catalog_button(d) for d in items], layout=L(grid_template_columns='repeat(3, 236px)'))]))
            sub_titles.append(groups.get(gid, gid))
    catalog_tabs = (W.Tab(children=sub_children, titles=sub_titles) if sub_children else
                    W.HTML('<div style="color:#fca5a5">Кнопки не загрузились — перезапустите сервер</div>'))
    tab_actions = W.VBox([
        W.HTML('<div style="color:#94a3b8;font-size:12px">Параметры (X, Z, модель, номер, дом, текст, '
               '«К кому» для телепорта к игроку, галочка опасных) — в панели сверху. '
               'Телепорт в поле и к игроку — группа «🚀 Телепорт».</div>'),
        catalog_tabs])

    # ——— чат ———
    chat_box = W.HTML()

    def draw_chat(_b=None):
        rows = state['chat']
        if not rows:
            try:
                rows = api('/admin/state').get('chat') or []
            except Exception:                     # noqa: BLE001
                rows = []
        if not rows:
            chat_box.value = pill('Сообщений пока нет')
            return
        lines = [f'<div><b style="color:#93c5fd">{r.get("name", "?")}</b>: {r.get("text", "")}</div>'
                 if isinstance(r, dict) else f'<div>{r}</div>' for r in rows]
        chat_box.value = box('<div style="font-family:ui-monospace,monospace;font-size:12px;color:#cbd5e1;'
                             'max-height:300px;overflow:auto">' + ''.join(reversed(lines)) + '</div>')

    def chat_announce():
        text = announce.value.strip()
        if text:
            run('announce', text=text)
        else:
            say_msg(False, 'Введите текст объявления')

    def chat_clear():
        if not danger.value:
            return say_msg(False, 'Очистка чата: поставьте галочку «Разрешить опасные»')
        run('chat_clear')
        draw_chat()

    tab_chat = W.VBox([W.HBox([plain('📢 Объявить', chat_announce, width='150px'),
                               plain('🔄 Обновить', draw_chat, width='140px'),
                               plain('🧹 Очистить', chat_clear, 'danger', width='150px')]), chat_box])

    # ——— деньги: сумма, режим, настройки выдачи ———
    def money_cfg():
        try:
            return http_json(f'{API}/admin/money?token={ADMIN_TOKEN}', timeout=8)
        except Exception as e:                    # noqa: BLE001
            return {'ok': False, 'error': str(e), 'money': {}, 'rows': []}

    cfg0 = money_cfg()
    m0 = cfg0.get('money') or {}
    money_amount = W.BoundedIntText(value=int(m0.get('amount', 5000)), min=0, max=100_000_000,
                                    step=int(m0.get('step', 1000)) or 1000, description='Сумма $',
                                    layout=L(width='230px'))
    money_mode = W.RadioButtons(options=[('Начислить', 'add'), ('Списать', 'sub'), ('Установить', 'set')],
                                value='add', description='Режим', layout=L(width='250px'))
    money_cap = W.BoundedIntText(value=int(m0.get('cap', 1_000_000)), min=1000, max=2_147_483_647,
                                 step=100_000, description='Потолок $', layout=L(width='260px'))
    money_neg = W.Checkbox(value=bool(m0.get('allowNegative')), description='Разрешить минус')
    money_strict = W.Checkbox(value=bool(m0.get('strict', True)), description='Защита от накрутки клиентом')
    money_box = W.HTML()

    def draw_money(_b=None):
        c = money_cfg()
        if not c.get('ok'):
            money_box.value = pill(f'Настройки не пришли: {c.get("error")}', '#7f1d1d', '#fff')
            return
        rows = c.get('rows') or []
        money_box.value = box('<div style="font-size:12px;color:#cbd5e1">'
                              + '<br>'.join(rows) + '</div>')

    def money_selected():
        if not picked():
            say_msg(False, 'Сначала выберите игрока в списке')
            return
        run('money_give', name=picked(), amount=int(money_amount.value), mode=money_mode.value)
        draw_money()

    def money_all():
        r = act('money_give_all', amount=int(money_amount.value), mode=money_mode.value)
        say_msg(bool(r.get('ok')), r.get('message') or r.get('error') or 'готово')
        draw_money()
        reload_players()

    def money_save_cfg():
        try:
            r = http_json(f'{API}/admin/money?token={ADMIN_TOKEN}', {
                'amount': int(money_amount.value), 'cap': int(money_cap.value),
                'allowNegative': bool(money_neg.value), 'strict': bool(money_strict.value),
            }, 15)
            say_msg(bool(r.get('ok')), r.get('error') or 'Настройки выдачи денег сохранены — переживут перезапуск сервера')
        except Exception as e:                    # noqa: BLE001
            say_msg(False, f'Не сохранилось: {e}')
        draw_money()

    def money_preset(v):
        def go():
            money_amount.value = int(v)
            money_save_cfg()
        return go

    money_log = W.HTML()

    def draw_money_log(_b=None):
        try:
            st = api('/admin/state')
            rows = st.get('log') or []
        except Exception as e:                    # noqa: BLE001
            money_log.value = pill(f'Журнал недоступен: {e}', '#7f1d1d', '#fff')
            return
        if not rows:
            money_log.value = pill('Журнал пока пуст')
            return
        import datetime
        lines = []
        for r in reversed(rows[-25:]):
            t = datetime.datetime.fromtimestamp((r.get('t') or 0) / 1000).strftime('%H:%M:%S')
            txt = str(r.get('text', '')).replace('<', '&lt;').replace('>', '&gt;')
            lines.append(f'<div style="font-size:12px;color:#cbd5e1"><b style="color:#64748b">{t}</b> {txt}</div>')
        money_log.value = box('<div style="max-height:240px;overflow:auto">' + ''.join(lines) + '</div>')

    tab_money = W.VBox([
        W.HTML('<div style="color:#94a3b8;font-size:12px">Сумма и режим действуют и на кнопку для выбранного игрока, '
               'и на «всем онлайн». Потолок — верхняя граница одной операции.</div>'),
        W.HBox([money_amount, money_mode]),
        W.HBox([money_cap, money_neg, money_strict]),
        W.HBox([plain('💵 Выбранному', money_selected, 'success', width='170px'),
                plain('👥 Всем онлайн', money_all, 'warning', width='170px'),
                plain('💾 Сохранить настройки', money_save_cfg, 'info', width='210px'),
                plain('🔄 Обновить', draw_money, width='140px')]),
        head('Быстрые суммы'),
        W.HBox([plain(f'${v:,}'.replace(',', ' '), money_preset(v), width='120px') for v in (1000, 5000, 20000, 100000, 1000000)]),
        money_box, head('Журнал действий панели'),
        W.HBox([plain('🔄 Обновить журнал', draw_money_log, width='180px')]),
        money_log,
    ])

    # ——— 🎁 предметы: каталог, выдача, инвентарь игрока ———
    try:
        cat = api('/admin/items')
        item_list = cat.get('items') or []
        item_groups = cat.get('groups') or {}
        item_actions = cat.get('actions') or []
    except Exception as e:                        # noqa: BLE001
        item_list, item_groups, item_actions = [], {}, []
        say_msg(False, f'Каталог предметов не загрузился: {e}')

    item_search = W.Text(placeholder='поиск предмета…', layout=L(width='200px'))
    item_group = W.Dropdown(options=[('все группы', '')] + [(v, k) for k, v in item_groups.items()],
                            value='', description='Группа', layout=L(width='240px'))
    item_sel = W.Select(options=[], rows=14, layout=L(width='330px'))
    item_qty = W.BoundedIntText(value=1, min=1, max=9999, step=1, description='Кол-во',
                                layout=L(width='170px'))
    item_box, inv_box = W.HTML(), W.HTML()

    def item_by_id(iid):
        return next((x for x in item_list if x['id'] == iid), None)

    def draw_items():
        q = item_search.value.strip().lower()
        rows = [x for x in item_list
                if (not q or q in x['name'].lower() or q in x['id'].lower())
                and (not item_group.value or x['g'] == item_group.value)]
        rows.sort(key=lambda x: (x['g'], x['name']))
        keep = item_sel.value
        item_sel.options = [(f"{x['icon']} {x['name']} · ${x['price']}", x['id']) for x in rows]
        if keep and any(v == keep for _, v in item_sel.options):
            item_sel.value = keep
        if rows and not item_sel.value:
            item_sel.value = rows[0]['id']

    item_search.observe(lambda _c: draw_items(), names='value')
    item_group.observe(lambda _c: draw_items(), names='value')

    def need_item():
        if not item_sel.value:
            say_msg(False, 'Выберите предмет в списке')
            return None
        return item_by_id(item_sel.value)

    def need_selected_player():
        if not picked():
            say_msg(False, 'Сначала выберите игрока в списке на вкладке «👥 Игроки»')
            return False
        return True

    def item_give():
        it = need_item()
        if not it or not need_selected_player():
            return
        run('item_give', name=picked(), item=it['id'], qty=int(item_qty.value))
        draw_inventory()

    def item_take():
        it = need_item()
        if not it or not need_selected_player():
            return
        run('item_take', name=picked(), item=it['id'], qty=int(item_qty.value))
        draw_inventory()

    def item_give_all():
        it = need_item()
        if not it:
            return
        r = act('item_give_all', item=it['id'], qty=int(item_qty.value))
        say_msg(bool(r.get('ok')), r.get('message') or r.get('error') or 'готово')

    def item_take_all():
        it = need_item()
        if not it:
            return
        if not danger.value:
            return say_msg(False, 'Забрать у всех: поставьте галочку «Разрешить опасные действия»')
        r = act('item_take_all', item=it['id'], qty=int(item_qty.value))
        say_msg(bool(r.get('ok')), r.get('message') or r.get('error') or 'готово')

    def item_clear():
        if not need_selected_player():
            return
        if not danger.value:
            return say_msg(False, 'Очистка инвентаря: поставьте галочку «Разрешить опасные»')
        run('item_clear', name=picked())
        draw_inventory()

    def kit(kid, title):
        def go():
            if not need_selected_player():
                return
            run(kid, name=picked())
            draw_inventory()
        return go

    def draw_inventory(_b=None):
        if not picked():
            inv_box.value = pill('Выберите игрока — покажу его инвентарь')
            return
        r = act('inv_view', name=picked())       # заодно просим клиент прислать свежий снимок
        rows = r.get('rows') or []
        if not rows:
            try:
                inv = api(f'/admin/inventory?name={picked()}')
                rows = inv.get('rows') or []
            except Exception as e:                # noqa: BLE001
                inv_box.value = pill(f'Инвентарь не пришёл: {e}', '#7f1d1d', '#fff')
                return
        body = ''.join(f'<div style="font-size:12px;color:#cbd5e1">{str(x).replace("<", "&lt;")}</div>'
                       for x in rows)
        inv_box.value = box(f'<b style="color:#e2e8f0">🎒 {picked()}</b>'
                            '<div style="max-height:260px;overflow:auto;margin-top:4px">' + body + '</div>')

    def inv_report_all():
        r = act('inv_report_all')
        say_msg(bool(r.get('ok')), r.get('message') or r.get('error') or 'готово')

    def quick_qty(v):
        def go():
            item_qty.value = int(v)
        return go

    tab_items = W.VBox([
        W.HTML('<div style="color:#94a3b8;font-size:12px">Выберите игрока на вкладке «👥 Игроки», затем предмет '
               'и количество. Выдача уходит клиенту мгновенно — игрок увидит тост. Инвентарь живёт у игрока, '
               'сервер хранит последний присланный снимок.</div>'),
        W.HBox([item_search, item_group, plain('🔄 Обновить', lambda: (draw_items(), draw_inventory()), width='150px')]),
        W.HBox([item_sel, W.VBox([
            head('Количество'),
            W.HBox([item_qty, plain('×1', quick_qty(1), width='55px'), plain('×5', quick_qty(5), width='55px'),
                    plain('×10', quick_qty(10), width='60px'), plain('×50', quick_qty(50), width='60px')]),
            head('Игрок'),
            W.HBox([plain('🎁 Выдать', item_give, 'success', width='150px'),
                    plain('🗑 Забрать', item_take, 'warning', width='150px')]),
            W.HBox([plain('📢 Всем онлайн', item_give_all, 'info', width='165px'),
                    plain('🧹 У всех забрать', item_take_all, 'danger', width='185px')]),
            W.HBox([plain('🎒 Показать инвентарь', draw_inventory, 'info', width='215px'),
                    plain('🗑 Очистить инвентарь', item_clear, 'danger', width='205px')]),
        ], layout=L(width='520px'))]),
        head('Готовые наборы (выбранному игроку)'),
        W.HBox([plain('🎒 Стартовый', kit('kit_start', 'Стартовый'), width='150px'),
                plain('🎣 Рыбаку', kit('kit_fish', 'Рыбаку'), width='130px'),
                plain('🔫 Оружие', kit('kit_weapon', 'Оружие'), width='135px'),
                plain('🔧 Автомобилисту', kit('kit_auto', 'Авто'), width='175px'),
                plain('🍔 Еда и вода', kit('kit_food', 'Еда'), width='160px')]),
        W.HBox([plain('🔄 Запросить инвентарь у всех', inv_report_all, width='270px')]),
        head('Инвентарь игрока'),
        inv_box,
    ])
    draw_items()

    # ——— сервер, туннель, логи ———
    public_url = W.Text(value=os.environ.get('PUBLIC_URL', ''), description='Туннель', layout=L(width='460px'))
    link_box, log_box = W.HTML(), W.HTML()
    log_lines = W.Dropdown(options=[('40', 40), ('120', 120), ('400', 400)], value=40,
                           description='Строк', layout=L(width='160px'))
    log_follow = W.Checkbox(value=True, description='Автообновление (3 с)')
    log_errors = W.Checkbox(value=False, description='Только ошибки')

    def rebuild_link(*_a):
        raw = public_url.value.strip()
        ws = re.sub(r'^http://', 'ws://', re.sub(r'^https://', 'wss://', raw))
        link_box.value = box(
            '<div style="font-size:12px;color:#94a3b8">постоянная ссылка для игроков '
            '(адрес сервера они не вводят):</div>'
            f'<div style="font-family:ui-monospace,monospace;color:#86efac;word-break:break-all">{CFG["GAME_SITE"]}</div>'
            + (f'<div style="font-family:ui-monospace,monospace;color:#93c5fd;word-break:break-all">текущий: {ws}</div>'
               if ws else '<div style="color:#fca5a5">туннеля нет — нажмите «Взять адрес»</div>'))

    def tunnel_now():
        url = ''
        try:
            for t in http_json('http://127.0.0.1:4040/api/tunnels', timeout=3).get('tunnels') or []:
                if str(t.get('public_url', '')).startswith('https://'):
                    url = t['public_url']
                    break
        except Exception:                         # noqa: BLE001
            pass
        if not url:
            try:
                url = api('/admin/tunnel', timeout=5).get('url') or ''
            except Exception:                     # noqa: BLE001
                url = ''
        if url:
            public_url.value = url
            say_msg(True, f'Адрес: {url}')
        else:
            say_msg(False, 'Туннель не найден: впишите адрес вручную или запустите ячейку с NGROK_TOKEN')
        rebuild_link()

    def publish_now():
        try:
            r = api('/admin/publish', timeout=45)
            say_msg(bool(r.get('ok')), r.get('error') or 'Адрес опубликован — игроки зайдут по постоянной ссылке')
        except Exception as e:                    # noqa: BLE001
            say_msg(False, f'Публикация: {e}')

    def read_log(lines=40, only_errors=False):
        if not os.path.exists(LOG_PATH):
            return ''
        try:
            rows = open(LOG_PATH, encoding='utf-8', errors='replace').readlines()
        except Exception as e:                    # noqa: BLE001
            return f'Не прочитать лог: {e}'
        if only_errors:
            rows = [r for r in rows if re.search(r'error|ошиб|failed|exception|traceback', r, re.I)]
        return ''.join(rows[-lines:])

    def refresh_log(_b=None):
        text = read_log(int(log_lines.value), bool(log_errors.value))
        if not text.strip():
            log_box.value = pill('Лог пуст — сервер ещё ничего не писал')
            return
        out = []
        for line in text.splitlines():
            safe = line.replace('<', '&lt;').replace('>', '&gt;')
            color = '#f87171' if re.search(r'error|ошиб|failed|exception|traceback', line, re.I) else (
                '#fbbf24' if re.search(r'warn|предупр', line, re.I) else '#d1d5db')
            out.append(f'<span style="color:{color}">{safe}</span>')
        log_box.value = ('<pre style="margin:0;padding:10px;background:#0b1220;border-radius:8px;font-size:12px;'
                         'line-height:1.35;max-height:300px;overflow:auto">' + '\n'.join(out) + '</pre>')

    def log_clear():
        try:
            open(LOG_PATH, 'w', encoding='utf-8').close()
        except Exception:                         # noqa: BLE001
            pass
        refresh_log()

    def restart_server():
        say_msg(True, 'Перезапускаем сервер…')
        stop_server()
        extra = {}
        for k in ('GH_TOKEN', 'PUBLIC_URL'):
            if os.environ.get(k):
                extra[k] = os.environ[k]
        if _launch_server(extra, LOG_PATH, lambda icon, txt: say_msg(icon == '🟢', txt),
                          timeout_sec=15, sleep=0.5, max_tries=30):
            say_msg(True, 'Сервер перезапущен')
            reload_players()
            refresh_log()
        else:
            say_msg(False, 'Сервер не ответил за 15 секунд — смотрите «Логи»')

    public_url.observe(lambda _c: rebuild_link(), names='value')
    log_lines.observe(lambda _c: refresh_log(), names='value')
    log_errors.observe(lambda _c: refresh_log(), names='value')

    tab_server = W.VBox([
        head('Адрес и постоянная ссылка'),
        W.HBox([public_url, plain('🔄 Взять адрес', tunnel_now, width='150px'),
                plain('📡 Опубликовать', publish_now, 'success', width='160px'),
                plain('🔁 Перезапустить', restart_server, 'warning', width='165px')]),
        link_box, head('Служебные действия'),
        W.HBox([button('Инфо сервера', 'server_info'), button('Размер базы', 'db_size'),
                button('Бэкап базы', 'backup'), button('Техработы ВКЛ', 'maintenance_on', 'warning'),
                button('Техработы ВЫКЛ', 'maintenance_off', 'success')]),
        W.HBox([button('Статистика денег', 'stats_money'), button('Статистика авто', 'stats_cars'),
                button('Кто онлайн', 'online_list'), button('Сжать базу', 'vacuum', 'danger')]),
        head('Логи'),
        W.HBox([plain('🔄 Обновить', refresh_log, width='140px'), log_lines, log_follow, log_errors,
                plain('🧹 Очистить', log_clear, width='140px')]),
        log_box,
    ])

    toolbar = W.VBox([
        W.HBox([who, danger]),
        W.HBox([reason, px_x, px_z]),
        W.HBox([target]),
        W.HBox([car_id, car_num, house_id]),
        W.HBox([announce]),
    ], layout=L(border='1px solid #1e293b', padding='6px', margin='0 0 6px 0'))
    tabs = W.Tab(children=[tab_players, tab_money, tab_items, tab_actions, tab_chat, tab_server],
                 titles=['👥 Игроки', '💵 Деньги', '🎁 Предметы', '🎛 100 кнопок', '📢 Чат', '🖥 Сервер'])
    display(W.VBox([
        W.HTML('<h3 style="margin:0 0 2px">👑 Лос-Город · админ-панель</h3>'
               '<div style="color:#94a3b8;font-size:12px;margin-bottom:6px">'
               'Игрок выбирается в поле «Игрок» сверху (или кликом в списке) — дальше все кнопки, деньги, '
               'предметы и телепорты работают по нему. «Кому» для телепорта к другому игроку — поле «К кому». '
               'Быстрые кнопки: 💰 миллион, 🎁 аптечка, 👢 выгнать всех. Поля ниже — параметры: X/Z, модель, '
               'номер, дом, текст и галочка опасных действий. Без интернета всё это тоже работает.</div>'),
        status, msg, result, toolbar, tabs]))
    reload_players()
    draw_chat()
    draw_money()
    draw_money_log()
    draw_inventory()
    refresh_log()
    rebuild_link()

    import threading

    def ticker():
        while True:
            time.sleep(3)
            try:
                if log_follow.value:
                    refresh_log()
                draw_status(api('/admin/state', timeout=6))
            except Exception:                     # noqa: BLE001
                pass

    threading.Thread(target=ticker, daemon=True).start()


# ─────────────── 5.1 ТЕКСТОВАЯ ПАНЕЛЬ: выбор игрока номером, работает офлайн ───────────────
TEXT_POINTS = ['spawn', 'hospital', 'police', 'cityhall', 'bank', 'mall', 'beach', 'promenade',
               'field', 'farm', 'fishshop', 'village_s', 'village_k', 'village_o', 'center']

TEXT_HELP = '''ВЫБОР ИГРОКА:   players  →  sel 3   (или sel Вася) — дальше команды без ника
  give <предмет> [кол-во]     выдать выбранному       take <предмет> [кол-во]  забрать
  kit <набор>                 kit_start kit_fish kit_weapon kit_auto kit_food
  inv                         инвентарь выбранного    clear   очистить инвентарь
  money <сумма> [add|sub|set] деньги выбранному       mill    выдать миллион ($1 000 000)
  tp <точка>                  телепорт выбранного     points  список точек
  tpme <ник>                  выбранного к другому игроку
  kick  ban  warn  mute  unmute  unban  heal  kill  freeze  unfreeze  info  respawn
ВСЕМ И БЕЗ ВЫБОРА:
  players [фильтр]   online   items [фильтр]   moneyall <сумма> [add|sub|set]
  kickall  unbanall  healall  moneyreset  announce <текст>
  tpall <ник>        всех онлайн к игроку      actions [группа]   act <id> [k=v ...]
  log [строк]        exit — выйти (сервер продолжит работать)
'''


def _text_num(word, default=0):
    try:
        return int(str(word).replace('$', '').replace(' ', '').replace('_', ''))
    except Exception:                            # noqa: BLE001
        return default


def panel_text():
    """Панель без ipywidgets: игрок выбирается номером, всё работает и без интернета."""
    if not server_alive():
        print('❌ Сервер не отвечает — запустите ячейку целиком.')
        return
    cur = {'name': ''}
    lst = []

    def state():
        return http_json(f'{API}/admin/state?token={ADMIN_TOKEN}', timeout=12)

    def act(aid, **kw):
        try:
            return http_json(f'{API}/admin/action?token={ADMIN_TOKEN}', dict(action=aid, **kw), 20)
        except Exception as e:                    # noqa: BLE001
            return {'ok': False, 'error': f'сервер не ответил: {e}'}

    def show(r):
        for row in r.get('rows') or []:
            print('   ', row)
        print('   ', ('✅ ' if r.get('ok') else '⚠️ ') + str(r.get('message') or r.get('error') or 'готово'))

    def names():
        try:
            return [p['name'] for p in state().get('players') or []]
        except Exception:                        # noqa: BLE001
            return []

    def known(word):
        w = str(word).strip().lower()
        return next((n for n in names() if n.lower() == w), '') if w else ''

    def target_player(args):
        """первый аргумент может быть ником (give Вася medkit 5), иначе берём выбранного"""
        if args and known(args[0]):
            return args[0], args[1:]
        if cur['name']:
            return cur['name'], args
        print('   Сначала выберите игрока: players → sel <номер>')
        return '', args

    def mode_of(args):
        return args[0] if args and args[0] in ('add', 'sub', 'set') else 'add'

    say('⌨️', 'Текстовая панель (без виджетов и без сети). help — команды, exit — выход.')
    while True:
        try:
            raw = input('лос> ').strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not raw:
            continue
        parts = raw.split()
        cmd = parts[0].lower()
        args = parts[1:]
        try:
            if cmd in ('help', '?', 'помощь', 'h'):
                print(TEXT_HELP)
            elif cmd in ('exit', 'quit', 'выход'):
                print('Сервер продолжает работать. Вернуться в панель: panel_text()')
                return
            elif cmd in ('players', 'p', 'игроки', 'список'):
                st = state()
                online = set(st.get('online') or [])
                q = args[0].lower() if args else ''
                rows = [p for p in st.get('players') or [] if q in str(p['name']).lower()]
                rows.sort(key=lambda p: (p['name'] not in online, str(p['name']).lower()))
                lst[:] = [p['name'] for p in rows]
                for i, p in enumerate(rows, 1):
                    mark = '🟢' if p['name'] in online else '⚪'
                    arrow = '→' if p['name'] == cur['name'] else ' '
                    extra = ('  🔇' if p.get('muted') else '') + ('  🚫' if p.get('banned') else '')
                    print(f'  {arrow}{i:>2}. {mark} {str(p["name"]):<16} '
                          f'${int(p.get("money") or 0):>10}  в {p.get("warns") or 0}{extra}')
                print(f'   всего {len(rows)} · в сети {len(online)} · выбрать: sel <номер>')
            elif cmd in ('sel', 'выбрать', 'игрок'):
                word = ' '.join(args).strip()
                if not word:
                    print('   формат: sel <номер из players> или sel <ник>')
                elif word.isdigit():
                    i = int(word)
                    if 1 <= i <= len(lst):
                        cur['name'] = lst[i - 1]
                    else:
                        print('   нет такого номера — сначала players')
                else:
                    found = known(word)
                    if found:
                        cur['name'] = found
                    else:
                        print('   игрок не найден — сначала players')
                if cur['name']:
                    print(f"   → выбран {cur['name']}")
            elif cmd in ('online', 'кто'):
                rows = sorted(state().get('online') or [], key=str.lower)
                print('   🟢 ' + (', '.join(rows) if rows else 'никого нет'))
            elif cmd in ('items', 'предметы'):
                c = http_json(f'{API}/admin/items?token={ADMIN_TOKEN}', timeout=12)
                q = args[0].lower() if args else ''
                rows = [x for x in c.get('items') or []
                        if not q or q in x['name'].lower() or q in x['id'].lower()]
                for x in rows:
                    print(f"   {x['icon']} {x['id']:<14} {x['name']:<24} ${x['price']:<6} [{x['g']}]")
                print(f'   {len(rows)} из {len(c.get("items") or [])}')
            elif cmd in ('give', 'выдать', 'take', 'забрать'):
                name, rest = target_player(args)
                if not name:
                    continue
                if not rest:
                    print('   формат: give <предмет> [кол-во] · или give <ник> <предмет> [кол-во]')
                    continue
                qty = max(1, _text_num(rest[1], 1)) if len(rest) > 1 else 1
                show(act('item_give' if cmd in ('give', 'выдать') else 'item_take',
                         name=name, item=rest[0], qty=qty))
            elif cmd in ('kit', 'набор'):
                name, rest = target_player(args)
                if not name:
                    continue
                if not rest:
                    print('   наборы: kit_start kit_fish kit_weapon kit_auto kit_food')
                    continue
                show(act(rest[0] if rest[0].startswith('kit_') else 'kit_' + rest[0], name=name))
            elif cmd in ('inv', 'инвентарь'):
                name, _ = target_player(args)
                if name:
                    print(f'   🎒 {name}')
                    show(act('inv_view', name=name))
            elif cmd in ('clear', 'очистить'):
                name, _ = target_player(args)
                if name:
                    show(act('item_clear', name=name))
            elif cmd in ('money', 'деньги'):
                name, rest = target_player(args)
                if not name:
                    continue
                if not rest:
                    print('   формат: money <сумма> [add|sub|set]')
                    continue
                show(act('money_give', name=name, amount=max(0, _text_num(rest[0])),
                         mode=mode_of(rest[1:])))
            elif cmd in ('mill', 'миллион'):
                name, _ = target_player(args)
                if name:
                    show(act('money_add_1m', name=name))
            elif cmd in ('moneyall', 'всемденьги'):
                if not args:
                    print('   формат: moneyall <сумма> [add|sub|set]')
                    continue
                show(act('money_give_all', amount=max(0, _text_num(args[0])), mode=mode_of(args[1:])))
            elif cmd in ('points', 'точки'):
                print('   ' + ', '.join(TEXT_POINTS))
            elif cmd in ('tp', 'тп'):
                name, rest = target_player(args)
                if not name:
                    continue
                point = (rest[0] if rest else '').lower()
                if point not in TEXT_POINTS:
                    print('   точки: ' + ', '.join(TEXT_POINTS))
                    continue
                show(act('tp_' + point, name=name))
            elif cmd in ('tpme', 'ккому'):
                name, rest = target_player(args)
                if not name:
                    continue
                other = known(' '.join(rest)) if rest else ''
                if not other:
                    print('   формат: tpme <ник> — выбранного к другому игроку')
                    continue
                show(act('tp_player', name=name, target=other))
            elif cmd in ('tpall', 'всех'):
                other = known(' '.join(args)) if args else ''
                if not other:
                    print('   формат: tpall <ник> — собрать всех онлайн у игрока')
                    continue
                show(act('tp_all_to_player', target=other))
            elif cmd in ('kick', 'ban', 'warn', 'mute', 'unmute', 'unban', 'heal', 'kill',
                         'freeze', 'unfreeze', 'info', 'respawn'):
                name, _ = target_player(args)
                if not name:
                    continue
                aid = {'heal': 'player_heal', 'kill': 'player_kill', 'freeze': 'player_freeze',
                       'unfreeze': 'player_unfreeze', 'info': 'player_info',
                       'respawn': 'player_respawn'}.get(cmd, cmd)
                kw = {'name': name}
                if cmd in ('ban', 'warn'):
                    kw['reason'] = 'Нарушение правил'
                show(act(aid, **kw))
            elif cmd in ('kickall', 'выгнать'):
                try:
                    ans = input('   Выгнать всех онлайн? да/нет: ').strip().lower()
                except (EOFError, KeyboardInterrupt):
                    ans = ''
                if ans in ('да', 'д', 'yes', 'y', '1'):
                    show(act('kick_all'))
                else:
                    print('   отменено')
            elif cmd in ('unbanall', 'разбанить'):
                show(act('unban_all'))
            elif cmd in ('healall', 'вылечитьвсех'):
                show(act('event_heal_all'))
            elif cmd in ('moneyreset', 'всем20к'):
                show(act('money_all_reset'))
            elif cmd in ('announce', 'объявить'):
                text = raw.split(None, 1)[1] if len(parts) > 1 else ''
                if text.strip():
                    show(act('announce', text=text.strip()))
                else:
                    print('   формат: announce <текст>')
            elif cmd in ('actions', 'кнопки'):
                c = http_json(f'{API}/admin/actions?token={ADMIN_TOKEN}', timeout=12)
                g = args[0].lower() if args else ''
                for d in c.get('actions') or []:
                    if g and d.get('g') != g:
                        continue
                    flag = '⚠️' if d.get('confirm') else ('👤' if d.get('need') else '  ')
                    print(f"   {flag} {d['id']:<22} {d['t']}")
                print('   группы: ' + ', '.join(f'{k}={v}' for k, v in (c.get('groups') or {}).items()))
            elif cmd in ('act', 'do'):
                if not args:
                    print('   формат: act kick_all · act ban name=Вася reason=чит')
                    continue
                aid, kw = args[0], {}
                for pair in args[1:]:
                    if '=' in pair:
                        k, v = pair.split('=', 1)
                        kw[k] = _text_num(v) if v.lstrip('-').isdigit() else v
                if 'name' not in kw and 'target' not in kw and cur['name']:
                    kw['name'] = cur['name']
                show(act(aid, **kw))
            elif cmd in ('log', 'журнал'):
                n = max(1, _text_num(args[0], 20)) if args else 20
                for r in (state().get('log') or [])[-n:]:
                    t = time.strftime('%H:%M:%S', time.localtime((r.get('t') or 0) / 1000))
                    print('   ', t, r.get('text'))
            else:
                print('   не знаю такую команду — help')
        except Exception as e:                    # noqa: BLE001 — панель не должна падать
            print('   ошибка:', e)


# ─────────────────────────── 6. ЗАПУСК ───────────────────────────
def main():
    online = (not OFFLINE) and have_net()
    print(f"🚀 Лос-Город: поднимаем сервер…  режим: {'🌐 онлайн' if online else '🛩 офлайн'}")
    step_drive()
    step_files()
    step_deps()
    step_server()
    url = step_tunnel()
    step_publish(url)
    ws = re.sub(r'^https://', 'wss://', url or '')
    print()
    print('=' * 70)
    if OFFLINE or not have_net():
        print('РЕЖИМ: ОФЛАЙН — интернет не нужен, сервер и панель работают на этой машине.')
    else:
        print('РЕЖИМ: ОНЛАЙН — сеть есть, туннель поднят (если получилось).')
    print('Сервер и API панели: http://127.0.0.1:' + str(PORT) +
          '  ·  отпечаток ' + (running_build() or '—'))
    print('server.js:', STATE.get('source') or '—')
    print('Постоянная ссылка для игроков:', CFG['GAME_SITE'])
    if ws:
        print('Текущий адрес сервера (клиент находит сам):', ws)
    print('Токен админ-панели:', ADMIN_TOKEN, '· база:', os.path.join(GAME_DIR, 'game.db'))
    if OFFLINE or not have_net():
        print('Офлайн: выдача денег, предметы, инвентарь, телепорты, «выгнать всех» — всё работает.')
        print('Когда появится сеть, просто запустите ячейку снова — включится и туннель.')
    print('=' * 70)
    if CFG['SHOW_PANEL'] != '1':
        say('ℹ️', 'Панель выключена (SHOW_PANEL="0"), сервер работает. Включить: show_panel()')
        return
    try:
        show_panel()
    except Exception as e:                        # noqa: BLE001 — панель не должна ронять сервер
        import traceback
        print('❌ Панель не построилась:', e)
        traceback.print_exc()
        print('   Сервер продолжает работать. Панель заново: show_panel()')
        print('   Совсем без виджетов: panel_text()')
        try:
            panel_diag()
        except Exception:                         # noqa: BLE001
            pass


main()
