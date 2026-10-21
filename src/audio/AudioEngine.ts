import { PitchShifter } from 'soundtouchjs';
import type { Song, SongArrangement, SongPart, SongTrack } from '../../shared/types';
import { semitoneDistance } from '../../shared/types';

export interface EngineTrackState {
  id: string;
  peakL: number;
  peakR: number;
}

export interface EngineState {
  isPlaying: boolean;
  isLoaded: boolean;
  isCountingIn: boolean;
  countInBeatsLeft: number;
  originalSeconds: number;
  realSeconds: number;
  realTotalSeconds: number;
  currentBar: number;
  activePartId: string | null;
  pendingPartId: string | null;
  loopActivePart: boolean;
  songEnded: boolean;
}

interface LoadedTrack {
  track: SongTrack;
  buffer: AudioBuffer;
  shifter: PitchShifter;
  gainNode: GainNode;
  merger: ChannelMergerNode;
  connected: boolean;
}

export type EngineListener = (state: EngineState) => void;

const MAX_OUTPUT_PAIRS = 16;

function logDiag(line: string) {
  try {
    console.log('[audio]', line);
    void window.api?.log?.append(line);
  } catch { /* noop */ }
}

function bytesPreview(buf: ArrayBuffer, n = 16): string {
  try {
    const arr = new Uint8Array(buf.slice(0, n));
    const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(arr).map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    return `${hex} | "${ascii}"`;
  } catch {
    return '(indisponivel)';
  }
}

function noteFrequency(note: string, octave = 3): number {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const idx = names.indexOf(note);
  if (idx < 0) return 220;
  const midi = (octave + 1) * 12 + idx;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class AudioEngine {
  ctx: AudioContext;
  private merger: ChannelMergerNode | null = null;
  private channelCount = 2;
  private tracks = new Map<string, LoadedTrack>();
  private song: Song | null = null;
  private referenceTrackId: string | null = null;
  private secPerBarOriginal = 2;
  private listeners = new Set<EngineListener>();
  private monitorHandle: ReturnType<typeof setInterval> | null = null;
  private lastIntegerBar = 1;
  private arrangementIndex = 0;
  private arrangementRepeatsLeft = 1;

  private state: EngineState = {
    isPlaying: false,
    isLoaded: false,
    isCountingIn: false,
    countInBeatsLeft: 0,
    originalSeconds: 0,
    realSeconds: 0,
    realTotalSeconds: 0,
    currentBar: 1,
    activePartId: null,
    pendingPartId: null,
    loopActivePart: false,
    songEnded: false,
  };

  private clickOsc: OscillatorNode | null = null;
  private clickGain: GainNode | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this.buildMerger(2);
  }

  // ---------------- infra ----------------

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const snapshot = { ...this.state };
    this.listeners.forEach((l) => l(snapshot));
  }

  private buildMerger(channelCount: number) {
    this.channelCount = Math.max(2, channelCount);
    if (this.merger) {
      try { this.merger.disconnect(); } catch { /* noop */ }
    }
    this.merger = this.ctx.createChannelMerger(this.channelCount);
    try {
      this.ctx.destination.channelCount = Math.min(this.channelCount, this.ctx.destination.maxChannelCount || this.channelCount);
      this.ctx.destination.channelInterpretation = 'discrete';
    } catch { /* alguns dispositivos não aceitam, seguimos no padrão estéreo */ }
    this.merger.connect(this.ctx.destination);
  }

  async setChannelCount(n: number) {
    const wasPlaying = this.state.isPlaying;
    this.buildMerger(n);
    for (const lt of this.tracks.values()) {
      if (lt.connected) {
        lt.gainNode.disconnect();
        this.connectTrackOutput(lt);
      }
    }
    if (wasPlaying) await this.ctx.resume();
  }

  async setOutputDevice(deviceId: string | null) {
    if (!deviceId || !this.ctx.setSinkId) return;
    try {
      await this.ctx.setSinkId(deviceId);
    } catch (err) {
      console.warn('[audio] não foi possível trocar o dispositivo de saída', err);
    }
  }

  private connectTrackOutput(lt: LoadedTrack) {
    if (!this.merger) return;
    const pairIndex = outputToPairIndex(lt.track.output);
    const left = Math.min(pairIndex * 2, this.channelCount - 1);
    const right = Math.min(pairIndex * 2 + 1, this.channelCount - 1);
    const splitter = this.ctx.createChannelSplitter(2);
    lt.gainNode.disconnect();
    lt.gainNode.connect(splitter);
    splitter.connect(this.merger, 0, left);
    splitter.connect(this.merger, lt.buffer.numberOfChannels > 1 ? 1 : 0, right);
  }

  // ---------------- carregamento ----------------

  async loadSong(song: Song, trackUrls: Record<string, string>): Promise<{ failed: { name: string; reason: string }[] }> {
    this.unloadSong();
    this.song = song;
    this.secPerBarOriginal = (60 / song.originalBpm) * song.timeSignatureNum;

    let maxDuration = 0;
    const failed: { name: string; reason: string }[] = [];
    // Cada faixa é carregada de forma independente: se uma faixa estiver corrompida,
    // num formato não suportado ou com o arquivo ausente, as demais continuam
    // carregando normalmente (importante para não travar o show inteiro por causa
    // de 1 arquivo problemático entre várias faixas).
    const decoded = await Promise.all(
      song.tracks.map(async (track) => {
        const url = trackUrls[track.id];
        logDiag(`faixa="${track.name}" filePath="${track.filePath}" url="${url ?? '(sem url)'}"`);
        if (!url) {
          logDiag(`faixa="${track.name}": FALHA - nenhuma URL foi resolvida para esse arquivo`);
          failed.push({ name: track.name, reason: 'arquivo nao encontrado' });
          return null;
        }

        let res: Response;
        try {
          res = await fetch(url);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logDiag(`faixa="${track.name}": FALHA DE ACESSO ao buscar "${url}" -> ${msg}`);
          failed.push({ name: track.name, reason: `nao foi possivel acessar o arquivo (${msg})` });
          return null;
        }
        if (!res.ok) {
          logDiag(`faixa="${track.name}": HTTP nao-OK status=${res.status} url="${url}"`);
          failed.push({ name: track.name, reason: `nao foi possivel ler o arquivo (HTTP ${res.status})` });
          return null;
        }

        let arrayBuffer: ArrayBuffer;
        try {
          arrayBuffer = await res.arrayBuffer();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logDiag(`faixa="${track.name}": FALHA ao ler bytes da resposta -> ${msg}`);
          failed.push({ name: track.name, reason: `falha ao ler os dados do arquivo (${msg})` });
          return null;
        }
        if (arrayBuffer.byteLength === 0) {
          logDiag(`faixa="${track.name}": arquivo retornou 0 bytes (url="${url}")`);
          failed.push({ name: track.name, reason: 'arquivo vazio' });
          return null;
        }
        logDiag(
          `faixa="${track.name}": bytes recebidos=${arrayBuffer.byteLength} content-type="${res.headers.get('content-type') ?? ''}" primeirosBytes=[${bytesPreview(arrayBuffer)}]`
        );

        try {
          // Não usamos mais `arrayBuffer` depois deste ponto, então passamos
          // ele direto para o decode em vez de duplicá-lo com slice(0) — isso
          // evita manter 2 cópias de cada arquivo (bruto + decodificado) na
          // memória ao mesmo tempo, o que é importante com várias faixas
          // grandes carregadas juntas (ex: 18 faixas de uma música ao vivo).
          const buffer = await this.ctx.decodeAudioData(arrayBuffer);
          logDiag(
            `faixa="${track.name}": OK duration=${buffer.duration.toFixed(2)}s sampleRate=${buffer.sampleRate} canais=${buffer.numberOfChannels}`
          );
          return { track, buffer };
        } catch (err) {
          const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          logDiag(
            `faixa="${track.name}": FALHA DE DECODE (bytes=${arrayBuffer.byteLength}) -> ${msg} | primeirosBytes=[${bytesPreview(arrayBuffer)}]`
          );
          failed.push({ name: track.name, reason: 'formato de audio nao suportado ou arquivo corrompido' });
          return null;
        }
      })
    );

    for (const item of decoded) {
      if (!item) continue;
      const { track, buffer } = item;
      const shifter = new PitchShifter(this.ctx, buffer, 4096);
      shifter.tempo = song.currentBpm / song.originalBpm;
      shifter.pitchSemitones = track.followsKey ? semitoneDistance(song.originalKey, song.currentKey) : 0;

      const gainNode = this.ctx.createGain();
      gainNode.gain.value = track.muted ? 0 : dbGain(track.volumeDb);
      shifter.connect(gainNode);

      const lt: LoadedTrack = { track, buffer, shifter, gainNode, merger: this.merger!, connected: false };
      this.tracks.set(track.id, lt);

      if (buffer.duration > maxDuration) {
        maxDuration = buffer.duration;
        this.referenceTrackId = track.id;
      }
    }

    const ref = this.referenceTrackId ? this.tracks.get(this.referenceTrackId) : null;
    if (ref) {
      ref.shifter.on('play', (detail: { timePlayed: number }) => {
        this.onReferenceTick(detail.timePlayed);
      });
    }

    this.applySoloMuteLogic();
    this.connectAll();
    this.state.isLoaded = this.tracks.size > 0;
    this.state.realTotalSeconds = maxDuration / (song.currentBpm / song.originalBpm);
    this.arrangementIndex = 0;
    const activeArr = this.getActiveArrangement();
    this.arrangementRepeatsLeft = activeArr?.steps[0]?.repeat ?? 1;
    this.seekToBar(1);
    this.startMonitor();
    this.emit();
    return { failed };
  }


  private connectAll() {
    for (const lt of this.tracks.values()) {
      this.connectTrackOutput(lt);
      lt.connected = true;
    }
  }

  unloadSong() {
    this.stopMonitor();
    for (const lt of this.tracks.values()) {
      try { lt.shifter.off(); lt.shifter.disconnect(); } catch { /* noop */ }
    }
    this.tracks.clear();
    this.referenceTrackId = null;
    this.song = null;
    this.state = { ...this.state, isLoaded: false, isPlaying: false, originalSeconds: 0, realSeconds: 0, activePartId: null };
  }

  // ---------------- transporte ----------------

  async play() {
    if (!this.song) return;
    await this.ctx.resume();
    this.state.isPlaying = true;
    this.state.songEnded = false;
    this.emit();
  }

  async pause() {
    await this.ctx.suspend();
    this.state.isPlaying = false;
    this.emit();
  }

  async stop() {
    await this.pause();
    const part = this.song?.parts.find((p) => p.id === this.state.activePartId);
    this.seekToBar(part ? part.startBar : 1);
  }

  async playCountIn(beats: number, bpm: number, onBeat: (n: number) => void) {
    await this.ctx.resume();
    this.state.isCountingIn = true;
    const beatDur = 60 / bpm;
    for (let i = 0; i < beats; i++) {
      this.state.countInBeatsLeft = beats - i;
      this.emit();
      onBeat(i);
      this.playClickBeat(i === 0);
      await sleep(beatDur * 1000);
    }
    this.state.isCountingIn = false;
    this.emit();
  }

  private playClickBeat(accent: boolean) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  seekToOriginalSeconds(origSec: number) {
    for (const lt of this.tracks.values()) {
      const frac = clamp01(origSec / lt.buffer.duration);
      lt.shifter.percentagePlayed = frac;
    }
    this.state.originalSeconds = origSec;
    this.updateDerivedTime();
    this.emit();
  }

  seekToBar(bar: number) {
    this.seekToOriginalSeconds((bar - 1) * this.secPerBarOriginal);
  }

  jumpToPart(partId: string, quantized = true) {
    if (!this.song) return;
    const part = this.song.parts.find((p) => p.id === partId);
    if (!part) return;
    if (!this.state.isPlaying || !quantized) {
      this.seekToBar(part.startBar);
      this.state.activePartId = partId;
      this.state.pendingPartId = null;
      this.syncArrangementPointerTo(partId);
      this.emit();
    } else {
      this.state.pendingPartId = partId;
      this.emit();
    }
  }

  /** Quando o usuário pula manualmente para uma parte, realinha o ponteiro do arranjo ativo. */
  private syncArrangementPointerTo(partId: string) {
    const arrangement = this.getActiveArrangement();
    if (!arrangement) return;
    const idx = arrangement.steps.findIndex((s) => s.partId === partId);
    if (idx >= 0) {
      this.arrangementIndex = idx;
      this.arrangementRepeatsLeft = arrangement.steps[idx].repeat;
    }
  }

  setLoopActivePart(loop: boolean) {
    this.state.loopActivePart = loop;
    this.emit();
  }

  updateParts(parts: SongPart[]) {
    if (!this.song) return;
    this.song.parts = parts;
  }

  updateArrangements(arrangements: SongArrangement[], activeId: string | null) {
    if (!this.song) return;
    const changed = this.song.activeArrangementId !== activeId;
    this.song.arrangements = arrangements;
    this.song.activeArrangementId = activeId;
    if (changed) {
      this.arrangementIndex = 0;
      const arr = arrangements.find((a) => a.id === activeId);
      this.arrangementRepeatsLeft = arr?.steps[0]?.repeat ?? 1;
    }
  }

  private getActiveArrangement(): SongArrangement | null {
    if (!this.song?.activeArrangementId) return null;
    return this.song.arrangements.find((a) => a.id === this.song!.activeArrangementId) ?? null;
  }

  // ---------------- parâmetros musicais ----------------

  setBpm(bpm: number) {
    if (!this.song) return;
    const beforeOriginalSec = this.state.originalSeconds;
    this.song.currentBpm = bpm;
    const ratio = bpm / this.song.originalBpm;
    for (const lt of this.tracks.values()) lt.shifter.tempo = ratio;
    this.seekToOriginalSeconds(beforeOriginalSec);
  }

  setKey(key: string) {
    if (!this.song) return;
    this.song.currentKey = key;
    for (const lt of this.tracks.values()) {
      const semis = lt.track.followsKey ? semitoneDistance(this.song.originalKey, key) : 0;
      lt.shifter.pitchSemitones = semis;
    }
  }

  setTrackFollowsKey(trackId: string, follow: boolean) {
    const lt = this.tracks.get(trackId);
    if (!lt || !this.song) return;
    lt.track.followsKey = follow;
    lt.shifter.pitchSemitones = follow ? semitoneDistance(this.song.originalKey, this.song.currentKey) : 0;
  }

  setTrackVolumeDb(trackId: string, db: number) {
    const lt = this.tracks.get(trackId);
    if (!lt) return;
    lt.track.volumeDb = db;
    this.applySoloMuteLogic();
  }

  setTrackMuted(trackId: string, muted: boolean) {
    const lt = this.tracks.get(trackId);
    if (!lt) return;
    lt.track.muted = muted;
    this.applySoloMuteLogic();
  }

  setTrackSolo(trackId: string, solo: boolean) {
    const lt = this.tracks.get(trackId);
    if (!lt) return;
    lt.track.solo = solo;
    this.applySoloMuteLogic();
  }

  setTrackOutput(trackId: string, output: string) {
    const lt = this.tracks.get(trackId);
    if (!lt) return;
    lt.track.output = output;
    this.connectTrackOutput(lt);
  }

  private applySoloMuteLogic() {
    const anySolo = Array.from(this.tracks.values()).some((lt) => lt.track.solo);
    for (const lt of this.tracks.values()) {
      const audible = anySolo ? lt.track.solo : !lt.track.muted;
      const target = audible ? dbGain(lt.track.volumeDb) : 0;
      lt.gainNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.01);
    }
  }

  // ---------------- loop de monitoramento ----------------

  private onReferenceTick(originalSeconds: number) {
    this.state.originalSeconds = originalSeconds;
    this.updateDerivedTime();
  }

  private updateDerivedTime() {
    if (!this.song) return;
    this.state.currentBar = 1 + this.state.originalSeconds / this.secPerBarOriginal;
    const ratio = this.song.currentBpm / this.song.originalBpm;
    this.state.realSeconds = this.state.originalSeconds / ratio;
  }

  private startMonitor() {
    this.stopMonitor();
    this.lastIntegerBar = Math.floor(this.state.currentBar);
    this.monitorHandle = setInterval(() => this.tick(), 40);
  }

  private stopMonitor() {
    if (this.monitorHandle) clearInterval(this.monitorHandle);
    this.monitorHandle = null;
  }

  private tick() {
    if (!this.song) return;
    const bar = this.state.currentBar;
    const barInt = Math.floor(bar);

    // troca quantizada manual: dispara exatamente na virada do compasso, tem prioridade
    if (this.state.pendingPartId && barInt !== this.lastIntegerBar) {
      const target = this.state.pendingPartId;
      this.state.pendingPartId = null;
      this.jumpToPart(target, false);
      this.lastIntegerBar = barInt;
      this.emit();
      return;
    }

    if (!this.state.pendingPartId) {
      const current = this.song.parts.find((p) => bar >= p.startBar && bar < p.endBar);
      if (current && current.id !== this.state.activePartId) {
        this.state.activePartId = current.id;
      }
    }

    const activePart = this.song.parts.find((p) => p.id === this.state.activePartId);

    // loop da parte ativa tem prioridade sobre o avanço automático do arranjo
    if (this.state.loopActivePart && activePart && bar >= activePart.endBar) {
      this.seekToBar(activePart.startBar);
      this.lastIntegerBar = barInt;
      this.emit();
      return;
    }

    const arrangement = this.getActiveArrangement();
    if (arrangement && arrangement.steps.length > 0 && !this.state.pendingPartId) {
      this.tickArrangement(arrangement, bar);
      this.lastIntegerBar = barInt;
      this.emit();
      return;
    }

    // sem arranjo customizado: segue a ordem original e para ao fim da última parte
    const isLastPart = activePart && this.song.parts[this.song.parts.length - 1]?.id === activePart.id;
    const reachedEndOfAudio = this.state.realSeconds >= this.state.realTotalSeconds - 0.03;
    if ((isLastPart && bar >= activePart!.endBar) || reachedEndOfAudio) {
      // A checagem por duração real (reachedEndOfAudio) é um reforço: garante que a
      // música pare quando o áudio de fato termina, mesmo quando a única parte
      // marcada é o placeholder "Música inteira" (endBar muito maior que o real).
      this.state.songEnded = true;
      this.pause();
    }

    this.lastIntegerBar = barInt;
    this.emit();
  }

  private tickArrangement(arrangement: SongArrangement, bar: number) {
    const step = arrangement.steps[this.arrangementIndex];
    const part = step ? this.song!.parts.find((p) => p.id === step.partId) : null;
    if (!part) return;
    if (part.id !== this.state.activePartId) this.state.activePartId = part.id;
    if (bar < part.endBar) return;

    this.arrangementRepeatsLeft -= 1;
    if (this.arrangementRepeatsLeft > 0) {
      this.seekToBar(part.startBar);
      return;
    }

    const isLastStep = this.arrangementIndex === arrangement.steps.length - 1;
    const nextIndex = (this.arrangementIndex + 1) % arrangement.steps.length;
    this.arrangementIndex = nextIndex;
    const nextStep = arrangement.steps[nextIndex];
    this.arrangementRepeatsLeft = nextStep?.repeat ?? 1;
    const nextPart = nextStep ? this.song!.parts.find((p) => p.id === nextStep.partId) : null;

    if (isLastStep) {
      this.state.songEnded = true;
      this.pause();
      this.arrangementIndex = 0;
      this.arrangementRepeatsLeft = arrangement.steps[0]?.repeat ?? 1;
      this.seekToBar((nextPart ?? part).startBar);
      return;
    }

    if (nextPart) {
      this.seekToBar(nextPart.startBar);
      this.state.activePartId = nextPart.id;
    }
  }

  getSong() {
    return this.song;
  }

  getTrackBuffer(trackId: string): AudioBuffer | null {
    return this.tracks.get(trackId)?.buffer ?? null;
  }

  getState() {
    return this.state;
  }
}

function dbGain(db: number): number {
  return Math.pow(10, db / 20);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function outputToPairIndex(output: string): number {
  const match = output.match(/(\d+)/);
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  return Math.min(Math.max(0, Math.floor((n - 1) / 2)), MAX_OUTPUT_PAIRS - 1);
}

export function pairIndexLabel(index: number): string {
  return `Estéreo (${index * 2 + 1}/${index * 2 + 2})`;
}

export function buildPartFromBars(startBar: number, endBar: number, name: string, type: SongPart['type'], color: string): SongPart {
  return { id: crypto.randomUUID(), name, type, startBar, endBar, color };
}
