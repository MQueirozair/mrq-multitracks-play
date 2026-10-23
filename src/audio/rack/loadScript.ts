// Injeta uma tag <script> clássica uma única vez e espera carregar. Usado só
// pelo motor FluidSynth (WASM) do rack de instrumentos: a build "browser" dele
// é distribuída como script global (não como módulo ES), então carregamos via
// <script src> em vez de import — é o jeito documentado pelo próprio projeto
// pra rodar em uma página/janela comum (ver js-synthesizer/README "From main thread").
const loaded = new Set<string>();

export function loadScriptOnce(src: string): Promise<void> {
  if (loaded.has(src)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-mrq-src="${src}"]`);
    if (existing) {
      loaded.add(src);
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.mrqSrc = src;
    script.onload = () => {
      loaded.add(src);
      resolve();
    };
    script.onerror = () => reject(new Error(`Falha ao carregar script ${src}`));
    document.head.appendChild(script);
  });
}
