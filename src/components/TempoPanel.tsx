import { useState } from 'react';
import type { Song } from '../../shared/types';
import { useStore } from '../state/useStore';
import { engine } from '../audio/engineInstance';

const PRACTICE_SPEEDS = [50, 60, 70, 80, 90, 100];

export default function TempoPanel({ song, onOpenSettings }: { song: Song; onOpenSettings: () => void }) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const updateCurrentSong = useStore((s) => s.updateCurrentSong);
  const engineState = useStore((s) => s.engineState);
  const toggleLoopActivePart = useStore((s) => s.toggleLoopActivePart);
  const [practicePercent, setPracticePercent] = useState<number | null>(null);

  /** Entra/sai do modo ensaio: toca a parte ativa em loop numa velocidade reduzida,
   *  SEM alterar o BPM salvo da música (ao sair, volta pro BPM normal sozinho). */
  function setPractice(percent: number | null) {
    setPracticePercent(percent);
    if (percent === null) {
      engine.setBpm(song.currentBpm);
      return;
    }
    if (!engineState.loopActivePart) toggleLoopActivePart();
    engine.setBpm(Math.round((song.currentBpm * percent) / 100));
  }

  return (
    <div>
      <div className="field-row">
        <div>
          <div className="label">Modo Ensaio</div>
          <div className="hint">Toca a parte ativa em loop numa velocidade reduzida, pra estudar antes do culto (não altera o BPM salvo).</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {PRACTICE_SPEEDS.map((p) => (
          <button
            key={p}
            className={`btn ${practicePercent === p ? 'primary' : ''}`}
            onClick={() => setPractice(practicePercent === p ? null : p)}
          >
            {p}%
          </button>
        ))}
        {practicePercent !== null && (
          <button className="btn ghost" onClick={() => setPractice(null)}>Sair do ensaio</button>
        )}
      </div>

      <h3 style={{ marginTop: 0 }}>Tempo</h3>

      <div className="field-row">
        <div>
          <div className="label">BPM e compasso</div>
          <div className="hint">
            {song.currentBpm} BPM · {song.timeSignatureNum}/{song.timeSignatureDen} · {Math.round((song.durationSec / (60 / song.currentBpm * song.timeSignatureNum)) || 0)} compassos
          </div>
        </div>
        <button className="btn" onClick={onOpenSettings}>Ajustar</button>
      </div>

      <div className="field-row">
        <div>
          <div className="label">Fórmula de compasso</div>
          <div className="hint">Usada para calcular os compassos das partes.</div>
        </div>
        <select
          value={`${song.timeSignatureNum}/${song.timeSignatureDen}`}
          onChange={(e) => {
            const [num, den] = e.target.value.split('/').map(Number);
            updateCurrentSong((s) => ({ ...s, timeSignatureNum: num, timeSignatureDen: den }));
          }}
        >
          {['4/4', '3/4', '6/8', '2/4', '5/4'].map((ts) => (
            <option key={ts} value={ts}>{ts}</option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <div>
          <div className="label">Dobrar o click</div>
          <div className="hint">Nesta música: toca o metrônomo próprio por cima do click gravado.</div>
        </div>
        <select
          value={settings.click.doubleClick}
          onChange={(e) => updateSettings({ click: { ...settings.click, doubleClick: e.target.value as 'off' | 'on' } })}
        >
          <option value="off">Desligado</option>
          <option value="on">Ligado</option>
        </select>
      </div>
    </div>
  );
}
