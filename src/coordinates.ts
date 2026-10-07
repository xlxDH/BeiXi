import boundary from "./mainland-boundary.json";

export type Provider = "tencent" | "overseas";
export type MapMode = "auto" | Provider;
export const normalizeLng = (lng: number) => ((lng + 180) % 360 + 360) % 360 - 180;

// Natural Earth 1:10m land polygons with a 5 km coastal tolerance for islands/reclaimed land.
// This is an approximate service coverage mask, never a displayed map boundary.
// Hong Kong and Macau are excluded explicitly; users can override routing near borders.
export function isMainland(lat: number, lng: number): boolean {
  lng = normalizeLng(lng);
  const hongKong = [[113.83,22.1],[114.45,22.1],[114.45,22.56],[114.16,22.56],[114.12,22.53],[114,22.50],[113.83,22.42]];
  if (inRing(hongKong, lat, lng) ||
      (lat >= 22.1 && lat <= 22.23 && lng >= 113.52 && lng <= 113.61)) return false;
  const rings = boundary.features[0]!.geometry.coordinates;
  return rings.some((polygon) => {
    const ring = polygon[0]!;
    return inRing(ring, lat, lng) || nearRing(ring, lat, lng);
  });
}
function nearRing(ring: number[][], lat: number, lng: number) {
  const xScale = Math.cos(lat * Math.PI / 180) * 111.195;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!, b = ring[i + 1]!;
    const ax = (a[0]! - lng) * xScale, ay = (a[1]! - lat) * 111.195;
    const bx = (b[0]! - lng) * xScale, by = (b[1]! - lat) * 111.195;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    if ((ax + t * dx) ** 2 + (ay + t * dy) ** 2 <= 25) return true;
  }
  return false;
}
function inRing(ring: number[][], lat: number, lng: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi! > lat) !== (yj! > lat) && lng < (xj! - xi!) * (lat - yi!) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}
export function providerFor(lat: number, lng: number, mode: MapMode = "auto"): Provider {
  return mode === "auto" ? (isMainland(lat, lng) ? "tencent" : "overseas") : mode;
}

export function wgs84ToGcj02(lat: number, lng: number) {
  if (!isMainland(lat, lng))
    return { lat, lng };
  const x = lng - 105,
    y = lat - 35,
    pi = Math.PI;
  let dLat =
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  dLat += ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3;
  dLat += ((20 * Math.sin(y * pi) + 40 * Math.sin((y / 3) * pi)) * 2) / 3;
  dLat +=
    ((160 * Math.sin((y / 12) * pi) + 320 * Math.sin((y * pi) / 30)) * 2) / 3;
  let dLng =
    300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  dLng += ((20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2) / 3;
  dLng += ((20 * Math.sin(x * pi) + 40 * Math.sin((x / 3) * pi)) * 2) / 3;
  dLng +=
    ((150 * Math.sin((x / 12) * pi) + 300 * Math.sin((x / 30) * pi)) * 2) / 3;
  const rad = (lat / 180) * pi,
    magic = 1 - 0.00669342162296594323 * Math.sin(rad) ** 2,
    root = Math.sqrt(magic);
  return {
    lat:
      lat +
      (dLat * 180) /
        (((6378245 * (1 - 0.00669342162296594323)) / (magic * root)) * pi),
    lng: lng + (dLng * 180) / ((6378245 / root) * Math.cos(rad) * pi),
  };
}

export function gcj02ToWgs84(lat: number, lng: number) {
  if (!isMainland(lat, lng)) return { lat, lng };
  let result = { lat, lng };
  for (let i = 0; i < 6; i++) {
    const projected = wgs84ToGcj02(result.lat, result.lng);
    result = { lat: result.lat + lat - projected.lat, lng: result.lng + lng - projected.lng };
  }
  return result;
}
