'use client';

import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { METRIC_DEFS } from '@/lib/metrics';
import type { Filters } from '@/types';

const sLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const,
  letterSpacing: '0.5px', color: '#5A5D56', marginBottom: 4,
};

const sInput: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 13,
  border: '0.5px solid #D5D7D0', borderRadius: 6,
  background: '#fff', color: '#2A2D26', outline: 'none',
};

function FilterInput({
  label, value, onChange, placeholder,
}: {
  label: string; value: number | null;
  onChange: (v: number | null) => void; placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs w-12 shrink-0" style={{ color: 'var(--neutral-500)' }}>{label}</label>
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        placeholder={placeholder}
        style={sInput}
        onFocus={e => e.target.style.boxShadow = 'var(--shadow-focus)'}
        onBlur={e => e.target.style.boxShadow = 'none'}
      />
    </div>
  );
}

export default function Sidebar() {
  const {
    selectedMetric, setSelectedMetric,
    filters, setFilters,
    searchQuery, setSearchQuery,
    allMunicipiosList, toggleSelection, level,
    showIsochrones, setShowIsochrones,
    showChoropleth, setShowChoropleth,
  } = useStore();

  const [showFilters, setShowFilters] = useState(false);

  const searchResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return allMunicipiosList.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [searchQuery, allMunicipiosList]);

  const updateFilter = (key: keyof Filters, value: number | null) => {
    setFilters({ ...filters, [key]: value });
  };

  const hasActiveFilters = Object.values(filters).some(v => v != null);

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto" style={{ background: '#fff' }}>
      {/* Choropleth Toggle + Metric Selector */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div style={sLabel}>Choropleth</div>
          <button
            onClick={() => setShowChoropleth(!showChoropleth)}
            className="w-9 h-5 rounded-full transition-colors relative"
            style={{ background: showChoropleth ? '#2EC4A0' : '#D5D7D0' }}
          >
            <div
              className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform"
              style={{
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                left: showChoropleth ? 16 : 2,
              }}
            />
          </button>
        </div>
        <select
          value={selectedMetric}
          onChange={e => setSelectedMetric(e.target.value)}
          disabled={!showChoropleth}
          style={{
            ...sInput,
            padding: '8px 10px',
            appearance: 'auto' as const,
            opacity: showChoropleth ? 1 : 0.4,
          }}
        >
          {METRIC_DEFS.map(m => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Catchment Toggle */}
      <div className="flex items-center justify-between">
        <div style={sLabel}>Catchment Areas</div>
        <button
          onClick={() => setShowIsochrones(!showIsochrones)}
          className="w-9 h-5 rounded-full transition-colors relative"
          style={{ background: showIsochrones ? '#2EC4A0' : '#D5D7D0' }}
        >
          <div
            className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform"
            style={{
              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
              left: showIsochrones ? 16 : 2,
            }}
          />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <div style={sLabel}>Search</div>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Type municipio name..."
          style={{ ...sInput, padding: '8px 10px' }}
          onFocus={e => e.target.style.boxShadow = 'var(--shadow-focus)'}
          onBlur={e => e.target.style.boxShadow = 'none'}
        />
        {searchResults.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 mt-1 z-50 max-h-48 overflow-y-auto"
            style={{
              background: '#fff',
              border: '0.5px solid var(--neutral-200)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {searchResults.map(m => (
              <button
                key={m.ine_code}
                onClick={() => { toggleSelection(m.ine_code); setSearchQuery(''); }}
                className="w-full text-left px-3 py-2 text-sm transition-colors"
                style={{ borderBottom: '0.5px solid var(--neutral-100)' }}
                onMouseEnter={e => (e.target as HTMLElement).style.background = 'var(--veridian-50)'}
                onMouseLeave={e => (e.target as HTMLElement).style.background = 'transparent'}
              >
                <span style={{ fontWeight: 500, color: 'var(--neutral-800)' }}>{m.name}</span>
                <span className="ml-2 text-xs" style={{ color: 'var(--neutral-400)' }}>{m.provincia_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: 'var(--neutral-700)' }}
        >
          <svg className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M6 6L14 10L6 14V6Z" />
          </svg>
          Filters
          {hasActiveFilters && (
            <span
              className="text-xs px-1.5 py-0.5"
              style={{
                background: 'var(--accent-light)',
                color: 'var(--veridian-400)',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 500,
              }}
            >
              Active
            </span>
          )}
        </button>

        {showFilters && (
          <div className="mt-2 space-y-3">
            {[
              { title: 'Population', minKey: 'pop_min' as const, maxKey: 'pop_max' as const },
              { title: 'Income (€/year)', minKey: 'income_min' as const, maxKey: 'income_max' as const },
              { title: 'Price (€/m²)', minKey: 'price_min' as const, maxKey: 'price_max' as const },
              { title: 'Rent (€/m²/mo)', minKey: 'rent_min' as const, maxKey: 'rent_max' as const },
            ].map(f => (
              <div key={f.title}>
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--neutral-500)' }}>{f.title}</div>
                <div className="space-y-1">
                  <FilterInput label="Min" value={filters[f.minKey]} onChange={v => updateFilter(f.minKey, v)} placeholder="0" />
                  <FilterInput label="Max" value={filters[f.maxKey]} onChange={v => updateFilter(f.maxKey, v)} placeholder="∞" />
                </div>
              </div>
            ))}
            {hasActiveFilters && (
              <button
                onClick={() => setFilters({ pop_min: null, pop_max: null, income_min: null, income_max: null, price_min: null, price_max: null, rent_min: null, rent_max: null })}
                className="text-xs"
                style={{ color: 'var(--danger)' }}
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto text-xs space-y-1" style={{ color: 'var(--neutral-400)' }}>
        <p>Click polygons to select (max 4).</p>
        <p>Draw up to 4 custom areas to compare.</p>
        <p>Level: <span className="capitalize font-medium" style={{ color: 'var(--neutral-600)' }}>{level}</span></p>
      </div>
    </div>
  );
}
