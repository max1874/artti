// Pages on disk: a project's `.artti/<slug>/`, and the machine's list of projects in `~/.artti`.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { type Event, type Page, type Screen, type Type, type Version, validate } from "./page.ts";
import { type Board, type Op, type Writer, apply, emptyBoard } from "./board.ts";

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
  ignoreAssets(root);
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

// Assets stay on this machine unless the project chose otherwise (docs/design.md, Storage).
function ignoreAssets(root: string) {
  mkdirSync(pagesDir(root), { recursive: true });
  writeFileSync(join(pagesDir(root), ".gitignore"), "**/assets/\n");
}

const screensDir = (root: string) => join(pagesDir(root), "screens");

export function screen(root: string, id: string): Screen | undefined {
  return json<Screen | undefined>(join(screensDir(root), safe(id), "screen.json"), undefined);
}

export function screens(root: string): Screen[] {
  const dir = screensDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(id => screen(root, id) ?? []).sort((a, b) => (b.versions.at(-1)?.at ?? 0) - (a.versions.at(-1)?.at ?? 0));
}

/** Adds `file` as the newest version of a screen, creating the screen on its first version. */
export function shot(root: string, id: string, file: string, details: { title?: string; label?: string; note?: string; at?: number }) {
  if (!/^[\p{L}\p{N}_-]+$/u.test(id)) throw new Error(`a screen id is letters, digits, - and _: ${id}`);
  ignoreAssets(root);
  const dir = join(screensDir(root), id);
  mkdirSync(join(dir, "assets"), { recursive: true });
  const current = screen(root, id) ?? { id, title: details.title ?? id, versions: [] };
  const n = (current.versions.at(-1)?.n ?? 0) + 1;
  const image = `screens/${id}/assets/${n}${extname(file).toLowerCase() || ".png"}`;
  copyFileSync(file, join(pagesDir(root), image));
  // An older capture added later was not taken at today's commit.
  let commit: string | undefined;
  if (details.at === undefined) try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {}
  const version: Version = { n, image, at: details.at ?? Date.now(), ...details.label ? { label: details.label } : {}, ...commit ? { commit } : {}, ...details.note ? { note: details.note } : {} };
  const next: Screen = { ...current, title: details.title ?? current.title, versions: [...current.versions, version] };
  writeFileSync(join(dir, "screen.json"), JSON.stringify(next, null, 2) + "\n");
  remember(root);
  return version;
}

/** A picture cut out by the person's mark, kept with the page's images; its path inside `.artti/`. */
export function keep(root: string, slug: string, png: Buffer) {
  const path = `${safe(slug)}/assets/notes/${randomBytes(4).toString("hex")}.png`;
  mkdirSync(dirname(join(pagesDir(root), path)), { recursive: true });
  writeFileSync(join(pagesDir(root), path), png);
  return path;
}

const boardPath = (root: string, slug: string) => join(pagesDir(root), safe(slug), "board.json");

export function board(root: string, slug: string): Board {
  const path = boardPath(root, slug);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as Board : emptyBoard();
}

/** Applies `ops` to a whiteboard page and keeps the result; the server is its one writer, so a write never interleaves. */
export function write(root: string, slug: string, ops: Op[], by: Writer) {
  if (read(root, slug).page.type !== "whiteboard") throw new Error(`${slug} is not a whiteboard`);
  const next = apply(board(root, slug), ops, by);
  const path = boardPath(root, slug);
  writeFileSync(path + ".tmp", JSON.stringify(next));
  renameSync(path + ".tmp", path);
  return next;
}
