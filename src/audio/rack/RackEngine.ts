import type { RackCharacter, RackDriveType, RackLayerFormat, RackPresetOption } from '../../../shared/types';
import { Sf2LayerVoice } from './Sf2LayerVoice';
import { Dx7LayerVoice } from './Dx7LayerVoice';
import { SamplerLayerVoice } from './SamplerLayerVoice';
import { NpnoLayerVoice } from './NpnoLayerVoice';

type AnyLayerVoice = Sf2LayerVoice | Dx7LayerVoice | SamplerLayerVoice | NpnoLayerVoice;

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

const SF2_EXT = new Set(['sf2', 'sf3']);
const DX7_EXT = new Set(['syx']);
const SAMPLE_EXT = new Set(['wav', 'wave', 'aiff', 'aif', 'flac', 'ogg', 'mp3']);
const NPNO_EXT = new Set(['npno']);

export function detectRackFormat(fileName: string): RackLayerFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (NPNO_EXT.has(ext)) return 'npno';
  if (SF2_EXT.has(ext)) return 'sf2';
  if (DX7_EXT.has(ext)) return 'dx7';
  if (SAMPLE_EXT.has(ext)) return 'sampler';
  return null;
}

export interface LayerEnvelopeSettings {
  enabled: boolean;
  attackMs: number;
  releaseMs: number;
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

  // cadeia de áudio (ver connectChain): voice -> envelopeGain -> cutoffFilter ->
  // eqLow -> eqMid -> eqHigh -> drivePreGain -> (dry + wet via shaper) -> driveSum
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
  eqLow: BiquadFilterNode;
  eqMid: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  eq: LayerEqSettings;
  drivePreGain: GainNode;
  driveShaper: WaveShaperNode;
  driveDry: GainNode;
  driveWet: GainNode;
  drive: LayerDriveSettings;
  volumeGain: GainNode;
  characterFilter: BiquadFilterNode;
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

function createReverbImpulse(ctx: AudioContext, durationSec = 2.6, decay = 2.4): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * durationSec);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
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
  private layers: LayerRuntime[] = [];
  private reverbAmount = 0;
  private masterVolume = 0.8;
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
    convolver.buffer = createReverbImpulse(ctx);
    const reverbBus = ctx.createGain();
    reverbBus.gain.value = 1;
    const reverbWetGain = ctx.createGain();
    reverbWetGain.gain.value = this.reverbAmount;
    reverbBus.connect(convolver);
    convolver.connect(reverbWetGain);
    reverbWetGain.connect(masterGain);
    this.convolver = convolver;
    this.reverbBus = reverbBus;
    this.reverbWetGain = reverbWetGain;

    this.layers = [];
    for (let i = 0; i < 4; i++) {
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

    const eqLow = ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 200;
    eqLow.gain.value = 0;
    const eqMid = ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 0.9;
    eqMid.gain.value = 0;
    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 4000;
    eqHigh.gain.value = 0;

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

    // voice.output (ligado depois, em loadLayer) -> envelopeGain -> cutoffFilter
    // -> eqLow -> eqMid -> eqHigh -> drivePreGain -> { driveDry, driveShaper->driveWet }
    // -> volumeGain -> panNode -> characterFilter -> masterGain/reverbBus
    envelopeGain.connect(cutoffFilter);
    cutoffFilter.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(drivePreGain);
    drivePreGain.connect(driveDry);
    drivePreGain.connect(driveShaper);
    driveShaper.connect(driveWet);
    driveDry.connect(volumeGain);
    driveWet.connect(volumeGain);
    volumeGain.connect(panNode);
    panNode.connect(characterFilter);
    characterFilter.connect(masterGain);
    characterFilter.connect(reverbBus);

    // Tap passivo (não precisa de .connect() pra frente) pro medidor de nível
    // de cada card — ver getLayerLevel().
    const meterAnalyser = ctx.createAnalyser();
    meterAnalyser.fftSize = 256;
    meterAnalyser.smoothingTimeConstant = 0.6;
    characterFilter.connect(meterAnalyser);

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
      envelopeGain,
      envelope: { enabled: false, attackMs: 5, releaseMs: 350 },
      cutoffFilter,
      filter: { enabled: false, cutoffHz: 20000 },
      eqLow,
      eqMid,
      eqHigh,
      eq: { enabled: false, bassDb: 0, midDb: 0, trebleDb: 0, midFreqHz: 1000 },
      drivePreGain,
      driveShaper,
      driveDry,
      driveWet,
      drive: { enabled: false, type: 'warm', driveDb: 0, mix: 1 },
      volumeGain,
      panNode,
      characterFilter,
      pitchBendSemitones: 0,
      meterAnalyser,
      meterBuf: new Float32Array(meterAnalyser.fftSize),
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
    rootNote = 60
  ): Promise<RackPresetOption[]> {
    const ctx = this.context;
    const layer = this.layers[index];
    layer.voice?.dispose();
    layer.activeNotes.clear();
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
  }

  selectPreset(index: number, value: string) {
    const voice = this.layers[index]?.voice;
    if (voice && 'selectPreset' in voice) (voice as Sf2LayerVoice | Dx7LayerVoice).selectPreset(value);
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

  // --- filtro (cutoff estático) ---

  setFilter(index: number, settings: LayerFilterSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.filter = settings;
    const freq = settings.enabled ? settings.cutoffHz : 20000;
    layer.cutoffFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.01);
  }

  // --- equalizador de 3 bandas ---

  setEq(index: number, settings: LayerEqSettings) {
    const layer = this.layers[index];
    if (!layer || !this.ctx) return;
    layer.eq = settings;
    const now = this.ctx.currentTime;
    const on = settings.enabled;
    layer.eqLow.gain.setTargetAtTime(on ? settings.bassDb : 0, now, 0.01);
    layer.eqMid.gain.setTargetAtTime(on ? settings.midDb : 0, now, 0.01);
    layer.eqMid.frequency.setTargetAtTime(settings.midFreqHz, now, 0.01);
    layer.eqHigh.gain.setTargetAtTime(on ? settings.trebleDb : 0, now, 0.01);
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

  /**
   * Dispara uma nota em todas as camadas compatíveis (faixa de nota + canal
   * MIDI configurados no painel "Editar"), aplicando a transposição de oitava
   * de cada camada. `channel` é 1-16 (canal MIDI "humano"), ou undefined
   * quando a origem não distingue canal (ex.: teclado virtual).
   */
  noteOn(note: number, velocity: number, channel?: number) {
    this.ensureStarted();
    const ctx = this.ctx!;
    for (const layer of this.layers) {
      if (!layer.voice) continue;
      if (note < layer.noteRangeStart || note > layer.noteRangeEnd) continue;
      if (layer.midiChannel !== 0 && channel !== undefined && layer.midiChannel !== channel) continue;
      const shifted = Math.max(0, Math.min(127, note + layer.octave * 12));
      const wasEmpty = layer.activeNotes.size === 0;
      layer.activeNotes.set(note, shifted);
      layer.voice.noteOn(shifted, velocity);
      if (layer.envelope.enabled && wasEmpty) {
        layer.envelopeGain.gain.cancelScheduledValues(ctx.currentTime);
        layer.envelopeGain.gain.setValueAtTime(layer.envelopeGain.gain.value, ctx.currentTime);
        layer.envelopeGain.gain.linearRampToValueAtTime(1, ctx.currentTime + Math.max(0.001, layer.envelope.attackMs / 1000));
      }
    }
  }

  noteOff(note: number, channel?: number) {
    const ctx = this.ctx;
    for (const layer of this.layers) {
      if (!layer.voice) continue;
      const shifted = layer.activeNotes.get(note);
      if (shifted === undefined) continue;
      if (layer.midiChannel !== 0 && channel !== undefined && layer.midiChannel !== channel) continue;
      layer.activeNotes.delete(note);
      layer.voice.noteOff(shifted);
      if (layer.envelope.enabled && layer.activeNotes.size === 0 && ctx) {
        layer.envelopeGain.gain.cancelScheduledValues(ctx.currentTime);
        layer.envelopeGain.gain.setValueAtTime(layer.envelopeGain.gain.value, ctx.currentTime);
        layer.envelopeGain.gain.linearRampToValueAtTime(0, ctx.currentTime + Math.max(0.001, layer.envelope.releaseMs / 1000));
      }
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
