import path from 'path';

import MIDIslicer from '../src/slicer/MIDIslicer.mjs';

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
    process.stdout.write('Glitch file at ', path.resolve(outputPath));
  });
