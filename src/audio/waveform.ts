/** Reduz um AudioBuffer a uma lista de picos (0..1) para desenho rápido da forma de onda. */
export function computePeaks(buffer: AudioBuffer, buckets: number): number[] {
  const channelData = buffer.getChannelData(0);
  const samplesPerBucket = Math.max(1, Math.floor(channelData.length / buckets));
  const peaks: number[] = new Array(buckets).fill(0);
  for (let b = 0; b < buckets; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(channelData.length, start + samplesPerBucket);
    let max = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(channelData[i]);
      if (v > max) max = v;
    }
    peaks[b] = max;
  }
  return peaks;
}

export async function decodeForAnalysis(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}
