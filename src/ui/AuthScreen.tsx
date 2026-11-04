// Стартовая заставка: статичный фон города и ОДНА кнопка — «▶ Играть».
//
// Игрок ОБЯЗАН ввести свой ник перед началом игры — без ника не пускаем.
// После ввода ник сохраняется и подставляется при следующем запуске.
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

export function AuthScreen({ onLaunch }: { onLaunch: (l: JoinLaunch) => void }) {
  const [busy, setBusy] = useState(false);
  const [nick, setNick] = useState(savedNick());

  // прогрев: пока игрок смотрит на заставку, клиент уже ищет актуальный сервер
  useEffect(() => { warmServer(); }, []);

  const nickOk = nick.trim().length >= 2;

  const play = async () => {
    if (busy || !nickOk) return;
    setBusy(true);
    const acc = currentAccount();
    let gender: 'm' | 'f' = 'm';
    try { gender = (localStorage.getItem(GENDER_KEY) === 'f' ? 'f' : 'm'); } catch { /* */ }
    if (acc) {
      activateAccountSave(acc.login);                       // прогресс аккаунта — в свой слот
      gender = acc.gender;
      updateAccount(acc.login, { gender });
    }
    const finalNick = nick.trim().slice(0, 16);
    try { localStorage.setItem(NICK_KEY, finalNick); } catch { /* приватный режим */ }
    let online = false;
    try { await ensureServer(); online = true; } catch { online = false; }
    try { localStorage.setItem(GENDER_KEY, gender); } catch { /* приватный режим */ }
    onLaunch({ mode: online ? 'online' : 'solo', nick: finalNick, gender });
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
          <div className="auth-nick-wrap">
            <label className="auth-nick-label">Ваш ник:</label>
            <input
              className="auth-nick-input"
              type="text"
              maxLength={16}
              placeholder="Введите ник…"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              autoFocus
              disabled={busy}
            />
          </div>
          <button className="lg-btn lg-btn-main auth-play" onClick={play} disabled={busy || !nickOk}>
            {busy ? '⏳' : nickOk ? '▶ Играть' : 'Введите ник'}
          </button>
          {nick.trim().length > 0 && !nickOk && (
            <div className="auth-nick-hint">Ник должен быть от 2 символов</div>
          )}
        </div>
      </div>
    </div>
  );
}
