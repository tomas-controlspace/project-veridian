'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import type { GeoLevel, MunicipioMetrics, ProvinciaMetrics, EuskadiMetrics, Filters } from '@/types';
import { DEFAULT_FILTERS, passesFilters } from './filters';

export interface Facility {
  name: string;
  operator: string;
  address: string;
  lat: number;
  lng: number;
  ine_code: string;
  nla_sqm: number;
  notes?: string;
}

interface StoreState {
  // Data
  municipios: Record<string, MunicipioMetrics>;
  provincias: Record<string, ProvinciaMetrics>;
  euskadi: EuskadiMetrics | null;
  boundariesMuni: unknown | null;
  boundariesProv: unknown | null;
  facilities: Facility[];
  loading: boolean;

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

  // Derived
  filteredMunicipios: MunicipioMetrics[];
  allMunicipiosList: MunicipioMetrics[];
}

const StoreContext = createContext<StoreState | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [municipios, setMunicipios] = useState<Record<string, MunicipioMetrics>>({});
  const [provincias, setProvincias] = useState<Record<string, ProvinciaMetrics>>({});
  const [euskadi, setEuskadi] = useState<EuskadiMetrics | null>(null);
  const [boundariesMuni, setBoundariesMuni] = useState<unknown | null>(null);
  const [boundariesProv, setBoundariesProv] = useState<unknown | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);

  const [level, setLevel] = useState<GeoLevel>('municipio');
  const [selectedMetric, setSelectedMetric] = useState('density_per_km2');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [showIsochrones, setShowIsochrones] = useState(true);

  // Load data
  useEffect(() => {
    Promise.all([
      fetch('/data/metrics_municipios.json').then(r => r.json()),
      fetch('/data/metrics_provincias.json').then(r => r.json()),
      fetch('/data/metrics_euskadi.json').then(r => r.json()),
      fetch('/data/boundaries_municipios.topojson').then(r => r.json()),
      fetch('/data/boundaries_provincias.topojson').then(r => r.json()),
      fetch('/data/facilities.json').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([muniData, provData, eusData, boundMuni, boundProv, facData]) => {
      setMunicipios(muniData);
      setProvincias(provData);
      setEuskadi(eusData);
      setBoundariesMuni(boundMuni);
      setBoundariesProv(boundProv);
      setFacilities(facData);
      setLoading(false);
    });
  }, []);

  const allMunicipiosList = useMemo(
    () => Object.values(municipios),
    [municipios]
  );

  const filteredMunicipios = useMemo(
    () => allMunicipiosList.filter(m => passesFilters(m, filters)),
    [allMunicipiosList, filters]
  );

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const value: StoreState = {
    municipios, provincias, euskadi, boundariesMuni, boundariesProv, facilities, loading,
    level, setLevel,
    selectedMetric, setSelectedMetric,
    selectedIds, toggleSelection, clearSelection,
    filters, setFilters,
    searchQuery, setSearchQuery,
    showIsochrones, setShowIsochrones,
    filteredMunicipios, allMunicipiosList,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
