// Экран входа: соло (аккаунт на устройстве) и онлайн (сервер).
import { useState } from 'react';
import menuBg from '../assets/menu.jpg';

const NICK_KEY = 'losgorod_nick';

function savedNick(): string {
  try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; }
}

export function AuthScreen({ onLaunch, onLaunchOnline }: {
  onLaunch: (nick: string) => void;
  onLaunchOnline?: (nick: string, gender: 'm' | 'f', password?: string) => void;
}) {
  const [mode, setMode] = useState<'solo' | 'online'>('solo');
  const [busy, setBusy] = useState(false);
  const [nick, setNick] = useState(savedNick());
  const [gender, setGender] = useState<'m' | 'f'>('m');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const nickClean = nick.trim();
  const nickOk = nickClean.length >= 2 && /^[\p{L}\p{N} _\-.]{2,16}$/u.test(nickClean);

  const playSolo = () => {
    if (busy || !nickOk) return;
    setBusy(true); setError('');
    const finalNick = nickClean.slice(0, 16);
    try { localStorage.setItem(NICK_KEY, finalNick); } catch { /* */ }
    onLaunch(finalNick);
    setBusy(false);
  };

  const playOnline = () => {
    if (busy || !nickOk) return;
    if (!onLaunchOnline) return;
    setBusy(true); setError('');
    try { localStorage.setItem(NICK_KEY, nickClean); } catch { /* */ }
    onLaunchOnline(nickClean.slice(0, 16), gender, password || undefined);
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
          <p className="auth-tagline">Открытый мир · бизнес · машины · соло + онлайн</p>
        </div>
      </div>

      {/* ===== ПРАВАЯ СТОРОНА: форма ===== */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2 className="auth-card-title">{mode === 'solo' ? 'Играть в соло' : 'Вход в онлайн'}</h2>
            <div className="auth-mode-toggle">
              <button className={`auth-mode-btn ${mode === 'solo' ? 'on' : ''}`} onClick={() => setMode('solo')}>Соло</button>
              <button className={`auth-mode-btn ${mode === 'online' ? 'on' : ''}`} onClick={() => setMode('online')}>Онлайн</button>
            </div>
          </div>

          <form className="auth-form" onSubmit={(e) => { e.preventDefault(); mode === 'solo' ? playSolo() : playOnline(); }}>
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

            {mode === 'online' && (
              <>
                <label className="auth-label block mt-3 mb-1">Пол</label>
                <div className="auth-gender">
                  <button className={`auth-gender-btn ${gender === 'm' ? 'on' : ''}`} onClick={() => setGender('m')}>👨 Мужской</button>
                  <button className={`auth-gender-btn ${gender === 'f' ? 'on' : ''}`} onClick={() => setGender('f')}>👩 Женский</button>
                </div>
                <label className="auth-label block mt-3 mb-1">Пароль</label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon">🔒</span>
                  <input
                    className="auth-input"
                    type="password"
                    maxLength={32}
                    placeholder="Пароль (если аккаунта нового — придумайте)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    autoComplete="current-password"
                  />
                </div>
                <p className="text-sm opacity-70 mt-2">Пароль хранится на сервере (Colab). 1 устройство = 1 аккаунт.</p>
              </>
            )}

            {error && (
              <div className="auth-error">{error}</div>
            )}

            <button
              className={`auth-btn ${busy ? 'busy' : ''}`}
              onClick={mode === 'solo' ? playSolo : playOnline}
              disabled={busy || !nickOk}
            >
              {busy ? 'Запуск…' : mode === 'solo' ? '▶ Играть' : '🌐 Войти в онлайн'}
            </button>

            <div className="auth-footer-note">
              {mode === 'solo'
                ? 'Игра в соло-режиме. Прогресс сохраняется на ваше устройство.'
                : 'Онлайн-режим. Прогресс (дом, авто, баланс) хранится на сервере.'}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
