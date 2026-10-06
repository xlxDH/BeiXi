export interface Anchor {
  id: number;
  x: number;
  y: number;
}
export interface MarkerPosition extends Anchor {
  ax: number;
  ay: number;
}
export function layoutMarkers(
  anchors: Anchor[],
  width: number,
  height: number,
  size = 62,
  rightInset = 0,
): MarkerPosition[] {
  const left = 12,
    right = Math.max(left + size, width - rightInset - 12),
    top = 105,
    bottom = Math.max(top + size, height - 115);
  const placed: MarkerPosition[] = [];
  const gap = size + 14;
  for (const anchor of anchors) {
    if (
      anchor.x < -size ||
      anchor.x > width + size ||
      anchor.y < -size ||
      anchor.y > height + size
    )
      continue;
    const targetX = Math.max(
      left + size / 2,
      Math.min(right - size / 2, anchor.x),
    );
    const targetY = Math.max(
      top + size / 2,
      Math.min(bottom - size / 2, anchor.y - size),
    );
    let best: { x: number; y: number; score: number } | undefined;
    for (let y = top + size / 2; y <= bottom - size / 2; y += gap + 22) {
      for (let x = left + size / 2; x <= right - size / 2; x += gap) {
        if (
          placed.some(
            (p) => Math.abs(p.x - x) < gap && Math.abs(p.y - y) < gap + 16,
          )
        )
          continue;
        const score = (x - targetX) ** 2 + (y - targetY) ** 2;
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    let x = targetX,
      y = targetY;
    // A compact landscape uses the complete grid rather than consuming
    // neighbouring cells with a free-positioned first marker.
    if (height < 500 && best) ({ x, y } = best);
    if (
      placed.some(
        (p) => Math.abs(p.x - x) < gap && Math.abs(p.y - y) < gap + 16,
      ) ||
      !best
    ) {
      if (best) ({ x, y } = best);
    }
    placed.push({ id: anchor.id, x, y, ax: anchor.x, ay: anchor.y });
  }
  return placed;
}
