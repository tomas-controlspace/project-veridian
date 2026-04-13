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

export function passesFilters(m: MunicipioMetrics, filters: Filters): boolean {
  if (filters.pop_min != null && m.pop_2025 < filters.pop_min) return false;
  if (filters.pop_max != null && m.pop_2025 > filters.pop_max) return false;
  if (filters.income_min != null && (m.avg_total_income == null || m.avg_total_income < filters.income_min)) return false;
  if (filters.income_max != null && (m.avg_total_income == null || m.avg_total_income > filters.income_max)) return false;
  if (filters.price_min != null && (m.avg_price_sqm == null || m.avg_price_sqm < filters.price_min)) return false;
  if (filters.price_max != null && (m.avg_price_sqm == null || m.avg_price_sqm > filters.price_max)) return false;
  if (filters.rent_min != null && (m.avg_rent_sqm == null || m.avg_rent_sqm < filters.rent_min)) return false;
  if (filters.rent_max != null && (m.avg_rent_sqm == null || m.avg_rent_sqm > filters.rent_max)) return false;
  return true;
}
