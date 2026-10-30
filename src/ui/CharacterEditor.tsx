import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/game';
import { LIMITED, DRESSES, type Look, SKINS, HAIR_STYLES, HAIR_COLORS, TOPS, BOTTOMS, CLOTH_COLORS, EYE_COLORS, defaultLook } from '../game/data';

const SHOES = ['#111111', '#ffffff', '#78350f', '#1e3a8a', '#be123c', '#a3a3a3'];
type Tab = 'body' | 'face' | 'hair' | 'clothes' | 'limited';

function Colors({ list, value, set }: { list: string[]; value?: string; set: (c: string) => void }) {
  return <div className="ce-sw">{list.map((c) => <button key={c} className={value === c ? 'on' : ''} style={{ background: c }} onClick={() => set(c)} aria-label={c} />)}</div>;
}
function Chips({ list, value, set }: { list: { id: string; name: string }[]; value?: string; set: (id: string) => void }) {
  return <div className="chips">{list.map((o) => <button key={o.id} className={`ui-chip ${value === o.id ? 'on' : ''}`} onClick={() => set(o.id)}>{o.name}</button>)}</div>;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _Slider({ label, min, max, step, value, set, fmt }: { label: string; min: number; max: number; step: number; value: number; set: (v: number) => void; fmt: (v: number) => string }) {
  return <label className="ce-sl"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} /><b>{fmt(value)}</b></label>;
}

/** редактор внешности: камера показывает персонажа крупно, изменения видны сразу */
export function CharacterEditor({ g, fresh }: { g: Game; fresh: boolean }) {
  const [l, setL] = useState<Look>({ ...g.getState().look });
  const [tab, setTab] = useState<Tab>('body');
  const drag = useRef<number | null>(null);
  useEffect(() => { g.previewLook(l); }, [l, g]);
  const set = (p: Partial<Look>) => setL((o) => ({ ...o, ...p }));
  const f = l.gender === 'f';
  const hairs = HAIR_STYLES; // все причёски доступны обоим полам
  const owned = LIMITED.filter((d) => (g.getState().limited ?? []).includes(d.id));
  const tops = TOPS.filter((t) => (f ? true : !DRESSES.has(t.id)));
  const bottoms = BOTTOMS.filter((b) => (f ? true : b.id !== 'skirt'));
  const random = () => {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    set({ skin: pick(SKINS), hair: pick(hairs).id, hairColor: pick(HAIR_COLORS), eyes: pick(EYE_COLORS), top: pick(tops).id, topColor: pick(CLOTH_COLORS), bottom: pick(bottoms).id, bottomColor: pick(CLOTH_COLORS), shoes: pick(SHOES) });
  };
  return (
    <>
      <div className="ce-rotate" onPointerDown={(e) => { drag.current = e.clientX; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current === null) return; g.editorYaw += (e.clientX - drag.current) * 0.01; drag.current = e.clientX; }}
        onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
        <span>⟲ потяните, чтобы повернуть</span>
      </div>
      <div className="ce" onPointerDown={(e) => e.stopPropagation()}>
        <div className="ce-head"><h2>{fresh ? 'Создание персонажа' : 'Внешность'}</h2><button className="ui-btn sm ghost" onClick={random}>🎲 Случайно</button></div>
        <div className="ce-tabs">{([['body', 'Тело'], ['face', 'Лицо'], ['hair', 'Волосы'], ['clothes', 'Одежда'], ['limited', '💎']] as [Tab, string][]).map(([k, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{n}</button>)}</div>
        <div className="ce-body">
          {tab === 'body' && <>
            <h4>Пол</h4>
            <div className="ce-gender">
              <button className={!f ? 'on' : ''} onClick={() => setL({ ...defaultLook('m'), skin: l.skin, eyes: l.eyes })}>👨 Мужской</button>
              <button className={f ? 'on' : ''} onClick={() => setL({ ...defaultLook('f'), skin: l.skin, eyes: l.eyes })}>👩 Женский</button>
            </div>
            <h4>Тон кожи</h4><Colors list={SKINS} value={l.skin} set={(c) => set({ skin: c })} />
          </>}
          {tab === 'face' && <>
            <h4>Цвет глаз</h4><Colors list={EYE_COLORS} value={l.eyes} set={(c) => set({ eyes: c })} />
          </>}
          {tab === 'hair' && <>
            <h4>Причёска</h4><Chips list={hairs} value={l.hair} set={(id) => set({ hair: id })} />
            <h4>Цвет волос</h4><Colors list={HAIR_COLORS} value={l.hairColor} set={(c) => set({ hairColor: c })} />
          </>}
          {tab === 'limited' && <>
            <h4>Лимитированные вещи</h4>
            {!owned.length && <p className="tb-note">Пока пусто. Лимитки продаются в приложении «LIMITED Drop» (планшет → LosSt).</p>}
            <div className="chips">{owned.map((d) => { const on = d.kind === 'hair' ? l.hairColor === d.value : d.kind === 'top' ? l.topColor === d.value : d.kind === 'bottom' ? l.bottomColor === d.value : l.acc === d.value; return (
              <button key={d.id} className={`ui-chip ${on ? 'on' : ''}`} onClick={() => set(d.kind === 'hair' ? { hairColor: d.value } : d.kind === 'top' ? { topColor: d.value } : d.kind === 'bottom' ? { bottomColor: d.value } : { acc: on ? undefined : d.value })}>{d.icon} {d.name}</button>); })}</div>
          </>}
          {tab === 'clothes' && <>
            <h4>Верх</h4><Chips list={tops} value={l.top} set={(id) => set({ top: id })} /><Colors list={CLOTH_COLORS} value={l.topColor} set={(c) => set({ topColor: c })} />
            <h4>Низ</h4><Chips list={bottoms} value={l.bottom} set={(id) => set({ bottom: id })} /><Colors list={CLOTH_COLORS} value={l.bottomColor} set={(c) => set({ bottomColor: c })} />
            <h4>Обувь</h4><Colors list={SHOES} value={l.shoes} set={(c) => set({ shoes: c })} />
          </>}
        </div>
        <button className="ui-btn main wide" onClick={() => g.finishEditor(l)}>✔ Готово</button>
        {!fresh && <button className="ui-btn ghost wide" onClick={() => { g.revertLook(); g.closePanel(); }}>Отмена</button>}
      </div>
    </>
  );
}
