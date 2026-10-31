import { useState } from 'react';
import menuBg from '../assets/menu.jpg';
import type { Game } from '../game/game';
import { ONLINE_URL, getServerUrl, hostOf } from '../game/net';
import { ensureServer } from '../game/discovery';
import { Modal } from './MenuScreens';

/** текст, который показываем, если сервер не отвечает */
export const SERVER_DOWN_TEXT = 'Сервер отключен разработчиком. Пока поиграть нельзя.';

export type JoinLaunch = { mode: 'solo' | 'online'; nick: string; gender: 'm' | 'f' };

/** модальное окно ошибки сети: «В меню» */
export function ServerDownModal({ text, onMenu, onRetry }: { text?: string | null; onMenu: () => void; onRetry?: () => void }) {
  return (
    <div className="lg-modal-back" onPointerDown={(e) => e.stopPropagation()}>
      <div className="lg-modal" style={{ width: 'min(440px, 100%)' }}>
        <div className="lg-modal-head"><h2>⚠️ Нет связи</h2></div>
        <div className="lg-modal-body">
          <p style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.45, textAlign: 'center', margin: '6px 0 4px' }}>{text && text.trim() ? text : SERVER_DOWN_TEXT}</p>
          {onRetry && (
            <button className="lg-btn lg-btn-main w-full mt-4" style={{ width: '100%', marginTop: 14 }} onClick={onRetry}>🔄 Повторить вход</button>
          )}
          <button className="lg-btn w-full mt-2" style={{ width: '100%', marginTop: 8 }} onClick={onMenu}>В меню</button>
        </div>
      </div>
    </div>
  );
}

/** не открываем экранную клавиатуру на телефоне сразу при запуске */
const isDesktop = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(pointer: coarse)').matches;

function Fields({ nick, setNick, gender, setGender, disabled, onEnter }: {
  nick: string; setNick: (v: string) => void; gender: 'm' | 'f'; setGender: (g: 'm' | 'f') => void; disabled?: boolean; onEnter?: () => void;
}) {
  return (
    <>
      <label className="font-bold block mb-1">Никнейм</label>
      <input className="lg-input" style={{ letterSpacing: 0, fontSize: 18 }} value={nick} maxLength={16} disabled={disabled}
        placeholder="Ваш ник (2–16 символов)" autoComplete="off" autoFocus={isDesktop()}
        onChange={(e) => setNick(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onEnter?.(); }} />
      <label className="font-bold block mt-3 mb-1">Пол</label>
      <div className="lg-join-g">
        <button className={`lg-btn lg-big ${gender === 'm' ? 'on' : ''}`} disabled={disabled} onClick={() => setGender('m')}>👨<br />Мужской</button>
        <button className={`lg-btn lg-big ${gender === 'f' ? 'on' : ''}`} disabled={disabled} onClick={() => setGender('f')}>👩<br />Женский</button>
      </div>
    </>
  );
}

/** Стартовое окно (variant='start') и панель онлайна внутри игры (variant='panel') */
export function OnlineJoin({ variant = 'start', g, initial, onLaunch, onClose, onMenu, onHow, onSettings, hasSave }: {
  variant?: 'start' | 'panel';
  g?: Game;
  initial?: { nick?: string; gender?: 'm' | 'f' };
  onLaunch: (l: JoinLaunch) => void;
  onClose?: () => void;
  onMenu?: () => void;
  onHow?: () => void;
  onSettings?: () => void;
  hasSave?: boolean;
}) {
  const info = g ? g.onlineInfo() : null;
  const startNick = initial?.nick ?? info?.nick ?? '';
  const startGender = initial?.gender ?? info?.gender ?? 'm';
  const [nick, setNick] = useState(startNick);
  const [gender, setGender] = useState<'m' | 'f'>(startGender);
  const [busy, setBusy] = useState(false);
  const [down, setDown] = useState<string | null>(null);
  // те же правила, что и в Game.enterOnline: буквы/цифры/пробел/_-. , 2–16 символов
  const valid = /^[\p{L}\p{N} _\-.]{2,16}$/u.test(nick.trim());
  const clean = () => nick.trim().slice(0, 16);
  const alreadyOnline = !!g?.online;

  // «Онлайн»: адрес сервера игрок не вводит — клиент сам находит живой туннель
  // (game/discovery.ts: опубликованный live.json → сохранённый → встроенный),
  // проверяет его подключением и только потом грузит общий мир.
  const goOnline = async () => {
    if (busy || !valid) return;
    setBusy(true);
    try {
      await ensureServer();   // сам находит живой адрес и проверяет его подключением
    } catch {
      setBusy(false); setDown(''); return;
    }
    setBusy(false);
    onLaunch({ mode: 'online', nick: clean(), gender });
  };
  const goSolo = () => onLaunch({ mode: 'solo', nick: clean(), gender });

  if (variant === 'panel') {
    return (
      <>
        <Modal title="🌐 Онлайн" onClose={onClose ?? (() => {})}>
          <p className="opacity-80 text-sm mb-3">
            Онлайн — общий мир с другими игроками. У каждого ника свой прогресс и своя привязка к устройству: под чужим ником войти нельзя. Баланс онлайна хранится на сервере: новый ник начинает с $20 000, локальные соло-деньги в онлайн не переносятся.
          </p>
          {info?.exists && (
            <div className="lg-card mb-3">
              <b>Онлайн-сохранение</b>
              <p className="text-sm">Пол: {info.gender === 'f' ? 'женский' : 'мужской'} · деньги ${info.money.toLocaleString('ru')} · {info.place || 'на улице'}</p>
            </div>
          )}
          <Fields nick={nick} setNick={setNick} gender={gender} setGender={setGender} disabled={busy} onEnter={goOnline} />
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

  return (
    <div className="lg-menu" style={{ backgroundImage: `url(${menuBg})` }}>
      <div className="lg-menu-shade" />
      <div className="lg-menu-inner" style={{ maxHeight: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <h1 className="lg-logo">ЛОС-ГОРОД</h1>
        <p className="lg-sub">Открытый мир · город 18×18 · играйте соло или онлайн</p>
        <Fields nick={nick} setNick={setNick} gender={gender} setGender={setGender} disabled={busy} onEnter={goOnline} />
        <div className="flex flex-col gap-2 mt-4" style={{ maxWidth: 380 }}>
          <button className="lg-btn lg-btn-main" style={{ minHeight: 52, fontSize: 17 }} onClick={goSolo}>🎮 Соло</button>
          <button className="lg-btn" style={{ minHeight: 52, fontSize: 17, opacity: valid && !busy ? 1 : 0.5 }} disabled={!valid || busy} onClick={goOnline}>
            {busy ? '🌐 Подключение…' : '🌐 Онлайн'}
          </button>
        </div>
        <p className="text-xs opacity-60 mt-2">
          {valid ? `Ник: ${clean()} · пол: ${gender === 'm' ? 'мужской' : 'женский'}` : 'Введите ник (2–16 символов), чтобы играть онлайн'}
          {hasSave ? ' · соло-сохранение найдено' : ''}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {onHow && <button className="lg-btn sm" onClick={onHow}>❓ Как играть</button>}
          {onSettings && <button className="lg-btn sm" onClick={onSettings}>⚙ Настройки</button>}
        </div>
      </div>
      {down !== null && <ServerDownModal onMenu={() => setDown(null)} />}
    </div>
  );
}
