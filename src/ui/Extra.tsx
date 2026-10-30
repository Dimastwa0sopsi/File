import { useEffect, useState } from 'react';
import type { Game } from '../game/game';
import { Modal } from './MenuScreens';
import { ITEMS, EMOTES, CROPS, VEHICLES } from '../game/data';
import { Grid, invEntries } from './InventoryGrid';

const $ = (n: number) => '$' + Math.round(n).toLocaleString('ru');
function useTick(ms = 300) { const [, t] = useState(0); useEffect(() => { const i = setInterval(() => t((x) => x + 1), ms); return () => clearInterval(i); }, [ms]); }

export function TradePanel({ g }: { g: Game }) {
  useTick();
  const t = g.trade;
  const [money, setMoney] = useState('0');
  if (!t) return null;
  const myInv = invEntries(g.getState().inventory).map(([id, n]) => [id, n - (t.mine[id] ?? 0)] as [string, number]).filter(([, n]) => n > 0);
  const theirs = invEntries(t.theirs), mine = invEntries(t.mine);
  const showTheirs = t.view === 'theirs';
  return (
    <Modal title={`🔁 Обмен с ${t.name}`} onClose={() => g.tradeCancel()} wide>
      <div className="tr-head">
        <b>{showTheirs ? `Предлагает ${t.name}` : 'Вы предлагаете'}</b>
        <span className={`tr-st ${(showTheirs ? t.theirReady : t.myReady) ? 'ok' : ''}`}>{(showTheirs ? t.theirReady : t.myReady) ? '✔ согласен' : '… думает'}</span>
        <button className="ui-btn sm" onClick={() => { t.view = showTheirs ? 'mine' : 'theirs'; }}>⇄ Разворот</button>
      </div>
      <div className="tr-box">
        <Grid items={showTheirs ? theirs : mine} rows={2} onPick={(id) => { if (!showTheirs) g.tradeRemove(id); }} />
        <div className="tr-money">💵 {$(showTheirs ? t.theirMoney : t.myMoney)}</div>
        {!showTheirs && <small className="tb-note">Нажмите на предмет в предложении, чтобы убрать его</small>}
      </div>
      <div className="tr-head mt-3"><b>Ваш инвентарь</b><small className="tb-note">нажмите на предмет — добавить в предложение</small></div>
      <Grid items={myInv} rows={3} onPick={(id) => { g.tradeAdd(id); t.view = 'mine'; }} />
      <div className="tr-row">
        <label>Деньги в обмен: $</label>
        <input className="ui-input sm" inputMode="numeric" value={money} onChange={(e) => setMoney(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.stopPropagation()} onBlur={() => g.tradeMoney(+money || 0)} />
        <button className="ui-btn sm" onClick={() => g.tradeMoney(+money || 0)}>Указать</button>
      </div>
      <div className="tr-row">
        <button className="ui-btn main grow" disabled={t.myReady} onClick={() => g.tradeReady()}>{t.myReady ? '✔ Вы согласились — ждём' : '✔ Согласиться'}</button>
        <button className="ui-btn danger grow" onClick={() => g.tradeCancel()}>✕ Отказаться</button>
      </div>
      <p className="tb-note">Обмен произойдёт, когда оба нажмут «Согласиться». Любое изменение предложения сбрасывает согласие.</p>
    </Modal>
  );
}

export function TradeInvite({ g, close }: { g: Game; close: () => void }) {
  useTick(500);
  const inv = g.tradeInvite;
  if (!inv) { setTimeout(close, 0); return null; }
  return (
    <Modal title="🔁 Предложение обмена" onClose={() => g.tradeDecline()}>
      <p><b>{inv.name}</b> хочет обменяться с вами предметами.</p>
      <div className="tr-row mt-3"><button className="ui-btn main grow" onClick={() => g.tradeAccept()}>Принять</button><button className="ui-btn danger grow" onClick={() => g.tradeDecline()}>Отклонить</button></div>
    </Modal>
  );
}

export function Passport({ g, close }: { g: Game; close: () => void }) {
  const s = g.getState(); const L = s.look;
  const id = String(Math.abs([...(s.nick ?? 'LG') + (s.createdAt ?? 0)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))).padStart(10, '0').slice(0, 10);
  const reg = new Date(s.createdAt ?? Date.now()).toLocaleDateString('ru');
  const job = g.job ? ({ factory: 'Завод «Сталь»', courier: 'Курьер', combine: 'Агрохолдинг «Нива»', shift: 'Продавец', truck: 'Дальнобойщик' } as Record<string, string>)[g.job.type] : s.trucker ? 'Дальнобойщик «Восток-Транс»' : 'Безработный';
  return (
    <Modal title="🪪 Паспорт гражданина" onClose={close}>
      <div className="pp">
        <div className="pp-top"><span>ЛОС-ГОРОД</span><span>ПАСПОРТ · PASSPORT</span></div>
        <div className="pp-body">
          <div className="pp-photo" style={{ background: L.skin }}><div className="pp-hair" style={{ background: L.hairColor }} /><div className="pp-eyes"><i /><i /></div><div className="pp-shirt" style={{ background: L.topColor }} /></div>
          <div className="pp-fields">
            <div><small>Имя</small><b>{s.nick ?? 'Гражданин'}</b></div>
            <div><small>Пол</small><b>{L.gender === 'f' ? 'Женский' : 'Мужской'}</b></div>
            <div><small>№ документа</small><b className="mono">LG {id.slice(0, 4)} {id.slice(4)}</b></div>
            <div><small>Дата выдачи</small><b>{reg}</b></div>
            <div><small>Место работы</small><b>{job}</b></div>
            <div><small>Недвижимость</small><b>{s.properties.length ? s.properties.map((p) => g.propertyName(p)).join(', ') : 'нет'}</b></div>
            <div><small>Транспорт</small><b>{s.vehicles.length ? s.vehicles.map((v) => VEHICLES[v.type]?.name).join(', ') : 'нет'}</b></div>
            <div><small>Розыск</small><b className={s.wanted ? 'bad' : ''}>{s.wanted ? '★'.repeat(s.wanted) : 'не разыскивается'}</b></div>
          </div>
        </div>
        <div className="pp-mrz">P&lt;LGC{(s.nick ?? 'CITIZEN').toUpperCase().replace(/[^A-ZА-Я0-9]/g, '')}&lt;&lt;&lt;&lt;{id}&lt;&lt;&lt;</div>
      </div>
    </Modal>
  );
}

export function EmotePanel({ g, close }: { g: Game; close: () => void }) {
  return (
    <Modal title="💃 Анимации (B)" onClose={close}>
      <div className="em-grid">
        {EMOTES.map((e, i) => <button key={e.id} className={`em ${e.dance ? 'dance' : ''}`} onClick={() => g.playEmote(e.id)}><span>{e.icon}</span><b>{e.name}</b><small>/e {i + 1}</small></button>)}
      </div>
      <p className="tb-note mt-2">Анимация прерывается при движении. Танцы видят другие игроки.</p>
    </Modal>
  );
}

export function PlantPanel({ g, k, basement, close }: { g: Game; k: string; basement: boolean; close: () => void }) {
  const inv = g.getState().inventory;
  const seeds = Object.entries(inv).filter(([id, n]) => n > 0 && ITEMS[id]?.seed);
  return (
    <Modal title={basement ? '🪴 Горшок в подвале' : '🌱 Грядка'} onClose={close}>
      <p className="tb-note mb-2">{basement ? 'Под лампами в подвале растёт только «Дурман» (семена — в оружейном магазине, нелегально).' : 'На грядке растут овощи, ягоды и подсолнух. Семена продаются в сельмаге и супермаркете.'}</p>
      <div className="lg-list">
        {seeds.map(([id, n]) => { const c = CROPS[ITEMS[id].seed!]; const ok = basement ? c.basement : c.yard; return (
          <div className="lg-row" key={id}><span className="lg-ico">{ITEMS[id].icon}</span><div className="flex-1"><b>{c.name} ×{n}</b><small>созревает {Math.round(c.time / 60)} мин · урожай {c.yield[0]}–{c.yield[1]} {ITEMS[c.product].icon}</small></div>
            <button className="ui-btn sm main" disabled={!ok} onClick={() => g.plant(k, id)}>{ok ? 'Посадить' : basement ? 'не здесь' : 'в подвал'}</button></div>); })}
        {!seeds.length && <p className="tb-empty">У вас нет подходящих семян</p>}
      </div>
    </Modal>
  );
}
