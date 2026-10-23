import { useEffect, useRef, useState } from 'react';
import { Piano } from 'lucide-react';
import { useStore } from '../state/useStore';
import { rackEngine } from '../audio/rack/RackEngine';
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
  const [open, setOpen] = useState(false);
  const [midiReady, setMidiReady] = useState(false);
  const [midiInputs, setMidiInputs] = useState<{ id: string; name: string }[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

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
