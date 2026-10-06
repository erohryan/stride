# Stride

A local running training planner. Set a race and goal, and Stride builds a plan backward from race day, then keeps adjusting it after each run and for the weather. Planning is done by a local Claude skill (`skills/stride-planner`), invoked through the `claude` CLI.

Electron + React + TypeScript, SQLite (better-sqlite3), Open-Meteo for weather. It lives in the menu bar; closing the window keeps it running there.

## Develop

```sh
npm install
npm run dev        # hot-reloading app
npm run typecheck
npm run build && npm start
```

The database lives in the Electron userData folder (`~/Library/Application Support/stride/stride.db` on macOS).

`scripts/capture.sh shot.png [data-dir] [js]` (after `npm run build`) renders the window to a PNG (and its text to `shot.png.txt`) using an isolated data folder, optionally running some JS in the page first.

## The planner

`skills/stride-planner/SKILL.md` is the planning brain. The app runs it through the `claude` CLI in headless mode (`claude -p --json-schema …`, with the skill as the system prompt and no tools except Read for screenshots), checks the result against the training rules in `src/shared/planner.ts`, retries once with the problems if a rule is broken, and stores the plan. The last request and response for each task are kept in `<userData>/planner/` for debugging. The skill is also linked into `.claude/skills/`, so you can try it by hand in Claude Code.

Environment overrides:

- `STRIDE_CLAUDE_PATH` — the claude binary (otherwise found via your login shell, then the usual install paths).
- `STRIDE_CLAUDE_MODEL` — model alias (default `sonnet`).
- `STRIDE_DATA_DIR` — use a different data folder (handy for testing).

A full plan build takes two to four minutes; refreshes that change nothing are much quicker.

`scripts/seed-weather-fixture.py <data-dir>/stride.db` adds a sample forecast (hot Thursday), a weather swap and a logged run to a plan built for early October 2026, for checking the weather states on screen.

## Tests

`npm test` runs unit tests. `STRIDE_LIVE=1 npx vitest run tests/live.test.ts` calls the real planner (costs a little; takes a few minutes).

## Layout

- `src/main` — Electron main process: window, tray, SQLite store, IPC, planner runner.
- `src/preload` — the `window.stride` bridge.
- `src/renderer` — React UI. Design tokens are in `src/styles/global.css`.
- `src/shared` — types and helpers used by both sides.
- `skills/stride-planner` — the Claude skill that does the planning.
- `design/` — the design handoff (open `Run Planner.dc.html` in a browser; round 2 is the spec).

## Build stages

1. Shell: scaffold, tokens and fonts, window chrome, tray, SQLite store. ✅
2. Onboarding (about you → race and goal), the planner skill and its runner, Refresh plan. ✅
3. Home (2a) and This week (2e). ✅
4. History and logging runs (manual and from a screenshot), Race (predictions, goal).
5. Settings and export, Open-Meteo weather with change sets and Undo, scheduled refreshes, tray summary.
