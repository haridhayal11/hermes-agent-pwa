<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Installing this app

If you were asked to set this up on someone's machine, read `SETUP.md` — it is
the whole runbook, written for you rather than for a human.

# Working on this app

`CLAUDE.md` is the design document: the architecture, the invariants, and the
Hermes API constraints that were verified against a running gateway rather than
its docs. Read it before changing the streaming path, the instruction composer
or anything to do with push.
