const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, 'raw');
const OUT_DIR = __dirname;

// --- PX Parser ---
function parsePX(filepath) {
  const raw = fs.readFileSync(filepath, 'latin1');
  const dataIdx = raw.indexOf('DATA=');
  if (dataIdx === -1) throw new Error('No DATA= section');
  const header = raw.substring(0, dataIdx);
  const dataStr = raw.substring(dataIdx + 5).replace(/;[\s]*$/, '').trim();
  const result = { values: {}, codes: {} };
  let m;
  const valRe = /VALUES\("([^"]+)"\)=([^;]+);/g;
  while ((m = valRe.exec(header)) !== null) result.values[m[1]] = m[2].match(/"([^"]*)"/g).map(s => s.replace(/"/g, ''));
  const codeRe = /CODES\("([^"]+)"\)=([^;]+);/g;
  while ((m = codeRe.exec(header)) !== null) result.codes[m[1]] = m[2].match(/"([^"]*)"/g).map(s => s.replace(/"/g, ''));
  const stubLine = header.match(/^STUB=(.+);$/m);
  const headLine = header.match(/^HEADING=(.+);$/m);
  result.stub = stubLine ? stubLine[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, '')) : [];
  result.heading = headLine ? headLine[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, '')) : [];
  result.data = dataStr.split(/[\s\r\n]+/).filter(v => v.length > 0).map(v => {
    if (v === '"."' || v === '".."' || v === '":"' || v === ':' || v === '.' || v === '..') return null;
    const n = parseFloat(v.replace(/"/g, '').replace(/,/g, ''));
    return isNaN(n) ? null : n;
  });
  return result;
}

function lookupPX(px, dimValues) {
  const allDims = [...px.stub, ...px.heading];
  const sizes = allDims.map(d => (px.values[d] || []).length);
  let idx = 0;
  for (let i = 0; i < allDims.length; i++) {
    let stride = 1;
    for (let j = i + 1; j < allDims.length; j++) stride *= sizes[j];
    idx += (dimValues[allDims[i]] || 0) * stride;
  }
  return px.data[idx] !== undefined ? px.data[idx] : null;
}

function isBasque(code) {
  return code && code.length === 5 && ['01','20','48'].includes(code.substring(0,2));
}

// --- 1. Parse building size (apartment vs house proxy) ---
console.log('=== Apartments vs Houses (building size proxy) ===');
const bsPX = parsePX(path.join(RAW_DIR, 'housing_building_size.px'));
const bsTerrDim = Object.keys(bsPX.values).find(k => k.includes('mbitos'));
const bsSizeDim = Object.keys(bsPX.values).find(k => k.includes('mero'));
const bsPerDim = Object.keys(bsPX.values).find(k => k.includes('periodo'));
const bsSizes = bsPX.values[bsSizeDim];
const bsPeriods = bsPX.values[bsPerDim];
const bsCodes = bsPX.codes[bsTerrDim];
const bsLatest = bsPeriods.length - 1;

console.log(`Building size categories: ${JSON.stringify(bsSizes)}`);
console.log(`Latest period: ${bsPeriods[bsLatest]}`);

// "1" and "2" = house-like, "3-10" to ">100" = apartment-like
const totalIdx = bsSizes.indexOf('Total');
const noConstaIdx = bsSizes.indexOf('No consta');
const house1 = bsSizes.indexOf('1');
const house2 = bsSizes.indexOf('2');

const aptData = {};
for (let i = 0; i < bsCodes.length; i++) {
  const code = bsCodes[i];
  if (!isBasque(code)) continue;
  
  const total = lookupPX(bsPX, {[bsTerrDim]: i, [bsSizeDim]: totalIdx, [bsPerDim]: bsLatest});
  const nc = lookupPX(bsPX, {[bsTerrDim]: i, [bsSizeDim]: noConstaIdx, [bsPerDim]: bsLatest});
  const h1 = lookupPX(bsPX, {[bsTerrDim]: i, [bsSizeDim]: house1, [bsPerDim]: bsLatest});
  const h2 = lookupPX(bsPX, {[bsTerrDim]: i, [bsSizeDim]: house2, [bsPerDim]: bsLatest});
  
  const known = (total || 0) - (nc || 0);
  const houses = (h1 || 0) + (h2 || 0);
  const apartments = known - houses;
  
  aptData[code] = {
    total_family_dwellings: total,
    dwellings_in_houses: houses,
    dwellings_in_apartments: apartments,
    pct_apartment: known > 0 ? Math.round(apartments / known * 10000) / 100 : null,
    pct_house: known > 0 ? Math.round(houses / known * 10000) / 100 : null,
  };
}
console.log(`Apartment data for ${Object.keys(aptData).length} municipios`);

// --- 2. Parse structural characteristics (avg surface area) ---
console.log('\n=== Average Housing Size (surface area) ===');
const stPX = parsePX(path.join(RAW_DIR, 'housing_structural.px'));
const stTerrDim = Object.keys(stPX.values).find(k => k.includes('mbitos'));
const stCharDim = Object.keys(stPX.values).find(k => k.includes('aracter'));
const stPerDim = Object.keys(stPX.values).find(k => k.includes('periodo'));
const stChars = stPX.values[stCharDim];
const stPeriods = stPX.values[stPerDim];
const stCodes = stPX.codes[stTerrDim];
const stLatest = stPeriods.length - 1;

const surfIdx = stChars.indexOf('Superficie útil media');
console.log(`Surface area index: ${surfIdx} (${stChars[surfIdx]})`);
console.log(`Latest period: ${stPeriods[stLatest]}`);

const sizeData = {};
for (let i = 0; i < stCodes.length; i++) {
  const code = stCodes[i];
  if (!isBasque(code)) continue;
  
  const surfArea = lookupPX(stPX, {[stTerrDim]: i, [stCharDim]: surfIdx, [stPerDim]: stLatest});
  
  sizeData[code] = {
    avg_surface_m2: surfArea,
  };
}
console.log(`Surface area data for ${Object.keys(sizeData).length} municipios`);

// --- 3. Merge into master ---
console.log('\n=== Updating master dataset ===');
const master = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'master_municipios.json'), 'utf-8'));

let updated = 0;
for (const [code, mun] of Object.entries(master)) {
  const apt = aptData[code];
  const size = sizeData[code];
  
  if (apt) {
    mun.pct_apartment = apt.pct_apartment;
    mun.pct_house = apt.pct_house;
    mun.total_family_dwellings = apt.total_family_dwellings;
  }
  if (size) {
    mun.avg_surface_m2 = size.avg_surface_m2;
  }
  
  // Placeholders for missing data (to be sourced later)
  mun.avg_price_sqm = null;
  mun.avg_rent_sqm = null;
  mun.housing_turnover = null;
  mun.nla_sqm = null;
  mun.nla_per_capita = null;
  
  updated++;
}

fs.writeFileSync(path.join(OUT_DIR, 'master_municipios.json'), JSON.stringify(master, null, 2));
console.log(`Updated ${updated} municipios in master_municipios.json`);

// Show sample
const bilbao = master['48020'];
if (bilbao) {
  console.log('\nSample: Bilbao');
  console.log(`  Pop: ${bilbao.pop_2025} | Density: ${bilbao.density_per_km2}/km²`);
  console.log(`  Growth 5yr: ${bilbao.pop_growth_5yr_pct}%`);
  console.log(`  Apartment: ${bilbao.pct_apartment}% | House: ${bilbao.pct_house}%`);
  console.log(`  Avg surface: ${bilbao.avg_surface_m2} m²`);
  console.log(`  Rented: ${bilbao.pct_rented}% | Owned: ${bilbao.pct_owned}%`);
  console.log(`  Avg income: €${bilbao.avg_total_income}`);
  console.log(`  Senior: ${bilbao.pct_senior_65_plus}% | Working: ${bilbao.pct_working_20_64}%`);
}

const ss = master['20069'];
if (ss) {
  console.log('\nSample: Donostia/San Sebastián');
  console.log(`  Pop: ${ss.pop_2025} | Density: ${ss.density_per_km2}/km²`);
  console.log(`  Apartment: ${ss.pct_apartment}% | Avg surface: ${ss.avg_surface_m2} m²`);
  console.log(`  Rented: ${ss.pct_rented}% | Avg income: €${ss.avg_total_income}`);
}

const vg = master['01059'];
if (vg) {
  console.log('\nSample: Vitoria-Gasteiz');
  console.log(`  Pop: ${vg.pop_2025} | Density: ${vg.density_per_km2}/km²`);
  console.log(`  Apartment: ${vg.pct_apartment}% | Avg surface: ${vg.avg_surface_m2} m²`);
  console.log(`  Rented: ${vg.pct_rented}% | Avg income: €${vg.avg_total_income}`);
}
