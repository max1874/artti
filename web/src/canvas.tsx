// The artboard: a canvas you pan and zoom, frames on it, marks anywhere on it, and the bar that sends the round back.

import { Fragment, createContext, type PointerEvent, type ReactNode, type RefObject, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Event, type Loaded, type Screen, ago, file, say } from "./api.ts";

export type Tool = "move" | "comment";
type Camera = { x: number; y: number; z: number };

export type Ctx = { data: Loaded; send: (event: Partial<Event>) => Promise<void> };
export const useCtx = (data: Loaded): Ctx => ({ data, send: async event => { await say(data.project.id, data.slug, event); } });

type Spot = NonNullable<Event["spot"]>;
/** The comment being written: where, and whether the mark is still being dragged out. One at a time on the whole board. */
type Draft = { target: string; spot: Spot; marking?: boolean };

const Board = createContext<{
  tool: Tool; z: number; ctx: Ctx;
  draft?: Draft; setDraft: (draft?: Draft) => void; open?: string; setOpen: (id?: string) => void;
}>(null!);

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
  const [draft, setDraft] = useState<Draft>();
  const [open, setOpen] = useState<string>();
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
      if (event.key === "Escape") { setDraft(undefined); setTool("move"); }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    addEventListener("keydown", key);
    return () => { element.removeEventListener("wheel", wheel); removeEventListener("keydown", key); };
  }, []);

  const drag = useRef<{ x: number; y: number } | null>(null);
  return (
    <Board.Provider value={{ tool, z: camera.z, ctx, draft, setDraft, open, setOpen }}>
      <div ref={viewport} className={`viewport ${tool}`}
        onPointerDown={event => {
          if (interactive(event.target)) return;
          if (tool === "comment") {
            // On a screen, the frame takes it; anywhere else, a note on the board itself.
            if ((event.target as Element).closest(".fbody")) return;
            const box = viewport.current!.getBoundingClientRect();
            setOpen(undefined);
            // Written once the button is up: a box focused on the press loses focus to the release.
            setDraft({ target: "board", spot: { x: (event.clientX - box.left - camera.x) / camera.z, y: (event.clientY - box.top - camera.y) / camera.z }, marking: true });
            return;
          }
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
        onPointerUp={() => {
          drag.current = null;
          if (draft?.target === "board" && draft.marking) setDraft({ target: "board", spot: draft.spot });
        }}>
        <div ref={world} className="world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})` }}>
          {children}
          <Pins target="board" px />
        </div>
      </div>
      <div className="tools">
        <button className={tool === "move" ? "on" : ""} title="移动（V）" onClick={() => setTool("move")}>移动</button>
        {!readOnly && <button className={tool === "comment" ? "on" : ""} title="点一下或拖一个框，说这里怎么改（C）" onClick={() => setTool("comment")}>评论</button>}
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

/** One frame: a header, an image or a page (both as URLs), and the marks on it. */
export function Frame({ target, title, lead, badge, actions, image, html, caption, selected }: {
  target: string; title: string; lead?: ReactNode; badge?: ReactNode; actions?: ReactNode;
  image?: string; html?: string; caption?: ReactNode; selected?: boolean;
}) {
  const { tool, setDraft, setOpen } = useContext(Board);
  const [width, setWidth] = useState(640);
  const [expanded, setExpanded] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number }>(null);
  const src = image ?? html;
  const at = (event: PointerEvent) => {
    const box = body.current!.getBoundingClientRect();
    return { x: clamp((event.clientX - box.left) / box.width, 0, 1), y: clamp((event.clientY - box.top) / box.height, 0, 1) };
  };
  const span = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
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
      <div ref={body} className="fbody"
        onPointerDown={event => {
          if (tool !== "comment" || interactive(event.target)) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          start.current = at(event);
          setOpen(undefined);
          setDraft({ target, spot: start.current, marking: true });
        }}
        onPointerMove={event => { if (start.current) setDraft({ target, spot: span(start.current, at(event)), marking: true }); }}
        onPointerUp={event => {
          const from = start.current;
          if (!from) return;
          start.current = null;
          const box = span(from, at(event));
          const shown = body.current!.getBoundingClientRect();
          // A drag marks an area; a click, a point.
          setDraft({ target, spot: box.w * shown.width > 8 || box.h * shown.height > 8 ? box : from });
        }}>
        {image && <img ref={picture} src={src} alt={title} draggable={false} onLoad={e => setWidth(clamp(e.currentTarget.naturalWidth / 2, 280, 900))} />}
        {html && <iframe src={src} title={title} sandbox="allow-scripts" style={{ pointerEvents: tool === "comment" ? "none" : "auto" }} />}
        <Pins target={target} picture={image ? picture : undefined} />
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

/** On a frame a spot is a fraction of it; on the board, pixels of the board. */
const pos = (value: number, px?: boolean) => px ? `${value}px` : `${value * 100}%`;

/** The comments marked on one target, the one being written, and the open one's conversation. */
function Pins({ target, px, picture }: { target: string; px?: boolean; picture?: RefObject<HTMLImageElement | null> }) {
  const { z, ctx, draft, setDraft, open, setOpen } = useContext(Board);
  const pins = ctx.data.events.filter(e => e.kind === "comment" && e.target === target && e.spot);
  const mine = draft?.target === target ? draft : undefined;
  const shown = pins.find(pin => pin.id === open);
  return (
    <>
      {pins.map((pin, i) => (
        <Mark key={pin.id} spot={pin.spot!} n={i + 1} z={z} px={px} onClick={() => { setDraft(undefined); setOpen(open === pin.id ? undefined : pin.id); }} />
      ))}
      {mine && <Mark spot={mine.spot} n={pins.length + 1} z={z} px={px} draft />}
      {mine && !mine.marking && (
        <Popover spot={mine.spot} z={z} px={px}>
          <CommentBox placeholder={mine.spot.w ? "这块怎么改…" : "这里怎么改…"} autoFocus onCancel={() => setDraft(undefined)}
            onSend={async text => {
              await ctx.send({ kind: "comment", target, spot: mine.spot, text, crop: picture?.current ? cropOf(picture.current, mine.spot) : undefined });
              setDraft(undefined);
            }} />
        </Popover>
      )}
      {shown && (
        <Popover spot={shown.spot!} z={z} px={px}>
          <Conversation ctx={ctx} comment={shown} />
          <button className="quiet close" onClick={() => setOpen(undefined)}>关闭</button>
        </Popover>
      )}
    </>
  );
}

/** A numbered pin at a point, or at the corner of the area it marks. */
function Mark({ spot, n, z, px, draft, onClick }: { spot: Spot; n: number; z: number; px?: boolean; draft?: boolean; onClick?: () => void }) {
  return (
    <>
      {spot.w !== undefined && <span className={`mark${draft ? " draft" : ""}`}
        style={{ left: pos(spot.x, px), top: pos(spot.y, px), width: pos(spot.w, px), height: pos(spot.h ?? 0, px), borderWidth: 2 / z }} />}
      <button className={`pin${draft ? " draft" : ""}`} onClick={onClick}
        style={{ left: pos(spot.x, px), top: pos(spot.y, px), transform: `translate(-50%, -50%) scale(${1 / z})` }}>{n}</button>
    </>
  );
}

/** Kept at reading size whatever the zoom, beside the spot it is about. */
function Popover({ spot, z, px, children }: { spot: Spot; z: number; px?: boolean; children: ReactNode }) {
  return (
    <div className="popover" style={{ left: pos(spot.x + (spot.w ?? 0), px), top: pos(spot.y, px), transform: `translate(16px, -12px) scale(${1 / z})` }}
      onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      {children}
    </div>
  );
}

/** The marked spot cut out of the image with some of what surrounds it, the mark drawn on: what the agent looks at. */
function cropOf(image: HTMLImageElement, spot: Spot) {
  const W = image.naturalWidth, H = image.naturalHeight;
  const x = spot.x * W, y = spot.y * H, w = (spot.w ?? 0) * W, h = (spot.h ?? 0) * H;
  // A point says little on its own: show more around it than around an area.
  const pad = w || h ? Math.max(w, h) * 0.4 + W * 0.08 : W * 0.18;
  const left = clamp(x - pad, 0, W), top = clamp(y - pad, 0, H);
  const canvas = document.createElement("canvas");
  canvas.width = clamp(x + w + pad, 0, W) - left;
  canvas.height = clamp(y + h + pad, 0, H) - top;
  const g = canvas.getContext("2d")!;
  g.drawImage(image, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  g.strokeStyle = "#e5484d";
  g.lineWidth = Math.max(3, W / 500);
  if (w) g.strokeRect(x - left, y - top, w, h);
  else {
    g.beginPath();
    g.arc(x - left, y - top, W / 70, 0, Math.PI * 2);
    g.stroke();
  }
  return canvas.toDataURL("image/png");
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
