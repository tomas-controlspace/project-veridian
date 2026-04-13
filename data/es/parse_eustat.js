const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, 'raw');
const OUT_DIR = __dirname;

// --- PX-Axis Parser ---
function parsePX(filepath) {
  const raw = fs.readFileSync(filepath, 'latin1');
  
  // Split into header and data sections
  const dataIdx = raw.indexOf('DATA=');
  if (dataIdx === -1) throw new Error('No DATA= section found');
  
  const header = raw.substring(0, dataIdx);
  const dataStr = raw.substring(dataIdx + 5).replace(/;[\s]*$/, '').trim();
  
  // Parse header fields
  const result = { values: {}, codes: {} };
  
  // Extract VALUES("dim")="v1","v2",...; (Spanish only, skip [eu] and [en])
  const valRe = /VALUES\("([^"]+)"\)=([^;]+);/g;
  let m;
  while ((m = valRe.exec(header)) !== null) {
    const dim = m[1];
    const vals = m[2].match(/"([^"]*)"/g).map(s => s.replace(/"/g, ''));
    result.values[dim] = vals;
  }
  
  // Extract CODES("dim")="c1","c2",...;
  const codeRe = /CODES\("([^"]+)"\)=([^;]+);/g;
  while ((m = codeRe.exec(header)) !== null) {
    const dim = m[1];
    const vals = m[2].match(/"([^"]*)"/g).map(s => s.replace(/"/g, ''));
    result.codes[dim] = vals;
  }
  
  // Extract STUB and HEADING
  const stubMatch = header.match(/STUB="([^"]+)"(?:,"([^"]+)")*;/);
  const headMatch = header.match(/HEADING="([^"]+)"(?:,"([^"]+)")*;/);
  
  // Better extraction for STUB
  const stubRe = /^STUB=(.+);$/m;
  const headRe = /^HEADING=(.+);$/m;
  const stubLine = header.match(stubRe);
  const headLine = header.match(headRe);
  
  result.stub = stubLine ? stubLine[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, '')) : [];
  result.heading = headLine ? headLine[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, '')) : [];
  
  // Parse data values
  const dataValues = dataStr.split(/[\s\r\n]+/).filter(v => v.length > 0).map(v => {
    if (v === '"."' || v === '".."' || v === '":"' || v === ':' || v === '.' || v === '..') return null;
    const clean = v.replace(/"/g, '').replace(/,/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
  });
  
  result.data = dataValues;
  return result;
}

function lookupPX(px, dimValues) {
  // dimValues = { dimName: valueIndex, ... } for all STUB + HEADING dims
  const allDims = [...px.stub, ...px.heading];
  const sizes = allDims.map(d => (px.values[d] || []).length);
  
  let flatIndex = 0;
  for (let i = 0; i < allDims.length; i++) {
    const dim = allDims[i];
    const idx = dimValues[dim] || 0;
    let stride = 1;
    for (let j = i + 1; j < allDims.length; j++) {
      stride *= sizes[j];
    }
    flatIndex += idx * stride;
  }
  
  return px.data[flatIndex] !== undefined ? px.data[flatIndex] : null;
}

// --- Parse Income Data ---
console.log('Parsing income data...');
const incomePX = parsePX(path.join(RAW_DIR, 'income_personal_mean.px'));
const terrDim = 'ámbitos territoriales';
const incomeDim = 'tipo de renta';
const sexDim = 'sexo';
const periodDim = 'periodo';

const terrCodes = incomePX.codes[terrDim] || [];
const terrNames = incomePX.values[terrDim] || [];
const periods = incomePX.values[periodDim] || [];
const incomeTypes = incomePX.values[incomeDim] || [];

// Find indices for "Renta total" and "Total" sex and latest year
const totalIncomeIdx = incomeTypes.indexOf('Renta total');
const availIncomeIdx = incomeTypes.indexOf('Renta disponible');
const totalSexIdx = 0; // "Total" is first
const latestYearIdx = periods.length - 1; // 2023

const incomeData = {};
for (let i = 0; i < terrCodes.length; i++) {
  const code = terrCodes[i];
  // Only municipalities (5-digit codes starting with 01, 20, 48)
  if (code.length !== 5) continue;
  const prov = code.substring(0, 2);
  if (!['01', '20', '48'].includes(prov)) continue;
  
  const totalIncome = lookupPX(incomePX, {
    [terrDim]: i, [incomeDim]: totalIncomeIdx, [sexDim]: totalSexIdx, [periodDim]: latestYearIdx
  });
  
  const availIncome = lookupPX(incomePX, {
    [terrDim]: i, [incomeDim]: availIncomeIdx, [sexDim]: totalSexIdx, [periodDim]: latestYearIdx
  });
  
  // Also get previous year for comparison
  const prevYearIdx = latestYearIdx - 1;
  const prevIncome = lookupPX(incomePX, {
    [terrDim]: i, [incomeDim]: totalIncomeIdx, [sexDim]: totalSexIdx, [periodDim]: prevYearIdx
  });
  
  incomeData[code] = {
    ine_code: code,
    name: terrNames[i],
    avg_total_income_2023: totalIncome,
    avg_available_income_2023: availIncome,
    avg_total_income_2022: prevIncome,
  };
}

fs.writeFileSync(path.join(OUT_DIR, 'income.json'), JSON.stringify(incomeData, null, 2));
console.log(`  Saved income for ${Object.keys(incomeData).length} municipios`);

// Show top 10 by income
const sortedIncome = Object.values(incomeData).sort((a, b) => (b.avg_total_income_2023 || 0) - (a.avg_total_income_2023 || 0));
console.log('  Top 10 by avg total income 2023:');
sortedIncome.slice(0, 10).forEach((m, i) => {
  console.log(`    ${i+1}. ${m.name}: €${m.avg_total_income_2023}`);
});

// --- Parse Housing Type Data ---
console.log('\nParsing housing type data...');
const housingPX = parsePX(path.join(RAW_DIR, 'housing_type.px'));
const hTerrDim = Object.keys(housingPX.values).find(k => k.includes('mbitos') || k.includes('territorial'));
const hTypeDim = Object.keys(housingPX.values).find(k => k.includes('tipo'));
const hPeriodDim = Object.keys(housingPX.values).find(k => k.includes('periodo') || k.includes('period'));

console.log(`  Dimensions: ${JSON.stringify(Object.keys(housingPX.values))}`);
console.log(`  Territory dim: ${hTerrDim}, values: ${(housingPX.values[hTerrDim] || []).length}`);
console.log(`  Type dim: ${hTypeDim}, values: ${JSON.stringify(housingPX.values[hTypeDim])}`);
console.log(`  Period dim: ${hPeriodDim}, values: ${JSON.stringify(housingPX.values[hPeriodDim])}`);

// --- Parse Housing Tenure Data ---
console.log('\nParsing housing tenure data...');
const tenurePX = parsePX(path.join(RAW_DIR, 'housing_tenure.px'));
const tTerrDim = Object.keys(tenurePX.values).find(k => k.includes('mbitos') || k.includes('territorial'));
const tTypeDim = Object.keys(tenurePX.values).find(k => k.includes('gimen') || k.includes('tenencia'));
const tPeriodDim = Object.keys(tenurePX.values).find(k => k.includes('periodo') || k.includes('period'));

console.log(`  Dimensions: ${JSON.stringify(Object.keys(tenurePX.values))}`);
console.log(`  Territory dim: ${tTerrDim}, values: ${(tenurePX.values[tTerrDim] || []).length}`);
console.log(`  Tenure dim: ${tTypeDim}, values: ${JSON.stringify(tenurePX.values[tTypeDim])}`);
console.log(`  Period dim: ${tPeriodDim}, values: ${JSON.stringify(tenurePX.values[tPeriodDim])}`);

// --- Parse Population Age Groups ---
console.log('\nParsing population age groups...');
const agePX = parsePX(path.join(RAW_DIR, 'population_age_groups.px'));
const aTerrDim = Object.keys(agePX.values).find(k => k.includes('mbitos') || k.includes('territorial'));
const aAgeDim = Object.keys(agePX.values).find(k => k.includes('edad') || k.includes('age'));
const aSexDim = Object.keys(agePX.values).find(k => k.includes('sexo') || k.includes('sex'));
const aPeriodDim = Object.keys(agePX.values).find(k => k.includes('periodo') || k.includes('period'));

console.log(`  Dimensions: ${JSON.stringify(Object.keys(agePX.values))}`);
console.log(`  Age dim: ${aAgeDim}, values: ${JSON.stringify(agePX.values[aAgeDim])}`);
console.log(`  Period values: ${JSON.stringify(agePX.values[aPeriodDim])}`);

console.log('\n--- Summary ---');
console.log('Files created:');
console.log('  demographics.json (from INE API) - 252 municipios with population + growth');
console.log('  income.json (from EUSTAT PX) - avg income by municipio');
console.log('  boundaries_municipios.geojson - 252 municipio polygons');
console.log('\nPX files downloaded but need detailed parsing:');
console.log('  housing_type.px, housing_tenure.px, population_age_groups.px');
