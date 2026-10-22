import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useStore } from '../state/useStore';

export default function SetlistPanel() {
  const library = useStore((s) => s.library);
  const addScene = useStore((s) => s.addScene);
  const deleteScene = useStore((s) => s.deleteScene);
  const updateScene = useStore((s) => s.updateScene);
  const selectSong = useStore((s) => s.selectSong);
  const setKey = useStore((s) => s.setKey);
  const setBpm = useStore((s) => s.setBpm);
  const currentSong = useStore((s) => s.currentSong);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(library.scenes[0]?.id ?? null);
  const [newSceneName, setNewSceneName] = useState('');

  const scene = library.scenes.find((s) => s.id === activeSceneId) ?? null;

  async function playItem(songId: string, key: string, bpm: number) {
    await selectSong(songId);
    setKey(key);
    setBpm(bpm);
  }

  return (
    <div className="secondary-panel">
      <div className="secondary-header">
        <h2>{scene ? scene.name : 'Cenas'}</h2>
        {scene && (
          <button className="icon-btn" title="Remover cena" onClick={() => { deleteScene(scene.id); setActiveSceneId(null); }}><Trash2 size={16} /></button>
        )}
      </div>
      <div className="secondary-body">
        {!scene && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input placeholder="Nome da cena, ex: Culto de domingo" value={newSceneName} onChange={(e) => setNewSceneName(e.target.value)} />
              <button
                className="btn primary"
                onClick={() => {
                  if (!newSceneName.trim()) return;
                  addScene(newSceneName.trim());
                  setNewSceneName('');
                }}
              >
                Criar
              </button>
            </div>
            {library.scenes.map((s) => (
              <div key={s.id} className="song-list-item" onClick={() => setActiveSceneId(s.id)}>
                <div className="title">{s.name}</div>
                <div className="meta">{s.items.length} músicas</div>
              </div>
            ))}
            {library.scenes.length === 0 && (
              <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
                Crie uma cena para montar a ordem do culto ou show.
              </div>
            )}
          </>
        )}

        {scene && (
          <>
            <button className="btn ghost" style={{ marginBottom: 8 }} onClick={() => setActiveSceneId(null)}>← Todas as cenas</button>
            <select
              style={{ width: '100%', marginBottom: 10 }}
              onChange={(e) => {
                if (!e.target.value) return;
                const song = library.songs.find((s) => s.id === e.target.value);
                if (!song) return;
                updateScene(scene.id, { items: [...scene.items, { songId: song.id, key: song.currentKey, bpm: song.currentBpm }] });
                e.target.value = '';
              }}
            >
              <option value="">+ adicionar música à cena…</option>
              {library.songs.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>

            {scene.items.map((item, i) => {
              const song = library.songs.find((s) => s.id === item.songId);
              if (!song) return null;
              const isCurrent = currentSong?.id === song.id;
              const isNext = !isCurrent && scene.items[i - 1] && currentSong?.id === scene.items[i - 1].songId;
              return (
                <div
                  key={i}
                  className={`song-list-item ${isCurrent ? 'selected' : ''}`}
                  onClick={() => playItem(song.id, item.key, item.bpm)}
                >
                  <div className="title">{i + 1}. {song.title} {isNext && <span style={{ color: 'var(--accent)', fontSize: 10 }}>A SEGUIR ●</span>}</div>
                  <div className="meta">Tom {item.key} · {item.bpm} BPM</div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
