import type { MidiBinding } from '../../shared/types';

type LearnCallback = (msg: { type: 'note' | 'cc'; channel: number; number: number }) => void;

let learnCallback: LearnCallback | null = null;
let dispatcher: ((binding: MidiBinding) => void) | null = null;
let bindingsRef: MidiBinding[] = [];
let access: MIDIAccess | null = null;
let initialized = false;

function handleMessage(ev: MIDIMessageEvent) {
  const data = ev.data;
  if (!data || data.length < 2) return;
  const status = data[0];
  const channel = (status & 0x0f) + 1;
  const command = status & 0xf0;
  const number = data[1];
  const velocity = data[2] ?? 0;

  let msg: { type: 'note' | 'cc'; channel: number; number: number } | null = null;
  if (command === 0x90 && velocity > 0) msg = { type: 'note', channel, number };
  else if (command === 0xb0) msg = { type: 'cc', channel, number };
  if (!msg) return;

  if (learnCallback) {
    const cb = learnCallback;
    learnCallback = null;
    cb(msg);
    return;
  }

  const match = bindingsRef.find((b) => b.type === msg!.type && b.channel === msg!.channel && b.number === msg!.number);
  if (match && dispatcher) dispatcher(match);
}

export async function initMidi(): Promise<boolean> {
  if (initialized) return !!access;
  initialized = true;
  if (!navigator.requestMIDIAccess) return false;
  try {
    access = (await navigator.requestMIDIAccess({ sysex: false })) ?? null;
    if (!access) return false;
    attachAll();
    access.onstatechange = () => attachAll();
    return true;
  } catch (err) {
    console.warn('[midi] acesso negado ou indisponível', err);
    return false;
  }
}

function attachAll() {
  if (!access) return;
  access.inputs.forEach((input) => {
    input.onmidimessage = handleMessage;
  });
}

export function setBindings(bindings: MidiBinding[]) {
  bindingsRef = bindings;
}

export function setDispatcher(fn: (binding: MidiBinding) => void) {
  dispatcher = fn;
}

export function armLearn(cb: LearnCallback) {
  learnCallback = cb;
}

export function cancelLearn() {
  learnCallback = null;
}

export function listInputNames(): string[] {
  if (!access) return [];
  return Array.from(access.inputs.values()).map((i) => i.name ?? 'Dispositivo MIDI');
}

export function isSupported(): boolean {
  return 'requestMIDIAccess' in navigator;
}
