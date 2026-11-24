# Design

## The loop

1. The agent writes a page: `artt new verify --title …` creates it, files and JSON fill it.
2. The person opens it (the Mac app, a browser, a phone on the same network) and answers: picks, comments pinned to a spot, a verdict per item, then **Submit**.
3. `artt wait <page>`, which the agent left running in the background, exits and prints what the person said.
4. The agent acts, replies under the comments (`artt reply`), updates the page; the open page refreshes in place. Back to 2.

`wait` is the whole integration: any agent that can run a command and notice it finish (Claude Code background shells, Codex, a plain terminal) works, with no hook, MCP server or harness plugin.

## Where things live

A project's pages live in `.artt/<slug>/` at the repository root (or the directory `artt` runs in, outside a repository). One page is a directory:

- `page.json`: what the page is (below). The agent writes it.
- `feedback.jsonl`: what was said on it, appended, never rewritten: `{ id, at, by: "human" | "agent", kind, target?, text?, value? }`. `kind` is `comment`, `reply`, `pick`, `verdict` or `submit`; `target` names the option, item, sentence or point it is about. A `submit` closes a round; `wait` returns the events since the last one it reported.
- Assets (images, HTML) next to them, referenced by relative path, or by URL once a storage backend has put them elsewhere.

The machine keeps `~/.artt/projects.json` (the projects it has seen, so one library lists them all) and the running server's address in `~/.artt/server.json`.

### Storage

Where assets go is the user's choice, per project, in `.artt/config.json`: `local` (default; the project ignores `.artt/**/assets` in git), `git` (assets committed with the page), or `host` (uploaded by a configured command or S3-compatible bucket; `page.json` records the URL). Page JSON and feedback are text and always stay with the project.

## Page types

Every `page.json` has `{ type, title, created, updated, status, summary? }`; `status` is `open`, `answered`, `passed`, `rejected` or `closed`.

| Type | For | Body | The person |
|---|---|---|---|
| `verify` | Work is built; is it right? | `screens` (image, caption: scenario, observed, environment; optional `before`), `claims` (what was checked by running something, with the raw output), `unverified` (what was not, and why) | passes, rejects or waives each item, comments, submits |
| `board` | More than one way it could look | `question`, `options` (image or HTML, title, note, `recommended`) | picks one, comments on any spot |
| `doc` | Structure, architecture, tradeoffs | Markdown with inline `asks` | answers asks, comments on a sentence |
| `whiteboard` | Parts and arrows | a scene of boxes, arrows, text | draws too, asks about a selection |
| `bench` | Tuning one thing | an HTML page with `controls` whose values survive rewrites | moves sliders, keeps a setting |
| `deck` | Presenting | slides in Markdown | presents, fixes a word, comments |

## Parts

- `src/`: TypeScript. The format (`page.ts`), the store (read, write, append feedback, watch), the server (HTTP for pages and assets, Server-Sent Events for live updates, the library), and the CLI.
- `web/`: the viewer, React. One route per type plus the library.
- `mac/`: the Swift app. It runs the server, keeps it alive and starts at login, opens pages in a window, and shows a menu-bar count of pages waiting on the person.
- `skills/artt/`: the skill that tells an agent which page fits and how to wait.

## Build order

The riskiest part first: the loop, on the type used after every task.

1. Format, store, server, CLI (`new`, `open`, `wait`, `reply`, `list`) and the `verify` viewer. Done when a verify page made in a Claude Code session is passed or rejected in the browser and `wait` hands that to the session.
2. `board`.
3. The Mac app.
4. `doc`, `bench`, `deck`, `whiteboard`.
5. Storage backends beyond `local`.
