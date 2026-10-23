import type { RackCharacter, RackLayerFormat, RackPresetOption } from '../../../shared/types';
import { Sf2LayerVoice } from './Sf2LayerVoice';
import { Dx7LayerVoice } from './Dx7LayerVoice';
import { SamplerLayerVoice } from './SamplerLayerVoice';

type AnyLayerVoice = Sf2LayerVoice | Dx7LayerVoice | SamplerLayerVoice;

const SF2_EXT = new Set(['sf2', 'sf3']);
const DX7_EXT = new Set(['syx']);
const SAMPLE_EXT = new Set(['wav', 'wave', 'aiff', 'aif', 'flac', 'ogg', 'mp3']);

export function detectRackFormat(fileName: string): RackLayerFormat | 'npno-unsupported' | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'npno') return 'npno-unsupported';
  if (SF2_EXT.has(ext)) return 'sf2';
  if (DX7_EXT.has(ext)) return 'dx7';
  if (SAMPLE_EXT.has(ext)) return 'sampler';
  return null;
}

export const NPNO_EXPLANATION =
  'Arquivos .npno (Nord Piano Library) usam um formato fechado e criptografado que a própria ' +
  'Clavia/Nord nunca documentou publicamente — não existe hoje uma forma segura e confiável de ' +
  'decodificá-los dentro do app. Exporte o piano como áudio (.wav/.aiff, por exemplo gravando a ' +
  'saída do seu teclado ou de um DAW) e carregue o arquivo exportado aqui nesta camada.';

interface LayerRuntime {
  format: RackLayerFormat | null;
  voice: AnyLayerVoice | null;
  volumeGain: GainNode;
  filterNode: BiquadFilterNode;
  muted: boolean;
  solo: boolean;
  volume: number;
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

/**
 * Motor do Rack de instrumentos ao vivo: até 4 camadas tocando simultaneamente
 * (SoundFont real via FluidSynth/WASM, banco DX7 real via núcleo MSFA, ou
 * amostra de áudio do usuário), misturadas num barramento comum com reverb
 * algorítmica compartilhada e volume geral — tudo disparado por mensagens
 * MIDI note-on/note-off vindas de um teclado físico conectado.
 */
export class RackEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbBus: GainNode | null = null;
  private reverbWetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private layers: LayerRuntime[] = [];
  private reverbAmount = 0;
  private masterVolume = 0.8;

  /** Cria o AudioContext e o barramento na primeira vez que for preciso (gesto do usuário já ocorreu ao abrir a aba). */
  ensureStarted() {
    if (this.ctx) return;
    const ctx = new AudioContext();
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

    for (let i = 0; i < 4; i++) {
      const volumeGain = ctx.createGain();
      volumeGain.gain.value = 0.7;
      const filterNode = ctx.createBiquadFilter();
      applyCharacter(filterNode, 'original');
      volumeGain.connect(filterNode);
      filterNode.connect(masterGain);
      filterNode.connect(reverbBus);
      this.layers.push({ format: null, voice: null, volumeGain, filterNode, muted: false, solo: false, volume: 0.7 });
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
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
    } else {
      const v = new SamplerLayerVoice(ctx);
      await v.load(buffer, rootNote);
      voice = v;
    }
    voice.output.connect(layer.volumeGain);
    layer.voice = voice;
    layer.format = format;
    return presets;
  }

  clearLayer(index: number) {
    const layer = this.layers[index];
    layer.voice?.dispose();
    layer.voice = null;
    layer.format = null;
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
    if (layer) applyCharacter(layer.filterNode, character);
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

  noteOn(note: number, velocity: number) {
    this.ensureStarted();
    for (const layer of this.layers) layer.voice?.noteOn(note, velocity);
  }

  noteOff(note: number) {
    for (const layer of this.layers) layer.voice?.noteOff(note);
  }

  /** Botão "PARAR NOTAS": corta/libera tudo que estiver soando em todas as camadas, imediatamente. */
  panic() {
    for (const layer of this.layers) layer.voice?.allNotesOff();
  }
}

export const rackEngine = new RackEngine();
