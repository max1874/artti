// Pages on disk: a project's `.artti/<slug>/`, and the machine's list of projects in `~/.artti`.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, basename } from "node:path";
import { type Event, type Page, type Type, validate } from "./page.ts";

export const home = process.env.ARTTI_HOME ?? join(homedir(), ".artti");

/** The repository root holding `dir`, or `dir` itself outside a repository. */
export function projectRoot(dir = process.cwd()) {
  for (let at = resolve(dir); ; at = dirname(at)) {
    if (existsSync(join(at, ".git"))) return at;
    if (dirname(at) === at) return resolve(dir);
  }
}

/** A short stable id for a project, used in links so they carry no path. */
export const projectId = (root: string) => createHash("sha256").update(root).digest("hex").slice(0, 10);

const json = <T>(path: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
};

export function projects(): string[] {
  return json<string[]>(join(home, "projects.json"), []).filter(root => existsSync(join(root, ".artti")));
}

export function remember(root: string) {
  mkdirSync(home, { recursive: true });
  const known = json<string[]>(join(home, "projects.json"), []);
  if (!known.includes(root)) writeFileSync(join(home, "projects.json"), JSON.stringify([...known, root], null, 2));
}

export const pagesDir = (root: string) => join(root, ".artti");

export function slugs(root: string) {
  const dir = pagesDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => existsSync(join(dir, name, "page.json")));
}

export function read(root: string, slug: string) {
  const dir = join(pagesDir(root), safe(slug));
  const page = validate(JSON.parse(readFileSync(join(dir, "page.json"), "utf8")));
  return { page, events: events(dir), dir };
}

export function events(dir: string): Event[] {
  const path = join(dir, "feedback.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).flatMap(line => {
    try {
      return [JSON.parse(line) as Event];
    } catch {
      return [];
    }
  });
}

export function append(root: string, slug: string, event: Omit<Event, "id" | "at">) {
  const dir = join(pagesDir(root), safe(slug));
  if (!existsSync(join(dir, "page.json"))) throw new Error(`no page ${slug}`);
  const full: Event = { id: randomBytes(4).toString("hex"), at: Date.now(), ...event };
  appendFileSync(join(dir, "feedback.jsonl"), JSON.stringify(full) + "\n");
  // A submit is the person's answer; the page says so until the agent changes it.
  if (full.kind === "submit") update(root, slug, page => ({ ...page, status: "answered" }));
  return full;
}

export function update(root: string, slug: string, change: (page: Page) => Page) {
  const path = join(pagesDir(root), safe(slug), "page.json");
  const page = change(validate(JSON.parse(readFileSync(path, "utf8"))));
  writeFileSync(path, JSON.stringify({ ...page, updated: Date.now() }, null, 2) + "\n");
}

/** A new page directory named `MMDD-title`, unique within the project. */
export function create(root: string, type: Type, title: string, body: Record<string, unknown> = {}) {
  const dir = pagesDir(root);
  mkdirSync(dir, { recursive: true });
  // Assets stay on this machine unless the project chose otherwise (docs/design.md, Storage).
  if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), "*/assets/\n");
  const now = new Date();
  const day = String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
  const base = `${day}-${title.trim().replace(/[\s/\\:*?"<>|]+/gu, "-").slice(0, 60)}`;
  let slug = base;
  for (let n = 2; existsSync(join(dir, slug)); n++) slug = `${base}-${n}`;
  mkdirSync(join(dir, slug, "assets"), { recursive: true });
  const page = validate({ ...body, type, title: title.trim(), status: "open", created: Date.now(), updated: Date.now() });
  writeFileSync(join(dir, slug, "page.json"), JSON.stringify(page, null, 2) + "\n");
  writeFileSync(join(dir, slug, "feedback.jsonl"), "");
  remember(root);
  return { slug, dir: join(dir, slug) };
}

/** A slug or asset path from a link, kept inside its directory. */
export function safe(name: string) {
  if (!name || name.split(/[/\\]/u).some(part => part === ".." || part === "")) throw new Error(`bad name: ${name}`);
  return name;
}

export function latest(root: string) {
  return slugs(root).map(slug => ({ slug, at: statSync(join(pagesDir(root), slug, "page.json")).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0]?.slug;
}

export const label = (root: string) => basename(root);
