import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  Copy,
  Image as ImageIcon,
  Piano,
  Plus,
  RotateCcw,
  Volume2,
  X as XIcon,
} from 'lucide-react';
import { useStore } from '../state/useStore';
import type { RackCharacter, RackDriveType, RackLayer, RackLayerFormat, RackScene } from '../../shared/types';
import { rackEngine, detectRackFormat } from '../audio/rack/RackEngine';
import { applyLayerParamsToEngine, reloadAllRackLayers, reloadLayerFromDisk as reloadLayerFromDiskShared } from '../audio/rack/rackReload';
import { onRackProgramChange, onRackRawNoteOn } from '../midi/rackMidiRouter';
import TransportBar from './TransportBar';
import PartsGrid from './PartsGrid';

const DEFAULT_LAYER_FX: Partial<RackLayer> = {
  envelopeEnabled: false,
  attackMs: 5,
  releaseMs: 350,
  filterEnabled: false,
  cutoffHz: 20000,
  eqEnabled: false,
  eqBassDb: 0,
  eqMidDb: 0,
  eqTrebleDb: 0,
  eqMidFreqHz: 1000,
  driveEnabled: false,
  driveType: 'warm',
  driveDb: 0,
  driveMix: 1,
  pan: 0,
};

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
  nki: 'KONTAKT 1-4 / NKI',
  sfz: 'SFZ (K5-8 exportado)',
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
  // Electron não implementa window.prompt() nativo no renderer (lança
  // "prompt() is and will not be supported."), então o nome da cena é pedido
  // por um modal próprio em vez do prompt() do navegador.
  const [sceneNameDraft, setSceneNameDraft] = useState<string | null>(null);
  const restoredRef = useRef(false);
  const rackRef = useRef(rack);
  rackRef.current = rack;

  useEffect(() => {
    // Aplica o tamanho de buffer salvo da sessão anterior antes do primeiro
    // "resume" (que é quem de fato cria o AudioContext) — assim a preferência
    // de latência do usuário já vale desde a primeira nota tocada.
    rackEngine.setBufferFrames(rackRef.current.bufferFrames ?? 0);
    rackEngine.resume().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atalho de pânico: Esc para todas as notas de todas as camadas enquanto a
  // aba Rack estiver aberta — útil pra cortar rápido um som preso/travado
  // sem precisar tirar a mão do teclado físico pra clicar no botão.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') rackEngine.panic();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Program Change do teclado físico recarrega a cena salva de mesmo índice
  // (0 = primeira cena salva, 1 = segunda, ...) — pensado pra troca de
  // repertório via footswitch MIDI sem tirar a mão do teclado.
  useEffect(() => {
    const unsub = onRackProgramChange((program) => {
      const scene = rackRef.current.scenes?.[program];
      if (scene) handleLoadScene(scene);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // applyLayerParamsToEngine e a lógica de releitura do disco agora vivem em
  // rackReload.ts (compartilhadas com o handler de troca de buffer no
  // RackMidiPanel) — aqui só embrulhamos pra manter o indicador de
  // carregamento por camada (setLoadingLayer) que já existia.
  async function reloadLayerFromDisk(index: number, filePath: string, format: RackLayerFormat, layer: RackLayer) {
    setLoadingLayer(index);
    try {
      return await reloadLayerFromDiskShared(index, filePath, format, layer);
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
    if ('pan' in patch) rackEngine.setPan(index, layer.pan);
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

  // Clona a configuração inteira de uma camada (instrumento + todos os
  // ajustes do painel Editar) para outra — útil pra empilhar o mesmo
  // instrumento duas vezes com um "Caráter"/EQ diferente em cada camada, sem
  // ter que carregar o arquivo de novo na mão.
  async function handleDuplicateLayer(sourceIndex: number, targetIndex: number) {
    const source = rack.layers[sourceIndex];
    const target = rack.layers[targetIndex];
    const cloned: RackLayer = { ...source, id: target.id, color: target.color };
    updateRackLayer(targetIndex, cloned);
    if (source.filePath && source.format) {
      try {
        await reloadLayerFromDisk(targetIndex, source.filePath, source.format, cloned);
      } catch (err: any) {
        pushToast(`Não foi possível duplicar o instrumento: ${err?.message ?? err}`, 'error');
        return;
      }
    } else {
      rackEngine.clearLayer(targetIndex);
      applyLayerParamsToEngine(targetIndex, cloned);
    }
    pushToast(`Camada ${sourceIndex + 1} duplicada para a camada ${targetIndex + 1}.`);
  }

  // --- cenas: fotografia completa das 4 camadas + master/reverb, salva com
  // nome pra recall rápido ao vivo (manual ou por Program Change MIDI) ---

  function handleSaveScene() {
    setSceneNameDraft(`Cena ${(rack.scenes?.length ?? 0) + 1}`);
  }

  function confirmSaveScene(name: string) {
    const trimmed = name.trim();
    setSceneNameDraft(null);
    if (!trimmed) return;
    const scene: RackScene = {
      id: `scene-${Date.now()}`,
      name: trimmed,
      layers: rack.layers.map((l) => ({ ...l })),
      masterVolume: rack.masterVolume,
      reverb: rack.reverb,
    };
    updateRack({ scenes: [...(rack.scenes ?? []), scene] });
    pushToast(`Cena "${trimmed}" salva (PC ${rack.scenes?.length ?? 0} no teclado físico).`);
  }

  async function handleLoadScene(scene: RackScene) {
    const layers = scene.layers.map((l) => ({ ...l }));
    updateRack({ layers, masterVolume: scene.masterVolume, reverb: scene.reverb });
    rackEngine.setMasterVolume(scene.masterVolume);
    rackEngine.setReverb(scene.reverb);
    await reloadAllRackLayers(layers, (index, err) => {
      const message = err instanceof Error ? err.message : String(err);
      pushToast(`Não foi possível recarregar o instrumento da camada ${index + 1} da cena: ${message}`, 'error');
    });
    pushToast(`Cena "${scene.name}" carregada.`);
  }

  function handleDeleteScene(id: string) {
    updateRack({ scenes: (rack.scenes ?? []).filter((s) => s.id !== id) });
  }

  return (
    <div className="rack-page-outer">
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
          otherLayers={rack.layers.map((l, i) => ({ index: i, label: `Camada ${i + 1}` })).filter((l) => l.index !== index)}
          onDuplicateTo={(targetIndex) => handleDuplicateLayer(index, targetIndex)}
        />
      ))}

      <MasterColumn
        masterVolume={rack.masterVolume}
        reverb={rack.reverb}
        onMasterVolumeChange={(v) => updateRack({ masterVolume: v })}
        onReverbChange={(v) => updateRack({ reverb: v })}
        onPanic={() => rackEngine.panic()}
        scenes={rack.scenes ?? []}
        onSaveScene={handleSaveScene}
        onLoadScene={handleLoadScene}
        onDeleteScene={handleDeleteScene}
      />
    </div>
    <RackMusicPanel />
    <RackKeyboardStrip layers={rack.layers} />
    {sceneNameDraft !== null && (
      <SceneNameModal initialName={sceneNameDraft} onConfirm={confirmSaveScene} onCancel={() => setSceneNameDraft(null)} />
    )}
    </div>
  );
}

function SceneNameModal({
  initialName,
  onConfirm,
  onCancel,
}: {
  initialName: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="rack-modal-overlay" onClick={onCancel}>
      <div className="rack-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rack-modal-title">Salvar cena</div>
        <input
          ref={inputRef}
          type="text"
          className="rack-modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm(name);
            if (e.key === 'Escape') onCancel();
          }}
          placeholder='Nome da cena (ex.: "Música X — Intro")'
        />
        <div className="rack-modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={() => onConfirm(name)}>
            Salvar
          </button>
        </div>
      </div>
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
  otherLayers,
  onDuplicateTo,
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
  otherLayers: { index: number; label: string }[];
  onDuplicateTo: (targetIndex: number) => void;
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
      <LayerMeter index={index} active={hasInstrument} />

      <div className="rack-bottom-row">
        <button className="btn rack-load-btn" onClick={onLoad}>
          Carregar
        </button>
        <button className="btn rack-x-btn" onClick={onClear} title="Remover instrumento desta camada">
          <XIcon size={14} strokeWidth={2.5} />
        </button>
      </div>

      {editing && (
        <LayerEditPanel
          layer={layer}
          index={index}
          onClose={() => setEditing(false)}
          onPatch={onEditPatch}
          onRootNoteChange={onRootNoteChange}
          otherLayers={otherLayers}
          onDuplicateTo={onDuplicateTo}
        />
      )}
    </div>
  );
}

/**
 * Painel de música dentro da aba Rack: deixa tocar/pausar/parar a música do
 * Setlist e pular entre as partes sem precisar sair pra aba de reprodução —
 * essencial pra quem está tocando ao vivo usando os instrumentos do Rack mas
 * ainda precisa comandar a faixa/backing track. Reaproveita TransportBar e
 * PartsGrid (mesmos componentes da aba de reprodução) e tem botão próprio
 * pra minimizar e economizar espaço de tela.
 */
function RackMusicPanel() {
  const currentSong = useStore((s) => s.currentSong);
  const engineState = useStore((s) => s.engineState);
  const jumpToPart = useStore((s) => s.jumpToPart);
  const toggleLoopActivePart = useStore((s) => s.toggleLoopActivePart);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`rack-music-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="rack-strip-header">
        <span className="rack-strip-title">
          <Piano size={14} /> Música {currentSong ? `— ${currentSong.title}` : ''}
        </span>
        <button
          className="rack-strip-toggle"
          title={collapsed ? 'Mostrar controles de música' : 'Minimizar controles de música'}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {!collapsed &&
        (currentSong ? (
          <div className="rack-music-panel-body">
            <TransportBar />
            <PartsGrid
              song={currentSong}
              activePartId={engineState.activePartId}
              pendingPartId={engineState.pendingPartId}
              loopActive={engineState.loopActivePart}
              onJump={(id) => jumpToPart(id)}
              onToggleLoop={() => toggleLoopActivePart()}
            />
          </div>
        ) : (
          <div className="rack-music-panel-empty">Nenhuma música carregada no Setlist.</div>
        ))}
    </div>
  );
}

const KEYBOARD_LOW = 21; // A0
const KEYBOARD_HIGH = 108; // C8 (piano de 88 teclas)
const KEYBOARD_TOTAL = KEYBOARD_HIGH - KEYBOARD_LOW + 1;
function isBlackKey(note: number) {
  return [1, 3, 6, 8, 10].includes(note % 12);
}

// Posicionamento proporcional de piano de verdade: as teclas brancas dividem
// a largura total em partes iguais; as pretas são mais estreitas e ficam
// centradas sobre a divisa entre as duas brancas vizinhas (nunca do mesmo
// tamanho/alinhamento das brancas — era isso que deixava o teclado antigo
// com cara de "blocos" desalinhados).
const ALL_KEYBOARD_NOTES = Array.from({ length: KEYBOARD_TOTAL }, (_, i) => KEYBOARD_LOW + i);
const WHITE_KEY_NOTES = ALL_KEYBOARD_NOTES.filter((n) => !isBlackKey(n));
const WHITE_KEY_COUNT = WHITE_KEY_NOTES.length;
const WHITE_KEY_INDEX = new Map(WHITE_KEY_NOTES.map((n, i) => [n, i]));
const WHITE_KEY_WIDTH_PCT = 100 / WHITE_KEY_COUNT;
const BLACK_KEY_WIDTH_PCT = WHITE_KEY_WIDTH_PCT * 0.62;

function keyPositionPct(note: number): { leftPct: number; widthPct: number } {
  if (!isBlackKey(note)) {
    const idx = WHITE_KEY_INDEX.get(note) ?? 0;
    return { leftPct: idx * WHITE_KEY_WIDTH_PCT, widthPct: WHITE_KEY_WIDTH_PCT };
  }
  // A tecla preta fica sempre logo após uma branca (note - 1), centrada na divisa.
  const prevWhiteIdx = WHITE_KEY_INDEX.get(note - 1) ?? 0;
  const boundaryPct = (prevWhiteIdx + 1) * WHITE_KEY_WIDTH_PCT;
  return { leftPct: boundaryPct - BLACK_KEY_WIDTH_PCT / 2, widthPct: BLACK_KEY_WIDTH_PCT };
}

/**
 * Tira de teclado virtual: mostra as faixas de nota configuradas em cada
 * camada (barra colorida embaixo das teclas) e acende em tempo real as
 * notas que estão soando agora — não é tocável, é só visualização/feedback
 * pra quem está tocando no teclado físico conectado. As teclas são
 * posicionadas em porcentagem (brancas = divisões iguais, pretas = mais
 * estreitas e centradas na divisa entre duas brancas), igual um piano real.
 */
function RackKeyboardStrip({ layers }: { layers: RackLayer[] }) {
  const keyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let raf = 0;
    let lastFrame = 0;
    let lastActive = new Set<number>();
    function tick(now: number) {
      if (now - lastFrame > 60) {
        lastFrame = now;
        const active = new Set(rackEngine.getActiveNotesSnapshot());
        if (active.size !== lastActive.size || [...active].some((n) => !lastActive.has(n))) {
          for (let note = KEYBOARD_LOW; note <= KEYBOARD_HIGH; note++) {
            const el = keyRefs.current[note - KEYBOARD_LOW];
            if (el) el.classList.toggle('rack-key-active', active.has(note));
          }
          lastActive = active;
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const loadedLayers = layers.filter((l) => l.format);
  const whiteKeys = ALL_KEYBOARD_NOTES.filter((n) => !isBlackKey(n));
  const blackKeys = ALL_KEYBOARD_NOTES.filter((n) => isBlackKey(n));

  return (
    <div className={`rack-keyboard-strip ${collapsed ? 'collapsed' : ''}`}>
      <div className="rack-strip-header">
        <span className="rack-strip-title">
          <Piano size={14} /> Teclado virtual
        </span>
        <button
          className="rack-strip-toggle"
          title={collapsed ? 'Mostrar teclado virtual' : 'Minimizar teclado virtual'}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {!collapsed && (
        <div className="rack-keyboard-body">
          <div className="rack-keyboard-keys">
            {whiteKeys.map((note) => {
              const { leftPct, widthPct } = keyPositionPct(note);
              return (
                <div
                  key={note}
                  ref={(el) => (keyRefs.current[note - KEYBOARD_LOW] = el)}
                  className="rack-key rack-key-white"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  title={`Nota MIDI ${note}`}
                />
              );
            })}
            {blackKeys.map((note) => {
              const { leftPct, widthPct } = keyPositionPct(note);
              return (
                <div
                  key={note}
                  ref={(el) => (keyRefs.current[note - KEYBOARD_LOW] = el)}
                  className="rack-key rack-key-black"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  title={`Nota MIDI ${note}`}
                />
              );
            })}
          </div>
          <div className="rack-keyboard-ranges">
            {loadedLayers.map((layer) => {
              const start = Math.max(KEYBOARD_LOW, layer.noteRangeStart);
              const end = Math.min(KEYBOARD_HIGH, layer.noteRangeEnd);
              if (end < start) return null;
              const startPos = keyPositionPct(start);
              const endPos = keyPositionPct(end);
              const leftPct = startPos.leftPct;
              const widthPct = endPos.leftPct + endPos.widthPct - startPos.leftPct;
              return (
                <div
                  key={layer.id}
                  className="rack-key-range"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: layer.color }}
                  title={`Faixa da ${layer.id}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Medidor de nível (VU) ao vivo de uma camada — lê o pico real do áudio que está saindo dela, ~20x/s. */
function LayerMeter({ index, active }: { index: number; active: boolean }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let lastFrame = 0;
    function tick(now: number) {
      // ~20fps é mais que suficiente pra um medidor visual, evita trabalho à toa
      if (now - lastFrame > 45) {
        lastFrame = now;
        const level = rackEngine.getLayerLevel(index);
        const pct = Math.min(100, Math.round(Math.sqrt(level) * 100));
        if (barRef.current) barRef.current.style.width = `${pct}%`;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, active]);

  return (
    <div className="rack-vu-track" title="Nível de saída desta camada">
      <div ref={barRef} className="rack-vu-fill" style={{ width: '0%' }} />
    </div>
  );
}

function LayerEditPanel({
  layer,
  index,
  onClose,
  onPatch,
  onRootNoteChange,
  otherLayers,
  onDuplicateTo,
}: {
  layer: RackLayer;
  index: number;
  onClose: () => void;
  onPatch: (patch: Partial<RackLayer>) => void;
  onRootNoteChange: (n: number) => void;
  otherLayers: { index: number; label: string }[];
  onDuplicateTo: (targetIndex: number) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [learningRange, setLearningRange] = useState(false);
  const learnBoundsRef = useRef<{ min: number; max: number } | null>(null);

  function choosePhoto() {
    fileInputRef.current?.click();
  }

  // "Aprender faixa": arma um modo de escuta por alguns segundos — a menor e
  // maior tecla física tocada nesse intervalo vira a faixa de notas da
  // camada, bem mais rápido que arrastar os dois controles deslizantes.
  useEffect(() => {
    if (!learningRange) return;
    learnBoundsRef.current = null;
    const unsub = onRackRawNoteOn((note) => {
      const cur = learnBoundsRef.current;
      learnBoundsRef.current = cur ? { min: Math.min(cur.min, note), max: Math.max(cur.max, note) } : { min: note, max: note };
    });
    const timeout = setTimeout(() => {
      setLearningRange(false);
      const bounds = learnBoundsRef.current;
      if (bounds) onPatch({ noteRangeStart: bounds.min, noteRangeEnd: bounds.max });
    }, 6000);
    return () => {
      unsub();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learningRange]);

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
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="rack-edit-close"
              onClick={() => onPatch(DEFAULT_LAYER_FX)}
              title="Resetar envelope, filtro, EQ, drive e pan pros valores padrão"
            >
              <RotateCcw size={14} />
            </button>
            <button className="rack-edit-close" onClick={onClose} title="Fechar">
              <XIcon size={16} />
            </button>
          </div>
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
            <button
              type="button"
              className="btn rack-learn-range-btn"
              disabled={learningRange}
              onClick={() => setLearningRange(true)}
              title="Toque a tecla mais grave e a mais aguda que essa camada deve responder, no teclado físico"
            >
              {learningRange ? 'Toque as teclas no teclado físico…' : 'Aprender faixa (toque 2 teclas)'}
            </button>
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
            <div className="rack-field">
              <label>Pan {layer.pan === 0 ? 'centro' : layer.pan < 0 ? `${Math.round(-layer.pan * 100)}% esq.` : `${Math.round(layer.pan * 100)}% dir.`}</label>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={layer.pan ?? 0}
                onChange={(e) => onPatch({ pan: Number(e.target.value) })}
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
            {layer.format && (
              <div className="rack-duplicate-row">
                <span>Duplicar esta camada para:</span>
                <div className="rack-duplicate-btns">
                  {otherLayers.map((l) => (
                    <button key={l.index} type="button" className="btn rack-duplicate-btn" onClick={() => onDuplicateTo(l.index)}>
                      <Copy size={11} /> {l.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
  scenes,
  onSaveScene,
  onLoadScene,
  onDeleteScene,
}: {
  masterVolume: number;
  reverb: number;
  onMasterVolumeChange: (v: number) => void;
  onReverbChange: (v: number) => void;
  onPanic: () => void;
  scenes: RackScene[];
  onSaveScene: () => void;
  onLoadScene: (scene: RackScene) => void;
  onDeleteScene: (id: string) => void;
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

      <div className="rack-scenes">
        <div className="rack-scenes-title">Cenas</div>
        <div className="rack-scenes-list">
          {scenes.length === 0 && <div className="rack-scenes-empty">Nenhuma cena salva ainda.</div>}
          {scenes.map((scene, i) => (
            <div key={scene.id} className="rack-scene-row">
              <button type="button" className="rack-scene-btn" onClick={() => onLoadScene(scene)} title={`Program Change ${i} no teclado físico recarrega esta cena`}>
                <span className="rack-scene-pc">{i}</span> {scene.name}
              </button>
              <button type="button" className="rack-scene-del" onClick={() => onDeleteScene(scene.id)} title="Excluir cena">
                <XIcon size={11} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn rack-scene-save-btn" onClick={onSaveScene}>
          Salvar cena atual
        </button>
      </div>

      <div className="rack-master-legend">M: MUDO · S: SOLO</div>
    </div>
  );
}
