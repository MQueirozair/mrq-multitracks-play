import { useEffect, useRef, useState } from 'react';
import { Minus, Piano, Plus } from 'lucide-react';
import { useStore } from '../state/useStore';
import { rackEngine, RACK_BUFFER_OPTIONS } from '../audio/rack/RackEngine';
import { reloadAllRackLayers } from '../audio/rack/rackReload';
import {
  initRackMidi,
  isRackMidiSupported,
  listRackMidiInputs,
  onRackMidiDevicesChanged,
  setRackMidiInput,
  setRackSustainEnabled,
  setRackTranspose,
  setRackVelocityCurve,
} from '../midi/rackMidiRouter';
import type { RackVelocityCurve } from '../../shared/types';

const VELOCITY_OPTIONS: { value: RackVelocityCurve; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'soft', label: 'Suave' },
  { value: 'hard', label: 'Dura' },
];

function formatMs(ms: number): string {
  return ms < 10 ? `${ms.toFixed(1)}ms` : `${Math.round(ms)}ms`;
}

function bufferLabel(frames: number): string {
  return frames <= 0 ? 'Automático' : `${frames} amostras`;
}

/**
 * Pílula de status + painel de configuração do teclado MIDI físico, mostrado
 * na barra de título só quando a aba "Rack de instrumentos" está aberta — é
 * aqui que fica o seletor de dispositivo (antes um card solto dentro da
 * própria aba) e os ajustes de entrada MIDI do rack (curva de velocidade,
 * transposição global do teclado físico, pedal de sustain, pânico rápido).
 */
export default function RackMidiPanel() {
  const rack = useStore((s) => s.settings.rack);
  const updateRack = useStore((s) => s.updateRack);
  const pushToast = useStore((s) => s.pushToast);
  const [open, setOpen] = useState(false);
  const [midiReady, setMidiReady] = useState(false);
  const [midiInputs, setMidiInputs] = useState<{ id: string; name: string }[]>([]);
  const [applyingBuffer, setApplyingBuffer] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rackRef = useRef(rack);
  rackRef.current = rack;

  // Mede a latência real (não só o pedido) do AudioContext atual pra mostrar
  // no painel — atualiza sempre que o painel abre ou o buffer muda.
  useEffect(() => {
    if (!open) return;
    const info = rackEngine.getLatencyInfoMs();
    setLatencyMs(info ? info.baseLatencyMs + info.outputLatencyMs : null);
  }, [open, rack.bufferFrames]);

  async function handleBufferChange(frames: number) {
    setApplyingBuffer(true);
    try {
      await rackEngine.setBufferFrames(frames);
      await reloadAllRackLayers(rackRef.current.layers, (index, err) => {
        const message = err instanceof Error ? err.message : String(err);
        pushToast(`Não foi possível recarregar o instrumento da camada ${index + 1}: ${message}`, 'error');
      });
      updateRack({ bufferFrames: frames });
      const info = rackEngine.getLatencyInfoMs();
      setLatencyMs(info ? info.baseLatencyMs + info.outputLatencyMs : null);
    } finally {
      setApplyingBuffer(false);
    }
  }

  function stepBuffer(direction: -1 | 1) {
    const current = rack.bufferFrames ?? 0;
    const idx = RACK_BUFFER_OPTIONS.indexOf(current as (typeof RACK_BUFFER_OPTIONS)[number]);
    const safeIdx = idx === -1 ? 0 : idx;
    const nextIdx = Math.max(0, Math.min(RACK_BUFFER_OPTIONS.length - 1, safeIdx + direction));
    const next = RACK_BUFFER_OPTIONS[nextIdx];
    if (next !== current) handleBufferChange(next);
  }

  useEffect(() => {
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
    setRackVelocityCurve(rack.velocityCurve);
  }, [rack.velocityCurve]);

  useEffect(() => {
    setRackTranspose(rack.transpose);
  }, [rack.transpose]);

  useEffect(() => {
    setRackSustainEnabled(rack.sustainEnabled);
  }, [rack.sustainEnabled]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="rack-midi-panel-wrap" ref={wrapRef}>
      <button className={`pill rack-midi-pill ${open ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} title="Configurações de MIDI do Rack">
        <span className={`dot ${midiReady ? '' : 'off'}`} />
        <Piano size={12} />
        {rack.midiInputId
          ? midiInputs.find((d) => d.id === rack.midiInputId)?.name ?? 'MIDI'
          : 'Todos os teclados MIDI'}
      </button>

      {open && (
        <div className="rack-midi-popover card">
          <div className="rack-midi-popover-title">Teclado MIDI</div>

          {isRackMidiSupported() ? (
            <>
              <div className="rack-field">
                <label>Dispositivo</label>
                <select value={rack.midiInputId ?? ''} onChange={(e) => updateRack({ midiInputId: e.target.value || null })}>
                  <option value="">Todos os dispositivos conectados</option>
                  {midiInputs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              {midiReady && midiInputs.length === 0 && (
                <div style={{ color: 'var(--text-2)', fontSize: 11 }}>
                  Nenhum teclado MIDI detectado ainda — conecte o seu instrumento e ele aparece aqui.
                </div>
              )}

              <div className="rack-field">
                <label>Curva de velocidade</label>
                <select
                  value={rack.velocityCurve}
                  onChange={(e) => updateRack({ velocityCurve: e.target.value as RackVelocityCurve })}
                >
                  {VELOCITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rack-field">
                <label>Transposição global ({rack.transpose >= 0 ? '+' : ''}{rack.transpose} semitons)</label>
                <input
                  type="range"
                  min={-24}
                  max={24}
                  step={1}
                  value={rack.transpose}
                  onChange={(e) => updateRack({ transpose: Number(e.target.value) })}
                />
              </div>

              <label className="rack-checkbox-row">
                <input
                  type="checkbox"
                  checked={rack.sustainEnabled}
                  onChange={(e) => updateRack({ sustainEnabled: e.target.checked })}
                />
                Pedal de sustain (CC64) segura as notas
              </label>

              <div className="rack-field">
                <label>
                  Buffer de áudio ({bufferLabel(rack.bufferFrames ?? 0)}
                  {latencyMs !== null ? ` · ~${formatMs(latencyMs)} de latência real` : ''})
                </label>
                <div className="rack-buffer-stepper">
                  <button
                    type="button"
                    className="btn rack-buffer-step-btn"
                    disabled={applyingBuffer || (rack.bufferFrames ?? 0) <= RACK_BUFFER_OPTIONS[0]}
                    onClick={() => stepBuffer(-1)}
                    title="Diminuir buffer: responde mais rápido, mais exigente do processador"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="rack-buffer-step-value">
                    {applyingBuffer ? 'Aplicando…' : bufferLabel(rack.bufferFrames ?? 0)}
                  </span>
                  <button
                    type="button"
                    className="btn rack-buffer-step-btn"
                    disabled={applyingBuffer || (rack.bufferFrames ?? 0) >= RACK_BUFFER_OPTIONS[RACK_BUFFER_OPTIONS.length - 1]}
                    onClick={() => stepBuffer(1)}
                    title="Aumentar buffer: mais estável (evita estalos), porém mais atraso"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div style={{ color: 'var(--text-2)', fontSize: 10.5, marginTop: 2 }}>
                  Automático = menor buffer que o sistema permitir (padrão). Se o som estiver "estalando",
                  aumente. Recarrega os instrumentos já carregados automaticamente.
                </div>
              </div>

              <button className="btn rack-panic-btn" style={{ marginTop: 4 }} onClick={() => rackEngine.panic()}>
                PARAR NOTAS
              </button>
            </>
          ) : (
            <div style={{ color: 'var(--text-2)', fontSize: 12 }}>MIDI não suportado neste ambiente.</div>
          )}
        </div>
      )}
    </div>
  );
}
