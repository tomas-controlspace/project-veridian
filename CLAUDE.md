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
    Sidebar.tsx      # Left sidebar with search, filters, isochrone toggle
    MapView.tsx      # Leaflet map with choropleth, isochrones, facilities, draw tools
    BottomPanel.tsx  # Tab container for Comparison, Ranking, Facilities
    ComparisonPanel.tsx  # Side-by-side area metrics with dual catchment table
    RankingTable.tsx     # Sortable/paginated table of all areas
    FacilitiesPanel.tsx  # Catchment + Custom Area facility lists with zone badges
    DrawPolygon.tsx      # Polygon drawing interaction on map
    DrawToolbar.tsx      # Draw/Clear/Cancel toolbar overlay
  lib/
    store.tsx        # React Context store (all app state — NO Redux/Zustand)
    metrics.ts       # METRIC_DEFS, color scales, formatValue()
    filters.ts       # Filter logic (population, income, price, rent ranges)
    geo.ts           # pointInPolygon() ray-casting utility
  types/
    index.ts         # MunicipioMetrics, ProvinciaMetrics, EuskadiMetrics, Filters

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
  metrics_municipios.json  # All 252 municipios with ~60 fields each
  metrics_provincias.json  # 3 provincias
  metrics_euskadi.json     # Region aggregate
  boundaries_municipios.topojson  # Simplified boundaries
  boundaries_provincias.topojson
  facilities.json          # Facility list for map markers
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
- `drawMode`, `drawnPolygon`: polygon drawing state
- `facilitiesMode`: 'catchment' | 'custom'

### Catchment Areas
Each municipio has two catchment zones computed at build time:
- **10-min** (`catch_*` fields, `catch_ine_codes`): municipios whose boundaries intersect the 10-min drive-time isochrone
- **20-min** (`catch20_*` fields, `catch20_ine_codes`): same for 20-min isochrone

The `catchmentMetrics()` function in prepare-data.js computes population-weighted averages and dwelling-weighted percentages (NOT simple averages of municipal percentages).

### Map Interactions
- Choropleth: GeoJSON layer with click-to-select, hover highlighting
- Isochrones: fetched per-selection from `/data/isochrones/` and `/data/isochrones_20/`
- Facilities: CircleMarkers with tooltips
- Draw-on-map: custom implementation using Leaflet events (no leaflet-draw dependency)
- Draw mode guards municipio selection clicks (`guardedToggle`)

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
2. Add a `CompRow` entry to the appropriate `*_ROWS` array in `ComparisonPanel.tsx`
3. If it should appear on the choropleth, add to `METRIC_DEFS` in `src/lib/metrics.ts`

### Adding a new metric to the ranking table
Add a column definition in the `numCols` array in `RankingTable.tsx`

## Gotchas

- **react-leaflet v5** requires components like `<GeoJSON>`, `<Polygon>`, etc. to be children of `<MapContainer>`. Use `useMap()` hook inside child components to access the map instance.
- **GeoJSON key prop**: The `<GeoJSON>` component doesn't re-render on data change. Pass a unique `key` prop (e.g., `geoKey`) to force re-mount when data/style changes.
- **Double-click zoom**: Must be manually disabled during draw mode (`map.doubleClickZoom.disable()`)
- **setState during render**: Avoid calling store setters inside `setVertices` updater functions in DrawPolygon — use a `useRef` to read current state instead.
- **Isochrone files**: 13 municipios have no isochrone data (API errors or no road access). The app handles missing files gracefully.
