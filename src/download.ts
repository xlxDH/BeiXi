import { Capacitor } from "@capacitor/core";

export async function downloadPng(blob: Blob) {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"), import("@capacitor/share"),
    ]);
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]!);
      reader.onerror = () => reject(new Error("无法读取PNG"));
      reader.readAsDataURL(blob);
    });
    const path = `beixi-map-${Date.now()}.png`;
    const file = await Filesystem.writeFile({ path, data, directory: Directory.Cache });
    // Chooser completion can precede the receiving app reading the URI.
    // Keep the image in the OS-managed cache for the receiver.
    await Share.share({ title: "被汐 · 地图", files: [file.uri], dialogTitle: "保存或分享地图" });
    return;
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url;
  a.download = "被汐-地图.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
