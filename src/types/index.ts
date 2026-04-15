export type GeoLevel = 'municipio' | 'provincia' | 'euskadi';

export interface MunicipioMetrics {
  ine_code: string;
  name: string;
  provincia_code: string;
  provincia_name: string;
  area_km2: number;
  pop_2025: number;
  pop_2024: number;
  pop_growth_5yr_pct: number | null;
  density_per_km2: number | null;
  pct_young_0_19: number | null;
  pct_working_20_64: number | null;
  pct_senior_65_plus: number | null;
  avg_total_income: number | null;
  avg_available_income: number | null;
  total_dwellings: number | null;
  pct_rented: number | null;
  pct_owned: number | null;
  pct_apartment: number | null;
  pct_house: number | null;
  total_family_dwellings: number | null;
  avg_surface_m2: number | null;
  avg_price_sqm: number | null;
  price_source?: string;
  avg_rent_sqm: number | null;
  avg_rent_sqm_active: number | null;
  housing_turnover_annual_prov: number | null;
  nla_sqm: number | null;
  nla_per_capita: number | null;
  // Catchment area (10-min drive)
  catchment_pop: number | null;
  catchment_density: number | null;
  catch_pop_growth: number | null;
  catch_pct_apartment: number | null;
  catch_pct_house: number | null;
  catch_avg_surface_m2: number | null;
  catch_pct_rented: number | null;
  catch_pct_owned: number | null;
  catch_avg_income: number | null;
  catch_avg_price_sqm: number | null;
  catch_avg_rent_sqm: number | null;
  catch_housing_turnover: number | null;
  catch_nla_sqm: number | null;
  catch_nla_per_capita: number | null;
  catch_pct_senior: number | null;
  catch_pct_working: number | null;
  catch_n_municipios: number | null;
  catch_ine_codes: string[] | null;
}

export interface ProvinciaMetrics {
  provincia_code: string;
  provincia_name: string;
  pop_2025: number;
  pop_2024: number;
  area_km2: number;
  density_per_km2: number | null;
  pop_growth_5yr_pct: number | null;
  pct_young_0_19: number | null;
  pct_working_20_64: number | null;
  pct_senior_65_plus: number | null;
  avg_total_income: number | null;
  avg_available_income: number | null;
  total_dwellings: number;
  pct_rented: number | null;
  pct_owned: number | null;
  pct_apartment: number | null;
  pct_house: number | null;
  total_family_dwellings: number;
  avg_surface_m2: number | null;
  avg_price_sqm: number | null;
  avg_rent_sqm: number | null;
  avg_rent_sqm_active: number | null;
  housing_turnover_annual_prov: number | null;
  nla_sqm: number | null;
  nla_per_capita: number | null;
  // Catchment area (10-min drive)
  catchment_pop: number | null;
  catchment_density: number | null;
  catch_pop_growth: number | null;
  catch_pct_apartment: number | null;
  catch_pct_house: number | null;
  catch_avg_surface_m2: number | null;
  catch_pct_rented: number | null;
  catch_pct_owned: number | null;
  catch_avg_income: number | null;
  catch_avg_price_sqm: number | null;
  catch_avg_rent_sqm: number | null;
  catch_housing_turnover: number | null;
  catch_nla_sqm: number | null;
  catch_nla_per_capita: number | null;
  catch_pct_senior: number | null;
  catch_pct_working: number | null;
  catch_n_municipios: number | null;
}

export interface EuskadiMetrics extends Omit<ProvinciaMetrics, 'provincia_code' | 'provincia_name'> {
  name: string;
}

export type AreaMetrics = MunicipioMetrics | ProvinciaMetrics | EuskadiMetrics;

export interface MetricDef {
  key: string;
  label: string;
  format: 'number' | 'percent' | 'euro' | 'euro_sqm' | 'decimal';
  decimals?: number;
  suffix?: string;
}

export interface Filters {
  pop_min: number | null;
  pop_max: number | null;
  income_min: number | null;
  income_max: number | null;
  price_min: number | null;
  price_max: number | null;
  rent_min: number | null;
  rent_max: number | null;
}
