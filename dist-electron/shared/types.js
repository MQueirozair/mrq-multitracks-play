"use strict";
// Tipos compartilhados entre o processo principal (Electron/Node) e a interface (renderer).
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTE_NAMES = exports.PART_COLORS = exports.DEFAULT_SETTINGS = void 0;
exports.semitoneDistance = semitoneDistance;
exports.normalizeNote = normalizeNote;
exports.DEFAULT_SETTINGS = {
    outputDeviceId: null,
    outputChannelCount: 2,
    sampleRate: 48000,
    bufferSize: 480,
    click: {
        countInBars: 1,
        sound: 'beep',
        accentFirstBeat: true,
        volumeDb: 0,
        output: 'auto',
        doubleClick: 'off',
    },
    pad: {
        timbre: null,
        volumeDb: 0,
        exitOnPlay: true,
        output: 'stereo-1-2',
        fadeInOutSec: 1.5,
        keyChangeCrossfadeSec: 1.5,
        loopCrossfadeSec: 6,
    },
    remote: {
        enabled: true,
        port: 8787,
        pin: '0000',
    },
    midiBindings: [],
    guideVoice: {
        track: null,
        outOfOrderBehavior: 'keep',
    },
};
exports.PART_COLORS = {
    Intro: '#2f6f6a',
    Verso: '#2d5fa0',
    'Pré-refrão': '#6b4fa0',
    Refrão: '#a0304f',
    Instrumental: '#2f8f5a',
    Ponte: '#7c4fe0',
    Solo: '#c07a1f',
    Tag: '#45708f',
    Interlúdio: '#4f6b7c',
    Final: '#5c5c66',
    Outra: '#555566',
};
exports.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function semitoneDistance(fromKey, toKey) {
    const from = exports.NOTE_NAMES.indexOf(normalizeNote(fromKey));
    const to = exports.NOTE_NAMES.indexOf(normalizeNote(toKey));
    if (from < 0 || to < 0)
        return 0;
    let diff = to - from;
    if (diff > 6)
        diff -= 12;
    if (diff < -6)
        diff += 12;
    return diff;
}
function normalizeNote(note) {
    const map = {
        Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#',
        'C♭': 'B', 'E♯': 'F', 'B♯': 'C', 'F♭': 'E',
    };
    return map[note] ?? note;
}
//# sourceMappingURL=types.js.map