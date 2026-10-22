import { useEffect, useState } from 'react';
import { Minus, Monitor, Square, X } from 'lucide-react';
import { useStore } from '../state/useStore';
import SessionTimer from './SessionTimer';

export default function TitleBar() {
  const engineState = useStore((s) => s.engineState);
  const [audioOk, setAudioOk] = useState(true);
  const [remoteInfo, setRemoteInfo] = useState<{ port: number; enabled: boolean } | null>(null);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

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
        <div className="pill">
          <span className={`dot ${remoteInfo?.enabled ? '' : 'off'}`} />
          Remoto {remoteInfo?.enabled ? `:${remoteInfo.port}` : 'desligado'}
        </div>
        {engineState.isPlaying && <div className="pill" style={{ color: 'var(--accent)' }}>▶ Tocando</div>}
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
