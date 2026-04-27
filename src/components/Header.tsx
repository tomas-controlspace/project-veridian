'use client';

import { useStore, REGIONS } from '@/lib/store';
import type { GeoLevel } from '@/types';
import ExportButton from './ExportButton';

const LEVELS: { key: GeoLevel; label: string }[] = [
  { key: 'municipio', label: 'Municipio' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'region', label: 'Region' },
];

export default function Header() {
  const { level, setLevel, clearSelection, currentRegion, setCurrentRegion, currentRegionConfig } = useStore();

  return (
    <header
      className="px-3 md:px-4 py-2 md:py-3 flex items-center justify-between shrink-0"
      style={{ background: '#fff', borderBottom: '0.5px solid var(--neutral-200)' }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: '#40826D' }} />
        <h1 style={{ fontSize: 15 }}>
          <span style={{ color: '#2A2D26', fontWeight: 600 }}>Control Space</span>
          <span className="hidden md:inline" style={{ color: '#B0B3A8', margin: '0 6px' }}>·</span>
          <span className="hidden md:inline" style={{ color: '#5A5D56', fontWeight: 400 }}>Project Veridian</span>
        </h1>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Region selector */}
        <div
          className="flex items-center gap-0.5 p-0.5"
          style={{ background: '#EDEEE9', borderRadius: 6 }}
          aria-label="Region selector"
        >
          {REGIONS.map(r => (
            <button
              key={r.code}
              onClick={() => setCurrentRegion(r.code)}
              className="px-2.5 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-all"
              style={{
                borderRadius: 5,
                ...(currentRegion === r.code
                  ? {
                      background: '#fff',
                      color: '#2D6B55',
                      fontWeight: 600,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }
                  : {
                      background: 'transparent',
                      color: '#5A5D56',
                      fontWeight: 400,
                    }),
              }}
              title={`Switch to ${r.name}`}
            >
              {r.name}
            </button>
          ))}
        </div>

        {/* Level tabs */}
        <div
          className="flex items-center gap-0.5 p-0.5"
          style={{ background: '#EDEEE9', borderRadius: 6 }}
          aria-label="Geographic level"
        >
          {LEVELS.map(l => {
            const label = l.key === 'region' ? currentRegionConfig.name : l.label;
            return (
              <button
                key={l.key}
                onClick={() => { setLevel(l.key); clearSelection(); }}
                className="px-3 md:px-4 py-1.5 text-sm font-medium transition-all"
                style={{
                  borderRadius: 5,
                  ...(level === l.key
                    ? {
                        background: '#fff',
                        color: '#2D6B55',
                        fontWeight: 600,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        borderBottom: '2px solid #2EC4A0',
                      }
                    : {
                        background: 'transparent',
                        color: '#5A5D56',
                        fontWeight: 400,
                        borderBottom: '2px solid transparent',
                      }),
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden md:flex">
        <ExportButton />
      </div>
    </header>
  );
}
