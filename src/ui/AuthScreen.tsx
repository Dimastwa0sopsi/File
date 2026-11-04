// Экран входа / регистрации в Лос-Город (стиль Black Russia).
// Название слева, форма ввода справа. Только онлайн — оффлайна нет.
// Пароль проверяется на сервере: вход с чужого пароля не проходит.
import { useEffect, useState } from 'react';
import menuBg from '../assets/menu.jpg';
import { type JoinLaunch } from './OnlineJoin';
import { warmServer, ensureServer, discoverServer } from '../game/discovery';

const NICK_KEY = 'losgorod_nick';
const GENDER_KEY = 'losgorod_gender';

function savedNick(): string {
  try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; }
}

type Mode = 'login' | 'register';

/** Вход на сервер с проверкой пароля через WebSocket.
 *  Возвращает { ok: true } если сервер принял логин+пароль,
 *  или { ok: false, error } если пароль неверный / сервер недоступен. */
async function serverAuth(nick: string, gender: 'm' | 'f', password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = await discoverServer();
  if (!url) return { ok: false, error: 'Сервер недоступен. Попробуйте позже.' };

  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; ws?.close(); resolve({ ok: false, error: 'Сервер не отвечает' }); }
    }, 12000);

    const finish = (ok: boolean, error?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws?.close(); } catch { /* */ }
      resolve(ok ? { ok: true } : { ok: false, error: error || 'Ошибка входа' });
    };

    try {
      ws = new WebSocket(url);
    } catch { finish(false, 'Неверный адрес сервера'); return; }

    // токен устройства: привязывает аккаунт к этому браузеру
    const tokenKey = `losgorod_online_token_${nick.trim().toLowerCase()}`;
    let token = localStorage.getItem(tokenKey);
    if (!token) {
      token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { localStorage.setItem(tokenKey, token); } catch { /* */ }
    }

    ws.onopen = () => {
      ws?.send(JSON.stringify({ type: 'login', name: nick.trim(), gender, token, password }));
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'login_success') finish(true);
        else if (m.type === 'error') {
          const code = String(m.code || '');
          if (code === 'device' || code === 'replaced') finish(false, 'Этот аккаунт занят на другом устройстве. Войдите с другого или обратитесь в поддержку.');
          else finish(false, typeof m.text === 'string' ? m.text : 'Неверный ник или пароль');
        }
      } catch { /* невалидный ответ — игнорируем */ }
    };
    ws.onerror = () => finish(false, 'Ошибка соединения с сервером');
    ws.onclose = () => { if (!done) finish(false, 'Соединение разорвано'); };
  });
}

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

    const finalNick = nickClean.slice(0, 16);
    try { localStorage.setItem(NICK_KEY, finalNick); } catch { /* */ }
    try { localStorage.setItem(GENDER_KEY, gender); } catch { /* */ }

    // Реальная проверка пароля на сервере — без этого любой пароль подходит
    const result = await serverAuth(finalNick, gender, password);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    // Сервер принял логин и пароль — запускаем игру
    onLaunch({ mode: 'online', nick: finalNick, gender, password });
    setBusy(false);
  };

  const toggleMode = () => { setMode(m => m === 'login' ? 'register' : 'login'); setError(''); };

  return (
    <div className="auth-screen">
      <div className="auth-bg" style={{ backgroundImage: `url(${menuBg})` }} />
      <div className="auth-veil" />

      {/* ===== ЛЕВАЯ СТОРОНА: название игры ===== */}
      <div className="auth-left">
        <div className="auth-logo-inner">
          <div className="auth-badge">LOS GOROD</div>
          <h1 className="auth-logo">ЛОС-ГОРОД</h1>
          <p className="auth-tagline">Открытый мир · бизнес · машины · онлайн</p>
        </div>
      </div>

      {/* ===== ПРАВАЯ СТОРОНА: форма входа / регистрации ===== */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2 className="auth-card-title">
              {mode === 'login' ? 'Вход в игру' : 'Создание аккаунта'}
            </h2>
            <button className="auth-card-toggle" onClick={toggleMode}>
              {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Есть аккаунт? Войти'}
            </button>
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

            <div className="auth-field">
              <label className="auth-label">Пароль</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">🔒</span>
                <input
                  className="auth-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mode === 'login' ? 'Ваш пароль' : 'Придумайте пароль'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button type="button" className="auth-eye-btn" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
              {!passOk && password.length > 0 && (
                <div className="auth-hint auth-hint-error">Пароль от 4 до 32 символов</div>
              )}
            </div>

            {mode === 'register' && (
              <>
                <div className="auth-field">
                  <label className="auth-label">Повторите пароль</label>
                  <div className="auth-input-wrap">
                    <span className="auth-input-icon">🔁</span>
                    <input
                      className="auth-input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Ещё раз пароль"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      disabled={busy}
                      autoComplete="new-password"
                    />
                    <button type="button" className="auth-eye-btn" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? '🙈' : '👁'}
                    </button>
                  </div>
                  {!passMatch && password2.length > 0 && (
                    <div className="auth-hint auth-hint-error">Пароли не совпадают</div>
                  )}
                </div>

                <div className="auth-field">
                  <label className="auth-label">Пол</label>
                  <div className="auth-gender">
                    <button
                      className={`auth-gender-btn ${gender === 'm' ? 'active' : ''}`}
                      disabled={busy}
                      onClick={() => setGender('m')}
                    >
                      👨 Мужской
                    </button>
                    <button
                      className={`auth-gender-btn ${gender === 'f' ? 'active' : ''}`}
                      disabled={busy}
                      onClick={() => setGender('f')}
                    >
                      👩 Женский
                    </button>
                  </div>
                </div>
              </>
            )}
          </form>

          {error && (
            <div className="auth-error">{error}</div>
          )}

          <button
            className={`auth-btn ${busy ? 'busy' : ''}`}
            onClick={play}
            disabled={busy || !nickOk || !passOk || (mode === 'register' && !passMatch)}
          >
            {busy ? '⏳ Проверка…' : mode === 'login' ? '▶ Войти в игру' : '▶ Создать аккаунт'}
          </button>

          <div className="auth-footer">
            <span className="auth-footer-note">
              Все данные сохраняются на сервере: одежда, тачки, недвижимость, организация.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
