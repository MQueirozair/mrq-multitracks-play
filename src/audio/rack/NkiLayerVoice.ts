import type { RackPresetOption } from '../../../shared/types';

const ATTACK_SEC = 0.003;
const RELEASE_SEC = 0.12;

/**
 * Tamanho fixo do cabeçalho binário na frente de todo .nki do Kontakt 1 a 4
 * (antes de começar o fluxo zlib com o XML do instrumento). Esse número (170)
 * não é um chute: vem do código-fonte público do nkitool (domínio público,
 * Christian Schoenebeck / projeto LinuxSampler — ver comentário da classe
 * abaixo), a única ferramenta que já documentou esse formato de verdade.
 * A partir do Kontakt 4.2.2 a NI mudou o formato pra um binário criptografado
 * — esse cabeçalho de 170 bytes some e o fluxo deixa de ser zlib válido, o
 * que detectamos abaixo e reportamos como erro claro, sem fingir que abriu.
 */
const NKI_HEADER_SIZE = 170;

interface NkiZone {
  samplePath: string;
  rootNote: number;
  loNote: number;
  hiNote: number;
  loVel: number;
  hiVel: number;
  tuneCents: number;
  volume: number;
  pan: number;
}

/** Nomes de propriedade (minúsculos) aceitos pra cada campo de uma zona — o
 *  schema exato do XML do Kontakt nunca foi publicado pela NI, então em vez
 *  de arriscar um único nome de atributo "chutado", aceitamos várias
 *  variações plausíveis (inglês, abreviações comuns de sampler) e casamos
 *  por substring, não por igualdade exata. */
const FIELD_ALIASES = {
  sample: ['sample', 'samplefile', 'filename', 'file'],
  root: ['rootnote', 'root', 'originalkey', 'unitynote', 'pitchkeycenter'],
  loNote: ['lownote', 'lonote', 'minnote', 'keyrangemin', 'lokey', 'lowkey'],
  hiNote: ['highnote', 'hinote', 'maxnote', 'keyrangemax', 'hikey', 'highkey'],
  loVel: ['lowvelocity', 'lovel', 'minvelocity', 'velocityrangemin'],
  hiVel: ['highvelocity', 'hivel', 'maxvelocity', 'velocityrangemax'],
  tune: ['finetune', 'tune', 'detune', 'tuning'],
  volume: ['volume', 'gain', 'level'],
  pan: ['pan', 'panning'],
} as const;

function matchAlias(name: string, aliases: readonly string[]): boolean {
  const n = name.toLowerCase();
  return aliases.some((a) => n === a || n.endsWith(a) || n.includes(a));
}

/** Extrai o nome da nota a partir do nome do arquivo (ex.: "Piano_C3.wav",
 *  "Strings-060.wav") quando a zona não trouxe uma nota raiz explícita —
 *  convenção comum em bibliotecas de amostra multi-zona. */
function guessRootNoteFromFileName(fileName: string): number | null {
  const base = fileName.replace(/\.[^.]+$/, '');
  const noteNameMatch = base.match(/(?:^|[^a-zA-Z])([A-Ga-g])(#|s|b)?(-?\d)(?:[^0-9]|$)/);
  if (noteNameMatch) {
    const letters: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
    let semitone = letters[noteNameMatch[1].toLowerCase()];
    if (noteNameMatch[2] === '#' || noteNameMatch[2] === 's') semitone += 1;
    if (noteNameMatch[2] === 'b') semitone -= 1;
    const octave = parseInt(noteNameMatch[3], 10);
    const note = (octave + 1) * 12 + semitone;
    if (note >= 0 && note <= 127) return note;
  }
  const numericMatch = base.match(/(?:^|[^0-9])(\d{2,3})(?:[^0-9]|$)/);
  if (numericMatch) {
    const n = parseInt(numericMatch[1], 10);
    if (n >= 0 && n <= 127) return n;
  }
  return null;
}

/** Junta, pra um elemento do XML, tanto seus atributos "normais"
 *  (`<Zone Sample="..." RootNote="60">`) quanto um possível padrão
 *  genérico de par nome/valor em elementos filhos (`<attribute><name>
 *  Sample</name><value>...</value></attribute>`), já que a NI usa os dois
 *  estilos em partes diferentes de seus formatos — reunir os dois aumenta a
 *  chance de reconhecer o campo certo sem depender de um nome fixo. */
function collectPropertyBag(el: Element): Map<string, string> {
  const bag = new Map<string, string>();
  for (const attr of Array.from(el.attributes)) {
    bag.set(attr.name.toLowerCase(), attr.value);
  }
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'attribute' || tag === 'property' || tag === 'parameter') {
      const nameEl = child.querySelector(':scope > name, :scope > key');
      const valueEl = child.querySelector(':scope > value');
      if (nameEl?.textContent && valueEl?.textContent) {
        bag.set(nameEl.textContent.trim().toLowerCase(), valueEl.textContent.trim());
      }
    }
  }
  return bag;
}

function readField(bag: Map<string, string>, aliases: readonly string[]): string | null {
  for (const [key, value] of bag) {
    if (matchAlias(key, aliases)) return value;
  }
  return null;
}

function readNumberField(bag: Map<string, string>, aliases: readonly string[], fallback: number): number {
  const raw = readField(bag, aliases);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function looksLikeSamplePath(value: string): boolean {
  return /\.(wav|wave|aif|aiff|ncw)$/i.test(value.trim());
}

/** Sobe pela árvore a partir de `el` (sem passar de `stopAt`, exclusive) juntando
 *  a "mala de propriedades" de cada ancestral — zona, grupo e programa costumam
 *  compartilhar campos (faixa de tecla/velocidade, afinação, volume, pan) em
 *  níveis diferentes dependendo de como o patch foi montado, então em vez de
 *  olhar só o pai imediato (que perdia campos definidos no Grupo/Programa),
 *  mesclamos até 5 níveis acima — o nível mais próximo da zona sempre vence. */
function collectAncestryBag(el: Element, stopAt: Element | null): Map<string, string> {
  const chain: Element[] = [];
  let cur: Element | null = el;
  for (let depth = 0; depth < 5 && cur && cur !== stopAt; depth++) {
    chain.push(cur);
    cur = cur.parentElement;
  }
  // do mais distante (Programa) pro mais próximo (Zona), pra que o campo da
  // zona sempre sobrescreva o do grupo/programa quando os dois existirem.
  const merged = new Map<string, string>();
  for (const node of chain.reverse()) {
    for (const [k, v] of collectPropertyBag(node)) merged.set(k, v);
  }
  return merged;
}

/** Varre a subárvore a partir de `root` procurando, em cada elemento, um valor
 *  de propriedade que pareça caminho de amostra — sem depender do nome exato
 *  da tag ("Zone", "Sample" etc. nunca foram confirmados publicamente pela
 *  NI para essa versão do formato). Quando acha, mescla os campos dos
 *  ancestrais mais próximos (zona → grupo → programa) pra montar o
 *  mapeamento de tecla/velocidade/afinação da zona. Se `boundary` for
 *  passado, a varredura não desce dentro de nenhum outro elemento que também
 *  bata com `boundary` (usado pra não misturar zonas de programas/grupos de
 *  timbre diferentes quando o .nki tem mais de um). */
function extractZones(root: Element, opts?: { boundary?: (el: Element) => boolean }): NkiZone[] {
  const zones: NkiZone[] = [];
  const seen = new Set<Element>();
  const walk = (el: Element, isSubroot: boolean) => {
    if (!isSubroot && opts?.boundary?.(el)) return; // outro grupo/programa — não entra
    const bag = collectPropertyBag(el);
    const sampleValue = readField(bag, FIELD_ALIASES.sample);
    if (sampleValue && looksLikeSamplePath(sampleValue) && !seen.has(el)) {
      seen.add(el);
      const merged = collectAncestryBag(el, root.parentElement);
      const fileName = sampleValue.split(/[\\/]/).pop() ?? sampleValue;
      const guessedRoot = guessRootNoteFromFileName(fileName);
      zones.push({
        samplePath: sampleValue,
        rootNote: readNumberField(merged, FIELD_ALIASES.root, guessedRoot ?? 60),
        loNote: readNumberField(merged, FIELD_ALIASES.loNote, 0),
        hiNote: readNumberField(merged, FIELD_ALIASES.hiNote, 127),
        loVel: readNumberField(merged, FIELD_ALIASES.loVel, 0),
        hiVel: readNumberField(merged, FIELD_ALIASES.hiVel, 127),
        tuneCents: readNumberField(merged, FIELD_ALIASES.tune, 0),
        volume: readNumberField(merged, FIELD_ALIASES.volume, 1),
        pan: readNumberField(merged, FIELD_ALIASES.pan, 0),
      });
      return; // já é folha (zona); não precisa descer mais nesse ramo
    }
    for (const child of Array.from(el.children)) walk(child, false);
  };
  walk(root, true);
  return zones;
}

/** Identifica, dentro do XML, possíveis "grupos de timbre" (Programas) — um
 *  .nki pode conter mais de um instrumento/variação dentro do mesmo arquivo
 *  (ex.: "Piano Soft" e "Piano Hard" como programas separados de um mesmo
 *  banco). Isso é detectado de forma tolerante: qualquer elemento cujo nome
 *  da tag contenha "program" (maiúsc./minúsc. não importa) e que tenha pelo
 *  menos uma amostra dentro vira um grupo selecionável. Se só um programa
 *  for encontrado (o caso mais comum, de longe), devolve lista vazia — quem
 *  chama cai de volta pro modo "um timbre só", sem mudar nada do
 *  comportamento de patches simples de uma única camada/instrumento. */
function extractProgramGroups(doc: Document): { name: string; zones: NkiZone[] }[] {
  const programEls: Element[] = [];
  const isProgramTag = (el: Element) => /program/i.test(el.tagName);
  const walk = (el: Element) => {
    if (isProgramTag(el)) {
      programEls.push(el);
      return; // não entra em programas aninhados dentro de programas
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(doc.documentElement);

  if (programEls.length < 2) return [];

  const groups = programEls.map((programEl, i) => {
    const zones = extractZones(programEl, { boundary: isProgramTag });
    const bag = collectPropertyBag(programEl);
    const name = readField(bag, ['name']) ?? `Grupo ${i + 1}`;
    return { name, zones };
  });
  // só vale a pena expor como grupos separados se pelo menos 2 deles
  // realmente trouxeram amostra — senão é mais seguro cair no modo simples.
  return groups.filter((g) => g.zones.length > 0).length >= 2 ? groups : [];
}

/** Tenta achar o nome do instrumento (propriedade "Name" perto da raiz do XML) pra exibir como preset. */
function guessInstrumentName(doc: Document): string | null {
  const root = doc.documentElement;
  const bag = collectPropertyBag(root);
  const direct = readField(bag, ['name']);
  if (direct) return direct;
  for (const child of Array.from(root.children)) {
    const childBag = collectPropertyBag(child);
    const name = readField(childBag, ['name']);
    if (name) return name;
  }
  return null;
}

/** Descompacta o corpo zlib de um .nki do Kontakt 1-4 (pula o cabeçalho fixo
 *  de 170 bytes) e devolve o texto XML resultante. Lança um erro claro e
 *  específico quando o fluxo não é um zlib válido — o caso mais comum disso
 *  é um .nki do Kontakt 4.2.2 em diante (formato binário criptografado pela
 *  NI, que nunca teve a proteção quebrada por nenhuma ferramenta pública) ou
 *  um arquivo .nkx/.nkc de biblioteca comercial, não um .nki avulso. */
async function extractNkiXml(buffer: ArrayBuffer): Promise<string> {
  if (buffer.byteLength <= NKI_HEADER_SIZE + 2) {
    throw new Error('Arquivo .nki inválido ou corrompido (menor do que o cabeçalho esperado).');
  }
  const body = buffer.slice(NKI_HEADER_SIZE);
  let xmlBytes: Uint8Array;
  try {
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([body]).stream().pipeThrough(ds);
    xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error(
      'Não foi possível abrir este .nki. Isso normalmente significa que é um arquivo do Kontakt 4.2.2 ou mais ' +
        'recente (a Native Instruments criptografou o formato a partir dessa versão — nenhuma ferramenta pública ' +
        'conseguiu ler isso de forma legítima até hoje) ou que é um arquivo de biblioteca comercial (.nkx/.nkc), ' +
        'não um .nki avulso. Só patches do Kontakt 1 a 4 (anteriores a 4.2.2), sem criptografia, são suportados.'
    );
  }
  const text = new TextDecoder('utf-8').decode(xmlBytes);
  if (!text.trimStart().startsWith('<')) {
    throw new Error('O conteúdo deste .nki não parece ser o XML de instrumento esperado (formato não reconhecido).');
  }
  return text;
}

/**
 * Camada "Kontakt 1-4 / .nki": carrega de verdade (sem simplificação) os
 * timbres/amostras de um patch legado do Kontakt (versões 1 a 4, anteriores
 * à criptografia introduzida no Kontakt 4.2.2 — ver extractNkiXml acima). O
 * contêiner (cabeçalho de 170 bytes + corpo zlib) é lido conforme o
 * nkitool, ferramenta de domínio público do projeto LinuxSampler
 * (Christian Schoenebeck) — a única documentação pública confiável desse
 * formato. Como a Native Instruments nunca publicou o schema XML interno,
 * os nomes de campo (nota raiz, faixa de tecla/velocidade, etc.) são lidos
 * de forma tolerante por várias variações plausíveis (ver FIELD_ALIASES),
 * em vez de um único nome "chutado" — e cada amostra referenciada é
 * decodificada de verdade (decodeAudioData), nunca substituída por um tom
 * sintético. Isso cobre o pedido do usuário de "carregar só os timbres e
 * amostras" — não reimplementamos o motor de efeitos/scripts do Kontakt
 * (KSP), que não cabe no plano de licenciamento desse app.
 *
 * Importante: isso NÃO lê arquivos "monolito" (amostras embutidas dentro do
 * próprio .nki) nem bibliotecas .nkx/.nkc protegidas — só .nki que
 * referenciam arquivos de amostra externos (.wav/.aiff) ao lado dele no
 * disco, layout muito comum em patches avulsos/gratuitos do Kontakt.
 */
export class NkiLayerVoice {
  private ctx: AudioContext;
  private zones: NkiZone[] = [];
  private buffers = new Map<NkiZone, AudioBuffer>();
  private active = new Map<number, { src: AudioBufferSourceNode; gain: GainNode; baseRate: number }[]>();
  private bendSemitones = 0;
  private instrumentName = '';
  /** Quando o .nki tem mais de um "grupo de timbre" (Programa), guarda cada
   *  um separadamente pra permitir trocar via selectPreset() sem recarregar
   *  o arquivo do disco de novo (todas as amostras já ficam resolvidas). */
  private programGroups: { name: string; zones: NkiZone[] }[] = [];
  readonly output: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = ctx.createGain();
  }

  get name(): string {
    return this.instrumentName;
  }

  async load(buffer: ArrayBuffer, sourcePath?: string): Promise<RackPresetOption[]> {
    this.dispose();
    const xmlText = await extractNkiXml(buffer);
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('O XML interno deste .nki veio corrompido ou incompleto.');
    }
    this.instrumentName = guessInstrumentName(doc) ?? (sourcePath ? sourcePath.split(/[\\/]/).pop() ?? '' : '');

    // Primeiro tenta achar vários "grupos de timbre" (Programas) dentro do
    // mesmo arquivo; se só houver um (o caso mais comum), cai pro modo
    // simples de sempre (todas as zonas do arquivo inteiro num timbre só).
    const detectedGroups = extractProgramGroups(doc);
    const rawGroups =
      detectedGroups.length > 0
        ? detectedGroups
        : [{ name: this.instrumentName || 'Instrumento Kontakt', zones: extractZones(doc.documentElement) }];

    const totalZones = rawGroups.reduce((n, g) => n + g.zones.length, 0);
    if (totalZones === 0) {
      throw new Error(
        'O .nki foi aberto, mas nenhuma amostra foi reconhecida dentro dele (estrutura interna não reconhecida, ou é um arquivo "monolito" com amostras embutidas — ainda não suportado).'
      );
    }

    const baseDir = sourcePath ? sourcePath.replace(/[\\/][^\\/]*$/, '') : '';
    let resolved = 0;
    const failures: string[] = [];
    for (const group of rawGroups) {
      for (const zone of group.zones) {
        const audioBuffer = await this.resolveSample(zone.samplePath, baseDir);
        if (audioBuffer) {
          this.buffers.set(zone, audioBuffer);
          resolved++;
        } else {
          failures.push(zone.samplePath.split(/[\\/]/).pop() ?? zone.samplePath);
        }
      }
    }

    this.programGroups = rawGroups
      .map((g) => ({ name: g.name, zones: g.zones.filter((z) => this.buffers.has(z)) }))
      .filter((g) => g.zones.length > 0);
    this.zones = this.programGroups[0]?.zones ?? [];

    if (resolved === 0) {
      throw new Error(
        'Nenhuma das amostras referenciadas por este .nki foi encontrada ao lado do arquivo no disco ' +
          '(mantenha a pasta de amostras original — geralmente "Samples" — na mesma pasta do .nki), ou o arquivo é ' +
          'um "monolito" com amostras embutidas (ainda não suportado).'
      );
    }
    if (failures.length > 0) {
      console.warn(`[nki] ${failures.length} amostra(s) não encontrada(s) e ficarão mudas: ${failures.join(', ')}`);
    }

    if (this.programGroups.length > 1) {
      return this.programGroups.map((g, i) => ({ value: String(i), label: g.name }));
    }
    return [{ value: 'default', label: this.instrumentName || 'Instrumento Kontakt' }];
  }

  /** Troca o grupo de timbre ativo quando o .nki tem mais de um Programa
   *  (ver extractProgramGroups) — chamado pelo RackEngine quando o usuário
   *  escolhe outro item no seletor de instrumento/preset da camada. */
  selectPreset(value: string) {
    if (this.programGroups.length <= 1) return;
    const idx = Number(value);
    const group = Number.isFinite(idx) ? this.programGroups[idx] : undefined;
    if (group) this.zones = group.zones;
  }

  /** Resolve um caminho de amostra referenciado pelo .nki (geralmente um caminho relativo do Windows, "Samples\\X.wav")
   *  em relação à pasta onde o próprio .nki está, decodificando o áudio de verdade via decodeAudioData. */
  private async resolveSample(samplePath: string, baseDir: string): Promise<AudioBuffer | null> {
    if (!baseDir) return null;
    const relative = samplePath.replace(/\\/g, '/').replace(/^\.?\//, '');
    const fileName = relative.split('/').pop() ?? relative;
    const candidates = [
      `${baseDir}/${relative}`,
      `${baseDir}/${fileName}`,
      `${baseDir}/Samples/${fileName}`,
      `${baseDir}/samples/${fileName}`,
    ];
    for (const candidate of candidates) {
      try {
        const url = await window.api.fs.toFileUrl(candidate);
        const res = await fetch(url);
        if (!res.ok) continue;
        const arrayBuffer = await res.arrayBuffer();
        return await this.ctx.decodeAudioData(arrayBuffer.slice(0));
      } catch {
        // tenta o próximo candidato
      }
    }
    return null;
  }

  private zonesFor(note: number, velocity: number): NkiZone[] {
    const matches = this.zones.filter(
      (z) => note >= z.loNote && note <= z.hiNote && velocity >= z.loVel && velocity <= z.hiVel
    );
    return matches.length > 0 ? matches : this.zones.filter((z) => note >= z.loNote && note <= z.hiNote);
  }

  noteOn(note: number, velocity: number) {
    this.stopNote(note, 0.01);
    const zones = this.zonesFor(note, velocity);
    if (zones.length === 0) return;
    const voices: { src: AudioBufferSourceNode; gain: GainNode; baseRate: number }[] = [];
    const now = this.ctx.currentTime;
    for (const zone of zones) {
      const audioBuffer = this.buffers.get(zone);
      if (!audioBuffer) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = audioBuffer;
      const baseRate = Math.pow(2, (note - zone.rootNote + zone.tuneCents / 100) / 12);
      src.playbackRate.value = baseRate * Math.pow(2, this.bendSemitones / 12);
      const gain = this.ctx.createGain();
      const target = Math.max(0, Math.min(1, (velocity / 127) * (zone.volume || 1)));
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(target, now + ATTACK_SEC);
      let node: AudioNode = gain;
      if (zone.pan) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, zone.pan));
        gain.connect(panner);
        node = panner;
      }
      node.connect(this.output);
      src.connect(gain);
      src.start();
      src.onended = () => {
        try {
          gain.disconnect();
        } catch {
          /* já desconectado */
        }
      };
      voices.push({ src, gain, baseRate });
    }
    if (voices.length > 0) this.active.set(note, voices);
  }

  noteOff(note: number) {
    this.stopNote(note, RELEASE_SEC);
  }

  setPitchBend(semitones: number) {
    this.bendSemitones = semitones;
    const now = this.ctx.currentTime;
    const bendFactor = Math.pow(2, semitones / 12);
    for (const voices of this.active.values()) {
      for (const voice of voices) voice.src.playbackRate.setTargetAtTime(voice.baseRate * bendFactor, now, 0.01);
    }
  }

  private stopNote(note: number, fadeSec: number) {
    const voices = this.active.get(note);
    if (!voices) return;
    this.active.delete(note);
    const now = this.ctx.currentTime;
    for (const voice of voices) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + fadeSec);
        voice.src.stop(now + fadeSec + 0.02);
      } catch {
        /* fonte já parada */
      }
    }
  }

  allNotesOff() {
    for (const note of Array.from(this.active.keys())) this.stopNote(note, 0.05);
  }

  dispose() {
    this.allNotesOff();
    this.zones = [];
    this.buffers.clear();
  }
}
