#!/usr/bin/env node
/**
 * Parse housing turnover (transacciones inmobiliarias) by municipio from
 * Ministerio de Vivienda XLS file and write it into master_municipios.json.
 *
 * Source: "Número total de transacciones inmobiliarias de viviendas por municipios"
 * File: data/es/raw/housing_turnover_municipios.xls
 *
 * Extracts annual totals (sum of 4 quarters) for 2024 and 2025.
 * Uses 2025 as primary; falls back to 2024 if 2025 is 0.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..', '..');
const XLS_PATH = path.join(ROOT, 'data', 'es', 'raw', 'housing_turnover_municipios.xls');
const MASTER_PATH = path.join(ROOT, 'data', 'es', 'master_municipios.json');

// Manual name overrides for mismatches between XLS and master
const NAME_OVERRIDES = {
  'Legutiano': '01058',       // Master: Legutio
  'Salvatierra/Agurain': '01051', // Master: Agurain/Salvatierra
};

// ── Load data ───────────────────────────────────────────────────────
const wb = XLSX.readFile(XLS_PATH);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf-8'));
const masterList = Object.values(master);

// ── Build column index ──────────────────────────────────────────────
const yearRow = data[10];
const colIndex = [];
for (let c = 2; c < yearRow.length; c++) {
  if (yearRow[c] && String(yearRow[c]).includes('Año')) {
    const year = parseInt(String(yearRow[c]).match(/\d{4}/)?.[0]);
    for (let q = 0; q < 4; q++) {
      colIndex.push({ col: c + q, year, quarter: q + 1 });
    }
  }
}

const cols2024 = colIndex.filter(c => c.year === 2024);
const cols2025 = colIndex.filter(c => c.year === 2025);

function sumQuarters(row, cols) {
  return cols.reduce((s, c) => {
    const v = row[c.col];
    return s + (typeof v === 'number' ? v : 0);
  }, 0);
}

// ── Name normalization for matching ─────────────────────────────────
function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
}

function findMatch(name, prov) {
  // Check manual overrides first
  if (NAME_OVERRIDES[name]) return NAME_OVERRIDES[name];

  const bn = norm(name);
  const match = masterList.find(m => m.provincia_code === prov && (
    norm(m.name) === bn ||
    norm(m.name).includes(bn) ||
    bn.includes(norm(m.name))
  ));
  return match?.ine_code || null;
}

// ── Extract Basque Country data ─────────────────────────────────────
let currentProv = '';
let matched = 0, unmatched = 0, assigned = 0;

for (let r = 7772; r < data.length; r++) {
  const name = String(data[r][1] || '').trim();
  if (!name) continue;

  // Detect section headers
  if (name === 'Araba/Alava' || name === 'Araba/Álava') { currentProv = '01'; continue; }
  if (name === 'Bizkaia' || name === 'Vizcaya') { currentProv = '48'; continue; }
  if (name === 'Gipuzkoa' || name === 'Guipúzcoa') { currentProv = '20'; continue; }
  if (name === 'PAÍS VASCO') continue;
  if (name === name.toUpperCase() && name.length > 3) break; // Next community

  const total2025 = sumQuarters(data[r], cols2025);
  const total2024 = sumQuarters(data[r], cols2024);
  const turnover = total2025 > 0 ? total2025 : total2024;
  const year = total2025 > 0 ? 2025 : 2024;

  const ineCode = findMatch(name, currentProv);
  if (ineCode && master[ineCode]) {
    master[ineCode].housing_turnover = turnover;
    master[ineCode].housing_turnover_year = year;
    matched++;
    if (turnover > 0) assigned++;
  } else {
    unmatched++;
    if (turnover > 0) {
      console.warn(`  ⚠ Unmatched: ${name} (prov ${currentProv}) turnover=${turnover}`);
    }
  }
}

console.log(`Matched: ${matched}, Assigned with data: ${assigned}, Unmatched: ${unmatched}`);

// ── Save ────────────────────────────────────────────────────────────
fs.writeFileSync(MASTER_PATH, JSON.stringify(master, null, 2));
console.log('✓ Updated master_municipios.json with housing_turnover');

// Print top 10
const top = Object.values(master)
  .filter(m => m.housing_turnover > 0)
  .sort((a, b) => b.housing_turnover - a.housing_turnover)
  .slice(0, 10);
console.log('\nTop 10 by housing turnover:');
top.forEach(m => console.log(`  ${m.name.padEnd(25)} ${m.housing_turnover} (${m.housing_turnover_year})`));
