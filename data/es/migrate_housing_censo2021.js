#!/usr/bin/env node
/**
 * Migrate Euskadi housing fields from EUSTAT to INE Censo 2021 microdata
 * (Option A decision — full notes in data/es/malaga/README.md §3).
 *
 * What this touches:
 *   data/es/master_municipios.json — overwrites pct_rented, pct_owned,
 *     pct_apartment, pct_house, avg_surface_m2 for all 252 Basque munis.
 *     Adds new field housing_source. Does NOT touch total_dwellings or
 *     total_family_dwellings (EUSTAT full-population counts are more
 *     precise than 10 %-sample-upscaled figures and are scale values,
 *     not ratios — comparability is unaffected).
 *
 * Snapshot / audit outputs (new files, committed):
 *   data/es/master_municipios_pre_censo2021.json — byte-for-byte copy
 *     of the current master before migration (reversal aid).
 *   data/es/housing_censo2021_euskadi.json — intermediate per-muni/bin
 *     aggregation, same shape as data/es/malaga/housing_malaga.json.
 *
 * Source file (cached in scratch, ~91 MB, 10 % microdata sample, ref
 * 2021-11-01): downloaded during the Málaga Phase 2c work from
 * https://www.ine.es/ftp/microdatos/censopv/cen21/CensoViviendas_2021.zip
 * Script will re-download the zip to scratch if the CSV isn't there.
 *
 * Per-muni aggregation rule (same as ../malaga/process_censo_microdata.js):
 *   - Munis > 10k hab (by 2021 pop): CMUN contains real 3-digit code,
 *     aggregate directly → housing_source = "muni_microdata".
 *   - Munis ≤ 10k hab: CMUN is recoded to bin 991/992/993 (per-province
 *     aggregate) → housing_source = "provincial_bin_{le2k,2k_5k,5k_10k}".
 */

const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..', '..');
const MASTER_PATH = path.join(ROOT, 'data', 'es', 'master_municipios.json');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'es', 'master_municipios_pre_censo2021.json');
const HOUSING_OUT = path.join(ROOT, 'data', 'es', 'housing_censo2021_euskadi.json');

const SCRATCH = path.join(process.env.TEMP || os.tmpdir(), 'ine_scratch', 'censo2021');
const CSV_PATH = path.join(SCRATCH, 'CSV', 'CensoViviendas_2021.tab');
const ZIP_URL = 'https://www.ine.es/ftp/microdatos/censopv/cen21/CensoViviendas_2021.zip';

const PROV_CODES = new Set(['01', '20', '48']); // Euskadi

function fetchBinary(url) {
  return new Promise((res, rej) => {
    https
      .get(url, (r) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => res(Buffer.concat(chunks)));
      })
      .on('error', rej);
  });
}

async function ensureCSV() {
  if (fs.existsSync(CSV_PATH) && fs.statSync(CSV_PATH).size > 50_000_000) {
    console.log(`  Using cached microdata: ${CSV_PATH}`);
    return;
  }
  console.log('  Downloading INE Censo 2021 Viviendas microdata (≈136 MB zip)...');
  fs.mkdirSync(SCRATCH, { recursive: true });
  const zipPath = path.join(SCRATCH, 'CensoViviendas_2021.zip');
  const buf = await fetchBinary(ZIP_URL);
  fs.writeFileSync(zipPath, buf);
  console.log(`  Saved ${(buf.length / 1024 / 1024).toFixed(1)} MB; unzip manually or re-run after extracting CSV/`);
  throw new Error(
    'Cached CSV not found and auto-unzip not implemented. Extract CSV/CensoViviendas_2021.tab from the downloaded zip and re-run.',
  );
}

async function main() {
  // ---- Step 1: ensure microdata CSV is available
  console.log('[1/5] Locating Censo 2021 Viviendas microdata...');
  await ensureCSV();

  // ---- Step 2: stream-filter the TSV to Euskadi rows, accumulate buckets
  console.log('[2/5] Streaming microdata; filtering CPRO ∈ {01, 20, 48}...');
  const acc = {}; // key = "01XXX" or "01_bin99Z"

  function get(key) {
    if (!acc[key]) {
      acc[key] = {
        key,
        principal_sample: 0,
        owned_sample: 0,
        rented_sample: 0,
        other_tenure_sample: 0,
        tenure_unknown_sample: 0,
        edif_1: 0,
        edif_2: 0,
        edif_3: 0,
        edif_4: 0,
        edif_unknown: 0,
        surf_sum_principal: 0,
        surf_count_principal: 0,
      };
    }
    return acc[key];
  }

  const rs = fs.createReadStream(CSV_PATH, { encoding: 'latin1' });
  const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });

  let rows = 0,
    euskadiRows = 0,
    header = null,
    idx = {};

  for await (const line of rl) {
    if (!header) {
      header = line.replace(/"/g, '').split('\t');
      header.forEach((h, i) => (idx[h] = i));
      continue;
    }
    rows++;
    const cols = line.split('\t');
    const cpro = cols[idx.CPRO];
    if (!PROV_CODES.has(cpro)) continue;
    euskadiRows++;

    const cmun = cols[idx.CMUN];
    const tipo_viv = cols[idx.TIPO_VIV];
    const tenen = cols[idx.TENEN_VIV];
    const superf = cols[idx.SUPERF];
    const tipo_edif = cols[idx.TIPO_EDIF];

    const key =
      cmun === '991' || cmun === '992' || cmun === '993' ? `${cpro}_bin${cmun}` : `${cpro}${cmun}`;
    const b = get(key);

    if (tipo_viv !== '1') continue; // principal dwellings only (matches EUSTAT's scope)
    b.principal_sample++;

    if (tenen === '2') b.owned_sample++;
    else if (tenen === '3') b.rented_sample++;
    else if (tenen === '4') b.other_tenure_sample++;
    else b.tenure_unknown_sample++;

    if (tipo_edif === '1') b.edif_1++;
    else if (tipo_edif === '2') b.edif_2++;
    else if (tipo_edif === '3') b.edif_3++;
    else if (tipo_edif === '4') b.edif_4++;
    else b.edif_unknown++;

    if (superf && superf !== '.') {
      const s = parseInt(superf, 10);
      if (!isNaN(s) && s > 0) {
        b.surf_sum_principal += s;
        b.surf_count_principal++;
      }
    }
  }

  console.log(`  Scanned ${rows.toLocaleString()} rows (${euskadiRows.toLocaleString()} Euskadi)`);
  console.log(`  Distinct buckets: ${Object.keys(acc).length}`);
  const realMuni = Object.keys(acc).filter((k) => !k.includes('_bin'));
  const bins = Object.keys(acc).filter((k) => k.includes('_bin'));
  console.log(`    Real munis > 10k hab: ${realMuni.length}`);
  console.log(`    Size bins (by province × band): ${bins.length}`);

  // ---- Step 3: derive percentages for each bucket
  console.log('[3/5] Computing percentages per bucket...');
  const housing = {};
  for (const [key, b] of Object.entries(acc)) {
    const tenureDenom = b.owned_sample + b.rented_sample + b.other_tenure_sample;
    const pct_rented = tenureDenom > 0 ? Math.round((b.rented_sample / tenureDenom) * 10000) / 100 : null;
    const pct_owned = tenureDenom > 0 ? Math.round((b.owned_sample / tenureDenom) * 10000) / 100 : null;
    const edifDenom = b.edif_1 + b.edif_2 + b.edif_3;
    const pct_house = edifDenom > 0 ? Math.round(((b.edif_1 + b.edif_2) / edifDenom) * 10000) / 100 : null;
    const pct_apartment = edifDenom > 0 ? Math.round((b.edif_3 / edifDenom) * 10000) / 100 : null;
    const avg_surface_m2 =
      b.surf_count_principal > 0
        ? Math.round((b.surf_sum_principal / b.surf_count_principal) * 10) / 10
        : null;
    housing[key] = {
      ine_code: key.includes('_bin') ? null : key,
      principal_sample: b.principal_sample,
      pct_rented,
      pct_owned,
      pct_apartment,
      pct_house,
      avg_surface_m2,
    };
  }
  fs.writeFileSync(HOUSING_OUT, JSON.stringify(housing, null, 2));
  console.log(`  Saved intermediate → ${HOUSING_OUT}`);

  // ---- Step 4: snapshot current master, then overwrite housing fields
  console.log('[4/5] Snapshotting master and applying migration...');
  const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf-8'));
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(master, null, 2));
  console.log(`  Snapshot → ${SNAPSHOT_PATH}`);

  function pickBin(pop) {
    if (pop == null) return { band: 'le2k', key: '_bin991' };
    if (pop <= 2000) return { band: 'le2k', key: '_bin991' };
    if (pop <= 5000) return { band: '2k_5k', key: '_bin992' };
    return { band: '5k_10k', key: '_bin993' };
  }

  let withMuni = 0,
    withBin = 0,
    missing = [];
  const preAfterSamples = {}; // Bilbao / Vitoria / Donostia before/after snapshots

  for (const [code, rec] of Object.entries(master)) {
    if (!PROV_CODES.has(code.substring(0, 2))) continue; // defensive
    const provCode = code.substring(0, 2);
    const direct = housing[code];
    let h = null,
      source = null;
    if (direct) {
      h = direct;
      source = 'muni_microdata';
      withMuni++;
    } else {
      const bin = pickBin(rec.pop_2025);
      const binKey = `${provCode}${bin.key}`;
      const binRec = housing[binKey];
      if (binRec) {
        h = binRec;
        source = `provincial_bin_${bin.band}`;
        withBin++;
      } else {
        missing.push({ code, name: rec.name });
      }
    }

    if (['48020', '01059', '20069'].includes(code)) {
      preAfterSamples[code] = {
        before: {
          pct_rented: rec.pct_rented,
          pct_owned: rec.pct_owned,
          pct_apartment: rec.pct_apartment,
          pct_house: rec.pct_house,
          avg_surface_m2: rec.avg_surface_m2,
        },
      };
    }

    if (h) {
      rec.pct_rented = h.pct_rented;
      rec.pct_owned = h.pct_owned;
      rec.pct_apartment = h.pct_apartment;
      rec.pct_house = h.pct_house;
      rec.avg_surface_m2 = h.avg_surface_m2;
      rec.housing_source = source;
    }

    if (preAfterSamples[code]) {
      preAfterSamples[code].after = {
        pct_rented: rec.pct_rented,
        pct_owned: rec.pct_owned,
        pct_apartment: rec.pct_apartment,
        pct_house: rec.pct_house,
        avg_surface_m2: rec.avg_surface_m2,
        housing_source: rec.housing_source,
      };
    }
  }

  fs.writeFileSync(MASTER_PATH, JSON.stringify(master, null, 2));
  console.log(`  Overwrote ${MASTER_PATH}`);
  console.log(`    muni-level: ${withMuni}`);
  console.log(`    bin fallback: ${withBin}`);
  if (missing.length) {
    console.log(`    ⚠ missing housing for ${missing.length} munis:`);
    missing.forEach((m) => console.log(`      ${m.code} ${m.name}`));
  }

  // ---- Step 5: QA — before/after for Bilbao, Vitoria, Donostia
  console.log('\n[5/5] Before / after spot-check:');
  const names = { '48020': 'Bilbao', '01059': 'Vitoria-Gasteiz', '20069': 'Donostia' };
  for (const [code, s] of Object.entries(preAfterSamples)) {
    console.log(`\n  ${code} ${names[code]} (housing_source=${s.after.housing_source}):`);
    for (const k of ['pct_rented', 'pct_owned', 'pct_apartment', 'pct_house', 'avg_surface_m2']) {
      const delta =
        s.before[k] != null && s.after[k] != null ? (s.after[k] - s.before[k]).toFixed(2) : '—';
      console.log(
        `    ${k.padEnd(16)} EUSTAT=${String(s.before[k]).padStart(7)}  Censo2021=${String(s.after[k]).padStart(7)}  Δ=${delta}`,
      );
    }
  }

  // Source breakdown by province
  const bySrc = {};
  for (const [code, rec] of Object.entries(master)) {
    if (!PROV_CODES.has(code.substring(0, 2))) continue;
    const provCode = code.substring(0, 2);
    const key = `${provCode}:${rec.housing_source}`;
    bySrc[key] = (bySrc[key] || 0) + 1;
  }
  console.log('\n  housing_source distribution:');
  Object.entries(bySrc)
    .sort()
    .forEach(([k, n]) => console.log(`    ${k}: ${n}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
