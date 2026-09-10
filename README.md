# Framework Tracker

A dashboard for framework-wise client calls: every attempt, its status, its
history, and how it did against the SLA.

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>. `npm run build` produces `dist/`, which is a
plain static folder — any web host will serve it.

The webhook is already in the code, in **[`src/config.js`](src/config.js)**.
There is no `.env` and nothing to configure: install, run, and it connects.
Moving to a different n8n instance is a one-line change to `N8N_HOST` there.

---

## Where the data comes from

Two GET endpoints on the n8n **Framework Call Tracker** workflow:

| | |
|---|---|
| `/webhook/framework-tracker/data` | every attempt, parsed. Everything on screen comes from this. |
| `/webhook/framework-tracker/functions` | the tab list. |

The workflow reads the function tabs, joins them against the `_CallLog` sheet,
applies the SLA and hands back finished rows. Each row carries `startDate`,
`dueDate`, `calledDate`, `currentStatus`, `outcome`, `verdict`, `lateHours`,
`lateDays`, `reopened` and a `history` array built from the log.

**Health check** — open the data URL in a browser. A good response starts with
`generatedAt` and carries `slaHours: 48` and a `rows` array. No `rows` means an
older workflow is deployed; re-import
[`n8n/framework_call_tracker_n8n_workflow.json`](n8n).

---

## It only reads

**Nothing in this app writes.** There was once a status dropdown in the calls
table that POSTed to `/framework-tracker/log`; it is gone. Changing a shared
operational record from a reporting dashboard was the wrong place for it.
Statuses are changed in the tracker sheet.

The Status column shows the value, tinted by the row's SLA state so Status and
Outcome agree at a glance rather than colouring by two different rules.

With the control went the whole write path — the handler, the before/after
guard that protected it, the POST helper, the error banner, and the `log` URL
in `config.js`. What used to be guaranteed by comparing values before writing is
now guaranteed by there being nothing to write with, which is a far easier
property to keep true. A test walks `src/` and fails if a mutating fetch, the
log endpoint or a status-write helper ever reappears:

```bash
npm run test:status
```

The `/log` endpoint still exists in n8n and is still what fills the `history`
array on every row. This app displays that history — per attempt, in the client
detail view — it just never adds to it.

---

## Reading the columns

Three are easy to confuse, so they are worth stating plainly:

| Column | Means | From |
|---|---|---|
| **End** | the day the work **finished** | the sheet's `End Date - Fn` column |
| **Days** | how long the call took, start to finish | computed from Start and End |
| **Late** | how far past the deadline the advisor **first acted** | the backend's `lateDays` |

**All the day counts are working days. Sunday is never counted.**

### End comes from the sheet, not from the log

The tracker sheet holds three columns per framework — `Start Date - Fn`,
`Fn Status`, `End Date - Fn` — and **End Date is the day the call happened**. A
`_CallLog` row is written when somebody *types* a status, and the two are
routinely days apart: one attempt was completed on the 5th and recorded on the
7th.

The parser used to read only the Start Date column, so `startDate` came from the
sheet while every closing date came from the log. Mixing those two sources
inside one measurement was the bug, and because a log timestamp can only ever be
*later* than the call, the error always ran one way — advisors charged for slow
data entry rather than slow calling.

Since **parser v6** (`parserVersion: "v6-sheet-end-date"`) every row carries:

| Field | Is |
|---|---|
| `calledDate` | the day the call happened — the sheet's date when it has one |
| `sheetEnd` | the `End Date - Fn` cell, verbatim |
| `recordedAt` | the log timestamp that used to stand in for it |
| `closedFrom` | `grid` \| `log` \| `''` — which source closed the row |

`endedOn()` in `lib/data.js` reads `sheetEnd` first. It still falls back to the
last non-seeded `Completed` entry in the log if a payload arrives without it, and
stamps such a date with a small amber **LOGGED** badge — a recording time must
never be read as a call date. On current live data no row is badged.

Deploying v6 moved the numbers a long way, because 95 attempts the sheet had
closed were being reported as never closed:

| | Before | After |
|---|---|---|
| On time | 1 | **19** |
| Delay pending | 101 | **17** |
| On-time share | **0.8%** | **15.4%** |

**A call that was answered but not finished reads `not completed`.** It used to
show the date it was postponed, which claimed a call had ended on the day
somebody pushed it back.

### The log changes no number

The tracker sheet is the single source of truth for every figure on screen.
`_CallLog` exists to show *what happened when it was recorded* — the roadmap
under each row, and the status timeline in the client view. It decides no state,
no date and no verdict.

That is a testable claim, so it was tested. A parser reading **only** the three
sheet columns — `Start Date - Fn`, `Fn Status`, `End Date - Fn` — never
consulting the log at all, was run over the real sheet export and compared
against the deployed v6 attempt by attempt:

```
attempts compared : 122
identical verdict : 122
different         :   0
```

The rule holds because of how v6 decides: an End Date closes a call and dates
it; with no End Date, the Status column and the deadline decide between
*in window*, *delay pending* and *paused*. The log is only ever consulted where
the sheet is silent, and on this sheet it never is — **no attempt is marked
Completed without an End Date**.

Two things are still log-derived, and neither moves a verdict:

| | What it affects | Why |
|---|---|---|
| The **Status** pill | text only, on the 9 rows whose End Date is set while the Status still reads *Call pending* | the parser lets the log's last status win the tie |
| The **Follow-up** column | a second window on postponed / not-received attempts | the sheet has no column dating those actions, so there is no sheet date to use |

Dates shown on the roadmap carry a **LOGGED** prefix whenever they are log
timestamps, so a recording time is never read as the day a call happened.

### Days and Late measure to different moments, deliberately

`Days` follows End, so it is the true turnaround. `Late` is the SLA, and the SLA
judges the first action — so it keeps measuring to `calledDate`. The Late cell's
tooltip names both dates (*"First acted 20-07-2026 · due 07-07-2026"*), because
on a postponed call they are far apart and the number needs to explain itself.

One live row: started 6 July, first acted 20 July, finished 18 August. **Days 37,
Late 11.** Both correct, measuring different things.

`Days` minus `Late` is **1** — the one-day window — only when the call finished
on the first action, which is most of them. It is **2** when the call started on
a Sunday, because the clock rolls forward to Monday first; `clockStart` records
that. On a postponed call the two are unrelated, and should be.

Counting calendar days here was wrong in a way that showed on screen: two calls
ran 68 and 69 days and were both 58 working days late, because the longer one
happened to span one more Sunday. They now read 59 and 59.

A call with no end date shows `—` in `Days`, and sorts as unknown rather than as
zero — an unfinished call is not a same-day one.

One caveat: the parser also skips public holidays, from a list only it holds.
It has none configured, so the two agree today. If holidays are added there,
`Days` will run high by one per holiday until the API exposes them.

---

## What the backend owns

SLA maths, framework numbering, framework grouping, outcome detection, reopened
detection, log matching and deadline calculation all happen in n8n. This app
does not recreate any of them — `verdict`, `lateHours`, `framework` and
`history` are displayed exactly as received.

The one derivation on this side is `Days`, which is a subtraction of two dates
the backend already sends. That is display arithmetic, not SLA logic.

---

## The nine states

The parser answers two questions about every call, which is nine outcomes, not
two. The dashboard displays them; it derives none of them.

**Did the advisor act inside the window?** The window is the end of the next
working day, Mon–Sat, so a Saturday pending is due Monday. Office hours are
context, not maths — 9:30 and 18:15 on the same day share a deadline. Any of
the three actions counts as acting.

| On time | |
|---|---|
| On time — completed | called and finished |
| On time — postponed by client | acted in time, client pushed it |
| On time — call not received | acted in time, nobody picked up |

**Did the work actually finish?** Past the window, only *Completed* closes it.

| Delay | |
|---|---|
| Delay complete | called late, but done |
| Delay pending — no status change | never touched |
| Delay pending — postponed by client | postponed late, still open |
| Delay pending — call not received | no answer, still open |

**And three that are not judged at all** — they leave the on-time/delay
percentage entirely, and are reported separately so the numbers reconcile to
the total: `in window` (deadline has not passed), `paused` (response pending,
clock not started), `no start date`.

`paused` is not on time. There is no clock running, so the call has neither met
the window nor breached it; counting it either way misstates that side.

### Response pending comes before the call

It is the wait for the client to come back, and it is the only status that
exists before a call does:

```
Response pending  ──►  Call pending  ──►  Completed
   no clock            clock starts        clock stops
   not a call yet      start date          end date
```

A row on Response pending carries **no start date at all** — the date is
stamped when the client answers and the status moves to Call pending. That is
the moment the call begins and the window opens.

**So it can only ever be a call's first status, never one in the middle.** Once
a call is running it can be postponed, missed, or completed; it cannot go back
to waiting for a response that has already come. On the roadmap it therefore
sits to the *left* of the Call pending stop — the one status that can — and
`npm run test:status` fails if any fixture puts it anywhere else.

### The follow-up layer

Postponed and not-received mean answered but not finished, so a second window
opens from that action date, by the same end-of-next-working-day rule. Without
it, someone who postpones on time and then forgets for a fortnight reads as
perfect forever — the headline verdict was earned on day one and never moves.

**It is on the All Calls table**, as a `Follow-up` column and a filter, and on
every roadmap as a chip beside the caption. The column is the one that moves
when `Late` cannot: a call answered inside its window shows `—` under Late
however long it then sits, because Late is about the first deadline, which it
met. On the fixture set 29 calls read *On time* with a blank Late and a
follow-up up to 20 working days overdue; on live data two calls are 10 and 11
days overdue on theirs.

Each filter option answers one question and none is a synonym of another:

| Option | Means | Parser counter |
|---|---|---|
| **Overdue now** | still open **and** past its deadline — the list to act on | — |
| **Missed its window** | blew the window, whether or not it later closed | `followUpLate` |
| **Still open** | no closing action yet, due or not | `followUpOpen` |
| **No follow-up** | completed first time, or never acted on | — |

*Overdue now* deliberately excludes a follow-up that ran late and was then
finished. It missed its window, but nobody needs to chase it, and a worklist
with settled rows in it is not a worklist.

The headline verdict is untouched by any of this — he *was* on time, and the
on-time/delay split still says so. The follow-up is a second column of truth
beside it, not a correction to it.

**`daysOverdue` takes the worse of the two clocks.** The parser reports the
follow-up clock whenever one is open, which understates a row that also blew its
original window — one live row is 56 working days past its first deadline and 6
past its follow-up, and the parser says 6. Sorting "worst first" has to agree
with "worst".

### If you change the parser

The state ids are a contract. v5 renamed `on_time_completed` to
`on_time_complete` and split `late_pending` into three `delay_pending_*` states;
code keyed to the old names did not error, it silently counted zero. The
dashboard now builds its counters from `SUB_STATES` in `config.js`, so the two
can only drift if that list is edited — not if the parser is.

Rows are still read if only the legacy `verdict` arrives, so a stale workflow
degrades to the coarse five-state view instead of rendering an empty dashboard.

---

## The sidebar sticks

It carries `position: sticky` and always did — but it scrolled away anyway,
because `html, body { overflow-x: hidden }` was elsewhere in the stylesheet.

Hiding one axis computes the **other** to `auto`. That quietly made the body a
scroll container, and a sticky element sticks to its nearest scrolling
ancestor — which had become the body rather than the page. The rail travelled
with the content.

`overflow-x: clip` hides overflow identically but establishes no scroll
container, so sticky works. `hidden` is kept as the preceding declaration: a
browser that does not understand `clip` ignores that line and keeps the old
behaviour rather than gaining a horizontal scrollbar.

Below 760px none of this applies — the sidebar becomes a fixed off-canvas
drawer behind the hamburger.

---

## Status vs state

Two different things, and easy to conflate:

**Status** is what a person typed in the tracker sheet — one of six values:
No status, Call pending, Response pending, Call postponed by client, Call not
received, Completed.

**State** is the parser's verdict on the dates — one of the nine above. A call
can be `Completed` in status and `Delay complete` in state, because it finished
late.

Both are on the Overview, and both respect the filters.

### The filters

Two sets, in two places, because they answer different questions.

**In the page header** — `Function` · `Advisor` · `Started`. Global: they mean
something on every view, so narrowing on the Overview and then opening All
Calls shows the same subset rather than silently widening again.

**In the All Calls table head** — `Business` · `Framework` · `Attempt` ·
`Status` · `Outcome`. Local to that table: narrowing to one framework is a
question you ask of a list of calls, not of the client cards or the charts.
Keeping them local also keeps them honest — a global filter visible on only one
screen quietly changes the numbers on the others.

Options are built from the rows the page filters already produced, so a choice
can never offer a value that would return nothing, and the lists shrink as the
page filters narrow. Statuses and outcomes keep their vocabulary order rather
than sorting alphabetically. A "Clear *n*" button appears once any is set, and
the title reads "25 calls of 127" so a filtered count never reads as the whole
list.

### Names come from the parser

Every state name on screen is the parser's `label`, verbatim. The dashboard
orders, groups and tints the states; it does not re-word them. There is
deliberately no short-form or friendlier phrasing anywhere in the UI — a second
set of words for the same thing is how a dashboard and its backend start
describing different systems.

---

## Layout

```
src/
  main.jsx            mounts the app
  App.jsx             shell, filters, view routing, data loading
  config.js           the webhook, SLA labels, state + status vocabularies
  theme.js            chart palettes and plot geometry
  styles.css          the whole stylesheet, both themes
  views/              Overview, Clients, Pending, Calls, ClientDetail
  components/         table, cards, status history, dropdowns, KPI, icons
  lib/data.js         the row model and the one place outcomes are counted
  lib/format.js       dates, numbers, labels
  lib/status.js       canonical status text, for display
  hooks/
tools/
  test-status.mjs     status text + the read-only guarantee
n8n/                  the workflow, plus setup notes
docs/                 the frontend handoff
```

## The call roadmap

Click any row in any calls table and its whole log opens underneath it, drawn
left to right: every `_CallLog` entry in order, ending at where the call is now.
The last stop is filled and glows; the ones behind it are outlined. Between the
stops, the gap in working days.

**The first stop is "Call pending", not a "Started" event.** The tracker stamps
the start date at the moment that status goes on, so the two are one thing and
the roadmap draws them as one stop. Most rows have no log entry for it — the
live log usually begins after the call was already pending — so the stop is
built from the start date; where the log does carry it for that day, that entry
is the stop and nothing is added. A seeded *Call pending* folds in the same way
and takes the date, since the backfill knows the status and the start date knows
when.

It answers "where is this call" in one look. The same facts read as a column of
dates make you scan to the bottom and then work out which end is current — the
lit node is the answer, and it is the only one lit.

**Nothing on it is derived.** The stops are the parser's `history` array as
sent, plus the row's own start date as the Call pending stop, plus the current
status when the sheet is ahead of the log — the same rule the client view's
vertical timeline applies.
The only arithmetic is the gap between stops, which is display, not SLA.

A backfilled log row (the epoch as its date) is drawn as a real stop but shows
`seeded` rather than a date, because it records what the status was, not when it
changed.

The nodes animate in along the line rather than all at once. The stagger is what
makes it read as a journey travelled instead of a list turned on its side, and
it is dropped entirely under `prefers-reduced-motion`, where the line is drawn
complete and the current stop carries a static halo.

### Testing it

`?mock` carries a row for every shape the roadmap has to draw. Each one is a
business of its own, so it can be found by name and cannot collide with the
generated volume rows:

| Row | What it proves |
|---|---|
| **Nova Instruments** F4 | seven stops, opening on *Response pending* five days before the call went pending — the widest case, scrolls sideways |
| **Orion Logistics** F7 | five stops, still open — the lit node is red, not green |
| **Vertex Foods** F3 | everything on the start date — the gap reads *same day* |
| **Cedar Clinic** F9 | Sat → Mon — two calendar days, one working day, reads *1 day* |
| **Harbour Motors** F12 | the sheet is ahead of the log — last stop is dated *now* |
| **Lumen Interiors** F13 | the same status twice in a row |
| **Pioneer Traders** F2 | a seeded backfill — labelled *seeded*, no gaps around it |
| **Zeta Studio** F11 | no start date — no *Call pending* stop at all |
| **Zeta Studio** F10 | paused — *Response pending* alone, no start date, nothing after it |
| **Ridge Textiles** F5 | a start date on a Sunday — the clock rolls to Monday |
| **Beta Foods** F5 | reopened — Call pending → Completed → Call pending |
| **Delta Clinic** F1 | no log at all — one stop, *Call pending*, lit |

Those seven roadmap rows are subtracted state-for-state from the volume counts
below them, so adding them left the Overview at 110 / 39 and 161 rows exactly
where it was. A fixture that moves the headline figures is a fixture nobody
trusts twice.

It lives in `CallsTable`, so it is on all four tables that use it: All Calls,
the Overview drill-down, Delay Pending Clients, and the client detail view. One
row is open at a time — two roadmaps on screen compete for the same reading —
and it closes when the list underneath changes (a sort, a filter, a page turn),
because the row it belonged to may no longer be there.

The business name in the first column still opens that client's full record;
that click is held back from the row so the two never fire together.

---

## Views

- **Overview** — two sections.

  **Where every call stands** — the verdict as two panels, On Time and
  Delayed, each with its total, its share as a ring, and the reasons the
  parser distinguishes underneath: three for on time, four for delay. The
  panels are sized from that count — 3fr and 4fr — so the delayed panel's
  fourth reason sits on the same row as the other three rather than wrapping
  alone. A chip on the right shows the span of start dates actually in view;
  it narrows with the filters and is not a picker.

  Each of the seven reason cards is a button. Clicking one opens those calls
  **here, in place** — a table drops in below the panels, titled with the
  parser's own name for the reason and its count, with a *Close* and the
  clicked card left ringed so it stays obvious which of the seven you are
  reading. Clicking the same card again closes it.

  It opens here rather than on All Calls deliberately: the question the click
  asks — *which calls are these 21?* — is asked while looking at the panels,
  and an answer that replaces the screen you asked it from makes you navigate
  back to carry on reading. The rows are the same `CallsTable` the All Calls
  view uses, so sorting, paging, the frozen columns and click-through to a
  business all work exactly as they do there.

  It selects on the parser's sub-state, not on the coarse Outcome vocabulary —
  that one cannot tell a delay somebody postponed from one nobody touched, and
  that difference is the point of the click. A card reading 0 is not a link; it
  is disabled, because an empty table reads as a broken filter rather than as
  an honest zero, and the zero is already on the card.

  **The verdict, broken down** — every call stacked by how it ended up, cut by
  function, by business, or as days late.

  A KPI row and a status-card row used to sit above both, and were removed.
  Neither removal dropped a figure: the six statuses still drive the Status
  column and the All Calls filters, and the on-time/delay split still opens
  the client detail view per business.
- **Client Cards** — one card per business, worst first.
- **Delay Pending Clients** — clients with calls started, past the window and
  still open. Ranked by open overdue calls, so the top of the list is what to
  act on. The card count is the figure; the two KPI cards that used to sit
  above it were removed.
- **All Calls** — every attempt, sortable and exportable to CSV. Paged at 25
  rows by default (50 / 100 / All available), with the header row and the
  Business column both frozen while the table scrolls.
- **Client detail** — reached by clicking any business name. Full call history
  per attempt, including the status timeline from `_CallLog`.

### What the Overview has been through

It began as six cards at equal weight — a headline, the states, the statuses, a
donut, two stacked charts and a late-days chart. Everything was stripped back to
one chart with a segmented control, and the on-time/delay split was then rebuilt
above it as the two panels that are there now. Every removal was deliberate and
none of them dropped a figure from the app; they moved the question to the
screen that answers it.

### One list drives every chart

Both stacked charts and their legends are built from `CHART_SERIES` in
`config.js`. They used to be written out separately in two files; a label
change in one left the other incrementing keys that no longer existed, and the
by-function chart read zero without an error. A single list means the data
builder and the bars cannot disagree about what a series is called.

---

## Deployment

Live at **<https://ram-sir-call.vercel.app>**.

Hosted on Vercel, linked to this GitHub repository. Every push to
`claude/framework-tracker-deploy-4seo2e` (the repository's default branch, and
the project's production branch) builds and goes live automatically; pushes to
any other branch get their own preview URL.

`vercel.json` pins the Vite preset, `npm run build` and `dist/`, and rewrites
every path to `index.html` — the app navigates in state rather than by URL, so
this only matters for a deep link or a refresh on a non-root path.

The build needs no environment variables. The n8n webhook lives in
`src/config.js` and ships in the bundle, exactly as it does locally, so a
deployment is correct as soon as it builds. Moving to a different n8n instance
is still the one-line `N8N_HOST` change there, followed by a push.

Because the dashboard is a static bundle calling the webhook from the browser,
the workflow must stay active and keep sending
`Access-Control-Allow-Origin: *` — a live page with empty charts and a CORS
error in the console means the workflow is down, not the deployment.
