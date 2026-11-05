import { useState } from 'react';
import { SettingsPanel } from './ui/MenuScreens';
import { GameView } from './ui/GameView';
import { AuthScreen } from './ui/AuthScreen';
import { loadSettings, saveSettings, type Settings } from './game/config';
import { hasSave, resetSave } from './game/state';

const NICK_KEY = 'losgorod_nick';
const loadNick = () => { try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; } };

type RunOpts = { key: number; newGame: boolean; gender: 'm' | 'f'; nick: string; mode: 'solo' | 'online'; password?: string };

export default function App() {
  const [screen, setScreen] = useState<'start' | 'game'>('start');
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [saveExists, setSaveExists] = useState(hasSave());
  const [run, setRun] = useState<RunOpts>({ key: 1, newGame: false, gender: 'm', nick: '', mode: 'solo' });
  const changeSettings = (s: Settings) => { setSettings(s); saveSettings(s); };

  /** соло-режим: аккаунт на устройстве, прогресс в localStorage */
  const launchSolo = (nick: string) => {
    const exists = hasSave();
    try { localStorage.setItem(NICK_KEY, nick); } catch { /* приватный режим */ }
    setSaveExists(exists);
    setRun((r) => ({
      key: r.key + 1,
      newGame: !exists,
      gender: r.gender,
      nick: nick || `Игрок${Math.floor(100 + Math.random() * 899)}`,
      mode: 'solo',
    }));
    setScreen('game');
  };
  /** онлайн-режим: подключение к серверу, progresс хранится на сервере */
  const launchOnline = (nick: string, gender: 'm' | 'f', password?: string) => {
    try { localStorage.setItem(NICK_KEY, nick); } catch { /* приватный режим */ }
    setSaveExists(false);
    setRun((r) => ({
      key: r.key + 1,
      newGame: false,
      gender,
      nick,
      mode: 'online',
      password,
    }));
    setScreen('game');
  };
  const toMenu = () => {
    setSaveExists(hasSave()); setScreen('start');
  };

  return (
    <div className="lg-root">
      {screen === 'start' && <AuthScreen onLaunch={launchSolo} onLaunchOnline={launchOnline} />}
      {screen === 'game' && (
        <GameView key={run.key} settings={settings} newGame={run.newGame} gender={run.gender}
          nick={run.nick} mode={run.mode} password={run.password}
          onExit={toMenu} onSettings={changeSettings}
          onRetry={() => setRun((r) => ({ ...r, key: r.key + 1 }))}
          onResetRetry={() => { resetSave(); setRun((r) => ({ ...r, key: r.key + 1, newGame: true })); }}
          onLaunchOnline={launchOnline} />
      )}
    </div>
  );
}
