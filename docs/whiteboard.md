# Whiteboard: what matching Claude's means

Max, 2026-11-25: match Claude's Whiteboard in full ("全面对标 claude 的白板功能"), on one machine first, with sharing later. This page lists what Claude's Whiteboard does, so the build can be checked against it.

Sources, both read on 2026-11-25:
- The Whiteboard type's instructions (`SKILL.md`, `reference/drawing.md`).
- The interface strings and tool table in its shipped `app.js` (release 1795560315-b846). The code itself was read for its mechanisms and nothing was copied.

## Elements

The board is `board/meta` (`title`, plus `order`, the elements' stacking from back to front) and one document per element.

| Element | What it is |
|---|---|
| shape | A block that holds text. Its kinds are rect, rounded, ellipse, diamond, pill, hexagon, parallelogram, database, queue, document, cloud and person. It has a fill colour, an outline or none (`hollow`), a text size and an alignment. |
| sticky note | A person's yellow note. |
| container | A section: a titled frame that holds other elements. |
| text | Free text in sizes small, body, large, title and huge. It can wrap at a width and supports a few inline marks: bold, italic, code, links and lists. |
| stroke | A pen line, smoothed. |
| arrow | Joins two elements by their sides, routed in right angles, or ends at a free point. It has a label, heads at either end (none, arrow or circle), a dashed style, and planned `bends`. |
| image | An upload or a small inline image. It can be cropped and linked. Claude's own SVG drawings come in 7 styles: watercolor, comic, draft, paper, blueprint, marker and plain. |
| html | A sandboxed embed that works. It keeps what people enter in its `state`, through `load`, `save` and `onLoad`. |
| table | Rows and columns with cell fills and a heat map. Row 1 is the header. |
| link | A card for another artifact: slides, doc, design, dashboard or whiteboard. |
| sticker | A person's drawing or emoji fixed to an element. A face sticker counts as a vote. |
| comment | A thread pinned to an element. |

Shared board state: one countdown timer and the ink colours people added.

## Tools and editing

- **Tool keys:**

  | Key | Tool |
  |---|---|
  | V | select |
  | H | hand |
  | T | text |
  | S or N | sticky note |
  | P or M | pen |
  | E | sticker |
  | A or F | section |
  | R, O, D | rounded, ellipse, diamond |
  | L or X | arrow |

  There is also an eraser and a comment mode, where Tab opens a comment.
- **Selection:**
  - Select all, select a layer, zoom to the selection, nothing-selected state.
  - A toolbar of actions for the selection.
  - Group and ungroup; lock and unlock.
  - Bring to front, send to back, forward and backward.
  - Align left, right, top, bottom and both centres.
  - Tidy up, duplicate, delete.
  - Copy and paste, including copying and pasting just the style.
- **Style:**
  - Fill, outline and line colours, with a hex value and a picker that takes a colour from the screen.
  - Font, text size, text style, and outline and line styles.
  - Arrowheads at each end.
- **Text and links:**
  - Text is edited in place and supports links.
  - An empty text or block removes itself.
- **Media:**
  - Pictures are uploaded by dragging, pasting or picking a file, and can be cropped and linked.
  - Web embeds; a drawing's layers.
- **Tables:** cell colour, header colour, heat-map colour, adding and deleting rows and columns, paging.
- **Navigation and output:**
  - Zoom in, zoom out, fit the board, a grid.
  - Find in page.
  - Download the board.
  - Undo and redo, per person.
- **Voice:** dictation.

## Claude on the board

- **Claude writes element by element and never rebuilds the board.** Each write is pinned to the version it read, so it cannot overwrite someone's change.
- **A claim frame shows where Claude is working.** Claude writes it before anything else and ends it with `{}`.
- **Every message carries the view context:**
  - `selected` and `selection`
  - `viewport`
  - `pin` (the open comment's anchor)
  - `editing` and `moving`
  - `issues` (problems the page measured in view, worst first)
  - `edits` (a counter of the person's changes) and `dirty`
- **Open questions sit on the board.** Each has Claude's guess as a grey placeholder that anyone can type over.
- **A comment sent to Claude is about what it is pinned to.** Claude answers in the thread.
- **Ideas offered to one person** are kept in `data/users/<id>/idea` until cleared.
- **Limits:** 800 elements, 200 KB each, 2 MB in all.

## Many people (later, once sharing is built)

Live cursors, cursor chat, follow me, screenshare, a shared timer seen by everyone, and access levels.

## Kept from artti

Verify pages (screens and their versions, a verdict each, rounds) and boards of options stay. On a whiteboard, a screen's versions can be placed as images, and marks on them still cut out a picture for the agent.

## Build order

Each step ends in something Max can use and that has been checked in a browser.

1. **Core editor and the agent's read and write.** Done 2026-11-25.
   - **Storage:** a `whiteboard` page keeps `board.json`, with one version per element. The server is its only writer and pushes changes live.
   - **Elements:** shapes (all 12 kinds), text, sticky notes and sections.
   - **Tools:** select, hand, text, note, section and shape, with their keys.
   - **Selection and editing:**
     - Click, shift-click and marquee selection.
     - Move, resize and delete.
     - Duplicate, copy and paste, undo and redo.
     - Text edited in place.
     - Colours, sizes and stacking order.
     - Lock.
   - **Agent:** `artti board get` and `write`, where each write is pinned to the version it read, plus claim frames.
2. **Drawing and media.** Done 2026-11-25; arrows do not yet route around elements in their way.
   - Arrows: tied to elements, routed in right angles, with labels and heads.
   - Pen and eraser.
   - Images: dragged in, pasted or uploaded, and cropped.
   - Group, align and tidy up.
3. **The agent loop.** Done 2026-11-26.
   - View context: what is selected, in view or being edited.
   - Comments pinned to elements, each with a cut-out picture.
   - Open questions shown with the agent's guess.
   - `artti wait`.
4. **The rest of the element set.** Done 2026-11-26.
   - Tables, working HTML embeds that keep their state, and link cards.
   - Stickers and face votes.
   - Timer, find, and downloading the board.

## Not yet matched (2026-11-26)

On one machine, the whiteboard now has everything above except:

- **A face sticker standing for a person.** With one person on one machine there is no one else to tell apart; it comes with sharing.
- **Many people:** everything in "Many people", which waits for sharing.

Two limits that come from the browser:

- **Pictures of embeds.** Pictures of the board show an embed as a label, because a sandboxed page cannot be drawn from outside it. A site that refuses to be embedded shows its address instead.
- **Dictation goes to a speech service.** The browser does the listening: Chrome sends the sound to Google's speech service, and Safari sends it to Apple's. macOS dictation (press fn twice) also works in any text box.
