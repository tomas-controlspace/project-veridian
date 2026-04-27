#!/usr/bin/env node
/**
 * Prepare optimized data files for the dashboard — multi-region edition.
 *
 * Reads from one config block per region (see REGIONS below):
 *   <region.master_path>           per-muni master json
 *   <region.boundaries_path>       per-muni geojson
 *   <region.facilities_path>       per-region facilities
 *   <region.isochrones_dir>        10-min isochrones (muni + provincia)
 *   <region.isochrones_20_dir>     20-min isochrones
 *
 * Outputs to public/data/ (UNIONED across regions):
 *   metrics_municipios.json   all munis from all regions
 *   metrics_provincias.json   all provincias from all regions
 *   metrics_regions.json      one record per region (new file)
 *   metrics_euskadi.json      kept as a legacy alias for backwards compat
 *                             (just the Euskadi region record)
 *   boundaries_municipios.topojson    combined
 *   boundaries_provincias.topojson    combined
 *   facilities.json                   combined
 *   isochrones/{municipios,provincias}/<code>.geojson    combined
 *   isochrones_20/{municipios,provincias}/<code>.geojson combined
 *
 * Adds these new fields per muni / provincia (vs the legacy Euskadi-only
 * pipeline):
 *   region_code, region_name
 *
 * Catchment metrics are still computed per-region (the spatial index
 * for "muni i is inside isochrone j" is built region-by-region, since
 * isochrones don't cross region boundaries in any meaningful way).
 *
 * Opportunity score is RANK-NORMALIZED GLOBALLY (across all munis from
 * all regions) so the choropleth places Málaga and Euskadi on the same
 * comparison axis. Was per-region (Euskadi-only) in the legacy pipeline.
 */

const fs = require('fs');
const path = require('path');
const topojson = require('topojson-server');
const topojsonSimplify = require('topojson-simplify');
const topojsonClient = require('topojson-client');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'data');

fs.mkdirSync(OUT, { recursive: true });

// ─────────────────────────────────────────────────────────────────────
// REGION CONFIG
// ─────────────────────────────────────────────────────────────────────
const REGIONS = [
  {
    code: 'PV', // INE CCAA code for País Vasco / Euskadi
    name: 'Euskadi',
    master_path: 'data/es/master_municipios.json',
    boundaries_path: 'data/es/boundaries_municipios.geojson',
    facilities_path: 'data/es/facilities/basque_facilities.json',
    facilities_shape: 'array', // legacy: file is a top-level JSON array
    isochrones_dir: 'data/es/isochrones',
    isochrones_20_dir: 'data/es/isochrones_20',
    provincia_codes: ['01', '20', '48'],
    provincia_names: { '01': 'Álava/Araba', '20': 'Gipuzkoa', '48': 'Bizkaia' },
  },
  {
    code: 'AN', // INE CCAA code for Andalucía
    name: 'Málaga', // single-province subset of Andalucía for now; rename when other AN provincias land
    master_path: 'data/es/malaga/master_municipios_malaga.json',
    boundaries_path: 'data/es/malaga/boundaries_municipios_malaga.geojson',
    facilities_path: 'data/es/malaga/facilities/malaga_facilities.json',
    facilities_shape: 'object', // { facilities: [...], summary: {...} }
    isochrones_dir: 'data/es/malaga/isochrones',
    isochrones_20_dir: 'data/es/malaga/isochrones_20',
    provincia_codes: ['29'],
    provincia_names: { '29': 'Málaga' },
  },
];

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
function round(v, d) {
  if (v == null) return null;
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf-8'));
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// ─────────────────────────────────────────────────────────────────────
// Facility classification (region-agnostic)
// ─────────────────────────────────────────────────────────────────────
const GUARDAMUEBLES_RE =
  /mudanzas|gil stauffer|bengala|bricomudanzas|bizidem|pms log|islatrans|trasteros axarqu/i;

function classifyFacility(f) {
  // Operator name lives in `operator` for Euskadi, `brand` for Málaga.
  // The facility-name field can also tag a guardamuebles (e.g., Independent
  // brand but named "Mudanzas Transur").
  const opName = `${f.operator || f.brand || ''} ${f.name || ''}`.trim();
  f.facility_type = GUARDAMUEBLES_RE.test(opName) ? 'guardamuebles' : 'self_storage';

  // size_tier from NLA. Both schemas standardised on nla_sqm (Málaga
  // research merge renamed nla_m2 → nla_sqm). Euskadi also has
  // estimated_nla as a fallback.
  const nla = f.nla_sqm ?? f.estimated_nla ?? 0;
  if (!nla || nla <= 0) f.size_tier = 'unknown';
  else if (nla < 300) f.size_tier = 'small';
  else if (nla < 1500) f.size_tier = 'medium';
  else if (nla < 5000) f.size_tier = 'large';
  else f.size_tier = 'xlarge';
}

// ─────────────────────────────────────────────────────────────────────
// Load all regions, build combined collections
// ─────────────────────────────────────────────────────────────────────
const master = {}; // ine_code → muni record
const allMuniFeatures = []; // boundary geojson features, with region_code
const facilities = []; // combined facility list (post-normalization)
const isoPathByCode = {}; // ine_code → 10-min isochrone file path
const isoPathByCode20 = {}; // ine_code → 20-min isochrone file path
const provIsoPathByCode = {}; // provincia code → 10-min isochrone file path
const provIsoPathByCode20 = {}; // provincia code → 20-min isochrone file path
const provNames = {}; // provincia code → name
const provToRegion = {}; // provincia code → region code
const regionConfig = {}; // region code → config block (for output construction)

for (const region of REGIONS) {
  console.log(`\n=== Loading region: ${region.name} (${region.code}) ===`);
  regionConfig[region.code] = region;
  Object.assign(provNames, region.provincia_names);
  for (const pc of region.provincia_codes) provToRegion[pc] = region.code;

  // ---- Master per-muni ----
  const m = readJSON(region.master_path);
  for (const [code, rec] of Object.entries(m)) {
    rec.region_code = region.code;
    rec.region_name = region.name;
    master[code] = rec;
  }
  console.log(`  ${Object.keys(m).length} munis`);

  // ---- Boundaries ----
  const gj = readJSON(region.boundaries_path);
  for (const feat of gj.features) {
    feat.properties = feat.properties || {};
    feat.properties.region_code = region.code;
    allMuniFeatures.push(feat);
  }
  console.log(`  ${gj.features.length} boundary features`);

  // ---- Facilities ----
  const facPath = path.join(ROOT, region.facilities_path);
  if (fs.existsSync(facPath)) {
    const raw = readJSON(region.facilities_path);
    let arr = region.facilities_shape === 'array' ? raw : raw.facilities || [];
    // Build a name → ine_code map for the region (used when facility lacks ine_code)
    const nameToIne = {};
    for (const [code, rec] of Object.entries(m)) nameToIne[normName(rec.name)] = code;
    for (const f of arr) {
      if (!f.ine_code && f.municipio) {
        const cand = nameToIne[normName(f.municipio)];
        if (cand) f.ine_code = cand;
      }
      if (f.ine_code && master[f.ine_code]) {
        f.region_code = region.code;
        classifyFacility(f);
        facilities.push(f);
      } else {
        // Facility couldn't be matched to a master muni; skip with a warning.
        console.log(
          `  ! facility ${f.id || f.name} muni="${f.municipio}" ine="${f.ine_code}" — no master match`,
        );
      }
    }
    console.log(`  ${arr.length} facilities loaded, ${facilities.filter((x) => x.region_code === region.code).length} kept`);
  } else {
    console.log(`  ! facilities file not found: ${region.facilities_path}`);
  }

  // ---- Isochrone paths ----
  for (const [dirRel, map] of [
    [region.isochrones_dir, isoPathByCode],
    [region.isochrones_20_dir, isoPathByCode20],
  ]) {
    const muniDir = path.join(ROOT, dirRel, 'municipios');
    if (fs.existsSync(muniDir)) {
      for (const f of fs.readdirSync(muniDir)) {
        if (!f.endsWith('.geojson')) continue;
        const code = path.basename(f, '.geojson');
        map[code] = path.join(muniDir, f);
      }
    }
  }
  for (const [dirRel, map] of [
    [region.isochrones_dir, provIsoPathByCode],
    [region.isochrones_20_dir, provIsoPathByCode20],
  ]) {
    const provDir = path.join(ROOT, dirRel, 'provincias');
    if (fs.existsSync(provDir)) {
      for (const f of fs.readdirSync(provDir)) {
        if (!f.endsWith('.geojson')) continue;
        const code = path.basename(f, '.geojson');
        map[code] = path.join(provDir, f);
      }
    }
  }
}

const munis = Object.values(master);
console.log(
  `\nCombined: ${munis.length} munis across ${REGIONS.length} regions, ${facilities.length} facilities`,
);

const combinedGeoJSON = { type: 'FeatureCollection', features: allMuniFeatures };

// ─────────────────────────────────────────────────────────────────────
// Aggregate facility supply onto each muni
// ─────────────────────────────────────────────────────────────────────
const supplyByMuni = {};
for (const f of facilities) {
  const code = f.ine_code;
  if (!code) continue;
  if (!supplyByMuni[code]) {
    supplyByMuni[code] = {
      facility_count: 0,
      ss_facility_count: 0,
      total_nla: 0,
      total_constructed: 0,
      operators: new Set(),
    };
  }
  const s = supplyByMuni[code];
  s.facility_count++;
  if (f.facility_type === 'self_storage') s.ss_facility_count++;
  s.total_nla += f.nla_sqm ?? f.estimated_nla ?? 0;
  s.total_constructed += f.constructed_area_sqm || 0;
  s.operators.add(f.operator || f.brand || 'Unknown');
}

for (const [code, s] of Object.entries(supplyByMuni)) {
  if (!master[code]) continue;
  const m = master[code];
  const pop = m.pop_2025 || 0;
  const households = m.total_dwellings || 0;
  m.facility_count = s.facility_count;
  m.ss_facility_count = s.ss_facility_count;
  m.nla_sqm = round(s.total_nla, 2);
  m.constructed_area_sqm = round(s.total_constructed, 2);
  m.nla_per_capita = pop > 0 ? round(s.total_nla / pop, 4) : null;
  m.nla_per_1000_households =
    households > 0 ? round((s.total_nla / households) * 1000, 2) : null;
  m.operator_count = s.operators.size;
}
for (const m of Object.values(master)) {
  if (m.facility_count == null) {
    m.facility_count = 0;
    m.ss_facility_count = 0;
    m.nla_sqm = 0;
    m.constructed_area_sqm = 0;
    m.nla_per_capita = 0;
    m.nla_per_1000_households = 0;
    m.operator_count = 0;
  }
}
console.log(`Supply metrics applied to ${Object.keys(supplyByMuni).length} munis`);

// ─────────────────────────────────────────────────────────────────────
// Initial output: facilities.json + metrics_municipios.json (will be re-written
// later with catchment + opportunity_score added)
// ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(OUT, 'facilities.json'), JSON.stringify(facilities));
console.log('✓ facilities.json (initial)');

fs.writeFileSync(path.join(OUT, 'metrics_municipios.json'), JSON.stringify(master));
console.log('✓ metrics_municipios.json (initial)');

// ─────────────────────────────────────────────────────────────────────
// Provincia + region aggregations
// ─────────────────────────────────────────────────────────────────────
function aggregateToLevel(entries) {
  const totalPop = entries.reduce((s, m) => s + (m.pop_2025 || 0), 0);
  const totalPop2024 = entries.reduce((s, m) => s + (m.pop_2024 || 0), 0);
  const totalArea = entries.reduce((s, m) => s + (m.area_km2 || 0), 0);
  const totalDwellings = entries.reduce((s, m) => s + (m.total_dwellings || 0), 0);
  const totalFamilyDwellings = entries.reduce(
    (s, m) => s + (m.total_family_dwellings || 0),
    0,
  );

  const totalRented = entries.reduce(
    (s, m) => s + ((m.total_dwellings || 0) * (m.pct_rented || 0)) / 100,
    0,
  );
  const totalOwned = entries.reduce(
    (s, m) => s + ((m.total_dwellings || 0) * (m.pct_owned || 0)) / 100,
    0,
  );
  const totalApartment = entries.reduce(
    (s, m) => s + ((m.total_family_dwellings || 0) * (m.pct_apartment || 0)) / 100,
    0,
  );
  const totalYoung = entries.reduce(
    (s, m) => s + ((m.pop_2025 || 0) * (m.pct_young_0_19 || 0)) / 100,
    0,
  );
  const totalWorking = entries.reduce(
    (s, m) => s + ((m.pop_2025 || 0) * (m.pct_working_20_64 || 0)) / 100,
    0,
  );
  const totalSenior = entries.reduce(
    (s, m) => s + ((m.pop_2025 || 0) * (m.pct_senior_65_plus || 0)) / 100,
    0,
  );

  function popWeighted(field) {
    let sumWt = 0,
      sumVal = 0;
    for (const m of entries) {
      if (m[field] != null && m.pop_2025) {
        sumWt += m.pop_2025;
        sumVal += m.pop_2025 * m[field];
      }
    }
    return sumWt > 0 ? sumVal / sumWt : null;
  }

  const muniTurnover = entries.reduce((s, m) => s + (m.housing_turnover || 0), 0);
  const provTurnover =
    entries.find((m) => m.housing_turnover_annual_prov != null)?.housing_turnover_annual_prov ||
    null;

  return {
    pop_2025: totalPop,
    pop_2024: totalPop2024,
    area_km2: round(totalArea, 2),
    density_per_km2: totalArea > 0 ? round(totalPop / totalArea, 1) : null,
    pop_growth_5yr_pct: round(popWeighted('pop_growth_5yr_pct'), 2),
    pct_young_0_19: totalPop > 0 ? round((totalYoung / totalPop) * 100, 2) : null,
    pct_working_20_64: totalPop > 0 ? round((totalWorking / totalPop) * 100, 2) : null,
    pct_senior_65_plus: totalPop > 0 ? round((totalSenior / totalPop) * 100, 2) : null,
    avg_total_income: round(popWeighted('avg_total_income'), 0),
    avg_available_income: round(popWeighted('avg_available_income'), 0),
    total_dwellings: totalDwellings,
    pct_rented: totalDwellings > 0 ? round((totalRented / totalDwellings) * 100, 2) : null,
    pct_owned: totalDwellings > 0 ? round((totalOwned / totalDwellings) * 100, 2) : null,
    pct_apartment:
      totalFamilyDwellings > 0
        ? round((totalApartment / totalFamilyDwellings) * 100, 2)
        : null,
    pct_house:
      totalFamilyDwellings > 0
        ? round(((totalFamilyDwellings - totalApartment) / totalFamilyDwellings) * 100, 2)
        : null,
    total_family_dwellings: totalFamilyDwellings,
    avg_surface_m2: round(popWeighted('avg_surface_m2'), 1),
    avg_price_sqm: round(popWeighted('avg_price_sqm'), 2),
    avg_rent_sqm: round(popWeighted('avg_rent_sqm'), 4),
    avg_rent_sqm_active: round(popWeighted('avg_rent_sqm_active'), 4),
    housing_turnover: muniTurnover || null,
    housing_turnover_annual_prov: provTurnover,
    nla_sqm: entries.reduce((s, m) => s + (m.nla_sqm || 0), 0) || null,
    nla_per_capita:
      totalPop > 0
        ? round(entries.reduce((s, m) => s + (m.nla_sqm || 0), 0) / totalPop, 4)
        : null,
    facility_count: entries.reduce((s, m) => s + (m.facility_count || 0), 0),
    ss_facility_count: entries.reduce((s, m) => s + (m.ss_facility_count || 0), 0),
    constructed_area_sqm: entries.reduce((s, m) => s + (m.constructed_area_sqm || 0), 0),
    nla_per_1000_households:
      totalDwellings > 0
        ? round(
            (entries.reduce((s, m) => s + (m.nla_sqm || 0), 0) / totalDwellings) * 1000,
            2,
          )
        : null,
    operator_count: entries.reduce((s, m) => s + (m.operator_count || 0), 0),
    opportunity_score: popWeighted('opportunity_score'),
  };
}

// ── provincias ──
const byProv = {};
for (const m of munis) {
  const pc = m.provincia_code;
  if (!byProv[pc]) byProv[pc] = [];
  byProv[pc].push(m);
}
const provincias = {};
for (const [code, entries] of Object.entries(byProv)) {
  const agg = aggregateToLevel(entries);
  provincias[code] = {
    provincia_code: code,
    provincia_name: provNames[code] || code,
    region_code: provToRegion[code],
    region_name: regionConfig[provToRegion[code]]?.name,
    ...agg,
  };
}
fs.writeFileSync(path.join(OUT, 'metrics_provincias.json'), JSON.stringify(provincias));
console.log('✓ metrics_provincias.json (initial)');

// ── regions (top-level) ──
const byRegion = {};
for (const m of munis) {
  if (!byRegion[m.region_code]) byRegion[m.region_code] = [];
  byRegion[m.region_code].push(m);
}
const regions = {};
for (const [code, entries] of Object.entries(byRegion)) {
  regions[code] = {
    region_code: code,
    region_name: regionConfig[code]?.name || code,
    ...aggregateToLevel(entries),
  };
}
fs.writeFileSync(path.join(OUT, 'metrics_regions.json'), JSON.stringify(regions));
console.log('✓ metrics_regions.json (initial)');

// Legacy alias kept for backwards compat with the current frontend, which
// fetches metrics_euskadi.json directly. Frontend will switch to
// metrics_regions.json in the multi-region UI branch.
if (regions.PV) {
  fs.writeFileSync(
    path.join(OUT, 'metrics_euskadi.json'),
    JSON.stringify({ name: 'Euskadi', ...regions.PV }),
  );
  console.log('✓ metrics_euskadi.json (legacy alias)');
}

// ─────────────────────────────────────────────────────────────────────
// Catchment metrics (per-muni isochrone overlay)
// ─────────────────────────────────────────────────────────────────────
let polygonClipping = null;
try {
  polygonClipping = require('polygon-clipping');
} catch (e) {
  console.warn('⚠ polygon-clipping not installed, catchment computation will be skipped');
}

function ringCentroid(ring) {
  let cx = 0,
    cy = 0,
    area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
    area += f;
  }
  area /= 2;
  if (Math.abs(area) < 1e-10) {
    return [
      ring.reduce((s, p) => s + p[0], 0) / ring.length,
      ring.reduce((s, p) => s + p[1], 0) / ring.length,
    ];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

function pointInRing(pt, ring) {
  const [px, py] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function pointInGeometry(pt, geom) {
  if (geom.type === 'Polygon') {
    if (!pointInRing(pt, geom.coordinates[0])) return false;
    for (let i = 1; i < geom.coordinates.length; i++) {
      if (pointInRing(pt, geom.coordinates[i])) return false;
    }
    return true;
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (pointInRing(pt, poly[0])) {
        let inHole = false;
        for (let i = 1; i < poly.length; i++) {
          if (pointInRing(pt, poly[i])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

// Per-region spatial indexes — a Málaga isochrone shouldn't sweep up
// a Bilbao muni (and the false-positives polygon-clipping might give
// would only burn cycles).
const spatialIndexByRegion = {};
for (const region of REGIONS) spatialIndexByRegion[region.code] = [];

for (const feature of allMuniFeatures) {
  const code = feature.properties.ine_code;
  const m = master[code];
  const geom = feature.geometry;
  if (!m || !geom) continue;
  let polyCoords;
  if (geom.type === 'Polygon') {
    polyCoords = geom.coordinates;
  } else if (geom.type === 'MultiPolygon') {
    let bestArea = 0,
      bestIdx = 0;
    for (let i = 0; i < geom.coordinates.length; i++) {
      let a = 0;
      const ring = geom.coordinates[i][0];
      for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
        a += (ring[k][0] - ring[j][0]) * (ring[k][1] + ring[j][1]);
      }
      if (Math.abs(a) > bestArea) {
        bestArea = Math.abs(a);
        bestIdx = i;
      }
    }
    polyCoords = geom.coordinates[bestIdx];
  }
  const centroid = ringCentroid(polyCoords[0]);
  spatialIndexByRegion[m.region_code].push({ ine_code: code, centroid, polyCoords, metrics: m });
}
for (const [rc, idx] of Object.entries(spatialIndexByRegion)) {
  console.log(`  spatial index — ${rc}: ${idx.length} munis`);
}

function loadIsochrone(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    const iso = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (iso.type === 'FeatureCollection' && iso.features?.length > 0)
      return iso.features[0].geometry;
    if (iso.type === 'Feature') return iso.geometry;
    if (iso.type === 'Polygon' || iso.type === 'MultiPolygon') return iso;
    return null;
  } catch (e) {
    return null;
  }
}

function findMunisInIsochrone(geometry, regionCode) {
  if (!geometry || !polygonClipping) return [];
  const isoPolys =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  if (isoPolys.length === 0) return [];
  let bMinX = Infinity,
    bMinY = Infinity,
    bMaxX = -Infinity,
    bMaxY = -Infinity;
  for (const poly of isoPolys)
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < bMinX) bMinX = x;
        if (x > bMaxX) bMaxX = x;
        if (y < bMinY) bMinY = y;
        if (y > bMaxY) bMaxY = y;
      }
  const result = [];
  const idx = spatialIndexByRegion[regionCode] || [];
  for (const p of idx) {
    if (!p.polyCoords?.length) continue;
    let pMinX = Infinity,
      pMinY = Infinity,
      pMaxX = -Infinity,
      pMaxY = -Infinity;
    for (const ring of p.polyCoords)
      for (const [x, y] of ring) {
        if (x < pMinX) pMinX = x;
        if (x > pMaxX) pMaxX = x;
        if (y < pMinY) pMinY = y;
        if (y > pMaxY) pMaxY = y;
      }
    if (pMaxX < bMinX || pMinX > bMaxX || pMaxY < bMinY || pMinY > bMaxY) continue;
    try {
      const inter = polygonClipping.intersection(p.polyCoords, ...isoPolys);
      if (inter && inter.length > 0) result.push(p);
    } catch (e) {
      if (pointInGeometry(p.centroid, geometry)) result.push(p);
    }
  }
  return result;
}

function catchmentMetrics(insideMunis) {
  const catchPop = insideMunis.reduce((s, p) => s + (p.metrics.pop_2025 || 0), 0);
  const catchArea = insideMunis.reduce((s, p) => s + (p.metrics.area_km2 || 0), 0);
  const catchDwellings = insideMunis.reduce(
    (s, p) => s + (p.metrics.total_dwellings || 0),
    0,
  );
  const catchFamilyDwellings = insideMunis.reduce(
    (s, p) => s + (p.metrics.total_family_dwellings || 0),
    0,
  );
  let catchApartments = 0,
    catchRented = 0,
    catchOwned = 0;
  let incWtdSum = 0,
    incWtdPop = 0;
  let priceWtdSum = 0,
    priceWtdPop = 0;
  let rentWtdSum = 0,
    rentWtdPop = 0;
  let seniorWtd = 0,
    workingWtd = 0;
  let growthWtd = 0,
    growthWtdPop = 0;
  let surfaceWtd = 0,
    surfaceWtdPop = 0;
  let catchNLA = 0;
  let catchTurnoverSum = 0;
  let catchFacilityCount = 0;
  let catchSSFacilityCount = 0;
  let oppWtd = 0,
    oppWtdPop = 0;
  for (const p of insideMunis) {
    const m = p.metrics;
    const pop = m.pop_2025 || 0;
    catchApartments += ((m.total_family_dwellings || 0) * (m.pct_apartment || 0)) / 100;
    catchRented += ((m.total_dwellings || 0) * (m.pct_rented || 0)) / 100;
    catchOwned += ((m.total_dwellings || 0) * (m.pct_owned || 0)) / 100;
    if (m.avg_total_income != null && pop > 0) {
      incWtdSum += m.avg_total_income * pop;
      incWtdPop += pop;
    }
    if (m.avg_price_sqm != null && pop > 0) {
      priceWtdSum += m.avg_price_sqm * pop;
      priceWtdPop += pop;
    }
    if (m.avg_rent_sqm != null && pop > 0) {
      rentWtdSum += m.avg_rent_sqm * pop;
      rentWtdPop += pop;
    }
    if (m.pop_growth_5yr_pct != null && pop > 0) {
      growthWtd += m.pop_growth_5yr_pct * pop;
      growthWtdPop += pop;
    }
    if (m.avg_surface_m2 != null && pop > 0) {
      surfaceWtd += m.avg_surface_m2 * pop;
      surfaceWtdPop += pop;
    }
    seniorWtd += (pop * (m.pct_senior_65_plus || 0)) / 100;
    workingWtd += (pop * (m.pct_working_20_64 || 0)) / 100;
    catchNLA += m.nla_sqm || 0;
    catchTurnoverSum += m.housing_turnover || 0;
    catchFacilityCount += m.facility_count || 0;
    catchSSFacilityCount += m.ss_facility_count || 0;
    if (m.opportunity_score != null && pop > 0) {
      oppWtd += m.opportunity_score * pop;
      oppWtdPop += pop;
    }
  }
  return {
    catchment_pop: catchPop,
    catchment_density: catchArea > 0 ? round(catchPop / catchArea, 1) : null,
    catch_pop_growth: growthWtdPop > 0 ? round(growthWtd / growthWtdPop, 2) : null,
    catch_pct_apartment:
      catchFamilyDwellings > 0 ? round((catchApartments / catchFamilyDwellings) * 100, 1) : null,
    catch_pct_house:
      catchFamilyDwellings > 0
        ? round(((catchFamilyDwellings - catchApartments) / catchFamilyDwellings) * 100, 1)
        : null,
    catch_avg_surface_m2: surfaceWtdPop > 0 ? round(surfaceWtd / surfaceWtdPop, 1) : null,
    catch_pct_rented: catchDwellings > 0 ? round((catchRented / catchDwellings) * 100, 1) : null,
    catch_pct_owned: catchDwellings > 0 ? round((catchOwned / catchDwellings) * 100, 1) : null,
    catch_avg_income: incWtdPop > 0 ? round(incWtdSum / incWtdPop, 0) : null,
    catch_avg_price_sqm: priceWtdPop > 0 ? round(priceWtdSum / priceWtdPop, 2) : null,
    catch_avg_rent_sqm: rentWtdPop > 0 ? round(rentWtdSum / rentWtdPop, 4) : null,
    catch_housing_turnover: catchTurnoverSum || null,
    catch_nla_sqm: catchNLA || null,
    catch_nla_per_capita: catchPop > 0 && catchNLA > 0 ? round(catchNLA / catchPop, 4) : null,
    catch_pct_senior: catchPop > 0 ? round((seniorWtd / catchPop) * 100, 1) : null,
    catch_pct_working: catchPop > 0 ? round((workingWtd / catchPop) * 100, 1) : null,
    catch_n_municipios: insideMunis.length,
    catch_facility_count: catchFacilityCount,
    catch_ss_facility_count: catchSSFacilityCount,
    catch_nla_per_1000_hh:
      catchDwellings > 0 && catchNLA > 0 ? round((catchNLA / catchDwellings) * 1000, 2) : null,
    catch_opportunity_score: oppWtdPop > 0 ? round(oppWtd / oppWtdPop, 1) : null,
  };
}

if (polygonClipping) {
  console.log('\nComputing catchment areas...');

  function runCatchment(rangeMins, isoMap, provMap, prefix) {
    let computed = 0;
    for (const [code, isoPath] of Object.entries(isoMap)) {
      const m = master[code];
      if (!m) continue;
      const geom = loadIsochrone(isoPath);
      if (!geom) continue;
      const inside = findMunisInIsochrone(geom, m.region_code);
      const metrics = catchmentMetrics(inside);
      const codes = inside.map((p) => p.metrics.ine_code);
      if (prefix === 'catch_') {
        Object.assign(m, metrics);
        m.catch_ine_codes = codes;
      } else {
        // catch20_ — rename keys
        for (const [k, v] of Object.entries(metrics)) {
          if (k.startsWith('catchment_')) m['catch20_' + k.slice('catchment_'.length)] = v;
          else if (k.startsWith('catch_')) m['catch20_' + k.slice('catch_'.length)] = v;
          else m[k] = v;
        }
        m.catch20_ine_codes = codes;
      }
      computed++;
    }
    console.log(`  ✓ ${rangeMins}-min muni catchments computed (${computed})`);

    // Provincia catchments
    for (const [pcode, pRec] of Object.entries(provincias)) {
      const isoPath = provMap[pcode];
      const geom = loadIsochrone(isoPath);
      if (!geom) continue;
      const inside = findMunisInIsochrone(geom, pRec.region_code);
      const metrics = catchmentMetrics(inside);
      if (prefix === 'catch_') {
        Object.assign(pRec, metrics);
      } else {
        for (const [k, v] of Object.entries(metrics)) {
          if (k.startsWith('catchment_')) pRec['catch20_' + k.slice('catchment_'.length)] = v;
          else if (k.startsWith('catch_')) pRec['catch20_' + k.slice('catch_'.length)] = v;
          else pRec[k] = v;
        }
      }
    }
    console.log(`  ✓ ${rangeMins}-min provincia catchments computed`);

    // Region (top-level) catchments — aggregate over ALL munis in the region
    for (const [rcode, rRec] of Object.entries(regions)) {
      const inside = (spatialIndexByRegion[rcode] || []).map((p) => ({ metrics: p.metrics }));
      const metrics = catchmentMetrics(inside);
      if (prefix === 'catch_') {
        Object.assign(rRec, metrics);
      } else {
        for (const [k, v] of Object.entries(metrics)) {
          if (k.startsWith('catchment_')) rRec['catch20_' + k.slice('catchment_'.length)] = v;
          else if (k.startsWith('catch_')) rRec['catch20_' + k.slice('catch_'.length)] = v;
          else rRec[k] = v;
        }
      }
    }
    console.log(`  ✓ ${rangeMins}-min region catchments computed`);
  }

  if (Object.keys(isoPathByCode).length > 0) {
    runCatchment(10, isoPathByCode, provIsoPathByCode, 'catch_');
  } else {
    console.log('  ! No 10-min isochrone files found for any region');
  }
  if (Object.keys(isoPathByCode20).length > 0) {
    runCatchment(20, isoPathByCode20, provIsoPathByCode20, 'catch20_');
  } else {
    console.log('  ! No 20-min isochrone files found for any region');
  }

  // Copy isochrone files to public/data/, reducing precision
  function copyIsoDir(srcMap, outSubdir) {
    const dstMuni = path.join(OUT, outSubdir, 'municipios');
    fs.mkdirSync(dstMuni, { recursive: true });
    let n = 0;
    for (const [code, src] of Object.entries(srcMap)) {
      const dst = path.join(dstMuni, code + '.geojson');
      const reduced = fs
        .readFileSync(src, 'utf-8')
        .replace(/-?\d+\.\d{5,}/g, (m) => parseFloat(parseFloat(m).toFixed(4)).toString());
      fs.writeFileSync(dst, reduced);
      n++;
    }
    return n;
  }

  function copyIsoProvDir(srcMap, outSubdir) {
    const dstProv = path.join(OUT, outSubdir, 'provincias');
    fs.mkdirSync(dstProv, { recursive: true });
    let n = 0;
    for (const [code, src] of Object.entries(srcMap)) {
      const dst = path.join(dstProv, code + '.geojson');
      const reduced = fs
        .readFileSync(src, 'utf-8')
        .replace(/-?\d+\.\d{5,}/g, (m) => parseFloat(parseFloat(m).toFixed(4)).toString());
      fs.writeFileSync(dst, reduced);
      n++;
    }
    return n;
  }

  const m10 = copyIsoDir(isoPathByCode, 'isochrones');
  const p10 = copyIsoProvDir(provIsoPathByCode, 'isochrones');
  console.log(`  ✓ copied ${m10} muni + ${p10} provincia 10-min isochrones`);
  if (Object.keys(isoPathByCode20).length > 0) {
    const m20 = copyIsoDir(isoPathByCode20, 'isochrones_20');
    const p20 = copyIsoProvDir(provIsoPathByCode20, 'isochrones_20');
    console.log(`  ✓ copied ${m20} muni + ${p20} provincia 20-min isochrones`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Opportunity score (rank-normalized GLOBALLY across all regions)
// ─────────────────────────────────────────────────────────────────────
console.log('\nComputing opportunity scores (global rank)...');
const scorable = munis.filter((m) => (m.pop_2025 || 0) > 1000);

function rankNormalize(arr, field, inverse = false) {
  const vals = arr
    .map((m) => ({ code: m.ine_code, val: m[field] ?? 0 }))
    .sort((a, b) => a.val - b.val);
  const ranks = {};
  for (let i = 0; i < vals.length; i++) {
    ranks[vals[i].code] = (i / (vals.length - 1)) * 100;
  }
  if (inverse) for (const code of Object.keys(ranks)) ranks[code] = 100 - ranks[code];
  return ranks;
}

const densityRank = rankNormalize(scorable, 'density_per_km2');
const incomeRank = rankNormalize(scorable, 'avg_total_income');
const apartmentRank = rankNormalize(scorable, 'pct_apartment');
const growthRank = rankNormalize(scorable, 'pop_growth_5yr_pct');
const nlaCapitaRank = rankNormalize(scorable, 'nla_per_capita', true);
const rentedRank = rankNormalize(scorable, 'pct_rented');

const W = {
  density: 0.2,
  income: 0.15,
  apartment: 0.2,
  growth: 0.1,
  nla_gap: 0.25,
  rented: 0.1,
};

for (const m of munis) {
  const code = m.ine_code;
  if (densityRank[code] == null) {
    m.opportunity_score = null;
    continue;
  }
  m.opportunity_score = round(
    W.density * densityRank[code] +
      W.income * incomeRank[code] +
      W.apartment * apartmentRank[code] +
      W.growth * growthRank[code] +
      W.nla_gap * nlaCapitaRank[code] +
      W.rented * rentedRank[code],
    1,
  );
}

const scored = munis.filter((m) => m.opportunity_score != null);
console.log(`  ✓ scored ${scored.length} munis (top 5 across all regions):`);
scored.sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0));
for (const m of scored.slice(0, 5)) {
  console.log(`    ${m.region_name} / ${m.name} (${m.ine_code}): ${m.opportunity_score}`);
}

// Patch catchment opportunity scores now that munis have scores
for (const m of munis) {
  if (m.catch_ine_codes) {
    let oppWtd = 0,
      oppWtdPop = 0;
    for (const ineCode of m.catch_ine_codes) {
      const cm = master[ineCode];
      if (cm && cm.opportunity_score != null && (cm.pop_2025 || 0) > 0) {
        oppWtd += cm.opportunity_score * cm.pop_2025;
        oppWtdPop += cm.pop_2025;
      }
    }
    m.catch_opportunity_score = oppWtdPop > 0 ? round(oppWtd / oppWtdPop, 1) : null;
  }
  if (m.catch20_ine_codes) {
    let opp20Wtd = 0,
      opp20WtdPop = 0;
    for (const ineCode of m.catch20_ine_codes) {
      const cm = master[ineCode];
      if (cm && cm.opportunity_score != null && (cm.pop_2025 || 0) > 0) {
        opp20Wtd += cm.opportunity_score * cm.pop_2025;
        opp20WtdPop += cm.pop_2025;
      }
    }
    m.catch20_opportunity_score = opp20WtdPop > 0 ? round(opp20Wtd / opp20WtdPop, 1) : null;
  }
}
console.log('  ✓ patched catchment opportunity scores');

// Re-compute provincia/region aggregates now that munis have opp_score
for (const [code, entries] of Object.entries(byProv)) {
  const agg = aggregateToLevel(entries);
  provincias[code] = { ...provincias[code], ...agg };
}
for (const [code, entries] of Object.entries(byRegion)) {
  const agg = aggregateToLevel(entries);
  regions[code] = { ...regions[code], ...agg };
}

// ─────────────────────────────────────────────────────────────────────
// Final writes
// ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(path.join(OUT, 'metrics_municipios.json'), JSON.stringify(master));
fs.writeFileSync(path.join(OUT, 'metrics_provincias.json'), JSON.stringify(provincias));
fs.writeFileSync(path.join(OUT, 'metrics_regions.json'), JSON.stringify(regions));
if (regions.PV) {
  fs.writeFileSync(
    path.join(OUT, 'metrics_euskadi.json'),
    JSON.stringify({ name: 'Euskadi', ...regions.PV }),
  );
}
fs.writeFileSync(path.join(OUT, 'facilities.json'), JSON.stringify(facilities));
console.log('\n✓ Final metrics files written (with catchment + opportunity_score)');

// ─────────────────────────────────────────────────────────────────────
// Boundaries — combined topojson
// ─────────────────────────────────────────────────────────────────────
function reducePrecision(geoj, decimals = 5) {
  const str = JSON.stringify(geoj);
  return JSON.parse(
    str.replace(/(-?\d+\.\d+)/g, (m) =>
      parseFloat(parseFloat(m).toFixed(decimals)).toString(),
    ),
  );
}

const geojsonReduced = reducePrecision(combinedGeoJSON);
for (const f of geojsonReduced.features) {
  f.properties = {
    ine_code: f.properties.ine_code,
    name: f.properties.name,
    provincia_code: f.properties.provincia_code,
    region_code: f.properties.region_code,
  };
}

const topoMuni = topojson.topology({ municipios: geojsonReduced });
const preSimp = topojsonSimplify.presimplify(topoMuni);
const simplified = topojsonSimplify.simplify(preSimp, topojsonSimplify.quantile(preSimp, 0.02));

fs.writeFileSync(path.join(OUT, 'boundaries_municipios.topojson'), JSON.stringify(simplified));
console.log(
  `✓ boundaries_municipios.topojson (${(Buffer.byteLength(JSON.stringify(combinedGeoJSON)) / 1024).toFixed(0)} KB raw → ${(Buffer.byteLength(JSON.stringify(simplified)) / 1024).toFixed(0)} KB)`,
);

// Provincia topojson — dissolve by provincia_code
const provFeatures = [];
for (const code of Object.keys(provNames)) {
  const matchingGeoms = simplified.objects.municipios.geometries.filter(
    (g) => g.properties.provincia_code === code,
  );
  if (matchingGeoms.length > 0) {
    const merged = topojsonClient.merge(simplified, matchingGeoms);
    provFeatures.push({
      type: 'Feature',
      properties: {
        provincia_code: code,
        provincia_name: provNames[code],
        region_code: provToRegion[code],
      },
      geometry: merged,
    });
  }
}
const topoProv = topojson.topology({ provincias: { type: 'FeatureCollection', features: provFeatures } });
fs.writeFileSync(path.join(OUT, 'boundaries_provincias.topojson'), JSON.stringify(topoProv));
console.log('✓ boundaries_provincias.topojson');

console.log('\nAll files written to public/data/');
