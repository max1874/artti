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
export const hasText = (el: Element) => ["shape", "note", "container", "text"].includes(el.type);

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
