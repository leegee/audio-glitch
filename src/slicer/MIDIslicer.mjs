/* global BigInt */
const fs = require('fs');
const MidiParser = require('midi-parser-js/src/midi-parser');
const Reader = require('./Reader.mjs');

const USE_ORIG_HEADER = false;
const NOTE_ON = 9;
const NOTE_OFF = 8;
const REQ_ARGS = {
  bpm: '"bpm" as a number',
  midi: '"midi" should be a string to describe the path to the MIDI "beat" file, or an array of numbers to indicate split locations in seconds',
  wav: '"wave" should be an array to describe path(s) to the wave files'
}

module.exports = class MIDIslicer {
  /**
   * @param {Object} options
   * @param {boolean} options.verbose
   * @param {number=120} options.bpm
   * @param {string?} options.output
   * @param {string|array} options.midi - path to midi or array of floats for beats
   */
  constructor(options = {}) {
    let errMsgs = [];
    Object.keys(REQ_ARGS).forEach(key => {
      if (!options[key]) {
        errMsgs.push(REQ_ARGS[key]);
      }
    });
    if (errMsgs.length) {
      throw new Error('Missing argument' + (errMsgs.length > 1 ? 's' : '') + ':\n' + errMsgs.join('\n\t'));
    }
    if (typeof options.wav === 'string') {
      options.wav = [options.wav];
    }

    this.log = options.verbose ? console.log : () => { };
    this.midi = options.midi;
    this.wav = options.wav;
    this.reader = new Reader();

    if (typeof options.midi === 'string') {
      this.totalMidiDurationInSeconds = this._loadMidiFile(options);
    }

    else if (options.midi instanceof Array) {
      this.outputPath = options.output || 'glitch.wav';
      this.chunkSeconds = options.midi;
      this.totalMidiDurationInSeconds = this.chunkSeconds.reduce((a, b) => a + b, 0);
    }

    this._setMetaBuffers();
    this.totalSeconds = this.metaBuffers[0].dataLength / this.metaBuffers[0].secToByteFactor;

    this.log('\n--------------------------\n');
    this.log(this.metaBuffers);
    this.log('\n--------------------------\n');
    this.log('chunkDurations', this.chunkSeconds);
    this.log('totalDurationInSeconds: ', this.totalSeconds);
    this.log('totalMidiDurationInSeconds: ', this.totalMidiDurationInSeconds);
    this.log('\n--------------------------\n');
  }

  _loadMidiFile(options) {
    this.outputPath = options.output || this.midi + '_glitch.wav';
    const midi = MidiParser.parse(fs.readFileSync(options.midi)); // , 'base64'
    const ppq = midi.timeDivision;
    const timeFactor = (60000 / (options.bpm * ppq) / 1000);

    this.log('BPM:%d, PPQ: %d', options.bpm, ppq);
    this.log('MIDI.timeDivision:', midi.timeDivision);
    this.log('timeFactor:', timeFactor);

    let noteDur = 0;
    let totalMidiDurationInSeconds = 0; // public for tests only

    // Just the track 1 note on events for any channel
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

    return totalMidiDurationInSeconds;
  }

  _setMetaBuffers() {
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
  }

  /**
   *  @returns Promise<string> Resolves to the filepath of the saved glitch file.
   */
  slice() {
    return new Promise((resolve, reject) => {
      this.headBuffer = null;
      this.collectedBuffer = null;
      this.playheadSeconds = 0;
      this.chunkIndex = 0;

      while (this.playheadSeconds < this.totalSeconds) {
        this._getChunk();
        this.chunkIndex++;
      }

      if (!USE_ORIG_HEADER) {
        this._setHeader();
      }

      this.log('\n--------------------------\n');
      this.log('DONE: chunkStartInSeconds=%d this.totalDurationInSeconds=%d', this.playheadSeconds, this.totalSeconds);

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
      this.totalSeconds - this.playheadSeconds
    );

    this.log('\nchunkIndex: %d; buffer: %d', this.chunkIndex, this.chunkIndex % this.metaBuffers.length);
    this.log('From %ds for chunkDurationInSeconds %ds', this.playheadSeconds, chunkSeconds);

    let startBit = (this.playheadSeconds * metaBuffer.secToByteFactor);
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

    this.playheadSeconds += chunkSeconds;

    this.log('Copied', metaBuffer.filePath, this.playheadSeconds, 'of', this.totalSeconds);
    console.assert(this.playheadSeconds <= this.totalSeconds,
      'Internal chunk timing error! chunkStart exceeds totalDuration: ' + this.playheadSeconds + ' > ' + this.totalSeconds
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
