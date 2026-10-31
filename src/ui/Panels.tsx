import { useEffect, useState } from 'react';
import type { Game, Panel } from '../game/game';
import { Modal } from './MenuScreens';
import { Tablet } from './Tablet';
import { InventoryGrid } from './InventoryGrid';
import { PcPanel, OfficeHr, Livestock } from './Work';
import { DRESSES, ITEMS, VEHICLES, KIOSK_TYPES, PAINT_COLORS, NEON_COLORS, LIGHT_COLORS, HAIR_STYLES, HAIR_COLORS, TOPS, BOTTOMS, CLOTH_COLORS, SKINS, EYE_COLORS, BROWS, NOSES, LIP_SHAPES, LIP_COLORS, type Tuning, type Look, TUNE_PRICES, TUNE_CATALOG, TUNE_CATS, randomPlate, type TuneCat } from '../game/data';
import { CarPreview } from './CarPreview';
import { LookPreview } from './LookPreview';
import { repairCost, sellPrice, demand, carValue } from '../game/state';

const $ = (n: number) => '$' + Math.round(n).toLocaleString('ru');

export function GamePanel({ g, panel, close }: { g: Game; panel: Panel; close: () => void }) {
  const [, force] = useState(0);
  const r = () => force((x) => x + 1);
  const s = g.getState();
  const wrap = (fn: () => void) => () => { fn(); r(); };
  switch (panel.type) {
    case 'shop': return (
      <Modal title={panel.title} onClose={close}>
        <p className="lg-money-line">Ваши деньги: <b>{$(s.money)}</b></p>
        <div className="lg-list">{panel.items.map((id) => { const it = ITEMS[id]; return (
          <div key={id} className="lg-row"><span className="lg-ico">{it.icon}</span><div className="flex-1"><b>{it.name}</b><small>{[it.food && `🍗+${it.food}`, it.drink && `💧${it.drink > 0 ? '+' : ''}${it.drink}`, it.energy && `⚡+${it.energy}`, it.health && `❤${it.health > 0 ? '+' : ''}${it.health}`].filter(Boolean).join(' ')}</small></div>
            <button className="lg-btn sm" onClick={wrap(() => g.buy(id))}>{$(it.price)}</button>{!it.weapon && <button className="lg-btn sm" onClick={wrap(() => g.buy(id, 5))}>×5</button>}</div>); })}</div>
        {(panel.kind === 'vshop' || panel.kind === 'supermarket') && <button className="ui-btn mt-2" onClick={wrap(() => g.sellProduce('veg'))}>🧺 Продать урожай с огорода</button>}
        {panel.kind === 'gunshop' && <button className="ui-btn danger mt-2" onClick={wrap(() => g.sellProduce('drug'))}>🍁 Сбыть «дурман» из-под прилавка (риск розыска)</button>}
        <p className="text-xs opacity-70 mt-2">R у кассы — устроиться на смену. L — ограбление (нужно оружие, даёт розыск).</p>
      </Modal>);
    case 'kiosk': {
      const k = g.L.kiosks[panel.id]; const kt = KIOSK_TYPES[k.type]; const own = s.kiosks.find((o) => o.id === k.id);
      return (<Modal title={`Ларёк «${kt.name}»`} onClose={close}>
        <div className="lg-list">{kt.items.map((id) => { const it = ITEMS[id]; return <div key={id} className="lg-row"><span className="lg-ico">{it.icon}</span><b className="flex-1">{it.name}</b><button className="lg-btn sm" onClick={wrap(() => g.buy(id))}>{$(it.price)}</button></div>; })}</div>
        <div className="lg-card mt-3">
          <b>Бизнес</b>
          {own ? <><p>Ларёк ваш. Доход: {$(kt.income)} каждую минуту. Накоплено: <b>{$(own.acc)}</b></p><button className="lg-btn" onClick={wrap(() => g.collectKiosks(k.id))}>Забрать доход</button></>
            : <><p>Стоимость: <b>{$(kt.price)}</b> · доход {$(kt.income)}/мин (окупаемость ≈ {Math.round(kt.price / kt.income)} мин)</p><button className="lg-btn lg-btn-main" onClick={wrap(() => g.buyKiosk(k.id))}>Купить ларёк</button></>}
        </div></Modal>);
    }
    case 'property': {
      const b = g.L.buildings[panel.b]; const price = g.unitPrice(b, panel.unit);
      const desc = b.kind === 'apartment' ? (b.cls === 'lux' ? 'Люкс: спальня, гардероб, гостиная с угловым диваном и ТВ-панелью, кухня с островом, ванная' : b.cls === 'mid' ? 'Средний класс: спальня и кухня-гостиная, санузел' : 'Эконом: студия с кухонным уголком') : b.kind === 'vhouse' ? 'Деревенский дом: сени, комната с печью, участок с забором, огород и баня' : 'Частный дом: сени, комната, кухня, участок';
      return (<Modal title={b.kind === 'apartment' ? `Квартира ${panel.unit + 1} · ${b.name}` : b.name} onClose={close}>
        <p>{desc}</p><p className="mt-2">Цена: <b className="lg-money-inline">{$(price)}</b></p><p>Ваши деньги: {$(s.money)}</p>
        <button className="lg-btn lg-btn-main mt-3" onClick={() => g.buyProperty(panel.b, panel.unit)}>Купить</button></Modal>);
    }
    case 'garage': { const gr = g.L.garages[panel.id]; return (<Modal title={`Гараж №${panel.id + 1} · промзона`} onClose={close}><p>Кирпичный гараж с металлическими воротами и боковой дверью. Ворота открываются автоматически, когда подъезжает владелец. Машина, оставленная внутри, сохраняется.</p><p className="mt-2">Цена: <b>{$(gr.price)}</b></p><button className="lg-btn lg-btn-main mt-3" onClick={() => g.buyGarage(panel.id)}>Купить</button></Modal>); }
    case 'dealer': return <Dealer g={g} close={close} scooter={panel.scooter} />;
    case 'pc': return <PcPanel g={g} mode={panel.mode} close={close} />;
    case 'officehr': return <OfficeHr g={g} close={close} />;
    case 'livestock': return <Livestock g={g} close={close} />;
    case 'market': return <Market g={g} close={close} sellUid={panel.sellUid} />;
    case 'tuning': return <TuningPanel g={g} uid={panel.uid} close={close} />;
    case 'clothes': return <LookPanel g={g} close={close} mode="clothes" />;
    case 'barber': return <LookPanel g={g} close={close} mode="barber" />;
    case 'hospital': return (<Modal title="Больница" onClose={close}><p>Здоровье: {Math.round(s.health)}%</p>
      <div className="flex flex-col gap-2 mt-3"><button className="lg-btn" onClick={wrap(() => g.heal())}>Лечение — $200</button><button className="lg-btn" onClick={wrap(() => g.changeGender())}>Смена пола — $50 000</button></div>
      <p className="text-xs opacity-70 mt-2">Работа врачом: стойка «Смена врача» в приёмном отделении. Осмотрите пациента на кушетке, возьмите верный препарат в шкафу и введите его пациенту — $60 за приём и бонус за смену.</p></Modal>);
    case 'police': {
      const insured = Date.now() < (s.insuredUntil ?? 0);
      return (<Modal title={panel.title} onClose={close}>
        <p className="opacity-85">Полиция Лос-Города следит за розыском. Город не выписывает штрафов и не списывает деньги.</p>
        <div className="lg-list mt-2">
          <div className="lg-row"><span className="flex-1">Розыск</span><span>{s.wanted ? '★'.repeat(s.wanted) : 'нет'}</span></div>
          <div className="lg-row"><span className="flex-1">Страховка</span><span>{insured ? `до ${new Date(s.insuredUntil!).toLocaleDateString('ru')}` : 'не оформлена'}</span></div>
        </div>
        <p className="text-xs opacity-70 mt-2">Снизить розыск можно пожертвованием в приют (команда /charity) или уйти от погони.</p>
      </Modal>);
    }
    case 'bank': {
      return (<Modal title="Банк" onClose={close}>
        <div className="lg-card"><b>Доход бизнесов</b><p>Накоплено: {$(s.kiosks.reduce((a, k) => a + k.acc, 0))}</p><button className="lg-btn" onClick={wrap(() => g.collectKiosks())}>Получить</button></div>
        <p className="text-xs opacity-70 mt-2">Банк только хранит доход бизнесов.</p>
      </Modal>);
    }
    case 'vadmin': {
      const houses = g.L.buildings.filter((b) => b.kind === 'vhouse' && b.village === panel.village);
      return (<Modal title={`Администрация · ${panel.village}`} onClose={close}><p className="mb-2">Дома в деревне:</p>
        <div className="lg-list">{houses.map((b, i) => { const own = s.properties.includes(`${b.id}:0`); return <div className="lg-row" key={b.id}><span className="flex-1">Дом №{i + 1}</span><span>{own ? 'ваш' : b.forSale ? $(b.price ?? 0) : 'занят'}</span>{b.forSale && !own && <button className="lg-btn sm" onClick={() => { g.destination = { x: b.door.x, z: b.door.z }; g.toast('Дом отмечен на карте'); close(); }}>📍</button>}</div>; })}</div>
        <p className="text-xs opacity-70 mt-2">Купить дом можно у его двери (E).</p></Modal>);
    }
    case 'factory': { const on = g.job?.type === 'factory'; return (<Modal title="Проходная завода" onClose={close}><p>Работа грузчиком: возьмите деталь на складе (жёлтый маркер), донесите и загрузите в указанную фуру у рампы. Оплата $120 за рейс, бонус $400 за смену из 6 рейсов.</p>
      <button className="lg-btn lg-btn-main mt-3" onClick={() => { g.factoryHire(); close(); }}>{on ? 'Уволиться со смены' : 'Устроиться на смену'}</button></Modal>); }
    case 'farm': return (<Modal title="Агрохолдинг «Нива»" onClose={close}><p>Садитесь в зелёный комбайн у поля (F) и проезжайте по пшенице. За каждый убранный участок — $5, за полосу из 4 рядов — бонус $200, за всё поле — $500.</p><button className="lg-btn mt-3" onClick={close}>Понятно</button></Modal>);
    case 'trucker': return (
      <Modal title="🚚 Диспетчерская · Дальнобойщик" onClose={close} wide>
        <p className="mb-2 opacity-80">Выберите заказ: фура появится на площадке терминала. Довезите груз до точки и остановитесь — оплата сразу, повреждения снижают её до 50%. Возврат фуры — бонус $120. Заказы обновляются каждые 5 минут.</p>
        {!g.getState().trucker ? <div className="ui-card"><b>Вы ещё не работаете в «Восток-Транс»</b><p className="text-sm opacity-80">Устройство: медкомиссия $200. После этого доступны заказы.</p><button className="ui-btn main mt-2" onClick={() => { g.hireTrucker(); force((x) => x + 1); }}>Устроиться дальнобойщиком</button></div> : g.job?.type === 'truck' ? <div className="ui-card">У вас уже есть рейс. <button className="ui-btn sm danger ml-2" onClick={() => { g.quitJob(); close(); }}>Отменить рейс</button></div> :
        <div className="lg-list">{g.truckOrders().map((o, i) => <div className="lg-row wrap" key={i}><span className="lg-ico">📦</span><div className="flex-1 min-w-[180px]"><b>{o.cargo} → {o.name}</b><small>{(o.dist / 1000).toFixed(1)} км по дорогам</small></div><b className="text-green-400 mr-2">{$(o.pay)}</b><button className="ui-btn sm main" onClick={() => g.takeTruckOrder(o)}>Взять</button></div>)}</div>}
      </Modal>);
    case 'info': return <Modal title={panel.title} onClose={close}><p>{panel.text}</p></Modal>;
    case 'phone': return <Tablet g={g} close={close} initial={panel.tab} />;
    case 'inventory': return <Modal title="🎒 Инвентарь" onClose={close} wide><InventoryGrid g={g} /></Modal>;
    case 'promo': return <Promo g={g} close={close} />;
    default: return null;
  }
}

function Inventory({ g, close }: { g: Game; close: () => void }) {
  const [, f] = useState(0); const r = () => f((x) => x + 1);
  const s = g.getState(); const fridge = g.homeFridge();
  const inv = Object.entries(s.inventory);
  return (<Modal title="🎒 Инвентарь" onClose={close} wide>
    <div className={fridge ? 'grid md:grid-cols-2 gap-3' : ''}>
      <div><h3 className="font-bold mb-1">С собой</h3>
        <div className="lg-list">{inv.map(([id, n]) => { const it = ITEMS[id]; if (!it) return null; return <div className="lg-row" key={id}><span className="lg-ico">{it.icon}</span><span className="flex-1">{it.name} ×{n}</span>
          <button className="lg-btn sm" onClick={() => { g.useItem(id); r(); }}>{it.weapon ? 'Взять' : it.smoke ? 'Закурить' : 'Исп.'}</button>
          {fridge && it.fridge && <button className="lg-btn sm" onClick={() => { g.toFridge(id); r(); }}>→ ❄</button>}
          <button className="lg-btn sm" onClick={() => { g.dropItem(id); r(); }}>🗑</button></div>; })}{!inv.length && <p className="opacity-70">Пусто</p>}</div></div>
      {fridge && <div><h3 className="font-bold mb-1">❄ Холодильник</h3><div className="lg-list">{Object.entries(fridge).map(([id, n]) => { const it = ITEMS[id]; return <div className="lg-row" key={id}><span className="lg-ico">{it.icon}</span><span className="flex-1">{it.name} ×{n}</span>
        <button className="lg-btn sm" onClick={() => { g.useItem(id, true); r(); }}>Съесть</button><button className="lg-btn sm" onClick={() => { g.fromFridge(id); r(); }}>Взять</button></div>; })}{!Object.keys(fridge).length && <p className="opacity-70">Холодильник пуст</p>}</div></div>}
    </div>
    {!fridge && <p className="text-xs opacity-70 mt-2">Холодильник доступен у вас дома.</p>}
  </Modal>);
}

function Promo({ g, close }: { g: Game; close: () => void }) {
  const [code, setCode] = useState(''); const [msg, setMsg] = useState('');
  return (<Modal title="🎁 Промокод" onClose={close}>
    <input className="lg-input" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Введите код" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setMsg(g.redeemPromo(code)); }} />
    <button className="lg-btn lg-btn-main mt-2" onClick={() => setMsg(g.redeemPromo(code))}>Активировать</button>
    {msg && <p className="mt-2">{msg}</p>}
  </Modal>);
}

function Dealer({ g, close, scooter }: { g: Game; close: () => void; scooter?: boolean }) {
  const list = Object.values(VEHICLES).filter((v) => v.forSale === (scooter ? 'scooter' : 'dealer')).sort((a, b) => a.price - b.price);
  const [color, setColor] = useState<Record<string, string>>({});
  return (<Modal title={scooter ? '🛴 Электросамокаты «Вжух Store»' : '🚗 Автосалон'} onClose={close} wide>
    <p className="lg-money-line">Ваши деньги: <b>{$(g.getState().money)}</b></p>
    <div className="lg-list">{list.map((v) => <div className="lg-row wrap" key={v.id}>
      <div className="flex-1 min-w-[150px]"><b>{v.name}</b><small>{v.autopilot ? '🤖 автопилот · ' : ''}{v.ev ? '⚡ электро · ' : ''}до {Math.round(v.maxSpeed * 3.6)} км/ч</small></div>
      <div className="flex gap-1">{v.colors.map((c) => <button key={c} className={`lg-swatch ${(color[v.id] ?? v.colors[0]) === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor({ ...color, [v.id]: c })} />)}</div>
      <button className="lg-btn sm lg-btn-main" onClick={() => g.buyVehicle(v.id, color[v.id] ?? v.colors[0])}>{$(v.price)}</button></div>)}</div>
  </Modal>);
}

function Market({ g, close, sellUid }: { g: Game; close: () => void; sellUid?: string }) {
  const [, f] = useState(0); const r = () => f((x) => x + 1);
  const offers = g.getOffers(); const per = g.marketPeriod(); const s = g.getState();
  return (<Modal title="🚙 Авторынок" onClose={close} wide>
    <p className="lg-money-line">Ваши деньги: <b>{$(s.money)}</b> · предложения обновляются каждые 10 минут</p>
    <h3 className="font-bold mt-2">Продавцы</h3>
    <div className="lg-list">{offers.map((o) => { const val = carValue(o.type, o.year, o.mileage, o.condition); return <div className="lg-row wrap" key={o.id}>
      <span className="lg-swatch" style={{ background: o.color }} /><div className="flex-1 min-w-[160px]"><b>{VEHICLES[o.type].name}</b><small>{o.year} г. · {o.mileage.toLocaleString('ru')} км · состояние {Math.round(o.condition * 100)}% · продавец {o.seller}</small><small>Оценка: {$(val)} · спрос ×{demand(o.type, per).toFixed(2)}</small></div>
      <button className="lg-btn sm" onClick={() => { g.buyMarket(o.id); r(); }}>{$(o.price)}</button></div>; })}</div>
    <h3 className="font-bold mt-3">Продать свою машину</h3>
    <div className="lg-list">{s.vehicles.map((o) => <div className={`lg-row ${o.uid === sellUid ? 'hl' : ''}`} key={o.uid}><div className="flex-1"><b>{VEHICLES[o.type].name}</b><small>куплена за {$(o.paid)} · состояние {Math.round(o.condition * 100)}% · ремонт {$(repairCost(o))}</small></div><button className="lg-btn sm" onClick={() => { g.sellVehicle(o.uid); r(); }}>Продать {$(sellPrice(o, per))}</button></div>)}{!s.vehicles.length && <p className="opacity-70">Нет машин</p>}</div>
    <p className="text-xs opacity-70 mt-2">Машина должна стоять на площадке рынка. Выгодно: покупать ниже оценки, чинить в автосервисе и продавать при высоком спросе (рынок берёт 10%).</p>
  </Modal>);
}

function TuningPanel({ g, uid, close }: { g: Game; uid: string; close: () => void }) {
  const o = g.getState().vehicles.find((x) => x.uid === uid)!;
  const [t, setT] = useState<Tuning>({ ...o.tuning });
  const [cat, setCat] = useState<TuneCat>('body');
  const [plate, setPlate] = useState(o.tuning.plate ?? '');
  const [msg, setMsg] = useState('');
  const [, f] = useState(0);
  useEffect(() => { g.previewTuning(uid, t); }, [t, g, uid]);
  useEffect(() => () => g.revertTuning(uid), [g, uid]);
  const cost = g.tuningCost(o.tuning, t);
  const v = g.ownedVehicleNear(uid);
  const rc = v ? repairCost({ ...o, missing: v.model.missingParts() }) + v.model.missingWheels() * 150 : 0;
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="lg-tune-row"><span>{label}</span><div className="flex flex-wrap gap-1">{children}</div></div>;
  const Opt = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => <button className={`lg-chip ${on ? 'on' : ''}`} onClick={onClick}>{children}</button>;
  const items = TUNE_CATALOG.filter((it) => it.cat === cat);
  return (<Modal title={`🔧 Автосервис · ${VEHICLES[o.type].name}`} onClose={() => { g.revertTuning(uid); close(); }} wide>
    <div className="tune-grid">
      <div className="tune-left">
        <CarPreview type={o.type} color={t.paint ?? o.color} tuning={t} />
        <div className="lg-card mt-2"><b>Ремонт</b> — состояние {Math.round(o.condition * 100)}%, деталей нет: {v ? v.model.missingParts().length + v.model.missingWheels() : 0}. <button className="lg-btn sm ml-2" onClick={() => { g.repairVehicle(uid); f((x) => x + 1); }}>Починить {$(rc)}</button></div>
        <div className="lg-card mt-2">
          <b>🔢 Номерной знак</b>
          <p className="text-sm opacity-80">Формат: X000XX 00 (например, А123ВС 77)</p>
          <div className="flex gap-1 mt-1">
            <input className="lg-input" style={{ fontSize: 15, padding: '8px 10px', letterSpacing: 1 }} value={plate} maxLength={9}
              placeholder="А123ВС 77" onChange={(e) => setPlate(e.target.value.toUpperCase())} />
            <button className="lg-btn sm" onClick={() => setPlate(randomPlate())}>🎲</button>
          </div>
          <div className="flex gap-1 mt-1">
            <button className="lg-btn sm lg-btn-main" onClick={() => { const r = g.setPlate(uid, plate); setMsg(r); f((x) => x + 1); }}>Установить</button>
            <button className="lg-btn sm" onClick={() => { setPlate(''); setMsg(g.setPlate(uid, '')); f((x) => x + 1); }}>Снять</button>
          </div>
        </div>
        {msg && <p className="text-xs mt-1" style={{ color: '#a5b4fc' }}>{msg}</p>}
      </div>
      <div className="tune-right">
        <div className="tune-tabs">{TUNE_CATS.map((c) => <button key={c.id} className={`lg-chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.icon} {c.name}</button>)}</div>
        <div className="tune-items">
          {items.map((it) => (
            <button key={it.id} className={`tune-item ${t.kit === it.patch.kit && it.patch.kit ? 'on' : ''}`}
              onClick={() => { setT((prev) => ({ ...prev, ...it.patch })); setMsg(`${it.name} — предпросмотр`); }}>
              <span className="ti-ico">{it.icon}</span>
              <span className="ti-name">{it.name}</span>
              <span className="ti-price">{it.price ? $(it.price) : 'бесплатно'}</span>
            </button>
          ))}
        </div>
        <Row label={`Покраска (${$(TUNE_PRICES.paint)})`}>{PAINT_COLORS.map((c) => <button key={c} className={`lg-swatch ${t.paint === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setT({ ...t, paint: c })} />)}</Row>
        <Row label={`Тонировка (${$(TUNE_PRICES.tint)})`}>{[0, 1, 2, 3].map((n) => <Opt key={n} on={t.tint === n} onClick={() => setT({ ...t, tint: n })}>{['Нет', '30%', '60%', '90%'][n]}</Opt>)}</Row>
        <Row label={`Турбина (${$(TUNE_PRICES.turbo)}/ст.)`}>{[0, 1, 2, 3].map((n) => <Opt key={n} on={t.turbo === n} onClick={() => setT({ ...t, turbo: Math.max(o.tuning.turbo, n) })}>{n ? 'Ст.' + n : 'Сток'}</Opt>)}</Row>
        <Row label={`Двигатель (${$(TUNE_PRICES.engine)}/ст.)`}>{[0, 1, 2, 3].map((n) => <Opt key={n} on={t.engine === n} onClick={() => setT({ ...t, engine: Math.max(o.tuning.engine, n) })}>{n ? 'Ст.' + n : 'Сток'}</Opt>)}</Row>
        <Row label={`Клиренс (${$(TUNE_PRICES.clearance)})`}>{[-2, -1, 0, 1, 2].map((n) => <Opt key={n} on={t.clearance === n} onClick={() => setT({ ...t, clearance: n })}>{n > 0 ? '+' + n : n}</Opt>)}</Row>
        <Row label={`Неон (${$(TUNE_PRICES.neon)})`}><Opt on={!t.neon} onClick={() => setT({ ...t, neon: null })}>Нет</Opt>{NEON_COLORS.map((c) => <button key={c} className={`lg-swatch ${t.neon === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setT({ ...t, neon: c })} />)}</Row>
        <Row label={`Фары (${$(TUNE_PRICES.lights)})`}>{LIGHT_COLORS.map((c) => <button key={c} className={`lg-swatch ${!t.rainbow && t.lights === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setT({ ...t, lights: c, rainbow: false })} />)}<Opt on={!!t.rainbow} onClick={() => setT({ ...t, rainbow: !t.rainbow })}>🌈 радужные ($12 000)</Opt></Row>
        <div className="flex gap-2 mt-3 items-center flex-wrap"><b className="flex-1">Итого: {$(cost)}</b><button className="lg-btn" onClick={() => setT({ ...o.tuning })}>Сброс</button><button className="lg-btn lg-btn-main" onClick={() => { g.applyTuning(uid, t, cost); setMsg('Установлено'); f((x) => x + 1); }}>Установить</button></div>
        <p className="text-xs opacity-70 mt-1">Фары включаются клавишей H. Радужные фары переливаются всеми цветами. Изменения сохраняются.</p>
      </div>
    </div>
  </Modal>);
}

function LookPanel({ g, close, mode }: { g: Game; close: () => void; mode: 'clothes' | 'barber' }) {
  const s = g.getState();
  const [l, setL] = useState<Look>({ ...s.look });
  const [tab, setTab] = useState<'top' | 'outer' | 'dress' | 'bottom' | 'shoes' | 'color' | 'face' | 'hair'>(mode === 'barber' ? 'hair' : 'top');
  useEffect(() => { g.previewLook(l); }, [l, g]);
  const set = (p: Partial<Look>) => setL((o) => ({ ...o, ...p }));
  const price = (() => {
    const old = s.look; let cost = 0;
    if (l.hair !== old.hair) cost += HAIR_STYLES.find((h) => h.id === l.hair)?.price ?? 0;
    if (l.hairColor !== old.hairColor) cost += 30;
    if (l.top !== old.top || l.topColor !== old.topColor) cost += TOPS.find((x) => x.id === l.top)?.price ?? 0;
    if (l.bottom !== old.bottom || l.bottomColor !== old.bottomColor) cost += BOTTOMS.find((x) => x.id === l.bottom)?.price ?? 0;
    if (l.shoes !== old.shoes) cost += 40;
    return cost;
  })();
  const Item = ({ id, name, p }: { id: string; name: string; p: number }) => (
    <button className={`lp-item ${l.top === id || l.bottom === id ? 'on' : ''}`} onClick={() => set(TOPS.some((t) => t.id === id) ? { top: id } : { bottom: id })}>
      <span>{name}</span><em>{l.top === id || l.bottom === id ? 'надето' : `$${p}`}</em>
    </button>
  );
  const Sw = ({ k, list }: { k: keyof Look; list: string[] }) => (
    <div className="lp-swatches">{list.map((c) => <button key={c} className={l[k] === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ [k]: c } as Partial<Look>)} aria-label={c} />)}</div>
  );
  const Chips = ({ k, opts }: { k: keyof Look; opts: { id: string; name: string }[] }) => (
    <div className="lp-chips">{opts.map((o) => <button key={o.id} className={l[k] === o.id ? 'on' : ''} onClick={() => set({ [k]: o.id } as Partial<Look>)}>{o.name}</button>)}</div>
  );
  const tops = TOPS.filter((t) => l.gender === 'f' || !DRESSES.has(t.id));
  const outerIds = ['coat', 'puffer', 'raincoat', 'jacket', 'bomber', 'denim', 'cardigan', 'suit', 'tuxedo', 'tracksuit'];
  const tabs: [typeof tab, string][] = mode === 'barber'
    ? [['hair', '💇 Причёска'], ['color', '🎨 Цвет'], ['face', '🙂 Лицо']]
    : [['top', '👕 Верх'], ['outer', '🧥 Верхняя'], ...(l.gender === 'f' ? [['dress', '👗 Платья'] as [typeof tab, string]] : []), ['bottom', '👖 Низ'], ['shoes', '👟 Обувь'], ['color', '🎨 Цвет'], ['face', '🙂 Лицо']];
  return (
    <Modal title={mode === 'clothes' ? '👕 Магазин одежды «Мода»' : '✂️ Парикмахерская «Стиль»'} onClose={() => { g.revertLook(); close(); }} wide>
      <div className="lp-wrap">
        <div className="lp-side">
          <LookPreview look={l} height={320} />
          <div className="lp-price">
            <div><small>К оплате</small><b>{price ? $(price) : 'бесплатно'}</b></div>
            <button className="lg-btn lg-btn-main" onClick={() => { g.buyLook(l); close(); }}>✔ Купить и надеть</button>
          </div>
        </div>
        <div className="lp-shop">
          <div className="lp-tabs">{tabs.map(([k, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
          <div className="lp-body">
            {tab === 'hair' && <>
              <h4>Причёска</h4><Chips k="hair" opts={HAIR_STYLES} />
              <h4>Цвет волос</h4><Sw k="hairColor" list={HAIR_COLORS} />
              <h4>Тон кожи</h4><Sw k="skin" list={SKINS} />
            </>}
            {tab === 'top' && <>
              <h4>Футболки, рубашки, майки</h4>
              <div className="lp-grid">{tops.filter((t) => !outerIds.includes(t.id) && !DRESSES.has(t.id)).map((t) => <Item key={t.id} id={t.id} name={t.name} p={t.price} />)}</div>
              <h4>Цвет</h4><Sw k="topColor" list={CLOTH_COLORS} />
            </>}
            {tab === 'outer' && <>
              <h4>Верхняя одежда</h4>
              <div className="lp-grid">{tops.filter((t) => outerIds.includes(t.id)).map((t) => <Item key={t.id} id={t.id} name={t.name} p={t.price} />)}</div>
              <h4>Цвет</h4><Sw k="topColor" list={CLOTH_COLORS} />
            </>}
            {tab === 'dress' && l.gender === 'f' && <>
              <h4>Платья и сарафаны</h4>
              <div className="lp-grid">{TOPS.filter((t) => DRESSES.has(t.id)).map((t) => <Item key={t.id} id={t.id} name={t.name} p={t.price} />)}</div>
              <h4>Цвет</h4><Sw k="topColor" list={CLOTH_COLORS} />
            </>}
            {tab === 'bottom' && <>
              <h4>Низ</h4>
              <div className="lp-grid">{BOTTOMS.filter((b) => l.gender === 'f' || b.id !== 'skirt').map((b) => <Item key={b.id} id={b.id} name={b.name} p={b.price} />)}</div>
              <h4>Цвет</h4><Sw k="bottomColor" list={CLOTH_COLORS} />
            </>}
            {tab === 'shoes' && <>
              <h4>Обувь ($40)</h4><Sw k="shoes" list={['#111111', '#ffffff', '#78350f', '#1e3a8a', '#be123c', '#a3a3a3']} />
            </>}
            {tab === 'color' && <>
              <h4>Цвет одежды</h4><Sw k="topColor" list={CLOTH_COLORS} />
              <h4>Цвет низа</h4><Sw k="bottomColor" list={CLOTH_COLORS} />
              <h4>Цвет волос</h4><Sw k="hairColor" list={HAIR_COLORS} />
              <h4>Тон кожи</h4><Sw k="skin" list={SKINS} />
            </>}
            {tab === 'face' && <>
              <h4>Глаза</h4><Sw k="eyes" list={EYE_COLORS} />
              <h4>Брови</h4><Chips k="brows" opts={BROWS} />
              <h4>Цвет бровей</h4><Sw k="browColor" list={HAIR_COLORS} />
              <h4>Нос</h4><Chips k="nose" opts={NOSES} />
              <h4>Губы</h4><Chips k="lips" opts={LIP_SHAPES} />
              <h4>Цвет губ</h4><Sw k="lipColor" list={LIP_COLORS} />
            </>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
