import type { CaseStudyData } from './types';

// Path inside the pptx zip of the image that backs Slide 2's picture placeholder.
// Identified via `ppt/slides/_rels/slide2.xml.rels` in the prepared template.
const SLIDE2_IMAGE_PATH = 'ppt/media/image9.png';

/** Flatten popRows/housingRows/storageRows into scalar tags matching the template. */
function flattenData(data: CaseStudyData): Record<string, unknown> {
  const out: Record<string, unknown> = {
    areaName: data.areaName,
    areaNameUpper: data.areaNameUpper,
    s2Title: data.s2Title,
    col1Label: data.col1Label,
    col2Label: data.col2Label,
    col3Label: data.col3Label,
    catchmentMunis: data.catchmentMunis,
  };
  const writeRows = (prefix: string, rows: CaseStudyData['popRows']) => {
    rows.forEach((row, i) => {
      const n = i + 1;
      out[`${prefix}_r${n}_label`] = row.label;
      out[`${prefix}_r${n}_c1`]    = row.col1;
      out[`${prefix}_r${n}_c2`]    = row.col2;
      out[`${prefix}_r${n}_c3`]    = row.col3;
    });
  };
  writeRows('pop', data.popRows);
  writeRows('housing', data.housingRows);
  writeRows('storage', data.storageRows);
  return out;
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}

export async function renderPptx(
  data: CaseStudyData,
  mapImage: Blob | null,
  templateUrl = '/templates/case-study.pptx',
): Promise<Blob> {
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
    import('pizzip'),
    import('docxtemplater'),
  ]);

  const res = await fetch(templateUrl);
  if (!res.ok) {
    throw new Error(`Template not found at ${templateUrl} (HTTP ${res.status})`);
  }
  const ab = await res.arrayBuffer();
  const zip = new PizZip(ab);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(flattenData(data));

  if (mapImage) {
    const bytes = await blobToUint8Array(mapImage);
    // Overwrite the slide-2 image in place. The relationship (rId2 -> image9.png) is
    // preserved, so PowerPoint displays the new image at the same position/size.
    zip.file(SLIDE2_IMAGE_PATH, bytes, { binary: true });
  }

  return zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    compression: 'DEFLATE',
  });
}
