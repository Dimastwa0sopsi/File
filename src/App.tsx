import { useState } from 'react';
import { HowTo, SettingsPanel } from './ui/MenuScreens';
import { GameView } from './ui/GameView';
import { OnlineJoin, type JoinLaunch } from './ui/OnlineJoin';
import { loadSettings, saveSettings, type Settings } from './game/config';
import { hasSave, resetSave } from './game/state';

type Screen = 'start' | 'game';
const NICK_KEY = 'losgorod_nick';
const loadNick = () => { try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; } };

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [modal, setModal] = useState<'how' | 'settings' | null>(null);
  const [saveExists, setSaveExists] = useState(hasSave());
  const [join, setJoin] = useState<{ nick: string; gender: 'm' | 'f' }>({ nick: loadNick(), gender: 'm' });
  const [run, setRun] = useState({ key: 1, newGame: false, gender: 'm' as 'm' | 'f', mode: 'solo' as 'solo' | 'online', nick: '' });
  const changeSettings = (s: Settings) => { setSettings(s); saveSettings(s); };

  /** запуск мира из стартового окна: соло — локальная игра, онлайн — подключение к серверу */
  const launch = (l: JoinLaunch) => {
    const exists = hasSave();
    try { localStorage.setItem(NICK_KEY, l.nick); } catch { /* приватный режим */ }
    setJoin({ nick: l.nick, gender: l.gender });
    setSaveExists(exists);
    setRun((r) => ({
      key: r.key + 1,
      // в онлайне соло-сохранение не затираем: грузим существующее (или создаём дефолтное в памяти)
      newGame: l.mode === 'online' ? false : !exists,
      gender: l.gender,
      mode: l.mode,
      nick: l.nick || `Игрок${Math.floor(100 + Math.random() * 899)}`,
    }));
    setScreen('game');
  };
  const toMenu = () => { setSaveExists(hasSave()); setScreen('start'); };

  return (
    <div className="lg-root">
      {screen === 'start' && (
        <OnlineJoin variant="start" initial={join} hasSave={saveExists}
          onLaunch={launch}
          onHow={() => setModal('how')} onSettings={() => setModal('settings')} />
      )}
      {screen === 'game' && (
        <GameView key={run.key} settings={settings} newGame={run.newGame} gender={run.gender}
          nick={run.nick} mode={run.mode}
          onExit={toMenu} onSettings={changeSettings}
          onRetry={() => setRun((r) => ({ ...r, key: r.key + 1 }))}
          onResetRetry={() => { resetSave(); setRun((r) => ({ ...r, key: r.key + 1, newGame: true, mode: 'solo' })); }} />
      )}
      {modal === 'how' && <HowTo onClose={() => setModal(null)} />}
      {modal === 'settings' && <SettingsPanel value={settings} onChange={changeSettings} onClose={() => setModal(null)} onResetSave={() => { resetSave(); setSaveExists(false); }} />}
    </div>
  );
}
