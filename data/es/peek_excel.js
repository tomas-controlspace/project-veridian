const XLSX = require('C:\\Users\\tomas\\Downloads\\node_modules\\xlsx');

const files = [
  { path: 'C:\\Users\\tomas\\Documents\\vscode\\projects\\maps-app_v2\\public\\data\\EMAL-Locales-comerciales-2016-2025_es.xlsx', label: 'RENT (EMAL)' },
  { path: 'C:\\Users\\tomas\\Documents\\vscode\\projects\\maps-app_v2\\public\\data\\ECVI_es_2025T4.xlsx', label: 'PURCHASE (ECVI)' },
];

for (const f of files) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`FILE: ${f.label}`);
  console.log(`Path: ${f.path}`);
  
  const wb = XLSX.readFile(f.path);
  console.log(`Sheets: ${wb.SheetNames.join(', ')}`);
  
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    const rows = range.e.r + 1;
    const cols = range.e.c + 1;
    console.log(`\n  Sheet: "${sheetName}" (${rows} rows x ${cols} cols)`);
    
    // Show first 15 rows to understand structure
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const showRows = Math.min(15, data.length);
    for (let i = 0; i < showRows; i++) {
      const row = data[i].map(v => {
        if (v === null || v === undefined || v === '') return '';
        const s = String(v);
        return s.length > 40 ? s.substring(0, 37) + '...' : s;
      });
      console.log(`    Row ${i}: ${JSON.stringify(row.slice(0, 10))}`);
    }
    if (data.length > 15) {
      console.log(`    ... (${data.length - 15} more rows)`);
      // Show last 3 rows too
      for (let i = Math.max(15, data.length - 3); i < data.length; i++) {
        const row = data[i].map(v => {
          if (v === null || v === undefined || v === '') return '';
          const s = String(v);
          return s.length > 40 ? s.substring(0, 37) + '...' : s;
        });
        console.log(`    Row ${i}: ${JSON.stringify(row.slice(0, 10))}`);
      }
    }
  }
}
