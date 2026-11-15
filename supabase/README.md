# Aðgangar (Supabase)

GIGGARI notar Supabase verkefnið „Giggari“ fyrir innskráningu og samstillingu milli tækja.

## Uppsetning (einu sinni)

1. **Gagnagrunnur:** Supabase → SQL Editor → New query → líma allt úr `schema.sql` → Run. Má keyra aftur án skaða.
2. **Slóð appsins:** Authentication → URL Configuration → **Site URL** `https://daximaxi.github.io/songgiggin/` og sama slóð undir **Redirect URLs**. Ef geymslan er endurnefnd þarf að breyta slóðinni hér líka.

Póstsniðmátunum þarf ekki að breyta (og á fríu áskriftinni með innbyggða póstþjóninum er það ekki hægt). Pósturinn er með hlekk:

- Hlekkurinn opnar appið og skráir inn (Supabase sendir á slóðina sem appið gaf upp, með innskráningunni aftan við #; appið tekur hana og hreinsar slóðina).
- Ef hlekkurinn opnast í vafranum en ekki í uppsetta appinu: afrita hlekkinn og líma hann í Stillingar → Aðgangur. Appið staðfestir hann sjálft.
- Ef eigin póstþjónn kemur síðar má setja `{{ .Token }}` í sniðmátið; reiturinn tekur líka við kóða.
- Innbyggði póstþjónninn sendir aðeins 2 pósta á klukkustund og aðeins til meðlima Supabase skipulagsins. Eigin póstþjónn þarf áður en aðrir skrá sig inn.

## Viðbót í 4.1: deila lagalista með hlekk

Keyra `schema.sql` aftur í SQL Editor (allt skjalið; það sem er þegar til breytist ekki). Það bætir við:

- Töflu `shares`: ein lína á hvern virkan hlekk (löng tilviljanakennd runa, eigandi, lagalisti). Hver sér og eyðir aðeins sínum hlekkjum. „Hætta að deila“ eyðir línunni.
- Fallinu `get_share(t)`: hver sem er (án innskráningar) fær lagalistann og lögin á honum gegn rununni, eins og eigandinn samstillti þau síðast. Glósur eigandans (`notes`) eru teknar af. Ekkert annað úr safninu sést.

## Viðbót í 4.2: Fylgja

Keyra `schema.sql` aftur í SQL Editor (allt skjalið). Það bætir við:

- Dálkinum `live` á `shares`: hvar stjórnandinn er staddur (`{on, uid, brk, at}`). Aðeins eigandinn getur breytt honum.
- Fallinu `get_live(t)`: hver sem er með hlekkinn fær stöðuna, án innskráningar. Appið spyr á 2 sekúndna fresti á meðan sviðið er opið og fylgt er.

## Hvernig það virkar

- Appið talar beint við Supabase (fetch), með opinbera lyklinum (`sb_publishable_…`). Hann má vera í appinu; reglurnar (RLS) í `schema.sql` ráða því hver sér hvað.
- Ein tafla, `records`: hver lína er eitt lag, lagalisti eða tag eins notanda. `updated_at` er breytingartími appsins; nýrri útgáfa vinnur alltaf, líka á þjóninum (`push_records`).
- `seq` hækkar við hverja breytingu, svo tæki sækja bara það sem er nýrra en þau hafa séð. Einu sinni á sólarhring sækir tækið allt.
- Lykilorð gagnagrunnsins og secret lykillinn fara aldrei í appið.
