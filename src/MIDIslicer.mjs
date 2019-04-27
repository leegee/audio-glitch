/* global BigInt */
const fs = require('fs');
const MidiParser = require('midi-parser-js/src/midi-parser');
const Reader = require('./Reader.mjs');

const USE_ORIG_HEADER = false;

module.exports = class MIDIslicer {
  /**
   * @param {Object} options
   * @param {boolean} options.verbose
   * @param {number=120} options.bpm
   * @param {string?} options.output
   * @param {string|array} options.midi - path to midi or array of floats for beats
   */
  constructor(options = {}) {
    // super(options);
    this.log = options.verbose ? console.log : () => { };
    if (!options.midi) {
      throw new TypeError('Missing midi argument: use a string to describe the path to the MIDI "beat" file, or supply beats as an array of numbers.');
    }
    if (!options.wav) {
      throw new TypeError('Missing wav array argument to describe path(s) to the wave files.');
    }
    options.bpm = options.bpm || 120;
    this.midiFilePath = options.midi;
    this.wav = options.wav;
    this.reader = new Reader();

    if (typeof options.midi === 'string') {
      this.outputPath = options.output || this.midiFilePath + '_glitch.wav';
      const midi = MidiParser.parse(fs.readFileSync(options.midi, 'base64'));
      const ppq = midi.timeDivision;
      // TODO wtf? Not the spec.... '*2'??
      const timeFactor = (60000 / (options.bpm * ppq) / 1000) * 2;

      this.log('bpm:', options.bpm);
      this.log('ppq:', ppq);
      this.log('(options.bpm * ppq)', (options.bpm * ppq));
      this.log('MIDI.timeDivision', midi.timeDivision);
      this.log('timeFactor', timeFactor);

      // Just the track 1 note on events for any channel
      this.chunkDurationsInSeconds = midi.track[0].event
        .filter(v => v.type === 9 && v)
        .map(v => v.deltaTime * timeFactor);
      // If starting at the beginning
      if (this.chunkDurationsInSeconds[0] === 0) {
        this.chunkDurationsInSeconds.shift();
      }
    }

    else if (options.midi instanceof Array) {
      this.outputPath = options.output || 'glitch.wav';
      this.chunkDurationsInSeconds = options.midi;
    }

    this.log('Events:', this.chunkDurationsInSeconds);

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
    this.log(this.metaBuffers);

    this.log('\n--------------------------\n');
    this.totalDurationInSeconds = this.metaBuffers[0].dataLength / this.metaBuffers[0].secToByteFactor;
    this.log('chunkDurations', this.chunkDurationsInSeconds);
    this.log('totalDurationInSeconds: ', this.totalDurationInSeconds);
    this.log('\n--------------------------\n');
  }

  /**
   *  @returns Promise<string> Resolves to the filepath of the saved glitch file.
   */
  slice() {
    return new Promise((resolve, reject) => {
      this.headBuffer = null;
      this.collectedBuffer = null;
      this.chunkStartInSeconds = 0;
      this.chunkIndex = 0;

      while (this.chunkStartInSeconds < this.totalDurationInSeconds) {
        this._getChunk();
        this.chunkIndex++;
      }

      if (!USE_ORIG_HEADER) {
        this._setHeader();
      }

      this.log('\n--------------------------\n');
      this.log('DONE: chunkStartInSeconds=%d this.totalDurationInSeconds=%d', this.chunkStartInSeconds, this.totalDurationInSeconds);

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

  _getChunk() {
    const metaBuffer = this.metaBuffers[this.chunkIndex % this.metaBuffers.length];
    // In case final chunk shorter duration than requested.
    const chunkDurationInSeconds = Math.min(
      this.chunkDurationsInSeconds[this.chunkIndex % this.chunkDurationsInSeconds.length],
      this.totalDurationInSeconds - this.chunkStartInSeconds
    );
    this.log('\nchunkIndex: %d; buffer: %d', this.chunkIndex, this.chunkIndex % this.metaBuffers.length);
    this.log('From %ds for chunkDurationInSeconds %ds', this.chunkStartInSeconds, chunkDurationInSeconds);

    // define start, end offsets
    let chunkStartBitIndex = metaBuffer.dataStart + (this.chunkStartInSeconds * metaBuffer.secToByteFactor);
    let chunkEndBitIndex = chunkStartBitIndex + (chunkDurationInSeconds * metaBuffer.secToByteFactor);

    // tweek start / stop offset times to make sure they do not fall in the middle of a sample's bits
    if (this.chunkIndex !== 0) {
      let initStartBitOffset = chunkStartBitIndex % metaBuffer.bitPerSample;
      chunkStartBitIndex = initStartBitOffset +
        (Math.floor(chunkStartBitIndex / metaBuffer.bitPerSample) * metaBuffer.bitPerSample);
    }

    let initEndBitOffset = chunkEndBitIndex % metaBuffer.bitPerSample;
    chunkEndBitIndex = initEndBitOffset +
      (Math.floor(chunkEndBitIndex / metaBuffer.bitPerSample) * metaBuffer.bitPerSample);

    // chunkEndBitIndex = Math.ceil(chunkEndBitIndex / metaBuffer.bitPerSample) * metaBuffer.bitPerSample;
    // reduce if above file duration
    chunkEndBitIndex = Math.min(chunkEndBitIndex, metaBuffer.dataStart + metaBuffer.dataLength);

    this.log('bit index ', chunkStartBitIndex, 'to', chunkEndBitIndex);

    if (USE_ORIG_HEADER && this.headBuffer === null) {
      this.headBuffer = metaBuffer.buffer.slice(0, this.metaBuffers[0].dataStart);
    }

    let dataBuffer = metaBuffer.buffer.slice(chunkStartBitIndex, chunkEndBitIndex);

    this.collectedBuffer = this.collectedBuffer === null ? dataBuffer
      : Buffer.concat(
        [this.collectedBuffer, dataBuffer],
        this.collectedBuffer.length + dataBuffer.length
      );

    this.chunkStartInSeconds += chunkDurationInSeconds;

    this.log('Copied', metaBuffer.filePath, this.chunkStartInSeconds, 'of', this.totalDurationInSeconds);
    console.assert(this.chunkStartInSeconds <= this.totalDurationInSeconds,
      'Internal chunk timing error! chunkStart exceeds totalDuration: ' + this.chunkStartInSeconds + ' > ' + this.totalDurationInSeconds
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
    this.headBuffer.write('fmt ', 12); // Init 'format' section
    this.headBuffer.writeUIntLE(16, 16, 4); // Length of format data - always 16
    this.headBuffer.writeUIntLE(1, 20, 2); // Type: PCM
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
