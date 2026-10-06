# Stride

A local running training planner. Set a race and goal, and Stride builds a plan backward from race day, then keeps adjusting it after each run and for the weather. Planning is done by a local Claude skill (`skills/stride-planner`), invoked through the `claude` CLI.

Electron + React + TypeScript, SQLite (better-sqlite3), Open-Meteo for weather. It lives in the menu bar; closing the window keeps it running there.

## Install for everyday use

```sh
npm install
npm run package          # builds dist/mac-arm64/Stride.app
cp -R dist/mac-arm64/Stride.app /Applications/
```

The app isn't code-signed, so the first time, right-click Stride.app → Open. Then turn on Settings → Open at login so reminders and the 6:00/18:00 weather checks keep running. Stride needs the Claude Code CLI installed and signed in (`claude`); it always uses your claude.ai subscription, never an API key.

## Develop

```sh
npm run dev        # hot-reloading app
npm run typecheck
npm test
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
- `STRIDE_NO_WEATHER` — don't fetch forecasts (keeps a fixture forecast in place).

A full plan build takes two to four minutes; refreshes that change nothing are much quicker.

`scripts/seed-weather-fixture.py <data-dir>/stride.db` adds a sample forecast (hot Thursday), a weather swap and a logged run to a plan built for early October 2026, for checking the weather states on screen.

## Logging runs and reminders

Screenshots are the quickest way in: drop, paste (⌘V) or choose one or more on History (or on Race, to set a benchmark). Stride copies them into `<userData>/screenshots` (HEIC is converted to JPEG), and Claude reads them with only the Read tool and only that folder. It groups the images by run, so a summary and a splits screen become one run, and screenshots of different runs come back separately. You check the numbers, add effort, and save. Saving marks the planned session done and starts a refresh.

The morning after a planned run (8 am by default), if nothing was logged for it, Stride sends one notification; clicking it opens Log a run for that session. Runs waiting to be logged also show in the menu bar menu and at the top of History, where "Didn't run" marks them skipped.

## Weather, refreshes and the menu bar

Forecasts come from Open-Meteo (no key) for your home location, refreshed every few hours. At 6:00 and 18:00 Stride checks whether the weather picture for run times has changed (heat, strong wind, heavy rain); only then does it ask the planner to adjust, so quiet days cost nothing. Saving a run, changing the goal or the training week, and Refresh plan all re-plan too, with a fresh forecast first. Weather changes are applied automatically with a note and Undo.

The menu bar shows today's run ("8 km · 19°"). Click it for today at a glance, runs to log, what's next, Refresh now and Open Stride; right-click for the menu.

Settings → Add to Calendar subscribes Calendar to a live feed Stride serves on `127.0.0.1:48761`, so events move with the plan while Stride runs. Export CSV writes the full plan with paces.

## Tests

`npm test` runs unit tests. `STRIDE_LIVE=1 npx vitest run tests/live.test.ts` calls the real planner: predictions, a full build, and reading the screenshots in `tests/fixtures` (rendered from the HTML next to them with `npx electron scripts/render-html.cjs in.html out.png`).

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
4. History and logging runs (manual and from screenshots), missed-run reminders, Race (predictions, goal). ✅
5. Settings and export, Open-Meteo weather with change sets and Undo, scheduled refreshes, menu bar title and panel, packaging. ✅
