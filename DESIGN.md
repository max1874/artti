# Design record

Max's verdicts on artti's own interface, newest last.

## A canvas, not a document (Max, 2026-11-24)

- **Rejected:** the first viewer, one scrolling document with sections (没验证到的 / 画面 / 验证过的), verdict buttons on each row and a submit bar at the bottom. Max: "不对吧，感觉不是我想要的画板ui".
- **Wanted:** an artboard, as in Ryugi: a pannable, zoomable canvas where each option or screen is its own frame side by side, grouped under a labelled heading, the agent's reasoning on a sticky note beside them, and a small floating bar for the round and Submit. Verify puts what was approved next to what was built, with the verdict on the group.

## Versions of a screen, not a checklist (Max, 2026-11-24)

- **Rejected:** the verify report as a frame of text rows (没验证到的 / 验证过的), each with 接受 / 要补上 or 通过 / 不信 buttons and a 评论 link. Max: "这样没意义吧".
- **Wanted:** "我们需要的是看到每个版本 ui 的变化". A screen keeps every version it has had; the board shows each screen as a row of its versions, oldest to newest, the one under review marked. Gaps in verification are a note beside it, not buttons.

## The newest version must be found at a glance (Max, 2026-11-27)

- **Shown:** the verify page "Dou UI 重写：划线，已装到两台 Mac" (dou-agent), seven screens as rows of 1 to 8 versions each, the newest at the right end of its row with a small "本轮" badge, zoomed to fit.
- **Rejected:** having to hunt for it. Max: "给用户的第一感觉是要去找，最新的 version 是哪个". Rows of different lengths put the newest at a different place on every row, the badge is unreadable at fit zoom, and versions from an abandoned direction weigh as much as the one under review.
- **Still wanted:** every version stays visible (the 2026-11-24 verdict above). The fix is where the newest sits and how it reads, not hiding the history. No layout chosen yet.
