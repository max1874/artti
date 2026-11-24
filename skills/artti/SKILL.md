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
   when it exits). It prints each verdict, pick and pinned comment with its id, then `SUBMITTED` and any overall note.
5. Act on it, then answer each comment where it was made: `artti reply --to <comment id> "<what you did>"`. A new capture
   is a new `artti shot` and, for another round, a new `artti new verify`.
6. When the person passes everything: `artti status passed`.

Evidence that is not a screen (commands run, their output) goes in your report in the terminal, not on the page.

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
