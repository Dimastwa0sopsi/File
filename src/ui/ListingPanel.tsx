import { useState } from 'react';
import type { Game } from '../game/game';
import { Modal } from './MenuScreens';
import { VEHICLES } from '../game/data';
import { sellPrice } from '../game/state';

export function ListingPanel({ g, uid, slot, close }: { g: Game; uid: string; slot: number; close: () => void }) {
  const o = g.getState().vehicles.find((x) => x.uid === uid);
  const fair = o ? Math.round(sellPrice(o, g.marketPeriod()) / 0.9) : 0;
  const [price, setPrice] = useState(String(Math.round(fair * 1.05 / 100) * 100));
  if (!o) return null;
  const p = Math.round(Number(price) || 0);
  const ratio = p / Math.max(300, fair);
  const speed = ratio < 0.85 ? 'очень быстро' : ratio < 1.05 ? 'быстро' : ratio < 1.25 ? 'со временем' : 'вряд ли купят';
  return (
    <Modal title={`🏷 Продажа · место ${slot + 1}`} onClose={close}>
      <div className="ui-card"><b>{VEHICLES[o.type].name}</b> · {o.year} г. · {Math.round(o.mileage / 1000)} км · состояние {Math.round(o.condition * 100)}%</div>
      <p className="mt-2 text-sm opacity-80">Рыночная оценка: <b>${fair.toLocaleString('ru')}</b>. NPC-покупатели приходят каждые несколько минут{g.online ? ', игроки могут купить сразу (E у машины)' : ''}.</p>
      <label className="tb-lbl mt-3">Цена, $</label>
      <input className="ui-input code" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.stopPropagation()} />
      <div className="chips mt-2">{[0.9, 1, 1.15, 1.3].map((k) => <button key={k} className="ui-chip" onClick={() => setPrice(String(Math.round(fair * k / 100) * 100))}>{k === 1 ? 'по оценке' : `${Math.round(k * 100)}%`}</button>)}</div>
      <p className="mt-2 text-sm">Скорость продажи NPC: <b>{speed}</b></p>
      <button className="ui-btn main wide mt-3" onClick={() => g.listCar(uid, slot, p)}>Выставить за ${p.toLocaleString('ru')}</button>
    </Modal>
  );
}
