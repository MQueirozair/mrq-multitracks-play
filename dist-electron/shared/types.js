"use strict";
// Tipos compartilhados entre o processo principal (Electron/Node) e a interface (renderer).
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTE_NAMES = exports.PART_COLORS = exports.DEFAULT_SETTINGS = exports.DEFAULT_RACK_STATE = void 0;
exports.semitoneDistance = semitoneDistance;
exports.normalizeNote = normalizeNote;
function emptyRackLayer(id, color) {
    return {
        id,
        color,
        format: null,
        filePath: null,
        fileName: null,
        displayName: null,
        presets: [],
        selectedPreset: null,
        character: 'original',
        volume: 0.7,
        muted: false,
        solo: false,
        rootNote: 60,
        photoDataUrl: null,
        pan: 0,
        noteRangeStart: 0,
        noteRangeEnd: 127,
        octave: 0,
        midiChannel: 0,
        envelopeEnabled: false,
        attackMs: 5,
        releaseMs: 350,
        filterEnabled: false,
        cutoffHz: 20000,
        eqEnabled: false,
        eqBassDb: 0,
        eqMidDb: 0,
        eqTrebleDb: 0,
        eqMidFreqHz: 1000,
        driveEnabled: false,
        driveType: 'warm',
        driveDb: 0,
        driveMix: 1,
    };
}
exports.DEFAULT_RACK_STATE = {
    layers: [
        emptyRackLayer('camada-1', '#d6455d'),
        emptyRackLayer('camada-2', '#2fb8c6'),
        emptyRackLayer('camada-3', '#8a5fd6'),
        emptyRackLayer('camada-4', '#d6b23c'),
    ],
    masterVolume: 0.8,
    reverb: 0,
    midiInputId: null,
    velocityCurve: 'linear',
    transpose: 0,
    sustainEnabled: true,
    bufferFrames: 0,
    scenes: [],
};
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
    stageMode: false,
    rack: exports.DEFAULT_RACK_STATE,
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