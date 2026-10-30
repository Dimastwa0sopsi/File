import { useEffect, useRef, useState } from 'react';
import type { Game, HudState } from '../game/game';
import { Modal } from './MenuScreens';
import { toWorld } from '../game/mapdraw';

const STATUS: Record<string, string> = { online: 'в сети', connecting: 'подключение…', reconnecting: 'переподключение…', offline: 'нет связи' };

function Stat({ icon, v, color, warn }: { icon: string; v: number; color: string; warn?: boolean }) {
  const low = v < 20;
  return (
    <div className={`hx-stat ${low || warn ? 'low' : ''}`} title={`${Math.round(v)}%`}>
      <span>{icon}</span>
      <div><i style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: low ? '#ff4d5e' : color }} /></div>
    </div>
  );
}

function Speedo({ kmh, rpm, gear, heli, alt, fuel, name, lights, auto }: { kmh: number; rpm: number; gear: string; heli: boolean; alt: number; fuel: number; name: string; lights: boolean; auto: boolean }) {
  const R = 54, C = 2 * Math.PI * R, arc = 0.75;
  const k = Math.min(1, heli ? alt / 200 : rpm / 7300);
  return (
    <div className="hx-speedo">
      <svg viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} className="trk" strokeDasharray={`${C * arc} ${C}`} transform="rotate(135 70 70)" />
        <circle cx="70" cy="70" r={R} className={`val ${k > 0.86 && !heli ? 'red' : ''}`} strokeDasharray={`${C * arc * k} ${C}`} transform="rotate(135 70 70)" />
      </svg>
      <div className="hx-sp-in">
        <b>{kmh}</b><small>км/ч</small>
        <em>{heli ? `⬆ ${alt} м` : gear}</em>
      </div>
      <div className="hx-sp-info">
        <span>{name}</span>
        <span>⛽ {Math.round(fuel)}%{lights ? ' · 💡' : ''}{auto ? ' · 🤖' : ''}</span>
      </div>
    </div>
  );
}

export function Hud({ g, hud, mobile }: { g: Game; hud: HudState; mobile: boolean }) {
  const mini = useRef<HTMLCanvasElement>(null);
  const [, force] = useState(0);
  useEffect(() => {
    const c = mini.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = mobile ? 150 : 240, h = mobile ? 108 : 156;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px';
    g.minimap = c;
    return () => { if (g.minimap === c) g.minimap = null; };
  }, [g, mobile]);
  const zoom = (k: number) => { const s = g.settings; s.minimapZoom = Math.max(0.4, Math.min(4, s.minimapZoom * k)); force((x) => x + 1); };
  const v = hud.vehicle;
  return (
    <div className={`hx ${mobile ? 'mob' : ''}`}>
      {/* мини-карта и показатели */}
      <div className="hx-map">
        <div className="hx-mini" onWheel={(e) => zoom(e.deltaY < 0 ? 1.15 : 0.87)}>
          <canvas ref={mini} onClick={() => g.openPanel({ type: 'map', mode: 'waypoint' })} />
          <div className="hx-mini-btns">
            <button onClick={() => zoom(1.25)} aria-label="Приблизить">+</button>
            <button onClick={() => zoom(0.8)} aria-label="Отдалить">−</button>
            <button onClick={() => { g.settings.minimapRotate = !g.settings.minimapRotate; force((x) => x + 1); }} aria-label="Вращение">{g.settings.minimapRotate ? '⟳' : 'N'}</button>
          </div>
          <div className="hx-loc">{hud.location}</div>
        </div>
        <div className="hx-stats">
          <Stat icon="❤" v={hud.health} color="#3ddc84" />
          <Stat icon="🍗" v={hud.food} color="#ffb547" />
          <Stat icon="💧" v={hud.water} color="#4cc9f0" />
          <Stat icon="⚡" v={hud.energy} color="#a78bfa" />
        </div>
      </div>
      {/* правый верх */}
      <div className="hx-tr">
        <div className="hx-time">{hud.time}</div>
        <div className="hx-money">${Math.floor(hud.money).toLocaleString('ru')}</div>
        {hud.gain > 0 && <div className="hx-gain" key={hud.gain}>+${hud.gain.toLocaleString('ru')}</div>}
        {hud.wanted > 0 && <div className="hx-wanted">{[0, 1, 2].map((i) => <span key={i} className={i < hud.wanted ? 'on' : ''}>★</span>)}</div>}
        <div className="hx-weapon">
          {hud.gun ? <><span className="ic">🔫</span><span className="wn">{hud.gun.name}</span><b>{hud.gun.reloading ? '⟳' : hud.gun.mag}</b><small>/ {hud.gun.reserve} {hud.gun.ammoName}</small></> : <><span className="ic">{hud.blocking ? '🛡' : '👊'}</span><small>{hud.blocking ? 'блок' : 'кулаки'}</small></>}
          {hud.crouch && <span className="hx-chip">присед</span>}
        </div>
      </div>
      {/* левый верх: онлайн, работа */}
      <div className="hx-tl">
        {hud.online && <div className={`hx-online ${hud.online.status}`}><i />{hud.online.nick}<small>{STATUS[hud.online.status] ?? hud.online.status} · {hud.online.players} игр.</small></div>}
        {hud.quest && <div className="hx-task quest">📜 {hud.quest}</div>}
        {hud.job && <div className="hx-task">💼 {hud.job}</div>}
        {hud.rental && <div className="hx-task">🛴 Аренда: {hud.rental.min} мин · ${hud.rental.cost} · X — трюк</div>}
        {hud.tradeInvite && <div className="hx-task">🔁 {hud.tradeInvite} предлагает обмен — /obm да</div>}
        {hud.taxi && <div className="hx-task">🚕 {hud.taxi}</div>}
        {hud.riding && <div className="hx-task">🧍 Вы пассажир · F — выйти</div>}
      </div>
      {v && !v.passenger && <Speedo kmh={v.kmh} rpm={v.rpm} gear={v.gear} heli={v.heli} alt={v.alt} fuel={v.fuel} name={v.name} lights={v.lights} auto={v.autopilot} />}
      {hud.trip > 0 && <div className="hx-trip" style={{ opacity: hud.trip * 0.55 }} />}
      {hud.emote && <div className="hx-emote">{hud.emote} · двигайтесь, чтобы прервать</div>}
      {!mobile && hud.hotbar.length > 1 && !v && <div className="hx-hotbar">{hud.hotbar.map((w) => <div key={w.id} className={`hb ${hud.weapon === w.id ? 'on' : ''}`}><span>{w.id === 'fists' ? '👊' : '🔫'}</span><small>{w.name}</small><em>{w.key}</em></div>)}<i>R — сменить</i></div>}
      {hud.hurt > 0 && <div className="hx-hurt" style={{ opacity: Math.min(1, hud.hurt * 2.2) }} />}
      {hud.stunt && <div className="hx-stunt"><b>{hud.stunt.kind}</b><span>{hud.stunt.t.toFixed(1)} с</span><div className="bal"><i className="zone" /><em style={{ left: `${Math.max(0, Math.min(100, (Math.abs(hud.stunt.angle) / 1.08) * 100))}%` }} /></div><small>{hud.stunt.angle > 0 ? 'W — выше · S — ниже · держите X' : 'X + тормоз'}</small></div>}
      {hud.gun && (!v || hud.gun.driveBy) && (
        <div className={`hx-cross ${hud.gun.aiming ? 'aim' : ''} ${hud.hitMarker ? 'hit' : ''}`} style={{ ['--gap' as string]: `${Math.round(4 + hud.gun.spread * 260)}px` }}>
          <i className="t" /><i className="b" /><i className="l" /><i className="r" /><em />
          {hud.gun.reloading && <span>перезарядка…</span>}
          {!hud.gun.reloading && hud.gun.mag === 0 && <span>{hud.gun.reserve ? 'R — перезарядить' : 'нет патронов'}</span>}
        </div>
      )}
      {!hud.gun && hud.hitMarker && <div className="hx-cross hit fist"><em /></div>}
      {hud.prompt && <Prompt text={hud.prompt} />}
    </div>
  );
}

/** подсказка: выделяет клавиши в начале фраз ("E — …", "· L — …") */
function Prompt({ text }: { text: string }) {
  const parts = text.split(/(?:^|\s·\s)/).filter(Boolean);
  return (
    <div className="hx-prompt">
      {parts.map((p, i) => { const m = p.match(/^([A-ZЁ]{1,2}|ЛКМ|ПКМ)\s—\s(.*)$/); return <span key={i}>{m ? <><kbd>{m[1]}</kbd>{m[2]}</> : p}</span>; })}
    </div>
  );
}

/** холст большой карты (используется в модальном окне и в планшете) */
export function MapCanvas({ g, mode, onDone, height }: { g: Game; mode: 'waypoint' | 'taxi' | 'autopilot'; onDone?: () => void; height?: string }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const p0 = g.playerWorldPos();
  const view = useRef({ cx: p0.x, cz: p0.z, scale: 0.75 });
  const [, f] = useState(0);
  const drag = useRef<{ moved: number; pts: Map<number, { x: number; y: number }> } | null>(null);
  useEffect(() => {
    const c = cv.current!; let timer = 0; let alive = true;
    const draw = () => {
      if (!alive) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
      if (w > 0 && h > 0 && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
      if (w > 0) g.drawBigMap(c, view.current, dpr);
      timer = window.setTimeout(() => requestAnimationFrame(draw), 66);
    };
    draw();
    return () => { alive = false; clearTimeout(timer); };
  }, [g]);
  const worldAt = (cx: number, cy: number) => {
    const r = cv.current!.getBoundingClientRect();
    return toWorld({ cx: view.current.cx, cz: view.current.cz, scale: view.current.scale, rot: 0, ox: r.width / 2, oy: r.height / 2 }, cx - r.left, cy - r.top);
  };
  const zoomBy = (k: number) => { view.current.scale = Math.max(0.12, Math.min(5, view.current.scale * k)); f((x) => x + 1); };
  return (
    <div className="hx-bigmap" style={height ? { height } : undefined}>
      <canvas ref={cv}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.2 : 0.83)}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); if (!drag.current) drag.current = { moved: 0, pts: new Map() }; drag.current.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d || !d.pts.has(e.pointerId)) return;
          const prev = d.pts.get(e.pointerId)!;
          if (d.pts.size >= 2) {
            const other = [...d.pts.entries()].find(([id]) => id !== e.pointerId)![1];
            const before = Math.hypot(prev.x - other.x, prev.y - other.y), after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
            if (before > 10) zoomBy(after / before); d.moved += 10;
          } else { view.current.cx -= (e.clientX - prev.x) / view.current.scale; view.current.cz -= (e.clientY - prev.y) / view.current.scale; d.moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y); }
          d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }}
        onPointerUp={(e) => { const d = drag.current; if (!d) return; d.pts.delete(e.pointerId); if (d.pts.size === 0) { if (d.moved < 8) { const w = worldAt(e.clientX, e.clientY); g.mapClick(w.x, w.z, mode); onDone?.(); } drag.current = null; } }}
        onPointerCancel={() => { drag.current = null; }}
      />
      <div className="hx-map-ctl">
        <button onClick={() => zoomBy(1.3)}>+</button><button onClick={() => zoomBy(0.77)}>−</button>
        <button onClick={() => { const p = g.playerWorldPos(); view.current.cx = p.x; view.current.cz = p.z; view.current.scale = 1.4; f((x) => x + 1); }} title="К игроку">◎</button>
        <button onClick={() => { view.current.cx = 640; view.current.cz = 450; view.current.scale = 0.22; f((x) => x + 1); }} title="Вся карта">⤢</button>
        {g.destination && <button onClick={() => { g.destination = null; g.gpsRoute = null; f((x) => x + 1); }} title="Убрать метку">✕</button>}
      </div>
      <div className="hx-map-legend"><span><i style={{ background: '#16a34a' }} />свободный дом</span><span><i style={{ background: '#dc2626' }} />куплен</span><span><i style={{ background: '#b54dff' }} />маршрут</span></div>
    </div>
  );
}

export function BigMap({ g, mode, close }: { g: Game; mode: 'waypoint' | 'taxi' | 'autopilot'; close: () => void }) {
  const title = mode === 'taxi' ? '🚕 Куда едем? Нажмите на точку' : mode === 'autopilot' ? '🤖 Автопилот: выберите точку' : '🗺️ Карта — нажмите, чтобы проложить маршрут';
  return <Modal title={title} onClose={close} wide><MapCanvas g={g} mode={mode} /></Modal>;
}
