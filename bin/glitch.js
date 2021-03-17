import minimist from 'minimist';
import path from 'path';
import MIDIslicer from '../src/slicer/MIDIslicer.mjs';

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
