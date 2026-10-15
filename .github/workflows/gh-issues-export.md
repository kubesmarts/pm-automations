# GH Issues Export Workflow

## Overview

The **GH Issues Export** workflow (`gh-issues-export.yml`) is a unified automation that exports both **active** and **completed (done)** items from configured GitHub Projects into standard CSV files in the `exports/` directory.

Driven by a single Node.js script ([`gh-export.js`](scripts/gh-export.js)), the workflow queries GitHub Projects once per project via GraphQL, partitions the items into active and done subsets in memory, generates both CSV exports, and commits them in a single job.

## Schedule

- **Daily**: 02:00 UTC
- **Tuesdays**: 12:55 UTC (5 min before the 3 PM CEST weekly status meeting, for fresh project metrics)
- **Manual trigger**: Available via `workflow_dispatch` (with `dry_run` option)

## What Gets Exported

### 1. Active Items (`exports/<owner>-<number>-active-items.csv`)

Exports current work-in-progress, ready work, and planned backlog items:
- **Included**:
  - Non-Done, non-Cancelled items (e.g. `In Progress`, `To Do`, `In Review`, `Blocked`, `Next`).
  - `Backlog` items **only if** they have a specific target milestone set (excluding `"Future"`).
  - When `contributors.csv` is present:
    - Items with assignees: must have at least one active whitelisted contributor.
    - Items without assignees: included if they have a specific target milestone set.
- **Excluded**:
  - `Done` and `Cancelled` items.
  - `Backlog` items without a specific target milestone.
  - Archived and draft items.
- **Sorting**: Sorted by `Issue Number` descending (numeric order, newest first).
- **Columns (23)**:
  `Issue Number`, `Item Type`, `Parent Issue`, `Issue URL`, `Title`, `Assignees`, `Status`, `Type`, `Area`, `Priority`, `Initiative`, `Target Milestone`, `Size`, `Estimate`, `Time Spent`, `Remaining Work`, `Σ Estimate`, `Σ Time Spent`, `Σ Remaining Work`, `External Reference`, `Comments`, `Reporting Date`, `Alerts`.
  - **`Item Type`**: `Issue` or `PR` — distinguishes pull request project items from issue items.

### 2. Done Items (`exports/<owner>-<number>-done-items.csv`)

Exports completed items and maintains historical tracking:
- **Included**:
  - Status is `Done`.
  - **Issue items**: underlying GitHub issue is closed as completed (`stateReason: COMPLETED`) _or_ still open (open items marked Done are exported with the `REPO_ISSUE_OPEN` alert).
  - **PR items**: PR is merged (`state: MERGED`) _or_ still open (`state: OPEN`). PR items closed without merging are excluded (PR equivalent of "not planned").
  - Has a valid `Reporting Date`.
  - Whitelisted assignee (if `contributors.csv` exists).
  - New items, or updated items where exported values changed.
- **Excluded**:
  - Issue items closed as "not planned" (`stateReason: NOT_PLANNED` or missing).
  - PR items whose PR was closed without merging.
  - Items missing `Reporting Date`.
  - Non-whitelisted contributors (when whitelist is active).
  - Unchanged items on incremental runs.
- **Sorting**: Sorted by `Reporting Date` descending (newest first).
- **Ghost Row Eviction ([Issue #114](https://github.com/kubesmarts/pm-automations/issues/114))**:
  When an issue previously recorded in `done-items.csv` transitions back to an active status (e.g. reopened or moved to `In Progress`, `Next`, or `Backlog`), the workflow automatically evicts the stale row from `done-items.csv` and moves it to `active-items.csv`.
- **Change Detection ([Issue #115](https://github.com/kubesmarts/pm-automations/issues/115))**:
  Compares exported columns (`Title`, `Assignees`, `Type`, `Area`, `Priority`, `Initiative`, `Target Milestone`, `Size`, `Estimate`, `Time Spent`, `External Reference`, `Comments`, `Alerts`). Ignores `Reporting Date` and `Parent Issue` to avoid spurious updates.
- **Columns (18)**:
  `Issue Number`, `Item Type`, `Parent Issue`, `Issue URL`, `Title`, `Assignees`, `Type`, `Area`, `Priority`, `Initiative`, `Target Milestone`, `Size`, `Estimate`, `Time Spent`, `Reporting Date`, `External Reference`, `Comments`, `Alerts`.
  - **`Item Type`**: `Issue` or `PR` — distinguishes pull request project items from issue items. PR items always have an empty `Parent Issue` column (PRs have no sub-issues).

## Configuration

### Required Secrets

- `PSYNC_PAT_GH`: GitHub Personal Access Token with `project` and `read:org` scopes, and repository write access to commit export CSVs.

### Required Variables

- `PSYNC_PROJECTS`: Space-separated list of projects in format `owner:number` (e.g. `kubesmarts:1 kubesmarts:2 kiegroup:8`).

### Optional Configuration

- `contributors.csv`: Contributor whitelist file in the repository root.
  - Format: `username,active`
  - When present, filters exports to active contributors (`active=true`).

## File Structure

```
exports/
├── <owner>-<number>-active-items.csv
└── <owner>-<number>-done-items.csv
```

Example:
```
exports/
├── kubesmarts-1-active-items.csv
├── kubesmarts-1-done-items.csv
├── kiegroup-8-active-items.csv
└── kiegroup-8-done-items.csv
```

## Running the Workflow

### Automatic Execution

Runs on schedule daily at 01:00 UTC and Tuesdays at 12:55 UTC.

### Manual / Dry-Run Execution

1. Go to **Actions** → **GH Issues Export**.
2. Click **Run workflow**.
3. (Optional) Check **Dry run** to inspect what would be exported and evicted without writing or committing any files.
4. Click **Run workflow**.

## Troubleshooting

### Items Missing from Export
- **Active Export**: Verify the issue status is not `Done`/`Cancelled`, and if in `Backlog`, that a specific target milestone (not `"Future"`) is configured.
- **Done Export**: Check that `Reporting Date` is set. For issue items, verify the issue was not closed as "not planned". For PR items, verify the PR was not closed without merging. Also confirm assignees are on `contributors.csv` if a whitelist is active.

### Ghost Rows or Status Transitions
If an issue was previously marked `Done` and moved back to active work, running this workflow will immediately evict the item from `<owner>-<number>-done-items.csv` and place it into `<owner>-<number>-active-items.csv`.

---

*Last updated: 2026-07-01*
