// Экран входа / регистрации в Лос-Город (стиль Black Russia).
// Название слева, форма ввода справа. Только онлайн — оффлайна нет.
// Вход только по нику + паролю (в меню входа создать аккаунт нельзя).
// Регистрация — в отдельном разделе. Привязки к устройству нет.
// Пароль проверяется на сервере: вход с чужого пароля не проходит.
import { useEffect, useState } from 'react';
import menuBg from '../assets/menu.jpg';
import { type JoinLaunch } from './OnlineJoin';
import { warmServer, discoverServer } from '../game/discovery';

const NICK_KEY = 'losgorod_nick';
const GENDER_KEY = 'losgorod_gender';

type Screen = 'login' | 'register';

function savedNick(): string {
  try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; }
}

/** Проверка доступности ника на сервере (nick_check). */
async function nickCheck(nick: string): Promise<'available' | 'taken' | 'error'> {
  const url = await discoverServer();
  if (!url) return 'error';
  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; ws?.close(); resolve('error'); } }, 10000);
    const finish = (r: 'available' | 'taken' | 'error') => { if (done) return; done = true; clearTimeout(timer); try { ws?.close(); } catch { /* */ } resolve(r); };
    try { ws = new WebSocket(url); } catch { finish('error'); return; }
    ws.onopen = () => { ws?.send(JSON.stringify({ type: 'nick_check', name: nick.trim() })); };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'nick_check') {
          if (m.available) finish('available');
          else if (m.taken) finish('taken');
          else finish('error');
        }
      } catch { /* */ }
    };
    ws.onerror = () => finish('error');
    ws.onclose = () => { if (!done) finish('error'); };
  });
}

/** Вход на сервер с проверкой пароля через WebSocket.
 *  Возвращает { ok: true } если сервер принял логин+пароль,
 *  или { ok: false, error } если пароль неверный / аккаунт не найден. */
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

    // без привязки к устройству: только ник, пол, пароль
    ws.onopen = () => {
      ws?.send(JSON.stringify({ type: 'login', name: nick.trim(), gender, password }));
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'login_success') finish(true);
        else if (m.type === 'error') {
          const code = String(m.code || '');
          if (code === 'pass') finish(false, typeof m.text === 'string' ? m.text : 'Неверный пароль');
          else if (code === 'name') finish(false, typeof m.text === 'string' ? m.text : 'Неверный ник');
          else finish(false, typeof m.text === 'string' ? m.text : 'Ошибка входа');
        }
      } catch { /* невалидный ответ — игнорируем */ }
    };
    ws.onerror = () => finish(false, 'Ошибка соединения с сервером');
    ws.onclose = () => { if (!done) finish(false, 'Соединение разорвано'); };
  });
}

export function AuthScreen({ onLaunch }: { onLaunch: (l: JoinLaunch) => void }) {
  const [screen, setScreen] = useState<Screen>('login');
  const [busy, setBusy] = useState(false);
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
  const passMatch = password === password2;

  const play = async () => {
    if (busy) return;
    if (!nickOk) { setError('Введите ник (2–16 символов)'); return; }
    if (!passOk) { setError('Пароль от 4 до 32 символов'); return; }
    if (screen === 'register' && !passMatch) { setError('Пароли не совпадают'); return; }

    setBusy(true);
    setError('');

    const finalNick = nickClean.slice(0, 16);
    try { localStorage.setItem(NICK_KEY, finalNick); } catch { /* */ }
    try { localStorage.setItem(GENDER_KEY, gender); } catch { /* */ }

    // На экране входа — проверяем, что аккаунт существует, иначе предлагаем регистрацию
    if (screen === 'login') {
      const status = await nickCheck(finalNick);
      if (status === 'available') {
        setError('Аккаунт не найден. Создайте его в разделе регистрации.');
        setBusy(false);
        return;
      }
      if (status === 'error') {
        setError('Сервер недоступен. Попробуйте позже.');
        setBusy(false);
        return;
      }
    }

    const result = await serverAuth(finalNick, gender, password);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    onLaunch({ mode: 'online', nick: finalNick, gender, password });
    setBusy(false);
  };

  const goRegister = () => { setScreen('register'); setError(''); };
  const goLogin = () => { setScreen('login'); setError(''); };

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

      {/* ===== ПРАВАЯ СТОРОНА: форма ===== */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2 className="auth-card-title">
              {screen === 'login' ? 'Вход в игру' : 'Создание аккаунта'}
            </h2>
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
                  placeholder={screen === 'login' ? 'Ваш пароль' : 'Придумайте пароль'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  autoComplete={screen === 'login' ? 'current-password' : 'new-password'}
                />
                <button type="button" className="auth-eye-btn" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
              {!passOk && password.length > 0 && (
                <div className="auth-hint auth-hint-error">Пароль от 4 до 32 символов</div>
              )}
            </div>

            {screen === 'register' && (
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
            disabled={busy || !nickOk || !passOk || (screen === 'register' && !passMatch)}
          >
            {busy ? (screen === 'login' ? '⏳ Вход…' : '⏳ Создание…') : screen === 'login' ? '▶ Войти в игру' : '▶ Создать аккаунт'}
          </button>

          <div className="auth-footer">
            <button className="auth-footer-link" onClick={screen === 'login' ? goRegister : goLogin}>
              {screen === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Есть аккаунт? Войти'}
            </button>
          </div>

          <div className="auth-footer-note">
            Все данные сохраняются на сервере: одежда, тачки, недвижимость, организация.
          </div>
        </div>
      </div>
    </div>
  );
}
