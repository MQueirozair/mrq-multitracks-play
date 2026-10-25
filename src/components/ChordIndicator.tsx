import { useEffect, useRef, useState } from 'react';
import { Music2 } from 'lucide-react';
import { rackEngine } from '../audio/rack/RackEngine';
import { detectChord } from '../midi/chordDetect';

/**
 * Pílula na barra de título (ao lado de "Áudio OK") que mostra em tempo real
 * o acorde formado por todas as notas soando agora no Rack de instrumentos,
 * juntando as notas de todas as camadas/canais MIDI. Some quando nenhuma
 * nota está pressionada. Usa o mesmo padrão de poll via requestAnimationFrame
 * já usado pela tira de teclado (RackKeyboardStrip) em InstrumentRack.tsx.
 */
export default function ChordIndicator() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let raf = 0;
    let lastFrame = 0;
    let lastKey = '';
    function tick(now: number) {
      if (now - lastFrame > 60) {
        lastFrame = now;
        const notes = rackEngine.getActiveNotesSnapshot();
        const key = notes.slice().sort((a, b) => a - b).join(',');
        if (key !== lastKey) {
          lastKey = key;
          const chord = detectChord(notes);
          setLabel(chord?.label ?? null);
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!label) return null;

  return (
    <div className="pill chord-indicator" title="Acorde detectado a partir das notas tocadas no Rack agora">
      <Music2 size={12} />
      <span className="chord-indicator-label">{label}</span>
    </div>
  );
}
