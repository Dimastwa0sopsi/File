import { useState } from 'react';
import { SettingsPanel, Modal } from './ui/MenuScreens';
import { GameView } from './ui/GameView';
import { AuthScreen } from './ui/AuthScreen';
import { loadSettings, saveSettings, type Settings } from './game/config';
import { hasSave, resetSave } from './game/state';
import { ensureServer } from './game/discovery';

const NICK_KEY = 'losgorod_nick';
const loadNick = () => { try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; } };

type RunOpts = { key: number; newGame: boolean; nick: string; mode: 'solo' | 'online' };

export default function App() {
  const [screen, setScreen] = useState<'start' | 'game'>('start');
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [saveExists, setSaveExists] = useState(hasSave());
  const [run, setRun] = useState<RunOpts>({ key: 1, newGame: false, nick: '', mode: 'solo' });
  const [showOnline, setShowOnline] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [onlineNick, setOnlineNick] = useState(loadNick());
  const [onlineError, setOnlineError] = useState('');
  const [onlineBusy, setOnlineBusy] = useState(false);
  const changeSettings = (s: Settings) => { setSettings(s); saveSettings(s); };
  const resetSaveAndContinue = () => {
    resetSave();
    setConfirmReset(false);
    setSaveExists(false);
    setRun((r) => ({ ...r, newGame: true }));
    setScreen('game');
  };

  /** соло-режим: прогресс на устройстве, ник сохранён. 1 устройство = 1 акаунт. */
  const launchSolo = () => {
    const nick = loadNick() || `Игрок${Math.floor(100 + Math.random() * 899)}`;
    const exists = hasSave();
    try { localStorage.setItem(NICK_KEY, nick); } catch { /* приватный режим */ }
    setSaveExists(exists);
    setRun((r) => ({ key: r.key + 1, newGame: !exists, nick, mode: 'solo' }));
    setScreen('game');
  };

  /** онлайн-вход с главного экрана: только ник, без пароля, привязка к устройству через токен. */
  const goOnline = async () => {
    const n = onlineNick.trim();
    if (!n || n.length < 2) { setOnlineError('Введите ник (2–16 символов)'); return; }
    if (!/^[\p{L}\p{N} _\-.]{2,16}$/u.test(n)) { setOnlineError('Недопустимый ник'); return; }
    setOnlineBusy(true); setOnlineError('');
    try {
      await ensureServer();
    } catch {
      setOnlineBusy(false); return;
    }
    try { localStorage.setItem(NICK_KEY, n); } catch { /* */ }
    setRun((r) => ({ key: r.key + 1, newGame: !hasSave(), nick: n, mode: 'online' }));
    setScreen('game');
    setOnlineBusy(false);
  };

  const toMenu = () => {
    setSaveExists(hasSave()); setScreen('start');
  };

  return (
    <div className="lg-root">
      {screen === 'start' && (
        <>
          <AuthScreen onPlay={launchSolo} onOnline={() => setShowOnline(true)} onSettings={() => setShowSettings(true)} />
          {showSettings && (
            <Modal title="⚙️ Настройки" onClose={() => setShowSettings(false)} wide>
              <SettingsPanel value={settings} onChange={changeSettings} onClose={() => setShowSettings(false)} onResetSave={() => setConfirmReset(true)} />
              {confirmReset && (
                <div className="flex flex-col gap-2 mt-4">
                  <p className="text-sm opacity-90">Вы уверены, что хотите удалить сохранение? Прогресс и купленные машины будут потеряны безвозвратно.</p>
                  <div className="flex gap-2">
                    <button className="lg-btn lg-danger" onClick={resetSaveAndContinue}>Да, удалить всё</button>
                    <button className="lg-btn" onClick={() => setConfirmReset(false)}>Отмена</button>
                  </div>
                </div>
              )}
            </Modal>
          )}
          {showOnline && (
            <Modal title="🌐 Вход в онлайн" onClose={() => setShowOnline(false)} wide>
              <p className="opacity-80 text-sm mb-3">
                Онлайн — общий мир с другими игроками. Введите только никнейм (без пароля). 1 устройство = 1 аккаунт, под чужим ником войти нельзя. Если ник занят другим игроком — вход заблокирован с предупреждением.
              </p>
              <div className="auth-field">
                <label className="font-bold block mb-1">Никнейм</label>
                <input
                  className="auth-input"
                  type="text"
                  maxLength={16}
                  placeholder="Ваш никнейм"
                  value={onlineNick}
                  onChange={(e) => setOnlineNick(e.target.value)}
                  autoFocus
                  disabled={onlineBusy}
                  autoComplete="nick"
                />
                {onlineError && <div className="auth-error">{onlineError}</div>}
              </div>
              <div className="flex flex-col gap-2 mt-4">
                <button
                  className={`auth-btn ${onlineBusy ? 'busy' : ''}`}
                  disabled={onlineBusy || onlineNick.trim().length < 2}
                  onClick={goOnline}
                >
                  {onlineBusy ? 'Подключение…' : '🌐 Войти в онлайн'}
                </button>
                <button className="auth-btn" onClick={() => setShowOnline(false)}>Назад</button>
              </div>
              <p className="text-xs opacity-60 mt-2">Ё — также открывает онлайн прямо из игры.</p>
            </Modal>
          )}
        </>
      )}
      {screen === 'game' && (
        <GameView key={run.key} settings={settings} newGame={run.newGame}
          nick={run.nick} mode={run.mode}
          onExit={toMenu} onSettings={changeSettings}
          onRetry={() => setRun((r) => ({ ...r, key: r.key + 1 }))}
          onResetRetry={() => { resetSave(); setRun((r) => ({ ...r, key: r.key + 1, newGame: true })); }} />
      )}
    </div>
  );
}
