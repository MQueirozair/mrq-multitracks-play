import { useRef, useState } from 'react';
import { Copy, GripVertical, Infinity as InfinityIcon, Trash2 } from 'lucide-react';
import type { ArrangementStep, PartType, Song } from '../../shared/types';
import { PART_COLORS } from '../../shared/types';
import { useStore } from '../state/useStore';

const PART_TYPES = Object.keys(PART_COLORS) as PartType[];

export default function ArrangeEditor({ song }: { song: Song }) {
  const updatePart = useStore((s) => s.updatePart);
  const deletePart = useStore((s) => s.deletePart);
  const addArrangement = useStore((s) => s.addArrangement);
  const setActiveArrangement = useStore((s) => s.setActiveArrangement);
  const updateArrangementSteps = useStore((s) => s.updateArrangementSteps);
  const ensureEditableArrangement = useStore((s) => s.ensureEditableArrangement);
  const pushToast = useStore((s) => s.pushToast);
  const [newArrName, setNewArrName] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);

  const activeArrangement = song.arrangements.find((a) => a.id === song.activeArrangementId) ?? null;
  // Roteiro efetivo: o arranjo ativo, ou — se não houver nenhum — a ordem
  // natural das partes gravadas (1 repetição cada), igual ao que toca ao vivo
  // quando nenhuma versão customizada foi criada ainda.
  const virtualSteps: ArrangementStep[] = song.parts.map((p) => ({ partId: p.id, repeat: 1 }));
  const steps = activeArrangement?.steps ?? virtualSteps;

  /**
   * Aplica uma transformação ao roteiro. Se já existe um arranjo/versão
   * ativo, edita direto nele. Se não existe (estamos olhando a ordem
   * original), pergunta se o usuário quer salvar como uma nova versão antes
   * — exatamente como o Trilha faz quando você mexe pela primeira vez no
   * roteiro de uma música ainda "original".
   */
  function applyStepsEdit(transform: (current: ArrangementStep[]) => ArrangementStep[]) {
    if (activeArrangement) {
      updateArrangementSteps(activeArrangement.id, transform(activeArrangement.steps));
      return;
    }
    const suggested = window.prompt(
      'Você está editando a ordem original da música. Para não alterar os arquivos nem a versão original, isso será salvo como uma NOVA versão. Qual o nome dela?',
      'Minha versão'
    );
    if (!suggested || !suggested.trim()) {
      pushToast('Edição cancelada — crie uma versão para mudar o roteiro.', 'error');
      return;
    }
    const id = ensureEditableArrangement(suggested.trim());
    const created = song.arrangements.find((a) => a.id === id);
    const base = created?.steps ?? virtualSteps;
    updateArrangementSteps(id, transform(base));
  }

  function moveStep(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= steps.length) return;
    applyStepsEdit((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setSelectedIndex(to);
  }

  function duplicateStep(index: number) {
    applyStepsEdit((current) => {
      const next = [...current];
      next.splice(index + 1, 0, { ...next[index] });
      return next;
    });
  }

  function removeStep(index: number) {
    applyStepsEdit((current) => current.filter((_, i) => i !== index));
    setSelectedIndex(null);
  }

  function setStepRepeat(index: number, repeat: number | 'infinite') {
    applyStepsEdit((current) => {
      const next = [...current];
      next[index] = { ...next[index], repeat };
      return next;
    });
  }

  function addStepToEnd(partId: string) {
    applyStepsEdit((current) => [...current, { partId, repeat: 1 }]);
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 280, overflowY: 'auto' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13 }}>Roteiro / versão</strong>
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

        <span style={{ color: 'var(--text-2)', fontSize: 11 }}>
          Arraste <GripVertical size={10} style={{ verticalAlign: 'middle' }} /> para reordenar · clique numa linha e aperte Delete para remover ·
          {' '}<InfinityIcon size={10} style={{ verticalAlign: 'middle' }} /> repete até você desarmar o loop ao vivo
        </span>

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIndex !== null) {
              e.preventDefault();
              removeStep(selectedIndex);
            }
          }}
        >
          {steps.map((step, i) => {
            const part = song.parts.find((p) => p.id === step.partId);
            if (!part) return null;
            const isInfinite = step.repeat === 'infinite';
            return (
              <div
                key={`${step.partId}-${i}`}
                draggable
                onDragStart={() => { dragIndex.current = i; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex.current !== null) moveStep(dragIndex.current, i);
                  dragIndex.current = null;
                }}
                onClick={() => setSelectedIndex(i)}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  padding: '4px 6px',
                  borderRadius: 6,
                  cursor: 'grab',
                  background: selectedIndex === i ? 'var(--bg-2)' : 'transparent',
                  outline: selectedIndex === i ? '1px solid var(--accent)' : 'none',
                }}
              >
                <GripVertical size={14} style={{ color: 'var(--text-2)', flexShrink: 0 }} />
                <span style={{ width: 18, textAlign: 'right', color: 'var(--text-2)', fontSize: 11 }}>{i + 1}</span>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: part.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{part.name}</span>

                {isInfinite ? (
                  <button
                    className="btn"
                    title="Repetindo até desativar — clique para voltar ao normal"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--accent)', color: 'var(--accent-ink)' }}
                    onClick={(e) => { e.stopPropagation(); setStepRepeat(i, 1); }}
                  >
                    <InfinityIcon size={13} /> até desativar
                  </button>
                ) : (
                  <>
                    <label style={{ fontSize: 11, color: 'var(--text-2)' }}>repetir</label>
                    <input
                      type="number"
                      min={1}
                      value={step.repeat}
                      style={{ width: 50 }}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setStepRepeat(i, Math.max(1, parseInt(e.target.value, 10) || 1))}
                    />
                    <button
                      className="icon-btn"
                      title="Repetir esta parte até eu desativar (loop ao vivo)"
                      onClick={(e) => { e.stopPropagation(); setStepRepeat(i, 'infinite'); }}
                    >
                      <InfinityIcon size={13} />
                    </button>
                  </>
                )}

                <button className="icon-btn" disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveStep(i, i - 1); }}>↑</button>
                <button className="icon-btn" disabled={i === steps.length - 1} onClick={(e) => { e.stopPropagation(); moveStep(i, i + 1); }}>↓</button>
                <button className="icon-btn" title="Duplicar" onClick={(e) => { e.stopPropagation(); duplicateStep(i); }}>
                  <Copy size={13} />
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn danger" onClick={(e) => { e.stopPropagation(); removeStep(i); }}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              addStepToEnd(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="">+ mais parte…</option>
            {song.parts.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
