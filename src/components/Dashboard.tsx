'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Header from './Header';
import Sidebar from './Sidebar';
import BottomPanel from './BottomPanel';
import { useStore } from '@/lib/store';

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-50">
      <div className="text-gray-400">Loading map...</div>
    </div>
  ),
});

// ── Drag handle component ───────────────────────────────────────────
function DragHandle({
  direction,
  onDrag,
}: {
  direction: 'horizontal' | 'vertical';
  onDrag: (delta: number) => void;
}) {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastPos.current = direction === 'horizontal' ? e.clientY : e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [direction]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const current = direction === 'horizontal' ? e.clientY : e.clientX;
    const delta = current - lastPos.current;
    lastPos.current = current;
    onDrag(delta);
  }, [direction, onDrag]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const isH = direction === 'horizontal';

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`${
        isH
          ? 'h-1.5 cursor-row-resize'
          : 'w-1.5 cursor-col-resize'
      } shrink-0 flex items-center justify-center group z-10 transition-colors`}
      style={{ background: 'var(--neutral-200)' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--accent-light)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--neutral-200)'}
    >
      {/* Grip dots */}
      <div className={`${isH ? 'flex-row gap-1' : 'flex-col gap-1'} flex opacity-0 group-hover:opacity-100 transition-opacity`}>
        <div className="w-1 h-1 rounded-full" style={{ background: 'var(--neutral-400)' }} />
        <div className="w-1 h-1 rounded-full" style={{ background: 'var(--neutral-400)' }} />
        <div className="w-1 h-1 rounded-full" style={{ background: 'var(--neutral-400)' }} />
      </div>
    </div>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────
export default function Dashboard() {
  const { loading } = useStore();

  // Bottom panel height (draggable)
  const [bottomH, setBottomH] = useState(340);
  // Sidebar width (draggable)
  const [sidebarW, setSidebarW] = useState(288);

  const containerRef = useRef<HTMLDivElement>(null);

  const onDragBottom = useCallback((delta: number) => {
    setBottomH(prev => Math.max(120, Math.min(prev - delta, 700)));
  }, []);

  const onDragSidebar = useCallback((delta: number) => {
    setSidebarW(prev => Math.max(200, Math.min(prev - delta, 500)));
  }, []);

  // Invalidate Leaflet map size when panels resize
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
    return () => clearTimeout(timer);
  }, [bottomH, sidebarW]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--neutral-50)' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--neutral-500)' }}>Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-screen" style={{ background: 'var(--neutral-50)' }}>
      <Header />

      {/* Main content: map + sidebar */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Map */}
        <div className="flex-1 relative min-w-0">
          <MapView />
        </div>

        {/* Vertical drag handle */}
        <DragHandle direction="vertical" onDrag={onDragSidebar} />

        {/* Sidebar */}
        <div
          className="bg-white shrink-0 hidden md:block overflow-hidden"
          style={{ width: sidebarW }}
        >
          <Sidebar />
        </div>
      </div>

      {/* Horizontal drag handle */}
      <DragHandle direction="horizontal" onDrag={onDragBottom} />

      {/* Bottom panel */}
      <div
        className="shrink-0 overflow-hidden"
        style={{ height: bottomH }}
      >
        <BottomPanel />
      </div>
    </div>
  );
}
