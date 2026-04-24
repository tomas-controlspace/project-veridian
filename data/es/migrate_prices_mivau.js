#!/usr/bin/env node
/**
 * Migrate Euskadi purchase prices from ECVI (€/m² útil, transaction
 * prices) to MIVAU Valor Tasado de la Vivienda Libre (€/m² constructed,
 * appraisal values) — see data/es/malaga/README.md §1 for decision log.
 *
 * Pre-migration state (EUSTAT-era):
 *   avg_price_sqm = ECVI 2025 Q4 transaction price €/m² **útil**,
 *                   assigned per-muni from ECVI T1.3 + T3.3 with rule
 *                   "specific muni > capital > rest of province"
 *                   (see data/es/refine_prices.js).
 *   price_source  = 'capital' | 'municipal' | 'provincial_rest'.
 *
 * Post-migration state:
 *   avg_price_sqm = MIVAU Valor Tasado 2025 Q4 €/m² **constructed**,
 *                   muni-level for munis > 25k hab (MIVAU publication
 *                   rule), provincial fallback for the rest.
 *   price_source  = 'municipal' | 'provincial_fallback' (normalized to
 *                   match Málaga's values).
 *   price_unit    = 'eur_per_sqm_constructed' (new field).
 *
 * Sources (fetched into scratch, not committed):
 *   Tabla 1: https://apps.fomento.gob.es/boletinonline2/sedal/35101000.XLS
 *     Provincial + national series, 1995 Q1 – 2025 Q4, latest-sheet
 *     columns 2–13 map to year-quarter.
 *   Tabla 5: https://apps.fomento.gob.es/boletinonline2/sedal/35103500.XLS
 *     Per-quarter sheets (T4A2025 used here) for munis > 25k hab.
 *
 * Snapshot of pre-migration master at
 *   data/es/master_municipios_pre_price_mivau.json
 *
 * Note: Árava/Álava appears in Tabla 1 as "Araba/Álava". Muni names
 * also differ slightly between INE (our master) and MIVAU (xls):
 *   MIVAU "Vitoria"            → INE 01059 Vitoria-Gasteiz
 *   MIVAU "San Sebastián"      → INE 20069 Donostia/San Sebastián
 *   MIVAU "Bilbao"             → INE 48020 Bilbao
 *   MIVAU "Barakaldo"          → INE 48013 Barakaldo
 *   MIVAU "Basauri"            → INE 48015 Basauri
 *   MIVAU "Getxo"              → INE 48044 Getxo
 *   MIVAU "Portugalete"        → INE 48078 Portugalete
 *   MIVAU "Santurtzi"          → INE 48082 Santurtzi
 *   MIVAU "Irún"               → INE 20045 Irun
 *   MIVAU "Errenteria" or "Rentería" → INE 20067 Errenteria
 *
 * The script normalizes names (NFD, remove diacritics, lowercase,
 * drop non-alpha) before matching against master_municipios names.
 */

const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('C:/Users/tomas/Downloads/node_modules/xlsx');

const ROOT = path.resolve(__dirname, '..', '..');
const MASTER_PATH = path.join(ROOT, 'data', 'es', 'master_municipios.json');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'es', 'master_municipios_pre_price_mivau.json');

const SCRATCH = path.join(process.env.TEMP || os.tmpdir(), 'ine_scratch');
const T1_PATH = path.join(SCRATCH, 'mivau_valor_tasado_tabla1_35101000.xls');
const T5_PATH = path.join(SCRATCH, 'mivau_valor_tasado_tabla5_35103500.xls');
const T1_URL = 'https://apps.fomento.gob.es/boletinonline2/sedal/35101000.XLS';
const T5_URL = 'https://apps.fomento.gob.es/boletinonline2/sedal/35103500.XLS';

const PROV_NAMES_XLS = {
  // Keys = MIVAU xls row-1 province label (trimmed), values = 2-digit INE code
  'Araba/Álava': '01',
  'Araba/Alava': '01',
  Álava: '01',
  Alava: '01',
  Bizkaia: '48',
  Vizcaya: '48',
  Gipuzkoa: '20',
  Guipúzcoa: '20',
  Guipuzcoa: '20',
};

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
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });
  if (fs.existsSync(local) && fs.statSync(local).size > 50_000) {
    console.log(`  cached: ${path.basename(local)}`);
    return;
  }
  console.log(`  downloading ${url}...`);
  const buf = await fetchBinary(url);
  fs.writeFileSync(local, buf);
  console.log(`  saved ${(buf.length / 1024).toFixed(0)} KB → ${path.basename(local)}`);
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

async function main() {
  console.log('[1/4] Fetching MIVAU xls files (Tabla 1 + Tabla 5)...');
  await ensureFile(T1_URL, T1_PATH);
  await ensureFile(T5_URL, T5_PATH);

  // ---- Tabla 1: provincial series, latest-years sheet
  console.log('\n[2/4] Parsing Tabla 1 (provincial fallback values)...');
  const wb1 = XLSX.readFile(T1_PATH);
  const sheet1 = wb1.Sheets[wb1.SheetNames[wb1.SheetNames.length - 1]];
  const rows1 = XLSX.utils.sheet_to_json(sheet1, { header: 1, defval: '' });

  // Columns layout (verified in the Málaga run):
  //   Row 11 has the year labels ("Año 2023" ... "Año 2025")
  //   Row 13 has quarter labels (1º 2º 3º 4º × 3 years)
  //   Year 2025 Q4 sits at column index 13 (0-based).
  const PROV_COL_Q4_2025 = 13;
  const PROV_COL_Q3_2025 = 12;
  const provFallback = {};
  const provName = { '01': 'Álava/Araba', '20': 'Gipuzkoa', '48': 'Bizkaia' };

  for (let r = 0; r < rows1.length; r++) {
    const raw = String(rows1[r][1] || '').trim();
    const labelNorm = Object.keys(PROV_NAMES_XLS).find(
      (k) => norm(k) === norm(raw),
    );
    if (!labelNorm) continue;
    const provCode = PROV_NAMES_XLS[labelNorm];
    const q4 = parseFloat(rows1[r][PROV_COL_Q4_2025]);
    const q3 = parseFloat(rows1[r][PROV_COL_Q3_2025]);
    const value = !isNaN(q4) ? q4 : q3;
    const quarter = !isNaN(q4) ? 'Q4 2025' : 'Q3 2025';
    if (!provFallback[provCode]) {
      provFallback[provCode] = { code: provCode, name: provName[provCode], value, quarter, raw };
    }
  }

  Object.values(provFallback).forEach((p) =>
    console.log(`  ${p.code} ${p.name}: €${p.value.toFixed(2)}/m² (${p.quarter}) [xls label: ${p.raw}]`),
  );
  if (!provFallback['01'] || !provFallback['20'] || !provFallback['48']) {
    throw new Error('Missing at least one Basque provincial row in Tabla 1');
  }

  // ---- Tabla 5: muni-level for munis > 25k hab, T4A2025 sheet
  console.log('\n[3/4] Parsing Tabla 5 (muni-level, T4A2025)...');
  const wb5 = XLSX.readFile(T5_PATH);
  const QUARTER_PREF = ['T4A2025', 'T3A2025', 'T2A2025', 'T1A2025', 'T4A2024'];
  let targetSheet = null;
  for (const q of QUARTER_PREF) {
    const s = wb5.SheetNames.find((x) => x.trim() === q);
    if (s) {
      targetSheet = s;
      break;
    }
  }
  if (!targetSheet) throw new Error('No preferred quarter sheet found in Tabla 5');
  console.log(`  sheet: ${targetSheet}`);
  const rows5 = XLSX.utils.sheet_to_json(wb5.Sheets[targetSheet], { header: 1, defval: '' });

  // Column layout (from malaga/process_valor_tasado.js):
  //   col 1: provincia label (sparse — only first row of a group)
  //   col 2: muni name
  //   col 5: price total (€/m² constructed, all vintages)
  //   col 9: # tasaciones total
  const muniMap = {}; // provincia code → { normMuniName: { priceTotal, nTotal, rawName } }
  let currentProvRaw = '';
  let currentProvCode = null;

  for (let i = 17; i < rows5.length; i++) {
    const r = rows5[i];
    if (!r || r.length === 0) continue;
    const provCell = String(r[1] || '').trim();
    const muniCell = String(r[2] || '').trim();
    const priceTotal = r[5];
    const nTotal = r[9];
    if (provCell) {
      currentProvRaw = provCell;
      // Map to code if it's a Basque province label (Tabla 5 uses different capitalization)
      const hit = Object.keys(PROV_NAMES_XLS).find((k) => norm(k) === norm(currentProvRaw));
      currentProvCode = hit ? PROV_NAMES_XLS[hit] : null;
    }
    if (!muniCell) continue;
    if (!currentProvCode) continue;
    if (!['01', '20', '48'].includes(currentProvCode)) continue;

    if (!muniMap[currentProvCode]) muniMap[currentProvCode] = {};
    muniMap[currentProvCode][norm(muniCell)] = {
      rawName: muniCell,
      priceTotal: typeof priceTotal === 'number' ? priceTotal : null,
      nTotal: typeof nTotal === 'number' ? nTotal : null,
    };
  }

  let totalMuniLevel = 0;
  for (const [p, m] of Object.entries(muniMap)) {
    const validN = Object.values(m).filter((x) => x.priceTotal).length;
    totalMuniLevel += validN;
    console.log(`  ${provName[p]}: ${validN} munis with price data in T4A2025`);
    Object.values(m)
      .filter((x) => x.priceTotal)
      .forEach((x) => console.log(`    ${x.rawName.padEnd(28)} €${x.priceTotal}/m² (n=${x.nTotal})`));
  }

  // ---- Apply migration
  console.log('\n[4/4] Snapshotting master and applying price migration...');
  const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf-8'));
  // Only snapshot once — re-runs must preserve the pre-migration baseline.
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(master, null, 2));
    console.log(`  Snapshot → ${SNAPSHOT_PATH}`);
  } else {
    console.log(`  Snapshot already exists, reusing: ${SNAPSHOT_PATH}`);
  }

  // Name-matching fallbacks — MIVAU uses Spanish-only forms for some Basque munis
  const NAME_ALIASES = {
    vitoria: '01059', // Vitoria → Vitoria-Gasteiz
    sansebastian: '20069', // San Sebastián → Donostia/San Sebastián
    sansebastiandonostia: '20069', // MIVAU writes the token order reversed
    donostia: '20069',
    irun: '20045',
    renteria: '20067', // Rentería → Errenteria
    errenteria: '20067',
  };

  const basque = Object.entries(master).filter(([c]) => ['01', '20', '48'].includes(c.substring(0, 2)));
  let muniAssigned = 0,
    provAssigned = 0,
    unmatched = [];
  const samples = {};

  for (const [code, rec] of basque) {
    const provCode = code.substring(0, 2);
    const pre = {
      avg_price_sqm: rec.avg_price_sqm,
      price_source: rec.price_source,
    };

    // Look up in muniMap via normalized name or alias
    const provMunis = muniMap[provCode] || {};
    const normalized = norm(rec.name);
    let match = provMunis[normalized];

    if (!match) {
      // Try alias → direct INE lookup (more reliable than name fuzzy)
      const aliasCode = Object.entries(NAME_ALIASES).find(
        ([alias, ineCode]) => ineCode === code && provMunis[alias],
      );
      if (aliasCode) match = provMunis[aliasCode[0]];
    }

    if (!match) {
      // Fuzzy: MIVAU muni names in Basque provinces may drop the non-Castilian form
      // (e.g., INE "Donostia/San Sebastián" vs MIVAU "San Sebastián").
      // Try matching on any token half of INE name.
      const parts = rec.name.split(/[\/\-\s]+/).map(norm);
      for (const p of parts) {
        if (p && provMunis[p]) {
          match = provMunis[p];
          break;
        }
      }
    }

    // (Intentionally no substring-match fallback: it produced a false
    // positive "Arakaldo" → Barakaldo price. Token-order mismatches like
    // INE "Donostia/San Sebastián" vs MIVAU "San Sebastián/Donostia"
    // must be handled via explicit NAME_ALIASES.)

    if (match && match.priceTotal) {
      rec.avg_price_sqm = Math.round(match.priceTotal * 100) / 100;
      rec.price_source = 'municipal';
      rec.price_unit = 'eur_per_sqm_constructed';
      muniAssigned++;
    } else {
      rec.avg_price_sqm = Math.round(provFallback[provCode].value * 100) / 100;
      rec.price_source = 'provincial_fallback';
      rec.price_unit = 'eur_per_sqm_constructed';
      provAssigned++;
    }

    if (['48020', '20069', '01059', '20045', '48013', '48044', '01001'].includes(code)) {
      samples[code] = {
        name: rec.name,
        before: pre,
        after: {
          avg_price_sqm: rec.avg_price_sqm,
          price_source: rec.price_source,
          price_unit: rec.price_unit,
        },
      };
    }
  }

  fs.writeFileSync(MASTER_PATH, JSON.stringify(master, null, 2));
  console.log(`\n  Overwrote ${MASTER_PATH}`);
  console.log(`    muni-level (Tabla 5 hit): ${muniAssigned}`);
  console.log(`    provincial_fallback (Tabla 1): ${provAssigned}`);
  console.log(`    Total Basque munis processed: ${basque.length}`);

  console.log('\n--- Before / after spot-check:');
  for (const [code, s] of Object.entries(samples)) {
    console.log(
      `  ${code} ${s.name.padEnd(26)} ECVI €${String(s.before.avg_price_sqm).padStart(8)} (${s.before.price_source})` +
        `  →  MIVAU €${String(s.after.avg_price_sqm).padStart(8)} (${s.after.price_source})`,
    );
  }

  // price_source distribution after
  const cnt = {};
  for (const [code, rec] of basque) {
    cnt[rec.price_source] = (cnt[rec.price_source] || 0) + 1;
  }
  console.log(`\n  post-migration price_source distribution: ${JSON.stringify(cnt)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
