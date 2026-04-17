'use client';

import { useStore } from '@/lib/store';

export default function DrawToolbar() {
  const { drawMode, setDrawMode, drawnPolygon, clearDrawnPolygon } = useStore();

  return (
    <>
      {/* Top-right toolbar */}
      <div
        className="absolute top-4 right-4 z-[1000] flex flex-col gap-1.5"
        style={{
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
          borderRadius: 'var(--radius-md, 8px)',
          boxShadow: '0 1px 5px rgba(0,0,0,0.15)',
          padding: '6px',
        }}
      >
        {/* Draw button */}
        <button
          onClick={() => setDrawMode(!drawMode)}
          title={drawMode ? 'Cancel drawing' : 'Draw custom area'}
          style={{
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: drawMode ? '#7C3AED' : 'transparent',
            color: drawMode ? '#fff' : '#5A5D56',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {/* Draw-area icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 3h4v1h8V3h4v3.73L22.5 10l-1.75.95 1.2 2.27-1.77.93-1.19-2.24L17 13V7h-1.06L14 10.16v3.21L18.21 17H21v4h-4v-1H6v1H2v-4h1V7H2V3Zm4 15h10.3l-4.64-4H10v-4h1.75L14 6.34V6H6v1H5v10h1v1Z" />
          </svg>
        </button>

        {/* Clear button — only when polygon exists */}
        {drawnPolygon && (
          <button
            onClick={clearDrawnPolygon}
            title="Clear drawn area"
            style={{
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              background: 'transparent',
              color: '#E00344',
              transition: 'background 0.15s',
            }}
          >
            {/* X icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Drawing hint */}
        {drawMode && (
          <div
            className="absolute top-0 right-full mr-2 whitespace-nowrap"
            style={{
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(8px)',
              borderRadius: 6,
              boxShadow: '0 1px 5px rgba(0,0,0,0.15)',
              padding: '6px 10px',
              fontSize: 11,
              color: '#5A5D56',
              marginTop: 4,
            }}
          >
            Click to add points, double-click or click first point to finish
          </div>
        )}
      </div>

      {/* Bottom cancel button — visible during draw mode */}
      {drawMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1001]">
          <button
            onClick={() => setDrawMode(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(8px)',
              color: '#2A2D26',
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              transition: 'background 0.15s',
            }}
          >
            {/* X icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Cancelar
          </button>
        </div>
      )}
    </>
  );
}
