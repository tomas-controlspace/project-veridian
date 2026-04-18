export interface CompRow {
  label: string;
  key: string;
  format: string;
  decimals?: number;
  suffix?: string;
  info?: string;
}

export const POPULATION_ROWS: CompRow[] = [
  { label: 'Population', key: 'pop_2025', format: 'number', decimals: 0,
    info: 'Total registered population (INE Padrón 2025).' },
  { label: 'Density (pop/km²)', key: 'density_per_km2', format: 'number', decimals: 1,
    info: 'Population divided by municipal area in km².' },
  { label: 'Pop Growth 5yr (%)', key: 'pop_growth_5yr_pct', format: 'percent', decimals: 2,
    info: 'Percentage change in population from 2020 to 2025 (INE Padrón).' },
  { label: 'Avg Income (€)', key: 'avg_total_income', format: 'euro', decimals: 0,
    info: 'Average total personal income per year (EUSTAT 2023). Includes salary, pensions, and other income.' },
  { label: '% Working Age (20-64)', key: 'pct_working_20_64', format: 'percent', decimals: 1,
    info: 'Share of population aged 20-64 (INE Padrón 2025).' },
  { label: '% Senior (65+)', key: 'pct_senior_65_plus', format: 'percent', decimals: 1,
    info: 'Share of population aged 65 and over (INE Padrón 2025).' },
];

export const HOUSING_ROWS: CompRow[] = [
  { label: '% Apartment', key: 'pct_apartment', format: 'percent', decimals: 1,
    info: 'Dwellings in buildings with 3+ units as % of total family dwellings (EUSTAT 2023).' },
  { label: 'Avg Housing Size (m²)', key: 'avg_surface_m2', format: 'decimal', decimals: 1, suffix: ' m²',
    info: 'Average useful surface area per dwelling in m² (EUSTAT 2023).' },
  { label: '% Rented', key: 'pct_rented', format: 'percent', decimals: 1,
    info: 'Rented dwellings as % of total dwellings (Census 2021).' },
  { label: 'Purchase Price (€/m²)', key: 'avg_price_sqm', format: 'euro_sqm', decimals: 0,
    info: 'Average purchase price per m² (Basque Gov ECVI Q4 2025). Municipal data for 10 largest cities; provincial average for the rest.' },
  { label: 'Rent (€/m²/month)', key: 'avg_rent_sqm', format: 'euro_sqm', decimals: 2,
    info: 'Average residential rent per m²/month, size-adjusted (Basque Gov EMAL 2024). Includes new + renewed contracts.' },
  { label: 'Housing Turnover (annual)', key: 'housing_turnover', format: 'number', decimals: 0,
    info: 'Total housing transactions in this municipio (Ministerio de Vivienda, 2025 or 2024). Sum of quarterly data.' },
];

export const STORAGE_ROWS: CompRow[] = [
  { label: 'Facilities', key: 'facility_count', format: 'number', decimals: 0,
    info: 'Total number of self-storage and guardamuebles facilities in this municipio.' },
  { label: 'Self-storage only', key: 'ss_facility_count', format: 'number', decimals: 0,
    info: 'Number of self-storage facilities (excludes guardamuebles/moving companies).' },
  { label: 'Total NLA (m²)', key: 'nla_sqm', format: 'number', decimals: 0, suffix: ' m²',
    info: 'Total estimated Net Lettable Area across all self-storage facilities. Calculated as 65% of Catastro constructed area.' },
  { label: 'Constructed area (m²)', key: 'constructed_area_sqm', format: 'number', decimals: 0, suffix: ' m²',
    info: 'Total built area from Bizkaia Catastro records. Includes walls, corridors, common areas.' },
  { label: 'NLA per capita', key: 'nla_per_capita', format: 'decimal', decimals: 4,
    info: 'Self-storage NLA (m²) per person. European avg ~0.02, UK ~0.07, US ~0.75. Basque Country avg is ~0.03.' },
  { label: 'NLA / 1,000 households', key: 'nla_per_1000_households', format: 'number', decimals: 1, suffix: ' m²',
    info: 'Self-storage NLA (m²) per 1,000 households. Arguably more relevant than per-capita since storage demand is per-household.' },
  { label: 'Operators', key: 'operator_count', format: 'number', decimals: 0,
    info: 'Number of distinct storage operators in this municipio. Low count = concentrated market.' },
  { label: 'Opportunity score', key: 'opportunity_score', format: 'number', decimals: 1,
    info: 'Composite score 0-100. Combines population density (20%), apartment % (20%), NLA gap (25%), income (15%), growth (10%), and rental % (10%). Higher = better opportunity.' },
];

export const CATCHMENT_ROWS: CompRow[] = [
  { label: 'Catchment Population', key: 'catchment_pop', format: 'number', decimals: 0,
    info: 'Total population of all municipios whose boundaries overlap the 10-minute drive-time isochrone. Uses polygon intersection (not just centroids).' },
  { label: 'Density (pop/km²)', key: 'catchment_density', format: 'number', decimals: 1,
    info: 'Total catchment population divided by total catchment area (sum of all overlapping municipio areas).' },
  { label: 'Pop Growth 5yr (%)', key: 'catch_pop_growth', format: 'percent', decimals: 2,
    info: 'Population-weighted average of 5-year growth rates across all municipios in the catchment.' },
  { label: '% Apartment', key: 'catch_pct_apartment', format: 'percent', decimals: 1,
    info: 'Dwelling-weighted: total apartment dwellings ÷ total family dwellings across the catchment. Recomputed from raw counts, not averaged.' },
  { label: '% House', key: 'catch_pct_house', format: 'percent', decimals: 1,
    info: 'Dwelling-weighted: dwellings in 1-2 unit buildings ÷ total family dwellings across the catchment.' },
  { label: 'Avg Housing Size (m²)', key: 'catch_avg_surface_m2', format: 'decimal', decimals: 1, suffix: ' m²',
    info: 'Population-weighted average of useful surface area (m²) across municipios in the catchment.' },
  { label: '% Rented', key: 'catch_pct_rented', format: 'percent', decimals: 1,
    info: 'Dwelling-weighted: total rented dwellings ÷ total dwellings across the catchment. Recomputed from raw counts.' },
  { label: '% Owned', key: 'catch_pct_owned', format: 'percent', decimals: 1,
    info: 'Dwelling-weighted: total owned dwellings ÷ total dwellings across the catchment. Recomputed from raw counts.' },
  { label: 'Avg Income (€)', key: 'catch_avg_income', format: 'euro', decimals: 0,
    info: 'Population-weighted average income across all municipios in the catchment.' },
  { label: 'Purchase Price (€/m²)', key: 'catch_avg_price_sqm', format: 'euro_sqm', decimals: 0,
    info: 'Population-weighted average purchase price per m² across the catchment.' },
  { label: 'Rent (€/m²/month)', key: 'catch_avg_rent_sqm', format: 'euro_sqm', decimals: 2,
    info: 'Population-weighted average residential rent per m²/month across the catchment.' },
  { label: 'Housing Turnover (annual)', key: 'catch_housing_turnover', format: 'number', decimals: 0,
    info: 'Sum of annual housing transactions from all municipios in the catchment (Ministerio de Vivienda, 2025/2024).' },
  { label: 'NLA (m²)', key: 'catch_nla_sqm', format: 'number', decimals: 0, suffix: ' m²',
    info: 'Total self-storage NLA from all facilities in municipios that overlap the catchment area.' },
  { label: 'NLA per Capita', key: 'catch_nla_per_capita', format: 'decimal', decimals: 4,
    info: 'Total catchment NLA ÷ catchment population. Shows "—" if no facilities exist in the catchment. European average is ~0.02 m²/capita.' },
  { label: '# Municipios', key: 'catch_n_municipios', format: 'number', decimals: 0,
    info: 'Number of municipios whose boundary polygon intersects the 10-minute drive-time isochrone from the selected area\'s centroid.' },
  { label: 'Facilities (total)', key: 'catch_facility_count', format: 'number', decimals: 0,
    info: 'Total facilities in all municipios that overlap the 10-min drive-time isochrone.' },
  { label: 'NLA / 1,000 HH', key: 'catch_nla_per_1000_hh', format: 'number', decimals: 1, suffix: ' m²',
    info: 'Total catchment NLA per 1,000 households in the catchment area.' },
  { label: 'Opportunity score', key: 'catch_opportunity_score', format: 'number', decimals: 1,
    info: 'Population-weighted average opportunity score across all municipios in the 10-min catchment.' },
];
