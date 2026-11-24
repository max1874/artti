// Every screen of a project with all its versions: how the interface got to where it is.

import { type Screen, useLive } from "./api.ts";
import { Canvas, Group, ScreenRow } from "./canvas.tsx";

export function Screens({ project }: { project: string }) {
  const { value, error } = useLive<{ project: { id: string; name: string }; screens: Screen[] }>(`/api/screens/${project}`, change => change.project === project);
  if (error) return <p className="empty">{error}</p>;
  if (!value) return null;
  // Nothing is said here; comments belong to a round of review.
  const ctx = { data: { project: value.project, slug: "", page: { type: "verify", title: "", status: "open", created: 0, updated: 0 }, events: [], screens: value.screens } as never, send: async () => {} };
  return (
    <Canvas ctx={ctx} readOnly>
      <Group chip="画面" title={`${value.project.name} 的每个画面`} rows>
        {value.screens.map(screen => <ScreenRow key={screen.id} ctx={ctx} screen={screen} />)}
      </Group>
    </Canvas>
  );
}
