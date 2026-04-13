'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { formatValue } from '@/lib/metrics';

interface CompRow {
  label: string;
  key: string;
  format: string;
  decimals?: number;
  suffix?: string;
  info?: string;
}

// ── Info icon with hover tooltip (fixed-position to avoid clipping) ─
import { useRef, useCallback } from 'react';

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; flipUp: boolean }>({ x: 0, y: 0, flipUp: false });
  const iconRef = useRef<HTMLSpanElement>(null);

  const handleEnter = useCallback(() => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < 140;
      setPos({
        x: rect.left,
        y: flipUp ? rect.top : rect.bottom,
        flipUp,
      });
    }
    setShow(true);
  }, []);

  return (
    <span
      className="relative inline-flex ml-1"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      <span
        ref={iconRef}
        className="w-3.5 h-3.5 rounded-full text-[9px] font-bold inline-flex items-center justify-center leading-none cursor-help select-none shrink-0"
        style={{ background: 'var(--neutral-200)', color: 'var(--neutral-500)' }}
      >
        i
      </span>
      {show && (
        <div
          className="fixed z-[9999] px-3 py-2.5 text-[11px] leading-[1.6] pointer-events-none"
          style={{
            left: Math.min(pos.x, window.innerWidth - 280),
            ...(pos.flipUp
              ? { bottom: window.innerHeight - pos.y + 6 }
              : { top: pos.y + 6 }),
            minWidth: 160,
            maxWidth: 260,
            background: '#fff',
            color: 'var(--neutral-600)',
            border: '0.5px solid var(--neutral-200)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {text}
        </div>
      )}
    </span>
  );
}

// ── Metric row definitions ──────────────────────────────────────────

const POPULATION_ROWS: CompRow[] = [
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

const HOUSING_ROWS: CompRow[] = [
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

const STORAGE_ROWS: CompRow[] = [
  { label: 'NLA (m²)', key: 'nla_sqm', format: 'number', decimals: 0, suffix: ' m²',
    info: 'Total Net Lettable Area of self-storage facilities located in this municipio.' },
  { label: 'NLA per Capita', key: 'nla_per_capita', format: 'decimal', decimals: 4,
    info: 'Self-storage NLA (m²) divided by municipal population. European average is ~0.02 m²/capita.' },
];

const CATCHMENT_ROWS: CompRow[] = [
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
];

// ── Helper ──────────────────────────────────────────────────────────

function getVal(data: Record<string, unknown> | null, key: string): number | null {
  if (!data) return null;
  const v = data[key];
  return typeof v === 'number' ? v : null;
}

// ── Comparison table component ──────────────────────────────────────

function CompTable({
  title,
  rows,
  areas,
  areaNames,
  euskadiData,
}: {
  title: string;
  rows: CompRow[];
  areas: (Record<string, unknown> | null)[];
  areaNames: string[];
  euskadiData: Record<string, unknown> | null;
}) {
  return (
    <div>
      <h4
        className="text-xs font-semibold uppercase mb-2"
        style={{
          color: 'var(--neutral-800)',
          letterSpacing: '0.5px',
          borderLeft: '3px solid var(--veridian-300)',
          paddingLeft: 8,
        }}
      >{title}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--neutral-200)' }}>
              <th className="text-left py-1.5 pr-4" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 13 }}>Metric</th>
              {areaNames.map((name, i) => (
                <th key={i} className="text-right py-1.5 px-2 min-w-[100px]" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 13 }}>
                  {name}
                </th>
              ))}
              <th className="text-right py-1.5 pl-2 min-w-[100px]" style={{ color: '#5A5D56', fontWeight: 500, fontSize: 13 }}>
                Euskadi
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const euskadiVal = getVal(euskadiData, row.key);
              return (
                <tr key={row.key} style={{ borderBottom: '0.5px solid var(--neutral-100)' }}>
                  <td className="py-1.5 pr-4 whitespace-nowrap" style={{ color: '#5A5D56', fontSize: 13 }}>
                    {row.label}
                    {row.info && <InfoTip text={row.info} />}
                  </td>
                  {areas.map((area, i) => {
                    const val = getVal(area, row.key);
                    const formatted = formatValue(val, row.format, row.decimals);
                    return (
                      <td key={i} className="text-right py-1.5 px-2 font-mono" style={{ color: '#2A2D26', fontWeight: 500, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                        {formatted}{row.suffix && val != null ? row.suffix : ''}
                      </td>
                    );
                  })}
                  <td className="text-right py-1.5 pl-2 font-mono" style={{ color: '#5A5D56', fontWeight: 400, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    {formatValue(euskadiVal, row.format, row.decimals)}{row.suffix && euskadiVal != null ? row.suffix : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function ComparisonPanel() {
  const { selectedIds, municipios, provincias, euskadi, level, clearSelection } = useStore();

  const { areas, names } = useMemo(() => {
    const areaList: (Record<string, unknown> | null)[] = [];
    const nameList: string[] = [];

    for (const id of selectedIds) {
      if (level === 'municipio') {
        const m = municipios[id];
        if (m) {
          areaList.push(m as unknown as Record<string, unknown>);
          nameList.push(m.name);
        }
      } else if (level === 'provincia') {
        const p = provincias[id];
        if (p) {
          areaList.push(p as unknown as Record<string, unknown>);
          nameList.push(p.provincia_name);
        }
      }
    }

    return { areas: areaList, names: nameList };
  }, [selectedIds, municipios, provincias, level]);

  const euskadiData = euskadi as unknown as Record<string, unknown> | null;

  const hasNLA = areas.some(a => a && a.nla_sqm != null);
  const hasCatchment = areas.some(a => a && a.catchment_pop != null);

  if (selectedIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--neutral-400)' }}>
        Click on the map to select areas for comparison (up to 4)
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--neutral-800)' }}>
          Comparing {names.length} area{names.length > 1 ? 's' : ''}
        </h3>
        <button
          onClick={clearSelection}
          className="text-xs px-2 py-1"
          style={{ color: 'var(--danger)', borderRadius: 'var(--radius-md)' }}
        >
          Clear selection
        </button>
      </div>

      <CompTable title="Population & Economy" rows={POPULATION_ROWS} areas={areas} areaNames={names} euskadiData={euskadiData} />
      <CompTable title="Housing Market" rows={HOUSING_ROWS} areas={areas} areaNames={names} euskadiData={euskadiData} />
      {hasNLA && (
        <CompTable title="Self-Storage Market" rows={STORAGE_ROWS} areas={areas} areaNames={names} euskadiData={euskadiData} />
      )}
      {hasCatchment && (
        <CompTable title="Catchment Area (10-min Drive)" rows={CATCHMENT_ROWS} areas={areas} areaNames={names} euskadiData={euskadiData} />
      )}
    </div>
  );
}
