// Экран входа / регистрации в Лос-Город.
// Переработан: одна панель, режим определяется автоматически (вход/рег),
// крупные поля, быстрый старт, соло-кнопка под рукой.
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

type Mode = 'login' | 'register';

export function AuthScreen({ onLaunch }: { onLaunch: (l: JoinLaunch) => void }) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [nick, setNick] = useState(savedNick());
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [gender, setGender] = useState<'m' | 'f'>('m');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // прогрев сервера, пока игрок смотрит на заставку
  useEffect(() => { warmServer(); }, []);

  const nickClean = nick.trim();
  const nickOk = nickClean.length >= 2 && /^[\p{L}\p{N} _\-.]{2,16}$/u.test(nickClean);
  const passOk = password.length >= 4 && password.length <= 32;
  const passMatch = mode === 'register' ? password === password2 : true;

  const play = async () => {
    if (busy) return;
    if (!nickOk) { setError('Введите ник (2–16 символов)'); return; }
    if (!passOk) { setError('Пароль от 4 до 32 символов'); return; }
    if (mode === 'register' && !passMatch) { setError('Пароли не совпадают'); return; }

    setBusy(true);
    setError('');

    const acc = currentAccount();
    let finalGender = gender;
    if (acc) {
      activateAccountSave(acc.login);
      finalGender = acc.gender;
      updateAccount(acc.login, { gender: finalGender });
    }
    const finalNick = nickClean.slice(0, 16);
    try { localStorage.setItem(NICK_KEY, finalNick); } catch { /* приватный режим */ }
    try { localStorage.setItem(GENDER_KEY, finalGender); } catch { /* */ }

    let online = false;
    try { await ensureServer(); online = true; } catch { online = false; }

    onLaunch({ mode: online ? 'online' : 'solo', nick: finalNick, gender: finalGender, password });
    setBusy(false);
  };

  const toggleMode = () => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); };

  return (
    <div className="auth-root">
      {/* фон меню — статичная картинка города */}
      <div className="auth-photo" style={{ backgroundImage: `url(${menuBg})` }} />
      <div className="auth-veil" />

      <div className="auth-brand">
        <h1 className="lg-logo">ЛОС-ГОРОД</h1>
        <p className="auth-tag">Открытый мир · бизнес · машины · онлайн</p>
      </div>

      <div className="auth-side">
        <div className="auth-panel">
          <div className="auth-panel-head">
            <h2>{mode === 'login' ? '🔑 Вход' : '📝 Регистрация'}</h2>
            <button className="auth-x" onClick={toggleMode} aria-label="Сменить режим">
              {mode === 'login' ? 'Создать аккаунт' : 'Уже есть аккаунт'}
            </button>
          </div>

          <div className="auth-form">
            <label>Ник</label>
            <input
              className="auth-in"
              type="text"
              maxLength={16}
              placeholder="Ваш ник…"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              autoFocus
              disabled={busy}
              autoComplete="nick"
            />
            {!nickOk && nickClean.length > 0 && (
              <div className="auth-hint">Ник должен быть 2–16 символов</div>
            )}

            <label>Пароль</label>
            <div className="auth-pass">
              <input
                className="auth-in"
                type={showPassword ? 'text' : 'password'}
                placeholder="Введите пароль…"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button type="button" className="auth-eye" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
            {!passOk && password.length > 0 && (
              <div className="auth-hint">Пароль от 4 до 32 символов</div>
            )}

            {mode === 'register' && (
              <>
                <label>Повторите пароль</label>
                <div className="auth-pass">
                  <input
                    className="auth-in"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Ещё раз пароль…"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                    disabled={busy}
                    autoComplete="new-password"
                  />
                  <button type="button" className="auth-eye" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? '🙈' : '👁'}
                  </button>
                </div>
                {!passMatch && password2.length > 0 && (
                  <div className="auth-hint">Пароли не совпадают</div>
                )}
              </>
            )}

            <label>Пол</label>
            <div className="auth-gender">
              <button className={`lg-btn ${gender === 'm' ? 'on' : ''}`} disabled={busy} onClick={() => setGender('m')}>
                👨 Мужской
              </button>
              <button className={`lg-btn ${gender === 'f' ? 'on' : ''}`} disabled={busy} onClick={() => setGender('f')}>
                👩 Женский
              </button>
            </div>
          </div>

          {error && <div className="auth-err">{error}</div>}

          <button
            className={`lg-btn auth-go ${busy ? 'busy' : ''}`}
            onClick={play}
            disabled={busy || !nickOk || !passOk || (mode === 'register' && !passMatch)}
          >
            {busy ? '⏳' : mode === 'login' ? '▶ Войти' : '▶ Создать аккаунт'}
          </button>

          <div className="auth-links">
            {mode === 'login' ? (
              <b className="auth-link">Ещё нет аккаунта?</b>
            ) : (
              <b className="auth-link">Уже есть аккаунт?</b>
            )}
          </div>

          <div className="auth-solo">
            <button className="lg-btn" onClick={() => {
              if (!nickOk) { setError('Введите ник для соло-игры'); return; }
              setBusy(false);
              onLaunch({ mode: 'solo', nick: nickClean.slice(0, 16), gender });
            }}>
              🎮 Соло (без пароля)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}