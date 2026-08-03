# Archive Project Items Workflow

Manually archives GitHub Project v2 items that match a given filter across one or more projects. Supports dry-run mode so you can preview what would be archived before committing.

## Overview

This workflow:
- Is triggered manually only (`workflow_dispatch`) — no scheduled runs
- Accepts a list of projects and a filter string as inputs
- Paginates through all items in each project (100 at a time)
- Skips items that are already archived
- Archives every non-archived item that matches **all** filter clauses
- Defaults to **dry-run mode** (no changes made unless explicitly disabled)

Archiving removes an item from the project's active view but does **not** close or delete the underlying GitHub issue.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `projects` | Yes | — | Space-separated list of projects in `owner:number` format |
| `filter` | Yes | — | Space-separated filter clauses (see below) |
| `dry_run` | No | `true` | When `true`, log matches without making any changes |

### `projects` format

```
quarkiverse:11 kiegroup:8
```

Each entry is `<org-or-user>:<project-number>`.

### `filter` format

A space-separated list of clauses. Each clause has the form `key:value`. The filter is **composable** — you can include any combination of supported clauses, or use just one.

Currently supported clauses:

| Clause | Matches when… | Notes |
|--------|---------------|-------|
| `status:<value>` | The item's **Status** field equals `<value>` | Case-insensitive |
| `target-milestone:<v1>,<v2>,...` | The item's **Target Milestone** field is one of the comma-separated values | Exact match, case-sensitive |

All clauses that are present must match (AND logic). Omitting a clause means that field is not filtered on — for example, using only `status:Done` will match all Done items regardless of milestone.

New field clauses can be added to the workflow script by extending the `for clause in $FILTER` parser block in [`gh-archive-project-items.yml`](gh-archive-project-items.yml).

> **Note on values with spaces:** because the filter string is word-split by the shell, field values containing spaces (e.g. `In progress`) cannot be expressed as a single clause value. Use exact single-word values or extend the parser if multi-word values are needed.

**Examples:**

```
# Archive all Done items regardless of milestone
status:Done

# Archive Done items in specific milestones only
status:Done target-milestone:2026/Q1,2026/Q2

# Archive all items in a milestone regardless of status
target-milestone:2026/Q1

# Archive items across multiple milestones
target-milestone:2026/Q1,2026/Q2,2026/Q3
```

## Required Secrets

- `PSYNC_PAT_GH`: Personal Access Token with `project` and `read:org` scopes.
  - Same token used by the other `gh-*` workflows in this repository.
  - Must have write access to the projects (to perform archive mutations).

## Usage

### Dry-run (preview only — default)

1. Go to the **Actions** tab in GitHub.
2. Select **GH Archive Project Items**.
3. Click **Run workflow**.
4. Fill in `projects` and `filter`.
5. Leave `dry_run` checked.
6. Click **Run workflow**.

The workflow will log every item that would be archived, then exit without making any changes.

### Live run (actually archive)

Repeat the steps above but **uncheck** `dry_run`.

> ⚠️ Archiving is reversible — you can unarchive items via the GitHub Projects UI or using the `unarchiveProjectV2Item` GraphQL mutation — but always do a dry-run first to confirm the match set is correct.

## Example: archive Quarkiverse project 11

**Inputs:**
- `projects`: `quarkiverse:11`
- `filter`: `status:Done target-milestone:2026/Q1,2026/Q2`
- `dry_run`: `true` (first pass)

**Dry-run output:**

```
========================================
Project: quarkiverse #11
========================================
Project ID: PVT_kwDOBB_IY84BO8dh
Fetched 312 total items.
  [dry-run] would archive: #42 Fix NPE in runtime
  [dry-run] would archive: #87 Add Kubernetes support
  ...
  153 item(s) would be archived (dry-run)

========================================
Total: 153 item(s) matched across all projects (dry-run — no changes made)
========================================
```

After reviewing the list, re-run with `dry_run` unchecked.

## Troubleshooting

### `Error: could not resolve project ID`

- The `owner` part of `projects` is wrong, or the project number doesn't exist.
- The PAT may not have `read:org` scope or doesn't have access to that organisation's projects.

### `Error: GraphQL query failed`

- Check the `PSYNC_PAT_GH` secret has `project` and `read:org` scopes.
- Verify the project is not private to users the PAT cannot see.

### Items not being matched

- Field names are case-sensitive in matching (`Status`, `Target Milestone`). If a project uses different field names, the filter will silently skip those items.
- Check the dry-run output — if `0 item(s) would be archived` the filter may be too restrictive or the field names differ.

### Archive mutation fails for some items

- Each item is archived individually. Failures are logged with `✗ failed:` and the run continues. Check the logs for details.
