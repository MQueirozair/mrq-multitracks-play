/**
 * Cliente fino do formato `.mrq` ("MRQ Instrument") — Fase 2 do MRQ
 * Instrument Converter (ver docs/mrq-converter-architecture.md). Toda a
 * codificação FLAC, hashing e empacotamento binário roda no backend Rust
 * (`src-tauri/src/mrq/`), não no WebView — só os tipos e os wrappers de
 * `invoke` moram aqui. Este módulo é novo e independente: NÃO toca em
 * `mrqiFormat.ts`/`mrqiExport.ts`/`MrqiLayerVoice.ts` (formato `.mrqi`
 * existente, que continua funcionando exatamente como antes) nem é usado
 * por nenhum carregador do Rack ainda — isso só entra numa fase futura,
 * depois de validado.
 *
 * Só funciona rodando dentro do Tauri (usa `@tauri-apps/api/core`
 * diretamente) — o MRQ Instrument Converter é funcionalidade nova, sem
 * necessidade de equivalente no build legado em Electron.
 */

import { invoke } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// MRQ Instrument Model — espelha 1:1 as structs serde de
// src-tauri/src/mrq/model.rs. Nenhum campo é inventado por importadores:
// tudo que uma fonte não puder prover fica `undefined`.
// ---------------------------------------------------------------------------

export interface MrqEnvelope {
  attack: number;
  hold?: number;
  decay: number;
  sustain: number;
  release: number;
}

export type MrqFilterType = 'lowpass' | 'highpass' | 'bandpass';

export interface MrqFilter {
  filterType: MrqFilterType;
  cutoffHz: number;
  resonance: number;
}

export type MrqModulationSource = 'lfo' | 'envelope2' | 'velocity' | 'aftertouch' | 'modwheel';
export type MrqModulationDestination = 'pitch' | 'cutoff' | 'volume' | 'pan';

export interface MrqModulation {
  source: MrqModulationSource;
  destination: MrqModulationDestination;
  amount: number;
}

export type MrqStereoMode = 'mono' | 'stereo' | 'left' | 'right';

export interface MrqZone {
  /** Referencia o `id` passado para `mrqBuilderAddSample` na mesma sessão. */
  sampleId: string;
  rootNote: number;
  loKey: number;
  hiKey: number;
  loVel: number;
  hiVel: number;
  roundRobinGroup?: string;
  roundRobinIndex?: number;
  tuneCents: number;
  volumeDb: number;
  pan: number;
  stereo?: MrqStereoMode;
  loopEnabled?: boolean;
  loopStart?: number;
  loopEnd?: number;
  envelope?: MrqEnvelope;
  filter?: MrqFilter;
}

export interface MrqGroup {
  id: string;
  name: string;
  zones: MrqZone[];
  envelope?: MrqEnvelope;
  filter?: MrqFilter;
  modulation?: MrqModulation[];
}

export interface MrqPreset {
  id: string;
  name: string;
  groups: MrqGroup[];
}

export interface MrqMidiConfig {
  pitchBendRangeSemitones?: number;
  defaultChannel?: number;
  transposeSemitones?: number;
}

export type MrqSourceFormat =
  | 'sf2'
  | 'sf3'
  | 'sfz'
  | 'npno'
  | 'nsmp'
  | 'syx-dx7'
  | 'nki'
  | 'wav'
  | 'aiff'
  | 'flac'
  | 'mp3'
  | 'ogg';

export interface MrqInstrumentModel {
  name: string;
  sourceFormat: MrqSourceFormat;
  importedAt: string;
  presets: MrqPreset[];
  midi?: MrqMidiConfig;
}

export interface MrqSampleIndexEntry {
  id: string;
  relativeOffset: number;
  length: number;
  sha256: string;
  sampleRateHz: number;
  channels: number;
  bitsPerSampleOriginal?: number;
  bitsPerSampleEncoded: number;
  convertedFromFloat32: boolean;
  codec: string;
}

export interface MrqFileMetadata {
  formatVersion: number;
  instrument: MrqInstrumentModel;
  samples: MrqSampleIndexEntry[];
}

export interface MrqFinishResult {
  path: string;
  sampleCount: number;
}

export interface MrqSampleIntegrity {
  sampleId: string;
  ok: boolean;
}

export interface MrqIntegrityReport {
  globalOk: boolean;
  perSample: MrqSampleIntegrity[];
}

export interface MrqDecodedSample {
  sampleId: string;
  /** PCM Float32 intercalado, -1.0..1.0 — pronto pra virar AudioBuffer. */
  interleaved: Float32Array | number[];
  sampleRateHz: number;
  channels: number;
  bitsPerSampleEncoded: number;
}

/** Entrada de amostra aceita por `mrqBuilderAddSample` — ver
 *  `MrqSampleSourceInput` em model.rs pro porquê das duas formas. */
export type MrqSampleSourceInput =
  | { kind: 'integerPcm'; bitsPerSample: number; interleaved: number[] | Int32Array }
  | { kind: 'float32'; interleaved: number[] | Float32Array; targetBitsPerSample?: number };

/** Formato estruturado de erro devolvido por qualquer comando `mrq_*` — ver
 *  `MrqError` em errors.rs. Sempre tem `kind`; os demais campos variam por
 *  variante (ver comentário em cada uso). */
export interface MrqError {
  kind: string;
  message?: string;
  found?: number;
  expected?: number;
  neededAtLeast?: number;
  available?: number;
  declared?: number;
  maxAllowed?: number;
  sampleId?: string;
  sessionId?: string;
}

export function isMrqError(e: unknown): e is MrqError {
  return typeof e === 'object' && e !== null && typeof (e as { kind?: unknown }).kind === 'string';
}

// ---------------------------------------------------------------------------
// Wrappers de invoke — nomes dos comandos Tauri em snake_case (ver
// src-tauri/src/mrq/commands.rs); API JS em camelCase, como o resto do
// projeto (ver tauriBridge.ts).
// ---------------------------------------------------------------------------

export function mrqBuilderBegin(finalPath: string, instrument: MrqInstrumentModel): Promise<string> {
  return invoke('mrq_builder_begin', { finalPath, instrument });
}

export function mrqBuilderAddSample(
  sessionId: string,
  sampleId: string,
  source: MrqSampleSourceInput,
  sampleRateHz: number,
  channels: number
): Promise<MrqSampleIndexEntry> {
  return invoke('mrq_builder_add_sample', { sessionId, sampleId, source, sampleRateHz, channels });
}

export function mrqBuilderFinish(sessionId: string): Promise<MrqFinishResult> {
  return invoke('mrq_builder_finish', { sessionId });
}

export function mrqBuilderAbort(sessionId: string): Promise<void> {
  return invoke('mrq_builder_abort', { sessionId });
}

export function mrqReadMetadata(path: string): Promise<MrqFileMetadata> {
  return invoke('mrq_read_metadata', { path });
}

export function mrqReadSampleIndex(path: string): Promise<MrqSampleIndexEntry[]> {
  return invoke('mrq_read_sample_index', { path });
}

export function mrqExtractSample(path: string, sampleId: string): Promise<MrqDecodedSample> {
  return invoke('mrq_extract_sample', { path, sampleId });
}

export function mrqValidateIntegrity(path: string): Promise<MrqIntegrityReport> {
  return invoke('mrq_validate_integrity', { path });
}
