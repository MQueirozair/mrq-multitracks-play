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
  /**
   * Quantas vezes repetir esta parte antes de seguir (1 = toca uma vez).
   * 'infinite' = "repetir até eu desativar": fica em loop ao vivo até o
   * operador desarmar o botão de loop, só então o roteiro segue adiante.
   */
  repeat: number | 'infinite';
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
  /** picos de forma de onda desta faixa específica (0..1), para a tela "Faixas". */
  peaks?: number[] | null;
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
  /** marcada como favorita pelo usuário, para achar rápido na biblioteca */
  favorite?: boolean;
  /** anotações rápidas do operador sobre esta música (lembretes, combinados com a banda etc.) */
  notes?: string;
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

/**
 * Rack de instrumentos "ao vivo" (4 camadas simultâneas tocadas por um teclado
 * MIDI físico). Cada camada carrega um arquivo de instrumento real do usuário:
 *  - 'sf2'     → SoundFont real (.sf2/.sf3), tocado via motor FluidSynth (WASM).
 *  - 'dx7'     → Banco/voz real de FM Yamaha DX7 (.syx), via núcleo MSFA (o mesmo
 *                motor que o Google abriu publicamente e que o Dexed usa).
 *  - 'sampler' → Amostra de áudio do próprio usuário (.wav/.aiff/.flac/.ogg),
 *                usada como "piano por amostra". Existe porque o formato .npno
 *                da Nord Piano Library é proprietário e criptografado — a própria
 *                Clavia nunca o documentou publicamente — então não é seguro
 *                decodificá-lo aqui; ver RackLayer.rejectedNpno.
 */
export type RackLayerFormat = 'sf2' | 'dx7' | 'sampler';

/** Ajuste rápido de timbre por camada (filtro + curva de velocidade, não altera o arquivo original). */
export type RackCharacter = 'original' | 'soft' | 'bright' | 'warm';

export interface RackPresetOption {
  /** para sf2: "banco:programa"; para dx7: índice da voz no banco; para sampler: não usado */
  value: string;
  label: string;
}

export interface RackLayer {
  id: string;
  /** cor de destaque do cabeçalho da camada (combina com o print de referência) */
  color: string;
  format: RackLayerFormat | null;
  filePath: string | null;
  fileName: string | null;
  /** nome do instrumento/timbre carregado, mostrado em destaque no card */
  displayName: string | null;
  presets: RackPresetOption[];
  selectedPreset: string | null;
  character: RackCharacter;
  /** 0..1 */
  volume: number;
  muted: boolean;
  solo: boolean;
  /** nota MIDI em que a amostra foi gravada (só usado no formato 'sampler') */
  rootNote: number;
}

export interface InstrumentRackState {
  layers: RackLayer[];
  /** 0..1 */
  masterVolume: number;
  /** 0..1 */
  reverb: number;
  /** id do dispositivo MIDI físico escolhido para tocar o rack, ou null = todos conectados */
  midiInputId: string | null;
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
  /** tema de alto contraste / fontes maiores, pensado para telas de palco com pouca luz */
  stageMode: boolean;
  rack: InstrumentRackState;
}

function emptyRackLayer(id: string, color: string): RackLayer {
  return {
    id,
    color,
    format: null,
    filePath: null,
    fileName: null,
    displayName: null,
    presets: [],
    selectedPreset: null,
    character: 'original',
    volume: 0.7,
    muted: false,
    solo: false,
    rootNote: 60,
  };
}

export const DEFAULT_RACK_STATE: InstrumentRackState = {
  layers: [
    emptyRackLayer('camada-1', '#d6455d'),
    emptyRackLayer('camada-2', '#2fb8c6'),
    emptyRackLayer('camada-3', '#8a5fd6'),
    emptyRackLayer('camada-4', '#d6b23c'),
  ],
  masterVolume: 0.8,
  reverb: 0,
  midiInputId: null,
};

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
  stageMode: false,
  rack: DEFAULT_RACK_STATE,
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
