'use client';

import { useMemo, useEffect } from 'react';
import { useStore, Facility } from '@/lib/store';
import { formatValue } from '@/lib/metrics';
import { pointInPolygon } from '@/lib/geo';

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

function FacilitiesTable({ facilities, areaName, showZone = false }: { facilities: FacilityWithZone[]; areaName: string; showZone?: boolean }) {
  const totalNLA = facilities.reduce((sum, f) => sum + (f.nla_sqm || 0), 0);

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
        background: 'var(--neutral-100)',
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
    facilitiesMode, setFacilitiesMode, drawnPolygon,
  } = useStore();

  // Auto-switch to 'custom' when polygon is drawn
  useEffect(() => {
    if (drawnPolygon) {
      setFacilitiesMode('custom');
    }
  }, [drawnPolygon, setFacilitiesMode]);

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

  // Custom area facilities
  const customAreaFacilities = useMemo(() => {
    if (!drawnPolygon) return [];
    return facilities.filter(f => pointInPolygon([f.lat, f.lng], drawnPolygon));
  }, [facilities, drawnPolygon]);

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
          drawnPolygon={drawnPolygon}
          facilities={customAreaFacilities}
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

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold" style={{ color: '#547d74' }}>
        Facilities in Catchment
      </h3>
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
  drawnPolygon,
  facilities,
}: {
  drawnPolygon: [number, number][] | null;
  facilities: Facility[];
}) {
  if (!drawnPolygon) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-sm gap-2" style={{ color: 'var(--neutral-400)' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="3 17 9 11 13 15 21 7" />
          <polyline points="14 7 21 7 21 14" />
        </svg>
        Draw an area on the map to see facilities
      </div>
    );
  }

  if (facilities.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm" style={{ color: 'var(--neutral-400)' }}>
        No facilities found in the drawn area
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold" style={{ color: '#547d74' }}>
        Facilities in Custom Area
      </h3>
      <FacilitiesTable facilities={facilities} areaName={`Custom Area — ${facilities.length} found`} />
    </div>
  );
}
