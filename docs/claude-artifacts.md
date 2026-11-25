# artti and Claude Code artifacts (looked at 2026-11-25)

Sources: [code.claude.com/docs/en/artifacts](https://code.claude.com/docs/en/artifacts), [the launch post](https://claude.com/blog/artifacts-in-claude-code), [support article 9547008](https://support.claude.com/en/articles/9547008-publish-and-share-artifacts), and the Artifact tools and the Design type as Claude Code exposes them on Max's account.

## What artifacts are

A page Claude Code publishes from a session to a private claude.ai URL. It can be shared within an organization, with a public link, or with access levels: view, comment, or edit. Each publish is a new version at the same link, and earlier versions can be restored. People with the page open see updates live. Typed artifacts cover Design (artboards on a canvas, which viewers can select and edit in place), Docs, Sheets, Slides, Whiteboard (live cursors), Data, and Design System. Pages can keep a shared database and call connectors as the viewer.

Comments are threads. A thread reaches Claude only when someone who can edit the page activates it, with Send to Claude or `@claude`. An activated thread wakes the session at once, Claude replies in it and resolves it, and the replies are capped at 60 an hour. The Design type's comments are anchored (`customAnchors`), and Claude is told which artboard or selection the person has open.

Limits: Claude Code only, and only on the Anthropic API (not Bedrock, Vertex or Foundry, not `-p`). Not available under ZDR, HIPAA or CMEK. Content is stored on Anthropic's servers. The page itself must be a single file of at most 16 MB.

## Where artti is ahead

- **The same tool works for Codex and Claude Code.** It is a CLI plus a skill, and needs no account, plan or network.
- **Local and in the repository.** Screenshots of private mail and accounts never leave the machine.
- **A screen's versions side by side.** Every version of a screen stays on the board, in a row, across rounds. Artifacts keep versions of a page and show one at a time, and the docs mention no way to compare them.
- **A structured answer.** There is a verdict per screen and one submit per round. `artti wait` prints every comment with its position and a cut-out picture of the marked spot.
- **Cheap to make.** The agent writes data (`page.json`, `artti shot`), not HTML, so a page costs no output tokens for styling.

## Where artti falls short

1. **Only reachable on this Mac**: no phone, no other person, no link to send.
2. **Comments wait for the submit.** Artifacts deliver each activated thread as it happens and show Claude's reply and the resolved state in the thread. artti has replies but no resolved state, and no link from a comment to the version that answers it.
3. **HTML frames:** comments cannot be anchored to an element, nothing can be edited in place, and no picture is cut out. Design does all three.
4. **No notification** when the agent has replied or a new round is ready.
5. **Of the six planned types, only `verify` and `board` exist.** Docs, Slides, Sheets, Whiteboard and Data already exist as artifact types.
