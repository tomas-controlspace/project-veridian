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
} from '@tanstack/react-table';
import { useStore } from '@/lib/store';
import { formatValue } from '@/lib/metrics';
import type { MunicipioMetrics, ProvinciaMetrics } from '@/types';

const PAGE_SIZE = 20;

const colHelper = createColumnHelper<Record<string, unknown>>();

function makeColumns(level: string) {
  const cols = [
    colHelper.accessor('name', {
      header: 'Name',
      cell: info => info.getValue() as string,
      size: 160,
    }),
  ];

  if (level === 'municipio') {
    cols.push(
      colHelper.accessor('provincia_name', {
        header: 'Provincia',
        cell: info => info.getValue() as string,
        size: 100,
      })
    );
  }

  const numCols: { key: string; header: string; format: string; decimals: number }[] = [
    { key: 'pop_2025', header: 'Population', format: 'number', decimals: 0 },
    { key: 'density_per_km2', header: 'Density', format: 'number', decimals: 1 },
    { key: 'pop_growth_5yr_pct', header: 'Growth %', format: 'percent', decimals: 2 },
    { key: 'avg_total_income', header: 'Income €', format: 'euro', decimals: 0 },
    { key: 'avg_price_sqm', header: 'Price €/m²', format: 'euro_sqm', decimals: 0 },
    { key: 'avg_rent_sqm', header: 'Rent €/m²', format: 'euro_sqm', decimals: 2 },
    { key: 'pct_apartment', header: '% Apt', format: 'percent', decimals: 1 },
    { key: 'pct_rented', header: '% Rented', format: 'percent', decimals: 1 },
    { key: 'avg_surface_m2', header: 'Avg m²', format: 'decimal', decimals: 1 },
    { key: 'pct_senior_65_plus', header: '% 65+', format: 'percent', decimals: 1 },
    { key: 'catchment_pop', header: 'Catch. Pop', format: 'number', decimals: 0 },
    { key: 'catch_avg_income', header: 'Catch. Inc €', format: 'euro', decimals: 0 },
    { key: 'catch_pct_rented', header: 'Catch. %Rent', format: 'percent', decimals: 1 },
    { key: 'facility_count', header: 'Facilities', format: 'number', decimals: 0 },
    { key: 'nla_sqm', header: 'NLA (m²)', format: 'number', decimals: 0 },
    { key: 'nla_per_capita', header: 'NLA/cap', format: 'decimal', decimals: 4 },
    { key: 'opportunity_score', header: 'Opp. Score', format: 'number', decimals: 1 },
  ];

  for (const c of numCols) {
    cols.push(
      colHelper.accessor(c.key, {
        header: c.header,
        cell: info => formatValue(info.getValue() as number | null, c.format, c.decimals),
        sortingFn: (a, b) => {
          const va = a.getValue(c.key) as number | null;
          const vb = b.getValue(c.key) as number | null;
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          return va - vb;
        },
        size: 90,
      })
    );
  }

  return cols;
}

export default function RankingTable() {
  const { level, filteredMunicipios, provincias, selectedIds, toggleSelection } = useStore();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'pop_2025', desc: true }]);

  const data = useMemo(() => {
    if (level === 'municipio') {
      return filteredMunicipios as unknown as Record<string, unknown>[];
    } else if (level === 'provincia') {
      return Object.values(provincias).map(p => ({
        ...p,
        name: p.provincia_name,
      })) as unknown as Record<string, unknown>[];
    }
    return [];
  }, [level, filteredMunicipios, provincias]);

  const columns = useMemo(() => makeColumns(level), [level]);

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
                      {{
                        asc: ' ↑',
                        desc: ' ↓',
                      }[header.column.getIsSorted() as string] ?? ''}
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
                    <td key={cell.id} className="px-3 py-1.5 font-mono whitespace-nowrap" style={{ color: 'inherit', fontWeight: 500, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-3 py-2 text-xs" style={{ borderTop: '0.5px solid var(--neutral-200)', background: 'var(--neutral-50)' }}>
        <span style={{ color: 'var(--neutral-500)' }}>
          {data.length} {level === 'municipio' ? 'municipios' : 'provincias'}
          {data.length !== table.getPrePaginationRowModel().rows.length ? ' (filtered)' : ''}
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
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
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
