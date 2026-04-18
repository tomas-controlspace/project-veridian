'use client';

import { useMemo, useEffect } from 'react';
import { useStore, Facility } from '@/lib/store';
import { formatValue } from '@/lib/metrics';
import { pointInPolygon } from '@/lib/geo';
import type { DrawnArea } from '@/types';

interface FacilityWithZone extends Facility {
  zone?: '10 min' | '10-20 min';
}

function ZoneBadge({ zone }: { zone: '10 min' | '10-20 min' }) {
  const is10 = zone === '10 min';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        background: is10 ? 'rgba(232, 145, 58, 0.25)' : 'rgba(232, 145, 58, 0.12)',
        color: is10 ? '#B5651D' : '#C4782E',
      }}
    >
      {zone}
    </span>
  );
}

function FacilitySummaryCards({ facilities }: { facilities: (FacilityWithZone | Facility)[] }) {
  const ssCount = facilities.filter(f => (f as FacilityWithZone).facility_type !== 'guardamuebles').length;
  const gmCount = facilities.length - ssCount;
  const totalNLA = facilities.reduce((sum, f) => sum + (f.nla_sqm || 0), 0);
  const avgNLA = facilities.length > 0 ? totalNLA / facilities.length : 0;

  const cards = [
    { label: 'Total Facilities', value: `${facilities.length}`, sub: `${ssCount} self-storage, ${gmCount} guardamuebles` },
    { label: 'Total NLA', value: `${formatValue(totalNLA, 'number', 0)} m²`, sub: null },
    { label: 'Avg Facility NLA', value: `${formatValue(avgNLA, 'number', 0)} m²`, sub: null },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 mb-3">
      {cards.map((c, i) => (
        <div key={i} className="p-2 rounded-md" style={{ background: '#F5F6F2', border: '0.5px solid #D5D7D0' }}>
          <div style={{ fontSize: 10, color: '#5A5D56', fontWeight: 500 }}>{c.label}</div>
          <div style={{ fontSize: 14, color: '#2A2D26', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
          {c.sub && <div style={{ fontSize: 9, color: '#8A8D86', marginTop: 1 }}>{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function FacilitiesTable({ facilities, areaName, showZone = false, color }: { facilities: FacilityWithZone[]; areaName: string; showZone?: boolean; color?: string }) {
  const totalNLA = facilities.reduce((sum, f) => sum + (f.nla_sqm || 0), 0);

  return (
    <div>
      <h4
        className="text-xs font-semibold uppercase mb-2"
        style={{
          color: color || '#409b7e',
          letterSpacing: '0.5px',
          borderLeft: `3px solid ${color || 'var(--veridian-300)'}`,
          paddingLeft: 8,
        }}
      >
        {areaName}
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--neutral-200)' }}>
              <th className="text-left py-1.5 pr-2" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 12 }}>Name</th>
              <th className="text-left py-1.5 pr-2" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 12 }}>Operator</th>
              <th className="text-right py-1.5 px-2" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 12 }}>NLA (m²)</th>
              {showZone && (
                <th className="text-center py-1.5 px-2" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 12 }}>Zone</th>
              )}
            </tr>
          </thead>
          <tbody>
            {facilities.map((f, i) => (
              <tr key={i} style={{ borderBottom: '0.5px solid var(--neutral-100)' }}>
                <td className="py-1.5 pr-2 whitespace-nowrap" style={{ color: '#5A5D56', fontSize: 12 }}>
                  {f.name}
                </td>
                <td className="py-1.5 pr-2 whitespace-nowrap" style={{ color: '#5A5D56', fontSize: 12 }}>
                  {f.operator}
                </td>
                <td className="text-right py-1.5 px-2 font-mono" style={{ color: '#2A2D26', fontWeight: 500, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                  {f.nla_sqm > 0 ? formatValue(f.nla_sqm, 'number', 0) : '—'}
                </td>
                {showZone && f.zone && (
                  <td className="text-center py-1.5 px-2">
                    <ZoneBadge zone={f.zone} />
                  </td>
                )}
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--neutral-300)' }}>
              <td colSpan={showZone ? 2 : 2} className="py-1.5 pr-2 font-semibold" style={{ color: '#2A2D26', fontSize: 12 }}>
                Total ({facilities.length} facilities)
              </td>
              <td className="text-right py-1.5 px-2 font-mono font-semibold" style={{ color: '#2A2D26', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                {formatValue(totalNLA, 'number', 0)} m²
              </td>
              {showZone && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Mode toggle ────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: 'catchment' | 'custom'; onChange: (m: 'catchment' | 'custom') => void }) {
  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px',
    fontSize: 11,
    fontWeight: active ? 600 : 400,
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    background: active ? '#7C3AED' : 'transparent',
    color: active ? '#fff' : '#5A5D56',
    transition: 'background 0.15s, color 0.15s',
  });

  return (
    <div
      className="flex gap-1 mb-3"
      style={{
        background: '#EDEEE9',
        borderRadius: 6,
        padding: 3,
      }}
    >
      <button style={btnStyle(mode === 'catchment')} onClick={() => onChange('catchment')}>
        Catchment
      </button>
      <button style={btnStyle(mode === 'custom')} onClick={() => onChange('custom')}>
        Custom Area
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export default function FacilitiesPanel() {
  const {
    selectedIds, municipios, level, facilities,
    facilitiesMode, setFacilitiesMode, drawnAreas,
  } = useStore();

  // Auto-switch to 'custom' when first area is drawn
  useEffect(() => {
    if (drawnAreas.length > 0) {
      setFacilitiesMode('custom');
    }
  }, [drawnAreas.length, setFacilitiesMode]);

  // Catchment mode facilities (20-min superset with zone badges)
  const facilitiesByArea = useMemo(() => {
    if (level !== 'municipio') return [];
    return selectedIds.map(id => {
      const m = municipios[id];
      if (!m) return { name: id, facilities: [] as FacilityWithZone[] };

      const codes10 = new Set(m.catch_ine_codes || []);
      const codes20 = new Set(m.catch20_ine_codes || m.catch_ine_codes || []);

      // Use 20-min superset; tag each facility with its zone
      const tagged: FacilityWithZone[] = facilities
        .filter(f => codes20.has(f.ine_code))
        .map(f => ({
          ...f,
          zone: codes10.has(f.ine_code) ? '10 min' as const : '10-20 min' as const,
        }));

      return { name: m.name, facilities: tagged };
    });
  }, [selectedIds, municipios, facilities, level]);

  // Per-drawn-area facility lists
  const facilitiesByDrawnArea = useMemo(() => {
    return drawnAreas.map(area => ({
      area,
      facilities: facilities.filter(f => pointInPolygon([f.lat, f.lng], area.polygon)),
    }));
  }, [drawnAreas, facilities]);

  // ── Render ──

  return (
    <div className="p-4 overflow-y-auto h-full">
      <ModeToggle mode={facilitiesMode} onChange={setFacilitiesMode} />

      {facilitiesMode === 'catchment' ? (
        <CatchmentView
          selectedIds={selectedIds}
          level={level}
          facilitiesByArea={facilitiesByArea}
        />
      ) : (
        <CustomAreaView
          drawnAreas={drawnAreas}
          facilitiesByArea={facilitiesByDrawnArea}
        />
      )}
    </div>
  );
}

// ── Catchment sub-view ─────────────────────────────────────────────

function CatchmentView({
  selectedIds,
  level,
  facilitiesByArea,
}: {
  selectedIds: string[];
  level: string;
  facilitiesByArea: { name: string; facilities: FacilityWithZone[] }[];
}) {
  if (selectedIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm" style={{ color: 'var(--neutral-400)' }}>
        Select a municipio to see facilities in its catchment area
      </div>
    );
  }

  if (level !== 'municipio') {
    return (
      <div className="flex items-center justify-center h-48 text-sm" style={{ color: 'var(--neutral-400)' }}>
        Switch to Municipio level to see facility details
      </div>
    );
  }

  const hasAny = facilitiesByArea.some(a => a.facilities.length > 0);
  if (!hasAny) {
    return (
      <div className="flex items-center justify-center h-48 text-sm" style={{ color: 'var(--neutral-400)' }}>
        No facilities found in the catchment area
      </div>
    );
  }

  const allFacilities = facilitiesByArea.flatMap(a => a.facilities);
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold" style={{ color: '#547d74' }}>
        Facilities in Catchment
      </h3>
      <FacilitySummaryCards facilities={allFacilities} />
      {facilitiesByArea.map((area, i) =>
        area.facilities.length > 0 ? (
          <FacilitiesTable key={i} facilities={area.facilities} areaName={`Catchment — ${area.name}`} showZone />
        ) : null
      )}
    </div>
  );
}

// ── Custom area sub-view ───────────────────────────────────────────

function CustomAreaView({
  drawnAreas,
  facilitiesByArea,
}: {
  drawnAreas: DrawnArea[];
  facilitiesByArea: { area: DrawnArea; facilities: Facility[] }[];
}) {
  if (drawnAreas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-sm gap-2" style={{ color: 'var(--neutral-400)' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5 }}>
          <path d="M2 3h4v1h8V3h4v3.73L22.5 10l-1.75.95 1.2 2.27-1.77.93-1.19-2.24L17 13V7h-1.06L14 10.16v3.21L18.21 17H21v4h-4v-1H6v1H2v-4h1V7H2V3Zm4 15h10.3l-4.64-4H10v-4h1.75L14 6.34V6H6v1H5v10h1v1Z" />
        </svg>
        Draw an area on the map to see facilities
      </div>
    );
  }

  const allFacilities = facilitiesByArea.flatMap(g => g.facilities);

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold" style={{ color: '#547d74' }}>
        Facilities in Custom Area{drawnAreas.length > 1 ? 's' : ''}
      </h3>
      <FacilitySummaryCards facilities={allFacilities} />
      {facilitiesByArea.map(({ area, facilities }) => (
        <div key={area.id}>
          {facilities.length > 0 ? (
            <FacilitiesTable
              facilities={facilities}
              areaName={`${area.name} — ${facilities.length} facilit${facilities.length === 1 ? 'y' : 'ies'}`}
              color={area.color}
            />
          ) : (
            <div>
              <h4
                className="text-xs font-semibold uppercase mb-2"
                style={{
                  color: area.color,
                  letterSpacing: '0.5px',
                  borderLeft: `3px solid ${area.color}`,
                  paddingLeft: 8,
                }}
              >
                {area.name} — 0 facilities
              </h4>
              <div className="text-xs pl-2" style={{ color: '#8A8D86' }}>
                No facilities inside this area.
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
