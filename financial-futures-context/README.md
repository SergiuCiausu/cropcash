# Financial Futures — context pack for Claude Code

Copy everything in this folder into the root of your app repository.

- `CLAUDE.md` is loaded automatically by Claude Code. It holds the always-on rules and a map of which file to read for which task.
- `docs/` holds the detail, split by topic so Claude Code only reads what a task needs.
- `fixtures/ana/` holds the JSON your mock bank server and mock app API return. Numbers reconcile: each account's
  transactions add up to its balance, and October totals match the cash-flow response.

Files marked DRAFT (`docs/screens.md`, `docs/design.md`) are first proposals; edit them with your own decisions, and fill
in the Stack section of `CLAUDE.md` once you choose one.

Sources: "Financial Futures App: Build Plan" and "Financial Data Operations" (Claude Docs), as of 2026-11-07.

A good first prompt: "Read CLAUDE.md, then build the mock bank server that serves fixtures/ana/ on the paths in docs/data/bank-api.md."
