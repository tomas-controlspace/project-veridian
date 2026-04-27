# Project Veridian — Control Space

Interactive dashboard for analyzing the self-storage market in Euskadi (Basque Country, Spain). Built for Control Space, a self-storage consultancy. Compare municipios, provincias, or all of Euskadi across demographics, housing, supply, and a composite Opportunity Score; draw custom catchment areas on the map; and export a 17-slide PPTX case study for any selected area.

## Features

- **Choropleth maps** at three geographic levels — Municipio (252), Provincia (3), Euskadi — with quantile color scales over 10+ metrics
- **Drive-time catchments** at 10 and 20 minutes (precomputed isochrones) with population-weighted catchment metrics
- **Supply metrics** for 53 storage facilities (NLA, density, operator counts) with self-storage / guardamuebles classification and size tiering
- **Opportunity Score** — rank-normalized 0–100 composite (density, % apartment, NLA gap, income, growth, % rented); the default choropleth metric
- **Multi-area select & compare** — click up to 4 areas for a side-by-side comparison panel
- **Draw-on-map custom areas** — sketch up to 4 named polygons; each is aggregated from intersecting municipios with the same weighted math as the precomputed catchments
- **Facilities panel** — catchment-zone or custom-area facility lists with type and size visual badges
- **Sortable ranking table** with type-ahead search and numeric range filters (population, income, price, rent)
- **Export to PPTX** — generate a Control Space-branded 17-slide case study (title, map + catchment, three metric tables, reference slides) for any selected area

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Mapping**: Leaflet 1.9 + react-leaflet 5
- **Styling**: Tailwind CSS 4 + custom CSS tokens (Veridian design system)
- **Tables**: TanStack Table v8
- **Geospatial**: topojson-client/server/simplify, polygon-clipping
- **PPTX export**: docxtemplater + pizzip (template fill), html-to-image (map → PNG), file-saver

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For a production build:

```bash
npm run build
npm start
```

`public/data/` is committed, so the app runs out of the box. The optional sections below are only needed when changing source data, isochrones, or the PPTX template.

### Optional: Reprocess source data

If you edit anything in `data/es/`, regenerate the runtime files:

```bash
node scripts/prepare-data.js
```

### Optional: Regenerate drive-time isochrones

Only needed when adding new municipios or changing drive times. Requires an [OpenRouteService](https://openrouteservice.org/) API key (free tier: 40 req/min, 2000/day):

```bash
ORS_API_KEY=xxx node scripts/generate-isochrones.js     # 10-min (~7 min, 252 calls)
ORS_API_KEY=xxx node scripts/generate-isochrones-20.js  # 20-min (~7 min, 252 calls)
node scripts/prepare-data.js                            # recompute catchment metrics
```

Scripts handle rate limiting and resume from interruptions.

### Optional: Rebuild the PPTX template

The committed `public/templates/case-study.pptx` is the docxtemplater template the export pipeline fills in at runtime. It's built once from the Bilbao reference deck:

```bash
python scripts/prepare-template.py
```

Requires `python-pptx` and `lxml`. The reference deck path is hard-coded near the top of the script.

### Deploy

Push to the GitHub repo connected to Vercel for automatic deployments, or:

```bash
npx vercel
```

## Project Layout

```
src/
  app/         Next.js App Router (layout, page, globals.css, veridian-tokens.css)
  components/  React components — Dashboard orchestrates Header + Sidebar + MapView + BottomPanel
  lib/         Store (React Context), metrics, filters, custom-area aggregation, mapHandle
  lib/export/  PPTX export pipeline (orchestrator, map capture, data builder, templater)
  types/       Domain types: MunicipioMetrics, ProvinciaMetrics, RegionMetrics, RegionConfig, DrawnArea, Filters

scripts/
  prepare-data.js          Build runtime files in public/data/ from data/es/
  generate-isochrones*.js  Fetch ORS isochrones (10- and 20-min)
  prepare-template.py      One-time PPTX template build from the Bilbao reference deck
  render-sample.mjs        QA: render the template with hand-built Bilbao data
  inject-live-map.mjs      QA: swap a sample pptx's placeholder image with a live-captured map PNG

data/es/      Source data (NOT served to browser) — metrics, boundaries, facilities, isochrones
public/data/  Build output served at runtime (committed; rebuilt by scripts/prepare-data.js)
public/templates/case-study.pptx  PPTX template artifact (committed)
```

For deeper architectural notes — state management, catchment math, draw-mode gotchas, the slide-2 aspect lock between `prepare-template.py` and `captureMap.ts`, and why `<TileLayer crossOrigin="anonymous">` matters — see [CLAUDE.md](CLAUDE.md).

## Data Sources

- **Demographics**: INE Padrón (population, age structure)
- **Income**: EUSTAT (average income by municipality)
- **Housing**: EUSTAT Census 2021 (tenure, dwelling types)
- **Prices**: Basque Government ECVI 2025 Q4 (purchase prices)
- **Rent**: Basque Government EMAL 2016–2025 (residential rents)
- **Boundaries**: Eurostat LAU 2024 (municipality polygons)
- **Storage facilities**: Control Space inventory — 53 facilities classified as self-storage or guardamuebles, with NLA / constructed area where available (`data/es/facilities/basque_facilities.json`)
- **Drive-time isochrones**: OpenRouteService API (10- and 20-min driving)

## Branding

Control Space brand with the Veridian design system. Primary accent `#2EC4A0` (veridian green), warm accent `#E8913A` (used for isochrones and facility markers), draw/custom-area `#7C3AED`. CSS tokens defined in `src/app/veridian-tokens.css`.
