// A whiteboard's content: its elements, their stacking order, and where an agent says it is at work. docs/whiteboard.md.
// Pure, so the server and the viewer apply writes the same way.

/** Placed at x, y, except an arrow, which is placed by its `from` and `to` (an element id or a point [x, y]). */
export type Element = { type: ElementType; x: number; y: number; w?: number; h?: number; [field: string]: unknown };
export const elementTypes = ["shape", "note", "container", "text", "stroke", "arrow", "image", "html", "table", "link", "sticker"] as const;
export type ElementType = (typeof elementTypes)[number];

/** An element as kept: its fields, the version it is at, and who wrote it last. */
export type Stored = Element & { v: number; by: Writer };
export type Writer = "human" | "agent";

/** Where an agent says it is at work: ground it will fill, or elements it will change. */
export type Claim = { x?: number; y?: number; w?: number; h?: number; ids?: string[]; at: number };

export type Board = { v: number; title?: string; order: string[]; elements: Record<string, Stored>; claims: Record<string, Claim> };

export type Op =
  | { op: "set"; id: string; data: Element; ifVersion?: number }
  /** Fields to change; a field given as null is removed. */
  | { op: "update"; id: string; data: Record<string, unknown>; ifVersion?: number }
  | { op: "delete"; id: string; ifVersion?: number }
  | { op: "meta"; data: { title?: string; order?: string[] } }
  /** An empty `data` ends the claim. */
  | { op: "claim"; id: string; data: Partial<Claim> };

export const emptyBoard = (): Board => ({ v: 0, order: [], elements: {}, claims: {} });

export const limits = { elements: 800, element: 200_000, board: 2_000_000 };
const ID = /^(?!\.+$)[A-Za-z0-9_.~:@+-]{1,40}$/u;

/** A write refused because the element changed since the writer read it. */
export class Conflict extends Error {
  readonly id: string;
  readonly current: number | undefined;
  constructor(id: string, current: number | undefined) {
    super(current === undefined ? `${id} is gone; read the board again` : `${id} is at version ${current}; read it again and redo the write`);
    this.id = id;
    this.current = current;
  }
}

/**
 * The board after `ops`, all of them or none (it throws). An agent's write to an element that exists must name the version it
 * read, so it never overwrites a person's change; a person's write wins field by field.
 */
export function apply(board: Board, ops: Op[], by: Writer): Board {
  const next: Board = structuredClone(board);
  for (const op of ops) {
    if (op.op === "meta") {
      if (typeof op.data.title === "string") next.title = op.data.title;
      // Every element keeps a place, whatever the order sent leaves out.
      if (Array.isArray(op.data.order)) {
        const listed = [...new Set(op.data.order.filter(id => id in next.elements))];
        next.order = [...listed, ...next.order.filter(id => !listed.includes(id))];
      }
      continue;
    }
    if (typeof op.id !== "string" || !ID.test(op.id)) throw new Error(`not an element id: ${String(op.id).slice(0, 40)}`);
    if (op.op === "claim") {
      if (Object.keys(op.data ?? {}).length === 0) delete next.claims[op.id];
      else next.claims[op.id] = { ...op.data, at: Date.now() };
      continue;
    }
    const current = next.elements[op.id];
    if (by === "agent" && (op.ifVersion !== undefined || current) && op.ifVersion !== current?.v) throw new Conflict(op.id, current?.v);
    if (op.op === "delete") {
      if (!current) continue;
      delete next.elements[op.id];
      next.order = next.order.filter(id => id !== op.id);
      continue;
    }
    if (op.op === "update" && !current) throw new Conflict(op.id, undefined);
    const fields: Record<string, unknown> = op.op === "set" ? { ...op.data } : { ...current, ...op.data };
    delete fields.v;
    delete fields.by;
    for (const [key, value] of Object.entries(fields)) if (value === null) delete fields[key];
    if (!elementTypes.includes(fields.type as ElementType)) throw new Error(`${op.id}: unknown type ${String(fields.type)}`);
    // An arrow is placed by its ends; everything else by its x and y.
    if (fields.type === "arrow" ? fields.from === undefined || fields.to === undefined : !Number.isFinite(fields.x) || !Number.isFinite(fields.y))
      throw new Error(fields.type === "arrow" ? `${op.id}: an arrow needs from and to` : `${op.id}: x and y must be numbers`);
    if (JSON.stringify(fields).length > limits.element) throw new Error(`${op.id} is larger than ${limits.element / 1000} KB`);
    next.elements[op.id] = { ...(fields as Element), v: (current?.v ?? 0) + 1, by };
    if (!current) {
      // A new section goes behind everything but other sections; anything else on top.
      const behind = fields.type === "container" ? next.order.findLastIndex(id => next.elements[id]?.type === "container") + 1 : next.order.length;
      next.order.splice(behind, 0, op.id);
    }
  }
  if (next.order.length > limits.elements) throw new Error(`a board holds at most ${limits.elements} elements`);
  if (JSON.stringify(next.elements).length > limits.board) throw new Error(`a board holds at most ${limits.board / 1_000_000} MB`);
  next.v = board.v + 1;
  return next;
}
