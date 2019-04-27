const minimist = require('minimist');
const path = require('path');
const MIDIslicer = require('../src/MIDIslicer.mjs');

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

new MIDIslicer(args)
  .slice()
  .then(finalPath => {
    process.stdout.write(
      '\nGlitch file at ' + path.resolve(finalPath) + '\n'
    );
  });
