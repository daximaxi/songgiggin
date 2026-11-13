const assert = require('assert');
const C = require('../src/core.js');
let n = 0;
function eq(a, b, msg) { n++; assert.deepStrictEqual(a, b, msg); }

// chord parsing
eq(!!C.parseChord('Am'), true);
eq(!!C.parseChord('F#m7b5'), true);
eq(!!C.parseChord('Bbmaj7'), true);
eq(!!C.parseChord('D/F#'), true);
eq(!!C.parseChord('G6/9'), true);
eq(!!C.parseChord('Gadd9'), true);
eq(!!C.parseChord('E7sus4'), true);
eq(C.parseChord('Verse'), null);
eq(C.parseChord('Chorus'), null);
eq(C.parseChord('Bad'), null);
eq(C.parseChord('H'), null);
eq(C.parseChord('Go'), null);
eq(C.parseChord(''), null);

// transposing: B stays B, the flat is Bb, never H
eq(C.transposeChord('Am', 2, false), 'Bm');
eq(C.transposeChord('A', 1, true), 'Bb');
eq(C.transposeChord('A', 1, false), 'A#');
eq(C.transposeChord('Bb', 1, true), 'B');
eq(C.transposeChord('A', 2, true), 'B');
eq(C.transposeChord('F#m7/C#', 1, false), 'Gm7/D');
eq(C.transposeChord('C', -1, true), 'B');
eq(C.transposeChord('G6/9', 2, false), 'A6/9');
eq(C.transposeChord('Dsus4', 5, false), 'Gsus4');
eq(C.transposeChord('Ebmaj7', -3, false), 'Cmaj7');
eq(C.transposeChord('N.C.', 2, false), 'N.C.');
eq(C.transposeBracket('Am G', 2, false), 'Bm A');
// full circle
['C', 'F#m', 'Bb7', 'D/F#', 'Abmaj7'].forEach(function (c) {
  eq(C.transposeChord(C.transposeChord(c, 7, true), 5, /b/.test(c.slice(1, 2))), c);
});

// keys
eq(C.transposeKey('G', 2), 'A');
eq(C.transposeKey('G', 0), 'G');
eq(C.transposeKey('A', 1), 'Bb');
eq(C.transposeKey('Em', 1), 'Fm');
eq(C.transposeKey('Am', 1), 'Bbm');
eq(C.transposeKey('E', -1), 'Eb');
eq(C.transposeKey('', 2), '');
eq(C.normalizeKey('em'), 'Em');
eq(C.normalizeKey('bb'), 'Bb');
eq(C.normalizeKey('H'), '');
eq(C.normalizeKey('f# minor'), 'F#m');

// spelling
eq(C.resolveSpelling('G', '', 0, 'auto'), { keep: true, flat: false });
eq(C.resolveSpelling('G', '', 3, 'auto'), { keep: false, flat: true });   // Bb
eq(C.resolveSpelling('G', '', 2, 'auto'), { keep: false, flat: false });  // A
eq(C.resolveSpelling('', '[Bb]x [Eb]y [F]z', 2, 'auto'), { keep: false, flat: true });
eq(C.resolveSpelling('G', '', 2, 'flat'), { keep: false, flat: true });

// line parsing keeps chords on the exact character
eq(C.parseLine('A[G]mazing grace, how [C]sweet'), [
  { chord: null, text: 'A' }, { chord: 'G', text: 'mazing grace, how ' }, { chord: 'C', text: 'sweet' }
]);
eq(C.parseLine('[Am] [F] [C]'), [
  { chord: 'Am', text: ' ' }, { chord: 'F', text: ' ' }, { chord: 'C', text: '' }
]);
eq(C.parseLine('no chords'), [{ chord: null, text: 'no chords' }]);

// grouping: a word split by a chord stays in one group
const g = C.toGroups(C.parseLine('A[G]mazing grace'));
eq(g.length, 2);
eq(g[0].map(u => u.text).join(''), 'Amazing ');
eq(g[0][1].chord, 'G');
eq(g[1][0].text, 'grace');

// song parsing
const song = C.parseSong([
  '{title: Test}', '{key: G}', '[Verse 1]', '[G]Hello [D]world', '', 'Chorus:',
  '{soc}', '[C]La la', '{eoc}', '{sot}', 'e|--0--1--|', 'B|--1--1--|', '{eot}',
  'e|-------0-----|', 'B|-----1---1---|', 'after', '[Am G]', '{comment: Play soft}'
].join('\n'));
eq(song.meta, { title: 'Test', key: 'G' });
eq(song.blocks.map(b => b.type), ['section', 'line', 'empty', 'section', 'line', 'tab', 'tab', 'line', 'line', 'comment']);
eq(song.blocks[0].text, 'Verse 1');
eq(song.blocks[3].text, 'Chorus');
eq(song.blocks[4].chorus, true);
eq(song.blocks[5].lines.length, 2);
eq(song.blocks[6].lines.length, 2);
eq(song.blocks[8].segs[0].chord, 'Am G');

// tab detection
eq(C.isTabLine('e|-------0-----|'), true);
eq(C.isTabLine('B|-----1h3-1---|'), true);
eq(C.isTabLine('Hello - there - friend'), false);
eq(C.isTabLine('[G]Hello'), false);

// chords over lyrics
eq(C.isChordLine('G        C     G'), true);
eq(C.isChordLine('Am I the one'), false);
eq(C.isChordLine('[G]Hello'), false);
eq(C.isChordLine('| Am | F | C | G |'), true);
eq(C.mergeChordLyric(' G                 C     G', 'Amazing grace, how sweet the sound'),
  'A[G]mazing grace, how [C]sweet [G]the sound');
eq(C.mergeChordLyric('G        D', 'Hi'), '[G]Hi       [D]');
const conv = C.convertChordsOverLyrics([
  '[Verse]', 'G        C', 'Hello my friend', '', 'Am  F  C  G', '', 'D', 'Last line', 'plain lyric'
].join('\n'));
eq(conv.split('\n'), ['[Verse]', '[G]Hello my [C]friend', '', '[Am] [F] [C] [G]', '', '[D]Last line', 'plain lyric']);
// converting twice changes nothing
eq(C.convertChordsOverLyrics(conv), conv);
eq(C.looksLikeChordsOverLyrics('G  C\nHello'), true);
eq(C.looksLikeChordsOverLyrics('[G]Hello [C]there'), false);
eq(C.looksLikeChordsOverLyrics('Just some words\nand more'), false);


// import: Ultimate Guitar style page text (invented lyrics)
let im = C.importText([
  'Northern Road Chords by The Test Band', 'Difficulty: novice', 'Tuning: E A D G B E', 'Key: G', 'Capo: 2', '',
  '[Intro]', 'G  D  Em  C', '', '[Verse 1]',
  'G                D', 'Walking down the northern road', 'Em              C', 'Thinking of the way back home', '', '',
  '[Chorus]', 'C    G', 'Oh la la', 'e|-----0-----|', 'B|---1---1---|'
].join('\n'));
eq(im.title, 'Northern Road');
eq(im.artist, 'The Test Band');
eq(im.key, 'G'); eq(im.keyGuessed, false);
eq(im.body.split('\n').slice(0, 9), ['{capo: 2}', '[Intro]', '[G] [D] [Em] [C]', '', '[Verse 1]',
  '[G]Walking down the [D]northern road', '[Em]Thinking of the [C]way back home', '', '[Chorus]']);
eq(C.parseSong(im.body).blocks.filter(b => b.type === 'tab').length, 1);

// UG raw markup with [ch] and [tab], title - artist, key guessed from chords
im = C.importText('Lítið lag - Hljómsveitin\n\n[Verse]\n[tab][ch]Am[/ch]      [ch]F[/ch]\nHér er texti[/tab]\n[tab][ch]C[/ch]   [ch]Am[/ch]\nog meira[/tab]\n');
eq(im.title, 'Lítið lag'); eq(im.artist, 'Hljómsveitin');
eq(im.key, 'Am'); eq(im.keyGuessed, true);
eq(im.body, '[Verse]\n[Am]Hér er t[F]exti\n[C]og m[Am]eira\n');

// two header lines: title then artist, nbsp, BPM line
im = C.importText('Sumarkvöld\neftir Jón\nBPM: 96\n\nD    A\nla la la\n');
eq([im.title, im.artist, im.bpm, im.key], ['Sumarkvöld', 'Jón', 96, 'D']);
eq(im.body, '[D]la la[A] la\n');

// already ChordPro: kept as is, meta read from directives
im = C.importText('{title: Test}\n{artist: Me}\n{key: Bb}\n[Bb]Hello [F]there\n');
eq([im.title, im.artist, im.key], ['Test', 'Me', 'Bb']);
eq(im.body, '[Bb]Hello [F]there\n');

// long lyric block without chords is not mistaken for a title
im = C.importText('one line\ntwo line\nthree line\nfour line\n\nG C\nfive line\n');
eq(im.title, '');
eq(im.body.split('\n')[0], 'one line');

// Icelandic collation used by the app for A to Ö sorting
const coll = new Intl.Collator('is');
eq(['Öl', 'Þula', 'Bára', 'Ás', 'Ari', 'Æska', 'Zeta', 'Ýsa', 'Yfir'].sort(coll.compare),
  ['Ari', 'Ás', 'Bára', 'Yfir', 'Ýsa', 'Zeta', 'Þula', 'Æska', 'Öl']);


// Ultimate Guitar page copied whole: page furniture is dropped, glued meta is split
im = C.importText([
  'Test Song Chords by Some Band', '1,234,567 views12,345 saves99 comments', 'Author: UnregisteredDifficulty: Beginner',
  'Speed: 0.2', 'Transpose', 'Official version created by professional UG guitarists', 'Tuning: E A D G B EKey: GCapo: No capo', '',
  'G    3-5-5-4-3-3', 'B    7-9-9-8-7-7', '', '[Intro]', 'G B C Cm', '', '[Chorus] (play loud)', 'G     B', 'Hey you there'
].join('\n'));
eq([im.title, im.artist, im.key, im.keyGuessed], ['Test Song', 'Some Band', 'G', false]);
eq(im.body.split('\n').slice(0, 10), ['{start_of_tab}', 'G   3-5-5-4-3-3', 'B   7-9-9-8-7-7', '{end_of_tab}', '[Intro]', '[G] [B] [C] [Cm]', '', '[Chorus] (play loud)', '[G]Hey yo[B]u there', '']);
eq(C.parseSong(im.body).blocks[0].lines, ['G   3-5-5-4-3-3', 'B   7-9-9-8-7-7']);
eq(C.parseSong(im.body).blocks[4], { type: 'section', text: 'Chorus (play loud)', chorus: false });

// Guitarparty style header: title line, then a credits line
im = C.importText('Lagið mitt\n   Höfundur lags: Jón Jónsson, Höfundur texta: Gunna, Flytjandi: Bandið góða,\n[A] [D]\nHér er [A]lína\n');
eq([im.title, im.artist, im.key], ['Lagið mitt', 'Bandið góða', 'A']);
eq(im.body, '[A] [D]\nHér er [A]lína\n');
im = C.importText('Annað lag\nHöfundur lags: Jón Jónsson, Höfundur texta: Gunna\n[E]Hæ\n');
eq([im.title, im.artist], ['Annað lag', 'Jón Jónsson']);
im = C.importText('Key: F#m\nCapo: 3\n\n[F#m]Hæ\n');
eq([im.key, im.body], ['F#m', '{capo: 3}\n[F#m]Hæ\n']);


// a capo note in the header is kept as a comment and is not taken as the artist
im = C.importText('Lagið mitt\nHöfundur lags: Jón, Flytjandi: Bandið\nCapó á 2. bandi fyrir upprunalega tóntegund\n[A]Hæ [D]hó\n');
eq([im.title, im.artist], ['Lagið mitt', 'Bandið']);
eq(im.body, '{comment: Capó á 2. bandi fyrir upprunalega tóntegund}\n[A]Hæ [D]hó\n');
eq(C.parseSong(im.body).blocks[0], { type: 'comment', text: 'Capó á 2. bandi fyrir upprunalega tóntegund', chorus: false });
im = C.importText('Song\nBand\nCapo on 3rd fret\n[C]Hi\n');
eq([im.title, im.artist, im.body], ['Song', 'Band', '{comment: Capo on 3rd fret}\n[C]Hi\n']);
im = C.importText('Capoeira\nDancer\n[C]Hi\n');
eq([im.title, im.artist], ['Capoeira', 'Dancer']);


// Blog page with lyrics only: title, byline with date, title again, credit line in parentheses
im = C.importText(['Lagið um kisu', 'Jón J / 03/07/2024', 'Lagið um kisu', '(Lag og texti: Anna Jónsdóttir)',
  'Kisa mín er grá', 'og hún sefur hjá mér.', 'Hún vaknar á nóttunni', 'og vill fá mat.'].join('\n'));
eq([im.title, im.artist, im.key], ['Lagið um kisu', 'Anna Jónsdóttir', '']);
eq(im.body, 'Kisa mín er grá\nog hún sefur hjá mér.\nHún vaknar á nóttunni\nog vill fá mat.\n');

// Genius page: page furniture around the song and between verses
im = C.importText(['Rainy Street', 'The Puddles', 'Producers', 'Max & Sam', 'Track 3 on', 'Wet Album', 'Oct. 28, 2002',
  '19 viewers', '2.2M views', '87 Contributors', 'Translations', 'Rainy Street Lyrics',
  'This song is about rain and a street in a small town where… Read More ', '[Intro]', 'Drip drop', '', '[Verse 1]',
  'Walking in the rain again', 'You might also like', 'Other Song', 'Other Artist', 'Third Song', 'Someone',
  '[Verse 2]', 'Umbrella open wide', '[Outro]', 'Bye now', '12Embed'].join('\n'));
eq([im.title, im.artist, im.key], ['Rainy Street', 'The Puddles', '']);
eq(im.body, '[Intro]\nDrip drop\n\n[Verse 1]\nWalking in the rain again\n[Verse 2]\nUmbrella open wide\n[Outro]\nBye now\n');

// Lyrics without chords: a short block over a blank line is the header
im = C.importText('Vetrarlag\nHljómsveitin\n\nSnjórinn fellur\nog fellur enn\n');
eq([im.title, im.artist, im.body], ['Vetrarlag', 'Hljómsveitin', 'Snjórinn fellur\nog fellur enn\n']);
// ... but plain lyrics with no header keep every line
im = C.importText('Snjórinn fellur\nog fellur enn\nkaldur og hvítur\nyfir bæinn\n');
eq([im.title, im.body], ['', 'Snjórinn fellur\nog fellur enn\nkaldur og hvítur\nyfir bæinn\n']);
// English credit forms
im = C.importText('Morning Song\nWords and music by Kim Lee\n[G]Good [C]morning\n');
eq([im.title, im.artist], ['Morning Song', 'Kim Lee']);
im = C.importText('Kvöldlag\nTexti: Gunna\n[D]Góða [A]nótt\n');
eq([im.title, im.artist], ['Kvöldlag', 'Gunna']);


// ---- files: export, round trip, merge ----
const lib = {
  songs: {
    s1: { id: 's1', title: 'Eitt', artist: 'A', key: 'G', bpm: 100, body: '[G]Hæ\n', tags: ['t1', 't2'], updatedAt: 100, createdAt: 50 },
    s2: { id: 's2', title: 'Tvö', body: 'x\n', tags: [], updatedAt: 200 },
    s3: { id: 's3', title: 'Gone', body: '', deleted: true, updatedAt: 300 },
    ex: { id: 'ex', title: 'Dæmi', body: '', example: true, updatedAt: 0 }
  },
  setlists: { l1: { id: 'l1', name: 'Gigg', items: [{ uid: 'i1', songId: 's1', tr: 2 }], updatedAt: 150, createdAt: 140 } },
  tags: { t1: { id: 't1', name: 'Hresst', order: 0 }, t2: { id: 't2', name: '80s', order: 1 }, t3: { id: 't3', name: 'Ónotað', order: 2 } }
};
let bun = C.exportBundle(lib, 'library');
eq([bun.format, bun.songs.map(x => x.id), bun.setlists.length, bun.tags.length], ['giggari', ['s1', 's2'], 1, 3]);
bun = C.exportBundle(lib, 'setlist', 'l1');
eq([bun.songs.map(x => x.id), bun.tags.map(x => x.name)], [['s1'], ['Hresst', '80s']]);
const parsed = C.parseBundle(JSON.stringify(bun));
eq(parsed.songs[0].title, 'Eitt');
eq(C.parseBundle('not json'), null);
eq(C.parseBundle('{"format":"other","songs":[]}'), null);

// merge into a bandmate's library: one tag matches by name in a different case, one is new
const mate = {
  songs: { s1: { id: 's1', title: 'Eitt old', body: '', updatedAt: 90 }, s2: { id: 's2', title: 'Tvö', body: 'x\n', updatedAt: 999 } },
  setlists: {},
  tags: { m1: { id: 'm1', name: 'hresst', order: 0 }, t2: { id: 't2', name: 'Something else', order: 5 } }
};
const plan = C.planMerge(mate, C.parseBundle(JSON.stringify(C.exportBundle(lib, 'library'))), 1000);
eq(plan.tagMap.t1, 'm1');
eq(plan.tags.map(x => [x.name, x.id === 't2' ? 'clash' : 'ok', x.order]), [['80s', 'ok', 6], ['Ónotað', 'ok', 7]]);
eq(plan.songs.update.map(x => x.id), ['s1']);
eq(plan.songs.update[0].tags, ['m1', plan.tagMap.t2]);
eq([plan.songs.add.length, plan.songs.keep, plan.songs.same], [0, 1, 0]);
eq(plan.setlists.add.map(x => x.id), ['l1']);
// importing the same file again changes nothing
const mine = C.planMerge(lib, C.parseBundle(JSON.stringify(C.exportBundle(lib, 'library'))), 1000);
eq([mine.tags.length, mine.songs.add.length, mine.songs.update.length, mine.songs.same, mine.setlists.same], [0, 0, 0, 2, 1]);
// a song deleted here comes back, newer than the deletion
const del = C.planMerge({ songs: { s9: { id: 's9', deleted: true, updatedAt: 500 } }, setlists: {}, tags: {} },
  { songs: [{ id: 's9', title: 'Back', body: '', updatedAt: 100 }], setlists: [], tags: [] }, 1000);
eq([del.songs.add.length, del.songs.add[0].updatedAt], [1, 501]);

// ChordPro text file round trip
const cp = C.songToChordPro(lib.songs.s1);
eq(cp, '{title: Eitt}\n{artist: A}\n{key: G}\n{tempo: 100}\n\n[G]Hæ\n');
const back = C.importText(cp);
eq([back.title, back.artist, back.key, back.bpm, back.body], ['Eitt', 'A', 'G', 100, '[G]Hæ\n']);

// files from before the rename (Songgiggin) still import
eq(!!C.parseBundle(JSON.stringify({ format: 'songgiggin', version: 1, songs: [], setlists: [], tags: [] })), true);
eq(C.parseBundle(JSON.stringify({ format: 'other', version: 1, songs: [] })), null);
console.log('core tests passed:', n);
