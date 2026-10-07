import { Capacitor } from "@capacitor/core";
export async function devicePosition(): Promise<{ lat: number; lng: number }> {
  if (Capacitor.isNativePlatform()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const p = await Geolocation.getCurrentPosition({ timeout: 10000 });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("浏览器不支持定位。")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, { timeout: 10000 },
    );
  });
}
