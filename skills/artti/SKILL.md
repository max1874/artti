---
name: artti
description: Put work in front of the person as a page they answer on, instead of screenshots in a folder and paragraphs in the terminal — a verify page for finished work (screens, what was checked by running it, what was not), a board of options to pick from — then wait for their verdicts, picks and pinned comments to come back. Use whenever a task ends with something the person should look at or decide, when proposing more than one direction, and when the person says "artti", "show me", "let me pick", or "put it on a page".
---

# artti

`artti` makes pages in the project's `.artti/` directory and serves them at `http://localhost:7317` as an artboard: a canvas the person pans and zooms, with each screen or option as its own frame. The person answers on it; `artti wait` returns their answer to you.

## Which page

- **verify** — work is done and the person decides whether it is right. Use it at the end of every task that changed something visible or runnable.
- **board** — more than one way it could look or work. Draw every option; mark the one you recommend.
- doc, whiteboard, bench, deck — not built yet; say so rather than faking one.

## The loop

1. Capture every screen the work changed and add it as that screen's newest version. A screen keeps all its versions, so the
   person sees how it got here:

   ```bash
   artti shot mac-chat out/chat.png --title "Mac 对话" --label "复杂留给系统" --note "失败的消息旁边有「再试一次」"
   ```

   Use the same screen id every time the same screen is captured (`mac-chat`, `ios-settings`), the same window size and
   appearance, so versions compare. `--title` is needed once; `--label` names the version (default: the commit).
2. Make the round: `artti new verify --title "<what was done>" --screens mac-chat,mac-plugins --body body.json`, where the
   body holds the summary and the gaps:

   ```json
   { "summary": "One or two sentences: the result, in words the person could repeat.",
     "unverified": [{ "id": "android", "text": "What was not checked", "why": "Why not, and what would check it" }] }
   ```

   The page shows each listed screen as a row of its versions, the newest marked; `unverified` is a note beside them.
3. Show it: `artti open`, and tell the person the link.
4. Wait in the background, so you stay free: `artti wait` (Claude Code: run it as a background command; you are notified
   when it exits). It prints each verdict, pick and comment with its id, then `SUBMITTED` and any overall note. The person
   marks a comment anywhere: a point or a dragged area on a screen, or a note on the empty board. A comment on a screen
   comes with `the marked spot:` (that part of the image, cut out, the mark drawn in red) and `the whole screen:`; open
   both before deciding what to change, because the words alone ("这里太挤") only make sense against the picture.
5. Act on it, then answer each comment where it was made: `artti reply --to <comment id> "<what you did>"`. A new capture
   is a new `artti shot` and, for another round, a new `artti new verify`.
6. When the person passes everything: `artti status passed`.

Evidence that is not a screen (commands run, their output) goes in your report in the terminal, not on the page.

## Whiteboards

For thinking laid out rather than work to approve: a plan, a flow, a map, a brainstorm. `artti new whiteboard --title "<name>"`,
then write to it. The person edits the same board in the browser at the same time.

```bash
artti board claim --at=0,0,1200,600       # first: a frame shows where you are about to work (x,y,w,h)
artti board write --ops ops.json          # all or none; prints each element's new version
artti board claim --done                  # last
artti board get                           # elements (each with its version v and who wrote it), order, claims
artti board image shot.png                # copies a picture into the page; prints {"src", "w", "h"} for an image element
```

`ops.json` is a list:

```jsonc
[{ "op": "set", "id": "e1", "data": { "type": "text", "x": 0, "y": -80, "text": "Launch plan", "size": "title" } },
 { "op": "update", "id": "e4", "data": { "color": "blue", "note": null }, "ifVersion": 3 },   // null removes a field
 { "op": "delete", "id": "e7", "ifVersion": 1 },
 { "op": "meta", "data": { "title": "…", "order": ["e3", "e1"] } }]                           // order: back to front
```

- **Pin every change to an element that exists** with `ifVersion`, the `v` you last read. A write over a newer version is refused, with nothing written: read again and redo the write, because the person may have just moved or retyped it. New ids are `e1`, `e2`… above the board's highest.
- **Elements:**

  | Type | Fields |
  |---|---|
  | `shape` | `kind`: rounded, rect, ellipse, diamond, pill, hexagon, parallelogram, database, queue, document, cloud or person. `x y w h`, `text`, `color`, `size`, `stroke` (an outline's ink) with `dash` (true or "dot"), `hollow`, `textAlign`. |
  | `container` | A section: `x y w h`, `text` (its title, drawn 28 above the box), `color`. Write it before what it holds; it goes behind. |
  | `text` | `x y`, `text`, `size`, `wrap` (a width), `color`, `textAlign`, `placeholder` (a grey guess for the person to type over). |
  | `note` | The person's sticky notes. Read them; don't make them. |
  | `arrow` | No `x y`: `from` and `to`, each an element id (it follows that element) or a point `[x, y]`. `label`, `color` (an ink), `dash` (true or "dot"), `heads: [start, end]` of none, arrow or circle (default `["none","arrow"]`). Routed in right angles between facing sides, and around elements in the way; `fromSide`/`toSide` (top, right, bottom, left) pick others, and `bends: ["h" or "v", offsets…]` plans the legs. |
  | `stroke` | A pen line: `x y`, `points` `[dx, dy, …]` from x, y (a point repeated makes a corner), `color`, `width`. |
  | `image` | `x y w h`, `src` from `artti board image`; `crop: {zoom, x, y}` (zoom ≥ 1, x and y 0–1 pick the middle). |
  | `table` | `x y`, `w` (optional), `rows`: a list of rows of strings; row 1 is the header. `color` (a fill) colours the header, `heat` (a fill) colours each number by its size, `fills` is a matching grid of fills or null. |
  | `html` | A working page in a sandbox: `x y w h`, and either `src` (an https page of another site, if it allows being embedded) or `html` (a whole small page, 200 KB at most) with `state`. In the page, `onLoad(state => …)` runs with the kept state now and whenever it changes, `save(state)` keeps a new one, and `await load()` reads it. What people enter stays in `state`, which you can read and write too. |
  | `link` | A card that opens a page: `x y`, `url` (`artti url <page>` for another artti page), `title`, `kind` (whiteboard, verify, board, doc, deck or page), `note`. |
  | `sticker` | The person's emoji, `emoji`, stuck `on` an element with `x y` from its corner. Read them as votes; `artti board view` counts them. |

- **Values:**
  - Sizes: small 14, body 16, large 28, title 48, huge 96.
  - Fills: yellow, peach, pink, green, blue, purple, white.
  - Inks: ink, terracotta, blue, green, purple.
  - Any `#rrggbb` works for either.
  - Fonts (`font` on shapes, notes, text, sections and tables): sans (the default), serif, mono, hand.
  - `text` may use `**bold**`, `*italic*`, `` `code` ``, `[label](https://…)` and lines starting `- ` or `1. `.
- **Working with the person on it:**
  - **"This box", "here":** run `artti board view` first. It prints what they have selected, in view and are editing, and what they added, changed, moved, deleted or answered since you last looked. Your own writes never show up there.
  - **Comments:** they pin comments to elements (or to a point on the board), and each comment is their message to you. `artti wait` returns as soon as one arrives, with the element it is on, a picture of the spot, and the same view and changes. Do what it asks. Then answer with `artti reply --to <id> --done "<what you did>"`, which also resolves the thread; leave out `--done` when you are asking something back.
  - **Open questions:** ask them on the board: a `text` with the question, and under it a `text` with an empty `text` and your guess as `placeholder`. Build on the guess in the meantime. When they type over it, `artti board view` reports `ANSWERED`.
- **Timer:** `{ "op": "meta", "data": { "timer": { "ends": <epoch ms> } } }` starts the board's countdown; `{ "left": <ms> }` pauses it and `null` stops it.
- **Groups:** elements sharing an id in `groups` (innermost first) are picked and moved as one.
- **Lay out from one thing outward:** leave 24 between neighbours, give the whole the shape the idea has (a line, a loop, a tree, lanes), and lead with a title and one sentence. Never rebuild a board: change only what changes, and leave what the person placed where they put it.

## board body

```json
{ "question": "What the person is choosing", "options": [
  { "id": "a", "title": "Short name", "image": "assets/a.png", "note": "What this option bets on", "recommended": true },
  { "id": "b", "title": "…", "html": "assets/b.html", "note": "…" } ] }
```

## Rules

- Never answer on the person's behalf: no verdicts, picks or comments from you except `reply`. To rehearse the flow, make a throwaway page in a scratch directory.
- Write page text in the person's language.
- Images stay on this machine by default (`.artti/.gitignore` ignores `*/assets/`).
