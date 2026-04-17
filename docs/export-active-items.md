# Export Active Items Workflow

## Overview

The **Export Active Items** workflow automatically exports active project items from GitHub Projects to CSV files for tracking, reporting, and capacity planning purposes. Items are filtered by status, version, and contributor whitelist.

## Schedule

- **Frequency**: Daily at 00:00 UTC
- **Trigger**: Automated via GitHub Actions schedule, or manually via workflow dispatch

## What Gets Exported

### Included Items

The workflow exports items that meet **all** of the following criteria:

1. **Active Status Items**
   - Items with any status **except**: Done, Cancelled, or Backlog (with exceptions below)
   - Examples: In Progress, To Do, In Review, Blocked, etc.

2. **Backlog Items with Specific Versions**
   - Backlog items are included **only if**:
     - They have a target version set, AND
     - The version is NOT "Future"
   - Examples of included versions: "1.38.0 OSL", "10.1.0 Apache", "1.36.0 OSL"
   - This ensures only planned work with concrete release targets is tracked

3. **Contributor Whitelist**
   - Items must be assigned to at least one **active contributor** listed in `contributors.csv`
   - If `contributors.csv` is missing or has no active contributors, all items are included
   - Items without assignees are excluded when whitelist is active

### Excluded Items

The following items are **NOT** exported:

- ❌ Items with status "Done"
- ❌ Items with status "Cancelled"
- ❌ Backlog items without a target version
- ❌ Backlog items with version "Future"
- ❌ Items not assigned to active contributors (when whitelist is configured)
- ❌ Items without assignees (when whitelist is configured)
- ❌ Archived items
- ❌ Draft items (items without an issue number)

## Export Format

### File Naming

Files are exported to the `exports/` directory with the naming pattern:
```
{organization}-{project-number}-active-items.csv
```

Examples:
- `kiegroup-8-active-items.csv`
- `kubesmarts-1-active-items.csv`
- `quarkiverse-11-active-items.csv`

### CSV Structure

Each export file contains the following columns:

| Column | Description |
|--------|-------------|
| Issue Number | GitHub issue number |
| Parent Issue | Parent issue number (for sub-issues) |
| Issue URL | Direct link to the GitHub issue |
| Title | Issue title |
| Assignees | Comma-separated list of assigned users |
| Status | Current status (e.g., In Progress, To Do) |
| Type | Issue type (e.g., Feature, Bug, Epic) |
| Area | Project area (e.g., Cloud, Runtimes, Tooling) |
| Priority | Priority level (e.g., High, Normal, Low) |
| Initiative | Associated initiative |
| Version | Target version/release |
| Size | Size estimate (e.g., S, M, L, XL) |
| Estimate | Estimated effort in weeks |
| Time Spent | Actual time spent in weeks |
| Remaining Work | Calculated remaining work (Estimate - Time Spent) |
| Σ Estimate | Sum of estimates for parent issues |
| Σ Time Spent | Sum of time spent for parent issues |
| Σ Remaining Work | Sum of remaining work for parent issues |
| External Reference | External tracking reference (e.g., JIRA ID) |
| Comments | Additional notes or comments |

### Data Processing

- **Sorting**: Items are sorted by Issue Number in descending order (newest first)
- **Parent-Child Relationships**: Sub-issues are linked to their parent issues using composite keys (owner/repo#number)
- **CSV Escaping**: All fields are properly escaped to handle commas, quotes, and newlines

## Use Cases

### 1. Capacity Planning
Track active work and remaining effort across teams and projects to plan resource allocation.

### 2. Sprint Planning
Identify items ready for upcoming sprints, especially Backlog items with specific version targets.

### 3. Progress Tracking
Monitor work in progress and time spent vs. estimates for better forecasting.

### 4. Reporting
Generate reports on active work distribution by area, priority, assignee, or version.

### 5. Downstream Data Consumption
The exported CSV files can be consumed by downstream reporting and analytics tooling.

## Configuration

### Required Secrets

- `PSYNC_PAT_GH`: GitHub Personal Access Token with `project` and `read:org` scopes

### Required Variables

- `PSYNC_PROJECTS`: Space-separated list of projects in format `owner:number`
  - Example: `kiegroup:8 kubesmarts:1 quarkiverse:11`

### Optional Configuration

- `contributors.csv`: Contributor whitelist file (optional)
  - Format: `username,active`
  - Only items assigned to contributors with `active=true` are exported
  - If file is missing or empty, all contributors are processed
  - Example:
    ```csv
    username,active
    ricardozanini,true
    fjtirado,true
    wmedvede,false
    ```

## Workflow Execution

### Automatic Execution

The workflow runs automatically every day at midnight UTC, ensuring fresh data for daily planning and reporting.

### Manual Execution

You can manually trigger the workflow:

1. Go to **Actions** tab in the repository
2. Select **Export Active Items** workflow
3. Click **Run workflow**
4. Select the branch (usually `main`)
5. Click **Run workflow** button

## Output

### Success Indicators

When the workflow completes successfully:

- ✅ CSV files are created/updated in the `exports/` directory
- ✅ A commit is created with message: "Export active items YYYY-MM-DD"
- ✅ Changes are pushed to the main branch
- ✅ Console output shows export statistics:
  - Number of items exported per project
  - Number of items skipped by category (Done, Backlog, Cancelled, Draft)

### Example Output

```
========================================
Project: kiegroup #8
========================================
Fetching project metadata and page 1...
Project ID: PVT_kwDOABCDEF
Project Title: KIE Group Project

✓ Exported 45 active item(s) to exports/kiegroup-8-active-items.csv
  Skipped 120 Done item(s)
  Skipped 35 Backlog item(s)
  Skipped 5 Cancelled item(s)
  Skipped 2 draft item(s)
  Skipped 8 item(s) (not in contributor whitelist)

========================================
Total: 45 active item(s) exported across all projects
========================================
```

## Troubleshooting

### No Items Exported

If no items are exported:
- Check that items have the correct status (not Done, Cancelled, or Backlog without version)
- Verify Backlog items have a specific version set (not "Future" or empty)
- Ensure items are not archived

### Missing Fields

If some fields are empty:
- Verify the project has the corresponding custom fields configured
- Check field names match exactly (case-sensitive)
- Ensure field types are supported (text, number, single-select, date)

### Items Not Being Exported

If expected items are not in the export:
- Check if items are assigned to active contributors in `contributors.csv`
- Verify Backlog items have a specific version (not "Future" or empty)
- Ensure items are not in Done, Cancelled, or Archived status
- Check that items have assignees (required when whitelist is active)

### Authentication Errors

If the workflow fails with authentication errors:
- Verify `PSYNC_PAT_GH` secret is set and valid
- Ensure the token has `project` and `read:org` scopes
- Check the token hasn't expired

## Related Documentation

- [Export Done Items Workflow](./export-done-items.md) - For completed items
- [Project Sync Workflow](./sync-project-reporting-metrics.md) - For syncing reporting metrics
- [Projects User Guide](./user-guide-rms-projects.md) - For working with reporting-metrics-based GitHub Projects

---

*Last updated: 2026-04-15*