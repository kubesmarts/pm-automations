# Project Reporting Metrics — User Guide

This guide is for team members who work with GitHub Projects that use the **reporting metrics structure**. It explains how to fill in issues at each stage of their lifecycle, what the automation does for you, how to avoid alerts, and how JIRA integration works.

---

## How it works

A workflow runs automatically **once a day** (00:00 UTC). Every run it looks at every issue in every configured project and:

1. Detects whether any tracked field has changed since the last run.
2. If something changed, stamps today's date on **`Reporting Date`** and adds a snapshot line to **`Reporting Log`**.
3. Checks a set of validation rules and writes any violations to the **`Alerts`** field — even when nothing changed.
4. If the issue is linked to a JIRA ticket (and sync is allowed), pushes updated field values to JIRA.

You never need to trigger it manually. The workflow takes care of everything automatically.

---

## Fields at a glance

### Fields you fill in

| Field | Type | What to enter |
|-------|------|---------------|
| `Status` | Single select | Lifecycle stage (see below) |
| `Priority` | Single select | `Low`, `Medium`, `High`, `Critical` (or as configured) |
| `Estimate` | Number | Total effort in **weeks** — e.g. `2` = 2 weeks, `0.4` = 2 days, `0.1` = 4 hours |
| `Remaining Work` | Number | Remaining effort in weeks, same unit as Estimate |
| `Time Spent` | Number | Actual time logged so far, in weeks |
| `Area` | Single select | `Runtimes`, `Tooling`, `Cloud`, `CI`, `QE`, or `Docs` |
| `External Reference` | Text | JIRA ticket key (e.g. `QUARKUS-42`) or a `CREATE` directive (see [JIRA integration](#jira-integration)) |

### Fields managed by the workflow — do not edit

| Field | What it contains |
|-------|-----------------|
| `Reporting Date` | Date of the last detected change |
| `Reporting Log` | History of snapshots, newest first, max 5 entries |
| `Alerts` | Validation and sync status codes (empty = all good) |

---

## Issue lifecycle

### Backlog

The issue is known but not yet scheduled. **No fields are required** at this stage — the workflow will not raise any alerts for items in `Backlog`.

> This is the right place to park issues until they are ready to be prioritised and scoped.

---

### Next

The issue is queued for the next sprint or cycle. At this point you should start providing context:

| Field | Required? | Why |
|-------|-----------|-----|
| `Area` | **Yes** | Alerts: `NO_AREA` |
| `Priority` | **Yes** | Alerts: `NO_PRIORITY` |
| `Estimate` | Recommended | Will be required when the issue moves forward |
| `Remaining Work` | Recommended | Same |

---

### In Progress

The issue is actively being worked on. All planning fields must be filled in and an assignee must be set.

| Field | Required? | Why |
|-------|-----------|-----|
| `Area` | **Yes** | Alerts: `NO_AREA` |
| `Priority` | **Yes** | Alerts: `NO_PRIORITY` |
| `Estimate` | **Yes** | Alerts: `NO_ESTIMATE` |
| `Remaining Work` | **Yes** | Alerts: `NO_REMAINING_WORK` |
| `Time Spent` | Update regularly | Will be required at `Done` |
| Assignee (GH issue) | **Yes** | Alerts: `NO_ASSIGNEE` |

Keep `Remaining Work` up to date as you make progress. It represents how much work is left, not how much you've done.

---

### In Review

Same requirements as `In Progress`. Ensure `Remaining Work` reflects any remaining effort before the review is complete.

| Field | Required? |
|-------|-----------|
| `Area` | **Yes** |
| `Priority` | **Yes** |
| `Estimate` | **Yes** |
| `Remaining Work` | **Yes** |
| Assignee | **Yes** |

---

### Done

The issue is complete. Before closing it:

| Field | Required? | Why |
|-------|-----------|-----|
| `Area` | **Yes** | Alerts: `NO_AREA` |
| `Priority` | **Yes** | Alerts: `NO_PRIORITY` |
| `Estimate` | **Yes** | Alerts: `NO_ESTIMATE` |
| `Remaining Work` | **Auto-cleared** | The workflow sets this to empty automatically when the issue reaches `Done` |
| `Time Spent` | **Yes** | Alerts: `NO_TIME_SPENT` |
| Assignee | **Yes** | Alerts: `NO_ASSIGNEE` |

Fill in the total `Time Spent` before or when you move the issue to `Done`. `Remaining Work` is cleared automatically by the workflow.

---

## Quick reference — fields by stage

| Field | Backlog | Next | In Progress | In Review | Done |
|-------|:-------:|:----:|:-----------:|:---------:|:----:|
| Area | — | Required | Required | Required | Required |
| Priority | — | Required | Required | Required | Required |
| Estimate | — | Recommended | Required | Required | Required |
| Remaining Work | — | Recommended | Required | Required | Auto-cleared |
| Time Spent | — | — | Update often | Update often | Required |
| Assignee | — | — | Required | Required | Required |

---

## Understanding time values

All time fields (`Estimate`, `Remaining Work`, `Time Spent`) use **weeks** as the unit, based on a 5-day week / 8-hour day:

| Value | Meaning |
|-------|---------|
| `0.1` | ~4 hours |
| `0.2` | ~1 day |
| `0.4` | ~2 days |
| `1` | 1 week (5 days) |
| `2` | 2 weeks |

When synced to JIRA, the workflow automatically converts these values to JIRA's `h`/`d`/`w` format.

---

## Alerts

The `Alerts` field is updated on every workflow run. An empty value means everything is healthy. When one or more rules are violated, comma-separated codes appear — for example: `NO_AREA, NO_ESTIMATE`.

### What each code means and how to fix it

| Code | What it means | How to fix |
|------|--------------|------------|
| `NO_AREA` | `Area` is empty and the issue is past `Backlog` | Set the `Area` field |
| `NO_PRIORITY` | `Priority` is empty and the issue is past `Backlog` | Set the `Priority` field |
| `NO_ESTIMATE` | `Estimate` is empty and status is past `Next` | Set the `Estimate` field |
| `NO_REMAINING_WORK` | `Remaining Work` is empty and status is past `Next` | Set the `Remaining Work` field |
| `NO_TIME_SPENT` | `Time Spent` is empty and status is `Done` | Enter the total time spent |
| `NO_ASSIGNEE` | No assignee on the GH issue and status is `In Progress`, `In Review`, or `Done` | Assign the issue to the responsible person |
| `CHILDREN_STATUS` | Parent/child status mismatch detected (see below) | Align child statuses with the parent |
| `JIRA_NOT_FOUND` | `External Reference` points to a JIRA ticket that doesn't exist | Verify or correct the JIRA key |
| `JIRA_SYNC_NOT_ALLOWED` | The JIRA ticket exists but doesn't have the `gh-issue-<N>` label | Add the label to the JIRA ticket (e.g. `gh-issue-3`) |
| `JIRA_SYNC_ERROR HTTP_<code>` | A JIRA API call failed | Check the Actions log for details |
| `JIRA_CREATE_ERROR ...` | Automatic JIRA ticket creation failed | See [JIRA integration](#jira-integration) for details |

### Parent/child status consistency (`CHILDREN_STATUS`)

When an issue has sub-issues that are also tracked in the same project, the workflow checks that their statuses are consistent:

- If the **parent is `Done`**, all children must also be `Done`.
- If the **parent is active** (not `Backlog` or `Next`), no child should still be in `Backlog`.

To clear `CHILDREN_STATUS`: update the child issues so their statuses align with the parent's progression.

---

## Reporting Log

Every time a tracked field changes, the workflow adds a new line to `Reporting Log`:

```
YYYY-MM-DD, Area, Status, Priority, Estimate, Remaining Work, Time Spent
```

Entries are ordered **newest first**, separated by ` | `. A maximum of 5 entries are kept — older ones are dropped automatically.

Example:
```
2026-03-10, CI, In Progress, High, 2, 1, 1 | 2026-03-01, CI, Next, High, 2, 2, 0 | 2026-02-15, , Backlog, , , ,
```

This is read-only from a user perspective — the workflow manages it entirely.

---

## JIRA integration

### Linking an existing JIRA ticket

Set the `External Reference` field to the JIRA ticket key (e.g. `QUARKUS-42`).

**Important:** the JIRA ticket must have the label `gh-issue-<N>` (where `N` is the GitHub issue number, e.g. `gh-issue-3`) for sync to be allowed. This label acts as an explicit opt-in to prevent unintended syncs. If the label is missing, the workflow skips sync and sets `JIRA_SYNC_NOT_ALLOWED` in `Alerts`.

When sync runs, the workflow updates the JIRA ticket with:

| JIRA field | Source |
|------------|--------|
| Priority | GH `Priority` field |
| Original Estimate | GH `Estimate` (converted to JIRA time format) |
| Remaining Estimate | GH `Remaining Work` (converted) |
| Time Spent (worklog) | GH `Time Spent` — delta logged as a new worklog entry |
| Area label | `area/<area-value>` label (e.g. `area/ci`) — kept in sync, old one replaced |

### Auto-creating a JIRA ticket

If there is no existing JIRA ticket yet, you can ask the workflow to create one automatically. Set `External Reference` to:

```
CREATE <projectKey> [<component>]
```

Examples:

| Value | What happens |
|-------|-------------|
| `CREATE QUARKUS` | Creates a Story in the QUARKUS JIRA project |
| `CREATE QUARKUS quarkus-flow` | Creates a Story in QUARKUS with component `quarkus-flow` |

On the next workflow run:

1. A JIRA Story is created with:
   - The GH issue title as its summary
   - `Details at <GH issue URL>` as its description
   - The label `gh-issue-<N>` pre-applied (so sync is allowed immediately)
   - The specified component (if provided)
2. The `External Reference` field is updated to the new JIRA key (e.g. `QUARKUS-99`).
3. All tracked fields are synced to the new ticket in the same run.

From the next run onwards the issue is treated as a normal JIRA-linked issue.

If creation fails, the `Alerts` field will contain `JIRA_CREATE_ERROR HTTP_<code>` (or `NO_ISSUE` / `NO_EXT_REF_FIELD` for configuration problems) and the `External Reference` value remains unchanged so you can correct and retry.

---

## Sub-issues

If a GH issue has sub-issues and those sub-issues are also added to the same project, the workflow tracks them individually and checks parent/child status consistency automatically (see [`CHILDREN_STATUS`](#parentchild-status-consistency-children_status) above).

Sub-issues that are **not** in the project are ignored.

---

## Multi-project support

The workflow is not tied to a single project. It is configured with a list of projects via the `PROJECTS` variable (format: `org:project_number`, space-separated):

```
kubesmarts:1 kubesmarts:2 another-org:5
```

**Any GitHub Project — in any GitHub organization — that uses the required field structure is supported.** A single central automation workflow serves all of them simultaneously with no code duplication.

To onboard a new project:

1. Add the required fields to the project (see field list above).
2. Add the project to the `PROJECTS` variable in the format `<org>:<project-number>`.
3. The next scheduled run will automatically include it.

The project number is the integer visible in the project URL:
`https://github.com/orgs/<org>/projects/<number>`

---

## Tips

- **Nothing has changed but `Alerts` updated** — that is expected. Alerts are evaluated on every run, not just when fields change.
- **Status is case-insensitive** — `In Progress`, `in progress`, and `IN PROGRESS` are all treated the same by the workflow.
- **Estimate in weeks is cumulative for sub-issues** — the workflow does not aggregate sub-issue estimates; each issue's fields are tracked independently.
- **The workflow runs once a day** — changes you make are picked up within 24 hours at most. You can also trigger a manual run from the Actions tab.
- **Fields not in the list are ignored** — changing the title, body, labels, or milestone of a GH issue does not trigger a log entry.
