const path = require('path');
const MIDIslicer = require('../src/MIDIslicer.mjs');

const args = {
  verbose: true,
  bpm: 100,
  // midi: 'eg/test.mid',
  midi: [1, 1, 1, 1],
  wav: ['eg/0.wav', 'eg/1.wav', 'eg/2.wav'],
  output: 'eg/output.wav'
};

let slicer = new MIDIslicer({
  midi: args.midi,
  bpm: args.bpm,
  verbose: args.verbose,
  waveFilePaths: args.wav,
  output: args.output
});

slicer.slice().then(finalPath => {
  console.log('Glitch file at ', path.resolve(finalPath));
});
