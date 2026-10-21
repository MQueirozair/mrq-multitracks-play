import { useCallback, useEffect, useRef, useState } from 'react';
import type { Song } from '../../shared/types';

interface Props {
  song: Song;
  currentBar: number;
  editable?: boolean;
  onSeekBar: (bar: number) => void;
  onCreateRange?: (startBar: number, endBar: number) => void;
}

const TOTAL_BARS_PADDING = 4;

export default function WaveformCanvas({ song, currentBar, editable, onSeekBar, onCreateRange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragStartBar, setDragStartBar] = useState<number | null>(null);
  const [dragEndBar, setDragEndBar] = useState<number | null>(null);

  const totalBars = Math.max(
    TOTAL_BARS_PADDING,
    ...song.parts.map((p) => p.endBar),
    Math.ceil(currentBar) + TOTAL_BARS_PADDING
  );

  const barFromClientX = useCallback(
    (clientX: number) => {
      const el = canvasRef.current;
      if (!el) return 1;
      const rect = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return 1 + frac * (totalBars - 1);
    },
    [totalBars]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const width = wrap.clientWidth;
    const height = 120;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // faixas de parte (fundo colorido)
    for (const part of song.parts) {
      const x1 = ((part.startBar - 1) / (totalBars - 1)) * width;
      const x2 = ((part.endBar - 1) / (totalBars - 1)) * width;
      ctx.fillStyle = part.color + '33';
      ctx.fillRect(x1, 0, Math.max(1, x2 - x1), height);
      ctx.fillStyle = part.color;
      ctx.fillRect(x1, 0, Math.max(1, x2 - x1), 3);
    }

    // forma de onda
    const peaks = song.waveformPeaks;
    if (peaks && peaks.length > 0) {
      const mid = height / 2;
      ctx.fillStyle = '#f2a93b99';
      const barWidth = Math.max(1, width / peaks.length);
      for (let i = 0; i < peaks.length; i++) {
        const h = Math.max(1, peaks[i] * (height - 20));
        ctx.fillRect(i * barWidth, mid - h / 2, Math.max(1, barWidth - 0.5), h);
      }
    } else {
      ctx.fillStyle = '#8c8f9855';
      ctx.fillRect(0, height / 2 - 1, width, 2);
    }

    // seleção de criação de trecho (modo arranjo)
    if (dragStartBar !== null && dragEndBar !== null) {
      const a = Math.min(dragStartBar, dragEndBar);
      const b = Math.max(dragStartBar, dragEndBar);
      const x1 = ((a - 1) / (totalBars - 1)) * width;
      const x2 = ((b - 1) / (totalBars - 1)) * width;
      ctx.fillStyle = '#ffffff22';
      ctx.fillRect(x1, 0, x2 - x1, height);
      ctx.strokeStyle = '#ffffffaa';
      ctx.strokeRect(x1, 0, x2 - x1, height);
    }

    // marcadores de compasso (a cada 4)
    ctx.fillStyle = '#5a5d66';
    ctx.font = '10px Segoe UI';
    for (let bar = 1; bar <= totalBars; bar += 4) {
      const x = ((bar - 1) / (totalBars - 1)) * width;
      ctx.fillRect(x, height - 10, 1, 10);
      ctx.fillText(String(bar), x + 2, height - 2);
    }

    // playhead
    const px = ((currentBar - 1) / (totalBars - 1)) * width;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 1, 0, 2, height);
  }, [song, totalBars, currentBar, dragStartBar, dragEndBar]);

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  return (
    <div className="waveform-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="waveform-canvas"
        onMouseDown={(e) => {
          if (!editable) return;
          setDragStartBar(Math.round(barFromClientX(e.clientX)));
          setDragEndBar(Math.round(barFromClientX(e.clientX)));
        }}
        onMouseMove={(e) => {
          if (!editable || dragStartBar === null) return;
          setDragEndBar(Math.round(barFromClientX(e.clientX)));
        }}
        onMouseUp={() => {
          if (editable && dragStartBar !== null && dragEndBar !== null && onCreateRange) {
            const a = Math.min(dragStartBar, dragEndBar);
            const b = Math.max(dragStartBar, dragEndBar);
            if (b - a >= 1) onCreateRange(a, b);
          }
          setDragStartBar(null);
          setDragEndBar(null);
        }}
        onClick={(e) => {
          if (editable) return;
          onSeekBar(Math.round(barFromClientX(e.clientX)));
        }}
      />
    </div>
  );
}
