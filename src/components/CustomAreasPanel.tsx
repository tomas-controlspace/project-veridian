'use client';

import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { formatValue } from '@/lib/metrics';
import {
  POPULATION_ROWS,
  HOUSING_ROWS,
  STORAGE_ROWS,
  type CompRow,
} from '@/lib/comparisonRows';
import { computeAreaMetrics, type CustomAreaMetrics } from '@/lib/customAreaMetrics';
import type { DrawnArea } from '@/types';
import * as topojsonClient from 'topojson-client';

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; flipUp: boolean }>({ x: 0, y: 0, flipUp: false });
  const iconRef = useRef<HTMLSpanElement>(null);

  const handleEnter = useCallback(() => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipUp = spaceBelow < 140;
      setPos({ x: rect.left, y: flipUp ? rect.top : rect.bottom, flipUp });
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
            ...(pos.flipUp ? { bottom: window.innerHeight - pos.y + 6 } : { top: pos.y + 6 }),
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

function getVal(data: Record<string, unknown> | null, key: string): number | null {
  if (!data) return null;
  const v = data[key];
  return typeof v === 'number' ? v : null;
}

function CompTable({
  title,
  rows,
  areas,
  regionData,
  regionLabel,
}: {
  title: string;
  rows: CompRow[];
  areas: { area: DrawnArea; metrics: CustomAreaMetrics }[];
  regionData: Record<string, unknown> | null;
  regionLabel: string;
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
      >
        {title}
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--neutral-200)' }}>
              <th className="text-left py-1.5 pr-4" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 13 }}>
                Metric
              </th>
              {areas.map(({ area }) => (
                <th
                  key={area.id}
                  className="text-right py-1.5 px-2 min-w-[110px]"
                  style={{ color: '#2A2D26', fontWeight: 600, fontSize: 13 }}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: area.color,
                        display: 'inline-block',
                      }}
                    />
                    <span>{area.name}</span>
                  </div>
                </th>
              ))}
              <th className="text-right py-1.5 pl-2 min-w-[100px]" style={{ color: '#5A5D56', fontWeight: 500, fontSize: 13 }}>
                {regionLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const euskadiVal = getVal(regionData, row.key);
              return (
                <tr key={row.key} style={{ borderBottom: '0.5px solid var(--neutral-100)' }}>
                  <td className="py-1.5 pr-4 whitespace-nowrap" style={{ color: '#5A5D56', fontSize: 13 }}>
                    {row.label}
                    {row.info && <InfoTip text={row.info} />}
                  </td>
                  {areas.map(({ area, metrics }) => {
                    const val = getVal(metrics as unknown as Record<string, unknown>, row.key);
                    const formatted = formatValue(val, row.format, row.decimals);
                    return (
                      <td
                        key={area.id}
                        className="text-right py-1.5 px-2 font-mono"
                        style={{ color: '#2A2D26', fontWeight: 500, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
                      >
                        {formatted}{row.suffix && val != null ? row.suffix : ''}
                      </td>
                    );
                  })}
                  <td
                    className="text-right py-1.5 pl-2 font-mono"
                    style={{ color: '#5A5D56', fontWeight: 400, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatValue(euskadiVal, row.format, row.decimals)}
                    {row.suffix && euskadiVal != null ? row.suffix : ''}
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

export default function CustomAreasPanel() {
  const {
    drawnAreas, municipios, boundariesMuni, currentRegionMetrics, currentRegionConfig, clearDrawnAreas,
  } = useStore();

  // Convert topojson boundaries → geojson once (memoized on boundariesMuni identity)
  const boundariesGeoJSON = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!boundariesMuni) return null;
    const topo = boundariesMuni as unknown as {
      objects: Record<string, unknown>;
    };
    const objectName = Object.keys(topo.objects)[0];
    if (!objectName) return null;
    return topojsonClient.feature(
      topo as Parameters<typeof topojsonClient.feature>[0],
      (topo.objects as Record<string, Parameters<typeof topojsonClient.feature>[1]>)[objectName],
    ) as unknown as GeoJSON.FeatureCollection;
  }, [boundariesMuni]);

  // Compute metrics for each area — memoized per area id + polygon identity
  const areasWithMetrics = useMemo(() => {
    if (!boundariesGeoJSON) return [] as { area: DrawnArea; metrics: CustomAreaMetrics }[];
    return drawnAreas.map(area => ({
      area,
      metrics: computeAreaMetrics(area.polygon, municipios, boundariesGeoJSON),
    }));
  }, [drawnAreas, municipios, boundariesGeoJSON]);

  const regionData = currentRegionMetrics as unknown as Record<string, unknown> | null;
  const regionLabel = currentRegionConfig.name;

  if (drawnAreas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm gap-3 px-6 text-center" style={{ color: 'var(--neutral-400)' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.4 }}>
          <path d="M2 3h4v1h8V3h4v3.73L22.5 10l-1.75.95 1.2 2.27-1.77.93-1.19-2.24L17 13V7h-1.06L14 10.16v3.21L18.21 17H21v4h-4v-1H6v1H2v-4h1V7H2V3Zm4 15h10.3l-4.64-4H10v-4h1.75L14 6.34V6H6v1H5v10h1v1Z" />
        </svg>
        <p>
          Draw up to 4 custom areas on the map to compare them.
          <br />Use the draw-polygon button in the top-right of the map.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: '#547d74' }}>
          Comparing {drawnAreas.length} custom area{drawnAreas.length > 1 ? 's' : ''}
        </h3>
        <button
          onClick={() => {
            if (window.confirm(`Clear all ${drawnAreas.length} drawn area${drawnAreas.length > 1 ? 's' : ''}?`)) {
              clearDrawnAreas();
            }
          }}
          className="text-xs px-2 py-1"
          style={{ color: 'var(--danger)', borderRadius: 'var(--radius-md)' }}
        >
          Clear all
        </button>
      </div>

      {/* Area-count summary */}
      <div className="flex flex-wrap gap-1.5">
        {areasWithMetrics.map(({ area, metrics }) => (
          <div
            key={area.id}
            className="flex items-center gap-1.5 text-xs"
            style={{
              border: `1px solid ${area.color}`,
              borderRadius: 4,
              padding: '2px 8px',
              background: '#fff',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: area.color }} />
            <span style={{ fontWeight: 600, color: '#2A2D26' }}>{area.name}</span>
            <span style={{ color: '#5A5D56' }}>
              {metrics.municipio_count} municipio{metrics.municipio_count === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </div>

      <CompTable
        title="Population & Economy"
        rows={POPULATION_ROWS}
        areas={areasWithMetrics}
        regionData={regionData}
        regionLabel={regionLabel}
      />
      <CompTable
        title="Housing Market"
        rows={HOUSING_ROWS}
        areas={areasWithMetrics}
        regionData={regionData}
        regionLabel={regionLabel}
      />
      <CompTable
        title="Self-Storage Market"
        rows={STORAGE_ROWS}
        areas={areasWithMetrics}
        regionData={regionData}
        regionLabel={regionLabel}
      />

      <p className="text-xs pt-2" style={{ color: '#8A8D86' }}>
        Each custom area aggregates all municipios whose boundary intersects the drawn polygon.
        Sums add up entire municipios (no partial clipping). Percentages are dwelling-weighted;
        income, price, rent, and opportunity score are population-weighted.
      </p>
    </div>
  );
}
