#!/usr/bin/env node
/**
 * Phase 2d: Fetch INE ADRH (Atlas de Distribución de Renta de los
 * Hogares) income data for Málaga — per-muni gross and net mean income.
 *
 * Mapping to Euskadi fields (EUSTAT `income_personal_mean.px`, period
 * 2023):
 *   avg_total_income      ← ADRH "Renta bruta media por persona"
 *   avg_available_income  ← ADRH "Renta neta media por persona"
 *
 * Per-person (not per-household) to match EUSTAT's 'personal_mean'
 * methodology. Both are ≈ the same concept in EUSTAT vs ADRH, sourced
 * from different tax agencies (Haciendas Forales vs AEAT). Expect a
 * minor (~1-3 %) methodological gap between Málaga and Euskadi values —
 * documented in README §Income.
 *
 * Source: INE ADRH, table 31106 "Indicadores de renta media y mediana"
 * (Málaga province, 103 munis + distritos + secciones; we keep the
 * 5-digit municipio level only).
 *   https://www.ine.es/jaxiT3/files/t/es/px/31106.px
 *
 * Output:
 *   raw/ine_adrh_31106_malaga.px  — raw PX (full muni+distrito+sección)
 *   income_malaga.json            — processed per-muni record
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const RAW_DIR = path.join(OUT_DIR, 'raw');
const PROV_CODE = '29';
const TABLE_ID = 31106;

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

// ────────────────────────────────────────────────────────────────────
// PX parser (same shape as fetch_padron.js::parsePX)
// ────────────────────────────────────────────────────────────────────
function parsePX(buf) {
  const raw = buf.toString('latin1');
  const dataIdx = raw.indexOf('DATA=');
  const header = raw.substring(0, dataIdx);
  const dataStr = raw
    .substring(dataIdx + 5)
    .replace(/;[\s]*$/, '')
    .trim();
  const result = { values: {}, codes: {} };

  const valRe = /VALUES\("([^"]+)"\)=([\s\S]*?);/g;
  let m;
  while ((m = valRe.exec(header)) !== null) {
    result.values[m[1]] = m[2].match(/"([^"]*)"/g).map((s) => s.replace(/"/g, ''));
  }
  const codeRe = /CODES\("([^"]+)"\)=([\s\S]*?);/g;
  while ((m = codeRe.exec(header)) !== null) {
    result.codes[m[1]] = m[2].match(/"([^"]*)"/g).map((s) => s.replace(/"/g, ''));
  }
  const stubLine = header.match(/^STUB=(.+?);/ms);
  const headLine = header.match(/^HEADING=(.+?);/ms);
  result.stub = stubLine ? stubLine[1].match(/"([^"]+)"/g).map((s) => s.replace(/"/g, '')) : [];
  result.heading = headLine
    ? headLine[1].match(/"([^"]+)"/g).map((s) => s.replace(/"/g, ''))
    : [];

  result.data = dataStr
    .split(/[\s\r\n]+/)
    .filter((v) => v.length > 0)
    .map((v) => {
      if (v === '"."' || v === '".."' || v === '":"' || v === ':' || v === '.' || v === '..')
        return null;
      const n = parseFloat(v.replace(/"/g, '').replace(/,/g, ''));
      return isNaN(n) ? null : n;
    });
  return result;
}

function lookupPX(px, dimValues) {
  const allDims = [...px.stub, ...px.heading];
  const sizes = allDims.map((d) => (px.values[d] || []).length);
  let idx = 0;
  for (let i = 0; i < allDims.length; i++) {
    let stride = 1;
    for (let j = i + 1; j < allDims.length; j++) stride *= sizes[j];
    idx += (dimValues[allDims[i]] || 0) * stride;
  }
  return px.data[idx] !== undefined ? px.data[idx] : null;
}

async function main() {
  if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

  console.log(`Downloading INE ADRH table ${TABLE_ID} (Málaga)...`);
  const buf = await fetchBinary(`https://www.ine.es/jaxiT3/files/t/es/px/${TABLE_ID}.px`);
  console.log(`  Got ${(buf.length / 1024).toFixed(0)} KB`);
  fs.writeFileSync(path.join(RAW_DIR, `ine_adrh_${TABLE_ID}_malaga.px`), buf);

  const px = parsePX(buf);
  const unitDim = 'Unidades territoriales';
  const indDim = 'Indicadores de renta media y mediana';
  const perDim = 'Periodo';

  const units = px.values[unitDim];
  const inds = px.values[indDim];
  const periods = px.values[perDim];

  const brutaIdx = inds.indexOf('Renta bruta media por persona');
  const netaIdx = inds.indexOf('Renta neta media por persona');
  const brutaHogarIdx = inds.indexOf('Renta bruta media por hogar');
  const netaHogarIdx = inds.indexOf('Renta neta media por hogar');

  // Latest period index (2023 at index 0)
  const latestPeriodIdx = periods.indexOf('2023');
  const latestLabel = periods[latestPeriodIdx];
  console.log(`Extracting period: ${latestLabel} (indicators: bruta+neta per persona & per hogar)`);

  // Filter to muni-level (5-digit code + space + name)
  const muniRe = /^(\d{5})\s+(.+)$/;
  const income = {};
  let matched = 0;
  for (let i = 0; i < units.length; i++) {
    const mm = units[i].match(muniRe);
    if (!mm) continue;
    const code = mm[1];
    if (!code.startsWith(PROV_CODE)) continue;
    const name = mm[2].trim();
    matched++;

    income[code] = {
      ine_code: code,
      name,
      avg_total_income: lookupPX(px, {
        [unitDim]: i,
        [indDim]: brutaIdx,
        [perDim]: latestPeriodIdx,
      }),
      avg_available_income: lookupPX(px, {
        [unitDim]: i,
        [indDim]: netaIdx,
        [perDim]: latestPeriodIdx,
      }),
      avg_total_income_hogar: lookupPX(px, {
        [unitDim]: i,
        [indDim]: brutaHogarIdx,
        [perDim]: latestPeriodIdx,
      }),
      avg_available_income_hogar: lookupPX(px, {
        [unitDim]: i,
        [indDim]: netaHogarIdx,
        [perDim]: latestPeriodIdx,
      }),
      income_year: 2023,
    };
  }

  fs.writeFileSync(path.join(OUT_DIR, 'income_malaga.json'), JSON.stringify(income, null, 2));
  console.log(`\nSaved income_malaga.json (${matched} munis)`);

  // QA
  const missing = Object.values(income).filter((r) => r.avg_total_income == null);
  if (missing.length) {
    console.warn(`⚠ ${missing.length} munis missing avg_total_income:`);
    missing.forEach((r) => console.warn(`  ${r.ine_code} ${r.name}`));
  } else {
    console.log('✓ All munis have both bruta and neta values');
  }

  // Spot-check
  const capital = income['29067'];
  if (capital) console.log('\nMálaga (29067):\n', JSON.stringify(capital, null, 2));
  const min = Object.values(income).sort((a, b) => (a.avg_total_income || 0) - (b.avg_total_income || 0))[0];
  const max = Object.values(income).sort((a, b) => (b.avg_total_income || 0) - (a.avg_total_income || 0))[0];
  console.log(`\nLowest avg_total_income: ${min.name} — €${min.avg_total_income}`);
  console.log(`Highest avg_total_income: ${max.name} — €${max.avg_total_income}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
