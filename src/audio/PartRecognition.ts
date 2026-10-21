import type { PartType, SongPart } from '../../shared/types';
import { PART_COLORS } from '../../shared/types';
import { newId } from '../lib/id';

/**
 * Reconhecimento de partes (beta): heurística de similaridade/novidade sobre a
 * faixa guia, SEM transcrição real de letra. Agrupa compassos parecidos para
 * sugerir onde ficam intro/verso/refrão/ponte. O usuário deve conferir e
 * ajustar — é um ponto de partida, não uma marcação definitiva.
 */
export function recognizeParts(
  buffer: AudioBuffer,
  bpm: number,
  timeSigNum: number,
  minBoundaryBars = 4
): SongPart[] {
  const secPerBar = (60 / bpm) * timeSigNum;
  const totalBars = Math.max(1, Math.floor(buffer.duration / secPerBar));
  if (totalBars < 4) return [];

  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const subdivisions = 8;
  const features: number[][] = [];

  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = Math.floor(bar * secPerBar * sr);
    const barEnd = Math.floor((bar + 1) * secPerBar * sr);
    const subLen = Math.floor((barEnd - barStart) / subdivisions);
    const vec: number[] = [];
    for (let s = 0; s < subdivisions; s++) {
      const start = barStart + s * subLen;
      const end = Math.min(data.length, start + subLen);
      let sumSq = 0;
      let zc = 0;
      let prev = 0;
      for (let i = start; i < end; i++) {
        const v = data[i];
        sumSq += v * v;
        if (i > start && (v >= 0) !== (prev >= 0)) zc++;
        prev = v;
      }
      const n = Math.max(1, end - start);
      vec.push(Math.sqrt(sumSq / n), zc / n);
    }
    features.push(normalize(vec));
  }

  // matriz de similaridade (coseno) entre compassos
  const n = features.length;
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const s = cosine(features[i], features[j]);
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }

  // curva de novidade via kernel "tabuleiro de xadrez" ao longo da diagonal
  const kernelSize = Math.min(8, Math.floor(n / 2) || 1);
  const novelty: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let score = 0;
    let count = 0;
    for (let a = -kernelSize; a < kernelSize; a++) {
      for (let b = -kernelSize; b < kernelSize; b++) {
        const x = i + a;
        const y = i + b;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const sign = Math.sign(a) * Math.sign(b) || 1;
        score += sign * sim[x][y];
        count++;
      }
    }
    novelty[i] = count ? score / count : 0;
  }

  // escolhe picos de novidade como fronteiras, respeitando distância mínima
  const boundaries = [0];
  for (let i = 1; i < n - 1; i++) {
    if (i - boundaries[boundaries.length - 1] < minBoundaryBars) continue;
    if (novelty[i] > novelty[i - 1] && novelty[i] >= novelty[i + 1] && novelty[i] > 0.02) {
      boundaries.push(i);
    }
  }
  boundaries.push(n);

  const segments = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    const avgFeature = averageVectors(features.slice(start, end));
    const energy = avgFeature.filter((_, idx) => idx % 2 === 0).reduce((a, b) => a + b, 0);
    segments.push({ startBar: start + 1, endBar: end + 1, feature: avgFeature, energy });
  }

  // agrupa segmentos parecidos (repetições) por similaridade média do vetor
  const groupOf: number[] = new Array(segments.length).fill(-1);
  let nextGroup = 0;
  for (let i = 0; i < segments.length; i++) {
    if (groupOf[i] !== -1) continue;
    groupOf[i] = nextGroup;
    for (let j = i + 1; j < segments.length; j++) {
      if (groupOf[j] !== -1) continue;
      if (cosine(segments[i].feature, segments[j].feature) > 0.93) groupOf[j] = nextGroup;
    }
    nextGroup++;
  }

  const groupCounts = new Map<number, number>();
  groupOf.forEach((g) => groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1));
  const repeatedGroups = [...groupCounts.entries()].filter(([, c]) => c >= 2).map(([g]) => g);
  const energyByGroup = new Map<number, number>();
  segments.forEach((s, i) => {
    const g = groupOf[i];
    energyByGroup.set(g, Math.max(energyByGroup.get(g) ?? 0, s.energy));
  });
  const chorusGroup = repeatedGroups.sort((a, b) => (energyByGroup.get(b)! - energyByGroup.get(a)!))[0];

  const parts: SongPart[] = segments.map((seg, i) => {
    let type: PartType = 'Outra';
    const g = groupOf[i];
    if (i === 0 && seg.endBar - seg.startBar <= 8) type = 'Intro';
    else if (i === segments.length - 1) type = 'Final';
    else if (g === chorusGroup) type = 'Refrão';
    else if (repeatedGroups.includes(g)) type = 'Verso';
    else if (i > segments.length / 2) type = 'Ponte';
    else type = 'Instrumental';

    return {
      id: newId(),
      name: type,
      type,
      startBar: seg.startBar,
      endBar: seg.endBar,
      color: PART_COLORS[type],
    };
  });

  return mergeDuplicateNames(parts);
}

function mergeDuplicateNames(parts: SongPart[]): SongPart[] {
  const counts = new Map<string, number>();
  return parts.map((p) => {
    const count = (counts.get(p.type) ?? 0) + 1;
    counts.set(p.type, count);
    const countsSoFar = parts.filter((q) => q.type === p.type).length;
    const name = countsSoFar > 1 ? `${p.type} ${count}` : p.type;
    return { ...p, name };
  });
}

function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return vec.map((v) => v / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const out = new Array(vectors[0].length).fill(0);
  for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i];
  return out.map((v) => v / vectors.length);
}
