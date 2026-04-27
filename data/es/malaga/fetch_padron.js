#!/usr/bin/env node
/**
 * Phase 2a: Fetch INE Padrón data for Málaga province.
 *
 * Two INE sources:
 *  - WSTEMPUS API, table 2882 (op 22 "Cifras Oficiales de Población"):
 *    Málaga population by municipio and sex, annual. Used for
 *    pop_{year} fields and pop_growth_{5,10}yr_pct.
 *  - Direct PX download, table 33570 (op 188 "Padrón Continuo",
 *    nationwide, 8136 municipios, reference 1-enero-2022):
 *    Municipios × Sexo × Periodo × Edad (grupos quinquenales).
 *    Filtered to the 103 Málaga munis and used for age structure
 *    (pct_young_0_19, pct_working_20_64, pct_senior_65_plus).
 *
 * Output:
 *  - raw/ine_padron_2882_malaga.json      — API response (population by year)
 *  - raw/ine_padron_continuo_33570_malaga.px — PX subset filtered to Málaga
 *  - demographics_malaga.json             — processed per-muni record
 *
 * Notes:
 *  - Euskadi equivalents came from EUSTAT age groups at 2025-01-01. INE's
 *    latest nationwide municipal age data is 2022-01-01 — a 3-year vintage
 *    gap. Age structure is slow-moving (typical year-over-year delta
 *    < 0.3 pp on each bucket), so this is a documented limitation
 *    rather than a blocker. Population itself is current (2025).
 *  - Mirrors the parsing logic in ../parse_eustat.js and ../build_master.js
 *    for cross-reference.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const RAW_DIR = path.join(OUT_DIR, 'raw');
const PROV_CODE = '29';

// ────────────────────────────────────────────────────────────────────
// INE WSTEMPUS: population by year, table 2882 Málaga
// ────────────────────────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((res, rej) => {
    https
      .get(url, { headers: { Accept: 'application/json' } }, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try {
            res(JSON.parse(d));
          } catch (e) {
            rej(new Error(`Parse error: ${e.message}; head=${d.slice(0, 200)}`));
          }
        });
      })
      .on('error', rej);
  });
}

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
// PX parser (same shape as parse_eustat.js::parsePX)
// ────────────────────────────────────────────────────────────────────
function parsePX(buf) {
  const raw = buf.toString('latin1');
  const dataIdx = raw.indexOf('DATA=');
  if (dataIdx === -1) throw new Error('No DATA= section');
  const header = raw.substring(0, dataIdx);
  const dataStr = raw
    .substring(dataIdx + 5)
    .replace(/;[\s]*$/, '')
    .trim();
  const result = { values: {}, codes: {} };

  // VALUES("dim")="v1","v2",...  (multi-line safe)
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

// ────────────────────────────────────────────────────────────────────
// Parse "29001 Alameda" → { code: '29001', name: 'Alameda' }
// ────────────────────────────────────────────────────────────────────
function parseMuniLabel(s) {
  const m = s.match(/^(\d{5})\s+(.+)$/);
  return m ? { code: m[1], name: m[2].trim() } : null;
}

// ────────────────────────────────────────────────────────────────────
// Filter-and-rewrite PX to only Málaga municipios (plus "Total Nacional"
// for auditability). Cuts 50 MB → ~100 KB without changing semantics.
// ────────────────────────────────────────────────────────────────────
function filterPXToMalaga(buf) {
  const raw = buf.toString('latin1');
  const dataIdx = raw.indexOf('DATA=');
  const header = raw.substring(0, dataIdx);
  const dataStr = raw
    .substring(dataIdx + 5)
    .replace(/;[\s]*$/, '')
    .trim();

  // Find muni indices we want (Total Nacional + all starting with '29')
  const muniValuesMatch = header.match(/VALUES\("Municipios"\)=([\s\S]*?);/);
  const allMunis = muniValuesMatch[1].match(/"([^"]*)"/g).map((s) => s.replace(/"/g, ''));
  // Match "29001 Alameda" etc. — any label whose leading 5-digit code starts with the province
  const muniCodeRe = new RegExp(`^${PROV_CODE}\\d{3}\\s`);
  const keepIdx = [];
  const keepLabels = [];
  allMunis.forEach((m, i) => {
    if (m === 'Total Nacional' || muniCodeRe.test(m)) {
      keepIdx.push(i);
      keepLabels.push(m);
    }
  });

  // Parse data as flat array, then rebuild filtered on the Municipios axis.
  const px = parsePX(buf);
  const allDims = [...px.stub, ...px.heading];
  const sizes = allDims.map((d) => (px.values[d] || []).length);
  const muniDimIdx = allDims.indexOf('Municipios');
  if (muniDimIdx === -1) throw new Error('Municipios dim not found');

  const newMuniLen = keepIdx.length;
  const newSizes = sizes.slice();
  newSizes[muniDimIdx] = newMuniLen;
  const newLen = newSizes.reduce((a, b) => a * b, 1);
  const out = new Array(newLen);

  // Index iterator over new-array layout → map to old-array layout → copy value
  const coord = allDims.map(() => 0);
  for (let flat = 0; flat < newLen; flat++) {
    // Compute old flat from coord (swap muni coord to keepIdx[coord[muniDimIdx]])
    let oldFlat = 0;
    for (let d = 0; d < allDims.length; d++) {
      let stride = 1;
      for (let j = d + 1; j < allDims.length; j++) stride *= sizes[j];
      const c = d === muniDimIdx ? keepIdx[coord[d]] : coord[d];
      oldFlat += c * stride;
    }
    out[flat] = px.data[oldFlat];
    // increment coord (little-endian across dims, last dim fastest)
    for (let d = allDims.length - 1; d >= 0; d--) {
      coord[d]++;
      if (coord[d] < newSizes[d]) break;
      coord[d] = 0;
    }
  }

  // Rebuild header with Municipios values replaced
  const newMuniValues = keepLabels.map((s) => `"${s}"`).join(',');
  const newHeader = header.replace(
    /VALUES\("Municipios"\)=[\s\S]*?;/,
    `VALUES("Municipios")=${newMuniValues};`,
  );
  // Format data: 10 values per line, space-separated (matches INE convention)
  const lines = [];
  for (let i = 0; i < out.length; i += 10) {
    lines.push(
      out
        .slice(i, i + 10)
        .map((v) => (v === null ? '""' : String(v)))
        .join(' '),
    );
  }
  return Buffer.from(`${newHeader}DATA=\n${lines.join('\n')};\n`, 'latin1');
}

// ────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

  // ----- Step 1: WSTEMPUS population table 2882 (Málaga) -----
  console.log('[1/3] Fetching INE WSTEMPUS table 2882 (Málaga population by municipio)...');
  const popUrl = 'https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/2882?tip=AM&nult=10';
  const popRaw = await fetchJSON(popUrl);
  fs.writeFileSync(path.join(RAW_DIR, 'ine_padron_2882_malaga.json'), JSON.stringify(popRaw));
  console.log(`  Saved ${popRaw.length} series to raw/ine_padron_2882_malaga.json`);

  // Process into per-muni record (same math as ../fetch_demographics.js)
  const demographics = {};
  for (const series of popRaw) {
    const meta = series.MetaData || [];
    const mun = meta.find((m) => m.T3_Variable === 'Municipios');
    const sex = meta.find((m) => m.T3_Variable === 'Sexo');
    if (!mun || !sex) continue;
    if (sex.Codigo !== '0') continue; // Total sex only

    const ineCode = mun.Codigo;
    if (!ineCode.startsWith(PROV_CODE)) continue;

    if (!demographics[ineCode]) {
      demographics[ineCode] = {
        ine_code: ineCode,
        name: mun.Nombre,
        provincia_code: PROV_CODE,
        provincia_name: 'Málaga',
      };
    }
    for (const dp of series.Data || []) {
      demographics[ineCode][`pop_${dp.Anyo}`] = dp.Valor;
    }
  }

  // Compute growth pct (5-year, 10-year)
  for (const rec of Object.values(demographics)) {
    const p25 = rec.pop_2025;
    const p24 = rec.pop_2024;
    const p20 = rec.pop_2020;
    const p15 = rec.pop_2015 || rec.pop_2016;
    rec.pop_growth_5yr_pct =
      p25 && p20 && p20 > 0 ? Math.round(((p25 - p20) / p20) * 100 * 100) / 100 : null;
    rec.pop_growth_10yr_pct =
      p25 && p15 && p15 > 0 ? Math.round(((p25 - p15) / p15) * 100 * 100) / 100 : null;
  }

  const muniCount = Object.keys(demographics).length;
  console.log(`  Processed ${muniCount} Málaga municipios.`);
  if (muniCount !== 103) {
    console.warn(`  ⚠ Expected 103 munis, got ${muniCount}`);
  }

  // ----- Step 2: Padrón Continuo PX 33570 (nationwide → Málaga subset) -----
  console.log('[2/3] Downloading INE PX 33570 (Padrón Continuo, nationwide, age quinquenal)...');
  const SCRATCH = process.env.TEMP
    ? path.join(process.env.TEMP, 'ine_scratch')
    : path.join(require('os').tmpdir(), 'ine_scratch');
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });
  const scratchPath = path.join(SCRATCH, '33570.px');
  let pxBuf;
  if (fs.existsSync(scratchPath) && fs.statSync(scratchPath).size > 10_000_000) {
    console.log(`  Reusing cached download at ${scratchPath}`);
    pxBuf = fs.readFileSync(scratchPath);
  } else {
    pxBuf = await fetchBinary('https://www.ine.es/jaxiT3/files/t/es/px/33570.px');
    fs.writeFileSync(scratchPath, pxBuf);
    console.log(`  Downloaded ${(pxBuf.length / 1024 / 1024).toFixed(1)} MB → ${scratchPath}`);
  }

  const filteredPX = filterPXToMalaga(pxBuf);
  const pxOutPath = path.join(RAW_DIR, 'ine_padron_continuo_33570_malaga.px');
  fs.writeFileSync(pxOutPath, filteredPX);
  console.log(
    `  Filtered to Málaga: ${(filteredPX.length / 1024).toFixed(0)} KB → raw/ine_padron_continuo_33570_malaga.px`,
  );

  // ----- Step 3: Parse age groups from filtered PX → aggregate to 0-19, 20-64, 65+ -----
  console.log('[3/3] Aggregating age quinquenal bands → 0-19 / 20-64 / 65+');
  const px = parsePX(filteredPX);
  const terrDim = 'Municipios';
  const ageDim = 'Edad (grupos quinquenales)';
  const sexDim = 'Sexo';
  const perDim = 'Periodo';

  const ageValues = px.values[ageDim];
  const periods = px.values[perDim];
  const latestPerIdx = 0; // 1-enero-2022 (most recent) is first in the list
  const latestPeriodLabel = periods[latestPerIdx];
  console.log(`  Using period: ${latestPeriodLabel}`);
  const totalSexIdx = px.values[sexDim].indexOf('Total');
  const totalAgeIdx = ageValues.indexOf('Todas las edades');

  // Map age-band labels to aggregate buckets
  const isYoung = (lbl) => /^De (0|5|10|15) a/.test(lbl);
  const isWorking = (lbl) => /^De (20|25|30|35|40|45|50|55|60) a/.test(lbl);
  const isSenior = (lbl) => /^De (65|70|75|80|85|90|95) a/.test(lbl) || lbl === '100 y más años';

  const muniLabels = px.values[terrDim];
  for (let i = 0; i < muniLabels.length; i++) {
    const parsed = parseMuniLabel(muniLabels[i]);
    if (!parsed) continue;
    if (parsed.code.substring(0, 2) !== PROV_CODE) continue;

    const total = lookupPX(px, {
      [terrDim]: i,
      [ageDim]: totalAgeIdx,
      [sexDim]: totalSexIdx,
      [perDim]: latestPerIdx,
    });
    let young = 0,
      working = 0,
      senior = 0;
    for (let a = 0; a < ageValues.length; a++) {
      const lbl = ageValues[a];
      if (lbl === 'Todas las edades') continue;
      const v = lookupPX(px, {
        [terrDim]: i,
        [ageDim]: a,
        [sexDim]: totalSexIdx,
        [perDim]: latestPerIdx,
      });
      if (v === null) continue;
      if (isYoung(lbl)) young += v;
      else if (isWorking(lbl)) working += v;
      else if (isSenior(lbl)) senior += v;
    }

    const rec = demographics[parsed.code];
    if (!rec) continue;

    rec.pop_2022_padron_continuo = total;
    rec.pct_young_0_19 =
      total && young ? Math.round((young / total) * 10000) / 100 : null;
    rec.pct_working_20_64 =
      total && working ? Math.round((working / total) * 10000) / 100 : null;
    rec.pct_senior_65_plus =
      total && senior ? Math.round((senior / total) * 10000) / 100 : null;
    rec.age_reference_date = '2022-01-01';
  }

  // ----- Save -----
  const outPath = path.join(OUT_DIR, 'demographics_malaga.json');
  fs.writeFileSync(outPath, JSON.stringify(demographics, null, 2));
  console.log(`\nSaved demographics_malaga.json (${muniCount} munis)`);

  // ----- QA summary -----
  const malagaCapital = demographics['29067']; // Málaga city
  if (malagaCapital) {
    console.log('\nSample — Málaga (29067):');
    console.log(JSON.stringify(malagaCapital, null, 2));
  }
  const totalPop2025 = Object.values(demographics).reduce((s, r) => s + (r.pop_2025 || 0), 0);
  console.log(`\nTotal Málaga province pop 2025: ${totalPop2025.toLocaleString()}`);

  const missingAge = Object.values(demographics).filter((r) => r.pct_young_0_19 == null);
  if (missingAge.length) {
    console.log(`  ⚠ Age missing for ${missingAge.length} munis`);
    missingAge.forEach((r) => console.log(`    ${r.ine_code} ${r.name}`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
