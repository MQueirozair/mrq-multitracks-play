import type { PartType, SongPart } from '../../shared/types';
import { PART_COLORS } from '../../shared/types';
import { newId } from '../lib/id';

/**
 * Reconhecimento de partes (beta): heurística de similaridade/novidade sobre a
 * faixa guia, SEM transcrição real de letra. Agrupa compassos parecidos para
 * sugerir onde ficam intro/verso/refrão/ponte. O usuário deve conferir e
 * ajustar — é um ponto de partida, não uma marcação definitiva.
 *
 * Pipeline (técnica clássica de MIR — Foote 2000 "novelty-based segmentation",
 * a mesma base usada por ferramentas como MSAF):
 *   1. extrai um vetor de features (energia RMS + taxa de cruzamento por zero)
 *      por sub-janela de cada compasso;
 *   2. monta a matriz de autossimilaridade (cosseno) entre todos os compassos;
 *   3. corre um kernel "tabuleiro de xadrez" com decaimento gaussiano pela
 *      diagonal pra obter a curva de novidade (pico = provável troca de parte);
 *   4. suaviza a curva e escolhe os picos mais fortes com espaçamento mínimo
 *      e limiar adaptativo (média + desvio-padrão, ajustável por `sensitivity`);
 *   5. "repara" segmentos curtos demais (ruído/preenchimento de bateria etc.)
 *      fundindo-os no vizinho mais parecido, em vez de virarem uma parte nova.
 *
 * Esse pipeline substitui a versão anterior (limiar fixo `> 0.02`, sem
 * suavização, sem reparo de segmentos curtos), que gerava partes demais em
 * músicas com variação de dinâmica dentro da mesma seção (fill de bateria,
 * ad-lib vocal, etc. já bastavam pra criar uma "parte" nova indevidamente).
 */

export type RecognitionSensitivity = 'poucas' | 'normal' | 'muitas';

export interface RecognizeOptions {
  /** Distância mínima (em compassos) entre duas partes sugeridas. */
  minBoundaryBars?: number;
  /**
   * Controla quão exigente é o limiar de novidade pra aceitar uma fronteira:
   * 'poucas' = só trocas bem óbvias (menos partes, menos revisão manual);
   * 'normal' = equilíbrio (padrão);
   * 'muitas' = pega até trocas sutis (mais partes, mais trabalho de revisão).
   */
  sensitivity?: RecognitionSensitivity;
}

const SENSITIVITY_FACTOR: Record<RecognitionSensitivity, number> = {
  poucas: 2.0,
  normal: 1.4,
  muitas: 0.7,
};

export function recognizeParts(
  buffer: AudioBuffer,
  bpm: number,
  timeSigNum: number,
  options: RecognizeOptions = {}
): SongPart[] {
  const minBoundaryBars = Math.max(2, Math.round(options.minBoundaryBars ?? 8));
  const sensitivity = options.sensitivity ?? 'normal';

  const secPerBar = (60 / bpm) * timeSigNum;
  const totalBars = Math.max(1, Math.floor(buffer.duration / secPerBar));
  if (totalBars < minBoundaryBars * 2) return [];

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

  const n = features.length;

  // matriz de similaridade (cosseno) entre compassos
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const s = cosine(features[i], features[j]);
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }

  const novelty = computeNoveltyCurve(sim, n, minBoundaryBars);
  const smoothed = smoothCurve(novelty, 1);
  const boundaries = pickBoundaries(smoothed, n, minBoundaryBars, sensitivity, totalBars);

  let segments = boundaries.slice(0, -1).map((start, i) => {
    const end = boundaries[i + 1];
    const avgFeature = averageVectors(features.slice(start, end));
    const energy = avgFeature.filter((_, idx) => idx % 2 === 0).reduce((a, b) => a + b, 0);
    return { startBar: start + 1, endBar: end + 1, feature: avgFeature, energy };
  });

  // Repara segmentos curtos demais (ruído, fill, respiro) fundindo no vizinho
  // mais parecido — evita que cada pequena variação vire uma "parte" nova.
  const hardMinBars = Math.max(2, Math.min(minBoundaryBars, 4));
  segments = repairShortSegments(segments, hardMinBars);

  // agrupa segmentos parecidos (repetições) por similaridade média do vetor
  const groupOf: number[] = new Array(segments.length).fill(-1);
  let nextGroup = 0;
  for (let i = 0; i < segments.length; i++) {
    if (groupOf[i] !== -1) continue;
    groupOf[i] = nextGroup;
    for (let j = i + 1; j < segments.length; j++) {
      if (groupOf[j] !== -1) continue;
      if (cosine(segments[i].feature, segments[j].feature) > 0.88) groupOf[j] = nextGroup;
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

/**
 * Curva de novidade via kernel "tabuleiro de xadrez" com decaimento gaussiano
 * (Foote, 2000): mede, pra cada compasso, o quanto o lado esquerdo e o lado
 * direito de uma janela ao redor dele são parecidos entre si e diferentes um
 * do outro — picos indicam a "costura" entre duas seções distintas.
 */
function computeNoveltyCurve(sim: number[][], n: number, minBoundaryBars: number): number[] {
  // Uma janela pequena demais confunde troca de parte real com variação de
  // curto prazo (fill de bateria, respiro, ad-lib) — usar uma janela do
  // tamanho da própria distância mínima entre partes faz o kernel "enxergar"
  // através desse ruído de curto prazo e só reagir a mudanças que realmente
  // duram uma seção inteira.
  const L = Math.max(4, Math.min(24, minBoundaryBars));
  const sigma = Math.max(1, L / 2);
  const kernel: number[][] = Array.from({ length: 2 * L + 1 }, () => new Array(2 * L + 1).fill(0));
  let kernelWeight = 0;
  for (let a = -L; a <= L; a++) {
    for (let b = -L; b <= L; b++) {
      const taper = Math.exp(-(a * a + b * b) / (2 * sigma * sigma));
      const sign = Math.sign(a) * Math.sign(b);
      const value = sign * taper;
      kernel[a + L][b + L] = value;
      kernelWeight += Math.abs(value);
    }
  }
  if (kernelWeight === 0) kernelWeight = 1;

  const novelty = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let score = 0;
    for (let a = -L; a <= L; a++) {
      const x = i + a;
      if (x < 0 || x >= n) continue;
      const row = kernel[a + L];
      for (let b = -L; b <= L; b++) {
        const y = i + b;
        if (y < 0 || y >= n) continue;
        score += row[b + L] * sim[x][y];
      }
    }
    novelty[i] = score / kernelWeight;
  }

  // O kernel fica truncado perto das bordas (soma parcial, sem o "outro lado"
  // da janela) e isso cria picos artificiais enormes bem no início/fim — não
  // são trocas de parte reais, são o efeito de borda do próprio filtro. Zera
  // essa faixa antes de normalizar, senão ela domina a escala e esconde as
  // trocas de verdade (é a mesma correção usada por implementações de
  // referência do método de Foote, ex. MSAF).
  for (let i = 0; i < Math.min(L, n); i++) novelty[i] = 0;
  for (let i = Math.max(0, n - L); i < n; i++) novelty[i] = 0;

  // normaliza pra [0, 1] — deixa o limiar adaptativo comparável entre músicas
  const min = Math.min(...novelty);
  const max = Math.max(...novelty);
  const range = max - min || 1;
  return novelty.map((v) => (v - min) / range);
}

/** Média móvel simples — achata picos de 1 compasso só (ruído/fill isolado). */
function smoothCurve(curve: number[], window: number): number[] {
  const n = curve.length;
  return curve.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = -window; k <= window; k++) {
      const idx = i + k;
      if (idx < 0 || idx >= n) continue;
      sum += curve[idx];
      count++;
    }
    return sum / count;
  });
}

/**
 * Escolhe as fronteiras finais: limiar adaptativo (média + desvio-padrão da
 * própria curva, ajustado por `sensitivity`), seleção gulosa pelos picos mais
 * fortes primeiro respeitando distância mínima, e um teto de partes
 * proporcional ao tamanho da música pra evitar fragmentação exagerada.
 */
function pickBoundaries(
  curve: number[],
  n: number,
  minBoundaryBars: number,
  sensitivity: RecognitionSensitivity,
  totalBars: number
): number[] {
  const mean = curve.reduce((a, b) => a + b, 0) / curve.length;
  const variance = curve.reduce((a, b) => a + (b - mean) ** 2, 0) / curve.length;
  const std = Math.sqrt(variance);
  const threshold = mean + SENSITIVITY_FACTOR[sensitivity] * std;

  const candidates: { index: number; value: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    const isPeak = curve[i] >= curve[i - 1] && curve[i] >= curve[i + 1] && (curve[i] > curve[i - 1] || curve[i] > curve[i + 1]);
    if (isPeak && curve[i] >= threshold) candidates.push({ index: i, value: curve[i] });
  }
  candidates.sort((a, b) => b.value - a.value);

  const maxInternalBoundaries = Math.max(2, Math.min(23, Math.round(totalBars / (minBoundaryBars * 2.5))));
  const accepted: number[] = [];
  for (const c of candidates) {
    if (accepted.length >= maxInternalBoundaries) break;
    if (accepted.some((b) => Math.abs(b - c.index) < minBoundaryBars)) continue;
    accepted.push(c.index);
  }
  accepted.sort((a, b) => a - b);

  return [0, ...accepted, n];
}

/**
 * Funde no vizinho mais parecido qualquer segmento mais curto que
 * `hardMinBars` — ruído/variação pontual não vira parte nova sozinha.
 */
function repairShortSegments<T extends { startBar: number; endBar: number; feature: number[]; energy: number }>(
  segments: T[],
  hardMinBars: number
): T[] {
  let list = [...segments];
  let changed = true;
  while (changed && list.length > 1) {
    changed = false;
    for (let i = 0; i < list.length; i++) {
      const bars = list[i].endBar - list[i].startBar;
      if (bars >= hardMinBars) continue;
      const prev = i > 0 ? list[i - 1] : null;
      const next = i < list.length - 1 ? list[i + 1] : null;
      const simPrev = prev ? cosine(list[i].feature, prev.feature) : -Infinity;
      const simNext = next ? cosine(list[i].feature, next.feature) : -Infinity;
      const mergeWithPrev = simPrev >= simNext;
      const target = mergeWithPrev ? prev : next;
      if (!target) continue;
      const mergedStart = mergeWithPrev ? target.startBar : list[i].startBar;
      const mergedEnd = mergeWithPrev ? list[i].endBar : target.endBar;
      const mergedBars = mergedEnd - mergedStart;
      const wA = (target.endBar - target.startBar) / mergedBars;
      const wB = (list[i].endBar - list[i].startBar) / mergedBars;
      const mergedFeature = target.feature.map((v, idx) => v * wA + list[i].feature[idx] * wB);
      const merged = {
        ...target,
        startBar: mergedStart,
        endBar: mergedEnd,
        feature: mergedFeature,
        energy: target.energy * wA + list[i].energy * wB,
      } as T;
      const targetIndex = mergeWithPrev ? i - 1 : i + 1;
      const next_list = [...list];
      next_list.splice(Math.min(i, targetIndex), 2, merged);
      list = next_list;
      changed = true;
      break;
    }
  }
  return list;
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
