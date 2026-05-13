'use client';

import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
  type Row,
} from '@tanstack/react-table';
import { useStore } from '@/lib/store';
import { formatValue } from '@/lib/metrics';

const PAGE_SIZE = 20;

// One config entry per metric that feeds opportunity_score. Weights and the
// inverted flag mirror the W{} block + nlaCapitaRank inversion in
// scripts/prepare-data.js — if either changes here the score formula has
// drifted from the docs.
type MetricCol = {
  key: string;
  header: string;
  weight: number;
  inverted?: boolean;
  format: 'number' | 'percent' | 'euro' | 'euro_sqm' | 'decimal';
  decimals: number;
};

const METRIC_COLS: MetricCol[] = [
  { key: 'catch_nla_per_capita', header: 'NLA/cap',    weight: 0.30, inverted: true, format: 'decimal',   decimals: 4 },
  { key: 'catchment_density',    header: 'Density',    weight: 0.20,                 format: 'number',    decimals: 0 },
  { key: 'catch_turnover_rate',  header: 'Turnover',   weight: 0.10,                 format: 'decimal',   decimals: 4 },
  { key: 'catch_avg_price_sqm',  header: 'Price €/m²', weight: 0.10,                 format: 'euro_sqm',  decimals: 0 },
  { key: 'catch_pop_growth',     header: 'Growth %',   weight: 0.10,                 format: 'percent',   decimals: 2 },
  { key: 'catch_pct_rented',     header: '% Rented',   weight: 0.10,                 format: 'percent',   decimals: 1 },
  { key: 'catch_avg_income',     header: 'Income €',   weight: 0.10,                 format: 'euro',      decimals: 0 },
];

// Mirrors rankNormalize() in scripts/prepare-data.js. Nulls coerce to 0 so the
// rank tooltips match what the pipeline actually used in the score.
function rankNormalize(values: (number | null)[], inverted: boolean): number[] {
  const n = values.length;
  if (n <= 1) return new Array(n).fill(0);
  const indexed = values.map((v, i) => ({ v: v ?? 0, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(n).fill(0);
  for (let k = 0; k < n; k++) ranks[indexed[k].i] = (k / (n - 1)) * 100;
  return inverted ? ranks.map(r => 100 - r) : ranks;
}

function numericSortBy(key: string) {
  return (a: Row<Record<string, unknown>>, b: Row<Record<string, unknown>>) => {
    const va = a.getValue(key) as number | null;
    const vb = b.getValue(key) as number | null;
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va - vb;
  };
}

const colHelper = createColumnHelper<Record<string, unknown>>();

function makeColumns(
  level: string,
  rankByKey: Record<string, Record<string, number>> | null,
) {
  const cols = [
    colHelper.accessor('name', {
      header: 'Name',
      cell: info => info.getValue() as string,
      size: 170,
    }),
  ];
  if (level === 'municipio') {
    cols.push(
      colHelper.accessor('provincia_name', {
        header: 'Provincia',
        cell: info => info.getValue() as string,
        size: 110,
      }),
    );
  }
  cols.push(
    colHelper.accessor('opportunity_score', {
      header: () => (
        <span title="Final score 0–100. Rank-normalised weighted sum of the 7 catchment metrics to the right.">
          Opp Score
        </span>
      ),
      cell: info => formatValue(info.getValue() as number | null, 'number', 1),
      sortingFn: numericSortBy('opportunity_score'),
      size: 95,
    }),
  );
  for (const c of METRIC_COLS) {
    const weightTxt = `Weight: ${(c.weight * 100).toFixed(0)}%${c.inverted ? ' • Inverted (lower raw value = higher rank contribution)' : ''}`;
    cols.push(
      colHelper.accessor(c.key, {
        header: () => <span title={weightTxt}>{c.header}</span>,
        cell: info => {
          const raw = info.getValue() as number | null;
          const txt = formatValue(raw, c.format, c.decimals);
          if (!rankByKey) return txt;
          const id = (info.row.original as { ine_code?: string }).ine_code;
          const rank = id ? rankByKey[c.key]?.[id] : undefined;
          if (rank == null) return txt;
          return (
            <span title={`Rank: ${rank.toFixed(0)} / 100  (raw: ${raw ?? 'null'})`}>
              {txt}
            </span>
          );
        },
        sortingFn: numericSortBy(c.key),
        size: 100,
      }),
    );
  }
  return cols;
}

export default function OpportunityTable() {
  const {
    level,
    filteredMunicipios,
    currentRegionProvincias,
    allMunicipiosGlobal,
    selectedIds,
    toggleSelection,
  } = useStore();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'opportunity_score', desc: true }]);

  const data = useMemo(() => {
    if (level === 'municipio') {
      // Only scored munis. Filter set already respects sidebar filters.
      return filteredMunicipios.filter(m => m.opportunity_score != null) as unknown as Record<
        string,
        unknown
      >[];
    }
    if (level === 'provincia') {
      return currentRegionProvincias.map(p => ({ ...p, name: p.provincia_name })) as unknown as Record<
        string,
        unknown
      >[];
    }
    return [];
  }, [level, filteredMunicipios, currentRegionProvincias]);

  // Compute rank tooltips over the GLOBAL scored set so percentiles match the
  // pipeline (rank-normalised across all 228 scored munis across regions).
  // No rank tooltips for provincia level — 4 rows is not a meaningful percentile.
  const rankByKey = useMemo(() => {
    if (level !== 'municipio') return null;
    const scoredGlobal = allMunicipiosGlobal.filter(m => m.opportunity_score != null);
    const out: Record<string, Record<string, number>> = {};
    for (const c of METRIC_COLS) {
      const vals = scoredGlobal.map(
        m => (m as unknown as Record<string, number | null>)[c.key] ?? null,
      );
      const ranks = rankNormalize(vals, c.inverted ?? false);
      const byIne: Record<string, number> = {};
      for (let i = 0; i < scoredGlobal.length; i++) byIne[scoredGlobal[i].ine_code] = ranks[i];
      out[c.key] = byIne;
    }
    return out;
  }, [allMunicipiosGlobal, level]);

  const columns = useMemo(() => makeColumns(level, rankByKey), [level, rankByKey]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  const getRowId = (row: Record<string, unknown>) => {
    if (level === 'municipio') return row.ine_code as string;
    if (level === 'provincia') return row.provincia_code as string;
    return '';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0" style={{ background: '#2A2D26', zIndex: 1 }}>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="text-left px-3 py-2 cursor-pointer whitespace-nowrap"
                    style={{ width: header.column.getSize(), color: '#fff', fontWeight: 600, fontSize: 13 }}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => {
              const rowId = getRowId(row.original);
              const isSelected = selectedIds.includes(rowId);
              return (
                <tr
                  key={row.id}
                  onClick={() => toggleSelection(rowId)}
                  className="cursor-pointer transition-colors"
                  style={{
                    borderBottom: '0.5px solid var(--neutral-100)',
                    background: isSelected ? '#2EC4A0' : 'transparent',
                    color: isSelected ? '#fff' : '#2A2D26',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = '#5A5D56';
                      e.currentTarget.style.color = '#fff';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#2A2D26';
                    }
                  }}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      className="px-3 py-1.5 font-mono whitespace-nowrap"
                      style={{ color: 'inherit', fontWeight: 500, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="flex items-center justify-between px-3 py-2 text-xs"
        style={{ borderTop: '0.5px solid var(--neutral-200)', background: 'var(--neutral-50)' }}
      >
        <span style={{ color: 'var(--neutral-500)' }}>
          {data.length} {level === 'municipio' ? 'scored municipios' : 'provincias'}
          {' '}
          {level === 'municipio' && '(catchment-based score)'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-2 py-1 disabled:opacity-30"
            style={{ borderRadius: 'var(--radius-md)', border: '0.5px solid var(--neutral-200)', color: 'var(--neutral-800)' }}
          >
            Prev
          </button>
          <span style={{ color: 'var(--neutral-600)' }}>
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
          </span>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-2 py-1 disabled:opacity-30"
            style={{ borderRadius: 'var(--radius-md)', border: '0.5px solid var(--neutral-200)', color: 'var(--neutral-800)' }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
