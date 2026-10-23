const ATTACK_SEC = 0.003;
const RELEASE_SEC = 0.12;

/**
 * Camada "Piano / Amostra": toca um único arquivo de áudio do próprio usuário
 * (.wav/.aiff/.flac/.ogg/.mp3), reamostrado pela taxa de reprodução pra cada
 * tecla a partir de uma nota raiz configurável. Existe no lugar da decodificação
 * de arquivos .npno da Nord Piano Library — formato fechado e criptografado que
 * a própria Clavia nunca documentou publicamente (ver aviso mostrado no app ao
 * tentar carregar um .npno, e o relatório desta função pro usuário).
 */
export class SamplerLayerVoice {
  private ctx: AudioContext;
  private buffer: AudioBuffer | null = null;
  private rootNote = 60;
  private active = new Map<number, { src: AudioBufferSourceNode; gain: GainNode }>();
  readonly output: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
  }

  async load(buffer: ArrayBuffer, rootNote = 60): Promise<void> {
    this.dispose();
    this.buffer = await this.ctx.decodeAudioData(buffer.slice(0));
    this.rootNote = rootNote;
  }

  setRootNote(note: number) {
    this.rootNote = note;
  }

  noteOn(note: number, velocity: number) {
    if (!this.buffer) return;
    this.stopNote(note, 0.01);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = Math.pow(2, (note - this.rootNote) / 12);
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const target = Math.max(0, Math.min(1, velocity / 127));
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(target, now + ATTACK_SEC);
    src.connect(gain);
    gain.connect(this.output);
    src.start();
    src.onended = () => {
      try {
        gain.disconnect();
      } catch {
        /* já desconectado */
      }
    };
    this.active.set(note, { src, gain });
  }

  noteOff(note: number) {
    this.stopNote(note, RELEASE_SEC);
  }

  private stopNote(note: number, fadeSec: number) {
    const voice = this.active.get(note);
    if (!voice) return;
    this.active.delete(note);
    const now = this.ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + fadeSec);
      voice.src.stop(now + fadeSec + 0.02);
    } catch {
      /* fonte já parada */
    }
  }

  allNotesOff() {
    for (const note of Array.from(this.active.keys())) this.stopNote(note, 0.05);
  }

  dispose() {
    this.allNotesOff();
    this.buffer = null;
  }
}
