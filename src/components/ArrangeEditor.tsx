import { useState } from 'react';
import type { PartType, Song } from '../../shared/types';
import { PART_COLORS } from '../../shared/types';
import { useStore } from '../state/useStore';

const PART_TYPES = Object.keys(PART_COLORS) as PartType[];

export default function ArrangeEditor({ song }: { song: Song }) {
  const updatePart = useStore((s) => s.updatePart);
  const deletePart = useStore((s) => s.deletePart);
  const addArrangement = useStore((s) => s.addArrangement);
  const setActiveArrangement = useStore((s) => s.setActiveArrangement);
  const updateArrangementSteps = useStore((s) => s.updateArrangementSteps);
  const [newArrName, setNewArrName] = useState('');

  const activeArrangement = song.arrangements.find((a) => a.id === song.activeArrangementId) ?? null;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 13 }}>Partes marcadas</strong>
        <span style={{ color: 'var(--text-2)', fontSize: 11 }}>({song.parts.length})</span>
      </div>

      {song.parts.map((part) => (
        <div key={part.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: part.color, flexShrink: 0 }} />
          <input
            value={part.name}
            onChange={(e) => updatePart(part.id, { name: e.target.value })}
            style={{ width: 140 }}
          />
          <select
            value={part.type}
            onChange={(e) => {
              const type = e.target.value as PartType;
              updatePart(part.id, { type, color: PART_COLORS[type] });
            }}
          >
            {PART_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <label style={{ fontSize: 11, color: 'var(--text-2)' }}>de</label>
          <input
            type="number"
            value={part.startBar}
            onChange={(e) => updatePart(part.id, { startBar: parseInt(e.target.value, 10) || 1 })}
            style={{ width: 64 }}
          />
          <label style={{ fontSize: 11, color: 'var(--text-2)' }}>até</label>
          <input
            type="number"
            value={part.endBar}
            onChange={(e) => updatePart(part.id, { endBar: parseInt(e.target.value, 10) || 1 })}
            style={{ width: 64 }}
          />
          <div style={{ flex: 1 }} />
          <button className="btn danger" onClick={() => deletePart(part.id)}>Excluir</button>
        </div>
      ))}

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>Arranjo / versão</strong>
          <select
            value={song.activeArrangementId ?? ''}
            onChange={(e) => setActiveArrangement(e.target.value || null)}
          >
            <option value="">Original (ordem gravada)</option>
            {song.arrangements.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <input
            placeholder="nome da nova versão, ex: Culto curto"
            value={newArrName}
            onChange={(e) => setNewArrName(e.target.value)}
            style={{ width: 200 }}
          />
          <button
            className="btn"
            onClick={() => {
              if (!newArrName.trim()) return;
              addArrangement(newArrName.trim());
              setNewArrName('');
            }}
          >
            + Nova versão a partir da atual
          </button>
        </div>

        {activeArrangement && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeArrangement.steps.map((step, i) => {
              const part = song.parts.find((p) => p.id === step.partId);
              if (!part) return null;
              return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 18, textAlign: 'right', color: 'var(--text-2)', fontSize: 11 }}>{i + 1}</span>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: part.color }} />
                  <span style={{ fontSize: 13, width: 140 }}>{part.name}</span>
                  <label style={{ fontSize: 11, color: 'var(--text-2)' }}>repetir</label>
                  <input
                    type="number"
                    min={1}
                    value={step.repeat}
                    style={{ width: 54 }}
                    onChange={(e) => {
                      const steps = [...activeArrangement.steps];
                      steps[i] = { ...steps[i], repeat: Math.max(1, parseInt(e.target.value, 10) || 1) };
                      updateArrangementSteps(activeArrangement.id, steps);
                    }}
                  />
                  <button
                    className="icon-btn"
                    disabled={i === 0}
                    onClick={() => {
                      const steps = [...activeArrangement.steps];
                      [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
                      updateArrangementSteps(activeArrangement.id, steps);
                    }}
                  >↑</button>
                  <button
                    className="icon-btn"
                    disabled={i === activeArrangement.steps.length - 1}
                    onClick={() => {
                      const steps = [...activeArrangement.steps];
                      [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]];
                      updateArrangementSteps(activeArrangement.id, steps);
                    }}
                  >↓</button>
                  <button
                    className="btn danger"
                    onClick={() => {
                      const steps = activeArrangement.steps.filter((_, idx) => idx !== i);
                      updateArrangementSteps(activeArrangement.id, steps);
                    }}
                  >
                    Remover
                  </button>
                </div>
              );
            })}
            <select
              onChange={(e) => {
                if (!e.target.value) return;
                updateArrangementSteps(activeArrangement.id, [
                  ...activeArrangement.steps,
                  { partId: e.target.value, repeat: 1 },
                ]);
                e.target.value = '';
              }}
            >
              <option value="">+ adicionar parte ao arranjo…</option>
              {song.parts.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
