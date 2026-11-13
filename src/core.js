/* Songgiggin core: ChordPro parsing, chords-over-lyrics conversion, transposing.
   Pure functions, no DOM. Runs in the browser (window.Core) and in Node (tests). */
(function (root) {
  'use strict';

  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  // Conventional key spellings. B is always B and the flat is Bb (never H).
  var MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
  var FLAT_MAJOR = { 5: 1, 10: 1, 3: 1, 8: 1, 1: 1 };
  var FLAT_MINOR = { 2: 1, 7: 1, 0: 1, 5: 1, 10: 1, 3: 1 };

  var QUAL_RE = /^(?:maj|min|dim|aug|sus|add|omit|alt|no|M|m|\+|-|°|º|ø|Δ|[0-9]|#|b|♯|♭|\(|\)|,|\/)*$/;

  function mod12(n) { return ((n % 12) + 12) % 12; }

  function noteIndex(letter, acc) {
    var i = NOTE[letter];
    if (acc === '#' || acc === '♯') i += 1;
    if (acc === 'b' || acc === '♭') i -= 1;
    return mod12(i);
  }

  /** "F#m7/C#" -> {root:'F', acc:'#', qual:'m7', bass:'C', bassAcc:'#'}; null when not a chord. */
  function parseChord(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    var m = /^([A-G])([#b♯♭]?)(.*)$/.exec(s);
    if (!m) return null;
    var rest = m[3], bass = null, bassAcc = '';
    var bm = /\/([A-G])([#b♯♭]?)$/.exec(rest);
    if (bm) { bass = bm[1]; bassAcc = bm[2]; rest = rest.slice(0, bm.index); }
    if (!QUAL_RE.test(rest)) return null;
    return { root: m[1], acc: m[2], qual: rest, bass: bass, bassAcc: bassAcc };
  }

  function transposeChord(s, n, flat) {
    var c = parseChord(s);
    if (!c) return s;
    var tbl = flat ? FLAT : SHARP;
    var out = tbl[mod12(noteIndex(c.root, c.acc) + n)] + c.qual;
    if (c.bass) out += '/' + tbl[mod12(noteIndex(c.bass, c.bassAcc) + n)];
    return out;
  }

  /** Transpose the content of one [bracket]. Tokens that are not chords are left alone. */
  function transposeBracket(content, n, flat) {
    return String(content).split(/(\s+)/).map(function (tok) {
      return !tok || /^\s+$/.test(tok) ? tok : transposeChord(tok, n, flat);
    }).join('');
  }

  function isChordish(content) {
    var toks = String(content).trim().split(/\s+/).filter(Boolean);
    return toks.length > 0 && toks.every(function (t) { return !!parseChord(t); });
  }

  function parseKey(s) {
    var m = /^\s*([A-Ga-g])([#b♯♭]?)\s*(m|min|minor|maj|major)?\s*$/.exec(String(s == null ? '' : s));
    if (!m) return null;
    var minor = !!m[3] && /^m(in|inor)?$/.test(m[3]);
    return { idx: noteIndex(m[1].toUpperCase(), m[2]), minor: minor };
  }

  function keyName(idx, minor) { return (minor ? MINOR_KEYS : MAJOR_KEYS)[mod12(idx)]; }

  function normalizeKey(s) {
    var k = parseKey(s);
    if (!k) return '';
    // Keep the writer's own spelling of the root, only tidy the casing.
    var m = /^\s*([A-Ga-g])([#b♯♭]?)/.exec(s);
    var acc = m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2];
    return m[1].toUpperCase() + acc + (k.minor ? 'm' : '');
  }

  function transposeKey(key, n) {
    var k = parseKey(key);
    if (!k) return '';
    if (mod12(n) === 0) return normalizeKey(key);
    return keyName(k.idx + n, k.minor);
  }

  function prefersFlats(idx, minor) { return !!(minor ? FLAT_MINOR : FLAT_MAJOR)[mod12(idx)]; }

  function chordsIn(body) {
    var out = [], re = /\[([^\[\]\n]*)\]/g, m;
    while ((m = re.exec(String(body || '')))) {
      m[1].trim().split(/\s+/).forEach(function (t) { if (parseChord(t)) out.push(t); });
    }
    return out;
  }

  /** Decide how to spell transposed chords. pref: 'auto' | 'sharp' | 'flat'. */
  function resolveSpelling(key, body, n, pref) {
    if (pref === 'sharp') return { keep: false, flat: false };
    if (pref === 'flat') return { keep: false, flat: true };
    if (mod12(n) === 0) return { keep: true, flat: false };
    var k = parseKey(key);
    if (k) return { keep: false, flat: prefersFlats(k.idx + n, k.minor) };
    var flats = 0, sharps = 0;
    chordsIn(body).forEach(function (c) {
      if (/^[A-G]b/.test(c)) flats++;
      if (/^[A-G]#/.test(c)) sharps++;
    });
    return { keep: false, flat: flats > sharps };
  }

  // ---------- ChordPro parsing ----------

  var SECTION_RE = /^\s*\[([^\[\]]+)\]\s*(\([^()]*\))?\s*$/;

  function parseDirective(line) {
    var m = /^\s*\{\s*([^:{}]+?)\s*(?::\s*(.*?))?\s*\}\s*$/.exec(line);
    return m ? { name: m[1].toLowerCase().replace(/\s+/g, '_'), value: m[2] || '' } : null;
  }

  function isTabLine(line) {
    var m = /^\s*(?:[A-Ga-g][#b]?)?\s*([|:\-].*)$/.exec(line);
    if (!m) return false;
    var rest = m[1];
    if (!/^[\-\d|:hpbrsxtvHPBRSXTV\/\\~^().*<>=\s]+$/.test(rest)) return false;
    return (rest.match(/-/g) || []).length >= 6;
  }

  function parseLine(raw) {
    var segs = [], re = /\[([^\[\]\n]*)\]/g, last = 0, m, cur = null;
    while ((m = re.exec(raw))) {
      var before = raw.slice(last, m.index);
      if (cur) { cur.text = before; segs.push(cur); cur = null; }
      else if (before) segs.push({ chord: null, text: before });
      var name = m[1].trim();
      cur = { chord: name || null, text: '' };
      last = re.lastIndex;
    }
    var rest = raw.slice(last);
    if (cur) { cur.text = rest; segs.push(cur); }
    else segs.push({ chord: null, text: rest });
    return segs;
  }

  /** Body text -> { meta, blocks }. Block types: line, empty, section, comment, tab. */
  function parseSong(body) {
    var meta = {}, blocks = [], inTab = false, tabBuf = null, chorus = false;
    var lines = String(body || '').replace(/\r\n?/g, '\n').split('\n');
    function flushTab() {
      if (tabBuf && tabBuf.length) blocks.push({ type: 'tab', lines: tabBuf, chorus: chorus });
      tabBuf = null;
    }
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var d = parseDirective(raw);
      if (d) {
        var n = d.name, v = d.value;
        if (n === 'sot' || n === 'start_of_tab') { flushTab(); if (v) blocks.push({ type: 'section', text: v, chorus: chorus }); inTab = true; tabBuf = []; continue; }
        if (n === 'eot' || n === 'end_of_tab') { inTab = false; flushTab(); continue; }
        flushTab();
        if (n === 'title' || n === 't') meta.title = v;
        else if (n === 'artist' || n === 'subtitle' || n === 'st') { if (!meta.artist) meta.artist = v; }
        else if (n === 'key') meta.key = v;
        else if (n === 'tempo' || n === 'bpm') meta.bpm = v;
        else if (n === 'capo') { meta.capo = v; blocks.push({ type: 'comment', text: 'Capo ' + v, chorus: chorus }); }
        else if (n === 'comment' || n === 'c' || n === 'ci' || n === 'cb' || n === 'comment_italic' || n === 'comment_box' || n === 'highlight') blocks.push({ type: 'comment', text: v, chorus: chorus });
        else if (n === 'soc' || n === 'start_of_chorus') { chorus = true; if (v) blocks.push({ type: 'section', text: v, chorus: true }); }
        else if (n === 'eoc' || n === 'end_of_chorus') chorus = false;
        else if (/^(sov|sob|start_of_verse|start_of_bridge|start_of_part)$/.test(n)) { if (v) blocks.push({ type: 'section', text: v, chorus: chorus }); }
        continue;
      }
      if (inTab) { tabBuf.push(raw); continue; }
      if (isTabLine(raw)) { (tabBuf || (tabBuf = [])).push(raw); continue; }
      flushTab();
      if (!raw.trim()) { blocks.push({ type: 'empty', chorus: chorus }); continue; }
      var sm = SECTION_RE.exec(raw);
      if (sm && !/^\*/.test(sm[1]) && !/^N\.?C\.?$/i.test(sm[1].trim()) && !isChordish(sm[1])) {
        blocks.push({ type: 'section', text: sm[1].trim() + (sm[2] ? ' ' + sm[2] : ''), chorus: chorus });
        continue;
      }
      var lm = /^\s*([^\[\]{}:]{1,40}):\s*$/.exec(raw);
      if (lm && lm[1].trim().split(/\s+/).length <= 3) {
        blocks.push({ type: 'section', text: lm[1].trim(), chorus: chorus });
        continue;
      }
      blocks.push({ type: 'line', segs: parseLine(raw), chorus: chorus });
    }
    flushTab();
    return { meta: meta, blocks: blocks };
  }

  /** Split a parsed line into word sized units, grouped so a word never breaks across lines.
      A chord stays attached to the exact character it was written in front of. */
  function toGroups(segs) {
    var units = [];
    segs.forEach(function (s) {
      var pieces = s.text.match(/^\s+|\S+\s*/g) || [''];
      pieces.forEach(function (p, i) { units.push({ chord: i === 0 ? s.chord : null, text: p }); });
    });
    var groups = [], cur = null;
    units.forEach(function (u) {
      var prev = cur && cur[cur.length - 1];
      var joined = prev && prev.text !== '' && !/\s$/.test(prev.text) && u.text !== '' && !/^\s/.test(u.text);
      if (joined) cur.push(u);
      else { cur = [u]; groups.push(cur); }
    });
    return groups;
  }

  // ---------- chords-over-lyrics -> ChordPro ----------

  function expandTabs(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '\t') out += new Array(8 - (out.length % 8) + 1).join(' ');
      else out += s[i];
    }
    return out;
  }

  function isChordLine(line) {
    if (/[\[\]{}]/.test(line)) return false;
    var toks = line.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return false;
    var chords = 0;
    for (var i = 0; i < toks.length; i++) {
      var c = toks[i].replace(/^[(|]+/, '').replace(/[)|,]+$/, '');
      if (c === '') continue;
      if (parseChord(c)) chords++;
      else if (/^(x\d+|\d+x|N\.?C\.?|-|\/|%|\*+)$/i.test(c)) continue;
      else return false;
    }
    return chords > 0;
  }

  function mergeChordLyric(ch, ly) {
    ch = expandTabs(ch);
    ly = expandTabs(ly).replace(/\s+$/, '');
    var toks = [], re = /\S+/g, m;
    while ((m = re.exec(ch))) toks.push({ t: m[0], i: m.index });
    var s = ly;
    var maxI = toks.length ? toks[toks.length - 1].i : 0;
    while (s.length < maxI) s += ' ';
    for (var k = toks.length - 1; k >= 0; k--) {
      s = s.slice(0, toks[k].i) + '[' + toks[k].t + ']' + s.slice(toks[k].i);
    }
    return s;
  }

  function convertChordsOverLyrics(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (isChordLine(L) && !isTabLine(L)) {
        var next = lines[i + 1];
        var nextIsLyric = next !== undefined && next.trim() !== '' && !isChordLine(next) &&
          !isTabLine(next) && !parseDirective(next) && !/^\s*\[[^\]]*\]\s*$/.test(next);
        if (nextIsLyric) { out.push(mergeChordLyric(L, next)); i++; }
        else out.push(L.trim().split(/\s+/).map(function (t) { return '[' + t + ']'; }).join(' '));
      } else out.push(L);
    }
    return out.join('\n');
  }

  function looksLikeChordsOverLyrics(text) {
    var lines = String(text || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (isChordLine(lines[i]) && !isTabLine(lines[i])) return true;
    }
    return false;
  }

  // ---------- import pasted text from a web page ----------

  var META_START = /^\s*\(?\s*(ljóð|key|tóntegund|tónteg\.?|capo|tuning|stilling|tempo|bpm|artist|flytjandi|title|titill|höfundur lags|höfundur texta|lag og texti|lag|texti|music|lyrics|words)\s*[:：]/i;
  // Page furniture that comes along when a whole page is copied (Ultimate Guitar and similar).
  var JUNK_RE = /^\s*(?:[\d.,]+\s*views\b.*|transpose|autoscroll|auto scroll|speed:.*|official version\b.*|author:.*|difficulty:.*|erfiðleikastig:.*|font.*|print|report bad tab|sjálfvirkt skroll|stillingar|hljómar|tóntegund|lærðu þetta lag!?)\s*$/i;
  // Lines about the song or the page, not part of the song (Genius, blogs).
  var PAGE_JUNK_RE = /^\s*(?:[\d.,]+\s*[KMB]?\s*(?:views|viewers|contributors?|saves|comments)\b.*|translations|embed|\d*\s*embed|you might also like|see .+ live|get tickets as low as.*|.*\bread more\s*$|lyrics|texti|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},\s*\d{4}|.*\b\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\b.*)\s*$/i;
  // A label whose value is on the next line: both go.
  var LABEL_NEXT_RE = /^\s*(?:producers?|writers?|songwriters?|track \d+ on|album|released|release date|featuring|label)\s*$/i;
  var CREDIT_RE = /^\s*\(?\s*(?:(?:lag og texti|höfundur lags|höfundur texta|höfundur|lag|texti|ljóð|flytjandi|artist|music|lyrics|words(?: and music)?|written)(?:\s+by)?\s*[:\uFF1A]|(?:words and music|written|music|lyrics)\s+by\s+)/i;
  var SHAPE_RE = /^\s*([A-G][#b]?\S*)\s+([x\d]{1,2}(?:[-\s][x\d]{1,2}){5})\s*$/i;
  var SUFFIX_RE = /\s*[(\[]?\b(?:chords?|tabs?|ukulele|guitar pro|bass|hljómar|gítarhljómar|gítargrip)\b[)\]]?\s*$/i;

  function isSectionOnly(line) {
    var m = SECTION_RE.exec(line);
    return !!m && !isChordish(m[1]);
  }

  function splitTitleArtist(lines) {
    var a = (lines[0] || '').replace(SUFFIX_RE, '').trim();
    var m = /^(.+?)\s+(?:chords?|tabs?|hljómar)?\s*by\s+(.+)$/i.exec(a);
    if (m) return { title: m[1].replace(SUFFIX_RE, '').trim(), artist: m[2].replace(SUFFIX_RE, '').trim() };
    m = /^(.+?)\s+[-\u2013\u2014|]\s+(.+)$/.exec(a);
    if (m) return { title: m[1].trim(), artist: m[2].replace(SUFFIX_RE, '').trim() };
    return { title: a, artist: (lines[1] || '').replace(SUFFIX_RE, '').replace(/^(?:by|eftir)\s+/i, '').trim() };
  }

  function guessKey(body) {
    var cs = chordsIn(body);
    if (!cs.length) return '';
    var f = parseChord(cs[0]), l = parseChord(cs[cs.length - 1]);
    var pick = (f.root + f.acc === l.root + l.acc) ? l : f;
    var minor = /^m(?!aj)/.test(pick.qual) || /^min/.test(pick.qual);
    return normalizeKey(pick.root + pick.acc + (minor ? 'm' : ''));
  }

  // Values may be glued together on one line, as in "Tuning: E A D G B EKey: GCapo: No capo".
  function grab(line, label) {
    var re = new RegExp(label + '\\s*[:\\uFF1A]\\s*(.*?)\\s*(?=(?:key|tóntegund|capo|tuning|stilling|tempo|bpm|höfundur lags|höfundur texta|flytjandi|lag|texti)\\s*[:\\uFF1A]|,\\s*$|$)', 'i');
    var m = re.exec(line);
    return m ? m[1].replace(/,\s*$/, '').trim() : '';
  }

  function readMetaLine(L, meta, extra) {
    var v;
    if ((v = grab(L, '(?:key|tóntegund|tónteg\\.?)'))) {
      var km = /^([A-Ga-g][#b]?)(m(?!aj))?/.exec(v);
      if (km && !meta.key && normalizeKey(km[1] + (km[2] || ''))) meta.key = km[1] + (km[2] || '');
    }
    if ((v = grab(L, 'capo'))) { var n = parseInt(v, 10); if (n > 0) extra.push('{capo: ' + n + '}'); }
    if ((v = grab(L, '(?:tuning|stilling)'))) {
      if (!/^(standard|e\s*a\s*d\s*g\s*b\s*e)$/i.test(v)) extra.push('{comment: Tuning: ' + v + '}');
    }
    if ((v = grab(L, '(?:tempo|bpm)'))) { var b = parseInt(v, 10); if (b > 0 && !meta.bpm) meta.bpm = b; }
    var fl = /flytjandi\s*:\s*([^,)]+)/i.exec(L) || /(?:^|[,(])\s*artist\s*:\s*([^,)]+)/i.exec(L);
    if (fl && !meta.artist) meta.artist = fl[1].trim();
    var ti = /(?:^|,)\s*(?:title|titill)\s*:\s*([^,]+)/i.exec(L);
    if (ti && !meta.title) meta.title = ti[1].trim();
    if (!meta.composer) {
      var hl = /(?:höfundur lags|lag og texti|words and music|music)(?:\s+by)?\s*[:\s]\s*([^,)]+)/i.exec(L) || /(?:^|[,(])\s*lag\s*:\s*([^,)]+)/i.exec(L) || /written by\s*:?\s*([^,)]+)/i.exec(L);
      if (hl) meta.composer = hl[1].trim();
    }
    if (!meta.lyricist) { var tl = /(?:höfundur texta|texti|ljóð|lyrics(?:\s+by)?)\s*:\s*([^,)]+)/i.exec(L); if (tl) meta.lyricist = tl[1].trim(); }
  }

  /** Pasted song text -> { title, artist, key, keyGuessed, bpm, body } with the body in ChordPro. */
  function importText(text) {
    var s = String(text || '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f]/g, ' ');
    s = s.replace(/\[ch\]([^\[\]]*?)\[\/ch\]/gi, '$1').replace(/\[\/?tab\]/gi, '');
    var lines = s.split('\n').map(function (l) { return l.replace(/\s+$/, ''); });

    var parsedMeta = parseSong(s).meta;
    var meta = { title: parsedMeta.title || '', artist: parsedMeta.artist || '', key: parsedMeta.key || '', bpm: parsedMeta.bpm || '', composer: '', lyricist: '' };
    var extra = [];

    // Leading lines before the first chord, tab or section line are the header.
    var i = 0, pre = [];
    for (; i < lines.length; i++) {
      var L = lines[i];
      if (isChordLine(L) || isTabLine(L) || isSectionOnly(L) || parseDirective(L) || chordsIn(L).length) break;
      pre.push(L);
    }
    // Where does the header end? At the first chord or section line, or after a credit line
    // such as "(Lag og texti: ...)" or a "<Title> Lyrics" line when the song has no chords.
    var credit = -1, lyricsAt = -1, lyricsTitle = '';
    for (var k = 0; k < Math.min(i, 40); k++) {
      if (k < 15 && CREDIT_RE.test(lines[k])) credit = k;
      var lm = /^\s*(.+?)\s+lyrics\s*$/i.exec(lines[k]);
      if (lm && lyricsAt < 0 && k < 30) { lyricsAt = k; lyricsTitle = lm[1].trim(); }
    }
    var marked = credit >= 0 || lyricsAt >= 0;
    if (i === lines.length) {
      var stop;
      if (marked) stop = Math.max(credit, lyricsAt) + 1;
      else {
        // No chords and no markers: the first short block above a blank line is the header.
        stop = 0;
        for (var q = 0; q < lines.length && q < 4; q++) { if (lines[q].trim()) stop = q + 1; else if (stop) break; }
        if (!(stop && stop <= 3 && lines.slice(stop).some(function (x) { return x.trim(); }) && !lines[stop].trim())) stop = 0;
      }
      pre = lines.slice(0, stop);
      i = stop;
    }

    var head = [], rest = [], shapes = [], skipNext = false;
    pre.forEach(function (L) {
      if (skipNext) { skipNext = false; return; }
      if (!L.trim() || JUNK_RE.test(L) || PAGE_JUNK_RE.test(L)) return;
      if (LABEL_NEXT_RE.test(L)) { skipNext = true; return; }
      var sh = SHAPE_RE.exec(L);
      if (sh && parseChord(sh[1])) { shapes.push({ name: sh[1], frets: sh[2].replace(/\s+/g, '-') }); return; }
      if (META_START.test(L) || CREDIT_RE.test(L) || /\b(key|capo|tuning)\s*:/i.test(L)) { readMetaLine(L, meta, extra); return; }
      // Free text about the capo, such as "Capó á 2. bandi fyrir upprunalega tóntegund", is kept word for word.
      if (/(^|[^\p{L}])cap[oó](?![\p{L}])/iu.test(L) && /\d/.test(L) && L.trim().length <= 120) { extra.push('{comment: ' + L.trim().replace(/[{}]/g, '') + '}'); return; }
      var x = L.trim();
      if (/\s+lyrics$/i.test(x)) return;
      if (!head.some(function (y) { return y.toLowerCase() === x.toLowerCase(); })) head.push(x);
    });
    if (shapes.length) {
      var w = Math.max.apply(null, shapes.map(function (x) { return x.name.length; }));
      extra.push('{start_of_tab}');
      shapes.forEach(function (x) { extra.push(x.name + new Array(w - x.name.length + 4).join(' ') + x.frets); });
      extra.push('{end_of_tab}');
    }
    if (!meta.artist && meta.composer) meta.artist = meta.composer;
    if (!meta.artist && meta.lyricist) meta.artist = meta.lyricist;
    if (lyricsTitle) {
      // Genius: "<Title> Lyrics", with the artist on the line under the first title line.
      if (!meta.title) meta.title = lyricsTitle;
      var at = -1;
      head.forEach(function (y, n) { if (at < 0 && y.toLowerCase() === lyricsTitle.toLowerCase()) at = n; });
      if (!meta.artist && at >= 0 && head[at + 1] && head[at + 1].length <= 60) meta.artist = head[at + 1];
    } else if (head.length && (marked || head.length <= 3) && head[0].length <= 80) {
      var ta = splitTitleArtist(head);
      if (!meta.title) meta.title = ta.title;
      // With a credit line, a second header line is usually a blog byline, not the artist.
      if (!meta.artist && (!marked || / by /i.test(head[0]) || /\s[-–|]\s/.test(head[0]))) meta.artist = ta.artist;
    } else rest = head;

    // Page furniture inside the song: Genius puts "You might also like" and other songs between verses.
    var tail = [], dropping = false;
    lines.slice(i).forEach(function (L) {
      if (/^\s*you might also like\s*$/i.test(L)) { dropping = true; return; }
      if (dropping) { if (!L.trim() || isSectionOnly(L) || isChordLine(L) || chordsIn(L).length) dropping = false; else return; }
      if (/^\s*(\d*\s*embed|see .+ live|get tickets as low as.*)\s*$/i.test(L)) return;
      tail.push(L);
    });
    lines = lines.slice(0, i).concat(tail);

    var bodyLines = extra.concat(rest.length ? rest.concat(['']) : [], lines.slice(i))
      .filter(function (L) { return !/^\s*\{\s*(title|t|artist|subtitle|st|key|tempo|bpm)\s*:/i.test(L); });
    var body = convertChordsOverLyrics(bodyLines.join('\n'))
      .replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '') + '\n';

    var key = normalizeKey(meta.key), keyGuessed = false;
    if (!key) { key = guessKey(body); keyGuessed = !!key; }
    var bpm = parseInt(meta.bpm, 10);
    return { title: meta.title.trim(), artist: meta.artist.trim(), key: key, keyGuessed: keyGuessed, bpm: bpm > 0 ? bpm : '', body: body };
  }

  /** Formatted copy (HTML) where chords are elements with data-chord, as on Guitarparty.
      Returns text with chords in brackets, or null when the HTML has no such chords.
      Needs a DOM, so it runs in the browser. */
  function htmlToChordText(html, DOMParserImpl) {
    if (!html || !/data-chord\s*=/i.test(html)) return null;
    var P = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!P) return null;
    var doc = new P().parseFromString(html, 'text/html');
    var BLOCK = /^(DIV|P|LI|UL|OL|H[1-6]|PRE|TR|TABLE|TBODY|SECTION|ARTICLE|HEADER|FOOTER|BLOCKQUOTE|DD|DT|DL|MAIN|NAV|ASIDE|FIGURE)$/;
    var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|SVG|IMG|BUTTON|SELECT|TEXTAREA|IFRAME|VIDEO|AUDIO|CANVAS|TEMPLATE)$/;
    var out = '';
    function nl() { if (out && out.charAt(out.length - 1) !== '\n') out += '\n'; }
    (function walk(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          var raw = c.nodeValue;
          if (/^[ \t\r\n]*$/.test(raw) && (!out || out.charAt(out.length - 1) === '\n')) continue; // markup whitespace
          out += raw.replace(/[ \t\r\n]+/g, ' ').replace(/\u00a0/g, ' ');
          continue;
        }
        if (c.nodeType !== 1) continue;
        var tag = c.tagName.toUpperCase();
        if (SKIP.test(tag)) continue;
        if (tag === 'BR') { out += '\n'; continue; }
        var ch = c.getAttribute('data-chord');
        if (ch != null && ch.trim()) { out += '[' + ch.trim() + ']'; continue; }
        var block = BLOCK.test(tag);
        if (block) nl();
        var before = out.length;
        walk(c);
        if (block) { if (out.length === before && out) out += '\n'; else nl(); } // an empty block is a stanza break
      }
    })(doc.body || doc);
    return out.split('\n').map(function (l) { return l.replace(/ {2,}/g, ' ').trim(); }).join('\n')
      .replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  // ---------- Songgiggin files: export and merge ----------

  function live(map) { return Object.keys(map || {}).map(function (k) { return map[k]; }).filter(function (r) { return r && !r.deleted; }); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  /** kind: 'library' (everything except examples) or 'setlist' (one setlist with its songs). */
  function exportBundle(data, kind, setlistId) {
    var songs, setlists;
    if (kind === 'setlist') {
      var sl = data.setlists[setlistId];
      setlists = sl && !sl.deleted ? [sl] : [];
      var ids = {};
      setlists.forEach(function (x) { (x.items || []).forEach(function (it) { ids[it.songId] = 1; }); });
      songs = live(data.songs).filter(function (sg) { return ids[sg.id]; });
    } else {
      songs = live(data.songs).filter(function (sg) { return !sg.example; });
      setlists = live(data.setlists).filter(function (x) { return !x.example; });
    }
    var used = {};
    songs.forEach(function (sg) { (sg.tags || []).forEach(function (id) { used[id] = 1; }); });
    var tags = live(data.tags).filter(function (tg) { return kind !== 'setlist' || used[tg.id]; });
    return { format: 'songgiggin', version: 1, kind: kind, exportedAt: Date.now(),
      songs: copy(songs), setlists: copy(setlists), tags: copy(tags) };
  }

  function parseBundle(text) {
    var b;
    try { b = JSON.parse(String(text || '').trim()); } catch (e) { return null; }
    if (!b || b.format !== 'songgiggin' || !Array.isArray(b.songs)) return null;
    b.setlists = Array.isArray(b.setlists) ? b.setlists : [];
    b.tags = Array.isArray(b.tags) ? b.tags : [];
    b.songs = b.songs.filter(function (x) { return x && typeof x.id === 'string' && typeof x.body === 'string'; });
    b.setlists = b.setlists.filter(function (x) { return x && typeof x.id === 'string' && Array.isArray(x.items); });
    b.tags = b.tags.filter(function (x) { return x && typeof x.id === 'string' && typeof x.name === 'string' && x.name.trim(); });
    return b;
  }

  /** Works out what importing a bundle would change. The newer copy of a record wins;
      tags are matched by name so nobody ends up with two "Hresst" tags. */
  function planMerge(local, b, now) {
    now = now || Date.now();
    var plan = { tags: [], tagMap: {}, songs: { add: [], update: [], same: 0, keep: 0 }, setlists: { add: [], update: [], same: 0, keep: 0 } };
    var byName = {}, maxOrder = -1;
    Object.keys(local.tags || {}).forEach(function (id) {
      var tg = local.tags[id];
      if (tg.order != null && tg.order > maxOrder) maxOrder = tg.order;
      if (!tg.deleted) byName[String(tg.name).trim().toLowerCase()] = tg.id;
    });
    b.tags.forEach(function (bt) {
      var key = bt.name.trim().toLowerCase();
      if (byName[key]) { plan.tagMap[bt.id] = byName[key]; return; }
      var id = (local.tags || {})[bt.id] ? bt.id + '-' + now.toString(36) : bt.id;
      var rec = { id: id, name: bt.name.trim().slice(0, 30), order: ++maxOrder, createdAt: bt.createdAt || now, updatedAt: now };
      plan.tags.push(rec); plan.tagMap[bt.id] = id; byName[key] = id;
    });
    function decide(kind, rec) {
      var loc = (local[kind] || {})[rec.id], out = plan[kind];
      rec.updatedAt = rec.updatedAt || 0;
      if (!loc || loc.deleted) {
        if (loc) rec.updatedAt = Math.max(rec.updatedAt, (loc.updatedAt || 0) + 1);
        out.add.push(rec);
      } else if (rec.updatedAt > (loc.updatedAt || 0)) out.update.push(rec);
      else if (rec.updatedAt === (loc.updatedAt || 0)) out.same++;
      else out.keep++;
    }
    b.songs.forEach(function (bs) {
      var rec = copy(bs);
      delete rec.deleted;
      rec.tags = (bs.tags || []).map(function (id) { return plan.tagMap[id]; }).filter(Boolean);
      decide('songs', rec);
    });
    b.setlists.forEach(function (bl) { var rec = copy(bl); delete rec.deleted; decide('setlists', rec); });
    return plan;
  }

  function songToChordPro(song) {
    var head = [];
    if (song.title) head.push('{title: ' + song.title + '}');
    if (song.artist) head.push('{artist: ' + song.artist + '}');
    if (song.key) head.push('{key: ' + song.key + '}');
    if (song.bpm) head.push('{tempo: ' + song.bpm + '}');
    return head.join('\n') + (head.length ? '\n\n' : '') + String(song.body || '').replace(/\s+$/, '') + '\n';
  }

  var Core = {
    parseChord: parseChord, transposeChord: transposeChord, transposeBracket: transposeBracket,
    isChordish: isChordish, parseKey: parseKey, keyName: keyName, normalizeKey: normalizeKey,
    transposeKey: transposeKey, prefersFlats: prefersFlats, chordsIn: chordsIn,
    resolveSpelling: resolveSpelling, parseDirective: parseDirective, isTabLine: isTabLine,
    parseLine: parseLine, parseSong: parseSong, toGroups: toGroups, isChordLine: isChordLine,
    mergeChordLyric: mergeChordLyric, convertChordsOverLyrics: convertChordsOverLyrics,
    looksLikeChordsOverLyrics: looksLikeChordsOverLyrics, importText: importText, guessKey: guessKey, htmlToChordText: htmlToChordText,
    exportBundle: exportBundle, parseBundle: parseBundle, planMerge: planMerge, songToChordPro: songToChordPro
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
