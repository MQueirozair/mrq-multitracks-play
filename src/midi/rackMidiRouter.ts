import { rackEngine } from '../audio/rack/RackEngine';

// Roteador de MIDI dedicado ao Rack de instrumentos (camadas ao vivo). É
// separado do midiController.ts (que só trata vínculos de ação/CC) de
// propósito: usamos addEventListener('midimessage', ...) em vez de sobrescrever
// `input.onmidimessage`, assim os dois sistemas convivem sem um atropelar o
// outro quando ambos estão ativos ao mesmo tempo.
let access: MIDIAccess | null = null;
let selectedInputId: string | null = null;
const attached = new Set<MIDIInput>();
const changeListeners = new Set<() => void>();

export function onRackMidiDevicesChanged(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

function handleMessage(ev: MIDIMessageEvent) {
  const data = ev.data;
  if (!data || data.length < 2) return;
  const command = data[0] & 0xf0;
  const note = data[1];
  const velocity = data[2] ?? 0;
  if (command === 0x90) {
    if (velocity > 0) rackEngine.noteOn(note, velocity);
    else rackEngine.noteOff(note);
  } else if (command === 0x80) {
    rackEngine.noteOff(note);
  }
}

function attachAll() {
  if (!access) return;
  attached.forEach((input) => input.removeEventListener('midimessage', handleMessage as EventListener));
  attached.clear();
  access.inputs.forEach((input) => {
    if (selectedInputId && input.id !== selectedInputId) return;
    input.addEventListener('midimessage', handleMessage as EventListener);
    attached.add(input);
  });
  changeListeners.forEach((cb) => cb());
}

export async function initRackMidi(): Promise<boolean> {
  if (!navigator.requestMIDIAccess) return false;
  try {
    access = (await navigator.requestMIDIAccess({ sysex: false })) ?? null;
    if (!access) return false;
    attachAll();
    access.onstatechange = () => attachAll();
    return true;
  } catch (err) {
    console.warn('[rack-midi] acesso negado ou indisponível', err);
    return false;
  }
}

/** null = ouvir todos os dispositivos MIDI conectados */
export function setRackMidiInput(id: string | null) {
  selectedInputId = id;
  attachAll();
}

export function listRackMidiInputs(): { id: string; name: string }[] {
  if (!access) return [];
  return Array.from(access.inputs.values()).map((i) => ({ id: i.id, name: i.name ?? 'Dispositivo MIDI' }));
}

export function isRackMidiSupported(): boolean {
  return 'requestMIDIAccess' in navigator;
}
