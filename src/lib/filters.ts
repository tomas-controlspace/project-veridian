import type { MunicipioMetrics, Filters } from '@/types';

export const DEFAULT_FILTERS: Filters = {
  pop_min: null,
  pop_max: null,
  income_min: null,
  income_max: null,
  price_min: null,
  price_max: null,
  rent_min: null,
  rent_max: null,
};

/**
 * For the rent filter we accept either `avg_rent_sqm` (new-contract rents,
 * Euskadi only) or `avg_rent_sqm_active` (active-contract stock, populated
 * for both regions). Málaga has avg_rent_sqm null for all 103 munis per the
 * 2026-04-23 methodology decision, so without this fallback the rent filter
 * silently empties the Málaga choropleth.
 */
function getRent(m: MunicipioMetrics): number | null {
  return m.avg_rent_sqm ?? m.avg_rent_sqm_active ?? null;
}

export function passesFilters(m: MunicipioMetrics, filters: Filters): boolean {
  if (filters.pop_min != null && m.pop_2025 < filters.pop_min) return false;
  if (filters.pop_max != null && m.pop_2025 > filters.pop_max) return false;
  if (filters.income_min != null && (m.avg_total_income == null || m.avg_total_income < filters.income_min)) return false;
  if (filters.income_max != null && (m.avg_total_income == null || m.avg_total_income > filters.income_max)) return false;
  if (filters.price_min != null && (m.avg_price_sqm == null || m.avg_price_sqm < filters.price_min)) return false;
  if (filters.price_max != null && (m.avg_price_sqm == null || m.avg_price_sqm > filters.price_max)) return false;
  const rent = getRent(m);
  if (filters.rent_min != null && (rent == null || rent < filters.rent_min)) return false;
  if (filters.rent_max != null && (rent == null || rent > filters.rent_max)) return false;
  return true;
}
