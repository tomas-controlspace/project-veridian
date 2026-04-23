#!/usr/bin/env node
/**
 * Phase 3: Assemble master_municipios_malaga.json from Phase 2 outputs.
 *
 * Mirrors the schema of data/es/master_municipios.json (the Euskadi
 * master), with three new fields introduced by the 2026-04-23
 * methodology decisions:
 *   - housing_source   ("muni_microdata" | "provincial_bin_{band}")
 *   - price_unit       ("eur_per_sqm_constructed")
 *   - rent_source      ("serpavi_muni_apt" | "serpavi_muni_singlefam" | "serpavi_prov_fallback")
 *
 * Input files (all in this folder):
 *   demographics_malaga.json           (Phase 2a)
 *   boundaries_municipios_malaga.geojson (Phase 2b)
 *   housing_malaga.json                (Phase 2c — 19 munis >10k + 3 size bins)
 *   income_malaga.json                 (Phase 2d)
 *   rent_malaga.json                   (Phase 2e)
 *   prices_malaga.json                 (Phase 2f)
 *   turnover_malaga.json               (Phase 2h)
 *
 * Output: master_municipios_malaga.json (103 munis)
 *
 * NLA fields (nla_sqm, nla_per_capita) are left null — per session
 * scope, they're a separate manual pass.
 *
 * Euskadi-parity fields kept but null for Málaga:
 *   avg_rent_sqm       (no muni-level new-contract source identified)
 *
 * Euskadi-parity fields derived for Málaga:
 *   density_per_km2        = pop_2025 / area_km2
 *   housing_turnover_annual_prov = sum of all Málaga munis in the
 *     latest available year (provincial estimate, same number applied
 *     to every muni in the province — matches Euskadi's convention)
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const PROV_CODE = '29';
const PROV_NAME = 'Málaga';

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(OUT_DIR, name), 'utf-8'));
}

function main() {
  const demographics = load('demographics_malaga.json');
  const boundaries = load('boundaries_municipios_malaga.geojson');
  const housing = load('housing_malaga.json');
  const income = load('income_malaga.json');
  const rent = load('rent_malaga.json');
  const prices = load('prices_malaga.json');
  const turnover = load('turnover_malaga.json');

  // Build area_km2 lookup from boundaries
  const areaByCode = {};
  for (const f of boundaries.features) {
    areaByCode[f.properties.ine_code] = f.properties.area_km2;
  }

  // Housing: which munis have muni-level vs must fallback to size bin?
  // Bin thresholds come from INE Censo 2021 microdata recoding rule:
  //   991 ≤ 2,000 hab | 992 2,001–5,000 | 993 5,001–10,000
  // INE's recoding was based on 2021 population; munis that crossed the
  // 10k threshold between 2021 and 2025 can't be in the microdata and
  // also can't be explicitly binned. Cap such cases into the 5k-10k bin
  // (the closest the microdata offers).
  function pickHousingBin(pop) {
    if (pop == null) return { key: '29_bin991', band: 'le2k' };
    if (pop <= 2000) return { key: '29_bin991', band: 'le2k' };
    if (pop <= 5000) return { key: '29_bin992', band: '2k_5k' };
    return { key: '29_bin993', band: '5k_10k' };
  }

  // Provincial turnover annual estimate = sum of all Málaga muni turnover (latest year)
  const provAnnualTurnover = Object.values(turnover).reduce(
    (s, t) => s + (t.housing_turnover || 0),
    0,
  );
  console.log(`housing_turnover_annual_prov (sum of 103 munis, latest yr): ${provAnnualTurnover}`);

  const master = {};
  let withMuniHousing = 0,
    withBinHousing = 0;
  const missingAnyField = {};

  for (const [code, demo] of Object.entries(demographics)) {
    const area = areaByCode[code] || null;
    const density =
      demo.pop_2025 && area ? Math.round((demo.pop_2025 / area) * 10) / 10 : null;

    // Housing pick
    let housingRec = null,
      housingSource = null;
    if (housing[code]) {
      housingRec = housing[code];
      housingSource = 'muni_microdata';
      withMuniHousing++;
    } else {
      const bin = pickHousingBin(demo.pop_2025);
      if (bin && housing[bin.key]) {
        housingRec = housing[bin.key];
        housingSource = `provincial_bin_${bin.band}`;
        withBinHousing++;
      } else {
        housingSource = 'unavailable';
      }
    }

    const incomeRec = income[code] || {};
    const rentRec = rent[code] || {};
    const priceRec = prices[code] || {};
    const turnoverRec = turnover[code] || {};

    master[code] = {
      ine_code: code,
      name: demo.name,
      provincia_code: PROV_CODE,
      provincia_name: PROV_NAME,
      area_km2: area,

      // Population
      pop_2025: demo.pop_2025 ?? null,
      pop_2024: demo.pop_2024 ?? null,
      pop_growth_5yr_pct: demo.pop_growth_5yr_pct ?? null,
      density_per_km2: density,

      // Age
      pct_young_0_19: demo.pct_young_0_19 ?? null,
      pct_working_20_64: demo.pct_working_20_64 ?? null,
      pct_senior_65_plus: demo.pct_senior_65_plus ?? null,

      // Income (2023)
      avg_total_income: incomeRec.avg_total_income ?? null,
      avg_available_income: incomeRec.avg_available_income ?? null,

      // Housing (2021, Censo microdata)
      total_dwellings: housingRec?.total_dwellings_2021 ?? null,
      pct_rented: housingRec?.pct_rented ?? null,
      pct_owned: housingRec?.pct_owned ?? null,
      pct_apartment: housingRec?.pct_apartment ?? null,
      pct_house: housingRec?.pct_house ?? null,
      total_family_dwellings: housingRec?.total_dwellings_2021 ?? null,
      avg_surface_m2: housingRec?.avg_surface_m2 ?? null,
      housing_source: housingSource,

      // Price (Q4 2025, MIVAU Valor Tasado €/m² constructed)
      avg_price_sqm: priceRec.avg_price_sqm ?? null,
      price_source: priceRec.price_source ?? null,
      price_unit: 'eur_per_sqm_constructed',

      // Rent (2024, SERPAVI active contracts, median €/m²/mes)
      avg_rent_sqm: null, // no nationwide muni-level new-contract source
      avg_rent_sqm_active: rentRec.avg_rent_sqm_active ?? null,
      rent_source: rentRec.rent_source ?? null,

      // Housing turnover (annual, latest year available)
      housing_turnover: turnoverRec.housing_turnover ?? null,
      housing_turnover_year: turnoverRec.housing_turnover_year ?? null,
      housing_turnover_annual_prov: provAnnualTurnover,

      // NLA — manual pass pending
      nla_sqm: null,
      nla_per_capita: null,
    };

    // Track missing
    for (const [k, v] of Object.entries(master[code])) {
      if (v == null && !['nla_sqm', 'nla_per_capita', 'avg_rent_sqm'].includes(k)) {
        if (!missingAnyField[k]) missingAnyField[k] = 0;
        missingAnyField[k]++;
      }
    }
  }

  // QA summary
  console.log('\n=== QA ===');
  console.log(`Total munis: ${Object.keys(master).length} (expected 103)`);
  console.log(`Housing source breakdown:`);
  console.log(`  muni_microdata: ${withMuniHousing}`);
  console.log(`  provincial_bin_*: ${withBinHousing}`);
  if (Object.keys(missingAnyField).length) {
    console.log(`\nFields with NULL values (excluding expected nulls):`);
    for (const [k, n] of Object.entries(missingAnyField).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k}: ${n} munis`);
    }
  }

  // Totals
  const totalPop = Object.values(master).reduce((s, m) => s + (m.pop_2025 || 0), 0);
  const totalArea = Object.values(master).reduce((s, m) => s + (m.area_km2 || 0), 0);
  console.log(`\nProvince totals: pop ${totalPop.toLocaleString()}, area ${totalArea.toFixed(1)} km²`);

  const outPath = path.join(OUT_DIR, 'master_municipios_malaga.json');
  fs.writeFileSync(outPath, JSON.stringify(master, null, 2));
  console.log(`\nSaved ${outPath}`);

  // Spot-check
  console.log('\n=== Málaga city (29067) ===');
  console.log(JSON.stringify(master['29067'], null, 2));
  console.log('\n=== Yunquera (29100, small rural) ===');
  console.log(JSON.stringify(master['29100'], null, 2));
}

main();
