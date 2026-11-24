// Work is built; is it right? On the board: the report of what was and was not checked, then each screen as a frame,
// a changed screen as its before and after side by side, each with its verdict.

import { useState } from "react";
import type { Loaded } from "./api.ts";
import { Canvas, type Ctx, Frame, Group, RoundBar, RowComments, Verdicts, useCtx, verdictsOf } from "./canvas.tsx";

export function Verify({ data }: { data: Loaded }) {
  const ctx = useCtx(data);
  const { page } = data;
  const screens = page.screens ?? [];
  const claims = page.claims ?? [];
  const unverified = page.unverified ?? [];
  const targets = [...unverified.map(u => `unverified/${u.id}`), ...screens.map(s => `screens/${s.id}`), ...claims.map(c => `claims/${c.id}`)];
  const decided = verdictsOf(data.events);
  const count = targets.filter(t => decided.has(t)).length;
  return (
    <Canvas ctx={ctx} bar={<RoundBar ctx={ctx} progress={`${count}/${targets.length} 已表态`} ready={count > 0} />}>
      <Group chip="验收" title={page.title} note={page.summary}>
        {(claims.length > 0 || unverified.length > 0) && <Report ctx={ctx} />}
        {screens.map((screen, i) => {
          const target = `screens/${screen.id}`;
          const title = screen.title ?? `画面 ${i + 1}`;
          const caption = (screen.observed || screen.scenario || screen.environment) && (
            <>
              {screen.observed && <p>{screen.observed}</p>}
              {screen.scenario && <p className="muted">做了：{screen.scenario}</p>}
              {screen.environment && <p className="muted">在：{screen.environment}</p>}
            </>
          );
          const verdict = <Verdicts ctx={ctx} target={target} labels={["通过", "打回"]} />;
          if (!screen.before) return <Frame key={screen.id} target={target} title={title} image={screen.image} actions={verdict} caption={caption} />;
          return (
            <div key={screen.id} className="pair">
              <div className="pair-head"><span>{title}</span><span className="muted">改前 → 改后</span><span className="fill" />{verdict}</div>
              <div className="pair-frames">
                <Frame target={`${target}/before`} title="改前" image={screen.before} />
                <Frame target={target} title="改后" image={screen.image} caption={caption} />
              </div>
            </div>
          );
        })}
      </Group>
    </Canvas>
  );
}

/** What could not be checked comes first: those items have no evidence. */
function Report({ ctx }: { ctx: Ctx }) {
  const { page } = ctx.data;
  return (
    <div className="frame report">
      <header><span className="ftitle">验证报告</span></header>
      <div className="report-body">
        {(page.unverified?.length ?? 0) > 0 && <h3>没验证到的</h3>}
        {page.unverified?.map(item => (
          <div key={item.id} className="rrow gap">
            <p className="rtext">{item.text}</p>
            {item.why && <p className="muted">{item.why}</p>}
            <div className="ractions"><Verdicts ctx={ctx} target={`unverified/${item.id}`} labels={["接受", "要补上"]} /></div>
            <RowComments ctx={ctx} target={`unverified/${item.id}`} />
          </div>
        ))}
        {(page.claims?.length ?? 0) > 0 && <h3>验证过的</h3>}
        {page.claims?.map(claim => <ClaimRow key={claim.id} ctx={ctx} claim={claim} />)}
      </div>
    </div>
  );
}

function ClaimRow({ ctx, claim }: { ctx: Ctx; claim: { id: string; text: string; evidence?: string } }) {
  const [showing, setShowing] = useState(false);
  return (
    <div className="rrow">
      <p className="rtext">{claim.text}</p>
      <div className="ractions">
        <Verdicts ctx={ctx} target={`claims/${claim.id}`} labels={["通过", "不信"]} />
        {claim.evidence && <button className="quiet" onClick={() => setShowing(!showing)}>{showing ? "收起输出" : "原始输出"}</button>}
      </div>
      {showing && <pre>{claim.evidence}</pre>}
      <RowComments ctx={ctx} target={`claims/${claim.id}`} />
    </div>
  );
}
