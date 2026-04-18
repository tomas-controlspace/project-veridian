import type { MetricDef } from '@/types';

export const METRIC_DEFS: MetricDef[] = [
  { key: 'density_per_km2', label: 'Population Density (pop/km²)', format: 'number', decimals: 1 },
  { key: 'pop_growth_5yr_pct', label: 'Population Growth 5yr (%)', format: 'percent', decimals: 2 },
  { key: 'pct_apartment', label: '% Apartment', format: 'percent', decimals: 1 },
  { key: 'avg_surface_m2', label: 'Avg Housing Size (m²)', format: 'decimal', decimals: 1, suffix: ' m²' },
  { key: 'pct_rented', label: '% Rented', format: 'percent', decimals: 1 },
  { key: 'avg_total_income', label: 'Average Income (€)', format: 'euro', decimals: 0 },
  { key: 'avg_price_sqm', label: 'Purchase Price (€/m²)', format: 'euro_sqm', decimals: 0 },
  { key: 'avg_rent_sqm', label: 'Rent (€/m²/month)', format: 'euro_sqm', decimals: 2 },
  { key: 'pct_senior_65_plus', label: '% Senior 65+', format: 'percent', decimals: 1 },
  { key: 'pct_working_20_64', label: '% Working Age 20-64', format: 'percent', decimals: 1 },
  // Self-storage supply
  { key: 'facility_count', label: 'Facility Count', format: 'number', decimals: 0 },
  { key: 'nla_per_capita', label: 'NLA per Capita (m²)', format: 'decimal', decimals: 4 },
  { key: 'nla_per_1000_households', label: 'NLA per 1,000 Households (m²)', format: 'number', decimals: 1 },
  { key: 'nla_sqm', label: 'Total NLA (m²)', format: 'number', decimals: 0, suffix: ' m²' },
  // Opportunity
  { key: 'opportunity_score', label: 'Opportunity Score', format: 'number', decimals: 1 },
  // Catchment metrics
  { key: 'catchment_pop', label: 'Catchment Population (10min)', format: 'number', decimals: 0 },
  { key: 'catchment_density', label: 'Catchment Density (10min)', format: 'number', decimals: 1 },
  { key: 'catch_avg_income', label: 'Catchment Avg Income (€)', format: 'euro', decimals: 0 },
  { key: 'catch_facility_count', label: 'Catchment Facilities (10min)', format: 'number', decimals: 0 },
  { key: 'catch_nla_per_capita', label: 'Catchment NLA/Capita (10min)', format: 'decimal', decimals: 4 },
  { key: 'catch_opportunity_score', label: 'Catchment Opportunity (10min)', format: 'number', decimals: 1 },
];

export function formatValue(value: number | null | undefined, format: string, decimals = 1): string {
  if (value == null) return '—';
  switch (format) {
    case 'number':
      return value.toLocaleString('en-US', { maximumFractionDigits: decimals });
    case 'percent':
      return value.toFixed(decimals) + '%';
    case 'euro':
      return '€' + Math.round(value).toLocaleString('en-US');
    case 'euro_sqm':
      return '€' + value.toFixed(decimals);
    case 'decimal':
      return value.toFixed(decimals);
    default:
      return String(value);
  }
}

export function formatMetricValue(value: number | null | undefined, metricKey: string): string {
  const def = METRIC_DEFS.find(m => m.key === metricKey);
  if (!def) return value == null ? '—' : String(value);
  const formatted = formatValue(value, def.format, def.decimals);
  return def.suffix && value != null ? formatted + def.suffix : formatted;
}

// Color scale for choropleth
export function getColorScale(values: (number | null)[], steps = 7): { breaks: number[]; colors: string[] } {
  const valid = values.filter((v): v is number => v != null).sort((a, b) => a - b);
  if (valid.length === 0) return { breaks: [], colors: [] };

  // Veridian choropleth ramp
  const colors = [
    '#E8F5EE', '#A8DBBD', '#6BC495', '#40826D',
    '#2D6B55', '#1A4A3A', '#0E2F25',
  ];

  const breaks: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const idx = Math.min(Math.floor((i / steps) * valid.length), valid.length - 1);
    breaks.push(valid[idx]);
  }

  return { breaks, colors };
}

export function getColor(value: number | null, breaks: number[], colors: string[]): string {
  if (value == null || breaks.length === 0) return '#EDEEE9'; // --neutral-100
  for (let i = 0; i < colors.length; i++) {
    if (value <= breaks[i + 1]) return colors[i];
  }
  return colors[colors.length - 1];
}
