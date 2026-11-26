// What the editor knows about elements: their colours and sizes by name, their boxes, and how to undo a write.

import type { Board, Element, Op, Stored } from "../../../src/board.ts";

export { apply } from "../../../src/board.ts";
export type { Board, Element, Op, Stored, Timer } from "../../../src/board.ts";

export const fills = ["yellow", "peach", "pink", "green", "blue", "purple", "white"] as const;
export const inks = ["ink", "terracotta", "blue", "green", "purple"] as const;
export const fill = (color: unknown, fallback = "green") => typeof color === "string" && color.startsWith("#") ? color : `var(--fill-${color ?? fallback})`;
export const ink = (color: unknown) => typeof color === "string" && color.startsWith("#") ? color : `var(--ink-${color ?? "ink"})`;

export const textSizes = { small: 14, body: 16, large: 28, title: 48, huge: 96 } as const;
export type TextSize = keyof typeof textSizes;
export const sizeNames: Record<TextSize, string> = { small: "小", body: "正文", large: "大", title: "标题", huge: "特大" };
export const fontSize = (el: Element, fallback = 16) => textSizes[el.size as TextSize] ?? fallback;

export const fonts: Record<string, { name: string; family?: string }> = {
  sans: { name: "默认" }, serif: { name: "衬线", family: 'ui-serif, "Songti SC", Georgia, serif' },
  mono: { name: "等宽", family: 'ui-monospace, "SF Mono", Menlo, monospace' }, hand: { name: "手写", family: '"Kaiti SC", STKaiti, "Comic Sans MS", cursive' },
};
export const fontOf = (el: Element) => fonts[String(el.font)]?.family;
/** A line's dashes: `dash` true for dashes, "dot" for dots. */
export const dashOf = (el: Element) => el.dash === "dot" ? "1.5 5" : el.dash ? "7 6" : undefined;

/** What "paste style" carries: everything about how an element looks, nothing about what or where it is. */
export const styleKeys = ["color", "stroke", "hollow", "size", "textAlign", "font", "dash", "heads", "head", "width", "heat"];
/** Elements coloured from the fills; the rest are coloured from the inks. */
export const filled = (el: Element) => ["shape", "note", "container", "table"].includes(el.type);

export const shapeKinds = ["rounded", "rect", "ellipse", "diamond", "pill", "hexagon", "parallelogram", "database", "queue", "document", "cloud", "person"] as const;
export const shapeNames: Record<string, string> = {
  rounded: "圆角", rect: "方形", ellipse: "椭圆", diamond: "菱形", pill: "胶囊", hexagon: "六边形", parallelogram: "平行四边形",
  database: "数据库", queue: "队列", document: "文档", cloud: "云", person: "人",
};

/** Elements whose words are edited in place. */
export const hasText = (el: Element) => ["shape", "note", "container", "text", "arrow"].includes(el.type);

/** The size a new element gets when it is placed with a click rather than drawn. */
export const defaults: Record<string, { w: number; h: number }> = {
  shape: { w: 200, h: 120 }, note: { w: 200, h: 200 }, container: { w: 640, h: 400 }, html: { w: 480, h: 320 }, link: { w: 300, h: 88 }, sticker: { w: 40, h: 40 },
};

/** A table's cells as written, every row as long as the longest. */
export const cellsOf = (el: Element): string[][] => {
  const rows = Array.isArray(el.rows) ? (el.rows as unknown[]).map(row => Array.isArray(row) ? row.map(cell => cell == null ? "" : String(cell)) : []) : [];
  const width = Math.max(1, ...rows.map(row => row.length));
  return rows.map(row => [...row, ...Array<string>(width - row.length).fill("")]);
};

/** The words an element shows, for finding it. */
export const wordsOf = (el: Element) => [el.text, el.label, el.placeholder, el.title, el.url, el.emoji, ...el.type === "table" ? cellsOf(el).flat() : []]
  .filter(w => typeof w === "string").join("\n");

/** Stickers people put on things. */
export const stickers = ["👍", "❤️", "🔥", "⭐", "🎉", "✅", "❌", "❓"];

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
 * the jog between facing sides would be under 44; when that runs through one of `solids`, a way around them. `bends`
 * (["v"|"h", …offsets]) plans the legs instead: the first half of the offsets from the centre of `from`, the rest from the
 * centre of `to`.
 */
export function route(el: Element, boxOf: (id: string) => Box | undefined, solids: Box[] = []): Point[] | undefined {
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
  const plain = direct(A, B, p, q, ha, hb, isBox(a) && isBox(b));
  // Only what lies between the ends can be in the way.
  const near = solids.filter(s => meets(s, { x: Math.min(p.x, q.x) - 400, y: Math.min(p.y, q.y) - 400, w: Math.abs(p.x - q.x) + 800, h: Math.abs(p.y - q.y) + 800 }));
  if (!near.some(s => plain.some((point, i) => i > 0 && crosses(plain[i - 1]!, point, s)))) return plain;
  // Going around, an end may leave by any side, its own first, unless the arrow names it.
  const ends = (end: Box | Point, box: Box, side: Side, named: boolean): End[] => !isBox(end) ? [{ at: end }]
    : (named ? [side] : sides).map(s => ({ at: sideMiddle(box, s), side: s, extra: s === side ? 0 : 30 }));
  return around(ends(a, A, sa, typeof el.fromSide === "string"), ends(b, B, sb, typeof el.toSide === "string"), near) ?? plain;
}

function direct(A: Box, B: Box, p: Point, q: Point, ha: boolean, hb: boolean, boxes: boolean): Point[] {
  if (ha && hb) {
    const overlap = [Math.max(A.y, B.y), Math.min(A.y + A.h, B.y + B.h)] as const;
    if (Math.abs(p.y - q.y) < 44 && overlap[0] <= overlap[1] && boxes) {
      const y = Math.min(overlap[1], Math.max(overlap[0], (p.y + q.y) / 2));
      return [{ x: p.x, y }, { x: q.x, y }];
    }
    const mx = (p.x + q.x) / 2;
    return tidyRoute([p, { x: mx, y: p.y }, { x: mx, y: q.y }, q]);
  }
  if (!ha && !hb) {
    const overlap = [Math.max(A.x, B.x), Math.min(A.x + A.w, B.x + B.w)] as const;
    if (Math.abs(p.x - q.x) < 44 && overlap[0] <= overlap[1] && boxes) {
      const x = Math.min(overlap[1], Math.max(overlap[0], (p.x + q.x) / 2));
      return [{ x, y: p.y }, { x, y: q.y }];
    }
    const my = (p.y + q.y) / 2;
    return tidyRoute([p, { x: p.x, y: my }, { x: q.x, y: my }, q]);
  }
  return tidyRoute(ha ? [p, { x: q.x, y: p.y }, q] : [p, { x: p.x, y: q.y }, q]);
}

/** Whether a straight leg from a to b passes through the inside of box s (running along its edge does not). */
const crosses = (a: Point, b: Point, s: Box) => a.y === b.y
  ? a.y > s.y && a.y < s.y + s.h && Math.max(a.x, b.x) > s.x && Math.min(a.x, b.x) < s.x + s.w
  : a.x > s.x && a.x < s.x + s.w && Math.max(a.y, b.y) > s.y && Math.min(a.y, b.y) < s.y + s.h;

const sides: Side[] = ["top", "right", "bottom", "left"];
const steps: Record<Side, Point> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
/** A place an arrow can leave or arrive: a side's middle (and what taking a side other than its own costs), or a free point. */
type End = { at: Point; side?: Side; extra?: number };
const detours = new Map<string, Point[] | undefined>();

/**
 * The way between one of `starts` and one of `goals` in right angles around `solids`, kept `gap` clear of them: the fewest
 * bends, then the shortest. It runs on the lines along the solids' edges and through the ends, a short way out from each side.
 */
function around(starts: End[], goals: End[], solids: Box[]): Point[] | undefined {
  const key = JSON.stringify([starts, goals, solids]);
  if (detours.has(key)) return detours.get(key);
  if (detours.size > 400) detours.clear();
  const gap = 20, out = ({ at, side }: End) => side ? { x: at.x + steps[side].x * gap, y: at.y + steps[side].y * gap } : at;
  const inside = (e: Point, b: Box) => e.x > b.x && e.x < b.x + b.w && e.y > b.y && e.y < b.y + b.h;
  // A solid hugging an end's own side cannot be kept clear of: it is passed as close as it is. Other sides it closes.
  const own = [starts, goals].map(list => out(list.find(e => !e.extra)!));
  const pads = solids.map(b => ({ x: b.x - gap, y: b.y - gap, w: b.w + 2 * gap, h: b.h + 2 * gap })).filter(b => !own.some(e => inside(e, b)));
  const open = (list: End[]) => list.map(e => ({ ...e, stub: out(e) })).filter(e => !e.extra || !pads.some(b => inside(e.stub, b)));
  const from = open(starts), to = open(goals);
  const xs = [...new Set([...from, ...to].map(e => e.stub.x).concat(pads.flatMap(b => [b.x, b.x + b.w])))].sort((a, b) => a - b);
  const ys = [...new Set([...from, ...to].map(e => e.stub.y).concat(pads.flatMap(b => [b.y, b.y + b.h])))].sort((a, b) => a - b);
  const at = (i: number, j: number) => ({ x: xs[i]!, y: ys[j]! });
  const free = (a: Point, b: Point) => !pads.some(pad => crosses(a, b, pad));
  // Dijkstra over (column, row, heading); a turn costs as much as 120 of length, so fewer bends win over a shorter way.
  const turn = 120, size = xs.length * ys.length * 4, cost = new Float64Array(size).fill(Infinity), back = new Int32Array(size).fill(-1);
  const index = (i: number, j: number, d: number) => (j * xs.length + i) * 4 + d;
  const heading = (side?: Side) => side ? ["top", "right", "bottom", "left"].indexOf(side) : -1;
  const moves = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  const queue: [number, number][] = [];
  const push = (state: number, c: number) => {
    if (c >= cost[state]!) return false;
    cost[state] = c;
    queue.push([c, state]);
    for (let k = queue.length - 1; k > 0;) {
      const up = (k - 1) >> 1;
      if (queue[up]![0] <= c) break;
      [queue[k], queue[up]] = [queue[up]!, queue[k]!];
      k = up;
    }
    return true;
  };
  const pop = () => {
    const top = queue[0]!, last = queue.pop()!;
    if (queue.length) {
      queue[0] = last;
      for (let k = 0; ;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < queue.length && queue[l]![0] < queue[m]![0]) m = l;
        if (r < queue.length && queue[r]![0] < queue[m]![0]) m = r;
        if (m === k) break;
        [queue[k], queue[m]] = [queue[m]!, queue[k]!];
        k = m;
      }
    }
    return top;
  };
  const cellOf = (p: Point) => ys.indexOf(p.y) * xs.length + xs.indexOf(p.x);
  for (const e of from) for (let d = 0; d < 4; d++) if (!e.side || d === heading(e.side)) push(cellOf(e.stub) * 4 + d, e.extra ?? 0);
  const first = new Map(from.map(e => [cellOf(e.stub), e]));
  let best = -1, bestCost = Infinity, goal: (typeof to)[number] | undefined;
  while (queue.length) {
    const [c, state] = pop();
    if (c > cost[state]! || c >= bestCost) continue;
    const d = state % 4, cell = state >> 2, i = cell % xs.length, j = Math.floor(cell / xs.length);
    for (const e of to) if (e.stub.x === xs[i] && e.stub.y === ys[j]) {
      const total = c + (e.extra ?? 0) + (e.side && d !== (heading(e.side) + 2) % 4 ? turn : 0);
      if (total < bestCost) { bestCost = total; best = state; goal = e; }
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue;
      const ni = i + moves[nd]![0], nj = j + moves[nd]![1];
      if (ni < 0 || nj < 0 || ni >= xs.length || nj >= ys.length) continue;
      const a = at(i, j), b = at(ni, nj);
      if (!free(a, b)) continue;
      if (push(index(ni, nj, nd), c + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (nd === d ? 0 : turn))) back[index(ni, nj, nd)] = state;
    }
  }
  let result: Point[] | undefined;
  if (best >= 0) {
    const path: Point[] = [];
    let state = best;
    for (; back[state]! >= 0; state = back[state]!) path.unshift(at((state >> 2) % xs.length, Math.floor((state >> 2) / xs.length)));
    const start = first.get(state >> 2)!;
    result = tidyRoute([start.at, start.stub, ...path, goal!.at]);
  }
  detours.set(key, result);
  return result;
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
