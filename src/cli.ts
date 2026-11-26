#!/usr/bin/env node
// artti: pages an agent puts its work on, and the person's answer on them. docs/design.md.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, watch } from "node:fs";
import { extname, join } from "node:path";
import { parseArgs } from "node:util";
import { type Event, type Page, type Status, type Type, types } from "./page.ts";
import { append, board, create, home, imageSize, imageTypes, latest, pagesDir, place, projectId, projectRoot, read, screen, see, seen, shot, slugs, update, view } from "./store.ts";
import type { Board, Element, Op } from "./board.ts";
import { defaultPort, serve } from "./server.ts";

const usage = `artti — pages an agent puts its work on; the person answers on them.

  artti shot <screen> <image> [--title <name>] [--label <version>] [--note <what changed>] [--at <when, for an older capture>]
                                                         add a version of a screen (ids: letters, digits, - and _)
  artti new <type> --title <title> [--body <file.json|->] make a page (${types.join(", ")}); "-" reads the body from stdin
                   [--screens <id,id>]                   verify: the screens whose newest version is under review
  artti board get [page]                                  a whiteboard's elements, order and claims, as JSON
  artti board write [page] --ops <file.json|->            apply a list of ops, all or none; see the skill for their shape
  artti board claim [page] --at=<x,y,w,h> | --done        show where you are at work, or that you are done
  artti board image [page] <file>                         put an image in the page's assets; prints its src and size
  artti board view [page]                                 what the person has selected and in view, and what they changed since you last looked
  artti open [page]                                       show it in the browser
  artti url [page]                                        print its link
  artti wait [page] [--timeout <seconds>]                 block until the person submits (on a whiteboard: comments), then print what they said
  artti said [page]                                       print everything said on it
  artti reply [page] --to <id> [--done] <text>            answer a comment under it; --done also resolves it
  artti status [page] <open|answered|passed|rejected|closed>
  artti list                                              this project's pages
  artti serve [--port <port>]                             run the server in the foreground

[page] is a page's directory name or a unique start of it; without it, the newest page.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: "string" }, body: { type: "string" }, screens: { type: "string" }, label: { type: "string" }, note: { type: "string" }, at: { type: "string" }, timeout: { type: "string" }, to: { type: "string" },
    port: { type: "string" }, ops: { type: "string" }, done: { type: "boolean" }, help: { type: "boolean", short: "h" },
  },
});
const [command, ...rest] = positionals;
const root = projectRoot();

function fail(message: string): never {
  console.error(`artti: ${message}`);
  process.exit(1);
}

/** A page named by its directory, a unique start of it, or the newest page when none is named. */
function resolvePage(name?: string) {
  if (!name) return latest(root) ?? fail(`no pages in ${pagesDir(root)}`);
  const all = slugs(root);
  if (all.includes(name)) return name;
  const matches = all.filter(slug => slug.startsWith(name) || slug.includes(name));
  if (matches.length === 1) return matches[0]!;
  fail(matches.length ? `"${name}" could be ${matches.join(", ")}` : `no page "${name}" in ${pagesDir(root)}`);
}

async function running(port: number) {
  try {
    return (await fetch(`http://127.0.0.1:${port}/api/library`, { signal: AbortSignal.timeout(800) })).ok;
  } catch {
    return false;
  }
}

/** The machine's server, started in the background when it is not running. */
async function server() {
  const port = (() => {
    try {
      return (JSON.parse(readFileSync(join(home, "server.json"), "utf8")) as { port: number }).port;
    } catch {
      return defaultPort;
    }
  })();
  if (await running(port)) return port;
  spawn(process.execPath, [new URL(import.meta.url).pathname, "serve", "--port", String(port)], { detached: true, stdio: "ignore" }).unref();
  for (let i = 0; i < 40; i++) {
    await new Promise(resolve => setTimeout(resolve, 150));
    if (await running(port)) return port;
  }
  fail(`the server did not start on port ${port}`);
}

const link = async (slug: string) => `http://localhost:${await server()}/p/${projectId(root)}/${encodeURIComponent(slug)}`;

/** The screen a target names, and the version: the one named, or the newest. */
function screenOf(target?: string) {
  const [kind, id, version] = target?.split("/") ?? [];
  if (kind !== "screens") return;
  const found = screen(root, id!);
  return found && { screen: found, version: version ? found.versions.find(v => `v${v.n}` === version) : found.versions.at(-1) };
}

/** An element in a line: its id, type and words. */
function named(id: string, el?: Element) {
  const words = el && [el.text, el.label, el.placeholder && `guess: ${el.placeholder}`].find(w => typeof w === "string" && w.trim()) as string | undefined;
  return `${id} ${el?.type ?? "(gone)"}${words ? ` “${words.replace(/\s+/gu, " ").slice(0, 60)}”` : ""}`;
}

/** What an event is about, in the page's own words. */
function about(page: Page, target?: string, whiteboard?: Board) {
  if (!target) return "the page";
  if (target === "board") return "the board";
  const [kind, id] = target.split("/");
  if (kind === "elements") return named(id!, whiteboard?.elements[id!]);
  const shown = screenOf(target);
  if (shown) return `${target} “${shown.screen.title}${shown.version ? ` v${shown.version.n}${shown.version.label ? ` ${shown.version.label}` : ""}` : ""}”`;
  const item = kind === "unverified" ? page.unverified?.find(u => u.id === id)
    : kind === "options" ? page.options?.find(o => o.id === id) : undefined;
  const words = item && ("text" in item ? item.text : item.title);
  return words ? `${target} “${String(words).slice(0, 60)}”` : target;
}

/** Where on its target a comment was marked, and the pictures to look at for it. */
function where({ target, spot, crop }: Event) {
  const picture = crop ? `\n  the marked spot: ${join(pagesDir(root), crop)}` : "";
  // On a whiteboard: an element names the place; a spot on the board itself is a point in board units.
  if (target?.startsWith("elements/")) return picture;
  if (target === "board") return (spot ? ` at (${Math.round(spot.x)}, ${Math.round(spot.y)})` : "") + picture;
  if (!spot) return "";
  const pc = (value: number) => `${Math.round(value * 100)}%`;
  const image = screenOf(target)?.version?.image;
  return (spot.w !== undefined ? ` in the area (${pc(spot.x)}, ${pc(spot.y)})–(${pc(spot.x + spot.w)}, ${pc(spot.y + (spot.h ?? 0))})` : ` at (${pc(spot.x)}, ${pc(spot.y)})`) +
    (crop ? `\n  the marked spot: ${join(pagesDir(root), crop)}` : "") + (image ? `\n  the whole screen: ${join(pagesDir(root), image)}` : "");
}

function describe(page: Page, event: Event, whiteboard?: Board) {
  switch (event.kind) {
    case "verdict": return `${{ pass: "PASS", reject: "REJECT", waive: "WAIVE" }[event.value ?? ""] ?? "TOOK BACK VERDICT ON"} ${about(page, event.target)}`;
    case "pick": return event.target ? `PICKED ${about(page, event.target)}` : "UNPICKED";
    case "comment": {
      const [first, ...pictures] = where(event).split("\n");
      return [`COMMENT [${event.id}] on ${about(page, event.target, whiteboard)}${first}: ${event.text}`, ...pictures].join("\n");
    }
    case "reply": return `REPLY to ${event.to}: ${event.text}`;
    case "resolve": return `RESOLVED ${event.to}`;
    case "submit": return `SUBMITTED${event.text ? `: ${event.text}` : ""}`;
  }
}

const moves = new Set(["x", "y", "from", "to", "points", "bends", "fromSide", "toSide"]), sizes = new Set(["w", "h", "wrap", "crop"]);

/** What the person has in view and picked on a whiteboard, and what they changed since the agent last looked; marks it looked at. */
function looked(slug: string) {
  const now = board(root, slug), before = seen(root, slug) ?? {}, seenView = view(root, slug), lines: string[] = [];
  if (seenView) {
    const { x, y, w, h } = seenView.viewport, r = Math.round;
    lines.push(`VIEW ${Math.round((Date.now() - seenView.at) / 1000)}s ago: in view (${r(x)}, ${r(y)})–(${r(x + w)}, ${r(y + h)})`);
    if (seenView.selected.length) lines.push(`  selected: ${seenView.selected.map(id => named(id, now.elements[id])).join("; ")}`);
    if (seenView.editing) lines.push(`  editing: ${named(seenView.editing, now.elements[seenView.editing])}`);
  }
  const changes: string[] = [];
  for (const id of now.order) {
    const el = now.elements[id]!, was = before[id];
    if (el.by !== "human" || was?.v === el.v) continue;
    if (!was) { changes.push(`ADDED ${named(id, el)}`); continue; }
    if (typeof was.placeholder === "string" && !was.text && el.text) { changes.push(`ANSWERED ${id} “${el.text}” (your guess was “${was.placeholder}”)`); continue; }
    const keys = [...new Set([...Object.keys(el), ...Object.keys(was)])].filter(k => k !== "v" && k !== "by" && JSON.stringify(el[k]) !== JSON.stringify(was[k]));
    const what = [...new Set(keys.map(k => moves.has(k) ? "moved" : sizes.has(k) ? "resized" : k === "text" || k === "label" ? `${k} → “${String(el[k] ?? "")}”` : k))];
    changes.push(`CHANGED ${named(id, was)}: ${what.join(", ")}`);
  }
  for (const id of Object.keys(before)) if (!now.elements[id]) changes.push(`DELETED ${named(id, before[id])}`);
  see(root, slug, now.elements);
  lines.push(...changes.slice(0, 40), ...changes.length > 40 ? [`… and ${changes.length - 40} more; \`artti board get\` has everything`] : []);
  return lines.length ? lines.join("\n") : "nothing new since you last looked";
}

async function wait(slug: string, timeout: number) {
  const dir = join(pagesDir(root), slug);
  const cursorPath = join(dir, ".reported");
  const reported = existsSync(cursorPath) ? readFileSync(cursorPath, "utf8").trim() : "";
  console.error(`artti: waiting for an answer on ${await link(slug)}`);
  const deadline = timeout ? Date.now() + timeout * 1000 : Infinity;
  for (;;) {
    const { page, events } = read(root, slug);
    const start = reported ? events.findIndex(event => event.id === reported) + 1 : 0;
    const fresh = events.slice(start);
    // A whiteboard has no submit: each comment the person sends is their message to the agent.
    if (page.type === "whiteboard") {
      const said = fresh.filter(event => event.by === "human" && event.kind === "comment");
      if (said.length) {
        writeFileSync(cursorPath, fresh.at(-1)!.id);
        const now = board(root, slug);
        console.log(`${page.title} — ${said.length} comment${said.length > 1 ? "s" : ""}\n`);
        for (const event of said) console.log(describe(page, event, now));
        return console.log(`\n${looked(slug)}`);
      }
    }
    const submit = fresh.findLastIndex(event => event.kind === "submit");
    if (submit >= 0) {
      // Each verdict and pick as it stands now, not every press on the way there.
      const round = fresh.slice(0, submit + 1).filter((event, i, all) => event.by === "human" &&
        !((event.kind === "verdict" || event.kind === "pick") &&
          all.slice(i + 1).some(later => later.kind === event.kind && (event.kind === "pick" || later.target === event.target))) &&
        !(event.kind === "verdict" && !event.value) && !(event.kind === "pick" && !event.target));
      writeFileSync(cursorPath, fresh[submit]!.id);
      console.log(`${page.title} — answered\n`);
      for (const event of round) console.log(describe(page, event));
      return;
    }
    if (Date.now() > deadline) fail("no answer yet; run `artti wait` again to keep waiting");
    await new Promise<void>(resolve => {
      const watcher = watch(dir, () => { watcher.close(); resolve(); });
      setTimeout(() => { watcher.close(); resolve(); }, 2000);
    });
  }
}

async function main() {
  if (values.help || !command) return console.log(usage);
  switch (command) {
    case "new": {
      const type = rest[0] as Type;
      if (!types.includes(type)) fail(`type must be one of ${types.join(", ")}`);
      if (!values.title) fail("--title is required");
      // stdin only when asked: an agent's shell may hold it open forever.
      const text = values.body === "-" ? readFileSync(0, "utf8") : values.body ? readFileSync(values.body, "utf8") : "";
      const body = { ...text.trim() ? JSON.parse(text) : {}, ...values.screens ? { screens: values.screens.split(",").map(s => s.trim()) } : {} };
      for (const id of type === "verify" ? body.screens ?? [] : []) if (!screen(root, id)) fail(`no screen "${id}"; add it with \`artti shot ${id} <image>\``);
      const { slug, dir } = create(root, type, values.title, body);
      console.log(`${slug}\n  files: ${dir}\n  link:  ${await link(slug)}`);
      return;
    }
    case "shot": {
      const [id, file] = rest;
      if (!id || !file) fail("usage: artti shot <screen> <image> [--title <name>] [--label <version>] [--note <what changed>]");
      if (!existsSync(file)) fail(`no file ${file}`);
      const at = values.at ? new Date(values.at).getTime() : undefined;
      if (at !== undefined && Number.isNaN(at)) fail(`--at is not a date: ${values.at}`);
      const version = shot(root, id, file, { title: values.title, label: values.label, note: values.note, at });
      return console.log(`${id} v${version.n}${version.commit ? ` (${version.commit})` : ""}`);
    }
    case "board": {
      const [action, ...args] = rest;
      if (action === "image") {
        const file = args.at(-1);
        if (!file || !existsSync(file)) fail("usage: artti board image [page] <file>");
        const ext = imageTypes[`image/${extname(file).slice(1).toLowerCase().replace("jpg", "jpeg").replace("svg", "svg+xml")}`];
        if (!ext) fail("png, jpg, gif, webp or svg");
        const bytes = readFileSync(file);
        return console.log(JSON.stringify({ src: place(root, resolvePage(args.length > 1 ? args[0] : undefined), bytes, ext), ...imageSize(bytes) }));
      }
      const slug = resolvePage(args[0]);
      if (read(root, slug).page.type !== "whiteboard") fail(`${slug} is not a whiteboard`);
      if (action === "get") return console.log(JSON.stringify(board(root, slug), null, 1));
      if (action === "view") return console.log(looked(slug));
      const ops: Op[] = action === "write"
        ? JSON.parse(values.ops === "-" ? readFileSync(0, "utf8") : values.ops ? readFileSync(values.ops, "utf8") : fail("--ops <file.json|-> is required"))
        : action === "claim"
          ? [{ op: "claim", id: "agent", data: values.done ? {} : (([x, y, w, h]) => ({ x, y, w, h }))((values.at ?? fail("--at x,y,w,h or --done")).split(",").map(Number)) }]
          : fail("usage: artti board get|view|write|claim|image [page]");
      // Through the server, the board's one writer.
      const response = await fetch(`http://127.0.0.1:${await server()}/api/board/${projectId(root)}/${encodeURIComponent(slug)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops }),
      });
      const result = await response.json() as { error?: string; v?: number; versions?: Record<string, number> };
      if (!response.ok) fail(result.error ?? response.statusText);
      // What the agent wrote it has seen: only the person's changes are news.
      const before = seen(root, slug);
      if (before) {
        const now = board(root, slug);
        for (const op of ops) if ("id" in op && op.op !== "claim") now.elements[op.id] ? before[op.id] = now.elements[op.id]! : delete before[op.id];
        see(root, slug, before);
      }
      if (action === "write") console.log(JSON.stringify(result));
      return;
    }
    case "open": {
      const url = await link(resolvePage(rest[0]));
      spawn("open", [url], { stdio: "ignore" });
      return console.log(url);
    }
    case "url": return console.log(await link(resolvePage(rest[0])));
    case "wait": return wait(resolvePage(rest[0]), Number(values.timeout ?? 0));
    case "said": {
      const slug = resolvePage(rest[0]);
      const { page, events } = read(root, slug);
      const whiteboard = page.type === "whiteboard" ? board(root, slug) : undefined;
      for (const event of events) console.log(`${new Date(event.at).toLocaleString()}  ${event.by.padEnd(5)}  ${describe(page, event, whiteboard)}`);
      return;
    }
    case "reply": {
      const [first, ...words] = rest;
      const named = words.length > 0;
      const slug = resolvePage(named ? first : undefined);
      const text = (named ? words : [first]).join(" ").trim();
      if (!values.to || !text) fail("usage: artti reply [page] --to <comment id> <text>");
      append(root, slug, { by: "agent", kind: "reply", to: values.to, text });
      if (values.done) append(root, slug, { by: "agent", kind: "resolve", to: values.to });
      return;
    }
    case "status": {
      const [first, second] = rest;
      const status = (second ?? first) as Status;
      if (!["open", "answered", "passed", "rejected", "closed"].includes(status)) fail("status must be open, answered, passed, rejected or closed");
      update(root, resolvePage(second ? first : undefined), page => ({ ...page, status }));
      return;
    }
    case "list": {
      for (const slug of slugs(root)) {
        const { page, events } = read(root, slug);
        console.log(`${slug}  ${page.type}  ${page.status}  ${events.length} said`);
      }
      return;
    }
    case "serve": {
      serve(Number(values.port ?? defaultPort));
      return;
    }
    default: fail(`unknown command "${command}"\n\n${usage}`);
  }
}

await main();
