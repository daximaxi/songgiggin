/* Songgiggin app: song pool, editor, setlists, stage view. Vanilla JS, no libraries. */
(function () {
  'use strict';
  var C = window.Core;
  var LS_DATA = 'songgiggin.data.v1', LS_PREFS = 'songgiggin.prefs.v1';
  var SPEED_MIN = 1, SPEED_MAX = 40, SPEED_EM = 0.05; // em per second, per speed step
  var FS_MIN = 12, FS_MAX = 56;

  // ---------- tiny DOM helpers ----------
  function $(s, r) { return (r || document).querySelector(s); }
  function h(tag, attrs) {
    var el = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    var kids = Array.prototype.slice.call(arguments, 2);
    (function add(list) {
      list.forEach(function (kid) {
        if (kid == null || kid === false) return;
        if (Array.isArray(kid)) return add(kid);
        el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
      });
    })(kids);
    return el;
  }
  var ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    left: '<path d="M15 5l-7 7 7 7"/>',
    right: '<path d="M9 5l7 7-7 7"/>',
    sliders: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>',
    listadd: '<path d="M4 6h11M4 12h8M4 18h8M18 11v8M14 15h8"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    import: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    export: '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
    file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/>',
    pen: '<path d="M3 21l3.5-1 12-12-2.5-2.5-12 12zM14.5 6.5l2.5 2.5"/><path d="M15 21h6"/>',
    marker: '<path d="M9 14l-4 4v3h6l2-2M8 13l7-9 5 4-7 9z"/>',
    textT: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    eraser: '<path d="M9 20h11M4.5 14.5l9-9 6 6-8.5 8.5H9z"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
    docedit: '<path d="M13 3H5v18h14V9z"/><path d="M13 3v6h6"/><path d="M9 17l.6-2.6 4.8-4.8 2 2-4.8 4.8z"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M2 12s3.6-7 10-7c2 0 3.7.7 5.1 1.6M22 12s-3.6 7-10 7c-2 0-3.7-.7-5.1-1.6M4 20L20 4"/>'
  };
  function ico(name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ico'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];
    return s;
  }
  function iconBtn(name, label, onclick, extra) {
    var b = h('button', { class: 'iconbtn' + (extra ? ' ' + extra : ''), type: 'button', 'aria-label': label, title: label, onclick: onclick });
    b.appendChild(ico(name));
    return b;
  }
  function textBtn(text, label, onclick) {
    return h('button', { class: 'iconbtn txt', type: 'button', 'aria-label': label, title: label, text: text, onclick: onclick });
  }
  // replaceChildren() would print the word "null" for an empty slot, so filter first.
  function setKids(el) {
    var kids = Array.prototype.slice.call(arguments, 1).filter(function (k) { return k != null && k !== false; });
    el.replaceChildren.apply(el, kids);
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // ---------- language ----------
  var I18N = {
    en: {
      songs: 'Songs', setlists: 'Setlists', songPool: 'Song pool', newSong: 'New song',
      searchSongs: 'Search title or artist', noSongs: 'No songs yet. Add your first one with New song.',
      noMatch: 'No songs match your search.', untitled: 'Untitled', example: 'Example',
      edit: 'Edit', del: 'Delete', addToSetlist: 'Add to setlist', songDeleted: 'Song deleted', undo: 'Undo',
      newSetlist: 'New setlist', noSetlists: 'No setlists yet. Create one and pull songs in from the pool.',
      back: 'Back', setlistName: 'Setlist name', date: 'Date', start: 'Start', addSongs: 'Add songs',
      deleteSetlist: 'Delete setlist', setlistDeleted: 'Setlist deleted',
      emptySetlist: 'This setlist is empty. Use Add songs to pull from the pool.',
      original: 'Original', inSetlist: 'Setlist', now: 'Now', key: 'Key',
      keyDown: 'Lower the key by a semitone', keyUp: 'Raise the key by a semitone',
      moveUp: 'Move up', moveDown: 'Move down', remove: 'Remove from setlist',
      add: 'Add', done: 'Done', close: 'Close', chooseSetlist: 'Add to which setlist?', addedTo: 'Added to',
      title: 'Title', artist: 'Artist', tempo: 'Tempo (BPM)', keyHint: 'Use a key such as G, Em or Bb.',
      lyricsChords: 'Lyrics and chords', preview: 'Preview', insertChord: 'Chord [ ]',
      chordLeft: 'Move chord left', chordRight: 'Move chord right', insertTab: 'Tab block',
      convert: 'Convert chords above lyrics', converted: 'Converted to chords in brackets',
      nothingToConvert: 'No chord lines found to convert.', nudgeHint: 'Put the cursor inside a chord first.',
      help: 'Write a chord in brackets right before the syllable it lands on: <code>A[G]mazing [C]grace</code>. Text with chords on the line above is converted when you paste it. A section name goes in brackets on its own line: <code>[Chorus]</code>.',
      saved: 'Saved', saving: 'Saving…', notSaved: 'Not saved yet', stageView: 'Stage view',
      settings: 'Settings', language: 'Language', theme: 'Appearance', auto: 'Auto', dark: 'Dark', light: 'Light',
      defaultSpeed: 'Default scroll speed', defaultSpeedHint: 'Used for songs that have no saved speed yet.',
      speed: 'Speed', slower: 'Slower', faster: 'Faster', play: 'Start scrolling', pause: 'Pause scrolling',
      prev: 'Previous song', next: 'Next song', nextUp: 'Next', endOfSet: 'End of setlist',
      text: 'Text', textSmaller: 'Smaller text', textLarger: 'Larger text', accidentals: 'Sharps or flats',
      transpose: 'Transpose', fullscreen: 'Full screen', tabNote: 'Tab is not transposed.',
      sync_synced: 'Synced', sync_syncing: 'Syncing…', sync_local: 'This device only',
      sync_offline: 'Offline, may be out of date', sync_connecting: 'Connecting…',
      loading: 'Loading your songs…', exampleGig: 'Example gig',
      tags: 'Tags', newTag: 'New tag', addTag: 'Add tag', clearFilter: 'Clear', deleteTag: 'Delete tag', tagDeleted: 'Tag deleted',
      renameTag: 'Tag name', sortBy: 'Sort by', sortTitle: 'Title', sortArtist: 'Artist', sortTags: 'Tags', sortEdited: 'Last edited',
      noArtist: 'No artist', untagged: 'No tags', sortCreated: 'Created', slSortEdited: 'Edited', sortGig: 'Gig date', sortName: 'A to Z',
      created: 'Created', edited: 'Edited', gig: 'Gig', color: 'Colour', customColor: 'Custom colour',
      c_orange: 'Orange', c_red: 'Red', c_pink: 'Pink', c_purple: 'Purple', c_blue: 'Blue', c_teal: 'Teal', c_yellow: 'Yellow', c_neutral: 'Neutral',
      editSong: 'Edit song', backToStage: 'Back to stage', importSong: 'Import', importTitle: 'Import a song',
      importHint: 'Copy a song from a website and paste it here. Title, artist and key are read from the first lines when possible, and chords above the lyrics are moved onto the right syllable.',
      importPlaceholder: 'Paste the song here', importBtn: 'Import', importEmpty: 'Paste a song first.',
      exportBtn: 'Export', exportLib: 'Export song pool', exportSetlist: 'Export setlist', exportSong: 'Export song',
      exportLibDesc: 'All your songs, setlists and tags in one file. Import it here on another device, or send it to someone who uses Songgiggin. The example songs are left out.',
      exportSetlistDesc: 'This setlist with its songs, the keys you set for it and the tags they use. Whoever imports it gets the whole setlist ready to play.',
      exportSongDesc: 'The song as a ChordPro text file. Other chord apps can open it, and Songgiggin can import it again.',
      download: 'Download', copy: 'Copy', copied: 'Copied. Paste it in a message or into Import on another device.',
      copyManual: 'Select all the text below and copy it.', fileSaved: 'File saved', fileBusy: 'A save is already waiting for your answer.',
      fileFailed: 'The file could not be saved here. Use Copy instead.', openFile: 'Open file',
      fileHint: 'Or open a file: a Songgiggin file (.json) or songs as text or ChordPro files.',
      mTitle: 'Import file', mInFile: 'In the file', mNewSongs: 'New songs', mUpdSongs: 'Songs updated (newer in the file)',
      mSameSongs: 'Songs already up to date', mKeepSongs: 'Songs where your copy is newer (kept)', mNewLists: 'New setlists',
      mUpdLists: 'Setlists updated (newer in the file)', mSameLists: 'Setlists already up to date', mKeepLists: 'Setlists where your copy is newer (kept)',
      mNewTags: 'New tags', mNothing: 'Everything in the file is already here. Nothing to import.', mDone: 'Import finished',
      mBad: 'This file could not be read as a song or a Songgiggin file.',
      nLists: function (n) { return n === 1 ? '1 setlist' : n + ' setlists'; },
      sizeFine: 'Thin line', sizeMed: 'Medium line', sizeThick: 'Thick line', gigDate: 'Gig date',
      inkSmooth: 'Handwriting smoothing', smooth0: 'Off', smooth1: 'Low', smooth2: 'Medium', smooth3: 'High',
      inkSmoothHint: 'Evens out wobble in lines you draw. Applies to new lines. A pen that reports pressure draws thicker lines when you press harder.',
      notes: 'Notes', notesPen: 'Pen', notesMarker: 'Highlighter', notesText: 'Text', notesEraser: 'Eraser', notesUndo: 'Undo',
      notesClear: 'Clear all', notesDone: 'Done', notesShow: 'Show notes', notesHide: 'Hide notes', notesSaved: 'Notes saved',
      notesTitle: 'Save your notes?', notesUnsaved: 'You have notes on this song that are not saved.',
      notesHintTouch: 'Draw with a finger or a pen. Scroll with two fingers.', notesHintPen: 'The pen draws and a finger scrolls.',
      notesTextPh: 'Type a note, then Enter', c_nred: 'Red', c_nblue: 'Blue', c_nink: 'Black', c_ngreen: 'Green',
      c_hyellow: 'Yellow', c_hgreen: 'Green', c_hpink: 'Pink',
      save: 'Save', saved: 'Saved', unsaved: 'Unsaved changes', unsavedTitle: 'Save this song?',
      unsavedNew: 'This new song has not been saved yet.', unsavedText: 'This song has changes that are not saved.', discard: 'Discard',
      imported: 'Imported. Check the title, artist and key, then save.', importedGuess: 'Imported. The key was guessed from the chords, so check it, then save.', cancel: 'Cancel',
      nSongs: function (n) { return n === 1 ? '1 song' : n + ' songs'; }
    },
    is: {
      songs: 'Lög', setlists: 'Lagalistar', songPool: 'Lagasafn', newSong: 'Nýtt lag',
      searchSongs: 'Leita að titli eða flytjanda', noSongs: 'Engin lög enn. Bættu við fyrsta laginu með Nýtt lag.',
      noMatch: 'Engin lög passa við leitina.', untitled: 'Án titils', example: 'Dæmi',
      edit: 'Breyta', del: 'Eyða', addToSetlist: 'Bæta á lagalista', songDeleted: 'Lagi eytt', undo: 'Afturkalla',
      newSetlist: 'Nýr lagalisti', noSetlists: 'Engir lagalistar enn. Búðu til lista og sæktu lög úr lagasafninu.',
      back: 'Til baka', setlistName: 'Nafn lagalista', date: 'Dagsetning', start: 'Byrja', addSongs: 'Bæta við lögum',
      deleteSetlist: 'Eyða lagalista', setlistDeleted: 'Lagalista eytt',
      emptySetlist: 'Þessi lagalisti er tómur. Notaðu Bæta við lögum til að sækja úr lagasafninu.',
      original: 'Upprunaleg', inSetlist: 'Á lista', now: 'Núna', key: 'Tóntegund',
      keyDown: 'Lækka tóntegund um hálftón', keyUp: 'Hækka tóntegund um hálftón',
      moveUp: 'Færa upp', moveDown: 'Færa niður', remove: 'Fjarlægja af lagalista',
      add: 'Bæta við', done: 'Lokið', close: 'Loka', chooseSetlist: 'Á hvaða lagalista?', addedTo: 'Bætt á',
      title: 'Titill', artist: 'Flytjandi', tempo: 'Tempó (BPM)', keyHint: 'Notaðu tóntegund eins og G, Em eða Bb.',
      lyricsChords: 'Texti og hljómar', preview: 'Forskoðun', insertChord: 'Hljómur [ ]',
      chordLeft: 'Færa hljóm til vinstri', chordRight: 'Færa hljóm til hægri', insertTab: 'Gítartab',
      convert: 'Umbreyta hljómum fyrir ofan texta', converted: 'Umbreytt í hljóma í hornklofum',
      nothingToConvert: 'Engar hljómalínur fundust til að umbreyta.', nudgeHint: 'Settu bendilinn fyrst inn í hljóm.',
      help: 'Skrifaðu hljóm í hornklofa beint fyrir framan atkvæðið sem hann á við: <code>A[G]mazing [C]grace</code>. Texta með hljómum í línunni fyrir ofan er umbreytt þegar þú límir hann inn. Kaflaheiti fer í hornklofa í sér línu: <code>[Viðlag]</code>.',
      saved: 'Vistað', saving: 'Vista…', notSaved: 'Ekki vistað enn', stageView: 'Sviðssýn',
      settings: 'Stillingar', language: 'Tungumál', theme: 'Útlit', auto: 'Sjálfvirkt', dark: 'Dökkt', light: 'Ljóst',
      defaultSpeed: 'Sjálfgefinn skrunhraði', defaultSpeedHint: 'Notaður fyrir lög sem eiga ekki vistaðan hraða.',
      speed: 'Hraði', slower: 'Hægar', faster: 'Hraðar', play: 'Byrja að skruna', pause: 'Stöðva skrun',
      prev: 'Fyrra lag', next: 'Næsta lag', nextUp: 'Næst', endOfSet: 'Lagalistinn er búinn',
      text: 'Letur', textSmaller: 'Minna letur', textLarger: 'Stærra letur', accidentals: 'Krossar eða bé',
      transpose: 'Tónflytja', fullscreen: 'Allur skjárinn', tabNote: 'Tab er ekki tónflutt.',
      sync_synced: 'Samstillt', sync_syncing: 'Samstilli…', sync_local: 'Aðeins þetta tæki',
      sync_offline: 'Ótengt, gæti verið úrelt', sync_connecting: 'Tengist…',
      loading: 'Sæki lögin þín…', exampleGig: 'Dæmi um gigg',
      tags: 'Tags', newTag: 'Nýtt tag', addTag: 'Bæta við tagi', clearFilter: 'Hreinsa', deleteTag: 'Eyða tagi', tagDeleted: 'Tagi eytt',
      renameTag: 'Nafn tags', sortBy: 'Raða eftir', sortTitle: 'Titli', sortArtist: 'Flytjanda', sortTags: 'Tags', sortEdited: 'Síðast breytt',
      noArtist: 'Enginn flytjandi', untagged: 'Án tags', sortCreated: 'Stofnað', slSortEdited: 'Breytt', sortGig: 'Dagsetningu giggs', sortName: 'A til Ö',
      created: 'Stofnaður', edited: 'Breytt', gig: 'Gigg', color: 'Litur', customColor: 'Eigin litur',
      c_orange: 'Appelsínugulur', c_red: 'Rauður', c_pink: 'Bleikur', c_purple: 'Fjólublár', c_blue: 'Blár', c_teal: 'Grænblár', c_yellow: 'Gulur', c_neutral: 'Hlutlaus',
      editSong: 'Breyta lagi', backToStage: 'Aftur á svið', importSong: 'Flytja inn', importTitle: 'Flytja inn lag',
      importHint: 'Afritaðu lag af vefsíðu og límdu það hér. Titill, flytjandi og tóntegund eru lesin úr fyrstu línunum þegar hægt er, og hljómar fyrir ofan texta eru færðir á rétt atkvæði.',
      importPlaceholder: 'Límdu lagið hér', importBtn: 'Flytja inn', importEmpty: 'Límdu lag inn fyrst.',
      exportBtn: 'Flytja út', exportLib: 'Flytja út lagasafnið', exportSetlist: 'Flytja út lagalista', exportSong: 'Flytja út lag',
      exportLibDesc: 'Öll lögin þín, lagalistar og tags í einni skrá. Þú getur flutt hana inn hér á öðru tæki eða sent hana einhverjum sem notar Songgiggin. Dæmalögin eru ekki með.',
      exportSetlistDesc: 'Lagalistinn ásamt lögunum, tóntegundunum sem þú valdir fyrir hann og tags-unum þeirra. Sá sem flytur hann inn fær allan lagalistann tilbúinn.',
      exportSongDesc: 'Lagið sem ChordPro textaskrá. Önnur hljómaöpp geta opnað hana og Songgiggin getur flutt hana inn aftur.',
      download: 'Hlaða niður', copy: 'Afrita', copied: 'Afritað. Límdu það í skilaboð eða í Flytja inn á öðru tæki.',
      copyManual: 'Veldu allan textann hér fyrir neðan og afritaðu hann.', fileSaved: 'Skrá vistuð', fileBusy: 'Vistun bíður nú þegar eftir svari frá þér.',
      fileFailed: 'Ekki var hægt að vista skrána hér. Notaðu Afrita í staðinn.', openFile: 'Opna skrá',
      fileHint: 'Eða opnaðu skrá: Songgiggin skrá (.json) eða lög sem texta- eða ChordPro skrár.',
      mTitle: 'Flytja inn skrá', mInFile: 'Í skránni', mNewSongs: 'Ný lög', mUpdSongs: 'Lög uppfærð (nýrri í skránni)',
      mSameSongs: 'Lög sem eru þegar eins', mKeepSongs: 'Lög þar sem þín útgáfa er nýrri (haldið)', mNewLists: 'Nýir lagalistar',
      mUpdLists: 'Lagalistar uppfærðir (nýrri í skránni)', mSameLists: 'Lagalistar sem eru þegar eins', mKeepLists: 'Lagalistar þar sem þín útgáfa er nýrri (haldið)',
      mNewTags: 'Ný tags', mNothing: 'Allt í skránni er þegar hér. Ekkert að flytja inn.', mDone: 'Innflutningi lokið',
      mBad: 'Ekki tókst að lesa þessa skrá sem lag eða Songgiggin skrá.',
      nLists: function (n) { return (n % 10 === 1 && n % 100 !== 11) ? n + ' lagalisti' : n + ' lagalistar'; },
      sizeFine: 'Fín lína', sizeMed: 'Miðlungs lína', sizeThick: 'Þykk lína', gigDate: 'Dagsetning giggs',
      inkSmooth: 'Mýkt handskriftar', smooth0: 'Engin', smooth1: 'Lítil', smooth2: 'Miðlungs', smooth3: 'Mikil',
      inkSmoothHint: 'Jafnar út titring í línum sem þú teiknar. Gildir um nýjar línur. Penni sem sendir þrýsting teiknar þykkari línu þegar þú þrýstir fastar.',
      notes: 'Glósur', notesPen: 'Penni', notesMarker: 'Yfirstrikun', notesText: 'Texti', notesEraser: 'Strokleður', notesUndo: 'Afturkalla',
      notesClear: 'Hreinsa allt', notesDone: 'Lokið', notesShow: 'Sýna glósur', notesHide: 'Fela glósur', notesSaved: 'Glósur vistaðar',
      notesTitle: 'Vista glósurnar?', notesUnsaved: 'Þú ert með óvistaðar glósur á þessu lagi.',
      notesHintTouch: 'Teiknaðu með fingri eða penna. Skrunaðu með tveimur fingrum.', notesHintPen: 'Penninn teiknar og fingur skrunar.',
      notesTextPh: 'Skrifaðu glósu og ýttu á Enter', c_nred: 'Rauður', c_nblue: 'Blár', c_nink: 'Svartur', c_ngreen: 'Grænn',
      c_hyellow: 'Gulur', c_hgreen: 'Grænn', c_hpink: 'Bleikur',
      save: 'Vista', saved: 'Vistað', unsaved: 'Óvistaðar breytingar', unsavedTitle: 'Vista lagið?',
      unsavedNew: 'Nýja lagið hefur ekki verið vistað.', unsavedText: 'Lagið hefur breyst síðan það var vistað.', discard: 'Henda',
      imported: 'Flutt inn. Athugaðu titil, flytjanda og tóntegund og vistaðu svo.', importedGuess: 'Flutt inn. Tóntegundin var giskuð út frá hljómunum. Athugaðu hana og vistaðu svo.', cancel: 'Hætta við',
      nSongs: function (n) { return (n % 10 === 1 && n % 100 !== 11) ? n + ' lag' : n + ' lög'; }
    }
  };
  function t(k) {
    var d = I18N[prefs.lang] || I18N.en;
    return d[k] !== undefined ? d[k] : (I18N.en[k] !== undefined ? I18N.en[k] : k);
  }

  // ---------- preferences (per device) ----------
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage may be unavailable */ } }
  var prefs = Object.assign(
    { lang: /^is/i.test(navigator.language || '') ? 'is' : 'en', theme: 'auto', fontSize: 20, defaultSpeed: 10, accent: 'orange', poolSort: 'title', setlistSort: 'created', penSize: 1, markerSize: 1, inkSmooth: 2 },
    lsGet(LS_PREFS) || {}
  );
  function savePrefs() { lsSet(LS_PREFS, prefs); }
  function applyPrefs() {
    var root = document.documentElement;
    if (prefs.theme === 'dark' || prefs.theme === 'light') root.setAttribute('data-mode', prefs.theme);
    else root.removeAttribute('data-mode');
    root.lang = prefs.lang;
    $('#tab-songs').textContent = t('songs');
    $('#tab-setlists').textContent = t('setlists');
    var sb = $('#btn-settings');
    sb.setAttribute('aria-label', t('settings')); sb.title = t('settings');
    if (!sb.firstChild) sb.appendChild(ico('sliders'));
    setSync(sync.status);
    applyAccent();
  }

  // ---------- accent colour ----------
  var ACCENTS = [
    { id: 'orange', light: '#ad4e08', dark: '#f4ae3d' }, { id: 'red', light: '#b42318', dark: '#ff7b72' },
    { id: 'pink', light: '#b1246f', dark: '#ff85c2' }, { id: 'purple', light: '#6941c6', dark: '#b9a3ff' },
    { id: 'blue', light: '#1d5fbf', dark: '#6cabff' }, { id: 'teal', light: '#0b7766', dark: '#43d3b4' },
    { id: 'yellow', light: '#866200', dark: '#f2d03b' }, { id: 'neutral', light: '#323a46', dark: '#e3e7ed' }
  ];
  function hexRgb(x) {
    x = String(x || '').trim().replace('#', '');
    if (x.length === 3) x = x.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(x, 16);
    return isNaN(n) ? null : [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgbHex(c) { return '#' + c.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
  function lum(c) {
    var a = c.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function isDarkNow() {
    var root = document.documentElement;
    var bg = hexRgb(getComputedStyle(root).getPropertyValue('--bg'));
    return bg ? lum(bg) < 0.2 : false;
  }
  // Returns the accent for the current theme, nudged until chords stay readable on the background.
  function accentFor(spec, dark) {
    var bg = hexRgb(getComputedStyle(document.documentElement).getPropertyValue('--bg')) || (dark ? [15, 18, 22] : [241, 242, 244]);
    var p = ACCENTS.filter(function (a) { return a.id === spec; })[0];
    var base = hexRgb(p ? (dark ? p.dark : p.light) : (/^#[0-9a-f]{6}$/i.test(spec) ? spec : (dark ? ACCENTS[0].dark : ACCENTS[0].light)));
    var toward = dark ? [255, 255, 255] : [0, 0, 0], c = base;
    for (var i = 1; i <= 20 && contrast(c, bg) < 4.5; i++) c = base.map(function (v, k) { return v + (toward[k] - v) * i * 0.05; });
    return c;
  }
  var OLD_ACCENT = { vermilion: 'orange', klein: 'blue', sage: 'teal', ochre: 'yellow', ink: 'neutral' };
  if (OLD_ACCENT[prefs.accent]) prefs.accent = OLD_ACCENT[prefs.accent];
  function applyAccent() {
    var root = document.documentElement, dark = isDarkNow();
    var c = accentFor(prefs.accent, dark);
    root.style.setProperty('--accent', rgbHex(c));
    root.style.setProperty('--accent-ink', contrast(c, [255, 255, 255]) >= contrast(c, [20, 16, 10]) ? '#ffffff' : '#14100a');
  }
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyAccent); } catch (e) { /* old browser */ }
  try { new MutationObserver(applyAccent).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] }); } catch (e) { /* old browser */ }

  // ---------- data: local copy plus sync to the account ----------
  var KINDS = ['songs', 'setlists', 'tags'];
  var data = { songs: {}, setlists: {}, tags: {} };
  var ready = false;
  var sync = { status: 'connecting', refs: {}, definitive: {}, sent: {}, queue: {}, busy: 0, failed: false, timer: 0 };

  (function loadLocal() {
    var d = lsGet(LS_DATA);
    if (d && d.songs && d.setlists) { data = d; if (!data.tags) data.tags = {}; }
  })();
  var persistTimer = 0;
  function persistLocal() { clearTimeout(persistTimer); persistTimer = setTimeout(flushLocal, 250); }
  function flushLocal() { clearTimeout(persistTimer); lsSet(LS_DATA, data); }
  function hasRecords() { return Object.keys(data.songs).length + Object.keys(data.setlists).length > 0; }

  function setSync(s) {
    sync.status = s;
    var el = $('#sync');
    el.setAttribute('data-s', s);
    $('#sync-text').textContent = t('sync_' + s);
    el.title = t('sync_' + s);
  }
  function allDef() { return KINDS.every(function (k) { return sync.definitive[k]; }); }
  function refreshSyncStatus() {
    if (!sync.refs.songs) return;
    if (sync.failed) setSync('local');
    else if (sync.busy > 0) setSync('syncing');
    else if (allDef()) setSync('synced');
  }

  function queueWrite(kind, id) {
    var ref = sync.refs[kind], rec = data[kind][id];
    if (!ref || !rec) return;
    var key = kind + '/' + id;
    if (sync.sent[key] === rec.updatedAt) return;
    var q = sync.queue[key] || (sync.queue[key] = { busy: false, dirty: false });
    if (q.busy) { q.dirty = true; return; }
    q.busy = true; sync.busy++;
    doWrite(kind, id, q, 0);
  }
  function doWrite(kind, id, q, attempt) {
    var key = kind + '/' + id, rec = data[kind][id];
    sync.sent[key] = rec.updatedAt;
    refreshSyncStatus();
    var p;
    try { p = sync.refs[kind].doc(id).set(clone(rec)); } catch (e) { p = Promise.reject(e); }
    p.then(function () { sync.failed = false; }, function (e) {
      delete sync.sent[key];
      if (e && e.code === 'unavailable' && attempt < 1) {
        return new Promise(function (r) { setTimeout(r, 500 + Math.random() * 1500); })
          .then(function () { q.retry = true; });
      }
      sync.failed = true;
    }).then(function () {
      if (q.retry) { q.retry = false; return doWrite(kind, id, q, attempt + 1); }
      q.busy = false; sync.busy--;
      if (q.dirty) { q.dirty = false; queueWrite(kind, id); }
      refreshSyncStatus();
    });
  }

  function onSnap(kind, snap) {
    var changed = false, seen = {};
    snap.docs.forEach(function (d) {
      var r = d.data();
      if (!r || !r.id) return;
      seen[d.id] = 1;
      var loc = data[kind][d.id];
      if (!loc || (r.updatedAt || 0) > (loc.updatedAt || 0)) { data[kind][d.id] = clone(r); changed = true; }
      else if ((loc.updatedAt || 0) > (r.updatedAt || 0)) queueWrite(kind, d.id);
    });
    if (!snap.metadata.fromCache) {
      sync.definitive[kind] = true;
      Object.keys(data[kind]).forEach(function (id) { if (!seen[id]) queueWrite(kind, id); });
      if (allDef()) { clearTimeout(sync.timer); refreshSyncStatus(); settle(); }
    }
    if (changed) { persistLocal(); if (!ready && hasRecords()) ready = true; refreshView(); }
  }

  function connect() {
    var api = window.claude;
    if (!api || typeof api.use !== 'function') { setSync('local'); settle(); return; }
    Promise.all([api.use('db'), api.use('user')]).then(function (r) {
      var db = r[0], user = r[1];
      if (!db || !user) throw new Error('no db');
      return Promise.resolve(user.id()).then(function (id) {
        if (!id) throw new Error('no id');
        var rootDoc = db.doc('data/users/' + id + '/library');
        sync.refs.songs = rootDoc.collection('songs');
        sync.refs.setlists = rootDoc.collection('setlists');
        sync.refs.tags = rootDoc.collection('tags');
        sync.timer = setTimeout(function () {
          if (!(allDef())) { setSync('offline'); settle(); }
        }, 10000);
        KINDS.forEach(function (kind) {
          sync.refs[kind].onSnapshot(function (snap) { onSnap(kind, snap); }, function () {
            clearTimeout(sync.timer); sync.failed = true; setSync('local'); settle();
          });
        });
      });
    }).catch(function () { setSync('local'); settle(); });
  }

  var settled = false;
  function settle() {
    if (settled) return;
    settled = true;
    if (!hasRecords()) seedExamples();
    seedTags();
    ready = true;
    render();
  }

  function saveRec(kind, rec) {
    var prev = data[kind][rec.id];
    rec.updatedAt = Math.max(Date.now(), ((prev && prev.updatedAt) || 0) + 1);
    data[kind][rec.id] = rec;
    persistLocal();
    queueWrite(kind, rec.id);
  }

  // Store a record exactly as it arrived (imports keep their own edit time).
  function putRec(kind, rec) {
    data[kind][rec.id] = rec;
    persistLocal();
    queueWrite(kind, rec.id);
  }

  // Marked examples so the app does not open as an empty shell. All three are traditional songs.
  function seedExamples() {
    var songs = [
      { id: 'ex-oh-susanna', title: 'Oh! Susanna', artist: 'Stephen Foster, 1848', key: 'G', bpm: 120, body:
        '[Verse 1]\nI [G]come from Alabama with my banjo on my [D]knee\nI\'m [G]going to Louisiana, my true love [D]for to [G]see\nIt [G]rained all night the day I left, the weather it was [D]dry\nThe [G]sun so hot I froze to death, Susanna, [D]don\'t you [G]cry\n\n{start_of_chorus: Chorus}\n[C]Oh! Susanna, oh [G]don\'t you cry for [D]me\nI\'ve [G]come from Alabama with my banjo [D]on my [G]knee\n{end_of_chorus}\n' },
      { id: 'ex-rising-sun', title: 'House of the Rising Sun', artist: 'Traditional', key: 'Am', bpm: 78, body:
        '{comment: 6/8, arpeggio pattern as in the tab}\n\n[Intro]\n{start_of_tab}\ne|-------0-----|-------0-----|\nB|-----1---1---|-----1---1---|\nG|---2-------2-|---0-------0-|\nD|-2-----------|-------------|\nA|0------------|-3-----------|\nE|-------------|-------------|\n{end_of_tab}\n\n[Verse 1]\nThere [Am]is a [C]house in [D]New Or[F]leans\nThey [Am]call the [C]Rising [E]Sun\nIt\'s [Am]been the [C]ruin of [D]many a poor [F]girl\nAnd [Am]me, oh [E]God, for [Am]one\n\n[Outro]\n[Am] [C] [D] [F] [Am] [E] [Am]\n' },
      { id: 'ex-amazing-grace', title: 'Amazing Grace', artist: 'John Newton, 1779', key: 'G', bpm: 80, body:
        '{comment: 3/4}\n\n[Verse 1]\nA[G]mazing grace, how [C]sweet the [G]sound\nThat saved a wretch like [D]me\nI [G]once was lost, but [C]now am [G]found\nWas [Em]blind, but [D]now I [G]see\n\n[Verse 2]\n\'Twas [G]grace that taught my [C]heart to [G]fear\nAnd grace my fears re[D]lieved\nHow [G]precious did that [C]grace ap[G]pear\nThe [Em]hour I [D]first be[G]lieved\n\n[Verse 3]\nThrough [G]many dangers, [C]toils and [G]snares\nI have already [D]come\n\'Tis [G]grace hath brought me [C]safe thus [G]far\nAnd [Em]grace will [D]lead me [G]home\n' }
    ];
    songs.forEach(function (s) { s.example = true; s.updatedAt = 0; s.createdAt = 0; data.songs[s.id] = s; });
    data.setlists['ex-gig'] = {
      id: 'ex-gig', name: t('exampleGig'), date: '', example: true, updatedAt: 0, createdAt: 0,
      items: [
        { uid: 'ex1', songId: 'ex-oh-susanna', tr: 0, acc: 'auto' },
        { uid: 'ex2', songId: 'ex-rising-sun', tr: 0, acc: 'auto' },
        { uid: 'ex3', songId: 'ex-amazing-grace', tr: 2, acc: 'auto' }
      ]
    };
    persistLocal();
    ['songs', 'setlists'].forEach(function (k) { Object.keys(data[k]).forEach(function (id) { queueWrite(k, id); }); });
  }

  // Default tags, created once. Fixed ids so two devices never create duplicates.
  var DEFAULT_TAGS = ['Íslenskt', 'Erlent', 'Hresst', 'Rólegt', 'Ballaða', 'Dans', 'Uppklapp'];
  function seedTags() {
    if (Object.keys(data.tags).length) return;
    DEFAULT_TAGS.forEach(function (name, i) {
      var id = 'tg-' + i;
      data.tags[id] = { id: id, name: name, order: i, createdAt: 0, updatedAt: 0 };
      queueWrite('tags', id);
    });
    var ex = { 'ex-oh-susanna': ['tg-1', 'tg-2'], 'ex-rising-sun': ['tg-1', 'tg-3'], 'ex-amazing-grace': ['tg-1', 'tg-4'] };
    Object.keys(ex).forEach(function (id) {
      var sg = data.songs[id];
      if (sg && sg.example && !sg.deleted && !(sg.tags && sg.tags.length)) { var c = clone(sg); c.tags = ex[id]; saveRec('songs', c); }
    });
    persistLocal();
  }

  // ---------- selectors ----------
  var coll = (function () {
    try { return new Intl.Collator('is', { numeric: true }); }
    catch (e) { return { compare: function (a, b) { return a < b ? -1 : a > b ? 1 : 0; } }; }
  })();
  // Formatted by hand: some browsers have no Icelandic month names built in.
  var MONTHS = {
    is: ['jan.', 'feb.', 'mar.', 'apr.', 'maí', 'jún.', 'júl.', 'ágú.', 'sep.', 'okt.', 'nóv.', 'des.'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  };
  function fmtDate(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    var m = (MONTHS[prefs.lang] || MONTHS.en)[d.getMonth()];
    return prefs.lang === 'is' ? d.getDate() + '. ' + m + ' ' + d.getFullYear() : d.getDate() + ' ' + m + ' ' + d.getFullYear();
  }
  function fmtGig(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    return m ? fmtDate(new Date(+m[1], +m[2] - 1, +m[3]).getTime()) : '';
  }
  function liveTags() {
    return Object.keys(data.tags).map(function (id) { return data.tags[id]; })
      .filter(function (tg) { return !tg.deleted && tg.name; })
      .sort(function (a, b) { return ((a.order == null ? 1e9 : a.order) - (b.order == null ? 1e9 : b.order)) || coll.compare(a.name, b.name); });
  }
  function songTags(sg) {
    return (sg.tags || []).map(function (id) { return data.tags[id]; }).filter(function (tg) { return tg && !tg.deleted; });
  }
  function cleanTagName(n) { return String(n || '').trim().replace(/\s+/g, ' ').slice(0, 30); }
  function findOrCreateTag(name) {
    name = cleanTagName(name);
    if (!name) return null;
    var low = name.toLocaleLowerCase('is'), hit = null, maxOrder = -1;
    Object.keys(data.tags).forEach(function (id) {
      var tg = data.tags[id];
      if (tg.order != null && tg.order > maxOrder) maxOrder = tg.order;
      if (String(tg.name).toLocaleLowerCase('is') === low) hit = tg;
    });
    if (hit) {
      if (hit.deleted) { var c = clone(hit); delete c.deleted; c.name = name; saveRec('tags', c); return data.tags[c.id]; }
      return hit;
    }
    var rec = { id: uid('t'), name: name, order: maxOrder + 1, createdAt: Date.now() };
    saveRec('tags', rec);
    return rec;
  }
  function songTitle(s) { return (s && s.title && s.title.trim()) || t('untitled'); }
  function liveSongs() {
    return Object.keys(data.songs).map(function (id) { return data.songs[id]; })
      .filter(function (sg) { return !sg.deleted; })
      .sort(function (a, b) { return coll.compare(songTitle(a), songTitle(b)); });
  }
  function liveSetlists() {
    var mode = prefs.setlistSort;
    return Object.keys(data.setlists).map(function (id) { return data.setlists[id]; })
      .filter(function (sl) { return !sl.deleted; })
      .sort(function (a, b) {
        if (mode === 'name') return coll.compare(a.name || '', b.name || '');
        if (mode === 'edited') return (b.updatedAt || 0) - (a.updatedAt || 0);
        if (mode === 'gig') {
          if (!a.date !== !b.date) return a.date ? -1 : 1;
          return (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0);
        }
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }
  function visibleItems(sl) {
    return (sl.items || []).filter(function (it) { var s = data.songs[it.songId]; return s && !s.deleted; });
  }
  function keyAfter(song, tr) {
    if (!song.key) return tr ? (tr > 0 ? '+' : '') + tr : '–';
    return C.transposeKey(song.key, tr) || song.key;
  }
  function wrapTr(n) { return ((n + 18) % 12 + 12) % 12 - 6; }

  // ---------- toast and dialog ----------
  var toastTimer = 0;
  function toast(msg, action, fn) {
    var el = $('#toast');
    setKids(el, h('span', { text: msg }), action ? h('button', { type: 'button', text: action, onclick: function () { el.hidden = true; fn(); } }) : null);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, action ? 7000 : 3000);
  }
  var dlg = $('#dlg'), dlgOnClose = null;
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDialog(); });
  dlg.addEventListener('close', function () { var f = dlgOnClose; dlgOnClose = null; if (f) f(); });
  function openDialog(content, onClose) {
    dlg.replaceChildren(content);
    dlgOnClose = onClose || null;
    try { if (!dlg.open) dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
  }
  function closeDialog() { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); var f = dlgOnClose; dlgOnClose = null; if (f) f(); } }

  // ---------- song sheet rendering ----------
  function blockKey(b) {
    if (b.type === 'line') return 'l:' + b.segs.map(function (x) { return x.text; }).join('').replace(/\s+/g, ' ').trim().toLowerCase();
    if (b.type === 'tab') return 't:' + (b.lines[0] || '');
    if (b.type === 'empty') return 'e';
    return b.type.charAt(0) + ':' + String(b.text || '').toLowerCase();
  }
  function renderSheet(song, tr, accPref) {
    var parsed = C.parseSong(song.body);
    var sp = C.resolveSpelling(song.key, song.body, tr, accPref || 'auto');
    var root = h('div', { class: 'sheet-body' }), chorusEl = null, hasTab = false;
    parsed.blocks.forEach(function (b, bi) {
      var el;
      if (b.type === 'empty') el = h('div', { class: 'ln gap' });
      else if (b.type === 'section') el = h('div', { class: 'sec', text: b.text });
      else if (b.type === 'comment') el = h('div', { class: 'cmt', text: b.text });
      else if (b.type === 'tab') { hasTab = true; el = h('pre', { class: 'tab', text: b.lines.join('\n') }); }
      else {
        var has = b.segs.some(function (s) { return !!s.chord; });
        var onlyCh = has && b.segs.every(function (s) { return !s.text.trim(); });
        el = h('div', { class: 'ln' + (onlyCh ? ' only-ch' : '') }, C.toGroups(b.segs).map(function (g) {
          return h('span', { class: 'grp' }, g.map(function (u) {
            var chEl = null;
            if (has) {
              var txt = '', an = false;
              if (u.chord) {
                if (u.chord.charAt(0) === '*') { txt = u.chord.slice(1); an = true; }
                else if (!C.isChordish(u.chord) && !u.chord.split(/\s+/).some(function (x) { return C.parseChord(x); })) { txt = u.chord; an = true; }
                else txt = sp.keep ? u.chord : C.transposeBracket(u.chord, tr, sp.flat);
              }
              chEl = h('span', { class: 'ch' + (an ? ' an' : ''), text: txt });
            }
            return h('span', { class: 'u' }, chEl, h('span', { class: 'ly', text: u.text }));
          }));
        }));
      }
      el.setAttribute('data-bi', String(bi));
      el.setAttribute('data-k', blockKey(b));
      if (b.chorus) {
        if (!chorusEl) { chorusEl = h('div', { class: 'chorus' }); root.appendChild(chorusEl); }
        chorusEl.appendChild(el);
      } else { chorusEl = null; root.appendChild(el); }
    });
    if (hasTab && ((tr % 12) + 12) % 12 !== 0) root.appendChild(h('div', { class: 'tabnote', text: t('tabNote') }));
    return root;
  }

  // ---------- views ----------
  var ui = { view: 'songs', search: '', setlistId: null };
  var ed = null; // editor state
  var main = $('#main');

  function setTabs() {
    $('#tab-songs').toggleAttribute('aria-current', false);
    $('#tab-setlists').toggleAttribute('aria-current', false);
    var cur = (ui.view === 'songs' || ui.view === 'edit') ? '#tab-songs' : '#tab-setlists';
    $(cur).setAttribute('aria-current', 'page');
  }
  function go(view, extra) {
    if (ed && ed.dirty) { guardEditor(function () { go(view, extra); }); return; }
    if (ed) leaveEditor();
    ui.view = view;
    if (extra) Object.assign(ui, extra);
    var hash = (view === 'songs' || view === 'edit') ? '#songs' : '#setlists';
    if (location.hash !== hash) { try { history.replaceState(null, '', hash); } catch (e) { location.hash = hash; } }
    render();
    main.scrollTop = 0;
  }
  function render() {
    setTabs();
    if (!ready) { main.replaceChildren(h('div', { class: 'col' }, h('p', { class: 'hint', text: t('loading') }))); return; }
    if (ui.view === 'edit') return renderEditor();
    if (ui.view === 'setlists') return renderSetlists();
    if (ui.view === 'setlist') return renderSetlist();
    renderSongs();
  }
  // Called when synced data arrives. Never rebuilds a view the user is typing in.
  function refreshView() {
    if (!ready) return;
    if (st.open) stageRefresh();
    if (ui.view === 'edit') return;
    var a = document.activeElement;
    if (a && main.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return;
    if (dlg.open) return;
    render();
  }

  // ----- song pool -----
  function groupSongs(rows, mode) {
    if (mode === 'edited') {
      return [{ label: '', items: rows.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }) }];
    }
    if (mode === 'artist') {
      var by = {}, names = [];
      rows.forEach(function (sg) {
        var a = (sg.artist || '').trim(), k = a.toLocaleLowerCase('is');
        if (!by[k]) { by[k] = { label: a || t('noArtist'), items: [], none: !a }; names.push(k); }
        by[k].items.push(sg);
      });
      return names.map(function (k) { return by[k]; })
        .sort(function (a, b) { return (a.none - b.none) || coll.compare(a.label, b.label); });
    }
    if (mode === 'tags') {
      var out = liveTags().map(function (tg) {
        return { label: tg.name, items: rows.filter(function (sg) { return (sg.tags || []).indexOf(tg.id) >= 0; }) };
      }).filter(function (g) { return g.items.length; });
      var none = rows.filter(function (sg) { return !songTags(sg).length; });
      if (none.length) out.push({ label: t('untagged'), items: none });
      return out;
    }
    var groups = [], cur = null;
    rows.forEach(function (sg) {
      var ch = songTitle(sg).trim().charAt(0).toLocaleUpperCase('is');
      if (!/\p{L}/u.test(ch)) ch = '#';
      if (!cur || cur.label !== ch) { cur = { label: ch, items: [] }; groups.push(cur); }
      cur.items.push(sg);
    });
    return groups;
  }
  function renderSongs() {
    var all = liveSongs();
    var tags = liveTags();
    ui.tagFilter = (ui.tagFilter || []).filter(function (id) { return data.tags[id] && !data.tags[id].deleted; });
    var listEl = h('div', { class: 'groups' });
    var filterEl = h('div', { class: 'tagfilter', role: 'group', 'aria-label': t('tags') });
    function songRow(sg) {
      var names = songTags(sg).map(function (tg) { return tg.name; }).join(', ');
      var sub = [sg.artist, names].filter(Boolean).join(' · ');
      return h('div', { class: 'row' },
        h('button', { class: 'open', type: 'button', onclick: function () { openStage({ songId: sg.id, tr: 0, acc: 'auto' }); } },
          h('span', { class: 't' }, h('b', { text: songTitle(sg) }), sub ? h('small', { text: sub }) : null),
          h('span', { class: 'meta' },
            sg.example ? h('span', { class: 'tag', text: t('example') }) : null,
            prefs.poolSort === 'edited' && sg.updatedAt ? h('span', { class: 'bpm', text: fmtDate(sg.updatedAt) }) : null,
            prefs.poolSort !== 'edited' && sg.bpm ? h('span', { class: 'bpm', text: sg.bpm + ' BPM' }) : null,
            sg.key ? h('span', { class: 'chip', text: sg.key }) : null)),
        h('span', { class: 'acts' },
          iconBtn('listadd', t('addToSetlist'), function () { chooseSetlistFor(sg); }),
          iconBtn('edit', t('edit'), function () { openEditor(sg.id); }),
          iconBtn('trash', t('del'), function () { deleteSong(sg.id); })));
    }
    function drawFilter() {
      setKids.apply(null, [filterEl].concat(tags.map(function (tg) {
        var on = ui.tagFilter.indexOf(tg.id) >= 0;
        return h('button', { class: 'tagchip', type: 'button', 'aria-pressed': String(on), text: tg.name, onclick: function () {
          if (on) ui.tagFilter = ui.tagFilter.filter(function (x) { return x !== tg.id; }); else ui.tagFilter.push(tg.id);
          drawFilter(); drawList();
        } });
      }), ui.tagFilter.length ? [h('button', { class: 'btn ghost small', type: 'button', text: t('clearFilter'), onclick: function () { ui.tagFilter = []; drawFilter(); drawList(); } })] : []));
    }
    function drawList() {
      var q = ui.search.trim().toLocaleLowerCase();
      var rows = all.filter(function (sg) {
        if (q && (songTitle(sg) + ' ' + (sg.artist || '')).toLocaleLowerCase().indexOf(q) < 0) return false;
        return ui.tagFilter.every(function (id) { return (sg.tags || []).indexOf(id) >= 0; });
      });
      if (!rows.length) { setKids(listEl, h('div', { class: 'empty', text: all.length ? t('noMatch') : t('noSongs') })); return; }
      setKids.apply(null, [listEl].concat(groupSongs(rows, prefs.poolSort).map(function (g) {
        return h('section', { class: 'group' },
          g.label ? h('h2', { class: 'grouphead' }, h('span', { text: g.label }), h('small', { text: String(g.items.length) })) : null,
          h('div', { class: 'rows' }, g.items.map(songRow)));
      })));
    }
    var searchInput = h('input', { class: 'input', id: 'song-search', type: 'search', placeholder: t('searchSongs'), 'aria-label': t('searchSongs'), value: ui.search,
      oninput: function () { ui.search = searchInput.value; drawList(); } });
    var sortSel = h('select', { class: 'input select', id: 'pool-sort', 'aria-label': t('sortBy'), onchange: function () { prefs.poolSort = sortSel.value; savePrefs(); drawList(); } },
      [['title', t('sortTitle')], ['artist', t('sortArtist')], ['tags', t('sortTags')], ['edited', t('sortEdited')]].map(function (o) {
        return h('option', { value: o[0], selected: prefs.poolSort === o[0], text: o[1] });
      }));
    drawFilter();
    drawList();
    main.replaceChildren(h('div', { class: 'col' },
      h('div', { class: 'pagehead' },
        h('h1', { text: t('songPool') }),
        h('span', { class: 'count', text: t('nSongs')(all.length) }),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', onclick: openImport }, ico('import'), t('importSong')),
        h('button', { class: 'btn', type: 'button', onclick: exportLibrary }, ico('export'), t('exportBtn')),
        h('button', { class: 'btn primary', type: 'button', onclick: function () { openEditor(null); } }, ico('plus'), t('newSong'))),
      h('div', { class: 'poolbar' },
        h('label', { class: 'search' }, ico('search'), searchInput),
        h('label', { class: 'sortbox' }, h('span', { text: t('sortBy') }), sortSel)),
      tags.length ? filterEl : null,
      listEl));
  }
  // Prefer the formatted copy when it marks chords (Guitarparty), else the plain text.
  function clipboardSong(e) {
    var txt = '', html = '';
    try { txt = (e.clipboardData && e.clipboardData.getData('text/plain')) || ''; } catch (err) { txt = ''; }
    try { html = (e.clipboardData && e.clipboardData.getData('text/html')) || ''; } catch (err) { html = ''; }
    var fromHtml = null;
    try { fromHtml = C.htmlToChordText(html); } catch (err) { fromHtml = null; }
    return { text: fromHtml || txt, raw: txt, html: !!fromHtml };
  }
  function openImport() {
    var ta = h('textarea', { class: 'input importta', id: 'import-text', placeholder: t('importPlaceholder'), spellcheck: 'false', autocapitalize: 'off', 'aria-label': t('importTitle') });
    var err = h('span', { class: 'hint bad', text: t('importEmpty'), hidden: true });
    ta.addEventListener('paste', function (e) {
      var c = clipboardSong(e);
      if (!c.html) return;
      e.preventDefault();
      var a = ta.selectionStart, b = ta.selectionEnd;
      ta.value = ta.value.slice(0, a) + c.text + ta.value.slice(b);
      ta.setSelectionRange(a + c.text.length, a + c.text.length);
      err.hidden = true;
    });
    var fileIn = h('input', { type: 'file', id: 'import-file', multiple: true, hidden: true,
      accept: '.json,.txt,.cho,.crd,.chopro,.chordpro,.pro,text/plain,application/json' });
    fileIn.addEventListener('change', function () { if (fileIn.files && fileIn.files.length) importFiles(fileIn.files); fileIn.value = ''; });
    function doImport() {
      if (!ta.value.trim()) { err.hidden = false; ta.focus(); return; }
      var bundle = C.parseBundle(ta.value);
      if (bundle) { showMergeSummary(bundle, []); return; }
      var r = C.importText(ta.value);
      var rec = { id: uid('s'), title: r.title, artist: r.artist, key: r.key, bpm: r.bpm, body: r.body, tags: [], createdAt: Date.now() };
      closeDialog();
      openEditor(null, null, rec);
      toast(r.keyGuessed ? t('importedGuess') : t('imported'));
    }
    openDialog(h('div', { class: 'dlg wide' },
      h('h2', { text: t('importTitle') }),
      h('p', { class: 'hint', text: t('importHint') }),
      ta, err,
      h('div', { class: 'filerow' }, h('span', { class: 'hint', text: t('fileHint') }),
        h('button', { class: 'btn', type: 'button', onclick: function () { fileIn.click(); } }, ico('file'), t('openFile')), fileIn),
      h('div', { class: 'foot' },
        h('button', { class: 'btn ghost', type: 'button', text: t('cancel'), onclick: closeDialog }),
        h('button', { class: 'btn primary', type: 'button', onclick: doImport }, ico('import'), t('importBtn')))));
    setTimeout(function () { ta.focus(); }, 0);
  }
  function deleteSong(id) {
    var s = clone(data.songs[id]); s.deleted = true; saveRec('songs', s); render();
    toast(t('songDeleted'), t('undo'), function () { var r = clone(data.songs[id]); delete r.deleted; saveRec('songs', r); render(); });
  }
  function chooseSetlistFor(song) {
    function addTo(sl) {
      var c = clone(sl);
      (c.items || (c.items = [])).push({ uid: uid('i'), songId: song.id, tr: 0, acc: 'auto' });
      saveRec('setlists', c); closeDialog(); toast(t('addedTo') + ' ' + (c.name || t('untitled')));
    }
    var lists = liveSetlists();
    openDialog(h('div', { class: 'dlg' },
      h('h2', { text: t('chooseSetlist') }),
      h('div', { class: 'hint', text: songTitle(song) }),
      lists.length ? h('div', { class: 'list' }, lists.map(function (sl) {
        return h('div', { class: 'item' },
          h('span', { class: 't' }, h('b', { text: sl.name || t('untitled') }), h('small', { text: t('nSongs')(visibleItems(sl).length) })),
          h('button', { class: 'btn', type: 'button', text: t('add'), onclick: function () { addTo(sl); } }));
      })) : null,
      h('div', { class: 'foot' },
        h('button', { class: 'btn', type: 'button', onclick: function () { addTo(newSetlistRec()); } }, ico('plus'), t('newSetlist')),
        h('button', { class: 'btn ghost', type: 'button', text: t('close'), onclick: closeDialog }))));
  }

  // ----- files -----
  var downloadsP = null;
  function getDownloads() {
    if (!downloadsP) {
      var api = window.claude;
      downloadsP = (api && typeof api.use === 'function') ? Promise.resolve(api.use('downloads')).catch(function () { return null; }) : Promise.resolve(null);
    }
    return downloadsP;
  }
  function safeName(n) { return String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Songgiggin'; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function saveFile(filename, text) {
    return getDownloads().then(function (dl) {
      if (dl) {
        return dl.save({ filename: filename, data: text }).then(function () { toast(t('fileSaved')); }, function (e) {
          var c = e && e.code;
          if (c === 'declined') return;
          toast(c === 'rate_limited' ? t('fileBusy') : t('fileFailed'));
        });
      }
      // Outside Claude: an ordinary browser download.
      try {
        var url = URL.createObjectURL(new Blob([text], { type: /\.json$/.test(filename) ? 'application/json' : 'text/plain' }));
        var a = h('a', { href: url, download: filename, hidden: true });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      } catch (err) { toast(t('fileFailed')); }
    });
  }
  function copyText(text, box) {
    function manual() { box.hidden = false; box.value = text; box.focus(); box.select(); toast(t('copyManual')); }
    try { navigator.clipboard.writeText(text).then(function () { toast(t('copied')); }, manual); } catch (e) { manual(); }
  }
  function openExport(title, desc, filename, text) {
    var box = h('textarea', { class: 'input importta', readonly: true, hidden: true, 'aria-label': title });
    openDialog(h('div', { class: 'dlg' },
      h('h2', { text: title }),
      h('p', { class: 'hint', text: desc }),
      h('p', { class: 'filename' }, ico('file'), h('span', { text: filename })),
      box,
      h('div', { class: 'foot' },
        h('button', { class: 'btn ghost', type: 'button', text: t('close'), onclick: closeDialog }),
        h('button', { class: 'btn', type: 'button', onclick: function () { copyText(text, box); } }, ico('copy'), t('copy')),
        h('button', { class: 'btn primary', type: 'button', onclick: function () { saveFile(filename, text); } }, ico('import'), t('download')))));
  }
  function exportLibrary() {
    var b = C.exportBundle(data, 'library');
    openExport(t('exportLib'), t('exportLibDesc') + ' ' + t('nSongs')(b.songs.length) + ', ' + t('nLists')(b.setlists.length) + '.',
      'Songgiggin ' + today() + '.json', JSON.stringify(b, null, 1));
  }
  function exportSetlist(id) {
    var b = C.exportBundle(data, 'setlist', id), sl = data.setlists[id];
    openExport(t('exportSetlist'), t('exportSetlistDesc') + ' ' + t('nSongs')(b.songs.length) + '.',
      safeName('Songgiggin - ' + (sl.name || t('untitled'))) + '.json', JSON.stringify(b, null, 1));
  }
  function exportSong(rec) {
    openExport(t('exportSong'), t('exportSongDesc'), safeName([rec.title || t('untitled'), rec.artist].filter(Boolean).join(' - ')) + '.txt', C.songToChordPro(rec));
  }
  function songFromImport(r, fallbackTitle) {
    return { id: uid('s'), title: r.title || fallbackTitle || '', artist: r.artist, key: r.key, bpm: r.bpm, body: r.body, tags: [], createdAt: Date.now() };
  }
  // Files picked in the import dialog: Songgiggin files are merged, text files become songs.
  function importFiles(files) {
    return Promise.all(Array.prototype.map.call(files, function (f) {
      return (f.text ? f.text() : new Response(f).text()).then(function (txt) { return { name: f.name, text: txt }; }, function () { return { name: f.name, text: '' }; });
    })).then(function (list) {
      var bundle = { songs: [], setlists: [], tags: [] }, songs = [], bad = 0;
      list.forEach(function (f) {
        var b = C.parseBundle(f.text);
        if (b) { bundle.songs = bundle.songs.concat(b.songs); bundle.setlists = bundle.setlists.concat(b.setlists); bundle.tags = bundle.tags.concat(b.tags); return; }
        if (!f.text.trim() || /\u0000/.test(f.text)) { bad++; return; }
        songs.push(songFromImport(C.importText(f.text), String(f.name || '').replace(/\.[^.]+$/, '')));
      });
      if (!bundle.songs.length && !bundle.setlists.length && songs.length === 1 && !bad) {
        closeDialog(); openEditor(null, null, songs[0]); toast(t('imported')); return;
      }
      if (!bundle.songs.length && !bundle.setlists.length && !songs.length) { toast(t('mBad')); return; }
      showMergeSummary(bundle, songs);
    });
  }
  function showMergeSummary(bundle, textSongs) {
    var plan = C.planMerge(data, bundle);
    var rows = [
      [t('mNewSongs'), plan.songs.add.length + textSongs.length], [t('mUpdSongs'), plan.songs.update.length],
      [t('mSameSongs'), plan.songs.same], [t('mKeepSongs'), plan.songs.keep],
      [t('mNewLists'), plan.setlists.add.length], [t('mUpdLists'), plan.setlists.update.length],
      [t('mSameLists'), plan.setlists.same], [t('mKeepLists'), plan.setlists.keep]
    ].filter(function (r) { return r[1]; });
    var changes = plan.songs.add.length + plan.songs.update.length + plan.setlists.add.length + plan.setlists.update.length + plan.tags.length + textSongs.length;
    openDialog(h('div', { class: 'dlg' },
      h('h2', { text: t('mTitle') }),
      h('p', { class: 'hint', text: t('mInFile') + ': ' + t('nSongs')(bundle.songs.length + textSongs.length) + ', ' + t('nLists')(bundle.setlists.length) + '.' }),
      h('div', { class: 'list summary' }, rows.map(function (r) {
        return h('div', { class: 'item' }, h('span', { class: 't', text: r[0] }), h('b', { class: 'num', text: String(r[1]) }));
      }), plan.tags.length ? h('div', { class: 'item' }, h('span', { class: 't', text: t('mNewTags') }),
        h('span', { class: 'tagnames', text: plan.tags.map(function (x) { return x.name; }).join(', ') })) : null),
      changes ? null : h('p', { text: t('mNothing') }),
      h('div', { class: 'foot' },
        h('button', { class: 'btn ghost', type: 'button', text: changes ? t('cancel') : t('close'), onclick: closeDialog }),
        changes ? h('button', { class: 'btn primary', type: 'button', onclick: function () {
          plan.tags.forEach(function (r) { putRec('tags', r); });
          plan.songs.add.concat(plan.songs.update).forEach(function (r) { putRec('songs', r); });
          plan.setlists.add.concat(plan.setlists.update).forEach(function (r) { putRec('setlists', r); });
          textSongs.forEach(function (r) { saveRec('songs', r); });
          closeDialog(); render(); toast(t('mDone'));
        } }, ico('import'), t('importBtn')) : null)));
  }

  // ----- setlists -----
  function newSetlistRec() {
    return { id: uid('l'), name: t('newSetlist'), date: '', items: [], createdAt: Date.now(), updatedAt: 0 };
  }
  function setlistDates(sl) {
    return [sl.createdAt ? t('created') + ' ' + fmtDate(sl.createdAt) : '', sl.updatedAt ? t('edited') + ' ' + fmtDate(sl.updatedAt) : ''].filter(Boolean).join(' · ');
  }
  function renderSetlists() {
    var lists = liveSetlists();
    var sortSel = h('select', { class: 'input select', id: 'setlist-sort', 'aria-label': t('sortBy'), onchange: function () { prefs.setlistSort = sortSel.value; savePrefs(); render(); } },
      [['created', t('sortCreated')], ['edited', t('slSortEdited')], ['gig', t('sortGig')], ['name', t('sortName')]].map(function (o) {
        return h('option', { value: o[0], selected: prefs.setlistSort === o[0], text: o[1] });
      }));
    main.replaceChildren(h('div', { class: 'col' },
      h('div', { class: 'pagehead' },
        h('h1', { text: t('setlists') }),
        h('span', { class: 'spacer' }),
        h('label', { class: 'sortbox' }, h('span', { text: t('sortBy') }), sortSel),
        h('button', { class: 'btn primary', type: 'button', onclick: function () {
          var sl = newSetlistRec(); saveRec('setlists', sl); go('setlist', { setlistId: sl.id });
          var n = $('#setlist-name'); if (n) { n.focus(); n.select(); }
        } }, ico('plus'), t('newSetlist'))),
      lists.length ? h('div', { class: 'lists' }, lists.map(function (sl) {
        var dates = setlistDates(sl);
        return h('button', { class: 'listcard', type: 'button', onclick: function () { go('setlist', { setlistId: sl.id }); } },
          sl.date ? h('span', { class: 'gigdate', text: fmtGig(sl.date) }) : null,
          h('b', { text: sl.name || t('untitled') }),
          h('small', { text: t('nSongs')(visibleItems(sl).length) }),
          dates ? h('small', { class: 'dates', text: dates }) : null,
          sl.example ? h('span', null, h('span', { class: 'tag', text: t('example') })) : null);
      })) : h('div', { class: 'empty', text: t('noSetlists') })));
  }

  var nameTimer = 0;
  function renderSetlist() {
    var sl = data.setlists[ui.setlistId];
    if (!sl || sl.deleted) { ui.view = 'setlists'; return renderSetlists(); }
    var items = visibleItems(sl);
    function mutate(fn) { var c = clone(data.setlists[sl.id]); fn(c); if (c.example) delete c.example; saveRec('setlists', c); }
    function idxOf(c, itUid) { for (var i = 0; i < c.items.length; i++) if (c.items[i].uid === itUid) return i; return -1; }

    var nameInput = h('input', { class: 'name', id: 'setlist-name', type: 'text', value: sl.name || '', 'aria-label': t('setlistName'), placeholder: t('setlistName'),
      oninput: function () {
        clearTimeout(nameTimer);
        nameTimer = setTimeout(function () { mutate(function (c) { c.name = nameInput.value; }); }, 600);
      } });
    var dateInput = h('input', { class: 'input', id: 'setlist-date', type: 'date', value: sl.date || '', 'aria-label': t('date'), style: 'width:auto',
      onchange: function () { mutate(function (c) { c.date = dateInput.value; }); } });

    var listEl = items.length ? h('ol', { class: 'setsongs' }, items.map(function (it, i) {
      var song = data.songs[it.songId], tr = it.tr || 0;
      function shift(d) { mutate(function (c) { var k = idxOf(c, it.uid); if (k >= 0) c.items[k].tr = wrapTr((c.items[k].tr || 0) + d); }); render(); }
      function move(d) {
        var other = items[i + d]; if (!other) return;
        mutate(function (c) { var a = idxOf(c, it.uid), b = idxOf(c, other.uid); var tmp = c.items[a]; c.items[a] = c.items[b]; c.items[b] = tmp; });
        render();
      }
      return h('li', null,
        h('span', { class: 'num', text: String(i + 1) }),
        h('button', { class: 'open', type: 'button', onclick: function () { openStage({ setlistId: sl.id, index: i }); } },
          h('b', { text: songTitle(song) }), song.artist ? h('small', { text: song.artist }) : null),
        h('span', { class: 'keybox' },
          textBtn('−', t('keyDown'), function () { shift(-1); }),
          h('span', { class: 'keys' },
            h('span', { class: 'k' }, h('small', { text: t('original') }), h('b', { text: song.key || '–' })),
            h('span', { class: 'k cur' }, h('small', { text: t('inSetlist') }), h('b', { text: keyAfter(song, tr) }))),
          textBtn('+', t('keyUp'), function () { shift(1); })),
        h('span', { class: 'acts' },
          iconBtn('up', t('moveUp'), function () { move(-1); }, i === 0 ? 'off' : ''),
          iconBtn('down', t('moveDown'), function () { move(1); }, i === items.length - 1 ? 'off' : ''),
          iconBtn('x', t('remove'), function () { mutate(function (c) { var k = idxOf(c, it.uid); if (k >= 0) c.items.splice(k, 1); }); render(); })));
    })) : h('div', { class: 'empty', text: t('emptySetlist') });
    Array.prototype.forEach.call(listEl.querySelectorAll('.iconbtn.off'), function (b) { b.disabled = true; });

    main.replaceChildren(h('div', { class: 'col' },
      h('div', { class: 'sethead' },
        h('div', null, h('button', { class: 'btn ghost', type: 'button', onclick: function () { go('setlists'); } }, ico('left'), t('setlists'))),
        nameInput,
        h('div', { class: 'bar' },
          h('button', { class: 'btn primary', type: 'button', disabled: !items.length, onclick: function () { openStage({ setlistId: sl.id, index: 0 }); } }, ico('play'), t('start')),
          h('button', { class: 'btn', type: 'button', onclick: function () { pickSongs(sl.id); } }, ico('plus'), t('addSongs')),
          h('button', { class: 'btn', type: 'button', onclick: function () { exportSetlist(sl.id); } }, ico('export'), t('exportBtn')),
          h('label', { class: 'datebox' }, h('span', { text: t('gigDate') }), dateInput),
          h('span', { class: 'count hint', text: [t('nSongs')(items.length), setlistDates(sl)].filter(Boolean).join(' · ') }),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn ghost danger', type: 'button', onclick: function () {
            var id = sl.id; mutate(function (c) { c.deleted = true; }); go('setlists');
            toast(t('setlistDeleted'), t('undo'), function () { var r = clone(data.setlists[id]); delete r.deleted; saveRec('setlists', r); render(); });
          } }, ico('trash'), t('deleteSetlist')))),
      listEl));
  }
  function pickSongs(setlistId) {
    var q = '';
    var listEl = h('div', { class: 'list' });
    function count(id) { return visibleItems(data.setlists[setlistId]).filter(function (it) { return it.songId === id; }).length; }
    function draw() {
      var rows = liveSongs().filter(function (s) { return !q || (songTitle(s) + ' ' + (s.artist || '')).toLocaleLowerCase().indexOf(q) >= 0; });
      listEl.replaceChildren.apply(listEl, rows.length ? rows.map(function (s) {
        var n = count(s.id);
        return h('div', { class: 'item' },
          h('span', { class: 't' }, h('b', { text: songTitle(s) }), h('small', { text: [s.artist, s.key].filter(Boolean).join(' · ') })),
          n ? h('span', { class: 'chip', text: '×' + n }) : null,
          h('button', { class: 'btn', type: 'button', onclick: function () {
            var c = clone(data.setlists[setlistId]);
            (c.items || (c.items = [])).push({ uid: uid('i'), songId: s.id, tr: 0, acc: 'auto' });
            if (c.example) delete c.example;
            saveRec('setlists', c); draw();
          } }, ico('plus'), t('add')));
      }) : [h('div', { class: 'item hint', text: t('noMatch') })]);
    }
    var search = h('input', { class: 'input', id: 'pick-search', type: 'search', placeholder: t('searchSongs'), 'aria-label': t('searchSongs'),
      oninput: function () { q = search.value.trim().toLocaleLowerCase(); draw(); } });
    draw();
    openDialog(h('div', { class: 'dlg' },
      h('h2', { text: t('addSongs') }), search, listEl,
      h('div', { class: 'foot' }, h('button', { class: 'btn primary', type: 'button', text: t('done'), onclick: closeDialog }))),
      function () { render(); });
  }

  // ----- editor -----
  function openEditor(songId, ret, draft) {
    if (ed && ed.dirty) { guardEditor(function () { openEditor(songId, ret, draft); }); return; }
    if (ed) leaveEditor();
    var rec = draft || (songId ? clone(data.songs[songId]) : { id: uid('s'), title: '', artist: '', key: '', bpm: '', body: '', tags: [], createdAt: Date.now(), updatedAt: 0 });
    ed = { rec: rec, isNew: !songId, dirty: !!draft, ret: ret || null };
    ui.view = 'edit';
    render();
    main.scrollTop = 0;
  }
  function backToStage() {
    var ret = ed && ed.ret;
    if (!ret) return;
    if (ed.dirty) { guardEditor(backToStage); return; }
    leaveEditor();
    ui.view = ret.back.view === 'edit' ? 'songs' : ret.back.view;
    ui.setlistId = ret.back.setlistId;
    render();
    openStage(ret.ctx);
  }
  function edSave() {
    if (!ed) return;
    var r = ed.rec;
    if (r.example) delete r.example;
    if (!r.createdAt) r.createdAt = Date.now();
    saveRec('songs', clone(r));
    r.updatedAt = data.songs[r.id].updatedAt;
    ed.isNew = false; ed.dirty = false;
    edStatus();
    toast(t('saved'));
  }
  function edStatus() {
    var s = $('#ed-status'), b = $('#ed-save');
    if (s) { s.textContent = ed.dirty ? t('unsaved') : (ed.isNew ? '' : t('saved')); s.classList.toggle('warn', ed.dirty); }
    if (b) b.disabled = !ed.dirty;
  }
  function edTouch() { if (!ed) return; ed.dirty = true; edStatus(); }
  function leaveEditor() { ed = null; }
  // Unsaved changes: ask before leaving. next() runs after Save or Discard, never after Cancel.
  function guardEditor(next) {
    if (!ed || !ed.dirty) { next(); return; }
    var isNew = ed.isNew;
    openDialog(h('div', { class: 'dlg' },
      h('h2', { text: t('unsavedTitle') }),
      h('p', { text: isNew ? t('unsavedNew') : t('unsavedText') }),
      h('div', { class: 'foot' },
        h('button', { class: 'btn ghost', type: 'button', text: t('cancel'), onclick: closeDialog }),
        h('button', { class: 'btn danger', type: 'button', onclick: function () {
          var id = ed.rec.id;
          closeDialog();
          if (data.songs[id] && !data.songs[id].deleted) { ed.rec = clone(data.songs[id]); ed.dirty = false; ed.isNew = false; }
          else { ed = null; ui.view = 'songs'; }
          next();
        } }, ico('trash'), t('discard')),
        h('button', { class: 'btn primary', type: 'button', onclick: function () { closeDialog(); edSave(); next(); } }, t('save')))));
  }
  window.addEventListener('beforeunload', function (e) { if (ed && ed.dirty) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && ui.view === 'edit' && ed && !st.open) { e.preventDefault(); if (ed.dirty) edSave(); }
  });

  function renderEditor() {
    var r = ed.rec;
    var preview = h('div', { class: 'preview' });
    function drawPreview() { preview.replaceChildren(h('h2', { text: t('preview') }), renderSheet(r, 0, 'auto')); }

    function field(id, label, value, oninput, attrs) {
      var input = h('input', Object.assign({ class: 'input', id: id, type: 'text', value: value || '', autocomplete: 'off' }, attrs || {}));
      input.addEventListener('input', function () { oninput(input); });
      return { wrap: h('label', { class: 'field' }, h('span', { text: label }), input), input: input };
    }
    var fTitle = field('ed-title', t('title'), r.title, function (i) { r.title = i.value; edTouch(); });
    var fArtist = field('ed-artist', t('artist'), r.artist, function (i) { r.artist = i.value; edTouch(); }, { list: 'artist-list' });
    (function () {
      var seen = {}, names = [];
      liveSongs().forEach(function (sg) {
        var a = (sg.artist || '').trim(), k = a.toLocaleLowerCase('is');
        if (a && !seen[k] && !sg.example) { seen[k] = 1; names.push(a); }
      });
      names.sort(coll.compare);
      fArtist.wrap.appendChild(h('datalist', { id: 'artist-list' }, names.map(function (n) { return h('option', { value: n }); })));
    })();
    var keyHint = h('span', { class: 'hint bad', text: t('keyHint'), hidden: true });
    var fKey = field('ed-key', t('key'), r.key, function (i) {
      var v = i.value.trim(), norm = v ? C.normalizeKey(v) : '';
      var bad = !!v && !norm;
      i.classList.toggle('bad', bad); keyHint.hidden = !bad;
      if (!bad) { r.key = norm; edTouch(); drawPreview(); }
    }, { placeholder: 'G, Em, Bb', maxlength: '8' });
    fKey.input.addEventListener('blur', function () { if (!fKey.input.classList.contains('bad')) fKey.input.value = r.key || ''; });
    fKey.wrap.appendChild(keyHint);
    var fBpm = field('ed-bpm', t('tempo'), r.bpm, function (i) { var n = parseInt(i.value, 10); r.bpm = n > 0 ? clamp(n, 20, 400) : ''; edTouch(); }, { inputmode: 'numeric', maxlength: '3' });

    var ta = h('textarea', { id: 'ed-body', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': t('lyricsChords') });
    ta.value = r.body || '';
    function bodyChanged() { r.body = ta.value; edTouch(); drawPreview(); }
    function fillMeta() {
      var m = C.parseSong(ta.value).meta;
      if (m.title && !r.title) { r.title = m.title; fTitle.input.value = m.title; }
      if (m.artist && !r.artist) { r.artist = m.artist; fArtist.input.value = m.artist; }
      if (m.key && !r.key && C.normalizeKey(m.key)) { r.key = C.normalizeKey(m.key); fKey.input.value = r.key; }
      if (m.bpm && !r.bpm && parseInt(m.bpm, 10) > 0) { r.bpm = parseInt(m.bpm, 10); fBpm.input.value = r.bpm; }
    }
    function replaceRange(a, b, text, caret) {
      ta.value = ta.value.slice(0, a) + text + ta.value.slice(b);
      var p = caret == null ? a + text.length : caret;
      ta.focus(); ta.setSelectionRange(p, p);
      bodyChanged();
    }
    ta.addEventListener('input', bodyChanged);
    ta.addEventListener('paste', function (e) {
      var c = clipboardSong(e), txt = c.text;
      if (txt && !ta.value.trim() && /\n/.test(txt.trim())) {
        e.preventDefault();
        var imp = C.importText(txt);
        if (imp.title && !r.title) { r.title = imp.title; fTitle.input.value = imp.title; }
        if (imp.artist && !r.artist) { r.artist = imp.artist; fArtist.input.value = imp.artist; }
        if (imp.key && !r.key) { r.key = imp.key; fKey.input.value = imp.key; }
        if (imp.bpm && !r.bpm) { r.bpm = imp.bpm; fBpm.input.value = imp.bpm; }
        replaceRange(0, ta.value.length, imp.body, 0);
        ta.scrollTop = 0;
        toast(imp.keyGuessed ? t('importedGuess') : t('imported'), t('undo'), function () { ta.value = ''; bodyChanged(); });
        return;
      }
      if (c.html) {
        e.preventDefault();
        replaceRange(ta.selectionStart, ta.selectionEnd, txt);
        return;
      }
      if (txt && C.looksLikeChordsOverLyrics(txt)) {
        e.preventDefault();
        var before = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
        replaceRange(a, b, C.convertChordsOverLyrics(txt));
        fillMeta();
        toast(t('converted'), t('undo'), function () { ta.value = before.slice(0, a) + txt + before.slice(b); bodyChanged(); });
      } else setTimeout(function () { fillMeta(); bodyChanged(); }, 0);
    });

    function findChord(val, pos) {
      var ls = val.lastIndexOf('\n', pos - 1) + 1, le = val.indexOf('\n', pos);
      if (le < 0) le = val.length;
      var re = /\[[^\[\]\n]*\]/g, line = val.slice(ls, le), m;
      while ((m = re.exec(line))) { var a = ls + m.index, b = a + m[0].length; if (pos >= a && pos <= b) return { a: a, b: b }; }
      return null;
    }
    function nudge(dir) {
      var v = ta.value, c = findChord(v, ta.selectionStart);
      if (!c) { toast(t('nudgeHint')); ta.focus(); return; }
      var chord = v.slice(c.a, c.b), nv, na;
      if (dir > 0) {
        if (c.b >= v.length || v[c.b] === '\n') { ta.focus(); return; }
        var j = c.b + 1;
        if (v[c.b] === '[') { var close = v.indexOf(']', c.b); if (close < 0) return; j = close + 1; }
        nv = v.slice(0, c.a) + v.slice(c.b, j) + chord + v.slice(j); na = c.a + (j - c.b);
      } else {
        if (c.a <= 0 || v[c.a - 1] === '\n') { ta.focus(); return; }
        var i = c.a - 1;
        if (v[i] === ']') { var open = v.lastIndexOf('[', i); if (open < 0) return; i = open; }
        nv = v.slice(0, i) + chord + v.slice(i, c.a) + v.slice(c.b); na = i;
      }
      ta.value = nv; ta.focus(); ta.setSelectionRange(na + 1, na + 1); bodyChanged();
    }
    ta.addEventListener('keydown', function (e) {
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); nudge(e.key === 'ArrowRight' ? 1 : -1); }
    });
    function tool(label, fn, iconName, aria) {
      var b = h('button', { class: 'btn', type: 'button', title: aria || label, 'aria-label': aria || label, onclick: fn }, iconName ? ico(iconName) : null, label);
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); }); // keep the cursor in the text
      return b;
    }
    var tools = h('div', { class: 'tools' },
      tool(t('insertChord'), function () { var a = ta.selectionStart; replaceRange(a, ta.selectionEnd, '[]', a + 1); }),
      tool('', function () { nudge(-1); }, 'left', t('chordLeft')),
      tool('', function () { nudge(1); }, 'right', t('chordRight')),
      h('span', { class: 'sep' }),
      tool(t('insertTab'), function () {
        var a = ta.selectionStart, pre = (a > 0 && ta.value[a - 1] !== '\n') ? '\n' : '';
        replaceRange(a, ta.selectionEnd, pre + '{start_of_tab}\ne|----------------|\nB|----------------|\nG|----------------|\nD|----------------|\nA|----------------|\nE|----------------|\n{end_of_tab}\n');
      }),
      tool(t('convert'), function () {
        var before = ta.value, conv = C.convertChordsOverLyrics(before);
        if (conv === before) { toast(t('nothingToConvert')); return; }
        ta.value = conv; bodyChanged();
        toast(t('converted'), t('undo'), function () { ta.value = before; bodyChanged(); });
      }));

    // tags
    if (!r.tags) r.tags = [];
    var tagBox = h('div', { class: 'tagrow', role: 'group', 'aria-label': t('tags') });
    var newTag = h('input', { class: 'input taginput', id: 'ed-newtag', type: 'text', placeholder: t('newTag'), maxlength: '30', 'aria-label': t('newTag'), autocomplete: 'off' });
    function addNewTag() {
      var tg = findOrCreateTag(newTag.value);
      newTag.value = '';
      if (tg && r.tags.indexOf(tg.id) < 0) { r.tags.push(tg.id); edTouch(); }
      drawTags(); newTag.focus();
    }
    newTag.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addNewTag(); } });
    function drawTags() {
      setKids.apply(null, [tagBox, h('span', { class: 'lbl', text: t('tags') })].concat(liveTags().map(function (tg) {
        var on = r.tags.indexOf(tg.id) >= 0;
        return h('button', { class: 'tagchip', type: 'button', 'aria-pressed': String(on), text: tg.name, onclick: function () {
          if (on) r.tags = r.tags.filter(function (x) { return x !== tg.id; }); else r.tags.push(tg.id);
          edTouch(); drawTags();
        } });
      }), [h('span', { class: 'newtag' }, newTag, iconBtn('plus', t('addTag'), addNewTag))]));
    }
    drawTags();

    drawPreview();
    main.replaceChildren(h('div', { class: 'col' },
      h('div', { class: 'edhead' },
        h('button', { class: 'btn ghost', type: 'button', onclick: function () { go('songs'); } }, ico('left'), t('songPool')),
        h('span', { class: 'hint', id: 'ed-status' }),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn primary', id: 'ed-save', type: 'button', onclick: edSave }, t('save')),
        iconBtn('export', t('exportSong'), function () { exportSong(ed.rec); }),
        ed.ret
          ? h('button', { class: 'btn', type: 'button', onclick: backToStage }, ico('play'), t('backToStage'))
          : h('button', { class: 'btn', type: 'button', onclick: function () {
            guardEditor(function () {
              if (!ed) { render(); return; }
              if (ui.view === 'edit') render();
              if (data.songs[ed.rec.id]) openStage({ songId: ed.rec.id, tr: 0, acc: 'auto' });
            });
          } }, ico('play'), t('stageView')),
        h('button', { class: 'btn ghost danger', type: 'button', onclick: function () {
          var id = r.id, existed = !!data.songs[id];
          ed = null; ui.view = 'songs';
          if (existed) deleteSong(id); else render();
        } }, ico('trash'), t('del'))),
      h('div', { class: 'fields' }, fTitle.wrap, fArtist.wrap, fKey.wrap, fBpm.wrap),
      tagBox,
      tools,
      h('div', { class: 'split' }, ta, preview),
      h('p', { class: 'help', html: t('help') })));
    edStatus();
    if (ed.isNew && !ed.dirty) fTitle.input.focus();
  }

  // ---------- stage view ----------
  var st = { open: false, ctx: null, tr: 0, acc: 'auto', speed: 10, playing: false, pos: 0, last: 0, raf: 0, el: null, lock: null, stamp: '', saveTimer: 0 };
  var stageEl = $('#stage');

  function stageInfo() {
    if (st.ctx.setlistId) {
      var sl = data.setlists[st.ctx.setlistId];
      if (!sl || sl.deleted) return null;
      var items = visibleItems(sl);
      st.ctx.index = clamp(st.ctx.index, 0, items.length - 1);
      var it = items[st.ctx.index];
      if (!it) return null;
      return { song: data.songs[it.songId], item: it, sl: sl, items: items };
    }
    var s = data.songs[st.ctx.songId];
    return s && !s.deleted ? { song: s } : null;
  }
  function openStage(ctx) {
    st.ctx = ctx; st.open = true;
    buildStage();
    stageEl.hidden = false;
    loadStageSong();
    if (st.open && st.el && ctx.scroll) { st.el.sheet.scrollTop = ctx.scroll; st.pos = st.el.sheet.scrollTop; }
    delete ctx.scroll;
    wake(true);
  }
  function stageToEditor() {
    var info = stageInfo();
    if (!info) return;
    var songId = info.song.id;
    if (ui.view === 'edit' && ed && ed.rec.id === songId) { closeStage(); return; }
    var ctx = clone(st.ctx);
    ctx.scroll = st.el.sheet.scrollTop;
    var back = { view: ui.view, setlistId: ui.setlistId };
    setPlaying(false); flushSpeed();
    notesReset();
    st.open = false; stageEl.hidden = true; stageEl.replaceChildren(); st.el = null;
    wake(false);
    openEditor(songId, { ctx: ctx, back: back });
  }
  function closeStage() {
    notesReset();
    setPlaying(false);
    flushSpeed();
    st.open = false; stageEl.hidden = true; stageEl.replaceChildren(); st.el = null;
    wake(false);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* not allowed here */ }
    if (ui.view === 'edit' && ed) { var cur = data.songs[ed.rec.id]; if (cur && cur.speed) ed.rec.speed = cur.speed; }
    else render();
  }
  function wake(on) {
    try {
      if (on) {
        if (navigator.wakeLock && !st.lock) navigator.wakeLock.request('screen').then(function (l) { st.lock = l; }, function () {});
      } else if (st.lock) { st.lock.release().catch(function () {}); st.lock = null; }
    } catch (e) { st.lock = null; }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { flushLocal(); st.lock = null; }
    else if (st.open) wake(true);
  });
  window.addEventListener('pagehide', function () { flushSpeed(); flushLocal(); });

  function buildStage() {
    var e = {};
    e.title = h('b'); e.sub = h('small');
    e.keys = h('span', { class: 'keys' });
    e.acc = h('button', { class: 'iconbtn', type: 'button', 'aria-label': t('accidentals'), title: t('accidentals'), onclick: function () {
      st.acc = st.acc === 'auto' ? 'sharp' : st.acc === 'sharp' ? 'flat' : 'auto'; saveStageKey(); drawStage(true);
    } });
    e.sheet = h('div', { class: 'stsheet', id: 'stage-sheet', tabindex: '0' });
    e.playIcon = h('span'); e.speed = h('b');
    e.play = h('button', { class: 'play', type: 'button', onclick: function () { setPlaying(!st.playing); } },
      e.playIcon, h('span', { class: 'sp' }, h('small', { text: t('speed') }), e.speed));
    e.prevLabel = h('span'); e.nextLabel = h('span');
    e.prev = h('button', { class: 'nav prev', type: 'button', 'aria-label': t('prev'), onclick: function () { stageStep(-1); } }, ico('left'), e.prevLabel);
    e.next = h('button', { class: 'nav next', type: 'button', 'aria-label': t('next'), onclick: function () { stageStep(1); } }, e.nextLabel, ico('right'));
    st.el = e;
    stageEl.replaceChildren(
      h('div', { class: 'sttop' },
        iconBtn('x', t('close'), function () { notesGuard(closeStage); }),
        iconBtn('docedit', t('editSong'), function () { notesGuard(stageToEditor); }, 'stedit'),
        h('div', { class: 'sttitle' }, e.title, e.sub),
        h('div', { class: 'stctl' }, textBtn('−', t('keyDown'), function () { shiftKey(-1); }), e.keys, textBtn('+', t('keyUp'), function () { shiftKey(1); }), e.acc),
        h('div', { class: 'stctl' },
          e.notesBtn = h('button', { class: 'btn small notesbtn', type: 'button', 'aria-label': t('notes'), title: t('notes'), onclick: notesStart }, ico('pen'), h('span', { text: t('notes') })),
          e.eyeBtn = iconBtn('eye', t('notesHide'), function () { prefs.hideNotes = !prefs.hideNotes; savePrefs(); drawNotes(); }),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': t('textSmaller'), title: t('textSmaller'), text: 'A−', onclick: function () { setFont(-2); } }),
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': t('textLarger'), title: t('textLarger'), text: 'A+', onclick: function () { setFont(2); } }),
          iconBtn('expand', t('fullscreen'), function () {
            try {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen().catch(function () {});
            } catch (err) { /* not allowed here */ }
          }))),
      e.notesBar = buildNotesBar(),
      e.sheet,
      h('div', { class: 'transport' },
        e.prev,
        h('button', { class: 'step', type: 'button', 'aria-label': t('slower'), title: t('slower'), text: '−', onclick: function () { setSpeed(st.speed - 1); } }),
        e.play,
        h('button', { class: 'step', type: 'button', 'aria-label': t('faster'), title: t('faster'), text: '+', onclick: function () { setSpeed(st.speed + 1); } }),
        e.next));
    // swipe left or right to change song inside a setlist
    var sx = 0, sy = 0, stime = 0;
    e.sheet.addEventListener('touchstart', function (ev) { var p = ev.changedTouches[0]; sx = p.clientX; sy = p.clientY; stime = Date.now(); }, { passive: true });
    e.sheet.addEventListener('touchend', function (ev) {
      if (an.on || pinch.used) { if (!ev.touches.length) pinch.used = false; return; }
      var p = ev.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
      if (Math.abs(dx) > 90 && Math.abs(dy) < 50 && Date.now() - stime < 600) stageStep(dx < 0 ? 1 : -1);
    }, { passive: true });
    bindPinch(e.sheet);
  }
  function loadStageSong() {
    setPlaying(false);
    var info = stageInfo();
    if (!info) { closeStage(); return; }
    st.tr = info.item ? (info.item.tr || 0) : (st.ctx.tr || 0);
    st.acc = info.item ? (info.item.acc || 'auto') : (st.ctx.acc || 'auto');
    st.speed = clamp(info.song.speed || prefs.defaultSpeed, SPEED_MIN, SPEED_MAX);
    drawStage(true);
    st.el.sheet.scrollTop = 0; st.pos = 0;
  }
  function drawStage(redrawSheet) {
    var info = stageInfo(), e = st.el;
    if (!info || !e) return;
    var song = info.song;
    e.title.textContent = songTitle(song);
    e.sub.textContent = [info.items ? (st.ctx.index + 1) + ' / ' + info.items.length : null, song.artist, song.bpm ? song.bpm + ' BPM' : null].filter(Boolean).join(' · ');
    var two = info.item || st.tr !== 0;
    setKids(e.keys,
      h('span', { class: 'k' }, h('small', { text: two ? t('original') : t('key') }), h('b', { text: song.key || '–' })),
      two ? h('span', { class: 'k cur' }, h('small', { text: info.item ? t('inSetlist') : t('now') }), h('b', { text: keyAfter(song, st.tr) })) : null);
    e.acc.textContent = st.acc === 'sharp' ? '♯' : st.acc === 'flat' ? '♭' : '♯♭';
    e.speed.textContent = String(st.speed);
    e.sheet.style.fontSize = prefs.fontSize + 'px';
    if (redrawSheet) {
      var end = h('div', { class: 'stend' });
      if (info.items) {
        var nx = info.items[st.ctx.index + 1];
        if (nx) end.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { stageStep(1); } }, t('nextUp') + ': ' + songTitle(data.songs[nx.songId]), ico('right')));
        else end.appendChild(h('span', { text: t('endOfSet') }));
      }
      e.sheet.replaceChildren(renderSheet(song, st.tr, st.acc), end);
      st.stamp = song.id + '\n' + (song.body || '') + '\n' + (song.key || '');
      mountNotes();
    }
    drawNotes();
    var prev = info.items && info.items[st.ctx.index - 1], next = info.items && info.items[st.ctx.index + 1];
    e.prev.disabled = !prev; e.next.disabled = !next;
    e.prevLabel.textContent = prev ? songTitle(data.songs[prev.songId]) : '';
    e.nextLabel.textContent = next ? songTitle(data.songs[next.songId]) : '';
    drawPlay();
  }
  function drawPlay() {
    var e = st.el; if (!e) return;
    e.playIcon.replaceChildren(ico(st.playing ? 'pause' : 'play'));
    e.play.setAttribute('aria-label', (st.playing ? t('pause') : t('play')) + ', ' + t('speed') + ' ' + st.speed);
  }
  // Synced data arrived while on stage: redraw only if this song's text really changed.
  function stageRefresh() {
    var info = stageInfo();
    if (!info) { closeStage(); return; }
    var bodyChanged = (info.song.id + '\n' + (info.song.body || '') + '\n' + (info.song.key || '')) !== st.stamp;
    if (an.on && bodyChanged) return; // never pull the page from under a pen
    var top = st.el.sheet.scrollTop;
    drawStage(bodyChanged);
    if (bodyChanged) st.el.sheet.scrollTop = top;
  }
  function stageStep(d) {
    if (an.on) { notesGuard(function () { stageStep(d); }); return; }
    var info = stageInfo();
    if (!info || !info.items) return;
    var n = st.ctx.index + d;
    if (n < 0 || n >= info.items.length) return;
    flushSpeed();
    st.ctx.index = n;
    loadStageSong();
  }
  function shiftKey(d) { st.tr = wrapTr(st.tr + d); saveStageKey(); var top = st.el.sheet.scrollTop; drawStage(true); st.el.sheet.scrollTop = top; }
  function saveStageKey() {
    var info = stageInfo();
    if (info && info.item) {
      var c = clone(info.sl);
      c.items.forEach(function (it) { if (it.uid === info.item.uid) { it.tr = st.tr; it.acc = st.acc; } });
      if (c.example) delete c.example;
      saveRec('setlists', c);
    } else { st.ctx.tr = st.tr; st.ctx.acc = st.acc; }
  }
  function setFont(d) { applyFont(prefs.fontSize + d, null); savePrefs(); }
  // Change the text size and keep the same spot of the song under (x, y), or under the top of the view.
  function applyFont(px, at) {
    var sheet = st.el && st.el.sheet;
    if (!sheet) return;
    px = clamp(Math.round(px), FS_MIN, FS_MAX);
    if (px === prefs.fontSize && sheet.style.fontSize === px + 'px') return;
    var sr = sheet.getBoundingClientRect();
    var vy = at ? at.y - sr.top : 0;
    var cy = sheet.scrollTop + vy, keep = null;
    var els = sheet.querySelectorAll('[data-bi]');
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect(), top = r.top - sr.top + sheet.scrollTop;
      if (top + r.height >= cy) { keep = { el: els[i], frac: r.height ? Math.max(0, Math.min(1, (cy - top) / r.height)) : 0 }; break; }
    }
    prefs.fontSize = px;
    sheet.style.fontSize = px + 'px';
    if (keep) {
      var r2 = keep.el.getBoundingClientRect(), top2 = r2.top - sr.top + sheet.scrollTop;
      sheet.scrollTop = top2 + keep.frac * r2.height - vy;
    }
    st.pos = sheet.scrollTop;
    drawNotes();
  }
  // Pinch with two fingers to change the text size. The browser's own page zoom is turned off over the
  // song (touch-action in the CSS), so lines wrap again to fit instead of running off the screen.
  var pinch = { d0: 0, fs0: 0, on: false, used: false, raf: 0, next: null };
  function bindPinch(sheet) {
    function dist(t) { var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
    function mid(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }
    sheet.addEventListener('touchstart', function (ev) {
      if (ev.touches.length === 2) { pinch.d0 = dist(ev.touches); pinch.fs0 = prefs.fontSize; pinch.on = false; }
    }, { passive: true });
    sheet.addEventListener('touchmove', function (ev) {
      if (ev.touches.length !== 2 || !pinch.d0) return;
      var ratio = dist(ev.touches) / pinch.d0;
      if (!pinch.on && Math.abs(ratio - 1) < 0.06) return; // two fingers moving together scroll
      pinch.on = true; pinch.used = true;
      if (ev.cancelable) ev.preventDefault();
      pinch.next = { px: pinch.fs0 * ratio, at: mid(ev.touches) };
      if (!pinch.raf) pinch.raf = requestAnimationFrame(function () {
        pinch.raf = 0;
        if (pinch.next) { applyFont(pinch.next.px, pinch.next.at); pinch.next = null; }
      });
    }, { passive: false });
    function end(ev) {
      if (ev.touches.length < 2) {
        if (pinch.on) savePrefs();
        pinch.d0 = 0; pinch.on = false;
      }
    }
    sheet.addEventListener('touchend', end, { passive: true });
    sheet.addEventListener('touchcancel', end, { passive: true });
    // On a PC, a trackpad pinch or Ctrl and the mouse wheel does the same.
    sheet.addEventListener('wheel', function (ev) {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      applyFont(prefs.fontSize * Math.exp(-ev.deltaY / 600), { x: ev.clientX, y: ev.clientY });
      clearTimeout(pinch.wt); pinch.wt = setTimeout(savePrefs, 400);
    }, { passive: false });
  }
  // The speed is stored on the song, so it comes back the next time the song is opened.
  var speedSongId = null;
  function setSpeed(n) {
    st.speed = clamp(n, SPEED_MIN, SPEED_MAX);
    st.el.speed.textContent = String(st.speed);
    drawPlay();
    var info = stageInfo(); if (!info) return;
    speedSongId = info.song.id;
    clearTimeout(st.saveTimer);
    st.saveTimer = setTimeout(flushSpeed, 900);
  }
  function flushSpeed() {
    clearTimeout(st.saveTimer);
    if (!speedSongId) return;
    var s = data.songs[speedSongId]; speedSongId = null;
    if (!s || s.speed === st.speed) return;
    var c = clone(s); c.speed = st.speed; saveRec('songs', c);
  }
  function setPlaying(on) {
    if (!st.el) { st.playing = false; return; }
    on = !!on;
    if (on === st.playing) return;
    st.playing = on;
    cancelAnimationFrame(st.raf);
    if (on && an.on) { st.playing = false; return; }
    if (on) { st.pos = st.el.sheet.scrollTop; st.last = performance.now(); st.raf = requestAnimationFrame(tick); wake(true); }
    drawPlay();
  }
  function tick(ts) {
    if (!st.playing || !st.el) return;
    var sheet = st.el.sheet;
    var dt = Math.min(0.25, Math.max(0, (ts - st.last) / 1000));
    st.last = ts;
    if (Math.abs(sheet.scrollTop - st.pos) > 3) st.pos = sheet.scrollTop; // the player scrolled by hand
    st.pos += dt * st.speed * SPEED_EM * prefs.fontSize;
    sheet.scrollTop = st.pos;
    if (sheet.scrollTop + sheet.clientHeight >= sheet.scrollHeight - 1) { setPlaying(false); return; }
    st.raf = requestAnimationFrame(tick);
  }
  document.addEventListener('keydown', function (e) {
    if (!st.open || dlg.open) return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (an.on && (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); notesUndo(); return; }
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); setPlaying(!st.playing); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); setSpeed(st.speed + 1); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); setSpeed(st.speed - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stageStep(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stageStep(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); notesGuard(closeStage); }
  });
  // A focused button would also fire on space keyup and undo the toggle above.
  document.addEventListener('keyup', function (e) {
    if (st.open && !dlg.open && (e.key === ' ' || e.code === 'Space')) e.preventDefault();
  });

  // ---------- notes: pen, highlighter and text on top of a song ----------
  // A note is stored on the song and anchored to one line of it: { a: { i: block index, k: block text },
  // pts: [[x, y], ...] in em from that line's top left corner }. Ems follow the text size, and the line
  // key lets a note find its line again after lines are added above it or the chords are transposed.
  var SIZES = { pen: [0.07, 0.12, 0.2], marker: [0.6, 0.9, 1.3] };
  var SMOOTH = [0, 0.35, 0.55, 0.72];
  function penWidth(hl) { var list = hl ? SIZES.marker : SIZES.pen, i = hl ? prefs.markerSize : prefs.penSize; return list[clamp(i | 0, 0, 2)]; }
  // Width of a pressure line at one point: light touch thin, firm press thick.
  function pressW(base, p) { return base * (0.35 + 1.3 * (p == null ? 0.5 : p)); }
  // A filled outline around the points, so a line can get thicker and thinner along the way.
  function outlineD(pts, widths) {
    if (pts.length < 2) return pathD(pts);
    var L = [], R = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy) || 1, hw = widths[i] / 2;
      L.push([pts[i][0] - dy / len * hw, pts[i][1] + dx / len * hw]);
      R.push([pts[i][0] + dy / len * hw, pts[i][1] - dx / len * hw]);
    }
    return pathD(L.concat(R.reverse())) + 'Z';
  }
  function inkPathEl(pts, widths, color, uniformW, hl) {
    if (widths) {
      var mn = Math.min.apply(null, widths);
      return svgEl('path', { d: outlineD(pts, widths), fill: color, stroke: color, 'stroke-width': Math.max(0.8, mn * 0.6), 'stroke-linejoin': 'round', class: 'ink' });
    }
    return svgEl('path', { d: pathD(pts), fill: 'none', stroke: color, 'stroke-width': Math.max(1.5, uniformW),
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: hl ? 0.4 : 1, class: hl ? 'hl' : 'ink' });
  }
  var PENS = [['nred', '#e03131'], ['nblue', '#1c6fd6'], ['nink', 'ink'], ['ngreen', '#2f9e44']];
  var MARKERS = [['hyellow', '#ffd43b'], ['hgreen', '#8ce99a'], ['hpink', '#faa2c1']];
  var an = { on: false, tool: 'pen', pen: PENS[0][1], marker: MARKERS[0][1], notes: [], dirty: false, undo: [], penSeen: false,
    layer: null, svg: null, body: null, ro: null, live: null, ptrs: {}, scrolling: false, erasing: false };
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) { var el = document.createElementNS(SVGNS, tag); for (var k in attrs) el.setAttribute(k, attrs[k]); return el; }
  function stageSong() { var info = st.el && stageInfo(); return info ? info.song : null; }
  function shownNotes() { var sg = stageSong(); return an.on ? an.notes : ((sg && sg.notes) || []); }
  function inkColor(c) { return c === 'ink' ? getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#14171c' : c; }

  function mountNotes() {
    var body = st.el && st.el.sheet.querySelector('.sheet-body');
    if (!body) return;
    an.body = body;
    an.svg = svgEl('svg', { class: 'notes-svg', 'aria-hidden': 'true' });
    an.layer = h('div', { class: 'notes-layer' });
    an.layer.appendChild(an.svg);
    body.appendChild(an.layer);
    bindDrawing(an.layer);
    try { if (an.ro) an.ro.disconnect(); an.ro = new ResizeObserver(function () { drawNotes(); }); an.ro.observe(body); } catch (e) { an.ro = null; }
  }
  function blockEls() { return an.body ? Array.prototype.slice.call(an.body.querySelectorAll('[data-bi]')) : []; }
  function findBlock(els, a) {
    if (!els.length || !a) return null;
    var i = Math.min(Math.max(a.i | 0, 0), els.length - 1);
    if (els[i].getAttribute('data-k') === a.k) return els[i];
    for (var d = 1; d < 60; d++) {
      if (els[i - d] && els[i - d].getAttribute('data-k') === a.k) return els[i - d];
      if (els[i + d] && els[i + d].getAttribute('data-k') === a.k) return els[i + d];
    }
    return els[i];
  }
  function emSize() { return an.body ? parseFloat(getComputedStyle(an.body).fontSize) || 20 : 20; }
  function pathD(pts) {
    if (pts.length === 1) return 'M' + pts[0][0] + ' ' + pts[0][1] + 'l0.01 0';
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += 'Q' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1);
    }
    var l = pts[pts.length - 1];
    return d + 'L' + l[0].toFixed(1) + ' ' + l[1].toFixed(1);
  }
  function drawNotes() {
    var e = st.el;
    if (!e) return;
    var sg = stageSong(), all = shownNotes();
    var hidden = !an.on && prefs.hideNotes;
    if (e.eyeBtn) {
      var has = !!(sg && sg.notes && sg.notes.length);
      e.eyeBtn.hidden = an.on || !has;
      e.eyeBtn.replaceChildren(ico(prefs.hideNotes ? 'eyeoff' : 'eye'));
      e.eyeBtn.setAttribute('aria-label', prefs.hideNotes ? t('notesShow') : t('notesHide'));
      e.eyeBtn.title = e.eyeBtn.getAttribute('aria-label');
    }
    if (e.notesBtn) e.notesBtn.hidden = an.on;
    if (!an.body || !an.layer || !an.layer.isConnected) return;
    an.layer.classList.toggle('drawing', an.on);
    an.layer.classList.toggle('erase', an.on && an.tool === 'eraser');
    while (an.svg.firstChild) an.svg.removeChild(an.svg.firstChild);
    Array.prototype.slice.call(an.layer.querySelectorAll('.note-text')).forEach(function (x) { x.remove(); });
    an.svg.setAttribute('width', an.body.scrollWidth);
    an.svg.setAttribute('height', an.body.scrollHeight);
    if (hidden) return;
    var em = emSize(), els = blockEls(), base = an.body.getBoundingClientRect();
    all.forEach(function (n) {
      var el = findBlock(els, n.a);
      if (!el) return;
      var r = el.getBoundingClientRect(), ox = r.left - base.left, oy = r.top - base.top;
      if (n.type === 'text') {
        var tx = h('div', { class: 'note-text', 'data-id': n.id, text: n.text });
        tx.style.left = (ox + n.x * em) + 'px'; tx.style.top = (oy + n.y * em) + 'px'; tx.style.color = inkColor(n.color);
        an.layer.appendChild(tx);
        // On a narrow screen the line wraps: keep the note inside the page.
        var maxL = an.body.clientWidth - tx.offsetWidth;
        if (ox + n.x * em > maxL) tx.style.left = Math.max(0, maxL) + 'px';
        return;
      }
      var pts = n.pts.map(function (p) { return [ox + p[0] * em, oy + p[1] * em]; });
      var g = svgEl('g', { 'data-id': n.id });
      var d = pathD(pts);
      var widths = n.pr && n.type === 'ink' ? n.pts.map(function (p) { return pressW(n.w * em, p[2]); }) : null;
      g.appendChild(inkPathEl(pts, widths, inkColor(n.color), n.w * em, n.type === 'hl'));
      if (an.on) g.appendChild(svgEl('path', { d: d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(18, n.w * em), class: 'hit' }));
      an.svg.appendChild(g);
    });
  }

  function notesStart() {
    var sg = stageSong();
    if (!sg) return;
    setPlaying(false);
    an.on = true; an.dirty = false; an.undo = [];
    an.notes = clone(sg.notes || []);
    st.el.notesBar.hidden = false;
    drawNotesBar();
    st.el.sheet.scrollTop += st.el.notesBar.offsetHeight;
    drawNotes();
  }
  function notesReset() { an.on = false; an.dirty = false; an.undo = []; an.notes = []; an.live = null; an.ptrs = {}; an.layer = null; an.body = null; if (an.ro) { try { an.ro.disconnect(); } catch (e) { /* ignore */ } an.ro = null; } }
  function notesEnd(save) {
    var sg = stageSong();
    if (save && an.dirty && sg) {
      var c = clone(sg); c.notes = an.notes; if (c.example) delete c.example;
      saveRec('songs', c);
      toast(t('notesSaved'));
    }
    an.on = false; an.dirty = false; an.undo = []; an.notes = [];
    if (st.el) { var bh = st.el.notesBar.offsetHeight; st.el.notesBar.hidden = true; st.el.sheet.scrollTop -= bh; }
    drawNotes();
  }
  // Unsaved notes: ask before leaving the song. next() runs after Save or Discard.
  function notesGuard(next) {
    if (!an.on) { next(); return; }
    if (!an.dirty) { notesEnd(false); next(); return; }
    openDialog(h('div', { class: 'dlg' },
      h('h2', { text: t('notesTitle') }),
      h('p', { text: t('notesUnsaved') }),
      h('div', { class: 'foot' },
        h('button', { class: 'btn ghost', type: 'button', text: t('cancel'), onclick: closeDialog }),
        h('button', { class: 'btn danger', type: 'button', onclick: function () { closeDialog(); notesEnd(false); next(); } }, ico('trash'), t('discard')),
        h('button', { class: 'btn primary', type: 'button', onclick: function () { closeDialog(); notesEnd(true); next(); } }, t('save')))));
  }
  function notesPush() { an.undo.push(JSON.stringify(an.notes)); if (an.undo.length > 60) an.undo.shift(); an.dirty = true; }
  function notesUndo() { if (!an.undo.length) return; an.notes = JSON.parse(an.undo.pop()); an.dirty = true; drawNotes(); drawNotesBar(); }

  function buildNotesBar() {
    var bar = h('div', { class: 'notesbar', hidden: true, role: 'toolbar', 'aria-label': t('notes') });
    return bar;
  }
  function drawNotesBar() {
    var bar = st.el && st.el.notesBar;
    if (!bar) return;
    function tool(id, icon, label, extra) {
      return h('button', { class: 'iconbtn tool', type: 'button', 'aria-pressed': String(an.tool === id), 'aria-label': label, title: label,
        onclick: function () { an.tool = id; drawNotesBar(); drawNotes(); } }, ico(icon), extra || null);
    }
    function sizes(key, dots) {
      return h('span', { class: 'nsizes' }, [t('sizeFine'), t('sizeMed'), t('sizeThick')].map(function (label, i) {
        return h('button', { class: 'nsize', type: 'button', 'aria-pressed': String((prefs[key] | 0) === i), 'aria-label': label, title: label,
          onclick: function () { prefs[key] = i; savePrefs(); drawNotesBar(); } },
          h('i', { style: 'width:' + dots[i] + 'px;height:' + dots[i] + 'px' }));
      }));
    }
    function swatch(list, cur, set) {
      return h('span', { class: 'nswatches' }, list.map(function (c) {
        return h('button', { class: 'nswatch', type: 'button', 'aria-pressed': String(cur === c[1]), 'aria-label': t('c_' + c[0]), title: t('c_' + c[0]),
          style: 'background:' + inkColor(c[1]), onclick: function () { set(c[1]); drawNotesBar(); } });
      }));
    }
    setKids(bar,
      h('span', { class: 'ngroup' }, tool('pen', 'pen', t('notesPen')),
        an.tool === 'pen' ? swatch(PENS, an.pen, function (v) { an.pen = v; }) : null,
        an.tool === 'pen' ? sizes('penSize', [3, 6, 10]) : null),
      h('span', { class: 'ngroup' }, tool('marker', 'marker', t('notesMarker')),
        an.tool === 'marker' ? swatch(MARKERS, an.marker, function (v) { an.marker = v; }) : null,
        an.tool === 'marker' ? sizes('markerSize', [8, 12, 17]) : null),
      tool('text', 'textT', t('notesText')),
      tool('eraser', 'eraser', t('notesEraser')),
      h('span', { class: 'nsep' }),
      h('button', { class: 'iconbtn', type: 'button', 'aria-label': t('notesUndo'), title: t('notesUndo'), disabled: !an.undo.length, onclick: notesUndo }, ico('undo')),
      h('button', { class: 'btn small ghost', type: 'button', disabled: !an.notes.length, onclick: function () { notesPush(); an.notes = []; drawNotes(); drawNotesBar(); } }, t('notesClear')),
      h('span', { class: 'nhint hint', text: an.penSeen ? t('notesHintPen') : t('notesHintTouch') }),
      h('button', { class: 'btn small primary', type: 'button', onclick: function () { notesEnd(true); } }, t('notesDone')));
  }

  function smoothPts(pts) {
    if (pts.length < 3) return pts;
    return pts.map(function (p, i) {
      if (i === 0 || i === pts.length - 1) return p;
      var a = pts[i - 1], b = pts[i + 1], q = [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
      if (p.length > 2) q.push((a[2] + 2 * p[2] + b[2]) / 4);
      return q;
    });
  }
  // Anchor a set of points (px, relative to the sheet) to the line they sit on.
  function anchorFor(cx, cy) {
    var els = blockEls(), base = an.body.getBoundingClientRect(), best = null, bestD = 1e9;
    els.forEach(function (el) {
      var r = el.getBoundingClientRect(), top = r.top - base.top, bot = r.bottom - base.top;
      var d = cy < top ? top - cy : cy > bot ? cy - bot : 0;
      if (d < bestD) { bestD = d; best = { el: el, ox: r.left - base.left, oy: top }; }
    });
    return best;
  }
  function bindDrawing(layer) {
    function local(ev) { var b = an.body.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; }
    function touches() { return Object.keys(an.ptrs).filter(function (k) { return an.ptrs[k].touch; }); }
    function eraseAt(ev) {
      var hits = (document.elementsFromPoint ? document.elementsFromPoint(ev.clientX, ev.clientY) : []);
      for (var i = 0; i < hits.length; i++) {
        var g = hits[i].closest && hits[i].closest('[data-id]');
        if (g && layer.contains(g)) {
          var id = g.getAttribute('data-id');
          if (!an.erasing) { notesPush(); an.erasing = true; }
          an.notes = an.notes.filter(function (n) { return n.id !== id; });
          drawNotes(); drawNotesBar();
          return;
        }
      }
    }
    function addText(p) {
      var a = anchorFor(p[0], p[1]);
      if (!a) return;
      var em = emSize();
      var input = h('input', { class: 'note-input', type: 'text', placeholder: t('notesTextPh'), 'aria-label': t('notesText') });
      input.style.left = p[0] + 'px'; input.style.top = (p[1] - em * 0.6) + 'px'; input.style.color = inkColor(an.pen);
      layer.appendChild(input);
      var done = false;
      function commit(keep) {
        if (done) return; done = true;
        var v = input.value.trim(); input.remove();
        if (!keep || !v) return;
        notesPush();
        an.notes.push({ id: uid('n'), type: 'text', color: an.pen, a: { i: +a.el.getAttribute('data-bi'), k: a.el.getAttribute('data-k') },
          x: +((p[0] - a.ox) / em).toFixed(3), y: +((p[1] - em * 0.6 - a.oy) / em).toFixed(3), text: v.slice(0, 200) });
        drawNotes(); drawNotesBar();
      }
      input.addEventListener('keydown', function (ev) {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
      });
      input.addEventListener('blur', function () { commit(true); });
      // Focus inside the touch itself, or tablets will not open their keyboard.
      input.focus();
      an.pendingInput = input;
    }
    layer.addEventListener('pointerdown', function (ev) {
      if (!an.on || ev.target.classList.contains('note-input')) return;
      if (ev.pointerType === 'pen' && !an.penSeen) { an.penSeen = true; drawNotesBar(); }
      an.ptrs[ev.pointerId] = { touch: ev.pointerType === 'touch', y: ev.clientY };
      try { layer.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      ev.preventDefault();
      // Scrolling: two fingers, or one finger once a pen has been used (palm and finger rejection).
      if (ev.pointerType === 'touch' && (an.penSeen || touches().length >= 2)) {
        if (an.live) {
          if (an.live.path) an.live.path.remove();
          // The first finger of a two-finger scroll may have started erasing: put that back.
          if (an.live.erase && an.erasing && an.undo.length) { an.notes = JSON.parse(an.undo.pop()); an.erasing = false; drawNotes(); drawNotesBar(); }
          an.live = null;
        }
        an.scrolling = true;
        return;
      }
      if (an.tool === 'text') { addText(local(ev)); return; }
      if (an.tool === 'eraser') { an.erasing = false; eraseAt(ev); an.live = { erase: true, id: ev.pointerId }; return; }
      var hl = an.tool === 'marker', color = hl ? an.marker : an.pen, em = emSize(), w = penWidth(hl);
      // Pressure only from a real pen; fingers and mice report a fixed value.
      var pr = !hl && ev.pointerType === 'pen' && ev.pressure > 0;
      var p0 = local(ev);
      if (pr) p0.push(ev.pressure);
      var path = inkPathEl([p0], pr ? [pressW(w * em, ev.pressure)] : null, inkColor(color), w * em, hl);
      an.svg.appendChild(path);
      an.live = { id: ev.pointerId, pts: [p0], raw: p0, path: path, hl: hl, color: color, w: w, pr: pr, f: SMOOTH[clamp(prefs.inkSmooth | 0, 0, 3)] };
    });
    layer.addEventListener('pointermove', function (ev) {
      var pinfo = an.ptrs[ev.pointerId];
      if (!an.on || !pinfo) return;
      if (an.scrolling) {
        var ids = touches(); var dy = ev.clientY - pinfo.y; pinfo.y = ev.clientY;
        st.el.sheet.scrollTop -= dy / Math.max(1, ids.length);
        return;
      }
      if (!an.live || an.live.id !== ev.pointerId) return;
      if (an.live.erase) { eraseAt(ev); return; }
      var lv = an.live, em = emSize();
      var evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
      (evs.length ? evs : [ev]).forEach(function (ce) {
        var raw = local(ce), last = lv.pts[lv.pts.length - 1];
        if (lv.pr) raw.push(ce.pressure > 0 ? ce.pressure : last[2]);
        lv.raw = raw;
        // Smoothing: each new point moves only part of the way towards the finger or pen.
        var q = [last[0] + (raw[0] - last[0]) * (1 - lv.f), last[1] + (raw[1] - last[1]) * (1 - lv.f)];
        if (lv.pr) q.push(last[2] + (raw[2] - last[2]) * 0.5);
        if (Math.abs(q[0] - last[0]) + Math.abs(q[1] - last[1]) >= 1.2) lv.pts.push(q);
      });
      var live = lv.pts.concat([lv.raw]);
      if (lv.pr) lv.path.setAttribute('d', outlineD(live, live.map(function (p) { return pressW(lv.w * em, p[2]); })));
      else lv.path.setAttribute('d', pathD(live));
    });
    function up(ev) {
      delete an.ptrs[ev.pointerId];
      if (an.pendingInput) { var pi = an.pendingInput; an.pendingInput = null; if (pi.isConnected && document.activeElement !== pi) pi.focus(); }
      if (an.scrolling) { if (!touches().length) an.scrolling = false; return; }
      var lv = an.live;
      if (!lv || lv.id !== ev.pointerId) return;
      an.live = null;
      if (lv.erase) { an.erasing = false; return; }
      var em = emSize(), xs = lv.pts.map(function (p) { return p[0]; }), ys = lv.pts.map(function (p) { return p[1]; });
      var a = anchorFor((Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2);
      lv.path.remove();
      if (!a) return;
      var src = lv.pts.concat([lv.raw]);
      // Stronger smoothing levels also even out the finished line a little.
      for (var pass = 1; pass < (prefs.inkSmooth | 0); pass++) src = smoothPts(src);
      var pts = [], last = null;
      src.forEach(function (p, i) {
        var q = [+((p[0] - a.ox) / em).toFixed(3), +((p[1] - a.oy) / em).toFixed(3)];
        if (lv.pr) q.push(+(p[2] || 0.5).toFixed(2));
        if (!last || i === src.length - 1 || Math.abs(q[0] - last[0]) + Math.abs(q[1] - last[1]) >= 0.04) { pts.push(q); last = q; }
      });
      notesPush();
      var note = { id: uid('n'), type: lv.hl ? 'hl' : 'ink', color: lv.color, w: lv.w,
        a: { i: +a.el.getAttribute('data-bi'), k: a.el.getAttribute('data-k') }, pts: pts };
      if (lv.pr) note.pr = true;
      an.notes.push(note);
      drawNotes(); drawNotesBar();
    }
    layer.addEventListener('pointerup', up);
    layer.addEventListener('pointercancel', up);
  }

  // ---------- settings ----------
  function openSettings() {
    function seg(options, current, onpick) {
      return h('div', { class: 'seg' }, options.map(function (o) {
        return h('button', { type: 'button', 'aria-pressed': String(o[0] === current), text: o[1], onclick: function () { onpick(o[0]); } });
      }));
    }
    function draw() {
      var keepScroll = dlg.firstChild ? dlg.firstChild.scrollTop : 0;
      var speedB = h('b', { text: String(prefs.defaultSpeed) });
      function step(d) { prefs.defaultSpeed = clamp(prefs.defaultSpeed + d, SPEED_MIN, SPEED_MAX); savePrefs(); speedB.textContent = String(prefs.defaultSpeed); }
      var dark = isDarkNow();
      var custom = /^#/.test(prefs.accent);
      var picker = h('input', { type: 'color', id: 'accent-custom', value: rgbHex(accentFor(prefs.accent, dark)), 'aria-label': t('customColor') });
      picker.addEventListener('input', function () { prefs.accent = picker.value; savePrefs(); applyAccent(); });
      picker.addEventListener('change', draw);
      var swatches = h('div', { class: 'swatches' }, ACCENTS.map(function (a) {
        return h('button', { class: 'swatch', type: 'button', 'aria-pressed': String(prefs.accent === a.id), 'aria-label': t('c_' + a.id), title: t('c_' + a.id),
          style: 'background:' + rgbHex(accentFor(a.id, dark)), onclick: function () { prefs.accent = a.id; savePrefs(); applyAccent(); draw(); } });
      }), h('label', { class: 'swatch custom', 'data-on': String(custom), title: t('customColor') }, picker, h('span', { text: t('customColor') })));

      var counts = {};
      liveSongs().forEach(function (sg) { (sg.tags || []).forEach(function (id) { counts[id] = (counts[id] || 0) + 1; }); });
      var addInput = h('input', { class: 'input', id: 'settings-newtag', type: 'text', placeholder: t('newTag'), maxlength: '30', 'aria-label': t('newTag') });
      function addTag() { if (findOrCreateTag(addInput.value)) draw(); }
      addInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
      var tagList = h('div', { class: 'list taglist' }, liveTags().map(function (tg) {
        var inp = h('input', { class: 'input', type: 'text', value: tg.name, maxlength: '30', 'aria-label': t('renameTag') });
        inp.addEventListener('change', function () {
          var v = cleanTagName(inp.value);
          if (!v) { inp.value = tg.name; return; }
          var c = clone(data.tags[tg.id]); c.name = v; saveRec('tags', c);
        });
        return h('div', { class: 'item' }, inp,
          h('span', { class: 'chip', text: String(counts[tg.id] || 0), title: t('nSongs')(counts[tg.id] || 0) }),
          iconBtn('trash', t('deleteTag'), function () {
            var c = clone(data.tags[tg.id]); c.deleted = true; saveRec('tags', c); draw();
            toast(t('tagDeleted'), t('undo'), function () { var r = clone(data.tags[tg.id]); delete r.deleted; saveRec('tags', r); if (dlg.open) draw(); else render(); });
          }));
      }));

      openDialog(h('div', { class: 'dlg' },
        h('h2', { text: t('settings') }),
        h('div', { class: 'field' }, h('span', { text: t('language') }),
          seg([['en', 'English'], ['is', 'Íslenska']], prefs.lang, function (v) { prefs.lang = v; savePrefs(); applyPrefs(); if (ui.view !== 'edit') render(); draw(); })),
        h('div', { class: 'field' }, h('span', { text: t('theme') }),
          seg([['auto', t('auto')], ['dark', t('dark')], ['light', t('light')]], prefs.theme, function (v) { prefs.theme = v; savePrefs(); applyPrefs(); draw(); })),
        h('div', { class: 'field' }, h('span', { text: t('color') }), swatches),
        h('div', { class: 'field' }, h('span', { text: t('inkSmooth') }),
          seg([[0, t('smooth0')], [1, t('smooth1')], [2, t('smooth2')], [3, t('smooth3')]], prefs.inkSmooth | 0, function (v) { prefs.inkSmooth = v; savePrefs(); draw(); }),
          h('span', { class: 'hint', text: t('inkSmoothHint') })),
        h('div', { class: 'field' }, h('span', { text: t('defaultSpeed') }),
          h('div', { class: 'stepper' },
            h('button', { class: 'btn', type: 'button', 'aria-label': t('slower'), text: '−', onclick: function () { step(-1); } }),
            speedB,
            h('button', { class: 'btn', type: 'button', 'aria-label': t('faster'), text: '+', onclick: function () { step(1); } })),
          h('span', { class: 'hint', text: t('defaultSpeedHint') })),
        h('div', { class: 'field' }, h('span', { text: t('tags') }), tagList,
          h('div', { class: 'newtag' }, addInput, h('button', { class: 'btn', type: 'button', onclick: addTag }, ico('plus'), t('addTag')))),
        h('div', { class: 'foot' }, h('button', { class: 'btn primary', type: 'button', text: t('done'), onclick: closeDialog }))),
        function () { if (ui.view !== 'edit') render(); });
      if (dlg.firstChild) dlg.firstChild.scrollTop = keepScroll;
    }
    draw();
  }
  $('#btn-settings').addEventListener('click', openSettings);

  // ---------- routing and start ----------
  function fromHash() {
    var want = location.hash === '#setlists' ? 'setlists' : 'songs';
    var cur = (ui.view === 'songs' || ui.view === 'edit') ? 'songs' : 'setlists';
    if (want !== cur) go(want);
  }
  window.addEventListener('hashchange', fromHash);
  $('#tab-songs').addEventListener('click', function (e) { e.preventDefault(); go('songs'); });
  $('#brand').addEventListener('click', function (e) { e.preventDefault(); go('songs'); });
  $('#tab-setlists').addEventListener('click', function (e) { e.preventDefault(); go('setlists'); });

  function start(snap) {
    applyPrefs();
    if (location.hash === '#setlists') ui.view = 'setlists';
    if (snap && snap.view === 'setlist' && snap.setlistId) { ui.view = 'setlist'; ui.setlistId = snap.setlistId; }
    ready = hasRecords();
    render();
    connect();
  }
  var hot = window.claude && window.claude.hot;
  try { if (hot && hot.snapshot) hot.snapshot(function () { return { view: ui.view, setlistId: ui.setlistId }; }); } catch (e) { /* optional */ }
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
})();
