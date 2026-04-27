#!/usr/bin/env node
/**
 * Phase 2f: MIVAU Valor Tasado → Málaga `avg_price_sqm`.
 *
 * Per the 2026-04-23 decision (§1 Methodology), all regions must use
 * MIVAU Valor Tasado de la Vivienda Libre, unit €/m² **constructed**.
 *
 * Two input tables from MIVAU / apps.fomento.gob.es:
 *   Tabla 1 (file 35101000): Provincial + national time series,
 *     used for the fallback value applied to munis < 25,000 hab.
 *   Tabla 5 (file 35103500): Muni-level for munis > 25,000 hab, one
 *     sheet per quarter (T1A2005 … T4A2025).
 *
 * Per-muni rule:
 *   `price_source = "municipal"`          → Tabla 5 value (muni > 25k hab)
 *   `price_source = "provincial_fallback"` → Tabla 1 Málaga row (muni < 25k hab)
 *
 * `avg_price_sqm` uses column "Total" (all ages of housing combined,
 * matches the ECVI concept of 'Total dwellings' that Euskadi's pre-
 * decision value represented — though the unit is different: €/m²
 * constructed here vs €/m² útil in ECVI).
 *
 * Output:
 *   raw/mivau_valor_tasado_tabla1_35101000.xls (committed ~240 KB)
 *   raw/mivau_valor_tasado_tabla5_35103500.xls (committed ~3.8 MB)
 *   prices_malaga.json — processed per-muni record
 */

const https = require('https');
const XLSX = require('C:/Users/tomas/Downloads/node_modules/xlsx');
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const RAW_DIR = path.join(OUT_DIR, 'raw');
const PROV_CODE = '29';
const PROV_NAME = 'Málaga';

const URL_T1 = 'https://apps.fomento.gob.es/boletinonline2/sedal/35101000.XLS';
const URL_T5 = 'https://apps.fomento.gob.es/boletinonline2/sedal/35103500.XLS';
const LOCAL_T1 = path.join(RAW_DIR, 'mivau_valor_tasado_tabla1_35101000.xls');
const LOCAL_T5 = path.join(RAW_DIR, 'mivau_valor_tasado_tabla5_35103500.xls');

// Target quarter: latest complete data. MIVAU publishes T4 of year N around March N+1;
// pick the most recent sheet present.
const QUARTER_PREF = ['T4A2025', 'T3A2025', 'T2A2025', 'T1A2025', 'T4A2024'];

function fetchBinary(url) {
  return new Promise((res, rej) => {
    https
      .get(
        url,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://apps.fomento.gob.es/boletinonline2/?nivel=2&orden=35000000',
          },
        },
        (r) => {
          if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
            return fetchBinary(r.headers.location).then(res, rej);
          }
          const chunks = [];
          r.on('data', (c) => chunks.push(c));
          r.on('end', () => res(Buffer.concat(chunks)));
        },
      )
      .on('error', rej);
  });
}

async function ensureFile(url, local) {
  if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });
  if (fs.existsSync(local) && fs.statSync(local).size > 50_000) {
    console.log(`  cached: ${path.basename(local)}`);
    return;
  }
  console.log(`  downloading ${url}...`);
  const buf = await fetchBinary(url);
  fs.writeFileSync(local, buf);
  console.log(`  saved ${(buf.length / 1024).toFixed(0)} KB → ${path.basename(local)}`);
}

// Find a row where some cell contains `needle` (case- + accent-insensitive)
function findRowWhere(rows, needle) {
  const norm = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  const n = norm(needle);
  for (let i = 0; i < rows.length; i++) {
    for (const cell of rows[i] || []) {
      if (norm(cell) === n) return i;
    }
  }
  return -1;
}

async function main() {
  console.log('[1/3] Fetching raw xls files...');
  await ensureFile(URL_T1, LOCAL_T1);
  await ensureFile(URL_T5, LOCAL_T5);

  // ---- Tabla 1: Provincial fallback ----
  console.log('\n[2/3] Parsing Tabla 1 (provincial series)...');
  const wb1 = XLSX.readFile(LOCAL_T1);
  const sheet1 = wb1.Sheets[wb1.SheetNames[wb1.SheetNames.length - 1]]; // latest years sheet
  const rows1 = XLSX.utils.sheet_to_json(sheet1, { header: 1, defval: '' });
  const malagaProvRowIdx = findRowWhere(rows1, 'Málaga');
  if (malagaProvRowIdx < 0) throw new Error('Málaga row not found in Tabla 1');
  const provRow = rows1[malagaProvRowIdx];
  // The quarter columns are positioned after "Año 2023 (1°-4°)", "Año 2024", "Año 2025".
  // From inspection, row 11 has "Año 2023", "Año 2024", "Año 2025" labels at columns 2,6,10.
  // Row 13 has quarter labels at columns 2-13. So col 13 = Year 2025 Q4.
  const headerRow11 = rows1[11] || [];
  const yearLabels = headerRow11.map((c) => String(c).trim()).join('|');
  console.log(`  Tabla 1 year labels: ${yearLabels.slice(0, 150)}`);
  // Pick Q4 2025 (col 13) — matches the inspection.
  const provPrice2025Q4 = parseFloat(provRow[13]);
  const provPrice2025Q3 = parseFloat(provRow[12]);
  console.log(
    `  Málaga provincial price: Q3 2025 = €${provPrice2025Q3}, Q4 2025 = €${provPrice2025Q4} /m² constructed`,
  );
  const provPrice = isNaN(provPrice2025Q4) ? provPrice2025Q3 : provPrice2025Q4;
  const provQuarter = isNaN(provPrice2025Q4) ? 'Q3 2025' : 'Q4 2025';

  // ---- Tabla 5: Muni-level for Málaga munis > 25k hab ----
  console.log('\n[3/3] Parsing Tabla 5 (muni-level > 25k hab)...');
  const wb5 = XLSX.readFile(LOCAL_T5);
  let targetSheet = null;
  for (const q of QUARTER_PREF) {
    const s = wb5.SheetNames.find((x) => x.trim() === q);
    if (s) {
      targetSheet = s;
      break;
    }
  }
  if (!targetSheet) throw new Error(`No preferred quarter sheet found in Tabla 5 — sheets: ${wb5.SheetNames.join(',')}`);
  console.log(`  Using sheet: ${targetSheet}`);
  const sheet5 = wb5.Sheets[targetSheet];
  const rows5 = XLSX.utils.sheet_to_json(sheet5, { header: 1, defval: '' });

  // Column layout: col 1 = Provincia, col 2 = Municipio, col 3 = Hasta 5y, col 4 = Con más 5y,
  //                col 5 = Total, col 6 = (blank), col 7-9 = tasaciones counts.
  // Province name appears only on the first row of each province group; subsequent rows
  // have col 1 blank.
  const muniMap = {}; // name (normalized) → { priceTotal, tasaciones }
  let currentProv = '';
  for (let i = 17; i < rows5.length; i++) {
    const r = rows5[i];
    if (!r || r.length === 0) continue;
    const provCell = String(r[1] || '').trim();
    const muniCell = String(r[2] || '').trim();
    const priceTotal = r[5];
    const nTotal = r[9];
    if (provCell) currentProv = provCell;
    if (currentProv.toLowerCase().startsWith('m') && muniCell) {
      // Málaga province (also matches e.g. "Madrid" — defer to normalized check)
    }
    if (!muniCell) continue;
    // Only record munis when we're in the Málaga provincia block
    if (currentProv.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('malaga')) {
      muniMap[muniCell] = {
        name: muniCell,
        priceTotal: typeof priceTotal === 'number' ? priceTotal : null,
        nTotal: typeof nTotal === 'number' ? nTotal : null,
      };
    }
  }
  console.log(`  Málaga munis found in Tabla 5: ${Object.keys(muniMap).length}`);
  Object.values(muniMap).forEach((m) =>
    console.log(`    ${m.name.padEnd(28)} €${m.priceTotal}/m² (n=${m.nTotal})`),
  );

  // ---- Join to demographics for full 103-muni coverage ----
  console.log('\n[4/4] Joining to demographics_malaga.json...');
  const demo = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'demographics_malaga.json'), 'utf-8'));

  // Build name→INE map from demographics, with tolerant matching
  const normName = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '');
  const demoByNorm = {};
  for (const r of Object.values(demo)) demoByNorm[normName(r.name)] = r;

  const prices = {};
  let matched = 0;
  const unmatched = [];
  for (const [code, demoRec] of Object.entries(demo)) {
    const name = demoRec.name;
    const n = normName(name);
    // Direct match, then fuzzy: contains / contained
    let match = muniMap[name];
    if (!match) {
      for (const [k, v] of Object.entries(muniMap)) {
        if (normName(k) === n) {
          match = v;
          break;
        }
      }
    }
    if (!match) {
      // Fuzzy: ends-with or starts-with (handles "Vélez-Málaga" vs "Vélez Málaga")
      for (const [k, v] of Object.entries(muniMap)) {
        if (normName(k).replace(/malaga$|malagala$/,'') === n.replace(/malaga$|malagala$/,'')) {
          match = v;
          break;
        }
      }
    }

    if (match && match.priceTotal) {
      prices[code] = {
        ine_code: code,
        name,
        avg_price_sqm: Math.round(match.priceTotal * 100) / 100,
        price_source: 'municipal',
        price_tasaciones_n: match.nTotal,
        price_quarter: targetSheet,
        price_unit: 'eur_per_sqm_constructed',
      };
      matched++;
    } else {
      prices[code] = {
        ine_code: code,
        name,
        avg_price_sqm: Math.round(provPrice * 100) / 100,
        price_source: 'provincial_fallback',
        price_tasaciones_n: null,
        price_quarter: provQuarter,
        price_unit: 'eur_per_sqm_constructed',
      };
      unmatched.push(name);
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'prices_malaga.json'), JSON.stringify(prices, null, 2));
  console.log(`\nSaved prices_malaga.json (${Object.keys(prices).length} munis)`);
  console.log(`  Muni-level: ${matched} | Provincial fallback: ${unmatched.length}`);

  // Spot-checks
  ['29067', '29069', '29070', '29051', '29054', '29094', '29901', '29001', '29100', '29904'].forEach(
    (c) => {
      const p = prices[c];
      if (!p) return;
      console.log(
        `  ${c} ${p.name.padEnd(24)} €${p.avg_price_sqm}/m² (${p.price_source}${p.price_tasaciones_n ? ', n=' + p.price_tasaciones_n : ''})`,
      );
    },
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
