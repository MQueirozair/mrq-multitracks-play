# MRQ Instrument Converter — Fase 1: Auditoria e Arquitetura

> Documento de referência. Nenhum código de produção foi alterado para
> produzir isto — é só o levantamento pedido antes de começar a implementação,
> fase a fase, conforme solicitado.

## 1. O que já existe no projeto (reaproveitável)

Uma auditoria no código revelou que **já existe um precursor direto** do que
está sendo pedido: um formato próprio chamado `.mrqi` ("MRQ Instrument"),
hoje usado só para exportar instrumentos Kontakt (`.nki`) já carregados.

| Arquivo | Linhas | O que faz hoje |
|---|---|---|
| `src/audio/rack/mrqiFormat.ts` | 172 | Empacota/desempacota um contêiner `.mrqi` (hoje: ZIP via `fflate` + PCM Float32 cru por amostra + `manifest.json`) |
| `src/audio/rack/mrqiExport.ts` | 50 | Converte um `NkiLayerVoice` já carregado em um pacote `.mrqi` |
| `src/audio/rack/MrqiLayerVoice.ts` | 164 | Toca de volta um pacote `.mrqi` |
| `src/audio/rack/NkiLayerVoice.ts` | 537 | Parser real de Kontakt `.nki` (versões 1-4, não criptografado) |
| `src/audio/rack/SfzLayerVoice.ts` | 359 | Parser real de `.sfz` (grupos/regiões/opcodes) |
| `src/audio/rack/Sf2LayerVoice.ts` | — | SoundFont via FluidSynth (wasm), já usa `soundfont2` (JS) pra listar presets |
| `src/audio/rack/NpnoLayerVoice.ts` / `NsmpLayerVoice.ts` | — | Decodificam `.npno`/`.nsmp` via o módulo wasm próprio (`native/npno-wasm`, crate `nord-format`) — **já devolve PCM + metadados prontos**, é o leitor mais "pronto" de todos pra virar um importador MRQ |
| `src/audio/rack/SamplerLayerVoice.ts` | 96 | Importa um único `.wav/.aiff/.flac/.ogg/.mp3` via `ctx.decodeAudioData` nativo do navegador (já funciona hoje) |
| `src/components/InstrumentRack.tsx` (L.1615+) | — | Já tem um botão "Converter este instrumento Kontakt (.nki) para .mrqi" funcionando, ligado em `RackEngine.exportLayerAsMrqi()` |

**Conclusão:** a Fase 3-6 do pedido (importadores SF2/SF3/SFZ/NPNO/SYX/NKI)
não começam do zero — a extração de estrutura (zonas, presets, mapeamento de
teclas) **já existe e funciona** para SFZ, SF2, NPNO/NSMP e NKI (Kontakt
1-4). O trabalho real está em:
1. Formalizar essas saídas num modelo comum (**MRQ Instrument Model**, seção 3).
2. Trocar o contêiner de saída do protótipo (`.mrqi` = zip + PCM cru) pelo
   novo formato `.mrq` (binário próprio, FLAC, SHA-256, índice — seção 4).
3. Cobrir os formatos que faltam: WAV/AIFF/FLAC/MP3/OGG "puro" (como entrada
   dedicada do conversor, não só pra uma única camada) e o SYX/DX7 (não tem
   importador de *arquivo* hoje, só um motor de síntese em tempo real).

## 2. Arquitetura de runtime (por que isso importa pra esse app específico)

O app é **Tauri** (não Electron) — no macOS, a janela usa o **WKWebView do
próprio sistema operacional**. Isso já causou 3 incidentes nesta mesma sessão
de trabalho (tela preta por sintaxe ES2020+, crash de `.curve`, parse de wasm
com `reference-types`) — todos pela mesma raiz: **o WebView do Mac do
usuário é velho e não aceita certas saídas de ferramentas modernas**
(bundlers, compiladores wasm, etc. assumem recursos recentes por padrão).

Isso muda a arquitetura recomendada do conversor: **tudo que for
decodificação/codificação de áudio "pesada" ou sensível a versão de engine
deve rodar no backend Rust (`src-tauri/`), não no WebView**. O binário Rust
compilado é nativo — não depende em nada da versão do WebKit instalado. Já
tivemos de "lutar" contra o WebView repetidas vezes este mês; não vale a pena
arriscar o mesmo com FLAC/hashing/parsing binário pesado.

Prática já estabelecida no projeto pra contornar isso quando algo *precisa*
rodar no WebView mas usa sintaxe nova (ex.: BigInt do motor FM do DX7): pré-
compilar com esbuild num alvo mais permissivo (`es2020`) como artefato
separado, **fora** do bundle principal do Vite (que usa `es2019` de propósito
— ver comentário em `vite.config.ts`). Vou seguir esse mesmo padrão sempre
que algum trecho do conversor precisar ficar no WebView mas usar sintaxe
nova.

## 3. MRQ Instrument Model (representação intermediária)

Evolução direta do `MrqiManifest`/`MrqiZoneDef`/`MrqiGroupDef` já existentes,
acrescentando os campos pedidos que ainda faltam (envelope, filtro,
modulação, parâmetros MIDI, afinação, config estéreo, round robin):

```ts
interface MrqInstrumentModel {
  formatVersion: number;
  name: string;
  sourceFormat: 'sf2' | 'sf3' | 'sfz' | 'npno' | 'nsmp' | 'syx-dx7' | 'nki' | 'wav' | 'aiff' | 'flac' | 'mp3' | 'ogg';
  importedAt: string;
  presets: MrqPreset[];           // 1 instrumento pode ter N presets (ex.: bancos SF2)
}

interface MrqPreset {
  id: string;
  name: string;
  groups: MrqGroup[];
}

interface MrqGroup {
  id: string;
  name: string;
  zones: MrqZone[];
  envelope?: MrqEnvelope;          // ADSR default do grupo, zona pode sobrescrever
  filter?: MrqFilter;
  modulation?: MrqModulation[];
}

interface MrqZone {
  sampleId: string;                // referencia a MrqSample.id (ver seção 4)
  rootNote: number;
  loKey: number; hiKey: number;
  loVel: number; hiVel: number;
  roundRobinGroup?: string;        // zonas com o mesmo valor alternam em round robin
  roundRobinIndex?: number;
  tuneCents: number;
  volumeDb: number;
  pan: number;                      // -1..1
  stereo: 'mono' | 'stereo' | 'left' | 'right';
  loopEnabled?: boolean;
  loopStart?: number; loopEnd?: number;
  envelope?: MrqEnvelope;           // sobrescreve o do grupo, se houver
  filter?: MrqFilter;
}

interface MrqEnvelope {
  attack: number; hold?: number; decay: number; sustain: number; release: number; // segundos / 0..1
}

interface MrqFilter {
  type: 'lowpass' | 'highpass' | 'bandpass' | 'none';
  cutoffHz: number;
  resonance: number; // Q
}

interface MrqModulation {
  source: 'lfo' | 'envelope2' | 'velocity' | 'aftertouch' | 'modwheel';
  destination: 'pitch' | 'cutoff' | 'volume' | 'pan';
  amount: number;
}

// Parâmetros MIDI/globais do instrumento inteiro (não por zona)
interface MrqMidiConfig {
  pitchBendRangeSemitones: number;
  defaultChannel: number;
  transposeSemitones: number;
}
```

Campos que **não** puderem ser extraídos de um formato de origem ficam
`undefined` — nunca inventados. O relatório de compatibilidade (pedido na
seção 8 do pedido original) lista exatamente o que ficou de fora por formato.

## 4. Formato de arquivo `.mrq` (contêiner binário próprio)

**Não é um zip renomeado.** Layout binário customizado:

```
offset 0   [4 bytes]   magic = "MRQ1" (ASCII)
offset 4   [4 bytes]   versão do formato (u32 LE) — hoje: 1
offset 8   [8 bytes]   tamanho do bloco de metadados em bytes (u64 LE)
offset 16  [N bytes]   metadados: JSON UTF-8 do MrqInstrumentModel completo
                        + um índice de amostras: para cada amostra,
                        { id, byteOffset (u64), byteLength (u64),
                          sha256 (64 hex chars), sampleRateHz, channels,
                          bitsPerSampleOriginal, codec: "flac" }
offset 16+N            bloco de amostras: áudio FLAC concatenado, um atrás do
                        outro, nos offsets exatos gravados no índice acima —
                        isso é o que garante acesso aleatório real (ler só os
                        bytes de UMA amostra sem precisar descomprimir o
                        arquivo inteiro, bastando o índice already-in-memory)
EOF - 32   [32 bytes]  SHA-256 do arquivo inteiro (tudo antes deste bloco),
                        pra checagem de integridade geral além da por-amostra
```

- **Áudio:** sempre recodificado para **FLAC lossless**, perfil padrão
  24-bit/48kHz, mas preservando a resolução original quando ela for maior
  (ex.: uma fonte 32-bit/96kHz não é degradada; uma fonte 16-bit/44.1kHz não é
  artificialmente "upscalada" — só convertida pro container sem perda
  adicional. "Perfil padrão 24/48" vale como *teto* de conversão quando a
  politica de qualidade pedir redução controlada, nunca como downsample
  automático sem avisar).
- **Metadados:** JSON simples, carregável sem precisar entender o resto do
  arquivo primeiro.
- **Integridade:** SHA-256 por amostra (detecta corrupção pontual) + SHA-256
  do arquivo inteiro (checagem geral rápida).
- **Versionamento:** campo próprio; leitores futuros podem decidir migrar/
  rejeitar versões desconhecidas, igual o `.mrqi` já faz hoje.

## 5. Bibliotecas candidatas e licenças

| Necessidade | Biblioteca proposta | Onde roda | Licença |
|---|---|---|---|
| Parsing SF2/SF3 (estrutura) | `soundfont2` (já em uso) | WebView (JS) | MIT |
| Síntese/preview SF2 em tempo real | `js-synthesizer` + FluidSynth wasm (já em uso) | WebView (wasm) | BSD-3-Clause |
| Parsing SFZ | parser próprio já existente (`SfzLayerVoice.ts`) | WebView (TS) | — (código nosso) |
| Parsing NKI | parser próprio já existente (`NkiLayerVoice.ts`) | WebView (TS) | — (código nosso) |
| Parsing/decode NPNO/NSMP | crate `nord-format` (já em uso) | wasm hoje; posso expor também como comando Tauri nativo | checar licença exata no crates.io antes da Fase 4 (ação pendente) |
| Síntese FM DX7 | `@audio/synth-dx7` (já em uso) | WebView, mas **fora do bundle principal do Vite** (ver seção 2) | Apache-2.0 |
| Decode WAV/AIFF/FLAC/MP3/OGG (arquivo avulso) | **`symphonia`** (proposta nova) | Backend Rust | MPL-2.0 |
| Encode FLAC (saída `.mrq`) | **`flacenc`** (proposta nova) | Backend Rust | Apache-2.0 |
| SHA-256 | **`sha2`** (RustCrypto, proposta nova) | Backend Rust | MIT OR Apache-2.0 |
| Empacotamento `.mrq` | código próprio (binário customizado, seção 4) | Backend Rust | — (código nosso) |

Todas as licenças candidatas são permissivas (MIT/Apache-2.0/BSD-3-Clause)
ou copyleft fraco por-arquivo (MPL-2.0 do `symphonia`) — nenhuma exige
publicar o código-fonte do MRQ Multitracks Play. `symphonia` e `flacenc` são
**puro Rust**, sem dependência de C/licenças de codec terceiras — mais fácil
de compilar de forma reprodutível (lição direta do caso `.npno` desta sessão,
onde uma dependência de toolchain específica quase inviabilizou o build).

## 6. NKI (Kontakt) — limite técnico e legal, não só de esforço

Pesquisei o estado da arte: até ferramentas comerciais estabelecidas de
conversão entre samplers (ex.: Chicken Systems Translator/SampleStack, usadas
há décadas pela indústria) **também não conseguem** ler:

- Kontakt 6 e mais recente (formato interno mudou, nenhuma ferramenta de
  terceiros lê hoje);
- Qualquer `.nki`/`.nkm`/`.nkb` que referencie `.nkx`/`.ncw` (amostras
  comprimidas/criptografadas) — **mesmo em Kontakt 4/5**. Isso não é uma
  limitação técnica superável com mais engenharia: é proteção anticópia
  deliberada da Native Instruments, que a própria indústria de conversores
  respeita há mais de uma década.

**Conclusão:** o parser `NkiLayerVoice.ts` já existente mira exatamente o
alvo realista — Kontakt 1-4(.2), não criptografado, com `.nkb` (banks) de
fora por enquanto. Vou manter esse escopo e **nunca declarar suporte total**
a `.nki`, exatamente como pedido. Todo `.nki` que não puder ser lido deve
gerar um relatório claro do motivo (criptografado / versão não suportada /
etc.), nunca falhar silenciosamente nem fingir sucesso parcial.

## 7. Nova página "MRQ Instrument Converter"

Segue o padrão de navegação já existente (visto na sua captura de tela):

- `src/state/useStore.ts`: adicionar `'converter'` ao union type `NavId`.
- `src/components/IconRail.tsx`: adicionar um item na lista `ITEMS` (ícone
  sugerido: `Replace` ou `FileAudio` do `lucide-react`, já uma dependência).
- `src/App.tsx`: adicionar um branch `nav === 'converter' ? <InstrumentConverter /> : ...`
  igual ao padrão já usado por `rack`/`help` (página cheia, sem painel
  lateral nem painel secundário).
- Novo componente `src/components/InstrumentConverter.tsx`, seguindo o
  design visual (cores, espaçamento, `theme.css`) já usado em
  `InstrumentRack.tsx`/`HelpPanel.tsx` — nada de biblioteca de UI nova.

Funcionalidades da tela (mapeando item a item do pedido): arrastar-e-soltar
com importação múltipla; detecção automática de formato pela extensão +
assinatura binária (magic bytes, não só a extensão do nome do arquivo);
árvore de presets/grupos/zonas pra inspeção antes de converter; seletor de
perfil de qualidade (24/48 padrão, ou "preservar original"); fila de
conversão com progresso e cancelamento por item; relatório de compatibilidade
por arquivo (preservado / aproximado / perdido, por campo); botão de
pré-escuta (reconstrução rápida via `MrqiLayerVoice`-like, tocando direto do
`.mrq` gerado).

## 8. Plano de fases (como pedido, uma por vez)

| Fase | Entregável | Reaproveita | Trabalho novo |
|---|---|---|---|
| 1 | Este documento | — | — |
| 2 | `mrqFormat.ts` (pack/unpack do `.mrq` novo) + comando Tauri Rust de empacotamento (FLAC+SHA-256) | Estrutura de ideias do `mrqiFormat.ts` atual | Layout binário novo, `flacenc`, `sha2`, `symphonia` no `src-tauri` |
| 3 | Importador SF2/SF3 → MRQ Instrument Model | `soundfont2`, parsing de generators/bags já exposto por ela | Mapear generators SF2 pros campos do modelo (envelope/filtro) |
| 4 | Importador NPNO/NSMP | Wasm `nord-format` já decodifica tudo | Só adaptação de formato de saída |
| 5 | Importador SYX + render opcional | `@audio/synth-dx7` | Pipeline de "renderizar N notas representativas pra sample", artefato esbuild separado (ver seção 2) |
| 6 | Importador NKI | `NkiLayerVoice.ts` | Só adaptação de saída + relatório de limites (seção 6) |
| 7 | Importador WAV/AIFF/FLAC/MP3/OGG avulso | — | `symphonia` no backend |
| 8 | Interface do conversor | Padrões visuais existentes | Componente novo |
| 9 | Integração com o Rack (tocar `.mrq` direto, ao lado do que já existe) | `MrqiLayerVoice.ts` como ponto de partida | Camada nova `MrqLayerVoice.ts` |
| 10 | Testes Windows/macOS | — | Suite de testes descrita na seção 8 do pedido original |

Por pedido explícito seu, vou implementar **uma fase por vez**, sem
substituir nenhum carregador atual antes de validar o novo, mantendo o
projeto sempre compilável.
