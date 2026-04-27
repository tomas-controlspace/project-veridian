#!/usr/bin/env node
/**
 * Phase 2c: Process INE Censo 2021 Viviendas microdata → Málaga housing fields.
 *
 * Input: C:/Users/tomas/AppData/Local/Temp/ine_scratch/censo2021/CSV/CensoViviendas_2021.tab
 *        (95 MB TSV, 2,662,371 records. 10 % sample of Spanish family dwellings.
 *        INE documentation: CMUN is recoded to size-bin (991 ≤ 2k hab, 992 2k–5k,
 *        993 5k–10k) for munis under 10,000 hab; actual 3-digit CMUN code only
 *        present for munis > 10k hab.)
 *
 * Source (downloaded 2026-04-23):
 *   https://www.ine.es/ftp/microdatos/censopv/cen21/CensoViviendas_2021.zip
 *   https://www.ine.es/ftp/microdatos/censopv/cen21/dr_CensoViviendas_2021.zip
 *
 * Reference date: 1 November 2021.
 *
 * Variables consumed (from dr_CensoViviendas_2021.xlsx):
 *   CPRO       2-digit provincia code
 *   CMUN       3-digit muni OR size-bin (991/992/993) for <10k hab
 *   TIPO_VIV   1 = principal, 0 = non-principal
 *   TENEN_VIV  2 = propiedad, 3 = alquiler, 4 = otro, ' ' = N/A (non-principal)
 *   SUPERF     Superficie útil m²; '.' = No consta; 1000 caps at >=1000 m²
 *   TIPO_EDIF  1 = residencial 1-dwelling, 2 = 2-dwelling, 3 = 3+ dwelling,
 *              4 = non-residential, ' ' = No consta
 *
 * Aggregation mirrors ../parse_housing_final.js (Euskadi's EUSTAT-based method):
 *   - pct_apartment, pct_house from TIPO_EDIF (1,2=house; 3=apartment; 4=excluded)
 *   - avg_surface_m2 from mean(SUPERF) over principal dwellings
 *   - pct_rented, pct_owned from TENEN_VIV (principal dwellings only)
 *   - total_dwellings = principal-count × 10 (upscale 10 % sample)
 *
 * Output: raw/ine_censo_viviendas_2021_malaga_sample.json
 *           (raw aggregated sample counts per muni / size-bin)
 *         housing_malaga.json
 *           (processed per-muni record, joinable on ine_code)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const INPUT =
  'C:/Users/tomas/AppData/Local/Temp/ine_scratch/censo2021/CSV/CensoViviendas_2021.tab';
const OUT_DIR = __dirname;
const RAW_DIR = path.join(OUT_DIR, 'raw');
const PROV_CODE = '29';

async function main() {
  if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

  // accumulators keyed by muni code or size-bin; each stores raw sample counts.
  const acc = {};
  function getBucket(key) {
    if (!acc[key]) {
      acc[key] = {
        key,
        total_sample: 0,
        principal_sample: 0,
        nonprincipal_sample: 0,
        owned_sample: 0,
        rented_sample: 0,
        other_tenure_sample: 0,
        tenure_unknown_sample: 0,
        edif_1: 0, // 1-dwelling residential (house)
        edif_2: 0, // 2-dwelling residential (house)
        edif_3: 0, // 3+ dwelling (apartment)
        edif_4: 0, // non-residential
        edif_unknown: 0,
        surf_sum_principal: 0,
        surf_count_principal: 0,
      };
    }
    return acc[key];
  }

  const rs = fs.createReadStream(INPUT, { encoding: 'latin1' });
  const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });

  // Also extract Málaga-only rows to raw/ for auditability (≈3 MB, vs 95 MB full file).
  const malagaRowsPath = path.join(RAW_DIR, 'ine_censo_viviendas_2021_malaga_rows.tsv');
  const malagaRowsStream = fs.createWriteStream(malagaRowsPath, { encoding: 'latin1' });

  let rows = 0;
  let malagaRows = 0;
  let header = null;
  let idx = {};

  for await (const line of rl) {
    if (!header) {
      header = line.replace(/"/g, '').split('\t');
      header.forEach((h, i) => (idx[h] = i));
      malagaRowsStream.write(line + '\n');
      continue;
    }
    rows++;
    const cols = line.split('\t');
    const cpro = cols[idx.CPRO];
    if (cpro !== PROV_CODE) continue;
    malagaRows++;
    malagaRowsStream.write(line + '\n');

    const cmun = cols[idx.CMUN];
    const tipo_viv = cols[idx.TIPO_VIV];
    const tenen = cols[idx.TENEN_VIV];
    const superf = cols[idx.SUPERF];
    const tipo_edif = cols[idx.TIPO_EDIF];

    // Bucket key: "29067" for real munis, "29_bin991" etc for recoded small munis
    const key =
      cmun === '991' || cmun === '992' || cmun === '993'
        ? `${PROV_CODE}_bin${cmun}`
        : `${PROV_CODE}${cmun}`;
    const b = getBucket(key);

    b.total_sample++;
    if (tipo_viv === '1') b.principal_sample++;
    else b.nonprincipal_sample++;

    // Tenure — only meaningful for principal dwellings
    if (tipo_viv === '1') {
      if (tenen === '2') b.owned_sample++;
      else if (tenen === '3') b.rented_sample++;
      else if (tenen === '4') b.other_tenure_sample++;
      else b.tenure_unknown_sample++;
    }

    // Building type
    if (tipo_edif === '1') b.edif_1++;
    else if (tipo_edif === '2') b.edif_2++;
    else if (tipo_edif === '3') b.edif_3++;
    else if (tipo_edif === '4') b.edif_4++;
    else b.edif_unknown++;

    // Surface area (principal only, ignore '.')
    if (tipo_viv === '1' && superf && superf !== '.') {
      const s = parseInt(superf, 10);
      if (!isNaN(s) && s > 0) {
        b.surf_sum_principal += s;
        b.surf_count_principal++;
      }
    }
  }

  console.log(`Total microdata rows processed: ${rows.toLocaleString()}`);
  console.log(`Málaga (CPRO=29) rows: ${malagaRows.toLocaleString()}`);
  console.log(`Distinct Málaga buckets: ${Object.keys(acc).length}`);
  const realMuni = Object.keys(acc).filter((k) => !k.includes('_bin'));
  const bins = Object.keys(acc).filter((k) => k.includes('_bin'));
  console.log(`  Real munis > 10k hab: ${realMuni.length}`);
  console.log(`  Size bins (<10k hab): ${bins.length} [${bins.sort().join(', ')}]`);

  fs.writeFileSync(
    path.join(RAW_DIR, 'ine_censo_viviendas_2021_malaga_sample.json'),
    JSON.stringify(acc, null, 2),
  );

  // ---- Processed per-muni JSON (upscaled × 10 to approximate population; pcts use raw sample ratios)
  const processed = {};
  for (const [key, b] of Object.entries(acc)) {
    const isBin = key.includes('_bin');
    const ine_code = isBin ? null : key;

    const tenureDenom =
      b.owned_sample + b.rented_sample + b.other_tenure_sample; // exclude unknown
    const pct_rented =
      tenureDenom > 0 ? Math.round((b.rented_sample / tenureDenom) * 10000) / 100 : null;
    const pct_owned =
      tenureDenom > 0 ? Math.round((b.owned_sample / tenureDenom) * 10000) / 100 : null;

    const edifDenom = b.edif_1 + b.edif_2 + b.edif_3; // exclude non-residential + unknown
    const pct_house =
      edifDenom > 0 ? Math.round(((b.edif_1 + b.edif_2) / edifDenom) * 10000) / 100 : null;
    const pct_apartment =
      edifDenom > 0 ? Math.round((b.edif_3 / edifDenom) * 10000) / 100 : null;

    const avg_surface_m2 =
      b.surf_count_principal > 0
        ? Math.round((b.surf_sum_principal / b.surf_count_principal) * 10) / 10
        : null;

    processed[key] = {
      ine_code,
      bin_label: isBin
        ? { '29_bin991': '≤ 2,000 hab', '29_bin992': '2,001–5,000 hab', '29_bin993': '5,001–10,000 hab' }[key]
        : null,
      total_dwellings_2021: b.principal_sample * 10, // upscaled from 10 % sample
      principal_sample: b.principal_sample,
      tenure_sample_n: tenureDenom,
      pct_rented,
      pct_owned,
      edif_sample_n: edifDenom,
      pct_apartment,
      pct_house,
      surface_sample_n: b.surf_count_principal,
      avg_surface_m2,
    };
  }

  fs.writeFileSync(path.join(OUT_DIR, 'housing_malaga.json'), JSON.stringify(processed, null, 2));
  console.log(`\nSaved housing_malaga.json with ${Object.keys(processed).length} buckets`);

  // ---- Coverage / gap report ----
  console.log('\n=== COVERAGE REPORT ===');
  // Join with demographics_malaga.json to see which munis are covered by name
  const demo = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'demographics_malaga.json'), 'utf-8'));
  const demoCodes = Object.keys(demo).sort();
  let hasMuni = 0,
    missingMuni = 0;
  const missing = [];
  for (const code of demoCodes) {
    if (processed[code]) {
      hasMuni++;
    } else {
      missingMuni++;
      missing.push({ code, name: demo[code].name, pop_2025: demo[code].pop_2025 });
    }
  }
  console.log(`Munis with muni-level housing data: ${hasMuni} / ${demoCodes.length}`);
  console.log(`Munis missing (pooled into size bin): ${missingMuni}`);
  missing.sort((a, b) => (b.pop_2025 || 0) - (a.pop_2025 || 0));
  console.log(`  Largest missing: ${missing
    .slice(0, 10)
    .map((m) => `${m.name} (${(m.pop_2025 || 0).toLocaleString()})`)
    .join(', ')}`);
  console.log(`  Smallest missing: ${missing
    .slice(-5)
    .map((m) => `${m.name} (${(m.pop_2025 || 0).toLocaleString()})`)
    .join(', ')}`);

  // Check sampling-noise floor: sample size for smaller munis
  const tiny = realMuni
    .map((k) => ({ key: k, n: acc[k].principal_sample, name: demo[k]?.name || '?' }))
    .sort((a, b) => a.n - b.n)
    .slice(0, 5);
  console.log(`  Smallest muni-level samples (risk of high sampling error):`);
  tiny.forEach((t) => console.log(`    ${t.key} ${t.name}: ${t.n} principal dwellings in sample`));

  // Spot-check Málaga city
  if (processed['29067']) {
    console.log('\nSpot-check — Málaga city (29067):');
    console.log(JSON.stringify(processed['29067'], null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
