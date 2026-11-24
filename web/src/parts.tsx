// Pieces every page type answers with: verdict buttons, comments with the agent's replies, an image you can pin a comment on,
// and the bar that sends the answer back.

import { type ReactNode, useRef, useState } from "react";
import { type Event, type Loaded, ago, asset, say } from "./api.ts";

export type Ctx = { data: Loaded; send: (event: Partial<Event>) => Promise<void> };

export function useCtx(data: Loaded): Ctx {
  return { data, send: async event => { await say(data.project.id, data.slug, event); } };
}

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

export function Verdicts({ ctx, target, labels }: { ctx: Ctx; target: string; labels: [pass: string, reject: string, waive?: string] }) {
  const current = verdictsOf(ctx.data.events).get(target);
  const choices = [["pass", labels[0]], ["reject", labels[1]], ...(labels[2] ? [["waive", labels[2]]] : [])] as const;
  return (
    <div className="verdicts" role="group">
      {choices.map(([value, label]) => (
        <button key={value} className={`verdict ${value}${current === value ? " on" : ""}`} aria-pressed={current === value}
          onClick={() => ctx.send({ kind: "verdict", target, value: current === value ? "" : value })}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** A spot on an image, as fractions of its width and height. */
type Spot = { x: number; y: number };

export function Pinnable({ ctx, target, src, alt }: { ctx: Ctx; target: string; src: string; alt: string }) {
  const [draft, setDraft] = useState<Spot>();
  const image = useRef<HTMLImageElement>(null);
  const pins = ctx.data.events.filter(e => e.kind === "comment" && e.target === target && e.spot);
  return (
    <figure className="pinnable">
      <div className="frame">
        <img ref={image} src={asset(ctx.data.project.id, ctx.data.slug, src)} alt={alt} loading="lazy"
          onClick={event => {
            const box = image.current!.getBoundingClientRect();
            setDraft({ x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height });
          }} />
        {pins.map((pin, i) => <span key={pin.id} className="pin" style={{ left: `${pin.spot!.x * 100}%`, top: `${pin.spot!.y * 100}%` }}>{i + 1}</span>)}
        {draft && <span className="pin draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }}>{pins.length + 1}</span>}
      </div>
      {draft && <CommentBox placeholder="这里怎么了…" autoFocus onCancel={() => setDraft(undefined)}
        onSend={async text => { await ctx.send({ kind: "comment", target, spot: draft, text }); setDraft(undefined); }} />}
    </figure>
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

/** Comments on one target, numbered like their pins, each followed by the agent's replies. */
export function Thread({ ctx, target, open }: { ctx: Ctx; target: string; open?: boolean }) {
  const [adding, setAdding] = useState(false);
  const events = ctx.data.events;
  const comments = events.filter(e => e.kind === "comment" && e.target === target);
  let pin = 0;
  return (
    <div className="thread">
      {comments.map(comment => (
        <div key={comment.id} className="comment">
          <p>{comment.spot && <span className="pin inline">{++pin}</span>}{comment.text}<time>{ago(comment.at)}</time></p>
          {events.filter(e => e.kind === "reply" && e.to === comment.id).map(reply => (
            <p key={reply.id} className="reply"><b>agent</b>{reply.text}<time>{ago(reply.at)}</time></p>
          ))}
        </div>
      ))}
      {adding || open
        ? <CommentBox placeholder="说点什么…" autoFocus={adding} onCancel={open ? undefined : () => setAdding(false)}
            onSend={async text => { await ctx.send({ kind: "comment", target, text }); setAdding(false); }} />
        : <button className="quiet add" onClick={() => setAdding(true)}>评论</button>}
    </div>
  );
}

/** Sends this round to the agent. `ready` counts the items the person has answered. */
export function SubmitBar({ ctx, ready, total, children }: { ctx: Ctx; ready: number; total: number; children?: ReactNode }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const events = ctx.data.events;
  const lastSubmit = events.findLastIndex(e => e.kind === "submit");
  const since = events.slice(lastSubmit + 1).filter(e => e.by === "human").length;
  const waiting = lastSubmit >= 0 && since === 0;
  return (
    <div className="submit-bar">
      <div className="inner">
        <span className="progress">{children ?? `${ready}/${total} 已表态`}</span>
        {waiting
          ? <span className="sent">已提交 · {ago(events[lastSubmit]!.at)}，agent 会接着处理</span>
          : <>
              <input value={text} placeholder="总的意见（可不填）" onChange={e => setText(e.target.value)} />
              <button className="primary" disabled={sending || (ready === 0 && !text.trim() && since === 0)}
                onClick={async () => {
                  setSending(true);
                  try { await ctx.send({ kind: "submit", text: text.trim() || undefined }); setText(""); } finally { setSending(false); }
                }}>提交给 agent</button>
            </>}
      </div>
    </div>
  );
}
