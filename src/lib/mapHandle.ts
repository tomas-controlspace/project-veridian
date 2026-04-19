import type L from 'leaflet';

let mapInstance: L.Map | null = null;

export const mapHandle = {
  set(m: L.Map | null) { mapInstance = m; },
  get(): L.Map | null { return mapInstance; },
};
