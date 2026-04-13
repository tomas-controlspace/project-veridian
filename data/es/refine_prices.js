const fs = require('fs');
const path = require('path');

const OUT_DIR = 'C:\\Users\\tomas\\Documents\\vscode\\projects\\maps-app_v2\\data\\es';
const master = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'master_municipios.json'), 'utf-8'));

// Refined price assignments based on ECVI T1.3 (2025 Q4)
// Province-level: Capital vs Rest of province
const priceMap = {
  // Álava: Total=2755.88, Vitoria=2994.65, Resto=1901.65
  '01': { capital: '01059', capitalPrice: 2994.65, restPrice: 1901.65 },
  // Bizkaia: Total=3388.99, Bilbao=3879.18, Resto=3182.89
  '48': { capital: '48020', capitalPrice: 3879.18, restPrice: 3182.89 },
  // Gipuzkoa: Total=3981.33, Donostia=6369.30 (from T6.3), Resto=3244.74
  '20': { capital: '20069', capitalPrice: 6369.30, restPrice: 3244.74 },
};

// Specific municipality prices from T3.3
const muniPrices = {
  '20045': 3356.50,  // Irun
  '20067': 3504.05,  // Errenteria
  '48013': 3394.60,  // Barakaldo
  '48015': 2784.16,  // Basauri
  '48044': 4540.67,  // Getxo
  '48078': 3015.56,  // Portugalete
  '48082': 2872.70,  // Santurtzi
};

// Housing turnover by province (quarterly 2025 Q4, annualize x4)
const provTurnover = { '01': 972, '48': 3525, '20': 2106 }; // quarterly

let specific = 0, capital = 0, rest = 0;

for (const [code, mun] of Object.entries(master)) {
  const prov = code.substring(0, 2);
  const pm = priceMap[prov];
  
  // Purchase price: specific municipality > capital > rest of province
  if (muniPrices[code]) {
    mun.avg_price_sqm = muniPrices[code];
    mun.price_source = 'municipal';
    specific++;
  } else if (pm && code === pm.capital) {
    mun.avg_price_sqm = pm.capitalPrice;
    mun.price_source = 'capital';
    capital++;
  } else if (pm) {
    mun.avg_price_sqm = pm.restPrice;
    mun.price_source = 'provincial_rest';
    rest++;
  }
  
  // Round
  if (mun.avg_price_sqm) mun.avg_price_sqm = Math.round(mun.avg_price_sqm * 100) / 100;
  
  // Housing turnover: store annual provincial estimate
  const qTxn = provTurnover[prov] || null;
  mun.housing_turnover_annual_prov = qTxn ? qTxn * 4 : null;
}

// Clean up temp field
for (const mun of Object.values(master)) {
  delete mun.housing_turnover_quarterly_prov;
}

fs.writeFileSync(path.join(OUT_DIR, 'master_municipios.json'), JSON.stringify(master, null, 2));

console.log(`Price refined: ${specific} specific municipalities, ${capital} capitals, ${rest} rest-of-province`);

// Final summary
console.log('\n=== FINAL DATASET SAMPLES ===');
const samples = ['48020', '20069', '01059', '48044', '20045', '48013'];
for (const code of samples) {
  const m = master[code];
  if (!m) continue;
  console.log(`\n${m.name} (${code}):`);
  console.log(`  Pop: ${m.pop_2025?.toLocaleString()} | Density: ${m.density_per_km2}/km² | Growth: ${m.pop_growth_5yr_pct}%`);
  console.log(`  Apt: ${m.pct_apartment}% | Surface: ${m.avg_surface_m2}m² | Rented: ${m.pct_rented}%`);
  console.log(`  Income: €${m.avg_total_income} | Price: €${m.avg_price_sqm}/m² (${m.price_source}) | Rent: €${m.avg_rent_sqm}/m²/mo`);
  console.log(`  Senior: ${m.pct_senior_65_plus}% | Working: ${m.pct_working_20_64}%`);
  console.log(`  Turnover (prov annual est): ${m.housing_turnover_annual_prov} transactions`);
}
