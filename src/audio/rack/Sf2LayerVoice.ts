import * as JSSynth from 'js-synthesizer';
import { SoundFont2 } from 'soundfont2';
import type { RackPresetOption } from '../../../shared/types';
import { loadScriptOnce } from './loadScript';

// Caminho relativo ao index.html publicado (ver public/vendor/js-synthesizer/*,
// copiado verbatim pelo Vite pro build final — vite.config.ts usa base: './').
const LIBFLUIDSYNTH_URL = './vendor/js-synthesizer/libfluidsynth-2.4.6-with-libsndfile.js';

let readyPromise: Promise<void> | null = null;

/** Garante que o motor FluidSynth (WASM) esteja carregado, uma única vez pro processo inteiro. */
function ensureFluidSynthReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = loadScriptOnce(LIBFLUIDSYNTH_URL).then(() => JSSynth.waitForReady());
  }
  return readyPromise;
}

/**
 * Uma camada que toca um SoundFont (.sf2/.sf3) real, via FluidSynth compilado
 * pra WebAssembly (js-synthesizer). Cada camada tem sua própria instância do
 * sintetizador (mais simples e mais isolado que compartilhar uma só com offsets
 * de banco entre camadas) e usa sempre o canal MIDI 0 internamente.
 */
export class Sf2LayerVoice {
  private ctx: AudioContext;
  private synth: JSSynth.Synthesizer | null = null;
  private node: AudioNode | null = null;
  readonly output: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
  }

  async load(buffer: ArrayBuffer): Promise<RackPresetOption[]> {
    await ensureFluidSynthReady();
    this.dispose();
    const synth = new JSSynth.Synthesizer();
    synth.init(this.ctx.sampleRate);
    await synth.loadSFont(buffer);
    this.synth = synth;
    this.node = synth.createAudioNode(this.ctx, 4096);
    this.node.connect(this.output);

    let sf: SoundFont2 | null = null;
    try {
      sf = new SoundFont2(new Uint8Array(buffer));
    } catch (err) {
      console.warn('[rack] não foi possível ler a lista de presets do SoundFont', err);
    }
    const presets: RackPresetOption[] = (sf?.presets ?? [])
      .map((p) => ({
        value: `${p.header.bank}:${p.header.preset}`,
        label: `${p.header.bank}:${p.header.preset} ${p.header.name}`.trim(),
      }))
      .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
    if (presets.length > 0) this.selectPreset(presets[0].value);
    return presets;
  }

  selectPreset(value: string) {
    if (!this.synth) return;
    const [bankStr, programStr] = value.split(':');
    const bank = Number(bankStr) || 0;
    const program = Number(programStr) || 0;
    this.synth.midiBankSelect(0, bank);
    this.synth.midiProgramChange(0, program);
  }

  noteOn(note: number, velocity: number) {
    this.synth?.midiNoteOn(0, note, velocity);
  }

  noteOff(note: number) {
    this.synth?.midiNoteOff(0, note);
  }

  allNotesOff() {
    this.synth?.midiAllNotesOff(0);
  }

  dispose() {
    try {
      this.node?.disconnect();
    } catch {
      /* já desconectado */
    }
    try {
      this.synth?.close();
    } catch {
      /* ignorar erro ao fechar */
    }
    this.synth = null;
    this.node = null;
  }
}
