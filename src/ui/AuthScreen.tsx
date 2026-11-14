// Стартовый экран: никнейм, пол и выбор режима — соло или общий сервер.
// Название слева, форма справа. Без паролей и регистрации.
// Соло хранит прогресс на устройстве (localStorage), онлайн — на сервере.
import { useEffect, useState } from 'react';
import menuBg from '../assets/menu.jpg';

const NICK_KEY = 'losgorod_nick';
const SEX_KEY = 'losgorod_gender';

function savedNick(): string {
  try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; }
}
function savedGender(): 'm' | 'f' {
  try { return localStorage.getItem(SEX_KEY) === 'f' ? 'f' : 'm'; } catch { return 'm'; }
}

export function AuthScreen({ onLaunch, onOnline }: { onLaunch: (nick: string) => void; onOnline?: (nick: string, gender: 'm' | 'f', password: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [nick, setNick] = useState(savedNick());
  const [gender, setGender] = useState<'m' | 'f'>(savedGender());
  const [pass, setPass] = useState('');
  const [net, setNet] = useState(false);
  const [error, setError] = useState('');

  const nickClean = nick.trim();
  const nickOk = nickClean.length >= 2 && /^[\p{L}\p{N} _\-.]{2,16}$/u.test(nickClean);

  /** общая часть обоих режимов: проверить ник и запомнить его */
  const prepare = () => {
    if (busy || !nickOk) { if (!nickOk) setError('Введите ник (2–16 символов)'); return null; }
    setBusy(true);
    setError('');
    const finalNick = nickClean.slice(0, 16);
    try { localStorage.setItem(NICK_KEY, finalNick); localStorage.setItem(SEX_KEY, gender); } catch { /* приватный режим */ }
    return finalNick;
  };
  const play = () => {
    const n = prepare(); if (!n) return;
    onLaunch(n);
    setBusy(false);
  };
  /** вход на общий сервер: мир, деньги и другие игроки приходят с него */
  const playOnline = () => {
    if (!net) { setNet(true); setError(''); return; }   // сперва показываем поле пароля
    if (pass.trim().length < 4) { setError('Пароль для онлайна — минимум 4 символа'); return; }
    const n = prepare(); if (!n) return;
    onOnline?.(n, gender, pass.trim());
    setBusy(false);
  };

  return (
    <div className="auth-screen">
      <div className="auth-bg" style={{ backgroundImage: `url(${menuBg})` }} />
      <div className="auth-veil" />

      {/* ===== ЛЕВАЯ СТОРОНА: название игры ===== */}
      <div className="auth-left">
        <div className="auth-logo-inner">
          <div className="auth-badge">LOS GOROD</div>
          <h1 className="auth-logo">ЛОС-ГОРОД</h1>
          <p className="auth-tagline">Открытый мир · бизнес · машины · соло и онлайн</p>
        </div>
      </div>

      {/* ===== ПРАВАЯ СТОРОНА: форма ===== */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2 className="auth-card-title">Вход в игру</h2>
          </div>

          <form className="auth-form" onSubmit={(e) => { e.preventDefault(); play(); }}>
            <div className="auth-field">
              <label className="auth-label">Никнейм</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">👤</span>
                <input
                  className="auth-input"
                  type="text"
                  maxLength={16}
                  placeholder="Ваш никнейм"
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                  autoFocus
                  disabled={busy}
                  autoComplete="nick"
                />
              </div>
              {!nickOk && nickClean.length > 0 && (
                <div className="auth-hint auth-hint-error">Ник должен быть 2–16 символов</div>
              )}
            </div>

            {net && (
              <div className="auth-field">
                <label className="auth-label">Пароль для онлайна</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">🔒</span>
                  <input
                    className="auth-input"
                    type="password"
                    maxLength={32}
                    placeholder="Минимум 4 символа"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    disabled={busy}
                    autoComplete="current-password"
                  />
                </div>
                <div className="auth-hint">Первый вход задаёт пароль нику, дальше он защищает ваш аккаунт на сервере.</div>
              </div>
            )}

            <div className="auth-field">
              <label className="auth-label">Персонаж</label>
              <div className="auth-sex">
                <button type="button" className={`auth-sex-btn ${gender === 'm' ? 'on' : ''}`} onClick={() => setGender('m')} disabled={busy}>👨 Мужчина</button>
                <button type="button" className={`auth-sex-btn ${gender === 'f' ? 'on' : ''}`} onClick={() => setGender('f')} disabled={busy}>👩 Женщина</button>
              </div>
            </div>

            {error && (
              <div className="auth-error">{error}</div>
            )}

            <button
              className={`auth-btn ${busy ? 'busy' : ''}`}
              onClick={play}
              disabled={busy || !nickOk}
            >
              {busy ? 'Запуск…' : '▶ Играть в соло'}
            </button>

            {onOnline && (
              <button
                type="button"
                className={`auth-btn auth-btn-net ${busy ? 'busy' : ''}`}
                onClick={playOnline}
                disabled={busy || !nickOk}
              >
                {net ? '🌐 Войти на сервер' : '🌐 Играть онлайн'}
              </button>
            )}

            <div className="auth-footer-note">
              Соло: прогресс хранится на этом устройстве. Онлайн: общий мир, деньги и машины на сервере, рядом видно других игроков.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
