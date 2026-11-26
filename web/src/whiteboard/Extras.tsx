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

/** Every element, front to back: click picks one (shift adds), dragging a row restacks it, the eye hides it. */
export function Layers({ order, elements, selected, onPick, onOrder, onHide, onClose }: {
  order: string[]; elements: Record<string, Element>; selected: string[]; onPick: (id: string, add: boolean) => void;
  onOrder: (order: string[]) => void; onHide: (id: string, hidden: boolean) => void; onClose: () => void;
}) {
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<string>();
  const front = [...order].reverse();
  return (
    <aside className="wb-layers" onPointerDown={e => e.stopPropagation()}>
      <header><b>图层</b><span>{order.length}</span><button className="quiet" onClick={onClose}>×</button></header>
      <ol>
        {front.map(id => {
          const el = elements[id]!, words = wordsOf(el).split("\n")[0]!.slice(0, 40);
          return (
            <li key={id} draggable className={`${selected.includes(id) ? "on" : ""}${over === id && dragging !== id ? " over" : ""}${el.hidden ? " hidden" : ""}`}
              onClick={e => !el.hidden && onPick(id, e.shiftKey)}
              onDragStart={e => { setDragging(id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={e => { e.preventDefault(); setOver(id); }}
              onDragEnd={() => { setDragging(undefined); setOver(undefined); }}
              onDrop={e => {
                e.preventDefault();
                if (dragging && dragging !== id) {
                  // Dropped on a row, it goes just in front of it.
                  const rest = front.filter(other => other !== dragging);
                  rest.splice(rest.indexOf(id), 0, dragging);
                  onOrder(rest.reverse());
                }
                setDragging(undefined);
                setOver(undefined);
              }}>
              <span className="type">{typeNames[el.type] ?? el.type}</span>
              <span className="words">{words || <i>{id}</i>}{el.locked ? " 🔒" : ""}</span>
              <button className="eye" title={el.hidden ? "显示" : "隐藏"} onClick={e => { e.stopPropagation(); onHide(id, !el.hidden); }}>{el.hidden ? "◌" : "●"}</button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** A small pad to draw a sticker on: its lines come back in a 40 by 40 square. */
export function DrawPad({ onDone }: { onDone: (strokes: number[][]) => void }) {
  const [strokes, setStrokes] = useState<number[][]>([]);
  const drawing = useRef(false);
  const size = 160, scale = 40 / size;
  const at = (e: { clientX: number; clientY: number; currentTarget: Element }) => {
    const b = e.currentTarget.getBoundingClientRect();
    return [Math.round((e.clientX - b.left) * scale * 10) / 10, Math.round((e.clientY - b.top) * scale * 10) / 10];
  };
  return (
    <div className="draw-pad" onPointerDown={e => e.stopPropagation()}>
      <svg width={size} height={size} viewBox="0 0 40 40"
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; setStrokes([...strokes, at(e)]); }}
        onPointerMove={e => {
          if (!drawing.current) return;
          const point = at(e);
          setStrokes(all => [...all.slice(0, -1), [...all.at(-1)!, ...point]]);
        }}
        onPointerUp={() => { drawing.current = false; }}>
        {strokes.map((flat, i) => <polyline key={i} points={flat.join(" ")} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
      <div className="row">
        <button className="quiet" onClick={() => setStrokes([])}>清空</button>
        <button disabled={!strokes.length} onClick={() => onDone(strokes.filter(s => s.length >= 4))}>用这个，点哪贴哪</button>
      </div>
    </div>
  );
}

type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void;
  onresult: (event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onerror: (event: { error: string }) => void; onend: () => void };

/**
 * Speech turned into words where the person is writing. The browser does the listening: Chrome sends the sound to Google's
 * speech service, Safari to Apple's.
 */
export function dictate(onWords: (words: string) => void, onStop: (problem?: string) => void) {
  const Speech = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
  if (!Speech) { onStop("这个浏览器不能听写；macOS 自带的听写（按两下 fn）在任何文字框里都能用"); return; }
  const recognition = new Speech();
  // The board speaks Chinese: Chinese unless the browser names another Chinese.
  recognition.lang = navigator.languages.find(language => language.startsWith("zh")) ?? "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = event => {
    for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i]!.isFinal) onWords(event.results[i]![0].transcript);
  };
  recognition.onerror = event => onStop(event.error === "not-allowed" ? "没有麦克风权限" : event.error === "no-speech" ? undefined : `听写出错：${event.error}`);
  recognition.onend = () => onStop();
  recognition.start();
  return () => recognition.stop();
}
