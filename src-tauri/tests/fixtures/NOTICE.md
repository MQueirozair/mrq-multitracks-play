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
