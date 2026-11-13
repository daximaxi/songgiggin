# Songgiggin

Létt app fyrir gigg: lög með texta og hljómum (ChordPro), lagalistar, tónflutningur, sviðssýn með sjálfvirku skruni og glósur ofan á lögin. Virkar í vafra á Android, PC og iPad og er hægt að setja upp sem app (PWA). Viðmót á íslensku og ensku.

A lightweight gig app: songs with lyrics and chords (ChordPro), setlists, transposing, a stage view with auto-scroll and handwritten notes. Runs in the browser and installs as a PWA.

## Opna appið
GitHub Pages birtir möppuna `docs/`: https://daximaxi.github.io/songgiggin/

Lögin eru geymd á tækinu sjálfu, ekki í þessari geymslu. Afrit: **Flytja út** í lagasafninu.

## Uppbygging
- `src/core.js`: hljómaþáttun, tónflutningur, innflutningur, samruni (prófanlegt í Node)
- `src/app.js`: viðmótið
- `src/style.css`, `src/index.template.html`
- `pwa/`: manifest, service worker og táknmyndir
- `build.js`: býr til `dist/index.html` (ein skrá), `dist-pwa/` og `docs/`

```
node build.js
node test/core.test.js
```

Vafraprófin í `test/ui_test*.py` nota Playwright.
