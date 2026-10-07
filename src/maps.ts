import type { View } from "./model";
import { readMapConfig } from "./config";
import { gcj02ToWgs84, wgs84ToGcj02, normalizeLng, type Provider } from "./coordinates";
import { loadMap, overseasStyle } from "./services";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

export const providerName = (provider: Provider) => provider === "tencent" ? "腾讯地图" : "海外地图";
export interface MapAdapter {
  provider: Provider;
  project(lat: number, lng: number): { x: number; y: number };
  getView(): View;
  setView(view: View): void;
  on(event: "move" | "idle" | "dragstart" | "error", callback: () => void): void;
  resize(): void;
  ready(signal?: AbortSignal): Promise<void>;
  credit(): string;
  destroy(): void;
}

export async function createMap(container: HTMLElement, initial: View, provider: Provider, signal?: AbortSignal): Promise<MapAdapter> {
  signal?.throwIfAborted();
  const overseas = provider === "overseas";
  if (overseas && !overseasStyle) throw new Error("海外地图尚未配置：请在地图服务设置中填写 MapTiler Key 或自托管样式地址。");
  const sdk = await abortable(overseas ? import("maplibre-gl") : loadMap(), signal);
  signal?.throwIfAborted();
  if (overseas) sdk.setWorkerUrl(workerUrl);
  const coordinate = (lat: number, lng: number) => overseas ? { lat, lng: normalizeLng(lng) } : wgs84ToGcj02(lat, normalizeLng(lng));
  const c = coordinate(initial.lat, initial.lng);
  // Application zoom is based on 256-pixel tiles; MapLibre uses 512 pixels.
  const customAttribution = readMapConfig().attribution;
  const map = overseas ? new sdk.Map({
    container, style: overseasStyle, center: [c.lng, c.lat], zoom: initial.zoom - 1,
    minZoom: 0, maxZoom: 20, renderWorldCopies: false, attributionControl: { compact: false, customAttribution },
    pitch: 0, bearing: 0, dragRotate: false, touchPitch: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  }) : new sdk.Map(container, {
    center: new sdk.LatLng(c.lat, c.lng), zoom: Math.max(3, initial.zoom), maxZoom: 21,
    pitch: 0, rotation: 0, viewMode: "2D", renderOptions: { preserveDrawingBuffer: true },
  });
  if (overseas) { map.touchZoomRotate.disableRotation(); map.keyboard.disableRotation(); }
  else {
    map.removeControl(sdk.constants.DEFAULT_CONTROL_ID.ZOOM);
    map.removeControl(sdk.constants.DEFAULT_CONTROL_ID.ROTATION);
  }
  let idle = false, idleAt = 0, failure = "", destroyed = false;
  map.on("idle", () => { idle = true; idleAt = Date.now(); });
  map.on(overseas ? "movestart" : "bounds_changed", () => { idle = false; });
  if (overseas) map.on("error", () => { failure = "海外地图资源加载失败，请检查样式、瓦片、字体的地址、Key、配额及跨域设置。"; });
  return {
    provider,
    project(lat, lng) {
      const point = coordinate(lat, lng);
      return overseas ? map.project([point.lng, point.lat]) : map.projectToContainer(new sdk.LatLng(point.lat, point.lng));
    },
    getView() {
      const center = map.getCenter();
      const point = overseas ? { lat: center.lat, lng: normalizeLng(center.lng) } : gcj02ToWgs84(center.getLat(), normalizeLng(center.getLng()));
      return { ...point, zoom: map.getZoom() + (overseas ? 1 : 0) };
    },
    setView(view) {
      const point = coordinate(view.lat, view.lng);
      failure = "";
      if (overseas) map.jumpTo({ center: [point.lng, point.lat], zoom: view.zoom - 1 });
      else { map.setCenter(new sdk.LatLng(point.lat, point.lng)); map.setZoom(Math.max(3, view.zoom)); }
    },
    on(event, callback) { map.on(!overseas && event === "move" ? "bounds_changed" : event, callback); },
    resize() { if (overseas) map.resize(); },
    ready(signal) {
      return new Promise<void>((resolve, reject) => {
        const started = Date.now();
        const timer = setInterval(() => {
          if (signal?.aborted) return finish(new DOMException("地图加载已取消", "AbortError"));
          if (destroyed) return finish(new Error("地图已关闭"));
          if (failure) return finish(new Error(failure));
          if (idle && Date.now() - idleAt >= (overseas ? 100 : 1800) && (!overseas || map.areTilesLoaded())) return finish();
          if (Date.now() - started > 20000) finish(new Error(`${providerName(provider)}加载超时，请检查网络和服务配置。`));
        }, 100);
        function finish(error?: Error) { clearInterval(timer); error ? reject(error) : resolve(); }
      });
    },
    credit() {
      const raw = overseas
        ? container.querySelector(".maplibregl-ctrl-attrib-inner")?.textContent
        : container.querySelector(".logo-text")?.textContent;
      return overseas ? ["MapLibre", raw, customAttribution].filter(Boolean).join(" | ") : `腾讯地图 | ${raw || "审图号见地图服务"}`;
    },
    destroy() { destroyed = true; overseas ? map.remove() : map.destroy(); },
  };
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("地图加载已取消", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
