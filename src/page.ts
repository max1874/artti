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

/** A screen the work produced, as the person will see it. */
export type Screen = {
  id: string;
  /** The frame's name on the board. */
  title?: string;
  image: string;
  /** What was done to get here. */
  scenario?: string;
  /** What the screen shows that matters. */
  observed?: string;
  /** Where: device, build, data, URL. */
  environment?: string;
  /** The same screen before the change, shown on the left. */
  before?: string;
};

/** Something checked by running it, with what it printed. */
export type Claim = { id: string; text: string; evidence?: string };

/** Something not checked, and why not. */
export type Unverified = { id: string; text: string; why?: string };

export type VerifyBody = { screens: Screen[]; claims: Claim[]; unverified: Unverified[] };

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
  if (page.type === "verify") for (const key of ["screens", "claims", "unverified"] as const) page[key] ??= [];
  if (page.type === "board") page.options ??= [];
  return page;
}
