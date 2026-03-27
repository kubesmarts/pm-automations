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
| `Priority` | Single select | `Blocker`, `Critical`, `Major`, `Normal`, `Minor` |
| `Version` | Text | Target release version (e.g. `3.20`, `2025.Q2`) |
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
| `Version` | **Yes** | Alerts: `NO_VERSION` |
| `Estimate` | Recommended | Will be required when the issue moves forward |
| `Remaining Work` | Recommended | Same |

---

### In Progress

The issue is actively being worked on. All planning fields must be filled in and an assignee must be set.

| Field | Required? | Why |
|-------|-----------|-----|
| `Area` | **Yes** | Alerts: `NO_AREA` |
| `Priority` | **Yes** | Alerts: `NO_PRIORITY` |
| `Version` | **Yes** | Alerts: `NO_VERSION` |
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
| `Version` | **Yes** |
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
| `Version` | **Yes** | Alerts: `NO_VERSION` |
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
| Version | — | Required | Required | Required | Required |
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

### Email notifications

When validation alerts are detected on issues with assignees, the workflow automatically creates or updates a **GitHub issue** with the label `alerts-notification`. Each assignee is mentioned in a comment with their specific alerts grouped by project, which triggers GitHub's email notification system (based on the assignee's notification preferences).

**How it works:**

1. The workflow collects all validation alerts across all monitored projects
2. Groups alerts by assignee
3. Creates or updates a single issue titled "🚨 GitHub Projects Alerts Notification"
4. Posts one comment per assignee mentioning them with their alerts
5. Automatically closes the issue when all alerts are resolved

**Example notification:**

```
@username You have validation alerts:

**Project kubesmarts:1**
- Issue #42 "Implement feature X": NO_AREA, NO_ESTIMATE
- Issue #58 "Fix bug Y": NO_REMAINING_WORK

Please review and resolve these alerts.
```

> **Note:** Only validation alerts (NO_AREA, NO_ESTIMATE, etc.) trigger assignee notifications. JIRA sync errors are tracked separately in the `psync-error` issue.

### What each code means and how to fix it

| Code | What it means | How to fix |
|------|--------------|------------|
| `NO_AREA` | `Area` is empty and the issue is past `Backlog` | Set the `Area` field |
| `NO_PRIORITY` | `Priority` is empty and the issue is past `Backlog` | Set the `Priority` field |
| `NO_VERSION` | `Version` is empty and the issue is past `Backlog` | Set the `Version` field |
| `NO_ESTIMATE` | `Estimate` is empty and status is past `Next` | Set the `Estimate` field |
| `NO_REMAINING_WORK` | `Remaining Work` is empty and status is `In Progress` or `In Review` | Set the `Remaining Work` field |
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
YYYY-MM-DD, Area, Status, Priority, Version, Estimate, Remaining Work, Time Spent
```

Entries are ordered **newest first**, separated by ` | `. A maximum of 5 entries are kept — older ones are dropped automatically.

Example:
```
2026-03-10, CI, In Progress, Major, 3.20, 2, 1, 1 | 2026-03-01, CI, Next, Major, 3.20, 2, 2, 0 | 2026-02-15, , Backlog, , , , ,
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

## Working with Epics

Epics are used to group related sub-issues that are part of the same feature or high-level task. Understanding how to properly track time and status for Epics is important for accurate project reporting.

### Time Tracking for Epics

#### When Epic is used as a grouping entity only

Most Epics serve purely as organizational containers. In this case:

- **Estimate**: `0`
- **Remaining Work**: `0`
- **Time Spent**: `0`

All time tracking should be done in the sub-issues. The Epic itself has no work associated with it.

**Example:**
```
Epic: Implement User Authentication (Estimate: 0)
├─ Sub-issue 1: Design login UI (Estimate: 2 weeks)
├─ Sub-issue 2: Implement OAuth integration (Estimate: 3 weeks)
└─ Sub-issue 3: Add session management (Estimate: 1 week)

Total feature estimate: 6 weeks (sum of sub-issues)
```

#### When Epic has specific work not covered by sub-issues

Sometimes an Epic requires work that isn't captured in any sub-issue (e.g., minor coordination tasks, quick documentation updates). In this case:

- **Estimate**: `> 0` (only for work specific to the Epic itself)
- Track time for Epic-specific work separately from sub-issues

**Important:** If the Epic-specific work has enough substance or complexity, **create a dedicated sub-issue for it** instead of tracking it directly on the Epic. This provides better granularity and makes the work more visible.

**Example with Epic-level work:**
```
Epic: Implement User Authentication (Estimate: 0.5 weeks for coordination)
├─ Sub-issue 1: Design login UI (Estimate: 2 weeks)
└─ Sub-issue 2: Implement OAuth integration (Estimate: 3 weeks)

Total feature estimate: 5.5 weeks (Epic + sub-issues)
```

**Better approach - create a sub-issue:**
```
Epic: Implement User Authentication (Estimate: 0)
├─ Sub-issue 1: Design login UI (Estimate: 2 weeks)
├─ Sub-issue 2: Implement OAuth integration (Estimate: 3 weeks)
└─ Sub-issue 3: Architecture documentation and coordination (Estimate: 0.5 weeks)

Total feature estimate: 5.5 weeks (sum of sub-issues)
```

> **Note:** This approach follows the same pattern as JIRA. JIRA's "Σ Original Estimate" field shows aggregated estimates from the Epic and its sub-issues, but this is purely a visualization convenience — not the source of truth. Each issue tracks its own time independently.

### Σ (Sigma) Aggregated Fields

The project includes three **system-managed** fields that automatically calculate aggregated time tracking totals for parent issues (Epics and any issue with sub-issues):

- **Σ Estimate**: Sum of parent's Estimate + all descendant sub-issues' Estimates
- **Σ Remaining Work**: Sum of parent's Remaining Work + all descendants' Remaining Work
- **Σ Time Spent**: Sum of parent's Time Spent + all descendants' Time Spent

#### Important Notes

⚠️ **These are system fields - DO NOT edit them manually!**

- Σ fields are automatically calculated by the sync workflow
- Manual edits will be overwritten on the next sync run
- The workflow runs daily at 00:00 UTC and can be triggered manually

#### How It Works

**Parent Issue Detection:**
- Any issue that has one or more sub-issues linked via "Subtask of" relationship is considered a parent
- No special labels or issue types required
- Works for Epics and any hierarchical structure

**Calculation Formula:**
```
Σ [Field] = Parent's [Field] + Σ(ALL descendant sub-issues' [Field])
```

**Recursive Calculation:**
- The calculation includes ALL descendants, not just direct children
- Supports nested hierarchies up to 10 levels deep
- Example: Epic → Sub-issue → Sub-sub-issue (all included in Epic's Σ fields)

#### Example

```
Epic: User Authentication
  Estimate: 0.5 weeks (coordination work)
  Remaining Work: 0.2 weeks
  Time Spent: 0.3 weeks

├─ Sub-issue 1: Design login UI
│    Estimate: 2 weeks
│    Remaining Work: 0 weeks
│    Time Spent: 2 weeks
│
├─ Sub-issue 2: Implement OAuth (has sub-issues)
│    Estimate: 0.5 weeks (coordination)
│    Remaining Work: 0.1 weeks
│    Time Spent: 0.4 weeks
│    │
│    ├─ Sub-sub-issue 2.1: OAuth provider integration
│    │    Estimate: 1.5 weeks
│    │    Remaining Work: 0.5 weeks
│    │    Time Spent: 1 week
│    │
│    └─ Sub-sub-issue 2.2: Token management
│         Estimate: 1 week
│         Remaining Work: 0.4 weeks
│         Time Spent: 0.6 weeks
│
└─ Sub-issue 3: Session management
     Estimate: 1 week
     Remaining Work: 1 week
     Time Spent: 0 weeks

Epic's Σ fields (automatically calculated):
  Σ Estimate = 0.5 + 2 + 0.5 + 1.5 + 1 + 1 = 6.5 weeks
  Σ Remaining Work = 0.2 + 0 + 0.1 + 0.5 + 0.4 + 1 = 2.2 weeks
  Σ Time Spent = 0.3 + 2 + 0.4 + 1 + 0.6 + 0 = 4.3 weeks

Sub-issue 2's Σ fields (also calculated):
  Σ Estimate = 0.5 + 1.5 + 1 = 3 weeks
  Σ Remaining Work = 0.1 + 0.5 + 0.4 = 1 week
  Σ Time Spent = 0.4 + 1 + 0.6 = 2 weeks
```

#### Benefits

- **Complete Visibility**: See total scope of work at Epic level
- **Accurate Planning**: True feature estimates including all nested work
- **Progress Tracking**: Monitor overall Epic progress automatically
- **JIRA Compatibility**: Matches JIRA's Σ fields behavior

#### Setup (Optional)

Σ fields are **opt-in** - the workflow only calculates them if they exist in your project:

1. Add three number fields to your GitHub Project:
   - Name: `Σ Estimate`
   - Name: `Σ Remaining Work`
   - Name: `Σ Time Spent`

2. Add field descriptions: "System field - automatically calculated, do not edit manually"

3. The sync workflow will automatically start calculating these fields on the next run

If these fields don't exist, the workflow skips Σ field calculation (no errors).


### Status Management for Epics

Epic status should reflect the collective state of its sub-issues:

#### Status Rules

- **If any sub-issue is `In Progress`** → Epic should be **`In Progress`**
- **If Epic is `Done`** → All sub-issues **must be `Done`**
- Epic status reflects the overall state of the grouped work

#### Status Flow Example

1. Epic created → Status: **`Backlog`**
2. First sub-issue starts → Epic: **`In Progress`**
3. Some sub-issues done, others in progress → Epic: **`In Progress`**
4. All sub-issues done → Epic: **`Done`**

**Example:**
```
Epic: Implement User Authentication (Status: In Progress)
├─ Sub-issue 1: Design login UI (Status: Done)
├─ Sub-issue 2: Implement OAuth integration (Status: In Progress)
└─ Sub-issue 3: Add session management (Status: Backlog)
```

### Best Practice

**When to create an Epic:**

Whenever you have two or more tasks related to the same feature/story, consider creating an Epic to group them. This provides better organization and makes it easier to track the overall progress of a feature.


---

## Multi-project support

The workflow is not tied to a single project. It is configured with a list of projects via the `PSYNC_PROJECTS` variable (format: `org:project_number`, space-separated):

```
kubesmarts:1 kubesmarts:2 another-org:5
```

**Any GitHub Project — in any GitHub organization — that uses the required field structure is supported.** A single central automation workflow serves all of them simultaneously with no code duplication.

To onboard a new project:

1. Add the required fields to the project (see field list above).
2. Add the project to the `PSYNC_PROJECTS` variable in the format `<org>:<project-number>`.
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
