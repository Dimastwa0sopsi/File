import { useState } from 'react';
import { MainMenu, CreateCharacter, HowTo, SettingsPanel } from './ui/MenuScreens';
import { GameView } from './ui/GameView';
import { loadSettings, saveSettings, type Settings } from './game/config';
import { hasSave, resetSave } from './game/state';

type Screen = 'menu' | 'create' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [modal, setModal] = useState<'how' | 'settings' | null>(null);
  const [run, setRun] = useState({ key: 1, newGame: false, gender: 'm' as 'm' | 'f' });
  const [saveExists, setSaveExists] = useState(hasSave());
  const changeSettings = (s: Settings) => { setSettings(s); saveSettings(s); };
  const start = (newGame: boolean, gender: 'm' | 'f' = 'm') => { setRun((r) => ({ key: r.key + 1, newGame, gender })); setScreen('game'); };
  return (
    <div className="lg-root">
      {screen === 'menu' && <MainMenu hasSave={saveExists} onPlay={() => start(false)} onNew={() => setScreen('create')} onHow={() => setModal('how')} onSettings={() => setModal('settings')} />}
      {screen === 'create' && <><MainMenu hasSave={saveExists} onPlay={() => {}} onNew={() => {}} onHow={() => {}} onSettings={() => {}} /><CreateCharacter onBack={() => setScreen('menu')} onDone={(g) => start(true, g)} /></>}
      {screen === 'game' && (
        <GameView key={run.key} settings={settings} newGame={run.newGame} gender={run.gender}
          onExit={() => { setSaveExists(hasSave()); setScreen('menu'); }} onSettings={changeSettings}
          onRetry={() => setRun((r) => ({ ...r, key: r.key + 1 }))}
          onResetRetry={() => { resetSave(); setRun((r) => ({ ...r, key: r.key + 1, newGame: true })); }} />
      )}
      {modal === 'how' && <HowTo onClose={() => setModal(null)} />}
      {modal === 'settings' && <SettingsPanel value={settings} onChange={changeSettings} onClose={() => setModal(null)} onResetSave={() => { resetSave(); setSaveExists(false); }} />}
    </div>
  );
}
