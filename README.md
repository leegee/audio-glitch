# Audio Glitch - produce sliced and spliced WAVs from MIDI beats or a list of times

## Description

Cyclically slices and splices any number of supplied wave files (`wav`) at the points specified by `midi`, which may be:

* either at the fractions of seconds specified
* or at points specified by a MIDI file's track 0 note-on events, regardless of channel.

A command line interface and API are provided, along with an example. Arguments are the same for all.

## Synopsis

### API

```javascript
import  MIDIslicer from './src/slicer';

// Taking beats from a MIDI file:
const args = {
  verbose: true,
  bpm: 100,
  midi: 'eg/test.mid',
  wav: ['eg/0.wav', 'eg/1.wav', 'eg/2.wav'],
  output: 'eg/output.wav'
};

// Supplying beats directly
const args = {
  verbose: true,
  bpm: 100,
  midi: [1, 1, 1, 1],
  wav: ['eg/0.wav', 'eg/1.wav', 'eg/2.wav'],
  output: 'eg/output.wav'
};

new MIDIslicer(args)
  .slice()
  .then(finalPath => {
    console.info('Glitch file saved at %s.', finalPath);
  });
```

### CLI

```bash
glitch --midi eg/test.mid \ 
       --wav eg/0.wav     \
       --wav eg/1.wav     \
       --wav eg/2.wav     \
       --bpm 127
```

<dl>
  <dt><code>bpm</code></dt>
  <dd>(Number) MIDI does not provide this, so you must.</dd>
  <dt><code>midi</code></dt>
  <dd>(String|Array) Source of beats at which to chop the audio: if a string, path to the MIDI file; if an array, a list of timings</dd>
  <dt><code>wav</code></dt>
  <dd>(Array|String>) One or more paths to wave files.</dd>
  <dt><code>output</code></dt>
  <dd>(String) Path at which to output the generated wave file. Defaults to the MIDI file input path concatinated with `_glitch.wav`, or if no MIDI file was supplied, defaults to `glitch.wav`.</dd>
  <dt><code>verbose</code></dt>
  <dd>(Boolean) Logging</dd>
</dl>

## Examples

Run examples with `node eg` or `npm run eg`

## Caveats

All wave files should be of the same duration, same sample rate, bit depth, number of channels. I have no plan to update this, since I produce my wavs at the same time from the same source.

## Acknowledgements

Based in part on the work of David Poirier-Quinot in `node-audio-slicer`.

## Changes

2022-06-10 - updated this documentation and `package.json``.
