import type L from 'leaflet';

// Must match the slide-2 placeholder aspect set in scripts/prepare-template.py
// (tag_slide2 → Picture Placeholder 8 ext: cx=3870000, cy=2580000 → 1.5:1 / 3:2).
// If you change this, update both places.
const TARGET_ASPECT = 1.5;

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:([^;]+);/.exec(meta)?.[1] || 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function cropToAspect(png: Blob, target: number): Promise<Blob> {
  const bitmap = await createImageBitmap(png);
  let sw = bitmap.width;
  let sh = bitmap.height;
  let sx = 0;
  let sy = 0;
  const srcAspect = bitmap.width / bitmap.height;
  if (srcAspect > target) {
    sw = bitmap.height * target;
    sx = (bitmap.width - sw) / 2;
  } else if (srcAspect < target) {
    sh = bitmap.width / target;
    sy = (bitmap.height - sh) / 2;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return png;
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob returned null'));
    }, 'image/png');
  });
}

function waitForTiles(map: L.Map, timeoutMs = 4000): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };

    // Find the basemap TileLayer and listen for its `load` event (fires once when all
    // visible tiles have loaded). If no tile is pending, the event never fires — so
    // we race with a timeout.
    let tileLayer: L.TileLayer | null = null;
    map.eachLayer(layer => {
      // Duck-type: TileLayer has _url prop and extends GridLayer
      if (!tileLayer && (layer as unknown as { _url?: string })._url) {
        tileLayer = layer as L.TileLayer;
      }
    });

    if (tileLayer) {
      (tileLayer as L.TileLayer).once('load', finish);
    }
    setTimeout(finish, timeoutMs);
  });
}

function waitAnimationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export async function captureMap(opts: {
  map: L.Map;
  subjectBounds: L.LatLngBounds;
  catchmentBounds: L.LatLngBounds | null;
}): Promise<Blob> {
  const { map, subjectBounds, catchmentBounds } = opts;
  const bounds = catchmentBounds ? subjectBounds.extend(catchmentBounds) : subjectBounds;

  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12, animate: false });

  // Let React re-render children that depend on zoom/viewport, then wait for tiles.
  await waitAnimationFrame();
  await waitAnimationFrame();
  await waitForTiles(map);
  await waitAnimationFrame();

  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(map.getContainer(), {
    pixelRatio: 2,
    backgroundColor: '#fff',
    cacheBust: false,
    filter: (node: HTMLElement) => {
      const cls = node.classList;
      if (!cls) return true;
      // Drop zoom controls and attribution; keep everything else (choropleth legend included).
      if (cls.contains('leaflet-control-zoom')) return false;
      if (cls.contains('leaflet-control-attribution')) return false;
      return true;
    },
  });
  return await cropToAspect(dataUrlToBlob(dataUrl), TARGET_ASPECT);
}
