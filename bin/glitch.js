const minimist = require('minimist');

const MIDIslicer = require('../src/MIDIslicer.mjs').MIDIslicer;

const args = minimist(process.argv.slice(2), {
  string: ['bpm', 'midi', 'wav', 'output'],
  alias: {
    b: 'bpm',
    m: 'midi',
    w: 'wav',
    v: 'verbose',
    o: 'output'
  },
  boolean: ['verbose']
});

new MIDIslicer({
  midi: args.midi,
  verbose: args.verbose,
  waveFilePaths: args.wav
}).slice().then(() => {
  process.stdout.write('Done.\n')
});
