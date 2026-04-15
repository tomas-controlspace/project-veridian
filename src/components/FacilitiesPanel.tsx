'use client';

import { useMemo } from 'react';
import { useStore, Facility } from '@/lib/store';
import { formatValue } from '@/lib/metrics';

function FacilitiesTable({ facilities, areaName }: { facilities: Facility[]; areaName: string }) {
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
        Facilities in Catchment — {areaName}
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--neutral-200)' }}>
              <th className="text-left py-1.5 pr-2" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 12 }}>Name</th>
              <th className="text-left py-1.5 pr-2" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 12 }}>Operator</th>
              <th className="text-right py-1.5 px-2" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 12 }}>NLA (m²)</th>
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
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--neutral-300)' }}>
              <td colSpan={2} className="py-1.5 pr-2 font-semibold" style={{ color: '#2A2D26', fontSize: 12 }}>
                Total ({facilities.length} facilities)
              </td>
              <td className="text-right py-1.5 px-2 font-mono font-semibold" style={{ color: '#2A2D26', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                {formatValue(totalNLA, 'number', 0)} m²
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FacilitiesPanel() {
  const { selectedIds, municipios, level, facilities } = useStore();

  const facilitiesByArea = useMemo(() => {
    if (level !== 'municipio') return [];
    return selectedIds.map(id => {
      const m = municipios[id];
      if (!m || !m.catch_ine_codes) return { name: m?.name ?? id, facilities: [] };
      const codes = new Set(m.catch_ine_codes);
      return {
        name: m.name,
        facilities: facilities.filter(f => codes.has(f.ine_code)),
      };
    });
  }, [selectedIds, municipios, facilities, level]);

  const hasAny = facilitiesByArea.some(a => a.facilities.length > 0);

  if (selectedIds.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--neutral-400)' }}>
        Select a municipio to see facilities in its 10-min catchment
      </div>
    );
  }

  if (level !== 'municipio') {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--neutral-400)' }}>
        Switch to Municipio level to see facility details
      </div>
    );
  }

  if (!hasAny) {
    return (
      <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--neutral-400)' }}>
        No facilities found in the catchment area
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <h3 className="text-sm font-semibold" style={{ color: '#547d74' }}>
        Facilities in 10-min Catchment
      </h3>
      {facilitiesByArea.map((area, i) =>
        area.facilities.length > 0 ? (
          <FacilitiesTable key={selectedIds[i]} facilities={area.facilities} areaName={area.name} />
        ) : null
      )}
    </div>
  );
}
