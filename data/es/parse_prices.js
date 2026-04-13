const XLSX = require('C:\\Users\\tomas\\Downloads\\node_modules\\xlsx');
const fs = require('fs');
const path = require('path');

const OUT_DIR = 'C:\\Users\\tomas\\Documents\\vscode\\projects\\maps-app_v2\\data\\es';
const ECVI_PATH = 'C:\\Users\\tomas\\Documents\\vscode\\projects\\maps-app_v2\\public\\data\\ECVI_es_2025T4.xlsx';
const EMAL_PATH = 'C:\\Users\\tomas\\Documents\\vscode\\projects\\maps-app_v2\\public\\data\\EMAL-Locales-comerciales-2016-2025_es.xlsx';

// --- 1. PURCHASE PRICE/m² from ECVI T1.3 (provincial) + T3.3 (municipalities) ---
console.log('=== PURCHASE PRICES (ECVI) ===');
const ecvi = XLSX.readFile(ECVI_PATH);

// T1.3: Price/m² by province - latest quarter (row 4 = 2025 Q4)
const t13 = XLSX.utils.sheet_to_json(ecvi.Sheets['T1.3'], { header: 1, defval: '' });
// Row 3 has headers: Total, Vitoria-Gasteiz, Resto TH, Total, ...
// Row 4 = 2025 Q4
const priceRow = t13[4]; // 2025 Q4
// Col 2 = CAE total, Col 5 = Álava total, Col 6 = Vitoria, Col 7 = Resto Álava
// Need to figure out exact column mapping from headers

// Let me map columns by reading row 1 and row 3
const h1 = t13[1]; // Year, Trimestre, C.A. de Euskadi, "", "", ARABA/ÁLAVA, ...
const h3 = t13[3]; // "", "", Total, Total, Total, Total, Vitoria-Gasteiz, Resto TH, ...

// Parse header structure
console.log('T1.3 header row 1:', JSON.stringify(h1.slice(0, 20)));
console.log('T1.3 header row 3:', JSON.stringify(h3.slice(0, 20)));
console.log('T1.3 data row (2025 Q4):', JSON.stringify(priceRow.slice(0, 20)));

// Provincial price/m² for 2025 Q4 (total dwellings)
const euskadi_price = parseFloat(priceRow[2]) || null;
const alava_price = parseFloat(priceRow[5]) || null;
const alava_vitoria_price = parseFloat(priceRow[6]) || null;
const alava_rest_price = parseFloat(priceRow[7]) || null;

// Find Bizkaia and Gipuzkoa columns by scanning header
let bizkaia_col = -1, gipuzkoa_col = -1;
for (let c = 0; c < h1.length; c++) {
  if (String(h1[c]).includes('BIZKAIA')) bizkaia_col = c;
  if (String(h1[c]).includes('GIPUZKOA')) gipuzkoa_col = c;
}
console.log(`Bizkaia col: ${bizkaia_col}, Gipuzkoa col: ${gipuzkoa_col}`);

const bizkaia_price = bizkaia_col >= 0 ? parseFloat(priceRow[bizkaia_col]) || null : null;
const gipuzkoa_price = gipuzkoa_col >= 0 ? parseFloat(priceRow[gipuzkoa_col]) || null : null;

// Also get Bilbao and Donostia specific columns
let bilbao_col = -1, donostia_col = -1;
for (let c = 0; c < h3.length; c++) {
  if (String(h3[c]).includes('Bilbao')) bilbao_col = c;
  if (String(h3[c]).includes('Donostia') || String(h3[c]).includes('San Sebast')) donostia_col = c;
}
const bilbao_price_prov = bilbao_col >= 0 ? parseFloat(priceRow[bilbao_col]) || null : null;
const donostia_price_prov = donostia_col >= 0 ? parseFloat(priceRow[donostia_col]) || null : null;

console.log(`\nProvincial prices (€/m², 2025 Q4):`);
console.log(`  Euskadi: ${euskadi_price}`);
console.log(`  Álava: ${alava_price} (Vitoria: ${alava_vitoria_price}, Rest: ${alava_rest_price})`);
console.log(`  Bizkaia: ${bizkaia_price} (Bilbao: ${bilbao_price_prov})`);
console.log(`  Gipuzkoa: ${gipuzkoa_price} (Donostia: ${donostia_price_prov})`);

// T3.3: Price/m² for specific large municipalities
console.log('\n--- Large municipality prices (T3.3) ---');
const t33 = XLSX.utils.sheet_to_json(ecvi.Sheets['T3.3'], { header: 1, defval: '' });
const t33h2 = t33[2]; // Has municipality names with INE codes like "20045 - Irun"
const t33data = t33[4]; // 2025 Q4

const muniPrices = {};
for (let c = 2; c < t33h2.length; c += 3) { // Every 3 cols = total, new, used
  const name = String(t33h2[c]);
  const match = name.match(/^(\d{5})\s*-\s*(.+)$/);
  if (match) {
    const code = match[1];
    const mname = match[2].trim();
    const price = parseFloat(t33data[c]);
    if (!isNaN(price) && price > 0) {
      muniPrices[code] = price;
      console.log(`  ${code} ${mname}: €${price}/m²`);
    }
  }
}

// T1.1: Transaction counts (housing turnover) by province
console.log('\n--- Housing turnover (T1.1) ---');
const t11 = XLSX.utils.sheet_to_json(ecvi.Sheets['T1.1'], { header: 1, defval: '' });
const t11data = t11[4]; // 2025 Q4
const euskadi_txn = parseFloat(t11data[2]) || null;
const alava_txn = parseFloat(t11data[5]) || null;
// Find bizkaia/gipuzkoa txn columns
const t11h1 = t11[1];
let biz_txn_col = -1, gip_txn_col = -1;
for (let c = 0; c < t11h1.length; c++) {
  if (String(t11h1[c]).includes('BIZKAIA')) biz_txn_col = c;
  if (String(t11h1[c]).includes('GIPUZKOA')) gip_txn_col = c;
}
const bizkaia_txn = biz_txn_col >= 0 ? parseFloat(t11data[biz_txn_col]) || null : null;
const gipuzkoa_txn = gip_txn_col >= 0 ? parseFloat(t11data[gip_txn_col]) || null : null;

console.log(`Transactions 2025 Q4: Euskadi=${euskadi_txn}, Álava=${alava_txn}, Bizkaia=${bizkaia_txn}, Gipuzkoa=${gipuzkoa_txn}`);

// --- 2. RENT €/m² from EMAL L2.3 (annual, by province) ---
console.log('\n=== COMMERCIAL RENT (EMAL) ===');
const emal = XLSX.readFile(EMAL_PATH);
const l23 = XLSX.utils.sheet_to_json(emal.Sheets['L2.3'], { header: 1, defval: '' });
// Row 1: headers with years
// Row 4: Euskadi
// Row 5: Álava, Row 6: Gipuzkoa, Row 7: Bizkaia
const l23periods = l23[1]; // has year labels
const latestRentCol = l23periods.length - 1; // rightmost = latest year
// Find 2024 column (2025 might not be complete)
let rentCol2024 = -1, rentCol2023 = -1;
for (let c = 2; c < l23periods.length; c++) {
  if (String(l23periods[c]) === '2024') rentCol2024 = c;
  if (String(l23periods[c]) === '2023') rentCol2023 = c;
}
const rentCol = rentCol2024 >= 0 ? rentCol2024 : rentCol2023;
const rentYear = rentCol2024 >= 0 ? '2024' : '2023';

const euskadi_rent = parseFloat(l23[4][rentCol]) || null;
const alava_rent = parseFloat(l23[5][rentCol]) || null;
const gipuzkoa_rent = parseFloat(l23[6][rentCol]) || null;
const bizkaia_rent = parseFloat(l23[7][rentCol]) || null;

console.log(`Commercial rent €/m²/month (${rentYear}):`);
console.log(`  Euskadi: ${euskadi_rent}`);
console.log(`  Álava: ${alava_rent}`);
console.log(`  Gipuzkoa: ${gipuzkoa_rent}`);
console.log(`  Bizkaia: ${bizkaia_rent}`);

// --- 3. Merge into master dataset ---
console.log('\n=== UPDATING MASTER DATASET ===');
const master = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'master_municipios.json'), 'utf-8'));

// Provincial price lookup
const provPrices = { '01': alava_price, '20': gipuzkoa_price, '48': bizkaia_price };
const provRents = { '01': alava_rent, '20': gipuzkoa_rent, '48': bizkaia_rent };
const provTxn = { '01': alava_txn, '20': bizkaia_txn, '48': bizkaia_txn }; // quarterly

let priceFromMuni = 0, priceFromProv = 0, rentUpdated = 0;

for (const [code, mun] of Object.entries(master)) {
  const prov = code.substring(0, 2);
  
  // Purchase price: use municipal if available, else provincial
  if (muniPrices[code]) {
    mun.avg_price_sqm = Math.round(muniPrices[code] * 100) / 100;
    priceFromMuni++;
  } else {
    mun.avg_price_sqm = provPrices[prov] ? Math.round(provPrices[prov] * 100) / 100 : null;
    priceFromProv++;
  }
  
  // Rent: provincial level
  mun.avg_rent_sqm = provRents[prov] ? Math.round(provRents[prov] * 10000) / 10000 : null;
  if (mun.avg_rent_sqm) rentUpdated++;
  
  // Housing turnover: quarterly provincial, annualize * 4
  const qTxn = provTxn[prov];
  // Normalize per capita for the province
  // Just store provincial quarterly count for now
  mun.housing_turnover_quarterly_prov = qTxn;
}

fs.writeFileSync(path.join(OUT_DIR, 'master_municipios.json'), JSON.stringify(master, null, 2));

console.log(`Price: ${priceFromMuni} from municipal data, ${priceFromProv} from provincial fallback`);
console.log(`Rent: ${rentUpdated} municipios updated`);

// Show updated sample
const bilbao = master['48020'];
console.log(`\nBilbao: price=${bilbao.avg_price_sqm} €/m², rent=${bilbao.avg_rent_sqm} €/m²/mo, turnover_q=${bilbao.housing_turnover_quarterly_prov}`);
const ss = master['20069'];
console.log(`Donostia: price=${ss.avg_price_sqm} €/m², rent=${ss.avg_rent_sqm} €/m²/mo`);
const vg = master['01059'];
console.log(`Vitoria: price=${vg.avg_price_sqm} €/m², rent=${vg.avg_rent_sqm} €/m²/mo`);
