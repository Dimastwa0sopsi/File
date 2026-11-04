# ======================================================================
#  «Лос-Город» — Colab, ячейка 1: сервер + туннель + удобная админ-панель
#  Копируйте целиком и запускайте. Повторный запуск ничего не ломает.
# ======================================================================
#  Что делает:
#   1) монтирует Google Диск, создаёт папку игры
#   2) скачивает server.js с зеркал (jsDelivr → fastly → Statically → raw.githack)
#   3) правит на сервере список игроков (варны и мут нужны панели)
#   4) ставит ws / better-sqlite3 / pyngrok только если их нет
#   5) запускает сервер; если на порту висит старый процесс — сам его меняет
#   6) публикует адрес в server/live.json (постоянная ссылка для игроков)
#   7) показывает админ-панель: игроки, 💵 выдача денег с настройками,
#      🎁 предметы и инвентарь игрока, 100 кнопок, чат, сервер и логи
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
}

CFG['GAME_DIR'] = os.environ.get('GAME_DIR', CFG['GAME_DIR'])
GAME_DIR = CFG['GAME_DIR']
PORT = int(CFG['PORT'])
ADMIN_TOKEN = CFG['ADMIN_TOKEN']
API = f'http://127.0.0.1:{PORT}'
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

MIRRORS = [
    'https://cdn.jsdelivr.net/gh/{repo}@{br}/server/{name}',
    'https://fastly.jsdelivr.net/gh/{repo}@{br}/server/{name}',
    'https://cdn.statically.io/gh/{repo}/{br}/server/{name}',
    'https://raw.githack.com/{repo}/{br}/server/{name}',
]


def download(name, min_size=2000):
    """скачать файл сервера с зеркал (raw.githubusercontent не используем — он отдаёт 429)"""
    last = None
    for tpl in MIRRORS:
        url = tpl.format(repo=CFG['GH_REPO'], br=CFG['GH_BRANCH'], name=name)
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                data = r.read().decode('utf-8')
            if len(data) < min_size:
                raise ValueError(f'файл слишком короткий ({len(data)} байт)')
            return data, url.split('/')[2]
        except Exception as e:                       # noqa: BLE001 — пробуем следующее зеркало
            last = e
            print(f'   мимо {url.split("/")[2]}: {e}')
    raise SystemExit(f'❌ Не удалось скачать {name}: {last}')


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
    path = os.path.join(GAME_DIR, 'server.js')
    fresh, mirror = download('server.js')
    fresh, notes = patch_server(fresh)
    if notes:
        say('🩹', 'Правки сервера: ' + ', '.join(notes))
    old = ''
    if os.path.exists(path):
        try:
            old = open(path, encoding='utf-8').read()
        except Exception:                        # noqa: BLE001
            old = ''
    if CFG['FORCE_UPDATE'] or old != fresh:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(fresh)
        say('⬇️', f'server.js обновлён с {mirror} ({len(fresh) // 1024} КБ)')
    else:
        say('✅', f'server.js уже свежий ({len(fresh) // 1024} КБ)')
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


def step_deps():
    need = []
    for mod, pkg in (('ws', 'ws'), ('better_sqlite3', 'better-sqlite3')):
        try:
            __import__(mod)
        except Exception:                        # noqa: BLE001
            need.append(pkg)
    if need:
        say('📦', 'Ставим: ' + ', '.join(need))
        subprocess.run(f'npm install {" ".join(need)} > /dev/null 2>&1', shell=True)
    else:
        say('✅', 'Зависимости на месте (ws, better-sqlite3)')
    try:
        import pyngrok                            # noqa: F401
    except Exception:                            # noqa: BLE001
        say('📦', 'Ставим pyngrok…')
        subprocess.run(f'{sys.executable} -m pip install -q pyngrok', shell=True)


def start_server():
    env = dict(os.environ, DB_FILE=os.path.join(GAME_DIR, 'game.db'), PORT=str(PORT),
               ADMIN_TOKEN=ADMIN_TOKEN, GAME_SITE=CFG['GAME_SITE'], GH_REPO=CFG['GH_REPO'],
               GH_BRANCH=CFG['GH_BRANCH'])
    if CFG['GH_TOKEN']:
        env['GH_TOKEN'] = CFG['GH_TOKEN']
    log_path = os.path.join(GAME_DIR, 'server.log')
    log = open(log_path, 'w', encoding='utf-8')
    proc = subprocess.Popen(['node', 'server.js'], cwd=GAME_DIR, env=env,
                            stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    for _ in range(40):
        time.sleep(0.4)
        if server_alive():
            say('🟢', f'Сервер запущен, PID {proc.pid}')
            return True
        if proc.poll() is not None:
            break
    say('❌', 'Сервер не поднялся, лог ниже:')
    try:
        print(open(log_path, encoding='utf-8', errors='replace').read()[-2500:])
    except Exception:                            # noqa: BLE001
        pass
    return False


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


def step_publish():
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
    rows.append(('сервер', 'отвечает' if server_alive() else 'НЕ ОТВЕЧАЕТ — запустите ячейку снова'))
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
        return
    import ipywidgets as W
    from IPython.display import display
    panel_diag()

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
        chips = [pill(f'🟢 в сети: {len(state["online"])}', '#065f46', '#d1fae5'),
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
        p = next((x for x in state['players'] if x['name'] == picked()), None)
        if p:
            px_x.value, px_z.value = str(round(p.get('pos_x') or 0)), str(round(p.get('pos_z') or 0))

    for w in (search, filt, sort):
        w.observe(lambda _c: draw_list(), names='value')
    players.observe(on_pick, names='value')

    tab_players = W.VBox([
        W.HBox([search, filt, sort, plain('🔄 Обновить', reload_players, width='130px')]),
        W.HBox([players, W.VBox([
            card, head('Деньги'),
            W.HBox([button('+1 000', 'money_add_1k'), button('+10 000', 'money_add_10k', 'success'),
                    button('+100 000', 'money_add_100k', 'success'), button('−10 %', 'money_take_10pct'),
                    button('Обнулить', 'money_set_0', 'danger')]),
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
        W.HBox([plain(f'${v:,}'.replace(',', ' '), money_preset(v), width='120px') for v in (1000, 5000, 20000, 100000)]),
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
        env = dict(os.environ, DB_FILE=os.path.join(GAME_DIR, 'game.db'), PORT=str(PORT),
                   ADMIN_TOKEN=ADMIN_TOKEN, GAME_SITE=CFG['GAME_SITE'], GH_REPO=CFG['GH_REPO'])
        for k in ('GH_TOKEN', 'PUBLIC_URL'):
            if os.environ.get(k):
                env[k] = os.environ[k]
        log = open(LOG_PATH, 'w', encoding='utf-8')
        subprocess.Popen(['node', 'server.js'], cwd=GAME_DIR, env=env,
                         stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        for _ in range(30):
            time.sleep(0.5)
            if server_alive():
                say_msg(True, 'Сервер перезапущен')
                reload_players()
                refresh_log()
                return
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
        W.HBox([reason, danger, px_x, px_z]),
        W.HBox([target]),
        W.HBox([car_id, car_num, house_id]),
        W.HBox([announce]),
    ], layout=L(border='1px solid #1e293b', padding='6px', margin='0 0 6px 0'))
    tabs = W.Tab(children=[tab_players, tab_money, tab_items, tab_actions, tab_chat, tab_server],
                 titles=['👥 Игроки', '💵 Деньги', '🎁 Предметы', '🎛 100 кнопок', '📢 Чат', '🖥 Сервер'])
    display(W.VBox([
        W.HTML('<h3 style="margin:0 0 2px">👑 Лос-Город · админ-панель</h3>'
               '<div style="color:#94a3b8;font-size:12px;margin-bottom:6px">'
               'Выберите игрока — действия в карточке. Деньги — вкладка «💵», предметы и инвентарь — «🎁», '
               'все 100 серверных кнопок — «🎛». Поля ниже — параметры: «К кому» для телепорта к игроку, '
               'X/Z, модель, номер, дом, текст и галочка опасных действий.</div>'),
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


# ─────────────────────────── 6. ЗАПУСК ───────────────────────────
def main():
    print('🚀 Лос-Город: поднимаем сервер…')
    step_drive()
    step_files()
    step_deps()
    step_server()
    url = step_tunnel()
    step_publish()
    ws = re.sub(r'^https://', 'wss://', url or '')
    print()
    print('=' * 66)
    print('ИГРОКАМ ДАЙТЕ ОДНУ ССЫЛКУ (адрес сервера они не вводят):')
    print('   ', CFG['GAME_SITE'])
    if ws:
        print('Текущий адрес сервера (клиент находит сам):', ws)
    print('Токен админ-панели:', ADMIN_TOKEN, '· база:', os.path.join(GAME_DIR, 'game.db'))
    print('Панель — ниже: игроки, деньги, 100 кнопок, чат, сервер и логи.')
    print('=' * 66)
    if CFG['SHOW_PANEL'] != '1':
        say('ℹ️', 'Панель выключена в настройках (SHOW_PANEL="0") — сервер при этом работает')
        return
    try:
        show_panel()
    except Exception as e:                        # noqa: BLE001 — панель не должна ронять сервер
        import traceback
        print('❌ Панель не построилась:', e)
        traceback.print_exc()
        print('   Сервер продолжает работать. Панель можно перерисовать так:')
        print('   show_panel()')
        try:
            panel_diag()
        except Exception:                         # noqa: BLE001
            pass


main()
