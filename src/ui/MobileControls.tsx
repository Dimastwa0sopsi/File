import { useEffect, useRef, useState } from 'react';
import type { Game, HudState } from '../game/game';

/** круглая кнопка-«пилюля» в стиле мобильных GTA-клиентов (крупная, с подписью) */
function Act({ g, name, label, sub, hold = true, cls = '', onTap }: {
  g: Game; name?: string; label: string; sub?: string; hold?: boolean; cls?: string; onTap?: () => void;
}) {
  const [on, setOn] = useState(false);
  const down = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!g.input.enabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (onTap) onTap();
    else if (name) { if (hold) g.input.setV(name, true); else g.input.tapV(name); }
    setOn(true);
  };
  const up = (e: React.PointerEvent) => { e.preventDefault(); if (name && hold) g.input.setV(name, false); setOn(false); };
  return (
    <button className={`mab ${cls} ${on ? 'on' : ''}`} onPointerDown={down} onPointerUp={up}
      onPointerCancel={up} onLostPointerCapture={up} onContextMenu={(e) => e.preventDefault()}>
      <span className="mab-i">{label}</span>
      {sub && <small className="mab-s">{sub}</small>}
    </button>
  );
}

export function MobileControls({ g, hud }: { g: Game; hud: HudState }) {
  const joyRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const joyId = useRef<number | null>(null);
  const [run, setRun] = useState(false);
  const look = useRef(new Map<number, { x: number; y: number }>());
  const v = hud.vehicle;

  const resetJoy = () => { joyId.current = null; g.input.joy.x = 0; g.input.joy.y = 0; setKnob({ x: 0, y: 0 }); };
  useEffect(() => resetJoy, []); // eslint-disable-line react-hooks/exhaustive-deps

  const joyMove = (e: React.PointerEvent) => {
    if (joyId.current !== e.pointerId) return;
    const el = joyRef.current;
    if (!el || !g.input.enabled) { resetJoy(); return; }
    const r = el.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    const dz = (x: number) => (Math.abs(x) < 0.18 ? 0 : x);
    g.input.joy.x = dz(dx); g.input.joy.y = dz(-dy);
    setKnob({ x: dx * 42, y: dy * 42 });
  };
  const joyEnd = (e: React.PointerEvent) => { if (joyId.current !== e.pointerId) return; resetJoy(); };

  return (
    <div className="lg-touch">
      {/* обзор: правая часть экрана — свайп камеры, два пальца — зум */}
      <div className="lg-look"
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

      {/* ЛЕВО: стик движения */}
      <div className="joy-wrap">
        <div className="lg-joy" ref={joyRef} style={{ touchAction: 'none', userSelect: 'none' }}
          onPointerDown={(e) => {
            e.preventDefault(); e.stopPropagation();
            if (!g.input.enabled) return;
            joyId.current = e.pointerId;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            joyMove(e);
          }}
          onPointerMove={joyMove} onPointerUp={joyEnd} onPointerCancel={joyEnd} onLostPointerCapture={joyEnd}>
          <span className="a u">▲</span><span className="a d">▼</span><span className="a l">◀</span><span className="a r">▶</span>
          <div className="lg-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
        {!v && <div className="joy-small">
          <Act g={g} name="run" label={run ? '🏃' : '🚶'} sub="бег" hold={false} onTap={() => { const n = !run; setRun(n); g.input.setV('run', n); }} cls="xs" />
        </div>}
      </div>

      {/* ВЕРХ: быстрые кнопки */}
      <div className="mab-bar">
        <Act g={g} label="📱" hold={false} onTap={() => g.openPanel({ type: 'phone' })} cls="xs" />
        <Act g={g} label="🎒" hold={false} onTap={() => g.openPanel({ type: 'inventory' })} cls="xs" />
        <Act g={g} label="🗺️" hold={false} onTap={() => g.openPanel({ type: 'map', mode: 'waypoint' })} cls="xs" />
        <Act g={g} label={hud.firstPerson ? '👁️' : '🎥'} hold={false} onTap={() => g.toggleFirstPerson()} cls="xs" />
        <Act g={g} label="💬" hold={false} onTap={() => g.chatFocus?.()} cls="xs" />
        <Act g={g} label="⚙️" hold={false} onTap={() => g.openPanel({ type: 'settings' })} cls="xs" />
        {!v && <Act g={g} label="💃" hold={false} onTap={() => g.openPanel({ type: 'emotes' })} cls="xs" />}
      </div>

      {/* ПРАВО: контекстные действия */}
      {v ? (
        <div className="mab-right drive">
          {hud.gun && <Act g={g} name="fire" label="🔫" sub="огонь" cls="red big" />}
          {!v.passenger && <>
            <Act g={g} name={v.heli ? 'up' : 'gas'} label={v.heli ? '⬆' : 'ГАЗ'} cls="green big" />
            <Act g={g} name={v.heli ? 'down' : 'brake'} label={v.heli ? '⬇' : 'ТОРМ'} cls="red big" />
            <Act g={g} name="handbrake" label="↯" sub="дрифт" cls="blue" />
            {!v.heli && <Act g={g} name="gearUp" label="＋" sub="передача" hold={false} cls="xs" />}
            {!v.heli && <Act g={g} name="gearDown" label="－" sub="передача" hold={false} cls="xs" />}
            {!v.heli && <Act g={g} name="lights" label="💡" hold={false} cls="xs" />}
            {v.canAuto && <Act g={g} name="autopilot" label="🤖" hold={false} cls="xs" />}
            {v.moto && <Act g={g} name="wheelie" label="🛞" sub="стант" cls="xs" />}
            {hud.gun && <Act g={g} name="aim" label="🎯" sub="прицел" hold={false} cls="xs" />}
          </>}
          {v.passenger && hud.gun && <Act g={g} name="aim" label="🎯" hold={false} cls="xs" />}
          <Act g={g} name="enter" label="🚪" sub={v.passenger ? 'выйти' : 'выйти'} hold={false} cls="grey" />
        </div>
      ) : (
        <div className="mab-right">
          {hud.gun ? <>
            <Act g={g} name="fire" label="🔫" cls="red big" />
            <Act g={g} name="aim" label="🎯" hold={false} cls={hud.gun.aiming ? 'on' : ''} />
            <Act g={g} name="reload" label="⟳" hold={false} cls="xs" />
          </> : <>
            <Act g={g} name="attack" label="👊" cls="red big" />
            <Act g={g} name="block" label="🛡" cls="grey" />
          </>}
          <Act g={g} name="jump" label="⤒" sub="прыжок" hold={false} cls="blue" />
          <Act g={g} name="crouch" label={hud.crouch ? '🧍' : '🧎'} hold={false} cls={hud.crouch ? 'on' : 'grey'} />
          <Act g={g} name="qmod" label="🧱" sub="к стене" cls="grey" />
          <Act g={g} name="weapon" label="⇄" sub="оружие" hold={false} cls="xs" />
        </div>
      )}

      {/* НИЗ ПРАВО: взаимодействие всегда под рукой */}
      <div className="mab-bottom">
        <Act g={g} name="interact" label="E" sub="действие" hold={false} cls="blue big" />
        {!v && <Act g={g} name="enter" label="🚗" sub={hud.riding ? 'выйти' : 'сесть'} hold={false} cls="grey" />}
        {hud.promptKeys.includes('R') && <Act g={g} name="work" label="R" sub="работа" hold={false} cls="xs" />}
        {hud.promptKeys.includes('L') && <Act g={g} name="rob" label="L" sub="грабёж" hold={false} cls="red" />}
      </div>
    </div>
  );
}
