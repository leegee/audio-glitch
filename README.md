# Glitch

Uses the rhythm from a MIDI file to slice a number of WAV files.

Reads just the track 0 note-on events of any channel.

### CLI Argumnets: 

<dl>
  <dt>midi (string)</dt>
  <dd>Path to the MIDI file.</dd>
  <dt>wav (string)</dt>
  <dd>Path to a `WAV` file. Repeat many times. All wave files should be of the same duration, same sample rate, bit depth, number of channels.</dd>
  <dt>verbose (boolean)</dt>
  <dd>Logging</dd>
</dl>

## Thanks

A sub-class David Poirier-Quinot's `node-audio-slicer`.
