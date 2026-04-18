import polygonClipping, { MultiPolygon } from 'polygon-clipping';
import type { MunicipioMetrics } from '@/types';

/**
 * Metrics computed for a custom drawn area. Field names mirror MunicipioMetrics
 * so the ComparisonPanel row keys render directly. `municipio_count` and
 * `ine_codes` are extras specific to custom areas.
 */
export interface CustomAreaMetrics {
  municipio_count: number;
  ine_codes: string[];
  // Base
  pop_2025: number | null;
  area_km2: number | null;
  total_dwellings: number | null;
  total_family_dwellings: number | null;
  density_per_km2: number | null;
  pop_growth_5yr_pct: number | null;
  avg_total_income: number | null;
  pct_working_20_64: number | null;
  pct_senior_65_plus: number | null;
  pct_apartment: number | null;
  avg_surface_m2: number | null;
  pct_rented: number | null;
  avg_price_sqm: number | null;
  avg_rent_sqm: number | null;
  housing_turnover: number | null;
  // Supply
  facility_count: number;
  ss_facility_count: number;
  nla_sqm: number | null;
  constructed_area_sqm: number | null;
  nla_per_capita: number | null;
  nla_per_1000_households: number | null;
  operator_count: number | null;
  opportunity_score: number | null;
}

function round(v: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

/** Convert a [lat, lng] ring to polygon-clipping format [[[lng, lat], ...]]. */
function ringLatLngToLngLat(ring: [number, number][]): [number, number][] {
  return ring.map(([lat, lng]) => [lng, lat]);
}

/** Extract rings from a GeoJSON geometry as [lng, lat] arrays for polygon-clipping. */
function geometryToMultiPolygon(
  geometry: GeoJSON.Geometry,
): [number, number][][][] | null {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates as [number, number][][]];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates as [number, number][][][];
  }
  return null;
}

/**
 * Given a drawn polygon and a GeoJSON FeatureCollection of municipios,
 * return the subset of features whose geometry intersects the polygon.
 * Intersections are checked with polygon-clipping for robust accuracy.
 * Features without `properties.ine_code` are skipped.
 */
export function findIntersectingMunicipios(
  drawnPolygon: [number, number][],
  boundaries: GeoJSON.FeatureCollection | null,
): string[] {
  if (!boundaries || drawnPolygon.length < 3) return [];
  const drawnLngLat: MultiPolygon = [[ringLatLngToLngLat(drawnPolygon)]];
  const codes: string[] = [];

  for (const feature of boundaries.features) {
    const code = (feature.properties as Record<string, unknown> | null)?.ine_code;
    if (typeof code !== 'string') continue;

    const muniMP = geometryToMultiPolygon(feature.geometry);
    if (!muniMP) continue;

    try {
      const result = polygonClipping.intersection(
        drawnLngLat,
        muniMP as unknown as MultiPolygon,
      );
      if (result.length > 0) {
        codes.push(code);
      }
    } catch {
      // polygon-clipping can throw on degenerate geometries — skip quietly
    }
  }
  return codes;
}

/** Aggregate metrics across a list of municipios. Ports `catchmentMetrics` from prepare-data.js. */
export function aggregateMetrics(
  ineCodes: string[],
  municipios: Record<string, MunicipioMetrics>,
): CustomAreaMetrics {
  const insideMunis: MunicipioMetrics[] = ineCodes
    .map(c => municipios[c])
    .filter(Boolean);

  const catchPop = insideMunis.reduce((s, m) => s + (m.pop_2025 || 0), 0);
  const catchArea = insideMunis.reduce((s, m) => s + (m.area_km2 || 0), 0);
  const catchDwellings = insideMunis.reduce((s, m) => s + (m.total_dwellings || 0), 0);
  const catchFamilyDwellings = insideMunis.reduce((s, m) => s + (m.total_family_dwellings || 0), 0);

  let catchApartments = 0, catchRented = 0;
  let incWtdSum = 0, incWtdPop = 0;
  let priceWtdSum = 0, priceWtdPop = 0;
  let rentWtdSum = 0, rentWtdPop = 0;
  let seniorWtd = 0, workingWtd = 0;
  let growthWtd = 0, growthWtdPop = 0;
  let surfaceWtd = 0, surfaceWtdPop = 0;
  let catchNLA = 0;
  let catchConstructed = 0;
  let catchTurnoverSum = 0;
  let catchFacilityCount = 0;
  let catchSSFacilityCount = 0;
  let oppWtd = 0, oppWtdPop = 0;
  const operators = new Set<string>();

  for (const m of insideMunis) {
    const pop = m.pop_2025 || 0;

    catchApartments += (m.total_family_dwellings || 0) * (m.pct_apartment || 0) / 100;
    catchRented += (m.total_dwellings || 0) * (m.pct_rented || 0) / 100;

    if (m.avg_total_income != null && pop > 0) {
      incWtdSum += m.avg_total_income * pop;
      incWtdPop += pop;
    }
    if (m.avg_price_sqm != null && pop > 0) {
      priceWtdSum += m.avg_price_sqm * pop;
      priceWtdPop += pop;
    }
    if (m.avg_rent_sqm != null && pop > 0) {
      rentWtdSum += m.avg_rent_sqm * pop;
      rentWtdPop += pop;
    }
    if (m.pop_growth_5yr_pct != null && pop > 0) {
      growthWtd += m.pop_growth_5yr_pct * pop;
      growthWtdPop += pop;
    }
    if (m.avg_surface_m2 != null && pop > 0) {
      surfaceWtd += m.avg_surface_m2 * pop;
      surfaceWtdPop += pop;
    }

    seniorWtd += pop * (m.pct_senior_65_plus || 0) / 100;
    workingWtd += pop * (m.pct_working_20_64 || 0) / 100;
    catchNLA += (m.nla_sqm || 0);
    catchConstructed += (m.constructed_area_sqm || 0);
    // data has both `housing_turnover` (municipal/provincial) and `housing_turnover_annual_prov` — prefer the former
    catchTurnoverSum += ((m as unknown as Record<string, number | null>).housing_turnover || m.housing_turnover_annual_prov || 0);
    catchFacilityCount += (m.facility_count || 0);
    catchSSFacilityCount += (m.ss_facility_count || 0);

    if (m.opportunity_score != null && pop > 0) {
      oppWtd += m.opportunity_score * pop;
      oppWtdPop += pop;
    }
    // operator_count is a per-municipio distinct count; we can't union the sets
    // without the underlying facility data, so we approximate with max.
    if (m.operator_count) {
      operators.add(`__cnt_${m.ine_code}_${m.operator_count}`);
    }
  }

  const nlaSqm = catchNLA > 0 ? catchNLA : null;
  return {
    municipio_count: insideMunis.length,
    ine_codes: insideMunis.map(m => m.ine_code),
    pop_2025: catchPop || null,
    area_km2: catchArea || null,
    total_dwellings: catchDwellings || null,
    total_family_dwellings: catchFamilyDwellings || null,
    density_per_km2: catchArea > 0 ? round(catchPop / catchArea, 1) : null,
    pop_growth_5yr_pct: growthWtdPop > 0 ? round(growthWtd / growthWtdPop, 2) : null,
    avg_total_income: incWtdPop > 0 ? round(incWtdSum / incWtdPop, 0) : null,
    pct_working_20_64: catchPop > 0 ? round(workingWtd / catchPop * 100, 1) : null,
    pct_senior_65_plus: catchPop > 0 ? round(seniorWtd / catchPop * 100, 1) : null,
    pct_apartment: catchFamilyDwellings > 0 ? round(catchApartments / catchFamilyDwellings * 100, 1) : null,
    avg_surface_m2: surfaceWtdPop > 0 ? round(surfaceWtd / surfaceWtdPop, 1) : null,
    pct_rented: catchDwellings > 0 ? round(catchRented / catchDwellings * 100, 1) : null,
    avg_price_sqm: priceWtdPop > 0 ? round(priceWtdSum / priceWtdPop, 2) : null,
    avg_rent_sqm: rentWtdPop > 0 ? round(rentWtdSum / rentWtdPop, 4) : null,
    housing_turnover: catchTurnoverSum || null,
    facility_count: catchFacilityCount,
    ss_facility_count: catchSSFacilityCount,
    nla_sqm: nlaSqm,
    constructed_area_sqm: catchConstructed || null,
    nla_per_capita: catchPop > 0 && catchNLA > 0 ? round(catchNLA / catchPop, 4) : null,
    nla_per_1000_households: catchDwellings > 0 && catchNLA > 0 ? round(catchNLA / catchDwellings * 1000, 1) : null,
    operator_count: insideMunis.reduce((mx, m) => Math.max(mx, m.operator_count || 0), 0) || null,
    opportunity_score: oppWtdPop > 0 ? round(oppWtd / oppWtdPop, 1) : null,
  };
}

/** High-level: drawn polygon + full dataset → aggregated metrics. */
export function computeAreaMetrics(
  drawnPolygon: [number, number][],
  municipios: Record<string, MunicipioMetrics>,
  boundaries: GeoJSON.FeatureCollection | null,
): CustomAreaMetrics {
  const ineCodes = findIntersectingMunicipios(drawnPolygon, boundaries);
  return aggregateMetrics(ineCodes, municipios);
}
