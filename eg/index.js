const MIDIslicer = require('../src/MIDIslicer.mjs').MIDIslicer;

const args = {
  verbose: true,
  bpm: 100,
  midi: 'eg/test.mid',
  wav: ['eg/1.wav', 'eg/2.wav', 'eg/3.wav']
};

let slicer = new MIDIslicer({
  midi: args.midi,
  bpm: args.bpm,
  verbose: args.verbose,
  waveFilePaths: args.wav
});

slicer.slice().then((filename) => {
  console.log('Done: ', filename);
});
