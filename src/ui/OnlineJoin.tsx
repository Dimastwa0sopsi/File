import { useState } from 'react';
import menuBg from '../assets/menu.jpg';
import type { Game } from '../game/game';
import { ONLINE_URL, getServerUrl, hostOf } from '../game/net';
import { ensureServer } from '../game/discovery';
import { Modal } from './MenuScreens';

/** текст, который показываем, если сервер не отвечает */
export const SERVER_DOWN_TEXT = 'Сервер отключен разработчиком. Пока поиграть нельзя.';

export type JoinLaunch = { mode: 'solo' | 'online'; nick: string };

/** модальное окно ошибки сети: «В меню» */
export function ServerDownModal({ text, onMenu, onRetry, onSolo }: { text?: string | null; onMenu: () => void; onRetry?: () => void; onSolo?: () => void }) {
  return (
    <div className="lg-modal-back" onPointerDown={(e) => e.stopPropagation()}>
      <div className="lg-modal" style={{ width: 'min(440px, 100%)' }}>
        <div className="lg-modal-head"><h2>⚠️ Нет связи</h2></div>
        <div className="lg-modal-body">
          <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.45, textAlign: 'center', margin: '6px 0 4px' }}>{text && text.trim() ? text : SERVER_DOWN_TEXT}</p>
          {onRetry && (
            <button className="lg-btn lg-btn-main w-full mt-4" style={{ width: '100%', marginTop: 14 }} onClick={onRetry}>🔄 Повторить вход</button>
          )}
          {onSolo && <button className="lg-btn lg-btn-main w-full mt-2" style={{ width: '100%', marginTop: 8 }} onClick={onSolo}>🎮 Продолжить офлайн</button>}
          <button className="lg-btn w-full mt-2" style={{ width: '100%', marginTop: 8 }} onClick={onMenu}>В меню</button>
        </div>
      </div>
    </div>
  );
}

/** не открываем экранную клавиатуру на телефоне сразу при запуске */
const isDesktop = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(pointer: coarse)').matches;

/** только поле ника (без пола и пароля — пол выбирается в кастомизации) */
function Fields({ nick, setNick, disabled, onEnter }: { nick: string; setNick: (v: string) => void; disabled?: boolean; onEnter?: () => void; }) {
  return (
    <>
      <label className="font-bold block mb-1">Никнейм</label>
      <input className="lg-input" style={{ letterSpacing: 0, fontSize: 18 }} value={nick} maxLength={16} disabled={disabled}
        placeholder="Ваш ник (2–16 символов)" autoComplete="off" autoFocus={isDesktop()}
        onChange={(e) => setNick(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onEnter?.(); }} />
      <p className="text-sm opacity-70 mt-2">Вход только по нику. 1 устройство = 1 акаунт. Под чужим ником войти нельзя.</p>
    </>
  );
}

/** панель онлайна внутри игры (variant='panel') */
export function OnlineJoin({ variant = 'panel', g, initial, onLaunch, onClose, onMenu, onHow, onSettings, hasSave }: {
  variant?: 'panel';
  g?: Game;
  initial?: { nick?: string };
  onLaunch: (l: JoinLaunch) => void;
  onClose?: () => void;
  onMenu?: () => void;
  onHow?: () => void;
  onSettings?: () => void;
  hasSave?: boolean;
}) {
  const info = g ? g.onlineInfo() : null;
  const startNick = initial?.nick ?? info?.nick ?? '';
  const [nick, setNick] = useState(startNick);
  const [busy, setBusy] = useState(false);
  const [down, setDown] = useState<string | null>(null);
  const valid = /^[\p{L}\p{N} _\-.]{2,16}$/u.test(nick.trim());
  const clean = () => nick.trim().slice(0, 16);
  const alreadyOnline = !!g?.online;

  const goOnline = async () => {
    if (busy || !valid) return;
    setBusy(true);
    try {
      await ensureServer();
    } catch {
      setBusy(false); setDown(''); return;
    }
    setBusy(false);
    onLaunch({ mode: 'online', nick: clean() });
  };
  const goSolo = () => onLaunch({ mode: 'solo', nick: clean() });

  return (
    <>
      <Modal title="🌐 Онлайн" onClose={onClose ?? (() => {})}>
        <p className="opacity-80 text-sm mb-3">
          Онлайн — общий мир с другими игроками. У каждого ника свой прогресс и своя привязка к устройству: под чужим ником войти нельзя. Баланс онлайна хранится на сервере: новый ник начинает с $20 000, локальные соло-деньги в онлайн не переносятся.
        </p>
        {info?.exists && (
          <div className="lg-card mb-3">
            <b>Онлайн-сохранение</b>
            <p className="text-sm">Ник: {info.nick} · деньги ${info.money.toLocaleString('ru')} · {info.place || 'на улице'}</p>
          </div>
        )}
        <Fields nick={nick} setNick={setNick} disabled={busy} onEnter={goOnline} />
        <div className="flex flex-col gap-2 mt-4">
          {!alreadyOnline && (
            <button className="lg-btn lg-btn-main" disabled={!valid || busy} style={{ opacity: valid && !busy ? 1 : 0.5 }} onClick={goOnline}>
              {busy ? 'Подключение…' : '🌐 Войти в онлайн'}
            </button>
          )}
          <button className="lg-btn" onClick={goSolo}>{alreadyOnline ? '🎮 Выйти в соло' : '🎮 Соло (локальная игра)'}</button>
        </div>
        {alreadyOnline && <p className="text-xs opacity-60 mt-2">Ё — выйти из онлайна</p>}
      </Modal>
      {down !== null && <ServerDownModal onMenu={() => { setDown(null); if (onMenu) onMenu(); else onClose?.(); }} />}
    </>
  );
}
