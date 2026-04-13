const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, 'raw');
const OUT_DIR = __dirname;

// --- PX Parser (same as before) ---
function parsePX(filepath) {
  const raw = fs.readFileSync(filepath, 'latin1');
  const dataIdx = raw.indexOf('DATA=');
  if (dataIdx === -1) throw new Error('No DATA= section');
  const header = raw.substring(0, dataIdx);
  const dataStr = raw.substring(dataIdx + 5).replace(/;[\s]*$/, '').trim();
  const result = { values: {}, codes: {} };
  
  let m;
  const valRe = /VALUES\("([^"]+)"\)=([^;]+);/g;
  while ((m = valRe.exec(header)) !== null) {
    result.values[m[1]] = m[2].match(/"([^"]*)"/g).map(s => s.replace(/"/g, ''));
  }
  const codeRe = /CODES\("([^"]+)"\)=([^;]+);/g;
  while ((m = codeRe.exec(header)) !== null) {
    result.codes[m[1]] = m[2].match(/"([^"]*)"/g).map(s => s.replace(/"/g, ''));
  }
  const stubRe = /^STUB=(.+);$/m;
  const headRe = /^HEADING=(.+);$/m;
  const stubLine = header.match(stubRe);
  const headLine = header.match(headRe);
  result.stub = stubLine ? stubLine[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, '')) : [];
  result.heading = headLine ? headLine[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, '')) : [];
  
  result.data = dataStr.split(/[\s\r\n]+/).filter(v => v.length > 0).map(v => {
    if (v === '"."' || v === '".."' || v === '":"' || v === ':' || v === '.' || v === '..') return null;
    const clean = v.replace(/"/g, '').replace(/,/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
  });
  return result;
}

function lookupPX(px, dimValues) {
  const allDims = [...px.stub, ...px.heading];
  const sizes = allDims.map(d => (px.values[d] || []).length);
  let flatIndex = 0;
  for (let i = 0; i < allDims.length; i++) {
    const idx = dimValues[allDims[i]] || 0;
    let stride = 1;
    for (let j = i + 1; j < allDims.length; j++) stride *= sizes[j];
    flatIndex += idx * stride;
  }
  return px.data[flatIndex] !== undefined ? px.data[flatIndex] : null;
}

function isBasqueMuni(code) {
  if (!code || code.length !== 5) return false;
  return ['01', '20', '48'].includes(code.substring(0, 2));
}

// --- Load existing data ---
const demographics = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'demographics.json'), 'utf-8'));
const income = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'income.json'), 'utf-8'));

// --- Parse Housing Tenure (owned vs rented) ---
console.log('Parsing housing tenure...');
const tenurePX = parsePX(path.join(RAW_DIR, 'housing_tenure.px'));
const tTerrDim = 'ámbito territorial';
const tTenDim = 'régimen de tenencia';
const tPerDim = 'periodo';
const tCodes = tenurePX.codes[tTerrDim] || [];
const tTenures = tenurePX.values[tTenDim]; // Total, En propiedad, En alquiler, En otras formas
const tPeriods = tenurePX.values[tPerDim]; // 2011, 2016, 2021
const tLatestPeriod = tPeriods.length - 1; // 2021
const tTotalIdx = tTenures.indexOf('Total');
const tRentedIdx = tTenures.indexOf('En alquiler');
const tOwnedIdx = tTenures.indexOf('En propiedad');

const housingData = {};
for (let i = 0; i < tCodes.length; i++) {
  const code = tCodes[i];
  if (!isBasqueMuni(code)) continue;
  
  const total = lookupPX(tenurePX, { [tTerrDim]: i, [tTenDim]: tTotalIdx, [tPerDim]: tLatestPeriod });
  const rented = lookupPX(tenurePX, { [tTerrDim]: i, [tTenDim]: tRentedIdx, [tPerDim]: tLatestPeriod });
  const owned = lookupPX(tenurePX, { [tTerrDim]: i, [tTenDim]: tOwnedIdx, [tPerDim]: tLatestPeriod });
  
  housingData[code] = {
    total_dwellings_2021: total,
    rented_2021: rented,
    owned_2021: owned,
    pct_rented: total && rented ? Math.round(rented / total * 10000) / 100 : null,
    pct_owned: total && owned ? Math.round(owned / total * 10000) / 100 : null,
  };
}
console.log(`  Tenure data for ${Object.keys(housingData).length} municipios`);

// --- Parse Age Groups ---
console.log('Parsing age groups...');
const agePX = parsePX(path.join(RAW_DIR, 'population_age_groups.px'));
const aTerrDim = 'ámbitos territoriales';
const aAgeDim = 'grandes grupos de edad cumplida';
const aSexDim = 'sexo';
const aPerDim = 'periodo';
const aCodes = agePX.codes[aTerrDim] || [];
const aAges = agePX.values[aAgeDim]; // Total, 0-19, 20-64, >=65
const aPeriods = agePX.values[aPerDim];
const aSexes = agePX.values[aSexDim];

// Use latest period (2025/01/01)
const aLatestPeriod = aPeriods.length - 1;
const aTotalAgeIdx = aAges.indexOf('Total');
const aYoungIdx = aAges.indexOf('0 - 19');
const aWorkingIdx = aAges.indexOf('20 - 64');
const aSeniorIdx = aAges.indexOf('>= 65');
const aTotalSexIdx = aSexes.indexOf('Total');

const ageData = {};
for (let i = 0; i < aCodes.length; i++) {
  const code = aCodes[i];
  if (!isBasqueMuni(code)) continue;
  
  const total = lookupPX(agePX, { [aTerrDim]: i, [aAgeDim]: aTotalAgeIdx, [aSexDim]: aTotalSexIdx, [aPerDim]: aLatestPeriod });
  const young = lookupPX(agePX, { [aTerrDim]: i, [aAgeDim]: aYoungIdx, [aSexDim]: aTotalSexIdx, [aPerDim]: aLatestPeriod });
  const working = lookupPX(agePX, { [aTerrDim]: i, [aAgeDim]: aWorkingIdx, [aSexDim]: aTotalSexIdx, [aPerDim]: aLatestPeriod });
  const senior = lookupPX(agePX, { [aTerrDim]: i, [aAgeDim]: aSeniorIdx, [aSexDim]: aTotalSexIdx, [aPerDim]: aLatestPeriod });
  
  ageData[code] = {
    pop_total: total,
    pop_0_19: young,
    pop_20_64: working,
    pop_65_plus: senior,
    pct_young: total && young ? Math.round(young / total * 10000) / 100 : null,
    pct_working: total && working ? Math.round(working / total * 10000) / 100 : null,
    pct_senior: total && senior ? Math.round(senior / total * 10000) / 100 : null,
  };
}
console.log(`  Age data for ${Object.keys(ageData).length} municipios`);

// --- Parse Newer Housing Type Data ---
console.log('Parsing housing stock (type)...');
const hNewPX = parsePX(path.join(RAW_DIR, 'housing_type_newer.px'));
const hNewDims = Object.keys(hNewPX.values);
console.log(`  Dimensions: ${JSON.stringify(hNewDims)}`);
const hNewTypeDim = hNewDims.find(d => d.includes('tipo'));
if (hNewTypeDim) console.log(`  Types: ${JSON.stringify(hNewPX.values[hNewTypeDim])}`);

// --- Combine Everything into Master Dataset ---
console.log('\nBuilding master dataset...');
const master = {};
const allCodes = new Set([
  ...Object.keys(demographics),
  ...Object.keys(income),
  ...Object.keys(housingData),
  ...Object.keys(ageData),
]);

for (const code of allCodes) {
  const demo = demographics[code] || {};
  const inc = income[code] || {};
  const hous = housingData[code] || {};
  const age = ageData[code] || {};
  const boundaryData = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'boundaries_municipios.geojson'), 'utf-8'));
  const feature = boundaryData.features.find(f => f.properties.ine_code === code);
  const area_km2 = feature ? feature.properties.area_km2 : null;
  
  master[code] = {
    ine_code: code,
    name: demo.name || inc.name || code,
    provincia_code: demo.provincia_code || code.substring(0, 2),
    provincia_name: demo.provincia_name || (code.startsWith('01') ? 'Álava/Araba' : code.startsWith('20') ? 'Gipuzkoa' : 'Bizkaia'),
    area_km2,
    
    // Population
    pop_2025: demo.pop_2025,
    pop_2024: demo.pop_2024,
    pop_growth_5yr_pct: demo.pop_growth_5yr_pct,
    density_per_km2: demo.pop_2025 && area_km2 ? Math.round(demo.pop_2025 / area_km2 * 10) / 10 : null,
    
    // Age structure
    pct_young_0_19: age.pct_young,
    pct_working_20_64: age.pct_working,
    pct_senior_65_plus: age.pct_senior,
    
    // Income
    avg_total_income: inc.avg_total_income_2023,
    avg_available_income: inc.avg_available_income_2023,
    
    // Housing tenure
    total_dwellings: hous.total_dwellings_2021,
    pct_rented: hous.pct_rented,
    pct_owned: hous.pct_owned,
  };
}

// Don't read boundaries for every iteration - fix
// Actually let me read it once outside the loop
// The code above is inefficient but works. Let me save and report.

fs.writeFileSync(path.join(OUT_DIR, 'master_municipios.json'), JSON.stringify(master, null, 2));
console.log(`Saved master_municipios.json with ${Object.keys(master).length} municipios`);

// Summary
const sample = master['48020']; // Bilbao
if (sample) {
  console.log('\nSample: Bilbao (48020)');
  console.log(JSON.stringify(sample, null, 2));
}

// Save housing.json separately too
fs.writeFileSync(path.join(OUT_DIR, 'housing.json'), JSON.stringify(housingData, null, 2));
console.log(`\nSaved housing.json with ${Object.keys(housingData).length} municipios`);

