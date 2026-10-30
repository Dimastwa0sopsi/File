import { useState } from 'react';
import type { Game } from '../game/game';
import { Modal } from './MenuScreens';

export function OnlineJoin({ g, close }: { g: Game; close: () => void }) {
  const info = g.onlineInfo();
  const [nick, setNick] = useState(info.nick);
  const [fresh, setFresh] = useState(!info.exists);
  const [gender, setGender] = useState<'m' | 'f'>(info.gender);
  const valid = nick.trim().length >= 2 && nick.trim().length <= 16;
  const go = () => { if (valid) g.enterOnline(nick, gender, fresh && info.exists ? true : !info.exists); };
  return (
    <Modal title="🌐 Вход в онлайн" onClose={close}>
      <p className="opacity-80 text-sm mb-3">Онлайн — общий мир с другими игроками. Здесь всё как в одиночной игре: деньги, работа, магазины, жильё, машины. Прогресс онлайна и место, где вы были, сохраняются отдельно от одиночной игры.</p>
      <label className="font-bold block mb-1">Ник</label>
      <input className="lg-input" style={{ letterSpacing: 0, fontSize: 18 }} value={nick} maxLength={16} placeholder="Ваш ник (2–16 символов)" autoFocus
        onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') go(); }} />
      {info.exists && !fresh && (
        <div className="lg-card mt-3">
          <b>Онлайн-сохранение найдено</b>
          <p className="text-sm">Пол: {info.gender === 'f' ? 'женский' : 'мужской'} · деньги ${info.money.toLocaleString('ru')} · последнее место: {info.place}</p>
          <button className="lg-btn sm mt-2" onClick={() => setFresh(true)}>Создать нового онлайн-персонажа</button>
        </div>
      )}
      {(fresh || !info.exists) && (
        <>
          <label className="font-bold block mt-3 mb-1">Пол персонажа</label>
          <div className="lg-join-g">
            <button className={`lg-btn lg-big ${gender === 'm' ? 'on' : ''}`} onClick={() => setGender('m')}>👨<br />Мужской</button>
            <button className={`lg-btn lg-big ${gender === 'f' ? 'on' : ''}`} onClick={() => setGender('f')}>👩<br />Женский</button>
          </div>
          {info.exists && <p className="text-xs text-red-300 mt-2">Старый онлайн-прогресс будет заменён новым персонажем. <button className="underline" onClick={() => setFresh(false)}>Отмена</button></p>}
        </>
      )}
      <button className="lg-btn lg-btn-main mt-4 w-full text-center" disabled={!valid} style={{ opacity: valid ? 1 : 0.5 }} onClick={go}>Войти в онлайн</button>
      <p className="text-xs opacity-60 mt-2">Сервер: sandbank-economic-zeppelin.ngrok-free.dev · Ё — выйти из онлайна</p>
    </Modal>
  );
}
