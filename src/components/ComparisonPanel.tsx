'use client';

import React, { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { formatValue } from '@/lib/metrics';
import {
  POPULATION_ROWS,
  HOUSING_ROWS,
  STORAGE_ROWS,
  CATCHMENT_ROWS,
  type CompRow,
} from '@/lib/comparisonRows';

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
          color: '#409b7e',
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

// ── Catchment dual table (10-min vs 20-min side by side) ───────────

function toKey20(key10: string): string {
  if (key10.startsWith('catchment_')) return 'catch20_' + key10.slice('catchment_'.length);
  if (key10.startsWith('catch_')) return 'catch20_' + key10.slice('catch_'.length);
  return key10;
}

function CatchmentDualTable({
  rows,
  areas,
  areaNames,
  euskadiData,
}: {
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
          color: '#409b7e',
          letterSpacing: '0.5px',
          borderLeft: '3px solid var(--veridian-300)',
          paddingLeft: 8,
        }}
      >Catchment Area</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {/* Top row: area names */}
            <tr style={{ borderBottom: '0.5px solid var(--neutral-200)' }}>
              <th className="text-left py-1.5 pr-4" rowSpan={2} style={{ color: '#2A2D26', fontWeight: 600, fontSize: 13, verticalAlign: 'bottom' }}>
                Metric
              </th>
              {areaNames.map((name, i) => (
                <th key={i} colSpan={2} className="text-center py-1 px-1" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 12, borderBottom: 'none' }}>
                  {name}
                </th>
              ))}
              <th colSpan={2} className="text-center py-1 px-1" style={{ color: '#5A5D56', fontWeight: 500, fontSize: 12, borderBottom: 'none' }}>
                Euskadi
              </th>
            </tr>
            {/* Sub-header row: 10 min / 20 min */}
            <tr style={{ borderBottom: '1px solid var(--neutral-200)' }}>
              {[...areaNames, 'Euskadi'].map((_, i) => (
                <React.Fragment key={i}>
                  <th className="text-right px-1.5 py-1" style={{ color: '#E8913A', fontWeight: 600, fontSize: 10, minWidth: 55 }}>
                    10 min
                  </th>
                  <th className="text-right px-1.5 py-1" style={{ color: '#C4782E', fontWeight: 500, fontSize: 10, minWidth: 55 }}>
                    20 min
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const key20 = toKey20(row.key);
              const euskadi10 = getVal(euskadiData, row.key);
              const euskadi20 = getVal(euskadiData, key20);
              return (
                <tr key={row.key} style={{ borderBottom: '0.5px solid var(--neutral-100)' }}>
                  <td className="py-1.5 pr-4 whitespace-nowrap" style={{ color: '#5A5D56', fontSize: 12 }}>
                    {row.label}
                    {row.info && <InfoTip text={row.info} />}
                  </td>
                  {areas.map((area, i) => {
                    const val10 = getVal(area, row.key);
                    const val20 = getVal(area, key20);
                    return (
                      <React.Fragment key={i}>
                        <td className="text-right py-1.5 px-1.5 font-mono" style={{ color: '#2A2D26', fontWeight: 500, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                          {formatValue(val10, row.format, row.decimals)}{row.suffix && val10 != null ? row.suffix : ''}
                        </td>
                        <td className="text-right py-1.5 px-1.5 font-mono" style={{ color: '#5A5D56', fontWeight: 400, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                          {formatValue(val20, row.format, row.decimals)}{row.suffix && val20 != null ? row.suffix : ''}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  <td className="text-right py-1.5 px-1.5 font-mono" style={{ color: '#5A5D56', fontWeight: 400, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {formatValue(euskadi10, row.format, row.decimals)}{row.suffix && euskadi10 != null ? row.suffix : ''}
                  </td>
                  <td className="text-right py-1.5 px-1.5 font-mono" style={{ color: '#5A5D56', fontWeight: 400, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {formatValue(euskadi20, row.format, row.decimals)}{row.suffix && euskadi20 != null ? row.suffix : ''}
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

  const hasNLA = areas.some(a => a && (a.facility_count != null || a.nla_sqm != null));
  const hasCatchment = areas.some(a => a && (a.catchment_pop != null || a.catch20_pop != null));

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
        <h3 className="text-sm font-semibold" style={{ color: '#547d74' }}>
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
        <CatchmentDualTable rows={CATCHMENT_ROWS} areas={areas} areaNames={names} euskadiData={euskadiData} />
      )}
    </div>
  );
}
