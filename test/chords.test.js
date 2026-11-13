// Chord diagrams: every shape for every root and chord type is checked note by note against the chord.
const assert = require('assert');
const C = require('../src/core.js');
const ROOTS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SUFFIX = { maj: '', m: 'm', 7: '7', m7: 'm7', maj7: 'maj7', sus2: 'sus2', sus4: 'sus4', '7sus4': '7sus4', 6: '6', m6: 'm6',
  9: '9', add9: 'add9', dim: 'dim', dim7: 'dim7', m7b5: 'm7b5', aug: 'aug', 5: '5' };
let n = 0;
function ok(cond, msg) { n++; assert.ok(cond, msg); }

ROOTS.forEach(function (root) {
  const r = C.noteIndex(root.charAt(0), root.slice(1));
  Object.keys(SUFFIX).forEach(function (fam) {
    const name = root + SUFFIX[fam];
    const s = C.chordShape(name);
    ok(s, 'shape exists: ' + name);
    ok(!s.approx, 'not approximate: ' + name);
    const want = C.INTERVALS[fam].map(function (i) { return (r + i) % 12; });
    const got = C.shapeNotes(s.frets);
    got.forEach(function (x) { ok(want.indexOf(x) >= 0, name + ' plays a note outside the chord: ' + x + ' in ' + s.frets.join(',')); });
    // root and the defining note (third, or the suspended or fifth note) must sound
    ok(got.indexOf(r) >= 0, name + ' has its root');
    ok(got.indexOf(want[1]) >= 0, name + ' has its second chord note');
    const played = s.frets.filter(function (x) { return x != null; });
    ok(played.length >= 2, name + ' plays at least two strings');
    const fretted = played.filter(function (x) { return x > 0; });
    if (fretted.length) ok(Math.max.apply(null, fretted) - Math.min.apply(null, fretted) <= 4, name + ' fits the hand: ' + s.frets.join(','));
  });
});

// spelling: never H
ok(C.chordShape('H') === null, 'H is not a chord');
// simplified chords are marked
ok(C.chordShape('Cmaj9').approx === true, 'maj9 is simplified');
ok(C.chordShape('G13').approx === true, '13 is simplified');
// common open shapes
assert.deepStrictEqual(C.chordShape('G').frets, [3, 2, 0, 0, 0, 3]); n++;
assert.deepStrictEqual(C.chordShape('Am').frets, [null, 0, 2, 2, 1, 0]); n++;
// capo: key A with capo 2 gives G shapes
const capo2 = C.capoOptions('A').filter(function (o) { return o.capo === 2; })[0];
ok(capo2.shapeKey === 'G' && capo2.easy, 'capo 2 in A gives easy G shapes');

console.log('chord tests passed: ' + n);
