# Project Veridian — Claude Code Guide

## What This Is

An interactive dashboard for analyzing the self-storage market in **Spain** — currently covers two regions: **Euskadi** (País Vasco, 252 municipios) and **Málaga** (single-province subset of Andalucía, 103 municipios). The data model is multi-region from the ground up; new CCAA / provincial subsets plug in via a single REGIONS config block. Built for **Control Space**, a self-storage consultancy. Deployed on Vercel via GitHub (`tomas-controlspace/project-veridian`).

Users can compare municipios, provincias, or the active region's aggregate across demographics, housing, and self-storage metrics. The app shows choropleth maps, catchment areas (10-min and 20-min drive-time isochrones), facility locations, and ranking tables. A region selector in the header switches the entire UI context between regions; opportunity scores are rank-normalised globally across all regions so the choropleth puts every muni on the same scale.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Mapping**: Leaflet 1.9 + react-leaflet 5 (NOT Mapbox)
- **Styling**: Tailwind CSS 4 + custom CSS tokens (`veridian-tokens.css`)
- **Tables**: TanStack Table v8
- **Geospatial**: topojson-client/server/simplify, polygon-clipping
- **PPTX export**: docxtemplater + pizzip (template fill), html-to-image (map → PNG), file-saver (download)
- **Dev server**: `npm run dev` on port 3000 (configured in `.claude/launch.json`)

## Project Structure

```
src/
  app/               # Next.js App Router (layout, page, globals.css, veridian-tokens.css)
  components/        # All React components
    Dashboard.tsx    # Main layout: Header + Sidebar + MapView + BottomPanel
    Header.tsx       # Top bar with geo-level tabs (Municipio/Provincia/Euskadi)
    Sidebar.tsx      # Left sidebar with search, filters, choropleth toggle, isochrone toggle
    MapView.tsx      # Leaflet map with choropleth, isochrones, facilities, draw tools
    BottomPanel.tsx  # Tab container for Comparison, Custom Areas, Ranking, Facilities
    ComparisonPanel.tsx  # Side-by-side area metrics with dual catchment table
    CustomAreasPanel.tsx # Side-by-side comparison of up to 4 drawn custom areas
    RankingTable.tsx     # Sortable/paginated table of all areas
    FacilitiesPanel.tsx  # Catchment + Custom Area facility lists with zone badges
    DrawPolygon.tsx      # Polygon drawing interaction on map
    DrawToolbar.tsx      # Draw button + per-area chips (rename/delete) + clear-all
    AreaNameInput.tsx    # Floating inline name input over a just-closed polygon
    ExportButton.tsx     # Header "Export PPTX" button — triggers exportToPptx for current selection
    ExportCaptureOverlay.tsx # Full-screen step indicator shown while capture/render is in flight
  lib/
    store.tsx            # React Context store (all app state — NO Redux/Zustand)
    metrics.ts           # METRIC_DEFS, color scales, formatValue()
    comparisonRows.ts    # Shared POPULATION/HOUSING/STORAGE/CATCHMENT row defs
    customAreaMetrics.ts # polygon-clipping intersection + weighted aggregation for drawn areas
    filters.ts           # Filter logic (population, income, price, rent ranges)
    geo.ts               # pointInPolygon() ray-casting utility
    mapHandle.ts         # Module-level handle so non-map code (ExportButton) can grab the live L.Map
    export/
      exportToPptx.ts        # Orchestrator: build data → capture map → render template → save
      buildCaseStudyData.ts  # Maps store snapshot → typed CaseStudyData per scope (muni/prov/custom)
      captureMap.ts          # Leaflet map → PNG via html-to-image, cropped to 1.5:1 landscape
      pptxTemplater.ts       # PizZip + docxtemplater fill; swaps ppt/media/image9.png with map PNG
      filename.ts            # "{Area} Case Study - Control Space - YYYY-MM-DD.pptx"
      types.ts               # ExportScope + CaseStudyData + TableRow shapes
  types/
    index.ts             # MunicipioMetrics, ProvinciaMetrics, EuskadiMetrics, Filters, DrawnArea

public/templates/
  case-study.pptx        # Build artifact from prepare-template.py — committed, fetched at runtime

scripts/
  prepare-data.js          # Build-time: source data → public/data/ (metrics, boundaries, isochrones)
  generate-isochrones.js   # ORS API: 10-min isochrones (needs ORS_API_KEY env var)
  generate-isochrones-20.js # ORS API: 20-min isochrones (needs ORS_API_KEY env var)
  prepare-template.py      # One-time: Bilbao reference deck → public/templates/case-study.pptx
  render-sample.mjs        # QA: render template with hand-built Bilbao data → /tmp/bilbao-sample.pptx
  inject-live-map.mjs      # QA: swap the placeholder image in a sample pptx with a live-captured PNG

data/es/                            # Source data (NOT served to browser)
  master_municipios.json             # Euskadi master (252 munis)
  boundaries_municipios.geojson      # Euskadi full-resolution boundaries
  facilities/basque_facilities.json  # 53 storage facilities
  isochrones/                        # Euskadi 10-min isochrone GeoJSON
  isochrones_20/                     # Euskadi 20-min isochrone GeoJSON
  malaga/                            # Málaga staging (mirrors Euskadi shape — see data/es/malaga/README.md)
    master_municipios_malaga.json
    boundaries_municipios_malaga.geojson
    facilities/malaga_facilities.json
    isochrones/, isochrones_20/
  master_municipios_pre_censo2021.json    # Reversal snapshot for housing migration
  master_municipios_pre_price_mivau.json  # Reversal snapshot for price migration

public/data/               # Build output (served to browser via fetch). UNION of all regions.
  metrics_municipios.json  # All 355 munis (252 Euskadi + 103 Málaga), ~80 fields each
  metrics_provincias.json  # 4 provincias (Álava/Bizkaia/Gipuzkoa + Málaga)
  metrics_regions.json     # NEW: one record per region (PV / AN). Replaces metrics_euskadi.json conceptually.
  metrics_euskadi.json     # LEGACY alias — just the PV region record. Frontend doesn't fetch it any more; kept for back-compat.
  boundaries_municipios.topojson  # Combined boundaries with region_code per feature
  boundaries_provincias.topojson  # Combined provincia boundaries with region_code
  facilities.json          # Combined facility list (152 sites: 53 + 99) with facility_type + size_tier
  isochrones/, isochrones_20/  # Per-muni geojson, combined across regions
```

## Data Pipeline

Source data does NOT auto-update when changed. The pipeline is multi-region — one config block per region at the top of `scripts/prepare-data.js`:

```js
const REGIONS = [
  { code: 'PV', name: 'Euskadi', master_path: 'data/es/master_municipios.json', ... },
  { code: 'AN', name: 'Málaga',  master_path: 'data/es/malaga/master_municipios_malaga.json', ... },
];
```

Adding a new region = adding one entry to that array (paths to master JSON, boundaries GeoJSON, facilities JSON, two isochrone dirs, and the region's INE provincia codes).

Pipeline flow:

1. Edit source files in `data/es/` (or `data/es/<region>/`)
2. Run `node scripts/prepare-data.js`
3. Pipeline loads each region, unions into combined collections, runs the same supply / catchment / opportunity pipeline (catchment per-region, opportunity GLOBAL), and writes combined `public/data/`
4. The app fetches from `public/data/` at runtime and filters to the user's selected region

To regenerate isochrones (only needed if adding new municipios or changing drive times):
```
ORS_API_KEY=xxx node scripts/generate-isochrones.js     # 10-min (~7 min, 252 API calls)
ORS_API_KEY=xxx node scripts/generate-isochrones-20.js  # 20-min (~7 min, 252 API calls)
node scripts/prepare-data.js  # Recompute catchment metrics from isochrone data
```

ORS free tier: 40 req/min, 2000/day. Scripts handle rate limiting and resume from interruptions.

## Key Architecture Patterns

### State Management
All state lives in `src/lib/store.tsx` via React Context (`useStore()` hook). No external state library. Key state includes:
- `currentRegion`: 'PV' | 'AN' — the active region (top-level CCAA selector). Switching it clears `selectedIds`, `searchQuery`, `filters` and triggers a map refit to the region's bounds. Default 'PV'.
- `level`: 'municipio' | 'provincia' | 'region' — was `'euskadi'`; renamed to be region-agnostic. The 'region' level shows the active region's aggregate (was the singleton "Euskadi" view).
- `selectedIds`: up to 4 selected areas for comparison
- `selectedMetric`: which metric colors the choropleth
- `filters`: population/income/price/rent range filters
- `drawMode`: whether the user is currently drawing a polygon
- `drawnAreas`: array of up to 4 confirmed `DrawnArea` objects (`id`, `name`, `polygon`, `color`, `createdAt`)
- `pendingArea`: a just-closed polygon awaiting name confirmation
- `showChoropleth`: toggle choropleth layer visibility
- `facilitiesMode`: 'catchment' | 'custom'

Area-palette constants: `AREA_COLORS` (purple `#7C3AED`, teal `#2EC4A0`, amber `#E8913A`, pink `#E05A8B`) and `MAX_DRAWN_AREAS = 4` are exported from the store. The `REGIONS` array (region code, display name, Leaflet bounds) is also exported.

**Region-scoped derivations** (most components consume these, not the raw maps):
- `allMunicipiosList`, `filteredMunicipios`, `currentRegionProvincias`, `currentRegionFacilities` — already filtered to `currentRegion`.
- `currentRegionMetrics` — the active region's aggregate (replaces the old `euskadi` singleton).
- `currentRegionConfig` — bounds, name, etc.
- `allMunicipiosGlobal` — escape hatch for components that need every muni regardless of region (rare).
- `regions` — full map of region records, keyed by region code.
- `euskadi` — legacy alias pointing at `currentRegionMetrics`. New code should prefer `currentRegionMetrics`.

### Catchment Areas
Each municipio has two catchment zones computed at build time:
- **10-min** (`catch_*` fields, `catch_ine_codes`): municipios whose boundaries intersect the 10-min drive-time isochrone
- **20-min** (`catch20_*` fields, `catch20_ine_codes`): same for 20-min isochrone

The `catchmentMetrics()` function in prepare-data.js computes population-weighted averages and dwelling-weighted percentages (NOT simple averages of municipal percentages). Catchment supply fields include `catch_facility_count`, `catch_nla_per_1000_hh`, `catch_opportunity_score` (and `catch20_*` variants).

### Supply Metrics & Opportunity Scoring
Computed at build time in `scripts/prepare-data.js`:

**Facility classification** (applied to 53 facilities):
- `facility_type`: `self_storage` or `guardamuebles` (classified by `constructed_area_sqm` presence + operator name regex for known guardamuebles operators)
- `size_tier`: `small` (<300 m²), `medium` (<1,500 m²), `large` (<5,000 m²), `xlarge` (>=5,000 m²), `unknown` (no NLA data)

**Supply fields per municipio**: `facility_count`, `ss_facility_count`, `nla_sqm`, `constructed_area_sqm`, `nla_per_capita`, `nla_per_1000_households`, `operator_count`

**Opportunity score** (0-100, rank-normalized composite):
- Density: 20% weight
- % apartment dwellings: 20%
- NLA gap (inverse — lower supply = higher score): 25%
- Average income: 15%
- Population growth: 10%
- % rented dwellings: 10%

Only municipios with population >= 1,000 receive a score (228 of 355 across both regions). Rank normalization is **GLOBAL across all regions** — Málaga and Euskadi munis compete on the same axis. The default choropleth metric is `opportunity_score`.

**Post-scoring catchment patch**: After scoring all municipios, the pipeline loops through `catch_ine_codes` and `catch20_ine_codes` to recompute `catch_opportunity_score` and `catch20_opportunity_score` as population-weighted averages of the now-scored municipios.

### Map Interactions
- Choropleth: GeoJSON layer with click-to-select, hover highlighting. Can be toggled on/off from sidebar; when off, polygons render transparent but remain interactive for selection
- Isochrones: fetched per-selection from `/data/isochrones/` and `/data/isochrones_20/`
- Facilities: CircleMarkers with `bubblingMouseEvents={false}` to ensure facility tooltips take priority over polygon tooltips. Differentiated by type (solid orange fill = self-storage, hollow orange stroke = guardamuebles) and size_tier (radius: small=4, medium=6, large=8, xlarge=10)
- Draw-on-map: custom implementation using Leaflet events (no leaflet-draw dependency)
- Draw mode guards municipio selection clicks (`guardedToggle`)

### Multi-area Draw & Compare
Up to 4 named custom areas can be drawn on the map and compared side-by-side.
- **Draw flow**: Click the draw button → click vertices → double-click (or click first vertex) to close. `DrawPolygon` hands the closed ring to `startPendingArea()`; `AreaNameInput` floats an inline input over the polygon centroid pre-filled with `Area N`. Enter confirms (`confirmPendingArea`), Esc discards (`cancelPendingArea`).
- **Aggregation**: `computeAreaMetrics(polygon, municipios, boundariesGeoJSON)` in `src/lib/customAreaMetrics.ts` finds every municipio whose boundary intersects the polygon via `polygon-clipping`, then applies the same weighted math as `catchmentMetrics()` in `prepare-data.js`: population-weighted averages (income, price, rent, growth, surface, opportunity), dwelling-weighted percentages (apartment, rented), and simple sums (population, NLA, facility counts).
- **Boundaries**: `CustomAreasPanel` converts `boundariesMuni` (topojson from the store) to GeoJSON via `topojsonClient.feature()` and memoizes it. Intersecting municipios are included in full (no partial clipping).
- **Colors**: 4-color palette from the store; first free slot is assigned when a pending area is created, so deleting area 2 frees teal for the next draw.
- **UI surface**: `DrawToolbar` shows per-area chips (rename/delete) top-left, a clear-all button, and disables Draw at the 4-area limit. `CustomAreasPanel` is a `BottomPanel` tab that auto-switches on first draw. `FacilitiesPanel` in Custom mode renders one section per drawn area.
- **Row sharing**: `POPULATION_ROWS`, `HOUSING_ROWS`, `STORAGE_ROWS`, `CATCHMENT_ROWS` are centralized in `src/lib/comparisonRows.ts` and consumed by both `ComparisonPanel` and `CustomAreasPanel`.

### Metrics & Formatting
`METRIC_DEFS` in `src/lib/metrics.ts` defines available choropleth metrics. `formatValue()` handles number/percent/euro/euro_sqm/decimal formatting. Color scales use quantile breaks.

### PPTX Export
The header "Export PPTX" button generates a 17-slide Control Space case study for the currently selected area (single municipio, provincia, or one drawn custom area). Two-stage pipeline:

**One-time template build** (`python scripts/prepare-template.py`): consumes the Bilbao reference deck on the developer's Desktop, deletes the two operator-list slides, replaces hard-coded text with docxtemplater tags (`{areaNameUpper}`, `{s2Title}`, `{#catchmentMunis}…{/catchmentMunis}`, `{pop_r1_c1}` etc.), and reshapes slide 2's `Picture Placeholder 8` to a 1.5:1 (3:2) landscape box. Output is committed at `public/templates/case-study.pptx`.

**Runtime export** (`src/lib/export/exportToPptx.ts`):
1. `buildCaseStudyData()` projects the store snapshot into typed `CaseStudyData` (per-scope title, column labels, bullets, three table sections). Provincia bullets = top 15 munis by population; custom-area uses the same weighted aggregation as `customAreaMetrics.ts`.
2. `captureMap()` fits the map to the subject (+10-min catchment for municipios), waits for tiles, and rasterizes the Leaflet container via `html-to-image` (`toPng`). The resulting PNG is **center-cropped to 1.5:1** before returning, so the source aspect matches the slide-2 placeholder exactly and `<a:stretch>` produces no distortion.
3. `pptxTemplater.renderPptx()` runs docxtemplater over the template, then swaps `ppt/media/image9.png` in-place with the captured PNG.
4. `file-saver` triggers the download.

**Aspect lock**: the slide-2 placeholder box (`tag_slide2` in `prepare-template.py`, `cx=3870000, cy=2580000`) and `TARGET_ASPECT = 1.5` in `captureMap.ts` are coupled — both files cross-reference each other in comments. If you change one, change the other.

`mapHandle.ts` is a module-level singleton populated by `MapHandleBridge` inside `<MapContainer>`; it's how `ExportButton` (outside the map tree) gets the live `L.Map` instance.

## Branding

**Control Space** branding with the **Veridian** design system:
- Primary accent: `#2EC4A0` (veridian green)
- Warm accent: `#E8913A` (orange — used for isochrones and facility markers)
- Draw/custom area: `#7C3AED` (purple)
- Neutral palette: `#2A2D26` (dark text) through `#F5F6F2` (light bg)
- CSS tokens defined in `src/app/veridian-tokens.css`
- H3 headings: `#547d74`, H4 headings: `#409b7e`

## Common Tasks

### Adding a new facility
1. Edit `data/es/facilities/basque_facilities.json`
2. Run `node scripts/prepare-data.js`
3. Restart dev server or hard refresh

### Adding a new metric to the comparison panel
1. Add the field to types in `src/types/index.ts`
2. Add a `CompRow` entry to the appropriate `*_ROWS` array in `src/lib/comparisonRows.ts` (shared by `ComparisonPanel` and `CustomAreasPanel`)
3. If Custom Areas should compute it, also add the matching aggregation in `src/lib/customAreaMetrics.ts::aggregateMetrics`
4. If it should appear on the choropleth, add to `METRIC_DEFS` in `src/lib/metrics.ts`

### Adding a new metric to the ranking table
Add a column definition in the `numCols` array in `RankingTable.tsx`

### Adding a metric row to the case-study PPTX
1. Add a `RowSpec` entry to the appropriate `POP_SPEC` / `HOUSING_SPEC` / `STORAGE_SPEC` array in `src/lib/export/buildCaseStudyData.ts`
2. If the row count for that table grows, edit `tag_table_slide` calls in `scripts/prepare-template.py` (the third arg is the body row count) and re-run `python scripts/prepare-template.py`. The reference deck only ships with as many table rows as it was authored with — adding a row beyond that requires editing `case-study.pptx` source first.
3. For new column-1 fields (subject side) ensure `MunicipioMetrics`/`ProvinciaMetrics`/`EuskadiMetrics`/`CustomAreaMetrics` types expose them.

## Gotchas

- **react-leaflet v5** requires components like `<GeoJSON>`, `<Polygon>`, etc. to be children of `<MapContainer>`. Use `useMap()` hook inside child components to access the map instance.
- **GeoJSON key prop**: The `<GeoJSON>` component doesn't re-render on data change. Pass a unique `key` prop (e.g., `geoKey`) to force re-mount when data/style changes.
- **Double-click zoom**: Must be manually disabled during draw mode (`map.doubleClickZoom.disable()`)
- **setState during render**: Avoid calling store setters inside `setVertices` updater functions in DrawPolygon — use a `useRef` to read current state instead.
- **Isochrone files**: All 252 Basque + 103 Málaga municipios have both 10-min and 20-min isochrones (the original Euskadi run silently dropped 13 munis on rate-limit retries — patched by re-running `scripts/generate-isochrones{,-20}.js` with a fresh ORS key). Both `generate-isochrones*.js` scripts have a known silent-drop bug if a muni hits 3 RATE_LIMITED retries in a row — they fall through without setting `progress[code] = 'error'`. Re-running picks them up because the skip check is `progress[code] === 'done'`. App + pipeline still tolerate missing files (catchments default to null) so a future region can drop a few without breaking anything.
- **CSS variables in inline styles**: `var(--neutral-100)` etc. can resolve to unexpected dark colors in certain rendering contexts. Use explicit hex values (`#EDEEE9`, `#F5F6F2`, `#D5D7D0`) for backgrounds/borders in components like FacilitiesPanel and Sidebar.
- **GeoJSON key and showChoropleth**: Never include `showChoropleth` in the GeoJSON `key` prop or `onEachFeature` dependency array. Toggling choropleth would remount the GeoJSON layer, destroying all event bindings (hover, click, tooltips). Style changes are handled reactively via the `style` callback.
- **bubblingMouseEvents on CircleMarkers**: Must set `bubblingMouseEvents={false}` on facility CircleMarkers. Without this, mouse events bubble through to the polygon layer underneath, causing polygon tooltips to appear instead of facility tooltips.
- **React strict-mode & nested setters**: Never call one `setState` inside another `setState`'s functional updater. React 19 strict mode double-invokes pure updaters in dev, so a nested setter fires twice and duplicates state. `store.tsx::confirmPendingArea` uses a `pendingAreaRef` to read the current pending area, then calls `setPendingArea(null)` and `setDrawnAreas(...)` sequentially at the top level — mirror this pattern for any new store action that reads one slice of state to update another.
- **TileLayer `crossOrigin="anonymous"`**: required so `html-to-image` can read tile pixels into the captured PNG. Without it the canvas is tainted and `toPng` either throws or returns blank tiles. Don't remove this prop from the `<TileLayer>` in `MapView.tsx`.
- **`captureMap` stalls in hidden/occluded tabs**: both our `waitAnimationFrame` helper and `html-to-image`'s internal Image-decode path depend on `requestAnimationFrame`, which Chromium throttles when `document.visibilityState === 'hidden'`. Real users with a visible window are fine, but headless preview browsers and backgrounded automation will hang at "Capturing map…" with no error. To test the export end-to-end, run it from a foregrounded window and drop the file somewhere accessible. For data-plumbing-only verification, `scripts/smoke-test-pptx-malaga.mjs` exercises buildCaseStudyData → docxtemplater render in pure Node (no map capture).
- **Region-scoped derivations** (multi-region store, `src/lib/store.tsx`): components that show data for the active region only must consume `allMunicipiosList` / `filteredMunicipios` / `currentRegionProvincias` / `currentRegionFacilities`. The raw `municipios` and `provincias` maps contain ALL regions — using them directly in a UI component will leak Bilbao munis into a Málaga view. The escape hatch is `allMunicipiosGlobal` for components that genuinely want every muni (rare; mostly for global-rank tables).
- **Choropleth uniform-swath effect for Málaga rural munis**: 91 of 103 Málaga munis use the **provincial price fallback** (€2,897/m² constructed from MIVAU Tabla 1 — the MIVAU >25k hab publication threshold leaves 91 munis with no muni-level value). The price choropleth therefore renders large uniform swaths across the rural interior. This is correct given the source — not a rendering bug. Same pattern applies to housing tenure / apartment / surface for the 84 munis that fall into INE Censo 2021 size-bin aggregates (provincial-bin per band) instead of muni-microdata. Document this behaviour in any tooltip / legend redesign.
- **`metrics_euskadi.json` is a legacy alias**: `prepare-data.js` still emits it (a copy of `regions.PV` from `metrics_regions.json`), but the frontend no longer fetches it. Don't add new code that reads `metrics_euskadi.json`. Use `metrics_regions.json` keyed by region code. The alias can be retired in a flag-day cleanup once we're sure no external dashboards / scrapers consume it.
- **Facility schema is a union, not one shape**: Euskadi facilities use `operator`, `nla_sqm`, `estimated_nla`. Málaga facilities use `brand`, `nla_sqm`, `constructed_area_sqm`, `nla_estimated`, `nla_confidence`. Both flow through the same `Facility` interface (`src/lib/store.tsx`), and the pipeline + UI normalise reads as `f.operator || f.brand` and `f.nla_sqm ?? f.estimated_nla`. **7 Málaga facilities have `nla_sqm: null`** — never assume the field is populated. Pipeline contributes 0 from null-NLA facilities to muni totals (which is correct).
- **Region switching clears UI state**: `setCurrentRegion` resets `selectedIds`, `searchQuery`, and `filters` to defaults. This is intentional — selections / searches / filters scoped to one region don't make sense after a switch. If you add new "user choice" state, decide explicitly whether it should reset on region change and update `setCurrentRegion` in `store.tsx` accordingly.
- **Opportunity score is GLOBAL rank**: `prepare-data.js` rank-normalises across all 228 scored munis from all regions. A muni's score is its position in the all-Spain distribution, not its position within its own region. Top scorers therefore tend to cluster in whichever region has the most "underserved + dense + high-apartment" munis (currently Euskadi — top 5 globally are all Basque). Don't add per-region opportunity ranking unless you also expose a global ranking — the muni-to-muni cross-region comparison is the whole point of the multi-region pipeline.
