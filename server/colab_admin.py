# ======================================================================
#  Мини админ-панель «Лос-Города» для ячейки Colab
#  Запускайте ПОСЛЕ ячейки с сервером (colab_setup.py).
#  Всё управление — кнопками: деньги, бан, кик, телепорт, машина и т.д.
# ======================================================================
import os
import requests
import ipywidgets as W
from IPython.display import display, clear_output, HTML

API = os.environ.get('ADMIN_API', 'http://127.0.0.1:3000')
TOKEN = os.environ.get('ADMIN_TOKEN', 'losgorod-admin')

def _get_state():
    return requests.get(f'{API}/admin/state', params={'token': TOKEN}, timeout=8).json()

def _act(action, **kw):
    body = {'action': action, **kw}
    return requests.post(f'{API}/admin/action', params={'token': TOKEN}, json=body, timeout=10).json()

# ---------- виджеты ----------
msg = W.HTML('<div style="padding:8px 10px;border-radius:8px;background:#111827;color:#9ca3af">'
             'Готово. Нажмите «Обновить», чтобы загрузить игроков.</div>')
table = W.HTML()
player = W.Dropdown(description='Игрок', options=[], layout=W.Layout(width='420px'))
refresh = W.Button(description='🔄 Обновить', button_style='')
amount = W.Text(value='1000000', description='Сумма $', layout=W.Layout(width='220px'))
reason = W.Text(value='Нарушение правил', description='Причина', layout=W.Layout(width='320px'))
tx = W.Text(value='516', description='X', layout=W.Layout(width='150px'))
tz = W.Text(value='491', description='Z', layout=W.Layout(width='150px'))
car_id = W.Text(value='ferrato', description='Машина', layout=W.Layout(width='240px'))
car_num = W.Text(value='', description='Номер', layout=W.Layout(width='200px'))
announce_text = W.Text(value='', description='Объявление', layout=W.Layout(width='520px'))
confirm_del = W.Checkbox(value=False, description='Подтвердить удаление')

def _money(mode):
    try:
        v = int(float(amount.value.replace(' ', '').replace(',', '.')))
    except ValueError:
        return _show(False, 'Введите число в поле «Сумма $»')
    if not player.value:
        return _show(False, 'Выберите игрока')
    r = _act('money', name=player.value, amount=v, mode=mode)
    _show(r.get('ok'), r.get('message') or r.get('error'))
    refresh_all()

def _show(ok, text):
    color = '#065f46' if ok else '#7f1d1d'
    icon = '✅' if ok else '⚠️'
    msg.value = f'<div style="padding:8px 10px;border-radius:8px;background:{color};color:#fff">{icon} {text}</div>'

def _do(action, **kw):
    if not player.value and action not in ('clearchat', 'announce'):
        return _show(False, 'Сначала выберите игрока')
    r = _act(action, name=player.value, **kw)
    _show(bool(r.get('ok')), r.get('message') or r.get('error'))
    refresh_all()

def _tp():
    try:
        x, z = float(tx.value), float(tz.value)
    except ValueError:
        return _show(False, 'Координаты должны быть числами')
    _do('tp', x=x, z=z)

def _car():
    _do('car', carId=car_id.value.strip() or 'lada', number=car_num.value.strip()[:9])

def _announce():
    text = announce_text.value.strip()
    if not text:
        return _show(False, 'Введите текст объявления')
    r = _act('announce', text=text)
    _show(bool(r.get('ok')), r.get('message') or r.get('error'))
    announce_text.value = ''
    refresh_all()

def _delete():
    if not confirm_del.value:
        return _show(False, 'Поставьте галочку «Подтвердить удаление»')
    _do('delete')
    confirm_del.value = False

def _clear_chat():
    r = _act('clearchat')
    _show(bool(r.get('ok')), r.get('message') or r.get('error'))
    refresh_all()

# ---------- таблица игроков ----------
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
    current = player.value
    player.options = opts
    if current and any(v == current for _, v in opts):
        player.value = current
    rows = []
    for p in players:
        state = '<b style="color:#34d399">в сети</b>' if p['name'] in online else '<span style="color:#9ca3af">офлайн</span>'
        ban = f"<span style='color:#f87171'>{p['ban_reason'] or 'бан'}</span>" if p['banned'] else '—'
        money = f"{int(p['money']):,}".replace(',', ' ')
        rows.append(
            f"<tr><td>{p['name']}</td><td>{state}</td><td>${money}</td>"
            f"<td>{p['car_id'] or '—'} {p['car_number'] or ''}</td>"
            f"<td>{round(p['pos_x'])}; {round(p['pos_z'])}</td><td>{ban}</td></tr>"
        )
    table.value = (
        '<div style="max-height:260px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
        '<thead><tr style="text-align:left;color:#9ca3af"><th>Ник</th><th>Статус</th><th>Деньги</th>'
        '<th>Машина</th><th>X; Z</th><th>Бан</th></tr></thead><tbody>'
        + ''.join(rows) + '</tbody></table></div>'
    )

# ---------- кнопки ----------
b10k = W.Button(description='+10 000')
b100k = W.Button(description='+100 000')
b1m = W.Button(description='+1 000 000')
bset = W.Button(description='Задать сумму', button_style='info')
btake = W.Button(description='Списать всё', button_style='warning')
b_ban = W.Button(description='🚫 Забанить', button_style='danger')
b_unban = W.Button(description='✅ Разбанить', button_style='success')
b_kick = W.Button(description='👢 Кикнуть', button_style='warning')
b_tp = W.Button(description='🚀 Телепорт', button_style='primary')
b_spawn = W.Button(description='🏠 На спавн')
b_car = W.Button(description='🚗 Выдать машину', button_style='primary')
b_ann = W.Button(description='📢 Объявление', button_style='info')
b_clear = W.Button(description='🧹 Очистить чат')
b_del = W.Button(description='🗑 Удалить игрока', button_style='danger')

bset.on_click(lambda _: _money('set') or None)
b_ban.on_click(lambda _: _do('ban', reason=reason.value.strip() or 'Нарушение правил') or None)
b_unban.on_click(lambda _: _do('unban') or None)
b_kick.on_click(lambda _: _do('kick') or None)
b_tp.on_click(lambda _: _tp() or None)
b_spawn.on_click(lambda _: _do('resetpos') or None)
b_car.on_click(lambda _: _car() or None)
b_ann.on_click(lambda _: _announce() or None)
b_clear.on_click(lambda _: _clear_chat() or None)
b_del.on_click(lambda _: _delete() or None)
refresh.on_click(lambda _: refresh_all() or None)

# суммы для кнопок ±: подставляем значение перед вызовом
def _amt(btn, value):
    btn.on_click(lambda _: (setattr(amount, 'value', str(value)), _money('add')))
_amt(b10k, 10000); _amt(b100k, 100000); _amt(b1m, 1000000)
btake.on_click(lambda _: (setattr(amount, 'value', '0'), _money('set')))

panel = W.VBox([
    W.HTML('<h3 style="margin:0 0 4px">👑 Админ-панель Лос-Города</h3>'
           '<div style="color:#9ca3af;font-size:12px;margin-bottom:8px">'
           'Управление сервером из Colab: всё меняется в базе на Google Диске и сразу применяется к игрокам.</div>'),
    msg,
    W.HBox([player, refresh]),
    W.HTML('<b>💵 Деньги</b>'),
    W.HBox([amount, bset, b10k, b100k, b1m, btake]),
    W.HTML('<b>🛡 Модерация</b>'),
    W.HBox([reason, b_ban, b_unban, b_kick]),
    W.HTML('<b>🚀 Телепорт</b>'),
    W.HBox([tx, tz, b_tp, b_spawn]),
    W.HTML('<b>🚗 Транспорт и объявления</b>'),
    W.HBox([car_id, car_num, b_car]),
    W.HBox([announce_text, b_ann, b_clear]),
    W.HTML('<b>🗑 Опасное</b>'),
    W.HBox([confirm_del, b_del]),
    W.HTML('<b>👥 Игроки</b>'),
    table,
])
display(panel)
refresh_all()
