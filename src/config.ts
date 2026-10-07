export interface MapConfig {
  tencentKey: string;
  mapTilerKey: string;
  styleUrl: string;
  attribution: string;
}
const configKey = "beixi-map-config-v1";
export function readMapConfig(): MapConfig {
  let stored: Partial<MapConfig> = {};
  try { stored = JSON.parse(localStorage.getItem(configKey) || "{}"); } catch { /* Use build defaults. */ }
  const field = (name: keyof MapConfig, fallback: string) => typeof stored?.[name] === "string" ? stored[name]! : fallback;
  return {
    tencentKey: field("tencentKey", import.meta.env.VITE_TENCENT_MAP_KEY || ""),
    mapTilerKey: field("mapTilerKey", import.meta.env.VITE_MAPTILER_KEY || ""),
    styleUrl: field("styleUrl", import.meta.env.VITE_OVERSEAS_STYLE_URL || ""),
    attribution: field("attribution", import.meta.env.VITE_OVERSEAS_ATTRIBUTION || ""),
  };
}
export function saveMapConfig(config: MapConfig) {
  if (config.styleUrl) {
    const url = new URL(config.styleUrl, location.origin);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("样式地址必须使用 HTTPS 或 HTTP。");
  }
  localStorage.setItem(configKey, JSON.stringify(config));
}
