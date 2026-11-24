// A round of review: each screen the work changed, as a row of its versions, the newest under review; what could not be
// checked sits beside them as a note.

import type { Loaded } from "./api.ts";
import { Canvas, Group, RoundBar, ScreenRow, useCtx, verdictsOf } from "./canvas.tsx";

export function Verify({ data }: { data: Loaded }) {
  const ctx = useCtx(data);
  const { page } = data;
  const decided = verdictsOf(data.events);
  const count = data.screens.filter(s => decided.has(`screens/${s.id}`)).length;
  return (
    <Canvas ctx={ctx} bar={<RoundBar ctx={ctx} progress={`${count}/${data.screens.length} 已表态`} ready={count > 0} />}>
      <Group chip="验收" title={page.title} note={page.summary} rows>
        {(page.unverified?.length ?? 0) > 0 && (
          <div className="sticky">
            <b>没验证到的</b>
            {page.unverified!.map(item => <p key={item.id}>{item.text}{item.why && <span className="why">：{item.why}</span>}</p>)}
          </div>
        )}
        {data.screens.map(screen => <ScreenRow key={screen.id} ctx={ctx} screen={screen} review />)}
      </Group>
    </Canvas>
  );
}
