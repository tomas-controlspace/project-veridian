export type GeoLevel = 'municipio' | 'provincia' | 'region';

// Region (CCAA-equivalent) — one record per top-level geography in the
// dataset. Currently 'PV' (Euskadi) and 'AN' (Málaga, will become
// Andalucía when other AN provincias are added).
export interface RegionConfig {
  code: string; // INE CCAA code: 'PV', 'AN', ...
  name: string; // 'Euskadi', 'Málaga'
  bounds: [[number, number], [number, number]]; // [[south, west], [north, east]] for Leaflet fitBounds
  default_metric?: string;
}

export interface MunicipioMetrics {
  ine_code: string;
  name: string;
  provincia_code: string;
  provincia_name: string;
  region_code: string;
  region_name: string;
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
  facility_count: number;
  ss_facility_count: number;
  constructed_area_sqm: number;
  nla_per_1000_households: number | null;
  operator_count: number;
  opportunity_score: number | null;
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
  catch_facility_count: number | null;
  catch_ss_facility_count: number | null;
  catch_nla_per_1000_hh: number | null;
  catch_opportunity_score: number | null;
  // Catchment area (20-min drive)
  catch20_pop: number | null;
  catch20_density: number | null;
  catch20_pop_growth: number | null;
  catch20_pct_apartment: number | null;
  catch20_pct_house: number | null;
  catch20_avg_surface_m2: number | null;
  catch20_pct_rented: number | null;
  catch20_pct_owned: number | null;
  catch20_avg_income: number | null;
  catch20_avg_price_sqm: number | null;
  catch20_avg_rent_sqm: number | null;
  catch20_housing_turnover: number | null;
  catch20_nla_sqm: number | null;
  catch20_nla_per_capita: number | null;
  catch20_pct_senior: number | null;
  catch20_pct_working: number | null;
  catch20_n_municipios: number | null;
  catch20_ine_codes: string[] | null;
  catch20_facility_count: number | null;
  catch20_ss_facility_count: number | null;
  catch20_nla_per_1000_hh: number | null;
  catch20_opportunity_score: number | null;
}

export interface ProvinciaMetrics {
  provincia_code: string;
  provincia_name: string;
  region_code: string;
  region_name: string;
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
  facility_count: number;
  ss_facility_count: number;
  constructed_area_sqm: number;
  nla_per_1000_households: number | null;
  operator_count: number;
  opportunity_score: number | null;
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
  catch_facility_count: number | null;
  catch_ss_facility_count: number | null;
  catch_nla_per_1000_hh: number | null;
  catch_opportunity_score: number | null;
  // Catchment area (20-min drive)
  catch20_pop: number | null;
  catch20_density: number | null;
  catch20_pop_growth: number | null;
  catch20_pct_apartment: number | null;
  catch20_pct_house: number | null;
  catch20_avg_surface_m2: number | null;
  catch20_pct_rented: number | null;
  catch20_pct_owned: number | null;
  catch20_avg_income: number | null;
  catch20_avg_price_sqm: number | null;
  catch20_avg_rent_sqm: number | null;
  catch20_housing_turnover: number | null;
  catch20_nla_sqm: number | null;
  catch20_nla_per_capita: number | null;
  catch20_pct_senior: number | null;
  catch20_pct_working: number | null;
  catch20_n_municipios: number | null;
  catch20_facility_count: number | null;
  catch20_ss_facility_count: number | null;
  catch20_nla_per_1000_hh: number | null;
  catch20_opportunity_score: number | null;
}

export interface RegionMetrics extends Omit<ProvinciaMetrics, 'provincia_code' | 'provincia_name'> {
  region_code: string;
  region_name: string;
}

// Legacy alias — most consumers should prefer RegionMetrics. Kept until
// downstream code (PPTX export, comparison panels) migrates fully.
export type EuskadiMetrics = RegionMetrics;

export type AreaMetrics = MunicipioMetrics | ProvinciaMetrics | RegionMetrics;

export interface MetricDef {
  key: string;
  label: string;
  format: 'number' | 'percent' | 'euro' | 'euro_sqm' | 'decimal';
  decimals?: number;
  suffix?: string;
}

export interface DrawnArea {
  id: string;
  name: string;
  polygon: [number, number][]; // [lat, lng] ring
  color: string;
  createdAt: number;
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
