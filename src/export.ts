import { loadMap } from "./services";
import type { Member, View } from "./model";
import { clipOwnLine, crossedMembers } from "./connections";

type Rect = { x: number; y: number; width: number; height: number };
type Positioned = Member & { x: number; y: number; ax: number; ay: number };
export const EXPORT_SCALE = 2;
export function islandsView(
  group: Member[],
  width: number,
  height: number,
): View | undefined {
  const ireland = group.some(
    (m) => m.lat >= 51 && m.lat <= 56 && m.lng >= -11 && m.lng <= -5,
  );
  if (
    !ireland ||
    !group.every(
      (m) => m.lat >= 49 && m.lat <= 61.5 && m.lng >= -11.5 && m.lng <= 3,
    )
  )
    return;
  const minY = merc(61.5),
    maxY = merc(49.2),
    lngSpan = 15;
  return {
    lat: (Math.atan(Math.sinh(Math.PI * (1 - minY - maxY))) * 180) / Math.PI,
    lng: -4,
    zoom: Math.max(
      3,
      Math.log2(
        Math.min(
          (width - 20) / ((lngSpan / 360) * 256),
          (height - 18) / ((maxY - minY) * 256),
        ),
      ),
    ),
  };
}
export function distanceKm(
  a: Pick<Member, "lat" | "lng">,
  b: Pick<Member, "lat" | "lng">,
) {
  const r = Math.PI / 180,
    dlat = (b.lat - a.lat) * r,
    dlng = (b.lng - a.lng) * r;
  return (
    12742 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dlat / 2) ** 2 +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlng / 2) ** 2,
        ),
      ),
    )
  );
}
export function groupRegions(members: Member[]) {
  const remaining = new Set(members.map((m) => m.id)),
    groups: Member[][] = [];
  for (const m of members) {
    if (!remaining.has(m.id)) continue;
    const group = [m];
    remaining.delete(m.id);
    for (let i = 0; i < group.length; i++)
      for (const candidate of members)
        if (
          remaining.has(candidate.id) &&
          distanceKm(group[i]!, candidate) < 2500
        ) {
          group.push(candidate);
          remaining.delete(candidate.id);
        }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}
export function chooseInset(
  points: { x: number; y: number }[],
  width: number,
  height: number,
  index = 0,
): Rect {
  const rects = [
    { x: 24, y: 24, width: 320, height: 240 },
    { x: width - 344, y: 24, width: 320, height: 240 },
    { x: 24, y: height - 284, width: 320, height: 240 },
    { x: width - 344, y: height - 284, width: 320, height: 240 },
  ];
  const sorted = rects
    .map((rect) => ({
      rect,
      score: points.filter(
        (p) =>
          p.x > rect.x - 60 &&
          p.x < rect.x + rect.width + 60 &&
          p.y > rect.y - 90 &&
          p.y < rect.y + rect.height + 80,
      ).length,
    }))
    .sort((a, b) => a.score - b.score);
  const available = sorted.filter((candidate) => candidate.score === 0);
  if (!available[index])
    throw new Error(
      "主图没有足够的空白区域放置远距离小窗，请减少成员或调整位置后重试。",
    );
  return available[index]!.rect;
}
function merc(lat: number) {
  return (
    (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2
  );
}
export function fitView(group: Member[], width: number, height: number) {
  const lngs = group.map((m) => m.lng),
    ys = group.map((m) => merc(m.lat));
  const x1 = Math.min(...lngs),
    x2 = Math.max(...lngs),
    y1 = Math.min(...ys),
    y2 = Math.max(...ys);
  const zoom =
    group.length === 1
      ? 7
      : Math.max(
          3,
          Math.min(
            9,
            Math.log2(
              Math.min(
                Math.max(40, width - Math.min(210, width * 0.35)) /
                  Math.max(0.005, ((x2 - x1) / 360) * 256),
                Math.max(40, height - Math.min(230, height * 0.45)) /
                  Math.max(0.005, (y2 - y1) * 256),
              ),
            ),
          ),
        );
  return {
    lat: (Math.atan(Math.sinh(Math.PI * (1 - y1 - y2))) * 180) / Math.PI,
    lng: (x1 + x2) / 2,
    zoom,
  };
}
function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function image(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("头像图片无法加载，导出已取消。"));
    img.src = url;
  });
}
function positionPhotos(
  members: Member[],
  project: (m: Member) => { x: number; y: number },
  width: number,
  height: number,
  size: number,
): Positioned[] {
  const placed: Positioned[] = [];
  for (const m of members) {
    const p = project(m);
    const target = {
      x: Math.max(size / 2 + 15, Math.min(width - size / 2 - 15, p.x)),
      y: Math.max(size / 2 + 20, Math.min(height - size / 2 - 55, p.y - size)),
    };
    let best = { ...target, score: Infinity };
    for (let radius = 0; radius <= Math.max(width, height); radius += size + 14)
      for (let angle = 0; angle < 360; angle += 30) {
        const x = Math.max(
            size / 2 + 15,
            Math.min(
              width - size / 2 - 15,
              target.x + radius * Math.cos((angle * Math.PI) / 180),
            ),
          ),
          y = Math.max(
            size / 2 + 20,
            Math.min(
              height - size / 2 - 55,
              target.y + radius * Math.sin((angle * Math.PI) / 180),
            ),
          );
        if (
          placed.some(
            (q) =>
              Math.abs(q.x - x) < size + 14 && Math.abs(q.y - y) < size + 42,
          )
        )
          continue;
        const score = (x - target.x) ** 2 + (y - target.y) ** 2;
        if (score < best.score) best = { x, y, score };
      }
    if (!Number.isFinite(best.score))
      throw new Error("成员过多，当前导出尺寸无法清晰排列，请减少成员后重试。");
    placed.push({ ...m, x: best.x, y: best.y, ax: p.x, ay: p.y });
  }
  return placed;
}
function drawMembers(
  ctx: CanvasRenderingContext2D,
  positions: Positioned[],
  size: number,
  photos: HTMLImageElement[],
) {
  ctx.font = "500 15px sans-serif";
  ctx.textAlign = "center";
  const bounds = positions.map((p) => {
    const w = Math.min(230, ctx.measureText(p.name).width + 22);
    return {
      id: p.id,
      photo: {
        x: p.x - size / 2 - 4,
        y: p.y - size / 2 - 4,
        width: size + 8,
        height: size + 8,
      },
      label: { x: p.x - w / 2, y: p.y + size / 2 + 7, width: w, height: 27 },
    };
  });
  const lines = positions.map((p) => ({
    id: p.id,
    start: { x: p.ax, y: p.ay },
    end: clipOwnLine(
      { x: p.ax, y: p.ay },
      { x: p.x, y: p.y },
      bounds.find((b) => b.id === p.id)!.photo,
    ),
  }));
  const faded = crossedMembers(lines, bounds);
  for (const p of positions) {
    ctx.save();
    ctx.globalAlpha = faded.has(p.id) ? 0.6 : 1;
    const max = 230,
      label = p.name,
      w = Math.min(max, ctx.measureText(label).width + 22);
    ctx.fillStyle = "rgba(255,255,255,.96)";
    rounded(ctx, p.x - w / 2, p.y + size / 2 + 7, w, 27, 7);
    ctx.fill();
    ctx.fillStyle = "#253b40";
    ctx.fillText(label, p.x, p.y + size / 2 + 26, max - 16);
    ctx.restore();
  }
  // All avatar photos render after all labels, preserving their global visual priority.
  positions.forEach((p, i) => {
    ctx.save();
    ctx.globalAlpha = faded.has(p.id) ? 0.6 : 1;
    rounded(
      ctx,
      p.x - size / 2 - 4,
      p.y - size / 2 - 4,
      size + 8,
      size + 8,
      12,
    );
    ctx.fillStyle = p.color;
    ctx.fill();
    rounded(
      ctx,
      p.x - size / 2 - 2,
      p.y - size / 2 - 2,
      size + 4,
      size + 4,
      10,
    );
    ctx.fillStyle = "#fff";
    ctx.fill();
    rounded(ctx, p.x - size / 2, p.y - size / 2, size, size, 8);
    ctx.clip();
    const img = photos[i]!,
      edge = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(
      img,
      (img.naturalWidth - edge) / 2,
      (img.naturalHeight - edge) / 2,
      edge,
      edge,
      p.x - size / 2,
      p.y - size / 2,
      size,
      size,
    );
    ctx.restore();
  });
  // Connections always paint last and remain opaque; each photo's own line stops at its border.
  for (const p of positions) {
    const line = lines.find((l) => l.id === p.id)!;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(line.start.x, line.start.y);
    ctx.lineTo(line.end.x, line.end.y);
    ctx.stroke();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.ax, p.ay, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  return positions;
}
async function capture(
  T: any,
  group: Member[],
  width: number,
  height: number,
  view?: View,
  signal?: AbortSignal,
  layoutMembers = true,
  islands = false,
) {
  signal?.throwIfAborted();
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: `${width * EXPORT_SCALE}px`,
    height: `${height * EXPORT_SCALE}px`,
    pointerEvents: "none",
  });
  document.body.appendChild(container);
  const initial = view || fitView(group, width, height);
  let map: any;
  try {
    map = new T.Map(container, {
      center: new T.LatLng(initial.lat, initial.lng),
      zoom: initial.zoom + Math.log2(EXPORT_SCALE),
      maxZoom: 21,
      viewMode: "2D",
      pitch: 0,
      rotation: 0,
      renderOptions: { preserveDrawingBuffer: true },
    });
    const controls = T.constants.DEFAULT_CONTROL_ID;
    map.removeControl(controls.ZOOM);
    map.removeControl(controls.ROTATION);
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      let idleTimer: ReturnType<typeof setTimeout>;
      const timeout = setTimeout(finish, 6500);
      const abort = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        clearTimeout(idleTimer);
        reject(new DOMException("导出已取消", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        clearTimeout(idleTimer);
        signal?.removeEventListener("abort", abort);
        resolve();
      }
      map.on("idle", () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(finish, 1800);
      });
    });
    signal?.throwIfAborted();
    const result = document.createElement("canvas");
    result.width = width * EXPORT_SCALE;
    result.height = height * EXPORT_SCALE;
    const ctx = result.getContext("2d")!;
    const canvases = Array.from(container.querySelectorAll("canvas"));
    if (!canvases.length)
      throw new Error("地图画布尚未加载，请检查网络后重试。");
    for (const canvas of canvases) {
      if (canvas.width && canvas.height)
        ctx.drawImage(canvas, 0, 0, result.width, result.height);
    }
    const pixels = ctx.getImageData(0, 0, result.width, result.height).data;
    let nonblank = 0;
    for (let i = 0; i < pixels.length; i += 400)
      if (
        pixels[i + 3] > 0 &&
        (pixels[i] !== pixels[0] ||
          pixels[i + 1] !== pixels[1] ||
          pixels[i + 2] !== pixels[2])
      )
        nonblank++;
    if (nonblank < 30)
      throw new Error("地图画布为空，无法导出真实地图，请检查地图服务后重试。");
    const project = (m: Member) => {
      const p = map.projectToContainer(new T.LatLng(m.lat, m.lng));
      return { x: p.x / EXPORT_SCALE, y: p.y / EXPORT_SCALE };
    };
    const visible = view
      ? group.filter((m) => {
          const p = project(m);
          return p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;
        })
      : group;
    ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
    const islandPositions =
      islands && visible.length === 1
        ? visible.map((m) => ({
            ...m,
            x: 42,
            y: height * 0.43,
            ax: project(m).x,
            ay: project(m).y,
          }))
        : undefined;
    const positions = layoutMembers
      ? islandPositions || positionPhotos(visible, project, width, height, width < 500 ? 48 : 64)
      : visible.map((m) => ({
          ...m,
          ...project(m),
          ax: project(m).x,
          ay: project(m).y,
        }));
    signal?.throwIfAborted();
    const credit = (
      container.querySelector(".logo-text")?.textContent ||
      "腾讯地图 · 审图号见地图服务"
    ).trim();
    return { canvas: result, positions, credit };
  } catch (e) {
    if (e instanceof DOMException && e.name === "SecurityError")
      throw new Error(
        "地图或头像跨域限制阻止了 PNG 导出，请使用本地头像并检查腾讯地图配置。",
      );
    throw e;
  } finally {
    map?.destroy();
    container.remove();
  }
}
export async function prepareExport(
  members: Member[],
  currentView: View,
  mode: "smart" | "current" = "smart",
  signal?: AbortSignal,
): Promise<ExportScene> {
  signal?.throwIfAborted();
  if (!members.length) throw new Error("请先添加成员，再导出地图。");
  // Keep all editable positions detached from live member data.
  members = members.map((m) => ({ ...m }));
  const T = await loadMap();
  const width = 1280,
    height = 900;
  const groups = mode === "smart" ? groupRegions(members) : [members];
  const primary = groups[0]!;
  const source =
    mode === "current" ? document.querySelector<HTMLElement>(".map") : null;
  const sourceWidth = source?.clientWidth || width,
    sourceHeight = source?.clientHeight || height;
  const screenWidth = source?.getBoundingClientRect().width || sourceWidth;
  const screenScale = screenWidth / sourceWidth;
  const screenPositions =
    mode === "current"
      ? members.flatMap((m) => {
          const photo = document.querySelector<HTMLElement>(
            `.photo-marker[data-member-id="${m.id}"]`,
          );
          const circle = document.querySelector<SVGCircleElement>(
            `.marker-lines [data-member-id="${m.id}"] circle`,
          );
          if (!photo || !circle) return [];
          return [
            {
              ...m,
              x: parseFloat(photo.style.left),
              y: parseFloat(photo.style.top),
              ax: circle.cx.baseVal.value,
              ay: circle.cy.baseVal.value,
            },
          ];
        })
      : [];
  const screenPhotoSize =
    mode === "current"
      ? document.querySelector<HTMLElement>(".photo-marker")?.offsetWidth || 58
      : 64;
  const main = await capture(
    T,
    primary,
    mode === "current" ? sourceWidth : width,
    mode === "current" ? sourceHeight : height,
    mode === "current" ? currentView : undefined,
    signal,
    mode !== "current",
  );
  let mainSize = 64;
  if (mode === "current") {
    const output = document.createElement("canvas");
    output.width = width * EXPORT_SCALE;
    output.height = height * EXPORT_SCALE;
    const outputCtx = output.getContext("2d")!;
    outputCtx.scale(EXPORT_SCALE, EXPORT_SCALE);
    outputCtx.fillStyle = "#eef3f1";
    outputCtx.fillRect(0, 0, width, height);
    const scale = Math.min(width / sourceWidth, (height - 38) / sourceHeight),
      ox = (width - sourceWidth * scale) / 2,
      oy = (height - 38 - sourceHeight * scale) / 2;
    outputCtx.drawImage(
      main.canvas,
      ox,
      oy,
      sourceWidth * scale,
      sourceHeight * scale,
    );
    const fixed = screenPositions.map((p) => ({
      ...p,
      x: ox + (p.x * scale) / screenScale,
      y: oy + (p.y * scale) / screenScale,
      ax: ox + (p.ax * scale) / screenScale,
      ay: oy + (p.ay * scale) / screenScale,
    }));
    if (!fixed.length && main.positions.length)
      throw new Error("当前成员图层尚未完成布局，请稍后重试。");
    mainSize = (screenPhotoSize * scale) / screenScale;
    main.positions = fixed;
    main.canvas = output;
  }
  const layers: ExportLayer[] = [];
  async function addLayer(captured: typeof main, rect: Rect, size: number, frame?: Rect, title?: string) {
    const photos = await Promise.all(captured.positions.map((p) => image(p.avatar)));
    signal?.throwIfAborted();
    layers.push({ ...rect, background: captured.canvas, positions: captured.positions,
      initial: captured.positions.map((p) => ({ x: p.x, y: p.y })), photos, size, frame, title });
  }
  await addLayer(main, { x: 0, y: 0, width, height }, mainSize);
  if (groups.length > 5)
    throw new Error(
      "远距离区域过多，最多支持主图加 4 个小窗，请调整成员后重试。",
    );
  for (let i = 1; i < groups.length; i++) {
    const region = groups[i]!;
    const subjects = main.positions.flatMap((p) => [
      { x: p.x, y: p.y },
      { x: p.ax, y: p.ay },
      ...Array.from({ length: 9 }, (_, i) => ({
        x: p.x + ((p.ax - p.x) * (i + 1)) / 10,
        y: p.y + ((p.ay - p.y) * (i + 1)) / 10,
      })),
    ]);
    const rect = chooseInset(subjects, width, height, i - 1);
    const inset = await capture(
      T,
      region,
      rect.width - 16,
      rect.height - 54,
      islandsView(region, rect.width - 16, rect.height - 54),
      signal,
      true,
      !!islandsView(region, rect.width - 16, rect.height - 54),
    );
    const title = `${region[0]!.city} · ${Math.round(distanceKm(primary[0]!, region[0]!))} km`;
    await addLayer(inset, { x: rect.x + 8, y: rect.y + 38, width: rect.width - 16, height: rect.height - 54 }, 48, rect, title);
  }
  signal?.throwIfAborted();
  return { width, height, layers, credit: main.credit };
}

export interface ExportLayer extends Rect {
  background: HTMLCanvasElement;
  positions: Positioned[];
  initial: { x: number; y: number }[];
  photos: HTMLImageElement[];
  size: number;
  frame?: Rect;
  title?: string;
}
export interface ExportScene {
  width: number;
  height: number;
  layers: ExportLayer[];
  credit: string;
}

export function exportHandles(scene: ExportScene) {
  const ctx = scene.layers[0]!.background.getContext("2d")!;
  ctx.font = "500 15px sans-serif";
  return scene.layers.flatMap((layer, layerIndex) => layer.positions.map((p, index) => {
    const labelWidth = Math.min(230, ctx.measureText(p.name).width + 22);
    return { layerIndex, index, name: p.name, id: p.id,
      photo: { x: layer.x + p.x - layer.size / 2 - 4, y: layer.y + p.y - layer.size / 2 - 4, width: layer.size + 8, height: layer.size + 8 },
      label: { x: layer.x + p.x - labelWidth / 2, y: layer.y + p.y + layer.size / 2 + 7, width: labelWidth, height: 27 },
    };
  }));
}

export function moveExportMember(scene: ExportScene, layerIndex: number, index: number, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const layer = scene.layers[layerIndex]!, p = layer.positions[index]!;
  const ctx = layer.background.getContext("2d")!;
  ctx.font = "500 15px sans-serif";
  const halfWidth = Math.max(layer.size / 2 + 4, Math.min(230, ctx.measureText(p.name).width + 22) / 2);
  x = Math.max(halfWidth, Math.min(layer.width - halfWidth, x));
  y = Math.max(layer.size / 2 + 4, Math.min(layer.height - (layerIndex === 0 ? 38 : 0) - layer.size / 2 - 34, y));
  // Main-map photos must stay clear of inset windows, which render above them.
  if (layerIndex === 0 && scene.layers.some(({ frame: r }) => r &&
    x + halfWidth > r.x && x - halfWidth < r.x + r.width &&
    y + layer.size / 2 + 34 > r.y && y - layer.size / 2 - 4 < r.y + r.height)) return false;
  const changed = p.x !== x || p.y !== y;
  p.x = x;
  p.y = y;
  return changed;
}

export function resetExportLayout(scene: ExportScene) {
  for (const layer of scene.layers) layer.positions.forEach((p, i) => {
    p.x = layer.initial[i]!.x;
    p.y = layer.initial[i]!.y;
  });
}

export function renderExport(scene: ExportScene, canvas: HTMLCanvasElement) {
  const { width, height } = scene;
  if (canvas.width !== width * EXPORT_SCALE) canvas.width = width * EXPORT_SCALE;
  if (canvas.height !== height * EXPORT_SCALE) canvas.height = height * EXPORT_SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);
  ctx.clearRect(0, 0, width, height);
  for (const layer of scene.layers) {
    const rect = layer.frame;
    if (rect) {
      ctx.save();
      ctx.shadowColor = "#29445030";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#fff";
      rounded(ctx, rect.x, rect.y, rect.width, rect.height, 8);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#608991";
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      rounded(ctx, rect.x, rect.y, rect.width, rect.height, 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "500 13px sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "#3e6972";
      ctx.fillText(layer.title || "", rect.x + 13, rect.y + 25, rect.width - 26);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(layer.x, layer.y);
    ctx.beginPath();
    ctx.rect(0, 0, layer.width, layer.height);
    ctx.clip();
    ctx.drawImage(layer.background, 0, 0, layer.width, layer.height);
    drawMembers(ctx, layer.positions, layer.size, layer.photos);
    ctx.restore();
  }
  ctx.fillStyle = "rgba(255,255,255,.94)";
  ctx.fillRect(0, height - 38, width, 38);
  ctx.fillStyle = "#536f76";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`腾讯地图  |  ${scene.credit}`, 16, height - 14, width - 210);
  ctx.textAlign = "right";
  ctx.fillText("被溪 · 本地位置示意", width - 16, height - 14);
}

export function exportBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("PNG 编码失败，请重试。")),
      "image/png",
    ),
  );
}

export async function exportMap(members: Member[], currentView: View, mode: "smart" | "current" = "smart", signal?: AbortSignal) {
  const scene = await prepareExport(members, currentView, mode, signal);
  const canvas = document.createElement("canvas");
  renderExport(scene, canvas);
  signal?.throwIfAborted();
  return exportBlob(canvas);
}
