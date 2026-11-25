// What the editor knows about elements: their colours and sizes by name, their boxes, and how to undo a write.

import type { Board, Element, Op, Stored } from "../../../src/board.ts";

export { apply } from "../../../src/board.ts";
export type { Board, Element, Op, Stored };

export const fills = ["yellow", "peach", "pink", "green", "blue", "purple", "white"] as const;
export const inks = ["ink", "terracotta", "blue", "green", "purple"] as const;
export const fill = (color: unknown, fallback = "green") => typeof color === "string" && color.startsWith("#") ? color : `var(--fill-${color ?? fallback})`;
export const ink = (color: unknown) => typeof color === "string" && color.startsWith("#") ? color : `var(--ink-${color ?? "ink"})`;

export const textSizes = { small: 14, body: 16, large: 28, title: 48, huge: 96 } as const;
export type TextSize = keyof typeof textSizes;
export const sizeNames: Record<TextSize, string> = { small: "小", body: "正文", large: "大", title: "标题", huge: "特大" };
export const fontSize = (el: Element, fallback = 16) => textSizes[el.size as TextSize] ?? fallback;

export const shapeKinds = ["rounded", "rect", "ellipse", "diamond", "pill", "hexagon", "parallelogram", "database", "queue", "document", "cloud", "person"] as const;
export const shapeNames: Record<string, string> = {
  rounded: "圆角", rect: "方形", ellipse: "椭圆", diamond: "菱形", pill: "胶囊", hexagon: "六边形", parallelogram: "平行四边形",
  database: "数据库", queue: "队列", document: "文档", cloud: "云", person: "人",
};

/** Elements whose words are edited in place. */
export const hasText = (el: Element) => ["shape", "note", "container", "text", "arrow"].includes(el.type);

/** The size a new element gets when it is placed with a click rather than drawn. */
export const defaults: Record<string, { w: number; h: number }> = { shape: { w: 200, h: 120 }, note: { w: 200, h: 200 }, container: { w: 640, h: 400 } };

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };
export const union = (boxes: Box[]): Box | undefined => {
  if (!boxes.length) return;
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
};
export const contains = (outer: Box, inner: Box) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
export const meets = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const span = (a: Point, b: Point): Box => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

/** A person's new element id; an agent's are e1, e2… */
export const newId = () => `h${Math.random().toString(36).slice(2, 10)}`;

/** An element's own fields, without what the store adds. */
export const fieldsOf = ({ v: _v, by: _by, ...fields }: Stored): Element => fields;

/** The writes that take `ops` back, given the board before them. */
export function inverse(board: Board, ops: Op[]): Op[] {
  const back: Op[] = [];
  for (const op of ops) {
    if (op.op === "meta" || op.op === "claim") continue;
    const before = board.elements[op.id];
    if (!before) back.unshift({ op: "delete", id: op.id });
    else if (op.op === "update") back.unshift({ op: "update", id: op.id, data: Object.fromEntries(Object.keys(op.data).map(key => [key, before[key] ?? null])) });
    else back.unshift({ op: "set", id: op.id, data: fieldsOf(before) });
  }
  if (ops.some(op => op.op === "set" || op.op === "delete" || (op.op === "meta" && op.data.order))) back.push({ op: "meta", data: { order: board.order } });
  return back;
}

export type Side = "top" | "right" | "bottom" | "left";
const sideMiddle = (b: Box, side: Side): Point =>
  side === "top" ? { x: b.x + b.w / 2, y: b.y } : side === "bottom" ? { x: b.x + b.w / 2, y: b.y + b.h }
    : side === "left" ? { x: b.x, y: b.y + b.h / 2 } : { x: b.x + b.w, y: b.y + b.h / 2 };
const centre = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const horizontal = (side: Side) => side === "left" || side === "right";

/** The sides two boxes face each other by. */
function facing(a: Box, b: Box): [Side, Side] {
  const dx = centre(b).x - centre(a).x, dy = centre(b).y - centre(a).y;
  return Math.abs(dx) - (a.w + b.w) / 2 >= Math.abs(dy) - (a.h + b.h) / 2
    ? dx > 0 ? ["right", "left"] : ["left", "right"]
    : dy > 0 ? ["bottom", "top"] : ["top", "bottom"];
}

/** Where an arrow's end is: an element's box, or a point on the board. */
export const endOf = (end: unknown, boxOf: (id: string) => Box | undefined): Box | Point | undefined =>
  Array.isArray(end) && end.length === 2 ? { x: Number(end[0]), y: Number(end[1]) } : typeof end === "string" ? boxOf(end) : undefined;
const isBox = (end: Box | Point): end is Box => "w" in end;

/**
 * An arrow's route, in right-angle legs from the middle of one side to the middle of another, or one straight line where
 * the jog between facing sides would be under 44. `bends` (["v"|"h", …offsets]) plans the legs instead: the first half of
 * the offsets from the centre of `from`, the rest from the centre of `to`.
 */
export function route(el: Element, boxOf: (id: string) => Box | undefined): Point[] | undefined {
  const a = endOf(el.from, boxOf), b = endOf(el.to, boxOf);
  if (!a || !b) return;
  const A = isBox(a) ? a : { ...a, w: 0, h: 0 }, B = isBox(b) ? b : { ...b, w: 0, h: 0 };
  const bends = el.bends as unknown[] | undefined;
  if (Array.isArray(bends) && (bends[0] === "v" || bends[0] === "h") && bends.length > 1) {
    const offsets = bends.slice(1).map(Number), ca = centre(A), cb = centre(B);
    let vertical = bends[0] === "v", at = ca;
    const points = [ca];
    offsets.forEach((offset, i) => {
      const ref = i < Math.ceil(offsets.length / 2) ? ca : cb;
      at = vertical ? { x: at.x, y: ref.y + offset } : { x: ref.x + offset, y: at.y };
      points.push(at);
      vertical = !vertical;
    });
    points.push(vertical ? { x: at.x, y: cb.y } : { x: cb.x, y: at.y }, cb);
    // Each end leaves by the side that faces its leg.
    const clip = (box: Box, from: Point, toward: Point): Point => from.x === toward.x
      ? { x: from.x, y: toward.y > from.y ? box.y + box.h : box.y } : { x: toward.x > from.x ? box.x + box.w : box.x, y: from.y };
    points[0] = clip(A, points[0]!, points[1]!);
    points[points.length - 1] = clip(B, points.at(-1)!, points.at(-2)!);
    return tidyRoute(points);
  }
  let [sa, sb] = facing(A, B);
  if (typeof el.fromSide === "string") sa = el.fromSide as Side;
  if (typeof el.toSide === "string") sb = el.toSide as Side;
  const p = isBox(a) ? sideMiddle(A, sa) : a, q = isBox(b) ? sideMiddle(B, sb) : b;
  // A point end goes the way the other end's side does.
  const ha = isBox(a) ? horizontal(sa) : isBox(b) ? horizontal(sb) : Math.abs(q.x - p.x) >= Math.abs(q.y - p.y);
  const hb = isBox(b) ? horizontal(sb) : ha;
  if (ha && hb) {
    const overlap = [Math.max(A.y, B.y), Math.min(A.y + A.h, B.y + B.h)] as const;
    if (Math.abs(p.y - q.y) < 44 && overlap[0] <= overlap[1] && isBox(a) && isBox(b)) {
      const y = Math.min(overlap[1], Math.max(overlap[0], (p.y + q.y) / 2));
      return [{ x: p.x, y }, { x: q.x, y }];
    }
    const mx = (p.x + q.x) / 2;
    return tidyRoute([p, { x: mx, y: p.y }, { x: mx, y: q.y }, q]);
  }
  if (!ha && !hb) {
    const overlap = [Math.max(A.x, B.x), Math.min(A.x + A.w, B.x + B.w)] as const;
    if (Math.abs(p.x - q.x) < 44 && overlap[0] <= overlap[1] && isBox(a) && isBox(b)) {
      const x = Math.min(overlap[1], Math.max(overlap[0], (p.x + q.x) / 2));
      return [{ x, y: p.y }, { x, y: q.y }];
    }
    const my = (p.y + q.y) / 2;
    return tidyRoute([p, { x: p.x, y: my }, { x: q.x, y: my }, q]);
  }
  return tidyRoute(ha ? [p, { x: q.x, y: p.y }, q] : [p, { x: p.x, y: q.y }, q]);
}

/** Without repeated points or points in the middle of a straight run. */
function tidyRoute(points: Point[]) {
  const out: Point[] = [];
  for (const point of points) {
    const last = out.at(-1), before = out.at(-2);
    if (last && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) continue;
    if (last && before && ((before.x === last.x && last.x === point.x) || (before.y === last.y && last.y === point.y))) out.pop();
    out.push(point);
  }
  return out;
}

/** The point halfway along a route, where its label sits. */
export function halfway(points: Point[]): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  let left = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]!) {
      const t = lengths[i] ? left / lengths[i]! : 0, a = points[i]!, b = points[i + 1]!;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= lengths[i]!;
  }
  return points[0]!;
}

export const boxOfPoints = (points: Point[], pad = 0): Box => {
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x: x - pad, y: y - pad, w: Math.max(...points.map(p => p.x)) - x + pad * 2, h: Math.max(...points.map(p => p.y)) - y + pad * 2 };
};

/** A pen line's points, [x0, y0, x1, y1…] from its x, y. */
export const strokePoints = (el: Element): Point[] => {
  const raw = Array.isArray(el.points) ? el.points as number[] : [];
  const points: Point[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) points.push({ x: raw[i]!, y: raw[i + 1]! });
  return points.length ? points : [{ x: 0, y: 0 }];
};
export const strokeBox = (el: Element): Box => {
  const box = boxOfPoints(strokePoints(el), (Number(el.width) || 4) / 2);
  return { ...box, x: box.x + el.x, y: box.y + el.y };
};

/** A smooth path through the points; a point written twice makes a corner. */
export function smooth(points: Point[]): string {
  if (points.length < 3) return points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ") + (points.length === 1 ? " l0.01,0" : "");
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!, p1 = points[i]!, p2 = points[i + 1]!, p3 = points[i + 2] ?? p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  return d;
}

/** How close `p` comes to a pen line. */
export function distanceToStroke(el: Element, p: Point) {
  const points = strokePoints(el).map(q => ({ x: q.x + el.x, y: q.y + el.y }));
  if (points.length === 1) return Math.hypot(points[0]!.x - p.x, points[0]!.y - p.y);
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    best = Math.min(best, Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y));
  }
  return best;
}

/** The heads at an arrow's two ends. */
export const headsOf = (el: Element): [string, string] => Array.isArray(el.heads) && el.heads.length === 2 ? el.heads as [string, string]
  : el.head === "both" ? ["arrow", "arrow"] : el.head === "none" ? ["none", "none"] : ["none", "arrow"];
