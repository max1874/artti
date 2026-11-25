# artti

## Why artti exists

Agents show their work as screenshots in a folder and paragraphs in a terminal, and Max answers by typing in the terminal about "the third image, top left". Max, 2026-11-24: "我觉得我们老是用截图+folder 管理太不优雅了", pointing at [Ryugi](https://github.com/Innei/ryugi), then "我们来 build 一个属于我们自己的 Ryugi".

artti gives an agent pages to put its work on and gives the person a way to answer on them: pick an option, comment on any spot, pass or reject a result. The answer goes back to the agent session that made the page, without the person typing in the terminal.

The outcome to observe: a person's pick, comment or verdict made on a page reaches the waiting agent session as the result of `artti wait`, and the page shows the agent's reply. Everything else (looks, types, storage) serves that loop.

## Settled decisions (Max, 2026-11-24)

- Its own repository, its own name: `artti` (Max picked it over the first proposal `artt`; `ark` collides with Huawei ArkUI and Volcengine Ark; `crit` is taken by a near-identical tool, crit.md).
- All six page types from Ryugi's set: board, doc, whiteboard, bench, deck, verify. Original design, nothing copied from Ryugi; its app is proprietary.
- The whiteboard matches Claude's Whiteboard in full (Max, 2026-11-25: "全面对标 claude 的白板功能"). He chose this over narrowing artti to verify and board once Claude's own Docs, Whiteboard and Slides existed. What Whiteboard does is in docs/claude-artifacts.md. Build it for one machine first and finish that; sharing with other people comes after (Max, 2026-11-25: "先做成一个单机的，把单机做完再考虑 share 的事情"). Max does not sign in to claude.ai on the web, so the benchmark is Whiteboard's own instructions and the front-end code it ships, read for its mechanisms and never copied. The whiteboard is our own code on artti's canvas, not built on Excalidraw or tldraw (Max, 2026-11-25: "完全自己写"). He chose this over Excalidraw, which would have given about 60% of the editing at once, and tldraw, whose license needs a paid key or a watermark once shared.
- Where images live is the user's choice, not artti's: local, git, or an image host, behind one storage interface ("那是使用者需要考虑的？也可以支持图床，也可以支持纯本地，也可以支持 git").
- The tool reaches agents as a command-line program plus a skill, never an MCP server or a hook (Max's global rule). The long-running local part is a Swift macOS app (global rule); the pages are web, so they render in the app, a browser and a phone alike.

## Working here

Read [docs/design.md](docs/design.md) before changing the format, the CLI or the server. Code, commits and docs are in English; the UI speaks the user's language (Chinese first).
