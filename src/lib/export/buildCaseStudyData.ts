import type { MunicipioMetrics, ProvinciaMetrics, EuskadiMetrics, DrawnArea } from '@/types';
import { formatValue } from '@/lib/metrics';
import { computeAreaMetrics, type CustomAreaMetrics } from '@/lib/customAreaMetrics';
import type { ExportScope, CaseStudyData, TableRow } from './types';

// Reference deck uses exactly these rows — do not add or remove.
interface RowSpec {
  label: string;
  baseKey: string;                      // field name on MunicipioMetrics / ProvinciaMetrics / EuskadiMetrics
  catchKey: string;                     // field name for 10-min catchment column (municipio scope only)
  customKey: keyof CustomAreaMetrics;   // field name on CustomAreaMetrics
  format: 'number' | 'percent' | 'euro' | 'euro_sqm' | 'decimal';
  decimals: number;
  suffix?: string;
}

const POP_SPEC: RowSpec[] = [
  { label: 'Population',         baseKey: 'pop_2025',            catchKey: 'catchment_pop',   customKey: 'pop_2025',            format: 'number',  decimals: 0 },
  { label: 'Density (pop/km²)',  baseKey: 'density_per_km2',     catchKey: 'catchment_density', customKey: 'density_per_km2',   format: 'number',  decimals: 1 },
  { label: 'Pop Growth 5yr (%)', baseKey: 'pop_growth_5yr_pct',  catchKey: 'catch_pop_growth', customKey: 'pop_growth_5yr_pct', format: 'percent', decimals: 2 },
  { label: 'Avg Income (€)',     baseKey: 'avg_total_income',    catchKey: 'catch_avg_income', customKey: 'avg_total_income',   format: 'euro',    decimals: 0 },
];

const HOUSING_SPEC: RowSpec[] = [
  { label: '% Apartment',              baseKey: 'pct_apartment',             catchKey: 'catch_pct_apartment',     customKey: 'pct_apartment',     format: 'percent',  decimals: 1 },
  { label: 'Avg Housing Size (m²)',    baseKey: 'avg_surface_m2',            catchKey: 'catch_avg_surface_m2',    customKey: 'avg_surface_m2',    format: 'decimal',  decimals: 1, suffix: ' m²' },
  { label: '% Rented',                 baseKey: 'pct_rented',                catchKey: 'catch_pct_rented',        customKey: 'pct_rented',        format: 'percent',  decimals: 1 },
  { label: 'Purchase Price (€/m²)',    baseKey: 'avg_price_sqm',             catchKey: 'catch_avg_price_sqm',     customKey: 'avg_price_sqm',     format: 'euro_sqm', decimals: 0 },
  { label: 'Rent (€/m²/month)',        baseKey: 'avg_rent_sqm',              catchKey: 'catch_avg_rent_sqm',      customKey: 'avg_rent_sqm',      format: 'euro_sqm', decimals: 2 },
  { label: 'Housing Turnover (annual)', baseKey: 'housing_turnover_annual_prov', catchKey: 'catch_housing_turnover', customKey: 'housing_turnover', format: 'number', decimals: 0 },
];

const STORAGE_SPEC: RowSpec[] = [
  { label: 'NLA (m²)',        baseKey: 'nla_sqm',         catchKey: 'catch_nla_sqm',         customKey: 'nla_sqm',        format: 'number',  decimals: 0 },
  { label: 'NLA per Capita',  baseKey: 'nla_per_capita',  catchKey: 'catch_nla_per_capita',  customKey: 'nla_per_capita', format: 'decimal', decimals: 3 },
];

function fmt(spec: RowSpec, value: number | null | undefined): string {
  const core = formatValue(value, spec.format, spec.decimals);
  return spec.suffix && value != null ? core + spec.suffix : core;
}

type AnyAreaRecord = Record<string, number | string | null | undefined | string[]>;

function readNum(obj: AnyAreaRecord | null | undefined, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === 'number' ? v : null;
}

function buildRows(
  spec: RowSpec[],
  subject: AnyAreaRecord | null,
  catchment: AnyAreaRecord | null,
  euskadi: AnyAreaRecord | null,
  useCustomKeys: boolean,
): TableRow[] {
  return spec.map(s => ({
    label: s.label,
    col1: fmt(s, readNum(subject, useCustomKeys ? s.customKey as string : s.baseKey)),
    col2: catchment ? fmt(s, readNum(catchment, s.catchKey)) : '',
    col3: fmt(s, readNum(euskadi, s.baseKey)),
  }));
}

export interface BuildStoreSnapshot {
  municipios: Record<string, MunicipioMetrics>;
  provincias: Record<string, ProvinciaMetrics>;
  euskadi: EuskadiMetrics | null;
  drawnAreas: DrawnArea[];
  boundariesMuniGeoJSON: GeoJSON.FeatureCollection | null;
}

/** Top-15 municipios by population inside a provincia. */
function topMunisInProvincia(
  provCode: string,
  municipios: Record<string, MunicipioMetrics>,
  limit = 15,
): string[] {
  return Object.values(municipios)
    .filter(m => m.provincia_code === provCode)
    .sort((a, b) => (b.pop_2025 || 0) - (a.pop_2025 || 0))
    .slice(0, limit)
    .map(m => m.name);
}

export function buildCaseStudyData(
  scope: ExportScope,
  snap: BuildStoreSnapshot,
): CaseStudyData {
  const euskadiRec = snap.euskadi as unknown as AnyAreaRecord | null;

  if (scope.kind === 'municipio') {
    const muni = snap.municipios[scope.ineCode];
    if (!muni) throw new Error(`Municipio not found: ${scope.ineCode}`);
    const muniRec = muni as unknown as AnyAreaRecord;
    const catchCodes = muni.catch_ine_codes || [];
    const catchmentMunis = catchCodes
      .map(c => snap.municipios[c]?.name)
      .filter((n): n is string => !!n)
      .map(name => ({ name }));

    return {
      areaName: muni.name,
      areaNameUpper: muni.name.toUpperCase(),
      s2Title: `${muni.name}’s 10-min Catchment Area`,
      col1Label: muni.name,
      col2Label: 'Catchment',
      col3Label: 'Euskadi',
      catchmentMunis,
      popRows:     buildRows(POP_SPEC,     muniRec, muniRec, euskadiRec, false),
      housingRows: buildRows(HOUSING_SPEC, muniRec, muniRec, euskadiRec, false),
      storageRows: buildRows(STORAGE_SPEC, muniRec, muniRec, euskadiRec, false),
    };
  }

  if (scope.kind === 'provincia') {
    const prov = snap.provincias[scope.provCode];
    if (!prov) throw new Error(`Provincia not found: ${scope.provCode}`);
    const provRec = prov as unknown as AnyAreaRecord;
    const top = topMunisInProvincia(scope.provCode, snap.municipios);

    return {
      areaName: prov.provincia_name,
      areaNameUpper: prov.provincia_name.toUpperCase(),
      s2Title: `${prov.provincia_name} Overview`,
      col1Label: prov.provincia_name,
      col2Label: '',
      col3Label: 'Euskadi',
      catchmentMunis: top.map(name => ({ name })),
      popRows:     buildRows(POP_SPEC,     provRec, null, euskadiRec, false),
      housingRows: buildRows(HOUSING_SPEC, provRec, null, euskadiRec, false),
      storageRows: buildRows(STORAGE_SPEC, provRec, null, euskadiRec, false),
    };
  }

  // customArea
  const area = snap.drawnAreas.find(a => a.id === scope.areaId);
  if (!area) throw new Error(`Drawn area not found: ${scope.areaId}`);
  const metrics = computeAreaMetrics(area.polygon, snap.municipios, snap.boundariesMuniGeoJSON);
  const metricsRec = metrics as unknown as AnyAreaRecord;
  const catchmentMunis = metrics.ine_codes
    .map(c => snap.municipios[c]?.name)
    .filter((n): n is string => !!n)
    .map(name => ({ name }));

  return {
    areaName: area.name,
    areaNameUpper: area.name.toUpperCase(),
    s2Title: `${area.name} — Custom Area`,
    col1Label: area.name,
    col2Label: '',
    col3Label: 'Euskadi',
    catchmentMunis,
    popRows:     buildRows(POP_SPEC,     metricsRec, null, euskadiRec, true),
    housingRows: buildRows(HOUSING_SPEC, metricsRec, null, euskadiRec, true),
    storageRows: buildRows(STORAGE_SPEC, metricsRec, null, euskadiRec, true),
  };
}
