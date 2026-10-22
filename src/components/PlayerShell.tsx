import { useEffect, useState } from 'react';
import { Mic, Redo2, Undo2 } from 'lucide-react';
import type { PartType, Song } from '../../shared/types';
import { PART_COLORS } from '../../shared/types';
import { useStore } from '../state/useStore';
import SongHeader from './SongHeader';
import WaveformCanvas from './WaveformCanvas';
import TracksView from './TracksView';
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
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);

  const [draftRange, setDraftRange] = useState<{ start: number; end: number } | null>(null);
  const [draftName, setDraftName] = useState('Nova parte');
  const [draftType, setDraftType] = useState<PartType>('Verso');

  const isArrange = nav === 'arrange';
  const isChord = nav === 'chord';
  const isTracks = nav === 'tracks';

  // Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y) para desfazer/refazer no editor de
  // arranjo — só ativo nessa tela, e ignorado enquanto se digita em um campo.
  useEffect(() => {
    if (!isArrange) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (typing) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isArrange, undo, redo]);

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
            Arraste na forma de onda para marcar um trecho novo · clique numa parte na lista abaixo para editar ·
            arraste para reordenar o roteiro · Delete remove o passo selecionado · Ctrl+Z desfaz
          </span>
          <div style={{ flex: 1 }} />
          <button className="icon-btn" disabled={!canUndo} title="Desfazer (Ctrl+Z)" onClick={() => undo()}>
            <Undo2 size={16} />
          </button>
          <button className="icon-btn" disabled={!canRedo} title="Refazer (Ctrl+Shift+Z)" onClick={() => redo()}>
            <Redo2 size={16} />
          </button>
          <button className="btn" disabled={recognizing} onClick={() => setPartsFromRecognition()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mic size={14} /> {recognizing ? 'Analisando…' : 'Reconhecer partes (beta)'}
          </button>
        </div>
      )}

      {isChord ? (
        <ChordView song={song} />
      ) : isTracks ? (
        <TracksView song={song} currentBar={engineState.currentBar} onSeekBar={(bar) => seekBar(bar)} />
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

