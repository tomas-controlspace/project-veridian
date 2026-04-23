#!/usr/bin/env node
/**
 * Phase 2h: MIVAU Transacciones inmobiliarias → Málaga `housing_turnover`.
 *
 * Same upstream source as Euskadi's `data/es/parse_housing_turnover.js`:
 * "Número total de transacciones inmobiliarias de viviendas por municipios"
 * from Ministerio de Vivienda (originally Mitma / Fomento).
 *
 * Input (reused from Euskadi phase, already in-repo):
 *   data/es/raw/housing_turnover_municipios.xls (6 MB)
 *
 * Per-muni rule: annual total = sum of 4 quarters; prefer 2025 where
 * available (provisional), else fall back to 2024.
 *
 * Output:
 *   raw/mivau_transacciones_malaga.json — filtered to Málaga block
 *   turnover_malaga.json — processed per-muni record
 */

const XLSX = require('C:/Users/tomas/Downloads/node_modules/xlsx');
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const RAW_DIR = path.join(OUT_DIR, 'raw');
const INPUT = path.resolve(OUT_DIR, '..', 'raw', 'housing_turnover_municipios.xls');

// Name overrides — Málaga has one: "Rincón de la Victoria" vs INE "Rincón de la Victoria"
// (check after running; add if needed).
const NAME_OVERRIDES = {};

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function main() {
  if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

  const wb = XLSX.readFile(INPUT);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: '',
  });

  // Find year columns from row 10 (same as parse_housing_turnover.js)
  const yearRow = rows[10];
  const colIndex = [];
  for (let c = 2; c < yearRow.length; c++) {
    if (yearRow[c] && String(yearRow[c]).includes('Año')) {
      const year = parseInt(String(yearRow[c]).match(/\d{4}/)?.[0]);
      for (let q = 0; q < 4; q++) colIndex.push({ col: c + q, year, quarter: q + 1 });
    }
  }
  const cols2024 = colIndex.filter((c) => c.year === 2024);
  const cols2025 = colIndex.filter((c) => c.year === 2025);
  console.log(
    `Year columns found: 2024×${cols2024.length}, 2025×${cols2025.length}`,
  );

  // Find Málaga section (header row = muni_col === "Málaga")
  let malStart = -1;
  for (let i = 11; i < rows.length; i++) {
    const name = String(rows[i][1] || '').trim();
    if (name === 'Málaga' || name === 'Malaga') {
      malStart = i;
      break;
    }
  }
  if (malStart < 0) throw new Error('Málaga section not found in turnover xls');

  // Walk until next province header (next row whose name is not indented muni name).
  // Heuristic: stop at next row where name === 'Sevilla' (next Andalucía province alphabetically)
  let malEnd = -1;
  for (let i = malStart + 1; i < rows.length; i++) {
    const name = String(rows[i][1] || '').trim();
    if (name === 'Sevilla') {
      malEnd = i;
      break;
    }
  }
  if (malEnd < 0) throw new Error('Málaga section end not found');

  console.log(`Málaga section: rows ${malStart}–${malEnd - 1} (${malEnd - malStart - 1} muni rows)`);

  // Build filtered dump for audit
  const filteredDump = {
    source_file: 'data/es/raw/housing_turnover_municipios.xls',
    malaga_header_row: malStart,
    malaga_rows: rows.slice(malStart, malEnd).map((r) => r.slice(0, 92)), // up to Año 2025 Q4
  };
  fs.writeFileSync(
    path.join(RAW_DIR, 'mivau_transacciones_malaga.json'),
    JSON.stringify(filteredDump, null, 2),
  );

  // Join by name against demographics_malaga.json
  const demo = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'demographics_malaga.json'), 'utf-8'));
  const demoByNorm = {};
  for (const r of Object.values(demo)) demoByNorm[normName(r.name)] = r;

  function sumQuarters(row, cols) {
    return cols.reduce((s, c) => {
      const v = row[c.col];
      return s + (typeof v === 'number' ? v : 0);
    }, 0);
  }

  const turnover = {};
  let matched = 0,
    unmatched = [];
  for (let i = malStart + 1; i < malEnd; i++) {
    const r = rows[i];
    const name = String(r[1] || '').trim();
    if (!name) continue;
    const t25 = sumQuarters(r, cols2025);
    const t24 = sumQuarters(r, cols2024);
    const annual = t25 > 0 ? t25 : t24;
    const year = t25 > 0 ? 2025 : 2024;

    // Match to INE code via normalized name
    let demoRec = demoByNorm[normName(name)];
    if (!demoRec && NAME_OVERRIDES[name]) demoRec = demo[NAME_OVERRIDES[name]];
    if (!demoRec) {
      // Fuzzy: try contains
      for (const [k, v] of Object.entries(demoByNorm)) {
        if (k.includes(normName(name)) || normName(name).includes(k)) {
          demoRec = v;
          break;
        }
      }
    }
    if (!demoRec) {
      unmatched.push(`${name} (turnover=${annual})`);
      continue;
    }

    turnover[demoRec.ine_code] = {
      ine_code: demoRec.ine_code,
      name: demoRec.name,
      name_in_mivau: name,
      housing_turnover: annual,
      housing_turnover_year: year,
      housing_turnover_2024: t24,
      housing_turnover_2025: t25,
    };
    matched++;
  }

  console.log(`\nMatched: ${matched} / 103`);
  if (unmatched.length) {
    console.log('Unmatched:');
    unmatched.forEach((u) => console.log(`  ${u}`));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'turnover_malaga.json'), JSON.stringify(turnover, null, 2));
  console.log(`\nSaved turnover_malaga.json (${Object.keys(turnover).length} munis)`);

  // Spot-check
  ['29067', '29069', '29070', '29054', '29094', '29001', '29100'].forEach((c) => {
    const t = turnover[c];
    if (!t) return;
    console.log(
      `  ${c} ${t.name.padEnd(22)} ${t.housing_turnover} (${t.housing_turnover_year}); 2024=${t.housing_turnover_2024}, 2025=${t.housing_turnover_2025}`,
    );
  });

  // Top 5 by turnover
  const top = Object.values(turnover)
    .sort((a, b) => b.housing_turnover - a.housing_turnover)
    .slice(0, 5);
  console.log('\nTop 5 by housing_turnover:');
  top.forEach((t) =>
    console.log(`  ${t.name.padEnd(24)} ${t.housing_turnover} (${t.housing_turnover_year})`),
  );

  const total = Object.values(turnover).reduce((s, t) => s + (t.housing_turnover || 0), 0);
  console.log(`\nMálaga province total (latest year): ${total.toLocaleString()} transactions`);
}

main();
