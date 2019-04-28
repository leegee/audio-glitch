/* global BigInt */
const fs = require('fs');
const MidiParser = require('midi-parser-js/src/midi-parser');
const Reader = require('./Reader.mjs');

const USE_ORIG_HEADER = false;
const NOTE_ON = 9;
const NOTE_OFF = 8;

module.exports = class MIDIslicer {
  /**
   * @param {Object} options
   * @param {boolean} options.verbose
   * @param {number=120} options.bpm
   * @param {string?} options.output
   * @param {string|array} options.midi - path to midi or array of floats for beats
   */
  constructor(options = {}) {
    if (!options.bpm) {
      throw new TypeError('Missing bpm argument.');
    }
    if (!options.midi) {
      throw new TypeError('Missing midi argument: use a string to describe the path to the MIDI "beat" file, or supply beats as an array of numbers.');
    }
    if (!options.wav) {
      throw new TypeError('Missing wav array argument to describe path(s) to the wave files.');
    }
    if (typeof options.wav === 'string') {
      options.wav = [options.wav];
    }

    this.log = options.verbose ? console.log : () => { };
    this.midiFilePath = options.midi;
    this.wav = options.wav;
    this.reader = new Reader();
    let totalMidiDurationInSeconds = 0;

    if (typeof options.midi === 'string') {
      this.outputPath = options.output || this.midiFilePath + '_glitch.wav';
      const midi = MidiParser.parse(fs.readFileSync(options.midi, 'base64'));
      const ppq = midi.timeDivision;
      // TODO wtf? Not the spec.... '*2'??
      const timeFactor = (60000 / (options.bpm * ppq) / 1000);

      this.log('bpm:', options.bpm);
      this.log('ppq:', ppq);
      this.log('(options.bpm * ppq)', (options.bpm * ppq));
      this.log('MIDI.timeDivision', midi.timeDivision);
      this.log('timeFactor', timeFactor);

      // Just the track 1 note on events for any channel
      let noteDur = 0;
      this.chunkSeconds = midi.track[0].event
        .filter(v => {
          if (v.type === NOTE_ON) {
            noteDur = v.deltaTime;
            this.log('on', noteDur, v);
          }
          else if (v.type === NOTE_OFF) {
            noteDur += v.deltaTime;
            v.noteDur = noteDur;
            this.log('off', noteDur, v);
          }
          return v.type === NOTE_OFF;
        })
        .map(v => {
          const t = v.noteDur * timeFactor;
          totalMidiDurationInSeconds += t;
          this.log(v.noteDur, ':', t);
          return t;
        });
    }

    else if (options.midi instanceof Array) {
      this.outputPath = options.output || 'glitch.wav';
      this.chunkSeconds = options.midi;
      totalMidiDurationInSeconds = Math.sum(this.chunkSeconds);
    }

    this.metaBuffers = [];
    this.wav.forEach((wavPath, index) => {
      const metaBuffer = this.reader.loadMetaBuffer(wavPath);
      if (index > 0) {
        ['dataStart', 'dataLength', 'numberOfChannels',
          'sampleRate', 'secToByteFactor', 'bitPerSample'
        ].forEach(key => {
          if (metaBuffer[key] !== this.metaBuffers[0][key]) {
            throw new RangeError('Files are not of the same format.');
          }
        });
      }
      this.metaBuffers.push(metaBuffer);
    });

    this.totalSeconds = this.metaBuffers[0].dataLength / this.metaBuffers[0].secToByteFactor;

    this.log('\n--------------------------\n');
    this.log(this.metaBuffers);
    this.log('\n--------------------------\n');
    this.log('chunkDurations', this.chunkSeconds);
    this.log('totalDurationInSeconds: ', this.totalSeconds);
    this.log('totalMidiDurationInSeconds: ', totalMidiDurationInSeconds);
    this.log('\n--------------------------\n');
  }

  /**
   *  @returns Promise<string> Resolves to the filepath of the saved glitch file.
   */
  slice() {
    return new Promise((resolve, reject) => {
      this.headBuffer = null;
      this.collectedBuffer = null;
      this.startSeconds = 0;
      this.chunkIndex = 0;

      while (this.startSeconds < this.totalSeconds) {
        this._getChunk();
        this.chunkIndex++;
      }

      if (!USE_ORIG_HEADER) {
        this._setHeader();
      }

      this.log('\n--------------------------\n');
      this.log('DONE: chunkStartInSeconds=%d this.totalDurationInSeconds=%d', this.startSeconds, this.totalSeconds);

      fs.writeFileSync(this.outputPath,
        Buffer.concat(
          [this.headBuffer, this.collectedBuffer],
          this.headBuffer.length + this.collectedBuffer.length
        ),
        {
          encoding: 'binary'
        }
      );
      return resolve(this.outputPath);
    });
  }

  // Gets a chunk of the required length for the current MIDI duration, as whole samples.
  _getChunk() {
    const metaBuffer = this.metaBuffers[this.chunkIndex % this.metaBuffers.length];

    const chunkSeconds = Math.min(
      this.chunkSeconds[this.chunkIndex % this.chunkSeconds.length],
      this.totalSeconds - this.startSeconds
    );

    this.log('\nchunkIndex: %d; buffer: %d', this.chunkIndex, this.chunkIndex % this.metaBuffers.length);
    this.log('From %ds for chunkDurationInSeconds %ds', this.startSeconds, chunkSeconds);

    let startBit = (this.startSeconds * metaBuffer.secToByteFactor);
    let startBitOffset = startBit % metaBuffer.bitPerSample;
    startBit = startBitOffset +
      (Math.floor(startBit / metaBuffer.bitPerSample) * metaBuffer.bitPerSample);

    startBit += metaBuffer.dataStart;

    let endBit = startBit + (chunkSeconds * metaBuffer.secToByteFactor);
    endBit = Math.floor(endBit);

    endBit = (endBit % metaBuffer.bitPerSample) +
      Math.floor(endBit / metaBuffer.bitPerSample) * metaBuffer.bitPerSample;

    // reduce if above file duration
    if (endBit > metaBuffer.dataStart + metaBuffer.dataLength - metaBuffer.bitPerSample) {
      endBit = Math.floor(Math.min(endBit, metaBuffer.dataStart + metaBuffer.dataLength - metaBuffer.bitPerSample));
    }

    this.log('Bit range from %d to %d', startBit, endBit);

    if (USE_ORIG_HEADER && this.headBuffer === null) {
      this.headBuffer = metaBuffer.buffer.slice(0, this.metaBuffers[0].dataStart);
    }

    const dataBuffer = metaBuffer.buffer.slice(startBit, endBit);

    this.collectedBuffer = this.collectedBuffer === null ? dataBuffer
      : Buffer.concat(
        [this.collectedBuffer, dataBuffer],
        this.collectedBuffer.length + dataBuffer.length
      );

    this.startSeconds += chunkSeconds;

    this.log('Copied', metaBuffer.filePath, this.startSeconds, 'of', this.totalSeconds);
    console.assert(this.startSeconds <= this.totalSeconds,
      'Internal chunk timing error! chunkStart exceeds totalDuration: ' + this.startSeconds + ' > ' + this.totalSeconds
    );
  }

  _setHeader() {
    this.headBuffer = Buffer.alloc(this.metaBuffers[0].dataStart);
    const FILE_SIZE = this.collectedBuffer.length + this.metaBuffers[0].dataStart;
    const BIT_DEPTH = this.metaBuffers[0].bitPerSample;

    this.log('\nWriting ', BIT_DEPTH, ' bit at ', this.metaBuffers[0].sampleRate, 'hz');

    this.headBuffer.write('RIFF', 0);
    this.headBuffer.writeUIntLE(FILE_SIZE - 8, 4, 4);
    this.headBuffer.write('WAVE', 8);
    this.headBuffer.write('fmt ', 12);
    this.headBuffer.writeUIntLE(16, 16, 4); // Length of format data is 16. silly spec.
    this.headBuffer.writeUIntLE(1, 20, 2); // Set 'type' to  gblkmtgbkjregijaher zoj grok ryot PCM
    this.headBuffer.writeUIntLE(this.metaBuffers[0].numberOfChannels, 22, 2);
    this.headBuffer.writeBigUInt64LE(BigInt(this.metaBuffers[0].sampleRate), 24, 2);
    this.headBuffer.writeBigUInt64LE(
      BigInt(
        (this.metaBuffers[0].sampleRate * BIT_DEPTH * this.metaBuffers[0].numberOfChannels) / 8
      ),
      28, 4
    );
    this.headBuffer.writeUIntLE((BIT_DEPTH * this.metaBuffers[0].numberOfChannels) / 8, 32, 2);
    this.headBuffer.writeUIntLE(this.metaBuffers[0].bitPerSample, 34, 2);
    this.headBuffer.write('data', 36); // Init 'data' section
    this.headBuffer.writeUIntLE(this.collectedBuffer.length, 40, 4);
  }
};
