// QA helper: take the sample PPTX produced by render-sample.mjs and swap its
// placeholder image with the real live-captured map PNG. Lets us rasterize an
// "exactly what the browser would produce" slide 2 without exfiltrating a 21 MB
// blob back through the eval channel.

import { readFileSync, writeFileSync } from 'node:fs';
import PizZip from 'pizzip';

const IN_PPTX  = '/tmp/bilbao-sample.pptx';
const IN_PNG   = 'C:/tmp/bilbao-live-map.png';
const OUT_PPTX = '/tmp/bilbao-sample-live.pptx';

const zip = new PizZip(readFileSync(IN_PPTX));
zip.file('ppt/media/image9.png', readFileSync(IN_PNG), { binary: true });
writeFileSync(OUT_PPTX, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('wrote', OUT_PPTX);
