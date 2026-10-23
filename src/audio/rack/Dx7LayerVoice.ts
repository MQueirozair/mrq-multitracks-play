import { Voice, parse, type Dx7Voice } from '@audio/synth-dx7';
import type { RackPresetOption } from '../../../shared/types';

const BLOCK = 64; // tamanho fixo de bloco do motor MSFA
const BUFFER_SIZE = 512; // múltiplo de 64; ~11,6 ms de latência em 44,1 kHz
const FULL_SCALE = 2 ** -28; // escala do int32 bruto do motor (ver dx7.js: SCALE)

/**
 * Uma camada que toca um banco/voz real do Yamaha DX7 (.syx), usando o núcleo
 * FM "MSFA" (o mesmo que o Google abriu publicamente e que o Dexed usa),
 * portado bit a bit para JavaScript pelo pacote @audio/synth-dx7. Cada nota
 * tocada vira uma instância de `Voice` somada num ScriptProcessorNode — dá
 * polifonia real (uma voz FM de 6 operadores por tecla pressionada).
 */
export class Dx7LayerVoice {
  private ctx: AudioContext;
  private node: ScriptProcessorNode | null = null;
  private voices: Dx7Voice[] = [];
  private currentPatch: Uint8Array | null = null;
  private active = new Map<number, Voice>();
  readonly output: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
  }

  async load(buffer: ArrayBuffer): Promise<RackPresetOption[]> {
    this.dispose();
    const parsed = parse(new Uint8Array(buffer));
    if (parsed.length === 0) {
      throw new Error('Nenhuma voz DX7 válida foi encontrada neste arquivo .syx.');
    }
    this.voices = parsed;
    this.currentPatch = parsed[0].patch;
    this.setupNode();
    return parsed.map((v, i) => ({ value: String(i), label: `${i + 1}. ${v.name}` }));
  }

  private setupNode() {
    // ScriptProcessorNode é legado, mas funciona em todo Chromium/Electron sem
    // exigir empacotar um módulo AudioWorklet separado — opção deliberada pela
    // simplicidade e robustez do empacotamento multiplataforma deste app.
    const node = this.ctx.createScriptProcessor(BUFFER_SIZE, 0, 2);
    const blockBuf = new Int32Array(BLOCK);
    node.onaudioprocess = (ev) => {
      const left = ev.outputBuffer.getChannelData(0);
      const right = ev.outputBuffer.getChannelData(1);
      for (let offset = 0; offset < BUFFER_SIZE; offset += BLOCK) {
        blockBuf.fill(0);
        for (const [note, voice] of this.active) {
          voice.block(blockBuf);
          if (voice.done) this.active.delete(note);
        }
        for (let i = 0; i < BLOCK; i++) {
          const sample = blockBuf[i] * FULL_SCALE;
          left[offset + i] = sample;
          right[offset + i] = sample;
        }
      }
    };
    node.connect(this.output);
    this.node = node;
  }

  selectPreset(value: string) {
    const idx = Number(value);
    const voice = this.voices[idx];
    if (voice) this.currentPatch = voice.patch;
  }

  noteOn(note: number, velocity: number) {
    if (!this.node || !this.currentPatch) return;
    this.active.delete(note); // corta a nota anterior na mesma tecla (retrigger)
    this.active.set(note, new Voice(this.currentPatch, { note, velocity, fs: this.ctx.sampleRate }));
  }

  noteOff(note: number) {
    this.active.get(note)?.keyup();
  }

  allNotesOff() {
    for (const voice of this.active.values()) voice.keyup();
    this.active.clear();
  }

  dispose() {
    if (this.node) {
      this.node.onaudioprocess = null;
      try {
        this.node.disconnect();
      } catch {
        /* já desconectado */
      }
    }
    this.node = null;
    this.active.clear();
  }
}
