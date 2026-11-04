// Экран входа в соло-режим (без аккаунтов, без сервера).
// Название слева, форма справа. Только никнейм + кнопка «Играть».
// Сохранение — только на устройство (localStorage).
import { useEffect, useState } from 'react';
import menuBg from '../assets/menu.jpg';

const NICK_KEY = 'losgorod_nick';

function savedNick(): string {
  try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; }
}

export function AuthScreen({ onLaunch }: { onLaunch: (nick: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [nick, setNick] = useState(savedNick());
  const [error, setError] = useState('');

  const nickClean = nick.trim();
  const nickOk = nickClean.length >= 2 && /^[\p{L}\p{N} _\-.]{2,16}$/u.test(nickClean);

  const play = () => {
    if (busy || !nickOk) return;
    if (!nickOk) { setError('Введите ник (2–16 символов)'); return; }

    setBusy(true);
    setError('');
    const finalNick = nickClean.slice(0, 16);
    try { localStorage.setItem(NICK_KEY, finalNick); } catch { /* */ }

    onLaunch(finalNick);
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
          <p className="auth-tagline">Открытый мир · бизнес · машины · соло</p>
        </div>
      </div>

      {/* ===== ПРАВАЯ СТОРОНА: форма ===== */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2 className="auth-card-title">Играть в соло</h2>
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

            {error && (
              <div className="auth-error">{error}</div>
            )}

            <button
              className={`auth-btn ${busy ? 'busy' : ''}`}
              onClick={play}
              disabled={busy || !nickOk}
            >
              {busy ? 'Запуск…' : '▶ Играть'}
            </button>

            <div className="auth-footer-note">
              Игра в соло-режиме. Прогресс сохраняется на ваше устройство.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
