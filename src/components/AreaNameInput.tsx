'use client';

import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import { useStore } from '@/lib/store';
import type { DrawnArea } from '@/types';

function polygonCentroid(polygon: [number, number][]): [number, number] {
  let latSum = 0;
  let lngSum = 0;
  for (const [lat, lng] of polygon) {
    latSum += lat;
    lngSum += lng;
  }
  const n = polygon.length || 1;
  return [latSum / n, lngSum / n];
}

function NameInputOverlay({ pendingArea }: { pendingArea: DrawnArea }) {
  const map = useMap();
  const { confirmPendingArea, cancelPendingArea } = useStore();
  const [value, setValue] = useState(pendingArea.name);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Recompute screen position when map moves/zooms
  useEffect(() => {
    const center = polygonCentroid(pendingArea.polygon);
    const update = () => {
      const pt = map.latLngToContainerPoint(center);
      setPos({ x: pt.x, y: pt.y });
    };
    update();
    map.on('move', update);
    map.on('zoom', update);
    return () => {
      map.off('move', update);
      map.off('zoom', update);
    };
  }, [map, pendingArea.polygon]);

  // Auto-focus and select
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  if (!pos) return null;

  return (
    <div
      className="absolute z-[1002]"
      style={{
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -50%)',
        background: 'rgba(255,255,255,0.98)',
        backdropFilter: 'blur(8px)',
        borderRadius: 8,
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        border: `1.5px solid ${pendingArea.color}`,
        padding: '6px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: pendingArea.color,
          flexShrink: 0,
        }}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirmPendingArea(value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelPendingArea();
          }
        }}
        placeholder="Area name"
        maxLength={40}
        style={{
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: '#2A2D26',
          fontSize: 13,
          fontWeight: 600,
          width: 140,
          padding: '2px 0',
        }}
      />
      <button
        onClick={() => confirmPendingArea(value)}
        title="Save (Enter)"
        style={{
          border: 'none',
          background: pendingArea.color,
          color: '#fff',
          borderRadius: 4,
          width: 22,
          height: 22,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>
      <button
        onClick={cancelPendingArea}
        title="Cancel (Esc)"
        style={{
          border: 'none',
          background: 'transparent',
          color: '#5A5D56',
          borderRadius: 4,
          width: 22,
          height: 22,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default function AreaNameInput() {
  const { pendingArea } = useStore();
  if (!pendingArea) return null;
  return <NameInputOverlay pendingArea={pendingArea} />;
}
