import { Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react';
import { formatTime } from '../lib/format';
import { useStore } from '../state/useStore';

export default function TransportBar() {
  const engineState = useStore((s) => s.engineState);
  const play = useStore((s) => s.play);
  const pause = useStore((s) => s.pause);
  const stop = useStore((s) => s.stop);
  const jumpRelative = useStore((s) => s.jumpRelative);

  return (
    <div className="transport-row">
      <div style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)', fontSize: 13 }}>
        {formatTime(engineState.realSeconds)}
      </div>
      <div className="spacer" />
      <button className="transport-btn" title="Parte anterior" onClick={() => jumpRelative(-1)}><SkipBack size={16} /></button>
      <button className="transport-btn" title="Parar" onClick={() => stop()}><Square size={15} /></button>
      <button className="transport-btn play" title="Tocar" onClick={() => play()}><Play size={20} /></button>
      <button className="transport-btn" title="Pausar" onClick={() => pause()}><Pause size={16} /></button>
      <button className="transport-btn" title="Próxima parte" onClick={() => jumpRelative(1)}><SkipForward size={16} /></button>
      <div className="spacer" />
      <div style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)', fontSize: 13 }}>
        -{formatTime(Math.max(0, engineState.realTotalSeconds - engineState.realSeconds))}
      </div>
    </div>
  );
}
