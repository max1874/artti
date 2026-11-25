// The whiteboard editor: the board, its tools, and every gesture on it. docs/whiteboard.md.

import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { Loaded } from "../api.ts";
import { ElementView, outline } from "./Element.tsx";
import {
  type Board, type Box, type Element, type Op, type Point, type TextSize,
  apply, contains, defaults, fieldsOf, fills, hasText, inks, inverse, meets, newId, shapeKinds, shapeNames, sizeNames, span, textSizes, union,
} from "./model.ts";

type Tool = "select" | "hand" | "text" | "note" | "container" | "shape";
const toolKeys: Record<string, Tool> = { v: "select", h: "hand", t: "text", s: "note", n: "note", a: "container", f: "container", r: "shape", o: "shape", d: "shape" };
const kindKeys: Record<string, string> = { r: "rounded", o: "ellipse", d: "diamond" };
const toolNames: [Tool, string, string][] = [["select", "选择", "V"], ["hand", "抓手", "H"], ["text", "文字", "T"], ["note", "便签", "S"], ["container", "分区", "A"]];

type Gesture =
  | { kind: "pan"; last: Point }
  | { kind: "move"; start: Point; hit: string; origin: Map<string, Point>; moved: boolean }
  | { kind: "resize"; start: Point; handle: string; frame: Box; origin: Map<string, Box> }
  | { kind: "marquee"; start: Point; base: string[] }
  | { kind: "draw"; start: Point; tool: Tool };

const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

async function post(project: string, slug: string, ops: Op[]) {
  const response = await fetch(`/api/board/${project}/${encodeURIComponent(slug)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? response.statusText);
}

export function Whiteboard({ data }: { data: Loaded }) {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
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
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string>();
  const [preview, setPreview] = useState<Record<string, Partial<Element>>>({});
  const [marquee, setMarquee] = useState<Box>();
  const [drawn, setDrawn] = useState<Box>();
  const [space, setSpace] = useState(false);
  const [toast, setToast] = useState<string>();
  const toastTimer = useRef<number>(undefined);
  const gesture = useRef<Gesture | null>(null);
  const pointer = useRef<Point>({ x: 0, y: 0 });
  const history = useRef<{ undo: Op[][]; redo: Op[][] }>({ undo: [], redo: [] });
  const sizes = useRef(new Map<string, { w: number; h: number }>());
  const [, remeasured] = useReducer((n: number) => n + 1, 0);

  const live = selected.filter(id => id in board.elements);
  const shown = (id: string) => ({ ...board.elements[id]!, ...preview[id] }) as Element;
  const boxOf = (id: string): Box => {
    const el = shown(id);
    const measured = sizes.current.get(id);
    return { x: el.x, y: el.y, w: el.w ?? measured?.w ?? defaults[el.type]?.w ?? 0, h: el.h ?? measured?.h ?? defaults[el.type]?.h ?? 0 };
  };

  const say = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(undefined), 1800);
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

  /** What a drag moves: the selection, and what its sections hold, but nothing locked. */
  const moving = (ids: string[]) => {
    const all = new Set(ids);
    for (const id of ids) if (shown(id).type === "container") {
      const frame = boxOf(id);
      for (const other of board.order) if (other !== id && contains(frame, boxOf(other))) all.add(other);
    }
    return [...all].filter(id => !board.elements[id]?.locked);
  };

  /** A section is picked by its title or its edge; inside it, the person is working on what it holds. */
  const sectionEdge = (p: Point) => [...board.order].reverse().find(id => {
    if (board.elements[id]?.type !== "container") return false;
    const b = boxOf(id), m = 8 / cam.current.z;
    const near = p.x > b.x - m && p.x < b.x + b.w + m && p.y > b.y - m && p.y < b.y + b.h + m;
    return near && !(p.x > b.x + m && p.x < b.x + b.w - m && p.y > b.y + m && p.y < b.y + b.h - m);
  });

  const create = (el: Element, edit = hasText(el)) => {
    const id = newId();
    commit([{ op: "set", id, data: el }]);
    setSelected([id]);
    if (edit) setEditing(id);
    setTool("select");
    return id;
  };

  const onText = (id: string, text: string) => {
    setEditing(undefined);
    const el = current.current.elements[id];
    if (!el) return;
    if (el.type === "text" && !text.trim()) {
      // A text left empty was never there: it goes, and so does its place in the history.
      const last = history.current.undo.at(-1);
      if (last?.length === 1 && last[0]!.op === "delete" && last[0]!.id === id) history.current.undo.pop();
      commit([{ op: "delete", id }], false);
      setSelected([]);
      return;
    }
    if (text !== (el.text ?? "")) commit([{ op: "update", id, data: { text } }]);
  };

  const unlocked = (ids = live) => ids.filter(id => !board.elements[id]?.locked);
  const remove = () => commit(unlocked().map(id => ({ op: "delete", id }) as Op));
  const copies = (ids: string[], at?: Point) => {
    const els = ids.map(id => fieldsOf(current.current.elements[id]!));
    const frame = union(els.map((el, i) => ({ x: el.x, y: el.y, w: boxOf(ids[i]!).w, h: boxOf(ids[i]!).h })))!;
    const dx = at ? at.x - (frame.x + frame.w / 2) : 24, dy = at ? at.y - (frame.y + frame.h / 2) : 24;
    const made = els.map(el => ({ id: newId(), data: { ...el, x: el.x + dx, y: el.y + dy, locked: undefined } }));
    commit(made.map(({ id, data }) => ({ op: "set", id, data }) as Op));
    setSelected(made.map(m => m.id));
  };
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

  // Keys, the clipboard, and the wheel.
  const keys = useRef<(event: KeyboardEvent) => void>(null);
  keys.current = event => {
    if (editing || (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]"))) return;
    const mod = event.metaKey || event.ctrlKey, key = event.key.toLowerCase();
    if (event.key === " ") { setSpace(true); event.preventDefault(); return; }
    if (mod && key === "z") { event.preventDefault(); return step(event.shiftKey ? "redo" : "undo"); }
    if (mod && key === "y") { event.preventDefault(); return step("redo"); }
    if (mod && key === "a") { event.preventDefault(); return setSelected(board.order); }
    if (mod && key === "d") { event.preventDefault(); return live.length && copies(live); }
    if (mod && (key === "c" || key === "x") && live.length) {
      void navigator.clipboard.writeText(JSON.stringify({ artti: live.map(id => fieldsOf(board.elements[id]!)) }));
      if (key === "x") remove(); else say("已复制");
      return;
    }
    if (mod && event.shiftKey && key === "l") { event.preventDefault(); return live.length && lock(); }
    if (event.key === "]" || event.key === "[") { event.preventDefault(); return live.length && reorder(event.key === "]" ? (mod ? "front" : "forward") : (mod ? "back" : "backward")); }
    if (event.key === "Backspace" || event.key === "Delete") return remove();
    if (event.key === "Escape") { setSelected([]); setTool("select"); setKinds(false); return; }
    if (event.key === "Enter" && live.length === 1 && hasText(board.elements[live[0]!]!) && !board.elements[live[0]!]!.locked) { event.preventDefault(); return setEditing(live[0]); }
    if (event.key.startsWith("Arrow") && live.length) {
      event.preventDefault();
      const d = event.shiftKey ? 10 : 1, dx = event.key === "ArrowLeft" ? -d : event.key === "ArrowRight" ? d : 0, dy = event.key === "ArrowUp" ? -d : event.key === "ArrowDown" ? d : 0;
      return commit(moving(live).map(id => ({ op: "update", id, data: { x: shown(id).x + dx, y: shown(id).y + dy } }) as Op));
    }
    if (event.shiftKey && event.code === "Digit1") return fit();
    if (event.shiftKey && event.code === "Digit2") return fit(live.length ? live : undefined);
    if (!mod && !event.altKey && toolKeys[key]) { setTool(toolKeys[key]!); if (kindKeys[key]) setKind(kindKeys[key]!); }
  };
  const pasted = useRef<(event: ClipboardEvent) => void>(null);
  pasted.current = event => {
    if (editing || (event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]"))) return;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    try {
      const { artti } = JSON.parse(text) as { artti: Element[] };
      if (Array.isArray(artti)) {
        const made = artti.map(el => ({ id: newId(), el }));
        const frame = union(artti.map(el => ({ x: el.x, y: el.y, w: el.w ?? 0, h: el.h ?? 0 })))!;
        const dx = pointer.current.x - (frame.x + frame.w / 2), dy = pointer.current.y - (frame.y + frame.h / 2);
        commit(made.map(({ id, el }) => ({ op: "set", id, data: { ...el, x: el.x + dx, y: el.y + dy } }) as Op));
        return setSelected(made.map(m => m.id));
      }
    } catch {}
    if (text.trim()) create({ type: "text", x: pointer.current.x, y: pointer.current.y, text: text.trim(), ...text.length > 60 && { wrap: 400 } }, false);
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

  const frame = editing ? undefined : union(live.map(boxOf));
  const single = live.length === 1 ? board.elements[live[0]!] : undefined;

  return (
    <>
      <div ref={viewport} className={`wb ${space || tool === "hand" ? "hand" : tool === "select" ? "" : tool === "text" ? "texting" : "drawing"}`}
        onPointerDown={event => {
          if (event.button === 1 || space || tool === "hand") {
            gesture.current = { kind: "pan", last: { x: event.clientX, y: event.clientY } };
            return viewport.current!.setPointerCapture(event.pointerId);
          }
          if (event.button !== 0 || (event.target as HTMLElement).closest(".editable")) return;
          setKinds(false);
          const p = toWorld(event), target = event.target as HTMLElement;
          const handle = target.closest<HTMLElement>("[data-handle]")?.dataset.handle;
          if (handle && frame) {
            gesture.current = { kind: "resize", start: p, handle, frame, origin: new Map(unlocked().map(id => [id, boxOf(id)])) };
          } else if (tool !== "select") {
            // Made when the button comes up: a box focused on the press loses focus to the release.
            gesture.current = { kind: "draw", start: p, tool };
          } else {
            const hit = target.closest<HTMLElement>("[data-id]")?.dataset.id ?? sectionEdge(p);
            if (hit) {
              const next = event.shiftKey ? (live.includes(hit) ? live.filter(id => id !== hit) : [...live, hit]) : live.includes(hit) ? live : [hit];
              setSelected(next);
              gesture.current = { kind: "move", start: p, hit, origin: new Map(moving(next).map(id => [id, { x: shown(id).x, y: shown(id).y }])), moved: false };
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
            return setPreview(Object.fromEntries([...g.origin].map(([id, o]) => [id, { x: o.x + dx, y: o.y + dy }])));
          }
          if (g.kind === "marquee") {
            const area = span(g.start, p);
            setMarquee(area);
            // A section is taken only whole; anything else as soon as the box meets it.
            return setSelected([...g.base, ...board.order.filter(id => !g.base.includes(id) &&
              (board.elements[id]!.type === "container" ? contains(area, boxOf(id)) : meets(area, boxOf(id))))]);
          }
          if (g.kind === "draw") return setDrawn(span(g.start, p));
          // Resizing: the dragged edges move, the others stay; shift keeps the proportions.
          const f = g.frame, dx = p.x - g.start.x, dy = p.y - g.start.y;
          let left = f.x, top = f.y, right = f.x + f.w, bottom = f.y + f.h;
          if (g.handle.includes("w")) left = Math.min(f.x + dx, right - 16);
          if (g.handle.includes("e")) right = Math.max(f.x + f.w + dx, left + 16);
          if (g.handle.includes("n")) top = Math.min(f.y + dy, bottom - 16);
          if (g.handle.includes("s")) bottom = Math.max(f.y + f.h + dy, top + 16);
          let sx = (right - left) / f.w, sy = (bottom - top) / f.h;
          if (event.shiftKey && g.handle.length === 2) {
            sx = sy = Math.max(sx, sy);
            if (g.handle.includes("w")) left = right - f.w * sx; else right = left + f.w * sx;
            if (g.handle.includes("n")) top = bottom - f.h * sy; else bottom = top + f.h * sy;
          }
          setPreview(Object.fromEntries([...g.origin].map(([id, b]) => {
            const el = board.elements[id]!, x = left + (b.x - f.x) * sx, y = top + (b.y - f.y) * sy;
            if (el.type !== "text") return [id, { x, y, w: Math.max(8, b.w * sx), h: Math.max(8, b.h * sy) }];
            // Text keeps its size; a side handle sets where it wraps.
            return [id, g.origin.size === 1 && /[ew]/u.test(g.handle) ? { x, y, wrap: Math.max(40, b.w * sx) } : { x, y }];
          })));
        }}
        onPointerUp={event => {
          const g = gesture.current;
          gesture.current = null;
          if (!g) return;
          if (g.kind === "move") {
            if (g.moved) commit(Object.entries(preview).map(([id, data]) => ({ op: "update", id, data }) as Op));
            else if (!event.shiftKey && live.length > 1 && live.includes(g.hit)) setSelected([g.hit]);
          }
          if (g.kind === "resize") commit(Object.entries(preview).map(([id, data]) => ({ op: "update", id, data }) as Op));
          if (g.kind === "draw" && g.tool === "text") create({ type: "text", x: g.start.x, y: g.start.y - 12, text: "" });
          else if (g.kind === "draw") {
            const type = g.tool === "container" ? "container" : g.tool === "note" ? "note" : "shape";
            const size = defaults[type]!, area = drawn && drawn.w * cam.current.z > 8 && drawn.h * cam.current.z > 8 && type !== "note"
              ? drawn : { x: g.start.x - size.w / 2, y: g.start.y - size.h / 2, ...size };
            create({ type, ...area, ...type === "shape" && { kind }, text: "" }, type !== "container");
          }
          setPreview({});
          setMarquee(undefined);
          setDrawn(undefined);
        }}
        onDoubleClick={event => {
          if ((event.target as HTMLElement).closest(".editable")) return;
          // The press captured the pointer, so the event names the board: look at what is under it.
          const under = document.elementFromPoint(event.clientX, event.clientY);
          const p = toWorld(event), hit = under?.closest<HTMLElement>("[data-id]")?.dataset.id;
          const el = hit ? board.elements[hit] : undefined;
          if (el && hasText(el) && !el.locked) { setSelected([hit!]); setEditing(hit); }
          else if (!hit && tool === "select") create({ type: "text", x: p.x, y: p.y - 12, text: "" });
        }}>
        <div ref={world} className="world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`, ["--z" as string]: camera.z }}>
          {board.order.map(id => board.elements[id] && (
            <ElementView key={id} id={id} el={shown(id)} selected={live.includes(id) && !editing} editing={editing === id}
              onText={text => onText(id, text)} />
          ))}
          {Object.entries(board.claims).map(([id, claim]) => {
            const area = claim.ids ? union(claim.ids.filter(i => i in board.elements).map(boxOf)) : claim.w ? claim as Box : undefined;
            return area && <div key={id} className="claim" style={{ left: area.x, top: area.y, width: area.w, height: area.h }}><span>agent 在这里画…</span></div>;
          })}
          {frame && (
            <div className="frame-sel" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
              {!gesture.current && unlocked().length > 0 && handles.map(h => <span key={h} className={`handle ${h}`} data-handle={h} />)}
            </div>
          )}
          {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
          {drawn && <div className="marquee" style={{ left: drawn.x, top: drawn.y, width: drawn.w, height: drawn.h }} />}
        </div>
      </div>

      {board.order.length === 0 && <p className="wb-empty">双击任意处写字 · S 放便签 · R 画形状 · A 圈一个分区</p>}

      {frame && !marquee && !Object.keys(preview).length && (
        <SelectionBar left={frame.x * camera.z + camera.x + (frame.w * camera.z) / 2} top={frame.y * camera.z + camera.y}
          els={live.map(id => board.elements[id]!)} single={single}
          onFill={color => update(live.filter(id => board.elements[id]!.type !== "text"), { color })}
          onInk={color => update(live.filter(id => board.elements[id]!.type === "text"), { color })}
          onSize={size => update(live.filter(id => board.elements[id]!.type !== "container"), { size })}
          onKind={k => update(live, { kind: k })}
          onOrder={reorder} onLock={lock} onCopy={() => copies(live)} onDelete={remove} />
      )}

      <div className="wb-tools">
        {toolNames.map(([t, name, key]) => (
          <button key={t} className={tool === t ? "on" : ""} title={`${name}（${key}）`} onClick={() => setTool(t)}>{name}<kbd>{key}</kbd></button>
        ))}
        <span className="kinds-wrap">
          <button className={tool === "shape" ? "on" : ""} title="形状（R 圆角 · O 椭圆 · D 菱形）"
            onClick={() => { setTool("shape"); setKinds(!kinds); }}>{shapeNames[kind]}<kbd>R</kbd></button>
          {kinds && (
            <span className="kinds">
              {shapeKinds.map(k => (
                <button key={k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); setTool("shape"); setKinds(false); }}>
                  <svg width={36} height={24} viewBox="0 0 36 24"><ShapeIcon kind={k} /></svg>{shapeNames[k]}
                </button>
              ))}
            </span>
          )}
        </span>
      </div>
      <div className="wb-zoom">
        <button title="撤销（⌘Z）" onClick={() => step("undo")}>↶</button>
        <button title="重做（⇧⌘Z）" onClick={() => step("redo")}>↷</button>
        <button title="整块放进屏幕（⇧1）" onClick={() => fit()}>{Math.round(camera.z * 100)}%</button>
      </div>
      {toast && <div className="wb-toast">{toast}</div>}
    </>
  );
}

function ShapeIcon({ kind }: { kind: string }) {
  return <g transform="translate(2 2)" fill="none" stroke="currentColor" strokeWidth={1.5}>{outline(kind, 32, 20)}</g>;
}

/** What can be done to the selection, floating above it. */
function SelectionBar({ left, top, els, single, onFill, onInk, onSize, onKind, onOrder, onLock, onCopy, onDelete }: {
  left: number; top: number; els: Element[]; single?: Element;
  onFill: (c: string) => void; onInk: (c: string) => void; onSize: (s: TextSize) => void; onKind: (k: string) => void;
  onOrder: (how: "front" | "back") => void; onLock: () => void; onCopy: () => void; onDelete: () => void;
}) {
  const filled = els.some(el => el.type !== "text"), inked = els.some(el => el.type === "text"), sized = els.some(el => el.type !== "container");
  const locked = els.every(el => el.locked);
  return (
    <div className="selbar" style={{ left, top: Math.max(64, top - 56) }} onPointerDown={e => e.stopPropagation()}>
      {!locked && filled && fills.map(c => <button key={c} className={`swatch${els.some(el => el.color === c) ? " on" : ""}`} title={c} style={{ background: `var(--fill-${c})` }} onClick={() => onFill(c)} />)}
      {!locked && inked && <>{filled && <span className="sep" />}{inks.map(c => <button key={c} className={`swatch${els.some(el => el.color === c) ? " on" : ""}`} title={c} style={{ background: `var(--ink-${c})` }} onClick={() => onInk(c)} />)}</>}
      {!locked && sized && (
        <><span className="sep" />
          <select value={(single?.size as string) ?? ""} onChange={e => onSize(e.target.value as TextSize)} title="字号">
            {!single?.size && <option value="">字号</option>}
            {(Object.keys(textSizes) as TextSize[]).map(s => <option key={s} value={s}>{sizeNames[s]}</option>)}
          </select></>
      )}
      {!locked && single?.type === "shape" && (
        <select value={(single.kind as string) ?? "rounded"} onChange={e => onKind(e.target.value)} title="形状">
          {shapeKinds.map(k => <option key={k} value={k}>{shapeNames[k]}</option>)}
        </select>
      )}
      <span className="sep" />
      {!locked && <><button className="t" title="置顶（⌘]）" onClick={() => onOrder("front")}>置顶</button>
        <button className="t" title="置底（⌘[）" onClick={() => onOrder("back")}>置底</button></>}
      <button className="t" title="锁定（⇧⌘L）" onClick={onLock}>{locked ? "解锁" : "锁定"}</button>
      <button className="t" title="复制一份（⌘D）" onClick={onCopy}>复制</button>
      {!locked && <button className="t danger" title="删除（⌫）" onClick={onDelete}>删除</button>}
    </div>
  );
}
