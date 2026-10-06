# Handoff: Stride — local run training planner for macOS

## Overview
Stride is a macOS app that builds a running plan backward from a race goal and date, then keeps adjusting it. It runs entirely on the user's Mac. A **Claude skill** (invoked locally, e.g. via Claude Code / `claude` CLI) does the planning work: it generates the initial plan, re-plans after each logged run, and adjusts upcoming sessions for the forecast weather on the day. The UI never shows Claude directly; the only user-facing control is **Refresh plan**.

Core jobs:
1. Set a race (name, date, distance, goal time). The app can predict race times and suggest a goal from recent runs.
2. See the plan: weeks to race, this week, today's run.
3. Log runs, either manually (full detail) or from a screenshot that Claude parses.
4. Weather-driven changes are applied automatically, with a short plain-language note and Undo.

Sample data in the mocks: **Victor Harbour Half Marathon, Sun 6 Dec 2026**, goal **1:45:00 (4:58 /km)**, today = Tue 6 Oct 2026, week 4 of a 12-week plan, 61 days out. Weather location Victor Harbor, SA.

## About the design files
`Run Planner.dc.html` is a **design reference built in HTML**: it shows the intended look and behavior, and it is not production code. Recreate it natively. Recommended stack, since there is no existing codebase:
- **SwiftUI** (macOS 14+), single-window app plus a `MenuBarExtra`.
- **SwiftData** (or SQLite via GRDB) for local storage.
- **WeatherKit** or Open-Meteo (no key) for forecasts.
- The Claude skill is invoked as a subprocess (see "Claude skill contract").

Open the HTML in a browser (keep `support.js` next to it). It is a pannable canvas holding two rounds of exploration:
- **Round 2 (top): the chosen direction.** Soft and friendly, fully custom, km by default. Build this.
- Round 1 (bottom): earlier native-macOS style exploration. Reference only; ignore its styling.

In round 2, options **2a / 2b / 2c** are three alternative **Home** screens. Default to **2a** unless the user says otherwise (2b and 2c can become alternate layouts later). Screens **2d–2h** are drawn in the 2a style.

## Fidelity
**High fidelity.** Colors, type, radii, spacing and copy are final. Recreate pixel-close in SwiftUI. Numbers in the mocks are sample data.

## Window & navigation (all screens)
- Window default 1180×760, min ~1000×680. Background `#F6F0E7`. Window corner radius follows the system; content uses a custom title bar (hide the standard title, `.windowStyle(.hiddenTitleBar)`, keep the traffic lights).
- **Top bar**, 64pt tall, horizontal padding 22:
  - Traffic lights (system) → wordmark "Stride" (Bricolage Grotesque 700, 19pt, tracking −0.01em), 10pt left margin.
  - Nav pill group, 14pt left margin: container `#EDE4D8`, radius 999, padding 4, gap 2. Items: Home, This week, History, Race, Settings. Item padding 6×14, Figtree 600 13pt. Selected: bg `#2D2621`, text `#FFFAF3`. Unselected: transparent, text `#7A6E64`.
  - Right-aligned **Refresh plan** button: bg `#FFFDF9`, radius 999, padding 8×16, Figtree 600 13pt, shadow `0 1 2 rgba(60,40,20,.10)`. While a refresh runs, show a small spinner and the label "Refreshing…"; it's disabled until done.
- Content area padding: 4 top, 22 sides, 22 bottom. Card gap 18.

## Screens

### Home (2a, default)
Two columns: flexible left, 350pt right, gap 18.

**Left column**
1. **Countdown hero card**: bg `oklch(0.92 0.05 60)` ≈ `#F8DFC6`, radius 26, padding 26×28, vertical gap 20.
   - Chip "Half marathon · Sun 6 Dec": bg `rgba(255,253,249,.75)`, radius 999, padding 5×12, Figtree 600 12.
   - Row (align bottom, gap 24): "61 days" in Bricolage 700 68pt, tracking −0.035em, line-height 0.95. Below it, "until Victor Harbour Half Marathon" Figtree 15 `#5B4F45`. Right side: two stat stacks, **Goal** 1:45:00 / 4:58 /km and **Predicted** 1:44:50 / On track. Label Figtree 12 `#7A6E64`; value Bricolage 600 26 (predicted value colored `#A0532F`-ish, `oklch(0.5 0.12 45)`).
   - Progress: 12 equal segments, height 8, radius 99, gap 4. Completed and current weeks use apricot `oklch(0.72 0.13 50)`; future weeks use `rgba(255,255,255,.65)`. Caption "Week 4 of 12 · Base building" Figtree 12 `#5B4F45`.
2. **Weekly distance card**: bg `#FFFDF9`, radius 26, padding 22×26, fills the remaining height.
   - Header: "Weekly distance" Bricolage 600 17, right "Peak 58 km in week 10" Figtree 12 `#7A6E64`.
   - 12 bars, gap 10, radius 10, height proportional to km (max ≈120pt at peak). Above each bar its km value (Figtree 600 11); below it "W1…W12" (11). Bar colors: past `oklch(0.84 0.06 55)`, current apricot, future `#EFE6DA`. Current week's labels use `oklch(0.5 0.12 45)`; others `#A39789`.
   - Phase pills below, on the same 12-column grid: Base (W1–4), Build (W5–8), Peak (W9–10), Taper (W11–12). Pill radius 99, padding 4×10, Figtree 600 11.5. The current phase is filled with the hero tint and dark text; the others are `#F1E9DE` with `#7A6E64` text.

**Right column**
1. **Today card**: `#FFFDF9`, radius 26, padding 22. Lines: "Today · Tue 6 Oct" (12, `#7A6E64`), "Easy run" (Figtree 700 14, accent text), "8 km" (Bricolage 700 54), "5:50 /km · about 47 min" (13, `#5B4F45`), weather chip "19° · Sunny, light breeze" (bg `#F6F0E7`, radius 999, padding 6×12, 12.5/500), then a full-width **Log this run** button (bg `#2D2621`, text `#FFFAF3`, radius 999, padding 11, Figtree 600 13.5). It opens Log a run prefilled with today's session.
2. **Weather note card** (shown only when the plan changed for weather in the next 7 days): bg `oklch(0.95 0.025 230)` ≈ `#E9F2F8`, radius 22, padding 18×20. Title "Plan adjusted for the heat" Figtree 700 13.5, color `oklch(0.45 0.1 235)` ≈ `#2D5F86`. The body is the note text from the skill (13, line-height 1.5, `#3D3530`). Footer "Updated 6:02 am · Undo" (12). **Undo** reverts that change set.
3. **Coming up card**: the next 4 non-rest sessions. Each row has the day (34pt wide, `#7A6E64`), the type (key sessions such as tempo, intervals and long runs in accent text, 600), and the distance. Rows are divided by 1px `rgba(60,40,20,.07)`.

### This week (2e)
- Header row: "5 – 11 October" (Bricolage 700 30), "Week 4 of 12 · 45 km" (13, `#7A6E64`). Prev and next week buttons are 32pt white circles.
- **Weather change banner**, sky tint, radius 22. Title "We swapped Wednesday and Thursday" followed by the explanation. Right side: "Applied 6:02 am" and an **Undo** pill.
- Body: a 7-column grid of day tiles plus a 320pt detail panel on the right.
  - **Day tile**: radius 22, padding 14. Shows the day and date, then type (700 13), distance (Bricolage 700 26), and pace or structure (12). Weather sits at the bottom (11.5), and below it a tag (700 11).
  - Tile variants: **today** has bg `#F8DFC6` and a 2px apricot border, tag "Today". **Moved** has the sky-tint bg and tag "Moved for weather" in sky text. **Rest** has bg `#F1E9DE` and gray type. **Done** is at 50% opacity, tag "Done". Hot or bad weather text is sky colored.
  - Clicking a tile selects it, and the detail panel shows that day.
- **Detail panel** (white, radius 24): date, then "Tempo · 10 km" (Bricolage 700 22), then the duration. Structure rows sit on `#F6F0E7`, radius 12; the main set row is hero-tinted and bold. Hourly forecast shows 5 cells; the recommended window is tinted sky and labelled "Best window 6–8 am, light wind". **Log this run** button at the bottom.

### Race (2d): predictions and goal
Two equal columns.
- **Predicted race times** card: a 2×2 grid of tiles for 5 km, 10 km, Half and Marathon (radius 18, `#F6F0E7`; the user's race distance tile is hero-tinted). Each tile shows the distance, the time (Bricolage 700 28) and the pace. Below the grid is a mini trend chart of the race-distance prediction over the last 6 weeks, with the caption "2:40 faster since 7 Sep".
- **Improve the prediction** card: a dashed drop zone ("drop a screenshot of a good run" in monospace) and the "Currently using" run. **Choose from history** opens a picker. Dropping a screenshot runs the same parse flow as 2g, then marks the run as a benchmark.
- **Your goal** card: "Victor Harbour Half Marathon · Sun 6 Dec · 21.1 km". It offers four radio rows: Comfortable 1:48:00, **Realistic 1:45:00** (pre-selected because it matches the prediction; hero tint and 2px apricot inset border), Stretch 1:42:30, and My own time (h:mm:ss field). Each row shows the time (Bricolage 700 22) and pace. Below the rows is race-day pacing in 4 segments. Footer: "Changing your goal rebuilds the remaining 8 weeks." and a **Save goal** button. Saving triggers a full re-plan.
- The same goal UI is used when **adding a new race**. That flow adds name, date and distance fields at the top; distance options are 5K, 10K, Half, Marathon and Custom.

### History + Log a run, manual (2f)
- Left: a 400pt white card titled "Your runs". Each row shows the type (700 13.5), a meta line (date · time · pace), a source badge ("Manual" on `#F1E9DE`, or "Screenshot" on sky tint) and the distance (Bricolage 700 16).
- Right: **Log a run** card with a segmented control "Enter manually | From screenshot".
  - Fields: Date, Type (Easy, Tempo, Intervals, Long, Recovery, Race, Other), Distance (km), Time. Fields sit on `#F6F0E7`, radius 12, padding 10×12.
  - Live derived line: "Average pace **5:44 /km**, 6 s faster than planned". Compare against the planned session for that date, if there is one.
  - Effort: 10 buttons (1–10), height 34, radius 10. Selected is `#2D2621` with white text. Header shows the label for the selected value (e.g. "6 · Comfortably hard").
  - Splits (optional): one chip per km plus a dashed "+ km N" button. "Paste from clipboard" parses lines of m:ss.
  - Notes: multiline text.
  - Cancel / **Save run**. Saving triggers a background refresh.
- Validation: distance > 0 and time > 0 are required, and pace must be between 2:30 and 15:00 /km (warn outside that range). Split count may not exceed ceil(distance).

### Log from screenshot (2g)
- On the left, a 240×380 drop zone: drag, paste (⌘V) or choose a file.
- On parse, the app sends the image to the skill and shows the extracted fields as editable tiles: date/time, distance, time, avg pace, avg HR, elevation, and splits. A field the skill couldn't read gets a hero tint, an apricot inset border and the label "<Field> · couldn't read".
- The user adds effort and optional notes, then saves.
- Footer copy: "The screenshot stays on this Mac."
- States: idle (drop zone), parsing (drop zone with spinner, "Reading your screenshot…"), review (as shown), error ("Couldn't read this screenshot. Try another or enter manually.").

### Settings (2h)
A single white card, 600pt wide.
- **Units**: segmented "km · °C" (default) | "mi · °F". This converts all display values; store everything internally in metric.
- **Run days**: 7 round toggles (42pt). On = `#2D2621` with white text; off = white with `#A39789` text. Helper text: "5 days a week. Rest falls on the others." Changing run days triggers a re-plan.
- **Long run day**: a dropdown (default Sunday). Helper text: "Weather can still move it a day either way".
- **Export plan**: "Add to Calendar" creates and updates an EventKit calendar named "Stride" (or exports a subscribable .ics). "Export CSV" exports the full plan with paces.

### Optional, from round 1: Menu bar extra (1e)
Shows today's run, the weather, the next 3 sessions, **Refresh now** and **Open Stride**. Menu bar title: "8 km · 19°". Restyle it with the round-2 tokens.

## Interactions & behavior
- **Refresh plan**: runs the skill with the full context (see below). Automatic triggers: daily at 6:00 and 18:00 (via `NSBackgroundActivityScheduler` or a LaunchAgent), after a run is saved, and after a goal or settings change. Don't run two refreshes at once; queue them.
- **Weather adjustments**: auto-applied. Each adjustment is stored as a change set (`before`, `after`, `reason`, `appliedAt`). **Undo** restores `before` and marks the change set reverted, so the skill won't re-apply it for the same forecast.
- **Log this run** opens Log a run prefilled with the planned type, distance and date.
- Hover states: pills and buttons darken by about 4% (`#2D2621` → `#1F1915`; white → `#F6F0E7`). Cards are static.
- Transitions: 150–200ms ease-out on selection changes. Animate plan changes after a refresh: changed tiles crossfade and the sky-tint background fades in.
- Empty state (no race yet): Home shows a single hero card, "What are you training for?", with **Set up a race** opening the Race setup flow.

## Data model (suggested)
```
Race        { id, name, date, distanceKm, goalSeconds, location {name, lat, lon} }
Settings    { units: metric|imperial, runDays: [Weekday], longRunDay: Weekday }
PlanWeek    { index, startDate, phase: base|build|peak|taper, plannedKm }
Session     { id, date, type, distanceKm, targetPaceSecPerKm?, structure: [Step], notes?, status: planned|done|skipped, movedFrom?: date }
Step        { label: warmup|main|cooldown|rep|recovery, distanceKm|durationSec, paceSecPerKm }
Run         { id, date, type, distanceKm, durationSec, avgHr?, elevationM?, effort 1–10, splits: [sec], notes?, source: manual|screenshot, screenshotPath?, isBenchmark }
Prediction  { computedAt, times: {5k,10k,half,marathon}, raceDistanceSeconds }
ChangeSet   { id, createdAt, kind: weather|run|goal|settings, reason: String, before: [Session], after: [Session], reverted: Bool }
Forecast    { date, hourly: [{time, tempC, windKph, windDir, precipPct, condition}] }
```

## Claude skill contract
The app writes a JSON request file and calls the skill as a subprocess (e.g. `claude -p --skill stride-planner < request.json`, or whatever invocation the local Claude setup supports). The skill returns JSON on stdout. Keep the skill in the repo at `skills/stride-planner/SKILL.md`.

Request:
```json
{ "task": "refresh" | "build_plan" | "parse_screenshot" | "predict",
  "today": "2026-10-06",
  "race": {...}, "settings": {...},
  "plan": { "weeks": [...], "sessions": [...] },
  "recentRuns": [ ...last 8 weeks... ],
  "benchmarkRun": {...} | null,
  "forecast": [ ...next 7 days hourly... ],
  "revertedChangeSets": [ ... ],
  "imagePath": "…" }
```
Response:
```json
{ "sessions": [ ...upcoming sessions, full replacement from today... ],
  "weeks": [ ... ],
  "prediction": { "5k": 1355, "10k": 2825, "half": 6290, "marathon": 13210 },
  "goalOptions": { "comfortable": 6480, "realistic": 6300, "stretch": 6150 },
  "changes": [ { "kind": "weather", "reason": "Thursday is forecast to reach 35°…", "sessionIds": ["…"] } ],
  "parsedRun": { "...fields...": "...", "unreadable": ["elevationM"] } }
```
The app diffs the returned sessions against the current ones to build each ChangeSet. Notes shown in the UI come verbatim from `changes[].reason`. Skill rules: keep weekly volume within ±10% when moving sessions for weather, never schedule two hard days in a row, and keep a rest or easy day before the long run. Each note is 1–2 sentences in plain language, never mentions Claude, and uses the user's units.

## Design tokens
Colors:
- Background `#F6F0E7`. Card `#FFFDF9`. Inset field `#F6F0E7`. Muted fill `#F1E9DE`. Nav track `#EDE4D8`. Dashed border `#E3D8CA`. Effort/day ring `#EDE4D8`.
- Ink `#2D2621`. Body secondary `#5B4F45`. Muted `#7A6E64`. Faint `#A39789`. Body on tint `#3D3530`. Ink-on-dark `#FFFAF3`.
- Apricot accent `oklch(0.72 0.13 50)` ≈ `#E8955E`. Accent text `oklch(0.5 0.12 45)` ≈ `#A0532F`. Hero tint `oklch(0.92 0.05 60)` ≈ `#F8DFC6`. Past bars `oklch(0.84 0.06 55)` ≈ `#E8C4A3`. 2c hero `oklch(0.86 0.08 55)` ≈ `#F2C9A0`.
- Weather sky `oklch(0.72 0.1 230)` ≈ `#6FA9D4`. Sky text `oklch(0.45 0.1 235)` ≈ `#2D5F86`. Sky tint `oklch(0.95 0.025 230)` ≈ `#E9F2F8`.
- Divider `rgba(60,40,20,.07)`.
- Rule: apricot means today, the current week and key sessions. Sky is used **only** for weather-driven changes.

Typography:
- Display and numbers: **Bricolage Grotesque** (600/700). Sizes 150 (2c hero), 68, 54, 44, 30, 28, 26, 22, 20, 18, 17, 16. Tracking −0.02 to −0.05em at large sizes.
- UI: **Figtree** (400/500/600/700). Sizes 15, 14, 13.5, 13, 12.5, 12, 11.5, 11, 10.5.
- Both fonts are on Google Fonts (OFL); bundle them in the app.

Radii: 999 (pills/buttons), 32 (2c hero), 26–28 (main cards), 22–24 (secondary cards/tiles), 18 (option rows), 12–16 (fields/rows), 8–10 (small chips/bars).
Spacing: 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 26, 28.
Shadow: window `0 0 0 .5 rgba(60,40,20,.25), 0 24 60 rgba(60,40,20,.16)`. Floating button `0 1 2 rgba(60,40,20,.10)`. Cards otherwise flat.

## Assets
No image assets. Traffic lights are system controls. The striped boxes are drop zones and screenshot previews, not imagery. Use SF Symbols where a glyph is needed (chevrons, the refresh spinner, weather condition icons if desired).

## Files
- `Run Planner.dc.html`: the full design canvas. Round 2 (`#t2`) is the spec; screens are anchored as `#2a`–`#2h`.
- `support.js`: runtime needed to open the HTML in a browser.
