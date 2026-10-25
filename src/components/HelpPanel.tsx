import { useEffect, useRef, useState } from 'react';
import {
  Library,
  ListMusic,
  LayoutGrid,
  AudioWaveform,
  Timer,
  FileText,
  Volume2,
  Hash,
  Mic,
  Piano,
  Layers,
  Smartphone,
  Monitor,
  RefreshCw,
  Database,
  GraduationCap,
  Guitar,
  KeyboardMusic as KeyboardMusicIcon,
  Info,
} from 'lucide-react';

const BASE = import.meta.env.BASE_URL;

function FormatChip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return <span className={`format-chip ${accent ? 'accent' : ''}`}>{children}</span>;
}

function Figure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="help-figure">
      <img src={`${BASE}help/${src}`} alt={alt} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

function SectionHead({ icon: Icon, title, purpose }: { icon: typeof Library; title: string; purpose: string }) {
  return (
    <div className="help-section-head">
      <div className="help-section-icon">
        <Icon size={17} />
      </div>
      <div>
        <h2>{title}</h2>
        <p className="help-section-purpose">{purpose}</p>
      </div>
    </div>
  );
}

const TOC: { id: string; label: string }[] = [
  { id: 'inicio', label: 'Início' },
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'setlist', label: 'Lista / Cenas' },
  { id: 'arranjar', label: 'Arranjar' },
  { id: 'faixas', label: 'Faixas (mixer)' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'cifra', label: 'Cifra' },
  { id: 'saidas', label: 'Saídas' },
  { id: 'tom', label: 'Tom' },
  { id: 'guia', label: 'Voz guia' },
  { id: 'midi', label: 'MIDI / Pad' },
  { id: 'rack', label: 'Rack de instrumentos' },
  { id: 'remoto', label: 'Controle remoto' },
  { id: 'palco', label: 'Modo Palco' },
  { id: 'backup', label: 'Backup' },
  { id: 'atualizacoes', label: 'Atualizações' },
  { id: 'casos-de-uso', label: 'Como usar' },
  { id: 'atalhos', label: 'Atalhos' },
  { id: 'suporte', label: 'Suporte' },
];

export default function HelpPanel() {
  const [appVersion, setAppVersion] = useState('—');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.api.app?.getVersion().then(setAppVersion).catch(() => {});
  }, []);

  function goTo(id: string) {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="help-page">
      <div className="help-scroll" ref={scrollRef}>
        <div className="help-hero" id="inicio">
          <div className="help-hero-top">
            <img src={`${BASE}app-icon-64.png`} alt="MRQ" />
            <div>
              <h1 className="help-hero-title">MRQ — Multitracks Play</h1>
              <p className="help-hero-sub">Guia completo: o que o programa faz e como configurar cada recurso</p>
            </div>
            <div className="help-version-pill">
              <Info size={13} /> Versão instalada: <strong>{appVersion}</strong>
            </div>
          </div>
          <p className="help-hero-lede">
            O MRQ foi feito pra duas situações: <b>tocar ao vivo com multitracks</b> (click, voz guia, bateria, baixo
            etc. tocando junto com a banda num show ou culto) e <b>estudar/ensaiar uma música sozinho</b> — isolando
            faixas, soltando o tempo, mudando o tom, lendo a cifra e treinando parte por parte antes do ensaio com o
            grupo. Todas as telas abaixo ficam disponíveis pelos ícones da barra à esquerda; esta página explica cada
            uma delas, os formatos de arquivo aceitos e o passo a passo de configuração.
          </p>

          <div className="help-formats-grid">
            <div className="help-formats-card">
              <h4>Faixas de multitrack (Biblioteca)</h4>
              <div className="chips">
                {['.wav', '.aiff', '.flac', '.mp3', '.ogg', '.opus', '.m4a', '.aac', '.wma', '.webm', '.caf', '.3gp'].map((f) => (
                  <FormatChip key={f}>{f}</FormatChip>
                ))}
              </div>
            </div>
            <div className="help-formats-card">
              <h4>Timbres do Rack de instrumentos</h4>
              <div className="chips">
                <FormatChip accent>.sf2 / .sf3</FormatChip>
                <FormatChip accent>.syx (DX7)</FormatChip>
                <FormatChip accent>.npno (Nord)</FormatChip>
                <FormatChip accent>.nsmp / .nsmp3 / .nsmp4 (Nord)</FormatChip>
                <FormatChip accent>.nki (Kontakt 1-4)</FormatChip>
                <FormatChip accent>.sfz (inclui Kontakt 5-8 exportado)</FormatChip>
                <FormatChip>.wav / .aiff / .flac / .mp3 / .ogg (amostra)</FormatChip>
              </div>
            </div>
            <div className="help-formats-card">
              <h4>Cifra</h4>
              <div className="chips">
                <FormatChip>Texto colado (sem arquivo)</FormatChip>
              </div>
            </div>
            <div className="help-formats-card">
              <h4>Backup / Cenas / Setlist</h4>
              <div className="chips">
                <FormatChip>.json</FormatChip>
              </div>
            </div>
          </div>
        </div>

        <div className="help-toc">
          {TOC.slice(1).map((t) => (
            <button key={t.id} onClick={() => goTo(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ---------------- BIBLIOTECA ---------------- */}
        <section className="help-section" id="biblioteca">
          <SectionHead icon={Library} title="Biblioteca" purpose="Importar músicas e organizar o acervo de multitracks" />
          <div className="help-grid-2">
            <div>
              <p>
                É aqui que toda música mora. Cada música é <b>uma pasta no seu computador</b> contendo uma faixa de
                áudio por instrumento/voz (ex.: "Clique.wav", "Guia.wav", "Bateria.wav"...). O MRQ nunca copia os
                arquivos de áudio — ele só memoriza o caminho da pasta, então o espaço em disco não dobra e músicas
                com pastas muito grandes abrem rápido.
              </p>
              <ol>
                <li>
                  Clique em <b>"Importar pasta de multitracks"</b> (botão laranja na tela inicial ou o <b>+</b> no
                  topo da Biblioteca).
                </li>
                <li>Escolha a pasta da música. O MRQ varre a pasta e lista toda faixa de áudio reconhecida.</li>
                <li>
                  Formatos aceitos nas faixas: <FormatChip>.wav/.wave</FormatChip> <FormatChip>.aiff/.aif/.aifc</FormatChip>{' '}
                  <FormatChip>.flac</FormatChip> <FormatChip>.mp3</FormatChip> <FormatChip>.ogg/.oga/.opus</FormatChip>{' '}
                  <FormatChip>.m4a/.mp4/.m4b/.aac</FormatChip> <FormatChip>.wma</FormatChip> <FormatChip>.webm</FormatChip>{' '}
                  <FormatChip>.caf</FormatChip> <FormatChip>.3gp</FormatChip>.
                </li>
                <li>
                  Use <b>"Buscar música..."</b> para achar pelo nome e <b>"Só favoritas"</b> pra filtrar as músicas
                  marcadas com estrela (clique na estrela do card da música pra favoritar).
                </li>
              </ol>
              <div className="help-callout tip">
                <b>Dica:</b> nomeie os arquivos de forma clara ("Clique", "Guia", "Bateria", "Baixo"...) — esse nome
                aparece em todo canto do app (mixer, Saídas, Tom) e facilita demais na hora do show.
              </div>
            </div>
            <Figure src="help-library-empty.png" alt="Tela inicial da Biblioteca" caption="Biblioteca vazia — primeiro passo é importar a pasta de uma multitrack." />
          </div>
          <Figure
            src="help-player-overview.png"
            alt="Música aberta mostrando forma de onda, partes e mixer"
            caption="Depois de importada e aberta, a música mostra a forma de onda, o roteiro de partes e o mixer de faixas."
          />
        </section>

        {/* ---------------- SETLIST / CENAS ---------------- */}
        <section className="help-section" id="setlist">
          <SectionHead icon={ListMusic} title="Lista (Cenas / Setlist)" purpose="Montar a ordem das músicas de um show, culto ou ensaio" />
          <div className="help-grid-2">
            <div>
              <p>
                Uma <b>Cena</b> é um setlist: uma lista ordenada de músicas prontas pra tocar em sequência num evento.
                Cada música dentro da cena guarda seu próprio <b>tom</b> e <b>BPM</b> escolhidos — assim a mesma
                música pode estar em tons diferentes em cenas diferentes, sem bagunçar o arquivo original.
              </p>
              <ol>
                <li>
                  Abra a aba <b>Lista</b>, clique em <b>"+ adicionar música à cena..."</b> e escolha entre as músicas
                  da Biblioteca.
                </li>
                <li>Clique numa música da lista pra abri-la e tocar.</li>
                <li>
                  Use os ícones no topo da cena pra <b>exportar</b> (baixa um arquivo <FormatChip>.json</FormatChip>{' '}
                  com a cena) ou <b>excluir</b> a cena.
                </li>
                <li>O histórico de execução (quando cada música tocou) fica disponível pelo ícone de relógio.</li>
              </ol>
              <div className="help-callout">
                Exportar/importar cenas em <FormatChip>.json</FormatChip> é útil pra levar o roteiro de um culto pra
                outro computador (ex.: notebook do músico de apoio) — mas lembre de reimportar as pastas de
                multitrack naquele computador também, já que o áudio em si não viaja dentro do arquivo da cena.
              </div>
            </div>
            <Figure src="help-setlist.png" alt="Cena com uma música adicionada" caption="Cena 'Culto de Domingo' com uma música na lista, pronta pra tocar." />
          </div>
        </section>

        {/* ---------------- ARRANJAR ---------------- */}
        <section className="help-section" id="arranjar">
          <SectionHead icon={LayoutGrid} title="Arranjar" purpose="Marcar as partes da música (Intro, Verso, Refrão...) e o roteiro de execução" />
          <div className="help-grid-2">
            <div>
              <p>
                Aqui você divide a música em <b>partes</b> (Intro, Verso, Pré-refrão, Refrão, Instrumental, Ponte,
                Solo, Tag, Interlúdio, Final, Outra) pra poder pular entre trechos ao vivo sem precisar tocar a música
                inteira do início ao fim.
              </p>
              <ol>
                <li>Arraste com o mouse sobre a forma de onda pra marcar um trecho novo.</li>
                <li>Dê um nome, escolha o tipo da parte e confirme em <b>"Adicionar parte"</b>.</li>
                <li>Clique numa parte já marcada, na lista "Partes marcadas", pra editar nome/tipo/compassos.</li>
                <li>Arraste os cartões pra <b>reordenar o roteiro</b> (a ordem de execução ao vivo).</li>
                <li>
                  <b>"Reconhecer partes (beta)"</b> tenta identificar as partes automaticamente a partir do áudio —
                  ótimo pra um primeiro rascunho, mas sempre revise o resultado.
                </li>
                <li><kbd>Delete</kbd> remove o passo selecionado do roteiro · <kbd>Ctrl+Z</kbd> desfaz · <kbd>Ctrl+Shift+Z</kbd> refaz.</li>
              </ol>
            </div>
            <Figure src="help-arrange.png" alt="Tela de Arranjar com partes marcadas" caption="Partes marcadas na forma de onda e lista editável abaixo." />
          </div>
        </section>

        {/* ---------------- FAIXAS / MIXER ---------------- */}
        <section className="help-section" id="faixas">
          <SectionHead icon={AudioWaveform} title="Faixas (mixer)" purpose="Ver a forma de onda de cada faixa separadamente e ajustar volume, mudo e solo" />
          <div className="help-grid-2">
            <div>
              <p>
                Mostra cada faixa de áudio da música numa linha própria, com sua forma de onda, além do mixer embaixo
                com um fader por faixa. Use <b>M</b> (mudo) e <b>S</b> (solo) pra isolar instrumentos — essencial tanto
                pra conferir uma faixa problemática quanto pra estudar uma parte específica (ex.: só o baixo).
              </p>
              <p>
                O botão <b>"Modo prova de som"</b> ajuda a testar canal por canal antes do show, e o fader{' '}
                <b>MASTER</b> controla o volume geral de tudo que está sendo reproduzido.
              </p>
            </div>
            <Figure src="help-tracks.png" alt="Visualização de faixas separadas" caption="Cada faixa com sua própria forma de onda, mais o mixer completo abaixo." />
          </div>
        </section>

        {/* ---------------- TEMPO ---------------- */}
        <section className="help-section" id="tempo">
          <SectionHead icon={Timer} title="Tempo" purpose="Click/metrônomo, fórmula de compasso e modo de ensaio em velocidade reduzida" />
          <div className="help-grid-2">
            <div>
              <p>
                <b>Modo Ensaio</b> é a ferramenta de estudo por excelência: toca a parte ativa em loop numa velocidade
                reduzida (50% a 100%) <i>sem alterar o BPM salvo da música</i> — perfeito pra treinar um trecho difícil
                devagar antes de tocar no tempo real.
              </p>
              <ol>
                <li>Escolha a porcentagem de velocidade desejada (50% a 100%).</li>
                <li>
                  Em <b>"BPM e compasso"</b>, clique <b>"Ajustar"</b> pra corrigir o andamento e a fórmula de compasso
                  reais da música (usados pra calcular os compassos das partes corretamente).
                </li>
                <li>
                  <b>"Dobrar o click"</b> sobrepõe um metrônomo próprio por cima do click já gravado na faixa, útil
                  quando o click original é fraco ou tem variação de tempo.
                </li>
              </ol>
            </div>
            <Figure src="help-tempo.png" alt="Painel de Tempo com Modo Ensaio" caption="Modo Ensaio (velocidade reduzida), BPM, fórmula de compasso e duplicação do click." />
          </div>
        </section>

        {/* ---------------- CIFRA ---------------- */}
        <section className="help-section" id="cifra">
          <SectionHead icon={FileText} title="Cifra" purpose="Colar a cifra da música e acompanhar com transposição automática" />
          <div className="help-grid-2">
            <div>
              <p>
                Não é um formato de arquivo — você <b>cola o texto</b> da cifra direto na caixa. Use colchetes pra
                marcar as seções, ex.: <code>[Refrão]</code>, com os acordes numa linha acima da letra. O MRQ separa
                as seções automaticamente e permite clicar numa parte à direita pra pular a música até ali.
              </p>
              <ol>
                <li>Clique em <b>"Colar cifra"</b>, cole o texto (informando o tom original da cifra) e salve.</li>
                <li>
                  Quando você muda o tom da música (na aba <b>Tom</b> ou no cabeçalho principal), a cifra é{' '}
                  <b>transposta automaticamente</b> — os acordes mudam, a letra não.
                </li>
              </ol>
            </div>
            <Figure src="help-chord.png" alt="Cifra colada com acordes" caption="Cifra colada com seções [Intro], [Verso 1], [Refrão]... e navegação pelas partes à direita." />
          </div>
        </section>

        {/* ---------------- SAÍDAS ---------------- */}
        <section className="help-section" id="saidas">
          <SectionHead icon={Volume2} title="Saídas" purpose="Rotear cada faixa pra um par de canais da sua interface de áudio" />
          <div className="help-grid-2">
            <div>
              <p>
                Pensado pra quem usa uma <b>interface de áudio multicanal</b> ao vivo: você pode mandar o click e a
                guia só pro fone de ouvido do baterista (um par de saída) e o restante da banda pra PA (outro par),
                por exemplo.
              </p>
              <ol>
                <li>
                  Primeiro configure quantos canais sua interface tem em <b>Ajustes → Áudio → "Canais de saída do
                  dispositivo"</b>.
                </li>
                <li>Volte em Saídas e escolha, faixa por faixa, qual par estéreo (1/2, 3/4...) ela deve usar.</li>
              </ol>
            </div>
            <Figure src="help-outputs.png" alt="Roteamento de faixas para pares de saída" caption="Cada faixa roteada para um par estéreo do dispositivo de áudio multicanal." />
          </div>
        </section>

        {/* ---------------- TOM ---------------- */}
        <section className="help-section" id="tom">
          <SectionHead icon={Hash} title="Tom" purpose="Escolher quais faixas acompanham a transposição de tom" />
          <div className="help-grid-2">
            <div>
              <p>
                Ao transpor a música (botões <b>+/-</b> de TOM no cabeçalho), nem toda faixa deve mudar de altura:
                click, guia e bateria normalmente ficam fixas, enquanto baixo, violão, teclado e vocais acompanham o
                novo tom. Aqui você define isso faixa por faixa, uma vez só — a escolha fica salva com a música.
              </p>
            </div>
            <Figure src="help-key.png" alt="Faixas marcadas para seguir o tom ou ficar fixas" caption="Click/guia/bateria fixos; baixo, violão, teclado e vocal acompanham o tom." />
          </div>
        </section>

        {/* ---------------- VOZ GUIA ---------------- */}
        <section className="help-section" id="guia">
          <SectionHead icon={Mic} title="Voz guia" purpose="Faixa de referência que anuncia as partes da música" />
          <div className="help-grid-2">
            <div>
              <p>
                Defina qual faixa é a "voz guia" (quem fala "próximo, refrão" etc. no fone dos músicos). O recurso
                mais importante aqui é o comportamento <b>quando você pula pra uma parte fora da ordem gravada</b> ao
                vivo:
              </p>
              <ul>
                <li><b>Não mexer</b> — a guia toca exatamente como foi gravada (pode anunciar a parte errada).</li>
                <li><b>Calar a guia</b> — ela simplesmente silencia nesse trecho e volta a falar quando a parte pedida chegar.</li>
                <li><b>Calar e anunciar a parte pedida</b> — a guia é cortada e o app anuncia por cima qual parte está vindo.</li>
              </ul>
            </div>
            <Figure src="help-guide.png" alt="Opções de comportamento da voz guia" caption="Escolha de faixa guia e comportamento ao pular partes fora de ordem." />
          </div>
        </section>

        {/* ---------------- MIDI / PAD ---------------- */}
        <section className="help-section" id="midi">
          <SectionHead icon={Piano} title="MIDI / Pad contínuo" purpose="Controlar o roteiro da música com um controlador MIDI físico" />
          <div className="help-grid-2">
            <div>
              <p>
                Permite "aprender" teclas de um controlador MIDI pra pular direto pro próximo trecho de um tipo (ex.:
                uma tecla sempre avança pro próximo Refrão), sem precisar olhar pro mouse durante o show.
              </p>
              <ol>
                <li>Clique em <b>"Aprender"</b> ao lado do tipo de parte desejado (Intro, Verso, Refrão...).</li>
                <li>Aperte a tecla do seu controlador MIDI que vai disparar aquele tipo de parte.</li>
                <li><b>"Limpar"</b> remove o mapeamento daquela tecla.</li>
              </ol>
              <p>Essa configuração é separada do MIDI físico usado pelo Rack de instrumentos (aba seguinte).</p>
            </div>
            <Figure src="help-midi.png" alt="Mapeamento de teclas MIDI por tipo de parte" caption="Uma tecla do controlador MIDI por tipo de parte da música." />
          </div>
        </section>

        {/* ---------------- RACK ---------------- */}
        <section className="help-section" id="rack">
          <SectionHead icon={Layers} title="Rack de instrumentos" purpose="Até 6 instrumentos virtuais tocáveis ao vivo por um teclado MIDI físico, por cima da multitrack" />
          <p>
            O Rack transforma o MRQ num instrumento ao vivo de verdade: conecte um teclado MIDI físico ao computador e
            toque até <b>6 camadas (instrumentos) simultâneas</b> por cima da música que está rodando — útil pra quem
            reforça o teclado/sintetizador da banda, cobre um naipe de cordas, ou simplesmente quer soar mais cheio
            sem contratar mais músicos.
          </p>
          <Figure
            src="help-rack-formats.png"
            alt="Rack com 6 camadas, cinco delas com instrumentos carregados de formatos diferentes"
            caption="As 6 camadas do Rack — cada uma pode carregar um formato de instrumento diferente, mais a coluna MASTER à direita."
          />

          <h3 style={{ fontSize: 13.5, marginTop: 18 }}>Formatos de timbre aceitos por camada</h3>
          <div className="help-formats-grid" style={{ marginBottom: 6 }}>
            <div className="help-formats-card">
              <h4>SoundFont</h4>
              <div className="chips"><FormatChip accent>.sf2</FormatChip><FormatChip accent>.sf3</FormatChip></div>
            </div>
            <div className="help-formats-card">
              <h4>Banco Yamaha DX7</h4>
              <div className="chips"><FormatChip accent>.syx</FormatChip></div>
            </div>
            <div className="help-formats-card">
              <h4>Amostra única (sampler)</h4>
              <div className="chips">
                <FormatChip>.wav</FormatChip><FormatChip>.aiff/.aif</FormatChip><FormatChip>.flac</FormatChip>
                <FormatChip>.ogg</FormatChip><FormatChip>.mp3</FormatChip>
              </div>
            </div>
            <div className="help-formats-card">
              <h4>Nord Piano Library</h4>
              <div className="chips"><FormatChip accent>.npno</FormatChip></div>
            </div>
            <div className="help-formats-card">
              <h4>Nord Sample Library</h4>
              <div className="chips">
                <FormatChip accent>.nsmp</FormatChip><FormatChip accent>.nsmp3</FormatChip><FormatChip accent>.nsmp4</FormatChip>
              </div>
            </div>
            <div className="help-formats-card">
              <h4>Kontakt (legado)</h4>
              <div className="chips"><FormatChip accent>.nki</FormatChip></div>
            </div>
            <div className="help-formats-card">
              <h4>SFZ (formato aberto)</h4>
              <div className="chips"><FormatChip accent>.sfz</FormatChip></div>
            </div>
          </div>
          <div className="help-callout warn">
            <b>Sobre o suporte a .nki:</b> o MRQ decodifica de verdade os patches <b>Kontakt 1 a 4</b> não criptografados
            (amostras/timbres — sem o motor de scripts do Kontakt). Patches protegidos por criptografia, ou salvos em
            versões 4.2.2 ou mais novas do Kontakt, não são suportados — o app mostra um erro claro nesses casos em
            vez de carregar algo incorreto.
          </div>
          <div className="help-callout warn">
            <b>Quer usar um instrumento do Kontakt 5, 6, 7 ou 8?</b> O formato desses arquivos é criptografado pela
            Native Instruments e não existe forma legítima de lê-lo de fora do Kontakt — nenhum app consegue isso sem
            usar sua cópia licenciada do programa. O caminho seguro e gratuito é: (1) abra o instrumento no seu
            próprio Kontakt; (2) se as amostras forem <code>.ncw</code>, use <b>Files → Batch Resave → Uncompressed
            WAV/AIF</b> (função oficial do Kontakt) pra gerar <code>.wav</code> comuns; (3) use o <b>Creator
            Tools / Instrument Editor</b> do Kontakt pra rodar um script de exportação pra SFZ (existem scripts
            prontos e gratuitos, inclusive um da Chicken Systems, que leem os grupos/zonas do instrumento carregado
            e geram o texto <code>.sfz</code>) — isso usa só a API oficial de script do Kontakt, não quebra nenhuma
            proteção; (4) carregue o <code>.sfz</code> resultante numa camada do Rack normalmente. Scripts, efeitos e
            interface customizada do Kontakt não são transferidos nesse processo — só o mapeamento de
            amostras/timbres, que é o que o Rack toca.
          </div>

          <h3 style={{ fontSize: 13.5, marginTop: 18 }}>Configurando cada camada</h3>
          <ol>
            <li>Clique em <b>"Carregar"</b> no cartão da camada e escolha o arquivo do instrumento no seu computador.</li>
            <li>
              Se o arquivo tiver múltiplos sons dentro (ex.: um SoundFont com vários instrumentos), escolha o
              desejado em <b>Instrumento</b>.
            </li>
            <li><b>Caráter</b> aplica uma coloração rápida ao timbre (predefinições de EQ/filtro).</li>
            <li>O fader vertical ajusta o volume da camada; <b>M</b>/<b>S</b> no cabeçalho mudam/isolam a camada.</li>
            <li>O <b>X</b> remove o instrumento carregado daquela camada.</li>
          </ol>

          <h3 style={{ fontSize: 13.5, marginTop: 18 }}>Ajustes avançados ("Editar")</h3>
          <div className="help-grid-2">
            <div>
              <p>Clicar em <b>"Editar"</b> abre o painel completo de ajustes daquela camada:</p>
              <ul>
                <li><b>Nota inicial/final</b> — a faixa de teclas do teclado físico que essa camada responde (dá pra "aprender" tocando as duas teclas extremas), útil pra dividir o teclado em zonas (graves = baixo, agudos = cordas, por exemplo).</li>
                <li><b>Oitava</b> e <b>Canal MIDI</b> — transposição e filtro de canal de entrada.</li>
                <li><b>Pan</b> — posição estéreo da camada.</li>
                <li><b>Nota raiz da amostra</b> — só no formato "amostra única": em que nota o som original foi gravado.</li>
                <li><b>Envelope</b> (attack/release), <b>Filtro</b> (cutoff), <b>EQ</b> de 3 bandas e <b>Drive/saturação</b> — processamento de som por camada.</li>
                <li><b>Escolher foto / Foto padrão</b> — personaliza a capa do cartão da camada com uma imagem própria.</li>
                <li>O botão de reset (seta circular) no topo volta envelope/filtro/EQ/drive/pan pro padrão.</li>
              </ul>
            </div>
            <Figure src="help-rack-editar.png" alt="Painel de ajustes de uma camada do Rack" caption="Faixa de notas, envelope, filtro, EQ, drive e foto personalizada da camada." />
          </div>

          <h3 style={{ fontSize: 13.5, marginTop: 18 }}>Teclado MIDI físico, latência e teclado virtual</h3>
          <p>
            Com a aba Rack aberta, a barra superior mostra a pílula de status do <b>teclado MIDI</b>. Clicando nela
            você escolhe o dispositivo conectado, a <b>curva de velocidade</b> (linear/suave/dura), uma{' '}
            <b>transposição global</b>, liga/desliga o <b>pedal de sustain</b> e ajusta o <b>tamanho do buffer de
            áudio</b> — buffers menores respondem mais rápido ao toque (menos latência) porém exigem mais do
            processador; buffers maiores são mais estáveis mas com mais atraso. O painel mostra a latência real
            medida, não só a solicitada.
          </p>
          <p>
            A tira <b>"Teclado virtual"</b>, na parte de baixo da tela, não é tocável com o mouse — ela é um{' '}
            <b>visor em tempo real</b> de 88 teclas que acende as notas que estão soando agora no teclado físico, e
            mostra (quando configurado) a faixa de notas de cada camada. É um feedback visual rápido de "quem está
            tocando o quê" sem precisar olhar pra tela de ajustes. A tecla <kbd>Esc</kbd> funciona como "pânico" —
            corta instantaneamente qualquer nota travada.
          </p>
          <p>
            Ao lado da pílula "Áudio OK", uma pílula roxa mostra em tempo real o <b>acorde</b> formado por todas as
            notas tocadas agora (juntando as notas de todas as camadas e canais MIDI), na nomenclatura de{' '}
            <b>cifra brasileira</b> (ex.: sétima maior = <code>C7M</code>, não "Cmaj7"). Reconhece tríades, sétimas
            (7, 7M, m7, m(7M), m7(b5), dim7), sus2/sus4, 6ª, 6/9, 9ª, 9M, m9, add9, 11ª, 13ª, dominantes alteradas
            (7(b5), 7(#5), 7(b9), 7(#9)), diminuto, aumentado, power chords e inversões (mostradas como "Acorde/Baixo",
            ex.: <code>C/E</code>). A pílula tem tamanho fixo e fica sempre visível — só o texto do acorde dentro
            dela muda, pra não "balançar" a barra de título a cada nota tocada. Pode ser desligada em{' '}
            <b>"Mostrar acorde detectado"</b>, no mesmo painel do teclado MIDI físico descrito acima.
          </p>

          <h3 style={{ fontSize: 13.5, marginTop: 18 }}>Reverb, compressor e delay por camada</h3>
          <p>
            Além do reverb geral do MASTER (quantidade de retorno), cada camada tem seu próprio <b>envio de reverb</b>{' '}
            (quanto dela entra no barramento compartilhado — ligado e em 100% por padrão, igual sempre foi), um{' '}
            <b>compressor</b> (threshold, razão e ganho de compensação, pra nivelar um timbre que varia muito de
            volume) e um <b>delay/eco</b> (tempo, realimentação e mistura seco/molhado) — tudo no painel "Editar" de
            cada camada, abaixo do Drive.
          </p>

          <h3 style={{ fontSize: 13.5, marginTop: 18 }}>Oitavador do MASTER</h3>
          <p>
            No rodapé da coluna MASTER, o <b>oitavador</b> dobra toda nota tocada em QUALQUER camada numa oitava{' '}
            <b>abaixo</b>, <b>acima</b> ou <b>ambas</b>, com um volume relativo ajustável — útil pra engrossar o som
            geral do rack (ex.: dar um "sub" por baixo de um piano) sem precisar duplicar manualmente o instrumento
            numa segunda camada transposta.
          </p>

          <h3 style={{ fontSize: 13.5, marginTop: 18 }}>Cenas do Rack (snapshots por Program Change)</h3>
          <p>
            Salve a configuração completa das 6 camadas (instrumentos, volumes, master, reverb) como uma{' '}
            <b>Cena do Rack</b> em <b>"Salvar cena atual"</b>. Cada cena salva fica associada a um número de{' '}
            <b>Program Change</b> do teclado físico — ou seja, dá pra trocar o "patch" inteiro do Rack ao vivo
            apertando um botão de PC no teclado, sem tocar no mouse.
          </p>
          <p>
            A coluna <b>MASTER</b> reúne o volume geral do Rack, um envio de <b>reverb</b> compartilhado e o botão{' '}
            <b>"Parar notas"</b> (pânico manual).
          </p>
          <p>
            Por fim, dentro da própria aba Rack existe um <b>painel de Música</b> minimizável, com o transporte
            (tocar/pausar/parar) e o roteiro de partes da música atualmente aberta no Setlist — assim quem está
            tocando os instrumentos do Rack ao vivo também consegue comandar a faixa de apoio sem trocar de aba.
          </p>
        </section>

        {/* ---------------- CONTROLE REMOTO ---------------- */}
        <section className="help-section" id="remoto">
          <SectionHead icon={Smartphone} title="Controle remoto pelo celular" purpose="Controlar o transporte da música a partir de um navegador no celular, na mesma rede Wi-Fi" />
          <div className="help-grid-2">
            <div>
              <p>
                Liga um pequeno servidor local (sem precisar de internet, só a mesma rede Wi-Fi do computador) que
                você acessa pelo navegador do celular pra tocar/pausar/pular partes de longe — útil pra quem opera o
                som de fora do palco ou quer liberar as mãos de quem está no instrumento.
              </p>
              <ol>
                <li>Abra <b>Ajustes → Remoto</b> e deixe <b>"Controle pelo celular"</b> como <b>Ligado</b>.</li>
                <li>Confira a <b>porta</b> (padrão 8787) e defina um <b>PIN</b> de 4 dígitos pra evitar acesso indevido.</li>
                <li>No celular, conectado na mesma rede, escaneie o <b>QR code</b> ou digite o endereço mostrado.</li>
              </ol>
              <div className="help-callout warn">
                O celular precisa estar na <b>mesma rede local</b> do computador (mesmo roteador/Wi-Fi). Em redes de
                evento com "isolamento de clientes" ativado, o celular pode não conseguir enxergar o computador — nesse
                caso use um roteador próprio ou ponto de acesso dedicado para o show.
              </div>
            </div>
            <Figure src="help-settings-remote.png" alt="Configuração do controle remoto com QR code" caption="Porta, PIN e QR code pra abrir o controle remoto no navegador do celular." />
          </div>
        </section>

        {/* ---------------- MODO PALCO ---------------- */}
        <section className="help-section" id="palco">
          <SectionHead icon={Monitor} title="Modo Palco" purpose="Tema de alto contraste e fontes maiores para telas em ambientes com pouca luz" />
          <p>
            O botão <b>"Palco"</b>, sempre visível na barra superior, alterna um tema de alto contraste com textos
            maiores — pensado pra ler a tela de relance durante uma apresentação com pouca luz no ambiente, sem
            precisar entrar em nenhum menu de ajustes.
          </p>
        </section>

        {/* ---------------- BACKUP ---------------- */}
        <section className="help-section" id="backup">
          <SectionHead icon={Database} title="Backup" purpose="Exportar e restaurar toda a biblioteca e as configurações do app" />
          <div className="help-grid-2">
            <div>
              <p>
                Em <b>Ajustes → Backup</b> você exporta um arquivo <FormatChip>.json</FormatChip> com toda a
                biblioteca (músicas, tons, roteiros/arranjos, favoritas, anotações) e as configurações do app. Ele{' '}
                <b>não inclui os arquivos de áudio em si</b> — só os caminhos e metadados — pra manter o arquivo
                pequeno e rápido de transportar.
              </p>
              <p>
                Pra restaurar num outro computador, importe o <FormatChip>.json</FormatChip> e, em seguida,
                reimporte as pastas das multitracks naquele computador (os caminhos de pasta são específicos de cada
                máquina).
              </p>
            </div>
            <Figure src="help-settings-backup.png" alt="Exportar e restaurar backup" caption="Exportação/restauração de backup em .json — biblioteca e configurações, sem os áudios." />
          </div>
        </section>

        {/* ---------------- ATUALIZAÇÕES ---------------- */}
        <section className="help-section" id="atualizacoes">
          <SectionHead icon={RefreshCw} title="Atualizações automáticas" purpose="O app se atualiza sozinho — sem precisar baixar e reinstalar manualmente" />
          <div className="help-grid-2">
            <div>
              <p>
                O MRQ verifica novas versões automaticamente em segundo plano. Quando encontra uma, baixa só os
                arquivos que mudaram e avisa quando está pronta pra instalar — basta clicar em{' '}
                <b>"Instalar e reiniciar"</b>. Suas músicas, tons e configurações são preservados entre versões.
              </p>
              <p>
                Em <b>Ajustes → Atualização</b> também dá pra forçar uma verificação manual com{' '}
                <b>"Verificar agora"</b> e conferir a versão instalada.
              </p>
            </div>
            <Figure src="help-settings-update.png" alt="Painel de atualizações e versão instalada" caption="Versão instalada, verificação manual de atualizações e acesso ao log de diagnóstico." />
          </div>
          <div className="help-callout warn">
            <b>No Mac, o Gatekeeper pode bloquear a primeira abertura</b> com uma mensagem do tipo <i>"não é possível
            abrir porque vem de um desenvolvedor não identificado"</i> ou <i>"o app está danificado e deve ser movido
            para o Lixo"</i>. Isso acontece com qualquer app baixado fora da App Store que não tenha certificado pago
            da Apple — não é um problema de versão do macOS nem de ser Intel ou Apple Silicon, e acontece até em Macs
            novos. Pra abrir mesmo assim: <b>clique com o botão direito (ou Control+clique) no ícone do app → "Abrir"
            → confirme "Abrir"</b> na caixa de diálogo (em vez de dar duplo-clique normal). Se ainda aparecer
            "danificado", abra o <b>Terminal</b> e rode (ajustando o caminho se necessário):{' '}
            <code>xattr -cr "/Applications/MRQ - Multitracks Play.app"</code>. Esse passo só é necessário na primeira
            instalação de cada versão baixada manualmente — as atualizações automáticas depois disso não pedem isso de novo.
          </div>
        </section>

        {/* ---------------- CASOS DE USO ---------------- */}
        <section className="help-section" id="casos-de-uso">
          <SectionHead icon={GraduationCap} title="Como usar: banda ao vivo x estudo/prática" purpose="Dois jeitos de tirar proveito do mesmo programa" />
          <div className="help-usecases">
            <div className="help-usecase-card">
              <h3><Guitar size={15} /> Tocando com a banda / show / culto</h3>
              <ul>
                <li>Monte a <b>Cena</b> com a ordem das músicas do evento.</li>
                <li>Configure <b>Saídas</b> pra mandar click/guia só pro fone dos músicos e a banda pra PA.</li>
                <li>Marque faixas fixas x que seguem o <b>Tom</b>, pra poder transpor na hora sem susto.</li>
                <li>Use <b>Arranjar</b> pra pular direto entre partes ao vivo (ou mapear teclas MIDI em <b>MIDI/Pad</b>).</li>
                <li>Ligue o <b>Rack</b> se algum músico for reforçar teclado/cordas tocando ao vivo por cima da faixa.</li>
                <li>Ative o <b>Modo Palco</b> pra ler a tela num ambiente escuro, e o <b>Controle remoto</b> se precisar operar de longe.</li>
              </ul>
            </div>
            <div className="help-usecase-card">
              <h3><KeyboardMusicIcon size={15} /> Estudando / ensaiando sozinho</h3>
              <ul>
                <li>Em <b>Faixas</b>, isole (solo) o instrumento que você está estudando.</li>
                <li>Use o <b>Modo Ensaio</b> (aba Tempo) pra tocar um trecho difícil mais devagar, sem perder o BPM salvo.</li>
                <li>Acompanhe a <b>Cifra</b>, que transpõe sozinha se você mudar o tom pra praticar em outra tonalidade.</li>
                <li>Marque as <b>partes</b> da música em Arranjar pra treinar só o Refrão ou só a Ponte em loop.</li>
                <li>Conecte um teclado MIDI e use o <b>Rack</b> pra praticar um timbre específico (piano, cordas, etc.) junto com a faixa.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------- ATALHOS ---------------- */}
        <section className="help-section" id="atalhos">
          <SectionHead icon={Timer} title="Atalhos de teclado" purpose="Operar o essencial sem tirar as mãos do teclado" />
          <table className="help-shortcuts">
            <tbody>
              <tr><td><kbd>Espaço</kbd></td><td>Tocar / pausar</td></tr>
              <tr><td><kbd>← / →</kbd></td><td>Parte anterior / próxima</td></tr>
              <tr><td><kbd>L</kbd></td><td>Ligar/desligar loop da parte ativa</td></tr>
              <tr><td><kbd>Esc</kbd></td><td>Parar (ou "pânico" de notas, dentro do Rack)</td></tr>
              <tr><td><kbd>1</kbd>–<kbd>9</kbd></td><td>Pular direto pra N-ésima parte do roteiro</td></tr>
              <tr><td><kbd>Ctrl+Z</kbd></td><td>Desfazer (tela Arranjar)</td></tr>
              <tr><td><kbd>Ctrl+Shift+Z</kbd></td><td>Refazer (tela Arranjar)</td></tr>
            </tbody>
          </table>
        </section>

        {/* ---------------- SUPORTE ---------------- */}
        <section className="help-section" id="suporte">
          <SectionHead icon={Info} title="Suporte e diagnóstico" purpose="O que fazer quando algo não carrega ou não soa como esperado" />
          <p>
            Toda vez que uma faixa não carrega, o motivo técnico fica registrado automaticamente. Em{' '}
            <b>Ajustes → Atualização → "Abrir pasta de logs"</b> você encontra o arquivo <code>mrq-debug.log</code> —
            é esse arquivo que deve ser enviado ao suporte ao relatar um problema, pois ele descreve exatamente o que
            o app tentou fazer e onde falhou.
          </p>
          <div className="help-callout">
            Esta mesma tela de Ajuda está sempre disponível pelo ícone de interrogação, ao lado da engrenagem de
            Ajustes, na barra lateral — volte aqui sempre que precisar relembrar como algum recurso funciona.
          </div>
        </section>
      </div>
    </div>
  );
}
