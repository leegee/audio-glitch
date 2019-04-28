const path = require('path');
const MIDIslicer = require('../src');

const args = {
  verbose: true,
  bpm: 110,
  midi: 'eg/test.mid',
  // midi: [1, 1, 1, 1],
  // wav: ['eg/0.wav', 'eg/1.wav', 'eg/2.wav', 'eg/3.wav'],
  wav: ['eg/one-note-high.wav', 'eg/one-note-low.wav',],
  output: 'eg/output.wav'
};

new MIDIslicer(args)
  .slice()
  .then(finalPath => {
    console.log('Glitch file at ', path.resolve(finalPath));
  });
