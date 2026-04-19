import * as topojsonClient from 'topojson-client';
import { mapHandle } from '@/lib/mapHandle';
import { buildCaseStudyData, type BuildStoreSnapshot } from './buildCaseStudyData';
import { captureMap } from './captureMap';
import { renderPptx } from './pptxTemplater';
import { caseStudyFilename } from './filename';
import type { ExportScope, CaseStudyData } from './types';
import type L from 'leaflet';

export type ExportStep = 'data' | 'map' | 'render' | 'save';

interface RunOpts {
  scope: ExportScope;
  snapshot: BuildStoreSnapshot & {
    boundariesMuniTopo: unknown | null;
    boundariesProvTopo: unknown | null;
  };
  forceLayers: (s: { choropleth: boolean; isochrones: boolean }) => () => void;
  onStep?: (step: ExportStep) => void;
}

function toGeoJSONCollection(topo: unknown, objectName: string): GeoJSON.FeatureCollection {
  const t = topo as { objects?: Record<string, unknown> } | null;
  if (!t || !t.objects || !t.objects[objectName]) {
    return { type: 'FeatureCollection', features: [] };
  }
  return topojsonClient.feature(
    t as never,
    (t.objects as Record<string, never>)[objectName],
  ) as unknown as GeoJSON.FeatureCollection;
}

function subjectBounds(
  Lmod: typeof L,
  scope: ExportScope,
  snap: RunOpts['snapshot'],
): L.LatLngBounds {
  if (scope.kind === 'municipio') {
    const fc = toGeoJSONCollection(snap.boundariesMuniTopo, 'municipios');
    const feat = fc.features.find(
      f => (f.properties as Record<string, unknown> | null)?.ine_code === scope.ineCode,
    );
    if (!feat) throw new Error(`Boundary not found for municipio ${scope.ineCode}`);
    return Lmod.geoJSON(feat).getBounds();
  }
  if (scope.kind === 'provincia') {
    const fc = toGeoJSONCollection(snap.boundariesProvTopo, 'provincias');
    const feat = fc.features.find(
      f => (f.properties as Record<string, unknown> | null)?.provincia_code === scope.provCode,
    );
    if (!feat) throw new Error(`Boundary not found for provincia ${scope.provCode}`);
    return Lmod.geoJSON(feat).getBounds();
  }
  // customArea
  const area = snap.drawnAreas.find(a => a.id === scope.areaId);
  if (!area) throw new Error(`Drawn area not found: ${scope.areaId}`);
  return Lmod.latLngBounds(area.polygon.map(([lat, lng]) => Lmod.latLng(lat, lng)));
}

async function fetchIsochroneBounds(Lmod: typeof L, ineCode: string): Promise<L.LatLngBounds | null> {
  try {
    const res = await fetch(`/data/isochrones/municipios/${ineCode}.geojson`);
    if (!res.ok) return null;
    const gj = await res.json();
    return Lmod.geoJSON(gj).getBounds();
  } catch {
    return null;
  }
}

export async function exportToPptx(opts: RunOpts): Promise<void> {
  const { scope, snapshot, forceLayers, onStep } = opts;

  onStep?.('data');
  const data: CaseStudyData = buildCaseStudyData(scope, snapshot);

  const map = mapHandle.get();
  if (!map) throw new Error('Map is not ready. Try again after the map has loaded.');

  // leaflet is a browser-only module — load lazily so this file is SSR-safe.
  const Lmod = (await import('leaflet')).default;

  onStep?.('map');
  const subj = subjectBounds(Lmod, scope, snapshot);
  const catch10 = scope.kind === 'municipio' ? await fetchIsochroneBounds(Lmod, scope.ineCode) : null;

  const prevCenter = map.getCenter();
  const prevZoom = map.getZoom();
  const restoreLayers = forceLayers({
    choropleth: true,
    isochrones: scope.kind === 'municipio',
  });

  let mapImage: Blob | null = null;
  try {
    mapImage = await captureMap({ map, subjectBounds: subj, catchmentBounds: catch10 });
  } catch (err) {
    console.warn('[export] map capture failed, continuing without fresh map image', err);
    mapImage = null;
  } finally {
    restoreLayers();
    map.setView(prevCenter, prevZoom, { animate: false });
  }

  onStep?.('render');
  const pptxBlob = await renderPptx(data, mapImage);

  onStep?.('save');
  const { saveAs } = await import('file-saver');
  saveAs(pptxBlob, caseStudyFilename(data.areaName));
}
