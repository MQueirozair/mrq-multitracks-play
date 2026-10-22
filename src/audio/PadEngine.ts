const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteFrequency(note: string, octave = 3): number {
  const idx = NOTE_NAMES.indexOf(note);
  if (idx < 0) return 220;
  const midi = (octave + 1) * 12 + idx;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Pad contínuo sintetizado: dois osciladores desafinados + filtro, com crossfade
 * suave ao trocar de tom e fade in/out configuráveis.
 */
export class PadEngine {
  private ctx: AudioContext;
  private output: GainNode;
  private voices: { osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode }[] = [];
  private isOn = false;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0.5;
    this.output.connect(destination);
  }

  setVolumeDb(db: number) {
    this.output.gain.setTargetAtTime(Math.pow(10, db / 20), this.ctx.currentTime, 0.05);
  }

  start(note: string, fadeSec: number) {
    this.stopInternal(fadeSec);
    const t = this.ctx.currentTime;
    const freq = noteFrequency(note, 2);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + Math.max(0.05, fadeSec));

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = freq;
    osc1.detune.value = -6;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = freq;
    osc2.detune.value = 6;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);

    osc1.start();
    osc2.start();
    this.voices.push({ osc1, osc2, gain });
    this.isOn = true;
  }

  changeKey(note: string, crossfadeSec: number) {
    if (!this.isOn) return;
    this.start(note, crossfadeSec);
  }

  stop(fadeSec = 1.5) {
    this.stopInternal(fadeSec);
    this.isOn = false;
  }

  private stopInternal(fadeSec: number) {
    const t = this.ctx.currentTime;
    const old = [...this.voices];
    this.voices = [];
    for (const v of old) {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + Math.max(0.05, fadeSec));
      v.osc1.stop(t + fadeSec + 0.1);
      v.osc2.stop(t + fadeSec + 0.1);
    }
  }

  get playing() {
    return this.isOn;
  }
}
