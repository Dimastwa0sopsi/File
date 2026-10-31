# ======================================================================
#  Админ-панель «Лос-Города» для ячейки Colab
#  — 100 кнопок управления (каталог приходит с сервера: GET /admin/actions)
#  — 🔁 перезапуск сервера прямо из панели
#  — 📜 окно логов сервера (хвост server.log, ошибки подсвечены, автообновление)
#  Запускать в том же рантайме, где стартовал node server.js.
# ======================================================================
import os
import re
import sys
import html
import time
import threading
import subprocess

import ipywidgets as W
from IPython.display import display

API = os.environ.get('ADMIN_API', 'http://127.0.0.1:3000')
TOKEN = os.environ.get('ADMIN_TOKEN', 'losgorod-admin')
GAME_DIR = os.environ.get('GAME_DIR') or '/content/drive/MyDrive/MyGame'
if not os.path.isdir(GAME_DIR):
    GAME_DIR = os.getcwd()
SERVER_JS = os.path.join(GAME_DIR, 'server.js')
LOG_PATH = os.path.join(GAME_DIR, 'server.log')
GAME_URL = os.environ.get('GAME_URL', 'https://dimastwa0sopsi.github.io/File/')
try:
    PORT = int(re.search(r':(\d+)', API).group(1))
except Exception:
    PORT = 3000


# ---------------------------------------------------------------- HTTP
def _get_state():
    return http_json(f'{API}/admin/state?token={TOKEN}', timeout=8)


def _get_actions():
    r = http_json(f'{API}/admin/actions?token={TOKEN}', timeout=8)
    return r.get('groups', {}), r.get('actions', [])


def _act(action, **kw):
    return http_json(f'{API}/admin/action?token={TOKEN}', body={'action': action, **kw}, timeout=15)


def http_json(url, body=None, timeout=8):
    import json as _json
    import urllib.request
    data = None if body is None else _json.dumps(body).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return _json.loads(r.read().decode('utf-8'))


# ---------------------------------------------------------------- адрес для игроков
def to_ws(url):
    """https://x → wss://x, http://x → ws://x, просто хост → wss://хост"""
    t = str(url or '').strip().replace(' ', '')
    if not t:
        return ''
    t = re.sub(r'^https://', 'wss://', t, flags=re.I)
    t = re.sub(r'^http://', 'ws://', t, flags=re.I)
    if not re.match(r'^wss?://', t, flags=re.I):
        t = 'wss://' + t.lstrip('/')
    return t.rstrip('/')


def game_link(ws_url):
    from urllib.parse import quote
    return f'{GAME_URL}?srv={quote(ws_url)}' if ws_url else ''


# ---------------------------------------------------------------- сервер
def restart_server():
    """Перезапуск node server.js в этом рантайме. Возвращает (ok, текст)."""
    if not os.path.exists(SERVER_JS):
        return False, f'Нет {SERVER_JS} — сначала выполните ячейку с сервером'
    subprocess.run('pkill -f "node server.js" || true', shell=True)
    time.sleep(1.0)
    env = dict(os.environ, DB_FILE=os.path.join(GAME_DIR, 'game.db'), PORT=str(PORT), ADMIN_TOKEN=TOKEN)
    log = open(LOG_PATH, 'w')
    subprocess.Popen(['node', 'server.js'], cwd=GAME_DIR, env=env,
                     stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    for _ in range(30):
        time.sleep(0.5)
        try:
            _get_state()
            return True, 'Сервер перезапущен'
        except Exception:
            continue
    return False, 'Сервер не ответил за 15 секунд'


def read_log(lines=40, only_errors=False):
    if not os.path.exists(LOG_PATH):
        return ''
    try:
        with open(LOG_PATH, encoding='utf-8', errors='replace') as f:
            rows = f.readlines()
    except Exception as e:
        return f'Не прочитать лог: {e}'
    if only_errors:
        rows = [r for r in rows if re.search(r'error|ошиб|failed|throw|exception|traceback', r, re.I)]
    return ''.join(rows[-lines:])


def log_html(text):
    """тёмное окно лога: ошибки красным, служебные строки серым"""
    if not text.strip():
        return ('<pre style="margin:0;padding:10px;background:#0b1220;color:#6b7280;border-radius:8px;'
                'font-size:12px;max-height:320px;overflow:auto">Лог пуст — сервер ещё ничего не писал</pre>')
    out = []
    for line in text.splitlines():
        safe = html.escape(line)
        if re.search(r'error|ошиб|failed|throw|exception|traceback', line, re.I):
            out.append(f'<span style="color:#f87171">{safe}</span>')
        elif re.search(r'\bwarn|предупр', line, re.I):
            out.append(f'<span style="color:#fbbf24">{safe}</span>')
        elif line.startswith('>>>'):
            out.append(f'<span style="color:#60a5fa">{safe}</span>')
        else:
            out.append(f'<span style="color:#d1d5db">{safe}</span>')
    return ('<pre style="margin:0;padding:10px;background:#0b1220;border-radius:8px;font-size:12px;'
            'line-height:1.35;max-height:320px;overflow:auto">' + '\n'.join(out) + '</pre>')


# ---------------------------------------------------------------- виджеты
msg = W.HTML('<div style="padding:8px 10px;border-radius:8px;background:#111827;color:#9ca3af">'
             'Готово. Выберите игрока и нажмите кнопку.</div>')
table = W.HTML()
result = W.HTML()
player = W.Dropdown(description='Игрок', options=[], layout=W.Layout(width='360px'))
target = W.Dropdown(description='К кому', options=[], layout=W.Layout(width='360px'))
refresh = W.Button(description='🔄 Обновить', button_style='')
reason = W.Text(value='Нарушение правил', description='Причина', layout=W.Layout(width='300px'))
tx = W.Text(value='516', description='X', layout=W.Layout(width='150px'))
tz = W.Text(value='491', description='Z', layout=W.Layout(width='150px'))
car_id = W.Text(value='ferrato', description='Модель', layout=W.Layout(width='240px'))
car_num = W.Text(value='', description='Номер', layout=W.Layout(width='200px'))
house_id = W.Text(value='house_1', description='Дом', layout=W.Layout(width='220px'))
announce_text = W.Text(value='', description='Текст', layout=W.Layout(width='520px'))
allow_danger = W.Checkbox(value=False, description='Разрешить опасные действия (бан/удаление/массовые)')

# сервер и логи
restart_btn = W.Button(description='🔁 Перезапустить сервер', button_style='warning',
                       layout=W.Layout(width='230px'))
log_refresh = W.Button(description='🔄 Обновить лог', layout=W.Layout(width='150px'))
log_follow = W.Checkbox(value=False, description='Автообновление (2 с)')
log_errors = W.Checkbox(value=False, description='Только ошибки')
log_lines = W.Dropdown(description='Строк', options=[('40', 40), ('120', 120), ('400', 400)],
                       value=40, layout=W.Layout(width='150px'))
log_clear = W.Button(description='🧹 Очистить лог', layout=W.Layout(width='150px'))
log_box = W.HTML(log_html(read_log(40)))

# адрес сервера для игроков (туннель ngrok / Cloudflare / PUBLIC_URL)
public_url = W.Text(value=os.environ.get('PUBLIC_URL', ''), description='Туннель',
                    placeholder='https://xxxx.ngrok-free.dev', layout=W.Layout(width='420px'))
tunnel_btn = W.Button(description='🔄 Взять адрес туннеля', layout=W.Layout(width='230px'))
start_tunnel_btn = W.Button(description='🌐 Поднять туннель (ngrok)', button_style='primary',
                            layout=W.Layout(width='250px'))
ngrok_token = W.Text(value=os.environ.get('NGROK_TOKEN', ''), description='NGROK',
                     placeholder='токен с dashboard.ngrok.com', layout=W.Layout(width='380px'))
link_box = W.HTML('')


def _rebuild_link(*_):
    ws = to_ws(public_url.value)
    if not ws:
        link_box.value = ('<div style="color:#9ca3af;font-size:12px;padding:6px 0">'
                          'Адрес сервера неизвестен: вставьте ссылку туннеля или задайте PUBLIC_URL в Colab.</div>')
        return
    link = game_link(ws)
    link_box.value = (
        '<div style="padding:8px 10px;border-radius:8px;background:#0b1220;color:#d1d5db;font-size:12px">'
        f'<div style="color:#9ca3af;margin-bottom:4px">адрес для поля «Адрес сервера» в игре:</div>'
        f'<div style="font-family:monospace;color:#93c5fd;user-select:all">{html.escape(ws)}</div>'
        f'<div style="color:#9ca3af;margin:6px 0 4px">или откройте игру по ссылке — адрес подставится сам:</div>'
        f'<div style="font-family:monospace;color:#86efac;user-select:all;word-break:break-all">{html.escape(link)}</div>'
        '</div>')


def _ngrok_local():
    """публичный адрес у работающего ngrok (его локальный API на 4040)"""
    try:
        data = http_json('http://127.0.0.1:4040/api/tunnels', timeout=3)
        for t in data.get('tunnels') or []:
            u = str(t.get('public_url') or '')
            if u.startswith('https://'):
                return u
    except Exception:
        pass
    return ''


def _tunnel_clicked(_btn=None):
    url = _ngrok_local()
    source = 'ngrok'
    if not url:
        try:
            t = http_json(f'{API}/admin/tunnel?token={TOKEN}', timeout=4)
            url = t.get('url') or ''
            source = t.get('source') or 'сервера'
        except Exception as e:
            return _show(False, f'Сервер не ответил: {e}')
    if not url:
        _show(False, 'Туннель не найден: нажмите «🌐 Поднять туннель» либо вставьте адрес вручную в поле «Туннель».')
    else:
        public_url.value = url
        _show(True, f'Адрес из {source}: {url}')
    _rebuild_link()


def _start_tunnel(_btn=None):
    """поднять ngrok прямо из панели: без него игроки снаружи не подключатся"""
    url = _ngrok_local()
    if url:
        public_url.value = url
        _show(True, f'Туннель уже работает: {url}')
        return _rebuild_link()
    token = (ngrok_token.value or '').strip()
    if token:
        os.environ['NGROK_TOKEN'] = token
    try:
        subprocess.run(f'{sys.executable} -m pip install -q pyngrok', shell=True)
        from pyngrok import ngrok, conf
        if token and 'ВСТАВЬТЕ' not in token:
            conf.get_default().auth_token = token
        for t in ngrok.get_tunnels():
            try:
                ngrok.disconnect(t.public_url)
            except Exception:
                pass
        url = ngrok.connect(PORT, 'http').public_url
        os.environ['PUBLIC_URL'] = url
        public_url.value = url
        _show(True, f'Туннель поднят: {url}')
    except Exception as e:
        _show(False, f'Туннель не поднялся: {e}')
    finally:
        _rebuild_link()


public_url.observe(lambda _c: _rebuild_link(), names='value')


def _show(ok, text):
    color = '#065f46' if ok else '#7f1d1d'
    icon = '✅' if ok else '⚠️'
    msg.value = (f'<div style="padding:8px 10px;border-radius:8px;background:{color};color:#fff">'
                 f'{icon} {html.escape(str(text))}</div>')


def _rows_html(rows):
    if not rows:
        return ''
    body = ''.join(f'<div style="padding:2px 0;border-bottom:1px solid #1f2937">{html.escape(str(r))}</div>'
                   for r in rows)
    return ('<div style="margin-top:8px;max-height:220px;overflow:auto;font-family:monospace;'
            f'font-size:12px;color:#d1d5db">{body}</div>')


def _num(text, fallback=0.0):
    try:
        return float(str(text).replace(' ', '').replace(',', '.'))
    except ValueError:
        return fallback


# ---------------------------------------------------------------- вызов
def _run(defn):
    """Выполнить одно из 100 действий по его описанию из каталога сервера."""
    aid = defn['id']
    if defn.get('confirm') and not allow_danger.value:
        return _show(False, f'«{defn["t"]}» необратимо: поставьте галочку «Разрешить опасные действия»')
    if defn.get('need') and not player.value:
        return _show(False, 'Сначала выберите игрока в списке сверху')
    kw = {}
    if defn.get('need'):
        kw['name'] = player.value
    if defn.get('xy'):
        kw['x'] = _num(tx.value, None)
        kw['z'] = _num(tz.value, None)
        if kw['x'] is None or kw['z'] is None:
            return _show(False, 'Координаты X и Z должны быть числами')
    if defn.get('target'):
        if not target.value:
            return _show(False, 'Выберите второго игрока в списке «К кому»')
        kw['target'] = target.value
    if defn.get('car'):
        kw['carId'] = car_id.value.strip() or 'lada'
    if defn.get('number'):
        kw['number'] = car_num.value.strip()[:9]
    if defn.get('house'):
        kw['house'] = house_id.value.strip() or 'house_1'
    if defn.get('text'):
        text = announce_text.value.strip()
        if not text:
            return _show(False, 'Введите текст в поле «Текст»')
        kw['text'] = text
    if aid in ('ban', 'ban_silent', 'warn'):
        kw['reason'] = reason.value.strip() or 'Нарушение правил'
    try:
        r = _act(aid, **kw)
    except Exception as e:
        return _show(False, f'Сервер не ответил: {e}')
    _show(bool(r.get('ok')), r.get('message') or r.get('error') or 'готово')
    result.value = _rows_html(r.get('rows') or [])
    if defn.get('text'):
        announce_text.value = ''
    refresh_all()


def _mk_button(defn):
    style = 'danger' if defn.get('confirm') else ('info' if defn.get('need') else '')
    b = W.Button(description=defn['t'], button_style=style, layout=W.Layout(width='218px', margin='2px'))
    b.on_click(lambda _btn, d=defn: _run(d))
    return b


# ---------------------------------------------------------------- таблица
def refresh_all(_btn=None):
    try:
        st = _get_state()
    except Exception as e:
        table.value = (f'<div style="color:#fca5a5">Нет связи с сервером: {html.escape(str(e))}. '
                       'Нажмите «🔁 Перезапустить сервер».</div>')
        return
    players = st.get('players', [])
    online = set(st.get('online', []))
    opts = []
    for p in players:
        mark = ' 🟢' if p['name'] in online else ''
        money = f"{int(p['money']):,}".replace(',', ' ')
        opts.append((f"{p['name']}{mark} · ${money}", p['name']))
    cur, cur_t = player.value, target.value
    player.options = opts
    target.options = opts
    if cur and any(v == cur for _, v in opts):
        player.value = cur
    if cur_t and any(v == cur_t for _, v in opts):
        target.value = cur_t
    rows = []
    for p in players:
        state = '<b style="color:#34d399">в сети</b>' if p['name'] in online else '<span style="color:#9ca3af">офлайн</span>'
        ban = f"<span style='color:#f87171'>{html.escape(str(p.get('ban_reason') or 'бан'))}</span>" if p.get('banned') else '—'
        money = f"{int(p['money']):,}".replace(',', ' ')
        rows.append(
            f"<tr><td>{html.escape(str(p['name']))}</td><td>{state}</td><td>${money}</td>"
            f"<td>{html.escape(str(p.get('car_id') or '—'))} {html.escape(str(p.get('car_number') or ''))}</td>"
            f"<td>{round(p.get('pos_x') or 0)}; {round(p.get('pos_z') or 0)}</td>"
            f"<td>{p.get('warns') or 0}</td><td>{'🔇' if p.get('muted') else ''}</td><td>{ban}</td></tr>")
    table.value = ('<div style="max-height:260px;overflow:auto"><table style="width:100%;border-collapse:collapse;'
                   'font-size:13px"><thead><tr style="text-align:left;color:#9ca3af"><th>Ник</th><th>Статус</th>'
                   '<th>Деньги</th><th>Машина</th><th>X; Z</th><th>Варн.</th><th>Чат</th><th>Бан</th></tr>'
                   '</thead><tbody>' + ''.join(rows) + '</tbody></table></div>')
    flags = st.get('flags') or {}
    extra = []
    if flags.get('maintenance'):
        extra.append('🚧 техработы')
    if flags.get('globalMute'):
        extra.append('🤐 глобальный мут')
    if flags.get('frozen'):
        extra.append('🧊 заморожены: ' + ', '.join(flags['frozen']))
    table.value += ('<div style="color:#9ca3af;font-size:12px;margin-top:6px">'
                    f'Онлайн: {len(online)} · аккаунтов: {len(players)}'
                    + (' · ' + ' · '.join(extra) if extra else '') + '</div>')


# ---------------------------------------------------------------- логи
def _refresh_log(_btn=None):
    log_box.value = log_html(read_log(int(log_lines.value), bool(log_errors.value)))


def _restart_clicked(_btn=None):
    _show(True, 'Перезапускаем сервер…')
    ok, text = restart_server()
    _show(ok, text)
    _refresh_log()
    if ok:
        refresh_all()


def _log_clear(_btn=None):
    try:
        open(LOG_PATH, 'w').close()
    except Exception:
        pass
    _refresh_log()


def _auto_loop():
    """тихое автообновление окна лога, пока стоит галочка"""
    while True:
        time.sleep(2)
        try:
            if log_follow.value:
                _refresh_log()
        except Exception:
            pass


refresh.on_click(refresh_all)
restart_btn.on_click(_restart_clicked)
tunnel_btn.on_click(_tunnel_clicked)
start_tunnel_btn.on_click(_start_tunnel)
log_refresh.on_click(_refresh_log)
log_clear.on_click(_log_clear)
log_errors.observe(lambda _c: _refresh_log(), names='value')
log_lines.observe(lambda _c: _refresh_log(), names='value')
threading.Thread(target=_auto_loop, daemon=True).start()

# ---------------------------------------------------------------- каталог
try:
    GROUPS, ACTIONS = _get_actions()
except Exception as e:
    GROUPS, ACTIONS = {}, []
    _show(False, f'Каталог кнопок не загрузился: {e}. Нажмите «🔁 Перезапустить сервер».')

if ACTIONS:
    order = ['money', 'mod', 'tp', 'car', 'chat', 'player', 'server', 'event']
    order += [g for g in GROUPS if g not in order]
    tabs, titles = [], []
    for gid in order:
        items = [d for d in ACTIONS if d.get('g') == gid]
        if not items:
            continue
        grid = W.GridBox([_mk_button(d) for d in items], layout=W.Layout(grid_template_columns='repeat(3, 222px)'))
        tabs.append(W.VBox([W.HTML(f'<div style="color:#9ca3af;font-size:12px;margin:4px 0">'
                                   f'Кнопок в группе: {len(items)}</div>'), grid]))
        titles.append(GROUPS.get(gid, gid))
    tabs_view = W.Tab(children=tabs, titles=titles)
else:
    tabs_view = W.HTML('<div style="color:#fca5a5;padding:8px">Кнопки не загружены: сервер не отвечает. '
                       'Нажмите «🔁 Перезапустить сервер», затем «🔄 Обновить».</div>')

address_panel = W.VBox([
    W.HTML('<b>🔗 Адрес сервера для игроков</b> <span style="color:#6b7280;font-size:12px">'
           'после каждого перезапуска туннеля адрес меняется — игрокам нужен новый</span>'),
    W.HBox([public_url, tunnel_btn]),
    W.HBox([ngrok_token, start_tunnel_btn]),
    link_box,
])

log_panel = W.VBox([
    W.HTML('<b>📜 Логи сервера</b> <span style="color:#6b7280;font-size:12px">'
           f'{html.escape(LOG_PATH)} · порт {PORT}</span>'),
    W.HBox([restart_btn, log_refresh, log_follow, log_errors, log_lines, log_clear]),
    log_box,
])

panel = W.VBox([
    W.HTML('<h3 style="margin:0 0 4px">👑 Админ-панель Лос-Города · 100 кнопок</h3>'
           '<div style="color:#9ca3af;font-size:12px;margin-bottom:8px">'
           'Управление сервером из Colab: изменения сразу уходят в игру и в базу на Google Диске.</div>'),
    msg,
    W.HBox([player, target, refresh]),
    W.HTML('<b>Параметры для кнопок</b>'),
    W.HBox([reason, tx, tz]),
    W.HBox([car_id, car_num, house_id]),
    W.HBox([announce_text]),
    W.HBox([allow_danger]),
    result,
    address_panel,
    tabs_view,
    log_panel,
    W.HTML('<b>👥 Игроки</b>'),
    table,
])
_rebuild_link()
display(panel)
refresh_all()
