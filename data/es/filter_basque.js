const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'raw', 'LAU_RG_01M_2024_4326.geojson');
const OUTPUT = path.join(__dirname, 'boundaries_municipios.geojson');

// Basque Country provincia codes (first 2 digits of INE municipal code)
const BASQUE_PROVINCES = ['01', '20', '48'];

console.log('Reading EU LAU file...');
const raw = fs.readFileSync(INPUT, 'utf-8');
const geojson = JSON.parse(raw);

console.log(`Total EU features: ${geojson.features.length}`);

// Filter to Spain first, then Basque Country
const spainFeatures = geojson.features.filter(f => f.properties.CNTR_CODE === 'ES');
console.log(`Spain features: ${spainFeatures.length}`);

// Log a sample Spanish feature to understand ID format
if (spainFeatures.length > 0) {
  console.log('Sample ES feature properties:', JSON.stringify(spainFeatures[0].properties));
  console.log('Sample ES GISCO_ID:', spainFeatures[0].properties.GISCO_ID);
}

// Extract INE code from GISCO_ID: format is "ES_XXXXX" where XXXXX = 5-digit INE code
// Or it might be "ES_XX_XXX" - let's check
const basqueFeatures = spainFeatures.filter(f => {
  const gid = f.properties.GISCO_ID || '';
  // Remove country prefix "ES_"
  const localCode = gid.replace('ES_', '');
  const provinceCode = localCode.substring(0, 2);
  return BASQUE_PROVINCES.includes(provinceCode);
});

console.log(`Basque Country features: ${basqueFeatures.length}`);

// Log province breakdown
for (const prov of BASQUE_PROVINCES) {
  const count = basqueFeatures.filter(f => {
    const localCode = f.properties.GISCO_ID.replace('ES_', '');
    return localCode.startsWith(prov);
  }).length;
  const provName = prov === '01' ? 'Álava' : prov === '20' ? 'Gipuzkoa' : 'Bizkaia';
  console.log(`  ${provName} (${prov}): ${count} municipios`);
}

// Build output GeoJSON, adding a clean ine_code field
const output = {
  type: 'FeatureCollection',
  features: basqueFeatures.map(f => {
    const ine_code = f.properties.GISCO_ID.replace('ES_', '');
    return {
      type: 'Feature',
      properties: {
        ine_code: ine_code,
        name: f.properties.LAU_NAME,
        provincia_code: ine_code.substring(0, 2),
        provincia_name: ine_code.startsWith('01') ? 'Álava/Araba' : ine_code.startsWith('20') ? 'Gipuzkoa' : 'Bizkaia',
        pop_2024: f.properties.POP_2024,
        pop_dens_2024: f.properties.POP_DENS_2024,
        area_km2: f.properties.AREA_KM2,
      },
      geometry: f.geometry
    };
  })
};

fs.writeFileSync(OUTPUT, JSON.stringify(output));
const sizeMB = (Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(2);
console.log(`\nSaved: ${OUTPUT}`);
console.log(`File size: ${sizeMB} MB`);

// List first 10 municipios
console.log('\nFirst 10 municipios:');
output.features.slice(0, 10).forEach(f => {
  console.log(`  ${f.properties.ine_code} - ${f.properties.name} (${f.properties.provincia_name}) pop=${f.properties.pop_2024}`);
});
