/**
 * Fallback de compatibilidade para `AudioContext` / `OfflineAudioContext`.
 *
 * Em WebViews com WebKit desatualizado — como em Macs antigos sem suporte
 * oficial da Apple, rodando macOS via OpenCore Legacy Patcher, que às vezes
 * ficam presos numa versão de Safari/WebKit de antes de ~2017 — o construtor
 * global `AudioContext` (sem prefixo) pode simplesmente não existir, só a
 * forma antiga com prefixo `webkitAudioContext`.
 *
 * Sem este fallback, `new AudioContext()` lança um `ReferenceError`
 * SÍNCRONO assim que o módulo que o referencia é carregado — e como
 * `src/audio/engineInstance.ts` cria o `AudioEngine` (que por sua vez cria
 * o `AudioContext`) no topo (top-level) do módulo, esse erro acontece ANTES do
 * React conseguir montar `#root`, resultando numa tela 100% preta sem
 * nenhum log visível no processo nativo (só aparece no console do
 * WebView). Ver diagnóstico via Web Inspector que identificou exatamente
 * esse erro: "Can't find variable: AudioContext".
 */
export const AudioContextCompat: typeof AudioContext = (
  typeof window !== 'undefined'
    ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    : undefined
) as typeof AudioContext;

export const OfflineAudioContextCompat: typeof OfflineAudioContext = (
  typeof window !== 'undefined'
    ? window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
    : undefined
) as typeof OfflineAudioContext;
