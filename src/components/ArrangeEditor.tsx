import { useRef, useState } from 'react';
import { Copy, GripVertical, Infinity as InfinityIcon, Trash2, Zap } from 'lucide-react';
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
  const [cueEditPartId, setCueEditPartId] = useState<string | null>(null);
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
    <div className="card arrange-editor">
      <div className="arrange-section-head">
        <strong className="arrange-section-title">Partes marcadas</strong>
        <span className="arrange-count">{song.parts.length}</span>
      </div>

      <div className="arrange-parts-list">
        {song.parts.map((part) => {
          const hasCue = !!part.cueOscAddress || !!part.cueMidiProgram;
          return (
          <div key={part.id}>
            <div className="arrange-part-row">
              <span className="arrange-color-dot" style={{ background: part.color }} />
              <input
                className="arrange-input-name"
                value={part.name}
                onChange={(e) => updatePart(part.id, { name: e.target.value })}
              />
              <select
                className="arrange-input-type"
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
              <label className="arrange-inline-label">de</label>
              <input
                type="number"
                className="arrange-input-bar"
                value={part.startBar}
                onChange={(e) => updatePart(part.id, { startBar: parseInt(e.target.value, 10) || 1 })}
              />
              <label className="arrange-inline-label">até</label>
              <input
                type="number"
                className="arrange-input-bar"
                value={part.endBar}
                onChange={(e) => updatePart(part.id, { endBar: parseInt(e.target.value, 10) || 1 })}
              />
              <div className="arrange-spacer" />
              <button
                className={`icon-btn ${hasCue ? 'active' : ''}`}
                title="Cue de palco: dispara OSC/MIDI automaticamente quando esta parte entra (luz, vídeo, console externo)"
                onClick={() => setCueEditPartId(cueEditPartId === part.id ? null : part.id)}
              >
                <Zap size={14} />
              </button>
              <button className="btn danger" onClick={() => deletePart(part.id)}>Excluir</button>
            </div>
            {cueEditPartId === part.id && (
              <div className="arrange-cue-row">
                <label className="arrange-inline-label">Endereço OSC</label>
                <input
                  placeholder="/light/scene/3"
                  value={part.cueOscAddress ?? ''}
                  onChange={(e) => updatePart(part.id, { cueOscAddress: e.target.value || null })}
                  style={{ width: 160 }}
                />
                <label className="arrange-inline-label">MIDI canal</label>
                <input
                  type="number"
                  min={0}
                  max={15}
                  style={{ width: 60 }}
                  value={part.cueMidiProgram?.channel ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    const channel = e.target.value === '' ? null : Math.max(0, Math.min(15, parseInt(e.target.value, 10) || 0));
                    updatePart(part.id, {
                      cueMidiProgram: channel === null ? null : { channel, program: part.cueMidiProgram?.program ?? 0 },
                    });
                  }}
                />
                <label className="arrange-inline-label">programa</label>
                <input
                  type="number"
                  min={0}
                  max={127}
                  style={{ width: 60 }}
                  disabled={!part.cueMidiProgram}
                  value={part.cueMidiProgram?.program ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    if (!part.cueMidiProgram) return;
                    const program = Math.max(0, Math.min(127, parseInt(e.target.value, 10) || 0));
                    updatePart(part.id, { cueMidiProgram: { ...part.cueMidiProgram, program } });
                  }}
                />
                <span className="hint" style={{ marginLeft: 8 }}>
                  Disparado automaticamente assim que esta parte fica ativa — ver settings.osc e Ajuda.
                </span>
              </div>
            )}
          </div>
          );
        })}
      </div>

      <div className="arrange-roteiro-block">
        <div className="arrange-roteiro-head">
          <strong className="arrange-section-title">Roteiro / versão</strong>
          <select
            className="arrange-arr-select"
            value={song.activeArrangementId ?? ''}
            onChange={(e) => setActiveArrangement(e.target.value || null)}
          >
            <option value="">Original (ordem gravada)</option>
            {song.arrangements.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <input
            className="arrange-new-name"
            placeholder="nome da nova versão, ex: Culto curto"
            value={newArrName}
            onChange={(e) => setNewArrName(e.target.value)}
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

        <span className="arrange-hint">
          Arraste <GripVertical size={10} className="arrange-hint-icon" /> para reordenar · clique numa linha e aperte Delete para remover ·
          {' '}<InfinityIcon size={10} className="arrange-hint-icon" /> repete até você desarmar o loop ao vivo
        </span>

        <div
          className="arrange-steps-list"
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
                className={`arrange-step-row${selectedIndex === i ? ' selected' : ''}`}
                style={{ '--step-color': part.color } as React.CSSProperties}
              >
                <GripVertical size={14} className="arrange-step-grip" />
                <span className="arrange-step-index">{i + 1}</span>
                <span className="arrange-color-dot" style={{ background: part.color }} />
                <span className="arrange-step-name">{part.name}</span>

                {isInfinite ? (
                  <button
                    className="btn arrange-infinite-btn"
                    title="Repetindo até desativar — clique para voltar ao normal"
                    onClick={(e) => { e.stopPropagation(); setStepRepeat(i, 1); }}
                  >
                    <InfinityIcon size={13} /> até desativar
                  </button>
                ) : (
                  <>
                    <label className="arrange-inline-label">repetir</label>
                    <input
                      type="number"
                      min={1}
                      value={step.repeat}
                      className="arrange-input-repeat"
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
                <div className="arrange-spacer" />
                <button className="btn danger" onClick={(e) => { e.stopPropagation(); removeStep(i); }}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          <select
            className="arrange-add-select"
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
