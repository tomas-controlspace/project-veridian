const XLSX = require('C:\\Users\\tomas\\Downloads\\node_modules\\xlsx');
const fs = require('fs');
const path = require('path');

const OUT_DIR = 'C:\\Users\\tomas\\Documents\\vscode\\projects\\maps-app_v2\\data\\es';
const EMAL_PATH = 'C:\\Users\\tomas\\Documents\\vscode\\projects\\maps-app_v2\\public\\data\\EMAL-2016-2025_es.xlsx';

const master = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'master_municipios.json'), 'utf-8'));
const emal = XLSX.readFile(EMAL_PATH);

// --- Parse T2.3: Annual residential rent €/m² by province + municipality size ---
console.log('=== RESIDENTIAL RENT (EMAL Viviendas) ===');
const t23 = XLSX.utils.sheet_to_json(emal.Sheets['T2.3'], { header: 1, defval: '' });

// Row 1: year headers: 2016, 2017, ..., 2024
const yearRow = t23[1];
let col2024 = -1;
for (let c = 2; c < yearRow.length; c++) {
  if (String(yearRow[c]).trim() === '2024') col2024 = c;
}
console.log(`Using column ${col2024} for 2024 data`);

// Provincial rents (2024)
const euskadi_rent = parseFloat(t23[4][col2024]) || null;
const alava_rent = parseFloat(t23[5][col2024]) || null;
const gipuzkoa_rent = parseFloat(t23[6][col2024]) || null;
const bizkaia_rent = parseFloat(t23[7][col2024]) || null;

console.log(`Provincial rent €/m²/month (2024 new contracts):`);
console.log(`  Euskadi: ${euskadi_rent}`);
console.log(`  Álava: ${alava_rent}`);
console.log(`  Gipuzkoa: ${gipuzkoa_rent}`);
console.log(`  Bizkaia: ${bizkaia_rent}`);

// Municipality size band rents (2024)
// Rows 8-14: by size band
const sizeBands = {};
for (let r = 8; r <= 14; r++) {
  const label = String(t23[r][1] || t23[r][0]).trim();
  const rent = parseFloat(t23[r][col2024]);
  if (!isNaN(rent)) {
    sizeBands[label] = rent;
    console.log(`  ${label}: ${rent}`);
  }
}

// Map size bands to population thresholds
// < 2,500 | 2,500-5,000 | 5,001-10,000 | 10,001-20,000 | 20,001-40,000 | 40,001-100,000 | > 100,000
const sizeKeys = Object.keys(sizeBands);
console.log(`\nSize bands found: ${JSON.stringify(sizeKeys)}`);

// Build rent lookup: province + population size → rent/m²
function getRent(prov, pop) {
  // For the 3 capitals, use >100,000 band or specific data
  // For others, match by size band within province
  // Since size band data is Euskadi-level (not per province), 
  // use province average as the primary, with size band as adjustment
  
  const provRent = { '01': alava_rent, '20': gipuzkoa_rent, '48': bizkaia_rent }[prov];
  if (!provRent) return null;
  
  // Size band adjustment (ratio to euskadi average)
  let sizeRent = euskadi_rent;
  if (pop < 2500) sizeRent = sizeBands[sizeKeys.find(k => k.includes('2.500'))] || euskadi_rent;
  else if (pop < 5000) sizeRent = sizeBands[sizeKeys.find(k => k.includes('2.500') && k.includes('5.000'))] || euskadi_rent;
  else if (pop < 10000) sizeRent = sizeBands[sizeKeys.find(k => k.includes('5.001') || k.includes('10.000'))] || euskadi_rent;
  else if (pop < 20000) sizeRent = sizeBands[sizeKeys.find(k => k.includes('10.001') || k.includes('20.000'))] || euskadi_rent;
  else if (pop < 40000) sizeRent = sizeBands[sizeKeys.find(k => k.includes('20.001') || k.includes('40.000'))] || euskadi_rent;
  else if (pop < 100000) sizeRent = sizeBands[sizeKeys.find(k => k.includes('40.001') || k.includes('100.000'))] || euskadi_rent;
  else sizeRent = sizeBands[sizeKeys.find(k => k.includes('100.000'))] || euskadi_rent;
  
  // Adjust: province base × (size factor / euskadi avg)
  const factor = sizeRent / euskadi_rent;
  return Math.round(provRent * factor * 10000) / 10000;
}

// Also parse A2.3 for current active contract rents (more current data)
console.log('\n--- Active contract rents (A2.3, as of June 2025) ---');
const a23 = XLSX.utils.sheet_to_json(emal.Sheets['A2.3'], { header: 1, defval: '' });
// Row 6: Euskadi total (col 2)
// Row 7: Álava (col 2), Row 8: Gipuzkoa, Row 9: Bizkaia
const a_euskadi = parseFloat(a23[6][2]) || null;
const a_alava = parseFloat(a23[7][2]) || null;
const a_gipuzkoa = parseFloat(a23[8][2]) || null;
const a_bizkaia = parseFloat(a23[9][2]) || null;

console.log(`  Euskadi: ${a_euskadi} | Álava: ${a_alava} | Gipuzkoa: ${a_gipuzkoa} | Bizkaia: ${a_bizkaia}`);

// --- Update master with residential rent ---
console.log('\n=== UPDATING MASTER ===');
let updated = 0;
for (const [code, mun] of Object.entries(master)) {
  const prov = code.substring(0, 2);
  const pop = mun.pop_2025 || 0;
  
  // Use size-adjusted provincial rent
  mun.avg_rent_sqm = getRent(prov, pop);
  
  // Also store the active contract rent (provincial, no size adjustment)
  const activeRents = { '01': a_alava, '20': a_gipuzkoa, '48': a_bizkaia };
  mun.avg_rent_sqm_active = activeRents[prov] ? Math.round(activeRents[prov] * 10000) / 10000 : null;
  
  if (mun.avg_rent_sqm) updated++;
}

fs.writeFileSync(path.join(OUT_DIR, 'master_municipios.json'), JSON.stringify(master, null, 2));
console.log(`Updated rent for ${updated} municipios`);

// Show samples
const samples = ['48020', '20069', '01059', '48044', '20045', '01001'];
for (const code of samples) {
  const m = master[code];
  if (!m) continue;
  console.log(`  ${m.name} (pop ${m.pop_2025?.toLocaleString()}): rent €${m.avg_rent_sqm}/m²/mo (new), €${m.avg_rent_sqm_active}/m²/mo (active)`);
}
