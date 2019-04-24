const fs = require('fs');
const MidiParser = require('midi-parser-js/src/midi-parser');
const Slicer = require('node-audio-slicer').Slicer;
const WavFormatReader = require('./WavFormatReader.mjs').WavFormatReader;

const BYTE_LENGTH = 4;

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
    this.waveFilePaths = options.waveFilePaths;
    this.reader = new Reader();

    const midi = MidiParser.parse(fs.readFileSync(options.midi, 'base64'));
    const ppq = midi.timeDivision;
    // const timeFactor = 60000 / (options.bpm * ppq);
    const timeFactor = 60000 / (options.bpm * ppq) / 1000;

    this.log('bpm:', options.bpm);
    this.log('ppq:', ppq);
    this.log('(options.bpm * ppq)', (options.bpm * ppq));
    this.log('MIDI.timeDivision', midi.timeDivision);
    this.log('timeFactor', timeFactor);

    // Just the track 1 note on events for any channel
    const events = midi.track[0].event
      .filter(v => v.type === 9 && v)
      .map(v => v.deltaTime * timeFactor);

    // If starting at the beginning
    if (events[0] === 0) {
      events.shift();
    }

    this.chunkDurations = events;

    this.log('Events:', this.chunkDurations);
  }

  /**
   *  @returns Promise<>
   */
  slice() {
    return new Promise(async (resolve, reject) => {
      const metaBuffers = [];
      this.headBuffer = null;
      this.collectedBuffer = null;
      this.tailBuffer = null;

      await this.waveFilePaths.forEach((inFilePath) => {
        const buffer = this.reader.loadBuffer(inFilePath);
        const metaBuffer = this.reader.interpretHeaders(buffer);
        metaBuffers.push(metaBuffer);
      });

      this.log('\n--------------------------\n');

      // init slicing loop
      let totalDurationInSeconds = metaBuffers[0].dataLength / metaBuffers[0].secToByteFactor;
      this.log('chunkDurations', this.chunkDurations);
      this.log('totalDuration: ', totalDurationInSeconds);

      let chunkStartInSeconds = 0;
      let totalEncodedTime = 0;
      let initStartBitOffset = 0;

      let metaBufferIndex = 0;

      for (let chunkIndex = 0; chunkIndex < this.chunkDurations.length; chunkIndex++) {
        let chunkDurationInSeconds = this.chunkDurations[chunkIndex];
        const metaBuffer = metaBuffers[metaBufferIndex];
        this.log('workingBufferIndex using metaBuffers[%d] from %ds for chunkDurationInSeconds %ds', metaBufferIndex, chunkStartInSeconds, chunkDurationInSeconds);

        // handle last chunk duration (if needs to be shortened)
        chunkDurationInSeconds = Math.min(chunkDurationInSeconds, totalDurationInSeconds - chunkStartInSeconds);

        // define start / end offset to take into account
        let startOffset = 0;
        let endOffset = 0;
        let chunkStartBitIndex = metaBuffer.dataStart + (chunkStartInSeconds - startOffset) * metaBuffer.secToByteFactor;
        let chunkEndBitIndex = chunkStartBitIndex + (chunkDurationInSeconds + endOffset) * metaBuffer.secToByteFactor;

        // tweek start / stop offset times to make sure they do not fall in the middle of a sample's bits
        // (and update startOffset / endOffset to send exact values in output chunkList for overlap compensation in client code)
        if (chunkIndex !== 0) { // would not be wise to fetch index under data start for first chunk
          chunkStartBitIndex = initStartBitOffset + Math.floor(chunkStartBitIndex / metaBuffer.bitPerSample) * metaBuffer.bitPerSample;
          startOffset = chunkStartInSeconds - (chunkStartBitIndex - metaBuffer.dataStart) / metaBuffer.secToByteFactor;

          chunkEndBitIndex = Math.ceil(chunkEndBitIndex / metaBuffer.bitPerSample) * metaBuffer.bitPerSample;
          chunkEndBitIndex = Math.min(chunkEndBitIndex, metaBuffer.dataStart + metaBuffer.dataLength); // reduce if above file duration
          endOffset = ((chunkEndBitIndex - chunkStartBitIndex) / metaBuffer.secToByteFactor) - chunkDurationInSeconds;
        }

        // keep track of init dta start offset
        else {
          initStartBitOffset = chunkStartBitIndex % metaBuffer.bitPerSample;
        }

        // get chunk buffer
        this.getChunk(metaBuffer, chunkStartBitIndex, chunkEndBitIndex);

        totalEncodedTime += chunkDurationInSeconds;
        this.log('Done/Todo: ', totalEncodedTime, totalDurationInSeconds);

        // chunkStartTime > totalDuration
        // Done?
        if (totalEncodedTime >= totalDurationInSeconds) {
          throw new Error('Timing off!');
        }

        chunkStartInSeconds += chunkDurationInSeconds;
        metaBufferIndex++;
        if (metaBufferIndex === metaBuffers.length) {
          metaBufferIndex = 0;
        }
      }

      this.log('RESOLVE: totalEncodedTime=%d totalDurationInSeconds=%d', totalEncodedTime, totalDurationInSeconds);
      Buffer.concat([this.headBuffer, this.collectedBuffer]);
      const outpath = this.midiFilePath + '_glitch.wav';
      fs.writeFileSync(outpath, this.collectedBuffer);
      return resolve(outpath);

    });
  }

  getChunk(metaBuffer, chunkStart, chunkEnd) {
    this.log('getChunk %d to %d', chunkStart, chunkEnd);

    const headBuffer = metaBuffer.buffer.slice(0, metaBuffer.dataStart);
    // const tailBuffer = metaBuffer.buffer.slice(metaBuffer.dataStart + metaBuffer.dataLength, metaBuffer.buffer.length);
    if (chunkEnd > metaBuffer.dataStart + metaBuffer.dataLength) {
      throw new RangeError('Requested chunk greater than clip length:' + chunkEnd + ', ' + (metaBuffer.dataStart + metaBuffer.dataLength));
    }
    const dataBuffer = metaBuffer.buffer.slice(chunkStart, chunkEnd);

    if (this.headBuffer === null) {
      this.headBuffer = headBuffer;
    }
    // if (this.tailBuffer === null) {
    //   this.tailBuffer = tailBuffer;
    // }

    // update data length descriptor in head buffer
    const len = (this.collectedBuffer ? this.collectedBuffer.length : 0) + dataBuffer.length;
    console.log('Set header length descriptor to ', len);
    this.headBuffer.writeUIntLE(
      len, this.headBuffer.length - BYTE_LENGTH, BYTE_LENGTH
    );

    // concatenate head / data / tail buffers
    // let outputBuffer = Buffer.concat([headBuffer, dataBuffer, tailBuffer], headBuffer.length + tailBuffer.length + dataBuffer.length);
    // return outputBuffer;
    this.collectedBuffer = this.collectedBuffer === null ? dataBuffer : Buffer.concat([this.collectedBuffer, dataBuffer], this.collectedBuffer.length + dataBuffer.length);
  }
};

class Reader {
  constructor() {
    this.wavFormatReader = new WavFormatReader();
  }

  loadBuffer(filePath) {
    return fs.readFileSync(filePath);
  }

  interpretHeaders(buffer) {
    let wavInfo = this.wavFormatReader.getWavInfos(buffer);
    return {
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
