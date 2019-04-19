const fs = require("fs");
const Lame = require("node-lame").Lame;
const StringDecoder = require('string_decoder').StringDecoder;

const Slicer = require("node-audio-slicer").Slicer;

const BYTE_LENGTH = 4;

exports.MIDIslicer = class MIDIslicer extends Slicer {
    constructor(options = {}) {
        super(options);

        if (!options.durations) {
            throw new TypeError('Missing durations argument');
        }

        this.tmpPath = (options.tmpPath !== undefined) ? options.tmpPath : undefined;
        // this.chunkDuration = (options.duration !== undefined) ? options.duration : 4; // chunk duration, in seconds
        this.chunkDurations = options.durations;
        this.overlapDuration = (options.overlap !== undefined) ? options.overlap : 0; // overlap duration, in seconds
        this.reader = new Reader();
    }

    /** No longer takes a callback but returns a Promise<chunklist>. Only supports wav */
    slice(inFilePaths) {
        return new Promise((resolve, reject) => {
            var inFileExtension = inFilePaths[0].split(".").pop();
            if (inFileExtension !== 'wav') {
                return reject(new Error('only supports wav files input'));
            }

            // load audio file
            const buffer = await this.reader.loadBuffer(inFilePaths);
            // get buffer chunk
            let metaBuffer = this.reader.interpretHeaders(buffer);

            // get chunk path radical and extension
            let inPath = inFilePaths.substr(0, inFilePaths.lastIndexOf('/') + 1);
            let inFileName = inFilePath.split("/").pop();
            let inFileRadical = inFileName.substr(0, inFileName.lastIndexOf("."));
            let extension = inFileExtension;
            // create sub-directory to store sliced files
            let storeDirPath = inPath + inFileRadical;
            if (!fs.existsSync(storeDirPath)) { 
                fs.mkdirSync(storeDirPath); 
            }

            // init slicing loop 
            let totalDuration = metaBuffer.dataLength / metaBuffer.secToByteFactor;
            let chunkStartTime = 0;
            // let chunkDuration = this.chunkDuration;
            let chunkIndex = 0;
            let totalEncodedTime = 0;
            let chunkList = [];
            let initStartBitOffset = 0;

            this.chunkDurations.forEach(chunkDuration => {
                // slicing loop
                while (chunkStartTime < totalDuration) {

                    // handle last chunk duration (if needs to be shortened)
                    chunkDuration = Math.min(chunkDuration, totalDuration - chunkStartTime);

                    // get chunk name
                    let chunkPath = storeDirPath + '/' + chunkIndex + '-' + inFileRadical + '.' + extension;

                    // define start / end offset to take into account 
                    let startOffset = (chunkStartTime === 0) ? 0 : this.overlapDuration;
                    let endOffset = ((chunkStartTime + chunkDuration + this.overlapDuration) < totalDuration) ? this.overlapDuration : 0;
                    let chunkStartBitIndex = metaBuffer.dataStart + (chunkStartTime - startOffset) * metaBuffer.secToByteFactor;
                    let chunkEndBitIndex = chunkStartBitIndex + (chunkDuration + endOffset) * metaBuffer.secToByteFactor;

                    // tweek start / stop offset times to make sure they do not fall in the middle of a sample's bits 
                    // (and update startOffset / endOffset to send exact values in output chunkList for overlap compensation in client code)
                    if (chunkIndex !== 0) { // would not be wise to fetch index under data start for first chunk
                        chunkStartBitIndex = initStartBitOffset + Math.floor(chunkStartBitIndex / metaBuffer.bitPerSample) * metaBuffer.bitPerSample;
                        startOffset = chunkStartTime - (chunkStartBitIndex - metaBuffer.dataStart) / metaBuffer.secToByteFactor;

                        chunkEndBitIndex = Math.ceil(chunkEndBitIndex / metaBuffer.bitPerSample) * metaBuffer.bitPerSample;
                        chunkEndBitIndex = Math.min(chunkEndBitIndex, metaBuffer.dataStart + metaBuffer.dataLength); // reduce if above file duration
                        endOffset = (chunkEndBitIndex - chunkStartBitIndex) / metaBuffer.secToByteFactor - chunkDuration;
                    }

                    // keep track off init dta start offset
                    else { 
                        initStartBitOffset = chunkStartBitIndex % metaBuffer.bitPerSample;
                    }

                    // get chunk buffer
                    let chunkBuffer = this.getChunk(metaBuffer, chunkStartBitIndex, chunkEndBitIndex);


                    fs.writeFile(chunkPath, chunkBuffer, (err) => {
                        if (err) { return reject(err); }
                        // to be able to tell when to call the output callback:
                        totalEncodedTime += this.chunkDuration;
                        // run arg callback only at encoding's very end
                        if (totalEncodedTime >= totalDuration) { return resolve(chunkList); }
                    });

                    // incr.
                    chunkList.push({ name: chunkPath, start: chunkStartTime, duration: chunkDuration, overlapStart: startOffset, overlapEnd: endOffset });
                    chunkIndex += 1;
                    chunkStartTime += this.chunkDuration;
                }
            });
        });
    }

    /** 
    * get chunk out of audio file (extract part of an audio buffer), 
    * starting at offset sec, of duration chunkDuration sec. Handles loop
    * (i.e. if offset >= buffer duration)
    **/
    getChunk(metaBuffer, chunkStart, chunkEnd) {
        // get head / tail buffers (unchanged)
        let headBuffer = metaBuffer.buffer.slice(0, metaBuffer.dataStart); // all until 'data' included
        let tailBuffer = metaBuffer.buffer.slice(metaBuffer.dataStart + metaBuffer.dataLength, metaBuffer.buffer.length); // all after data values

        if (chunkEnd <= metaBuffer.dataStart + metaBuffer.dataLength) {
            var dataBuffer = metaBuffer.buffer.slice(chunkStart, chunkEnd);
        }
        else {
            throw new RangeError('Fetched index greater than data end index:' + chunkEnd + ', ' + (metaBuffer.dataStart + metaBuffer.dataLength))
        }
        
        // update data length descriptor in head buffer
        headBuffer.writeUIntLE(dataBuffer.length, headBuffer.length - BYTE_LENGTH, BYTE_LENGTH);

        // concatenate head / data / tail buffers
        let outputBuffer = Buffer.concat([headBuffer, dataBuffer, tailBuffer], headBuffer.length + tailBuffer.length + dataBuffer.length);

        return outputBuffer;
    }

}


class Reader {
    constructor() {
        this.wavFormatReader = new WavFormatReader();
    }

    async loadBuffer(filePath) {
        return fs.readFileSync(filePath);
    }

    interpretHeaders(buffer) {
        let wavInfo = this.wavFormatReader.getWavInfos(buffer);
        let metaBuffer = {
            buffer: buffer,
            dataStart: wavInfo.descriptors.get('data').start,
            dataLength: wavInfo.descriptors.get('data').length,
            numberOfChannels: wavInfo.format.numberOfChannels,
            sampleRate: wavInfo.format.sampleRate,
            secToByteFactor: wavInfo.format.secToByteFactor,
            bitPerSample: wavInfo.format.bitPerSample,
        };
        // resolve
        return metaBuffer;
    }
}


