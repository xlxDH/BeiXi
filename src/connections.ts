export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Connection {
  id: number;
  start: Point;
  end: Point;
}
export interface MemberBounds {
  id: number;
  photo: Rect;
  label: Rect;
}
// Liang–Barsky clipping includes boundary contact and handles reversed/zero-length segments.
export function segmentEntry(
  start: Point,
  end: Point,
  rect: Rect,
): number | null {
  const dx = end.x - start.x,
    dy = end.y - start.y;
  let enter = 0,
    exit = 1;
  const edges = [
    [-dx, start.x - rect.x],
    [dx, rect.x + rect.width - start.x],
    [-dy, start.y - rect.y],
    [dy, rect.y + rect.height - start.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p!) < 1e-9) {
      if (q! < 0) return null;
      continue;
    }
    const t = q! / p!;
    if (p! < 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
    if (enter > exit) return null;
  }
  return enter;
}
export function clipOwnLine(start: Point, center: Point, photo: Rect): Point {
  const t = segmentEntry(start, center, photo);
  return t === null
    ? center
    : {
        x: start.x + (center.x - start.x) * t,
        y: start.y + (center.y - start.y) * t,
      };
}
export function crossedMembers(
  lines: Connection[],
  bounds: MemberBounds[],
): Set<number> {
  const crossed = new Set<number>();
  for (const line of lines) {
    if (Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y) < 1e-6)
      continue;
    for (const member of bounds) {
      if (member.id === line.id) continue;
      if (
        segmentEntry(line.start, line.end, member.photo) !== null ||
        segmentEntry(line.start, line.end, member.label) !== null
      )
        crossed.add(member.id);
    }
  }
  return crossed;
}
