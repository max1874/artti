// One element drawn on the board, at its place in board units.

import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from "react";
import { type Element, fill, fontSize, ink } from "./model.ts";

/** The outline of a block of `kind`, `w` by `h`. */
export function outline(kind: unknown, w: number, h: number): ReactNode {
  switch (kind) {
    case "rect": return <rect x={1} y={1} width={w - 2} height={h - 2} />;
    case "pill": return <rect x={1} y={1} width={w - 2} height={h - 2} rx={Math.min(w, h) / 2} />;
    case "ellipse": return <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 1} ry={h / 2 - 1} />;
    case "diamond": return <polygon points={`${w / 2},1 ${w - 1},${h / 2} ${w / 2},${h - 1} 1,${h / 2}`} />;
    case "hexagon": {
      const i = Math.min(w * 0.22, h * 0.5);
      return <polygon points={`${i},1 ${w - i},1 ${w - 1},${h / 2} ${w - i},${h - 1} ${i},${h - 1} 1,${h / 2}`} />;
    }
    case "parallelogram": {
      const i = Math.min(w * 0.2, h * 0.6);
      return <polygon points={`${i},1 ${w - 1},1 ${w - i},${h - 1} 1,${h - 1}`} />;
    }
    case "database": {
      const e = Math.min(h * 0.14, w * 0.25, 22), r = w / 2 - 1;
      return <>
        <path d={`M1,${e} A${r},${e} 0 0 1 ${w - 1},${e} V${h - e} A${r},${e} 0 0 1 1,${h - e} Z`} />
        <path d={`M1,${e} A${r},${e} 0 0 0 ${w - 1},${e}`} fill="none" />
      </>;
    }
    case "queue": {
      const e = Math.min(w * 0.12, h * 0.25, 22), r = h / 2 - 1;
      return <>
        <path d={`M${e},1 H${w - e} A${e},${r} 0 0 1 ${w - e},${h - 1} H${e} A${e},${r} 0 0 1 ${e},1 Z`} />
        <path d={`M${w - e},1 A${e},${r} 0 0 0 ${w - e},${h - 1}`} fill="none" />
      </>;
    }
    case "document": {
      const a = Math.min(h * 0.1, 14);
      return <path d={`M1,1 H${w - 1} V${h - a * 1.5} Q${w * 0.75},${h - a * 3.5} ${w / 2},${h - a * 1.5} T1,${h - a * 1.5} Z`} />;
    }
    // Drawn in a box of their own and stretched, the line kept its width.
    case "cloud": return (
      <svg viewBox="0 0 100 64" preserveAspectRatio="none" width={w} height={h} overflow="visible">
        <path vectorEffect="non-scaling-stroke" d="M24,61 C9,61 2,48 11,39 C4,27 17,15 30,20 C34,6 56,2 63,15 C73,6 91,13 89,28 C100,31 100,52 87,57 C84,61 79,61 75,61 Z" />
      </svg>
    );
    case "person": return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width={w} height={h} overflow="visible">
        <circle vectorEffect="non-scaling-stroke" cx={50} cy={28} r={20} />
        <path vectorEffect="non-scaling-stroke" d="M12,98 C12,66 28,54 50,54 C72,54 88,66 88,98 Z" />
      </svg>
    );
    default: return <rect x={1} y={1} width={w - 2} height={h - 2} rx={Math.min(16, w / 4, h / 4)} />;
  }
}

/** Text as written: lines, "- " and "1. " list items, **bold**, *italic*, `code` and [links](https://…). */
export function Rich({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/u).map((part, i) => {
    if (part.startsWith("***")) return <b key={i}><i>{part.slice(3, -3)}</i></b>;
    if (part.startsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.length > 2) return <i key={i}>{part.slice(1, -1)}</i>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/u);
    return link ? <a key={i} href={link[2]} target="_blank" rel="noreferrer" onPointerDown={e => e.stopPropagation()}>{link[1]}</a> : part;
  });
  return <>{text.split("\n").map((line, i) => {
    const item = line.match(/^(- |\d+\. )(.*)$/u);
    return <div key={i} className={item ? "li" : undefined}>{item ? <><span className="bullet">{item[1] === "- " ? "•" : item[1]}</span>{inline(item[2]!)}</> : line ? inline(line) : "​"}</div>;
  })}</>;
}

/** Words being written in place; done on leaving, Escape or ⌘↩. */
export function Editable({ text, onDone, className, style }: { text: string; onDone: (text: string) => void; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current!;
    node.innerText = text;
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  }, []);
  return (
    <div ref={ref} className={`editable ${className ?? ""}`} style={style} contentEditable="plaintext-only" suppressContentEditableWarning
      onBlur={event => onDone(event.currentTarget.innerText.replace(/\n$/u, ""))}
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) { event.preventDefault(); event.currentTarget.blur(); }
      }} />
  );
}

export function ElementView({ id, el, selected, editing, onText }: {
  id: string; el: Element; selected: boolean; editing: boolean; onText: (text: string) => void;
}) {
  const text = typeof el.text === "string" ? el.text : "";
  const words = (size: number, style?: CSSProperties) => editing
    ? <Editable text={text} onDone={onText} style={{ fontSize: size, textAlign: (el.textAlign as CSSProperties["textAlign"]) ?? undefined, ...style }} />
    : text ? <Rich text={text} /> : null;
  const box: CSSProperties = { left: el.x, top: el.y, width: el.w, height: el.h };
  const state = `${selected ? " selected" : ""}${el.locked ? " locked" : ""}`;
  switch (el.type) {
    case "shape": {
      const w = el.w ?? 200, h = el.h ?? 120, size = fontSize(el, 15);
      return (
        <div data-id={id} className={`el shape${state}`} style={box}>
          <svg className="outline" width={w} height={h} overflow="visible"
            fill={el.hollow ? "none" : fill(el.color)} stroke={el.stroke ? ink(el.stroke) : el.hollow ? ink("ink") : "none"} strokeWidth={2}>
            {outline(el.kind, w, h)}
          </svg>
          <div className="words" style={{ fontSize: size, textAlign: (el.textAlign as CSSProperties["textAlign"]) ?? "center" }}>
            {words(size)}
          </div>
        </div>
      );
    }
    case "note": return (
      <div data-id={id} className={`el note${state}`} style={{ ...box, width: el.w ?? 200, height: el.h ?? 200, background: fill(el.color, "yellow") }}>
        <div className="words" style={{ fontSize: fontSize(el) }}>{words(fontSize(el))}</div>
      </div>
    );
    case "container": return (
      <div data-id={id} className={`el container${state}`} style={box}>
        <div className="section-box" style={{ background: `color-mix(in srgb, ${fill(el.color, "white")} 45%, transparent)` }} />
        <div className="section-title">{editing ? <Editable text={text} onDone={onText} /> : text || "分区"}</div>
      </div>
    );
    case "text": {
      const size = fontSize(el);
      const placeholder = typeof el.placeholder === "string" && !text && !editing;
      return (
        <div data-id={id} data-measure className={`el text${state}${placeholder ? " placeholder" : ""}`}
          style={{ left: el.x, top: el.y, width: typeof el.wrap === "number" ? el.wrap : undefined, whiteSpace: typeof el.wrap === "number" ? "pre-wrap" : "pre",
            fontSize: size, color: ink(el.color), textAlign: (el.textAlign as CSSProperties["textAlign"]) ?? "left", fontWeight: size >= 28 ? 650 : undefined }}>
          {placeholder ? el.placeholder as string : words(size, { minWidth: 8 })}
        </div>
      );
    }
    case "image": return (
      <div data-id={id} className={`el image${state}`} style={box}>
        <img src={String(el.src).startsWith("_blob/") ? `/${el.src}` : String(el.src)} alt="" draggable={false} />
      </div>
    );
    // The rest of the set arrives in later steps of docs/whiteboard.md; until then each shows where it is.
    default: return <div data-id={id} className={`el pending${state}`} style={{ ...box, width: el.w ?? 160, height: el.h ?? 60 }}>{el.type}</div>;
  }
}
