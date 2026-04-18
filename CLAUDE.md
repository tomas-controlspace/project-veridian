# Project Veridian — Claude Code Guide

## What This Is

An interactive dashboard for analyzing the self-storage market in the Basque Country (Euskadi), Spain. Built for **Control Space**, a self-storage consultancy. Deployed on Vercel via GitHub (`tomas-controlspace/project-veridian`).

Users can compare municipios, provincias, or all of Euskadi across demographics, housing, and self-storage metrics. The app shows choropleth maps, catchment areas (10-min and 20-min drive-time isochrones), facility locations, and ranking tables.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Mapping**: Leaflet 1.9 + react-leaflet 5 (NOT Mapbox)
- **Styling**: Tailwind CSS 4 + custom CSS tokens (`veridian-tokens.css`)
- **Tables**: TanStack Table v8
- **Geospatial**: topojson-client/server/simplify, polygon-clipping
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
  lib/
    store.tsx            # React Context store (all app state — NO Redux/Zustand)
    metrics.ts           # METRIC_DEFS, color scales, formatValue()
    comparisonRows.ts    # Shared POPULATION/HOUSING/STORAGE/CATCHMENT row defs
    customAreaMetrics.ts # polygon-clipping intersection + weighted aggregation for drawn areas
    filters.ts           # Filter logic (population, income, price, rent ranges)
    geo.ts               # pointInPolygon() ray-casting utility
  types/
    index.ts             # MunicipioMetrics, ProvinciaMetrics, EuskadiMetrics, Filters, DrawnArea

scripts/
  prepare-data.js          # Build-time: source data → public/data/ (metrics, boundaries, isochrones)
  generate-isochrones.js   # ORS API: 10-min isochrones (needs ORS_API_KEY env var)
  generate-isochrones-20.js # ORS API: 20-min isochrones (needs ORS_API_KEY env var)

data/es/                   # Source data (NOT served to browser)
  master_municipios.json   # Raw metrics per municipio
  boundaries_municipios.geojson  # Full-resolution boundaries
  facilities/basque_facilities.json  # 53 storage facilities
  isochrones/              # 10-min isochrone GeoJSON files (239 municipios + 3 provincias)
  isochrones_20/           # 20-min isochrone GeoJSON files

public/data/               # Build output (served to browser via fetch)
  metrics_municipios.json  # All 252 municipios with ~80 fields each
  metrics_provincias.json  # 3 provincias
  metrics_euskadi.json     # Region aggregate
  boundaries_municipios.topojson  # Simplified boundaries
  boundaries_provincias.topojson
  facilities.json          # Facility list for map markers (with facility_type and size_tier)
  isochrones/              # Precision-reduced 10-min isochrone GeoJSON
  isochrones_20/           # Precision-reduced 20-min isochrone GeoJSON
```

## Data Pipeline

Source data does NOT auto-update when changed. The pipeline is:

1. Edit source files in `data/es/`
2. Run `node scripts/prepare-data.js`
3. This writes processed files to `public/data/`
4. The app fetches from `public/data/` at runtime

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
- `level`: 'municipio' | 'provincia' | 'euskadi'
- `selectedIds`: up to 4 selected areas for comparison
- `selectedMetric`: which metric colors the choropleth
- `filters`: population/income/price/rent range filters
- `drawMode`: whether the user is currently drawing a polygon
- `drawnAreas`: array of up to 4 confirmed `DrawnArea` objects (`id`, `name`, `polygon`, `color`, `createdAt`)
- `pendingArea`: a just-closed polygon awaiting name confirmation
- `showChoropleth`: toggle choropleth layer visibility
- `facilitiesMode`: 'catchment' | 'custom'

Area-palette constants: `AREA_COLORS` (purple `#7C3AED`, teal `#2EC4A0`, amber `#E8913A`, pink `#E05A8B`) and `MAX_DRAWN_AREAS = 4` are exported from the store.

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

Only municipios with population >= 1,000 receive a score (153 of 252). The default choropleth metric is `opportunity_score`.

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

## Gotchas

- **react-leaflet v5** requires components like `<GeoJSON>`, `<Polygon>`, etc. to be children of `<MapContainer>`. Use `useMap()` hook inside child components to access the map instance.
- **GeoJSON key prop**: The `<GeoJSON>` component doesn't re-render on data change. Pass a unique `key` prop (e.g., `geoKey`) to force re-mount when data/style changes.
- **Double-click zoom**: Must be manually disabled during draw mode (`map.doubleClickZoom.disable()`)
- **setState during render**: Avoid calling store setters inside `setVertices` updater functions in DrawPolygon — use a `useRef` to read current state instead.
- **Isochrone files**: 13 municipios have no isochrone data (API errors or no road access). The app handles missing files gracefully.
- **CSS variables in inline styles**: `var(--neutral-100)` etc. can resolve to unexpected dark colors in certain rendering contexts. Use explicit hex values (`#EDEEE9`, `#F5F6F2`, `#D5D7D0`) for backgrounds/borders in components like FacilitiesPanel and Sidebar.
- **GeoJSON key and showChoropleth**: Never include `showChoropleth` in the GeoJSON `key` prop or `onEachFeature` dependency array. Toggling choropleth would remount the GeoJSON layer, destroying all event bindings (hover, click, tooltips). Style changes are handled reactively via the `style` callback.
- **bubblingMouseEvents on CircleMarkers**: Must set `bubblingMouseEvents={false}` on facility CircleMarkers. Without this, mouse events bubble through to the polygon layer underneath, causing polygon tooltips to appear instead of facility tooltips.
- **React strict-mode & nested setters**: Never call one `setState` inside another `setState`'s functional updater. React 19 strict mode double-invokes pure updaters in dev, so a nested setter fires twice and duplicates state. `store.tsx::confirmPendingArea` uses a `pendingAreaRef` to read the current pending area, then calls `setPendingArea(null)` and `setDrawnAreas(...)` sequentially at the top level — mirror this pattern for any new store action that reads one slice of state to update another.
