import { useEffect, useState } from "react";
import type { Event, Page, Screen, Version } from "../../src/page.ts";

export type { Event, Page, Screen, Version };

export type Loaded = { project: { id: string; name: string }; slug: string; page: Page; events: Event[]; screens: Screen[] };
export type Library = { id: string; name: string; screens: number; pages: { slug: string; title: string; type: string; status: string; updated: number; said: number }[] }[];

const get = async <T,>(path: string) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? response.statusText);
  return (await response.json()) as T;
};

/** `path` loaded, and loaded again whenever the server says a page changed (`match` narrows which). */
export function useLive<T>(path: string, match: (change: { project: string; slug: string }) => boolean = () => true) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let stale = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => get<T>(path).then(v => !stale && (setValue(v), setError(undefined)), e => !stale && setError(String(e.message ?? e)));
    load();
    const live = new EventSource("/api/live");
    // Several files change in one write; load once they settle.
    live.onmessage = message => {
      if (!match(JSON.parse(message.data))) return;
      clearTimeout(timer);
      timer = setTimeout(load, 120);
    };
    return () => { stale = true; live.close(); clearTimeout(timer); };
  }, [path]);
  return { value, error };
}

export async function say(project: string, slug: string, event: Partial<Event>) {
  const response = await fetch(`/api/page/${project}/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? response.statusText);
  return (await response.json()) as Event;
}

/** A file under the project's .artti/ (a screen version), or a URL as is. */
export const file = (project: string, path: string) =>
  /^(https?:|data:)/u.test(path) ? path : `/files/${project}/${path.split("/").map(encodeURIComponent).join("/")}`;

/** A page's own asset, written relative to the page. */
export const asset = (project: string, slug: string, path: string) => /^(https?:|data:)/u.test(path) ? path : file(project, `${slug}/${path}`);

export function ago(at: number) {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return new Date(at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}
