// Отдельная карта автобусов: три маршрута, остановки, автопарк, ближайшая остановка и смена водителя.
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/game';
import type { BusRoute } from '../game/worldgen';

const $ = (n: number) => '$' + Math.round(n).toLocaleString('ru');
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export function BusMap({ g }: { g: Game }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<number | null>(g.activeBusRoute());
  const [open, setOpen] = useState<number | null>(g.activeBusRoute());
  const view = useRef({ cx: 540, cz: 900, scale: 0.4 });
  const [, tick] = useState(0);
  const [, setZoom] = useState(1);

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
  const job = g.job && g.job.type === 'bus' ? g.job : null;
  const jobRoute = job ? routes.find((r) => r.line === job.line) ?? null : null;
  const nextStop = jobRoute && job ? jobRoute.stops[job.next % jobRoute.stops.length] : null;
  const me = g.playerWorldPos();

  // ближайшая остановка среди всех линий
  const nearest = routes.reduce<{ route: BusRoute; stop: BusRoute['stops'][number]; d: number } | null>((best, r) => {
    for (const st of r.stops) {
      const d = dist(me, st);
      if (!best || d < best.d) best = { route: r, stop: st, d };
    }
    return best;
  }, null);
  const homeD = dist(me, g.L.busDepot);

  const zoomBy = (k: number) => {
    view.current.scale = Math.max(0.1, Math.min(3.5, view.current.scale * k));
    setZoom((z) => z + 1);
    tick((x) => x + 1);
  };
  const centerOnMe = () => {
    view.current.cx = me.x; view.current.cz = me.z;
    view.current.scale = Math.max(0.7, Math.min(2.4, view.current.scale));
    tick((x) => x + 1);
  };
  const centerOnRoute = (r: BusRoute) => {
    const xs = r.path.map((p) => p.x), zs = r.path.map((p) => p.z);
    view.current.cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    view.current.cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const w = cv.current?.clientWidth || 360, h = cv.current?.clientHeight || 320;
    const k = Math.min(w / (Math.max(...xs) - Math.min(...xs) + 80), h / (Math.max(...zs) - Math.min(...zs) + 80));
    view.current.scale = Math.max(0.12, Math.min(2.6, k));
    tick((x) => x + 1);
  };

  return (
    <div className="tb-list">
      <div className="hx-bigmap" style={{ height: 'min(50vh, 380px)', position: 'relative' }}>
        <canvas ref={cv} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12 }} />
        <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="ui-btn sm" style={{ minWidth: 40 }} onClick={() => zoomBy(1.35)}>＋</button>
          <button className="ui-btn sm" style={{ minWidth: 40 }} onClick={() => zoomBy(1 / 1.35)}>－</button>
          <button className="ui-btn sm" style={{ minWidth: 40 }} onClick={centerOnMe} title="Центр на меня">📍</button>
        </div>
      </div>
      <p className="tb-note">Линии разного цвета, 🚏 — остановки, 🚌 — автобусы и автопарк. Следующая остановка светится зелёным.</p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className={`ui-btn sm ${active === null ? 'main' : 'ghost'}`} onClick={() => { setActive(null); tick((x) => x + 1); }}>Все линии</button>
        {routes.map((r) => (
          <button key={r.line} className={`ui-btn sm ${active === r.line ? 'main' : 'ghost'}`}
            style={{ borderColor: r.color }} onClick={() => { setActive(active === r.line ? null : r.line); tick((x) => x + 1); }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: r.color, marginRight: 6 }} />
            {r.line} · {r.name}
          </button>
        ))}
      </div>

      {job && jobRoute && (
        <div className="tb-card" style={{ borderColor: jobRoute.color }}>
          🚌 <div className="grow">
            <b>Смена · маршрут {jobRoute.line} «{jobRoute.name}»</b>
            <small>Следующая: {nextStop ? `${nextStop.name} · ${Math.round(dist(me, nextStop))} м` : '—'} · остановок {job.next}/{jobRoute.stops.length} · заработано {$(job.earned)}</small>
          </div>
          {nextStop && <button className="ui-btn sm" onClick={() => { g.destination = { x: nextStop.x, z: nextStop.z }; g.toast('Маршрут к остановке проложен'); }}>📍</button>}
          <button className="ui-btn sm danger" onClick={() => g.quitJob()}>Закончить</button>
        </div>
      )}

      {routes.map((r) => (
        <div className="tb-card col" key={r.line} style={{ borderLeft: `4px solid ${r.color}` }}>
          <div className="row">
            <span className="emo" style={{ background: r.color, color: '#0b1220', borderRadius: 8, padding: '2px 8px', fontWeight: 800 }}>{r.line}</span>
            <div className="grow">
              <b>{r.name}</b>
              <small>{r.stops.length} остановок · {$(r.pay)} за пассажира · {$(r.pay * 12)} премия за круг</small>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="ui-btn sm" onClick={() => { setActive(r.line); centerOnRoute(r); }}>{active === r.line ? '👁 на карте' : 'Показать'}</button>
            <button className="ui-btn sm" onClick={() => setOpen(open === r.line ? null : r.line)}>{open === r.line ? 'Скрыть остановки' : 'Остановки'}</button>
            <button className="ui-btn sm main" disabled={!!g.job && g.job.type !== 'bus'} onClick={() => { g.startBusJob(r.line); setActive(r.line); setOpen(r.line); }}>
              {g.activeBusRoute() === r.line ? 'Работаю' : 'За смену'}
            </button>
          </div>
          {open === r.line && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {r.stops.map((st, i) => (
                <div key={st.name + i} className="row" style={{ fontSize: 13 }}>
                  <span style={{ opacity: 0.7, width: 18 }}>{i + 1}</span>
                  <span className="grow">🚏 {st.name}</span>
                  <small style={{ opacity: 0.65 }}>{Math.round(dist(me, st))} м</small>
                  <button className="ui-btn sm" onClick={() => { g.destination = { x: st.x, z: st.z }; g.toast(`Маршрут к «${st.name}» проложен`); }}>📍</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="tb-card">
        🚏 <div className="grow">
          <b>Ближайшая остановка{nearest ? `: ${nearest.stop.name}` : ''}</b>
          <small>{nearest ? `${Math.round(nearest.d)} м · линия ${nearest.route.line} «${nearest.route.name}»` : 'остановки не найдены'}</small>
        </div>
        {nearest && <button className="ui-btn sm main" onClick={() => { g.destination = { x: nearest.stop.x, z: nearest.stop.z }; g.toast('Маршрут к остановке проложен'); }}>Вести</button>}
      </div>

      <div className="tb-card">
        🚌 <div className="grow"><b>Автопарк</b><small>{Math.round(g.L.busDepot.x)}, {Math.round(g.L.busDepot.z)} · {Math.round(homeD)} м · автобус ждёт здесь</small></div>
        <button className="ui-btn sm" onClick={() => { g.destination = { x: g.L.busDepot.x, z: g.L.busDepot.z }; g.toast('Маршрут к автопарку проложен'); }}>📍</button>
      </div>

      {job && <button className="ui-btn danger" onClick={() => g.quitJob()}>Закончить смену водителя</button>}
      {!job && <p className="tb-note">Смена: возьмите автобус в автопарке, останавливайтесь у 🚏 — пассажиры платят за посадку, за полный круг премия.</p>}
    </div>
  );
}
