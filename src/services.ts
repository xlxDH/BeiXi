import { md5 } from "js-md5";
import { readMapConfig } from "./config";
import { gcj02ToWgs84, wgs84ToGcj02, type Provider } from "./coordinates";
const config = readMapConfig();
export const mapTilerKey = config.mapTilerKey;
export const overseasStyle = config.styleUrl ||
  (mapTilerKey ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(mapTilerKey)}` : "");
export const key = config.tencentKey;
const sk = import.meta.env.VITE_TENCENT_MAP_SK || "";
export function signature(
  path: string,
  params: Record<string, string>,
  secret: string,
) {
  return md5(
    path +
      "?" +
      Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join("&") +
      secret,
  );
}
let sequence = 0;
export function webService(
  path: string,
  input: Record<string, string>,
): Promise<any> {
  if (!key)
    return Promise.reject(
      new Error("请在地图服务设置中填写腾讯地图 Key 并保存。"),
    );
  return new Promise((resolve, reject) => {
    const callback = `__tencent_demo_${++sequence}`;
    const params: Record<string, string> = {
      ...input,
      key,
      output: "jsonp",
      callback,
    };
    if (sk) params.sig = signature(path, params, sk);
    const script = document.createElement("script");
    const scope = window as any;
    const cleanup = () => {
      clearTimeout(timer);
      script.remove();
      delete scope[callback];
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "腾讯位置服务请求超时，请检查网络和 Key 的 WebService 权限。",
        ),
      );
    }, 12000);
    scope[callback] = (data: any) => {
      cleanup();
      data.status === 0
        ? resolve(data)
        : reject(
            new Error(
              data.status === 121
                ? "今日调用额度已用完，请在腾讯控制台检查配额或次日重试。"
                : `腾讯位置服务：${data.message || "请求失败"}（${data.status}）。请检查 Key、SK 签名和服务权限。`,
            ),
          );
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("无法连接腾讯位置服务，请检查网络。"));
    };
    script.src = `https://apis.map.qq.com${path}?${new URLSearchParams(params)}`;
    document.head.appendChild(script);
  });
}
export async function searchPlace(keyword: string, provider: Provider = "overseas") {
  if (provider === "overseas") {
    if (!mapTilerKey) throw new Error("请在地图服务设置中填写 MapTiler Key；自托管底图仍可通过成员经纬度定位。");
    let response: Response;
    try {
      response = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(keyword)}.json?key=${encodeURIComponent(mapTilerKey)}&language=zh&limit=1`, { signal: AbortSignal.timeout(12000) });
    } catch { throw new Error("海外地点搜索连接失败或超时，请检查网络。"); }
    if (!response.ok) throw new Error(`海外地点搜索失败（${response.status}），请检查 MapTiler Key 和配额。`);
    const data = await response.json();
    const place = data.features?.[0];
    const center = place?.center || place?.geometry?.coordinates;
    if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) throw new Error("未找到海外地点，请换一个名称。");
    return { lat: center[1], lng: center[0], title: place.place_name || keyword, address: place.place_name || keyword };
  }
  const places = await webService("/ws/place/v1/search", {
    keyword,
    boundary: "region(全国,0)",
    page_size: "5",
  });
  if (places.data?.length) {
    const place = places.data[0];
    return { ...gcj02ToWgs84(place.location.lat, place.location.lng), title: place.title, address: place.address };
  }
  const data = await webService("/ws/geocoder/v1/", { address: keyword });
  return {
    ...gcj02ToWgs84(data.result.location.lat, data.result.location.lng),
    title: data.result.title || keyword,
    address: data.result.address || keyword,
  };
}
export async function reverseGeocode(lat: number, lng: number) {
  const point = wgs84ToGcj02(lat, lng);
  const data = await webService("/ws/geocoder/v1/", {
    location: `${point.lat},${point.lng}`,
  });
  return data.result;
}
let mapPromise: Promise<any> | undefined;
export function loadMap(): Promise<any> {
  const scope = window as any;
  if (scope.TMap) return Promise.resolve(scope.TMap);
  if (!key)
    return Promise.reject(new Error("请在地图服务设置中填写腾讯地图 Key；当前使用本地示意地图。"));
  if (mapPromise) return mapPromise;
  mapPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error("腾讯地图加载超时，已切换本地示意地图。"));
    }, 15000);
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}`;
    script.onload = () => {
      clearTimeout(timer);
      scope.TMap
        ? resolve(scope.TMap)
        : reject(
            new Error(
              "腾讯地图未能初始化，请检查 Key 的 JavaScript API 权限。",
            ),
          );
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("腾讯地图连接失败，已切换本地示意地图。"));
    };
    document.head.appendChild(script);
  });
  mapPromise = mapPromise.catch((error) => { mapPromise = undefined; throw error; });
  return mapPromise;
}
