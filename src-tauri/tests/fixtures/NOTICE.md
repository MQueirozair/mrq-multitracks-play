# Fixtures de teste do importador SF2/SF3

Estes dois arquivos **não são conteúdo nosso** — são fixtures de teste
públicas usadas pelo próprio projeto [OxiSynth](https://github.com/PolyMeilex/OxiSynth)
(autor da crate `soundfont` que usamos para o parsing, licença MIT), de onde
foram baixados:

- `sin.sf2` — `https://raw.githubusercontent.com/PolyMeilex/OxiSynth/master/testdata/sin.sf2`
  (instrumento sintético minúsculo de onda senoidal, usado nos próprios
  exemplos da crate `soundfont`).
- `boomwhacker.sf3` — `https://raw.githubusercontent.com/PolyMeilex/OxiSynth/master/testdata/Boomwhacker.sf3`
  ("Boomwhacker", SoundFont de teste amplamente redistribuído entre projetos
  de sintetizador open source — aqui com amostras comprimidas em Vorbis,
  exatamente o caso `.sf3` que o importador precisa cobrir).

Usados exclusivamente pelos testes automatizados (`cargo test`) do
importador `src-tauri/src/importers/sf2.rs` — nunca embutidos no bundle de
produção do app.

# Fixtures de teste do importador NPNO/NSMP (Fase 4)

Estes três arquivos também **não contêm nenhum dado comercial da Clavia** —
são conteúdo 100% sintético (senoides geradas por código), gravados pelo
codificador de verdade do crate `nord-format` (o mesmo usado pra decodificar),
reaproveitados de `test-fixtures/` na raiz do repositório (onde já serviam
pros testes manuais do decodificador wasm do Rack):

- `synthetic-test-piano.npno` — gerado por `native/npno-fixture-gen`
  (`cargo run --bin npno-fixture-gen`): 3 raízes gravadas (C3/C4/C5), cada
  uma com 2 camadas de velocidade no banco `Attack` (layer 0 = forte, layer
  20 = fraca) mais um stroke de `Release` na raiz C4 — layout documentado
  no próprio `main.rs` do gerador.
- `corrupt.npno` — um `.npno` sintético deliberadamente truncado/corrompido,
  usado só pra confirmar que o importador falha de forma estruturada (nunca
  em panic) diante de um arquivo com estrutura inválida.
- `synthetic-test-nsmp.nsmp` — amostra Nord Sample Library (geração 2)
  sintética, usada pelos testes manuais do decodificador `.nsmp` do Rack
  (`public/test-nsmp.html`).

Usados exclusivamente pelos testes automatizados (`cargo test`) do
importador `src-tauri/src/importers/npno.rs` — nunca embutidos no bundle de
produção do app.
