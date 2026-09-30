# 🛰️ Satellite Tracker

Živé sledování satelitů v reálném čase 
![preview](https://img.shields.io/badge/status-demo-4fd1ff)

## ✨ Co appka umí

- **Reálná orbitální mechanika** — pozice satelitů se počítají pomocí SGP4/SDP4 propagace
  (knihovna [`satellite.js`](https://github.com/shashwatak/satellite-js)) z TLE dat, ne jen animace.
- **Kategorie satelitů** s barevným rozlišením a počty: Stanice & posádka, Starlink, Počasí & Země,
  Komunikace, Navigace (GNSS), Trosky, Ostatní aktivní — každou lze skrýt/zobrazit.
- **Ovládání času** — pauza/přehrát a zrychlení simulace ×1 / ×30 / ×300 / ×3000, plus tlačítko
  „⟲ Now“ pro návrat k reálnému aktuálnímu času.
- **Vyhledávání** satelitu podle jména.
- **Detail satelitu** po kliknutí — NORAD ID, zeměpisná šířka/délka, výška, rychlost, perioda oběhu,
  sklon dráhy — a volitelně jeho **ground track** (dráha nad Zemí).
- **Automaticky se obnovující data** — GitHub Action stahuje čerstvá TLE z [CelesTrak](https://celestrak.org)
  každých 6 hodin a commitne je zpět do repozitáře (žádné volání CelesTrak přímo z prohlížeče → žádné
  problémy s CORS).

## 📁 Struktura projektu

```
satellite-tracker/
├── index.html                     hlavní stránka
├── css/style.css                  tmavý „vesmírný“ vzhled
├── js/
│   ├── data.js                    definice kategorií (barvy, CelesTrak skupiny, cesty k datům)
│   └── app.js                     hlavní logika (SGP4 propagace, mapa, UI)
├── data/tle/*.json                TLE data po kategoriích (seed data předgenerována)
├── scripts/
│   ├── update_tle.py              stáhne čerstvá TLE z CelesTrak (spouští se v CI nebo lokálně)
│   └── gen_seed_tle.py            vygeneruje počáteční ukázková data (spuštěno již jednou)
└── .github/workflows/update-tle.yml   plánovaná úloha (cron) pro obnovu dat
```

## 🚀 Rychlé spuštění lokálně

Prohlížeče blokují `fetch()` JSON souborů otevřených přes `file://`, takže appku nelze pustit
pouhým dvojklikem na `index.html`. Spusť jednoduchý lokální server:

```bash
cd satellite-tracker
python3 -m http.server 8000
# a otevři http://localhost:8000
```

nebo pomocí Node.js (`npx serve`), nebo VS Code rozšíření **Live Server**.

## 🌍 Nasazení na GitHub Pages (doporučeno)

1. Vytvoř nový repozitář na GitHubu a nahraj do něj obsah této složky:
   ```bash
   cd satellite-tracker
   git init
   git add .
   git commit -m "Initial commit: satellite tracker"
   git branch -M main
   git remote add origin https://github.com/<tvuj-ucet>/satellite-tracker.git
   git push -u origin main
   ```
2. V nastavení repozitáře jdi do **Settings → Pages** a jako zdroj vyber
   **Deploy from a branch** → větev `main`, složka `/ (root)`.
3. Za chvíli bude appka dostupná na `https://<tvuj-ucet>.github.io/satellite-tracker/`.
4. (Volitelně) V **Settings → Actions → General** povol *"Read and write permissions"* pro
   `GITHUB_TOKEN`, aby mohl workflow `update-tle.yml` commitovat obnovená data automaticky.
   Workflow lze také kdykoliv spustit ručně přes záložku **Actions → Refresh TLE data → Run workflow**.

## 🔄 Obnova TLE dat

Data v `data/tle/*.json` jsou zpočátku **syntetická, ale fyzikálně smysluplná** ukázková data
(vygenerovaná pomocí `scripts/gen_seed_tle.py`), aby appka fungovala hned po naklonování.
Pro **skutečná, aktuální** data z CelesTrak spusť:

```bash
python3 scripts/update_tle.py
```

Tohle samé dělá automaticky přiložený GitHub Actions workflow každých 6 hodin.

## 🎨 Přizpůsobení

- **Přidání/úprava kategorií**: uprav pole `CATEGORIES` v `js/data.js` (barva, název, CelesTrak
  skupiny) a odpovídající mapování v `scripts/update_tle.py` (`CATEGORY_GROUPS`).
- **Barvy / vzhled**: `css/style.css` (CSS proměnné v `:root`).
- **Rychlosti simulace**: uprav tlačítka `.speed-btn` v `index.html` a případně `TICK_MS` v `js/app.js`.
- **Limit počtu satelitů na kategorii** (výkon prohlížeče): `cap` hodnoty v `CATEGORY_GROUPS`
  uvnitř `scripts/update_tle.py`.

## 📚 Použité technologie / zdroje dat

| Účel                  | Technologie / zdroj |
|-----------------------|----------------------|
| Mapa                  | [Leaflet](https://leafletjs.com) + [CARTO dark tiles](https://carto.com/) |
| Orbitální propagace   | [satellite.js](https://github.com/shashwatak/satellite-js) (SGP4/SDP4) |
| TLE data              | [CelesTrak](https://celestrak.org) (veřejné, zdarma) |
| Hosting               | GitHub Pages (statický, zdarma) |

## ⚠️ Poznámky

- CelesTrak žádá, aby se jeho GP API nedotazovalo příliš často (data se mění jen několikrát denně) —
  proto workflow běží jen jednou za 6 hodin, ne v reálném čase z prohlížeče.
- Aplikace je čistě klientská (žádný backend, žádné API klíče, žádné poplatky).
