---
name: artti
description: Put work in front of the person as a page they answer on, instead of screenshots in a folder and paragraphs in the terminal — a verify page for finished work (screens, what was checked by running it, what was not), a board of options to pick from — then wait for their verdicts, picks and pinned comments to come back. Use whenever a task ends with something the person should look at or decide, when proposing more than one direction, and when the person says "artti", "show me", "let me pick", or "put it on a page".
---

# artti

`artti` makes pages in the project's `.artti/` directory and serves them at `http://localhost:7317`. The person answers on the page; `artti wait` returns their answer to you.

## Which page

- **verify** — work is done and the person decides whether it is right. Use it at the end of every task that changed something visible or runnable.
- **board** — more than one way it could look or work. Draw every option; mark the one you recommend.
- doc, whiteboard, bench, deck — not built yet; say so rather than faking one.

## The loop

1. Write the body as JSON and create the page:

   ```bash
   artti new verify --title "<what was done>" --body body.json
   ```

   It prints the page directory and its link. Put images in the page's `assets/` and refer to them as `assets/<file>`.
2. Show it: `artti open` (opens the browser on the newest page), and tell the person the link.
3. Wait in the background, so you stay free: `artti wait` (Claude Code: run it as a background command; you are notified when it exits). It prints each verdict, pick and comment, with comment ids, then `SUBMITTED` and any overall note.
4. Act on it. Answer each comment where it was made: `artti reply --to <comment id> "<what you did>"`. Update `page.json` when the work changes; the open page refreshes by itself.
5. When the person passes everything: `artti status passed`. If more rounds are needed, `artti wait` again.

## verify body

```json
{
  "summary": "One or two sentences: the result, in words the person could repeat.",
  "unverified": [{ "id": "android", "text": "What was not checked", "why": "Why not, and what would check it" }],
  "screens": [{ "id": "home", "image": "assets/01.png", "before": "assets/01-before.png",
                "scenario": "What was done to get here", "observed": "What the screen shows that matters",
                "environment": "Device, build, data, URL" }],
  "claims": [{ "id": "api", "text": "What was checked by running something", "evidence": "the command and its raw output" }]
}
```

- `unverified` shows first on the page. Put every gap there; an empty list is a claim too.
- A claim needs `evidence` from a real run. A build or a passing type check is not evidence that the feature works.
- Screens are real captures of the running product, never mockups, with `before` when the change is visual.

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
