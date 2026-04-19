export type ExportScope =
  | { kind: 'municipio'; ineCode: string }
  | { kind: 'provincia'; provCode: string }
  | { kind: 'customArea'; areaId: string };

export interface TableRow {
  label: string;
  col1: string;
  col2: string;
  col3: string;
}

export interface CaseStudyData {
  areaName: string;
  areaNameUpper: string;
  s2Title: string;
  col1Label: string;
  col2Label: string;
  col3Label: string;
  catchmentMunis: { name: string }[];
  popRows: TableRow[];      // 4 rows
  housingRows: TableRow[];  // 6 rows
  storageRows: TableRow[];  // 2 rows
}
