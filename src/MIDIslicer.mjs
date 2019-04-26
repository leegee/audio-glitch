const fs = require('fs');
const MidiParser = require('midi-parser-js/src/midi-parser');
const Slicer = require('node-audio-slicer').Slicer;
const WavFormatReader = require('./WavFormatReader.mjs').WavFormatReader;

const USE_ORIG_HEADER = false;

exports.MIDIslicer = class MIDIslicer extends Slicer {
  constructor(options = {}) {
    super(options);
    this.log = !options.log ? console.log : () => { };
    if (!options.midi) {
      throw new TypeError('Missing midi argument to describe the path to the MIDI "beat" file.');
    }
    if (!options.waveFilePaths) {
      throw new TypeError('Missing waveFilePaths argument to describe paths to the wave files.');
    }
    options.bpm = options.bpm || 120;
    this.midiFilePath = options.midi;
    this.outputPath = this.midiFilePath + '_glitch.wav';
    this.waveFilePaths = options.waveFilePaths;
    this.reader = new Reader();

    const midi = MidiParser.parse(fs.readFileSync(options.midi, 'base64'));
    const ppq = midi.timeDivision;
    // Er, wtf? Not the spec.... '*2'??
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

    this.log('Events:', this.chunkDurationsInSeconds);

    this.metaBuffers = [];

    this.waveFilePaths.forEach((wavPath) => {
      const buffer = this.reader.loadBuffer(wavPath);
      const metaBuffer = this.reader.interpretHeaders(buffer);
      this.metaBuffers.push(metaBuffer);
      console.log(metaBuffer);
    });

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
        this.log('\n\n########### ', this.chunkIndex, this.chunkStartInSeconds);
        this._processChunk();
        this.chunkIndex++;
      }

      if (!USE_ORIG_HEADER) {
        this._setHeader();
      }

      this.log('\n--------------------------\n');
      this.log('DONE: this.chunkStartInSeconds=%d this.totalDurationInSeconds=%d', this.chunkStartInSeconds, this.totalDurationInSeconds);

      fs.writeFileSync(this.outputPath,
        Buffer.concat([this.headBuffer, this.collectedBuffer], this.headBuffer.length + this.collectedBuffer.length),
        {
          encoding: 'binary'
        }
      );
      return resolve(this.outputPath);
    });
  }

  _processChunk() {
    const metaBuffer = this.metaBuffers[this.chunkIndex % this.metaBuffers.length];
    // In case final chunk shorter duration than requested.
    const chunkDurationInSeconds = Math.min(
      this.chunkDurationsInSeconds[this.chunkIndex % this.chunkDurationsInSeconds.length],
      this.totalDurationInSeconds - this.chunkStartInSeconds
    );
    this.log('\n------ chunkIndex: %d; buffer: %d', this.chunkIndex, this.chunkIndex % this.metaBuffers.length);
    this.log('From %ds for chunkDurationInSeconds %ds', this.chunkStartInSeconds, chunkDurationInSeconds);

    // define start, end offsets
    let chunkStartBitIndex = metaBuffer.dataStart + (this.chunkStartInSeconds * metaBuffer.secToByteFactor);
    let chunkEndBitIndex = chunkStartBitIndex + (chunkDurationInSeconds * metaBuffer.secToByteFactor);

    // tweek start / stop offset times to make sure they do not fall in the middle of a sample's bits
    if (this.chunkIndex !== 0) {
      let initStartBitOffset = chunkStartBitIndex % metaBuffer.bitPerSample;
      if (initStartBitOffset !== chunkStartBitIndex) {
        chunkStartBitIndex = initStartBitOffset +
          (Math.floor(chunkStartBitIndex / metaBuffer.bitPerSample) * metaBuffer.bitPerSample);
      }
    }

    chunkEndBitIndex = Math.ceil(chunkEndBitIndex / metaBuffer.bitPerSample) * metaBuffer.bitPerSample;
    // reduce if above file duration
    chunkEndBitIndex = Math.min(chunkEndBitIndex, metaBuffer.dataStart + metaBuffer.dataLength);

    this.log('chunkStartBitIndex', chunkStartBitIndex);
    this.log('chunkEndBitIndex', chunkEndBitIndex);

    if (USE_ORIG_HEADER && this.headBuffer === null) {
      this.headBuffer = metaBuffer.buffer.slice(0, 44);
    }

    const dataBuffer = metaBuffer.buffer.slice(
      parseInt(chunkStartBitIndex),
      parseInt(chunkEndBitIndex)
    );

    this.collectedBuffer = this.collectedBuffer === null ? dataBuffer
      : Buffer.concat(
        [this.collectedBuffer, dataBuffer],
        this.collectedBuffer.length + dataBuffer.length
      );

    this.chunkStartInSeconds += chunkDurationInSeconds;

    this.log('Copied', metaBuffer.filePath, this.chunkStartInSeconds, 'of', this.totalDurationInSeconds);
    if (this.chunkStartInSeconds > this.totalDurationInSeconds) {
      this.log('------this.chunkStartInSeconds >= this.totalDurationInSeconds', this.chunkStartInSeconds, this.totalDurationInSeconds);
      throw new Error('oops');
    }
  }

  _setHeader() {
    this.headBuffer = Buffer.alloc(44);
    const FILE_SIZE = this.collectedBuffer.length + 44;
    const BIT_DEPTH = this.metaBuffers[0].bitPerSample;

    // this.headBuffer.write('RIFF', 0);
    Buffer.from('RIFF').copy(this.headBuffer, 0);

    this.headBuffer.writeUIntLE(FILE_SIZE - 8, 4, 4);

    // this.headBuffer.write('WAVE', 8);
    Buffer.from('WAVE').copy(this.headBuffer, 8);

    // this.headBuffer.write('fmt ', 12); // Init 'format' section
    Buffer.from('fmt ').copy(this.headBuffer, 12);

    this.headBuffer.writeUIntLE(16, 16, 4); // Length of format data - always 16
    this.headBuffer.writeUIntLE(1, 20, 2); // Type: PCM
    this.headBuffer.writeUIntLE(this.metaBuffers[0].numberOfChannels, 22, 2);

    this.headBuffer.writeUIntLE(this.metaBuffers[0].sampleRate, 24, 2);
    // this.headBuffer.writeBigUInt64LE(BigInt(this.metaBuffers[0].sampleRate), 24, 2);

    this.headBuffer.writeUIntLE(
      (this.metaBuffers[0].sampleRate * BIT_DEPTH * this.metaBuffers[0].numberOfChannels)
      / 8
      , 28, 4);
    // this.headBuffer.writeBigUInt64LE(BigInt((this.metaBuffers[0].sampleRate * BIT_SIZE * this.metaBuffers[0].numberOfChannels) / 8), 28, 4);

    this.headBuffer.writeUIntLE((BIT_DEPTH * this.metaBuffers[0].numberOfChannels) / 8, 32, 2);
    this.headBuffer.writeUIntLE(this.metaBuffers[0].bitPerSample, 34, 2);

    // this.headBuffer.write('data', 36); // Init 'data' section
    Buffer.from('data').copy(this.headBuffer, 36);

    this.headBuffer.writeUIntLE(this.collectedBuffer.length, 40, 4);
  }
};

class Reader {
  constructor() {
    this.wavFormatReader = new WavFormatReader();
  }

  loadBuffer(filePath) {
    this.filePath = filePath;
    return fs.readFileSync(filePath);
  }

  interpretHeaders(buffer) {
    let wavInfo = this.wavFormatReader.getWavInfos(buffer);
    console.log('data starts at ', wavInfo.descriptors.get('data').start, ' for ', wavInfo.descriptors.get('data').length);
    return {
      filePath: this.filePath,
      buffer: buffer,
      dataStart: wavInfo.descriptors.get('data').start,
      dataLength: wavInfo.descriptors.get('data').length,
      numberOfChannels: wavInfo.format.numberOfChannels,
      sampleRate: wavInfo.format.sampleRate,
      secToByteFactor: wavInfo.format.secToByteFactor,
      bitPerSample: wavInfo.format.bitPerSample
    };
  }
}
