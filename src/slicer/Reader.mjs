const fs = require('fs');
const WavFormatReader = require('./WavFormatReader.mjs');

module.exports = class Reader {
  constructor() {
    this.wavFormatReader = new WavFormatReader();
  }

  loadMetaBuffer(filePath) {
    this.filePath = filePath;
    const buffer = fs.readFileSync(filePath);

    let wavInfo = this.wavFormatReader.getWavInfos(buffer, { encoding: 'binary' });

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
};
