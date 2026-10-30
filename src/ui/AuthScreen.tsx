// Стартовый экран: кинематографичная заставка с облётом города + панель входа справа.
import { useMemo, useState } from 'react';
import menuBg from '../assets/menu.jpg';
import { Flyover } from './Flyover';
import { ServerDownModal, type JoinLaunch } from './OnlineJoin';
import { getServerUrl, probeServer, hostOf, ONLINE_URL } from '../game/net';
import {
  checkLogin, checkPass, currentAccount, listAccounts, login as doLogin, logout,
  register as doRegister, updateAccount, activateAccountSave, flushAccountSave, type Account,
} from '../game/accounts';

const coarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

function Eye({ on }: { on: boolean }) {
  return <span style={{ opacity: on ? 1 : 0.6 }}>{on ? '🙈' : '👁'}</span>;
}

export function AuthScreen({ onLaunch, onHow, onSettings, hasSave }: {
  onLaunch: (l: JoinLaunch) => void;
  onHow?: () => void;
  onSettings?: () => void;
  hasSave?: boolean;
}) {
  const [acc, setAcc] = useState<Account | null>(() => {
    const a = currentAccount();
    if (a) activateAccountSave(a.login);   // поднимаем сохранение этого аккаунта
    return a;
  });
  const [mode, setMode] = useState<'login' | 'register' | 'play' | 'guest'>(() => (currentAccount() ? 'play' : 'login'));

  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [gender, setGender] = useState<'m' | 'f'>('m');
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [down, setDown] = useState<string | null>(null);
  const [guestNick, setGuestNick] = useState('');

  const online = async () => {
    if (busy) return;
    setBusy(true); setDown(null);
    try {
      await probeServer(getServerUrl());
      setBusy(false);
      onLaunch({ mode: 'online', nick: (acc?.nick || login || guestNick).trim().slice(0, 16), gender });
    } catch {
      setBusy(false);
      setDown('');
    }
  };
  const solo = () => onLaunch({ mode: 'solo', nick: (acc?.nick || login || guestNick).trim().slice(0, 16), gender });

  const submitLogin = () => {
    setErr(null);
    const e = checkLogin(login) ?? checkPass(pass);
    if (e) { setErr(e); return; }
    const res = doLogin(login, pass);
    if (!res.ok) { setErr(res.error); return; }
    activateAccountSave(res.acc.login);
    setAcc(res.acc); setGender(res.acc.gender); setMode('play'); setPass(''); setPass2('');
    setInfo(`С возвращением, ${res.acc.login}!`);
  };
  const submitRegister = () => {
    setErr(null);
    const e = checkLogin(login) ?? checkPass(pass);
    if (e) { setErr(e); return; }
    if (pass !== pass2) { setErr('Пароли не совпадают'); return; }
    const res = doRegister(login, pass, pass2, gender);
    if (!res.ok) { setErr(res.error); return; }
    activateAccountSave(res.acc.login);
    setAcc(res.acc); setGender(res.acc.gender); setMode('play'); setPass(''); setPass2('');
    setInfo('Аккаунт создан — добро пожаловать в Лос-Город!');
  };
  const pickGender = (g: 'm' | 'f') => {
    setGender(g);
    if (acc) updateAccount(acc.login, { gender: g });
  };
  const doLogout = () => {
    if (acc) flushAccountSave(acc.login);   // прогресс остаётся в слоте аккаунта
    logout(); setAcc(null); setMode('login'); setInfo(null); setErr(null); setLogin(''); setPass('');
  };

  const known = useMemo(() => listAccounts().slice(0, 3), [mode, acc]);
  const validGuest = /^[\p{L}\p{N} _\-.]{2,16}$/u.test(guestNick.trim());

  const head = mode === 'register' ? 'Регистрация' : mode === 'guest' ? 'Гость' : mode === 'play' ? 'Ваш профиль' : 'Вход в игру';

  return (
    <div className="auth-root">
      {/* заставка как в самом начале: живой облёт города */}
      <Flyover className="auth-fly" />
      <div className="lg-menu auth-photo" style={{ backgroundImage: `url(${menuBg})`, opacity: 0.35 }} />
      <div className="auth-veil" />

      <div className="auth-brand">
        <h1 className="lg-logo">ЛОС-ГОРОД</h1>
        <p className="auth-tag">Открытый мир · 18×18 кварталов · сначала одиночная игра</p>
        <p className="auth-hint">Начните в одиночном режиме — в онлайн можно перейти позже из планшета</p>
      </div>

      <div className="auth-side">
        <div className="auth-panel">
          <div className="auth-panel-head">
            <h2>{head}</h2>
            {mode !== 'play' && mode !== 'guest' && (
              <button className="auth-x" title="Закрыть" onClick={() => { setMode(acc ? 'play' : 'login'); setErr(null); }}>✕</button>
            )}
          </div>

          {mode === 'login' && (
            <form className="auth-form" onSubmit={(e) => { e.preventDefault(); submitLogin(); }}>
              <label>Логин</label>
              <input className="lg-input auth-in" value={login} maxLength={16} autoComplete="username"
                autoFocus={!coarse()} placeholder="Ваш логин"
                onChange={(e) => { setLogin(e.target.value); setErr(null); }} />
              <label>Пароль</label>
              <div className="auth-pass">
                <input className="lg-input auth-in" type={showPass ? 'text' : 'password'} value={pass} maxLength={32}
                  autoComplete="current-password" placeholder="••••••" onChange={(e) => { setPass(e.target.value); setErr(null); }}
                  onKeyDown={(e) => e.stopPropagation()} />
                <button type="button" className="auth-eye" onClick={() => setShowPass((v) => !v)} aria-label="Показать пароль"><Eye on={showPass} /></button>
              </div>
              {err && <p className="auth-err">⚠ {err}</p>}
              <button className="lg-btn lg-btn-main auth-go" type="submit">Войти</button>
              <button type="button" className="auth-link" onClick={() => { setMode('register'); setErr(null); setPass2(''); }}>
                Нет аккаунта? <b>Регистрация</b>
              </button>
              {known.length > 0 && (
                <div className="auth-known">
                  <span>Быстрый вход:</span>
                  {known.map((a) => (
                    <button type="button" key={a.login} className="auth-chip" onClick={() => { setLogin(a.login); setErr(null); }}>{a.login}</button>
                  ))}
                </div>
              )}
            </form>
          )}

          {mode === 'register' && (
            <form className="auth-form" onSubmit={(e) => { e.preventDefault(); submitRegister(); }}>
              <label>Логин</label>
              <input className="lg-input auth-in" value={login} maxLength={16} autoComplete="username" autoFocus={!coarse()} placeholder="3–16 символов"
                onChange={(e) => { setLogin(e.target.value); setErr(null); }} />
              <label>Пароль</label>
              <div className="auth-pass">
                <input className="lg-input auth-in" type={showPass ? 'text' : 'password'} value={pass} maxLength={32} autoComplete="new-password"
                  placeholder="минимум 4 символа" onChange={(e) => { setPass(e.target.value); setErr(null); }} />
                <button type="button" className="auth-eye" onClick={() => setShowPass((v) => !v)} aria-label="Показать пароль"><Eye on={showPass} /></button>
              </div>
              <label>Повторите пароль</label>
              <input className="lg-input auth-in" type={showPass ? 'text' : 'password'} value={pass2} maxLength={32} autoComplete="new-password"
                placeholder="ещё раз" onChange={(e) => { setPass2(e.target.value); setErr(null); }}
                onKeyDown={(e) => e.stopPropagation()} />
              <label>Пол персонажа</label>
              <div className="auth-gender">
                <button type="button" className={`lg-btn ${gender === 'm' ? 'on' : ''}`} onClick={() => pickGender('m')}>👨 Мужской</button>
                <button type="button" className={`lg-btn ${gender === 'f' ? 'on' : ''}`} onClick={() => pickGender('f')}>👩 Женский</button>
              </div>
              {err && <p className="auth-err">⚠ {err}</p>}
              <button className="lg-btn lg-btn-main auth-go" type="submit">Создать аккаунт</button>
              <button type="button" className="auth-link" onClick={() => { setMode('login'); setErr(null); }}>
                Уже есть аккаунт? <b>Войти</b>
              </button>
            </form>
          )}

          {mode === 'guest' && (
            <form className="auth-form" onSubmit={(e) => { e.preventDefault(); if (validGuest) solo(); }}>
              <p className="auth-note">Прогресс гостя хранится в этом браузере. Зарегистрируйтесь, чтобы не потерять его.</p>
              <label>Никнейм</label>
              <input className="lg-input auth-in" value={guestNick} maxLength={16} autoComplete="off" placeholder="2–16 символов"
                onChange={(e) => setGuestNick(e.target.value)} />
              <div className="auth-gender">
                <button type="button" className={`lg-btn ${gender === 'm' ? 'on' : ''}`} onClick={() => setGender('m')}>👨 Мужской</button>
                <button type="button" className={`lg-btn ${gender === 'f' ? 'on' : ''}`} onClick={() => setGender('f')}>👩 Женский</button>
              </div>
              <button className="lg-btn lg-btn-main auth-go" type="submit" disabled={!validGuest} style={{ opacity: validGuest ? 1 : 0.5 }}>🎮 Играть соло</button>
              <button type="button" className="lg-btn" disabled={!validGuest || busy || !hasSave} onClick={online}>🌐 Перейти в онлайн</button>
              <p className="auth-note">{hasSave ? 'Сохранение найдено — можно зайти в сеть.' : 'Сначала соло: онлайн открывается после первого сохранения.'}</p>
              <button type="button" className="auth-link" onClick={() => setMode('login')}>← Вернуться ко входу</button>
            </form>
          )}

          {mode === 'play' && acc && (
            <div className="auth-form">
              <div className="auth-hello">
                <div className="auth-ava">{(acc.login[0] ?? '?').toUpperCase()}</div>
                <div>
                  <b>{acc.nick || acc.login}</b>
                  <small>Логин: {acc.login} · входов: {acc.plays ?? 1}</small>
                </div>
              </div>
              {info && <p className="auth-ok">✓ {info}</p>}
              <label>Пол персонажа</label>
              <div className="auth-gender">
                <button className={`lg-btn ${gender === 'm' ? 'on' : ''}`} onClick={() => pickGender('m')}>👨 Мужской</button>
                <button className={`lg-btn ${gender === 'f' ? 'on' : ''}`} onClick={() => pickGender('f')}>👩 Женский</button>
              </div>
              <button className="lg-btn lg-btn-main auth-go" onClick={solo}>🎮 {hasSave ? 'Продолжить (соло)' : 'Начать соло'}</button>
              <button className="lg-btn" onClick={online} disabled={busy || !hasSave}>{busy ? '🌐 Подключаемся…' : '🌐 Перейти в онлайн'}</button>
              <p className="auth-note">{hasSave ? 'Одиночная игра сохранена — можно переходить в онлайн или продолжить соло.' : 'Сначала сыграйте одиночную игру: онлайн откроется после первого сохранения.'}</p>
              <p className="auth-note">{hasSave ? 'Сохранение аккаунта найдено — прогресс продолжится.' : 'Прогресс будет сохраняться в этот аккаунт в браузере.'}</p>
              <div className="auth-links">
                {onHow && <button className="lg-btn sm" onClick={onHow}>❓ Как играть</button>}
                {onSettings && <button className="lg-btn sm" onClick={onSettings}>⚙ Настройки</button>}
              </div>
              <div className="auth-foot">
                <button className="auth-link" onClick={doLogout}>Выйти из аккаунта</button>
                <span className="auth-dot">·</span>
                <button className="auth-link" onClick={() => { setMode('guest'); setErr(null); }}>Играть гостем</button>
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'register') && (
            <div className="auth-foot auth-foot-top">
              <button className="auth-link" onClick={() => setMode('guest')}>Играть без аккаунта →</button>
            </div>
          )}

          <p className="auth-srv">Сервер: {hostOf(ONLINE_URL)} · данные аккаунта хранятся в браузере</p>
        </div>
      </div>

      {down !== null && <ServerDownModal onMenu={() => setDown(null)} />}
    </div>
  );
}
