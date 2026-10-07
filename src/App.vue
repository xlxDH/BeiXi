<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import {
  Search,
  Settings,
  Users,
  X,
  Maximize,
  Plus,
  Minus,
  LocateFixed,
  Pencil,
  Trash2,
  Save,
  Download,
  ChevronDown,
  ChevronUp,
} from "lucide-vue-next";
import { searchPlace } from "./services";
import { devicePosition } from "./location";
import { createMap, providerName, type MapAdapter } from "./maps";
import { providerFor, type MapMode, type Provider } from "./coordinates";
import {
  defaultMembers,
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  restoreSnapshot,
  type Snapshot,
  validateSnapshot,
  type Member,
  type View,
} from "./model";
import { layoutMarkers } from "./layout";
import { clipOwnLine, crossedMembers, type MemberBounds } from "./connections";
import ExportDialog from "./ExportDialog.vue";
import MapSettings from "./MapSettings.vue";
const settingsOpen = ref(false);
let saved: Snapshot | null = null,
  restoreError = "";
try {
  const currentRaw = localStorage.getItem(STORAGE_KEY);
  const raw = currentRaw ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  if (raw) {
    const value = JSON.parse(raw);
    const restored = restoreSnapshot(value, currentRaw === null);
    if (restored) saved = restored;
    else restoreError = "已保存的数据无效，已载入内置名单。";
  }
} catch {
  restoreError = "无法读取本机默认设置，已载入内置名单。";
}
const members = ref<Member[]>(
    saved?.members || defaultMembers.map((m) => ({ ...m })),
  ),
  selected = ref(members.value[0]?.id || 0);
const panel = ref(saved?.panelOpen ?? (innerWidth > 800 && innerHeight >= 500)),
  stackOpen = ref(saved?.stackOpen ?? false),
  exportOpen = ref(false);
const notice = ref(restoreError),
  query = ref(""),
  searching = ref(false),
  loading = ref(true),
  mapReady = ref(false),
  mapEl = ref<HTMLElement>();
const viewport = ref({ width: innerWidth, height: innerHeight });
const scale = computed(() =>
  Math.min(
    1,
    viewport.value.width / (viewport.value.height < 500 ? 1800 : 1000),
  ),
);
const mapStyle = computed(() => ({
  width: `${viewport.value.width / scale.value}px`,
  height: `${viewport.value.height / scale.value}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: "0 0",
}));
const view = ref<View>(saved?.view || { lat: 36, lng: 74, zoom: 3 });
const mapMode = ref<MapMode>(saved?.mapMode || "auto");
const activeProvider = ref<Provider>(providerFor(view.value.lat, view.value.lng, mapMode.value));
const searchRegion = ref<Provider>("overseas");
const anchors = ref<{ id: number; x: number; y: number }[]>([]),
  markerSize = computed(() =>
    viewport.value.height < 500 ? 42 : viewport.value.width <= 800 ? 52 : 62,
  );
const positions = computed(() =>
  layoutMarkers(
    anchors.value,
    viewport.value.width,
    viewport.value.height,
    markerSize.value,
    panel.value && viewport.value.width > 800 ? 340 : 0,
  ),
);
const current = computed(() =>
  members.value.find((m) => m.id === selected.value),
);
const labelDimensions = ref<Record<number, { width: number; height: number }>>(
  {},
);
const connectionBounds = computed<MemberBounds[]>(() =>
  positions.value.map((p) => {
    const label = labelDimensions.value[p.id] || { width: 120, height: 26 };
    return {
      id: p.id,
      photo: {
        x: p.x - markerSize.value / 2,
        y: p.y - markerSize.value / 2,
        width: markerSize.value,
        height: markerSize.value,
      },
      label: {
        x: p.x - label.width / 2,
        y: p.y + markerSize.value / 2 + 5,
        width: label.width,
        height: label.height,
      },
    };
  }),
);
const connections = computed(() =>
  positions.value.map((p) => ({
    id: p.id,
    start: { x: p.ax, y: p.ay },
    end: clipOwnLine(
      { x: p.ax, y: p.ay },
      { x: p.x, y: p.y },
      connectionBounds.value.find((b) => b.id === p.id)!.photo,
    ),
  })),
);
const faded = computed(() =>
  crossedMembers(connections.value, connectionBounds.value),
);
watch(
  [positions, members, markerSize],
  async () => {
    await nextTick();
    const measured: Record<number, { width: number; height: number }> = {};
    document
      .querySelectorAll<HTMLElement>(".marker-label[data-member-id]")
      .forEach((el) => {
        measured[Number(el.dataset.memberId)] = {
          width: el.offsetWidth,
          height: el.offsetHeight,
        };
      });
    if (JSON.stringify(measured) !== JSON.stringify(labelDimensions.value))
      labelDimensions.value = measured;
  },
  { deep: true, flush: "post", immediate: true },
);
let map: MapAdapter | undefined,
  observer: ResizeObserver,
  navToken = 0;
function project(lat: number, lng: number) {
  if (map) {
    const p = map.project(lat, lng);
    return { x: p.x * scale.value, y: p.y * scale.value };
  }
  const merc = (v: number) =>
      (1 - Math.log(Math.tan(Math.PI / 4 + (v * Math.PI) / 360)) / Math.PI) / 2,
    s = 256 * 2 ** view.value.zoom;
  return {
    x:
      viewport.value.width / 2 +
      ((lng - view.value.lng) / 360) * s * scale.value,
    y:
      viewport.value.height / 2 +
      (merc(lat) - merc(view.value.lat)) * s * scale.value,
  };
}
function redraw() {
  if (map) {
    view.value = map.getView();
  }
  anchors.value = members.value.map((m) => ({
    id: m.id,
    ...project(m.lat, m.lng),
  }));
}
function go(lat: number, lng: number, zoom = view.value.zoom) {
  view.value = { lat, lng, zoom };
  const provider = providerFor(lat, lng, mapMode.value);
  if (!map || map.provider !== provider) { void switchMap(); return; }
  map.setView(view.value);
  redraw();
}
function choose(id: number) {
  navToken++;
  searching.value = false;
  selected.value = id;
  const m = current.value;
  if (m) go(m.lat, m.lng, 5);
  nextTick(() =>
    document
      .querySelector(`[data-member-id="${id}"]`)
      ?.scrollIntoView({ block: "nearest" }),
  );
}
function fit() {
  navToken++;
  searching.value = false;
  if (!members.value.length) {
    go(36, 105, 3);
    return;
  }
  if (Math.max(...members.value.map((m) => m.lng)) - Math.min(...members.value.map((m) => m.lng)) > 180) {
    const first = members.value[0]!;
    go(first.lat, first.lng, 5);
    notice.value = "成员跨越国际日期变更线，请通过名单分别定位和导出。";
    return;
  }
  const minLng = Math.min(...members.value.map((m) => m.lng)),
    maxLng = Math.max(...members.value.map((m) => m.lng)),
    merc = (v: number) =>
      (1 - Math.log(Math.tan(Math.PI / 4 + (v * Math.PI) / 360)) / Math.PI) / 2,
    ys = members.value.map((m) => merc(m.lat)),
    minY = Math.min(...ys),
    maxY = Math.max(...ys),
    right = panel.value && viewport.value.width > 800 ? 340 : 20,
    usableW = Math.max(160, viewport.value.width - right - 70) / scale.value,
    usableH = Math.max(160, viewport.value.height - 300) / scale.value,
    z = Math.max(
      activeProvider.value === "tencent" ? 3 : 1,
      Math.min(
        12,
        Math.log2(
          Math.min(
            usableW / (Math.max(0.00001, (maxLng - minLng) / 360) * 256),
            usableH / (Math.max(0.00001, maxY - minY) * 256),
          ),
        ),
      ),
    );
  go(
    (Math.atan(Math.sinh(Math.PI * (1 - minY - maxY))) * 180) / Math.PI,
    (minLng + maxLng) / 2 + (right / 2 / scale.value / (256 * 2 ** z)) * 360,
    z,
  );
}
function zoomBy(n: number) {
  navToken++;
  searching.value = false;
  go(
    view.value.lat,
    view.value.lng,
    Math.max(activeProvider.value === "tencent" ? 3 : 1, Math.min(18, view.value.zoom + n)),
  );
}
async function search() {
  if (!query.value.trim()) return;
  const token = ++navToken;
  searching.value = true;
  try {
    const p = await searchPlace(query.value.trim(), searchRegion.value);
    if (token !== navToken) return;
    go(p.lat, p.lng, 12);
    notice.value = `已找到：${p.title}`;
  } catch (e) {
    if (token === navToken) notice.value = (e as Error).message;
  } finally {
    if (token === navToken) searching.value = false;
  }
}
async function locate() {
  const token = ++navToken;
  searching.value = false;
  try {
    const c = await devicePosition();
    if (token !== navToken) return;
    go(c.lat, c.lng, 13);
    notice.value = "已定位设备，成员参考位置保持不变。";
  } catch {
    if (token === navToken) notice.value = "未能获取设备位置，请检查定位权限。";
  }
}
function saveDefault() {
  try {
    const snapshot = {
      coordinateSystem: "WGS84",
      mapMode: mapMode.value,
      members: members.value,
      view: {
        ...view.value,
        lng: ((((view.value.lng + 180) % 360) + 360) % 360) - 180,
      },
      panelOpen: panel.value,
      stackOpen: stackOpen.value,
    };
    if (!validateSnapshot(snapshot)) {
      notice.value = "当前成员或地图设置无效，尚未覆盖默认设置。";
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    notice.value = "已保存为本机默认页面，下次打开或刷新将恢复。";
  } catch {
    notice.value =
      "保存失败：本机存储空间不足或被禁用。已有默认设置未覆盖，请压缩头像后重试。";
  }
}
const editor = ref(false),
  editingId = ref<number | null>(null),
  form = ref<{
    name: string;
    city: string;
    lat: string | number;
    lng: string | number;
    avatar: string;
    r: number;
    g: number;
    b: number;
  }>({
    name: "",
    city: "",
    lat: "",
    lng: "",
    avatar: "",
    r: 92,
    g: 154,
    b: 150,
  }),
  formError = ref(""),
  avatarBusy = ref(false);
let editorGeneration = 0;
function edit(m?: Member) {
  editorGeneration++;
  avatarBusy.value = false;
  editingId.value = m?.id ?? null;
  const c = m?.color || "#5c9a96";
  form.value = {
    name: m?.name || "",
    city: m?.city || "",
    lat: String(m?.lat ?? view.value.lat),
    lng: String(m?.lng ?? view.value.lng),
    avatar: m?.avatar || defaultMembers[0]!.avatar,
    r: parseInt(c.slice(1, 3), 16),
    g: parseInt(c.slice(3, 5), 16),
    b: parseInt(c.slice(5, 7), 16),
  };
  formError.value = "";
  editor.value = true;
}
const formColor = computed(
  () =>
    "#" +
    [form.value.r, form.value.g, form.value.b]
      .map((v) =>
        Math.max(0, Math.min(255, Number(v) || 0))
          .toString(16)
          .padStart(2, "0"),
      )
      .join(""),
);
async function upload(e: Event) {
  const generation = ++editorGeneration;
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  if (!f.type.startsWith("image/") || f.size > 20 * 1024 * 1024) {
    formError.value = "请选择小于20 MB的图片。";
    return;
  }
  avatarBusy.value = true;
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (generation !== editorGeneration || !editor.value) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!,
      side = Math.min(img.width, img.height);
    ctx.drawImage(
      img,
      (img.width - side) / 2,
      (img.height - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    form.value.avatar = canvas.toDataURL("image/jpeg", 0.8);
    formError.value = "";
  } catch {
    if (generation === editorGeneration && editor.value)
      formError.value = "图片无法解码，请换一张图片。";
  } finally {
    URL.revokeObjectURL(url);
    if (generation === editorGeneration) avatarBusy.value = false;
  }
}
function commit() {
  const f = form.value,
    lat = Number(f.lat),
    lng = Number(f.lng);
  if (
    !f.name.trim() ||
    f.name.length > 40 ||
    !f.city.trim() ||
    f.city.length > 120 ||
    !String(f.lat).trim() ||
    !String(f.lng).trim() ||
    !Number.isFinite(lat) ||
    Math.abs(lat) > 85 ||
    !Number.isFinite(lng) ||
    Math.abs(lng) > 180 ||
    [f.r, f.g, f.b].some(
      (v) => !Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 255,
    )
  ) {
    formError.value = "请填写姓名、地点、有效经纬度和0–255整数RGB。";
    return;
  }
  if (editingId.value === null && members.value.length >= 80) {
    formError.value = "最多支持80位成员。";
    return;
  }
  const m: Member = {
      id: editingId.value ?? Math.max(0, ...members.value.map((m) => m.id)) + 1,
      name: f.name.trim(),
      city: f.city.trim(),
      lat,
      lng,
      color: formColor.value,
      avatar: f.avatar,
    },
    i = members.value.findIndex((v) => v.id === m.id);
  if (i >= 0) members.value[i] = m;
  else members.value.push(m);
  selected.value = m.id;
  editor.value = false;
  redraw();
  notice.value = "成员已更新，点击保存为默认可在下次打开时恢复。";
}
const deleting = ref<Member | null>(null);
function remove() {
  if (!deleting.value) return;
  members.value = members.value.filter((m) => m.id !== deleting.value!.id);
  selected.value = members.value[0]?.id || 0;
  deleting.value = null;
  notice.value = "成员已删除，保存为默认后下次打开生效。";
}
let drag: { x: number; y: number; lat: number; lng: number } | null = null;
function down(e: PointerEvent) {
  navToken++;
  searching.value = false;
  if (map) return;
  drag = { x: e.clientX, y: e.clientY, ...view.value };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (drag) {
    const s = 256 * 2 ** view.value.zoom * scale.value;
    go(
      drag.lat + ((e.clientY - drag.y) * 360) / s,
      drag.lng - ((e.clientX - drag.x) * 360) / s,
    );
  }
}
function resize() {
  viewport.value = { width: innerWidth, height: innerHeight };
  nextTick(redraw);
}
watch(members, redraw, { deep: true });
let mapGeneration = 0;
let mapController: AbortController | undefined;
let switchTimer: ReturnType<typeof setTimeout> | undefined;
let mounted = false;
async function switchMap() {
  if (!mounted || !mapEl.value) return;
  clearTimeout(switchTimer);
  const generation = ++mapGeneration;
  mapController?.abort();
  const controller = new AbortController();
  mapController = controller;
  map?.destroy();
  map = undefined;
  mapReady.value = false;
  loading.value = true;
  activeProvider.value = providerFor(view.value.lat, view.value.lng, mapMode.value);
  // The SDK owns this child; Vue retains ownership of the fallback layer.
  const host = document.createElement("div");
  host.className = "map-host";
  mapEl.value.querySelectorAll(".map-host").forEach((el) => el.remove());
  mapEl.value.appendChild(host);
  let candidate: MapAdapter | undefined;
  try {
    candidate = await createMap(host, view.value, activeProvider.value, controller.signal);
    if (generation !== mapGeneration) { candidate.destroy(); host.remove(); return; }
    map = candidate;
    map.on("move", redraw);
    map.on("error", () => { if (generation === mapGeneration) notice.value = "地图资源加载失败，请检查网络、Key 和地图服务配置后重试。"; });
    map.on("dragstart", () => { navToken++; searching.value = false; });
    map.on("idle", () => {
      if (generation !== mapGeneration) return;
      redraw();
      const logo = host.querySelector<HTMLElement>(".logo-text")?.parentElement || host.querySelector<HTMLElement>(".maplibregl-ctrl-bottom-right");
      if (logo) { logo.style.transform = `scale(${1 / scale.value})`; logo.style.transformOrigin = candidate?.provider === "tencent" ? "bottom left" : "bottom right"; }
      if (providerFor(view.value.lat, view.value.lng, mapMode.value) !== map?.provider) {
        clearTimeout(switchTimer);
        switchTimer = setTimeout(() => void switchMap(), 350);
      }
    });
    await map.ready(controller.signal);
    if (generation !== mapGeneration) return;
    mapReady.value = true;
    notice.value = "";
  } catch (e) {
    if (generation !== mapGeneration) return;
    candidate?.destroy();
    map = undefined;
    host.remove();
    notice.value = (e as Error).message;
  } finally {
    if (generation === mapGeneration) { loading.value = false; redraw(); }
  }
}
watch(mapMode, () => void switchMap());
onMounted(() => {
  mounted = true;
  window.addEventListener("resize", resize);
  observer = new ResizeObserver(() => { map?.resize(); redraw(); });
  observer.observe(mapEl.value!);
  if (!saved) fit();
  else void switchMap();
});
onUnmounted(() => {
  mounted = false;
  mapGeneration++;
  clearTimeout(switchTimer);
  mapController?.abort();
  window.removeEventListener("resize", resize);
  observer?.disconnect();
  map?.destroy();
});
</script>

<template>
  <main class="app">
    <div
      ref="mapEl"
      class="map"
      :class="{ fallback: !mapReady }"
      :style="mapStyle"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="drag = null"
      @pointercancel="drag = null"
      @wheel="!mapReady && zoomBy($event.deltaY > 0 ? -0.25 : 0.25)"
    >
      <div v-if="!mapReady" class="map-grid"></div>
    </div>
    <div class="marker-lines">
      <svg :width="viewport.width" :height="viewport.height">
        <g v-for="p in positions" :key="p.id" :data-member-id="p.id">
          <line
            :x1="p.ax"
            :y1="p.ay"
            :x2="connections.find((c) => c.id === p.id)?.end.x"
            :y2="connections.find((c) => c.id === p.id)?.end.y"
            :stroke="members.find((m) => m.id === p.id)?.color"
            stroke-width="2"
          />
          <circle
            :cx="p.ax"
            :cy="p.ay"
            r="7"
            :fill="members.find((m) => m.id === p.id)?.color"
            stroke="white"
            stroke-width="3"
          />
        </g>
      </svg>
    </div>
    <div class="marker-labels">
      <button
        v-for="p in positions"
        :key="p.id"
        class="marker-label"
        :data-member-id="p.id"
        :style="{
          left: p.x + 'px',
          top: p.y + markerSize / 2 + 5 + 'px',
          opacity: faded.has(p.id) ? 0.6 : 1,
        }"
        @click="choose(p.id)"
      >
        {{ members.find((m) => m.id === p.id)?.name }}
      </button>
    </div>
    <div class="marker-photos">
      <button
        v-for="p in positions"
        :key="p.id"
        class="photo-marker"
        :data-member-id="p.id"
        :class="{ selected: selected === p.id }"
        :style="{
          left: p.x + 'px',
          top: p.y + 'px',
          width: markerSize + 'px',
          height: markerSize + 'px',
          '--member-color': members.find((m) => m.id === p.id)?.color,
          opacity: faded.has(p.id) ? 0.6 : 1,
        }"
        :aria-label="members.find((m) => m.id === p.id)?.name"
        @click="choose(p.id)"
      >
        <img
          :src="members.find((m) => m.id === p.id)?.avatar"
          :alt="members.find((m) => m.id === p.id)?.name"
        />
      </button>
    </div>
    <header class="topbar">
      <a class="brand" href="#" @click.prevent="fit">被汐</a
      ><span class="demo-badge">本地模拟位置</span>
      <div class="top-actions">
        <button class="icon-button" title="地图服务设置" aria-label="地图服务设置" @click="settingsOpen = true"><Settings :size="19" /></button>
        <button
          class="icon-button"
          title="保存为默认"
          aria-label="保存为默认"
          @click="saveDefault"
        >
          <Save :size="19" /></button
        ><button
          class="icon-button"
          title="导出图片"
          aria-label="导出图片"
          @click="exportOpen = true"
        >
          <Download :size="19" /></button
        ><button
          class="icon-button"
          title="成员列表"
          aria-label="切换成员列表"
          @click="panel = !panel"
        >
          <Users :size="19" />
        </button>
      </div>
    </header>
    <form class="search" @submit.prevent="search">
      <select v-model="searchRegion" aria-label="搜索区域"><option value="tencent">国内</option><option value="overseas">海外</option></select>
      <Search :size="17" /><input
        v-model="query"
        aria-label="搜索地点"
        placeholder="搜索城市或地点"
      /><button :disabled="searching">
        {{ searching ? "查找中" : "搜索" }}
      </button>
    </form>
    <aside v-if="panel" class="member-panel">
      <div class="panel-heading">
        <h1>
          成员 <span>{{ members.length }}</span>
        </h1>
        <button
          class="icon-button"
          aria-label="收起成员列表"
          @click="panel = false"
        >
          <X :size="18" />
        </button>
      </div>
      <div class="panel-command">
        <button @click="edit()"><Plus :size="16" /> 添加成员</button
        ><button @click="saveDefault"><Save :size="16" /> 保存为默认</button>
      </div>
      <div class="member-list">
        <p v-if="!members.length" class="empty">暂无成员</p>
        <div
          v-for="m in members"
          :key="m.id"
          class="member-row"
          :class="{ active: selected === m.id }"
          :data-member-id="m.id"
        >
          <button class="member-select" @click="choose(m.id)">
            <img :src="m.avatar" :alt="m.name" /><span
              ><strong
                >{{ m.name }} <i :style="{ background: m.color }"></i></strong
              ><small>{{ m.city }}</small></span
            ></button
          ><button
            class="icon-button"
            :aria-label="'编辑' + m.name"
            title="编辑成员"
            @click="edit(m)"
          >
            <Pencil :size="14" />
          </button>
        </div>
      </div>
      <div v-if="current" class="selected-info">
        <strong>{{ current.name }}</strong>
        <p>{{ current.city }}</p>
        <small
          >{{ current.lat.toFixed(6) }}°, {{ current.lng.toFixed(6) }}°</small
        >
        <div>
          <button @click="edit(current)"><Pencil :size="14" /> 编辑</button
          ><button class="danger-text" @click="deleting = current">
            <Trash2 :size="14" /> 删除
          </button>
        </div>
      </div>
      <p class="panel-foot">设置仅保存在此浏览器</p>
    </aside>
    <div class="provider-control"><label>地图 <select v-model="mapMode" aria-label="地图服务"><option value="auto">自动切换</option><option value="tencent">腾讯地图</option><option value="overseas">海外地图</option></select></label><button v-if="!mapReady && !loading" @click="switchMap">重试</button></div>
    <div class="map-controls">
      <button
        class="icon-button"
        title="查看所有成员"
        aria-label="查看所有成员"
        @click="fit"
      >
        <Maximize :size="20" /></button
      ><button class="icon-button" aria-label="放大地图" @click="zoomBy(1)">
        <Plus :size="20" /></button
      ><button class="icon-button" aria-label="缩小地图" @click="zoomBy(-1)">
        <Minus :size="20" /></button
      ><button
        class="icon-button"
        title="定位设备"
        aria-label="定位我的设备"
        @click="locate"
      >
        <LocateFixed :size="20" />
      </button>
    </div>
    <footer class="sharing-bar" :class="{ expanded: stackOpen }">
      <div class="sharing-heading">
        <button
          class="avatar-stack"
          @click="stackOpen = !stackOpen"
          aria-label="展开或收起底部成员"
        >
          <img
            v-for="m in members.slice(0, 12)"
            :key="m.id"
            :src="m.avatar"
            :alt="m.name"
          /><small v-if="members.length > 12" class="stack-more"
            >+{{ members.length - 12 }}</small
          ></button
        ><span>{{ members.length }} 位成员</span
        ><button
          class="icon-button"
          @click="stackOpen = !stackOpen"
          aria-label="展开或收起头像列表"
        >
          <ChevronDown v-if="stackOpen" :size="18" /><ChevronUp
            v-else
            :size="18"
          />
        </button>
      </div>
      <div v-if="stackOpen" class="stack-list">
        <button v-for="m in members" :key="m.id" @click="choose(m.id)">
          <img :src="m.avatar" :alt="m.name" /><span>{{ m.name }}</span></button
        ><button @click="edit()">
          <Plus :size="24" /><span>添加成员</span>
        </button>
      </div>
    </footer>
    <div v-if="notice" class="notice" role="status">
      <span>{{ notice }}</span
      ><button class="icon-button" aria-label="关闭提示" @click="notice = ''">
        <X :size="16" />
      </button>
    </div>
    <div v-if="loading" class="loading-status">正在连接{{ providerName(activeProvider) }}…</div>
    <div class="map-credit">
      {{ mapReady ? providerName(activeProvider) : "本地示意图 · 非真实底图" }} · 被汐
    </div>
    <div v-if="editor" class="modal-backdrop" @click.self="editor = false">
      <form class="editor-modal" @submit.prevent="commit">
        <div class="panel-heading">
          <h2>{{ editingId === null ? "添加成员" : "编辑成员" }}</h2>
          <button
            type="button"
            class="icon-button"
            aria-label="关闭编辑"
            @click="editor = false"
          >
            <X :size="20" />
          </button>
        </div>
        <label class="avatar-upload"
          ><img :src="form.avatar" alt="成员头像" /><span>{{
            avatarBusy ? "处理图片中" : "更换头像"
          }}</span
          ><input type="file" accept="image/*" @change="upload" /></label
        ><label>姓名<input v-model="form.name" maxlength="40" required /></label
        ><label
          >地点<input v-model="form.city" maxlength="120" required
        /></label>
        <div class="field-pair">
          <label
            >纬度（WGS84）<input
              v-model="form.lat"
              type="number"
              step="any"
              min="-85"
              max="85"
              required /></label
          ><label
            >经度（WGS84）<input
              v-model="form.lng"
              type="number"
              step="any"
              min="-180"
              max="180"
              required
          /></label>
        </div>
        <div class="rgb-fields">
          <span class="color-swatch" :style="{ background: formColor }"></span
          ><label v-for="c in ['r', 'g', 'b'] as const" :key="c"
            >{{ c.toUpperCase()
            }}<input
              v-model.number="form[c]"
              type="number"
              min="0"
              max="255"
              step="1"
              required
          /></label>
        </div>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <div class="modal-actions">
          <button type="button" @click="editor = false">取消</button
          ><button class="primary" :disabled="avatarBusy">保存成员</button>
        </div>
      </form>
    </div>
    <div v-if="deleting" class="modal-backdrop">
      <section class="editor-modal confirm">
        <h2>删除 {{ deleting.name }}？</h2>
        <p>保存为默认后，此成员将从下次打开的名单中移除。</p>
        <div class="modal-actions">
          <button @click="deleting = null">取消</button
          ><button class="danger" @click="remove">删除成员</button>
        </div>
      </section>
    </div>
    <MapSettings v-if="settingsOpen" @close="settingsOpen = false" />
    <ExportDialog
      :open="exportOpen"
      :members="members"
      :current-view="view"
      :provider="activeProvider"
      @close="exportOpen = false"
    />
  </main>
</template>
