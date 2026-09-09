# Framework Completion Dashboard

Tracks how long each framework call takes from **start date** to **end date**,
and splits every call into on-time or delayed.

---

## The rule everything rests on

A **call** is one attempt (A1 or A2) on one framework for one business.
A call exists as soon as it has a start date.

| Outcome | Condition | Colour |
|---|---|---|
| **On time** | closed within **2 days** of starting | green |
| **Delay — completed** | closed, but took longer than 2 days | amber |
| **Delay — pending** | no end date, and more than 2 days have passed | red |
| **Open — in window** | no end date, but still inside the 2-day window | sky |
| **Bad dates** | ends before it starts, or dated in the future | violet |

`Days late = duration − 2`. A call started 10-08 and closed 13-08 is
3 days long, so **1 day late**.

Every call falls into exactly one bucket, and nothing is dropped — rows with
problems are counted *and* flagged.

### The window is 2 days; the dashboard says "24 hours"

The rule above — and every number the dashboard produces — works in **calendar
days, with a window of 2**. That is unchanged and is what the n8n parser
applies.

The **wording** on screen says *24 hours*, because the business states the
target as 24 office hours rather than 2 elapsed days. This is presentation
only. It is controlled by two strings near the top of `index.html`:

```js
const SLA_LABEL  = "24 hours";     // standalone:  "within 24 hours"
const SLA_WINDOW = "24-hour";      // attributive: "the 24-hour window"
```

Editing them changes no arithmetic. **To change the actual window, edit
`SLA_DAYS` in the `Parse Framework Calls` node in n8n** — and then update these
labels to match, since they no longer follow it automatically.

One consequence worth knowing: because the maths still runs in days, a call
that took 3 days is reported as **1 day late** against a window the label calls
24 hours. Read literally in hours it would be 48 late. The late figures are
day-based throughout and are correct against the 2-day rule.

### The headline split: on time + delayed = 100%

The five buckets above are the detail. The two headline KPIs collapse them into
one binary question — **did this call breach the 2-day window or not?**

| Headline | Buckets folded in |
|---|---|
| **On time** | On time **+** Open — in window |
| **Delayed** | Delay — completed **+** Delay — pending |

**Open — in window counts as on time**, because a call that started this morning
has not breached anything. It moves to Delayed on its own the moment the window
passes, with no data entry required.

**Bad dates leave the denominator.** A call that ends before it starts is a typo,
not evidence of fast or slow work, so it is scored neither way. It stays visible
in the warning banner and in the per-outcome charts. So the denominator is
`total calls − bad dates`, shown as *"n calls, split in two"* under the donut.

The two percentages therefore **always sum to exactly 100%** — the delayed figure
is derived as `100 − on-time`, so rounding can never make the pair read 99.9%
or 100.1%. This holds at every level: the Overview, each client card's pill, and
each client's detail page.

This split is used consistently by the on-time/delayed KPIs, the *On time vs
delayed* donut, the client-card proportion bar and pill, and the **On-time
calls** measure in Build a Graph. The *Outcome by function* and *Outcome by
business* charts deliberately keep all five buckets — they exist to show the
detail the headline hides.

### Statuses and dates

| Status | Dates expected | Counted as |
|---|---|---|
| **Call pending** | a start date **only** | a call, open, shown as *not completed* |
| **Completed** | a start **and** an end date | a call, judged start to end |
| **Response pending** | **none** — the call hasn't been made | **Not started**, not a call |

**An end date is never required while a call is still Call pending.** The End
column reads *not completed* rather than showing a blank, and no warning is
raised. An end date is only expected once the status moves to Completed.

### When the clock starts

```
Response pending  ──►  Call pending  ──►  Completed
   no clock            clock starts        clock stops
   not a call          start date          end date
```

**Response pending is never a red flag.** No countdown is running and nothing is
overdue. It's shown as *"n awaiting response"* on the client card in muted text
— information, not a problem.

The countdown begins only when the status moves to **Call pending** and a start
date is stamped. From that moment the call has 2 days before it counts as
delayed.

Open calls are still measured against the window, because that's the point of
the dashboard: one open more than 2 days is **Delay — pending**, one open
fewer is **Open — in window**. Neither is a data problem.

"Response pending" carrying no dates is correct behaviour, not a data problem,
so it never raises a warning. Those frameworks are counted under the
**Not started** KPI instead, on the Overview and on each client's page and card.

**Reaching attempt 2 implies attempt 1 happened**, so an A2 with no A1 is
normal and is not flagged.

**To change the 2-day window:** edit `SLA_DAYS` at the top of the
`Parse Framework Calls` code node in n8n. Every outcome is recalculated from
that one value. The on-screen labels no longer follow it automatically — they
are fixed strings now — so also update `SLA_LABEL` and `SLA_WINDOW` in
`index.html` to match. See *The window is 2 days; the dashboard says
"24 hours"* above.

---

## Checking which parser is deployed

The webhook response carries a `parserVersion`. The current one is **`v4-2026-08`**,
and the dashboard prints it under the Live indicator in the sidebar.

If it reads *"unknown — workflow needs re-importing"*, or a yellow
**"The n8n workflow is out of date"** banner appears on the Overview, an older
workflow is still deployed. **Re-import `framework_dashboard_n8n_workflow.json`.**

This matters because **the warnings are produced in n8n, not in the dashboard.**
Updating `index.html` alone will not change them. Symptoms of an old parser:

- warnings saying *"Response pending A1 but no dates recorded"*
- warnings saying *"records attempt 2 with no attempt 1"*
- the same row warned about twice

None of those are raised by `v4-2026-08`.

---

## Setup

### 1. n8n

Import `framework_dashboard_n8n_workflow.json`.

**The Sheet ID is already filled in** — `1Cer9SIAzrp0EYOx82w6P71JWOOSF5L76XldzGKfV78M`,
in all 3 places it appears (`HTTP - Sheet Tabs`, `Build batchGet URL`, and
`HTTP - Sheet Tabs (Functions)`). Nothing to replace.

You still need to: set the Google credential on all three HTTP nodes
(**OAuth2**, not Header Auth), then activate the workflow.

If the sheet is ever swapped for a different one, that ID appears in exactly
those 3 places — change all three or one branch will 404 while the other
works.

Endpoints (live):
- `https://srv1853541.hstgr.cloud/webhook/framework-dashboard/data` — every call, parsed
- `https://srv1853541.hstgr.cloud/webhook/framework-dashboard/functions` — just the tab list

Open the `/data` URL in a browser to check the chain end to end before loading
the dashboard. A healthy response starts with `"success": true` and a
`"totalCalls"` count.

**CORS:** the workflow sets `Access-Control-Allow-Origin: *` on both responses,
so the dashboard can be opened from a file path or any host. If the browser
console shows a CORS error, the request never reached the Respond node — check
that the workflow is active.

### 2. Dashboard

**Nothing to configure** — the host is already set:

```js
const N8N_HOST = "https://srv1853541.hstgr.cloud";
```

Just open `index.html` in a browser, or serve the folder from any static host.
No build step — React and Recharts are in `assets/`.

If the n8n host ever changes, that one line is the only edit needed; both
endpoint URLs are built from it.

---

## Tab discovery

Tabs are found **by shape, not by name**. A tab is read when:

- column **C**'s header contains "business", and
- at least one header from column **D** onward contains "status"

So `FUNCTION 3: FINANCE CHAKRA` is picked up automatically with no code change,
and renaming a tab breaks nothing. Frameworks per tab are counted from the
header row, so tabs may have different numbers of frameworks.

Expected column layout:

```
A: SR NO | B: ADVISOR NAME | C: BUSINESS NAME |
D: start date f1 | E: f1 status | F: end date f1 | G: start date f2 | ...
```

Date cells hold one entry per attempt: `A1: 23-06-2026 | A2: 27-06-2026`.

---

## Look and feel

### Spacing

Every padding, gap and margin comes from one scale defined at the top of
`index.html` — there are no loose `13px` or `17px` values left in the
stylesheet:

```css
--s1:4px; --s2:8px;  --s3:12px; --s4:16px; --s5:20px;
--s6:24px; --s7:32px; --s8:48px; --s9:64px;
```

Components with the same job name the same token, so cards, KPIs and client
cards share one rhythm instead of each having its own. Pairs that must line up
are wired to the same token rather than kept in sync by hand: a table's `th`
and `td` both use `--s3 --s4`, and a flush card's head is inset by the table's
cell padding so the card title sits directly above the first column. Mobile
steps the whole scale down one notch (`--s5`→`--s4`, `--s4`→`--s3`) rather than
introducing a second set of numbers.

To retune the density of the entire dashboard, edit that one block.

### Colour

**Violet theme** — soft lavender ground, white cards, one violet accent
(`--brand: #6C5CE7`), and diffuse blue-tinted shadows in place of hard borders.
Cards carry generous radii and are grouped under collapsible section bars.
The moon icon in the sidebar footer switches to a dark variant that keeps the
same violet accent, for low light.

### Violet is furniture; the outcome colours carry meaning

This is the one rule to keep in mind when restyling. Violet is used for
**chrome only** — the brand mark, the active nav pill, section bars, the hero
card, focus and hover states, and the neutral bar in Build a Graph.

The **outcome colours are not decoration and must not become shades of violet.**
Green means on time and red means overdue, and the same colour means the same
thing in the pills, the donut, the stacked bars, the client-card proportion bar
and the KPI figures:

| Outcome | Colour |
|---|---|
| On time | green |
| Delay — completed | amber |
| Delay — pending | coral |
| In window | sky |
| Bad dates | grape |

Recolouring those to match a palette would make the dashboard pretty and
unreadable.

**Contrast.** Every text and value colour was checked against its actual
background in both themes; all clear WCAG AA — 4.5:1 for normal text, 3:1 for
the large KPI figures. Two values needed adjusting for the light ground: the
`--hint` tone used by sub-labels (it was 2.65:1 on white) and the rank badge.
If you retune the palette, re-check rather than assuming.

---

## Two units, counted separately

The workflow emits two record types, and mixing them up is the easiest way to
misread the dashboard:

| Unit | What it is | Where it appears |
|---|---|---|
| **Framework** | one cell group — has a lifecycle stage | the *awaiting response* count on each client card |
| **Call** | one attempt that has a start date | every KPI and chart |

A framework awaiting a response produces **no call**, because no call has been
made. So the framework total is always higher than the call total — currently
135 frameworks against 88 calls. That's expected, not a discrepancy.

---

## Views

- **Overview** — three collapsible sections. **Summary** holds the five KPIs
  (total calls as the violet hero card, then on time %, delayed %,
  delay-completed, delay-pending); **Breakdown** holds the on-time/delay donut
  and outcome by function; **By business** holds outcome by business and total
  days late per business.

  Each KPI card follows the reference layout: icon tile top-left, a pill
  top-right, then caption and figure. The reference puts a period-over-period
  delta in that pill — this data has no prior period to compare against, so the
  pill carries the **raw count** instead rather than a fabricated trend.

  Each of the four outcome KPIs shows **both figures** — the count beside the
  percentage, or the percentage beside the count — so no card makes you do the
  arithmetic. The headline stays the big number and the companion is muted.
  Total calls has no companion, since it is the total. The delay-completed and
  delay-pending percentages are of the same scored denominator, so they add up
  to the Delayed percentage.

  The KPI row is deliberately just those five. Everything else lives where it's
  actionable rather than as another card: **not started** appears on each client
  card footer, **days late** on the client detail charts, and **bad dates** in
  the warning banner.
- **Client Cards** — one card per business showing its on-time and late counts
  and its on-time percentage. Click any card for the full detail page.
- **Delay Pending Clients** — every client with at least one call that is
  started, past the window, and still not closed, **ranked worst first** with a
  `#n` badge. The sort is by open overdue calls, then total days late, then
  book size. Below the cards, every open overdue call in one table with its own
  CSV export.

  Nothing else puts a client here: not a low on-time rate (that is history, not
  an action), and not a framework awaiting response (no clock is running). A
  client that closed every call late but has nothing open right now does not
  appear, because there is nothing to chase.
- **Client detail** — that business's KPIs, outcome donut, days-late-per-call
  chart, every call in a table, CSV export, and any data warnings for it.
  **Back returns you to the list you came from** — Client Cards, Delay Pending
  Clients, or All Calls — not always to Client Cards.
- **All Calls** — every attempt, sortable on any column, CSV export.
- **Build a Graph** — group by business/function/framework/attempt/month,
  measured by calls, days late, on-time calls, or delay-pending calls.

Filters at the top (function, advisor, month started) apply to every view at
once.

---

## Stated assumptions

These are judgement calls, not facts from the sheet. Flagging them rather than
burying them:

1. **A call needs a start date to exist.** A framework sitting on
   "Response pending" is counted under **Not started** rather than as a call,
   since no call has been made yet. Only "Call pending" or "Completed" with
   missing dates is treated as a data problem.
2. **The 2-day window is inclusive.** Start 10-08, end 12-08 is 2 days, which
   counts as on time. Only 13-08 onward is late.
3. **An open call inside its window is on time, not "not yet judged."** It has
   not breached the window, so the headline treats it as on time and lets it
   fall to Delayed by itself once the window passes. The alternative — scoring
   only settled calls — was considered and rejected because it makes the
   on-time percentage jump around as calls close rather than as work improves.
4. **Bad dates are scored neither way.** They are excluded from the on-time /
   delayed denominator, since a date typo says nothing about how fast the work
   was done. They stay counted in the total-calls KPI and flagged as warnings.
5. **A1 and A2 are separate calls.** A framework needing two attempts counts
   as two calls, each judged on its own dates. This is why the total call
   count is higher than the framework count.
6. **Delay-pending late days grow daily.** An unclosed overdue call's late
   count is measured against today, so it rises until an end date is entered.
7. **Businesses with no dates anywhere are excluded** from the client cards
   rather than shown as 0%. Eight of the fifteen businesses currently have no
   calls at all.

---

## Data problems found at build time

Against the snapshot this was built on, only **2 entries** are genuine
problems. Both are on the same business:

| Type | Count | Meaning |
|---|---|---|
| `end_before_start` | 1 | BHARAT WEGAD F3 A1 ends 12-08 but starts 21-08 |
| `future_end` | 1 | BHARAT WEGAD F2 A2 ends 20-08, ahead of today |

The `end_before_start` row is worth fixing first — it produces a negative
duration and is the single "Bad dates" call in the KPIs.

Warnings still raised, when they occur:

| Type | Meaning |
|---|---|
| `status_without_dates` | Call pending or Completed, but no dates at all |
| `status_attempt_missing` | Call pending or Completed pointing at an attempt with no dates |
| `end_without_start` | an end date with no matching start date |
| `end_before_start` | negative duration |
| `future_start` / `future_end` | dated ahead of today |

---

## Testing

Both stages pass at time of delivery:

- **Babel syntax check** — the JSX compiles clean.
- **jsdom smoke test** (`smoke.js`, 56 assertions) — renders, clicks every nav
  item, opens a client detail page and returns, sorts the table, exports CSV,
  toggles every Build-a-Graph control, exercises all three filters, and checks
  the empty, error, and mobile states.

KPI figures were reconciled against an independent Python parse of the same
data: 54 calls, 8 closed on time, 43 delayed, 348 total days late.

Those raw counts still hold, but the **percentages** in that snapshot predate
the on-time / delayed split described above — under the current rule the same
54-call fixture reads 18.9% on time and 81.1% delayed, because the 2 in-window
calls join the on-time side and the 1 bad-dates call leaves the denominator.
The smoke test asserts exactly that, and asserts the two sum to 100%.
