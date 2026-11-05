import { useEffect, useRef, useState } from 'react';
import { Game, type HudState, type Panel } from '../game/game';
import { type Settings, resolveMobile } from '../game/config';
import { Hud, BigMap } from './Hud';
import { GamePanel } from './Panels';
import { MobileControls } from './MobileControls';
import { ChatBox } from './ChatBox';
import { CharacterEditor } from './CharacterEditor';
import { ListingPanel } from './ListingPanel';
import { CameraOverlay } from './Work';
import { TradePanel, TradeInvite, Passport, EmotePanel, PlantPanel } from './Extra';
import { SettingsPanel } from './MenuScreens';
import { RadioPanel } from './Radio';
import { OnlineJoin } from './OnlineJoin';
import menuBg from '../assets/menu.jpg';

export function GameView({ settings, newGame, nick = '', mode = 'solo', onExit, onSettings, onRetry, onResetRetry }: {
  settings: Settings; newGame: boolean; nick?: string;
  mode?: 'solo' | 'online';
  onExit: () => void; onSettings: (s: Settings) => void; onRetry: () => void; onResetRetry: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [progress, setProgress] = useState({ p: 0, label: 'Запуск' });
  const [phase, setPhase] = useState<'loading' | 'intro' | 'play' | 'error'>('loading');
  const [error, setError] = useState('');
  const [hud, setHud] = useState<HudState | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const lastProg = useRef(Date.now());
  const mobile = resolveMobile(settings);
  const onlineConnecting = useRef(false);
  const [showOnlineLogin, setShowOnlineLogin] = useState(false);
  useEffect(() => {
    const el = host.current!;
    let alive = true;
    let inst: Game | null = null;
    const g = new Game(el, settings, {
      onProgress: (p, label) => { lastProg.current = Date.now(); if (alive) setProgress({ p, label }); },
      onHud: (h) => alive && setHud(h),
      onPanel: (p) => alive && setPanel(p),
      onToast: (text) => { if (!alive) return; const id = Math.random(); setToasts((t) => [...t.slice(-3), { id, text }]); setTimeout(() => alive && setToasts((t) => t.filter((x) => x.id !== id)), 4200); },
      onReady: () => {
        if (!alive) return;
        setPhase('intro');
        // онлайн-режим: после загрузки мира подключаемся к серверу (только если запустили с mode='online')
        if (mode === 'online' && !onlineConnecting.current) {
          onlineConnecting.current = true;
          setTimeout(() => {
            if (!alive) return;
            g.enterOnline(nick).catch((e: any) => {
              setError(e?.message || 'Не удалось подключиться к серверу');
              setPhase('error');
            });
          }, 300);
        }
      },
      onIntroEnd: () => alive && setPhase('play'),
      onError: (e) => { if (alive) { setError(e); setPhase('error'); } },
      onNetError: (text) => {
        if (!alive) return;
        setError(text || 'Сервер недоступен');
        setPhase('error');
      },
      onShowOnline: () => { if (alive) setShowOnlineLogin(true); },
    });
    inst = g;
    setGame(g);
    g.init({ newGame, mode }).catch((e: unknown) => { console.error(e); if (alive) { setError(e instanceof Error ? e.message : String(e)); setPhase('error'); } });
    const wd = setInterval(() => { if (phaseRef.current === 'loading' && Date.now() - lastProg.current > 30000) { setError('Загрузка мира остановилась (нет прогресса 30 секунд). Попробуйте снизить качество графики.'); setPhase('error'); } }, 2000);
    return () => { alive = false; clearInterval(wd); g.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, nick, settings]);
  const phaseRef = useRef(phase); phaseRef.current = phase;
  useEffect(() => {
    if (!game) return;
    game.settingsCb = onSettings;
    game.updateSettings(settings);
  }, [settings, game, onSettings]);
  const close = () => game?.closePanel();
  return (
    <div className="lg-game">
      <div ref={host} className="lg-canvas-host" />
      {phase === 'loading' && (
        <div className="lg-loading" style={{ backgroundImage: `url(${menuBg})` }}>
          <div className="lg-load-box">
            <h2>ЛОС-ГОРОД</h2>
            <div className="lg-progress"><i style={{ width: `${Math.round(progress.p * 100)}%` }} /></div>
            <p>{progress.label} · {Math.round(progress.p * 100)}%</p>
          </div>
        </div>
      )}
      {phase === 'error' && (
        <div className="lg-loading"><div className="lg-load-box">
          <h2>Не удалось запустить мир</h2><p className="my-2">{error}</p>
          <div className="flex flex-wrap gap-2 justify-center mt-3">
            <button className="lg-btn lg-btn-main" onClick={onRetry}>Повторить</button>
            <button className="lg-btn" onClick={onResetRetry}>Сбросить сохранение и повторить</button>
            <button className="lg-btn" onClick={onExit}>В меню</button>
          </div>
        </div></div>
      )}
      {phase === 'intro' && <button className="lg-skip" onClick={() => game?.skipIntro()}>Пропустить ⏭</button>}
      {game && hud && phase === 'play' && !hud.editor && !hud.camera && <Hud g={game} hud={hud} mobile={mobile} />}
      {game && hud && phase === 'play' && hud.camera && !panel && <CameraOverlay g={game} mode={hud.camera.mode} />}
      {hud && hud.flash > 0 && <div className="cam-flash" />}
      {game && hud && phase === 'play' && mobile && !panel && <MobileControls g={game} hud={hud} />}
      {game && hud && phase === 'play' && mobile && !panel && hud.camera && <div className="lg-touch"><div className="lg-look" style={{ left: 0 }} onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); (e.target as HTMLElement).dataset.x = String(e.clientX); (e.target as HTMLElement).dataset.y = String(e.clientY); }} onPointerMove={(e) => { const t = e.target as HTMLElement; if (!t.dataset.x) return; game.input.lookDX += e.clientX - +t.dataset.x; game.input.lookDY += e.clientY - +(t.dataset.y ?? 0); t.dataset.x = String(e.clientX); t.dataset.y = String(e.clientY); }} onPointerUp={(e) => { delete (e.target as HTMLElement).dataset.x; }} /></div>}
      {game && hud && phase === 'play' && !hud.editor && !hud.camera && <ChatBox g={game} mobile={mobile} online={game.online} />}

      {showOnlineLogin && (
        <div className="lg-modal-back" onPointerDown={(e) => e.stopPropagation()}>
          <OnlineJoin
            variant="panel"
            g={game!}
            onLaunch={(l) => {
              if (l.mode === 'online') {
                game?.enterOnline(l.nick).catch((e: any) => game?.toast(e?.message || 'Не удалось подключиться к серверу'));
              } else {
                setShowOnlineLogin(false);
                game?.leaveOnline();
              }
            }}
            onClose={() => setShowOnlineLogin(false)}
            onMenu={() => setShowOnlineLogin(false)}
          />
        </div>
      )}
      <div className="lg-toasts">{toasts.map((t) => <div key={t.id} className="lg-toast">{t.text}</div>)}</div>
      {game && panel && panel.type === 'settings' && <SettingsPanel value={settings} onChange={onSettings} onClose={close} inGame onExit={() => { game.save(); onExit(); }} />}
      {game && panel && panel.type === 'map' && <BigMap g={game} mode={panel.mode} close={close} />}
      {game && panel && panel.type === 'radio' && <RadioPanel g={game} close={close} />}
      {game && panel && panel.type === 'trade' && <TradePanel g={game} />}
      {game && panel && panel.type === 'tradeInvite' && <TradeInvite g={game} close={close} />}
      {game && panel && panel.type === 'passport' && <Passport g={game} close={close} />}
      {game && panel && panel.type === 'emotes' && <EmotePanel g={game} close={close} />}
      {game && panel && panel.type === 'plant' && <PlantPanel g={game} k={panel.key} basement={panel.basement} close={close} />}
      {game && panel && panel.type === 'editor' && <CharacterEditor g={game} fresh={panel.fresh} />}
      {game && panel && panel.type === 'listing' && <ListingPanel g={game} uid={panel.uid} slot={panel.slot} close={close} />}
      {game && panel && !['settings', 'map', 'editor', 'listing', 'trade', 'tradeInvite', 'passport', 'emotes', 'plant', 'radio'].includes(panel.type) && <GamePanel key={panel.type + JSON.stringify(panel)} g={game} panel={panel} close={close} />}
    </div>
  );
}
