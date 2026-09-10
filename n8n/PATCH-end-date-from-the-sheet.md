# The End Date must come from the sheet, not the log

**Applied and tested in `n8n/parse-framework-calls.js`. Not yet on the live node.**

To deploy: open n8n → **Parse Framework Calls** → select all the code → paste
the entire contents of `n8n/parse-framework-calls.js` over it → Save the node,
then Save the workflow. Nothing else in the workflow changes.

---

## What was wrong

The node read only **one** of the three columns in each framework block:

```js
const starts = readAttempts(row[c - 1]);   // Start Date - Fn   ✔ read
                                           // Fn Status         ✘ ignored
                                           // End Date - Fn     ✘ ignored
```

So `startDate` came from the sheet and every closing date came from a `_CallLog`
timestamp — which is when somebody **typed** the status, not when the call
happened. A log row can only ever be later than the call, so the error always
ran the same way: advisors charged for slow data entry rather than slow calling.

And when the log said nothing at all, an attempt the sheet had closed months ago
was reported as never closed.

## What the fix does

1. **Reads the End Date column.** `readAttempts(row[c + 1])`, stored per attempt.
2. **The sheet wins on a completion.** When a *Completed* event closes an attempt
   and the sheet has a date, that date is the close — for the End column and for
   the lateness. Postponed / not-received keep the log, because the grid has no
   column for those.
3. **A sheet-closed attempt is closed.** No log event + an End Date now resolves
   as complete instead of falling through to *delay pending — no status change*.
4. **Reads the Status column** as a fallback, so an attempt the sheet calls
   Completed no longer displays as *Call pending* just because nobody logged it.
5. **Sends `sheetEnd`, `recordedAt` and `closedFrom`**, so a real date and a
   recorded one can never be confused again.

## Measured on the real sheet export

`node tools/build-fixture.mjs` runs this exact parser over `tools/raw-sheets.json`.
Running it twice — once with the sheet's End Date and Status columns neutralised,
which reproduces the live node — gives:

| | Before | After |
|---|---|---|
| On time | 1 | **19** |
| Delayed | 121 | **102** |
| Delay pending | 101 | **24** |
| Closed from the sheet | 0 | **95** |
| **On-time share** | **0.8%** | **15.7%** |

**91 closing dates moved. 81 attempts were reclassified.**

The "before" column reproduces the live dashboard exactly — 1 on time, 0.8% —
which is what confirms the reconstruction is faithful.

Examples:

| Attempt | Was | Now |
|---|---|---|
| Akshar F2 A1 | delay pending, 59 days late | **on time, completed 03-07** |
| Akshar F3 A2 | delay pending, 44 days late | **on time, completed 21-07** |
| Akshar F1 A2 | delay pending, 64 days late | **delay complete, 4 days late** |

77 attempts were sitting in *delay pending* purely because the log was silent.

## Review it before deploying

```
node tools/fixture-server.mjs 5186
```

then open `http://localhost:5185/?api=http://localhost:5186`. That is the real
dashboard reading the corrected payload — 19 on time, 96 rows with an end date,
and no **LOGGED** badges, because every date now comes from the sheet. Nothing is
written to n8n; the server reads a file and serves it.

## After deploying

Export the workflow and overwrite `n8n/framework_call_tracker_n8n_workflow.json`.
The copy in this repo is older than what runs — that drift is what let this sit
unnoticed, since the deployed parser had quietly dropped column reading that an
earlier version had.
