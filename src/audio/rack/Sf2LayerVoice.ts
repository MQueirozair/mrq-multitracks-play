import * as JSSynth from 'js-synthesizer';
import { SoundFont2 } from 'soundfont2';
import type { RackPresetOption } from '../../../shared/types';

// Caminhos relativos ao index.html publicado (ver public/vendor/js-synthesizer/*,
// copiado verbatim pelo Vite pro build final — vite.config.ts usa base: './').
const LIBFLUIDSYNTH_URL = './vendor/js-synthesizer/libfluidsynth-2.4.6-with-libsndfile.js';
const WORKLET_URL = './vendor/js-synthesizer/js-synthesizer.worklet.min.js';

// Os dois módulos de AudioWorklet (libfluidsynth + js-synthesizer) só podem ser
// adicionados uma vez por AudioContext. Como as 4 camadas do rack compartilham
// um único AudioContext (ver RackEngine), guardamos a promessa por instância de
// contexto para todas as camadas reaproveitarem o mesmo carregamento.
const workletReadyByContext = new WeakMap<AudioContext, Promise<void>>();

function ensureWorkletReady(ctx: AudioContext): Promise<void> {
  let ready = workletReadyByContext.get(ctx);
  if (!ready) {
    ready = ctx.audioWorklet
      .addModule(LIBFLUIDSYNTH_URL)
      .then(() => ctx.audioWorklet.addModule(WORKLET_URL));
    workletReadyByContext.set(ctx, ready);
  }
  return ready;
}

/**
 * Uma camada que toca um SoundFont (.sf2/.sf3) real, via FluidSynth compilado
 * pra WebAssembly (js-synthesizer), rodando dentro de um AudioWorklet — e não
 * mais num ScriptProcessorNode. Isso é o que elimina o atraso perceptível ao
 * tocar: o ScriptProcessorNode antigo usava um buffer de 4096 amostras (até
 * ~185ms de atraso no pior caso, por causa do duplo buffer), enquanto o
 * AudioWorklet roda no "render quantum" nativo do Web Audio (128 amostras,
 * ~3ms) e recebe os eventos de nota via uma porta de mensagens de altíssima
 * prioridade, sem depender da thread principal (que pode estar ocupada com
 * React/UI) para gerar áudio.
 */
export class Sf2LayerVoice {
  private ctx: AudioContext;
  private synth: JSSynth.AudioWorkletNodeSynthesizer | null = null;
  private node: AudioWorkletNode | null = null;
  readonly output: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
  }

  async load(buffer: ArrayBuffer): Promise<RackPresetOption[]> {
    await ensureWorkletReady(this.ctx);
    this.dispose();
    const synth = new JSSynth.AudioWorkletNodeSynthesizer();
    synth.init(this.ctx.sampleRate);
    // createAudioNode precisa ser chamado antes de qualquer outro método (é o
    // que estabelece a porta de mensagens com o worklet).
    this.node = synth.createAudioNode(this.ctx);
    this.node.connect(this.output);
    this.synth = synth;
    await synth.loadSFont(buffer);

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

  /**
   * Pitch bend em semitons (ver RackEngine.PITCH_BEND_RANGE_SEMITONES) — usa
   * a roda de pitch bend nativa do FluidSynth, que já afeta as notas em
   * andamento (não só as novas). O valor bruto é de 14 bits (0..16383,
   * 8192 = centro), e o FluidSynth por padrão interpreta ±8192 como ±2
   * semitons (faixa de pitch bend padrão do General MIDI).
   */
  setPitchBend(semitones: number) {
    const raw = Math.round(8192 + (semitones / 2) * 8192);
    this.synth?.midiPitchBend(0, Math.max(0, Math.min(16383, raw)));
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
