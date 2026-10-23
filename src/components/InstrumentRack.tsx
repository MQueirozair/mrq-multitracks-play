import { useEffect, useRef, useState } from 'react';
import { AudioLines, Piano, Plus, Volume2 } from 'lucide-react';
import { useStore } from '../state/useStore';
import type { RackCharacter, RackLayer, RackLayerFormat } from '../../shared/types';
import { rackEngine, detectRackFormat, NPNO_EXPLANATION } from '../audio/rack/RackEngine';
import {
  initRackMidi,
  isRackMidiSupported,
  listRackMidiInputs,
  onRackMidiDevicesChanged,
  setRackMidiInput,
} from '../midi/rackMidiRouter';

const CHARACTER_OPTIONS: { value: RackCharacter; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'soft', label: 'Soft' },
  { value: 'bright', label: 'Bright' },
  { value: 'warm', label: 'Warm' },
];

const FORMAT_BADGE: Record<RackLayerFormat, string> = {
  sf2: 'SOUNDFONT / SF2',
  dx7: 'FM YAMAHA / DX7',
  sampler: 'PIANO / AMOSTRA',
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteLabel(n: number): string {
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}

/**
 * Rack de instrumentos ao vivo: 4 camadas tocáveis simultaneamente por um
 * teclado MIDI físico conectado, cada uma carregando um arquivo de instrumento
 * real do usuário (SoundFont .sf2/.sf3, banco DX7 .syx, ou amostra de áudio).
 * Ver NPNO_EXPLANATION para o motivo de .npno (Nord Piano Library) não ser
 * decodificado diretamente — é um formato fechado e criptografado da Clavia.
 */
export default function InstrumentRack() {
  const rack = useStore((s) => s.settings.rack);
  const updateRack = useStore((s) => s.updateRack);
  const updateRackLayer = useStore((s) => s.updateRackLayer);
  const pushToast = useStore((s) => s.pushToast);

  const [midiReady, setMidiReady] = useState(false);
  const [midiInputs, setMidiInputs] = useState<{ id: string; name: string }[]>([]);
  const [loadingLayer, setLoadingLayer] = useState<number | null>(null);
  const restoredRef = useRef(false);
  const rackRef = useRef(rack);
  rackRef.current = rack;

  useEffect(() => {
    rackEngine.resume().catch(() => {});
    initRackMidi().then((ok) => {
      setMidiReady(ok);
      setMidiInputs(listRackMidiInputs());
    });
    const unsub = onRackMidiDevicesChanged(() => setMidiInputs(listRackMidiInputs()));
    return unsub;
  }, []);

  useEffect(() => {
    setRackMidiInput(rack.midiInputId);
  }, [rack.midiInputId]);

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
      if (!layer.filePath || !layer.format) return;
      reloadLayerFromDisk(index, layer.filePath, layer.format, layer).catch((err: Error) => {
        pushToast(`Não foi possível recarregar o instrumento da camada ${index + 1}: ${err.message ?? err}`, 'error');
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      rackEngine.setCharacter(index, layer.character);
      rackEngine.setLayerVolume(index, layer.volume);
      rackEngine.setLayerMuted(index, layer.muted);
      rackEngine.setLayerSolo(index, layer.solo);
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
    if (detected === 'npno-unsupported') {
      pushToast(NPNO_EXPLANATION, 'error');
      return;
    }
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

  return (
    <div className="rack-page">
      <div className="rack-toolbar card">
        <span className={`midi-status-dot ${midiReady ? 'ok' : ''}`} title={midiReady ? 'MIDI ativo' : 'MIDI indisponível'} />
        <strong style={{ fontSize: 12 }}>Teclado MIDI</strong>
        {isRackMidiSupported() ? (
          <select value={rack.midiInputId ?? ''} onChange={(e) => updateRack({ midiInputId: e.target.value || null })}>
            <option value="">Todos os dispositivos conectados</option>
            {midiInputs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ color: 'var(--text-2)', fontSize: 12 }}>MIDI não suportado neste ambiente.</span>
        )}
        {midiReady && midiInputs.length === 0 && (
          <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
            Nenhum teclado MIDI detectado ainda — conecte o seu instrumento e ele aparece aqui.
          </span>
        )}
      </div>

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

      <div className="rack-layer-art">
        {loading ? (
          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Carregando…</span>
        ) : hasInstrument ? (
          layer.format === 'dx7' ? <AudioLines size={30} /> : <Piano size={30} />
        ) : (
          <Plus size={26} />
        )}
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
        <button className="btn rack-edit-btn" onClick={() => setEditing((v) => !v)}>
          Editar
        </button>
      </div>
      <div className="rack-volume-value">{layer.volume.toFixed(2)}</div>
      <div className="rack-volume-label">Volume</div>

      {editing && (
        <div className="card" style={{ padding: 8, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={layer.filePath ?? ''}>
            {layer.fileName ?? 'nenhum arquivo carregado'}
          </div>
          {layer.format === 'sampler' && (
            <div className="rack-field">
              <label>Nota raiz da amostra ({noteLabel(layer.rootNote)})</label>
              <input
                type="range"
                min={0}
                max={127}
                value={layer.rootNote}
                onChange={(e) => onRootNoteChange(Number(e.target.value))}
              />
            </div>
          )}
        </div>
      )}

      <div className="rack-bottom-row">
        <button className="btn" onClick={onLoad}>
          Carregar
        </button>
        <button className="btn rack-x-btn" onClick={onClear} title="Remover instrumento desta camada">
          X
        </button>
      </div>
    </div>
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
