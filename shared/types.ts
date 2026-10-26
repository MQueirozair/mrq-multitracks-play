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
  /**
   * "Cue de palco": endereço OSC opcional disparado automaticamente assim
   * que esta parte fica ativa (ex.: "/light/scene/3"), pra acionar uma cena
   * de iluminação/vídeo em outro software (QLab, Resolume, mesa de luz) no
   * exato momento em que a banda entra nessa parte — ver settings.osc e
   * HelpPanel.tsx seção "osc". null/undefined = nenhum cue configurado.
   */
  cueOscAddress?: string | null;
  /** Cue equivalente via MIDI Program Change (canal 0-15, programa 0-127), pra
   *  consoles/softwares que só aceitam MIDI em vez de OSC. */
  cueMidiProgram?: { channel: number; program: number } | null;
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

/**
 * Ponte OSC (Open Sound Control) por UDP com software externo de produção —
 * luz, vídeo, ProPresenter-like, consoles — ver src-tauri/src/osc.rs e
 * HelpPanel.tsx seção "osc". Tecnologia nova adotada nesta versão (pedido
 * explícito do usuário de "2 novas tecnologias").
 */
export interface OscSettings {
  enabled: boolean;
  /** porta UDP local onde o MRQ escuta mensagens OSC recebidas (de um TouchOSC, QLab etc.) */
  listenPort: number;
  /** host/IP de destino pra onde o MRQ manda as mensagens OSC de transporte/cue */
  sendHost: string;
  /** porta UDP de destino */
  sendPort: number;
}

export type OscArgValue =
  | { type: 'i'; value: number }
  | { type: 'f'; value: number }
  | { type: 's'; value: string };

export interface OscMessage {
  address: string;
  args: OscArgValue[];
}

/**
 * "MRQ Sync": sincronismo de tempo/transporte entre instâncias do MRQ na
 * mesma rede local (ex.: o notebook do baterista seguindo o tom/BPM/estado de
 * reprodução de quem está liderando a música) — um protocolo próprio, leve,
 * via UDP broadcast (ver src-tauri/src/sync.rs). NÃO é o protocolo Ableton
 * Link (que exigiria uma biblioteca externa não disponível pra Rust neste
 * projeto) — é uma alternativa mais simples pensada só pra múltiplas
 * instâncias do MRQ, não para interoperar com outros DAWs/apps.
 */
export interface SyncSettings {
  enabled: boolean;
  /** 'leader' manda o estado pra rede; 'follower' escuta e segue quem for 'leader' */
  role: 'leader' | 'follower';
  /** porta UDP usada pelo broadcast local (mesma em todas as instâncias da rede) */
  port: number;
}

/** Forma (camelCase) do estado trocado pelo MRQ Sync entre o front-end e o Rust — ver src-tauri/src/sync.rs. */
export interface SyncBroadcastState {
  isPlaying: boolean;
  bpm: number;
  key: string;
  songTitle: string;
}

export interface MidiBinding {
  action: string;
  /** 'note' ou 'cc' */
  type: 'note' | 'cc';
  channel: number;
  number: number;
  /** para teclas por tipo de parte: qual tipo essa tecla ativa */
  partType?: PartType;
  /** para ações do Rack que têm uma camada específica (ex.: "rack:layer:volume"): índice da camada (0-5) */
  layerIndex?: number;
}

/**
 * Ações do Rack que podem ser mapeadas num CC/botão do teclado MIDI físico
 * (ver RackMidiCcPanel). "fader" = usa o VALOR contínuo (0-127) do CC pra
 * controlar algo direto (volume, reverb, transposição); "trigger" = qualquer
 * mensagem (nota ligada ou CC, não importa o valor) alterna um liga/desliga.
 */
export const RACK_CC_FADER_ACTIONS = [
  'rack:layer:volume',
  'rack:master:volume',
  'rack:master:reverb',
  'rack:master:transpose',
] as const;
export const RACK_CC_TRIGGER_ACTIONS = [
  'rack:layer:mute',
  'rack:layer:solo',
  'rack:layer:octaver',
  'rack:master:panic',
] as const;
export type RackCcAction = (typeof RACK_CC_FADER_ACTIONS)[number] | (typeof RACK_CC_TRIGGER_ACTIONS)[number];

/**
 * Rack de instrumentos "ao vivo" (6 camadas simultâneas tocadas por um teclado
 * MIDI físico). Cada camada carrega um arquivo de instrumento real do usuário:
 *  - 'sf2'     → SoundFont real (.sf2/.sf3), tocado via motor FluidSynth (WASM).
 *  - 'dx7'     → Banco/voz real de FM Yamaha DX7 (.syx), via núcleo MSFA (o mesmo
 *                motor que o Google abriu publicamente e que o Dexed usa).
 *  - 'sampler' → Amostra de áudio do próprio usuário (.wav/.aiff/.flac/.ogg/.mp3),
 *                usada como "piano por amostra" simples (um único sample
 *                reamostrado por tecla) — opção independente de 'npno', não um
 *                substituto dele.
 *  - 'npno'    → Biblioteca de piano Nord real (.npno), decodificada de fato
 *                (múltiplas camadas de velocidade reais por tecla) via o crate
 *                Rust "nord-format" compilado pra WebAssembly — ver NpnoLayerVoice.ts.
 *                Projeto comunitário/não-oficial (a Clavia nunca documentou o
 *                formato publicamente), mas decodifica o layout real do arquivo.
 *  - 'nki'     → Instrumento Kontakt real (.nki), decodificado de fato (samples +
 *                mapeamento de zonas/grupos por nota e velocidade) via parser
 *                próprio — ver NkiLayerVoice.ts. Só cobre Kontakt 1 a 4 (formato
 *                documentado publicamente, sem criptografia); bibliotecas
 *                comerciais modernas (Kontakt 4.2.2+) usam um formato
 *                criptografado pela própria Native Instruments e dão erro claro
 *                em vez de tentar (e falhar) decodificar.
 */
export type RackLayerFormat = 'sf2' | 'dx7' | 'sampler' | 'npno' | 'nsmp' | 'nki' | 'sfz';


/** Ajuste rápido de timbre por camada (filtro + curva de velocidade, não altera o arquivo original). */
export type RackCharacter = 'original' | 'soft' | 'bright' | 'warm';

export interface RackPresetOption {
  /** para sf2: "banco:programa"; para dx7: índice da voz no banco; para sampler: não usado */
  value: string;
  label: string;
}

/** Tipo de saturação/drive aplicado por camada no painel "Editar". */
export type RackDriveType = 'warm' | 'hard' | 'tube';

/** Modo do oitavador da camada (ver RackLayer.octaverMode): em qual direção dobrar cada nota tocada nesta camada. */
export type RackOctaverMode = 'down' | 'up' | 'both';

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
  /** imagem customizada do card (data URL), escolhida no painel "Editar"; null = ícone padrão */
  photoDataUrl: string | null;
  /** panorama estéreo da camada, -1 (esquerda) .. 1 (direita), 0 = centro */
  pan: number;

  // --- painel "Editar" (ver InstrumentRack.tsx: <LayerEditPanel>) ---
  /** nota MIDI mais grave que esta camada responde (0-127) */
  noteRangeStart: number;
  /** nota MIDI mais aguda que esta camada responde (0-127) */
  noteRangeEnd: number;
  /** transposição em oitavas aplicada só a esta camada (-3..3) */
  octave: number;
  /** canal MIDI de entrada que esta camada escuta; 0 = todos os canais */
  midiChannel: number;

  /** envelope de amplitude da camada (fade ao ligar/desligar notas, somado ao envelope nativo do motor) */
  envelopeEnabled: boolean;
  attackMs: number;
  releaseMs: number;

  /** filtro passa-baixa estático da camada (independente do "Caráter") */
  filterEnabled: boolean;
  cutoffHz: number;

  /** equalizador de 3 bandas da camada */
  eqEnabled: boolean;
  eqBassDb: number;
  eqMidDb: number;
  eqTrebleDb: number;
  eqMidFreqHz: number;

  /** saturação/drive da camada */
  driveEnabled: boolean;
  driveType: RackDriveType;
  driveDb: number;
  /** mistura seco/processado, 0..1 */
  driveMix: number;

  /**
   * Reverb por camada: controla quanto desta camada entra no barramento de
   * reverb compartilhado do Rack (cuja "quantidade" geral de retorno é o
   * knob MASTER > Reverb). Padrão enabled=true/send=1 preserva o
   * comportamento de versões anteriores, quando toda camada ia 100% pro
   * reverb sem controle individual.
   */
  reverbEnabled: boolean;
  /** 0..1 */
  reverbSend: number;

  /** Compressor por camada — nivela a dinâmica de um timbre que varia muito de volume. */
  compressorEnabled: boolean;
  /** dB, -60..0 */
  compressorThresholdDb: number;
  /** 1..20 (1 = sem compressão) */
  compressorRatio: number;
  /** ganho de compensação pós-compressor, em dB, 0..24 */
  compressorMakeupDb: number;

  /** Delay (eco) por camada. */
  delayEnabled: boolean;
  /** ms, 0..1500 */
  delayTimeMs: number;
  /** 0..0.9 */
  delayFeedback: number;
  /** mistura seco/processado, 0..1 */
  delayMix: number;

  /**
   * Oitavador POR CAMADA: dobra toda nota tocada nesta camada (só nesta,
   * não nas outras) numa oitava abaixo/acima/ambas, pra engrossar o timbre
   * dela sem precisar duplicar o instrumento em outra camada. Era um
   * controle único do MASTER (afetava todas as camadas juntas) — por
   * pedido do usuário, virou independente por camada, pra poder ligar numa
   * e deixar outra de fora.
   */
  octaverEnabled: boolean;
  octaverMode: RackOctaverMode;
  /** 0..1 — volume relativo (fração da velocity original) das notas extras geradas pelo oitavador */
  octaverMix: number;
}

/** Curva de resposta de velocidade aplicada à entrada MIDI física inteira do rack. */
export type RackVelocityCurve = 'linear' | 'soft' | 'hard';

/**
 * Uma "cena" é uma foto completa da configuração das 4 camadas (instrumento,
 * efeitos, roteamento de nota) + volume geral/reverb, salva com um nome pra
 * recall rápido — pensado pra trocar repertório/música ao vivo sem reconfigurar
 * tudo na mão. Pode ser recuperada manualmente (ver InstrumentRack.tsx) ou por
 * Program Change do teclado físico (a cena de índice N na lista = PC número N).
 */
export interface RackScene {
  id: string;
  name: string;
  layers: RackLayer[];
  masterVolume: number;
  reverb: number;
}

export interface InstrumentRackState {
  layers: RackLayer[];
  /** 0..1 */
  masterVolume: number;
  /** 0..1 */
  reverb: number;
  /** id do dispositivo MIDI físico escolhido para tocar o rack, ou null = todos conectados */
  midiInputId: string | null;
  /** curva de resposta de velocidade do teclado físico conectado */
  velocityCurve: RackVelocityCurve;
  /** transposição global (semitons) aplicada à entrada MIDI física antes de chegar nas camadas */
  transpose: number;
  /** se true, segura as notas liberadas enquanto o pedal de sustain (CC64) estiver pressionado */
  sustainEnabled: boolean;
  /**
   * Tamanho do buffer de áudio (em amostras) pedido ao sistema de som pro
   * AudioContext do Rack — ver painel MIDI (RackMidiPanel) e RackEngine.setBufferFrames.
   * 0 = Automático (pede o menor buffer que o navegador conseguir, o mesmo
   * comportamento de sempre). Valores > 0 pedem um alvo explícito: menor =
   * responde mais rápido ao teclado físico, porém mais exigente do
   * processador (risco de "crackles"); maior = mais estável, porém mais atraso.
   */
  bufferFrames: number;
  /** cenas salvas (configuração completa das 4 camadas) — ver RackScene */
  scenes: RackScene[];
  /** mostra (ou não) a pílula de acorde detectado ao lado de "Áudio OK", quando a aba Rack está aberta */
  chordDisplayEnabled: boolean;
}

export interface AppSettings {
  outputDeviceId: string | null;
  outputChannelCount: number;
  sampleRate: number;
  bufferSize: number;
  click: ClickSettings;
  pad: PadSettings;
  remote: RemoteSettings;
  osc: OscSettings;
  sync: SyncSettings;
  midiBindings: MidiBinding[];
  guideVoice: {
    track: string | null;
    outOfOrderBehavior: 'keep' | 'mute' | 'mute-and-announce';
  };
  /** tema de alto contraste / fontes maiores, pensado para telas de palco com pouca luz */
  stageMode: boolean;
  rack: InstrumentRackState;
  /**
   * Reconhecimento de partes por voz (beta, desligado por padrão): ouve a
   * locução da faixa guia anunciando cada parte (ex.: "Estrofe", "Refrão")
   * via um modelo de voz local (whisper.cpp) baixado sob demanda — ver
   * src/audio/SpeechPartRecognition.ts, src-tauri/src/speech.rs e a seção
   * "reconhecimento de partes" do HelpPanel. Desligado por padrão porque o
   * modelo é um download grande (~148MB) opcional, só baixado quando o
   * usuário liga essa opção de propósito.
   */
  speech: {
    enabled: boolean;
  };
}

export function emptyRackLayer(id: string, color: string): RackLayer {
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
    photoDataUrl: null,
    pan: 0,
    noteRangeStart: 0,
    noteRangeEnd: 127,
    octave: 0,
    midiChannel: 0,
    envelopeEnabled: false,
    attackMs: 5,
    releaseMs: 350,
    filterEnabled: false,
    cutoffHz: 20000,
    eqEnabled: false,
    eqBassDb: 0,
    eqMidDb: 0,
    eqTrebleDb: 0,
    eqMidFreqHz: 1000,
    driveEnabled: false,
    driveType: 'warm',
    driveDb: 0,
    driveMix: 1,
    // enabled=true/send=1 preserva o comportamento de antes deste recurso existir
    // (toda camada ia 100% pro reverb compartilhado, sem controle individual).
    reverbEnabled: true,
    reverbSend: 1,
    compressorEnabled: false,
    compressorThresholdDb: -24,
    compressorRatio: 4,
    compressorMakeupDb: 0,
    delayEnabled: false,
    delayTimeMs: 300,
    delayFeedback: 0.3,
    delayMix: 0.35,
    octaverEnabled: false,
    octaverMode: 'down',
    octaverMix: 0.7,
  };
}

/** Quantidade de camadas do Rack de instrumentos — única fonte da verdade, usada tanto pro estado inicial quanto pelo motor de áudio (RackEngine). */
export const RACK_LAYER_COUNT = 6;

export const DEFAULT_RACK_STATE: InstrumentRackState = {
  layers: [
    emptyRackLayer('camada-1', '#d6455d'),
    emptyRackLayer('camada-2', '#2fb8c6'),
    emptyRackLayer('camada-3', '#8a5fd6'),
    emptyRackLayer('camada-4', '#d6b23c'),
    emptyRackLayer('camada-5', '#4fae5e'),
    emptyRackLayer('camada-6', '#d6782e'),
  ],
  masterVolume: 0.8,
  reverb: 0,
  midiInputId: null,
  velocityCurve: 'linear',
  transpose: 0,
  sustainEnabled: true,
  bufferFrames: 0,
  scenes: [],
  chordDisplayEnabled: true,
};

/**
 * Migra o array de camadas do Rack salvo de uma sessão anterior pra sempre
 * ter: (1) RACK_LAYER_COUNT entradas (ex.: sessões de antes do Rack passar a
 * ter 6 camadas, era 4) — completando o restante com camadas vazias, nunca
 * descartando configuração do usuário; e (2) todos os campos conhecidos de
 * RackLayer presentes em cada camada, mesclando com os padrões de
 * emptyRackLayer() por cima dos dados salvos — necessário pra sessões salvas
 * antes de um novo efeito existir (ex.: reverb/compressor/delay por camada)
 * não ficarem com `undefined` nesses campos, o que quebraria o grafo de
 * áudio (valores inválidos em GainNode.gain etc.).
 */
export function migrateRackLayers(layers: RackLayer[]): RackLayer[] {
  const trimmed = layers.slice(0, RACK_LAYER_COUNT);
  const merged = trimmed.map((layer, i) => ({
    ...emptyRackLayer(layer?.id ?? `camada-${i + 1}`, layer?.color ?? '#888888'),
    ...layer,
  }));
  for (let i = merged.length; i < RACK_LAYER_COUNT; i++) {
    merged.push(DEFAULT_RACK_STATE.layers[i] ?? emptyRackLayer(`camada-${i + 1}`, '#888888'));
  }
  return merged;
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
  osc: {
    enabled: false,
    listenPort: 9000,
    sendHost: '127.0.0.1',
    sendPort: 9001,
  },
  sync: {
    enabled: false,
    role: 'leader',
    port: 8788,
  },
  midiBindings: [],
  guideVoice: {
    track: null,
    outOfOrderBehavior: 'keep',
  },
  stageMode: false,
  rack: DEFAULT_RACK_STATE,
  speech: {
    enabled: false,
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
  /** acorde detectado agora no Rack (ver ChordIndicator.tsx), pra broadcast ao vivo pros celulares da banda; null = nenhuma nota soando/Rack não usado */
  currentChord: string | null;
}

export type RemoteCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'stop' }
  | { type: 'jumpToPart'; partId: string }
  | { type: 'setKey'; key: string }
  | { type: 'setBpm'; bpm: number }
  | { type: 'toggleLoop' };
