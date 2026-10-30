// Отдельная карта автобусов: три маршрута, остановки, автопарк и приём на работу водителем.
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/game';

export function BusMap({ g }: { g: Game }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<number | null>(g.activeBusRoute());
  const view = useRef({ cx: 540, cz: 900, scale: 0.4 });
  const [, tick] = useState(0);

  useEffect(() => {
    const c = cv.current!;
    let alive = true;
    let timer = 0;
    const fit = () => {
      const w = c.clientWidth || 360, h = c.clientHeight || 320;
      const B = g.L.bounds;
      const k = Math.min(w / (B.x1 - B.x0), h / (B.z1 - B.z0)) * 0.94;
      view.current.scale = Math.max(0.12, k);
      view.current.cx = (B.x0 + B.x1) / 2;
      view.current.cz = (B.z0 + B.z1) / 2;
    };
    const draw = () => {
      if (!alive) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
      if (w > 0 && h > 0 && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; fit(); }
      if (w > 0) g.drawBusMap(c, view.current, dpr, active);
      timer = window.setTimeout(() => requestAnimationFrame(draw), 90);
    };
    draw();
    return () => { alive = false; clearTimeout(timer); };
  }, [g, active]);

  const routes = g.L.busRoutes;
  const cur = g.activeBusRoute();
  return (
    <div className="tb-list">
      <div className="hx-bigmap" style={{ height: 'min(46vh, 340px)' }}>
        <canvas ref={cv} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12 }} />
      </div>
      <p className="tb-note">Карта автобусов: линии разного цвета, 🚏 — остановки, 🚌 — автопарк на набережной.</p>
      {routes.map((r) => (
        <div className="tb-card" key={r.line} style={{ borderColor: r.color }}>
          <span className="emo" style={{ background: r.color, color: '#0b1220', borderRadius: 8, padding: '2px 6px', fontWeight: 700 }}>{r.line}</span>
          <div className="grow">
            <b>{r.name}</b>
            <small>{r.stops.length} остановок · ${r.pay} за пассажира · ${r.pay * 12} премия за круг</small>
          </div>
          <button className="ui-btn sm" onClick={() => { setActive(r.line); tick((x) => x + 1); }}>
            {active === r.line ? '👁 на карте' : 'Показать'}
          </button>
          <button className="ui-btn sm main" disabled={!!g.job && g.job.type !== 'bus'} onClick={() => { g.startBusJob(r.line); setActive(r.line); }}>
            {cur === r.line ? 'Работаю' : 'За смену'}
          </button>
        </div>
      ))}
      <div className="tb-card">
        🚌 <div className="grow"><b>Автопарк</b><small>{Math.round(g.L.busDepot.x)}, {Math.round(g.L.busDepot.z)} · автобус ждёт здесь</small></div>
        <button className="ui-btn sm" onClick={() => { g.destination = { x: g.L.busDepot.x, z: g.L.busDepot.z }; g.toast('Маршрут к автопарку проложен'); }}>📍</button>
      </div>
      {g.job?.type === 'bus' && (
        <button className="ui-btn danger" onClick={() => g.quitJob()}>Закончить смену водителя</button>
      )}
    </div>
  );
}
