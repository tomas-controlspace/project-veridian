#!/usr/bin/env node
/**
 * Prepare optimized data files for the dashboard.
 *
 * Reads:
 *   data/es/master_municipios.json
 *   data/es/boundaries_municipios.geojson
 *
 * Outputs to public/data/:
 *   metrics_municipios.json
 *   metrics_provincias.json
 *   metrics_euskadi.json
 *   boundaries_municipios.topojson
 *   boundaries_provincias.topojson
 */

const fs = require('fs');
const path = require('path');
const topojson = require('topojson-server');
const topojsonSimplify = require('topojson-simplify');
const topojsonClient = require('topojson-client');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'data');

// Ensure output directory
fs.mkdirSync(OUT, { recursive: true });

// ── Load source data ────────────────────────────────────────────────
const master = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'es', 'master_municipios.json'), 'utf-8')
);
const geojson = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data', 'es', 'boundaries_municipios.geojson'), 'utf-8')
);

// ── Load facilities ─────────────────────────────────────────────────
const FACILITIES_PATH = path.join(ROOT, 'data', 'es', 'facilities', 'basque_facilities.json');
let facilities = [];
if (fs.existsSync(FACILITIES_PATH)) {
  facilities = JSON.parse(fs.readFileSync(FACILITIES_PATH, 'utf-8'));
  console.log(`Loaded ${facilities.length} facilities`);

  // Classify facility_type
  for (const f of facilities) {
    if (f.constructed_area_sqm === 0 && /mudanzas|gil stauffer|bengala|bricomudanzas|bizidem|pms log/i.test(f.operator)) {
      f.facility_type = 'guardamuebles';
    } else {
      f.facility_type = 'self_storage';
    }
  }

  // Classify size_tier
  for (const f of facilities) {
    const nla = f.estimated_nla || 0;
    if (nla === 0) f.size_tier = 'unknown';
    else if (nla < 300) f.size_tier = 'small';
    else if (nla < 1500) f.size_tier = 'medium';
    else if (nla < 5000) f.size_tier = 'large';
    else f.size_tier = 'xlarge';
  }

  // Aggregate facility data by municipio
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
    if (f.facility_type === 'self_storage') {
      s.ss_facility_count++;
    }
    s.total_nla += (f.estimated_nla || f.nla_sqm || 0);
    s.total_constructed += (f.constructed_area_sqm || 0);
    s.operators.add(f.operator);
  }

  // Write supply metrics into master
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
    m.nla_per_1000_households = households > 0 ? round((s.total_nla / households) * 1000, 2) : null;
    m.operator_count = s.operators.size;
  }

  // Set zero values for municipios with NO facilities
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

  console.log(`  ✓ Supply metrics assigned to ${Object.keys(supplyByMuni).length} municipios`);
} else {
  console.log('⚠ No facilities file found');
}

const munis = Object.values(master);
console.log(`Loaded ${munis.length} municipios`);
console.log(`Loaded ${geojson.features.length} boundary features`);

// ── 0. facilities.json (copy to public) ─────────────────────────────
if (facilities.length > 0) {
  fs.writeFileSync(path.join(OUT, 'facilities.json'), JSON.stringify(facilities));
  console.log('✓ facilities.json');
}

// ── 1. metrics_municipios.json ──────────────────────────────────────
fs.writeFileSync(
  path.join(OUT, 'metrics_municipios.json'),
  JSON.stringify(master)
);
console.log('✓ metrics_municipios.json');

// ── 2. metrics_provincias.json ──────────────────────────────────────
const PROV_NAMES = { '01': 'Álava/Araba', '20': 'Gipuzkoa', '48': 'Bizkaia' };

function aggregateToLevel(entries) {
  const totalPop = entries.reduce((s, m) => s + (m.pop_2025 || 0), 0);
  const totalPop2024 = entries.reduce((s, m) => s + (m.pop_2024 || 0), 0);
  const totalArea = entries.reduce((s, m) => s + (m.area_km2 || 0), 0);
  const totalDwellings = entries.reduce((s, m) => s + (m.total_dwellings || 0), 0);
  const totalFamilyDwellings = entries.reduce((s, m) => s + (m.total_family_dwellings || 0), 0);

  // Raw counts for recomputing percentages
  const totalRented = entries.reduce((s, m) => s + (m.total_dwellings || 0) * (m.pct_rented || 0) / 100, 0);
  const totalOwned = entries.reduce((s, m) => s + (m.total_dwellings || 0) * (m.pct_owned || 0) / 100, 0);
  const totalApartment = entries.reduce((s, m) => s + (m.total_family_dwellings || 0) * (m.pct_apartment || 0) / 100, 0);
  const totalYoung = entries.reduce((s, m) => s + (m.pop_2025 || 0) * (m.pct_young_0_19 || 0) / 100, 0);
  const totalWorking = entries.reduce((s, m) => s + (m.pop_2025 || 0) * (m.pct_working_20_64 || 0) / 100, 0);
  const totalSenior = entries.reduce((s, m) => s + (m.pop_2025 || 0) * (m.pct_senior_65_plus || 0) / 100, 0);

  // Population-weighted averages
  function popWeighted(field) {
    let sumWt = 0, sumVal = 0;
    for (const m of entries) {
      if (m[field] != null && m.pop_2025) {
        sumWt += m.pop_2025;
        sumVal += m.pop_2025 * m[field];
      }
    }
    return sumWt > 0 ? sumVal / sumWt : null;
  }

  // Housing turnover: sum municipal-level data; fall back to provincial estimate
  const muniTurnover = entries.reduce((s, m) => s + (m.housing_turnover || 0), 0);
  const provTurnover = entries.find(m => m.housing_turnover_annual_prov != null)?.housing_turnover_annual_prov || null;

  return {
    pop_2025: totalPop,
    pop_2024: totalPop2024,
    area_km2: round(totalArea, 2),
    density_per_km2: round(totalPop / totalArea, 1),
    pop_growth_5yr_pct: round(popWeighted('pop_growth_5yr_pct'), 2),
    pct_young_0_19: round(totalYoung / totalPop * 100, 2),
    pct_working_20_64: round(totalWorking / totalPop * 100, 2),
    pct_senior_65_plus: round(totalSenior / totalPop * 100, 2),
    avg_total_income: round(popWeighted('avg_total_income'), 0),
    avg_available_income: round(popWeighted('avg_available_income'), 0),
    total_dwellings: totalDwellings,
    pct_rented: round(totalRented / totalDwellings * 100, 2),
    pct_owned: round(totalOwned / totalDwellings * 100, 2),
    pct_apartment: totalFamilyDwellings > 0 ? round(totalApartment / totalFamilyDwellings * 100, 2) : null,
    pct_house: totalFamilyDwellings > 0 ? round((totalFamilyDwellings - totalApartment) / totalFamilyDwellings * 100, 2) : null,
    total_family_dwellings: totalFamilyDwellings,
    avg_surface_m2: round(popWeighted('avg_surface_m2'), 1),
    avg_price_sqm: round(popWeighted('avg_price_sqm'), 2),
    avg_rent_sqm: round(popWeighted('avg_rent_sqm'), 4),
    avg_rent_sqm_active: round(popWeighted('avg_rent_sqm_active'), 4),
    housing_turnover: muniTurnover || null,
    housing_turnover_annual_prov: provTurnover,
    nla_sqm: entries.reduce((s, m) => s + (m.nla_sqm || 0), 0) || null,
    nla_per_capita: totalPop > 0 ? round(entries.reduce((s, m) => s + (m.nla_sqm || 0), 0) / totalPop, 4) : null,
    facility_count: entries.reduce((s, m) => s + (m.facility_count || 0), 0),
    ss_facility_count: entries.reduce((s, m) => s + (m.ss_facility_count || 0), 0),
    constructed_area_sqm: entries.reduce((s, m) => s + (m.constructed_area_sqm || 0), 0),
    nla_per_1000_households: totalDwellings > 0
      ? round(entries.reduce((s, m) => s + (m.nla_sqm || 0), 0) / totalDwellings * 1000, 2)
      : null,
    operator_count: entries.reduce((s, m) => s + (m.operator_count || 0), 0),
    opportunity_score: popWeighted('opportunity_score'),
  };
}

function round(v, d) {
  if (v == null) return null;
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

// Group by provincia
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
    provincia_name: PROV_NAMES[code],
    ...agg,
  };
}

fs.writeFileSync(
  path.join(OUT, 'metrics_provincias.json'),
  JSON.stringify(provincias)
);
console.log('✓ metrics_provincias.json');

// ── 3. metrics_euskadi.json ─────────────────────────────────────────
const euskadi = {
  name: 'Euskadi',
  ...aggregateToLevel(munis),
};

fs.writeFileSync(
  path.join(OUT, 'metrics_euskadi.json'),
  JSON.stringify(euskadi)
);
console.log('✓ metrics_euskadi.json');

// ── 3b. Catchment area computation ──────────────────────────────────
const MUNI_ISO_DIR = path.join(ROOT, 'data', 'es', 'isochrones', 'municipios');
const PROV_ISO_DIR = path.join(ROOT, 'data', 'es', 'isochrones', 'provincias');
const ISO_OUT_MUNI = path.join(OUT, 'isochrones', 'municipios');
const ISO_OUT_PROV = path.join(OUT, 'isochrones', 'provincias');

const MUNI_ISO_DIR_20 = path.join(ROOT, 'data', 'es', 'isochrones_20', 'municipios');
const PROV_ISO_DIR_20 = path.join(ROOT, 'data', 'es', 'isochrones_20', 'provincias');
const ISO_OUT_MUNI_20 = path.join(OUT, 'isochrones_20', 'municipios');
const ISO_OUT_PROV_20 = path.join(OUT, 'isochrones_20', 'provincias');

let hasIsochrones = fs.existsSync(MUNI_ISO_DIR) &&
  fs.readdirSync(MUNI_ISO_DIR).filter(f => f.endsWith('.geojson')).length > 0;

if (hasIsochrones) {
  let polygonClipping;
  try {
    polygonClipping = require('polygon-clipping');
  } catch (e) {
    console.warn('⚠ polygon-clipping not installed, skipping catchment computation');
    hasIsochrones = false;
  }

  if (hasIsochrones) {
    console.log('\nComputing catchment areas...');

    // Build spatial index: centroid + polygon coords for each municipio
    function ringCentroid(ring) {
      let cx = 0, cy = 0, area = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
        cx += (ring[j][0] + ring[i][0]) * f;
        cy += (ring[j][1] + ring[i][1]) * f;
        area += f;
      }
      area /= 2;
      if (Math.abs(area) < 1e-10) {
        return [ring.reduce((s, p) => s + p[0], 0) / ring.length,
                ring.reduce((s, p) => s + p[1], 0) / ring.length];
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
              if (pointInRing(pt, poly[i])) { inHole = true; break; }
            }
            if (!inHole) return true;
          }
        }
      }
      return false;
    }

    // Build spatial index from original (unreduced) boundaries
    const spatialIndex = [];
    for (const feature of geojson.features) {
      const code = feature.properties.ine_code;
      const geom = feature.geometry;
      const m = master[code];
      if (!m || !geom) continue;

      // Get polygon coordinates for polygon-clipping
      let polyCoords;
      if (geom.type === 'Polygon') {
        polyCoords = geom.coordinates;
      } else if (geom.type === 'MultiPolygon') {
        // Use largest polygon
        let bestArea = 0, bestIdx = 0;
        for (let i = 0; i < geom.coordinates.length; i++) {
          let a = 0;
          const ring = geom.coordinates[i][0];
          for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
            a += (ring[k][0] - ring[j][0]) * (ring[k][1] + ring[j][1]);
          }
          if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); bestIdx = i; }
        }
        polyCoords = geom.coordinates[bestIdx];
      }

      const centroid = ringCentroid(polyCoords[0]);

      spatialIndex.push({
        ine_code: code,
        centroid,
        polyCoords,
        metrics: m,
      });
    }
    console.log(`  Built spatial index for ${spatialIndex.length} municipios`);

    function loadIsochrone(isoPath) {
      if (!fs.existsSync(isoPath)) return null;
      try {
        const iso = JSON.parse(fs.readFileSync(isoPath, 'utf-8'));
        if (iso.type === 'FeatureCollection' && iso.features?.length > 0) {
          return iso.features[0].geometry;
        } else if (iso.type === 'Feature') return iso.geometry;
        else if (iso.type === 'Polygon' || iso.type === 'MultiPolygon') return iso;
        return null;
      } catch (e) { return null; }
    }

    function findMunicipiosInIsochrone(geometry) {
      if (!geometry) return [];
      const isoPolys = geometry.type === 'Polygon' ? [geometry.coordinates] :
        geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
      if (isoPolys.length === 0) return [];

      // Bounding box of isochrone
      let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
      for (const poly of isoPolys) {
        for (const ring of poly) {
          for (const [x, y] of ring) {
            if (x < bMinX) bMinX = x; if (x > bMaxX) bMaxX = x;
            if (y < bMinY) bMinY = y; if (y > bMaxY) bMaxY = y;
          }
        }
      }

      const result = [];
      for (const p of spatialIndex) {
        if (!p.polyCoords || p.polyCoords.length === 0) continue;

        // Bbox rejection
        let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
        for (const ring of p.polyCoords) {
          for (const [x, y] of ring) {
            if (x < pMinX) pMinX = x; if (x > pMaxX) pMaxX = x;
            if (y < pMinY) pMinY = y; if (y > pMaxY) pMaxY = y;
          }
        }
        if (pMaxX < bMinX || pMinX > bMaxX || pMaxY < bMinY || pMinY > bMaxY) continue;

        // True polygon intersection
        try {
          const inter = polygonClipping.intersection(p.polyCoords, ...isoPolys);
          if (inter && inter.length > 0) {
            result.push(p);
          }
        } catch (e) {
          // Fallback: check if centroid is inside isochrone
          if (pointInGeometry(p.centroid, geometry)) {
            result.push(p);
          }
        }
      }
      return result;
    }

    function catchmentMetrics(insideMunis) {
      const catchPop = insideMunis.reduce((s, p) => s + (p.metrics.pop_2025 || 0), 0);
      const catchArea = insideMunis.reduce((s, p) => s + (p.metrics.area_km2 || 0), 0);
      const catchDwellings = insideMunis.reduce((s, p) => s + (p.metrics.total_dwellings || 0), 0);
      const catchFamilyDwellings = insideMunis.reduce((s, p) => s + (p.metrics.total_family_dwellings || 0), 0);

      let catchApartments = 0, catchRented = 0, catchOwned = 0;
      let incWtdSum = 0, incWtdPop = 0;
      let priceWtdSum = 0, priceWtdPop = 0;
      let rentWtdSum = 0, rentWtdPop = 0;
      let seniorWtd = 0, workingWtd = 0;
      let growthWtd = 0, growthWtdPop = 0;
      let surfaceWtd = 0, surfaceWtdPop = 0;
      let catchNLA = 0;
      let catchTurnoverSum = 0;
      let catchFacilityCount = 0;
      let catchSSFacilityCount = 0;
      let oppWtd = 0, oppWtdPop = 0;

      for (const p of insideMunis) {
        const m = p.metrics;
        const pop = m.pop_2025 || 0;

        catchApartments += (m.total_family_dwellings || 0) * (m.pct_apartment || 0) / 100;
        catchRented += (m.total_dwellings || 0) * (m.pct_rented || 0) / 100;
        catchOwned += (m.total_dwellings || 0) * (m.pct_owned || 0) / 100;

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

        seniorWtd += pop * (m.pct_senior_65_plus || 0) / 100;
        workingWtd += pop * (m.pct_working_20_64 || 0) / 100;
        catchNLA += (m.nla_sqm || 0);
        catchTurnoverSum += (m.housing_turnover || 0);
        catchFacilityCount += (m.facility_count || 0);
        catchSSFacilityCount += (m.ss_facility_count || 0);
        if (m.opportunity_score != null && pop > 0) {
          oppWtd += m.opportunity_score * pop;
          oppWtdPop += pop;
        }
      }

      return {
        catchment_pop: catchPop,
        catchment_density: catchArea > 0 ? round(catchPop / catchArea, 1) : null,
        catch_pop_growth: growthWtdPop > 0 ? round(growthWtd / growthWtdPop, 2) : null,
        catch_pct_apartment: catchFamilyDwellings > 0 ? round(catchApartments / catchFamilyDwellings * 100, 1) : null,
        catch_pct_house: catchFamilyDwellings > 0 ? round((catchFamilyDwellings - catchApartments) / catchFamilyDwellings * 100, 1) : null,
        catch_avg_surface_m2: surfaceWtdPop > 0 ? round(surfaceWtd / surfaceWtdPop, 1) : null,
        catch_pct_rented: catchDwellings > 0 ? round(catchRented / catchDwellings * 100, 1) : null,
        catch_pct_owned: catchDwellings > 0 ? round(catchOwned / catchDwellings * 100, 1) : null,
        catch_avg_income: incWtdPop > 0 ? round(incWtdSum / incWtdPop, 0) : null,
        catch_avg_price_sqm: priceWtdPop > 0 ? round(priceWtdSum / priceWtdPop, 2) : null,
        catch_avg_rent_sqm: rentWtdPop > 0 ? round(rentWtdSum / rentWtdPop, 4) : null,
        catch_housing_turnover: catchTurnoverSum || null,
        catch_nla_sqm: catchNLA || null,
        catch_nla_per_capita: catchPop > 0 && catchNLA > 0 ? round(catchNLA / catchPop, 4) : null,
        catch_pct_senior: catchPop > 0 ? round(seniorWtd / catchPop * 100, 1) : null,
        catch_pct_working: catchPop > 0 ? round(workingWtd / catchPop * 100, 1) : null,
        catch_n_municipios: insideMunis.length,
        catch_facility_count: catchFacilityCount,
        catch_ss_facility_count: catchSSFacilityCount,
        catch_nla_per_1000_hh: catchDwellings > 0 && catchNLA > 0
          ? round(catchNLA / catchDwellings * 1000, 2) : null,
        catch_opportunity_score: oppWtdPop > 0 ? round(oppWtd / oppWtdPop, 1) : null,
      };
    }

    // Compute catchment for each municipio
    const isoFiles = fs.readdirSync(MUNI_ISO_DIR).filter(f => f.endsWith('.geojson'));
    let computed = 0;
    for (const file of isoFiles) {
      const code = path.basename(file, '.geojson');
      if (!master[code]) continue;

      const geometry = loadIsochrone(path.join(MUNI_ISO_DIR, file));
      if (!geometry) continue;

      const inside = findMunicipiosInIsochrone(geometry);
      const metrics = catchmentMetrics(inside);
      metrics.catch_ine_codes = inside.map(p => p.metrics.ine_code);
      Object.assign(master[code], metrics);
      computed++;
      if (computed % 50 === 0) process.stdout.write(`\r  ${computed}/${isoFiles.length} municipios processed`);
    }
    console.log(`\r  ✓ ${computed} municipio catchments computed`);

    // Compute catchment for provincias
    for (const [code, prov] of Object.entries(provincias)) {
      const geometry = loadIsochrone(path.join(PROV_ISO_DIR, `${code}.geojson`));
      if (!geometry) continue;
      const inside = findMunicipiosInIsochrone(geometry);
      const metrics = catchmentMetrics(inside);
      Object.assign(prov, metrics);
    }
    console.log('  ✓ Provincia catchments computed');

    // Recompute euskadi catchment from all municipios
    const allMuniMetrics = spatialIndex.map(p => ({ metrics: p.metrics }));
    Object.assign(euskadi, catchmentMetrics(allMuniMetrics));
    console.log('  ✓ Euskadi catchment computed');

    // Copy isochrone files to public/data/
    fs.mkdirSync(ISO_OUT_MUNI, { recursive: true });
    fs.mkdirSync(ISO_OUT_PROV, { recursive: true });

    for (const file of isoFiles) {
      const src = path.join(MUNI_ISO_DIR, file);
      const dst = path.join(ISO_OUT_MUNI, file);
      // Reduce precision for smaller files
      const content = fs.readFileSync(src, 'utf-8');
      const reduced = content.replace(/-?\d+\.\d{5,}/g, m =>
        parseFloat(parseFloat(m).toFixed(4)).toString()
      );
      fs.writeFileSync(dst, reduced);
    }

    const provIsoFiles = fs.existsSync(PROV_ISO_DIR) ?
      fs.readdirSync(PROV_ISO_DIR).filter(f => f.endsWith('.geojson')) : [];
    for (const file of provIsoFiles) {
      const src = path.join(PROV_ISO_DIR, file);
      const dst = path.join(ISO_OUT_PROV, file);
      const content = fs.readFileSync(src, 'utf-8');
      const reduced = content.replace(/-?\d+\.\d{5,}/g, m =>
        parseFloat(parseFloat(m).toFixed(4)).toString()
      );
      fs.writeFileSync(dst, reduced);
    }
    console.log(`  ✓ Copied ${isoFiles.length} municipio + ${provIsoFiles.length} provincia isochrone files`);

    // ── 20-min catchment area computation ─────────────────────────────
    const hasIsochrones20 = fs.existsSync(MUNI_ISO_DIR_20) &&
      fs.readdirSync(MUNI_ISO_DIR_20).filter(f => f.endsWith('.geojson')).length > 0;

    if (hasIsochrones20) {
      console.log('\nComputing 20-min catchment areas...');

      // Helper to rename catchment keys to catch20_ prefix
      function prefixCatchment20(metrics) {
        const result = {};
        for (const [k, v] of Object.entries(metrics)) {
          if (k.startsWith('catchment_')) {
            // catchment_pop → catch20_pop, catchment_density → catch20_density
            result['catch20_' + k.slice('catchment_'.length)] = v;
          } else if (k.startsWith('catch_')) {
            // catch_avg_income → catch20_avg_income
            result['catch20_' + k.slice('catch_'.length)] = v;
          } else {
            result[k] = v;
          }
        }
        return result;
      }

      // Compute 20-min catchment for each municipio
      const isoFiles20 = fs.readdirSync(MUNI_ISO_DIR_20).filter(f => f.endsWith('.geojson'));
      let computed20 = 0;
      for (const file of isoFiles20) {
        const code = path.basename(file, '.geojson');
        if (!master[code]) continue;

        const geometry = loadIsochrone(path.join(MUNI_ISO_DIR_20, file));
        if (!geometry) continue;

        const inside = findMunicipiosInIsochrone(geometry);
        const metrics = prefixCatchment20(catchmentMetrics(inside));
        metrics.catch20_ine_codes = inside.map(p => p.metrics.ine_code);
        Object.assign(master[code], metrics);
        computed20++;
        if (computed20 % 50 === 0) process.stdout.write(`\r  ${computed20}/${isoFiles20.length} municipios processed (20-min)`);
      }
      console.log(`\r  ✓ ${computed20} municipio 20-min catchments computed`);

      // Compute 20-min catchment for provincias
      for (const [code, prov] of Object.entries(provincias)) {
        const geometry = loadIsochrone(path.join(PROV_ISO_DIR_20, `${code}.geojson`));
        if (!geometry) continue;
        const inside = findMunicipiosInIsochrone(geometry);
        const metrics = prefixCatchment20(catchmentMetrics(inside));
        Object.assign(prov, metrics);
      }
      console.log('  ✓ Provincia 20-min catchments computed');

      // Recompute euskadi 20-min catchment from all municipios
      Object.assign(euskadi, prefixCatchment20(catchmentMetrics(allMuniMetrics)));
      console.log('  ✓ Euskadi 20-min catchment computed');

      // Copy 20-min isochrone files to public/data/
      fs.mkdirSync(ISO_OUT_MUNI_20, { recursive: true });
      fs.mkdirSync(ISO_OUT_PROV_20, { recursive: true });

      for (const file of isoFiles20) {
        const src = path.join(MUNI_ISO_DIR_20, file);
        const dst = path.join(ISO_OUT_MUNI_20, file);
        const content = fs.readFileSync(src, 'utf-8');
        const reduced = content.replace(/-?\d+\.\d{5,}/g, m =>
          parseFloat(parseFloat(m).toFixed(4)).toString()
        );
        fs.writeFileSync(dst, reduced);
      }

      const provIsoFiles20 = fs.existsSync(PROV_ISO_DIR_20) ?
        fs.readdirSync(PROV_ISO_DIR_20).filter(f => f.endsWith('.geojson')) : [];
      for (const file of provIsoFiles20) {
        const src = path.join(PROV_ISO_DIR_20, file);
        const dst = path.join(ISO_OUT_PROV_20, file);
        const content = fs.readFileSync(src, 'utf-8');
        const reduced = content.replace(/-?\d+\.\d{5,}/g, m =>
          parseFloat(parseFloat(m).toFixed(4)).toString()
        );
        fs.writeFileSync(dst, reduced);
      }
      console.log(`  ✓ Copied ${isoFiles20.length} municipio + ${provIsoFiles20.length} provincia 20-min isochrone files`);
    } else {
      console.log('\n⚠ No 20-min isochrone files found. Run: ORS_API_KEY=xxx node scripts/generate-isochrones-20.js');
    }
  }
} else {
  console.log('\n⚠ No isochrone files found in data/es/isochrones/municipios/');
  console.log('  Run: ORS_API_KEY=xxx node scripts/generate-isochrones.js');
  console.log('  Then re-run this script to compute catchment metrics.');
}

// ── Opportunity score ───────────────────────────────────────────────
console.log('\nComputing opportunity scores...');

// Collect values for rank normalization (only municipios with pop > 1000)
const scorable = Object.values(master).filter(m => (m.pop_2025 || 0) > 1000);

function rankNormalize(arr, field, inverse = false) {
  const vals = arr.map(m => ({ code: m.ine_code, val: m[field] ?? 0 }))
    .sort((a, b) => a.val - b.val);
  const ranks = {};
  for (let i = 0; i < vals.length; i++) {
    ranks[vals[i].code] = (i / (vals.length - 1)) * 100;
  }
  if (inverse) {
    for (const code of Object.keys(ranks)) {
      ranks[code] = 100 - ranks[code];
    }
  }
  return ranks;
}

const densityRank = rankNormalize(scorable, 'density_per_km2');
const incomeRank = rankNormalize(scorable, 'avg_total_income');
const apartmentRank = rankNormalize(scorable, 'pct_apartment');
const growthRank = rankNormalize(scorable, 'pop_growth_5yr_pct');
const nlaCapitaRank = rankNormalize(scorable, 'nla_per_capita', true); // INVERSE: low NLA = high opportunity
const rentedRank = rankNormalize(scorable, 'pct_rented');

const W = { density: 0.20, income: 0.15, apartment: 0.20, growth: 0.10, nla_gap: 0.25, rented: 0.10 };

for (const m of Object.values(master)) {
  const code = m.ine_code;
  if (!densityRank[code]) {
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
    1
  );
}

const scored = Object.values(master).filter(m => m.opportunity_score != null);
console.log(`  ✓ Scored ${scored.length} municipios (top 5:`);
scored.sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0));
for (const m of scored.slice(0, 5)) {
  console.log(`    ${m.name}: ${m.opportunity_score}`);
}

// Patch catchment opportunity scores (scores weren't available during initial catchment computation)
for (const m of Object.values(master)) {
  if (!m.catch_ine_codes) continue;
  // Recompute catch_opportunity_score from the now-scored municipios
  let oppWtd = 0, oppWtdPop = 0;
  for (const ineCode of m.catch_ine_codes) {
    const cm = master[ineCode];
    if (cm && cm.opportunity_score != null && (cm.pop_2025 || 0) > 0) {
      oppWtd += cm.opportunity_score * cm.pop_2025;
      oppWtdPop += cm.pop_2025;
    }
  }
  m.catch_opportunity_score = oppWtdPop > 0 ? round(oppWtd / oppWtdPop, 1) : null;

  // Also patch 20-min catchment
  if (m.catch20_ine_codes) {
    let opp20Wtd = 0, opp20WtdPop = 0;
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
console.log('  ✓ Patched catchment opportunity scores');

// Re-compute provincia/euskadi aggregates with opportunity scores
for (const [code, entries] of Object.entries(byProv)) {
  const agg = aggregateToLevel(entries);
  provincias[code] = {
    provincia_code: code,
    provincia_name: PROV_NAMES[code],
    ...provincias[code],
    ...agg,
  };
}
const euskadiAgg = aggregateToLevel(munis);
Object.assign(euskadi, euskadiAgg);

// Re-write metrics with catchment + opportunity fields
fs.writeFileSync(path.join(OUT, 'metrics_municipios.json'), JSON.stringify(master));
fs.writeFileSync(path.join(OUT, 'metrics_provincias.json'), JSON.stringify(provincias));
fs.writeFileSync(path.join(OUT, 'metrics_euskadi.json'), JSON.stringify(euskadi));
console.log('✓ Re-wrote metrics files with catchment + opportunity data');

// Re-write enriched facilities.json
if (facilities.length > 0) {
  fs.writeFileSync(path.join(OUT, 'facilities.json'), JSON.stringify(facilities));
  console.log('✓ Re-wrote enriched facilities.json');
}

// ── 4. boundaries_municipios.topojson ───────────────────────────────
// Reduce coordinate precision
function reducePrecision(geoj, decimals = 5) {
  const str = JSON.stringify(geoj);
  const re = /(-?\d+\.\d+)/g;
  const reduced = str.replace(re, (match) => {
    return parseFloat(parseFloat(match).toFixed(decimals)).toString();
  });
  return JSON.parse(reduced);
}

const geojsonReduced = reducePrecision(geojson);

// Strip extra properties from GeoJSON features - keep only what we need for linking
for (const f of geojsonReduced.features) {
  f.properties = {
    ine_code: f.properties.ine_code,
    name: f.properties.name,
    provincia_code: f.properties.provincia_code,
  };
}

const topoMuni = topojson.topology({ municipios: geojsonReduced });

// Simplify — keep good detail
const preSimp = topojsonSimplify.presimplify(topoMuni);
// Simplify geometry but never remove features (filter was dropping small municipios)
const simplified = topojsonSimplify.simplify(preSimp, topojsonSimplify.quantile(preSimp, 0.02));

const topoOut = simplified;

fs.writeFileSync(
  path.join(OUT, 'boundaries_municipios.topojson'),
  JSON.stringify(topoOut)
);

const origSize = Buffer.byteLength(JSON.stringify(geojson));
const topoSize = Buffer.byteLength(JSON.stringify(topoOut));
console.log(`✓ boundaries_municipios.topojson (${(origSize/1024).toFixed(0)}KB → ${(topoSize/1024).toFixed(0)}KB)`);

// ── 5. boundaries_provincias.topojson ───────────────────────────────
// Dissolve municipio boundaries by provincia_code using topojson merge
const provFeatures = [];
for (const code of Object.keys(PROV_NAMES)) {
  const matchingGeoms = topoOut.objects.municipios.geometries.filter(
    g => g.properties.provincia_code === code
  );

  if (matchingGeoms.length > 0) {
    const merged = topojsonClient.merge(topoOut, matchingGeoms);
    provFeatures.push({
      type: 'Feature',
      properties: {
        provincia_code: code,
        provincia_name: PROV_NAMES[code],
      },
      geometry: merged,
    });
  }
}

const provGeoJSON = {
  type: 'FeatureCollection',
  features: provFeatures,
};

const topoProv = topojson.topology({ provincias: provGeoJSON });

fs.writeFileSync(
  path.join(OUT, 'boundaries_provincias.topojson'),
  JSON.stringify(topoProv)
);
console.log('✓ boundaries_provincias.topojson');

console.log('\nAll files written to public/data/');
