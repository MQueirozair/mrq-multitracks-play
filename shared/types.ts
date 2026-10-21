// Tipos compartilhados entre o processo principal (Electron/Node) e a interface (renderer).

export type PartType =
  | 'Intro'
  | 'Verso'
  | 'Pré-refrão'
  | 'Refrão'
  | 'Instrumental'
  | 'Ponte'
  | 'Solo'
  | 'Tag'
  | 'Interlúdio'
  | 'Final'
  | 'Outra';

export interface SongPart {
  id: string;
  name: string;
  type: PartType;
  /** compasso inicial (1-based) */
  startBar: number;
  /** compasso final (exclusivo) */
  endBar: number;
  color: string;
  loop?: boolean;
}

export interface ArrangementStep {
  partId: string;
  /** quantas vezes repetir esta parte antes de seguir (1 = toca uma vez) */
  repeat: number;
}

export interface SongArrangement {
  id: string;
  name: string;
  steps: ArrangementStep[];
}

export type TrackRole =
  | 'click'
  | 'guide'
  | 'drums'
  | 'bass'
  | 'guitar'
  | 'keys'
  | 'vocal'
  | 'choir'
  | 'loop'
  | 'other';

export interface SongTrack {
  id: string;
  name: string;
  /** caminho absoluto do arquivo de áudio no disco do usuário */
  filePath: string;
  role: TrackRole;
  /** faixa muda de tom junto com a música (pitch-shift) */
  followsKey: boolean;
  /** saída de áudio escolhida (id do par de canais do dispositivo, ou 'stereo-1-2' etc.) */
  output: string;
  volumeDb: number;
  muted: boolean;
  solo: boolean;
}

export interface ChordChartData {
  /** texto bruto colado pelo usuário, com marcações [NomeDaParte] e acordes em linha própria */
  raw: string;
  /** tom em que a cifra foi escrita */
  originalKey: string;
  capo: number;
}

export interface Song {
  id: string;
  title: string;
  /** pasta de origem no disco (não copiamos os áudios) */
  folderPath: string;
  originalKey: string;
  currentKey: string;
  originalBpm: number;
  currentBpm: number;
  timeSignatureNum: number;
  timeSignatureDen: number;
  durationSec: number;
  tracks: SongTrack[];
  parts: SongPart[];
  arrangements: SongArrangement[];
  activeArrangementId: string | null;
  chordChart: ChordChartData | null;
  /** picos de forma de onda pré-calculados por faixa guia/mix, para desenhar rápido */
  waveformPeaks: number[] | null;
  createdAt: number;
  updatedAt: number;
}

export interface SceneItem {
  songId: string;
  /** tom escolhido para esta música dentro desta cena (pode diferir do currentKey salvo) */
  key: string;
  bpm: number;
}

export interface Scene {
  id: string;
  name: string;
  items: SceneItem[];
}

export interface Library {
  songs: Song[];
  scenes: Scene[];
}

export type ClickSound = 'beep' | 'click' | 'rimshot' | 'cowbell';

export interface ClickSettings {
  countInBars: number;
  sound: ClickSound;
  accentFirstBeat: boolean;
  volumeDb: number;
  output: string;
  /** dobrar o click em cima da música quando ela já tem click próprio */
  doubleClick: 'off' | 'on';
}

export interface PadSettings {
  timbre: string | null;
  volumeDb: number;
  exitOnPlay: boolean;
  output: string;
  fadeInOutSec: number;
  keyChangeCrossfadeSec: number;
  loopCrossfadeSec: number;
}

export interface RemoteSettings {
  enabled: boolean;
  port: number;
  pin: string;
}

export interface MidiBinding {
  action: string;
  /** 'note' ou 'cc' */
  type: 'note' | 'cc';
  channel: number;
  number: number;
  /** para teclas por tipo de parte: qual tipo essa tecla ativa */
  partType?: PartType;
}

export interface AppSettings {
  outputDeviceId: string | null;
  outputChannelCount: number;
  sampleRate: number;
  bufferSize: number;
  click: ClickSettings;
  pad: PadSettings;
  remote: RemoteSettings;
  midiBindings: MidiBinding[];
  guideVoice: {
    track: string | null;
    outOfOrderBehavior: 'keep' | 'mute' | 'mute-and-announce';
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  outputDeviceId: null,
  outputChannelCount: 2,
  sampleRate: 48000,
  bufferSize: 480,
  click: {
    countInBars: 1,
    sound: 'beep',
    accentFirstBeat: true,
    volumeDb: 0,
    output: 'auto',
    doubleClick: 'off',
  },
  pad: {
    timbre: null,
    volumeDb: 0,
    exitOnPlay: true,
    output: 'stereo-1-2',
    fadeInOutSec: 1.5,
    keyChangeCrossfadeSec: 1.5,
    loopCrossfadeSec: 6,
  },
  remote: {
    enabled: true,
    port: 8787,
    pin: '0000',
  },
  midiBindings: [],
  guideVoice: {
    track: null,
    outOfOrderBehavior: 'keep',
  },
};

export const PART_COLORS: Record<PartType, string> = {
  Intro: '#2f6f6a',
  Verso: '#2d5fa0',
  'Pré-refrão': '#6b4fa0',
  Refrão: '#a0304f',
  Instrumental: '#2f8f5a',
  Ponte: '#7c4fe0',
  Solo: '#c07a1f',
  Tag: '#45708f',
  Interlúdio: '#4f6b7c',
  Final: '#5c5c66',
  Outra: '#555566',
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function semitoneDistance(fromKey: string, toKey: string): number {
  const from = NOTE_NAMES.indexOf(normalizeNote(fromKey));
  const to = NOTE_NAMES.indexOf(normalizeNote(toKey));
  if (from < 0 || to < 0) return 0;
  let diff = to - from;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  return diff;
}

export function normalizeNote(note: string): string {
  const map: Record<string, string> = {
    Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
    'C♭': 'B', 'E♯': 'F', 'B♯': 'C', 'F♭': 'E',
  };
  return map[note] ?? note;
}

// Mensagens trocadas entre a UI principal, o processo main e a página remota do celular.
export interface RemoteStateSnapshot {
  songTitle: string | null;
  isPlaying: boolean;
  currentKey: string;
  currentBpm: number;
  parts: { id: string; name: string; index: number }[];
  activePartId: string | null;
  positionSec: number;
  durationSec: number;
}

export type RemoteCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'jumpToPart'; partId: string }
  | { type: 'setKey'; key: string }
  | { type: 'setBpm'; bpm: number }
  | { type: 'toggleLoop' };
