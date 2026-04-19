// One-off QA helper: render a hand-built Bilbao payload through the template
// using the same pizzip+docxtemplater pipeline the browser uses. Output goes to
// /tmp/bilbao-sample.pptx for visual diff against the reference deck.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const TEMPLATE_PATH = 'public/templates/case-study.pptx';
const OUTPUT_PATH   = '/tmp/bilbao-sample.pptx';

// Mirrors the shape produced by src/lib/export/pptxTemplater.ts::flattenData
function flattenRows(prefix, rows) {
  const out = {};
  rows.forEach((row, i) => {
    const n = i + 1;
    out[`${prefix}_r${n}_label`] = row.label;
    out[`${prefix}_r${n}_c1`]    = row.col1;
    out[`${prefix}_r${n}_c2`]    = row.col2;
    out[`${prefix}_r${n}_c3`]    = row.col3;
  });
  return out;
}

const popRows = [
  { label: 'Population',        col1: '351,124', col2: '528,262', col3: '2,242,342' },
  { label: 'Density (pop/km²)', col1: '8,498.3', col2: '4,138.3', col3: '316.4' },
  { label: 'Pop Growth 5yr (%)',col1: '0.27%',   col2: '0.42%',   col3: '0.88%' },
  { label: 'Avg Income (€)',    col1: '€26,598', col2: '€25,285', col3: '€26,287' },
];

const housingRows = [
  { label: '% Apartment',              col1: '98.8%',   col2: '97.9%',   col3: '89.5%' },
  { label: 'Avg Housing Size (m²)',    col1: '82.2 m²', col2: '80.3 m²', col3: '87.1 m²' },
  { label: '% Rented',                 col1: '14.6%',   col2: '13.4%',   col3: '13.5%' },
  { label: 'Purchase Price (€/m²)',    col1: '€3,879',  col2: '€3,657',  col3: '€3,555' },
  { label: 'Rent (€/m²/month)',        col1: '€11.77',  col2: '€11.60',  col3: '€10.34' },
  { label: 'Housing Turnover (annual)',col1: '4,864',   col2: '5,586',   col3: '28,557' },
];

const storageRows = [
  { label: 'NLA (m²)',       col1: '9,402', col2: '15,476', col3: '30,833' },
  { label: 'NLA per Capita', col1: '0.027', col2: '0.029',  col3: '0.014'  },
];

const data = {
  areaName: 'Bilbao',
  areaNameUpper: 'BILBAO',
  s2Title: 'Bilbao\u2019s 10-min Catchment Area',   // curly apostrophe
  col1Label: 'Bilbao',
  col2Label: 'Catchment',
  col3Label: 'Euskadi',
  catchmentMunis: [
    { name: 'Bilbao' },
    { name: 'Barakaldo' },
    { name: 'Etxebarri' },
    { name: 'Basauri' },
    { name: 'Arrigorriaga' },
    { name: 'Ugao-Miraballes' },
  ],
  ...flattenRows('pop',     popRows),
  ...flattenRows('housing', housingRows),
  ...flattenRows('storage', storageRows),
};

const zipBytes = readFileSync(TEMPLATE_PATH);
const zip = new PizZip(zipBytes);
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
doc.render(data);

const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, out);
console.log(`Wrote ${OUTPUT_PATH} (${out.length.toLocaleString()} bytes)`);
