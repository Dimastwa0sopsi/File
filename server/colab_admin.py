# ======================================================================
#  Админ-панель «Лос-Города» для ячейки Colab — 100 кнопок управления
#  Запускайте ПОСЛЕ ячейки с сервером (colab_setup.py).
#  Кнопки строятся по каталогу сервера: GET /admin/actions
#  (8 групп: деньги, модерация, телепорт, транспорт, чат, игрок, сервер, события)
# ======================================================================
import os
import requests
import ipywidgets as W
from IPython.display import display

API = os.environ.get('ADMIN_API', 'http://127.0.0.1:3000')
TOKEN = os.environ.get('ADMIN_TOKEN', 'losgorod-admin')


def _get_state():
    return requests.get(f'{API}/admin/state', params={'token': TOKEN}, timeout=8).json()


def _get_actions():
    r = requests.get(f'{API}/admin/actions', params={'token': TOKEN}, timeout=8).json()
    return r.get('groups', {}), r.get('actions', [])


def _act(action, **kw):
    body = {'action': action, **kw}
    return requests.post(f'{API}/admin/action', params={'token': TOKEN}, json=body, timeout=12).json()


# ---------------------------------------------------------------- виджеты
msg = W.HTML('<div style="padding:8px 10px;border-radius:8px;background:#111827;color:#9ca3af">'
             'Готово. Нажмите «Обновить», чтобы загрузить игроков.</div>')
table = W.HTML()
result = W.HTML()
player = W.Dropdown(description='Игрок', options=[], layout=W.Layout(width='380px'))
target = W.Dropdown(description='К кому', options=[], layout=W.Layout(width='380px'))
refresh = W.Button(description='🔄 Обновить', button_style='')
reason = W.Text(value='Нарушение правил', description='Причина', layout=W.Layout(width='300px'))
tx = W.Text(value='516', description='X', layout=W.Layout(width='150px'))
tz = W.Text(value='491', description='Z', layout=W.Layout(width='150px'))
car_id = W.Text(value='ferrato', description='Модель', layout=W.Layout(width='240px'))
car_num = W.Text(value='', description='Номер', layout=W.Layout(width='200px'))
house_id = W.Text(value='house_1', description='Дом', layout=W.Layout(width='220px'))
announce_text = W.Text(value='', description='Текст', layout=W.Layout(width='520px'))
allow_danger = W.Checkbox(value=False, description='Разрешить опасные действия (бан/удаление/массовые)')


def _show(ok, text):
    color = '#065f46' if ok else '#7f1d1d'
    icon = '✅' if ok else '⚠️'
    msg.value = (f'<div style="padding:8px 10px;border-radius:8px;background:{color};color:#fff">'
                 f'{icon} {text}</div>')


def _rows_html(rows):
    if not rows:
        return ''
    body = ''.join(f'<div style="padding:2px 0;border-bottom:1px solid #1f2937">{r}</div>' for r in rows)
    return ('<div style="margin-top:8px;max-height:220px;overflow:auto;font-family:monospace;'
            f'font-size:12px;color:#d1d5db">{body}</div>')


def _num(text, fallback=0.0):
    try:
        return float(str(text).replace(' ', '').replace(',', '.'))
    except ValueError:
        return fallback


# ---------------------------------------------------------------- вызов
def _run(defn):
    """Выполнить одно из 100 действий по его описанию из каталога."""
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
    except Exception as e:  # сеть/сервер
        return _show(False, f'Сервер не ответил: {e}')
    _show(bool(r.get('ok')), r.get('message') or r.get('error') or 'готово')
    result.value = _rows_html(r.get('rows') or [])
    if defn.get('text'):
        announce_text.value = ''
    refresh_all()


def _mk_button(defn):
    style = 'danger' if defn.get('confirm') else ('info' if defn.get('need') else '')
    b = W.Button(description=defn['t'], button_style=style,
                 layout=W.Layout(width='218px', margin='2px'))
    b.on_click(lambda _btn, d=defn: _run(d))
    return b


# ---------------------------------------------------------------- таблица
def refresh_all():
    try:
        st = _get_state()
    except Exception as e:
        table.value = f'<div style="color:#fca5a5">Нет связи с сервером: {e}</div>'
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
        ban = f"<span style='color:#f87171'>{p.get('ban_reason') or 'бан'}</span>" if p.get('banned') else '—'
        money = f"{int(p['money']):,}".replace(',', ' ')
        rows.append(
            f"<tr><td>{p['name']}</td><td>{state}</td><td>${money}</td>"
            f"<td>{p.get('car_id') or '—'} {p.get('car_number') or ''}</td>"
            f"<td>{round(p.get('pos_x') or 0)}; {round(p.get('pos_z') or 0)}</td>"
            f"<td>{p.get('warns') or 0}</td>"
            f"<td>{'🔇' if p.get('muted') else ''}</td><td>{ban}</td></tr>"
        )
    table.value = (
        '<div style="max-height:260px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
        '<thead><tr style="text-align:left;color:#9ca3af"><th>Ник</th><th>Статус</th><th>Деньги</th>'
        '<th>Машина</th><th>X; Z</th><th>Варн.</th><th>Чат</th><th>Бан</th></tr></thead><tbody>'
        + ''.join(rows) + '</tbody></table></div>'
    )
    flags = st.get('flags') or {}
    extra = []
    if flags.get('maintenance'):
        extra.append('🚧 техработы')
    if flags.get('globalMute'):
        extra.append('🤐 глобальный мут')
    if flags.get('frozen'):
        extra.append('🧊 заморожены: ' + ', '.join(flags['frozen']))
    state_line = ('<div style="color:#9ca3af;font-size:12px;margin-top:6px">'
                  f'Онлайн: {len(online)} · аккаунтов: {len(players)}'
                  + (' · ' + ' · '.join(extra) if extra else '') + '</div>')
    table.value += state_line


# ---------------------------------------------------------------- каталог
try:
    GROUPS, ACTIONS = _get_actions()
except Exception as e:
    GROUPS, ACTIONS = {}, []
    msg.value = (f'<div style="padding:8px 10px;border-radius:8px;background:#7f1d1d;color:#fff">'
                 f'⚠️ Каталог кнопок не загрузился: {e}. Проверьте, что сервер запущен и обновлён.</div>')

tabs = []
order = ['money', 'mod', 'tp', 'car', 'chat', 'player', 'server', 'event']
for gid in order:
    items = [d for d in ACTIONS if d.get('g') == gid]
    if not items:
        continue
    grid = W.GridBox([_mk_button(d) for d in items],
                     layout=W.Layout(grid_template_columns='repeat(3, 222px)'))
    tabs.append(W.VBox([W.HTML(f'<div style="color:#9ca3af;font-size:12px;margin:4px 0">'
                               f'Кнопок в группе: {len(items)}</div>'), grid]))
if not tabs:
    tabs = [W.HTML('<div style="color:#fca5a5">Кнопки не загружены — обновите ячейку сервера и запустите панель заново.</div>')]

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
    W.Tab(children=tabs, titles=[GROUPS.get(g, g) for g in order if any(d.get('g') == g for d in ACTIONS)] or ['нет']),
    W.HTML('<b>👥 Игроки</b>'),
    table,
])
display(panel)
refresh_all()
