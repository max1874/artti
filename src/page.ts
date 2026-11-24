// The format of a page: what an agent writes (page.json) and what was said on it (feedback.jsonl). docs/design.md.

export const types = ["verify", "board", "doc", "whiteboard", "bench", "deck"] as const;
export type Type = (typeof types)[number];

export type Status = "open" | "answered" | "passed" | "rejected" | "closed";

export type Page = {
  type: Type;
  title: string;
  summary?: string;
  status: Status;
  created: number;
  updated: number;
} & Partial<VerifyBody & BoardBody>;

/**
 * One screen of the product, with every version it has had, oldest first: `.artti/screens/<id>/screen.json`, its images in
 * `assets/` beside it. `artti shot` adds a version.
 */
export type Screen = { id: string; title: string; versions: Version[] };

export type Version = {
  /** 1, 2, 3… within the screen. */
  n: number;
  /** A path inside `.artti/`, or a URL once a storage backend has moved it. */
  image: string;
  at: number;
  /** What this version is, e.g. "字号升级" or "复杂留给系统"; defaults to the commit. */
  label?: string;
  commit?: string;
  /** What changed, in a line. */
  note?: string;
};

/** Something not checked, and why not. */
export type Unverified = { id: string; text: string; why?: string };

/** A round of review: the screens it changed, each shown with its history, the newest version under review. */
export type VerifyBody = { screens: string[]; unverified: Unverified[] };

export type Option = { id: string; title: string; image?: string; html?: string; note?: string; recommended?: boolean };
export type BoardBody = { question: string; options: Option[] };

export type Kind = "comment" | "reply" | "pick" | "verdict" | "submit";
export type Verdict = "pass" | "reject" | "waive";

export type Event = {
  id: string;
  at: number;
  by: "human" | "agent";
  kind: Kind;
  /** The item, option or sentence it is about, e.g. "screens/s2"; a comment may add a spot on it. */
  target?: string;
  spot?: { x: number; y: number };
  text?: string;
  /** A verdict's value, or the option picked. */
  value?: string;
  /** For a reply, the comment it answers. */
  to?: string;
};

/** The latest verdict per target: a later press replaces an earlier one. */
export function verdicts(events: Event[]) {
  const result = new Map<string, Verdict>();
  for (const event of events) if (event.kind === "verdict" && event.target) result.set(event.target, event.value as Verdict);
  return result;
}

export function validate(value: unknown): Page {
  const page = value as Page;
  if (!page || typeof page !== "object") throw new Error("page.json is not an object");
  if (!types.includes(page.type)) throw new Error(`unknown page type: ${String(page.type)}`);
  if (typeof page.title !== "string" || !page.title.trim()) throw new Error("a page needs a title");
  if (page.type === "verify") {
    page.screens ??= [];
    page.unverified ??= [];
    if (page.screens.some(id => typeof id !== "string")) throw new Error("a verify page lists screen ids; add versions with `artti shot`");
  }
  if (page.type === "board") page.options ??= [];
  return page;
}
