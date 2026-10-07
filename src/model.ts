import { gcj02ToWgs84, type MapMode } from "./coordinates";
export interface Member {
  id: number;
  name: string;
  city: string;
  lat: number;
  lng: number;
  color: string;
  avatar: string;
}
export interface View {
  lat: number;
  lng: number;
  zoom: number;
}
export interface Snapshot {
  coordinateSystem?: "WGS84";
  mapMode?: MapMode;
  members: Member[];
  view: View;
  panelOpen: boolean;
  stackOpen: boolean;
}
const photo = (id: number) =>
  new URL(`./photos/${id}.jpg`, import.meta.url).href;
const rows: [string, string, number, number, string][] = [
  [
    "又派了个大星",
    "深圳 · 南山区 · 深圳大学粤海校区",
    22.5345,
    113.9345,
    "#ee916a",
  ],
  ["小溪", "爱尔兰 · 都柏林", 53.3498, -6.2603, "#8c9ed4"],
  ["杜晓甫", "湖北 · 武汉市", 30.5928, 114.3055, "#82bda1"],
  ["真丝被被", "浙江 · 杭州市", 30.2741, 120.1551, "#efbc62"],
  ["星云", "南京 · 东南大学九龙湖校区", 31.889, 118.82, "#b39ccc"],
  ["柔克学院大法师王化名", "内蒙古 · 鄂尔多斯市", 39.6083, 109.9633, "#a895d1"],
  ["黑鲨掉落", "福建 · 福州市", 26.0745, 119.2965, "#4f8da1"],
  ["艾伦", "浙江 · 杭州市", 30.2741, 120.1551, "#e58a9a"],
  ["陌瑾", "上海 · 迪士尼主题公园", 31.1443, 121.657, "#d98da5"],
  ["蘑菇enter", "海南 · 三亚市 · 海南热带海洋学院", 18.313372, 109.542620, "#d39b66"],
  ["潮汐", "西安 · 西安电子科技大学长安校区", 34.128, 108.834, "#6f9fc2"],
  ["陆离", "上海 · 交通大学医学院浦东校区", 31.090054, 121.613814, "#9eb66f"],
];
export const defaultMembers: Member[] = rows.map(
  ([name, city, lat, lng, color], i) => ({
    id: i + 1,
    name,
    city,
    // The updated Sanya reference comes from MapTiler in WGS84; older rows use Tencent coordinates.
    ...(name === "蘑菇enter" ? { lat, lng } : gcj02ToWgs84(lat, lng)),
    color,
    avatar: photo(i + 1),
  }),
);
export const LEGACY_STORAGE_KEY = "beixi-default-v1";
export const STORAGE_KEY = "beixi-default-v2";
export function restoreSnapshot(value: unknown, legacy = false): Snapshot | null {
  if (!validateSnapshot(value)) return null;
  if (!legacy && value.coordinateSystem !== "WGS84") return null;
  const snapshot: Snapshot = !legacy ? value : {
    ...value, coordinateSystem: "WGS84", mapMode: "auto",
    members: value.members.map((m) => ({ ...m, ...gcj02ToWgs84(m.lat, m.lng) })),
    view: { ...value.view, ...gcj02ToWgs84(value.view.lat, value.view.lng) },
  };
  const oldPosition = gcj02ToWgs84(24.4798, 118.0894);
  return {
    ...snapshot,
    members: snapshot.members.map((member) =>
      member.id === 10 && member.name === "蘑菇enter" && member.city === "福建 · 厦门市" &&
      Math.abs(member.lat - oldPosition.lat) < 0.000001 && Math.abs(member.lng - oldPosition.lng) < 0.000001
        ? { ...member, city: defaultMembers[9]!.city, lat: defaultMembers[9]!.lat, lng: defaultMembers[9]!.lng }
        : member,
    ),
  };
}
export function validAvatar(avatar: string): boolean {
  if (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))
    return true;
  try {
    const url = new URL(avatar, location.origin);
    return (
      url.origin === location.origin &&
      (/^\/src\/photos\/\d+\.jpg$/.test(url.pathname) ||
        /^\/assets\/[\w-]+\.jpg$/.test(url.pathname))
    );
  } catch {
    return false;
  }
}
export function validateSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as Snapshot;
  if (s.coordinateSystem !== undefined && s.coordinateSystem !== "WGS84") return false;
  if (s.mapMode !== undefined && !["auto", "tencent", "overseas"].includes(s.mapMode)) return false;
  if (
    !Array.isArray(s.members) ||
    s.members.length > 80 ||
    typeof s.panelOpen !== "boolean" ||
    typeof s.stackOpen !== "boolean"
  )
    return false;
  const ids = new Set<number>();
  for (const m of s.members) {
    if (
      !m ||
      !Number.isSafeInteger(m.id) ||
      m.id < 1 ||
      ids.has(m.id) ||
      typeof m.name !== "string" ||
      !m.name.trim() ||
      m.name.length > 40 ||
      typeof m.city !== "string" ||
      !m.city.trim() ||
      m.city.length > 120 ||
      !Number.isFinite(m.lat) ||
      Math.abs(m.lat) > 85 ||
      !Number.isFinite(m.lng) ||
      Math.abs(m.lng) > 180 ||
      !/^#[\da-f]{6}$/i.test(m.color) ||
      typeof m.avatar !== "string" ||
      m.avatar.length > 400000 ||
      !validAvatar(m.avatar)
    )
      return false;
    ids.add(m.id);
  }
  return (
    !!s.view &&
    Number.isFinite(s.view.lat) &&
    Math.abs(s.view.lat) <= 85 &&
    Number.isFinite(s.view.lng) &&
    Math.abs(s.view.lng) <= 180 &&
    Number.isFinite(s.view.zoom) &&
    s.view.zoom >= 1 &&
    s.view.zoom <= 20
  );
}
