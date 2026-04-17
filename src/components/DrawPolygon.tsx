'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useMap, Polyline, Polygon, CircleMarker } from 'react-leaflet';
import { useStore } from '@/lib/store';
import type { LeafletMouseEvent } from 'leaflet';

const DRAW_COLOR = '#7C3AED';
const SNAP_RADIUS_PX = 12; // pixels — how close to first vertex to trigger close

const polylineStyle = {
  color: DRAW_COLOR,
  weight: 2,
  dashArray: '6 4',
  opacity: 0.8,
};

const completedStyle = {
  fillColor: DRAW_COLOR,
  fillOpacity: 0.12,
  color: DRAW_COLOR,
  weight: 2,
  dashArray: '6 4',
  opacity: 0.8,
};

const vertexStyle = {
  fillColor: DRAW_COLOR,
  fillOpacity: 1,
  color: '#fff',
  weight: 2,
};

const firstVertexStyle = {
  fillColor: DRAW_COLOR,
  fillOpacity: 1,
  color: '#fff',
  weight: 3,
};

export default function DrawPolygon() {
  const map = useMap();
  const { drawMode, setDrawMode, drawnPolygon, setDrawnPolygon } = useStore();

  const [vertices, setVertices] = useState<[number, number][]>([]);
  const verticesRef = useRef<[number, number][]>([]);
  verticesRef.current = vertices;
  const [cursorPos, setCursorPos] = useState<[number, number] | null>(null);
  const [nearFirst, setNearFirst] = useState(false);

  // Manage cursor style and double-click zoom
  useEffect(() => {
    const container = map.getContainer();
    if (drawMode) {
      container.style.cursor = 'crosshair';
      map.doubleClickZoom.disable();
    } else {
      container.style.cursor = '';
      map.doubleClickZoom.enable();
      setVertices([]);
      setCursorPos(null);
      setNearFirst(false);
    }
    return () => {
      container.style.cursor = '';
      map.doubleClickZoom.enable();
    };
  }, [drawMode, map]);

  // Check if a screen point is near the first vertex
  const isNearFirstVertex = useCallback(
    (e: LeafletMouseEvent): boolean => {
      const current = verticesRef.current;
      if (current.length < 3) return false;
      const firstPx = map.latLngToContainerPoint(current[0]);
      const clickPx = e.containerPoint;
      const dist = firstPx.distanceTo(clickPx);
      return dist <= SNAP_RADIUS_PX;
    },
    [map],
  );

  // Close the polygon with current vertices
  const closePolygon = useCallback(() => {
    const current = verticesRef.current;
    if (current.length >= 3) {
      setDrawnPolygon([...current]);
    }
    setVertices([]);
    setNearFirst(false);
  }, [setDrawnPolygon]);

  // Click handler: add vertex or close polygon if clicking near first vertex
  const handleClick = useCallback(
    (e: LeafletMouseEvent) => {
      if (!drawMode) return;

      // If clicking near the first vertex and we have 3+ points, close
      if (isNearFirstVertex(e)) {
        closePolygon();
        return;
      }

      setVertices((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
    },
    [drawMode, isNearFirstVertex, closePolygon],
  );

  // Double-click handler: close polygon
  const handleDblClick = useCallback(
    (e: LeafletMouseEvent) => {
      if (!drawMode) return;
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      closePolygon();
    },
    [drawMode, closePolygon],
  );

  // Mouse move handler: rubber band + proximity detection
  const handleMouseMove = useCallback(
    (e: LeafletMouseEvent) => {
      if (!drawMode) return;
      setCursorPos([e.latlng.lat, e.latlng.lng]);

      // Check proximity to first vertex for visual feedback
      const current = verticesRef.current;
      if (current.length >= 3) {
        const firstPx = map.latLngToContainerPoint(current[0]);
        const cursorPx = e.containerPoint;
        setNearFirst(firstPx.distanceTo(cursorPx) <= SNAP_RADIUS_PX);
      } else {
        setNearFirst(false);
      }
    },
    [drawMode, map],
  );

  // Bind/unbind map events
  useEffect(() => {
    if (drawMode) {
      map.on('click', handleClick);
      map.on('dblclick', handleDblClick);
      map.on('mousemove', handleMouseMove);
    }
    return () => {
      map.off('click', handleClick);
      map.off('dblclick', handleDblClick);
      map.off('mousemove', handleMouseMove);
    };
  }, [drawMode, map, handleClick, handleDblClick, handleMouseMove]);

  // Render completed polygon
  if (!drawMode && drawnPolygon) {
    return <Polygon positions={drawnPolygon} pathOptions={completedStyle} />;
  }

  // Render in-progress drawing
  if (!drawMode || vertices.length === 0) return null;

  // Build the line including rubber-band to cursor
  const linePositions = cursorPos
    ? [...vertices, cursorPos]
    : vertices;

  return (
    <>
      <Polyline positions={linePositions} pathOptions={polylineStyle} />
      {vertices.map((v, i) => (
        <CircleMarker
          key={i}
          center={v}
          radius={i === 0 && vertices.length >= 3 ? (nearFirst ? 8 : 6) : 4}
          pathOptions={i === 0 && vertices.length >= 3 ? {
            ...firstVertexStyle,
            fillColor: nearFirst ? '#fff' : DRAW_COLOR,
            color: nearFirst ? DRAW_COLOR : '#fff',
          } : vertexStyle}
        />
      ))}
    </>
  );
}
