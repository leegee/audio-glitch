const BYTE_LENGTH = 4;

// format info, see http://www.topherlee.com/software/pcm-tut-wavformat.html

export default class WavFormatReader {
  getWavInfos(buffer) {
    // get header descriptors
    var descriptors = this.getWavDescriptors(buffer);
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
    return format;
  }

  getWavDescriptors(buffer) {
    let index = 0;
    var descriptor = '';
    var chunkLength = 0;
    var descriptors = new Map();

    // search for buffer descriptors
    while (index < buffer.length - 1) {
      // read chunk descriptor
      descriptor = buffer.slice(index, index + BYTE_LENGTH).toString();

      // special case for RIFF descriptor (header, fixed length)
      if (descriptor === 'RIFF') {
        // read RIFF descriptor
        chunkLength = 3 * BYTE_LENGTH;
        descriptors.set(descriptor, {
          start: index + BYTE_LENGTH,
          length: chunkLength
        });
        // first subchunk will always be at byte 12
        index += chunkLength;
      }

      else {
        // account for descriptor length
        index += BYTE_LENGTH;

        chunkLength = buffer.readUIntLE(index, BYTE_LENGTH);

        descriptors.set(descriptor, {
          start: index + BYTE_LENGTH,
          length: chunkLength
        });

        index += chunkLength + BYTE_LENGTH;
      }
    }
    return descriptors;
  }
};
