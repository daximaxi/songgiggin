# GIGGARI

Létt app fyrir gigg (áður Songgiggin): lög með texta og hljómum (ChordPro), lagalistar, tónflutningur, sviðssýn með sjálfvirku skruni, hljómamyndir, capo, prentun og PDF, og glósur ofan á lögin. Virkar í vafra á Android, PC og iPad og er hægt að setja upp sem app (PWA). Viðmót á íslensku og ensku.

GIGGARI (the gigger) is a lightweight gig app: songs with lyrics and chords (ChordPro), setlists, transposing, a stage view with auto-scroll, chord diagrams, capo, print and PDF, and handwritten notes. Runs in the browser and installs as a PWA.

## Opna appið
GitHub Pages birtir möppuna `docs/`: https://daximaxi.github.io/songgiggin/ (verður /giggari/ ef geymslan er endurnefnd).

Lögin eru geymd á tækinu sjálfu, ekki í þessari geymslu. Afrit: **Flytja út** í lagasafninu. Lög og lagalistar sem fara í **Geymslu** er hægt að sækja aftur.

## Uppbygging
- `src/core.js`: hljómaþáttun, tónflutningur, innflutningur, samruni, gripasafn og capo (prófanlegt í Node)
- `src/app.js`: viðmótið
- `src/style.css`, `src/index.template.html`
- `pwa/`: manifest, service worker, táknmyndir og jsPDF
- `build.js`: býr til `dist/index.html` (ein skrá), `dist-pwa/` og `docs/`

```
node build.js
node test/core.test.js
node test/chords.test.js
```

Vafraprófin í `test/ui_test*.py` nota Playwright.
