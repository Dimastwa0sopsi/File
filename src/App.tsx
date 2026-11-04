import { useState } from 'react';
import { SettingsPanel } from './ui/MenuScreens';
import { GameView } from './ui/GameView';
import { AuthScreen } from './ui/AuthScreen';
import { loadSettings, saveSettings, type Settings } from './game/config';
import { hasSave, resetSave } from './game/state';

const NICK_KEY = 'losgorod_nick';
const loadNick = () => { try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; } };

export default function App() {
  const [screen, setScreen] = useState<'start' | 'game'>('start');
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [saveExists, setSaveExists] = useState(hasSave());
  const [run, setRun] = useState({ key: 1, newGame: false, gender: 'm' as 'm' | 'f', nick: '' });
  const changeSettings = (s: Settings) => { setSettings(s); saveSettings(s); };

  /** запуск мира: только соло-режим, сохранение на устройство */
  const launch = (nick: string) => {
    const exists = hasSave();
    try { localStorage.setItem(NICK_KEY, nick); } catch { /* приватный режим */ }
    setSaveExists(exists);
    setRun((r) => ({
      key: r.key + 1,
      newGame: !exists,
      gender: r.gender,
      nick: nick || `Игрок${Math.floor(100 + Math.random() * 899)}`,
    }));
    setScreen('game');
  };
  const toMenu = () => {
    setSaveExists(hasSave()); setScreen('start');
  };

  return (
    <div className="lg-root">
      {screen === 'start' && <AuthScreen onLaunch={launch} />}
      {screen === 'game' && (
        <GameView key={run.key} settings={settings} newGame={run.newGame} gender={run.gender}
          nick={run.nick}
          onExit={toMenu} onSettings={changeSettings}
          onRetry={() => setRun((r) => ({ ...r, key: r.key + 1 }))}
          onResetRetry={() => { resetSave(); setRun((r) => ({ ...r, key: r.key + 1, newGame: true })); }} />
      )}
    </div>
  );
}
