'use client';

import { useStore } from '@/lib/store';
import type { GeoLevel } from '@/types';

const LEVELS: { key: GeoLevel; label: string }[] = [
  { key: 'municipio', label: 'Municipio' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'euskadi', label: 'Euskadi' },
];

export default function Header() {
  const { level, setLevel, clearSelection } = useStore();

  return (
    <header
      className="px-4 py-3 flex items-center justify-between shrink-0"
      style={{ background: '#fff', borderBottom: '0.5px solid var(--neutral-200)' }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: '#40826D' }} />
        <h1 style={{ fontSize: 15 }}>
          <span style={{ color: '#2A2D26', fontWeight: 600 }}>Control Space</span>
          <span style={{ color: '#B0B3A8', margin: '0 6px' }}>·</span>
          <span style={{ color: '#5A5D56', fontWeight: 400 }}>Project Veridian</span>
        </h1>
      </div>

      <div
        className="flex items-center gap-0.5 p-0.5"
        style={{ background: '#EDEEE9', borderRadius: 6 }}
      >
        {LEVELS.map(l => (
          <button
            key={l.key}
            onClick={() => { setLevel(l.key); clearSelection(); }}
            className="px-4 py-1.5 text-sm font-medium transition-all"
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
            {l.label}
          </button>
        ))}
      </div>
    </header>
  );
}
