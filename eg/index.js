const path = require('path');
const MIDIslicer = require('../src/slicer');

new MIDIslicer({
  verbose: true,
  bpm: 110,
  midi: 'eg/test.mid',
  // midi: [1, 1, 1, 1],
  // wav: ['eg/0.wav', 'eg/1.wav', 'eg/2.wav', 'eg/3.wav'],
  wav: ['eg/one-note-high.wav', 'eg/one-note-low.wav',],
  output: 'eg/output.wav'
})
  .slice()
  .then(outputPath => {
    console.log('Glitch file at ', path.resolve(outputPath));
  });
