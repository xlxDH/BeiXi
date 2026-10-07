import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  ...(mode === "release" ? {
    build: { outDir: "dist-release", emptyOutDir: true },
    envDir: false,
    define: Object.fromEntries([
      "VITE_TENCENT_MAP_KEY", "VITE_TENCENT_MAP_SK", "VITE_MAPTILER_KEY",
      "VITE_OVERSEAS_STYLE_URL", "VITE_OVERSEAS_ATTRIBUTION",
    ].map((name) => [`import.meta.env.${name}`, JSON.stringify("")])),
  } : {}),
}));
