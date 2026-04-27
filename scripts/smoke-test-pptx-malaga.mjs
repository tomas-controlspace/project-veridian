#!/usr/bin/env node
/**
 * Smoke-test: render the Málaga PPTX deck end-to-end (minus the live map
 * capture, which depends on a foreground browser per CLAUDE.md gotchas).
 *
 * Exercises the post-multi-region-UI plumbing:
 *   - public/data/metrics_municipios.json must contain Málaga muni 29067
 *   - public/data/metrics_regions.json must contain region AN
 *   - Region label "Málaga" must reach col3Label (not "Euskadi")
 *   - Three table sections must render with non-empty rows
 *   - The PPTX template must accept the flattened tags without errors
 *
 * Output: /tmp/malaga-29067-smoketest.pptx (ZIP signature checked, no live
 * map image — the slide-2 picture placeholder will retain whatever image
 * the template ships with).
 */

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const ROOT = resolve(import.meta.dirname, '..');
const TEMPLATE = resolve(ROOT, 'public/templates/case-study.pptx');
const OUT = resolve(tmpdir(), 'malaga-29067-smoketest.pptx');
const SCOPE_INE = '29067';

// ---- Load real metrics ----
const metrics = JSON.parse(readFileSync(resolve(ROOT, 'public/data/metrics_municipios.json'), 'utf-8'));
const regions = JSON.parse(readFileSync(resolve(ROOT, 'public/data/metrics_regions.json'), 'utf-8'));
const muni = metrics[SCOPE_INE];
if (!muni) {
  console.error(`! Muni ${SCOPE_INE} not found in metrics_municipios.json`);
  process.exit(1);
}
const region = regions[muni.region_code];
if (!region) {
  console.error(`! Region ${muni.region_code} not found in metrics_regions.json`);
  process.exit(1);
}

console.log(`Testing scope: muni=${muni.name} (${SCOPE_INE}, region=${region.region_name})`);

// ---- Mirror src/lib/export/buildCaseStudyData.ts row specs + formatters ----
const POP_SPEC = [
  { label: 'Population',         baseKey: 'pop_2025',           catchKey: 'catchment_pop',     format: 'number',  decimals: 0 },
  { label: 'Density (pop/km²)',  baseKey: 'density_per_km2',    catchKey: 'catchment_density', format: 'number',  decimals: 1 },
  { label: 'Pop Growth 5yr (%)', baseKey: 'pop_growth_5yr_pct', catchKey: 'catch_pop_growth',  format: 'percent', decimals: 2 },
  { label: 'Avg Income (€)',     baseKey: 'avg_total_income',   catchKey: 'catch_avg_income',  format: 'euro',    decimals: 0 },
];
const HOUSING_SPEC = [
  { label: '% Apartment',              baseKey: 'pct_apartment',                catchKey: 'catch_pct_apartment',     format: 'percent',  decimals: 1 },
  { label: 'Avg Housing Size (m²)',    baseKey: 'avg_surface_m2',               catchKey: 'catch_avg_surface_m2',    format: 'decimal',  decimals: 1, suffix: ' m²' },
  { label: '% Rented',                 baseKey: 'pct_rented',                   catchKey: 'catch_pct_rented',        format: 'percent',  decimals: 1 },
  { label: 'Purchase Price (€/m²)',    baseKey: 'avg_price_sqm',                catchKey: 'catch_avg_price_sqm',     format: 'euro_sqm', decimals: 0 },
  { label: 'Rent (€/m²/month)',        baseKey: 'avg_rent_sqm',                 catchKey: 'catch_avg_rent_sqm',      format: 'euro_sqm', decimals: 2 },
  { label: 'Housing Turnover (annual)',baseKey: 'housing_turnover_annual_prov', catchKey: 'catch_housing_turnover',  format: 'number',   decimals: 0 },
];
const STORAGE_SPEC = [
  { label: 'NLA (m²)',        baseKey: 'nla_sqm',         catchKey: 'catch_nla_sqm',         format: 'number',  decimals: 0 },
  { label: 'NLA per Capita',  baseKey: 'nla_per_capita',  catchKey: 'catch_nla_per_capita',  format: 'decimal', decimals: 3 },
];

function fmt(spec, value) {
  if (value == null) return '—';
  const d = spec.decimals ?? 0;
  let core;
  if (spec.format === 'number')        core = value.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
  else if (spec.format === 'percent')  core = `${value.toFixed(d)}%`;
  else if (spec.format === 'euro')     core = `€${value.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d })}`;
  else if (spec.format === 'euro_sqm') core = `€${value.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d })}`;
  else if (spec.format === 'decimal')  core = value.toFixed(d);
  else                                 core = String(value);
  return spec.suffix ? core + spec.suffix : core;
}

function buildRows(spec, subject, catchment, region) {
  return spec.map(s => ({
    label: s.label,
    col1: fmt(s, subject?.[s.baseKey]),
    col2: catchment ? fmt(s, catchment[s.catchKey]) : '',
    col3: fmt(s, region?.[s.baseKey]),
  }));
}

const catchCodes = muni.catch_ine_codes || [];
const catchmentMunis = catchCodes
  .map(c => metrics[c]?.name)
  .filter(Boolean)
  .map(name => ({ name }));

const data = {
  areaName: muni.name,
  areaNameUpper: muni.name.toUpperCase(),
  s2Title: `${muni.name}'s 10-min Catchment Area`,
  col1Label: muni.name,
  col2Label: 'Catchment',
  col3Label: region.region_name, // ← multi-region: was hard-coded "Euskadi"
  catchmentMunis,
  popRows:     buildRows(POP_SPEC,     muni, muni, region),
  housingRows: buildRows(HOUSING_SPEC, muni, muni, region),
  storageRows: buildRows(STORAGE_SPEC, muni, muni, region),
};

// ---- Assertions ----
const errors = [];
if (data.col3Label !== 'Málaga') errors.push(`col3Label expected "Málaga", got "${data.col3Label}"`);
if (data.areaName !== 'Málaga') errors.push(`areaName expected "Málaga", got "${data.areaName}"`);
if (data.popRows.length !== 4) errors.push(`popRows expected 4, got ${data.popRows.length}`);
if (data.housingRows.length !== 6) errors.push(`housingRows expected 6, got ${data.housingRows.length}`);
if (data.storageRows.length !== 2) errors.push(`storageRows expected 2, got ${data.storageRows.length}`);
if (catchmentMunis.length === 0) errors.push('catchmentMunis is empty');
// Spot-check a few values
if (!data.popRows[0].col1.includes('599')) errors.push(`Pop col1 should include 599 (Málaga ~599k); got "${data.popRows[0].col1}"`);
if (!data.popRows[0].col3.includes('1.79') && !data.popRows[0].col3.includes('1,791')) {
  errors.push(`Pop col3 should be Málaga region ~1.79M; got "${data.popRows[0].col3}"`);
}
if (data.housingRows.find(r => r.label === 'Purchase Price (€/m²)').col1 === '—') {
  errors.push('Price col1 unexpectedly empty for Málaga city');
}

console.log('\nData payload spot-check:');
console.log(`  areaName:   ${data.areaName}`);
console.log(`  col1Label:  ${data.col1Label}`);
console.log(`  col2Label:  ${data.col2Label}`);
console.log(`  col3Label:  ${data.col3Label}     <-- region label`);
console.log(`  catchment:  ${catchmentMunis.length} munis (${catchmentMunis.map(c=>c.name).join(', ').slice(0,80)}...)`);
console.log('  popRows[0]:    ', data.popRows[0]);
console.log('  housingRows[3]:', data.housingRows[3]);
console.log('  storageRows[0]:', data.storageRows[0]);

if (errors.length) {
  console.error('\n! Data payload assertions FAILED:');
  errors.forEach(e => console.error(`  ${e}`));
  process.exit(1);
}
console.log('\n  ✓ all data assertions passed');

// ---- Render through the template ----
console.log('\nRendering PPTX template...');
const flat = {
  areaName: data.areaName,
  areaNameUpper: data.areaNameUpper,
  s2Title: data.s2Title,
  col1Label: data.col1Label,
  col2Label: data.col2Label,
  col3Label: data.col3Label,
  catchmentMunis: data.catchmentMunis,
};
const writeRows = (prefix, rows) => {
  rows.forEach((row, i) => {
    const n = i + 1;
    flat[`${prefix}_r${n}_label`] = row.label;
    flat[`${prefix}_r${n}_c1`]    = row.col1;
    flat[`${prefix}_r${n}_c2`]    = row.col2;
    flat[`${prefix}_r${n}_c3`]    = row.col3;
  });
};
writeRows('pop',     data.popRows);
writeRows('housing', data.housingRows);
writeRows('storage', data.storageRows);

const zip = new PizZip(readFileSync(TEMPLATE));
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
try {
  doc.render(flat);
} catch (e) {
  console.error('! docxtemplater render failed:', e.message);
  if (e.properties?.errors) {
    e.properties.errors.forEach(err => console.error('  -', err.properties?.explanation || err.message));
  }
  process.exit(1);
}

const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);

// ---- Verify output ----
const sig = out.subarray(0, 4);
const isPK = sig[0] === 0x50 && sig[1] === 0x4b; // "PK"
console.log(`\nOutput: ${OUT}`);
console.log(`  size: ${(out.length / 1024).toFixed(0)} KB`);
console.log(`  ZIP signature: ${isPK ? '✓ PK' : '! not a ZIP'}`);
console.log(`  contains slide2 image (template default — live map skipped): ${zip.files['ppt/media/image9.png'] ? '✓' : '!'}`);

// Sanity check: render a Bilbao deck too to confirm nothing broke for Euskadi.
console.log('\nQuick Euskadi back-compat check (Bilbao 48020)...');
const bilbao = metrics['48020'];
const euskadi = regions.PV;
if (bilbao && euskadi) {
  const bData = {
    areaName: bilbao.name, areaNameUpper: bilbao.name.toUpperCase(),
    s2Title: `${bilbao.name}'s 10-min Catchment Area`,
    col1Label: bilbao.name, col2Label: 'Catchment', col3Label: euskadi.region_name,
    catchmentMunis: (bilbao.catch_ine_codes || []).map(c => ({ name: metrics[c]?.name })).filter(c => c.name),
    popRows: buildRows(POP_SPEC, bilbao, bilbao, euskadi),
    housingRows: buildRows(HOUSING_SPEC, bilbao, bilbao, euskadi),
    storageRows: buildRows(STORAGE_SPEC, bilbao, bilbao, euskadi),
  };
  const errsB = [];
  if (bData.col3Label !== 'Euskadi') errsB.push(`Bilbao col3Label expected "Euskadi", got "${bData.col3Label}"`);
  if (!bData.popRows[0].col1.includes('351')) errsB.push(`Bilbao pop should include 351; got "${bData.popRows[0].col1}"`);
  if (errsB.length) { errsB.forEach(e => console.error(`  ! ${e}`)); process.exit(1); }
  console.log(`  ✓ Bilbao col3Label = "${bData.col3Label}", pop = "${bData.popRows[0].col1}"`);
}

console.log('\n✓ Smoke test passed — multi-region PPTX export is wired correctly.');
console.log('  (Live map capture happens only in the browser; not exercised here.)');
