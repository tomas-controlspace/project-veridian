const XLSX = require('C:\\Users\\tomas\\Downloads\\node_modules\\xlsx');
const wb = XLSX.readFile('C:\\Users\\tomas\\Documents\\vscode\\projects\\maps-app_v2\\public\\data\\EMAL-2016-2025_es.xlsx');
console.log('Sheets:', wb.SheetNames.join(', '));

const idx = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
for (let i = 0; i < Math.min(20, idx.length); i++) {
  const row = idx[i].map(v => String(v||'').substring(0, 70)).filter(v => v);
  if (row.length) console.log('  Row ' + i + ':', row.join(' | '));
}

// Check rent per m² sheets
for (const name of wb.SheetNames) {
  if (name.includes('2.3') || name.includes('1.3')) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    console.log(`\nSheet "${name}" (${data.length} rows):`);
    for (let i = 0; i < Math.min(10, data.length); i++) {
      console.log('  Row ' + i + ':', JSON.stringify(data[i].slice(0, 12)));
    }
  }
}
