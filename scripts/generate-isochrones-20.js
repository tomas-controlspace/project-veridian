#!/usr/bin/env node
/**
 * Generate 20-minute drive-time isochrones for all 252 Basque Country municipios.
 *
 * Usage:
 *   ORS_API_KEY=your_key node scripts/generate-isochrones-20.js
 *
 * Uses OpenRouteService free tier (40 req/min, 2000/day).
 * Resumes from progress.json if interrupted.
 *
 * Outputs:
 *   data/es/isochrones_20/municipios/{ine_code}.geojson
 *   data/es/isochrones_20/provincias/{code}.geojson
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const BOUNDARIES_PATH = path.join(ROOT, 'data', 'es', 'boundaries_municipios.geojson');
const MUNI_ISO_DIR = path.join(ROOT, 'data', 'es', 'isochrones_20', 'municipios');
const PROV_ISO_DIR = path.join(ROOT, 'data', 'es', 'isochrones_20', 'provincias');
const PROGRESS_PATH = path.join(ROOT, 'data', 'es', 'isochrones_20', 'progress.json');

const API_KEY = process.env.ORS_API_KEY;
if (!API_KEY) {
  console.error('Error: Set ORS_API_KEY environment variable.');
  console.error('Get a free key at https://openrouteservice.org/dev/#/signup');
  process.exit(1);
}

const RATE_LIMIT_MS = 1600; // ~37 req/min, safely under 40
const RANGE_SECONDS = 1200; // 20 minutes

// ── Geometry helpers ────────────────────────────────────────────────

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return area / 2;
}

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
    // Degenerate — use average
    const avgX = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const avgY = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return [avgX, avgY];
  }
  cx /= (6 * area);
  cy /= (6 * area);
  return [cx, cy];
}

function computeCentroid(geometry) {
  if (geometry.type === 'Polygon') {
    return ringCentroid(geometry.coordinates[0]);
  } else if (geometry.type === 'MultiPolygon') {
    // Use centroid of largest ring
    let bestArea = 0, bestCentroid = [0, 0];
    for (const poly of geometry.coordinates) {
      const a = Math.abs(ringArea(poly[0]));
      if (a > bestArea) {
        bestArea = a;
        bestCentroid = ringCentroid(poly[0]);
      }
    }
    return bestCentroid;
  }
  return [0, 0];
}

// ── ORS API call ────────────────────────────────────────────────────

function fetchIsochrone(lng, lat) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      locations: [[lng, lat]],
      range: [RANGE_SECONDS],
      range_type: 'time',
    });

    const options = {
      hostname: 'api.openrouteservice.org',
      path: '/v2/isochrones/driving-car',
      method: 'POST',
      headers: {
        'Authorization': API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        } else if (res.statusCode === 429) {
          reject(new Error('RATE_LIMITED'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  // Ensure output directories
  fs.mkdirSync(MUNI_ISO_DIR, { recursive: true });
  fs.mkdirSync(PROV_ISO_DIR, { recursive: true });

  // Load boundaries
  const geojson = JSON.parse(fs.readFileSync(BOUNDARIES_PATH, 'utf-8'));
  console.log(`Loaded ${geojson.features.length} municipio boundaries`);

  // Load progress
  let progress = {};
  if (fs.existsSync(PROGRESS_PATH)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
    console.log(`Resuming: ${Object.keys(progress).length} already completed`);
  }

  // Generate isochrones for each municipio
  let completed = 0, skipped = 0, errors = 0;
  const total = geojson.features.length;

  for (const feature of geojson.features) {
    const code = feature.properties.ine_code;
    const name = feature.properties.name;
    const outPath = path.join(MUNI_ISO_DIR, `${code}.geojson`);

    // Skip if already done
    if (progress[code] === 'done' && fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

    const [lng, lat] = computeCentroid(feature.geometry);
    completed++;

    // Retry loop
    let retries = 0;
    while (retries < 3) {
      try {
        const iso = await fetchIsochrone(lng, lat);

        // Reduce coordinate precision to 5 decimals
        const isoStr = JSON.stringify(iso).replace(/-?\d+\.\d+/g, m =>
          parseFloat(parseFloat(m).toFixed(5)).toString()
        );

        fs.writeFileSync(outPath, isoStr);
        progress[code] = 'done';

        // Save progress periodically
        if (completed % 10 === 0) {
          fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
        }

        const done = skipped + completed;
        process.stdout.write(`\r[${done}/${total}] ${name} (${code}) ✓`);
        break;
      } catch (err) {
        if (err.message === 'RATE_LIMITED') {
          console.log(`\n  Rate limited on ${name}, waiting 10s...`);
          await sleep(10000);
          retries++;
          // If this was the third strike, the while-loop exits next iteration
          // without ever entering the success branch. Mark + count the failure
          // here so the muni isn't silently dropped (was the bug that left 13
          // Basque munis with no isochrone after the original 2024 run).
          if (retries >= 3) {
            console.error(`\n  Rate-limit retries exhausted for ${name} (${code})`);
            progress[code] = 'error';
            errors++;
          }
        } else {
          console.error(`\n  Error for ${name} (${code}): ${err.message}`);
          progress[code] = 'error';
          errors++;
          break;
        }
      }
    }

    await sleep(RATE_LIMIT_MS);
  }

  // Save final progress
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
  console.log(`\n\nDone: ${completed} generated, ${skipped} skipped, ${errors} errors`);

  // Merge provincia isochrones
  console.log('\nMerging provincia 20-min isochrones...');
  try {
    const polygonClipping = require('polygon-clipping');
    const PROV_NAMES = { '01': 'Álava/Araba', '20': 'Gipuzkoa', '48': 'Bizkaia' };

    for (const [provCode, provName] of Object.entries(PROV_NAMES)) {
      const muniCodes = geojson.features
        .filter(f => f.properties.provincia_code === provCode)
        .map(f => f.properties.ine_code);

      let merged = null;
      let count = 0;

      for (const code of muniCodes) {
        const isoPath = path.join(MUNI_ISO_DIR, `${code}.geojson`);
        if (!fs.existsSync(isoPath)) continue;

        try {
          const iso = JSON.parse(fs.readFileSync(isoPath, 'utf-8'));
          let coords;
          if (iso.type === 'FeatureCollection' && iso.features?.length > 0) {
            const geom = iso.features[0].geometry;
            coords = geom.type === 'Polygon' ? [geom.coordinates] :
              geom.type === 'MultiPolygon' ? geom.coordinates : null;
          }
          if (!coords) continue;

          if (!merged) {
            merged = coords;
          } else {
            try {
              merged = polygonClipping.union(merged, ...coords);
            } catch (e) {
              // Skip problematic geometries
            }
          }
          count++;
        } catch (e) {
          // Skip
        }
      }

      if (merged) {
        const provGeoJSON = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: { provincia_code: provCode, provincia_name: provName },
            geometry: {
              type: merged.length === 1 ? 'Polygon' : 'MultiPolygon',
              coordinates: merged.length === 1 ? merged[0] : merged,
            },
          }],
        };

        const outPath = path.join(PROV_ISO_DIR, `${provCode}.geojson`);
        fs.writeFileSync(outPath, JSON.stringify(provGeoJSON));
        console.log(`  ✓ ${provName} (${count} municipios merged)`);
      }
    }
  } catch (e) {
    console.error('Error merging provincia isochrones:', e.message);
  }

  console.log('\nAll done!');
}

main().catch(console.error);
