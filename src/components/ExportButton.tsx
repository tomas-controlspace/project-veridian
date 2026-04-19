'use client';

import { useState, useMemo } from 'react';
import * as topojsonClient from 'topojson-client';
import { useStore } from '@/lib/store';
import { exportToPptx, type ExportStep } from '@/lib/export/exportToPptx';
import type { ExportScope } from '@/lib/export/types';
import ExportCaptureOverlay from './ExportCaptureOverlay';

function useExportScope(): { scope: ExportScope | null; tooltip: string } {
  const { level, selectedIds, drawnAreas, loading } = useStore();
  return useMemo(() => {
    if (loading) return { scope: null, tooltip: 'Loading data…' };
    if (drawnAreas.length === 1 && selectedIds.length === 0) {
      return { scope: { kind: 'customArea', areaId: drawnAreas[0].id }, tooltip: '' };
    }
    if (level === 'municipio' && selectedIds.length === 1) {
      return { scope: { kind: 'municipio', ineCode: selectedIds[0] }, tooltip: '' };
    }
    if (level === 'provincia' && selectedIds.length === 1) {
      return { scope: { kind: 'provincia', provCode: selectedIds[0] }, tooltip: '' };
    }
    if (selectedIds.length > 1 || drawnAreas.length > 1) {
      return { scope: null, tooltip: 'Select a single area to export' };
    }
    return { scope: null, tooltip: 'Select an area to export a case study' };
  }, [level, selectedIds, drawnAreas, loading]);
}

export default function ExportButton() {
  const store = useStore();
  const { scope, tooltip } = useExportScope();
  const [step, setStep] = useState<ExportStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = !scope || step !== null;

  const onClick = async () => {
    if (!scope) return;
    setError(null);
    const prevChoropleth = store.showChoropleth;
    const prevIsochrones = store.showIsochrones;
    const forceLayers = (s: { choropleth: boolean; isochrones: boolean }) => {
      store.setShowChoropleth(s.choropleth);
      store.setShowIsochrones(s.isochrones);
      return () => {
        store.setShowChoropleth(prevChoropleth);
        store.setShowIsochrones(prevIsochrones);
      };
    };

    // Topojson objects live on the store as unknown; cast once here.
    const snap = {
      municipios: store.municipios,
      provincias: store.provincias,
      euskadi: store.euskadi,
      drawnAreas: store.drawnAreas,
      boundariesMuniGeoJSON: store.boundariesMuni
        ? (topojsonClient.feature(
            store.boundariesMuni as never,
            (store.boundariesMuni as { objects: Record<string, never> }).objects.municipios,
          ) as unknown as GeoJSON.FeatureCollection)
        : null,
      boundariesMuniTopo: store.boundariesMuni,
      boundariesProvTopo: store.boundariesProv,
    };

    try {
      await exportToPptx({
        scope,
        snapshot: snap,
        forceLayers,
        onStep: setStep,
      });
    } catch (err) {
      console.error('[export] failed', err);
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setStep(null);
    }
  };

  return (
    <>
      <button
        onClick={onClick}
        disabled={disabled}
        title={tooltip || 'Export case study'}
        className="px-3 py-1.5 text-sm transition-all"
        style={{
          borderRadius: 6,
          background: disabled ? '#F5F6F2' : '#fff',
          color: disabled ? '#B0B3A8' : '#2D6B55',
          fontWeight: 600,
          border: '0.5px solid #D5D7D0',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M8 2v7M8 9l-3-3M8 9l3-3M3 11v2a1 1 0 001 1h8a1 1 0 001-1v-2"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Export PPTX
      </button>
      <ExportCaptureOverlay step={step} />
      {error && (
        <div
          role="alert"
          className="fixed top-4 right-4 z-[2100] px-4 py-3"
          style={{
            background: '#fff',
            border: '0.5px solid #E05A8B',
            borderLeft: '3px solid #E05A8B',
            borderRadius: 6,
            color: '#2A2D26',
            fontSize: 13,
            maxWidth: 360,
            boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
          }}
          onClick={() => setError(null)}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Export failed</div>
          <div style={{ color: '#5A5D56', fontSize: 12 }}>{error}</div>
        </div>
      )}
    </>
  );
}
