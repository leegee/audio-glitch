# Glitch

Uses the rhythm from a MIDI file's track 0 note-on events, regardless of channel, to slice and merge a number of WAV files.

## Use

A command line interface and API are provided, along with an example. Arguments are the same for all.

### CLI

```bash
node bin/glitch.js --bpm 127 --midi eg/test.mid --wav eg/1.wav --wav eg/2.wav
```

### Example

`node eg` or `npm run eg`

### API

```javascript
import path from 'path';
import  MIDIslicer from './src/slicer';

const args = {
  verbose: true,
  bpm: 100,
  // midi: 'eg/test.mid',
  midi: [1, 1, 1, 1],
  wav: ['eg/0.wav', 'eg/1.wav', 'eg/2.wav'],
  output: 'eg/output.wav'
};

new MIDIslicer(args)
  .slice()
  .then(finalPath => {
    console.log('Glitch file at ', path.resolve(finalPath));
  });
```

## Argumnets:

<dl>
  <dt>bpm</dt>
  <dd>(Number) MIDI does not provide this, so you should.</dd>
  <dt>midi</dt>
  <dd>(String|Array) If a string, path to the MIDI file; if an array, a list of timings in seconds.</dd>
  <dt>wav</dt>
  <dd>(Array<string>) Path(s) to WAV file(s).</dd>
  <dt>output</dt>
  <dd>(String) Path to output WAV. Defaults to the MIDI file input path concatinated with `_glitch.wav`, or `glitch.wav` if no MIDI file was supplied.</dd>
  <dt>verbose</dt>
  <dd>(Boolean) Logging</dd>
</dl>

## Caveats

All wave files should be of the same duration, same sample rate, bit depth, number of channels.
I've no plan to update this, since I produce my wavs at the same time from the same source.

## Acknowledgements

Based in part on the work of David Poirier-Quinot in `node-audio-slicer`.
