# artti

Pages an agent puts its work on, and a way to answer on them that reaches the agent.

An agent makes a page (`artti new verify …`); you open it, pass or reject each item, pin comments on screenshots, and submit; `artti wait`, running in the agent's session, returns what you said. The agent replies under your comments and the open page updates.

Pages come in three kinds:

- **verify**: finished work, item by item, to pass or reject.
- **board**: options side by side, to pick from.
- **whiteboard**: an infinite canvas you and the agent both draw on, with shapes, arrows, notes, tables, pen, images, working HTML embeds, sticker votes and pinned comments. `artti board view` tells the agent what you changed since it last looked.

Everything stays on your machine: no account, no upload. The agent side is a command-line program and a skill, so any agent that can run a command works (Claude Code, Codex, a plain terminal); there is no MCP server and no hook.

```bash
pnpm install && pnpm build
ln -s "$PWD/src/cli.ts" ~/.local/bin/artti   # Node 24+ runs the TypeScript directly
artti --help
```

The agent side is the skill in [`skills/artti`](skills/artti/SKILL.md). Design: [docs/design.md](docs/design.md).

## License

[MIT](LICENSE)
