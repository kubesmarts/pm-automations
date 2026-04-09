# Export Done Items Workflow

Automatically exports completed items from GitHub Projects to a single CSV file per project in the repository. Runs weekly and maintains incremental exports with items sorted by Reporting Date in descending order.

## Overview

This workflow:
- Runs every Sunday at midnight UTC (00:00)
- Exports items with Status = "Done" from all configured projects
- Maintains one CSV file per project in the `exports/` directory
- Only exports items without validation alerts
- Performs incremental exports (only new Done items since last export)
- New items are prepended at the beginning, sorted by Reporting Date (descending)
- On first run, exports all historical Done items

### Contributor Whitelist Filtering

The workflow can be configured to export only items assigned to approved contributors. This is controlled by a `contributors.csv` file in the repository root.

**When `contributors.csv` exists:**
- Only items with at least one whitelisted assignee are exported
- Items with no assignees or only non-whitelisted assignees are skipped
- Skipped items are logged with reason "assignees not in contributor whitelist"

**When `contributors.csv` doesn't exist:**
- All items are exported (backward compatible behavior)

See the [Contributor Access Management](../docs/user-guide-rms-projects.md#contributor-access-management) section in the user guide for details on managing the whitelist.


## Schedule

```yaml
schedule:
  - cron: '0 0 * * 0'  # Every Sunday at 00:00 UTC
```

**Manual trigger:** Available via workflow_dispatch

## Configuration

### Required Secrets

- `PSYNC_PAT_GH`: Personal Access Token with `project` and `read:org` scopes
  - Same token used by the sync workflow
  - Must have write access to the repository (for committing CSV files)

### Required Variables

- `PSYNC_PROJECTS`: Space-separated list of projects in format `owner:number`
  - Example: `kubesmarts:1 kubesmarts:2 another-org:5`
  - Same variable used by the sync workflow

## Export Criteria

An item is exported **only if ALL** conditions are met:

1. ✅ **Status = "Done"** (case-insensitive)
2. ✅ **Has GitHub issue number** (not a draft item)
3. ✅ **Not archived**
4. ✅ **Reporting Date > last export date** (or first run)
5. ✅ **Alerts field is empty** (no validation issues)
6. ✅ **Assignee is in contributor whitelist** (if `contributors.csv` exists)

Items with alerts are skipped and will be exported once the alerts are resolved.

Items with non-whitelisted assignees (when whitelist is active) are skipped and logged.

## File Structure

```
exports/
├── kubesmarts-1-done-items.csv
├── kubesmarts-2-done-items.csv
└── another-org-5-done-items.csv
```

- One CSV file per project: `exports/<owner>-<number>-done-items.csv`
- Files are committed and pushed to the repository
- Items are sorted by Reporting Date in descending order (most recent first)

## CSV Format

### Header (fixed for all projects)

```csv
Issue Number,Title,Assignees,Type,Area,Priority,Initiative,Version,Size,Estimate,Time Spent,Reporting Date,External Reference,Comments
```

### Field Descriptions

| Field | Description | Notes |
|-------|-------------|-------|
| Issue Number | GitHub issue number | Required (draft items skipped) |
| Title | Issue title | Escaped for CSV |
| Assignees | Comma-separated list of assignees | Empty if no assignees |
| Type | Issue type (Story, Bug, Task, etc.) | Empty if field not in project |
| Area | Area field value | Empty if field not in project |
| Priority | Priority field value | Empty if field not in project |
| Initiative | Initiative field value | Empty if field not in project |
| Version | Version field value | Empty if field not in project |
| Size | Size field value (S, M, L, etc.) | Empty if field not in project |
| Estimate | Estimate in weeks | Empty if field not in project |
| Time Spent | Time spent in weeks | Empty if field not in project |
| Reporting Date | Date when item was last updated | Required - items without this field are skipped |
| External Reference | JIRA ticket key or other reference | Empty if field not in project |
| Comments | Comments field from project | Empty if field not in project |

### CSV Escaping

- Fields containing commas, quotes, or newlines are wrapped in double quotes
- Double quotes within fields are escaped as `""`
- Multiple assignees are comma-separated within quotes: `"alice,bob,charlie"`

## Export Logic

### First Run (No Previous Export)

When the CSV file doesn't exist or is empty for a project:
- Exports **ALL** items with Status = "Done", a Reporting Date, and no Alerts
- Creates baseline export with all historical completed items
- Items are sorted by Reporting Date in descending order
- File: `exports/<owner>-<number>-done-items.csv`

### Subsequent Runs (Incremental)

When the CSV file exists and has data:
- Reads the Reporting Date from the first data line (most recent item)
- Exports only items where Reporting Date exists and > last export date
- New items are sorted by Reporting Date in descending order
- New items are prepended at the beginning of the file (after header)
- Skips items without Reporting Date
- Skips items with Alerts (exported when alerts are fixed)
- File: `exports/<owner>-<number>-done-items.csv` (updated in place)

### No New Items

If no items meet the export criteria:
- No CSV file is created
- Workflow completes successfully
- No commit is made

## Workflow Output

### Example: First Run

```
========================================
Project: kubesmarts #1
========================================
First export for kubesmarts:1 - exporting all Done items
Fetching project metadata and page 1...
Project ID: PVT_kwDOABcD...

  → Skipping issue #58: has alerts (NO_TIME_SPENT)

✓ Exported 42 item(s) to exports/kubesmarts-1-done-items.csv
  Skipped 1 item(s) with alerts

========================================
Total: 42 item(s) exported across all projects
========================================
```

### Example: Incremental Run

```
========================================
Project: kubesmarts #1
========================================
Incremental export since 2026-03-23
Fetching project metadata and page 1...
Project ID: PVT_kwDOABcD...

✓ Exported 5 item(s) to exports/kubesmarts-1-done-items.csv
  Skipped 12 item(s) already exported

========================================
Total: 5 item(s) exported across all projects
========================================
```

## Commit Message

When exports are created, the workflow commits with:

```
Export Done items YYYY-MM-DD
```

Example: `Export Done items 2026-03-30`

## Troubleshooting

### No CSV files created

**Possible causes:**
- No items with Status = "Done"
- All Done items have Alerts
- All Done items already exported (Reporting Date ≤ last export date)
- All Done items are draft items (no GitHub issue number)

**Solution:** Check the workflow log for skip reasons

### GraphQL errors

**Possible causes:**
- Invalid project owner or number in `PSYNC_PROJECTS`
- PAT lacks required permissions
- Project doesn't exist or is not accessible

**Solution:** Verify `PSYNC_PROJECTS` variable and PAT permissions

### Missing fields in CSV

**Expected behavior:** If a project doesn't have a field (e.g., "Initiative", "Size"), the CSV will have an empty value for that field. This is normal and allows the same CSV format across all projects.

### Items with alerts not exported

**Expected behavior:** Items with validation alerts are intentionally skipped. They will be exported once the alerts are resolved and the Reporting Date is updated.

## Integration with Sync Workflow

This workflow complements the [Sync Project Reporting Metrics](.github/workflows/sync-project-reporting-metrics.md) workflow:

- **Sync workflow** (daily): Updates project fields, validates data, syncs to JIRA
- **Export workflow** (weekly): Exports clean, validated Done items to CSV

Both workflows:
- Use the same `PSYNC_PROJECTS` variable
- Use the same `PSYNC_PAT_GH` secret
- Query the same projects
- Use the same field extraction logic

## Use Cases

- **Historical reporting**: Track completed work over time
- **Velocity analysis**: Analyze estimate vs. actual time spent
- **External tools**: Import CSV data into spreadsheets or BI tools
- **Retrospectives**: Review completed items from previous sprints
- **Audit trail**: Version-controlled record of completed work

## Maintenance

### Adding a new project

1. Add project to `PSYNC_PROJECTS` variable (format: `owner:number`)
2. Next Sunday, workflow will create first export with all Done items
3. Subsequent runs will be incremental

### Removing a project

1. Remove project from `PSYNC_PROJECTS` variable
2. Existing CSV files in `exports/<project>/` remain in repository
3. No new exports will be created for that project

### Changing export schedule

Edit the cron expression in the workflow file:

```yaml
schedule:
  - cron: '0 0 * * 0'  # Current: Every Sunday at 00:00 UTC
```

Examples:
- Daily: `0 0 * * *`
- Every Monday: `0 0 * * 1`
- First day of month: `0 0 1 * *`

## Testing

### Manual trigger

1. Go to Actions tab in GitHub
2. Select "Export Done Items" workflow
3. Click "Run workflow"
4. Select branch and click "Run workflow"

### Verify exports

1. Check `exports/<project>/` directories for new CSV files
2. Open CSV files to verify data
3. Check git history for commit message

### Test with specific project

Temporarily modify `PSYNC_PROJECTS` variable to include only one project for testing.