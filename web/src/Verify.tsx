// Work is built; is it right? The screens it produced, what was checked by running something, and what was not.

import { useState } from "react";
import type { Loaded } from "./api.ts";
import { Pinnable, SubmitBar, Thread, Verdicts, useCtx, verdictsOf } from "./parts.tsx";

export function Verify({ data }: { data: Loaded }) {
  const ctx = useCtx(data);
  const { page } = data;
  const screens = page.screens ?? [];
  const claims = page.claims ?? [];
  const unverified = page.unverified ?? [];
  const targets = [...screens.map(s => `screens/${s.id}`), ...claims.map(c => `claims/${c.id}`), ...unverified.map(u => `unverified/${u.id}`)];
  const decided = verdictsOf(data.events);
  return (
    <main className="page verify">
      <h1>{page.title}</h1>
      {page.summary && <p className="summary">{page.summary}</p>}

      {unverified.length > 0 && (
        <section>
          <h2>没验证到的<small>先看这里：这些没有证据</small></h2>
          {unverified.map(item => (
            <article key={item.id} className="item gap">
              <div className="text">
                <p>{item.text}</p>
                {item.why && <p className="why">{item.why}</p>}
              </div>
              <Verdicts ctx={ctx} target={`unverified/${item.id}`} labels={["接受", "要补上"]} />
              <Thread ctx={ctx} target={`unverified/${item.id}`} />
            </article>
          ))}
        </section>
      )}

      {screens.length > 0 && (
        <section>
          <h2>画面<small>点图上任意位置，就地评论</small></h2>
          {screens.map((screen, i) => (
            <article key={screen.id} className="item screen">
              <div className={screen.before ? "pair" : "single"}>
                {screen.before && (
                  <div><span className="tag">改前</span><Pinnable ctx={ctx} target={`screens/${screen.id}/before`} src={screen.before} alt="改前" /></div>
                )}
                <div>{screen.before && <span className="tag">改后</span>}<Pinnable ctx={ctx} target={`screens/${screen.id}`} src={screen.image} alt={screen.observed ?? `画面 ${i + 1}`} /></div>
              </div>
              <dl className="caption">
                {screen.scenario && <><dt>做了什么</dt><dd>{screen.scenario}</dd></>}
                {screen.observed && <><dt>看到什么</dt><dd>{screen.observed}</dd></>}
                {screen.environment && <><dt>在哪里</dt><dd>{screen.environment}</dd></>}
              </dl>
              <Verdicts ctx={ctx} target={`screens/${screen.id}`} labels={["通过", "打回"]} />
              <Thread ctx={ctx} target={`screens/${screen.id}`} />
              {screen.before && <Thread ctx={ctx} target={`screens/${screen.id}/before`} />}
            </article>
          ))}
        </section>
      )}

      {claims.length > 0 && (
        <section>
          <h2>验证过的<small>每条都实际跑过</small></h2>
          {claims.map(claim => <Claim key={claim.id} ctx={ctx} claim={claim} />)}
        </section>
      )}

      <SubmitBar ctx={ctx} ready={targets.filter(t => decided.has(t)).length} total={targets.length} />
    </main>
  );
}

function Claim({ ctx, claim }: { ctx: ReturnType<typeof useCtx>; claim: { id: string; text: string; evidence?: string } }) {
  const [showing, setShowing] = useState(false);
  return (
    <article className="item claim">
      <div className="text">
        <p>{claim.text}</p>
        {claim.evidence && <button className="quiet" onClick={() => setShowing(!showing)}>{showing ? "收起输出" : "看原始输出"}</button>}
        {showing && <pre>{claim.evidence}</pre>}
      </div>
      <Verdicts ctx={ctx} target={`claims/${claim.id}`} labels={["通过", "不信"]} />
      <Thread ctx={ctx} target={`claims/${claim.id}`} />
    </article>
  );
}
