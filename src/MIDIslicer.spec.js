const fs = require('fs');
const tmp = require('tmp');
const expect = require('chai').expect;

const MIDIslicer = require('./');

describe('MIDIslicer', () => {
    it('loads', () => {
        expect(MIDIslicer).not.to.be.undefined;
    });

    ['bpm', 'wav', 'midi'].forEach(key => {
        it('requires arg ' + key, () => {
            expect(() => {
                new MIDIslicer()
            }).to.throw(new RegExp(key, 'g'));
        });
    });

    it('with MIDI beats array, creates a wav at a specified location', async () => {
        const tmpFileName = tmp.tmpNameSync();
        expect(fs.existsSync(tmpFileName), 'temp file name').to.be.false;

        const ms = new MIDIslicer({
            bpm: 80,
            wav: ['eg/0.wav', 'eg/1.wav'],
            midi: new Array(5).fill(0.125),
            output: tmpFileName
        });
        const outputPath = await ms.slice();
        expect(fs.existsSync(outputPath)).to.be.true;
    });

    it('with MIDI file, creates a wav at a specified location', async () => {
        const tmpFileName = tmp.tmpNameSync();
        expect(fs.existsSync(tmpFileName), 'temp file name').to.be.false;

        const ms = new MIDIslicer({
            bpm: 80,
            wav: ['eg/0.wav', 'eg/1.wav'],
            midi: 'eg/test.mid',
            output: tmpFileName
        });
        const outputPath = await ms.slice();
        expect(fs.existsSync(outputPath)).to.be.true;
    });

    it('with MIDI beats array, creates a wav at an auto location', async () => {
        const ms = new MIDIslicer({
            bpm: 80,
            wav: ['eg/0.wav', 'eg/1.wav'],
            midi: new Array(5).fill(0.125)
        });
        const outputPath = await ms.slice();
        expect(outputPath).to.equal('glitch.wav');
        expect(fs.existsSync(outputPath)).to.be.true;
        fs.unlinkSync(outputPath);
    });

    it('with MIDI file, creates a wav at an auto location', async () => {
        const ms = new MIDIslicer({
            bpm: 80,
            wav: ['eg/0.wav', 'eg/1.wav'],
            midi: 'eg/test.mid'
        });
        const outputPath = await ms.slice();
        expect(outputPath).to.equal('eg/test.mid_glitch.wav');
        expect(fs.existsSync(outputPath)).to.be.true;
        fs.unlinkSync(outputPath);
    });

    it('generates chunks', async () => {
        const n = 5, v = 1;
        const tmpFileName = tmp.tmpNameSync();
        const ms = new MIDIslicer({
            bpm: 80,
            wav: ['eg/0.wav', 'eg/1.wav'],
            midi: new Array(n).fill(v),
            output: tmpFileName
        });
        expect(ms.totalMidiDurationInSeconds).to.equal(n * v);
        expect(ms.totalSeconds).to.equal(4.363645833333333);
    });

});
