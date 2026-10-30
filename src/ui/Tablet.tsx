import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/game';
import { VEHICLES, KIOSK_TYPES, ITEMS, AMMO_NAMES, LIMITED, limitedAvailable, limitedLeft, SCOOTER_RATE } from '../game/data';
import { loadPhotos, deletePhoto } from '../game/game';
import { MapCanvas } from './Hud';
import { InventoryGrid } from './InventoryGrid';
import { SUPPORT_BOT } from '../game/support';

const $ = (n: number) => '$' + Math.round(n).toLocaleString('ru');
type Scr = 'store' | 'tg' | 'gallery' | 'vzhuh' | 'food' | 'coffee' | 'pizza' | 'pharm' | 'limited' | 'quest' | 'home' | 'map' | 'taxi' | 'sos' | 'homes' | 'cars' | 'bazaar' | 'jobs' | 'biz' | 'bank' | 'inv' | 'players' | 'support' | 'promo';
const TITLES: Record<Scr, string> = { store: 'LosSt — магазин приложений', tg: 'Телеграм', gallery: 'Галерея', vzhuh: 'Вжух Самокаты', food: 'Вкусно Доставка', coffee: 'Кофейня «Зерно»', pizza: 'Пиццерия «Сыр»', pharm: 'Аптека 24', limited: 'LIMITED Drop', quest: 'Сюжет', home: '', map: 'Карта и GPS', taxi: 'Такси', sos: 'Экстренные службы', homes: 'Недвижимость', cars: 'Мой транспорт', bazaar: 'Автобазар', jobs: 'Работа', biz: 'Бизнес', bank: 'Банк и штрафы', inv: 'Инвентарь', players: 'Игроки онлайн', support: 'Поддержка', promo: 'Промокод' };
interface P { g: Game; go: (s: Scr) => void; close: () => void }

export function Tablet({ g, close, initial }: { g: Game; close: () => void; initial?: string }) {
  const [scr, setScr] = useState<Scr>((initial as Scr) in TITLES ? (initial as Scr) : 'home');
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 700); return () => clearInterval(t); }, []);
  const s = g.getState();
  const hh = Math.floor(s.gameTime / 60), mm = Math.floor(s.gameTime % 60);
  const go = (x: Scr) => { g.sound.click(); setScr(x); };
  return (
    <div className="tb-back" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) close(); }}>
      <div className="tb">
        <div className="tb-status">
          <span>{String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}</span>
          <span className="mid">{g.online ? `🌐 ${s.nick ?? ''} · ${g.net?.status === 'online' ? 'в сети' : 'подключение…'}` : 'LG·Tab'}</span>
          <span>{$(s.money)}  ▮▮▮ 87%</span>
        </div>
        <div className="tb-screen">
          {scr !== 'home' && <div className="tb-head"><button onClick={() => go('home')}>‹ Домой</button><h3>{TITLES[scr]}</h3><button onClick={close}>✕</button></div>}
          {scr === 'home' && <Home g={g} go={go} close={close} />}
          {scr === 'map' && <MapCanvas g={g} mode="waypoint" height="min(52vh, 420px)" />}
          {scr === 'taxi' && <Taxi g={g} go={go} close={close} />}
          {scr === 'sos' && <Sos g={g} go={go} close={close} />}
          {scr === 'homes' && <Homes g={g} go={go} close={close} />}
          {scr === 'cars' && <Cars g={g} go={go} close={close} />}
          {scr === 'bazaar' && <Bazaar g={g} go={go} close={close} />}
          {scr === 'jobs' && <Jobs g={g} go={go} close={close} />}
          {scr === 'biz' && <Biz g={g} go={go} close={close} />}
          {scr === 'bank' && <Bank g={g} go={go} close={close} />}
          {scr === 'inv' && <InventoryGrid g={g} />}
          {scr === 'quest' && <Quest g={g} go={go} close={close} />}
          {scr === 'store' && <Store g={g} go={go} close={close} />}
          {scr === 'tg' && <Telegram g={g} go={go} close={close} />}
          {scr === 'gallery' && <Gallery g={g} go={go} close={close} />}
          {scr === 'vzhuh' && <Vzhuh g={g} go={go} close={close} />}
          {scr === 'limited' && <Limited g={g} go={go} close={close} />}
          {(scr === 'food' || scr === 'coffee' || scr === 'pizza' || scr === 'pharm') && <Delivery g={g} app={scr} />}
          {scr === 'players' && <Players g={g} go={go} close={close} />}
          {scr === 'support' && <Support g={g} go={go} close={close} />}
          {scr === 'promo' && <Promo g={g} go={go} close={close} />}
        </div>
        <button className="tb-home" onClick={() => (scr === 'home' ? close() : go('home'))} aria-label="Домой" />
      </div>
    </div>
  );
}

function App({ ico, label, color, on, badge }: { ico: string; label: string; color: string; on: () => void; badge?: string | number }) {
  return (
    <button className="tb-app" onClick={on}>
      <span className="ico" style={{ background: `linear-gradient(145deg, ${color}, ${color}bb)` }}>{ico}{badge !== undefined && badge !== 0 && badge !== '' ? <em>{badge}</em> : null}</span>
      <span className="lbl">{label}</span>
    </button>
  );
}

function Home({ g, go }: P) {
  const s = g.getState();
  const fines = s.fines.reduce((a, f) => a + f.amount, 0);
  const acc = s.kiosks.reduce((a, k) => a + k.acc, 0);
  const t = g.taxi;
  return (
    <>
      <div className="tb-widget">
        <div><small>Баланс</small><b>{$(s.money)}</b></div>
        <div><small>Здоровье</small><b>{Math.round(s.health)}%</b></div>
        <div><small>Розыск</small><b className="stars">{'★'.repeat(s.wanted) || '—'}</b></div>
        <div><small>Место</small><b className="loc">{g.locationName()}</b></div>
      </div>
      <div className="tb-grid">
        <App ico="🗺️" label="Карта" color="#0ea5e9" on={() => go('map')} />
        <App ico="🚕" label="Такси" color="#eab308" badge={t ? '•' : undefined} on={() => go('taxi')} />
        <App ico="🆘" label="Службы" color="#ef4444" on={() => go('sos')} />
        <App ico="🏠" label="Жильё" color="#22c55e" badge={s.properties.length || undefined} on={() => go('homes')} />
        <App ico="🚘" label="Транспорт" color="#3b82f6" badge={s.vehicles.length || undefined} on={() => go('cars')} />
        <App ico="🏷️" label="Автобазар" color="#14b8a6" badge={s.listings?.length || undefined} on={() => go('bazaar')} />
        <App ico="💼" label="Работа" color="#8b5cf6" badge={g.job ? '•' : undefined} on={() => go('jobs')} />
        <App ico="🏪" label="Бизнес" color="#0d9488" badge={acc ? $(acc) : undefined} on={() => go('biz')} />
        <App ico="🏦" label="Банк" color="#b45309" badge={fines ? '!' : undefined} on={() => go('bank')} />
        <App ico="🎒" label="Инвентарь" color="#78716c" on={() => go('inv')} />
        {!g.online && <App ico="📜" label="Сюжет" color="#a16207" badge={s.quest && !s.quest.done ? '!' : undefined} on={() => go('quest')} />}
        <App ico="💃" label="Анимации" color="#c026d3" on={() => g.openPanel({ type: 'emotes' })} />
        <App ico="🪪" label="Паспорт" color="#334155" on={() => g.openPanel({ type: 'passport' })} />
        {g.online && <App ico="👥" label="Игроки" color="#06b6d4" badge={g.net?.players.size} on={() => go('players')} />}
        <App ico="🛟" label="Поддержка" color="#f43f5e" on={() => go('support')} />
        <App ico="🎁" label="Промокод" color="#ec4899" on={() => go('promo')} />
        <App ico="🛍️" label="LosSt" color="#7c5cff" on={() => go('store')} />
        <App ico="📷" label="Камера" color="#0f172a" on={() => g.startCamera('rear')} />
        <App ico="🖼️" label="Галерея" color="#0369a1" on={() => go('gallery')} />
        {APPS.filter((a) => g.hasApp(a.id)).map((a) => <App key={a.id} ico={a.icon} label={a.short} color={a.color} badge={a.id === 'tg' ? Object.values(s.unread ?? {}).reduce((x, y) => x + y, 0) || undefined : undefined} on={() => go(a.id as Scr)} />)}
        <App ico="⚙️" label="Настройки" color="#64748b" on={() => g.openPanel({ type: 'settings' })} />
        {g.online ? <App ico="🏁" label="Выйти из онлайна" color="#dc2626" on={() => g.leaveOnline()} /> : <App ico="🌐" label="Онлайн" color="#16a34a" on={() => g.openPanel({ type: 'onlineJoin' })} />}
      </div>
    </>
  );
}

function Quest({ g }: P) {
  const s = g.getState(); const q = s.quest;
  const steps = ['Поговорить с дядей Васей', 'Купить воду', 'Найти транспорт', 'Забрать посылку в гаражах', 'Отвезти посылку на пляж', 'Отбиться от бандитов', 'Вернуться к дяде Васе'];
  return (
    <div className="tb-list">
      <div className="tb-card big">📜 <div><b>«Новичок в Лос-Городе»</b><small>{q?.done ? 'Пройдено ✔ Награда получена' : 'Награда: $3000 и пистолет · ~5 минут'}</small></div></div>
      {steps.map((t, i) => <div key={i} className="tb-card">{q?.done || (q && q.step > i) ? '✅' : q?.step === i ? '▶️' : '⬜'} <div className="grow"><b>{t}</b></div></div>)}
      {q && !q.done && <button className="ui-btn ghost" onClick={() => g.skipQuest()}>Пропустить сюжет</button>}
    </div>
  );
}
function Taxi({ g, close }: P) {
  const t = g.taxi;
  const stage: Record<string, string> = { coming: 'едет к вам', waiting: 'ждёт вас', riding: 'в пути', arrived: 'прибыло', leaving: 'уезжает' };
  return (
    <div className="tb-list">
      <div className="tb-card big">🚕 <div><b>{t ? `Такси ${stage[t.stage] ?? ''}` : 'Нет активного заказа'}</b><small>{t ? `Пройдено ${(t.dist / 1000).toFixed(1)} км · тариф $5 + $12/км` : 'Машина приедет к вам, затем выберите точку на карте'}</small></div></div>
      {!t && <button className="ui-btn main" onClick={() => { g.callTaxi(); close(); }}>Вызвать такси</button>}
      {t && <button className="ui-btn danger" onClick={() => g.cancelTaxi()}>Отменить заказ</button>}
      {g.online && <p className="tb-note">В онлайне можно сесть в такси к другому игроку (F у его машины) — оплата водителю списывается при выходе. Такси можно купить в автосалоне.</p>}
    </div>
  );
}

function Sos({ g, close }: P) {
  return (
    <div className="tb-list">
      <button className="tb-card" onClick={() => { g.callService('police'); close(); }}>👮 <div><b>Полиция</b><small>патруль приедет к вам</small></div></button>
      <button className="tb-card" onClick={() => { g.callService('ambulance'); close(); }}>🚑 <div><b>Скорая помощь</b><small>восстановит здоровье · $250</small></div></button>
      <button className="tb-card" onClick={() => g.toast('Пожарная служба: вызов принят. Возгораний не обнаружено')}>🚒 <div><b>Пожарная служба</b><small>случайные пожары отключены</small></div></button>
    </div>
  );
}

function Homes({ g, close }: P) {
  const s = g.getState();
  const findFree = () => {
    const p = g.playerWorldPos();
    const free = g.L.buildings.filter((b) => (b.kind === 'vhouse' || b.kind === 'house') && b.forSale && !s.properties.includes(`${b.id}:0`) && !g.takenBy(`${b.id}:0`));
    free.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    if (free[0]) { g.destination = { x: free[0].door.x, z: free[0].door.z }; g.toast(`Свободный дом: $${free[0].price?.toLocaleString('ru')} — маршрут проложен`); close(); }
  };
  return (
    <div className="tb-list">
      {s.properties.map((id) => {
        const locked = g.isLocked(id); const home = s.spawnHome === id || (!s.spawnHome && s.properties[0] === id);
        return (
          <div className="tb-card col" key={id}>
            <div className="row">🏠 <div className="grow"><b>{g.propertyName(id)}</b><small>{locked ? '🔒 заперто — гости не войдут' : '🔓 открыто — игроки могут зайти в гости'}{home ? ' · ⭐ точка появления' : ''}</small></div></div>
            <div className="btns">
              <button className="ui-btn sm" onClick={() => g.toggleLock(id)}>{locked ? '🔓 Открыть' : '🔒 Запереть'}</button>
              {!home && <button className="ui-btn sm" onClick={() => g.setSpawnHome(id)}>⭐ Появляться здесь</button>}
              <button className="ui-btn sm" onClick={() => { g.gotoProperty(id); close(); }}>📍 Маршрут</button>
            </div>
          </div>
        );
      })}
      {!s.properties.length && <p className="tb-empty">У вас пока нет жилья. На карте зелёные домики — свободные, красные — уже купленные.</p>}
      <button className="ui-btn main" onClick={findFree}>🔎 Найти ближайший свободный дом</button>
      <p className="tb-note">Квартиры продаются в подъездах многоэтажек. Замок также переключается клавишей L у своей двери.</p>
    </div>
  );
}

function Cars({ g, close }: P) {
  const s = g.getState();
  return (
    <div className="tb-list">
      {s.vehicles.map((o) => {
        const l = g.listingOfUid(o.uid);
        return (
          <div className="tb-card col" key={o.uid}>
            <div className="row"><span className="sw" style={{ background: o.tuning.paint ?? o.color }} /><div className="grow"><b>{VEHICLES[o.type].name}</b><small>{o.year} г. · {Math.round(o.condition * 100)}% · ⛽ {Math.round(o.fuel)}% · {Math.round(o.mileage / 1000)} км{l ? ` · 🏷 продаётся за ${$(l.price)}` : ''}</small></div></div>
            <div className="btns">
              {!l && <button className="ui-btn sm" onClick={() => { g.deliverCar(o.uid); close(); }}>Доставить ($150)</button>}
              {l && <button className="ui-btn sm" onClick={() => g.unlist(o.uid)}>Снять с продажи</button>}
              <button className="ui-btn sm" onClick={() => { const v = g.ownedVehicleNear(o.uid); if (v) { g.destination = { x: v.x, z: v.z }; g.toast('Маршрут к машине проложен'); close(); } }}>📍 Найти</button>
            </div>
          </div>
        );
      })}
      {!s.vehicles.length && <p className="tb-empty">Нет транспорта. Автосалоны и механики — на Главном шоссе, б/у машины — на автобазаре. Машину можно и угнать (F у чужой машины).</p>}
    </div>
  );
}

function Bazaar({ g, close }: P) {
  const s = g.getState();
  const others: { name: string; slot: number; type: string; price: number; year: number; cond: number; color: string }[] = [];
  if (g.net) for (const r of g.remotes.values()) for (const l of g.net.players.get(r.id)?.st?.ls ?? []) others.push({ name: r.name, ...l });
  const goSlot = (slot: number) => { const sl = g.L.bazaarSlots[slot]; if (sl) { g.destination = { x: sl.x, z: sl.z }; g.toast(`Маршрут к месту ${slot + 1} проложен`); close(); } };
  return (
    <div className="tb-list">
      <h4 className="tb-h">Мои объявления</h4>
      {(s.listings ?? []).map((l) => { const o = s.vehicles.find((x) => x.uid === l.uid); return o ? <div className="tb-card" key={l.uid}>🏷 <div className="grow"><b>{VEHICLES[o.type].name}</b><small>место {l.slot + 1} · {$(l.price)} · висит {Math.round((Date.now() - l.t) / 60000)} мин</small></div><button className="ui-btn sm" onClick={() => g.unlist(l.uid)}>Снять</button></div> : null; })}
      {!(s.listings ?? []).length && <p className="tb-empty">Нет объявлений. Заезжайте своей машиной на размеченное место продажи на автобазаре и нажмите E.</p>}
      {g.online && <><h4 className="tb-h">Продают игроки</h4>
        {others.map((o, i) => <div className="tb-card" key={i}><span className="sw" style={{ background: o.color }} /><div className="grow"><b>{VEHICLES[o.type]?.name ?? o.type}</b><small>{o.name} · {o.year} г. · {Math.round(o.cond * 100)}% · место {o.slot + 1}</small></div><b className="price">{$(o.price)}</b><button className="ui-btn sm" onClick={() => goSlot(o.slot)}>📍</button></div>)}
        {!others.length && <p className="tb-empty">Сейчас никто из игроков не продаёт машины.</p>}</>}
      <h4 className="tb-h">Продавцы-NPC</h4>
      <button className="tb-card" onClick={() => g.openPanel({ type: 'market' })}>🚙 <div className="grow"><b>Б/у машины от продавцов</b><small>год, пробег, состояние · обновление каждые 10 минут</small></div></button>
      <div className="btns"><button className="ui-btn sm" onClick={() => goSlot(0)}>📍 Автобазар (запад)</button><button className="ui-btn sm" onClick={() => goSlot(4)}>📍 Автобазар (восток)</button></div>
    </div>
  );
}

function Jobs({ g, close }: P) {
  return (
    <div className="tb-list">
      {g.job && <div className="tb-card">💼 <div className="grow"><b>Активная работа</b></div><button className="ui-btn sm danger" onClick={() => g.quitJob()}>Завершить</button></div>}
      <button className="tb-card" onClick={() => { g.startCourier(); close(); }}>📦 <div><b>Курьер</b><small>доставка посылок · $40–150</small></div></button>
      <button className="tb-card" onClick={() => { const b = g.L.buildings.find((x) => x.kind === 'office'); if (b) { g.destination = { x: b.door.x, z: b.door.z }; g.toast('Маршрут к бизнес-центру «ЛосТех» проложен'); close(); } }}>💻 <div><b>Офис «ЛосТех»</b><small>работа за компьютером: $45 за задачу + зарплата · {g.getState().officeJob ? 'вы приняты' : 'устройство в отделе кадров'}</small></div></button>
      <button className="tb-card" onClick={() => { g.destination = { ...g.L.livestock.office }; g.toast('Маршрут к ферме «Зорька» проложен'); close(); }}>🐄 <div><b>Ферма «Зорька»</b><small>кормить коров, собирать яйца · $40–220 за цикл</small></div></button>
      <button className="tb-card" onClick={() => { g.destination = { ...g.L.depot.office }; g.toast('Маршрут к логистическому терминалу проложен'); close(); }}>🚚 <div><b>Дальнобойщик</b><small>грузы по городу и деревням · $300–1500 за рейс</small></div></button>
      <button className="tb-card" onClick={() => { g.destination = { ...g.L.industrial.office }; g.toast('Маршрут к проходной завода проложен'); close(); }}>🏭 <div><b>Завод</b><small>грузчик: $120 за рейс + бонус</small></div></button>
      <button className="tb-card" onClick={() => { g.destination = { x: g.L.farm.combineSpawn.x, z: g.L.farm.combineSpawn.z }; g.toast('Маршрут к комбайну проложен'); close(); }}>🌾 <div><b>Комбайн</b><small>$5 за участок поля</small></div></button>
      <div className="tb-card">🛒 <div><b>Смена в магазине</b><small>R у кассы любого магазина</small></div></div>
      <div className="tb-card">🚕 <div><b>Таксист</b><small>купите такси в автосалоне — игроки-пассажиры платят за поездку</small></div></div>
    </div>
  );
}

function Biz({ g }: P) {
  const s = g.getState();
  return (
    <div className="tb-list">
      {s.kiosks.map((k) => { const kt = KIOSK_TYPES[g.L.kiosks[k.id].type]; return <div className="tb-card" key={k.id}>🏪 <div className="grow"><b>{kt.name}</b><small>{$(kt.income)} в минуту</small></div><b className="price">{$(k.acc)}</b></div>; })}
      {!s.kiosks.length && <p className="tb-empty">Бизнесов нет. Ларьки стоят в парках — подойдите и нажмите E.</p>}
      {s.kiosks.length > 0 && <button className="ui-btn main" onClick={() => g.collectKiosks()}>Забрать весь доход</button>}
    </div>
  );
}

function Bank({ g }: P) {
  const s = g.getState();
  const fines = s.fines.reduce((a, f) => a + f.amount, 0);
  return (
    <div className="tb-list">
      <div className="tb-card big">🏦 <div><small>Баланс</small><b className="price">{$(s.money)}</b></div></div>
      <h4 className="tb-h">Штрафы</h4>
      {s.fines.map((f, i) => <div className="tb-card" key={i}>🧾 <div className="grow"><b>{f.reason}</b><small>до розыска {Math.max(0, Math.ceil((f.t + 600000 - Date.now()) / 60000))} мин</small></div><b>{$(f.amount)}</b></div>)}
      {!s.fines.length && <p className="tb-empty">Штрафов нет 👍</p>}
      {fines > 0 && <button className="ui-btn main" onClick={() => g.payFines()}>Оплатить всё — {$(fines)}</button>}
      <h4 className="tb-h">Доход бизнесов</h4>
      <div className="tb-card">💰 <div className="grow"><b>{$(s.kiosks.reduce((a, k) => a + k.acc, 0))}</b><small>накоплено в ларьках</small></div><button className="ui-btn sm" onClick={() => g.collectKiosks()}>Получить</button></div>
    </div>
  );
}

function Inv({ g }: P) {
  const [, f] = useState(0); const r = () => f((x) => x + 1);
  const s = g.getState(); const fridge = g.homeFridge();
  const inv = Object.entries(s.inventory).filter(([id]) => ITEMS[id]);
  return (
    <div className="tb-list">
      {Object.entries(s.ammoBy ?? {}).filter(([, n]) => n > 0).map(([k, n]) => <div className="tb-card" key={k}>📦 <div className="grow"><b>Патроны {AMMO_NAMES[k] ?? k}</b><small>в запасе {n}</small></div></div>)}
      {inv.map(([id, n]) => { const it = ITEMS[id]; return (
        <div className="tb-card" key={id}><span className="emo">{it.icon}</span><div className="grow"><b>{it.name} ×{n}</b><small>{[it.food && `🍗+${it.food}`, it.drink && `💧${it.drink}`, it.energy && `⚡+${it.energy}`, it.health && `❤${it.health}`].filter(Boolean).join(' ')}</small></div>
          <button className="ui-btn sm" onClick={() => { g.useItem(id); r(); }}>{it.weapon ? 'Взять' : it.smoke ? 'Курить' : 'Исп.'}</button>
          {fridge && it.fridge && <button className="ui-btn sm" onClick={() => { g.toFridge(id); r(); }}>→❄</button>}
          <button className="ui-btn sm ghost" onClick={() => { g.dropItem(id); r(); }}>🗑</button>
        </div>); })}
      {!inv.length && <p className="tb-empty">Инвентарь пуст</p>}
      {fridge && <><h4 className="tb-h">❄ Холодильник</h4>
        {Object.entries(fridge).map(([id, n]) => { const it = ITEMS[id]; return <div className="tb-card" key={id}><span className="emo">{it.icon}</span><b className="grow">{it.name} ×{n}</b><button className="ui-btn sm" onClick={() => { g.useItem(id, true); r(); }}>Съесть</button><button className="ui-btn sm" onClick={() => { g.fromFridge(id); r(); }}>Взять</button></div>; })}
        {!Object.keys(fridge).length && <p className="tb-empty">Холодильник пуст</p>}</>}
    </div>
  );
}

function Players({ g, close }: P) {
  const net = g.net;
  if (!net) return <p className="tb-empty">Вы не в онлайне</p>;
  return (
    <div className="tb-list">
      {[...net.players.values()].map((p) => {
        const r = g.remotes.get(p.id);
        return (
          <div className="tb-card" key={p.id}><span className="dot" style={{ background: p.color }} /><div className="grow"><b>{p.nick ?? p.name}{p.id === net.id ? ' (вы)' : ''}</b><small>{p.st?.hp !== undefined ? `❤ ${p.st.hp}` : ''}{p.st?.v ? ` · 🚗 ${VEHICLES[p.st.v]?.name ?? ''}` : ''}{p.st?.tx ? ' · 🚕 таксует' : ''}{p.st?.i ? ' · в помещении' : ''}</small></div>
            {p.id !== net.id && <button className="ui-btn sm" onClick={() => { const w = r && !r.ikey ? r : { x: p.x, z: p.y }; g.destination = { x: w.x, z: w.z }; g.toast(`Маршрут к ${p.nick ?? p.name} проложен`); close(); }}>📍</button>}
          </div>
        );
      })}
      {!net.players.size && <p className="tb-empty">{net.status === 'online' ? 'Никого нет' : 'Подключение к серверу…'}</p>}
      <p className="tb-note">Чат — окно слева на экране (Enter или T).</p>
    </div>
  );
}

const CATS = ['Баг / ошибка', 'Жалоба на игрока', 'Потерян прогресс', 'Оплата / промокод', 'Предложение', 'Другое'];
function Support({ g }: P) {
  const [cat, setCat] = useState(CATS[0]);
  const [text, setText] = useState('');
  const [contact, setContact] = useState('');
  const [st, setSt] = useState<{ busy: boolean; msg: string; ok?: boolean }>({ busy: false, msg: '' });
  const send = async () => {
    if (text.trim().length < 10) { setSt({ busy: false, msg: 'Опишите суть жалобы подробнее (минимум 10 символов)', ok: false }); return; }
    setSt({ busy: true, msg: 'Отправка…' });
    try { const r = await g.sendSupport(cat, text.trim(), contact.trim()); setSt({ busy: false, ok: true, msg: `✅ Обращение отправлено в Telegram (${r.sent} получ.${r.failed ? `, не доставлено ${r.failed}` : ''}). Спасибо!` }); setText(''); }
    catch (e) { setSt({ busy: false, ok: false, msg: '❌ ' + (e instanceof Error ? e.message : 'Ошибка сети') }); }
  };
  const stop = (e: React.KeyboardEvent) => e.stopPropagation();
  return (
    <div className="tb-list">
      <p className="tb-note">Ваше обращение придёт в Telegram-бот поддержки {SUPPORT_BOT} всем его участникам.</p>
      <label className="tb-lbl">Тема</label>
      <div className="chips">{CATS.map((c) => <button key={c} className={`ui-chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
      <label className="tb-lbl">Суть жалобы *</label>
      <textarea className="ui-input area" value={text} maxLength={1500} onKeyDown={stop} onChange={(e) => setText(e.target.value)} placeholder="Что случилось? Где и когда? Ник нарушителя, если это жалоба на игрока…" />
      <small className="tb-count">{text.length}/1500</small>
      <label className="tb-lbl">Как с вами связаться (необязательно)</label>
      <input className="ui-input" value={contact} maxLength={80} onKeyDown={stop} onChange={(e) => setContact(e.target.value)} placeholder="@telegram или e-mail" />
      <button className="ui-btn main" disabled={st.busy} onClick={send}>{st.busy ? 'Отправка…' : 'Отправить в поддержку'}</button>
      {st.msg && <p className={`tb-msg ${st.ok ? 'ok' : st.ok === false ? 'bad' : ''}`}>{st.msg}</p>}
    </div>
  );
}

function Promo({ g }: P) {
  const [code, setCode] = useState(''); const [msg, setMsg] = useState('');
  return (
    <div className="tb-list">
      <input className="ui-input code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setMsg(g.redeemPromo(code)); }} />
      <button className="ui-btn main" onClick={() => setMsg(g.redeemPromo(code))}>Активировать</button>
      {msg && <p className="tb-msg">{msg}</p>}
    </div>
  );
}

// ================= LosSt =================
const APPS = [
  { id: 'tg', short: 'Телеграм', name: 'Телеграм', icon: '✈️', color: '#229ED9', desc: 'Переписка с игроками и контактами', size: '48 МБ' },
  { id: 'vzhuh', short: 'Вжух', name: 'Вжух Самокаты', icon: '🛴', color: '#16a34a', desc: `Аренда электросамокатов · $${SCOOTER_RATE}/мин, станции на карте`, size: '22 МБ' },
  { id: 'food', short: 'Вкусно', name: 'Вкусно Доставка', icon: '🍔', color: '#f97316', desc: 'Бургеры и пицца с доставкой за 20 секунд', size: '31 МБ' },
  { id: 'coffee', short: 'Зерно', name: 'Кофейня «Зерно»', icon: '☕', color: '#78350f', desc: 'Кофе, чай и выпечка навынос', size: '12 МБ' },
  { id: 'pizza', short: 'Сыр', name: 'Пиццерия «Сыр»', icon: '🍕', color: '#dc2626', desc: 'Горячая пицца и напитки', size: '18 МБ' },
  { id: 'pharm', short: 'Аптека', name: 'Аптека 24', icon: '💊', color: '#10b981', desc: 'Аптечки, лекарства и витамины', size: '15 МБ' },
  { id: 'limited', short: 'LIMITED', name: 'LIMITED Drop', icon: '💎', color: '#a855f7', desc: 'Лимитированные вещи: радужные волосы, корона, золото', size: '40 МБ' },
];
const MENUS: Record<string, { name: string; items: string[] }> = {
  food: { name: 'Вкусно Доставка', items: ['burger', 'shawarma', 'pizza', 'cola', 'icecream', 'water'] },
  coffee: { name: 'Кофейня «Зерно»', items: ['coffee', 'tea', 'croissant', 'chocolate', 'juice'] },
  pizza: { name: 'Пиццерия «Сыр»', items: ['pizza', 'cola', 'juice', 'icecream'] },
  pharm: { name: 'Аптека 24', items: ['medkit', 'pills', 'vitamins', 'water'] },
};
function Store({ g, go }: P) {
  const [busy, setBusy] = useState<{ id: string; p: number } | null>(null);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setBusy((b) => { if (!b) return b; if (b.p >= 100) { g.installApp(b.id); g.toast(`✅ Установлено: ${APPS.find((a) => a.id === b.id)?.name}`); return null; } return { ...b, p: b.p + 10 }; }), 140);
    return () => clearInterval(t);
  }, [busy, g]);
  return (
    <div className="tb-list">
      <div className="store-hero"><b>LosSt</b><span>Лучшие приложения Лос-Города</span></div>
      {APPS.map((a) => { const inst = g.hasApp(a.id); const b = busy?.id === a.id ? busy : null; return (
        <div className="tb-card" key={a.id}>
          <span className="store-ico" style={{ background: a.color }}>{a.icon}</span>
          <div className="grow"><b>{a.name}</b><small>{a.desc} · {a.size}</small>{b && <div className="store-bar"><i style={{ width: b.p + '%' }} /></div>}</div>
          {inst ? <><button className="ui-btn sm" onClick={() => go(a.id as Scr)}>Открыть</button><button className="ui-btn sm ghost" onClick={() => g.removeApp(a.id)}>🗑</button></>
            : <button className="ui-btn sm main" disabled={!!busy} onClick={() => setBusy({ id: a.id, p: 0 })}>{b ? `${b.p}%` : 'Скачать'}</button>}
        </div>); })}
    </div>
  );
}
const NPC_CONTACTS: Record<string, { name: string; icon: string }> = { vasya: { name: 'Дядя Вася', icon: '🧔' }, mama: { name: 'Мама', icon: '👩' }, support: { name: 'LosSt Поддержка', icon: '🛟' } };
function Telegram({ g }: P) {
  const s = g.getState();
  const [peer, setPeer] = useState<string | null>(null);
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const online = g.net ? [...g.net.players.values()].filter((p) => p.id !== g.net!.id).map((p) => p.nick ?? p.name) : [];
  const keys = [...new Set([...Object.keys(NPC_CONTACTS), ...online, ...Object.keys(s.dms ?? {})])];
  const msgs = peer ? s.dms?.[peer] ?? [] : [];
  useEffect(() => { if (peer && s.unread) delete s.unread[peer]; list.current?.scrollTo(0, 1e6); });
  const send = () => { if (peer && text.trim()) { g.sendDm(peer, text); setText(''); } };
  if (!peer) return (
    <div className="tb-list">
      <div className="tg-head">✈️ Чаты</div>
      {keys.map((k) => { const c = NPC_CONTACTS[k]; const last = s.dms?.[k]?.at(-1); const un = s.unread?.[k] ?? 0; const on = online.includes(k); return (
        <button className="tb-card" key={k} onClick={() => setPeer(k)}><span className="tg-ava">{c?.icon ?? k.slice(0, 1).toUpperCase()}</span><div className="grow"><b>{c?.name ?? k}{on ? ' 🟢' : ''}</b><small>{last ? (last.me ? 'Вы: ' : '') + last.text : on ? 'в сети' : 'нет сообщений'}</small></div>{un > 0 && <em className="tg-un">{un}</em>}</button>); })}
      <p className="tb-note">Игроки онлайн появляются в списке автоматически.</p>
    </div>
  );
  return (
    <div className="tg">
      <div className="tg-top"><button onClick={() => setPeer(null)}>‹</button><b>{NPC_CONTACTS[peer]?.name ?? peer}</b></div>
      <div className="tg-list" ref={list}>{msgs.map((m, i) => <div key={i} className={`tg-msg ${m.me ? 'me' : ''}`}>{m.text}<small>{new Date(m.t).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</small></div>)}{!msgs.length && <p className="tb-empty">Напишите первое сообщение</p>}</div>
      <div className="tg-in"><input className="ui-input" value={text} maxLength={300} placeholder="Сообщение" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') send(); }} /><button className="ui-btn main" onClick={send}>➤</button></div>
    </div>
  );
}
function Gallery({ g }: P) {
  const [, f] = useState(0); const [view, setView] = useState<{ t: number; data: string; place: string } | null>(null);
  const photos = loadPhotos();
  if (view) return (
    <div className="tb-list">
      <img className="gal-big" src={view.data} alt="фото" />
      <small className="tb-note">{view.place} · {new Date(view.t).toLocaleString('ru')}</small>
      <div className="btns"><button className="ui-btn sm" onClick={() => setView(null)}>‹ Назад</button><a className="ui-btn sm main" href={view.data} download={`losgorod_${view.t}.jpg`}>⬇ Скачать</a><button className="ui-btn sm danger" onClick={() => { deletePhoto(view.t); setView(null); f((x) => x + 1); }}>Удалить</button></div>
    </div>
  );
  return (
    <div className="tb-list">
      <div className="btns"><button className="ui-btn sm main" onClick={() => g.startCamera('rear')}>📷 Камера</button><button className="ui-btn sm" onClick={() => g.startCamera('selfie')}>🤳 Селфи</button></div>
      <div className="gal">{photos.map((p) => <button key={p.t} onClick={() => setView(p)}><img src={p.data} alt="" /></button>)}</div>
      {!photos.length && <p className="tb-empty">Фото пока нет. Откройте камеру и нажмите ⭕ (или ЛКМ/пробел).</p>}
    </div>
  );
}
function Vzhuh({ g, close }: P) {
  const w = g.playerWorldPos();
  const docks = g.L.scooterDocks.map((d) => ({ d, dist: Math.hypot(d.x - w.x, d.z - w.z), free: g.vehicles.filter((v) => v.role === 'rental' && Math.hypot(v.x - d.x, v.z - d.z) < 4).length })).sort((a, b) => a.dist - b.dist);
  const mine = g.getState().vehicles.filter((o) => VEHICLES[o.type].body === 'scooter');
  return (
    <div className="tb-list">
      <div className="tb-card big">🛴 <div><b>Тариф: ${SCOOTER_RATE} в минуту</b><small>Подойдите к самокату и нажмите F · X — трюк · F — завершить аренду</small></div></div>
      <h4 className="tb-h">Ближайшие станции</h4>
      {docks.slice(0, 6).map(({ d, dist, free }, i) => <div className="tb-card" key={i}>📍 <div className="grow"><b>Станция · {Math.round(dist)} м</b><small>свободно: {free}</small></div><button className="ui-btn sm" onClick={() => { g.destination = { x: d.x, z: d.z }; g.toast('Маршрут к станции проложен'); close(); }}>Маршрут</button></div>)}
      <h4 className="tb-h">Свой самокат</h4>
      {mine.map((o) => <div className="tb-card" key={o.uid}>🛴 <div className="grow"><b>{VEHICLES[o.type].name}</b><small>до {Math.round(VEHICLES[o.type].maxSpeed * 3.6)} км/ч</small></div><button className="ui-btn sm" onClick={() => { g.deliverCar(o.uid); close(); }}>Доставить</button></div>)}
      <button className="ui-btn" onClick={() => { const b = g.L.buildings.filter((x) => x.kind === 'scootershop').sort((a, c) => Math.hypot(a.x - w.x, a.z - w.z) - Math.hypot(c.x - w.x, c.z - w.z))[0]; if (b) { g.destination = { x: b.door.x, z: b.door.z }; g.toast('Маршрут к «Вжух Store» проложен'); close(); } }}>🏬 Купить свой — «Вжух Store» (20 моделей)</button>
    </div>
  );
}
function Delivery({ g, app }: { g: Game; app: string }) {
  const m = MENUS[app]; const [cart, setCart] = useState<string[]>([]);
  const total = cart.reduce((a, id) => a + ITEMS[id].price, 0) + (cart.length ? 5 : 0);
  return (
    <div className="tb-list">
      {m.items.map((id) => { const it = ITEMS[id]; const n = cart.filter((x) => x === id).length; return (
        <div className="tb-card" key={id}><span className="emo">{it.icon}</span><div className="grow"><b>{it.name}</b><small>{$(it.price)}</small></div>
          {n > 0 && <button className="ui-btn sm" onClick={() => { const i = cart.indexOf(id); setCart(cart.filter((_, k) => k !== i)); }}>−</button>}{n > 0 && <b>{n}</b>}<button className="ui-btn sm" onClick={() => setCart([...cart, id])}>+</button></div>); })}
      <button className="ui-btn main" disabled={!cart.length} onClick={() => { g.orderDelivery(m.name, cart); setCart([]); }}>Заказать {cart.length ? `· ${$(total)} (доставка $5)` : ''}</button>
    </div>
  );
}
function Limited({ g }: P) {
  const s = g.getState(); const own = s.limited ?? [];
  const h = 3 - ((Date.now() / 3600000) % 3);
  return (
    <div className="tb-list">
      <div className="store-hero lim"><b>💎 LIMITED Drop</b><span>Окно обновится через {Math.floor(h)} ч {Math.floor((h % 1) * 60)} мин · тираж ограничен</span></div>
      {LIMITED.map((d, i) => { const has = own.includes(d.id); const av = limitedAvailable(i); const worn = d.kind === 'acc' ? s.look.acc === d.value : d.kind === 'hair' ? s.look.hairColor === d.value : d.kind === 'top' ? s.look.topColor === d.value : s.look.bottomColor === d.value; return (
        <div className={`tb-card ${!av && !has ? 'dim' : ''}`} key={d.id}><span className="emo">{d.icon}</span><div className="grow"><b>{d.name}</b><small>{has ? (worn ? 'надето' : 'в коллекции') : av ? `осталось ${limitedLeft(d, i)} шт.` : 'нет в продаже в этом окне'}</small></div>
          {has ? <button className="ui-btn sm" onClick={() => g.applyLimited(d.id)}>{d.kind === 'acc' && worn ? 'Снять' : 'Надеть'}</button> : <button className="ui-btn sm main" disabled={!av} onClick={() => g.buyLimited(d.id)}>{$(d.price)}</button>}</div>); })}
      <p className="tb-note">Купленные вещи навсегда в коллекции; снять волосы/одежду можно в парикмахерской и магазине одежды.</p>
    </div>
  );
}
