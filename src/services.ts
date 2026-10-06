import { md5 } from "js-md5";
export const key = import.meta.env.VITE_TENCENT_MAP_KEY || "";
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
      new Error("请在 .env.local 中配置腾讯地图 Key，然后重启开发服务。"),
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
export async function searchPlace(keyword: string) {
  const places = await webService("/ws/place/v1/search", {
    keyword,
    boundary: "region(全国,0)",
    page_size: "5",
  });
  if (places.data?.length) {
    const place = places.data[0];
    return { ...place.location, title: place.title, address: place.address };
  }
  const data = await webService("/ws/geocoder/v1/", { address: keyword });
  return {
    ...data.result.location,
    title: data.result.title || keyword,
    address: data.result.address || keyword,
  };
}
export async function reverseGeocode(lat: number, lng: number) {
  const data = await webService("/ws/geocoder/v1/", {
    location: `${lat},${lng}`,
  });
  return data.result;
}
export function loadMap(): Promise<any> {
  const scope = window as any;
  if (scope.TMap) return Promise.resolve(scope.TMap);
  if (!key)
    return Promise.reject(new Error("未配置地图 Key，正在使用本地示意地图。"));
  return new Promise((resolve, reject) => {
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
      reject(new Error("腾讯地图连接失败，已切换本地示意地图。"));
    };
    document.head.appendChild(script);
  });
}
export function wgs84ToGcj02(lat: number, lng: number) {
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271)
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
