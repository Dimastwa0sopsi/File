import { useEffect, useRef, useState } from 'react';
import type { Game, HudState } from '../game/game';

/** вибро-отклик на касание (если телефон поддерживает) */
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* нет поддержки — молча */ } };

/**
 * Кнопка мобильного управления: круглый «стеклянный» кружок с иконкой.
 * hold — палец держит (стик/газ/тормоз), иначе одиночное нажатие.
 */
function Btn({ g, name, ico, sub, hold = true, cls = '', onTap, active }: {
  g: Game; name?: string; ico: string; sub?: string; hold?: boolean; cls?: string; onTap?: () => void; active?: boolean;
}) {
  const [on, setOn] = useState(false);
  const down = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!g.input.enabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    buzz(6);
    if (onTap) onTap(); else if (name) { if (hold) g.input.setV(name, true); else g.input.tapV(name); }
    setOn(true);
  };
  const up = (e: React.PointerEvent) => { e.preventDefault(); if (name && hold) g.input.setV(name, false); setOn(false); };
  return (
    <button className={`mui-btn ${cls} ${on || active ? 'on' : ''}`} onPointerDown={down} onPointerUp={up}
      onPointerCancel={up} onLostPointerCapture={up} onContextMenu={(e) => e.preventDefault()}>
      <span className="mui-ico">{ico}</span>
      {sub && <small>{sub}</small>}
    </button>
  );
}

export function MobileControls({ g, hud }: { g: Game; hud: HudState }) {
  const stickRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stickId = useRef<number | null>(null);
  const [run, setRun] = useState(false);
  const [menu, setMenu] = useState(false);
  const look = useRef(new Map<number, { x: number; y: number }>());
  const v = hud.vehicle;

  const resetStick = () => { stickId.current = null; g.input.joy.x = 0; g.input.joy.y = 0; setKnob({ x: 0, y: 0 }); };
  useEffect(() => resetStick, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stickMove = (e: React.PointerEvent) => {
    if (stickId.current !== e.pointerId) return;
    const el = stickRef.current;
    if (!el || !g.input.enabled) { resetStick(); return; }
    const r = el.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    const dz = (x: number) => (Math.abs(x) < 0.16 ? 0 : x);
    g.input.joy.x = dz(dx); g.input.joy.y = dz(-dy);
    setKnob({ x: dx * 40, y: dy * 40 });
  };
  const stickEnd = (e: React.PointerEvent) => { if (stickId.current !== e.pointerId) return; resetStick(); };

  const quick: { ico: string; label: string; on: () => void }[] = [
    { ico: '🎒', label: 'Инвентарь', on: () => g.openPanel({ type: 'inventory' }) },
    { ico: '🗺️', label: 'Карта', on: () => g.openPanel({ type: 'map', mode: 'waypoint' }) },
    { ico: '💃', label: 'Эмоции', on: () => g.openPanel({ type: 'emotes' }) },
    { ico: '💬', label: 'Чат', on: () => g.chatFocus?.() },
    { ico: '⚙️', label: 'Настройки', on: () => g.openPanel({ type: 'settings' }) },
    { ico: '🪪', label: 'Профиль', on: () => g.openPanel({ type: 'passport' }) },
    { ico: '📜', label: 'Сюжет', on: () => g.openPanel({ type: 'quest' }) },
    { ico: '🎁', label: 'Промокод', on: () => g.openPanel({ type: 'promo' }) },
    { ico: hud.firstPerson ? '👁️' : '🎥', label: 'Камера', on: () => g.toggleFirstPerson() },
  ];

  const openQuick = (on: boolean) => { setMenu(on); buzz(10); };

  return (
    <div className="mui">
      {/* ---------- обзор: свайп правой частью экрана, два пальца — зум ---------- */}
      <div className="mui-look"
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); look.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); }}
        onPointerMove={(e) => {
          const m = look.current; const p = m.get(e.pointerId); if (!p) return;
          if (m.size >= 2) {
            const o = [...m.entries()].find(([id]) => id !== e.pointerId)![1];
            const before = Math.hypot(p.x - o.x, p.y - o.y), after = Math.hypot(e.clientX - o.x, e.clientY - o.y);
            g.input.zoomDelta += (before - after) * 0.03;
          } else { g.input.lookDX += e.clientX - p.x; g.input.lookDY += e.clientY - p.y; }
          m.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }}
        onPointerUp={(e) => look.current.delete(e.pointerId)} onPointerCancel={(e) => look.current.delete(e.pointerId)} />

      {/* ---------- верх: быстрые кнопки ---------- */}
      <div className="mui-top">
        <Btn g={g} ico="📱" hold={false} onTap={() => { buzz(); g.openPanel({ type: 'phone' }); }} cls="glass" />
        <Btn g={g} ico={menu ? '✕' : '☰'} hold={false} onTap={() => openQuick(!menu)} cls={`glass ${menu ? 'on' : ''}`} />
      </div>

      {/* ---------- шторка быстрых действий ---------- */}
      {menu && (
        <>
          <div className="mui-sheet-back" onPointerDown={() => setMenu(false)} />
          <div className="mui-sheet">
            {quick.map((q) => (
              <button key={q.label} className="mui-tile" onPointerDown={(e) => { e.preventDefault(); buzz(6); setMenu(false); q.on(); }}>
                <span>{q.ico}</span><small>{q.label}</small>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---------- лево: стик движения ---------- */}
      <div className="mui-stick-wrap">
        <div className={`mui-stick ${knob.x || knob.y ? 'active' : ''}`} ref={stickRef}
          onPointerDown={(e) => {
            e.preventDefault(); e.stopPropagation();
            if (!g.input.enabled) return;
            stickId.current = e.pointerId;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            buzz(8);
            stickMove(e);
          }}
          onPointerMove={stickMove} onPointerUp={stickEnd} onPointerCancel={stickEnd} onLostPointerCapture={stickEnd}>
          <span className="ring" />
          <span className="knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
        {!v && (
          <Btn g={g} ico={run ? '🏃' : '🚶'} hold={false} onTap={() => { const n = !run; setRun(n); buzz(8); g.input.setV('run', n); }} cls="mini" active={run} />
        )}
      </div>

      {/* ---------- низ центр: взаимодействие ---------- */}
      <div className="mui-ctx">
        {hud.promptKeys.includes('R') && <Btn g={g} name="work" ico="💼" sub="R" hold={false} cls="mini" />}
        <Btn g={g} name="interact" ico="✋" sub="действие" hold={false} cls="ctx" />
        {hud.promptKeys.includes('L') && <Btn g={g} name="rob" ico="💰" sub="L" hold={false} cls="mini red" />}
      </div>

      {/* ---------- право: действия ---------- */}
      {v ? (
        <div className="mui-right drive">
          {v.passenger ? (
            <>
              {hud.gun && <Btn g={g} name="fire" ico="🔫" cls="main red" />}
              {hud.gun && <Btn g={g} name="aim" ico="🎯" hold={false} cls="mid" />}
              <Btn g={g} name="enter" ico="🚪" sub="выйти" hold={false} cls="mid grey" />
            </>
          ) : (
            <>
              <div className="mui-pedals">
                <Btn g={g} name={v.heli ? 'up' : 'gas'} ico={v.heli ? '⬆' : 'ГАЗ'} sub={v.heli ? 'вверх' : undefined} cls="pedal green" />
                <Btn g={g} name={v.heli ? 'down' : 'brake'} ico={v.heli ? '⬇' : 'ТОРМ'} cls="pedal red" />
              </div>
              {hud.gun && <Btn g={g} name="fire" ico="🔫" cls="main red" />}
              <div className="mui-arc">
                <Btn g={g} name="handbrake" ico="↯" sub="дрифт" cls="mid blue" />
                {hud.gun && <Btn g={g} name="aim" ico="🎯" hold={false} cls="mini" active={hud.gun.aiming} />}
                {!v.heli && <Btn g={g} name="lights" ico="💡" hold={false} cls="mini" />}
                {!v.heli && <Btn g={g} name="gearUp" ico="＋" hold={false} cls="mini" />}
                {!v.heli && <Btn g={g} name="gearDown" ico="－" hold={false} cls="mini" />}
                {v.canAuto && <Btn g={g} name="autopilot" ico="🤖" hold={false} cls="mini" />}
                {(v.moto || hud.gun) && <Btn g={g} name={v.moto ? 'wheelie' : 'reload'} ico={v.moto ? '🛞' : '⟳'} hold={false} cls="mini" />}
                <Btn g={g} name="enter" ico="🚪" hold={false} cls="mini grey" />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="mui-right">
          <div className="mui-main-wrap">
            {hud.gun
              ? <Btn g={g} name="fire" ico="🔫" cls="main red" />
              : <Btn g={g} name="attack" ico="👊" cls="main red" />}
            <span className="mui-main-hint">{hud.gun ? 'огонь' : 'удар'}</span>
          </div>
          <div className="mui-arc">
            {hud.gun ? <><Btn g={g} name="aim" ico="🎯" hold={false} cls="mid" active={hud.gun.aiming} /><Btn g={g} name="reload" ico="⟳" hold={false} cls="mini" /></>
              : <><Btn g={g} name="block" ico="🛡" cls="mid grey" /><Btn g={g} name="jump" ico="⤒" hold={false} cls="mini blue" /></>}
            <Btn g={g} name="crouch" ico={hud.crouch ? '🧍' : '🧎'} hold={false} cls="mini" active={hud.crouch} />
            <Btn g={g} name="qmod" ico={hud.cover ? '🚪' : '🧱'} hold={false} cls="mini" active={hud.cover} />
            <Btn g={g} name="weapon" ico="⇄" hold={false} cls="mini" />
          </div>
        </div>
      )}
    </div>
  );
}
