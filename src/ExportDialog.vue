<script setup lang="ts">
import { ref, shallowRef, computed, watch, nextTick, onUnmounted } from "vue";
import { Download, X, Image, LoaderCircle, RotateCcw } from "lucide-vue-next";
import type { Provider } from "./coordinates";
import { downloadPng } from "./download";
import type { Member, View } from "./model";
import { prepareExport, renderExport, exportBlob, exportHandles, moveExportMember, resetExportLayout, type ExportScene } from "./export";
import "./export.css";
const props = defineProps<{ members: Member[]; currentView: View; open: boolean; provider: Provider }>();
const emit = defineEmits<{ close: [] }>();
const busy = ref(false), downloading = ref(false), error = ref(""), mode = ref<"smart" | "current">("smart");
const scene = shallowRef<ExportScene>();
const canvas = ref<HTMLCanvasElement>();
const revision = ref(0), adjusted = ref(false), dragging = ref(false);
const handles = computed(() => { revision.value; return scene.value ? exportHandles(scene.value) : []; });
let generation = 0;
let controller: AbortController | undefined;
let drag: { pointerId: number; target: HTMLElement; layerIndex: number; index: number; clientX: number; clientY: number; x: number; y: number } | undefined;
function endDrag() {
  const previous = drag;
  drag = undefined;
  dragging.value = false;
  if (previous?.target.hasPointerCapture(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId);
}
function clear() {
  endDrag();
  scene.value = undefined;
  adjusted.value = false;
  error.value = "";
}
function cancel() {
  controller?.abort();
  generation++;
  clear();
  busy.value = false;
  downloading.value = false;
}
watch(() => props.open, (open) => { if (!open) cancel(); });
watch(mode, cancel);
function redraw() {
  if (scene.value && canvas.value) renderExport(scene.value, canvas.value);
  revision.value++;
}
async function generate() {
  controller?.abort();
  controller = new AbortController();
  const token = ++generation;
  busy.value = true;
  clear();
  try {
    const result = await prepareExport(props.members, { ...props.currentView }, mode.value, controller.signal, props.provider);
    if (token !== generation || !props.open) return;
    scene.value = result;
    await nextTick();
    if (token === generation && props.open) redraw();
  } catch (e) {
    if (token === generation) { clear(); error.value = (e as Error).message; }
  } finally {
    if (token === generation) busy.value = false;
  }
}
function startDrag(event: PointerEvent, layerIndex: number, index: number) {
  if (!scene.value || busy.value || downloading.value || drag || event.button !== 0) return;
  event.preventDefault();
  const p = scene.value.layers[layerIndex]!.positions[index]!;
  const target = event.currentTarget as HTMLElement;
  drag = { pointerId: event.pointerId, target, layerIndex, index, clientX: event.clientX, clientY: event.clientY, x: p.x, y: p.y };
  target.focus({ preventScroll: true });
  target.setPointerCapture(event.pointerId);
  dragging.value = true;
}
function move(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId || !scene.value || !canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  if (moveExportMember(scene.value, drag.layerIndex, drag.index,
    drag.x + (event.clientX - drag.clientX) * scene.value.width / rect.width,
    drag.y + (event.clientY - drag.clientY) * scene.value.height / rect.height)) {
    adjusted.value = true;
    redraw();
  }
}
function finishDrag(event: PointerEvent) {
  if (drag?.pointerId !== event.pointerId) return;
  if (event.type === "pointerup") move(event);
  endDrag();
}
function nudge(event: KeyboardEvent, layerIndex: number, index: number) {
  const delta: Record<string, number[]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const step = delta[event.key];
  if (!step || !scene.value || busy.value || downloading.value) return;
  event.preventDefault();
  const p = scene.value.layers[layerIndex]!.positions[index]!, amount = event.shiftKey ? 20 : 5;
  if (moveExportMember(scene.value, layerIndex, index, p.x + step[0]! * amount, p.y + step[1]! * amount)) { adjusted.value = true; redraw(); }
}
function reset() {
  if (!scene.value) return;
  endDrag();
  resetExportLayout(scene.value);
  adjusted.value = false;
  redraw();
}
function boxStyle(rect: { x: number; y: number; width: number; height: number }) {
  return { left: `${rect.x / scene.value!.width * 100}%`, top: `${rect.y / scene.value!.height * 100}%`, width: `${rect.width / scene.value!.width * 100}%`, height: `${rect.height / scene.value!.height * 100}%` };
}
async function download() {
  if (!canvas.value || downloading.value || busy.value) return;
  const token = generation;
  downloading.value = true;
  error.value = "";
  endDrag();
  try {
    const blob = await exportBlob(canvas.value);
    if (token !== generation || !props.open) return;
    await downloadPng(blob);
  } catch (e) {
    if (token === generation) error.value = (e as Error).message;
  } finally {
    if (token === generation) downloading.value = false;
  }
}
onUnmounted(cancel);
</script>
<template>
  <div v-if="open" class="export-backdrop" @click.self="emit('close')">
    <section
      class="export-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
    >
      <header>
        <div>
          <h2 id="export-title">导出地图</h2>
          <p>被汐 · {{ members.length }} 位成员</p>
        </div>
        <button
          class="export-close"
          aria-label="关闭导出"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </header>
      <div class="export-options">
        <label
          ><input
            v-model="mode"
            type="radio"
            value="smart"
            :disabled="busy || downloading"
          />主区域 + 远距离小窗</label
        ><label
          ><input
            v-model="mode"
            type="radio"
            value="current"
            :disabled="busy || downloading"
          />当前地图范围</label
        ><button :disabled="busy || downloading || !members.length" @click="generate">
          <LoaderCircle v-if="busy" :size="16" class="spin" /><Image
            v-else
            :size="16"
          />{{ busy ? "正在生成真实地图…" : scene ? "重新生成" : "生成预览" }}
        </button>
      </div>
      <div v-if="scene" class="export-edit-tools">
        <p id="export-drag-help">拖动头像或姓名调整排布，经纬度保持不变。选中后也可用方向键微调。</p>
        <button :disabled="!adjusted || downloading" @click="reset"><RotateCcw :size="14" />重置排布</button>
      </div>
      <div class="export-preview">
        <div v-if="scene" class="export-editor" :class="{ dragging }">
          <canvas ref="canvas" role="img" aria-label="被汐地图 PNG 导出预览" />
          <template v-for="handle in handles" :key="`${handle.layerIndex}-${handle.id}`">
            <button v-for="part in (['label', 'photo'] as const)" :key="part"
              class="export-member-handle" :class="`export-handle-${part}`"
              :style="{ ...boxStyle(handle[part]), zIndex: handle.layerIndex * 2 + (part === 'photo' ? 2 : 1) }"
              :aria-label="`调整${handle.name}的${part === 'photo' ? '头像' : '姓名'}位置`"
              aria-describedby="export-drag-help" :disabled="busy || downloading"
              @pointerdown="startDrag($event, handle.layerIndex, handle.index)"
              @pointermove="move" @pointerup="finishDrag" @pointercancel="finishDrag" @lostpointercapture="finishDrag"
              @keydown="nudge($event, handle.layerIndex, handle.index)" />
          </template>
        </div>
        <p v-else-if="busy" role="status">地图正在加载，稍等片刻…</p>
        <p v-else-if="error" class="export-error" role="alert">{{ error }}</p>
        <p v-else>{{ members.length ? "尚未生成预览" : "请先添加成员" }}</p>
      </div>
      <p v-if="scene && error" class="export-download-error" role="alert">{{ error }}</p>
      <footer>
        <span v-if="scene">2560 × 1800 · PNG</span
        ><span v-else>地图与头像仅在本机生成</span
        ><button @click="emit('close')">取消</button
        ><button
          class="export-download"
          :disabled="!scene || busy || downloading"
          @click="download"
        >
          <Download :size="16" />{{ downloading ? "正在保存…" : "下载图片" }}
        </button>
      </footer>
    </section>
  </div>
</template>
