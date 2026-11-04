import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/game';
import type { RadioStation } from '../game/radio';

const FAV_KEY = 'losgorod_radio_fav';

function loadFav(): RadioStation[] {
  try { const raw = localStorage.getItem(FAV_KEY); if (raw) return JSON.parse(raw) as RadioStation[]; } catch { /* */ }
  return [];
}

/** Радио в машине (T): поиск станции по слову + свои волны по ссылке. */
export function RadioPanel({ g, close }: { g: Game; close: () => void }) {
  const radio = g.radio;
  const [q, setQ] = useState('');
  const [url, setUrl] = useState('');
  const [list, setList] = useState<RadioStation[]>(radio.list);
  const [vol, setVol] = useState(Math.round(radio.volume * 100));
  const [, tick] = useState(0);
  const [fav, setFav] = useState<RadioStation[]>(loadFav);
  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => { radio.onChange = () => tick((x) => x + 1); return () => { radio.onChange = null; }; }, [radio]);
  const st = radio.state();
  const search = async (text?: string) => {
    const res = await radio.search(text ?? q);
    setList(res);
    scroller.current?.scrollTo(0, 0);
  };
  const favToggle = (s: RadioStation) => {
    const has = fav.some((f) => f.url === s.url);
    const next = has ? fav.filter((f) => f.url !== s.url) : [...fav, s].slice(-30);
    setFav(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* */ }
  };
  const isFav = (s: RadioStation) => fav.some((f) => f.url === s.url);
  const stop = (e: React.KeyboardEvent) => e.stopPropagation();

  return (
    <div className="rd-back" onPointerDown={(e) => e.stopPropagation()}>
      <div className="rd">
        {/* заголовок */}
        <div className="rd-top">
          <b>📻 Радио</b>
          <span className={`rd-dot ${st.playing ? 'on' : ''}`} />
          <span className="rd-now">{st.station ? st.station.name : 'волна не выбрана'}</span>
          <button className="rd-x" onClick={close} aria-label="Закрыть">✕</button>
        </div>

        {/* управление — крупные кнопки */}
        <div className="rd-ctl-big">
          <button className="ui-btn sm" onClick={() => radio.next(-1)}>⏮</button>
          <button className="ui-btn main-big" onClick={() => radio.toggle()}>{st.playing ? '⏸' : '▶'}</button>
          <button className="ui-btn sm" onClick={() => radio.next(1)}>⏭</button>
          <button className="ui-btn sm ghost" onClick={() => radio.stop()}>■</button>
        </div>

        {/* громкость */}
        <div className="rd-vol-wrap">
          <label className="rd-vol-label">Громкость</label>
          <input className="ui-input rd-vol" type="range" min={0} max={100} value={vol} onKeyDown={stop}
            onChange={(e) => { const v = +e.target.value; setVol(v); radio.setVolume(v / 100); }} />
          <span className="rd-hint">{vol}%</span>
        </div>

        {/* поиск станции */}
        <div className="rd-search">
          <input className="ui-input" value={q} placeholder="Что включить: record, jazz, самара, 101…" onKeyDown={stop}
            onChange={(e) => setQ(e.target.value)} onKeyUp={(e) => { if (e.key === 'Enter') void search(); }} />
          <button className="ui-btn main" disabled={radio.loading} onClick={() => void search()}>{radio.loading ? '…' : 'Найти'}</button>
        </div>

        {/* своя ссылка */}
        <div className="rd-search">
          <input className="ui-input" value={url} placeholder="или ссылка на поток https://…" onKeyDown={stop}
            onChange={(e) => setUrl(e.target.value)} onKeyUp={(e) => { if (e.key === 'Enter') radio.playUrl(url); }} />
          <button className="ui-btn" onClick={() => { radio.playUrl(url); }}>Включить</button>
        </div>

        {st.error && <p className="rd-err">{st.error}</p>}

        {/* список станций */}
        <div className="rd-list" ref={scroller}>
          {fav.length > 0 && <div className="rd-cap">Мои волны</div>}
          {fav.map((s) => (
            <div key={'f' + s.id} className={`rd-row ${st.station?.url === s.url ? 'on' : ''}`}>
              <button className="rd-play" onClick={() => radio.play(s)}>{st.station?.url === s.url && st.playing ? '⏸' : '▶'}</button>
              <div className="rd-meta" onClick={() => radio.play(s)}><b>{s.name}</b><small>{s.genre || 'моя волна'}</small></div>
              <button className={`rd-star ${isFav(s) ? 'on' : ''}`} onClick={() => favToggle(s)}>★</button>
            </div>
          ))}
          <div className="rd-cap">{q ? `Поиск: ${q}` : 'Станции'}</div>
          {list.map((s) => (
            <div key={s.id} className={`rd-row ${st.station?.url === s.url ? 'on' : ''}`}>
              <button className="rd-play" onClick={() => radio.play(s)}>{st.station?.url === s.url && st.playing ? '⏸' : '▶'}</button>
              <div className="rd-meta" onClick={() => radio.play(s)}>
                <b>{s.name}</b><small>{[s.genre, s.country].filter(Boolean).join(' · ')}</small>
              </div>
              <button className={`rd-star ${isFav(s) ? 'on' : ''}`} onClick={() => favToggle(s)}>★</button>
            </div>
          ))}
          {!list.length && !radio.loading && <p className="rd-err">Ничего не нашлось — попробуйте другое слово.</p>}
        </div>

        <p className="rd-foot">T — радио в машине. Играет в фоне, пока вы едете.</p>
      </div>
    </div>
  );
}