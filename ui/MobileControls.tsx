import { useRef, useState } from 'react';
import type { Game, HudState } from '../game/game';

function Btn({ g, name, label, hold = true, cls = '' }: { g: Game; name: string; label: string; hold?: boolean; cls?: string }) {
  const [on, setOn] = useState(false);
  const down = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (hold) g.input.setV(name, true); else g.input.tapV(name);
    setOn(true);
  };
  const up = (e: React.PointerEvent) => { e.preventDefault(); if (hold) g.input.setV(name, false); setOn(false); };
  return <button className={`lg-tbtn ${cls} ${on ? 'on' : ''}`} onPointerDown={down} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={(e) => e.preventDefault()}>{label}</button>;
}

export function MobileControls({ g, hud }: { g: Game; hud: HudState }) {
  const joyRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const joyId = useRef<number | null>(null);
  const [run, setRun] = useState(false);
  const look = useRef(new Map<number, { x: number; y: number }>());
  const joyMove = (e: React.PointerEvent) => {
    if (joyId.current !== e.pointerId) return;
    const r = joyRef.current!.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    g.input.joy.x = dz(dx); g.input.joy.y = dz(-dy);
    setKnob({ x: dx * 40, y: dy * 40 });
  };
  const joyEnd = (e: React.PointerEvent) => { if (joyId.current !== e.pointerId) return; joyId.current = null; g.input.joy.x = 0; g.input.joy.y = 0; setKnob({ x: 0, y: 0 }); };
  const v = hud.vehicle;
  return (
    <div className="lg-touch">
      {/* зона камеры: свайп и зум двумя пальцами */}
      <div className="lg-look"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); look.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); }}
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
      <div className="lg-joy" ref={joyRef}
        onPointerDown={(e) => { e.preventDefault(); joyId.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); joyMove(e); }}
        onPointerMove={joyMove} onPointerUp={joyEnd} onPointerCancel={joyEnd} onLostPointerCapture={joyEnd}>
        <span className="a u">▲</span><span className="a d">▼</span><span className="a l">◀</span><span className="a r">▶</span>
        <div className="lg-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <div className="lg-tbar">
        <Btn g={g} name="phone" label="📱" hold={false} /><Btn g={g} name="inventory" label="🎒" hold={false} />
        <Btn g={g} name="map" label="🗺️" hold={false} /><Btn g={g} name="settings" label="⚙️" hold={false} />
        <button className="lg-tbtn" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); g.chatFocus?.(); }}>💬</button>
        {!hud.vehicle && <button className="lg-tbtn" onPointerDown={(e) => { e.preventDefault(); g.openPanel({ type: 'emotes' }); }}>💃</button>}
      </div>
      <div className="lg-tright">
        {!v && !hud.riding && <>
          {hud.gun ? <>
            <Btn g={g} name="fire" label="🔫" cls="big red" />
            <Btn g={g} name="aim" label={hud.gun.aiming ? '🎯✓' : '🎯'} hold={false} cls={hud.gun.aiming ? 'on' : ''} />
            <Btn g={g} name="reload" label="⟳" hold={false} />
          </> : <>
            <Btn g={g} name="attack" label="👊" hold={false} cls="big red" />
            <Btn g={g} name="block" label="🛡" />
          </>}
          <Btn g={g} name="jump" label="⤒" hold={false} cls="big" />
          <Btn g={g} name="crouch" label={hud.crouch ? '🧍' : '🧎'} hold={false} cls={hud.crouch ? 'on' : ''} />
          <button className={`lg-tbtn ${run ? 'on' : ''}`} onPointerDown={(e) => { e.preventDefault(); const n = !run; setRun(n); g.input.setV('run', n); }}>🏃</button>
          <Btn g={g} name="weapon" label="⇄" hold={false} />
        </>}
        {v && v.passenger && hud.gun && <><Btn g={g} name="fire" label="🔫" cls="big red" /><Btn g={g} name="aim" label="🎯" /></>}
        {v && !v.passenger && <>
          <Btn g={g} name={v.heli ? 'up' : 'gas'} label={v.heli ? '⬆' : 'ГАЗ'} cls="big green" />
          <Btn g={g} name={v.heli ? 'down' : 'brake'} label={v.heli ? '⬇' : 'ТОРМ'} cls="big red" />
          {v.heli && <Btn g={g} name="gas" label="Вперёд" />}
          {!v.heli && <><Btn g={g} name="gearUp" label="G+" hold={false} /><Btn g={g} name="gearDown" label="G−" hold={false} /><Btn g={g} name="handbrake" label="Дрифт" /></>}
          {!v.heli && <Btn g={g} name="lights" label="💡" hold={false} />}
          {v.canAuto && <Btn g={g} name="autopilot" label="🤖" hold={false} />}
          {v.moto && <Btn g={g} name="wheelie" label="Стант" />}
          {hud.gun && <><Btn g={g} name="fire" label="🔫" cls="red" /><Btn g={g} name="aim" label="🎯" /></>}
        </>}
        <Btn g={g} name="interact" label="E" hold={false} cls="big blue" />
        <Btn g={g} name="enter" label={v || hud.riding ? 'Выйти' : 'Сесть'} hold={false} />
        {hud.promptKeys.includes('R') && <Btn g={g} name="work" label="R Работа" hold={false} />}
        {hud.promptKeys.includes('L') && <Btn g={g} name="rob" label={/запереть|открыть/.test(hud.prompt ?? '') ? '🔒 Замок' : 'L Грабить'} hold={false} cls={/запереть|открыть/.test(hud.prompt ?? '') ? '' : 'red'} />}
      </div>
    </div>
  );
}
