import { create } from 'zustand';
import type {
  AppSettings,
  Library,
  MidiBinding,
  Scene,
  Song,
  SongArrangement,
  SongPart,
  SongTrack,
  TrackRole,
} from '../../shared/types';
import { DEFAULT_SETTINGS, PART_COLORS } from '../../shared/types';
import { newId } from '../lib/id';
import { engine, padEngine } from '../audio/engineInstance';
import { computePeaks, decodeForAnalysis } from '../audio/waveform';
import { recognizeParts } from '../audio/PartRecognition';
import type { EngineState } from '../audio/AudioEngine';

export type NavId =
  | 'library'
  | 'setlist'
  | 'arrange'
  | 'tempo'
  | 'chord'
  | 'outputs'
  | 'key'
  | 'guide'
  | 'midi';

interface Toast {
  id: string;
  message: string;
  kind: 'info' | 'error';
}

interface StoreState {
  ready: boolean;
  library: Library;
  settings: AppSettings;
  currentSong: Song | null;
  nav: NavId;
  secondaryPanelCollapsed: boolean;
  engineState: EngineState;
  toasts: Toast[];
  recognizing: boolean;

  init: () => Promise<void>;
  setNav: (nav: NavId) => void;
  toggleSecondaryPanel: () => void;
  pushToast: (message: string, kind?: 'info' | 'error') => void;
  dismissToast: (id: string) => void;

  importSongFromFolder: () => Promise<void>;
  selectSong: (songId: string) => Promise<void>;
  deleteSong: (songId: string) => void;
  renameSong: (songId: string, title: string) => void;

  updateCurrentSong: (mutator: (song: Song) => Song) => void;
  setPartsFromRecognition: () => Promise<void>;
  addPart: (part: Omit<SongPart, 'id'>) => void;
  updatePart: (partId: string, patch: Partial<SongPart>) => void;
  deletePart: (partId: string) => void;
  addArrangement: (name: string) => void;
  setActiveArrangement: (id: string | null) => void;
  updateArrangementSteps: (arrangementId: string, steps: SongArrangement['steps']) => void;

  setKey: (key: string) => void;
  setBpm: (bpm: number) => void;
  setTrackRole: (trackId: string, role: TrackRole) => void;
  setTrackFollowsKey: (trackId: string, follow: boolean) => void;
  setTrackVolumeDb: (trackId: string, db: number) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackSolo: (trackId: string, solo: boolean) => void;
  setTrackOutput: (trackId: string, output: string) => void;
  setChordChart: (raw: string, originalKey: string) => void;

  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  jumpToPart: (partId: string) => void;
  jumpRelative: (dir: 1 | -1) => void;
  toggleLoopActivePart: () => void;

  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  addMidiBinding: (binding: MidiBinding) => void;
  removeMidiBinding: (predicate: (b: MidiBinding) => boolean) => void;

  addScene: (name: string) => void;
  updateScene: (sceneId: string, patch: Partial<Scene>) => void;
  deleteScene: (sceneId: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(library: Library) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.api.store.saveLibrary(library).catch(() => {});
  }, 400);
}

// Pastas de multitrack costumam vir nomeadas com padrões como:
//   "Tua Alegria (Ao Vivo) - Drops - B - 130 bpm"
//   "Sou Grato Por Seu Amor-ASI SERA-D-72.00bpm"
// ou seja: "{Título} - {opcional: versão/seção} - {Tom} - {BPM}bpm", com "-"
// podendo vir com ou sem espaços ao redor. Esta função tenta extrair o tom e
// o BPM do nome da pasta, deixando o resto como título da música.
const KEY_TOKEN_REGEX = /^[A-Ga-g](#|b|s)?m?$/;

function normalizeKeyToken(token: string): string {
  const m = token.match(/^([A-Ga-g])(#|b|s)?(m)?$/);
  if (!m) return token;
  const note = m[1].toUpperCase();
  const accidental = m[2] ? (m[2].toLowerCase() === 's' ? '#' : m[2].toLowerCase()) : '';
  const minor = m[3] ? 'm' : '';
  return `${note}${accidental}${minor}`;
}

function parseSongFolderName(raw: string): { title: string; key: string | null; bpm: number | null } {
  let working = raw.trim();
  let bpm: number | null = null;
  let key: string | null = null;

  // 1) BPM: procura um número (com casas decimais opcionais) seguido de "bpm".
  const bpmMatch = working.match(/^(.*?)[\s\-_]*([\d]{2,3}(?:[.,]\d+)?)\s*bpm\b(.*)$/i);
  if (bpmMatch) {
    const parsed = parseFloat(bpmMatch[2].replace(',', '.'));
    if (!Number.isNaN(parsed) && parsed > 0) {
      bpm = Math.round(parsed * 100) / 100;
      working = `${bpmMatch[1]} ${bpmMatch[3]}`.trim();
    }
  }

  // 2) Tom: olha o último segmento separado por "-"/"_" e vê se parece um tom
  // musical (ex: "B", "C#", "Db", "F#m", "Bbm").
  working = working.replace(/[\s\-_]+$/, '');
  const segments = working.split(/\s*-\s*|_/).filter((s) => s.trim().length > 0);
  if (segments.length > 1) {
    const last = segments[segments.length - 1].trim();
    if (KEY_TOKEN_REGEX.test(last)) {
      key = normalizeKeyToken(last);
      segments.pop();
      working = segments.join(' - ');
    }
  }

  const title = working.trim().replace(/[\s\-_]+$/, '') || raw.trim();
  return { title, key, bpm };
}

function guessRole(name: string): TrackRole {
  const n = name.toLowerCase();
  if (/(click|metr[oô]nomo)/.test(n)) return 'click';
  if (/(guide|guia|cue)/.test(n)) return 'guide';
  if (/(drum|bateria|kick|snare|overhead)/.test(n)) return 'drums';
  if (/(bass|baixo)/.test(n)) return 'bass';
  if (/(guitar|guitarra|eg\d|gtr)/.test(n)) return 'guitar';
  if (/(key|teclado|piano|synth|pad)/.test(n)) return n.includes('pad') ? 'loop' : 'keys';
  if (/(vocal|voz|lead|bgv|choir|coro|coral)/.test(n)) return n.includes('choir') || n.includes('coro') ? 'choir' : 'vocal';
  if (/(loop)/.test(n)) return 'loop';
  return 'other';
}

function defaultTrack(name: string, filePath: string): SongTrack {
  return {
    id: newId(),
    name,
    filePath,
    role: guessRole(name),
    followsKey: !/(click|guia|guide)/i.test(name),
    output: 'stereo-1-2',
    volumeDb: 0,
    muted: false,
    solo: false,
  };
}

async function urlsForSong(song: Song): Promise<Record<string, string>> {
  const entries = await Promise.all(
    song.tracks.map(async (t) => [t.id, await window.api.fs.toFileUrl(t.filePath)] as const)
  );
  return Object.fromEntries(entries);
}

export const useStore = create<StoreState>((set, get) => ({
  ready: false,
  library: { songs: [], scenes: [] },
  settings: DEFAULT_SETTINGS,
  currentSong: null,
  nav: 'library',
  secondaryPanelCollapsed: false,
  engineState: engine.getState(),
  toasts: [],
  recognizing: false,

  init: async () => {
    const [library, settings] = await Promise.all([window.api.store.getLibrary(), window.api.store.getSettings()]);
    set({ library, settings, ready: true });

    engine.subscribe((engineState) => {
      set({ engineState });
      const song = get().currentSong;
      const parts = song?.parts.map((p, i) => ({ id: p.id, name: p.name, index: i + 1 })) ?? [];
      window.api.remote.sendState({
        songTitle: song?.title ?? null,
        isPlaying: engineState.isPlaying,
        currentKey: song?.currentKey ?? '-',
        currentBpm: song?.currentBpm ?? 0,
        parts,
        activePartId: engineState.activePartId,
        positionSec: engineState.realSeconds,
        durationSec: engineState.realTotalSeconds,
      });
    });

    window.api.remote.onCommand((cmd) => {
      const api = get();
      if (cmd.type === 'play') api.play();
      else if (cmd.type === 'pause') api.pause();
      else if (cmd.type === 'stop') api.stop();
      else if (cmd.type === 'jumpToPart') api.jumpToPart(cmd.partId);
      else if (cmd.type === 'setKey') api.setKey(cmd.key);
      else if (cmd.type === 'setBpm') api.setBpm(cmd.bpm);
      else if (cmd.type === 'toggleLoop') api.toggleLoopActivePart();
    });
  },

  setNav: (nav) => set({ nav }),
  toggleSecondaryPanel: () => set((s) => ({ secondaryPanelCollapsed: !s.secondaryPanelCollapsed })),
  pushToast: (message, kind = 'info') =>
    set((s) => ({ toasts: [...s.toasts, { id: newId(), message, kind }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  importSongFromFolder: async () => {
    const folder = await window.api.fs.chooseSongFolder();
    if (!folder) return;
    const found = await window.api.fs.scanFolderTracks(folder);
    if (found.length === 0) {
      get().pushToast('Nenhum arquivo de áudio encontrado nessa pasta.', 'error');
      return;
    }
    const tracks = found.map((f) => defaultTrack(f.name, f.filePath));
    const folderName = folder.split(/[\\/]/).filter(Boolean).pop() ?? 'Nova música';
    const parsed = parseSongFolderName(folderName);
    const title = parsed.title || folderName;
    const detectedKey = parsed.key ?? 'C';
    const detectedBpm = parsed.bpm ?? 120;
    const now = Date.now();
    const wholeSongPart: SongPart = {
      id: newId(),
      name: 'Música inteira',
      type: 'Outra',
      startBar: 1,
      endBar: 1000,
      color: PART_COLORS.Outra,
    };
    const song: Song = {
      id: newId(),
      title,
      folderPath: folder,
      originalKey: detectedKey,
      currentKey: detectedKey,
      originalBpm: detectedBpm,
      currentBpm: detectedBpm,
      timeSignatureNum: 4,
      timeSignatureDen: 4,
      durationSec: 0,
      tracks,
      parts: [wholeSongPart],
      arrangements: [],
      activeArrangementId: null,
      chordChart: null,
      waveformPeaks: null,
      createdAt: now,
      updatedAt: now,
    };
    const library = { ...get().library, songs: [...get().library.songs, song] };
    set({ library });
    scheduleSave(library);
    const detectedInfo = [parsed.key ? `tom ${detectedKey}` : null, parsed.bpm ? `${detectedBpm} bpm` : null]
      .filter(Boolean)
      .join(', ');
    get().pushToast(
      `"${title}" importada com ${tracks.length} faixas${detectedInfo ? ` (${detectedInfo} detectados)` : ''}.`
    );
    await get().selectSong(song.id);
  },

  selectSong: async (songId) => {
    const song = get().library.songs.find((s) => s.id === songId);
    if (!song) return;
    try {
      const urls = await urlsForSong(song);
      const { failed } = await engine.loadSong(song, urls);
      set({ currentSong: song });

      if (failed.length > 0) {
        const nomes = failed.slice(0, 4).map((f) => `${f.name} (${f.reason})`).join(', ');
        const resto = failed.length > 4 ? ` e mais ${failed.length - 4}` : '';
        if (failed.length === song.tracks.length) {
          get().pushToast(`Nenhuma faixa pôde ser carregada: ${nomes}${resto}.`, 'error');
        } else {
          get().pushToast(`${song.tracks.length - failed.length} de ${song.tracks.length} faixas carregadas. Falharam: ${nomes}${resto}.`, 'error');
        }
      }

      if (!song.waveformPeaks) {
        const failedIds = new Set(failed.map((f) => f.name));
        const loadedTracks = song.tracks.filter((t) => !failedIds.has(t.name));
        const primary = loadedTracks.find((t) => t.role === 'guide') ?? loadedTracks.find((t) => t.role === 'drums') ?? loadedTracks[0];
        if (primary) {
          try {
            const existing = engine.getTrackBuffer(primary.id);
            const buffer = existing ?? (await decodeForAnalysis(engine.ctx, urls[primary.id]));
            const peaks = computePeaks(buffer, 1600);
            get().updateCurrentSong((s) => ({ ...s, waveformPeaks: peaks, durationSec: buffer.duration }));
          } catch (err) {
            console.error('[waveform] falha ao gerar a forma de onda', err);
          }
        }
      }
    } catch (err) {
      console.error(err);
      get().pushToast('Não foi possível carregar essa música. Verifique os arquivos.', 'error');
    }
  },

  deleteSong: (songId) => {
    const library = { ...get().library, songs: get().library.songs.filter((s) => s.id !== songId) };
    set({ library, currentSong: get().currentSong?.id === songId ? null : get().currentSong });
    scheduleSave(library);
  },

  renameSong: (songId, title) => {
    get().updateCurrentSong((s) => (s.id === songId ? { ...s, title } : s));
  },

  updateCurrentSong: (mutator) => {
    const current = get().currentSong;
    if (!current) return;
    const updated = { ...mutator(current), updatedAt: Date.now() };
    const songs = get().library.songs.map((s) => (s.id === updated.id ? updated : s));
    const library = { ...get().library, songs };
    set({ currentSong: updated, library });
    scheduleSave(library);
  },

  setPartsFromRecognition: async () => {
    const song = get().currentSong;
    if (!song) return;
    set({ recognizing: true });
    try {
      const guideTrack = song.tracks.find((t) => t.role === 'guide') ?? song.tracks.find((t) => t.role === 'vocal') ?? song.tracks[0];
      if (!guideTrack) throw new Error('sem faixas');
      const url = await window.api.fs.toFileUrl(guideTrack.filePath);
      const buffer = await decodeForAnalysis(engine.ctx, url);
      const parts = recognizeParts(buffer, song.currentBpm, song.timeSignatureNum);
      if (parts.length === 0) {
        get().pushToast('Não foi possível sugerir partes para esta música.', 'error');
        return;
      }
      get().updateCurrentSong((s) => ({ ...s, parts }));
      engine.updateParts(parts);
      get().pushToast(`${parts.length} partes sugeridas. Revise antes de tocar ao vivo.`);
    } catch (err) {
      console.error(err);
      get().pushToast('Falha ao reconhecer partes.', 'error');
    } finally {
      set({ recognizing: false });
    }
  },

  addPart: (part) => {
    get().updateCurrentSong((s) => {
      const parts = [...s.parts, { ...part, id: newId() }].sort((a, b) => a.startBar - b.startBar);
      engine.updateParts(parts);
      return { ...s, parts };
    });
  },

  updatePart: (partId, patch) => {
    get().updateCurrentSong((s) => {
      const parts = s.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)).sort((a, b) => a.startBar - b.startBar);
      engine.updateParts(parts);
      return { ...s, parts };
    });
  },

  deletePart: (partId) => {
    get().updateCurrentSong((s) => {
      const parts = s.parts.filter((p) => p.id !== partId);
      engine.updateParts(parts);
      return { ...s, parts };
    });
  },

  addArrangement: (name) => {
    get().updateCurrentSong((s) => {
      const arrangement: SongArrangement = { id: newId(), name, steps: s.parts.map((p) => ({ partId: p.id, repeat: 1 })) };
      const next = { ...s, arrangements: [...s.arrangements, arrangement], activeArrangementId: arrangement.id };
      engine.updateArrangements(next.arrangements, next.activeArrangementId);
      return next;
    });
  },

  setActiveArrangement: (id) => {
    get().updateCurrentSong((s) => {
      engine.updateArrangements(s.arrangements, id);
      return { ...s, activeArrangementId: id };
    });
  },

  updateArrangementSteps: (arrangementId, steps) => {
    get().updateCurrentSong((s) => {
      const arrangements = s.arrangements.map((a) => (a.id === arrangementId ? { ...a, steps } : a));
      engine.updateArrangements(arrangements, s.activeArrangementId);
      return { ...s, arrangements };
    });
  },

  setKey: (key) => {
    engine.setKey(key);
    get().updateCurrentSong((s) => ({ ...s, currentKey: key }));
    if (padEngine.playing) padEngine.changeKey(key, get().settings.pad.keyChangeCrossfadeSec);
  },

  setBpm: (bpm) => {
    engine.setBpm(bpm);
    get().updateCurrentSong((s) => ({ ...s, currentBpm: bpm }));
  },

  setTrackRole: (trackId, role) => {
    get().updateCurrentSong((s) => ({ ...s, tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, role } : t)) }));
  },

  setTrackFollowsKey: (trackId, follow) => {
    engine.setTrackFollowsKey(trackId, follow);
    get().updateCurrentSong((s) => ({ ...s, tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, followsKey: follow } : t)) }));
  },

  setTrackVolumeDb: (trackId, db) => {
    engine.setTrackVolumeDb(trackId, db);
    get().updateCurrentSong((s) => ({ ...s, tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, volumeDb: db } : t)) }));
  },

  setTrackMuted: (trackId, muted) => {
    engine.setTrackMuted(trackId, muted);
    get().updateCurrentSong((s) => ({ ...s, tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, muted } : t)) }));
  },

  setTrackSolo: (trackId, solo) => {
    engine.setTrackSolo(trackId, solo);
    get().updateCurrentSong((s) => ({ ...s, tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, solo } : t)) }));
  },

  setTrackOutput: (trackId, output) => {
    engine.setTrackOutput(trackId, output);
    get().updateCurrentSong((s) => ({ ...s, tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, output } : t)) }));
  },

  setChordChart: (raw, originalKey) => {
    get().updateCurrentSong((s) => ({ ...s, chordChart: { raw, originalKey, capo: 0 } }));
  },

  play: async () => {
    const settings = get().settings;
    if (settings.pad.exitOnPlay) padEngine.stop(settings.pad.fadeInOutSec);
    if (settings.click.countInBars > 0 && !engine.getState().isPlaying) {
      const song = get().currentSong;
      const beats = settings.click.countInBars * (song?.timeSignatureNum ?? 4);
      await engine.playCountIn(beats, song?.currentBpm ?? 120, () => {});
    }
    await engine.play();
  },
  pause: async () => engine.pause(),
  stop: async () => engine.stop(),
  jumpToPart: (partId) => engine.jumpToPart(partId, engine.getState().isPlaying),
  jumpRelative: (dir) => {
    const song = get().currentSong;
    if (!song) return;
    const idx = song.parts.findIndex((p) => p.id === get().engineState.activePartId);
    const nextIdx = Math.min(song.parts.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir));
    const part = song.parts[nextIdx];
    if (part) engine.jumpToPart(part.id, engine.getState().isPlaying);
  },
  toggleLoopActivePart: () => engine.setLoopActivePart(!get().engineState.loopActivePart),

  updateSettings: async (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await window.api.store.saveSettings(settings);
    if (patch.outputDeviceId !== undefined) await engine.setOutputDevice(patch.outputDeviceId);
  },

  addMidiBinding: (binding) => {
    const settings = { ...get().settings, midiBindings: [...get().settings.midiBindings, binding] };
    get().updateSettings(settings);
  },
  removeMidiBinding: (predicate) => {
    const settings = { ...get().settings, midiBindings: get().settings.midiBindings.filter((b) => !predicate(b)) };
    get().updateSettings(settings);
  },

  addScene: (name) => {
    const scene: Scene = { id: newId(), name, items: [] };
    const library = { ...get().library, scenes: [...get().library.scenes, scene] };
    set({ library });
    scheduleSave(library);
  },
  updateScene: (sceneId, patch) => {
    const library = { ...get().library, scenes: get().library.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)) };
    set({ library });
    scheduleSave(library);
  },
  deleteScene: (sceneId) => {
    const library = { ...get().library, scenes: get().library.scenes.filter((s) => s.id !== sceneId) };
    set({ library });
    scheduleSave(library);
  },
}));
