const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname);

// INE.es Padrón tables for Basque provinces
// nult=10 gets 10 most recent years (2016-2025) for growth calculation
const PROVINCE_TABLES = {
  '01': { tableId: 2854, name: 'Álava/Araba' },
  '20': { tableId: 2873, name: 'Gipuzkoa' },
  '48': { tableId: 2905, name: 'Bizkaia' },
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Parse error for ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

async function fetchProvince(provCode, tableId, provName) {
  console.log(`Fetching ${provName} (table ${tableId})...`);
  // nult=10 = last 10 data points (years)
  const url = `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${tableId}?tip=AM&nult=10`;
  const raw = await fetchJSON(url);
  
  const municipios = {};
  
  for (const series of raw) {
    const meta = series.MetaData || [];
    const munMeta = meta.find(m => m.T3_Variable === 'Municipios');
    const sexMeta = meta.find(m => m.T3_Variable === 'Sexo');
    
    if (!munMeta || !sexMeta) continue; // skip province-level totals
    if (sexMeta.Codigo !== '0') continue; // only "Total" sex
    
    const ineCode = munMeta.Codigo; // 5-digit INE code
    const name = munMeta.Nombre;
    
    if (!municipios[ineCode]) {
      municipios[ineCode] = { ine_code: ineCode, name, provincia_code: provCode, provincia_name: provName };
    }
    
    // Extract population by year
    for (const dp of (series.Data || [])) {
      municipios[ineCode][`pop_${dp.Anyo}`] = dp.Valor;
    }
  }
  
  return municipios;
}

async function main() {
  const allMunicipios = {};
  
  for (const [provCode, info] of Object.entries(PROVINCE_TABLES)) {
    const munis = await fetchProvince(provCode, info.tableId, info.name);
    Object.assign(allMunicipios, munis);
    console.log(`  -> ${Object.keys(munis).length} municipios`);
    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Build demographics.json
  const demographics = {};
  for (const [code, mun] of Object.entries(allMunicipios)) {
    const pop2025 = mun.pop_2025 || null;
    const pop2020 = mun.pop_2020 || null;
    const pop2015 = mun.pop_2015 || mun.pop_2016 || null;
    
    let pop_growth_5yr = null;
    if (pop2025 && pop2020 && pop2020 > 0) {
      pop_growth_5yr = ((pop2025 - pop2020) / pop2020 * 100);
    }
    
    let pop_growth_10yr = null;
    if (pop2025 && pop2015 && pop2015 > 0) {
      pop_growth_10yr = ((pop2025 - pop2015) / pop2015 * 100);
    }
    
    demographics[code] = {
      ine_code: code,
      name: mun.name,
      provincia_code: mun.provincia_code,
      provincia_name: mun.provincia_name,
      pop_2025: pop2025,
      pop_2024: mun.pop_2024 || null,
      pop_2020: pop2020,
      pop_2015: pop2015,
      pop_growth_5yr_pct: pop_growth_5yr !== null ? Math.round(pop_growth_5yr * 100) / 100 : null,
      pop_growth_10yr_pct: pop_growth_10yr !== null ? Math.round(pop_growth_10yr * 100) / 100 : null,
    };
  }
  
  const outPath = path.join(OUTPUT_DIR, 'demographics.json');
  fs.writeFileSync(outPath, JSON.stringify(demographics, null, 2));
  
  const count = Object.keys(demographics).length;
  console.log(`\nSaved ${count} municipios to ${outPath}`);
  
  // Summary stats
  const totalPop = Object.values(demographics).reduce((s, m) => s + (m.pop_2025 || 0), 0);
  console.log(`Total Basque Country population (2025): ${totalPop.toLocaleString()}`);
  
  // Show top 10 by population
  const sorted = Object.values(demographics).sort((a, b) => (b.pop_2025 || 0) - (a.pop_2025 || 0));
  console.log('\nTop 10 municipios by population:');
  sorted.slice(0, 10).forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.name} (${m.ine_code}): ${(m.pop_2025 || 0).toLocaleString()} | growth 5yr: ${m.pop_growth_5yr_pct}%`);
  });
}

main().catch(console.error);
