// More than one way it could look: every option side by side, the recommended one marked; the person picks one.

import type { Loaded } from "./api.ts";
import { asset } from "./api.ts";
import { Pinnable, SubmitBar, Thread, useCtx } from "./parts.tsx";

export function Board({ data }: { data: Loaded }) {
  const ctx = useCtx(data);
  const { page } = data;
  const options = page.options ?? [];
  const picked = data.events.findLast(e => e.kind === "pick")?.target?.split("/")[1];
  return (
    <main className="page board">
      <h1>{page.title}</h1>
      {(page.question || page.summary) && <p className="summary">{page.question ?? page.summary}</p>}
      <div className="options" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))` }}>
        {options.map(option => (
          <article key={option.id} className={`option${picked === option.id ? " picked" : ""}`}>
            <header>
              <h3>{option.title}</h3>
              {option.recommended && <span className="badge">推荐</span>}
            </header>
            {option.image && <Pinnable ctx={ctx} target={`options/${option.id}`} src={option.image} alt={option.title} />}
            {option.html && <iframe className="option-html" src={asset(data.project.id, data.slug, option.html)} title={option.title} sandbox="allow-scripts" />}
            {option.note && <p className="note">{option.note}</p>}
            <button className={picked === option.id ? "primary" : "secondary"}
              onClick={() => ctx.send({ kind: "pick", target: picked === option.id ? undefined : `options/${option.id}` })}>
              {picked === option.id ? "已选这个" : "选这个"}
            </button>
            <Thread ctx={ctx} target={`options/${option.id}`} />
          </article>
        ))}
      </div>
      <SubmitBar ctx={ctx} ready={picked ? 1 : 0} total={1}>{picked ? `选了「${options.find(o => o.id === picked)?.title}」` : "还没选"}</SubmitBar>
    </main>
  );
}
