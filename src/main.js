const fs = require('fs')
const minimist = require('minimist')
const midiParser = require('midi-parser-js/src/midi-parser');

const MIDIslicer = require("./MIDIslicer.mjs").MIDIslicer;

const args = minimist(process.argv.slice(2), {
    string: ['bpm', 'midi', 'wav'],
    alias: { b: 'bpm', m: 'midi', w: 'wav', v: 'verbose' },
    boolean: ['verbose'],
    default: {
        verbose: true,
        bpm: 60,
        midi: 'eg/test.mid',
        wav: ['eg/1.wav', 'eg/2.wav', 'eg/3.wav']
    }
});

const MIDI = midiParser.parse(fs.readFileSync(args.midi, 'base64'));
const TIME_DIVISION = MIDI.timeDivision;
const PPQ = TIME_DIVISION * 4 * 60; // timeDivision * input.bpm / 60 / 4;

console.log('timeDivision', TIME_DIVISION, 'PPQ', PPQ, 'ms per crotchet');

// Just the note on events for any channel
const EVENTS = MIDI.track[0].event
    // .filter(v => v.channel === 0 && v)
    .filter(v => v.type === 9 && v)
    .sort((a, b) => a.deltaTime > b.deltaTime ? 1 : -1)
    .map(v => v.deltaTime);


const durations = [1000];

console.dir('Events:', EVENTS);

let slicer = new MIDIslicer({ 
    durations, 
    verbose: args.verbose,
    waveFilePaths: args.wav
});

slicer.slice().then((chunkList) => {
    console.log('done', chunkList);
});
