export function caseStudyFilename(areaName: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const clean = areaName.replace(/[\\/:*?"<>|]/g, '').trim() || 'Case Study';
  return `${clean} Case Study - Control Space - ${date}.pptx`;
}
