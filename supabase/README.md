# Aðgangar (Supabase)

GIGGARI notar Supabase verkefnið „Giggari“ fyrir innskráningu og samstillingu milli tækja.

## Uppsetning (einu sinni)

1. **Gagnagrunnur:** Supabase → SQL Editor → New query → líma allt úr `schema.sql` → Run. Má keyra aftur án skaða.
2. **Póstsniðmát:** Authentication → Emails (Templates) → **Magic Link**. Setja kóðann í póstinn, t.d.:

   ```html
   <h2>Innskráningarkóði fyrir GIGGARA</h2>
   <p>Sláðu þennan kóða inn í appinu:</p>
   <p style="font-size:28px;letter-spacing:4px"><b>{{ .Token }}</b></p>
   <p>Kóðinn gildir í klukkustund. Ef þú baðst ekki um hann máttu hunsa þennan póst.</p>
   ```

   Gera eins í **Confirm signup** sniðmátinu, svo nýir notendur fái líka kóða.

## Hvernig það virkar

- Appið talar beint við Supabase (fetch), með opinbera lyklinum (`sb_publishable_…`). Hann má vera í appinu; reglurnar (RLS) í `schema.sql` ráða því hver sér hvað.
- Ein tafla, `records`: hver lína er eitt lag, lagalisti eða tag eins notanda. `updated_at` er breytingartími appsins; nýrri útgáfa vinnur alltaf, líka á þjóninum (`push_records`).
- `seq` hækkar við hverja breytingu, svo tæki sækja bara það sem er nýrra en þau hafa séð. Einu sinni á sólarhring sækir tækið allt.
- Lykilorð gagnagrunnsins og secret lykillinn fara aldrei í appið.
