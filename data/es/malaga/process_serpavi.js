#!/usr/bin/env node
/**
 * Phase 2e: Process MIVAU SERPAVI rent data → Málaga `avg_rent_sqm_active`.
 *
 * Source: MIVAU "Sistema Estatal de Referencia del Precio del Alquiler
 * de Vivienda", 2011-2024 panel (fiscal/IRPF-derived active-contract
 * stock rents, €/m²/month).
 *   https://cdn.mivau.gob.es/portal-web-mivau/vivienda/serpavi/2026-03-09_bd_SERPAVI_2011-2024%20-%20DEFINITIVO%20WEB.xlsx
 *
 * Mapping: Málaga's value is stored into `avg_rent_sqm_active` (matches
 * Euskadi's EMAL A2.3 concept — active-contract stock, not new
 * contracts). See Methodology decisions §2.
 *
 * Per-muni rule:
 *   primary   : ALQM2_LV_M_VC_24  (median €/m²/mes, viviendas colectivas / apartments, 2024)
 *   fallback  : ALQM2_LV_M_VU_24  (single-family) if VC missing/suppressed
 *   rent_source field records which was used
 *
 * Input:
 *   - Full nationwide xlsx cached in scratch (not committed, 67.9 MB)
 *   - Málaga-only filtered subset in raw/ (committed, ~50 KB JSON)
 *   Script downloads full xlsx if not cached, then writes the filtered
 *   subset.
 *
 * Output:
 *   raw/mivau_serpavi_2024_malaga.json — filtered Málaga rows
 *     (Municipios sheet rows for CPRO=29 + the Málaga provincial row)
 *   rent_malaga.json — processed per-muni record for all 103 munis
 */

const https = require('https');
const XLSX = require('C:/Users/tomas/Downloads/node_modules/xlsx');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT_DIR = __dirname;
const RAW_DIR = path.join(OUT_DIR, 'raw');
const PROV_CODE = '29';
const YEAR = '24';
const SERPAVI_URL =
  'https://cdn.mivau.gob.es/portal-web-mivau/vivienda/serpavi/2026-03-09_bd_SERPAVI_2011-2024%20-%20DEFINITIVO%20WEB.xlsx';
const SCRATCH = path.join(process.env.TEMP || os.tmpdir(), 'ine_scratch');
const FULL_XLSX = path.join(SCRATCH, 'mivau_serpavi_2011_2024.xlsx');
const MALAGA_JSON = path.join(RAW_DIR, 'mivau_serpavi_2024_malaga.json');

function fetchBinary(url) {
  return new Promise((res, rej) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          return fetchBinary(r.headers.location).then(res, rej);
        }
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => res(Buffer.concat(chunks)));
      })
      .on('error', rej);
  });
}

async function ensureFullXlsx() {
  if (!fs.existsSync(SCRATCH)) fs.mkdirSync(SCRATCH, { recursive: true });
  if (fs.existsSync(FULL_XLSX) && fs.statSync(FULL_XLSX).size > 50_000_000) {
    console.log(`Using cached full xlsx: ${FULL_XLSX}`);
    return;
  }
  console.log('Downloading full SERPAVI xlsx from MIVAU...');
  const buf = await fetchBinary(SERPAVI_URL);
  fs.writeFileSync(FULL_XLSX, buf);
  console.log(`  Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB → ${FULL_XLSX}`);
}

async function main() {
  if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });
  await ensureFullXlsx();

  const wb = XLSX.readFile(FULL_XLSX);
  const muniAll = XLSX.utils.sheet_to_json(wb.Sheets.Municipios, { header: 1, defval: '' });
  const provAll = XLSX.utils.sheet_to_json(wb.Sheets.Provincias, { header: 1, defval: '' });
  const hdr = muniAll[0];

  // Save Málaga-only subset to raw/ as JSON (compact, auditable)
  const malagaRows = muniAll.slice(1).filter((r) => String(r[2]).startsWith(PROV_CODE));
  const provRowMalaga = provAll.slice(1).find(
    (r) => String(r[0]) === PROV_CODE || r[0] === +PROV_CODE,
  );
  fs.writeFileSync(
    MALAGA_JSON,
    JSON.stringify(
      {
        source_url: SERPAVI_URL,
        downloaded: new Date().toISOString().split('T')[0],
        municipios_header: hdr,
        provincias_header: provAll[0],
        provincia_malaga_row: provRowMalaga,
        municipios_malaga_rows: malagaRows,
      },
      null,
      2,
    ),
  );
  console.log(`Saved Málaga-only subset → ${MALAGA_JSON} (${malagaRows.length} munis)`);

  const muni = [hdr, ...malagaRows];
  const prov = [provAll[0], provRowMalaga];

  // Column indices for 2024 target fields
  const col = (name) => {
    const i = hdr.indexOf(name);
    if (i < 0) throw new Error(`Column not found: ${name}`);
    return i;
  };
  const medVC = col(`ALQM2_LV_M_VC_${YEAR}`); // median €/m²/mes apartments
  const medVU = col(`ALQM2_LV_M_VU_${YEAR}`); // median €/m²/mes single-family
  const nVC = col(`BI_ALVHEPCO_TVC_${YEAR}`); // # apartment tax records
  const nVU = col(`BI_ALVHEPCO_TVU_${YEAR}`); // # single-family tax records
  const p25VC = col(`ALQM2_LV_25_VC_${YEAR}`);
  const p75VC = col(`ALQM2_LV_75_VC_${YEAR}`);

  // Provincial fallback (Málaga row)
  const provHdr = prov[0];
  const provMedVC = provHdr.indexOf(`ALQM2_LV_M_VC_${YEAR}`);
  const provRow = prov.slice(1).find((r) => String(r[0]) === PROV_CODE || r[0] === +PROV_CODE);
  const provAvgRent =
    provRow && provRow[provMedVC] !== '' ? parseFloat(provRow[provMedVC]) : null;
  console.log(
    `Málaga province fallback (median €/m² apt, 2024): ${provAvgRent ? provAvgRent.toFixed(2) : 'none'}`,
  );

  const malaga = muni.slice(1).filter((r) => String(r[2]).startsWith(PROV_CODE));
  console.log(`Málaga munis in SERPAVI: ${malaga.length}`);

  const rent = {};
  let withVC = 0,
    withVU = 0,
    usedFallback = 0,
    none = 0;
  for (const r of malaga) {
    const code = String(r[2]);
    const name = r[3];
    const vc = r[medVC];
    const vu = r[medVU];
    const nVCVal = r[nVC];
    const nVUVal = r[nVU];

    let avg_rent_sqm_active = null;
    let rent_source = 'none';
    let rent_sample_n = null;

    const vcNum = typeof vc === 'number' ? vc : vc ? parseFloat(vc) : null;
    const vuNum = typeof vu === 'number' ? vu : vu ? parseFloat(vu) : null;

    if (vcNum && vcNum > 0) {
      avg_rent_sqm_active = Math.round(vcNum * 100) / 100;
      rent_source = 'serpavi_muni_apt';
      rent_sample_n = typeof nVCVal === 'number' ? nVCVal : null;
      withVC++;
    } else if (vuNum && vuNum > 0) {
      avg_rent_sqm_active = Math.round(vuNum * 100) / 100;
      rent_source = 'serpavi_muni_singlefam';
      rent_sample_n = typeof nVUVal === 'number' ? nVUVal : null;
      withVU++;
    } else {
      // Statistical suppression — fall back to provincial median
      if (provAvgRent) {
        avg_rent_sqm_active = Math.round(provAvgRent * 100) / 100;
        rent_source = 'serpavi_prov_fallback';
        usedFallback++;
      } else {
        none++;
      }
    }

    rent[code] = {
      ine_code: code,
      name,
      avg_rent_sqm_active,
      avg_rent_sqm: null, // Málaga has no muni-level new-contract source
      rent_source,
      rent_year: 2024,
      rent_sample_n,
      rent_p25_apt:
        typeof r[p25VC] === 'number' ? Math.round(r[p25VC] * 100) / 100 : null,
      rent_p75_apt:
        typeof r[p75VC] === 'number' ? Math.round(r[p75VC] * 100) / 100 : null,
    };
  }

  console.log(
    `\nCoverage: ${withVC} muni-apt, ${withVU} muni-singlefam-fallback, ${usedFallback} provincial-fallback, ${none} no-data`,
  );

  fs.writeFileSync(path.join(OUT_DIR, 'rent_malaga.json'), JSON.stringify(rent, null, 2));
  console.log(`\nSaved rent_malaga.json (${Object.keys(rent).length} munis)`);

  // Spot-checks
  ['29067', '29069', '29070', '29094', '29001', '29051', '29904'].forEach((c) => {
    const r = rent[c];
    if (!r) return;
    console.log(
      `  ${c} ${(r.name || '').padEnd(22)} €${r.avg_rent_sqm_active}/m² (${r.rent_source}, n=${r.rent_sample_n})`,
    );
  });

  // Min/max from muni-level only
  const muniLevel = Object.values(rent).filter((r) =>
    r.rent_source.startsWith('serpavi_muni'),
  );
  muniLevel.sort((a, b) => a.avg_rent_sqm_active - b.avg_rent_sqm_active);
  console.log(
    `\nMuni-level lowest: ${muniLevel[0].name} €${muniLevel[0].avg_rent_sqm_active}/m² (${muniLevel[0].rent_source})`,
  );
  console.log(
    `Muni-level highest: ${muniLevel[muniLevel.length - 1].name} €${muniLevel[muniLevel.length - 1].avg_rent_sqm_active}/m²`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
