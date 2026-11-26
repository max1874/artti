// What sits around the board rather than on it: the countdown, find, the layers list, and taking the board away as a file.

import { useEffect, useRef, useState } from "react";
import { type Element, type Timer as Countdown, wordsOf } from "./model.ts";

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The board's one countdown: start, pause and resume, stop. */
export function Timer({ timer, set }: { timer?: Countdown; set: (timer: Countdown | null) => void }) {
  const [, tick] = useState(0);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!timer?.ends) return;
    const id = setInterval(() => tick(n => n + 1), 500);
    return () => clearInterval(id);
  }, [timer?.ends]);
  if (!timer) return (
    <span className="menu-wrap">
      <button title="计时" onClick={() => setMenu(!menu)}>计时</button>
      {menu && <span className="menu">{[3, 5, 10, 15].map(m => (
        <button key={m} onClick={() => { set({ ends: Date.now() + m * 60_000 }); setMenu(false); }}>{m} 分钟</button>
      ))}</span>}
    </span>
  );
  const left = timer.ends ? timer.ends - Date.now() : timer.left ?? 0;
  return (
    <span className={`timer${left <= 0 ? " over" : ""}`}>
      <button title={timer.ends ? "暂停" : "继续"} onClick={() => set(timer.ends ? { left: Math.max(0, left) } : { ends: Date.now() + left })}>
        {left <= 0 ? "时间到" : clock(left)}{!timer.ends && left > 0 && " ⏸"}
      </button>
      <button title="停止" onClick={() => set(null)}>×</button>
    </span>
  );
}

/** Find words on the board: each Enter goes to the next element that has them. */
export function Find({ find, onGo, onClose }: { find: (query: string) => string[]; onGo: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const found = query.trim() ? find(query.trim()) : [];
  const go = (step: number) => {
    if (!found.length) return;
    const next = (at + step + found.length) % found.length;
    setAt(next);
    onGo(found[next]!);
  };
  return (
    <div className="wb-find" onPointerDown={e => e.stopPropagation()}>
      <input ref={input} value={query} placeholder="在白板上找…"
        onChange={e => { setQuery(e.target.value); setAt(-1); }}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
          if (e.key === "Escape") onClose();
        }} />
      <span className="count">{query.trim() ? found.length ? `${Math.max(at, 0) + 1}/${found.length}` : "没有" : ""}</span>
      <button className="quiet" onClick={onClose}>×</button>
    </div>
  );
}

/** Saves a file the browser was handed. */
export function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  if (href.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(href), 1000);
}

const typeNames: Record<string, string> = {
  shape: "形状", note: "便签", container: "分区", text: "文字", stroke: "笔画", arrow: "箭头", image: "图片", html: "网页", table: "表格", link: "链接", sticker: "贴纸",
};

/** Every element, front to back: click picks one, shift-click adds or removes it. */
export function Layers({ order, elements, selected, onPick, onClose }: {
  order: string[]; elements: Record<string, Element>; selected: string[]; onPick: (id: string, add: boolean) => void; onClose: () => void;
}) {
  return (
    <aside className="wb-layers" onPointerDown={e => e.stopPropagation()}>
      <header><b>图层</b><span>{order.length}</span><button className="quiet" onClick={onClose}>×</button></header>
      <ol>
        {[...order].reverse().map(id => {
          const el = elements[id]!, words = wordsOf(el).split("\n")[0]!.slice(0, 40);
          return (
            <li key={id} className={selected.includes(id) ? "on" : undefined} onClick={e => onPick(id, e.shiftKey)}>
              <span className="type">{typeNames[el.type] ?? el.type}</span>{words || <i>{id}</i>}{el.locked ? " 🔒" : ""}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
