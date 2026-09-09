# n8n — Framework Call Tracker

Everything the dashboard reads comes from here. Import
`framework_call_tracker_v5.json` and the three webhooks below exist, wired and
active.

---

## The three webhooks

Base: `https://srv1853541.hstgr.cloud`

| Method | Path | What it does | Who calls it |
|---|---|---|---|
| GET | `/webhook/framework-tracker/data` | Reads the grid **and** `_CallLog`, joins them, judges every attempt, returns the whole dataset | **The dashboard.** Its only fetch |
| GET | `/webhook/framework-tracker/functions` | The list of function tabs | Nothing today — kept for a picker |
| POST | `/webhook/framework-tracker/log` | Appends one status change to `_CallLog` | The Apps Script entry form. **Not** the dashboard |

The dashboard is **read-only**. It never POSTs to `/log`; that URL is
deliberately absent from `src/config.js` so a future edit cannot reach it by
accident. The `/log` endpoint is what fills the `history` array the dashboard
displays.

### Flow of each

```
/data       Webhook - Data
              -> HTTP - Sheet Tabs          (tab titles)
              -> Build batchGet URL         (one request for every tab)
              -> HTTP - Load All Tabs       (the grid)
              -> HTTP - Load Log            (_CallLog)
              -> Parse Framework Calls      (the join + every verdict)
              -> Respond - Data

/functions  Webhook - Functions -> HTTP - Sheet Tabs (Functions)
              -> Filter Function Tabs -> Respond - Functions

/log        Webhook - Log -> Build Log Row
              -> Sheets - Append Log Row -> Respond - Log
```

### The two spreadsheets

| Role | Spreadsheet ID | Read by |
|---|---|---|
| Grid — start dates, statuses, end dates | `1Cer9SIAzrp0EYOx82w6P71JWOOSF5L76XldzGKfV78M` | `HTTP - Sheet Tabs`, `Build batchGet URL`, `HTTP - Sheet Tabs (Functions)` |
| `_CallLog` — status events | `1J-3UtCH4ZT1ewLdjGgDeoGrK6iNqVYMI5rbs_eqget4` | `HTTP - Load Log`, `Sheets - Append Log Row` |

All six HTTP nodes authenticate with the same Google **service account**
credential (`5BbadQKQl6I0DKSx`). Both sheets must be shared with that service
account's email or the nodes 403.

CORS: `/data` and `/functions` return `Access-Control-Allow-Origin: *`, so the
dashboard can be served from anywhere. A CORS error in the browser means the
request never reached the Respond node — check the workflow is active.

---

## What changed in v5

**1. Completion no longer comes from `_CallLog` alone.**

v4 read completion only from the log and ignored the grid's `End Date - Fn`
columns. But the log only began on 26 Aug 2026, while start dates run back to
June: 96 attempts carry an end date and only 21 have a log event. The other 75
were read as started-and-never-closed, which is what pushed the dashboard to
82% delay-pending. A join problem, not a delivery problem.

v5 still prefers the log — it has a real timestamp and the full history — and
falls back to the grid's end date **only** when an attempt has no log outcome.
Every row now carries `closedFrom`, and the payload counts both sources, so
they can never be silently confused:

| `closedFrom` | meaning |
|---|---|
| `log` | a `_CallLog` outcome closed it (timestamped) |
| `grid` | no log event; the End Date column closed it (date only) |
| `''` | still open |

Effect on the same data: closed 21 → 97, delay-pending 101 → 24, on time
1.6% → 17.9%.

**2. `/functions` never worked.** It filtered tabs on `/^FUNCTION/i`, which
needed a tab named `FUNCTION 1: …`. The real tabs are named for the function
(`TEAM AND PEOPLE LEADERSHIP`, …), so nothing matched and it always returned
`{"functions":[]}`. It now recognises a tab by the same `FRAMEWORK_SETS`
patterns the parser uses, and still accepts the old naming. Matches all 6 tabs.

**3. The response carries `parserVersion: "v5-2026-09"`** — the quickest way to
tell which parser is deployed.

---

## Deploying

`framework_call_tracker_v5.json` is your own exported workflow with **only the
two Code node bodies swapped**. Name, workflow id, versionId, all three webhook
paths, their methods, the Google credential and every connection are byte-for-
byte as you exported them — so importing updates the existing workflow rather
than creating a second one that would fight over the same webhook paths.

Either:

- **Import** `framework_call_tracker_v5.json` (15 nodes, all three webhooks), or
- **Paste** the body of `parse-framework-calls.js` into the *Parse Framework
  Calls* Code node, and the `Filter Function Tabs` code if you want
  `/functions` fixed too.

Then open the `/data` URL. If the response starts with `"parserVersion":
"v5-2026-09"` it took.

`parse-framework-calls.js` is the source of truth for that node — it is the
same file `tools/build-fixture.mjs` runs locally, so the preview and n8n cannot
drift apart. If you edit the node in n8n, copy it back.

---

## Still open

- **`SLA_HOURS = 48`.** The dashboard now words its labels from the `slaHours`
  the response carries, so it reads "2-day window" and matches. If the target
  really is 24 hours, change `SLA_HOURS` in the parser — the labels follow.
- **Two attempts have log events but no start date** — `Akshar Enterprises
  F24 A1` and `Akshay Jewellers F10 A1`. They surface as bad dates. Finance
  (F24–F29) has no start dates in the grid at all.
- **The log is thin** — 36 events against 122 started attempts. v5 makes the
  numbers correct without it, but if you want `_CallLog` to be the single
  source of truth long term, the 75 grid-only closures need backfilling.
