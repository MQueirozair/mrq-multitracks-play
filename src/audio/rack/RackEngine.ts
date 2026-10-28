import type {
  RackArpDivision,
  RackArpPattern,
  RackCharacter,
  RackDelayDivision,
  RackDelayFilterType,
  RackDriveType,
  RackEqBandSettings,
  RackLayerFormat,
  RackOctaverMode,
  RackPlayMode,
  RackPresetOption,
  RackReverbRoom,
} from '../../../shared/types';
import { RACK_ARP_DIVISION_BEATS, RACK_DELAY_DIVISION_BEATS, RACK_EQ_BAND_ROLES, RACK_LAYER_COUNT, defaultRackEqBands } from '../../../shared/types';
import { Sf2LayerVoice } from './Sf2LayerVoice';
import { Dx7LayerVoice } from './Dx7LayerVoice';
import { SamplerLayerVoice } from './SamplerLayerVoice';
import { NpnoLayerVoice } from './NpnoLayerVoice';
import { NsmpLayerVoice } from './NsmpLayerVoice';
import { NkiLayerVoice } from './NkiLayerVoice';
import { SfzLayerVoice } from './SfzLayerVoice';
import { MrqiLayerVoice } from './MrqiLayerVoice';
import { exportNkiToMrqi } from './mrqiExport';

type AnyLayerVoice =
  | Sf2LayerVoice
  | Dx7LayerVoice
  | SamplerLayerVoice
  | NpnoLayerVoice
  | NsmpLayerVoice
  | NkiLayerVoice
  | SfzLayerVoice
  | MrqiLayerVoice;


/**
 * Vozes que suportam pitch bend em tempo real (afeta as notas já soando, não
 * só as novas) — todas, exceto a camada DX7: o núcleo FM "MSFA" usado por ela
 * (@audio/synth-dx7) não expõe uma forma de alterar a afinação de uma `Voice`
 * já em andamento sem reconstruí-la (o que soaria como um "salto" audível),
 * então por ora a roda de pitch bend física não afeta camadas DX7 —
 * limitação documentada, não um bug silencioso.
 */
interface PitchBendableVoice {
  setPitchBend(semitones: number): void;
}
function isPitchBendable(voice: AnyLayerVoice): voice is AnyLayerVoice & PitchBendableVoice {
  return typeof (voice as Partial<PitchBendableVoice>).setPitchBend === 'function';
}

/** Faixa de pitch bend aplicada (±2 semitons, o padrão do General MIDI). */
export const PITCH_BEND_RANGE_SEMITONES = 2;

/** Nível (0..1) em que o envelope de amplitude "assenta" depois do estágio de Decay, enquanto a nota continua segurada (não existe knob de Sustain na UI — ver LayerEnvelopeSettings.decayMs). */
const ENVELOPE_SUSTAIN_LEVEL = 0.72;

const SF2_EXT = new Set(['sf2', 'sf3']);
const DX7_EXT = new Set(['syx']);
const SAMPLE_EXT = new Set(['wav', 'wave', 'aiff', 'aif', 'flac', 'ogg', 'mp3']);
const NPNO_EXT = new Set(['npno']);
const NSMP_EXT = new Set(['nsmp', 'nsmp3', 'nsmp4']);
const NKI_EXT = new Set(['nki']);
const SFZ_EXT = new Set(['sfz']);
const MRQI_EXT = new Set(['mrqi']);

export function detectRackFormat(fileName: string): RackLayerFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (NPNO_EXT.has(ext)) return 'npno';
  if (NSMP_EXT.has(ext)) return 'nsmp';
  if (NKI_EXT.has(ext)) return 'nki';
  if (SFZ_EXT.has(ext)) return 'sfz';
  if (MRQI_EXT.has(ext)) return 'mrqi';
  if (SF2_EXT.has(ext)) return 'sf2';
  if (DX7_EXT.has(ext)) return 'dx7';
  if (SAMPLE_EXT.has(ext)) return 'sampler';
  return null;
}

export interface LayerEnvelopeSettings {
  enabled: boolean;
  attackMs: number;
  /** tempo (ms) pra cair do pico do ataque até o nível interno de sustentação, enquanto a nota continua segurada. */
  decayMs: number;
  releaseMs: number;
}

/** Modo de voz + legato/glide da camada — ver RackLayer.playMode/legato/glideMs. */
export interface LayerVoiceModeSettings {
  playMode: RackPlayMode;
  legato: boolean;
  /** ms */
  glideMs: number;
}

export interface LayerFilterSettings {
  enabled: boolean;
  cutoffHz: number;
}

export interface LayerEqSettings {
  enabled: boolean;
  bassDb: number;
  midDb: number;
  trebleDb: number;
  midFreqHz: number;
}

export interface LayerDriveSettings {
  enabled: boolean;
  type: RackDriveType;
  driveDb: number;
  mix: number;
}

export interface LayerReverbSettings {
  enabled: boolean;
  /** 0..1 */
  send: number;
}

export interface LayerCompressorSettings {
  enabled: boolean;
  /** 0..1 — controle único que ajusta threshold/ratio/makeup juntos (ver computeCompressorCurve). */
  amount: number;
  attackMs: number;
  releaseMs: number;
  /** "FAST": ignora attackMs/releaseMs e usa um ataque/soltura fixos bem rápidos (modo limitador). */
  fast: boolean;
}

export interface LayerDelaySettings {
  enabled: boolean;
  timeMs: number;
  feedback: number;
  mix: number;
  sync: boolean;
  division: RackDelayDivision;
  pingPong: boolean;
  /** "ANALOG": satura a cauda + adiciona wow/flutter (oscilação de afinação de fita). */
  analog: boolean;
  /** Filtro na cauda do eco — ver RackDelayFilterType. */
  filterType: RackDelayFilterType;
}

export interface LayerChorusSettings {
  enabled: boolean;
  /** 0..1 */
  mix: number;
}

export interface LayerTremoloSettings {
  enabled: boolean;
  rateHz: number;
  /** 0..1 */
  depth: number;
  /** 0..1 */
  stereo: number;
}

export interface LayerOctaverSettings {
  enabled: boolean;
  mode: RackOctaverMode;
  /** 0..1 */
  mix: number;
}

export interface LayerGateSettings {
  enabled: boolean;
  thresholdDb: number;
  attackMs: number;
  releaseMs: number;
}

export interface LayerPhaserSettings {
  enabled: boolean;
  rateHz: number;
  /** 0..1 */
  depth: number;
  /** 0..1 */
  mix: number;
}

export interface LayerFlangerSettings {
  enabled: boolean;
  rateHz: number;
  /** 0..1 */
  depth: number;
  /** 0..0.95 */
  feedback: number;
  /** 0..1 */
  mix: number;
}

export interface LayerBitcrusherSettings {
  enabled: boolean;
  bits: number;
  rateHz: number;
  /** 0..1 */
  mix: number;
}

export interface LayerShimmerSettings {
  enabled: boolean;
  /** 0..1 */
  mix: number;
  /** 0..0.92 */
  feedback: number;
  toneHz: number;
}

export interface LayerArpSettings {
  enabled: boolean;
  pattern: RackArpPattern;
  sync: boolean;
  /** Hz, usado só quando sync=false */
  rateHz: number;
  division: RackArpDivision;
  /** 1..4 */
  octaves: number;
  /** 0..1 */
  gate: number;
  /** 0..0.75 */
  swing: number;
  latch: boolean;
}

interface LayerRuntime {
  format: RackLayerFormat | null;
  voice: AnyLayerVoice | null;
  muted: boolean;
  solo: boolean;
  volume: number;

  // roteamento de nota desta camada
  noteRangeStart: number;
  noteRangeEnd: number;
  octave: number;
  midiChannel: number; // 0 = todos
  /** nota original (antes de oitava) -> nota de fato disparada na voz, pra soltar a mesma depois */
  activeNotes: Map<number, number>;
  /** nota original -> notas extras disparadas pelo oitavador DESTA camada (ver RackEngine.noteOn/noteOff), pra soltar junto */
  octaverNotes: Map<number, number[]>;
  octaver: LayerOctaverSettings;

  // modo de voz (poly/mono + legato/glide) — ver noteOn/noteOff/glideLayerTo.
  voiceMode: LayerVoiceModeSettings;
  /** pilha de notas seguradas (modo mono): a última é a que está soando agora. */
  monoHeldStack: { note: number; velocity: number }[];
  /** nota "real" (já com oitava) usada no noteOn/noteOff da voz mono atual — null = nenhuma voz mono soando. */
  monoVoiceRealNote: number | null;
  /** nota (com oitava) que a voz mono DEVERIA soar agora (pode diferir de monoVoiceRealNote durante/depois de um glide). */
  monoVoiceTargetNote: number | null;
  /** timer do glide em andamento, pra poder cancelar se uma nota nova chegar no meio do deslizamento. */
  glideTimer: ReturnType<typeof setInterval> | null;

  // --- arpejador por camada (ver setArp/arpNoteOn/arpNoteOff/tickArpStep) ---
  arp: LayerArpSettings;
  /** notas físicas seguradas agora (nota original -> velocity), na ordem em que foram pressionadas. */
  arpHeld: Map<number, number>;
  /** cópia "travada" do conjunto de notas, usada quando arp.latch=true — sobrevive ao soltar as teclas. */
  arpLatched: Map<number, number>;
  /** true logo depois que todas as teclas físicas foram soltas com latch ligado — a próxima tecla pressionada começa um acorde novo (substitui arpLatched) em vez de somar a ele. */
  arpAwaitingNewChord: boolean;
  /** sequência de notas (sem oitava de camada) já expandida por oitavas/ordenada pelo padrão atual — recalculada em rebuildArpSequence. */
  arpSequence: number[];
  /** índice do último passo disparado dentro de arpSequence (padrões sequenciais); -1 = ainda não começou. */
  arpStepIndex: number;
  /** notas (já com oitava da camada aplicada) soando agora por causa do arpejador, pra soltar no próximo passo/ao parar. */
  arpActiveNotes: number[];
  /** ctx.currentTime do próximo passo agendado; null = arpejador parado nesta camada. */
  arpNextStepTime: number | null;
  /** ctx.currentTime em que a nota do passo atual deve ser solta (gate < 100%); null = deixa soar até o próximo passo. */
  arpOffTime: number | null;
  /** alterna a cada passo, usado só pelo swing (passos "pares" ficam mais longos, "ímpares" mais curtos, ou vice-versa). */
  arpStepParity: boolean;
  /** timer periódico (ver createLayerRuntime) que checa se é hora do próximo passo do arpejador desta camada. */
  arpTimer: ReturnType<typeof setInterval> | null;

  // cadeia de áudio (ver connectChain): voice -> envelopeGain -> cutoffFilter ->
  // eqBandNodes[0..5] (6 bandas paramétricas) -> drivePreGain -> (dry + wet via shaper) -> driveSum
  // -> volumeGain -> panNode -> characterFilter -> masterGain/reverbBus
  envelopeGain: GainNode;
  panNode: StereoPannerNode;
  /** semitons de pitch bend atualmente aplicados (vindos da roda do teclado físico) */
  pitchBendSemitones: number;
  /** tap passivo pro medidor de nível (VU) de cada camada no card — ver getLayerLevel() */
  meterAnalyser: AnalyserNode;
  meterBuf: Float32Array;
  envelope: LayerEnvelopeSettings;
  cutoffFilter: BiquadFilterNode;
  filter: LayerFilterSettings;
  /** as 6 bandas fixas do equalizador paramétrico, na ordem RACK_EQ_BAND_ROLES — ver setEqBands(). */
  eqBandNodes: BiquadFilterNode[];
  eqEnabled: boolean;
  eqBands: RackEqBandSettings[];
  /** nó de análise de espectro PÓS-EQ, usado pelo gráfico interativo (RackEqGraph) — não afeta o áudio. */
  eqAnalyser: AnalyserNode;
  drivePreGain: GainNode;
  driveShaper: WaveShaperNode;
  driveDry: GainNode;
  driveWet: GainNode;
  drive: LayerDriveSettings;
  volumeGain: GainNode;
  characterFilter: BiquadFilterNode;

  // cadeia pós-caráter (ver connectChain): characterFilter -> compressor ->
  // makeupGain -> tremolo -> chorus -> { delayDry -> delayOutMix, delay(+feedback/ping-pong) -> delayWetGain -> delayOutMix }
  // -> { masterGain, reverbSendGain -> reverbBus (compartilhado) }
  compressorNode: DynamicsCompressorNode;
  compressorMakeupGain: GainNode;
  compressor: LayerCompressorSettings;

  // tremolo (LFO de amplitude, + um pouco de auto-pan quando "stereo" > 0) — ver setTremolo()
  tremoloGain: GainNode;
  tremoloLfo: OscillatorNode;
  tremoloDepthGain: GainNode;
  /** soma um pouco do mesmo LFO no pan ESTÁTICO da camada (panNode.pan), pra dar a sensação de "stereo" do tremolo. */
  tremoloPanDepth: GainNode;
  tremolo: LayerTremoloSettings;

  // chorus (linha de delay curta modulada por LFO, misturada com o sinal seco) — ver setChorus()
  chorusDelay: DelayNode;
  chorusLfo: OscillatorNode;
  chorusLfoDepth: GainNode;
  chorusDry: GainNode;
  chorusWet: GainNode;
  chorusOutMix: GainNode;
  chorus: LayerChorusSettings;

  // delay (eco), com rota alternativa de "ping-pong" estéreo — ver setDelay()
  delayNode: DelayNode;
  delayNodeR: DelayNode;
  delayPannerL: StereoPannerNode;
  delayPannerR: StereoPannerNode;
  /** realimentação L->L (modo normal) ou L->R (modo ping-pong). */
  delayFeedbackGain: GainNode;
  /** realimentação R->L, usada só em modo ping-pong (ver reconnectDelayRouting). */
  delayFeedbackGainR: GainNode;
  /** Filtro "FILTER" da cauda (Off/Low/High/Band) — fica logo após cada delayNode/delayNodeR. */
  delayToneFilter: BiquadFilterNode;
  delayToneFilterR: BiquadFilterNode;
  /** Saturação "ANALOG" (curve=null quando desligado = transparente). */
  delayAnalogShaper: WaveShaperNode;
  delayAnalogShaperR: WaveShaperNode;
  /** Wow/flutter "ANALOG" — osciladores somam uma oscilação sutil de afinação em cima do delayTime (ver setDelay). */
  delayWowLfo: OscillatorNode;
  delayWowDepth: GainNode;
  delayFlutterLfo: OscillatorNode;
  delayFlutterDepth: GainNode;
  delayDryGain: GainNode;
  delayWetGain: GainNode;
  delayOutMix: GainNode;
  delay: LayerDelaySettings;
  reverbSendGain: GainNode;
  reverb: LayerReverbSettings;

  // gate (porta de ruído) — ver setGate(). Mede nível via gateAnalyser e
  // "pilota" gateGainNode (0 fechado / 1 aberto) por um timer periódico.
  gateAnalyser: AnalyserNode;
  gateAnalyserBuf: Float32Array;
  gateGainNode: GainNode;
  gateTimer: ReturnType<typeof setInterval> | null;
  gateOpenAmount: number;
  gate: LayerGateSettings;

  // phaser (passa-tudo em cascata modulados por LFO) — ver setPhaser().
  phaserStages: BiquadFilterNode[];
  phaserLfo: OscillatorNode;
  phaserLfoDepth: GainNode[];
  phaserDry: GainNode;
  phaserWet: GainNode;
  phaserOutMix: GainNode;
  phaser: LayerPhaserSettings;

  // flanger (delay bem curto modulado + realimentação) — ver setFlanger().
  flangerDelay: DelayNode;
  flangerLfo: OscillatorNode;
  flangerLfoDepth: GainNode;
  flangerFeedbackGain: GainNode;
  flangerDry: GainNode;
  flangerWet: GainNode;
  flangerOutMix: GainNode;
  flanger: LayerFlangerSettings;

  // bitcrusher/lo-fi (redução de bits + taxa de amostragem) — ver setBitcrusher().
  bitcrusherShaper: WaveShaperNode;
  bitcrusherProcessor: ScriptProcessorNode;
  bitcrusherDry: GainNode;
  bitcrusherWet: GainNode;
  bitcrusherOutMix: GainNode;
  bitcrusher: LayerBitcrusherSettings;
  /** estado do "sample and hold" da redução de taxa — ver setBitcrusher/bitcrusherProcessor.onaudioprocess. */
  bitcrusherHoldState: { phase: number; held: Float32Array };

  // shimmer (deslocamento de oitava + realimentação etérea) — ver setShimmer().
  shimmerInput: GainNode;
  shimmerDelayA: DelayNode;
  shimmerDelayB: DelayNode;
  shimmerLfoA: OscillatorNode;
  shimmerLfoB: OscillatorNode;
  shimmerEnvA: GainNode;
  shimmerEnvB: GainNode;
  shimmerSum: GainNode;
  shimmerTone: BiquadFilterNode;
  shimmerFeedbackGain: GainNode;
  shimmerWet: GainNode;
  shimmer: LayerShimmerSettings;
}

function applyCharacter(filter: BiquadFilterNode, character: RackCharacter) {
  switch (character) {
    case 'soft':
      filter.type = 'lowpass';
      filter.frequency.value = 3200;
      filter.Q.value = 0.5;
      break;
    case 'bright':
      filter.type = 'highshelf';
      filter.frequency.value = 2500;
      filter.gain.value = 6;
      break;
    case 'warm':
      filter.type = 'lowshelf';
      filter.frequency.value = 400;
      filter.gain.value = 4;
      break;
    case 'original':
    default:
      filter.type = 'allpass';
      filter.frequency.value = 1000;
      filter.Q.value = 0.0001;
      break;
  }
}

/**
 * Reverb algorítmica (ruído filtrado pelo tempo, não uma biblioteca de IRs
 * gravadas) — cada "sala" varia a duração e a curva de queda pra dar um
 * timbre de retorno diferente, igual ao dropdown "Room" do print de
 * referência: Room (mais seca/perto), Hall (cauda longa e suave), Plate
 * (densa e brilhante) e Spring (com uma leve ondulação periódica, lembrando
 * o "boing" característico de springs de amplificador de guitarra).
 */
/**
 * Converte o parâmetro de Tom (0 = Escuro, 1 = Claro) na frequência de corte
 * (Hz) do passa-baixa colocado na cauda do reverb compartilhado — escala
 * exponencial (como a maioria dos knobs de frequência de verdade) entre uma
 * "sala abafada" (~900 Hz) e uma "sala bem aberta" (~16 kHz, quase sem corte).
 */
function reverbToneToHz(tone: number): number {
  const t = Math.max(0, Math.min(1, tone));
  const minHz = 900;
  const maxHz = 16000;
  return minHz * Math.pow(maxHz / minHz, t);
}

function createReverbImpulse(ctx: AudioContext, room: RackReverbRoom, decaySec: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const base = Math.max(0.2, Math.min(8, decaySec));
  let durationSec = base;
  let decayExponent = 2.4;
  let flutterHz = 0;
  switch (room) {
    case 'room':
      durationSec = base;
      decayExponent = 3.2;
      break;
    case 'hall':
      durationSec = base * 1.6;
      decayExponent = 1.6;
      break;
    case 'plate':
      durationSec = base * 1.15;
      decayExponent = 2.0;
      break;
    case 'spring':
      durationSec = base * 0.9;
      decayExponent = 2.6;
      flutterHz = 7;
      break;
    case 'stage':
      // palco de médio/grande porte: mais aberto que "room", mais contido que "hall".
      durationSec = base * 1.3;
      decayExponent = 2.0;
      break;
    case 'booth':
      // cabine vocal/isolada: bem curta e seca, decaimento rápido.
      durationSec = base * 0.5;
      decayExponent = 4.2;
      break;
  }
  const length = Math.max(1, Math.floor(rate * durationSec));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      let env = Math.pow(1 - i / length, decayExponent);
      if (flutterHz > 0) env *= 1 + 0.15 * Math.sin((2 * Math.PI * flutterHz * i) / rate);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return impulse;
}

/** Curva de distorção pro WaveShaperNode de "Drive" por camada. */
function createDriveCurve(type: RackDriveType, amount: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = Math.max(0.0001, amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    switch (type) {
      case 'hard': {
        // clipping mais duro, achata rápido perto dos extremos
        const y = Math.max(-1, Math.min(1, x * (1 + k * 6)));
        curve[i] = Math.sign(y) * (1 - Math.exp(-Math.abs(y) * 4));
        break;
      }
      case 'tube': {
        // curva assimétrica (mais saturação no semiciclo positivo), lembra saturação a válvula
        const drive = 1 + k * 5;
        const pos = Math.tanh(x * drive * 1.3);
        const neg = Math.tanh(x * drive * 0.8);
        curve[i] = x >= 0 ? pos : neg;
        break;
      }
      case 'warm':
      default: {
        // soft clipping suave e simétrico
        curve[i] = Math.tanh(x * (1 + k * 4));
        break;
      }
    }
  }
  return curve;
}

/**
 * Curva pro WaveShaperNode que transforma uma onda dente-de-serra (-1..1) num
 * envelope triangular (0..1) que sobe suave no começo do "grão" e desce
 * suave perto do fim — usado pelo cross-fade do pitch shifter do Shimmer
 * (ver createLayerRuntime), pra evitar o clique do salto abrupto da serra.
 */
function createTriangleEnvelopeCurve(): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1); // 0..1 (mapeado a partir de -1..1 do dente-de-serra)
    curve[i] = 1 - Math.abs(x * 2 - 1);
  }
  return curve;
}

/** Curva de quantização de bits pro WaveShaperNode do Bitcrusher/Lo-Fi por camada — "achata" o sinal em degraus de 2^bits níveis. */
function createBitcrusherCurve(bits: number): Float32Array {
  const n = 4096;
  const curve = new Float32Array(n);
  const levels = Math.pow(2, Math.max(1, Math.min(16, bits)));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

/**
 * Curva de saturação suave ("tape") pro WaveShaperNode do botão "ANALOG" do
 * Delay por camada — um soft-clip tipo tanh com um leve viés assimétrico
 * (mais comum em saturação de fita real do que um clip simétrico), só o
 * suficiente pra colorir as repetições sem distorcer agressivamente.
 */
function createTapeSaturationCurve(): Float32Array {
  const n = 1024;
  const curve = new Float32Array(n);
  const drive = 1.8;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const biased = x + 0.04 * x * x; // leve assimetria par (achata um pouco mais um lado da onda)
    curve[i] = Math.tanh(biased * drive) / Math.tanh(drive);
  }
  return curve;
}

/**
 * Motor do Rack de instrumentos ao vivo: até 4 camadas tocando simultaneamente
 * (SoundFont real via FluidSynth/WASM, banco DX7 real via núcleo MSFA, ou
 * amostra de áudio do usuário), cada uma com sua própria cadeia de efeitos
 * (faixa de notas, oitava, canal MIDI, envelope, filtro, equalizador de 3
 * bandas e drive/saturação — ver painel "Editar" em InstrumentRack.tsx),
 * misturadas num barramento comum com reverb algorítmica compartilhada e
 * volume geral — tudo disparado por mensagens MIDI note-on/note-off vindas de
 * um teclado físico conectado.
 */
/**
 * Opções de tamanho de buffer (em amostras) oferecidas no painel MIDI — ver
 * RackMidiPanel. 0 é especial: "Automático", que pede ao navegador o menor
 * buffer viável (latencyHint: 'interactive', o mesmo pedido que o rack
 * sempre fez) — é o valor padrão, pra ninguém regredir a latência que já
 * tínhamos antes deste controle existir. As opções > 0 pedem um alvo
 * numérico de amostras, pra quem precisa trocar resposta por estabilidade.
 */
export const RACK_BUFFER_OPTIONS = [0, 128, 256, 512, 1024, 2048] as const;

export class RackEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbBus: GainNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  /** passa-baixa na cauda do reverb compartilhado — dá o controle de Tom (Escuro/Claro), ver setReverbTone(). */
  private reverbToneFilter: BiquadFilterNode | null = null;
  private layers: LayerRuntime[] = [];
  private reverbAmount = 0;
  private reverbRoom: RackReverbRoom = 'room';
  private reverbDecaySec = 1.8;
  /** 0 (Escuro/abafado) .. 1 (Claro/aberto) — ver setReverbTone(). */
  private reverbTone = 0.6;
  private masterVolume = 0.8;
  /** BPM de referência do rack, usado pelos delays sincronizados por camada (ver setDelay/RackLayer.delaySync). */
  private bpm = 120;
  /** tamanho de buffer "desejado", em amostras (0 = automático) — ver setBufferFrames() */
  private bufferFrames = 0;

  /** Cria o AudioContext e o barramento na primeira vez que for preciso (gesto do usuário já ocorreu ao abrir a aba). */
  ensureStarted() {
    if (this.ctx) return;
    this.buildGraph();
  }

  /**
   * (Re)constrói o AudioContext e todo o grafo de áudio compartilhado do rack
   * (master, reverb, as 4 camadas) do zero, usando this.bufferFrames como
   * alvo de latência. Chamado na primeira vez (ensureStarted) e de novo
   * sempre que o usuário troca o tamanho do buffer em tempo real
   * (setBufferFrames) — nesse segundo caso o AudioContext anterior já foi
   * fechado e as vozes carregadas precisam ser recarregadas pelo chamador
   * (ver reloadAllRackLayers em rackReload.ts), pois o estado de cada
   * instrumento (SoundFont/DX7/.npno/amostra carregados) vive na própria voz,
   * não neste motor.
   */
  private buildGraph() {
    // bufferFrames === 0 ("Automático") pede o mesmo 'interactive' de sempre
    // (o menor buffer que o navegador conseguir). Um valor numérico pede um
    // alvo explícito de latência em segundos — o navegador escolhe o menor
    // buffer de hardware disponível >= esse alvo (nunca menor que o mínimo
    // que o driver de som permitir). Isso é o que dá controle real de
    // "aumentar/diminuir" o buffer ao usuário, pra trocar resposta por
    // estabilidade (ou vice-versa) conforme a máquina dele.
    const latencyHint: AudioContextLatencyCategory | number =
      this.bufferFrames > 0 ? this.bufferFrames / (this.ctx?.sampleRate ?? 48000) : 'interactive';
    const ctx = new AudioContext({ latencyHint });
    this.ctx = ctx;
    const masterGain = ctx.createGain();
    masterGain.gain.value = this.masterVolume;
    masterGain.connect(ctx.destination);
    this.masterGain = masterGain;

    const convolver = ctx.createConvolver();
    convolver.buffer = createReverbImpulse(ctx, this.reverbRoom, this.reverbDecaySec);
    const reverbBus = ctx.createGain();
    reverbBus.gain.value = 1;
    const reverbToneFilter = ctx.createBiquadFilter();
    reverbToneFilter.type = 'lowpass';
    reverbToneFilter.Q.value = 0.6;
    reverbToneFilter.frequency.value = reverbToneToHz(this.reverbTone);
    const reverbWetGain = ctx.createGain();
    reverbWetGain.gain.value = this.reverbAmount;
    reverbBus.connect(convolver);
    convolver.connect(reverbToneFilter);
    reverbToneFilter.connect(reverbWetGain);
    reverbWetGain.connect(masterGain);
    this.convolver = convolver;
    this.reverbBus = reverbBus;
    this.reverbToneFilter = reverbToneFilter;
    this.reverbWetGain = reverbWetGain;

    this.layers = [];
    for (let i = 0; i < RACK_LAYER_COUNT; i++) {
      this.layers.push(this.createLayerRuntime(ctx, masterGain, reverbBus));
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /**
   * Troca o tamanho do buffer de áudio (latência) do rack em tempo real.
   * Se o motor ainda não tinha sido iniciado, só guarda o valor pro próximo
   * ensureStarted() usar. Se já estava rodando, fecha o AudioContext atual e
   * recria tudo do zero — os instrumentos carregados em cada camada precisam
   * ser recarregados pelo chamador logo em seguida (eles não sobrevivem à
   * troca de AudioContext; ver reloadAllRackLayers em rackReload.ts).
   */
  async setBufferFrames(frames: number): Promise<void> {
    this.bufferFrames = frames;
    if (!this.ctx) return;
    const oldCtx = this.ctx;
    for (const layer of this.layers) {
      layer.voice?.dispose();
    }
    this.ctx = null;
    this.masterGain = null;
    this.reverbBus = null;
    this.reverbWetGain = null;
    this.convolver = null;
    this.reverbToneFilter = null;
    this.layers = [];
    try {
      await oldCtx.close();
    } catch {
      /* ignora erro ao fechar contexto antigo */
    }
    this.buildGraph();
  }

  getBufferFrames(): number {
    return this.bufferFrames;
  }

  /** Taxa de amostragem real do AudioContext atual (null se o motor ainda não iniciou — ver ensureStarted). */
  getSampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  /** true assim que o AudioContext foi criado e está rodando (não suspenso) — usado só pra exibir status na UI. */
  isRunning(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Latência real medida pelo navegador no AudioContext atual (null se o motor ainda não iniciou). */
  getLatencyInfoMs(): { baseLatencyMs: number; outputLatencyMs: number } | null {
    if (!this.ctx) return null;
    const anyCtx = this.ctx as AudioContext & { outputLatency?: number };
    return {
      baseLatencyMs: (this.ctx.baseLatency ?? 0) * 1000,
      outputLatencyMs: (anyCtx.outputLatency ?? 0) * 1000,
    };
  }

  private createLayerRuntime(ctx: AudioContext, masterGain: GainNode, reverbBus: GainNode): LayerRuntime {
    const envelopeGain = ctx.createGain();
    envelopeGain.gain.value = 1;

    const cutoffFilter = ctx.createBiquadFilter();
    cutoffFilter.type = 'lowpass';
    cutoffFilter.frequency.value = 20000;
    cutoffFilter.Q.value = 0.707;

    // Equalizador paramétrico de 6 bandas fixas (ver RACK_EQ_BAND_ROLES e
    // setEqBands) — substitui o antigo EQ de 3 bandas. As duas primeiras
    // ("lowcut"/"highcut") nascem como passa-tudo (desligadas por padrão,
    // viram highpass/lowpass de verdade só quando a banda está ligada).
    const defaultBands = defaultRackEqBands();
    const eqBandNodes = RACK_EQ_BAND_ROLES.map((role, i) => {
      const node = ctx.createBiquadFilter();
      const band = defaultBands[i];
      node.frequency.value = band.freqHz;
      node.Q.value = band.q;
      node.gain.value = 0; // banda liga/desliga é controlada por setEqBands(), não aqui
      switch (role) {
        case 'lowcut':
          node.type = 'allpass';
          break;
        case 'lowshelf':
          node.type = 'lowshelf';
          break;
        case 'bell1':
        case 'bell2':
          node.type = 'peaking';
          break;
        case 'highshelf':
          node.type = 'highshelf';
          break;
        case 'highcut':
          node.type = 'allpass';
          break;
      }
      return node;
    });
    const eqAnalyser = ctx.createAnalyser();
    eqAnalyser.fftSize = 2048;
    eqAnalyser.smoothingTimeConstant = 0.75;

    // Gate (porta de ruído) — gateAnalyser mede o nível de entrada; um timer
    // periódico (ver setGate/startGateTimer) pilota gateGainNode (1 aberto, 0
    // fechado) com ataque/liberação suaves via setTargetAtTime.
    const gateAnalyser = ctx.createAnalyser();
    gateAnalyser.fftSize = 512;
    gateAnalyser.smoothingTimeConstant = 0;
    const gateAnalyserBuf = new Float32Array(gateAnalyser.fftSize);
    const gateGainNode = ctx.createGain();
    gateGainNode.gain.value = 1;
    const gateTimer = setInterval(() => {
      const layer = this.layers.find((l) => l.gateAnalyser === gateAnalyser);
      if (!layer || !this.ctx) return;
      if (!layer.gate.enabled) {
        layer.gateGainNode.gain.setTargetAtTime(1, this.ctx.currentTime, 0.015);
        layer.gateOpenAmount = 1;
        return;
      }
      layer.gateAnalyser.getFloatTimeDomainData(layer.gateAnalyserBuf as Float32Array<ArrayBuffer>);
      let peak = 0;
      for (let i = 0; i < layer.gateAnalyserBuf.length; i++) {
        const abs = Math.abs(layer.gateAnalyserBuf[i]);
        if (abs > peak) peak = abs;
      }
      const db = peak > 0.00001 ? 20 * Math.log10(peak) : -100;
      const target = db >= layer.gate.thresholdDb ? 1 : 0;
      const timeConstant = target === 1 ? Math.max(0.001, layer.gate.attackMs / 1000) : Math.max(0.005, layer.gate.releaseMs / 1000);
      layer.gateGainNode.gain.setTargetAtTime(target, this.ctx.currentTime, timeConstant);
      layer.gateOpenAmount = target;
    }, 10);

    // Arpejador — checa a cada ~15ms se é hora do próximo passo (ver
    // tickArpStep); identifica "sua" camada pelo mesmo truque do gateTimer
    // acima (busca por um nó único criado aqui, já que LayerRuntime ainda
    // não existe neste ponto da construção do grafo).
    const arpTimer = setInterval(() => {
      const layer = this.layers.find((l) => l.gateAnalyser === gateAnalyser);
      if (!layer) return;
      this.tickArpStep(layer);
    }, 15);

    const drivePreGain = ctx.createGain();
    drivePreGain.gain.value = 1;
    const driveShaper = ctx.createWaveShaper();
    driveShaper.curve = createDriveCurve('warm', 0) as Float32Array<ArrayBuffer>;
    driveShaper.oversample = '2x';
    const driveDry = ctx.createGain();
    driveDry.gain.value = 1;
    const driveWet = ctx.createGain();
    driveWet.gain.value = 0;

    const volumeGain = ctx.createGain();
    volumeGain.gain.value = 0.7;
    const panNode = ctx.createStereoPanner();
    panNode.pan.value = 0;
    const characterFilter = ctx.createBiquadFilter();
    applyCharacter(characterFilter, 'original');

    // Compressor por camada — desligado por padrão é "transparente" (ratio
    // 1:1 não comprime nada), em vez de bypassar o nó, pra não precisar
    // reconectar o grafo toda vez que o usuário liga/desliga.
    const compressorNode = ctx.createDynamicsCompressor();
    compressorNode.threshold.value = 0;
    compressorNode.knee.value = 18;
    compressorNode.ratio.value = 1;
    compressorNode.attack.value = 0.008;
    compressorNode.release.value = 0.14;
    const compressorMakeupGain = ctx.createGain();
    compressorMakeupGain.gain.value = 1;

    // Tremolo por camada (LFO de amplitude + um pouco de auto-pan) — ver setTremolo().
    const tremoloLfo = ctx.createOscillator();
    tremoloLfo.type = 'sine';
    tremoloLfo.frequency.value = 4;
    const tremoloDepthGain = ctx.createGain();
    tremoloDepthGain.gain.value = 0;
    const tremoloGain = ctx.createGain();
    tremoloGain.gain.value = 1;
    tremoloLfo.connect(tremoloDepthGain);
    tremoloDepthGain.connect(tremoloGain.gain);
    const tremoloPanDepth = ctx.createGain();
    tremoloPanDepth.gain.value = 0;
    tremoloLfo.connect(tremoloPanDepth);
    tremoloPanDepth.connect(panNode.pan);
    tremoloLfo.start();

    // Phaser por camada (4 filtros passa-tudo em cascata, cada um modulado
    // pelo mesmo LFO) — ver setPhaser().
    const phaserStageCount = 4;
    const phaserStages = Array.from({ length: phaserStageCount }, () => {
      const node = ctx.createBiquadFilter();
      node.type = 'allpass';
      node.frequency.value = 800;
      node.Q.value = 0.6;
      return node;
    });
    const phaserLfo = ctx.createOscillator();
    phaserLfo.type = 'sine';
    phaserLfo.frequency.value = 0.5;
    const phaserLfoDepth = phaserStages.map((_, i) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      phaserLfo.connect(g);
      // leve defasagem entre estágios (via peso diferente), dá mais corpo ao giro
      g.gain.value = 0;
      return g;
    });
    phaserLfo.start();
    const phaserDry = ctx.createGain();
    phaserDry.gain.value = 1;
    const phaserWet = ctx.createGain();
    phaserWet.gain.value = 0;
    const phaserOutMix = ctx.createGain();
    phaserOutMix.gain.value = 1;

    // Flanger por camada (delay bem curto modulado + realimentação) — ver setFlanger().
    const flangerDelay = ctx.createDelay(0.03);
    flangerDelay.delayTime.value = 0.004;
    const flangerLfo = ctx.createOscillator();
    flangerLfo.type = 'sine';
    flangerLfo.frequency.value = 0.25;
    const flangerLfoDepth = ctx.createGain();
    flangerLfoDepth.gain.value = 0;
    flangerLfo.connect(flangerLfoDepth);
    flangerLfoDepth.connect(flangerDelay.delayTime);
    flangerLfo.start();
    const flangerFeedbackGain = ctx.createGain();
    flangerFeedbackGain.gain.value = 0;
    const flangerDry = ctx.createGain();
    flangerDry.gain.value = 1;
    const flangerWet = ctx.createGain();
    flangerWet.gain.value = 0;
    const flangerOutMix = ctx.createGain();
    flangerOutMix.gain.value = 1;

    // Chorus por camada (linha de delay curta modulada por um LFO lento, somada ao seco) — ver setChorus().
    const chorusDelay = ctx.createDelay(0.1);
    chorusDelay.delayTime.value = 0.02;
    const chorusLfo = ctx.createOscillator();
    chorusLfo.type = 'sine';
    chorusLfo.frequency.value = 0.9;
    const chorusLfoDepth = ctx.createGain();
    chorusLfoDepth.gain.value = 0.006;
    chorusLfo.connect(chorusLfoDepth);
    chorusLfoDepth.connect(chorusDelay.delayTime);
    chorusLfo.start();
    const chorusDry = ctx.createGain();
    chorusDry.gain.value = 1;
    const chorusWet = ctx.createGain();
    chorusWet.gain.value = 0;
    const chorusOutMix = ctx.createGain();
    chorusOutMix.gain.value = 1;

    // Bitcrusher/Lo-Fi por camada — WaveShaper quantiza os bits; o
    // ScriptProcessorNode faz "sample and hold" pra reduzir a taxa de
    // amostragem efetiva (ver setBitcrusher/onaudioprocess).
    const bitcrusherShaper = ctx.createWaveShaper();
    bitcrusherShaper.curve = createBitcrusherCurve(16) as Float32Array<ArrayBuffer>;
    const bitcrusherProcessor = ctx.createScriptProcessor(1024, 2, 2);
    const bitcrusherHoldState = { phase: 0, held: new Float32Array(2) };
    bitcrusherProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
      const layer = this.layers.find((l) => l.bitcrusherProcessor === bitcrusherProcessor);
      const step = layer ? Math.max(1, Math.round(ctx.sampleRate / Math.max(500, layer.bitcrusher.rateHz))) : 1;
      const state = bitcrusherHoldState;
      for (let ch = 0; ch < e.outputBuffer.numberOfChannels; ch++) {
        const input = e.inputBuffer.getChannelData(ch);
        const output = e.outputBuffer.getChannelData(ch);
        for (let i = 0; i < input.length; i++) {
          if (state.phase % step === 0) state.held[ch] = input[i];
          output[i] = state.held[ch];
          if (ch === e.outputBuffer.numberOfChannels - 1) state.phase++;
        }
      }
    };
    const bitcrusherDry = ctx.createGain();
    bitcrusherDry.gain.value = 1;
    const bitcrusherWet = ctx.createGain();
    bitcrusherWet.gain.value = 0;
    const bitcrusherOutMix = ctx.createGain();
    bitcrusherOutMix.gain.value = 1;

    // Delay (eco) por camada — via barramento seco/molhado em paralelo, pra
    // poder ter mix 0 (totalmente limpo) sem desconectar nada. delayNodeR +
    // os dois panners só entram em uso quando "Ping-pong" está ligado (ver
    // setDelay/reconnectDelayRouting) — autofeedback simples (mono) por padrão.
    const delayNode = ctx.createDelay(4);
    delayNode.delayTime.value = 0.3;
    const delayNodeR = ctx.createDelay(4);
    delayNodeR.delayTime.value = 0.3;
    // "FILTER" (Off/Low/High/Band) — ver setDelay(); 'off' usa type='allpass'
    // (só muda fase, não amplitude) pra ficar acusticamente transparente sem
    // precisar desconectar o nó.
    const delayToneFilter = ctx.createBiquadFilter();
    delayToneFilter.type = 'allpass';
    delayToneFilter.frequency.value = 1200;
    const delayToneFilterR = ctx.createBiquadFilter();
    delayToneFilterR.type = 'allpass';
    delayToneFilterR.frequency.value = 1200;
    // "ANALOG" (satura a cauda) — curve=null é transparente (identidade) até
    // setDelay() ligar; ver createTapeSaturationCurve().
    const delayAnalogShaper = ctx.createWaveShaper();
    const delayAnalogShaperR = ctx.createWaveShaper();
    // "ANALOG" wow (lento, ~0.4Hz) + flutter (rápido, ~6Hz) somados direto no
    // delayTime dos dois canais — mesma técnica usada no Flanger/Chorus desta
    // classe (osc -> gain de profundidade -> AudioParam), profundidade parte
    // em 0 (desligado) e só sobe quando analog=true (ver setDelay).
    const delayWowLfo = ctx.createOscillator();
    delayWowLfo.type = 'sine';
    delayWowLfo.frequency.value = 0.4;
    const delayWowDepth = ctx.createGain();
    delayWowDepth.gain.value = 0;
    const delayFlutterLfo = ctx.createOscillator();
    delayFlutterLfo.type = 'sine';
    delayFlutterLfo.frequency.value = 6;
    const delayFlutterDepth = ctx.createGain();
    delayFlutterDepth.gain.value = 0;
    delayWowLfo.connect(delayWowDepth);
    delayWowDepth.connect(delayNode.delayTime);
    delayWowDepth.connect(delayNodeR.delayTime);
    delayFlutterLfo.connect(delayFlutterDepth);
    delayFlutterDepth.connect(delayNode.delayTime);
    delayFlutterDepth.connect(delayNodeR.delayTime);
    delayWowLfo.start();
    delayFlutterLfo.start();
    const delayPannerL = ctx.createStereoPanner();
    delayPannerL.pan.value = -1;
    const delayPannerR = ctx.createStereoPanner();
    delayPannerR.pan.value = 1;
    const delayFeedbackGain = ctx.createGain();
    delayFeedbackGain.gain.value = 0;
    const delayFeedbackGainR = ctx.createGain();
    delayFeedbackGainR.gain.value = 0;
    const delayDryGain = ctx.createGain();
    delayDryGain.gain.value = 1;
    const delayWetGain = ctx.createGain();
    delayWetGain.gain.value = 0;
    const delayOutMix = ctx.createGain();
    delayOutMix.gain.value = 1;

    // Envio por camada pro barramento de reverb compartilhado do rack (ver
    // MASTER > Reverb, que controla o retorno geral) — padrão 1 (100%)
    // preserva o comportamento de antes deste controle existir.
    const reverbSendGain = ctx.createGain();
    reverbSendGain.gain.value = 1;

    // Shimmer por camada — rede própria de deslocamento de oitava (duas
    // linhas de delay com LFOs em dente-de-serra defasados 180°, técnica
    // clássica de "pitch shift por modulação de delay", sem precisar de
    // AudioWorklet) + realimentação com filtro de brilho, formando uma cauda
    // etérea que vai subindo de oitava a cada repetição — ver setShimmer().
    const shimmerInput = ctx.createGain();
    shimmerInput.gain.value = 1;
    const shimmerGrainSec = 0.08;
    const shimmerDelayA = ctx.createDelay(0.2);
    const shimmerDelayB = ctx.createDelay(0.2);
    const shimmerLfoA = ctx.createOscillator();
    shimmerLfoA.type = 'sawtooth';
    shimmerLfoA.frequency.value = 1 / shimmerGrainSec;
    const shimmerLfoB = ctx.createOscillator();
    shimmerLfoB.type = 'sawtooth';
    shimmerLfoB.frequency.value = 1 / shimmerGrainSec;
    const shimmerDelayScaleA = ctx.createGain();
    shimmerDelayScaleA.gain.value = -shimmerGrainSec / 2;
    const shimmerDelayOffsetA = ctx.createConstantSource();
    shimmerDelayOffsetA.offset.value = shimmerGrainSec / 2;
    const shimmerDelayScaleB = ctx.createGain();
    shimmerDelayScaleB.gain.value = -shimmerGrainSec / 2;
    const shimmerDelayOffsetB = ctx.createConstantSource();
    shimmerDelayOffsetB.offset.value = shimmerGrainSec / 2;
    shimmerLfoA.connect(shimmerDelayScaleA);
    shimmerDelayScaleA.connect(shimmerDelayA.delayTime);
    shimmerDelayOffsetA.connect(shimmerDelayA.delayTime);
    shimmerLfoB.connect(shimmerDelayScaleB);
    shimmerDelayScaleB.connect(shimmerDelayB.delayTime);
    shimmerDelayOffsetB.connect(shimmerDelayB.delayTime);
    // envelopes triangulares (derivados dos mesmos LFOs via retificação em
    // onda quadrada aproximada) que cruzam suavemente entre os dois "grãos",
    // evitando o clique do salto do dente-de-serra.
    const shimmerEnvShaperA = ctx.createWaveShaper();
    shimmerEnvShaperA.curve = createTriangleEnvelopeCurve() as Float32Array<ArrayBuffer>;
    const shimmerEnvShaperB = ctx.createWaveShaper();
    shimmerEnvShaperB.curve = createTriangleEnvelopeCurve() as Float32Array<ArrayBuffer>;
    const shimmerEnvA = ctx.createGain();
    shimmerEnvA.gain.value = 1;
    const shimmerEnvB = ctx.createGain();
    shimmerEnvB.gain.value = 1;
    shimmerLfoA.connect(shimmerEnvShaperA);
    shimmerEnvShaperA.connect(shimmerEnvA.gain);
    shimmerLfoB.connect(shimmerEnvShaperB);
    shimmerEnvShaperB.connect(shimmerEnvB.gain);
    // shimmerLfoB começa meio período depois de shimmerLfoA (defasagem de
    // 180°) — é isso que faz os dois "grãos" se alternarem suavemente em vez
    // de pularem juntos (ver createTriangleEnvelopeCurve acima).
    shimmerLfoA.start();
    shimmerLfoB.start(ctx.currentTime + shimmerGrainSec / 2);
    shimmerDelayOffsetA.start();
    shimmerDelayOffsetB.start();
    const shimmerSum = ctx.createGain();
    shimmerSum.gain.value = 1;
    const shimmerTone = ctx.createBiquadFilter();
    shimmerTone.type = 'lowpass';
    shimmerTone.frequency.value = 6000;
    shimmerTone.Q.value = 0.5;
    const shimmerFeedbackGain = ctx.createGain();
    shimmerFeedbackGain.gain.value = 0;
    const shimmerWet = ctx.createGain();
    shimmerWet.gain.value = 0;

    // voice.output (ligado depois, em loadLayer) -> envelopeGain -> cutoffFilter
    // -> eqBandNodes[0..5] (6 bandas) -> eqAnalyser (tap) -> gateGainNode -> drivePreGain -> { driveDry, driveShaper->driveWet }
    // -> volumeGain -> panNode -> characterFilter -> compressorNode -> compressorMakeupGain
    // -> phaser -> flanger -> tremoloGain -> { chorusDry, chorusDelay->chorusWet } -> chorusOutMix
    // -> bitcrusher -> { delayDryGain, delayNode(+feedback/ping-pong)->delayWetGain } -> delayOutMix
    // -> { masterGain, reverbSendGain -> reverbBus (compartilhado), shimmerInput -> ... -> shimmerWet -> masterGain }
    envelopeGain.connect(cutoffFilter);
    let eqChainTail: AudioNode = cutoffFilter;
    for (const band of eqBandNodes) {
      eqChainTail.connect(band);
      eqChainTail = band;
    }
    eqChainTail.connect(eqAnalyser);
    eqAnalyser.connect(gateAnalyser); // só análise (nível de entrada do gate), não carrega o grafo de áudio adiante
    eqChainTail.connect(gateGainNode);
    gateGainNode.connect(drivePreGain);
    drivePreGain.connect(driveDry);
    drivePreGain.connect(driveShaper);
    driveShaper.connect(driveWet);
    driveDry.connect(volumeGain);
    driveWet.connect(volumeGain);
    volumeGain.connect(panNode);
    panNode.connect(characterFilter);

    // Rede de segurança: a cadeia nova (compressor/moduladores/delay/envio de
    // reverb e shimmer por camada) é só "tempero" por cima do som básico — se
    // por QUALQUER motivo (plataforma/driver específico etc.) a montagem dela
    // falhar, a camada NUNCA pode ficar muda por causa disso. Em caso de erro,
    // a ligação cai pro grafo simples de antes desses efeitos existirem
    // (characterFilter direto pro master/reverb compartilhado), e os nós
    // novos ficam criados mas sem efeito algum (os setters continuam
    // funcionando sem travar).
    let postCharacterOutput: AudioNode = characterFilter;
    try {
      characterFilter.connect(compressorNode);
      compressorNode.connect(compressorMakeupGain);
      compressorMakeupGain.connect(phaserDry);
      compressorMakeupGain.connect(phaserStages[0]);
      for (let i = 0; i < phaserStages.length; i++) {
        phaserLfo.connect(phaserLfoDepth[i]);
        phaserLfoDepth[i].connect(phaserStages[i].frequency);
        if (i < phaserStages.length - 1) phaserStages[i].connect(phaserStages[i + 1]);
      }
      phaserStages[phaserStages.length - 1].connect(phaserWet);
      phaserDry.connect(phaserOutMix);
      phaserWet.connect(phaserOutMix);
      phaserOutMix.connect(flangerDry);
      phaserOutMix.connect(flangerDelay);
      flangerDelay.connect(flangerFeedbackGain);
      flangerFeedbackGain.connect(flangerDelay);
      flangerDelay.connect(flangerWet);
      flangerDry.connect(flangerOutMix);
      flangerWet.connect(flangerOutMix);
      flangerOutMix.connect(tremoloGain);
      tremoloGain.connect(chorusDry);
      tremoloGain.connect(chorusDelay);
      chorusDelay.connect(chorusWet);
      chorusDry.connect(chorusOutMix);
      chorusWet.connect(chorusOutMix);
      chorusOutMix.connect(bitcrusherDry);
      chorusOutMix.connect(bitcrusherProcessor);
      bitcrusherProcessor.connect(bitcrusherShaper);
      bitcrusherShaper.connect(bitcrusherWet);
      bitcrusherDry.connect(bitcrusherOutMix);
      bitcrusherWet.connect(bitcrusherOutMix);
      bitcrusherOutMix.connect(delayDryGain);
      bitcrusherOutMix.connect(delayNode);
      // delayNode(R) -> delayToneFilter(R) (FILTER) -> delayAnalogShaper(R) (ANALOG) são conexões fixas
      // (nunca desfeitas) — só o que vem DEPOIS do shaper é reconectado dinamicamente por
      // reconnectDelayRouting() ao alternar mono/ping-pong. Assim FILTER e ANALOG coloram tanto a
      // realimentação quanto o eco audível, como num eco de fita de verdade, nos dois modos de rota.
      delayNode.connect(delayToneFilter);
      delayToneFilter.connect(delayAnalogShaper);
      delayNodeR.connect(delayToneFilterR);
      delayToneFilterR.connect(delayAnalogShaperR);
      // auto-feedback (mono) — rota padrão; vira ping-pong via setDelay() chamando reconnectDelayRouting().
      delayAnalogShaper.connect(delayFeedbackGain);
      delayFeedbackGain.connect(delayNode);
      delayAnalogShaper.connect(delayWetGain);
      delayDryGain.connect(delayOutMix);
      delayWetGain.connect(delayOutMix);
      delayOutMix.connect(masterGain);
      delayOutMix.connect(reverbSendGain);
      reverbSendGain.connect(reverbBus);
      // Shimmer — tocado em paralelo (parte do mesmo ponto do envio de reverb),
      // autocontido (não usa o barramento de reverb compartilhado).
      delayOutMix.connect(shimmerInput);
      shimmerInput.connect(shimmerDelayA);
      shimmerInput.connect(shimmerDelayB);
      shimmerFeedbackGain.connect(shimmerDelayA);
      shimmerFeedbackGain.connect(shimmerDelayB);
      shimmerDelayA.connect(shimmerEnvA);
      shimmerDelayB.connect(shimmerEnvB);
      shimmerEnvA.connect(shimmerSum);
      shimmerEnvB.connect(shimmerSum);
      shimmerSum.connect(shimmerTone);
      shimmerTone.connect(shimmerFeedbackGain);
      shimmerTone.connect(shimmerWet);
      shimmerWet.connect(masterGain);
      postCharacterOutput = delayOutMix;
    } catch (err) {
      console.error('[rack] falha ao montar compressor/delay/reverb por camada — usando cadeia simples pra garantir som', err);
      try {
        characterFilter.disconnect();
      } catch {
        // ignora — já estava desconectado
      }
      characterFilter.connect(masterGain);
      characterFilter.connect(reverbBus);
      postCharacterOutput = characterFilter;
    }

    // Tap passivo (não precisa de .connect() pra frente) pro medidor de nível
    // de cada card — ver getLayerLevel().
    const meterAnalyser = ctx.createAnalyser();
    meterAnalyser.fftSize = 256;
    meterAnalyser.smoothingTimeConstant = 0.6;
    postCharacterOutput.connect(meterAnalyser);

    return {
      format: null,
      voice: null,
      muted: false,
      solo: false,
      volume: 0.7,
      noteRangeStart: 0,
      noteRangeEnd: 127,
      octave: 0,
      midiChannel: 0,
      activeNotes: new Map(),
      octaverNotes: new Map(),
      octaver: { enabled: false, mode: 'down', mix: 0.7 },
      voiceMode: { playMode: 'poly', legato: false, glideMs: 80 },
      monoHeldStack: [],
      monoVoiceRealNote: null,
      monoVoiceTargetNote: null,
      glideTimer: null,
      envelopeGain,
      envelope: { enabled: false, attackMs: 5, decayMs: 0, releaseMs: 350 },
      cutoffFilter,
      filter: { enabled: false, cutoffHz: 20000 },
      eqBandNodes,
      eqEnabled: false,
      eqBands: defaultRackEqBands(),
      eqAnalyser,
      drivePreGain,
      driveShaper,
      driveDry,
      driveWet,
      drive: { enabled: false, type: 'warm', driveDb: 0, mix: 1 },
      volumeGain,
      panNode,
      characterFilter,
      compressorNode,
      compressorMakeupGain,
      compressor: { enabled: false, amount: 0.4, attackMs: 8, releaseMs: 140, fast: false },
      tremoloGain,
      tremoloLfo,
      tremoloDepthGain,
      tremoloPanDepth,
      tremolo: { enabled: false, rateHz: 4, depth: 0.5, stereo: 0 },
      chorusDelay,
      chorusLfo,
      chorusLfoDepth,
      chorusDry,
      chorusWet,
      chorusOutMix,
      chorus: { enabled: false, mix: 0.25 },
      delayNode,
      delayNodeR,
      delayPannerL,
      delayPannerR,
      delayFeedbackGain,
      delayFeedbackGainR,
      delayToneFilter,
      delayToneFilterR,
      delayAnalogShaper,
      delayAnalogShaperR,
      delayWowLfo,
      delayWowDepth,
      delayFlutterLfo,
      delayFlutterDepth,
      delayDryGain,
      delayWetGain,
      delayOutMix,
      delay: { enabled: false, timeMs: 300, feedback: 0.3, mix: 0.35, sync: false, division: '1/8', pingPong: false, analog: false, filterType: 'off' },
      reverbSendGain,
      reverb: { enabled: true, send: 1 },
      pitchBendSemitones: 0,
      meterAnalyser,
      meterBuf: new Float32Array(meterAnalyser.fftSize),
      gateAnalyser,
      gateAnalyserBuf,
      gateGainNode,
      gateTimer,
      gateOpenAmount: 1,
      gate: { enabled: false, thresholdDb: -40, attackMs: 5, releaseMs: 120 },
      phaserStages,
      phaserLfo,
      phaserLfoDepth,
      phaserDry,
      phaserWet,
      phaserOutMix,
      phaser: { enabled: false, rateHz: 0.5, depth: 0.6, mix: 0.5 },
      flangerDelay,
      flangerLfo,
      flangerLfoDepth,
      flangerFeedbackGain,
      flangerDry,
      flangerWet,
      flangerOutMix,
      flanger: { enabled: false, rateHz: 0.25, depth: 0.5, feedback: 0.4, mix: 0.5 },
      bitcrusherShaper,
      bitcrusherProcessor,
      bitcrusherDry,
      bitcrusherWet,
      bitcrusherOutMix,
      bitcrusher: { enabled: false, bits: 12, rateHz: 44100, mix: 1 },
      bitcrusherHoldState,
      shimmerInput,
      shimmerDelayA,
      shimmerDelayB,
      shimmerLfoA,
      shimmerLfoB,
      shimmerEnvA,
      shimmerEnvB,
      shimmerSum,
      shimmerTone,
      shimmerFeedbackGain,
      shimmerWet,
      shimmer: { enabled: false, mix: 0.35, feedback: 0.55, toneHz: 6000 },
      arp: { enabled: false, pattern: 'up', sync: true, rateHz: 6, division: '1/16', octaves: 1, gate: 0.7, swing: 0, latch: false },
      arpHeld: new Map(),
      arpLatched: new Map(),
      arpAwaitingNewChord: false,
      arpSequence: [],
      arpStepIndex: -1,
      arpActiveNotes: [],
      arpNextStepTime: null,
      arpOffTime: null,
      arpStepParity: false,
      arpTimer,
    };
  }

  /** Nível de pico (0..1) do áudio que está de fato saindo da camada agora — ver medidor no card. */
  getLayerLevel(index: number): number {
    const layer = this.layers[index];
    if (!layer) return 0;
    layer.meterAnalyser.getFloatTimeDomainData(layer.meterBuf as Float32Array<ArrayBuffer>);
    let max = 0;
    for (let i = 0; i < layer.meterBuf.length; i++) {
      const abs = Math.abs(layer.meterBuf[i]);
      if (abs > max) max = abs;
    }
    return max;
  }

  async resume() {
    this.ensureStarted();
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
  }

  private get context(): AudioContext {
    this.ensureStarted();
    return this.ctx!;
  }

  async loadLayer(
    index: number,
    buffer: ArrayBuffer,
    format: RackLayerFormat,
    rootNote = 60,
    sourcePath?: string
  ): Promise<RackPresetOption[]> {
    const ctx = this.context;
    const layer = this.layers[index];
    layer.voice?.dispose();
    layer.activeNotes.clear();
    layer.octaverNotes.clear();
    let voice: AnyLayerVoice;
    let presets: RackPresetOption[] = [];
    if (format === 'sf2') {
      const v = new Sf2LayerVoice(ctx);
      presets = await v.load(buffer);
      voice = v;
    } else if (format === 'dx7') {
      const v = new Dx7LayerVoice(ctx);
      presets = await v.load(buffer);
      voice = v;
    } else if (format === 'npno') {
      const v = new NpnoLayerVoice(ctx);
      presets = await v.load(buffer);
      voice = v;
    } else if (format === 'nsmp') {
      const v = new NsmpLayerVoice(ctx);
      presets = await v.load(buffer);
      voice = v;
    } else if (format === 'nki') {
      const v = new NkiLayerVoice(ctx);
      presets = await v.load(buffer, sourcePath);
      voice = v;
    } else if (format === 'sfz') {
      const v = new SfzLayerVoice(ctx);
      presets = await v.load(buffer, sourcePath);
      voice = v;
    } else if (format === 'mrqi') {
      const v = new MrqiLayerVoice(ctx);
      presets = await v.load(buffer, sourcePath);
      voice = v;
    } else {
      const v = new SamplerLayerVoice(ctx);
      await v.load(buffer, rootNote);
      voice = v;
    }
    voice.output.connect(layer.envelopeGain);
    layer.voice = voice;
    layer.format = format;
    return presets;
  }

  clearLayer(index: number) {
    const layer = this.layers[index];
    layer.voice?.dispose();
    layer.voice = null;
    layer.format = null;
    layer.activeNotes.clear();
    layer.octaverNotes.clear();
  }

  selectPreset(index: number, value: string) {
    const voice = this.layers[index]?.voice;
    if (voice && 'selectPreset' in voice)
      (voice as Sf2LayerVoice | Dx7LayerVoice | NkiLayerVoice | MrqiLayerVoice).selectPreset(value);
  }

  /**
   * Exporta o instrumento Kontakt (.nki) atualmente carregado na camada
   * `index` para um pacote `.mrqi` (ver mrqiFormat.ts/mrqiExport.ts) —
   * devolve `null` se a camada não tiver um .nki carregado no momento.
   * Só reempacota o que já está decodificado em memória; não reabre nada
   * do disco.
   */
  exportLayerToMrqi(index: number): Uint8Array | null {
    const voice = this.layers[index]?.voice;
    if (!(voice instanceof NkiLayerVoice)) return null;
    return exportNkiToMrqi(voice);
  }

  setRootNote(index: number, note: number) {
    const voice = this.layers[index]?.voice;
    if (voice instanceof SamplerLayerVoice) voice.setRootNote(note);
  }

  setCharacter(index: number, character: RackCharacter) {
    const layer = this.layers[index];
    if (layer) applyCharacter(layer.characterFilter, character);
  }

  /** Panorama estéreo da camada, -1 (esquerda) .. 1 (direita). */
  setPan(index: number, pan: number) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.panNode.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), this.ctx.currentTime, 0.01);
  }

  // --- roteamento de nota por camada (painel "Editar") ---

  setNoteRange(index: number, start: number, end: number) {
    const layer = this.layers[index];
    if (!layer) return;
    layer.noteRangeStart = Math.min(start, end);
    layer.noteRangeEnd = Math.max(start, end);
  }

  setOctave(index: number, octave: number) {
    const layer = this.layers[index];
    if (layer) layer.octave = octave;
  }

  setMidiChannel(index: number, channel: number) {
    const layer = this.layers[index];
    if (layer) layer.midiChannel = channel;
  }

  // --- envelope ---

  setEnvelope(index: number, settings: LayerEnvelopeSettings) {
    const layer = this.layers[index];
    if (!layer) return;
    layer.envelope = settings;
    // Se o envelope foi desligado, garante que o ganho volte a 1 (transparente).
    if (!settings.enabled && this.ctx) {
      layer.envelopeGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
    }
  }

  // --- modo de voz (poly/mono) + legato/glide ---

  setVoiceMode(index: number, settings: LayerVoiceModeSettings) {
    const layer = this.layers[index];
    if (!layer) return;
    const wasMono = layer.voiceMode.playMode === 'mono';
    layer.voiceMode = settings;
    // Trocar de 'mono' pra 'poly' com notas seguradas: solta a pilha mono
    // (senão a nota ficaria presa, já que o modo poly não a controla mais).
    if (wasMono && settings.playMode === 'poly' && layer.monoHeldStack.length > 0) {
      if (layer.glideTimer !== null) {
        clearInterval(layer.glideTimer);
        layer.glideTimer = null;
      }
      if (layer.monoVoiceRealNote !== null) layer.voice?.noteOff(layer.monoVoiceRealNote);
      layer.monoHeldStack = [];
      layer.monoVoiceRealNote = null;
      layer.monoVoiceTargetNote = null;
    }
  }

  /**
   * Desliza a afinação da voz mono JÁ SOANDO (sem reatacar o envelope) até
   * soar como `targetNote` (MIDI, já com oitava aplicada) — usado pelo
   * legato em modo mono. A voz continua "sendo", pro motor, a nota
   * `layer.monoVoiceRealNote` (é essa que recebe o noteOff mais tarde); só a
   * altura percebida muda, via pitch bend contínuo do backend da voz.
   * Backends sem bend em tempo real (ver isPitchBendable) ou com faixa de
   * bend limitada (ex.: SF2, limitado a ±2 semitons) saltam pra nota nova
   * sem deslizar — limitação documentada, igual a outras já existentes
   * nesta engine (ver PitchBendableVoice).
   */
  private glideLayerTo(layer: LayerRuntime, targetNote: number) {
    if (layer.glideTimer !== null) {
      clearInterval(layer.glideTimer);
      layer.glideTimer = null;
    }
    const realNote = layer.monoVoiceRealNote;
    const voice = layer.voice;
    if (realNote === null || !voice || !isPitchBendable(voice)) {
      layer.monoVoiceTargetNote = targetNote;
      return;
    }
    const fromSemis = (layer.monoVoiceTargetNote ?? realNote) - realNote + layer.pitchBendSemitones;
    const toSemis = targetNote - realNote + layer.pitchBendSemitones;
    layer.monoVoiceTargetNote = targetNote;
    const glideMs = Math.max(0, layer.voiceMode.glideMs);
    if (glideMs < 8 || fromSemis === toSemis) {
      voice.setPitchBend(toSemis);
      return;
    }
    const steps = Math.max(1, Math.round(glideMs / 16));
    let step = 0;
    layer.glideTimer = setInterval(() => {
      step += 1;
      const t = Math.min(1, step / steps);
      voice.setPitchBend(fromSemis + (toSemis - fromSemis) * t);
      if (t >= 1 && layer.glideTimer !== null) {
        clearInterval(layer.glideTimer);
        layer.glideTimer = null;
      }
    }, 16);
  }

  // --- filtro (cutoff estático) ---

  setFilter(index: number, settings: LayerFilterSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.filter = settings;
    const freq = settings.enabled ? settings.cutoffHz : 20000;
    layer.cutoffFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.01);
  }

  // --- equalizador paramétrico de 6 bandas ---

  /** `enabled` liga/desliga o EQ inteiro (chave geral); `bands` são as 6 bandas, na ordem RACK_EQ_BAND_ROLES. */
  setEqBands(index: number, enabled: boolean, bands: RackEqBandSettings[]) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.eqEnabled = enabled;
    layer.eqBands = bands;
    const now = this.ctx.currentTime;
    RACK_EQ_BAND_ROLES.forEach((role, i) => {
      const node = layer.eqBandNodes[i];
      const band = bands[i];
      if (!node || !band) return;
      const bandOn = enabled && band.enabled;
      node.frequency.setTargetAtTime(Math.max(20, Math.min(20000, band.freqHz)), now, 0.01);
      node.Q.setTargetAtTime(Math.max(0.1, band.q), now, 0.01);
      switch (role) {
        case 'lowcut':
          node.type = bandOn ? 'highpass' : 'allpass';
          break;
        case 'highcut':
          node.type = bandOn ? 'lowpass' : 'allpass';
          break;
        case 'lowshelf':
        case 'bell1':
        case 'bell2':
        case 'highshelf':
          node.gain.setTargetAtTime(bandOn ? band.gainDb : 0, now, 0.01);
          break;
      }
    });
  }

  /**
   * Resposta em frequência (dB) combinada das 6 bandas, pra desenhar a curva
   * do gráfico interativo (RackEqGraph) — usa o BiquadFilterNode.getFrequencyResponse
   * nativo do Web Audio em cada banda (a mesma matemática que o navegador usa
   * de verdade pra processar o áudio, não uma aproximação visual).
   */
  getEqFrequencyResponseDb(index: number, freqsHz: Float32Array<ArrayBuffer>): Float32Array | null {
    const layer = this.layers[index];
    if (!layer) return null;
    const totalDb = new Float32Array(freqsHz.length);
    const magOut = new Float32Array(freqsHz.length);
    const phaseOut = new Float32Array(freqsHz.length);
    for (const node of layer.eqBandNodes) {
      node.getFrequencyResponse(freqsHz, magOut, phaseOut);
      for (let i = 0; i < totalDb.length; i++) {
        totalDb[i] += 20 * Math.log10(Math.max(1e-6, magOut[i]));
      }
    }
    return totalDb;
  }

  /** Nível de espectro (dB, FFT) logo depois do EQ desta camada — usado pelo overlay "Spectrum: Post" do gráfico. */
  getEqSpectrumDb(index: number): Float32Array | null {
    const layer = this.layers[index];
    if (!layer) return null;
    const buf = new Float32Array(layer.eqAnalyser.frequencyBinCount);
    layer.eqAnalyser.getFloatFrequencyData(buf);
    return buf;
  }

  getEqSampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  // --- drive / saturação ---

  setDrive(index: number, settings: LayerDriveSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.drive = settings;
    const now = this.ctx.currentTime;
    layer.driveShaper.curve = createDriveCurve(settings.type, settings.driveDb / 24) as Float32Array<ArrayBuffer>;
    const driveLinearGain = Math.pow(10, settings.driveDb / 20);
    layer.drivePreGain.gain.setTargetAtTime(driveLinearGain, now, 0.01);
    const wetAmount = settings.enabled ? settings.mix : 0;
    layer.driveWet.gain.setTargetAtTime(wetAmount, now, 0.01);
    layer.driveDry.gain.setTargetAtTime(1 - wetAmount, now, 0.01);
  }

  // --- reverb (envio por camada pro barramento compartilhado) ---

  setLayerReverb(index: number, settings: LayerReverbSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.reverb = settings;
    const send = settings.enabled ? settings.send : 0;
    layer.reverbSendGain.gain.setTargetAtTime(send, this.ctx.currentTime, 0.01);
  }

  // --- compressor ---

  /**
   * `amount` (0..1) é o único knob "Amount" da UI atual: por baixo, continua
   * pilotando o DynamicsCompressorNode nativo (threshold/ratio/makeup), só
   * que os três andam juntos a partir de um valor só, em vez do usuário
   * precisar entender/ajustar cada um — quanto mais alto, mais o threshold
   * desce (mais sinal é pego) e mais a razão sobe (mais compressão em cima
   * do que passa do threshold), com ganho de compensação automático pra
   * compensar a perda de volume média.
   */
  setCompressor(index: number, settings: LayerCompressorSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.compressor = settings;
    const now = this.ctx.currentTime;
    const amount = Math.max(0, Math.min(1, settings.amount));
    // Desligado = transparente: threshold 0dB + ratio 1:1 não comprime nada,
    // sem precisar desconectar o nó do grafo.
    const threshold = settings.enabled ? -amount * 42 : 0;
    const ratio = settings.enabled ? 1 + amount * 14 : 1;
    const makeup = settings.enabled ? amount * 10 : 0;
    // "FAST" (botão da foto de referência): ignora os knobs Attack/Release e
    // usa um ataque quase instantâneo + soltura curta fixos — modo
    // "limitador", pega transiente rápido em vez do groove mais lento/natural
    // que os knobs normalmente permitem ajustar.
    const attackMs = settings.fast ? 3 : settings.attackMs;
    const releaseMs = settings.fast ? 60 : settings.releaseMs;
    layer.compressorNode.threshold.setTargetAtTime(threshold, now, 0.01);
    layer.compressorNode.ratio.setTargetAtTime(ratio, now, 0.01);
    layer.compressorNode.attack.setTargetAtTime(Math.max(0.0005, attackMs / 1000), now, 0.005);
    layer.compressorNode.release.setTargetAtTime(Math.max(0.01, releaseMs / 1000), now, 0.005);
    layer.compressorMakeupGain.gain.setTargetAtTime(Math.pow(10, makeup / 20), now, 0.01);
  }

  /** Redução de ganho (dB, 0 ou negativo) que o compressor desta camada está aplicando agora — pro medidor "GR" da UI. */
  getCompressorReductionDb(index: number): number {
    return this.layers[index]?.compressorNode.reduction ?? 0;
  }

  // --- tremolo (modulação de amplitude) ---

  setTremolo(index: number, settings: LayerTremoloSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.tremolo = settings;
    const now = this.ctx.currentTime;
    const depth = settings.enabled ? Math.max(0, Math.min(1, settings.depth)) : 0;
    layer.tremoloLfo.frequency.setTargetAtTime(Math.max(0.05, settings.rateHz), now, 0.01);
    layer.tremoloGain.gain.setTargetAtTime(1 - depth / 2, now, 0.01);
    layer.tremoloDepthGain.gain.setTargetAtTime(depth / 2, now, 0.01);
    const stereo = settings.enabled ? Math.max(0, Math.min(1, settings.stereo)) : 0;
    layer.tremoloPanDepth.gain.setTargetAtTime(stereo * depth * 0.8, now, 0.01);
  }

  // --- chorus ---

  setChorus(index: number, settings: LayerChorusSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.chorus = settings;
    const now = this.ctx.currentTime;
    const wet = settings.enabled ? Math.max(0, Math.min(1, settings.mix)) : 0;
    layer.chorusWet.gain.setTargetAtTime(wet, now, 0.01);
  }

  // --- delay (eco) ---

  setDelay(index: number, settings: LayerDelaySettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    const pingPongChanged = layer.delay.pingPong !== settings.pingPong;
    layer.delay = settings;
    const now = this.ctx.currentTime;
    const timeSec = settings.sync
      ? Math.min(3.8, (RACK_DELAY_DIVISION_BEATS[settings.division] * 60) / Math.max(20, this.bpm))
      : Math.max(0, settings.timeMs) / 1000;
    layer.delayNode.delayTime.setTargetAtTime(timeSec, now, 0.01);
    layer.delayNodeR.delayTime.setTargetAtTime(timeSec, now, 0.01);
    const feedback = settings.enabled ? Math.min(0.9, Math.max(0, settings.feedback)) : 0;
    layer.delayFeedbackGain.gain.setTargetAtTime(feedback, now, 0.01);
    layer.delayFeedbackGainR.gain.setTargetAtTime(feedback, now, 0.01);
    const wet = settings.enabled ? settings.mix : 0;
    layer.delayWetGain.gain.setTargetAtTime(wet, now, 0.01);
    layer.delayDryGain.gain.setTargetAtTime(1, now, 0.01); // dry sempre 100% — o delay só soma eco por cima, nunca "rouba" o sinal limpo

    // "FILTER": cada repetição fica mais escura (low), mais fina/"dub" (high)
    // ou tipo rádio/telefone (band); 'off' = allpass (transparente).
    const filterParams: Record<RackDelayFilterType, { type: BiquadFilterType; freq: number; q: number }> = {
      off: { type: 'allpass', freq: 1200, q: 0.7 },
      low: { type: 'lowpass', freq: 2200, q: 0.7 },
      high: { type: 'highpass', freq: 700, q: 0.7 },
      band: { type: 'bandpass', freq: 1200, q: 1.1 },
    };
    const f = filterParams[settings.filterType] ?? filterParams.off;
    layer.delayToneFilter.type = f.type;
    layer.delayToneFilterR.type = f.type;
    layer.delayToneFilter.frequency.setTargetAtTime(f.freq, now, 0.01);
    layer.delayToneFilterR.frequency.setTargetAtTime(f.freq, now, 0.01);
    layer.delayToneFilter.Q.setTargetAtTime(f.q, now, 0.01);
    layer.delayToneFilterR.Q.setTargetAtTime(f.q, now, 0.01);

    // "ANALOG": satura a cauda (curve=null é transparente/identidade quando
    // desligado) + liga o wow (lento) / flutter (rápido) de afinação.
    layer.delayAnalogShaper.curve = settings.analog ? (createTapeSaturationCurve() as Float32Array<ArrayBuffer>) : null;
    layer.delayAnalogShaperR.curve = settings.analog ? (createTapeSaturationCurve() as Float32Array<ArrayBuffer>) : null;
    layer.delayWowDepth.gain.setTargetAtTime(settings.analog ? 0.0015 : 0, now, 0.15);
    layer.delayFlutterDepth.gain.setTargetAtTime(settings.analog ? 0.0004 : 0, now, 0.08);
    if (pingPongChanged) this.reconnectDelayRouting(layer, settings.pingPong);
  }

  /**
   * Alterna entre a rota normal (um eco só, realimentando ele mesmo) e a rota
   * "ping-pong" (eco alterna entre os canais esquerdo/direito, cada lado
   * realimentando o lado oposto) — refaz só as conexões do delay, via
   * disconnect/connect (seguro em tempo real no Web Audio), sem recriar nós.
   */
  private reconnectDelayRouting(layer: LayerRuntime, pingPong: boolean) {
    try {
      // delayNode(R) -> delayToneFilter(R) -> delayAnalogShaper(R) são conexões fixas (ver buildGraph) —
      // só desconectamos/reconectamos a partir do shaper pra dentro/fora do laço de realimentação.
      layer.delayAnalogShaper.disconnect();
      layer.delayAnalogShaperR.disconnect();
      layer.delayFeedbackGain.disconnect();
      layer.delayFeedbackGainR.disconnect();
    } catch {
      // ignora — pode já estar parcialmente desconectado
    }
    if (pingPong) {
      // shaper(L) -> pannerL -> wet ; shaper(L) -> feedbackGain -> delayNodeR(R)
      // ; shaper(R) -> pannerR -> wet ; shaper(R) -> feedbackGainR -> delayNode (fecha o laço, alternando de lado a cada repetição)
      layer.delayAnalogShaper.connect(layer.delayPannerL);
      layer.delayPannerL.connect(layer.delayWetGain);
      layer.delayAnalogShaper.connect(layer.delayFeedbackGain);
      layer.delayFeedbackGain.connect(layer.delayNodeR);
      layer.delayAnalogShaperR.connect(layer.delayPannerR);
      layer.delayPannerR.connect(layer.delayWetGain);
      layer.delayAnalogShaperR.connect(layer.delayFeedbackGainR);
      layer.delayFeedbackGainR.connect(layer.delayNode);
    } else {
      // comportamento original: um eco só, realimentando ele mesmo, sem pan extra.
      layer.delayAnalogShaper.connect(layer.delayFeedbackGain);
      layer.delayFeedbackGain.connect(layer.delayNode);
      layer.delayAnalogShaper.connect(layer.delayWetGain);
    }
  }

  setLayerVolume(index: number, volume: number) {
    const layer = this.layers[index];
    if (!layer) return;
    layer.volume = volume;
    this.recomputeLayerGain(index);
  }

  setLayerMuted(index: number, muted: boolean) {
    const layer = this.layers[index];
    if (!layer) return;
    layer.muted = muted;
    this.layers.forEach((_, i) => this.recomputeLayerGain(i));
  }

  setLayerSolo(index: number, solo: boolean) {
    const layer = this.layers[index];
    if (!layer) return;
    layer.solo = solo;
    this.layers.forEach((_, i) => this.recomputeLayerGain(i));
  }

  private recomputeLayerGain(index: number) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    const anySolo = this.layers.some((l) => l.solo);
    const audible = !layer.muted && (!anySolo || layer.solo);
    const target = audible ? layer.volume : 0;
    layer.volumeGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
  }

  setMasterVolume(volume: number) {
    this.masterVolume = volume;
    if (this.masterGain && this.ctx) this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
  }

  setReverb(amount: number) {
    this.reverbAmount = amount;
    if (this.reverbWetGain && this.ctx) this.reverbWetGain.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.02);
  }

  /** Troca o algoritmo/"sala" do reverb compartilhado (ver createReverbImpulse) — regenera a resposta impulsiva na hora. */
  setReverbRoom(room: RackReverbRoom) {
    this.reverbRoom = room;
    this.regenerateReverbImpulse();
  }

  /** Duração da cauda do reverb compartilhado, em segundos (0.2..8). */
  setReverbDecay(decaySec: number) {
    this.reverbDecaySec = Math.max(0.2, Math.min(8, decaySec));
    this.regenerateReverbImpulse();
  }

  /** Tom da cauda do reverb compartilhado: 0 (Escuro/abafado) .. 1 (Claro/aberto) — ajusta na hora, sem precisar regenerar a resposta impulsiva. */
  setReverbTone(tone: number) {
    this.reverbTone = Math.max(0, Math.min(1, tone));
    if (this.reverbToneFilter && this.ctx) {
      this.reverbToneFilter.frequency.setTargetAtTime(reverbToneToHz(this.reverbTone), this.ctx.currentTime, 0.02);
    }
  }

  private regenerateReverbImpulse() {
    if (this.convolver && this.ctx) this.convolver.buffer = createReverbImpulse(this.ctx, this.reverbRoom, this.reverbDecaySec);
  }

  /** BPM de referência do rack — recalcula na hora o tempo de todo delay por camada que estiver com "Sync" ligado. */
  setBpm(bpm: number) {
    this.bpm = Math.max(20, Math.min(300, bpm));
    this.layers.forEach((layer, i) => {
      if (layer.delay.sync) this.setDelay(i, layer.delay);
    });
  }

  /**
   * Oitavador DESTA camada: quando ligado, toda nota tocada nela (que já
   * atenda a faixa de nota/canal da própria camada) também dispara uma
   * cópia uma oitava abaixo e/ou acima, com volume relativo `mix` (fração
   * da velocity original) — útil pra engrossar o timbre de uma camada
   * específica sem duplicar o instrumento manualmente em outra camada. Só
   * afeta notas tocadas DEPOIS da mudança; não retroage em notas já
   * seguras no momento da troca. Independente por camada (era um controle
   * único do MASTER antes, ver histórico).
   */
  setLayerOctaver(index: number, settings: LayerOctaverSettings) {
    const layer = this.layers[index];
    if (!layer) return;
    layer.octaver = { ...settings, mix: Math.min(1, Math.max(0, settings.mix)) };
  }

  // --- arpejador (por camada) ---

  /**
   * Liga/ajusta o arpejador desta camada. Desligar interrompe imediatamente
   * qualquer nota que o arpejador esteja segurando (ver stopArp) e esquece
   * as notas seguradas/travadas, pra não deixar nada "preso" soando. Trocar
   * padrão/oitavas enquanto já há notas seguradas recalcula a sequência na
   * hora (ver rebuildArpSequence), sem esperar a próxima tecla.
   */
  setArp(index: number, settings: LayerArpSettings) {
    const layer = this.layers[index];
    if (!layer) return;
    const wasEnabled = layer.arp.enabled;
    layer.arp = settings;
    if (!settings.enabled) {
      if (wasEnabled) this.stopArp(layer);
      layer.arpHeld.clear();
      layer.arpLatched.clear();
      layer.arpAwaitingNewChord = false;
      return;
    }
    if (this.arpPool(layer).size > 0) this.rebuildArpSequence(layer);
  }

  /** Pool de notas "em jogo" agora: o conjunto travado (latch), se houver, senão as fisicamente seguradas. */
  private arpPool(layer: LayerRuntime): Map<number, number> {
    return layer.arp.latch && layer.arpLatched.size > 0 ? layer.arpLatched : layer.arpHeld;
  }

  /**
   * Reconstrói layer.arpSequence (notas sem oitava de camada, já expandidas
   * pelas oitavas extras e ordenadas conforme layer.arp.pattern) a partir do
   * pool atual de notas seguradas/travadas. Chamada sempre que o pool ou as
   * configurações do arpejador mudam.
   */
  private rebuildArpSequence(layer: LayerRuntime) {
    const pool = this.arpPool(layer);
    const pressedOrder = Array.from(pool.keys());
    const sortedAsc = [...pressedOrder].sort((a, b) => a - b);
    const octaves = Math.max(1, Math.min(4, Math.round(layer.arp.octaves)));
    const base = layer.arp.pattern === 'order' ? pressedOrder : sortedAsc;
    const expanded: number[] = [];
    for (let o = 0; o < octaves; o++) {
      for (const n of base) expanded.push(n + o * 12);
    }

    let sequence: number[];
    switch (layer.arp.pattern) {
      case 'down':
        sequence = [...expanded].sort((a, b) => b - a);
        break;
      case 'updown': {
        const up = [...expanded].sort((a, b) => a - b);
        const down = [...up].slice(1, -1).reverse();
        sequence = [...up, ...down];
        break;
      }
      case 'downup': {
        const down = [...expanded].sort((a, b) => b - a);
        const up = [...down].slice(1, -1).reverse();
        sequence = [...down, ...up];
        break;
      }
      case 'order':
      case 'chord':
        sequence = expanded;
        break;
      case 'random':
        sequence = [...expanded].sort((a, b) => a - b);
        break;
      case 'up':
      default:
        sequence = [...expanded].sort((a, b) => a - b);
    }

    layer.arpSequence = sequence;
    if (layer.arpStepIndex >= sequence.length) layer.arpStepIndex = -1;
  }

  /** Nota chega nesta camada com o arpejador ligado: só atualiza o pool de notas seguradas/travadas — quem de fato dispara o som é tickArpStep(). */
  private arpNoteOn(layer: LayerRuntime, note: number, velocity: number) {
    const wasEmpty = this.arpPool(layer).size === 0;
    if (layer.arp.latch && layer.arpAwaitingNewChord) {
      // depois de soltar tudo com latch ligado, a próxima tecla começa um acorde novo em vez de somar ao anterior
      layer.arpLatched.clear();
      layer.arpAwaitingNewChord = false;
    }
    layer.arpHeld.set(note, velocity);
    if (layer.arp.latch) layer.arpLatched.set(note, velocity);
    layer.activeNotes.set(note, Math.max(0, Math.min(127, note + layer.octave * 12))); // só pra o teclado visual mostrar a tecla física pressionada
    this.rebuildArpSequence(layer);
    if (wasEmpty) {
      this.triggerEnvelopeAttackDecay(layer);
      layer.arpStepIndex = -1;
      layer.arpStepParity = false;
      layer.arpNextStepTime = this.ctx ? this.ctx.currentTime : 0; // dispara já no próximo tick
    }
  }

  /** Solta uma nota nesta camada com o arpejador ligado — ver arpNoteOn. */
  private arpNoteOff(layer: LayerRuntime, note: number) {
    layer.arpHeld.delete(note);
    layer.activeNotes.delete(note);
    if (layer.arp.latch) {
      if (layer.arpHeld.size === 0) layer.arpAwaitingNewChord = true;
      return; // com latch ligado, soltar a tecla não tira a nota do conjunto travado
    }
    this.rebuildArpSequence(layer);
    if (this.arpPool(layer).size === 0) this.stopArp(layer);
  }

  /** Interrompe o arpejador desta camada: solta qualquer nota que ele esteja segurando e libera o envelope da camada (ver triggerEnvelopeRelease). */
  private stopArp(layer: LayerRuntime) {
    if (layer.arpActiveNotes.length && layer.voice) {
      for (const n of layer.arpActiveNotes) layer.voice.noteOff(n);
    }
    layer.arpActiveNotes = [];
    layer.arpNextStepTime = null;
    layer.arpOffTime = null;
    this.triggerEnvelopeRelease(layer);
  }

  /**
   * Chamado a cada ~15ms (ver arpTimer em createLayerRuntime) pra cada
   * camada. Decide se já é hora do próximo passo do arpejador (comparando
   * contra o relógio do AudioContext, não contra o timer do JS, pra não
   * acumular deriva) e, nesse caso, solta a(s) nota(s) do passo anterior e
   * dispara a(s) do passo novo. Entre passos, só checa se já é hora de
   * soltar a nota atual por causa do gate (quando gate < 100%).
   */
  private tickArpStep(layer: LayerRuntime) {
    if (!this.ctx || !layer.voice || !layer.arp.enabled) return;
    const pool = this.arpPool(layer);
    if (pool.size === 0) {
      if (layer.arpActiveNotes.length || layer.arpNextStepTime !== null) this.stopArp(layer);
      return;
    }
    const now = this.ctx.currentTime;
    if (layer.arpNextStepTime === null) layer.arpNextStepTime = now;

    if (now < layer.arpNextStepTime) {
      if (layer.arpOffTime !== null && now >= layer.arpOffTime && layer.arpActiveNotes.length) {
        for (const n of layer.arpActiveNotes) layer.voice.noteOff(n);
        layer.arpActiveNotes = [];
        layer.arpOffTime = null;
      }
      return;
    }

    if (layer.arpActiveNotes.length) {
      for (const n of layer.arpActiveNotes) layer.voice.noteOff(n);
      layer.arpActiveNotes = [];
    }

    const stepSeconds = layer.arp.sync
      ? (RACK_ARP_DIVISION_BEATS[layer.arp.division] * 60) / Math.max(20, this.bpm)
      : 1 / Math.max(0.1, layer.arp.rateHz);
    const avgVelocity = Math.max(1, Math.round(Array.from(pool.values()).reduce((a, b) => a + b, 0) / pool.size));

    let notesToPlay: number[];
    if (layer.arp.pattern === 'chord') {
      notesToPlay = layer.arpSequence;
    } else if (layer.arp.pattern === 'random') {
      const idx = Math.floor(Math.random() * layer.arpSequence.length);
      notesToPlay = layer.arpSequence.length ? [layer.arpSequence[idx]] : [];
    } else {
      layer.arpStepIndex = layer.arpSequence.length ? (layer.arpStepIndex + 1) % layer.arpSequence.length : -1;
      notesToPlay = layer.arpStepIndex >= 0 ? [layer.arpSequence[layer.arpStepIndex]] : [];
    }

    if (notesToPlay.length) {
      const shifted = notesToPlay.map((n) => Math.max(0, Math.min(127, n + layer.octave * 12)));
      for (const sn of shifted) layer.voice.noteOn(sn, avgVelocity);
      layer.arpActiveNotes = shifted;
      const gateFrac = Math.max(0.05, Math.min(1, layer.arp.gate));
      const gateSeconds = stepSeconds * gateFrac;
      layer.arpOffTime = gateFrac >= 0.999 ? null : now + gateSeconds;
    }

    const swing = Math.max(0, Math.min(0.75, layer.arp.swing));
    layer.arpStepParity = !layer.arpStepParity;
    const swungStep = swing > 0 ? stepSeconds * (layer.arpStepParity ? 1 + swing : 1 - swing) : stepSeconds;
    layer.arpNextStepTime = now + Math.max(0.03, swungStep);
  }

  // --- gate (porta de ruído) ---

  /**
   * `thresholdDb`/`attackMs`/`releaseMs` só são lidos pelo timer periódico
   * criado em createLayerRuntime (gateTimer) — aqui só guardamos as
   * configurações; quando desligado, o timer garante que gateGainNode volte
   * suavemente a 1 (aberto/transparente).
   */
  setGate(index: number, settings: LayerGateSettings) {
    const layer = this.layers[index];
    if (!layer) return;
    layer.gate = settings;
  }

  /** Quanto a porta deste gate está aberta agora (0 fechada .. 1 totalmente aberta) — pro medidor da UI. */
  getGateOpenAmount(index: number): number {
    return this.layers[index]?.gateGainNode.gain.value ?? 1;
  }

  // --- phaser ---

  setPhaser(index: number, settings: LayerPhaserSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.phaser = settings;
    const now = this.ctx.currentTime;
    layer.phaserLfo.frequency.setTargetAtTime(Math.max(0.02, settings.rateHz), now, 0.01);
    const depth = settings.enabled ? Math.max(0, Math.min(1, settings.depth)) : 0;
    // cada estágio varia a frequência central numa faixa proporcional à profundidade, em torno de ~800Hz
    for (const g of layer.phaserLfoDepth) g.gain.setTargetAtTime(depth * 1400, now, 0.01);
    for (const stage of layer.phaserStages) stage.frequency.setTargetAtTime(800, now, 0.01);
    const wet = settings.enabled ? Math.max(0, Math.min(1, settings.mix)) : 0;
    layer.phaserWet.gain.setTargetAtTime(wet, now, 0.01);
    layer.phaserDry.gain.setTargetAtTime(1 - wet * 0.5, now, 0.01);
  }

  // --- flanger ---

  setFlanger(index: number, settings: LayerFlangerSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.flanger = settings;
    const now = this.ctx.currentTime;
    layer.flangerLfo.frequency.setTargetAtTime(Math.max(0.02, settings.rateHz), now, 0.01);
    const depth = settings.enabled ? Math.max(0, Math.min(1, settings.depth)) : 0;
    // profundidade de modulação em torno de um delay base de 4ms (0..~9ms)
    layer.flangerLfoDepth.gain.setTargetAtTime(depth * 0.0045, now, 0.01);
    layer.flangerDelay.delayTime.setTargetAtTime(0.0045, now, 0.01);
    const feedback = settings.enabled ? Math.min(0.95, Math.max(0, settings.feedback)) : 0;
    layer.flangerFeedbackGain.gain.setTargetAtTime(feedback, now, 0.01);
    const wet = settings.enabled ? Math.max(0, Math.min(1, settings.mix)) : 0;
    layer.flangerWet.gain.setTargetAtTime(wet, now, 0.01);
    layer.flangerDry.gain.setTargetAtTime(1, now, 0.01);
  }

  // --- bitcrusher / lo-fi ---

  setBitcrusher(index: number, settings: LayerBitcrusherSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.bitcrusher = settings;
    layer.bitcrusherShaper.curve = createBitcrusherCurve(settings.bits) as Float32Array<ArrayBuffer>;
    const wet = settings.enabled ? Math.max(0, Math.min(1, settings.mix)) : 0;
    const now = this.ctx.currentTime;
    layer.bitcrusherWet.gain.setTargetAtTime(wet, now, 0.01);
    layer.bitcrusherDry.gain.setTargetAtTime(1 - wet, now, 0.01);
  }

  // --- shimmer ---

  setShimmer(index: number, settings: LayerShimmerSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.shimmer = settings;
    const now = this.ctx.currentTime;
    const wet = settings.enabled ? Math.max(0, Math.min(1, settings.mix)) : 0;
    layer.shimmerWet.gain.setTargetAtTime(wet, now, 0.01);
    const feedback = settings.enabled ? Math.min(0.92, Math.max(0, settings.feedback)) : 0;
    layer.shimmerFeedbackGain.gain.setTargetAtTime(feedback, now, 0.01);
    layer.shimmerTone.frequency.setTargetAtTime(Math.max(300, Math.min(16000, settings.toneHz)), now, 0.02);
  }

  /**
   * Dispara uma nota em todas as camadas compatíveis (faixa de nota + canal
   * MIDI configurados no painel "Editar"), aplicando a transposição de oitava
   * de cada camada. `channel` é 1-16 (canal MIDI "humano"), ou undefined
   * quando a origem não distingue canal (ex.: teclado virtual).
   */
  /** Ataque + (se decayMs > 0) queda até o nível interno de sustentação — ver LayerEnvelopeSettings.decayMs. */
  private triggerEnvelopeAttackDecay(layer: LayerRuntime) {
    if (!layer.envelope.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const attackSec = Math.max(0.001, layer.envelope.attackMs / 1000);
    const decaySec = Math.max(0, layer.envelope.decayMs / 1000);
    layer.envelopeGain.gain.cancelScheduledValues(now);
    layer.envelopeGain.gain.setValueAtTime(layer.envelopeGain.gain.value, now);
    layer.envelopeGain.gain.linearRampToValueAtTime(1, now + attackSec);
    if (decaySec > 0.001) {
      layer.envelopeGain.gain.linearRampToValueAtTime(ENVELOPE_SUSTAIN_LEVEL, now + attackSec + decaySec);
    }
  }

  private triggerEnvelopeRelease(layer: LayerRuntime) {
    if (!layer.envelope.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    layer.envelopeGain.gain.cancelScheduledValues(now);
    layer.envelopeGain.gain.setValueAtTime(layer.envelopeGain.gain.value, now);
    layer.envelopeGain.gain.linearRampToValueAtTime(0, now + Math.max(0.001, layer.envelope.releaseMs / 1000));
  }

  noteOn(note: number, velocity: number, channel?: number) {
    this.ensureStarted();
    for (const layer of this.layers) {
      if (!layer.voice) continue;
      if (note < layer.noteRangeStart || note > layer.noteRangeEnd) continue;
      if (layer.midiChannel !== 0 && channel !== undefined && layer.midiChannel !== channel) continue;

      // Arpejador ligado nesta camada: a nota só alimenta o pool de notas
      // seguradas/travadas — quem decide quando/quais notas soam de fato é o
      // tickArpStep() (relógio próprio). Substitui completamente o
      // despacho poly/mono normal (e o oitavador) enquanto estiver ligado.
      if (layer.arp.enabled) {
        this.arpNoteOn(layer, note, velocity);
        continue;
      }

      const shifted = Math.max(0, Math.min(127, note + layer.octave * 12));
      const wasEmpty = layer.activeNotes.size === 0;

      // Modo mono: só uma voz soa por vez nesta camada — nota nova corta (ou,
      // com legato ligado, desliza pra) a nota anterior, em vez de abrir uma
      // voz independente (ver glideLayerTo). O oitavador por camada não se
      // aplica em modo mono por ora (limitação documentada — a pilha de notas
      // seguradas só rastreia a voz principal).
      if (layer.voiceMode.playMode === 'mono') {
        layer.monoHeldStack.push({ note, velocity });
        layer.activeNotes.set(note, shifted);
        if (!wasEmpty && layer.voiceMode.legato && layer.monoVoiceRealNote !== null) {
          this.glideLayerTo(layer, shifted);
        } else {
          if (!wasEmpty && layer.monoVoiceRealNote !== null) layer.voice.noteOff(layer.monoVoiceRealNote);
          layer.voice.noteOn(shifted, velocity);
          layer.monoVoiceRealNote = shifted;
          layer.monoVoiceTargetNote = shifted;
          this.triggerEnvelopeAttackDecay(layer);
        }
        continue;
      }

      // --- modo poly (comportamento original) ---
      layer.activeNotes.set(note, shifted);
      layer.voice.noteOn(shifted, velocity);

      // Oitavador DESTA camada: dispara cópia(s) extra(s) da mesma nota uma
      // oitava abaixo/acima, com velocity reduzida por `octaverMix` — some
      // silenciosamente (sem clampar pra dentro de 0-127) quando a nota
      // extra estouraria a faixa MIDI, em vez de duplicar numa altura errada.
      if (layer.octaver.enabled) {
        const extras: number[] = [];
        const extraVelocity = Math.max(1, Math.min(127, Math.round(velocity * layer.octaver.mix)));
        if (layer.octaver.mode === 'down' || layer.octaver.mode === 'both') {
          const down = shifted - 12;
          if (down >= 0) {
            layer.voice.noteOn(down, extraVelocity);
            extras.push(down);
          }
        }
        if (layer.octaver.mode === 'up' || layer.octaver.mode === 'both') {
          const up = shifted + 12;
          if (up <= 127) {
            layer.voice.noteOn(up, extraVelocity);
            extras.push(up);
          }
        }
        if (extras.length) layer.octaverNotes.set(note, extras);
      }

      if (wasEmpty) this.triggerEnvelopeAttackDecay(layer);
    }
  }

  noteOff(note: number, channel?: number) {
    for (const layer of this.layers) {
      if (!layer.voice) continue;
      if (layer.midiChannel !== 0 && channel !== undefined && layer.midiChannel !== channel) continue;

      if (layer.arp.enabled) {
        this.arpNoteOff(layer, note);
        continue;
      }

      if (layer.voiceMode.playMode === 'mono') {
        const idx = layer.monoHeldStack.findIndex((h) => h.note === note);
        if (idx === -1) continue;
        const removedShifted = layer.activeNotes.get(note);
        const wasCurrent = removedShifted !== undefined && removedShifted === layer.monoVoiceTargetNote;
        layer.monoHeldStack.splice(idx, 1);
        layer.activeNotes.delete(note);
        if (layer.monoHeldStack.length === 0) {
          if (layer.glideTimer !== null) {
            clearInterval(layer.glideTimer);
            layer.glideTimer = null;
          }
          if (layer.monoVoiceRealNote !== null) layer.voice.noteOff(layer.monoVoiceRealNote);
          layer.monoVoiceRealNote = null;
          layer.monoVoiceTargetNote = null;
          this.triggerEnvelopeRelease(layer);
        } else if (wasCurrent) {
          // volta pra nota anterior ainda segurada (prioridade: última tocada), igual a um sintetizador mono "last note priority"
          const fallback = layer.monoHeldStack[layer.monoHeldStack.length - 1];
          const fallbackShifted = Math.max(0, Math.min(127, fallback.note + layer.octave * 12));
          if (layer.voiceMode.legato && layer.monoVoiceRealNote !== null) {
            this.glideLayerTo(layer, fallbackShifted);
          } else {
            if (layer.monoVoiceRealNote !== null) layer.voice.noteOff(layer.monoVoiceRealNote);
            layer.voice.noteOn(fallbackShifted, fallback.velocity);
            layer.monoVoiceRealNote = fallbackShifted;
            layer.monoVoiceTargetNote = fallbackShifted;
          }
        }
        continue;
      }

      // --- modo poly (comportamento original) ---
      const shifted = layer.activeNotes.get(note);
      if (shifted === undefined) continue;
      layer.activeNotes.delete(note);
      layer.voice.noteOff(shifted);
      const extras = layer.octaverNotes.get(note);
      if (extras) {
        for (const extra of extras) layer.voice.noteOff(extra);
        layer.octaverNotes.delete(note);
      }
      if (layer.activeNotes.size === 0) this.triggerEnvelopeRelease(layer);
    }
  }

  /**
   * Fotografia instantânea de todas as notas MIDI (0-127, antes da
   * transposição por oitava de cada camada) que estão soando agora em
   * qualquer camada — usado pela tira de teclado visual (feature 9).
   */
  getActiveNotesSnapshot(): number[] {
    const notes = new Set<number>();
    for (const layer of this.layers) {
      for (const note of layer.activeNotes.keys()) notes.add(note);
    }
    return Array.from(notes);
  }

  /** Botão "PARAR NOTAS": corta/libera tudo que estiver soando em todas as camadas, imediatamente. */
  panic() {
    for (const layer of this.layers) {
      layer.voice?.allNotesOff();
      layer.activeNotes.clear();
      layer.octaverNotes.clear();
      layer.monoHeldStack = [];
      layer.monoVoiceRealNote = null;
      layer.monoVoiceTargetNote = null;
      if (layer.glideTimer !== null) {
        clearInterval(layer.glideTimer);
        layer.glideTimer = null;
      }
      if (this.ctx) layer.envelopeGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
    }
  }

  /**
   * Pitch bend vindo da roda do teclado físico — `normalized` é -1..1 (centro
   * = 0), já calculado a partir das 14 bits do evento MIDI (ver
   * rackMidiRouter.ts). Afeta as camadas compatíveis com o canal MIDI
   * informado, respeitando o filtro de canal de cada uma (ver midiChannel).
   */
  setPitchBend(normalized: number, channel?: number) {
    const semitones = Math.max(-1, Math.min(1, normalized)) * PITCH_BEND_RANGE_SEMITONES;
    for (const layer of this.layers) {
      if (!layer.voice) continue;
      if (layer.midiChannel !== 0 && channel !== undefined && layer.midiChannel !== channel) continue;
      layer.pitchBendSemitones = semitones;
      if (isPitchBendable(layer.voice)) layer.voice.setPitchBend(semitones);
    }
  }
}

export const rackEngine = new RackEngine();

// Expõe o motor do rack em window pra diagnóstico manual e pro harness de
// testes via CDP (ver scripts/cdp-*.cjs) — não é usado por nenhum caminho do
// app em si, só facilita inspecionar/acionar notas de fora sem um teclado
// MIDI físico conectado ao sandbox de desenvolvimento.
if (typeof window !== 'undefined') {
  (window as unknown as { __rackEngine?: RackEngine }).__rackEngine = rackEngine;
}
