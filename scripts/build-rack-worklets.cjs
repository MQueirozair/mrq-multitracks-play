// Compila os AudioWorkletProcessor do Rack de instrumentos (ex.: o motor FM do
// DX7) como arquivos JS autocontidos em public/vendor/, servidos por URL
// relativa simples (mesmo padrão usado pros arquivos do js-synthesizer).
// Não usamos o empacotamento normal do Vite pra isso porque AudioWorklet exige
// carregar o módulo por `audioWorklet.addModule(url)` a partir de um arquivo
// real, e o jeito mais previsível/robusto de garantir isso em dev e produção
// é pré-compilar com esbuild pra um arquivo estático versionado.
const esbuild = require('esbuild');
const path = require('node:path');

const root = path.join(__dirname, '..');

async function build() {
  await esbuild.build({
    entryPoints: [path.join(root, 'src/audio/rack/worklet-src/Dx7Processor.ts')],
    outfile: path.join(root, 'public/vendor/dx7-worklet/dx7-processor.js'),
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: true,
    logLevel: 'info',
  });
  console.log('[build-rack-worklets] dx7-processor.js gerado em public/vendor/dx7-worklet/');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
