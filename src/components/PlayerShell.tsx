import { useState } from 'react';
import { Mic } from 'lucide-react';
import type { PartType, Song } from '../../shared/types';
import { PART_COLORS } from '../../shared/types';
import { useStore } from '../state/useStore';
import SongHeader from './SongHeader';
import WaveformCanvas from './WaveformCanvas';
import PartsGrid from './PartsGrid';
import TransportBar from './TransportBar';
import MixerStrip from './MixerStrip';
import ChordView from './ChordView';
import ArrangeEditor from './ArrangeEditor';
import { engine } from '../audio/engineInstance';

const PART_TYPES = Object.keys(PART_COLORS) as PartType[];

export default function PlayerShell({ song }: { song: Song }) {
  const nav = useStore((s) => s.nav);
  const engineState = useStore((s) => s.engineState);
  const jumpToPart = useStore((s) => s.jumpToPart);
  const toggleLoopActivePart = useStore((s) => s.toggleLoopActivePart);
  const addPart = useStore((s) => s.addPart);
  const recognizing = useStore((s) => s.recognizing);
  const setPartsFromRecognition = useStore((s) => s.setPartsFromRecognition);

  const [draftRange, setDraftRange] = useState<{ start: number; end: number } | null>(null);
  const [draftName, setDraftName] = useState('Nova parte');
  const [draftType, setDraftType] = useState<PartType>('Verso');

  const isArrange = nav === 'arrange';
  const isChord = nav === 'chord';

  function seekBar(bar: number) {
    engine.seekToBar(bar);
    const part = song.parts.find((p) => bar >= p.startBar && bar < p.endBar);
    if (part) engine.jumpToPart(part.id, false);
  }

  return (
    <>
      <SongHeader song={song} />

      {isArrange && (
        <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13 }}>Arranjar partes</strong>
          <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
            Arraste na forma de onda para marcar um trecho novo · clique numa parte na lista abaixo para editar
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn" disabled={recognizing} onClick={() => setPartsFromRecognition()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mic size={14} /> {recognizing ? 'Analisando…' : 'Reconhecer partes (beta)'}
          </button>
        </div>
      )}

      {isChord ? (
        <ChordView song={song} />
      ) : (
        <>
          <WaveformCanvas
            song={song}
            currentBar={engineState.currentBar}
            editable={isArrange}
            onSeekBar={(bar) => seekBar(bar)}
            onCreateRange={(start, end) => {
              setDraftRange({ start, end });
            }}
          />

          {draftRange && (
            <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} style={{ width: 160 }} />
              <select value={draftType} onChange={(e) => setDraftType(e.target.value as PartType)}>
                {PART_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
                compassos {draftRange.start}–{draftRange.end}
              </span>
              <div style={{ flex: 1 }} />
              <button
                className="btn primary"
                onClick={() => {
                  addPart({
                    name: draftName,
                    type: draftType,
                    startBar: draftRange.start,
                    endBar: draftRange.end,
                    color: PART_COLORS[draftType],
                  });
                  setDraftRange(null);
                  setDraftName('Nova parte');
                }}
              >
                Adicionar
              </button>
              <button className="btn ghost" onClick={() => setDraftRange(null)}>Cancelar</button>
            </div>
          )}

          {isArrange ? (
            <ArrangeEditor song={song} />
          ) : (
            <PartsGrid
              song={song}
              activePartId={engineState.activePartId}
              pendingPartId={engineState.pendingPartId}
              loopActive={engineState.loopActivePart}
              onJump={(id) => jumpToPart(id)}
              onToggleLoop={() => toggleLoopActivePart()}
            />
          )}
        </>
      )}

      <TransportBar />
      <MixerStrip song={song} />
    </>
  );
}

