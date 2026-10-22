import { Bell, Drum, Guitar, Infinity as InfinityIcon, Mic, Mic2, Piano, SlidersHorizontal, Square, Users } from 'lucide-react';
import type { Song, TrackRole } from '../../shared/types';
import { useStore } from '../state/useStore';

const ROLE_ICON: Record<TrackRole, typeof Bell> = {
  click: Bell,
  guide: Mic2,
  drums: Drum,
  bass: Guitar,
  guitar: Guitar,
  keys: Piano,
  vocal: Mic,
  choir: Users,
  loop: InfinityIcon,
  other: SlidersHorizontal,
};

export const ROLE_COLOR: Record<TrackRole, string> = {
  click: '#8c8f98',
  guide: '#45708f',
  drums: '#a0304f',
  bass: '#2f8f5a',
  guitar: '#c07a1f',
  keys: '#6b4fa0',
  vocal: '#f2a93b',
  choir: '#7c4fe0',
  loop: '#2d5fa0',
  other: '#5c5c66',
};

export default function MixerStrip({ song }: { song: Song }) {
  const setTrackVolumeDb = useStore((s) => s.setTrackVolumeDb);
  const setTrackMuted = useStore((s) => s.setTrackMuted);
  const setTrackSolo = useStore((s) => s.setTrackSolo);

  return (
    <div className="mixer-strip">
      {song.tracks.map((track) => {
        const RoleIcon = ROLE_ICON[track.role];
        const dimmed = track.muted || (song.tracks.some((t) => t.solo) && !track.solo);
        return (
        <div
          className={`mixer-channel${dimmed ? ' dimmed' : ''}`}
          key={track.id}
          style={{ '--role-color': ROLE_COLOR[track.role] } as React.CSSProperties}
        >
          <div className="ch-icon"><RoleIcon size={16} /></div>
          <div className="ch-name" title={track.name}>{track.name}</div>
          <div className="ch-sub">{track.output.replace('stereo-', '')}</div>
          <input
            className="mixer-fader"
            type="range"
            min={-60}
            max={12}
            step={0.5}
            value={track.volumeDb}
            onChange={(e) => setTrackVolumeDb(track.id, parseFloat(e.target.value))}
          />
          <div className="mixer-db">{track.volumeDb.toFixed(1)} dB</div>
          <div className="mixer-buttons">
            <button
              className={track.muted ? 'on mute' : ''}
              onClick={() => setTrackMuted(track.id, !track.muted)}
              title="Mudo"
            >
              M
            </button>
            <button
              className={track.solo ? 'on solo' : ''}
              onClick={() => setTrackSolo(track.id, !track.solo)}
              title="Solo"
            >
              S
            </button>
          </div>
        </div>
        );
      })}
      <div className="mixer-channel master" style={{ '--role-color': 'var(--accent)' } as React.CSSProperties}>
        <div className="ch-icon"><Square size={14} /></div>
        <div className="ch-name">MASTER</div>
        <div className="ch-sub">&nbsp;</div>
        <input className="mixer-fader" type="range" min={-60} max={12} step={0.5} defaultValue={0} disabled />
        <div className="mixer-db">0.0 dB</div>
      </div>
    </div>
  );
}
