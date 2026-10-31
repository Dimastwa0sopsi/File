// Стартовая заставка: статичный фон города и ОДНА кнопка — «▶ Играть».
//
// Никаких подсказок, шагов «выберите режим», логинов и полей с адресом сервера.
// По нажатию клиент сам находит живой сервер (см. game/discovery.ts): если он
// доступен — сразу общий мир, если нет — одиночная игра. Игрок не вводит ничего.
import { useEffect, useState } from 'react';
import menuBg from '../assets/menu.jpg';
import { type JoinLaunch } from './OnlineJoin';
import { activateAccountSave, currentAccount, updateAccount } from '../game/accounts';
import { warmServer, ensureServer } from '../game/discovery';

const NICK_KEY = 'losgorod_nick';
const GENDER_KEY = 'losgorod_gender';

function savedNick(): string {
  try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; }
}

/** ник для игры: из аккаунта → сохранённый в браузере → случайный «Игрок123» */
function pickNick(): string {
  const acc = currentAccount();
  const nick = (acc?.nick || savedNick() || `Игрок${Math.floor(100 + Math.random() * 899)}`).slice(0, 16);
  try { localStorage.setItem(NICK_KEY, nick); } catch { /* приватный режим */ }
  return nick;
}

export function AuthScreen({ onLaunch }: { onLaunch: (l: JoinLaunch) => void }) {
  const [busy, setBusy] = useState(false);

  // прогрев: пока игрок смотрит на заставку, клиент уже ищет актуальный сервер
  useEffect(() => { warmServer(); }, []);

  const play = async () => {
    if (busy) return;
    setBusy(true);
    const acc = currentAccount();
    let gender: 'm' | 'f' = 'm';
    try { gender = (localStorage.getItem(GENDER_KEY) === 'f' ? 'f' : 'm'); } catch { /* */ }
    if (acc) {
      activateAccountSave(acc.login);                       // прогресс аккаунта — в свой слот
      gender = acc.gender;
      updateAccount(acc.login, { gender });
    }
    const nick = pickNick();
    let online = false;
    try { await ensureServer(); online = true; } catch { online = false; }
    try { localStorage.setItem(GENDER_KEY, gender); } catch { /* приватный режим */ }
    onLaunch({ mode: online ? 'online' : 'solo', nick, gender });
  };

  return (
    <div className="auth-root">
      {/* фон меню — статичная картинка */}
      <div className="auth-photo" style={{ backgroundImage: `url(${menuBg})` }} />
      <div className="auth-veil" />

      <div className="auth-brand">
        <h1 className="lg-logo">ЛОС-ГОРОД</h1>
      </div>

      <div className="auth-side">
        <div className="auth-panel auth-panel-min">
          <button className="lg-btn lg-btn-main auth-play" onClick={play} disabled={busy}>
            {busy ? '⏳' : '▶ Играть'}
          </button>
        </div>
      </div>
    </div>
  );
}
