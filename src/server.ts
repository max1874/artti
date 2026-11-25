// One server for the machine: the library, every project's pages and their assets, what is said on them, and live updates.

import { createReadStream, existsSync, statSync, watch, writeFileSync, mkdirSync, rmSync, type FSWatcher } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Event } from "./page.ts";
import { Conflict, type Op } from "./board.ts";
import { append, board, home, imageTypes, keep, label, place, write, pagesDir, projectId, projects, read, safe, screen, screens, slugs } from "./store.ts";

export const defaultPort = 7317;
const web = fileURLToPath(new URL("../web/dist/", import.meta.url));

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".mp4": "video/mp4", ".mov": "video/quicktime", ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".woff2": "font/woff2",
};

const rootOf = (id: string) => projects().find(root => projectId(root) === id);

function library() {
  return projects().map(root => ({
    id: projectId(root),
    name: label(root),
    screens: screens(root).length,
    pages: slugs(root).flatMap(slug => {
      try {
        const { page, events } = read(root, slug);
        return [{ slug, title: page.title, type: page.type, status: page.status, updated: page.updated, said: events.length }];
      } catch {
        return [];
      }
    }).sort((a, b) => b.updated - a.updated),
  }));
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function file(response: ServerResponse, path: string) {
  if (!existsSync(path) || !statSync(path).isFile()) return send(response, 404, { error: "not found" });
  response.writeHead(200, { "Content-Type": types[extname(path).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  createReadStream(path).pipe(response);
}

/** `base` joined with a path from a link, refusing anything that climbs out of it. */
function inside(base: string, path: string) {
  const full = resolve(base, path);
  if (full !== base && !full.startsWith(base.endsWith(sep) ? base : base + sep)) throw new Error("outside");
  return full;
}

async function body<T = Partial<Event>>(request: IncomingMessage) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 1 << 24) throw new Error("too large");
  }
  return JSON.parse(text) as T;
}

export function serve(port = defaultPort) {
  const live = new Set<ServerResponse>();
  const watchers = new Map<string, FSWatcher>();
  const notify = (project: string, slug: string) => {
    for (const client of live) client.write(`data: ${JSON.stringify({ project, slug })}\n\n`);
  };
  // Every known project's pages, including projects that appear while the server runs.
  const follow = () => {
    for (const root of projects()) {
      if (watchers.has(root)) continue;
      try {
        watchers.set(root, watch(pagesDir(root), { recursive: true }, (_, name) => {
          if (name) notify(projectId(root), String(name).split(sep)[0]!);
        }));
      } catch {}
    }
  };
  follow();
  setInterval(follow, 3000).unref();

  const server = createServer(async (request, response) => {
    // Local only: another site in the browser must not read or write pages through this server.
    const host = request.headers.host?.replace(/:\d+$/u, "");
    if (host !== "localhost" && host !== "127.0.0.1") return send(response, 403, { error: "local only" });
    const origin = request.headers.origin;
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(origin)) return send(response, 403, { error: "local only" });

    const url = new URL(request.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    try {
      if (parts[0] === "api") {
        if (parts[1] === "library") return send(response, 200, library());
        if (parts[1] === "live") {
          response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
          response.write(": open\n\n");
          live.add(response);
          request.on("close", () => live.delete(response));
          return;
        }
        if (parts[1] === "screens" && parts.length === 3) {
          const root = rootOf(parts[2]!);
          if (!root) return send(response, 404, { error: "no such project" });
          return send(response, 200, { project: { id: parts[2], name: label(root) }, screens: screens(root) });
        }
        // An image dropped or pasted on a page, kept with its assets.
        if (parts[1] === "asset" && parts.length === 4 && request.method === "POST") {
          const root = rootOf(parts[2]!);
          if (!root) return send(response, 404, { error: "no such project" });
          const ext = imageTypes[request.headers["content-type"] ?? ""];
          if (!ext) return send(response, 400, { error: "png, jpg, gif, webp or svg" });
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of request as AsyncIterable<Buffer>) {
            if ((size += chunk.length) > 15 << 20) return send(response, 413, { error: "larger than 15 MB" });
            chunks.push(chunk);
          }
          return send(response, 200, { src: place(root, safe(parts[3]!), Buffer.concat(chunks), ext) });
        }
        // A whiteboard's writes. The browser sends an Origin; the CLI, writing for the agent, does not.
        if (parts[1] === "board" && parts.length === 4 && request.method === "POST") {
          const root = rootOf(parts[2]!);
          if (!root) return send(response, 404, { error: "no such project" });
          const { ops } = await body<{ ops: Op[] }>(request);
          if (!Array.isArray(ops)) return send(response, 400, { error: "send { ops: [...] }" });
          try {
            const next = write(root, safe(parts[3]!), ops, origin ? "human" : "agent");
            const touched = ops.flatMap(op => "id" in op && next.elements[op.id] ? [[op.id, next.elements[op.id]!.v]] : []);
            return send(response, 200, { v: next.v, versions: Object.fromEntries(touched) });
          } catch (error) {
            if (error instanceof Conflict) return send(response, 409, { error: error.message, id: error.id, current: error.current });
            throw error;
          }
        }
        if (parts[1] === "page" && parts.length === 4) {
          const root = rootOf(parts[2]!);
          if (!root) return send(response, 404, { error: "no such project" });
          const slug = safe(parts[3]!);
          if (request.method === "POST") {
            const event = await body(request);
            if (!["comment", "pick", "verdict", "submit"].includes(event.kind ?? "")) return send(response, 400, { error: "unknown kind" });
            const { kind, target, spot, text, value, to } = event;
            // A comment's picture of its spot arrives as a PNG data URL and is kept as a file.
            const png = "data:image/png;base64,";
            const crop = kind === "comment" && event.crop?.startsWith(png) ? keep(root, slug, Buffer.from(event.crop.slice(png.length), "base64")) : undefined;
            return send(response, 200, append(root, slug, { by: "human", kind: kind!, target, spot, text, value, to, crop }));
          }
          const { page, events } = read(root, slug);
          // A verify page shows its screens with their whole history.
          const shown = page.type === "verify" ? (page.screens ?? []).flatMap(id => screen(root, id) ?? []) : [];
          return send(response, 200, { project: { id: parts[2], name: label(root) }, slug, page, events, screens: shown,
            ...page.type === "whiteboard" && { board: board(root, slug) } });
        }
        return send(response, 404, { error: "not found" });
      }
      // Any file under a project's .artti/: a page's assets, a screen's versions.
      if (parts[0] === "files" && parts.length >= 3) {
        const root = rootOf(parts[1]!);
        if (!root) return send(response, 404, { error: "no such project" });
        return file(response, inside(pagesDir(root), parts.slice(2).join("/")));
      }
      // The viewer: its files, and its own routes for everything else.
      const asset = parts.length ? inside(web, parts.join("/")) : "";
      return file(response, asset && existsSync(asset) && statSync(asset).isFile() ? asset : join(web, "index.html"));
    } catch (error) {
      send(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.listen(port, "127.0.0.1", () => {
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "server.json"), JSON.stringify({ port, pid: process.pid }));
  });
  const stop = () => {
    rmSync(join(home, "server.json"), { force: true });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  return server;
}
