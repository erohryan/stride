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

`STRIDE_CAPTURE=shot.png npx electron .` (after `npm run build`) renders the window to a PNG and exits.

## Layout

- `src/main` — Electron main process: window, tray, SQLite store, IPC, planner runner.
- `src/preload` — the `window.stride` bridge.
- `src/renderer` — React UI. Design tokens are in `src/styles/global.css`.
- `src/shared` — types and helpers used by both sides.
- `skills/stride-planner` — the Claude skill that does the planning.
- `design/` — the design handoff (open `Run Planner.dc.html` in a browser; round 2 is the spec).

## Build stages

1. Shell: scaffold, tokens and fonts, window chrome, tray, SQLite store. ✅
2. Onboarding (about you → race and goal), the planner skill and its runner, Refresh plan.
3. Home (2a) and This week (2e).
4. History and logging runs (manual and from a screenshot), Race (predictions, goal).
5. Settings and export, Open-Meteo weather with change sets and Undo, scheduled refreshes, tray summary.
