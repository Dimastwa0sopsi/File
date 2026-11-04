// Экран входа / регистрации в Лос-Город (принцип Black Russia).
// Регистрация: ник + пароль + пол (выбирается один раз при создании).
// Вход: ник + пароль. Сервер сам определяет: новый ник — создаёт аккаунт,
// существующий — проверяет пароль. Если ник занят, но пароля нет — просит придумать.
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
    try { localStorage.setItem(NICK_KEY, finalNick); } catch { /* */ }
    try { localStorage.setItem(GENDER_KEY, finalGender); } catch { /* */ }

    let online = false;
    try { await ensureServer(); online = true; } catch { online = false; }

    onLaunch({ mode: online ? 'online' : 'solo', nick: finalNick, gender: finalGender, password });
    setBusy(false);
  };

  const toggleMode = () => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); };

  return (
    <div className="auth-root">
      <div className="auth-photo" style={{ backgroundImage: `url(${menuBg})` }} />
      <div className="auth-veil" />

      <div className="auth-brand-new">
        <div className="auth-badge">LOS GOROD</div>
        <h1 className="lg-logo">ЛОС-ГОРОД</h1>
        <p className="auth-slogan-new">Открытый мир · бизнес · машины · онлайн</p>
      </div>

      <div className="auth-card-wrap">
        <div className="auth-card">
          <div className="auth-card-head">
            <h2 className="auth-card-title">{mode === 'login' ? 'Вход в игру' : 'Создание аккаунта'}</h2>
            <button className="auth-card-switch" onClick={toggleMode}>
              {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
            </button>
          </div>

          <div className="auth-card-fields">
            <div className="auth-card-field">
              <span className="auth-card-ico">👤</span>
              <input
                className="auth-card-input"
                type="text"
                maxLength={16}
                placeholder="Никнейм"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                autoFocus
                disabled={busy}
                autoComplete="nick"
              />
              {!nickOk && nickClean.length > 0 && (
                <div className="auth-card-hint">Ник должен быть 2–16 символов</div>
              )}
            </div>

            <div className="auth-card-field">
              <span className="auth-card-ico">🔒</span>
              <div className="auth-card-pass-wrap">
                <input
                  className="auth-card-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button type="button" className="auth-card-eye" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
              {!passOk && password.length > 0 && (
                <div className="auth-card-hint">Пароль от 4 до 32 символов</div>
              )}
            </div>

            {mode === 'register' && (
              <>
                <div className="auth-card-field">
                  <span className="auth-card-ico">🔁</span>
                  <div className="auth-card-pass-wrap">
                    <input
                      className="auth-card-input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Повторите пароль"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      disabled={busy}
                      autoComplete="new-password"
                    />
                    <button type="button" className="auth-card-eye" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? '🙈' : '👁'}
                    </button>
                  </div>
                  {!passMatch && password2.length > 0 && (
                    <div className="auth-card-hint">Пароли не совпадают</div>
                  )}
                </div>

                <div className="auth-card-field">
                  <span className="auth-card-ico">⚧</span>
                  <div className="auth-card-gender">
                    <button
                      className={`auth-card-gender-btn ${gender === 'm' ? 'active' : ''}`}
                      disabled={busy}
                      onClick={() => setGender('m')}
                    >
                      👨 Мужской
                    </button>
                    <button
                      className={`auth-card-gender-btn ${gender === 'f' ? 'active' : ''}`}
                      disabled={busy}
                      onClick={() => setGender('f')}
                    >
                      👩 Женский
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {error && <div className="auth-card-err">{error}</div>}

          <button
            className={`auth-card-btn ${busy ? 'busy' : ''}`}
            onClick={play}
            disabled={busy || !nickOk || !passOk || (mode === 'register' && !passMatch)}
          >
            {busy ? '⏳ Ожидание…' : mode === 'login' ? '▶ Войти в игру' : '▶ Создать аккаунт'}
          </button>

          <div className="auth-card-solo">
            <button className="auth-card-solo-btn" onClick={() => {
              if (!nickOk) { setError('Введите ник для соло-игры'); return; }
              setBusy(false);
              onLaunch({ mode: 'solo', nick: nickClean.slice(0, 16), gender });
            }}>
              🎮 Играть в соло (без пароля)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}