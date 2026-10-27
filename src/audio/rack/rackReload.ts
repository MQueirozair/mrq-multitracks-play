import type { RackLayer, RackLayerFormat } from '../../../shared/types';
import { rackEngine } from './RackEngine';

/**
 * Reaplica no motor (RackEngine) todos os parâmetros do painel "Editar" de
 * uma camada a partir do estado persistido (Zustand) — usado tanto ao
 * restaurar a sessão anterior quanto depois de qualquer operação que recrie
 * o AudioContext do zero (ex.: troca do tamanho do buffer, ver
 * RackMidiPanel). Fica aqui (em vez de só dentro de InstrumentRack.tsx) pra
 * os dois lugares chamarem a mesma lógica, sem duplicar.
 */
export function applyLayerParamsToEngine(index: number, layer: RackLayer) {
  rackEngine.setCharacter(index, layer.character);
  rackEngine.setPan(index, layer.pan);
  rackEngine.setLayerVolume(index, layer.volume);
  rackEngine.setLayerMuted(index, layer.muted);
  rackEngine.setLayerSolo(index, layer.solo);
  rackEngine.setNoteRange(index, layer.noteRangeStart, layer.noteRangeEnd);
  rackEngine.setOctave(index, layer.octave);
  rackEngine.setMidiChannel(index, layer.midiChannel);
  rackEngine.setEnvelope(index, { enabled: layer.envelopeEnabled, attackMs: layer.attackMs, decayMs: layer.decayMs, releaseMs: layer.releaseMs });
  rackEngine.setVoiceMode(index, { playMode: layer.playMode, legato: layer.legato, glideMs: layer.glideMs });
  rackEngine.setFilter(index, { enabled: layer.filterEnabled, cutoffHz: layer.cutoffHz });
  rackEngine.setEqBands(index, layer.eqEnabled, layer.eqBands);
  rackEngine.setDrive(index, { enabled: layer.driveEnabled, type: layer.driveType, driveDb: layer.driveDb, mix: layer.driveMix });
  rackEngine.setLayerReverb(index, { enabled: layer.reverbEnabled, send: layer.reverbSend });
  rackEngine.setCompressor(index, {
    enabled: layer.compressorEnabled,
    amount: layer.compressorAmount,
    attackMs: layer.compressorAttackMs,
    releaseMs: layer.compressorReleaseMs,
  });
  rackEngine.setTremolo(index, {
    enabled: layer.tremoloEnabled,
    rateHz: layer.tremoloRateHz,
    depth: layer.tremoloDepth,
    stereo: layer.tremoloStereo,
  });
  rackEngine.setChorus(index, { enabled: layer.chorusEnabled, mix: layer.chorusMix });
  rackEngine.setDelay(index, {
    enabled: layer.delayEnabled,
    timeMs: layer.delayTimeMs,
    feedback: layer.delayFeedback,
    mix: layer.delayMix,
    sync: layer.delaySync,
    division: layer.delayDivision,
    pingPong: layer.delayPingPong,
  });
  rackEngine.setLayerOctaver(index, { enabled: layer.octaverEnabled, mode: layer.octaverMode, mix: layer.octaverMix });
}


/** Relê o arquivo do disco (via IPC) e carrega de novo o instrumento numa camada, reaplicando os parâmetros do painel "Editar". */
export async function reloadLayerFromDisk(
  index: number,
  filePath: string,
  format: RackLayerFormat,
  layer: RackLayer
): Promise<{ presets: { value: string; label: string }[]; presetToUse: string | null }> {
  const url = await window.api.fs.toFileUrl(filePath);
  const res = await fetch(url);
  if (!res.ok) throw new Error('arquivo não encontrado no disco');
  const buffer = await res.arrayBuffer();
  const presets = await rackEngine.loadLayer(index, buffer, format, layer.rootNote, filePath);
  const presetToUse = layer.selectedPreset ?? (presets.length ? presets[0].value : null);
  if (presetToUse) rackEngine.selectPreset(index, presetToUse);
  applyLayerParamsToEngine(index, layer);
  return { presets, presetToUse };
}

/**
 * Recarrega todas as camadas que têm um instrumento salvo (filePath+format)
 * a partir do estado persistido — usado ao restaurar a sessão anterior e
 * depois de recriar o AudioContext (troca de buffer). Camadas vazias só
 * recebem os parâmetros gerais (volume/mudo/solo/etc., que não dependem de
 * ter um instrumento carregado).
 */
export async function reloadAllRackLayers(
  layers: RackLayer[],
  onError?: (index: number, err: unknown) => void
): Promise<void> {
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    applyLayerParamsToEngine(index, layer);
    if (!layer.filePath || !layer.format) continue;
    try {
      await reloadLayerFromDisk(index, layer.filePath, layer.format, layer);
    } catch (err) {
      onError?.(index, err);
    }
  }
}
