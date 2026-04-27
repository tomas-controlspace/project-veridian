'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { GeoLevel, MunicipioMetrics, ProvinciaMetrics, RegionMetrics, RegionConfig, Filters, DrawnArea } from '@/types';
import { DEFAULT_FILTERS, passesFilters } from './filters';

export const AREA_COLORS = ['#7C3AED', '#2EC4A0', '#E8913A', '#E05A8B'] as const;
export const MAX_DRAWN_AREAS = 4;

// Region registry — keep in sync with REGIONS in scripts/prepare-data.js.
// Bounds derived from each region's GISCO LAU 2024 boundary box plus a
// small pad. Defaults to PV (Euskadi) on first load.
export const REGIONS: RegionConfig[] = [
  {
    code: 'PV',
    name: 'Euskadi',
    bounds: [[42.4, -3.5], [43.5, -1.7]],
    default_metric: 'opportunity_score',
  },
  {
    code: 'AN',
    name: 'Málaga',
    bounds: [[36.3, -5.6], [37.3, -4.1]],
    default_metric: 'opportunity_score',
  },
];

export const DEFAULT_REGION_CODE = 'PV';

export interface Facility {
  name: string;
  operator?: string; // Euskadi schema
  brand?: string;    // Málaga schema
  address: string;
  lat: number;
  lng: number;
  ine_code: string;
  region_code?: string;
  nla_sqm: number | null;
  constructed_area_sqm?: number | null;
  estimated_nla?: number | null;
  facility_type?: 'self_storage' | 'guardamuebles';
  size_tier?: 'small' | 'medium' | 'large' | 'xlarge' | 'unknown';
  nla_confidence?: 'high' | 'medium' | 'low' | 'none';
  nla_estimated?: boolean;
  notes?: string;
}

interface StoreState {
  // Data — full multi-region dataset
  municipios: Record<string, MunicipioMetrics>;        // all regions
  provincias: Record<string, ProvinciaMetrics>;        // all regions
  regions: Record<string, RegionMetrics>;              // keyed by region_code (PV / AN)
  /** @deprecated alias for regions[currentRegion] — prefer currentRegionMetrics */
  euskadi: RegionMetrics | null;                       // legacy, points at active region
  boundariesMuni: unknown | null;
  boundariesProv: unknown | null;
  facilities: Facility[];                              // all regions
  loading: boolean;

  // Region context (top-level CCAA selector)
  currentRegion: string;
  setCurrentRegion: (code: string) => void;
  currentRegionMetrics: RegionMetrics | null;
  currentRegionConfig: RegionConfig;

  // UI state
  level: GeoLevel;
  setLevel: (l: GeoLevel) => void;
  selectedMetric: string;
  setSelectedMetric: (m: string) => void;
  selectedIds: string[];
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  showIsochrones: boolean;
  setShowIsochrones: (v: boolean) => void;
  showChoropleth: boolean;
  setShowChoropleth: (v: boolean) => void;

  // Draw-on-map
  drawMode: boolean;
  setDrawMode: (v: boolean) => void;
  drawnAreas: DrawnArea[];
  pendingArea: DrawnArea | null;
  startPendingArea: (polygon: [number, number][]) => void;
  confirmPendingArea: (name: string) => void;
  cancelPendingArea: () => void;
  renameDrawnArea: (id: string, name: string) => void;
  removeDrawnArea: (id: string) => void;
  clearDrawnAreas: () => void;
  facilitiesMode: 'catchment' | 'custom';
  setFacilitiesMode: (m: 'catchment' | 'custom') => void;

  // Derived (scoped to currentRegion unless noted)
  filteredMunicipios: MunicipioMetrics[];          // currentRegion munis after filters
  allMunicipiosList: MunicipioMetrics[];           // currentRegion munis (no filters)
  allMunicipiosGlobal: MunicipioMetrics[];         // ALL munis across all regions (for global ranking displays)
  currentRegionProvincias: ProvinciaMetrics[];     // currentRegion provincias
  currentRegionFacilities: Facility[];             // currentRegion facilities
}

const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [municipios, setMunicipios] = useState<Record<string, MunicipioMetrics>>({});
  const [provincias, setProvincias] = useState<Record<string, ProvinciaMetrics>>({});
  const [regions, setRegions] = useState<Record<string, RegionMetrics>>({});
  const [boundariesMuni, setBoundariesMuni] = useState<unknown | null>(null);
  const [boundariesProv, setBoundariesProv] = useState<unknown | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentRegion, setCurrentRegionRaw] = useState<string>(DEFAULT_REGION_CODE);
  const [level, setLevel] = useState<GeoLevel>('municipio');
  const [selectedMetric, setSelectedMetric] = useState('opportunity_score');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [showIsochrones, setShowIsochrones] = useState(true);
  const [showChoropleth, setShowChoropleth] = useState(true);

  const setCurrentRegion = useCallback((code: string) => {
    setCurrentRegionRaw(code);
    // Clear cross-region selections + reset filters when switching context.
    setSelectedIds([]);
    setSearchQuery('');
    setFilters(DEFAULT_FILTERS);
  }, []);

  // Draw-on-map state
  const [drawMode, setDrawModeRaw] = useState(false);
  const [drawnAreas, setDrawnAreas] = useState<DrawnArea[]>([]);
  const [pendingArea, setPendingArea] = useState<DrawnArea | null>(null);
  const pendingAreaRef = useRef<DrawnArea | null>(null);
  pendingAreaRef.current = pendingArea;
  const drawnAreasRef = useRef<DrawnArea[]>([]);
  drawnAreasRef.current = drawnAreas;
  const [facilitiesMode, setFacilitiesMode] = useState<'catchment' | 'custom'>('catchment');

  const setDrawMode = useCallback((v: boolean) => {
    setDrawModeRaw(v);
  }, []);

  const nextName = useCallback((existing: DrawnArea[]): string => {
    const used = new Set(existing.map(a => a.name));
    for (let i = 1; i <= MAX_DRAWN_AREAS + 5; i++) {
      const candidate = `Area ${i}`;
      if (!used.has(candidate)) return candidate;
    }
    return `Area ${existing.length + 1}`;
  }, []);

  const nextColor = useCallback((existing: DrawnArea[]): string => {
    const used = new Set(existing.map(a => a.color));
    for (const c of AREA_COLORS) {
      if (!used.has(c)) return c;
    }
    return AREA_COLORS[existing.length % AREA_COLORS.length];
  }, []);

  const startPendingArea = useCallback((polygon: [number, number][]) => {
    const current = drawnAreasRef.current;
    if (current.length >= MAX_DRAWN_AREAS) return;
    const area: DrawnArea = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `area-${Date.now()}`,
      name: nextName(current),
      polygon,
      color: nextColor(current),
      createdAt: Date.now(),
    };
    setPendingArea(area);
    setDrawModeRaw(false);
  }, [nextName, nextColor]);

  const confirmPendingArea = useCallback((name: string) => {
    const pending = pendingAreaRef.current;
    if (!pending) return;
    const trimmed = name.trim() || pending.name;
    setPendingArea(null);
    setDrawnAreas(current => {
      if (current.length >= MAX_DRAWN_AREAS) return current;
      return [...current, { ...pending, name: trimmed }];
    });
    setDrawModeRaw(false);
  }, []);

  const cancelPendingArea = useCallback(() => {
    setPendingArea(null);
    setDrawModeRaw(false);
  }, []);

  const renameDrawnArea = useCallback((id: string, name: string) => {
    setDrawnAreas(current =>
      current.map(a => a.id === id ? { ...a, name: name.trim() || a.name } : a)
    );
  }, []);

  const removeDrawnArea = useCallback((id: string) => {
    setDrawnAreas(current => current.filter(a => a.id !== id));
  }, []);

  const clearDrawnAreas = useCallback(() => {
    setDrawnAreas([]);
    setPendingArea(null);
    setDrawModeRaw(false);
  }, []);

  // Load data — multi-region. metrics_regions.json is the new top-level
  // file; metrics_euskadi.json is no longer fetched.
  useEffect(() => {
    Promise.all([
      fetch('/data/metrics_municipios.json').then(r => r.json()),
      fetch('/data/metrics_provincias.json').then(r => r.json()),
      fetch('/data/metrics_regions.json').then(r => r.json()),
      fetch('/data/boundaries_municipios.topojson').then(r => r.json()),
      fetch('/data/boundaries_provincias.topojson').then(r => r.json()),
      fetch('/data/facilities.json').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([muniData, provData, regionsData, boundMuni, boundProv, facData]) => {
      setMunicipios(muniData);
      setProvincias(provData);
      setRegions(regionsData);
      setBoundariesMuni(boundMuni);
      setBoundariesProv(boundProv);
      setFacilities(facData);
      setLoading(false);
    });
  }, []);

  const allMunicipiosGlobal = useMemo(() => Object.values(municipios), [municipios]);

  // Region-scoped derivations — most UI components consume these.
  const allMunicipiosList = useMemo(
    () => allMunicipiosGlobal.filter(m => m.region_code === currentRegion),
    [allMunicipiosGlobal, currentRegion],
  );

  const filteredMunicipios = useMemo(
    () => allMunicipiosList.filter(m => passesFilters(m, filters)),
    [allMunicipiosList, filters],
  );

  const currentRegionProvincias = useMemo(
    () => Object.values(provincias).filter(p => p.region_code === currentRegion),
    [provincias, currentRegion],
  );

  const currentRegionFacilities = useMemo(
    () => facilities.filter(f => !f.region_code || f.region_code === currentRegion),
    [facilities, currentRegion],
  );

  const currentRegionConfig = useMemo(
    () => REGIONS.find(r => r.code === currentRegion) ?? REGIONS[0],
    [currentRegion],
  );

  const currentRegionMetrics = regions[currentRegion] ?? null;
  const euskadi = currentRegionMetrics; // legacy alias

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const value: StoreState = {
    municipios, provincias, regions, euskadi,
    boundariesMuni, boundariesProv, facilities, loading,
    currentRegion, setCurrentRegion, currentRegionMetrics, currentRegionConfig,
    level, setLevel,
    selectedMetric, setSelectedMetric,
    selectedIds, toggleSelection, clearSelection,
    filters, setFilters,
    searchQuery, setSearchQuery,
    showIsochrones, setShowIsochrones,
    showChoropleth, setShowChoropleth,
    drawMode, setDrawMode,
    drawnAreas, pendingArea,
    startPendingArea, confirmPendingArea, cancelPendingArea,
    renameDrawnArea, removeDrawnArea, clearDrawnAreas,
    facilitiesMode, setFacilitiesMode,
    filteredMunicipios, allMunicipiosList, allMunicipiosGlobal,
    currentRegionProvincias, currentRegionFacilities,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
