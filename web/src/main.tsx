import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Library as LibraryData, type Loaded, ago, useLive } from "./api.ts";
import { Verify } from "./Verify.tsx";
import { Board } from "./Board.tsx";
import "./style.css";

const typeNames: Record<string, string> = { verify: "验收", board: "方案", doc: "文档", whiteboard: "白板", bench: "调参", deck: "幻灯片" };
const statusNames: Record<string, string> = { open: "等你看", answered: "已回复", passed: "已通过", rejected: "已打回", closed: "已结束" };

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const changed = () => setPath(location.pathname);
    addEventListener("popstate", changed);
    return () => removeEventListener("popstate", changed);
  }, []);
  return path;
}

export function go(path: string) {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

function Library() {
  const { value, error } = useLive<LibraryData>("/api/library");
  if (error) return <p className="empty">{error}</p>;
  if (!value) return null;
  const pages = value.flatMap(project => project.pages.map(page => ({ ...page, project }))).sort((a, b) => b.updated - a.updated);
  return (
    <main className="library">
      <h1>artti</h1>
      {pages.length === 0 && <p className="empty">还没有页面。agent 用 <code>artti new</code> 做出来的页面会出现在这里。</p>}
      <ul>
        {pages.map(page => (
          <li key={page.project.id + page.slug}>
            <a href={`/p/${page.project.id}/${encodeURIComponent(page.slug)}`} onClick={e => { e.preventDefault(); go(`/p/${page.project.id}/${encodeURIComponent(page.slug)}`); }}>
              <span className="title">{page.title}</span>
              <span className="meta">{page.project.name} · {typeNames[page.type] ?? page.type} · {ago(page.updated)}</span>
              <span className={`status ${page.status}`}>{statusNames[page.status] ?? page.status}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

function PageView({ project, slug }: { project: string; slug: string }) {
  const { value, error } = useLive<Loaded>(`/api/page/${project}/${encodeURIComponent(slug)}`, change => change.project === project && change.slug === slug);
  useEffect(() => { if (value) document.title = value.page.title; }, [value?.page.title]);
  if (error) return <p className="empty">{error}</p>;
  if (!value) return null;
  return (
    <>
      <header className="bar floating">
        <a href="/" onClick={e => { e.preventDefault(); go("/"); }}>artti</a>
        <span>{value.project.name}</span>
        <span className={`status ${value.page.status}`}>{statusNames[value.page.status] ?? value.page.status}</span>
      </header>
      {value.page.type === "verify" ? <Verify data={value} />
        : value.page.type === "board" ? <Board data={value} />
        : <p className="empty">「{typeNames[value.page.type]}」还没做好。</p>}
    </>
  );
}

function App() {
  const path = usePath();
  const match = path.match(/^\/p\/([^/]+)\/([^/]+)/u);
  return match ? <PageView project={match[1]!} slug={decodeURIComponent(match[2]!)} /> : <Library />;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
