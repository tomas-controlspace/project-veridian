'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip as LTooltip, useMap, Polygon } from 'react-leaflet';
import L from 'leaflet';
import * as topojsonClient from 'topojson-client';
import { useStore } from '@/lib/store';
import { METRIC_DEFS, getColorScale, getColor, formatMetricValue } from '@/lib/metrics';
import { mapHandle } from '@/lib/mapHandle';
import DrawPolygon from './DrawPolygon';
import DrawToolbar from './DrawToolbar';
import AreaNameInput from './AreaNameInput';
import 'leaflet/dist/leaflet.css';

// Default bounds — overridden by the active region's bounds via FitToRegion.
const FALLBACK_BOUNDS: L.LatLngBoundsExpression = [[42.4, -3.5], [43.5, -1.7]];

// Veridian palette constants (mirrors CSS tokens for JS usage)
const V = {
  accent: '#2EC4A0',
  warm: '#E8913A',
  neutralStroke: '#D5D7D0',   // --neutral-200
  hoverStroke: '#6BC495',     // --veridian-300
  nodataFill: '#EDEEE9',      // --neutral-100
  catchmentFill: 'rgba(232, 145, 58, 0.2)',
  selectedFill: 'rgba(46, 196, 160, 0.12)',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getField(obj: any, key: string): number | null {
  const v = obj?.[key];
  return typeof v === 'number' ? v : null;
}

/** Re-fits the map to the active region's bounds whenever currentRegion changes. */
function FitToRegion({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 10 });
  }, [map, bounds]);
  return null;
}

function MapHandleBridge() {
  const map = useMap();
  useEffect(() => {
    mapHandle.set(map);
    return () => mapHandle.set(null);
  }, [map]);
  return null;
}

function toGeoJSON(topo: any, objectName: string): GeoJSON.FeatureCollection {
  if (!topo || !topo.objects || !topo.objects[objectName]) {
    return { type: 'FeatureCollection', features: [] };
  }
  return topojsonClient.feature(topo, topo.objects[objectName]) as unknown as GeoJSON.FeatureCollection;
}

function IsochroneOverlay({ id, level, range = '10' }: { id: string; level: string; range?: '10' | '20' }) {
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    const dir = range === '20' ? 'isochrones_20' : 'isochrones';
    const url = level === 'municipio'
      ? `/data/${dir}/municipios/${id}.geojson`
      : `/data/${dir}/provincias/${id}.geojson`;

    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => setGeoData(data))
      .catch(() => setGeoData(null));
  }, [id, level, range]);

  if (!geoData) return null;

  const isOuter = range === '20';
  return (
    <GeoJSON
      key={`iso${range}-${level}-${id}`}
      data={geoData}
      style={{
        fillColor: V.warm,
        fillOpacity: isOuter ? 0.1 : 0.2,
        color: V.warm,
        weight: isOuter ? 1.5 : 2,
        opacity: isOuter ? 0.5 : 0.7,
        dashArray: '6 4',
      }}
    />
  );
}

export default function MapView() {
  const {
    level, boundariesMuni, boundariesProv, municipios, provincias,
    selectedMetric, selectedIds, toggleSelection,
    filteredMunicipios, loading, showIsochrones, showChoropleth,
    currentRegion, currentRegionConfig, currentRegionFacilities,
    currentRegionProvincias,
    drawMode, drawnAreas, pendingArea,
  } = useStore();

  const guardedToggle = useCallback((id: string) => {
    if (drawMode) return;
    toggleSelection(id);
  }, [drawMode, toggleSelection]);

  const geoJsonRef = useRef<L.GeoJSON | null>(null);

  // Filter the combined boundaries.topojson to just the active region.
  const geojsonData = useMemo(() => {
    const src = level === 'municipio' ? boundariesMuni : boundariesProv;
    const objName = level === 'municipio' ? 'municipios' : 'provincias';
    const fc = toGeoJSON(src, objName);
    return {
      type: 'FeatureCollection' as const,
      features: fc.features.filter(f => f.properties?.region_code === currentRegion),
    };
  }, [level, boundariesMuni, boundariesProv, currentRegion]);

  const { breaks, colors } = useMemo(() => {
    if (level === 'municipio') {
      return getColorScale(filteredMunicipios.map(m => getField(m, selectedMetric)));
    } else if (level === 'provincia') {
      return getColorScale(currentRegionProvincias.map(p => getField(p, selectedMetric)));
    }
    return { breaks: [], colors: [] };
  }, [level, filteredMunicipios, currentRegionProvincias, selectedMetric]);

  const filteredIds = useMemo(() => new Set(filteredMunicipios.map(m => m.ine_code)), [filteredMunicipios]);

  const getFeatureId = useCallback((feature: GeoJSON.Feature): string => {
    if (level === 'municipio') return feature.properties?.ine_code || '';
    if (level === 'provincia') return feature.properties?.provincia_code || '';
    return currentRegion;
  }, [level, currentRegion]);

  const getMetricValue = useCallback((feature: GeoJSON.Feature): number | null => {
    const props = feature.properties;
    if (level === 'municipio') return getField(municipios[props?.ine_code], selectedMetric);
    if (level === 'provincia') return getField(provincias[props?.provincia_code], selectedMetric);
    return null;
  }, [level, municipios, provincias, selectedMetric]);

  const style = useCallback((feature?: GeoJSON.Feature): L.PathOptions => {
    if (!feature) return {};
    const id = getFeatureId(feature);
    const isSelected = selectedIds.includes(id);
    const isFiltered = level !== 'municipio' || filteredIds.has(id);
    const value = getMetricValue(feature);

    return {
      fillColor: showChoropleth
        ? (isFiltered ? getColor(value, breaks, colors) : V.nodataFill)
        : 'transparent',
      fillOpacity: showChoropleth ? (isFiltered ? 0.55 : 0.3) : 0,
      color: isSelected ? V.accent : V.neutralStroke,
      weight: isSelected ? 2.5 : 0.5,
      opacity: 1,
    };
  }, [getFeatureId, getMetricValue, selectedIds, filteredIds, breaks, colors, level, showChoropleth]);

  const onEachFeature = useCallback((feature: GeoJSON.Feature, layer: L.Layer) => {
    const id = getFeatureId(feature);
    const value = getMetricValue(feature);
    const metricDef = METRIC_DEFS.find(m => m.key === selectedMetric);
    const name = level === 'municipio'
      ? feature.properties?.name
      : (feature.properties?.provincia_name || currentRegionConfig.name);

    const tooltipContent = `<strong>${name}</strong><br/>${metricDef?.label || selectedMetric}: ${formatMetricValue(value, selectedMetric)}`;
    layer.bindTooltip(tooltipContent, { sticky: true, className: 'map-tooltip' });

    (layer as L.Path).on('click', () => guardedToggle(id));
    (layer as L.Path).on('mouseover', () => {
      (layer as L.Path).setStyle({ weight: 2, color: V.hoverStroke });
    });
    (layer as L.Path).on('mouseout', () => {
      const isSelected = selectedIds.includes(id);
      (layer as L.Path).setStyle({
        weight: isSelected ? 2.5 : 0.5,
        color: isSelected ? V.accent : V.neutralStroke,
      });
    });
  }, [getFeatureId, getMetricValue, selectedMetric, level, guardedToggle, selectedIds]);

  const geoKey = `${currentRegion}-${level}-${selectedMetric}-${selectedIds.join(',')}-${filteredIds.size}-${drawMode}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: 'var(--neutral-50)' }}>
        <div style={{ color: 'var(--neutral-500)' }}>Loading map data...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <MapContainer
        bounds={currentRegionConfig.bounds as L.LatLngBoundsExpression}
        className="h-full w-full"
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          crossOrigin="anonymous"
        />
        <FitToRegion bounds={currentRegionConfig.bounds as L.LatLngBoundsExpression} />
        <MapHandleBridge />
        {geojsonData.features.length > 0 && (
          <GeoJSON
            key={geoKey}
            ref={geoJsonRef as React.Ref<L.GeoJSON>}
            data={geojsonData}
            style={style}
            onEachFeature={onEachFeature}
          />
        )}
        {showIsochrones && level !== 'region' && selectedIds.map(id => (
          <React.Fragment key={`iso-${id}`}>
            <IsochroneOverlay id={id} level={level} range="20" />
            <IsochroneOverlay id={id} level={level} range="10" />
          </React.Fragment>
        ))}
        {currentRegionFacilities.map((f, i) => {
          const isGuarda = f.facility_type === 'guardamuebles';
          const sizeMap: Record<string, number> = { small: 4, medium: 6, large: 8, xlarge: 10, unknown: 4 };
          const radius = sizeMap[f.size_tier || 'unknown'] || 5;
          return (
            <CircleMarker
              key={`fac-${i}`}
              center={[f.lat, f.lng]}
              radius={radius}
              bubblingMouseEvents={false}
              pathOptions={{
                fillColor: isGuarda ? 'transparent' : V.warm,
                fillOpacity: isGuarda ? 0 : 0.9,
                color: isGuarda ? V.warm : '#fff',
                weight: isGuarda ? 2 : 1.5,
              }}
            >
              <LTooltip>
                <strong>{f.operator || f.brand || 'Operator'}</strong> — {f.name}<br />
                NLA: {f.nla_sqm != null ? `${f.nla_sqm} m²` : 'n/a'}
                {f.facility_type && <><br />Type: {f.facility_type === 'self_storage' ? 'Self-storage' : 'Guardamuebles'}</>}
                {f.size_tier && f.size_tier !== 'unknown' && <><br />Size: {f.size_tier}</>}
              </LTooltip>
            </CircleMarker>
          );
        })}
        {drawnAreas.map(a => (
          <Polygon
            key={a.id}
            positions={a.polygon}
            pathOptions={{
              color: a.color,
              fillColor: a.color,
              fillOpacity: 0.12,
              weight: 2,
              dashArray: '6 4',
              opacity: 0.85,
            }}
          >
            <LTooltip direction="center" permanent className="area-label-tooltip">
              {a.name}
            </LTooltip>
          </Polygon>
        ))}
        {pendingArea && (
          <Polygon
            positions={pendingArea.polygon}
            pathOptions={{
              color: pendingArea.color,
              fillColor: pendingArea.color,
              fillOpacity: 0.18,
              weight: 2,
              dashArray: '6 4',
              opacity: 0.9,
            }}
          />
        )}
        <DrawPolygon />
        <AreaNameInput />
      </MapContainer>

      <DrawToolbar />

      {/* Legend */}
      {showChoropleth && (
        <div
          className="absolute bottom-4 left-4 backdrop-blur z-[1000] text-xs"
          style={{
            background: 'rgba(255,255,255,0.92)',
            borderRadius: 'var(--radius-md)',
            border: '0.5px solid var(--neutral-200)',
            padding: '10px 12px',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div className="mb-1.5" style={{ color: '#2A2D26', fontWeight: 600, fontSize: 12 }}>
            {METRIC_DEFS.find(m => m.key === selectedMetric)?.label}
          </div>
          <div className="flex items-center gap-0.5">
            {colors.map((c, i) => (
              <div key={i} className="w-6 h-4" style={{ backgroundColor: c, borderRadius: 'var(--radius-sm)' }} />
            ))}
          </div>
          {breaks.length >= 2 && (
            <div className="flex justify-between mt-0.5" style={{ color: '#5A5D56', fontSize: 11 }}>
              <span>{formatMetricValue(breaks[0], selectedMetric)}</span>
              <span>{formatMetricValue(breaks[breaks.length - 1], selectedMetric)}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-3 h-3" style={{ backgroundColor: 'var(--neutral-100)', borderRadius: 'var(--radius-sm)' }} />
            <span style={{ color: '#5A5D56', fontSize: 11 }}>No data / Filtered</span>
          </div>
        </div>
      )}
    </div>
  );
}
