# artt

Pages an agent puts its work on, and a way to answer on them that reaches the agent.

An agent makes a page (`artt new verify …`); you open it, pass or reject each item, pin comments on screenshots, and submit; `artt wait`, running in the agent's session, returns what you said. The agent replies under your comments and the open page updates.

```bash
pnpm install && pnpm build
ln -s "$PWD/src/cli.ts" ~/.local/bin/artt   # Node 24+ runs the TypeScript directly
artt --help
```

The agent side is the skill in [`skills/artt`](skills/artt/SKILL.md). Design: [docs/design.md](docs/design.md).
