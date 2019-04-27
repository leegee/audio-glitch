# Glitch

Uses the rhythm from a MIDI file to slice and merge a number of WAV files.

Reads just the track 0 note-on events of any channel.

### Argumnets: 

<dl>
  <dt>bpm</dt>
  <dd>(Number) MIDI does not provide this, so you should. Default is the standard 120</dd>
  <dt>midi</dt>
  <dd>(String|Array) If a string, path to the MIDI file; if an array, a list of timings in seconds.</dd>
  <dt>wav</dt>
  <dd>(Array<string>) Path(s) to WAV file(s). All wave files should be of the same duration, same sample rate, bit depth, number of channels.</dd>
  <dt>verbose</dt>
  <dd>(Boolean) Logging</dd>
</dl>

## Acknowledgements

Based on the work of David Poirier-Quinot in `node-audio-slicer`.
