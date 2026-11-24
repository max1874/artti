// More than one way it could look: every option a frame side by side, the recommended one marked, the agent's reasoning
// on a sticky note; the person picks one.

import { type Loaded, asset } from "./api.ts";
import { Canvas, Frame, Group, RoundBar, useCtx } from "./canvas.tsx";

export function Board({ data }: { data: Loaded }) {
  const ctx = useCtx(data);
  const { page } = data;
  const options = page.options ?? [];
  const picked = data.events.findLast(e => e.kind === "pick")?.target?.split("/")[1];
  const pick = (id: string) => ctx.send({ kind: "pick", target: picked === id ? undefined : `options/${id}` });
  const chosen = options.find(o => o.id === picked);
  return (
    <Canvas ctx={ctx} bar={<RoundBar ctx={ctx} progress={chosen ? `选了「${chosen.title}」` : "还没选"} ready={!!chosen} />}>
      <Group chip="方案" title={page.question ?? page.title}>
        {options.map(option => (
          <Frame key={option.id} target={`options/${option.id}`} title={option.title}
            image={option.image && asset(data.project.id, data.slug, option.image)} html={option.html && asset(data.project.id, data.slug, option.html)}
            selected={picked === option.id}
            lead={<button className={`radio${picked === option.id ? " on" : ""}`} aria-label={`选「${option.title}」`} onClick={() => pick(option.id)} />}
            badge={option.recommended ? <span className="badge">推荐</span> : undefined}
            caption={option.note ? <p>{option.note}</p> : undefined} />
        ))}
      </Group>
      {page.summary && <div className="sticky">{page.summary}</div>}
    </Canvas>
  );
}
