// The artboard: a canvas you pan and zoom, frames on it, pins on the frames, and the bar that sends the round back.

import { Fragment, createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Event, type Loaded, type Screen, ago, file, say } from "./api.ts";

export type Tool = "move" | "comment";
type Camera = { x: number; y: number; z: number };

export type Ctx = { data: Loaded; send: (event: Partial<Event>) => Promise<void> };
export const useCtx = (data: Loaded): Ctx => ({ data, send: async event => { await say(data.project.id, data.slug, event); } });

const Board = createContext<{ tool: Tool; z: number; ctx: Ctx }>(null!);

/** The current verdict per target; pressing the chosen one again takes it back. */
export function verdictsOf(events: Event[]) {
  const result = new Map<string, string>();
  for (const event of events) {
    if (event.kind !== "verdict" || !event.target) continue;
    if (event.value) result.set(event.target, event.value);
    else result.delete(event.target);
  }
  return result;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const interactive = (target: EventTarget | null) => target instanceof Element && !!target.closest("button, a, input, textarea, iframe, .popover, .report");

export function Canvas({ ctx, children, bar, readOnly }: { ctx: Ctx; children: ReactNode; bar?: ReactNode; readOnly?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, z: 1 });
  const [tool, setTool] = useState<Tool>("move");
  // Until the person moves the camera, it keeps the whole board in view as images arrive.
  const touched = useRef(false);

  const fit = () => {
    const view = viewport.current!.getBoundingClientRect();
    const w = world.current!.scrollWidth, h = world.current!.scrollHeight;
    const z = clamp(Math.min((view.width - 96) / w, (view.height - 170) / h), 0.1, 1);
    setCamera({ z, x: (view.width - w * z) / 2, y: 76 + Math.max(0, (view.height - 170 - h * z) / 2) });
  };

  useLayoutEffect(() => {
    fit();
    const observer = new ResizeObserver(() => { if (!touched.current) fit(); });
    observer.observe(world.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = viewport.current!;
    const wheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest(".popover, .report pre")) return;
      event.preventDefault();
      touched.current = true;
      setCamera(c => {
        // A pinch arrives as a wheel with ctrl held; zoom about the pointer.
        if (event.ctrlKey || event.metaKey) {
          const z = clamp(c.z * Math.exp(-event.deltaY * 0.01), 0.1, 4);
          const box = element.getBoundingClientRect();
          const px = event.clientX - box.left, py = event.clientY - box.top;
          return { z, x: px - ((px - c.x) * z) / c.z, y: py - ((py - c.y) * z) / c.z };
        }
        return { ...c, x: c.x - event.deltaX, y: c.y - event.deltaY };
      });
    };
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea")) return;
      if (event.key === "v") setTool("move");
      if (event.key === "c" && !readOnly) setTool("comment");
      if (event.key === "0" || (event.key === "1" && event.shiftKey)) { touched.current = false; fit(); }
      if (event.key === "Escape") setTool("move");
    };
    element.addEventListener("wheel", wheel, { passive: false });
    addEventListener("keydown", key);
    return () => { element.removeEventListener("wheel", wheel); removeEventListener("keydown", key); };
  }, []);

  const drag = useRef<{ x: number; y: number } | null>(null);
  return (
    <Board.Provider value={{ tool, z: camera.z, ctx }}>
      <div ref={viewport} className={`viewport ${tool}`}
        onPointerDown={event => {
          if (interactive(event.target) || (tool === "comment" && (event.target as Element).closest(".fbody"))) return;
          drag.current = { x: event.clientX, y: event.clientY };
          viewport.current!.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
          drag.current = { x: event.clientX, y: event.clientY };
          touched.current = true;
          setCamera(c => ({ ...c, x: c.x + dx, y: c.y + dy }));
        }}
        onPointerUp={() => { drag.current = null; }}>
        <div ref={world} className="world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})` }}>
          {children}
        </div>
      </div>
      <div className="tools">
        <button className={tool === "move" ? "on" : ""} title="移动（V）" onClick={() => setTool("move")}>移动</button>
        {!readOnly && <button className={tool === "comment" ? "on" : ""} title="点在画板上评论（C）" onClick={() => setTool("comment")}>评论</button>}
        <button title="整块放进屏幕（0）" onClick={() => { touched.current = false; fit(); }}>{Math.round(camera.z * 100)}%</button>
      </div>
      {bar}
    </Board.Provider>
  );
}

/** A labelled group of frames: the chip, the title, what the group asks, and its own actions. */
export function Group({ chip, title, note, actions, rows, children }: { chip: string; title: string; note?: string; actions?: ReactNode; rows?: boolean; children: ReactNode }) {
  return (
    <section className="group">
      <header>
        <span className="chip">{chip}</span>
        <h2>{title}</h2>
        {actions}
      </header>
      {note && <p className="gnote">{note}</p>}
      <div className={rows ? "rows" : "frames"}>{children}</div>
    </section>
  );
}

/** One frame: a header, an image or a page (both as URLs), pins on it. */
export function Frame({ target, title, lead, badge, actions, image, html, caption, selected }: {
  target: string; title: string; lead?: ReactNode; badge?: ReactNode; actions?: ReactNode;
  image?: string; html?: string; caption?: ReactNode; selected?: boolean;
}) {
  const { tool, z, ctx } = useContext(Board);
  const [width, setWidth] = useState(640);
  const [draft, setDraft] = useState<{ x: number; y: number }>();
  const [open, setOpen] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const src = image ?? html;
  const pins = ctx.data.events.filter(e => e.kind === "comment" && e.target === target && e.spot);
  return (
    <div className={`frame${selected ? " selected" : ""}`} style={{ width }}>
      <header>
        {lead}
        <span className="ftitle">{title}</span>
        {badge}
        <span className="fill" />
        {actions}
        {src && <button className="icon" title="放大" onClick={() => setExpanded(true)}>⤢</button>}
        {src && <a className="icon" title="下载" href={src} download>↓</a>}
      </header>
      <div className="fbody"
        onClick={event => {
          if (tool !== "comment" || interactive(event.target)) return;
          const box = event.currentTarget.getBoundingClientRect();
          setOpen(undefined);
          setDraft({ x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height });
        }}>
        {image && <img src={src} alt={title} draggable={false} onLoad={e => setWidth(clamp(e.currentTarget.naturalWidth / 2, 280, 900))} />}
        {html && <iframe src={src} title={title} sandbox="allow-scripts" style={{ pointerEvents: tool === "comment" ? "none" : "auto" }} />}
        {pins.map((pin, i) => (
          <button key={pin.id} className="pin" style={{ left: `${pin.spot!.x * 100}%`, top: `${pin.spot!.y * 100}%`, transform: `translate(-50%, -50%) scale(${1 / z})` }}
            onClick={() => { setDraft(undefined); setOpen(open === pin.id ? undefined : pin.id); }}>{i + 1}</button>
        ))}
        {draft && <span className="pin draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, transform: `translate(-50%, -50%) scale(${1 / z})` }}>{pins.length + 1}</span>}
        {draft && (
          <Popover spot={draft} z={z}>
            <CommentBox placeholder="这里怎么了…" autoFocus onCancel={() => setDraft(undefined)}
              onSend={async text => { await ctx.send({ kind: "comment", target, spot: draft, text }); setDraft(undefined); }} />
          </Popover>
        )}
        {open && pins.some(p => p.id === open) && (
          <Popover spot={pins.find(p => p.id === open)!.spot!} z={z}>
            <Conversation ctx={ctx} comment={pins.find(p => p.id === open)!} />
            <button className="quiet close" onClick={() => setOpen(undefined)}>关闭</button>
          </Popover>
        )}
      </div>
      {caption && <div className="fcaption">{caption}</div>}
      {expanded && src && (
        <div className="lightbox" onClick={() => setExpanded(false)}>
          {image ? <img src={src} alt={title} /> : <iframe src={src} title={title} sandbox="allow-scripts" />}
        </div>
      )}
    </div>
  );
}

/** Kept at reading size whatever the zoom, next to the spot it is about. */
function Popover({ spot, z, children }: { spot: { x: number; y: number }; z: number; children: ReactNode }) {
  return (
    <div className="popover" style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, transform: `translate(16px, -12px) scale(${1 / z})` }}
      onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  );
}

function Conversation({ ctx, comment }: { ctx: Ctx; comment: Event }) {
  return (
    <div className="conversation">
      <p>{comment.text}<time>{ago(comment.at)}</time></p>
      {ctx.data.events.filter(e => e.kind === "reply" && e.to === comment.id).map(reply => (
        <p key={reply.id} className="reply"><b>agent</b>{reply.text}<time>{ago(reply.at)}</time></p>
      ))}
    </div>
  );
}

export function CommentBox({ placeholder, onSend, onCancel, autoFocus }: { placeholder: string; onSend: (text: string) => Promise<void>; onCancel?: () => void; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try { await onSend(text.trim()); setText(""); } finally { setSending(false); }
  };
  return (
    <div className="comment-box">
      <textarea value={text} placeholder={placeholder} autoFocus={autoFocus} rows={2}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
          if (e.key === "Escape") onCancel?.();
        }} />
      <div className="row">
        {onCancel && <button className="quiet" onClick={onCancel}>取消</button>}
        <button className="primary small" disabled={!text.trim() || sending} onClick={send}>评论</button>
      </div>
    </div>
  );
}

/** Pass / reject (and waive) for one target; the pressed one again takes it back. */
export function Verdicts({ ctx, target, labels }: { ctx: Ctx; target: string; labels: [pass: string, reject: string, waive?: string] }) {
  const current = verdictsOf(ctx.data.events).get(target);
  const choices = [["pass", "✓ " + labels[0]], ["reject", "✕ " + labels[1]], ...(labels[2] ? [["waive", labels[2]]] : [])] as const;
  return (
    <span className="verdicts">
      {choices.map(([value, label]) => (
        <button key={value} className={`verdict ${value}${current === value ? " on" : ""}`} aria-pressed={current === value}
          onClick={() => ctx.send({ kind: "verdict", target, value: current === value ? "" : value })}>{label}</button>
      ))}
    </span>
  );
}

/** Comments on a row of the report, written under it. */
export function RowComments({ ctx, target }: { ctx: Ctx; target: string }) {
  const [adding, setAdding] = useState(false);
  const comments = ctx.data.events.filter(e => e.kind === "comment" && e.target === target);
  return (
    <div className="row-comments">
      {comments.map(comment => <Conversation key={comment.id} ctx={ctx} comment={comment} />)}
      {adding
        ? <CommentBox placeholder="说点什么…" autoFocus onCancel={() => setAdding(false)}
            onSend={async text => { await ctx.send({ kind: "comment", target, text }); setAdding(false); }} />
        : <button className="quiet" onClick={() => setAdding(true)}>评论</button>}
    </div>
  );
}

/** The floating bar: which round this is, how much is answered, and Submit. */
export function RoundBar({ ctx, progress, ready }: { ctx: Ctx; progress: string; ready: boolean }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const events = ctx.data.events;
  const submits = events.filter(e => e.kind === "submit").length;
  const lastSubmit = events.findLastIndex(e => e.kind === "submit");
  const waiting = lastSubmit >= 0 && !events.slice(lastSubmit + 1).some(e => e.by === "human");
  return (
    <div className="roundbar">
      <span className="rtitle">{ctx.data.page.title}</span>
      <span className="rmeta">第 {waiting ? submits : submits + 1} 轮 · {progress}</span>
      {waiting
        ? <span className="rsent">已提交 {ago(events[lastSubmit]!.at)} · agent 处理中</span>
        : <>
            <input value={text} placeholder="附一句…" onChange={e => setText(e.target.value)} />
            <button className="primary" disabled={sending || (!ready && !text.trim())}
              onClick={async () => {
                setSending(true);
                try { await ctx.send({ kind: "submit", text: text.trim() || undefined }); setText(""); } finally { setSending(false); }
              }}>提交</button>
          </>}
    </div>
  );
}

/** One screen's versions, oldest to newest, left to right; under review, the newest is marked and the row takes the verdict. */
export function ScreenRow({ ctx, screen, review }: { ctx: Ctx; screen: Screen; review?: boolean }) {
  const latest = screen.versions.at(-1);
  return (
    <div className="screen-row">
      <div className="row-head">
        <h3>{screen.title}</h3>
        <span className="muted">{screen.versions.length} 个版本</span>
        {review && <Verdicts ctx={ctx} target={`screens/${screen.id}`} labels={["通过", "打回"]} />}
      </div>
      <div className="versions">
        {screen.versions.map((version, i) => (
          <Fragment key={version.n}>
            {i > 0 && <span className="arrow">→</span>}
            <Frame target={`screens/${screen.id}/v${version.n}`} title={`v${version.n}${version.label ? ` · ${version.label}` : ""}`}
              image={file(ctx.data.project.id, version.image)}
              badge={review && version === latest ? <span className="badge now">本轮</span> : undefined}
              selected={review && version === latest}
              caption={<>
                <p className="muted">{new Date(version.at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}{version.commit ? ` · ${version.commit}` : ""}</p>
                {version.note && <p>{version.note}</p>}
              </>} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
