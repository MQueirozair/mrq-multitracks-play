import { useEffect, useRef, useState } from 'react';
import { AudioLines, Image as ImageIcon, Piano, Plus, Volume2, X as XIcon } from 'lucide-react';
import { useStore } from '../state/useStore';
import type { RackCharacter, RackDriveType, RackLayer, RackLayerFormat } from '../../shared/types';
import { rackEngine, detectRackFormat } from '../audio/rack/RackEngine';

const CHARACTER_OPTIONS: { value: RackCharacter; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'soft', label: 'Soft' },
  { value: 'bright', label: 'Bright' },
  { value: 'warm', label: 'Warm' },
];

const DRIVE_TYPE_OPTIONS: { value: RackDriveType; label: string }[] = [
  { value: 'warm', label: 'Warm / suave' },
  { value: 'hard', label: 'Hard / agressivo' },
  { value: 'tube', label: 'Tube / válvula' },
];

const FORMAT_BADGE: Record<RackLayerFormat, string> = {
  sf2: 'SOUNDFONT / SF2',
  dx7: 'FM YAMAHA / DX7',
  sampler: 'PIANO / AMOSTRA',
  npno: 'PIANO NORD / NPNO',
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteLabel(n: number): string {
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}

/**
 * Rack de instrumentos ao vivo: 4 camadas tocáveis simultaneamente por um
 * teclado MIDI físico conectado, cada uma carregando um arquivo de instrumento
 * real do usuário (SoundFont .sf2/.sf3, banco DX7 .syx, amostra de áudio, ou
 * biblioteca de piano Nord .npno). A configuração do teclado MIDI físico
 * (dispositivo, curva de velocidade, transposição, sustain) fica em
 * RackMidiPanel, na barra de título. O .npno é decodificado de verdade pelo
 * crate nord-format compilado pra WebAssembly — ver NpnoLayerVoice.ts.
 */
export default function InstrumentRack() {
  const rack = useStore((s) => s.settings.rack);
  const updateRack = useStore((s) => s.updateRack);
  const updateRackLayer = useStore((s) => s.updateRackLayer);
  const pushToast = useStore((s) => s.pushToast);

  const [loadingLayer, setLoadingLayer] = useState<number | null>(null);
  const restoredRef = useRef(false);
  const rackRef = useRef(rack);
  rackRef.current = rack;

  useEffect(() => {
    rackEngine.resume().catch(() => {});
  }, []);

  useEffect(() => {
    rackEngine.setMasterVolume(rack.masterVolume);
  }, [rack.masterVolume]);

  useEffect(() => {
    rackEngine.setReverb(rack.reverb);
  }, [rack.reverb]);

  // Restaura, uma única vez ao abrir a aba, os instrumentos que já estavam carregados da última sessão.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    rackRef.current.layers.forEach((layer, index) => {
      applyLayerParamsToEngine(index, layer);
      if (!layer.filePath || !layer.format) return;
      reloadLayerFromDisk(index, layer.filePath, layer.format, layer).catch((err: Error) => {
        pushToast(`Não foi possível recarregar o instrumento da camada ${index + 1}: ${err.message ?? err}`, 'error');
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyLayerParamsToEngine(index: number, layer: RackLayer) {
    rackEngine.setCharacter(index, layer.character);
    rackEngine.setLayerVolume(index, layer.volume);
    rackEngine.setLayerMuted(index, layer.muted);
    rackEngine.setLayerSolo(index, layer.solo);
    rackEngine.setNoteRange(index, layer.noteRangeStart, layer.noteRangeEnd);
    rackEngine.setOctave(index, layer.octave);
    rackEngine.setMidiChannel(index, layer.midiChannel);
    rackEngine.setEnvelope(index, { enabled: layer.envelopeEnabled, attackMs: layer.attackMs, releaseMs: layer.releaseMs });
    rackEngine.setFilter(index, { enabled: layer.filterEnabled, cutoffHz: layer.cutoffHz });
    rackEngine.setEq(index, {
      enabled: layer.eqEnabled,
      bassDb: layer.eqBassDb,
      midDb: layer.eqMidDb,
      trebleDb: layer.eqTrebleDb,
      midFreqHz: layer.eqMidFreqHz,
    });
    rackEngine.setDrive(index, { enabled: layer.driveEnabled, type: layer.driveType, driveDb: layer.driveDb, mix: layer.driveMix });
  }

  async function reloadLayerFromDisk(index: number, filePath: string, format: RackLayerFormat, layer: RackLayer) {
    setLoadingLayer(index);
    try {
      const url = await window.api.fs.toFileUrl(filePath);
      const res = await fetch(url);
      if (!res.ok) throw new Error('arquivo não encontrado no disco');
      const buffer = await res.arrayBuffer();
      const presets = await rackEngine.loadLayer(index, buffer, format, layer.rootNote);
      const presetToUse = layer.selectedPreset ?? (presets.length ? presets[0].value : null);
      if (presetToUse) rackEngine.selectPreset(index, presetToUse);
      applyLayerParamsToEngine(index, layer);
      return { presets, presetToUse };
    } finally {
      setLoadingLayer((v) => (v === index ? null : v));
    }
  }

  async function handleLoad(index: number) {
    const filePath = await window.api.fs.chooseInstrumentFile();
    if (!filePath) return;
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
    const detected = detectRackFormat(fileName);
    if (!detected) {
      pushToast(`Formato de arquivo não reconhecido: ${fileName}`, 'error');
      return;
    }
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const draftLayer: RackLayer = {
      ...rack.layers[index],
      format: detected,
      filePath,
      fileName,
      selectedPreset: null,
      displayName: baseName,
    };
    try {
      const { presets, presetToUse } = await reloadLayerFromDisk(index, filePath, detected, draftLayer);
      updateRackLayer(index, {
        format: detected,
        filePath,
        fileName,
        displayName: baseName,
        presets,
        selectedPreset: presetToUse,
      });
    } catch (err: any) {
      pushToast(`Não foi possível carregar "${fileName}": ${err?.message ?? err}`, 'error');
    }
  }

  function handleClear(index: number) {
    rackEngine.clearLayer(index);
    updateRackLayer(index, {
      format: null,
      filePath: null,
      fileName: null,
      displayName: null,
      presets: [],
      selectedPreset: null,
    });
  }

  function handlePresetChange(index: number, value: string) {
    rackEngine.selectPreset(index, value);
    updateRackLayer(index, { selectedPreset: value });
  }

  function handleCharacterChange(index: number, character: RackCharacter) {
    rackEngine.setCharacter(index, character);
    updateRackLayer(index, { character });
  }

  function handleVolumeChange(index: number, volume: number) {
    rackEngine.setLayerVolume(index, volume);
    updateRackLayer(index, { volume });
  }

  function handleRootNoteChange(index: number, note: number) {
    rackEngine.setRootNote(index, note);
    updateRackLayer(index, { rootNote: note });
  }

  function handleToggleMute(index: number) {
    const next = !rack.layers[index].muted;
    rackEngine.setLayerMuted(index, next);
    updateRackLayer(index, { muted: next });
  }

  function handleToggleSolo(index: number) {
    const next = !rack.layers[index].solo;
    rackEngine.setLayerSolo(index, next);
    updateRackLayer(index, { solo: next });
  }

  function handleEditPatch(index: number, patch: Partial<RackLayer>) {
    const layer = { ...rack.layers[index], ...patch };
    updateRackLayer(index, patch);
    if ('noteRangeStart' in patch || 'noteRangeEnd' in patch) {
      rackEngine.setNoteRange(index, layer.noteRangeStart, layer.noteRangeEnd);
    }
    if ('octave' in patch) rackEngine.setOctave(index, layer.octave);
    if ('midiChannel' in patch) rackEngine.setMidiChannel(index, layer.midiChannel);
    if ('envelopeEnabled' in patch || 'attackMs' in patch || 'releaseMs' in patch) {
      rackEngine.setEnvelope(index, { enabled: layer.envelopeEnabled, attackMs: layer.attackMs, releaseMs: layer.releaseMs });
    }
    if ('filterEnabled' in patch || 'cutoffHz' in patch) {
      rackEngine.setFilter(index, { enabled: layer.filterEnabled, cutoffHz: layer.cutoffHz });
    }
    if ('eqEnabled' in patch || 'eqBassDb' in patch || 'eqMidDb' in patch || 'eqTrebleDb' in patch || 'eqMidFreqHz' in patch) {
      rackEngine.setEq(index, {
        enabled: layer.eqEnabled,
        bassDb: layer.eqBassDb,
        midDb: layer.eqMidDb,
        trebleDb: layer.eqTrebleDb,
        midFreqHz: layer.eqMidFreqHz,
      });
    }
    if ('driveEnabled' in patch || 'driveType' in patch || 'driveDb' in patch || 'driveMix' in patch) {
      rackEngine.setDrive(index, { enabled: layer.driveEnabled, type: layer.driveType, driveDb: layer.driveDb, mix: layer.driveMix });
    }
  }

  return (
    <div className="rack-page">
      {rack.layers.map((layer, index) => (
        <LayerCard
          key={layer.id}
          layer={layer}
          index={index}
          loading={loadingLayer === index}
          onLoad={() => handleLoad(index)}
          onClear={() => handleClear(index)}
          onPresetChange={(v) => handlePresetChange(index, v)}
          onCharacterChange={(c) => handleCharacterChange(index, c)}
          onVolumeChange={(v) => handleVolumeChange(index, v)}
          onRootNoteChange={(n) => handleRootNoteChange(index, n)}
          onToggleMute={() => handleToggleMute(index)}
          onToggleSolo={() => handleToggleSolo(index)}
          onEditPatch={(patch) => handleEditPatch(index, patch)}
        />
      ))}

      <MasterColumn
        masterVolume={rack.masterVolume}
        reverb={rack.reverb}
        onMasterVolumeChange={(v) => updateRack({ masterVolume: v })}
        onReverbChange={(v) => updateRack({ reverb: v })}
        onPanic={() => rackEngine.panic()}
      />
    </div>
  );
}

function LayerCard({
  layer,
  index,
  loading,
  onLoad,
  onClear,
  onPresetChange,
  onCharacterChange,
  onVolumeChange,
  onRootNoteChange,
  onToggleMute,
  onToggleSolo,
  onEditPatch,
}: {
  layer: RackLayer;
  index: number;
  loading: boolean;
  onLoad: () => void;
  onClear: () => void;
  onPresetChange: (value: string) => void;
  onCharacterChange: (c: RackCharacter) => void;
  onVolumeChange: (v: number) => void;
  onRootNoteChange: (n: number) => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onEditPatch: (patch: Partial<RackLayer>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const hasInstrument = !!layer.format;

  return (
    <div className="rack-layer-card" style={{ ['--layer-color' as any]: layer.color }}>
      <div className="rack-layer-header">
        <span className="rack-layer-title">CAMADA {String(index + 1).padStart(2, '0')}</span>
        <div className="rack-ms-buttons">
          <button className={`mute ${layer.muted ? 'on' : ''}`} onClick={onToggleMute} title="Mudo">
            M
          </button>
          <button className={`solo ${layer.solo ? 'on' : ''}`} onClick={onToggleSolo} title="Solo">
            S
          </button>
        </div>
      </div>

      <div className="rack-layer-art" style={layer.photoDataUrl ? { backgroundImage: `url(${layer.photoDataUrl})` } : undefined}>
        {!layer.photoDataUrl &&
          (loading ? (
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Carregando…</span>
          ) : hasInstrument ? (
            layer.format === 'dx7' ? <AudioLines size={30} /> : <Piano size={30} />
          ) : (
            <Plus size={26} />
          ))}
      </div>

      <div className="rack-format-badge">{layer.format ? FORMAT_BADGE[layer.format] : 'PRONTA PARA O SEU SOM'}</div>
      <div className="rack-instrument-name">{layer.displayName ?? 'Adicione um timbre'}</div>

      <div className="rack-field">
        <label>Instrumento</label>
        <select
          value={layer.selectedPreset ?? ''}
          disabled={!layer.presets.length}
          onChange={(e) => onPresetChange(e.target.value)}
        >
          {layer.presets.length === 0 ? (
            <option value="">{layer.format === 'sampler' ? 'Amostra única' : 'Nenhum banco carregado'}</option>
          ) : (
            layer.presets.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="rack-field">
        <label>Caráter</label>
        <select value={layer.character} onChange={(e) => onCharacterChange(e.target.value as RackCharacter)}>
          {CHARACTER_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rack-fader-row">
        <div className="rack-fader-ticks">
          <span>100</span>
          <span>75</span>
          <span>50</span>
          <span>25</span>
          <span>0</span>
        </div>
        <input
          className="rack-fader"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={layer.volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
        />
        <button className="btn rack-edit-btn" onClick={() => setEditing(true)}>
          Editar
        </button>
      </div>
      <div className="rack-volume-value">{layer.volume.toFixed(2)}</div>
      <div className="rack-volume-label">Volume</div>

      <div className="rack-bottom-row">
        <button className="btn" onClick={onLoad}>
          Carregar
        </button>
        <button className="btn rack-x-btn" onClick={onClear} title="Remover instrumento desta camada">
          X
        </button>
      </div>

      {editing && (
        <LayerEditPanel
          layer={layer}
          index={index}
          onClose={() => setEditing(false)}
          onPatch={onEditPatch}
          onRootNoteChange={onRootNoteChange}
        />
      )}
    </div>
  );
}

function LayerEditPanel({
  layer,
  index,
  onClose,
  onPatch,
  onRootNoteChange,
}: {
  layer: RackLayer;
  index: number;
  onClose: () => void;
  onPatch: (patch: Partial<RackLayer>) => void;
  onRootNoteChange: (n: number) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function choosePhoto() {
    fileInputRef.current?.click();
  }

  function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onPatch({ photoDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div className="rack-edit-overlay" onClick={onClose}>
      <div className="rack-edit-panel card" onClick={(e) => e.stopPropagation()}>
        <div className="rack-edit-panel-header">
          <span>CAMADA {String(index + 1).padStart(2, '0')} / AJUSTES</span>
          <button className="rack-edit-close" onClick={onClose} title="Fechar">
            <XIcon size={16} />
          </button>
        </div>

        <div className="rack-edit-grid">
          {/* topo-esquerda: faixa de notas, oitava, canal MIDI */}
          <div className="rack-edit-cell">
            <div className="rack-field">
              <label>Nota inicial {layer.noteRangeStart} ({noteLabel(layer.noteRangeStart)})</label>
              <input
                type="range"
                min={0}
                max={127}
                value={layer.noteRangeStart}
                onChange={(e) => onPatch({ noteRangeStart: Math.min(Number(e.target.value), layer.noteRangeEnd) })}
              />
            </div>
            <div className="rack-field">
              <label>Nota final {layer.noteRangeEnd} ({noteLabel(layer.noteRangeEnd)})</label>
              <input
                type="range"
                min={0}
                max={127}
                value={layer.noteRangeEnd}
                onChange={(e) => onPatch({ noteRangeEnd: Math.max(Number(e.target.value), layer.noteRangeStart) })}
              />
            </div>
            <div className="rack-field">
              <label>Oitava {layer.octave >= 0 ? '+' : ''}{layer.octave}</label>
              <input type="range" min={-3} max={3} value={layer.octave} onChange={(e) => onPatch({ octave: Number(e.target.value) })} />
            </div>
            <div className="rack-field">
              <label>Canal MIDI (0 = todos) {layer.midiChannel}</label>
              <input
                type="range"
                min={0}
                max={16}
                value={layer.midiChannel}
                onChange={(e) => onPatch({ midiChannel: Number(e.target.value) })}
              />
            </div>
            {layer.format === 'sampler' && (
              <div className="rack-field">
                <label>Nota raiz da amostra ({noteLabel(layer.rootNote)})</label>
                <input type="range" min={0} max={127} value={layer.rootNote} onChange={(e) => onRootNoteChange(Number(e.target.value))} />
              </div>
            )}
          </div>

          {/* topo-direita: envelope (attack/release) + filtro (cutoff) */}
          <div className="rack-edit-cell">
            <ToggleHeader title="Envelope" enabled={layer.envelopeEnabled} onToggle={(v) => onPatch({ envelopeEnabled: v })} />
            <div className="rack-field">
              <label>Attack (ms) {Math.round(layer.attackMs)}</label>
              <input type="range" min={0} max={2000} value={layer.attackMs} onChange={(e) => onPatch({ attackMs: Number(e.target.value) })} />
            </div>
            <div className="rack-field">
              <label>Release (ms) {Math.round(layer.releaseMs)}</label>
              <input type="range" min={0} max={5000} value={layer.releaseMs} onChange={(e) => onPatch({ releaseMs: Number(e.target.value) })} />
            </div>
            <div className="rack-field">
              <div className="rack-field-label-row">
                <label>Cutoff (Hz) {Math.round(layer.cutoffHz)}</label>
                <ToggleHeader compact title="Filtro" enabled={layer.filterEnabled} onToggle={(v) => onPatch({ filterEnabled: v })} />
              </div>
              <input
                type="range"
                min={80}
                max={20000}
                step={10}
                value={layer.cutoffHz}
                onChange={(e) => onPatch({ cutoffHz: Number(e.target.value) })}
              />
            </div>
            <div className="rack-edit-hint">Cutoff: ligue o filtro e reduza os Hz para suavizar o som.</div>
          </div>

          {/* baixo-esquerda: EQ de 3 bandas */}
          <div className="rack-edit-cell">
            <ToggleHeader title="EQ" enabled={layer.eqEnabled} onToggle={(v) => onPatch({ eqEnabled: v })} />
            <div className="rack-field">
              <label>Graves (dB) {layer.eqBassDb.toFixed(2)}</label>
              <input type="range" min={-24} max={24} step={0.5} value={layer.eqBassDb} onChange={(e) => onPatch({ eqBassDb: Number(e.target.value) })} />
            </div>
            <div className="rack-field">
              <label>Médios (dB) {layer.eqMidDb.toFixed(2)}</label>
              <input type="range" min={-24} max={24} step={0.5} value={layer.eqMidDb} onChange={(e) => onPatch({ eqMidDb: Number(e.target.value) })} />
            </div>
            <div className="rack-field">
              <label>Agudos (dB) {layer.eqTrebleDb.toFixed(2)}</label>
              <input type="range" min={-24} max={24} step={0.5} value={layer.eqTrebleDb} onChange={(e) => onPatch({ eqTrebleDb: Number(e.target.value) })} />
            </div>
            <div className="rack-field">
              <label>Frequência dos médios (Hz) {Math.round(layer.eqMidFreqHz)}</label>
              <input
                type="range"
                min={100}
                max={8000}
                step={10}
                value={layer.eqMidFreqHz}
                onChange={(e) => onPatch({ eqMidFreqHz: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* baixo-direita: drive/saturação + foto da camada */}
          <div className="rack-edit-cell">
            <ToggleHeader title="Drive" enabled={layer.driveEnabled} onToggle={(v) => onPatch({ driveEnabled: v })} />
            <div className="rack-field">
              <label>Tipo de saturação</label>
              <select value={layer.driveType} onChange={(e) => onPatch({ driveType: e.target.value as RackDriveType })}>
                {DRIVE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="rack-field">
              <label>Drive (dB) {layer.driveDb.toFixed(2)}</label>
              <input type="range" min={0} max={24} step={0.5} value={layer.driveDb} onChange={(e) => onPatch({ driveDb: Number(e.target.value) })} />
            </div>
            <div className="rack-field">
              <label>Mistura do drive {layer.driveMix.toFixed(2)}</label>
              <input type="range" min={0} max={1} step={0.01} value={layer.driveMix} onChange={(e) => onPatch({ driveMix: Number(e.target.value) })} />
            </div>
            <div className="rack-edit-photo-row">
              <button className="btn rack-photo-btn" onClick={choosePhoto}>
                Escolher foto
              </button>
              <button className="btn rack-photo-btn" onClick={() => onPatch({ photoDataUrl: null })}>
                Foto padrão
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPhotoSelected} />
              {layer.photoDataUrl && <ImageIcon size={14} style={{ opacity: 0.6 }} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleHeader({
  title,
  enabled,
  onToggle,
  compact,
}: {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  compact?: boolean;
}) {
  return (
    <button className={`rack-toggle-header ${enabled ? 'on' : ''} ${compact ? 'compact' : ''}`} onClick={() => onToggle(!enabled)}>
      {title} / {enabled ? 'LIGADO' : 'DESLIGADO'}
    </button>
  );
}

function MasterColumn({
  masterVolume,
  reverb,
  onMasterVolumeChange,
  onReverbChange,
  onPanic,
}: {
  masterVolume: number;
  reverb: number;
  onMasterVolumeChange: (v: number) => void;
  onReverbChange: (v: number) => void;
  onPanic: () => void;
}) {
  return (
    <div className="rack-master-col">
      <div className="rack-master-title">MASTER</div>

      <div className="rack-fader-row">
        <div className="rack-fader-ticks">
          <span>100</span>
          <span>75</span>
          <span>50</span>
          <span>25</span>
          <span>0</span>
        </div>
        <input
          className="rack-fader"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={masterVolume}
          onChange={(e) => onMasterVolumeChange(Number(e.target.value))}
        />
      </div>
      <div className="rack-volume-value">{masterVolume.toFixed(2)}</div>
      <div className="rack-volume-label">Saída</div>

      <div className="rack-knob-wrap">
        <div className="rack-knob" style={{ ['--knob-pct' as any]: Math.round(reverb * 100) }}>
          <Volume2 size={16} style={{ opacity: 0.35 }} />
        </div>
        <input
          className="rack-knob-slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={reverb}
          onChange={(e) => onReverbChange(Number(e.target.value))}
        />
        <div className="rack-volume-value">{reverb.toFixed(2)}</div>
        <div className="rack-volume-label">Reverb</div>
      </div>

      <button className="rack-panic-btn" onClick={onPanic}>
        PARAR NOTAS
      </button>

      <div className="rack-master-legend">M: MUDO · S: SOLO</div>
    </div>
  );
}
