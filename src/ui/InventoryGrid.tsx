import { useState } from 'react';
import type { Game } from '../game/game';
import { ITEMS, WEAPONS, AMMO_NAMES } from '../game/data';

const COLS = 9;
export function Slot({ id, n, sel, onClick, onDouble, small }: { id?: string; n?: number; sel?: boolean; onClick?: () => void; onDouble?: () => void; small?: boolean }) {
  const it = id ? ITEMS[id] : null;
  return (
    <button className={`mc-slot ${sel ? 'sel' : ''} ${small ? 'sm' : ''}`} onClick={onClick} onDoubleClick={onDouble} title={it?.name}>
      {it && <span className="ic">{it.icon}</span>}
      {it && (n ?? 1) > 1 && <em>{n}</em>}
    </button>
  );
}
/** сетка в стиле Minecraft: 4 ряда по 9, нижний ряд — «хотбар» */
export function Grid({ items, rows = 4, sel, onPick, onDouble }: { items: [string, number][]; rows?: number; sel?: string | null; onPick?: (id: string) => void; onDouble?: (id: string) => void }) {
  const total = Math.max(rows * COLS, Math.ceil(items.length / COLS) * COLS);
  return (
    <div className="mc-grid" style={{ gridTemplateColumns: `repeat(${COLS}, var(--mc-s))` }}>
      {Array.from({ length: total }, (_, i) => { const e = items[i]; return <Slot key={i} id={e?.[0]} n={e?.[1]} sel={!!e && sel === e[0]} onClick={() => e && onPick?.(e[0])} onDouble={() => e && onDouble?.(e[0])} />; })}
    </div>
  );
}
export function invEntries(inv: Record<string, number>) {
  return Object.entries(inv).filter(([id, n]) => ITEMS[id] && n > 0).sort((a, b) => order(a[0]) - order(b[0]));
}
const order = (id: string) => { const it = ITEMS[id]; return it.weapon ? 0 : it.seed ? 3 : it.food || it.drink ? 1 : it.drug ? 4 : 2; };

export function InventoryGrid({ g }: { g: Game }) {
  const [sel, setSel] = useState<string | null>(null);
  const [selF, setSelF] = useState<string | null>(null);
  const [, f] = useState(0); const r = () => f((x) => x + 1);
  const s = g.getState(); const fridge = g.homeFridge();
  const items = invEntries(s.inventory);
  const it = sel ? ITEMS[sel] : null; const itF = selF ? ITEMS[selF] : null;
  const stats = (id: string) => { const x = ITEMS[id]; return [x.food && `🍗 +${x.food}`, x.drink && `💧 ${x.drink > 0 ? '+' : ''}${x.drink}`, x.energy && `⚡ +${x.energy}`, x.health && `❤ ${x.health > 0 ? '+' : ''}${x.health}`, x.weapon && `урон ${WEAPONS[x.weapon].dmg} · магазин ${WEAPONS[x.weapon].mag}`, x.seed && 'посадить на грядку', x.sell && `продажа $${x.sell}`].filter(Boolean).join(' · '); };
  const use = (id: string, fromF = false) => { g.useItem(id, fromF); r(); if (!(fromF ? g.homeFridge()?.[id] : g.getState().inventory[id])) fromF ? setSelF(null) : setSel(null); };
  return (
    <div className="mc-inv">
      <div className="mc-title">Инвентарь <small>двойной клик — использовать</small></div>
      <Grid items={items} sel={sel} onPick={(id) => { setSel(id === sel ? null : id); setSelF(null); }} onDouble={(id) => use(id)} />
      <div className="mc-ammo">{Object.entries(s.ammoBy ?? {}).filter(([, n]) => n > 0).map(([k, n]) => <span key={k}>📦 {AMMO_NAMES[k]}: {n}</span>)}</div>
      {it && sel && (
        <div className="mc-info">
          <span className="big">{it.icon}</span>
          <div className="grow"><b>{it.name} ×{s.inventory[sel]}</b><small>{stats(sel)}</small></div>
          <button className="ui-btn sm main" onClick={() => use(sel)}>{it.weapon ? 'Взять в руки' : it.seed ? 'Как сажать?' : it.smoke ? 'Закурить' : it.drug ? 'Употребить' : 'Использовать'}</button>
          {fridge && it.fridge && <button className="ui-btn sm" onClick={() => { g.toFridge(sel); r(); if (!g.getState().inventory[sel]) setSel(null); }}>→ ❄</button>}
          <button className="ui-btn sm ghost" onClick={() => { g.dropItem(sel); r(); if (!g.getState().inventory[sel]) setSel(null); }}>Выбросить</button>
        </div>
      )}
      {fridge && <>
        <div className="mc-title">❄ Холодильник</div>
        <Grid items={invEntries(fridge)} rows={2} sel={selF} onPick={(id) => { setSelF(id === selF ? null : id); setSel(null); }} onDouble={(id) => use(id, true)} />
        {itF && selF && (
          <div className="mc-info">
            <span className="big">{itF.icon}</span><div className="grow"><b>{itF.name} ×{fridge[selF]}</b><small>{stats(selF)}</small></div>
            <button className="ui-btn sm main" onClick={() => use(selF, true)}>Съесть</button>
            <button className="ui-btn sm" onClick={() => { g.fromFridge(selF); r(); if (!g.homeFridge()?.[selF]) setSelF(null); }}>Взять</button>
          </div>
        )}
      </>}
      {!fridge && <p className="tb-note mt-2">Холодильник доступен у вас дома.</p>}
    </div>
  );
}
