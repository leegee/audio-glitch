const expect = require('chai').expect;
const MIDIslicer = require('./MIDIslicer.mjs');

describe('MIDIslicer', () => {
    it('loads', () => {
        expect(MIDIslicer).not.to.be.undefined;
    });
});