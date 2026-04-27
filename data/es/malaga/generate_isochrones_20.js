#!/usr/bin/env node
/**
 * Generate 20-minute drive-time isochrones for Málaga (103 municipios).
 *
 * Mirrors `scripts/generate-isochrones-20.js` with Málaga paths.
 *
 * Usage:
 *   ORS_API_KEY=your_key node data/es/malaga/generate_isochrones_20.js
 *
 * Outputs:
 *   data/es/malaga/isochrones_20/municipios/{ine_code}.geojson
 *   data/es/malaga/isochrones_20/provincias/29.geojson
 *   data/es/malaga/isochrones_20/progress.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DIR = __dirname;
const BOUNDARIES_PATH = path.join(DIR, 'boundaries_municipios_malaga.geojson');
const MUNI_ISO_DIR = path.join(DIR, 'isochrones_20', 'municipios');
const PROV_ISO_DIR = path.join(DIR, 'isochrones_20', 'provincias');
const PROGRESS_PATH = path.join(DIR, 'isochrones_20', 'progress.json');

const API_KEY = process.env.ORS_API_KEY;
if (!API_KEY) {
  console.error('Error: Set ORS_API_KEY environment variable.');
  process.exit(1);
}

const RATE_LIMIT_MS = 1600;
const RANGE_SECONDS = 1200; // 20 minutes

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
    const avgX = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const avgY = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return [avgX, avgY];
  }
  cx /= 6 * area;
  cy /= 6 * area;
  return [cx, cy];
}

function computeCentroid(geometry) {
  if (geometry.type === 'Polygon') return ringCentroid(geometry.coordinates[0]);
  if (geometry.type === 'MultiPolygon') {
    let bestArea = 0, bestCentroid = [0, 0];
    for (const poly of geometry.coordinates) {
      const a = Math.abs(ringArea(poly[0]));
      if (a > bestArea) { bestArea = a; bestCentroid = ringCentroid(poly[0]); }
    }
    return bestCentroid;
  }
  return [0, 0];
}

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
        Authorization: API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(MUNI_ISO_DIR, { recursive: true });
  fs.mkdirSync(PROV_ISO_DIR, { recursive: true });

  const geojson = JSON.parse(fs.readFileSync(BOUNDARIES_PATH, 'utf-8'));
  console.log(`Loaded ${geojson.features.length} Málaga municipio boundaries`);

  let progress = {};
  if (fs.existsSync(PROGRESS_PATH)) {
    progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
    console.log(`Resuming: ${Object.keys(progress).length} already completed`);
  }

  let completed = 0, skipped = 0, errors = 0;
  const total = geojson.features.length;

  for (const feature of geojson.features) {
    const code = feature.properties.ine_code;
    const name = feature.properties.name;
    const outPath = path.join(MUNI_ISO_DIR, `${code}.geojson`);

    if (progress[code] === 'done' && fs.existsSync(outPath)) {
      skipped++;
      continue;
    }

    const [lng, lat] = computeCentroid(feature.geometry);
    completed++;

    let retries = 0;
    while (retries < 3) {
      try {
        const iso = await fetchIsochrone(lng, lat);
        const isoStr = JSON.stringify(iso).replace(/-?\d+\.\d+/g, (m) =>
          parseFloat(parseFloat(m).toFixed(5)).toString(),
        );
        fs.writeFileSync(outPath, isoStr);
        progress[code] = 'done';
        if (completed % 10 === 0) fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
        const done = skipped + completed;
        process.stdout.write(`\r[${done}/${total}] ${name} (${code}) ✓              `);
        break;
      } catch (err) {
        if (err.message === 'RATE_LIMITED') {
          console.log(`\n  Rate limited on ${name}, waiting 10s...`);
          await sleep(10000);
          retries++;
          // Mark exhausted retries so the muni isn't silently dropped — see
          // scripts/generate-isochrones.js for the same fix and rationale.
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

    // If retry loop exhausted 3 consecutive 429s without success, flag as
    // error so a re-run picks it up. (Observed on 10-min phase: 5 munis
    // silently dropped without this guard.)
    if (progress[code] !== 'done' && progress[code] !== 'error') {
      console.error(`\n  Retries exhausted for ${name} (${code}) — will retry on next run`);
      errors++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress));
  console.log(`\n\nDone: ${completed} generated, ${skipped} skipped, ${errors} errors`);

  console.log('\nMerging Málaga provincia 20-min isochrone...');
  try {
    const polygonClipping = require('polygon-clipping');
    const muniCodes = geojson.features.map((f) => f.properties.ine_code);
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
          coords =
            geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : null;
        }
        if (!coords) continue;
        if (!merged) {
          merged = coords;
        } else {
          try { merged = polygonClipping.union(merged, ...coords); } catch (e) { /* skip */ }
        }
        count++;
      } catch (e) { /* skip */ }
    }

    if (merged) {
      const provGeoJSON = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { provincia_code: '29', provincia_name: 'Málaga' },
            geometry: {
              type: merged.length === 1 ? 'Polygon' : 'MultiPolygon',
              coordinates: merged.length === 1 ? merged[0] : merged,
            },
          },
        ],
      };
      fs.writeFileSync(path.join(PROV_ISO_DIR, '29.geojson'), JSON.stringify(provGeoJSON));
      console.log(`  ✓ Málaga 20-min (${count} municipios merged)`);
    }
  } catch (e) {
    console.error('Error merging 20-min provincia isochrone:', e.message);
  }

  console.log('\nAll done!');
}

main().catch(console.error);
