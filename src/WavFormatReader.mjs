const StringDecoder = require('string_decoder').StringDecoder;

const BYTE_LENGTH = 4;

// format info, see http://www.topherlee.com/software/pcm-tut-wavformat.html

exports.WavFormatReader = class WavFormatReader {
  constructor() {
    this.stringDecoder = new StringDecoder('utf8');
  }

  getWavInfos(buffer) {
    // console.log('input buffer length', buffer.length);
    // get header descriptors
    var descriptors = this.getWavDescriptors(buffer);
    // console.log(descriptors);
    var format = this.getWavFormat(descriptors, buffer);
    return { descriptors, format };
  }


  getWavFormat(descriptors, buffer) {
    var fmt = descriptors.get('fmt ');
    var format = {
      type: buffer.readUIntLE(fmt.start, 2),
      numberOfChannels: buffer.readUIntLE(fmt.start + 2, 2),
      sampleRate: buffer.readUIntLE(fmt.start + 4, 4),
      secToByteFactor: buffer.readUIntLE(fmt.start + 8, 4), // (Sample Rate * BitsPerSample * Channels) / 8
      weird: buffer.readUIntLE(fmt.start + 12, 2), // (BitsPerSample * Channels) / 8.1 - 8 bit mono2 - 8 bit stereo/16 bit mono4 - 16 bit stereo
      bitPerSample: buffer.readUIntLE(fmt.start + 14, 2)
    };
    // console.log( format );
    return format;
  }

  getWavDescriptors(buffer) {
    var index = 0;
    var descriptor = '';
    var chunkLength = 0;
    var descriptors = new Map();

    // search for buffer descriptors
    while (true) {
      // read chunk descriptor
      var bytes = buffer.slice(index, index + BYTE_LENGTH);
      descriptor = this.stringDecoder.write(bytes);

      // special case for RIFF descriptor (header, fixed length)
      if (descriptor === 'RIFF') {
        // read RIFF descriptor
        chunkLength = 3 * BYTE_LENGTH;
        descriptors.set(descriptor, { start: index + BYTE_LENGTH, length: chunkLength });
        // first subchunk will always be at byte 12
        index += chunkLength;
      }
      else {
        // account for descriptor length
        index += BYTE_LENGTH;

        chunkLength = buffer.readUIntLE(index, BYTE_LENGTH);

        // fill in descriptor map
        descriptors.set(descriptor, {
          start: index + BYTE_LENGTH,
          length: chunkLength
        });

        // increment read index
        index += chunkLength + BYTE_LENGTH;
      }

      // stop loop when reached buffer end
      if (index >= buffer.length - 1) {
        return descriptors;
      }
    }
  }
}
