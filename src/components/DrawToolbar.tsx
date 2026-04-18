'use client';

import { useState } from 'react';
import { useStore, MAX_DRAWN_AREAS } from '@/lib/store';

function AreaChip({
  id,
  name,
  color,
  onRename,
  onDelete,
}: {
  id: string;
  name: string;
  color: string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  const commit = () => {
    onRename(id, value);
    setEditing(false);
  };

  return (
    <div
      className="flex items-center gap-1.5"
      style={{
        background: 'rgba(255,255,255,0.98)',
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: '3px 6px 3px 8px',
        fontSize: 12,
      }}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      {editing ? (
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') { setValue(name); setEditing(false); }
          }}
          onBlur={commit}
          autoFocus
          maxLength={40}
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: '#2A2D26',
            fontSize: 12,
            fontWeight: 600,
            width: 100,
            padding: 0,
          }}
        />
      ) : (
        <span
          style={{ color: '#2A2D26', fontWeight: 600, minWidth: 60 }}
          onDoubleClick={() => setEditing(true)}
        >
          {name}
        </span>
      )}
      <button
        onClick={() => { setValue(name); setEditing(true); }}
        title="Rename"
        style={{
          border: 'none',
          background: 'transparent',
          color: '#5A5D56',
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      </button>
      <button
        onClick={() => onDelete(id)}
        title="Delete"
        style={{
          border: 'none',
          background: 'transparent',
          color: '#E00344',
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default function DrawToolbar() {
  const {
    drawMode, setDrawMode,
    drawnAreas, pendingArea,
    renameDrawnArea, removeDrawnArea, clearDrawnAreas,
  } = useStore();

  const atLimit = drawnAreas.length >= MAX_DRAWN_AREAS;
  const canStartDraw = !atLimit && !pendingArea;

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
          onClick={() => canStartDraw && setDrawMode(!drawMode)}
          disabled={!canStartDraw && !drawMode}
          title={
            atLimit ? `Max ${MAX_DRAWN_AREAS} areas` :
            pendingArea ? 'Finish naming the current area first' :
            drawMode ? 'Cancel drawing' : 'Draw custom area'
          }
          style={{
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            border: 'none',
            cursor: (canStartDraw || drawMode) ? 'pointer' : 'not-allowed',
            background: drawMode ? '#7C3AED' : 'transparent',
            color: drawMode ? '#fff' : '#5A5D56',
            opacity: (canStartDraw || drawMode) ? 1 : 0.4,
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {/* Draw-area icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 3h4v1h8V3h4v3.73L22.5 10l-1.75.95 1.2 2.27-1.77.93-1.19-2.24L17 13V7h-1.06L14 10.16v3.21L18.21 17H21v4h-4v-1H6v1H2v-4h1V7H2V3Zm4 15h10.3l-4.64-4H10v-4h1.75L14 6.34V6H6v1H5v10h1v1Z" />
          </svg>
        </button>

        {/* Clear all — only when areas exist */}
        {drawnAreas.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm(`Clear all ${drawnAreas.length} drawn area${drawnAreas.length > 1 ? 's' : ''}?`)) {
                clearDrawnAreas();
              }
            }}
            title="Clear all drawn areas"
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

      {/* Drawn-area chips stack — top-left */}
      {drawnAreas.length > 0 && (
        <div
          className="absolute top-4 left-4 z-[1000] flex flex-col gap-1.5 max-w-[260px]"
        >
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontWeight: 600,
              color: '#5A5D56',
              background: 'rgba(255,255,255,0.9)',
              padding: '2px 8px',
              borderRadius: 4,
              alignSelf: 'flex-start',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            Custom areas ({drawnAreas.length}/{MAX_DRAWN_AREAS})
          </div>
          {drawnAreas.map(a => (
            <AreaChip
              key={a.id}
              id={a.id}
              name={a.name}
              color={a.color}
              onRename={renameDrawnArea}
              onDelete={removeDrawnArea}
            />
          ))}
        </div>
      )}

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
