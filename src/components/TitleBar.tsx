import { useEffect, useState } from 'react';
import { Minus, Monitor, Square, X } from 'lucide-react';
import { useStore } from '../state/useStore';
import SessionTimer from './SessionTimer';
import RackMidiPanel from './RackMidiPanel';
import ChordIndicator from './ChordIndicator';
import AudioHealthIndicator from './AudioHealthIndicator';

export default function TitleBar() {
  const engineState = useStore((s) => s.engineState);
  const nav = useStore((s) => s.nav);
  const [audioOk, setAudioOk] = useState(true);
  const [remoteInfo, setRemoteInfo] = useState<{ port: number; enabled: boolean } | null>(null);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const syncLeaderState = useStore((s) => s.syncLeaderState);

  useEffect(() => {
    window.api.remote.getInfo().then(setRemoteInfo).catch(() => {});
  }, [settings.remote.port, settings.remote.enabled]);

  return (
    <div className="titlebar">
      <div className="titlebar-brand">
        <img src={`${import.meta.env.BASE_URL}app-icon-64.png`} alt="MRQ" />
        <div>
          <div className="name">MRQ</div>
          <div className="tag">MULTITRACKS PLAY</div>
        </div>
      </div>

      <div className="titlebar-mid">
        <div className="pill">
          <span className={`dot ${audioOk ? '' : 'off'}`} />
          {audioOk ? 'Áudio OK' : 'Sem áudio'}
        </div>
        {nav === 'rack' && settings.rack.chordDisplayEnabled && <ChordIndicator />}
        <div className="pill">
          <span className={`dot ${remoteInfo?.enabled ? '' : 'off'}`} />
          Remoto {remoteInfo?.enabled ? `:${remoteInfo.port}` : 'desligado'}
        </div>
        {engineState.isPlaying && <div className="pill" style={{ color: 'var(--accent)' }}>▶ Tocando</div>}
        <AudioHealthIndicator />
        {settings.sync.enabled && settings.sync.role === 'follower' && syncLeaderState && (
          <div className="pill" title="Estado recebido do Líder via MRQ Sync (só exibição, não controla sua reprodução)">
            🔗 Líder: {syncLeaderState.isPlaying ? '▶' : '■'} {syncLeaderState.bpm || '-'} BPM · {syncLeaderState.key}
          </div>
        )}
        {nav === 'rack' && <RackMidiPanel />}
        <SessionTimer />
        <button
          className={`pill stage-mode-toggle ${settings.stageMode ? 'on' : ''}`}
          title="Modo Palco: tema de alto contraste e fontes maiores, pra telas com pouca luz"
          onClick={() => updateSettings({ stageMode: !settings.stageMode })}
        >
          <Monitor size={12} /> Palco
        </button>
      </div>

      <div className="win-controls">
        <button onClick={() => window.api.window.minimize()} title="Minimizar"><Minus size={15} /></button>
        <button onClick={() => window.api.window.maximize()} title="Maximizar"><Square size={13} /></button>
        <button className="close" onClick={() => window.api.window.close()} title="Fechar"><X size={15} /></button>
      </div>
    </div>
  );
}
