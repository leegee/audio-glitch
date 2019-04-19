const fs = require('fs')

const midiParser = require('midi-parser-js/src/midi-parser');
const MIDIslicer = require("./MIDIslicer.mjs").MIDIslicer;

const input = {
    bpm: 60,
    mid: 'test.mid',
    wavs: ['oud1.wav','oud1.wav','oud1.wav']
}


const data = fs.readFileSync(input.mid, 'base64');
const midi = midiParser.parse(data);
const timeDivision = midi.timeDivision;
const ppq = timeDivision * 4 * 60; // timeDivision * input.bpm / 60 / 4;
console.log('timeDivision', timeDivision, 'PPQ', ppq, 'ms per crotchet');


// Just the note on events for any channel
const events = midi.track[0].event
    // .filter(v => v.channel === 0 && v)
    .filter(v => v.type === 9 && v)
    .sort((a, b) => a.deltaTime > b.deltaTime ? 1 : -1)
    .map( v => v.deltaTime );


const durations = [1000];

console.log( events );

// let slicer = new MIDIslicer({ durations });
// slicer.slice(input.wavs).then( (chunkList) => {
//     console.log('done', chunkList);
// });
