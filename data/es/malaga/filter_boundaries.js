#!/usr/bin/env node
/**
 * Phase 2b: Filter Eurostat GISCO LAU 2024 (EPSG:4326) to Málaga
 * municipios. Mirrors ../filter_basque.js but for province 29.
 *
 * Input  : ../raw/LAU_RG_01M_2024_4326.geojson  (143 MB, nationwide + EU)
 * Output : ./boundaries_municipios_malaga.geojson
 *
 * Source (documented by ../filter_basque.js): Eurostat GISCO, LAU 2024
 * https://ec.europa.eu/eurostat/web/gisco/geodata/statistical-units/local-administrative-units
 * GISCO_ID format for Spain: "ES_{5-digit INE code}".
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', 'raw', 'LAU_RG_01M_2024_4326.geojson');
const OUTPUT = path.join(__dirname, 'boundaries_municipios_malaga.geojson');
const PROV_CODE = '29';

console.log('Reading Eurostat GISCO LAU 2024 (EPSG:4326)...');
const raw = fs.readFileSync(INPUT, 'utf-8');
const gj = JSON.parse(raw);
console.log(`Total EU features: ${gj.features.length}`);

// Filter Spain
const spain = gj.features.filter((f) => f.properties.CNTR_CODE === 'ES');
console.log(`Spain features: ${spain.length}`);

// Filter Málaga (GISCO_ID = "ES_29xxx")
const malaga = spain.filter((f) => {
  const gid = f.properties.GISCO_ID || '';
  const local = gid.replace('ES_', '');
  return local.startsWith(PROV_CODE) && local.length === 5;
});
console.log(`Málaga features: ${malaga.length}`);

if (malaga.length !== 103) {
  console.warn(
    `⚠ Expected 103 Málaga municipios, got ${malaga.length}. Check filter / source file.`,
  );
}

const out = {
  type: 'FeatureCollection',
  features: malaga.map((f) => {
    const ine_code = f.properties.GISCO_ID.replace('ES_', '');
    return {
      type: 'Feature',
      properties: {
        ine_code,
        name: f.properties.LAU_NAME,
        provincia_code: PROV_CODE,
        provincia_name: 'Málaga',
        pop_2024: f.properties.POP_2024,
        pop_dens_2024: f.properties.POP_DENS_2024,
        area_km2: f.properties.AREA_KM2,
      },
      geometry: f.geometry,
    };
  }),
};

fs.writeFileSync(OUTPUT, JSON.stringify(out));
const sizeMB = (Buffer.byteLength(JSON.stringify(out)) / 1024 / 1024).toFixed(2);
console.log(`\nSaved: ${OUTPUT} (${sizeMB} MB)`);

// QA: verify INE codes and totals
const codes = out.features.map((f) => f.properties.ine_code).sort();
console.log(`INE codes: first=${codes[0]}, last=${codes[codes.length - 1]}`);
const totalPop = out.features.reduce((s, f) => s + (f.properties.pop_2024 || 0), 0);
const totalArea = out.features.reduce((s, f) => s + (f.properties.area_km2 || 0), 0);
console.log(`GISCO totals (2024): pop=${totalPop.toLocaleString()}, area=${totalArea.toFixed(1)} km²`);
console.log('\nFirst 5:');
out.features.slice(0, 5).forEach((f) => {
  console.log(
    `  ${f.properties.ine_code} ${f.properties.name} — pop ${f.properties.pop_2024} — ${(f.properties.area_km2 || 0).toFixed(2)} km²`,
  );
});
