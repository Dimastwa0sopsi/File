// Стартовое меню: статичный фон-фотография города + панель справа.
// Порядок: главное меню (Играть / Настройки / Как играть) → выбор режима → онлайн (логин и пароль) или сразу сюжет.
import { useMemo, useState } from 'react';
import menuBg from '../assets/menu.jpg';
import { ServerDownModal, type JoinLaunch } from './OnlineJoin';
import { getServerUrl, probeServer, hostOf, ONLINE_URL } from '../game/net';
import {
  checkLogin, checkPass, currentAccount, listAccounts, login as doLogin, logout, quickLogin,
  register as doRegister, removeAccount, updateAccount, activateAccountSave, flushAccountSave, type Account,
} from '../game/accounts';

const coarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

function Eye({ on }: { on: boolean }) {
  return <span style={{ opacity: on ? 1 : 0.6 }}>{on ? '🙈' : '👁'}</span>;
}

type Step = 'main' | 'play' | 'online' | 'register';

const GEN_NAMES = ['Игрок', 'Новичок', 'Горожан', 'Прохожий'];

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
  const [step, setStep] = useState<Step>('main');
  const [known, setKnown] = useState<Account[]>(() => listAccounts().slice(0, 4));

  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [gender, setGender] = useState<'m' | 'f'>(() => currentAccount()?.gender ?? 'm');
  const [showPass, setShowPass] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [down, setDown] = useState<string | null>(null);
  const [delFor, setDelFor] = useState<string | null>(null);

  const refreshKnown = () => setKnown(listAccounts().slice(0, 4));

  /** ник для игры: у аккаунта — его ник, у гостя — введённый логин или «Игрок» */
  const nick = () => (acc?.nick || login.trim() || GEN_NAMES[Math.floor(Math.random() * GEN_NAMES.length)]).slice(0, 16);

  /** одиночная игра (сюжет) — сразу в мир, без лишних окон */
  const solo = () => {
    setErr(null); setDown(null);
    if (acc) updateAccount(acc.login, { gender });
    onLaunch({ mode: 'solo', nick: nick(), gender });
  };

  /** подключение к серверу: сначала проверяем доступность, потом входим */
  const online = async () => {
    if (busy) return;
    setBusy(true); setDown(null); setErr(null);
    try {
      await probeServer(getServerUrl());
      setBusy(false);
      if (acc) { flushAccountSave(acc.login); updateAccount(acc.login, { gender }); }
      onLaunch({ mode: 'online', nick: nick(), gender });
    } catch {
      setBusy(false); setDown('');
    }
  };

  const submitOnline = () => {
    setErr(null); setInfo(null);
    const e = checkLogin(login) ?? checkPass(pass);
    if (e) { setErr(e); return; }
    const res = doLogin(login, pass);
    if (!res.ok) { setErr(res.error); return; }
    activateAccountSave(res.acc.login);
    setAcc(res.acc); setGender(res.acc.gender); setPass('');
    refreshKnown();
    void online();
  };

  const submitRegister = () => {
    setErr(null); setInfo(null);
    const e = checkLogin(login) ?? checkPass(pass);
    if (e) { setErr(e); return; }
    if (pass !== pass2) { setErr('Пароли не совпадают'); return; }
    const res = doRegister(login, pass, pass2, gender);
    if (!res.ok) { setErr(res.error); return; }
    activateAccountSave(res.acc.login);
    setAcc(res.acc); setPass(''); setPass2('');
    refreshKnown();
    void online();
  };

  /** быстрый вход: аккаунт уже сохранён на этом устройстве */
  const quick = (name: string) => {
    setErr(null); setDelFor(null);
    const res = quickLogin(name);
    if (!res.ok) { setErr(res.error); return; }
    activateAccountSave(res.acc.login);
    setAcc(res.acc); setGender(res.acc.gender); setLogin(res.acc.login);
    refreshKnown();
    void online();
  };

  /** удалить аккаунт с устройства (и его сохранение) */
  const remove = (name: string) => {
    removeAccount(name);
    if (acc?.login.toLowerCase() === name.toLowerCase()) { logout(); setAcc(null); }
    setDelFor(null); setLogin(''); setPass('');
    refreshKnown();
    setInfo(`Аккаунт «${name}» удалён с этого устройства`);
  };

  const pickGender = (g: 'm' | 'f') => {
    setGender(g);
    if (acc) updateAccount(acc.login, { gender: g });
  };

  const head = step === 'register' ? 'Регистрация' : step === 'online' ? 'Онлайн-режим' : step === 'play' ? 'Выбор режима' : 'Лос-Город';

  const quickList = useMemo(() => known.filter((a) => a && a.login), [known]);

  return (
    <div className="auth-root">
      {/* фон меню — статичная картинка (никакой 3D-заставки) */}
      <div className="auth-photo" style={{ backgroundImage: `url(${menuBg})` }} />
      <div className="auth-veil" />

      <div className="auth-brand">
        <h1 className="lg-logo">ЛОС-ГОРОД</h1>
        <p className="auth-tag">Открытый мир · 18×18 кварталов · три деревни за городом</p>
        <p className="auth-hint">Сюжетная одиночная игра начинается сразу, онлайн — по логину и паролю</p>
      </div>

      <div className="auth-side">
        <div className="auth-panel">
          <div className="auth-panel-head">
            <h2>{head}</h2>
            {step !== 'main' && (
              <button className="auth-x" title="Назад" onClick={() => { setStep(step === 'register' ? 'online' : 'main'); setErr(null); setInfo(null); }}>✕</button>
            )}
          </div>

          {/* ---------- главное меню ---------- */}
          {step === 'main' && (
            <div className="auth-form">
              {acc ? (
                <div className="auth-hello">
                  <div className="auth-ava">{(acc.login[0] ?? '?').toUpperCase()}</div>
                  <div>
                    <b>{acc.nick || acc.login}</b>
                    <small>Вы вошли как {acc.login}{hasSave ? ' · прогресс сохранён' : ''}</small>
                  </div>
                </div>
              ) : (
                <p className="auth-note">Аккаунт не нужен для сюжета — можно играть сразу.</p>
              )}
              <div className="auth-menu">
                <button className="lg-btn lg-btn-main auth-menu-btn" onClick={() => { setStep('play'); setErr(null); }}>▶ Играть</button>
                <button className="lg-btn auth-menu-btn" onClick={onSettings}>⚙ Настройки</button>
                <button className="lg-btn auth-menu-btn" onClick={onHow}>❓ Как играть</button>
              </div>
              {quickList.length > 0 && (
                <div className="auth-quick">
                  <span>Быстрый вход:</span>
                  {quickList.map((a) => (
                    <span key={a.login} className="auth-quick-item">
                      <button type="button" className="auth-chip" onClick={() => quick(a.login)}>⚡ {a.login}</button>
                      {delFor === a.login ? (
                        <span className="auth-del-confirm">
                          <button type="button" className="auth-del-yes" onClick={() => remove(a.login)}>удалить</button>
                          <button type="button" className="auth-del-no" onClick={() => setDelFor(null)}>нет</button>
                        </span>
                      ) : (
                        <button type="button" className="auth-del" title="Удалить аккаунт с устройства" onClick={() => setDelFor(a.login)}>✕</button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {info && <p className="auth-ok">✓ {info}</p>}
              {acc && (
                <div className="auth-foot">
                  <button className="auth-link" onClick={() => { if (acc) flushAccountSave(acc.login); logout(); setAcc(null); setInfo('Вы вышли из аккаунта'); }}>Выйти из аккаунта</button>
                </div>
              )}
            </div>
          )}

          {/* ---------- выбор режима ---------- */}
          {step === 'play' && (
            <div className="auth-form">
              <button type="button" className="auth-card" onClick={solo}>
                <span className="auth-card-ico">🎬</span>
                <span className="auth-card-txt"><b>Одиночная игра</b><small>Сюжет «Новичок в Лос-Городе» — сразу в город, без входа</small></span>
                <span className="auth-card-go">▶</span>
              </button>
              <button type="button" className="auth-card" onClick={() => { setStep('online'); setErr(null); setInfo(null); }}>
                <span className="auth-card-ico">🌐</span>
                <span className="auth-card-txt"><b>Онлайн-режим</b><small>Вход по логину и паролю, общий мир с другими игроками</small></span>
                <span className="auth-card-go">→</span>
              </button>
              <label>Пол персонажа</label>
              <div className="auth-gender">
                <button type="button" className={`lg-btn ${gender === 'm' ? 'on' : ''}`} onClick={() => pickGender('m')}>👨 Мужской</button>
                <button type="button" className={`lg-btn ${gender === 'f' ? 'on' : ''}`} onClick={() => pickGender('f')}>👩 Женский</button>
              </div>
              <p className="auth-note">{hasSave ? 'Сохранение найдено — одиночная игра продолжится с последнего места.' : 'Сохранения нет — одиночная игра начнётся заново.'}</p>
              <button type="button" className="auth-link" onClick={() => { setStep('main'); setErr(null); }}>← В главное меню</button>
            </div>
          )}

          {/* ---------- онлайн: логин и пароль ---------- */}
          {step === 'online' && (
            <form className="auth-form" onSubmit={(e) => { e.preventDefault(); submitOnline(); }}>
              <label>Логин</label>
              <input className="lg-input auth-in" value={login} maxLength={16} autoComplete="username"
                autoFocus={!coarse()} placeholder="Ваш логин"
                onChange={(e) => { setLogin(e.target.value); setErr(null); }} />
              <label>Пароль</label>
              <div className="auth-pass">
                <input className="lg-input auth-in" type={showPass ? 'text' : 'password'} value={pass} maxLength={32}
                  autoComplete="current-password" placeholder="••••••"
                  onChange={(e) => { setPass(e.target.value); setErr(null); }}
                  onKeyDown={(e) => e.stopPropagation()} />
                <button type="button" className="auth-eye" onClick={() => setShowPass((v) => !v)} aria-label="Показать пароль"><Eye on={showPass} /></button>
              </div>
              {err && <p className="auth-err">⚠ {err}</p>}
              {info && <p className="auth-ok">✓ {info}</p>}
              <button className="lg-btn lg-btn-main auth-go" type="submit" disabled={busy}>{busy ? '🌐 Подключаемся…' : '🌐 Войти в онлайн'}</button>
              <button type="button" className="auth-link" onClick={() => { setStep('register'); setErr(null); setPass2(''); }}>
                Нет аккаунта? <b>Регистрация</b>
              </button>
              <p className="auth-note">Аккаунт хранится в этом браузере, пароль — только в виде хэша. Новый игрок на сервере начинает с $20 000.</p>

              {quickList.length > 0 && (
                <div className="auth-quick">
                  <span>Быстрый вход:</span>
                  {quickList.map((a) => (
                    <span key={a.login} className="auth-quick-item">
                      <button type="button" className="auth-chip" onClick={() => quick(a.login)}>⚡ {a.login}</button>
                      {delFor === a.login ? (
                        <span className="auth-del-confirm">
                          <button type="button" className="auth-del-yes" onClick={() => remove(a.login)}>удалить</button>
                          <button type="button" className="auth-del-no" onClick={() => setDelFor(null)}>нет</button>
                        </span>
                      ) : (
                        <button type="button" className="auth-del" title="Удалить аккаунт с устройства" onClick={() => setDelFor(a.login)}>✕</button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <button type="button" className="auth-link" onClick={() => { setStep('play'); setErr(null); }}>← Назад к выбору режима</button>
            </form>
          )}

          {/* ---------- регистрация ---------- */}
          {step === 'register' && (
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
              <button className="lg-btn lg-btn-main auth-go" type="submit" disabled={busy}>Создать аккаунт и войти в онлайн</button>
              <button type="button" className="auth-link" onClick={() => { setStep('online'); setErr(null); }}>Уже есть аккаунт? <b>Войти</b></button>
            </form>
          )}

          <p className="auth-srv">Сервер: {hostOf(ONLINE_URL)} · данные аккаунта хранятся в браузере</p>
        </div>
      </div>

      {down !== null && <ServerDownModal onMenu={() => setDown(null)} />}
    </div>
  );
}
