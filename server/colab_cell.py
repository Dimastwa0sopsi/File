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
#   7) показывает админ-панель: поиск игроков, карточка, 100 кнопок, чат,
#      сервер и логи
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


def show_panel():
    """Поиск игроков, карточка быстрых действий, 100 серверных кнопок, чат, сервер, логи."""
    try:
        import ipywidgets as W
        from IPython.display import display
    except Exception as e:                        # noqa: BLE001
        print('Админ-панель недоступна (нет ipywidgets):', e)
        return

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
               'галочка опасных) — в панели сверху.</div>'),
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
        W.HBox([car_id, car_num, house_id]),
        W.HBox([announce]),
    ], layout=L(border='1px solid #1e293b', padding='6px', margin='0 0 6px 0'))
    tabs = W.Tab(children=[tab_players, tab_actions, tab_chat, tab_server],
                 titles=['👥 Игроки', '🎛 100 кнопок', '📢 Чат', '🖥 Сервер'])
    display(W.VBox([
        W.HTML('<h3 style="margin:0 0 2px">👑 Лос-Город · админ-панель</h3>'
               '<div style="color:#94a3b8;font-size:12px;margin-bottom:6px">'
               'Выберите игрока — действия в карточке. Все 100 серверных кнопок — на второй вкладке. '
               'Поля ниже — параметры для кнопок (телепорт, модель, номер, дом, текст).</div>'),
        status, msg, result, toolbar, tabs]))
    reload_players()
    draw_chat()
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
    print('Панель — ниже: игроки, 100 кнопок, чат, сервер и логи.')
    print('=' * 66)
    if CFG['SHOW_PANEL'] == '1':
        show_panel()


main()
