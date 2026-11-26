// The whiteboard editor: the board, its tools, and every gesture on it. docs/whiteboard.md.

import { toCanvas } from "html-to-image";
import { Find, Layers, Timer, download } from "./Extras.tsx";
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { type Event, type Loaded, asset } from "../api.ts";
import { CommentBox, Conversation, Mark, Popover, useCtx } from "../canvas.tsx";
import { ElementView, outline } from "./Element.tsx";
import {
  type Board, type Box, type Element, type Op, type Point, type TextSize,
  apply, boxOfPoints, cellsOf, contains, defaults, distanceToStroke, fieldsOf, filled, fills, fonts, hasText, headsOf, inks, inverse, meets, newId, route,
  shapeKinds, shapeNames, sizeNames, span, stickers, strokeBox, styleKeys, textSizes, union, wordsOf,
} from "./model.ts";

type Tool = "select" | "hand" | "text" | "note" | "container" | "shape" | "arrow" | "pen" | "eraser" | "comment" | "sticker";
const toolKeys: Record<string, Tool> = {
  v: "select", h: "hand", t: "text", s: "note", n: "note", a: "container", f: "container", r: "shape", o: "shape", d: "shape", l: "arrow", x: "arrow", p: "pen", m: "pen", c: "comment", e: "sticker",
};
const kindKeys: Record<string, string> = { r: "rounded", o: "ellipse", d: "diamond" };
const toolNames: [Tool, string, string][] = [
  ["select", "选择", "V"], ["hand", "抓手", "H"], ["text", "文字", "T"], ["note", "便签", "S"], ["container", "分区", "A"],
  ["arrow", "箭头", "L"], ["pen", "钢笔", "P"], ["eraser", "橡皮", ""], ["sticker", "贴纸", "E"], ["comment", "评论", "C"],
];
const penWidths = [2, 4, 8];
const imageTypes = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];
type End = string | [number, number];

type Gesture =
  | { kind: "pan"; last: Point }
  | { kind: "move"; start: Point; hit: string; origin: Map<string, Element>; moved: boolean }
  | { kind: "resize"; start: Point; handle: string; frame: Box; origin: Map<string, { box: Box; el: Element }> }
  | { kind: "marquee"; start: Point; base: string[] }
  | { kind: "draw"; start: Point; tool: Tool }
  | { kind: "link"; start: Point; from: End }
  | { kind: "end"; id: string; which: "from" | "to" }
  | { kind: "pen"; origin: Point; points: number[] }
  | { kind: "erase"; hits: Set<string> }
  | { kind: "crop"; id: string; start: Point; origin: { zoom: number; x: number; y: number }; box: Box }
  | { kind: "pin"; pin: Pin }
  | { kind: "stick"; at: Point; on?: string };

const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
/** A comment's place: on an element, board units from its corner, so it moves with it; or a point on the board. */
type Pin = { target: string; spot: Point };
const notPictured = ".pin, .mark, .popover, .frame-sel, .claim, .end-handle, .marquee, .crop-frame, .embed-grip, iframe";
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

async function post(project: string, slug: string, ops: Op[]) {
  const response = await fetch(`/api/board/${project}/${encodeURIComponent(slug)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? response.statusText);
}

/** The same element moved by dx, dy: an arrow by its free ends, anything else by its place. */
const shifted = (el: Element, dx: number, dy: number): Partial<Element> => el.type === "arrow"
  ? Object.fromEntries((["from", "to"] as const).filter(end => Array.isArray(el[end])).map(end => [end, [(el[end] as number[])[0]! + dx, (el[end] as number[])[1]! + dy]]))
  : { x: el.x + dx, y: el.y + dy };

export function Whiteboard({ data }: { data: Loaded }) {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // The server's copy is the truth; each local write shows at once and is replaced by the server's when it comes back.
  const [board, setBoard] = useState<Board>(data.board!);
  const current = useRef(board);
  current.current = board;
  useEffect(() => setBoard(data.board!), [data.board]);

  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  const cam = useRef(camera);
  cam.current = camera;
  const [tool, setTool] = useState<Tool>("select");
  const [kind, setKind] = useState("rounded");
  const [kinds, setKinds] = useState(false);
  const [pen, setPen] = useState({ color: "ink", width: 4 });
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string>();
  const [cropping, setCropping] = useState<string>();
  const [preview, setPreview] = useState<Record<string, Partial<Element>>>({});
  const [draft, setDraft] = useState<Element>();
  const [fading, setFading] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<Box>();
  const [space, setSpace] = useState(false);
  const [toast, setToast] = useState<string>();
  const [pinning, setPinning] = useState<Pin>();
  const [sticker, setSticker] = useState(stickers[0]!);
  // The table cell picked or last worked in: where rows and columns are added or taken out, and what a cell colour colours.
  const [cell, setCell] = useState<{ id: string; at: [number, number] }>();
  const [grid, setGrid] = useState(() => { try { return localStorage.getItem("artti.grid") !== "off"; } catch { return true; } });
  const [layers, setLayers] = useState(false);
  const style = useRef<Element>(undefined);
  const pickColour = useRef<(colour: string) => void>(null);
  const [finding, setFinding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<string>();
  const ctx = useCtx(data);
  const toastTimer = useRef<number>(undefined);
  const gesture = useRef<Gesture | null>(null);
  const pointer = useRef<Point>({ x: 0, y: 0 });
  const history = useRef<{ undo: Op[][]; redo: Op[][] }>({ undo: [], redo: [] });
  const sizes = useRef(new Map<string, { w: number; h: number }>());
  const [, remeasured] = useReducer((n: number) => n + 1, 0);

  const resolve = (src: string) => asset(data.project.id, data.slug, src);
  const live = selected.filter(id => id in board.elements);
  const shown = (id: string) => ({ ...board.elements[id]!, ...preview[id] }) as Element;
  const endBox = (id: string) => board.elements[id] && board.elements[id].type !== "arrow" ? boxOf(id) : undefined;
  // What arrows go around: everything solid on the board, worked out once per render.
  let solids: { id: string; box: Box }[] | undefined;
  const pathOf = (el: Element) => {
    solids ??= board.order.filter(id => !["arrow", "stroke", "sticker", "container"].includes(board.elements[id]!.type)).map(id => ({ id, box: boxOf(id) }));
    return route(el, endBox, solids.filter(s => s.id !== el.from && s.id !== el.to).map(s => s.box));
  };
  /** Where a sticker on something sits: its x and y are from that thing's corner, so it goes where the thing goes. */
  const stuckTo = (el: Element) => el.type === "sticker" && typeof el.on === "string" && board.elements[el.on] ? boxOf(el.on) : undefined;
  const placed = (id: string): Element => {
    const el = shown(id), on = stuckTo(el);
    return on ? { ...el, x: on.x + el.x, y: on.y + el.y } : el;
  };
  function boxOf(id: string): Box {
    const el = placed(id);
    if (el.type === "arrow") {
      const path = pathOf(el);
      return path ? boxOfPoints(path) : { x: 0, y: 0, w: 0, h: 0 };
    }
    if (el.type === "stroke") return strokeBox(el);
    const measured = sizes.current.get(id);
    return { x: el.x, y: el.y, w: el.w ?? measured?.w ?? defaults[el.type]?.w ?? 0, h: el.h ?? measured?.h ?? defaults[el.type]?.h ?? 0 };
  }
  /** The topmost thing an arrow can join at `p`. */
  const joinable = (p: Point, except?: unknown) => [...board.order].reverse().find(id => id !== except &&
    !["arrow", "stroke", "sticker"].includes(board.elements[id]!.type) && contains(boxOf(id), { ...p, w: 0, h: 0 }));

  const say = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(undefined), 1800);
  };

  // Comments: those still open, each placed where its element now is.
  const resolved = new Set(data.events.filter(e => e.kind === "resolve").map(e => e.to));
  const comments = data.events.filter(e => e.kind === "comment" && e.spot && !resolved.has(e.id) && (e.target === "board" || e.target?.startsWith("elements/")));
  const placeOf = ({ target, spot }: Pin | Event): Point | undefined => {
    if (target === "board") return spot;
    const id = target!.slice("elements/".length);
    if (!board.elements[id]) return;
    const b = boxOf(id);
    return { x: b.x + spot!.x, y: b.y + spot!.y };
  };
  const pinOn = (id: string | undefined, p: Point): Pin => {
    if (!id) return { target: "board", spot: p };
    const b = boxOf(id);
    return { target: `elements/${id}`, spot: { x: p.x - b.x, y: p.y - b.y } };
  };
  /** The board drawn into a picture, `box` of it at `ratio`, without the editor's own marks. */
  const render = (box: Box, ratio: number) => toCanvas(world.current!, {
    width: box.w, height: box.h, pixelRatio: ratio, skipFonts: true, backgroundColor: getComputedStyle(viewport.current!).backgroundColor,
    style: { transform: `translate(${-box.x}px, ${-box.y}px)` },
    filter: node => !(node instanceof HTMLElement && node.matches(notPictured)),
  });
  const save = async (as: "png" | "json") => {
    setMenu(false);
    const name = data.page.title.replace(/[/\\:*?"<>|]+/gu, "-");
    if (as === "json") return download(`${name}.json`, URL.createObjectURL(new Blob([JSON.stringify(board, null, 1)], { type: "application/json" })));
    const area = union(board.order.map(boxOf));
    if (!area) return say("白板是空的");
    const box = { x: area.x - 48, y: area.y - 48, w: area.w + 96, h: area.h + 96 };
    say("正在生成图片…");
    download(`${name}.png`, (await render(box, Math.min(2, 8000 / Math.max(box.w, box.h)))).toDataURL("image/png"));
  };

  /** A picture of the board around what a comment is about, the spot ringed: what the agent looks at. */
  const picture = async (pin: Pin) => {
    const at = placeOf(pin)!, area = pin.target === "board" ? { x: at.x - 160, y: at.y - 110, w: 320, h: 220 } : boxOf(pin.target.slice(9));
    const box = { x: Math.min(area.x, at.x) - 60, y: Math.min(area.y, at.y) - 60, w: 0, h: 0 };
    box.w = Math.max(area.x + area.w, at.x) + 60 - box.x;
    box.h = Math.max(area.y + area.h, at.y) + 60 - box.y;
    const ratio = Math.min(2, 2400 / Math.max(box.w, box.h));
    try {
      const canvas = await render(box, ratio), g = canvas.getContext("2d")!;
      g.strokeStyle = "#e5484d";
      g.lineWidth = 3 * ratio;
      g.beginPath();
      g.arc((at.x - box.x) * ratio, (at.y - box.y) * ratio, 14 * ratio, 0, Math.PI * 2);
      g.stroke();
      return canvas.toDataURL("image/png");
    } catch {
      return undefined;
    }
  };

  /** One change by the person: shown at once, kept on the server, and undoable unless it is an undo itself. */
  const commit = (ops: Op[], record = true) => {
    if (!ops.length) return;
    const before = current.current;
    let next: Board;
    try {
      next = apply(before, ops, "human");
    } catch (error) {
      return say(error instanceof Error ? error.message : String(error));
    }
    if (record) {
      history.current.undo.push(inverse(before, ops));
      history.current.redo = [];
    }
    current.current = next;
    setBoard(next);
    post(data.project.id, data.slug, ops).catch(error => say(`没存上：${error.message}`));
  };
  const step = (from: "undo" | "redo") => {
    const ops = history.current[from].pop();
    if (!ops) return say(from === "undo" ? "没有可撤销的" : "没有可重做的");
    history.current[from === "undo" ? "redo" : "undo"].push(inverse(current.current, ops));
    commit(ops, false);
    say(from === "undo" ? "已撤销" : "已重做");
  };

  // Text has no size of its own until it is laid out: measure it after each render.
  useLayoutEffect(() => {
    let changed = false;
    for (const node of world.current!.querySelectorAll<HTMLElement>("[data-measure]")) {
      const id = node.dataset.id!, old = sizes.current.get(id);
      if (old?.w !== node.offsetWidth || old?.h !== node.offsetHeight) {
        sizes.current.set(id, { w: node.offsetWidth, h: node.offsetHeight });
        changed = true;
      }
    }
    if (changed) remeasured();
  });

  const fit = (ids?: string[]) => {
    const view = viewport.current!.getBoundingClientRect();
    const target = union((ids ?? current.current.order).filter(id => id in current.current.elements).map(boxOf));
    if (!target) return setCamera({ x: view.width / 2, y: view.height / 2, z: 1 });
    const z = clamp(Math.min((view.width - 160) / target.w, (view.height - 220) / target.h), 0.1, ids ? 2 : 1);
    setCamera({ z, x: view.width / 2 - (target.x + target.w / 2) * z, y: view.height / 2 - (target.y + target.h / 2) * z });
  };
  useLayoutEffect(() => fit(), []);

  const toWorld = (event: { clientX: number; clientY: number }): Point => {
    const view = viewport.current!.getBoundingClientRect();
    return { x: (event.clientX - view.left - cam.current.x) / cam.current.z, y: (event.clientY - view.top - cam.current.y) / cam.current.z };
  };
  // What the person has picked, in view and being edited: the agent reads it with `artti board view`.
  const looking = JSON.stringify([selected, camera, editing]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const view = viewport.current!.getBoundingClientRect();
      const a = toWorld({ clientX: view.left, clientY: view.top }), b = toWorld({ clientX: view.right, clientY: view.bottom });
      void fetch(`/api/view/${data.project.id}/${encodeURIComponent(data.slug)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: selected.filter(id => id in current.current.elements), viewport: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, editing }),
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [looking]);
  const viewCentre = () => {
    const view = viewport.current!.getBoundingClientRect();
    return toWorld({ clientX: view.left + view.width / 2, clientY: view.top + view.height / 2 });
  };

  /** A group is picked as one: every element sharing the outermost group of any picked. */
  const outer = (id: string) => (board.elements[id]?.groups as string[] | undefined)?.at(-1);
  const withGroups = (ids: string[]) => {
    const groups = new Set(ids.map(outer).filter(Boolean));
    return groups.size ? [...new Set([...ids, ...board.order.filter(id => groups.has(outer(id)))])] : ids;
  };
  const unlocked = (ids = live) => ids.filter(id => !board.elements[id]?.locked);
  /** What a drag moves: the selection, and what its sections hold, but nothing locked. */
  const moving = (ids: string[]) => {
    const all = new Set(ids);
    for (const id of ids) if (shown(id).type === "container") {
      const frame = boxOf(id);
      for (const other of board.order) if (other !== id && contains(frame, boxOf(other))) all.add(other);
    }
    // A sticker on something that moves goes with it already.
    return unlocked([...all]).filter(id => !all.has(String(board.elements[id]?.on)));
  };

  /** A section is picked by its title or its edge; inside it, the person is working on what it holds. */
  const sectionEdge = (p: Point) => [...board.order].reverse().find(id => {
    if (board.elements[id]?.type !== "container") return false;
    const b = boxOf(id), m = 8 / cam.current.z;
    const near = p.x > b.x - m && p.x < b.x + b.w + m && p.y > b.y - m && p.y < b.y + b.h + m;
    return near && !(p.x > b.x + m && p.x < b.x + b.w - m && p.y > b.y + m && p.y < b.y + b.h - m);
  });

  const create = (el: Element, edit = hasText(el) && el.type !== "arrow", keepTool = false) => {
    const id = newId();
    commit([{ op: "set", id, data: el }]);
    setSelected(keepTool ? [] : [id]);
    if (edit) setEditing(id);
    if (!keepTool) setTool("select");
    return id;
  };

  const onText = (id: string, text: string) => {
    setEditing(undefined);
    const el = current.current.elements[id];
    if (!el) return;
    if (el.type === "table") {
      if (cell?.id !== id) return;
      const rows = cellsOf(el), [r0, c0] = cell.at;
      if (rows[r0]![c0] !== text) commit([{ op: "update", id, data: { rows: rows.map((row, r) => r === r0 ? row.map((v, c) => c === c0 ? text : v) : row) } }]);
      return;
    }
    const field = el.type === "arrow" ? "label" : "text";
    if (el.type === "text" && !text.trim()) {
      // A text left empty was never there: it goes, and so does its place in the history.
      const last = history.current.undo.at(-1);
      if (last?.length === 1 && last[0]!.op === "delete" && last[0]!.id === id) history.current.undo.pop();
      commit([{ op: "delete", id }], false);
      setSelected([]);
      return;
    }
    if (text !== (el[field] ?? "")) commit([{ op: "update", id, data: { [field]: text || null } }]);
  };

  /** Deleting takes the arrows that join what is deleted, and the stickers on it, with it. */
  const remove = () => {
    const gone = new Set(unlocked());
    for (const id of board.order) {
      const el = board.elements[id]!;
      if ((el.type === "arrow" && (gone.has(el.from as string) || gone.has(el.to as string))) || gone.has(el.on as string)) gone.add(id);
    }
    commit([...gone].map(id => ({ op: "delete", id }) as Op));
    setSelected([]);
  };
  /** Elements as they would be copied: an arrow's end outside the copy becomes the point it reaches. */
  const snapshot = (ids: string[]) => ids.map(id => {
    const el = fieldsOf(board.elements[id]!);
    // A sticker copied without what it is on stays where it is seen.
    if (el.type === "sticker" && el.on && !ids.includes(el.on as string)) return { id, el: { ...placed(id), on: undefined } };
    if (el.type !== "arrow") return { id, el };
    const path = pathOf(el) ?? [{ x: 0, y: 0 }];
    const keep = (end: unknown, p: Point) => typeof end === "string" && !ids.includes(end) ? [p.x, p.y] : end;
    return { id, el: { ...el, from: keep(el.from, path[0]!), to: keep(el.to, path.at(-1)!) } };
  });
  /** Copies placed `dx`, `dy` away, with new ids, their arrows and groups joined among themselves. */
  const place = (items: { id: string; el: Element }[], dx: number, dy: number) => {
    const ids = new Map(items.map(({ id }) => [id, newId()]));
    const groups = new Map<string, string>();
    const regroup = (g: string) => groups.get(g) ?? groups.set(g, `g${Math.random().toString(36).slice(2, 8)}`).get(g)!;
    const end = (e: unknown) => typeof e === "string" ? ids.get(e) ?? e : Array.isArray(e) ? [e[0] + dx, e[1] + dy] : e;
    commit(items.map(({ id, el }) => ({
      op: "set", id: ids.get(id)!,
      data: { ...el, ...el.type === "arrow" ? { from: end(el.from), to: end(el.to) } : el.on ? { on: ids.get(el.on as string) } : { x: el.x + dx, y: el.y + dy },
        locked: undefined, groups: Array.isArray(el.groups) ? (el.groups as string[]).map(regroup) : undefined },
    }) as Op));
    setSelected([...ids.values()]);
  };
  const duplicate = () => live.length && place(snapshot(live), 24, 24);

  const reorder = (how: "front" | "back" | "forward" | "backward") => {
    const set = new Set(live);
    let order = [...board.order];
    if (how === "front") order = [...order.filter(id => !set.has(id)), ...order.filter(id => set.has(id))];
    if (how === "back") order = [...order.filter(id => set.has(id)), ...order.filter(id => !set.has(id))];
    if (how === "forward") for (let i = order.length - 2; i >= 0; i--) if (set.has(order[i]!) && !set.has(order[i + 1]!)) [order[i], order[i + 1]] = [order[i + 1]!, order[i]!];
    if (how === "backward") for (let i = 1; i < order.length; i++) if (set.has(order[i]!) && !set.has(order[i - 1]!)) [order[i], order[i - 1]] = [order[i - 1]!, order[i]!];
    commit([{ op: "meta", data: { order } }]);
  };
  const lock = () => {
    const all = live.every(id => board.elements[id]?.locked);
    commit(live.map(id => ({ op: "update", id, data: { locked: all ? null : true } }) as Op));
    say(all ? "已解锁" : "已锁定");
  };
  const update = (ids: string[], data: Record<string, unknown>) => commit(unlocked(ids).map(id => ({ op: "update", id, data }) as Op));
  const ofType = (...types: string[]) => live.filter(id => types.includes(board.elements[id]!.type));
  /** Rows or columns added after, or taken out at, the cell last worked in (the last one when none was). */
  const reshape = (how: "row" | "column" | "-row" | "-column") => {
    const id = live[0]!, el = board.elements[id]!, rows = cellsOf(el);
    const [r, c] = cell?.id === id ? cell.at : [rows.length - 1, rows[0]!.length - 1];
    if ((how === "-row" && rows.length < 2) || (how === "-column" && rows[0]!.length < 2)) return;
    // Cell colours move with their cells.
    const fillsNow = rows.map((row, i) => row.map((_, j) => (el.fills as (string | null)[][] | undefined)?.[i]?.[j] ?? null));
    const change = <T,>(grid: T[][], blank: T) => how === "row" ? [...grid.slice(0, r + 1), grid[0]!.map(() => blank), ...grid.slice(r + 1)]
      : how === "column" ? grid.map(row => [...row.slice(0, c + 1), blank, ...row.slice(c + 1)])
      : how === "-row" ? grid.filter((_, i) => i !== r) : grid.map(row => row.filter((_, j) => j !== c));
    setCell(undefined);
    commit([{ op: "update", id, data: { rows: change(rows, ""), ...el.fills ? { fills: change(fillsNow, null) } : {} } }]);
  };
  const colourCell = (colour: string | null) => {
    const id = live[0]!, el = board.elements[id]!, rows = cellsOf(el);
    if (cell?.id !== id) return say("先点一下要上色的格子");
    const grid = rows.map((row, i) => row.map((_, j) => (el.fills as (string | null)[][] | undefined)?.[i]?.[j] ?? null));
    grid[cell.at[0]]![cell.at[1]] = colour;
    commit([{ op: "update", id, data: { fills: grid.some(row => row.some(Boolean)) ? grid : null } }]);
  };
  /** Style taken from the first picked element, given to the others: colour only between elements coloured alike. */
  const copyStyle = () => {
    style.current = live.length ? fieldsOf(board.elements[live[0]!]!) : undefined;
    say(style.current ? "已复制样式" : "先选一个元素");
  };
  const pasteStyle = () => {
    const from = style.current;
    if (!from) return say("还没复制样式");
    commit(unlocked().map(id => {
      const el = board.elements[id]!;
      return { op: "update", id, data: Object.fromEntries(styleKeys.filter(k => k !== "color" || filled(el) === filled(from)).map(k => [k, from[k] ?? null])) } as Op;
    }));
    say("已粘贴样式");
  };
  pickColour.current = colour => update(ofType("shape", "note", "container", "table", "text", "arrow", "stroke"), { color: colour });
  const zoom = (to: (z: number) => number) => {
    const view = viewport.current!.getBoundingClientRect();
    setCamera(c => {
      const z = clamp(to(c.z), 0.1, 4), px = view.width / 2, py = view.height / 2;
      return { z, x: px - ((px - c.x) * z) / c.z, y: py - ((py - c.y) * z) / c.z };
    });
  };
  const toggleGrid = () => {
    setGrid(!grid);
    try { localStorage.setItem("artti.grid", grid ? "off" : "on"); } catch {}
  };
  const editCell = (id: string, at: [number, number]) => {
    setSelected([id]);
    setEditing(id);
    setCell({ id, at });
  };
  /** A comment begun on an element, pinned at its top right. */
  const commentOn = (id: string) => {
    const b = boxOf(id);
    setOpen(undefined);
    setPinning(pinOn(id, { x: b.x + b.w, y: b.y }));
  };

  const group = () => {
    if (live.length < 2) return;
    const id = `g${Math.random().toString(36).slice(2, 8)}`;
    commit(live.map(el => ({ op: "update", id: el, data: { groups: [...(board.elements[el]!.groups as string[] ?? []), id] } }) as Op));
    say("已编组");
  };
  const ungroup = () => {
    const grouped = live.filter(id => (board.elements[id]!.groups as string[] | undefined)?.length);
    if (!grouped.length) return;
    commit(grouped.map(id => {
      const rest = (board.elements[id]!.groups as string[]).slice(0, -1);
      return { op: "update", id, data: { groups: rest.length ? rest : null } } as Op;
    }));
    say("已取消编组");
  };
  /** Lines up the selection by an edge or a middle. */
  const align = (how: "left" | "centre" | "right" | "top" | "middle" | "bottom") => {
    const ids = unlocked().filter(id => board.elements[id]!.type !== "arrow"), f = union(ids.map(boxOf))!;
    commit(ids.map(id => {
      const b = boxOf(id);
      const dx = how === "left" ? f.x - b.x : how === "right" ? f.x + f.w - b.x - b.w : how === "centre" ? f.x + f.w / 2 - b.x - b.w / 2 : 0;
      const dy = how === "top" ? f.y - b.y : how === "bottom" ? f.y + f.h - b.y - b.h : how === "middle" ? f.y + f.h / 2 - b.y - b.h / 2 : 0;
      return { op: "update", id, data: shifted(shown(id), dx, dy) } as Op;
    }));
  };
  /** Rows as the eye already reads them, each in order, 24 apart, from where the selection starts. */
  const tidy = () => {
    const items = unlocked().filter(id => board.elements[id]!.type !== "arrow").map(id => ({ id, b: boxOf(id) }))
      .sort((a, b) => a.b.y + a.b.h / 2 - (b.b.y + b.b.h / 2));
    if (items.length < 2) return;
    const f = union(items.map(i => i.b))!, rows: (typeof items)[] = [];
    for (const item of items) {
      const row = rows.at(-1), bottom = row && Math.max(...row.map(i => i.b.y + i.b.h));
      if (row && item.b.y < bottom! - Math.min(item.b.h, 40) / 2) row.push(item);
      else rows.push([item]);
    }
    const ops: Op[] = [];
    let y = f.y;
    for (const row of rows) {
      let x = f.x;
      for (const { id, b } of row.sort((a, b) => a.b.x - b.b.x)) {
        ops.push({ op: "update", id, data: shifted(shown(id), x - b.x, y - b.y) });
        x += b.w + 24;
      }
      y += Math.max(...row.map(i => i.b.h)) + 24;
    }
    commit(ops);
    say("已整理");
  };

  /** Images the person drops, pastes or picks, each kept with the page and placed around `at`. */
  const upload = async (files: File[], at: Point) => {
    for (const [i, file] of files.entries()) {
      if (!imageTypes.includes(file.type)) { say("只能放 png、jpg、gif、webp 或 svg 图片"); continue; }
      const response = await fetch(`/api/asset/${data.project.id}/${encodeURIComponent(data.slug)}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!response.ok) { say(`图片没传上：${(await response.json().catch(() => ({}))).error ?? response.statusText}`); continue; }
      const { src } = await response.json() as { src: string };
      const natural = await new Promise<{ w: number; h: number }>(done => {
        const image = new Image();
        image.onload = () => done({ w: image.naturalWidth || 400, h: image.naturalHeight || 300 });
        image.onerror = () => done({ w: 400, h: 300 });
        image.src = resolve(src);
      });
      // A screen capture is twice its size on screen; nothing lands wider than 640.
      const w = Math.min(natural.w > 1200 ? natural.w / 2 : natural.w, 640), h = (w * natural.h) / natural.w;
      create({ type: "image", x: at.x - w / 2 + i * 24, y: at.y - h / 2 + i * 24, w, h, src }, false);
    }
  };

  // Keys, the clipboard, and the wheel.
  const keys = useRef<(event: KeyboardEvent) => void>(null);
  keys.current = event => {
    if (editing || (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]"))) return;
    const mod = event.metaKey || event.ctrlKey, key = event.key.toLowerCase();
    if (event.key === " ") { setSpace(true); event.preventDefault(); return; }
    if (mod && key === "z") { event.preventDefault(); return step(event.shiftKey ? "redo" : "undo"); }
    if (mod && key === "y") { event.preventDefault(); return step("redo"); }
    if (mod && key === "a") { event.preventDefault(); return setSelected(board.order); }
    if (mod && key === "d") { event.preventDefault(); return duplicate(); }
    if (mod && key === "g") { event.preventDefault(); return event.shiftKey ? ungroup() : group(); }
    if (mod && key === "f") { event.preventDefault(); return setFinding(true); }
    if (mod && event.altKey && event.code === "KeyC") { event.preventDefault(); return copyStyle(); }
    if (mod && event.altKey && event.code === "KeyV") { event.preventDefault(); return pasteStyle(); }
    if (mod && (event.key === "=" || event.key === "+")) { event.preventDefault(); return zoom(z => z * 1.25); }
    if (mod && event.key === "-") { event.preventDefault(); return zoom(z => z / 1.25); }
    if (mod && event.key === "0") { event.preventDefault(); return zoom(() => 1); }
    if (mod && (key === "c" || key === "x") && live.length) {
      void navigator.clipboard.writeText(JSON.stringify({ artti: snapshot(live) }));
      if (key === "x") remove(); else say("已复制");
      return;
    }
    if (mod && event.shiftKey && key === "l") { event.preventDefault(); return live.length && lock(); }
    if (event.key === "]" || event.key === "[") { event.preventDefault(); return live.length && reorder(event.key === "]" ? (mod ? "front" : "forward") : (mod ? "back" : "backward")); }
    if (event.key === "Backspace" || event.key === "Delete") return remove();
    if (event.key === "Escape") { setSelected([]); setTool("select"); setKinds(false); setCropping(undefined); setPinning(undefined); setOpen(undefined); return; }
    if (event.key === "Tab" && live.length === 1) { event.preventDefault(); return commentOn(live[0]!); }
    if (event.key === "Enter" && cropping) return setCropping(undefined);
    if (event.key === "Enter" && live.length === 1 && board.elements[live[0]!]!.type === "table" && !board.elements[live[0]!]!.locked) { event.preventDefault(); return editCell(live[0]!, [0, 0]); }
    if (event.key === "Enter" && live.length === 1 && hasText(board.elements[live[0]!]!) && !board.elements[live[0]!]!.locked) { event.preventDefault(); return setEditing(live[0]); }
    if (event.key.startsWith("Arrow") && live.length) {
      event.preventDefault();
      const d = event.shiftKey ? 10 : 1, dx = event.key === "ArrowLeft" ? -d : event.key === "ArrowRight" ? d : 0, dy = event.key === "ArrowUp" ? -d : event.key === "ArrowDown" ? d : 0;
      return commit(moving(live).map(id => ({ op: "update", id, data: shifted(shown(id), dx, dy) }) as Op));
    }
    if (event.shiftKey && event.code === "Digit1") return fit();
    if (event.shiftKey && event.code === "Digit2") return fit(live.length ? live : undefined);
    if (!mod && !event.altKey && toolKeys[key]) { setTool(toolKeys[key]!); if (kindKeys[key]) setKind(kindKeys[key]!); }
  };
  const pasted = useRef<(event: ClipboardEvent) => void>(null);
  pasted.current = event => {
    if (editing || (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]"))) return;
    const images = [...event.clipboardData?.files ?? []].filter(file => file.type.startsWith("image/"));
    if (images.length) return void upload(images, pointer.current);
    const text = event.clipboardData?.getData("text/plain") ?? "";
    try {
      const { artti } = JSON.parse(text) as { artti: { id: string; el: Element }[] };
      if (Array.isArray(artti)) {
        const frame = union(artti.map(({ el }) => el.type === "arrow" ? { x: 0, y: 0, w: 0, h: 0 } : { x: el.x, y: el.y, w: el.w ?? 0, h: el.h ?? 0 }))!;
        return place(artti, pointer.current.x - (frame.x + frame.w / 2), pointer.current.y - (frame.y + frame.h / 2));
      }
    } catch {}
    const { x, y } = pointer.current, lines = text.trim().split(/\r?\n/u);
    // Cells copied from a spreadsheet make a table; a link makes a card.
    if (lines.length > 1 && lines.every(line => line.includes("\t"))) return void create({ type: "table", x, y, rows: lines.map(line => line.split("\t")) }, false);
    if (/^https?:\/\/\S+$/u.test(text.trim())) {
      const url = text.trim(), page = url.match(/\/p\/[^/]+\/([^/?#]+)/u);
      return void create({ type: "link", x, y, url, ...page && { title: decodeURIComponent(page[1]!).replace(/^\d{4}-/u, ""), kind: "page" } }, false);
    }
    if (text.trim()) create({ type: "text", x, y, text: text.trim(), ...text.length > 60 && { wrap: 400 } }, false);
  };
  useEffect(() => {
    const element = viewport.current!;
    const wheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest(".editable")) return;
      event.preventDefault();
      setCamera(c => {
        if (event.ctrlKey || event.metaKey) {
          const z = clamp(c.z * Math.exp(-event.deltaY * 0.01), 0.1, 4);
          const box = element.getBoundingClientRect();
          const px = event.clientX - box.left, py = event.clientY - box.top;
          return { z, x: px - ((px - c.x) * z) / c.z, y: py - ((py - c.y) * z) / c.z };
        }
        return { ...c, x: c.x - event.deltaX, y: c.y - event.deltaY };
      });
    };
    const down = (event: KeyboardEvent) => keys.current?.(event);
    const up = (event: KeyboardEvent) => { if (event.key === " ") setSpace(false); };
    const paste = (event: ClipboardEvent) => pasted.current?.(event);
    element.addEventListener("wheel", wheel, { passive: false });
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("paste", paste);
    return () => { element.removeEventListener("wheel", wheel); removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("paste", paste); };
  }, []);

  const single = live.length === 1 ? shown(live[0]!) : undefined;
  const lone = single?.type === "arrow" ? pathOf(single) : undefined;
  const frame = editing || lone ? undefined : union(live.map(boxOf));
  const busy = !!marquee || !!draft || Object.keys(preview).length > 0;
  const has = (...types: string[]) => ofType(...types).length > 0;
  const locked = live.length > 0 && live.every(id => board.elements[id]?.locked);
  const crop = (single?.crop as { zoom?: number; x?: number; y?: number } | undefined) ?? {};

  return (
    <>
      <div ref={viewport} className={`wb${grid ? "" : " no-grid"} ${space || tool === "hand" ? "hand" : tool === "select" ? "" : tool === "text" ? "texting" : tool === "comment" ? "commenting" : "drawing"}`}
        onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); void upload([...event.dataTransfer.files], toWorld(event)); }}
        onPointerDown={event => {
          if (event.button === 1 || space || tool === "hand") {
            gesture.current = { kind: "pan", last: { x: event.clientX, y: event.clientY } };
            return viewport.current!.setPointerCapture(event.pointerId);
          }
          if (event.button !== 0 || (event.target as HTMLElement).closest(".editable")) return;
          setKinds(false);
          const p = toWorld(event), target = event.target as HTMLElement;
          const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle;
          const endHandle = target.closest<HTMLElement>("[data-end]")?.dataset.end as "from" | "to" | undefined;
          const hit = target.closest<HTMLElement>("[data-id]")?.dataset.id;
          if (cropping && hit !== cropping) setCropping(undefined);
          if (tool === "sticker") {
            gesture.current = { kind: "stick", at: p, on: joinable(p) };
          } else if (tool === "comment") {
            // Opened when the button comes up, like a new text, so the box keeps the focus.
            gesture.current = { kind: "pin", pin: pinOn(hit, p) };
          } else if (endHandle && single) {
            gesture.current = { kind: "end", id: live[0]!, which: endHandle };
          } else if (handle && frame) {
            gesture.current = { kind: "resize", start: p, handle, frame, origin: new Map(unlocked().map(id => [id, { box: boxOf(id), el: shown(id) }])) };
          } else if (cropping && hit === cropping) {
            const c = shown(hit).crop as { zoom?: number; x?: number; y?: number } | undefined;
            gesture.current = { kind: "crop", id: hit, start: p, origin: { zoom: c?.zoom ?? 1, x: c?.x ?? 0.5, y: c?.y ?? 0.5 }, box: boxOf(hit) };
          } else if (tool === "arrow") {
            const from = joinable(p);
            gesture.current = { kind: "link", start: p, from: from ?? [p.x, p.y] };
          } else if (tool === "pen") {
            gesture.current = { kind: "pen", origin: p, points: [0, 0] };
            setDraft({ type: "stroke", x: p.x, y: p.y, points: [0, 0], color: pen.color, width: pen.width });
          } else if (tool === "eraser") {
            gesture.current = { kind: "erase", hits: new Set() };
          } else if (tool !== "select") {
            // Made when the button comes up: a box focused on the press loses focus to the release.
            gesture.current = { kind: "draw", start: p, tool };
          } else {
            const picked = hit ?? sectionEdge(p);
            const at = target.closest<HTMLElement>("[data-cell]")?.dataset.cell?.split(",").map(Number) as [number, number] | undefined;
            if (picked && at) setCell({ id: picked, at });
            if (picked) {
              const unit = event.metaKey ? [picked] : withGroups([picked]);
              const next = event.shiftKey ? (live.includes(picked) ? live.filter(id => !unit.includes(id)) : [...live, ...unit]) : live.includes(picked) ? live : unit;
              setSelected(next);
              gesture.current = { kind: "move", start: p, hit: picked, origin: new Map(moving(next).map(id => [id, shown(id)])), moved: false };
            } else {
              gesture.current = { kind: "marquee", start: p, base: event.shiftKey ? live : [] };
              if (!event.shiftKey) setSelected([]);
            }
          }
          viewport.current!.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const p = toWorld(event);
          pointer.current = p;
          const g = gesture.current;
          if (!g) return;
          if (g.kind === "pan") {
            const dx = event.clientX - g.last.x, dy = event.clientY - g.last.y;
            g.last = { x: event.clientX, y: event.clientY };
            return setCamera(c => ({ ...c, x: c.x + dx, y: c.y + dy }));
          }
          if (g.kind === "move") {
            const dx = p.x - g.start.x, dy = p.y - g.start.y;
            if (!g.moved && Math.hypot(dx, dy) * cam.current.z < 3) return;
            g.moved = true;
            return setPreview(Object.fromEntries([...g.origin].map(([id, el]) => [id, shifted(el, dx, dy)])));
          }
          if (g.kind === "marquee") {
            const area = span(g.start, p);
            setMarquee(area);
            // A section is taken only whole; anything else as soon as the box meets it.
            return setSelected(withGroups([...g.base, ...board.order.filter(id => !g.base.includes(id) &&
              (board.elements[id]!.type === "container" ? contains(area, boxOf(id)) : meets(area, boxOf(id))))]));
          }
          if (g.kind === "draw") return setMarquee(span(g.start, p));
          if (g.kind === "link") {
            const to = joinable(p, g.from);
            return setDraft({ type: "arrow", x: 0, y: 0, from: g.from, to: to ?? [p.x, p.y] });
          }
          if (g.kind === "end") {
            const other = shown(g.id)[g.which === "from" ? "to" : "from"];
            const end = joinable(p, other) ?? [p.x, p.y];
            return setPreview({ [g.id]: { [g.which]: end, [g.which === "from" ? "fromSide" : "toSide"]: null, bends: null } });
          }
          if (g.kind === "pen") {
            const last = [g.points.at(-2)!, g.points.at(-1)!], x = p.x - g.origin.x, y = p.y - g.origin.y;
            if (Math.hypot(x - last[0]!, y - last[1]!) * cam.current.z < 2) return;
            g.points.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
            return setDraft(d => d && { ...d, points: [...g.points] });
          }
          if (g.kind === "erase") {
            for (const id of board.order) {
              const el = board.elements[id]!;
              if (el.type === "stroke" && !el.locked && distanceToStroke(el, p) < (Number(el.width) || 4) / 2 + 8 / cam.current.z) g.hits.add(id);
            }
            return setFading([...g.hits]);
          }
          if (g.kind === "pin" || g.kind === "stick") return;
          if (g.kind === "crop") {
            const zoom = g.origin.zoom;
            if (zoom <= 1) return;
            return setPreview({ [g.id]: { crop: { zoom, x: clamp(g.origin.x - (p.x - g.start.x) / (g.box.w * (zoom - 1)), 0, 1), y: clamp(g.origin.y - (p.y - g.start.y) / (g.box.h * (zoom - 1)), 0, 1) } } });
          }
          // Resizing: the dragged edges move, the others stay; shift keeps the proportions, and an image always does.
          const f = g.frame, dx = p.x - g.start.x, dy = p.y - g.start.y;
          let left = f.x, top = f.y, right = f.x + f.w, bottom = f.y + f.h;
          if (g.handle.includes("w")) left = Math.min(f.x + dx, right - 16);
          if (g.handle.includes("e")) right = Math.max(f.x + f.w + dx, left + 16);
          if (g.handle.includes("n")) top = Math.min(f.y + dy, bottom - 16);
          if (g.handle.includes("s")) bottom = Math.max(f.y + f.h + dy, top + 16);
          let sx = (right - left) / f.w, sy = (bottom - top) / f.h;
          const keep = event.shiftKey || (g.origin.size === 1 && [...g.origin.values()][0]!.el.type === "image");
          if (keep && g.handle.length === 2) {
            sx = sy = Math.max(sx, sy);
            if (g.handle.includes("w")) left = right - f.w * sx; else right = left + f.w * sx;
            if (g.handle.includes("n")) top = bottom - f.h * sy; else bottom = top + f.h * sy;
          }
          const map = (x: number, y: number) => [left + (x - f.x) * sx, top + (y - f.y) * sy] as const;
          setPreview(Object.fromEntries([...g.origin].map(([id, { box: b, el }]) => {
            if (el.type === "arrow") return [id, Object.fromEntries((["from", "to"] as const).filter(e => Array.isArray(el[e])).map(e => [e, map(...(el[e] as [number, number]))]))];
            if (el.type === "sticker") return [id, {}];
            const [x, y] = map(el.x, el.y);
            if (el.type === "table") return [id, { x, y, w: Math.max(80, b.w * sx) }];
            if (el.type === "stroke") return [id, { x, y, points: (el.points as number[]).map((v, i) => v * (i % 2 ? sy : sx)) }];
            if (el.type !== "text") return [id, { x, y, w: Math.max(8, b.w * sx), h: Math.max(8, b.h * sy) }];
            // Text keeps its size; a side handle sets where it wraps.
            return [id, g.origin.size === 1 && /[ew]/u.test(g.handle) ? { x, y, wrap: Math.max(40, b.w * sx) } : { x, y }];
          })));
        }}
        onPointerUp={event => {
          const g = gesture.current;
          gesture.current = null;
          if (!g) return;
          const p = toWorld(event);
          if (g.kind === "move") {
            if (g.moved) commit(Object.entries(preview).map(([id, data]) => ({ op: "update", id, data }) as Op));
            // A click on one of several picked narrows the selection to it (and its group).
            else if (!event.shiftKey && live.length > withGroups([g.hit]).length) setSelected(event.metaKey ? [g.hit] : withGroups([g.hit]));
          }
          if (g.kind === "resize" || g.kind === "end" || g.kind === "crop") commit(Object.entries(preview).map(([id, data]) => ({ op: "update", id, data }) as Op));
          if (g.kind === "draw" && g.tool === "text") create({ type: "text", x: g.start.x, y: g.start.y - 12, text: "" });
          else if (g.kind === "draw") {
            const type = g.tool === "container" ? "container" : g.tool === "note" ? "note" : "shape";
            const size = defaults[type]!, area = marquee && marquee.w * cam.current.z > 8 && marquee.h * cam.current.z > 8 && type !== "note"
              ? marquee : { x: g.start.x - size.w / 2, y: g.start.y - size.h / 2, ...size };
            create({ type, ...area, ...type === "shape" && { kind }, text: "" }, type !== "container");
          }
          if (g.kind === "link" && draft && Math.hypot(p.x - g.start.x, p.y - g.start.y) * cam.current.z > 10) create(draft, false);
          if (g.kind === "pen" && draft) create(draft, false, true);
          if (g.kind === "pin") { setOpen(undefined); setPinning(g.pin); }
          if (g.kind === "stick") {
            const on = g.on && boxOf(g.on);
            create({ type: "sticker", x: g.at.x - (on ? on.x : 0) - 20, y: g.at.y - (on ? on.y : 0) - 20, emoji: sticker, ...g.on && { on: g.on } }, false, true);
          }
          if (g.kind === "erase" && g.hits.size) commit([...g.hits].map(id => ({ op: "delete", id }) as Op));
          setPreview({});
          setMarquee(undefined);
          setDraft(undefined);
          setFading([]);
        }}
        onDoubleClick={event => {
          if ((event.target as HTMLElement).closest(".editable")) return;
          // The press captured the pointer, so the event names the board: look at what is under it.
          const under = document.elementFromPoint(event.clientX, event.clientY);
          const p = toWorld(event), hit = under?.closest<HTMLElement>("[data-id]")?.dataset.id;
          const el = hit ? board.elements[hit] : undefined;
          const at = under?.closest<HTMLElement>("[data-cell]")?.dataset.cell?.split(",").map(Number) as [number, number] | undefined;
          if (el?.type === "table" && at && !el.locked) editCell(hit!, at);
          else if (el?.type === "link" && typeof el.url === "string") window.open(el.url, "_blank", "noopener");
          else if (el?.type === "image" && !el.locked) { setSelected([hit!]); setCropping(hit); }
          else if (el && hasText(el) && !el.locked) { setSelected([hit!]); setEditing(hit); }
          else if (!hit && tool === "select") create({ type: "text", x: p.x, y: p.y - 12, text: "" });
        }}>
        <div ref={world} className="world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`, ["--z" as string]: camera.z }}>
          {board.order.map(id => {
            if (!board.elements[id]) return null;
            const el = placed(id);
            return <ElementView key={id} id={id} el={el} selected={live.includes(id) && !editing} editing={editing === id} resolve={resolve}
              path={el.type === "arrow" ? pathOf(el) : undefined} faded={fading.includes(id)} onText={text => onText(id, text)}
              cell={cell?.id === id ? cell.at : undefined} onTab={back => {
                const rows = cellsOf(el), width = rows[0]!.length, n = (cell!.at[0] * width + cell!.at[1] + (back ? -1 : 1) + rows.length * width) % (rows.length * width);
                editCell(id, [Math.floor(n / width), n % width]);
              }}
              live={live.length === 1 && live[0] === id && !busy && tool === "select"}
              onSave={state => commit([{ op: "update", id, data: { state } }], false)} onEscape={() => setSelected([])} />;
          })}
          {draft && <ElementView id="" el={draft} selected={false} editing={false} resolve={resolve} path={draft.type === "arrow" ? pathOf(draft) : undefined} onText={() => {}} />}
          {cropping && board.elements[cropping] && (() => {
            const b = boxOf(cropping);
            return <div className="crop-frame" style={{ left: b.x, top: b.y, width: b.w, height: b.h }}><span>拖动挑位置，上方滑块放大，回车完成</span></div>;
          })()}
          {Object.entries(board.claims).map(([id, claim]) => {
            const area = claim.ids ? union(claim.ids.filter(i => i in board.elements).map(boxOf)) : claim.w ? claim as Box : undefined;
            return area && <div key={id} className="claim" style={{ left: area.x, top: area.y, width: area.w, height: area.h }}><span>agent 在这里画…</span></div>;
          })}
          {frame && (
            <div className="frame-sel" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
              {!busy && !cropping && unlocked().length > 0 && handles.map(h => <span key={h} className={`handle ${h}`} data-handle={h} />)}
            </div>
          )}
          {lone && !single?.locked && (["from", "to"] as const).map(which => {
            const at = which === "from" ? lone[0]! : lone.at(-1)!;
            return <span key={which} className="end-handle" data-end={which} style={{ left: at.x, top: at.y }} />;
          })}
          {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
          <div className="wb-pins" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
            {comments.map((comment, i) => {
              const at = placeOf(comment);
              return at && <Mark key={comment.id} spot={at} n={i + 1} z={camera.z} px
                onClick={() => { setPinning(undefined); setOpen(open === comment.id ? undefined : comment.id); }} />;
            })}
            {pinning && placeOf(pinning) && <>
              <Mark spot={placeOf(pinning)!} n={comments.length + 1} z={camera.z} px draft />
              <Popover spot={placeOf(pinning)!} z={camera.z} px>
                <CommentBox placeholder={pinning.target === "board" ? "这里想怎么改…" : "这个想怎么改…"} autoFocus onCancel={() => setPinning(undefined)}
                  onSend={async text => {
                    await ctx.send({ kind: "comment", target: pinning.target, spot: pinning.spot, text, crop: await picture(pinning) });
                    setPinning(undefined);
                    setTool("select");
                    say("已发给 agent");
                  }} />
              </Popover>
            </>}
            {(() => {
              const comment = comments.find(c => c.id === open), at = comment && placeOf(comment);
              return at && (
                <Popover spot={at} z={camera.z} px>
                  <Conversation ctx={ctx} comment={comment} />
                  <div className="thread-actions">
                    <button className="quiet" onClick={async () => { await ctx.send({ kind: "resolve", to: comment.id }); setOpen(undefined); }}>解决</button>
                    <button className="quiet" onClick={() => setOpen(undefined)}>关闭</button>
                  </div>
                </Popover>
              );
            })()}
          </div>
        </div>
      </div>

      {board.order.length === 0 && <p className="wb-empty">双击任意处写字 · S 放便签 · R 画形状 · L 拉箭头 · 把图片拖进来</p>}

      {live.length > 0 && !editing && !busy && (frame || lone) && (() => {
        const area = frame ?? boxOfPoints(lone!);
        return (
          <div className="selbar" style={{ left: area.x * camera.z + camera.x + (area.w * camera.z) / 2, top: Math.max(64, area.y * camera.z + camera.y - 56) }}
            onPointerDown={e => e.stopPropagation()}>
            {!locked && has("shape", "note", "container", "table") && fills.map(c => (
              <button key={c} className={`swatch${ofType("shape", "note", "container", "table").some(id => board.elements[id]!.color === c) ? " on" : ""}`}
                title={single?.type === "table" ? `表头 ${c}` : c}
                style={{ background: `var(--fill-${c})` }} onClick={() => update(ofType("shape", "note", "container", "table"), { color: c })} />
            ))}
            {!locked && single?.type === "table" && <><span className="sep" />
              <button className="t" title="在当前行下面加一行" onClick={() => reshape("row")}>+行</button>
              <button className="t" title="在当前列右边加一列" onClick={() => reshape("column")}>+列</button>
              <button className="t" title="删掉当前行" onClick={() => reshape("-row")}>−行</button>
              <button className="t" title="删掉当前列" onClick={() => reshape("-column")}>−列</button>
              <select title="给点中的格子上色" value="" onChange={e => colourCell(e.target.value === "none" ? null : e.target.value)}>
                <option value="">格子颜色</option>
                {fills.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="none">去掉颜色</option>
              </select>
              <select title="热力图：按数字大小上色" value={typeof single.heat === "string" ? single.heat : ""} onChange={e => update(live, { heat: e.target.value || null })}>
                <option value="">无热力图</option>
                {fills.filter(c => c !== "white").map(c => <option key={c} value={c}>热力 {c}</option>)}
              </select></>}
            {single?.type === "link" && typeof single.url === "string" && <><span className="sep" />
              <button className="t" onClick={() => window.open(single.url as string, "_blank", "noopener")}>打开</button>
              {/^https:\/\//u.test(single.url) && !locked && <button className="t" title="把这个网页嵌进白板" onClick={() => {
                const id = live[0]!, { x, y, url } = single;
                commit([{ op: "set", id, data: { type: "html", x, y, w: 640, h: 420, src: url } }]);
              }}>嵌入</button>}</>}
            {!locked && has("text", "arrow", "stroke") && <>{has("shape", "note", "container", "table") && <span className="sep" />}{inks.map(c => (
              <button key={c} className={`swatch${ofType("text", "arrow", "stroke").some(id => board.elements[id]!.color === c) ? " on" : ""}`} title={c}
                style={{ background: `var(--ink-${c})` }} onClick={() => update(ofType("text", "arrow", "stroke"), { color: c })} />
            ))}</>}
            {!locked && has("shape", "note", "text") && <><span className="sep" />
              <select value={(single?.size as string) ?? ""} onChange={e => update(ofType("shape", "note", "text"), { size: e.target.value })} title="字号">
                {!single?.size && <option value="">字号</option>}
                {(Object.keys(textSizes) as TextSize[]).map(s => <option key={s} value={s}>{sizeNames[s]}</option>)}
              </select></>}
            {!locked && single?.type === "shape" && <>
              <select value={(single.kind as string) ?? "rounded"} onChange={e => update(live, { kind: e.target.value })} title="形状">
                {shapeKinds.map(k => <option key={k} value={k}>{shapeNames[k]}</option>)}
              </select>
              <select title="边框" value={!single.stroke ? "" : single.dash === "dot" ? "dot" : single.dash ? "dash" : "line"}
                onChange={e => update(live, e.target.value ? { stroke: single.stroke ?? "ink", dash: e.target.value === "dot" ? "dot" : e.target.value === "dash" ? true : null } : { stroke: null, dash: null })}>
                <option value="">无边框</option><option value="line">实线边框</option><option value="dash">虚线边框</option><option value="dot">点线边框</option>
              </select></>}
            {!locked && has("shape", "note", "text", "container", "table") && (
              <select title="字体" value={String(single?.font ?? "sans")} onChange={e => update(ofType("shape", "note", "text", "container", "table"), { font: e.target.value === "sans" ? null : e.target.value })}>
                {Object.entries(fonts).map(([k, f]) => <option key={k} value={k}>{f.name}</option>)}
              </select>
            )}
            {!locked && has("shape", "note", "container", "table", "text", "arrow", "stroke") && (
              <input type="color" title="自选颜色（可以填十六进制，也可以用吸管从屏幕上取）" key={live.join()}
                defaultValue={typeof single?.color === "string" && single.color.startsWith("#") ? single.color : "#888888"}
                ref={node => {
                  if (!node || node.dataset.wired) return;
                  node.dataset.wired = "1";
                  // On the picker closing, not on every step of the drag: one change, one undo.
                  node.addEventListener("change", () => pickColour.current?.(node.value));
                }} />
            )}
            <select title="样式（⌥⌘C 复制 · ⌥⌘V 粘贴）" value="" onChange={e => e.target.value === "copy" ? copyStyle() : pasteStyle()}>
              <option value="">样式</option><option value="copy">复制样式</option>{style.current && !locked && <option value="paste">粘贴样式</option>}
            </select>
            {!locked && has("arrow") && <><span className="sep" />
              <select title="箭头" value={single?.type === "arrow" ? JSON.stringify(headsOf(single)) : ""}
                onChange={e => update(ofType("arrow"), { heads: JSON.parse(e.target.value), head: null })}>
                {single?.type !== "arrow" && <option value="">箭头</option>}
                <option value='["none","arrow"]'>→</option><option value='["arrow","arrow"]'>↔</option>
                <option value='["none","none"]'>—</option><option value='["circle","arrow"]'>●→</option>
              </select>
              <select title="线型" value={String(single?.dash ?? "")} onChange={e => update(ofType("arrow"), { dash: e.target.value === "dot" ? "dot" : e.target.value ? true : null })}>
                <option value="">实线</option><option value="true">虚线</option><option value="dot">点线</option>
              </select></>}
            {!locked && has("stroke") && <><span className="sep" />{penWidths.map(w => (
              <button key={w} className={`t${single?.width === w ? " on" : ""}`} title={`${w} 粗`} onClick={() => update(ofType("stroke"), { width: w })}>
                <svg width={22} height={12}><line x1={2} y1={6} x2={20} y2={6} stroke="currentColor" strokeWidth={w} strokeLinecap="round" /></svg>
              </button>
            ))}</>}
            {!locked && single?.type === "image" && <><span className="sep" />
              {cropping === live[0]
                ? <><input type="range" min={1} max={4} step={0.05} value={crop.zoom ?? 1} title="放大"
                    onChange={e => update(live, { crop: { zoom: Number(e.target.value), x: crop.x ?? 0.5, y: crop.y ?? 0.5 } })} />
                  <button className="t" onClick={() => update(live, { crop: null })}>还原</button>
                  <button className="t on" onClick={() => setCropping(undefined)}>完成</button></>
                : <button className="t" title="裁剪（双击图片）" onClick={() => setCropping(live[0])}>裁剪</button>}</>}
            {!locked && live.length > 1 && <><span className="sep" />
              <select value="" title="对齐" onChange={e => e.target.value === "tidy" ? tidy() : align(e.target.value as Parameters<typeof align>[0])}>
                <option value="">对齐</option>
                <option value="left">左对齐</option><option value="centre">水平居中</option><option value="right">右对齐</option>
                <option value="top">顶对齐</option><option value="middle">垂直居中</option><option value="bottom">底对齐</option>
                <option value="tidy">整理</option>
              </select>
              <button className="t" title="编组（⌘G）" onClick={group}>编组</button></>}
            {live.some(id => (board.elements[id]!.groups as string[] | undefined)?.length) && <button className="t" title="取消编组（⇧⌘G）" onClick={ungroup}>解组</button>}
            <span className="sep" />
            {live.length === 1 && <button className="t" title="评论，发给 agent（Tab）" onClick={() => commentOn(live[0]!)}>评论</button>}
            {!locked && <><button className="t" title="置顶（⌘]）" onClick={() => reorder("front")}>置顶</button>
              <button className="t" title="置底（⌘[）" onClick={() => reorder("back")}>置底</button></>}
            <button className="t" title="锁定（⇧⌘L）" onClick={lock}>{locked ? "解锁" : "锁定"}</button>
            <button className="t" title="复制一份（⌘D）" onClick={duplicate}>复制</button>
            {!locked && <button className="t danger" title="删除（⌫）" onClick={remove}>删除</button>}
          </div>
        );
      })()}

      {tool === "pen" && (
        <div className="wb-pen">
          {inks.map(c => <button key={c} className={`swatch${pen.color === c ? " on" : ""}`} title={c} style={{ background: `var(--ink-${c})` }} onClick={() => setPen({ ...pen, color: c })} />)}
          <span className="sep" />
          {penWidths.map(w => (
            <button key={w} className={`t${pen.width === w ? " on" : ""}`} onClick={() => setPen({ ...pen, width: w })}>
              <svg width={22} height={12}><line x1={2} y1={6} x2={20} y2={6} stroke="currentColor" strokeWidth={w} strokeLinecap="round" /></svg>
            </button>
          ))}
        </div>
      )}
      {tool === "sticker" && (
        <div className="wb-pen">
          {stickers.map(s => <button key={s} className={`t sticker-pick${sticker === s ? " on" : ""}`} onClick={() => setSticker(s)}>{s}</button>)}
        </div>
      )}
      <div className="wb-tools">
        {toolNames.map(([t, name, key]) => (
          <button key={t} className={tool === t ? "on" : ""} title={key ? `${name}（${key}）` : name} onClick={() => setTool(t)}>{name}{key && <kbd>{key}</kbd>}</button>
        ))}
        <span className="kinds-wrap">
          <button className={tool === "shape" ? "on" : ""} title="形状（R 圆角 · O 椭圆 · D 菱形）"
            onClick={() => { setTool("shape"); setKinds(!kinds); }}>{shapeNames[kind]}<kbd>R</kbd></button>
          {kinds && (
            <span className="kinds">
              {shapeKinds.map(k => (
                <button key={k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); setTool("shape"); setKinds(false); }}>
                  <svg width={36} height={24} viewBox="0 0 36 24"><g transform="translate(2 2)" fill="none" stroke="currentColor" strokeWidth={1.5}>{outline(k, 32, 20)}</g></svg>
                  {shapeNames[k]}
                </button>
              ))}
            </span>
          )}
        </span>
        <button title="放图片（也可以拖进来或粘贴）" onClick={() => picker.current?.click()}>图片</button>
        <button title="放一张表格（也可以粘贴表格里复制的格子）" onClick={() => {
          const at = viewCentre();
          create({ type: "table", x: at.x - 150, y: at.y - 60, rows: [["列 1", "列 2", "列 3"], ["", "", ""], ["", "", ""]] }, false);
        }}>表格</button>
        <input ref={picker} type="file" accept={imageTypes.join(",")} multiple hidden
          onChange={e => { void upload([...e.target.files ?? []], viewCentre()); e.target.value = ""; }} />
      </div>
      {finding && <Find onClose={() => setFinding(false)}
        find={query => board.order.filter(id => wordsOf(board.elements[id]!).toLowerCase().includes(query.toLowerCase()))}
        onGo={id => { setSelected([id]); fit([id]); }} />}
      <div className="wb-zoom">
        <Timer timer={board.timer} set={timer => commit([{ op: "meta", data: { timer } }], false)} />
        <button title="查找（⌘F）" onClick={() => setFinding(true)}>查找</button>
        <span className="menu-wrap">
          <button title="下载白板" onClick={() => setMenu(!menu)}>下载</button>
          {menu && <span className="menu"><button onClick={() => void save("png")}>图片 PNG</button><button onClick={() => void save("json")}>数据 JSON</button></span>}
        </span>
        <button title={layers ? "收起图层" : "图层"} className={layers ? "on" : ""} onClick={() => setLayers(!layers)}>图层</button>
        <button title={grid ? "关掉网格" : "打开网格"} onClick={toggleGrid}>{grid ? "网格" : "无网格"}</button>
        <button title="撤销（⌘Z）" onClick={() => step("undo")}>↶</button>
        <button title="重做（⇧⌘Z）" onClick={() => step("redo")}>↷</button>
        <button title="缩小（⌘−）" onClick={() => zoom(z => z / 1.25)}>−</button>
        <button title="整块放进屏幕（⇧1）" onClick={() => fit()}>{Math.round(camera.z * 100)}%</button>
        <button title="放大（⌘=）" onClick={() => zoom(z => z * 1.25)}>+</button>
      </div>
      {layers && <Layers order={board.order} elements={board.elements} selected={live} onPick={(id, add) => setSelected(add ? live.includes(id) ? live.filter(i => i !== id) : [...live, id] : [id])}
        onClose={() => setLayers(false)} />}
      {toast && <div className="wb-toast">{toast}</div>}
    </>
  );
}
