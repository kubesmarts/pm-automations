# JIRA Issues Compliance Checker Workflow

## Overview
Automated GitHub Actions workflow that validates JIRA issues against ABLE team's software development lifecycle policies and adds granular violation labels for tracking.

## Quick Start

### 1. Configure Secrets
Go to **Repository → Settings → Secrets and variables → Actions → Secrets**:
- `PSYNC_PAT_JIRA` - Your Atlassian Cloud API token

### 2. Configure Variables
Go to **Repository → Settings → Secrets and variables → Actions → Variables**:
- `PSYNC_JIRA_BASE_URL` - JIRA instance URL (e.g., `https://redhat.atlassian.net`)
- `PSYNC_JIRA_EMAIL` - Your JIRA account email
- At least one of:
  - `PSYNC_JIRA_FILTERS` - Comma-separated filter IDs (e.g., `12345,67890`)
  - `PSYNC_JIRA_JQL` - Semicolon-separated JQL queries (e.g., `project = ISSUE AND status != Closed`)
  - `PSYNC_JIRA_PROJECTS` - Comma-separated project keys (e.g., `ISSUE,QUARKUS`)

### 3. Run the Workflow
- **Automatic:** Runs daily at 06:00 UTC
- **Manual:** Go to **Actions → JIRA Issues Compliance Checker → Run workflow**
  - Optional: Enable "Dry run mode" to test without updating JIRA

## How It Works

### 1. Issue Discovery
The workflow discovers JIRA issues from three sources (all optional, at least one required):

**JIRA Filters:**
```yaml
PSYNC_JIRA_FILTERS: "12345,67890"
```

**JQL Queries:**
```yaml
PSYNC_JIRA_JQL: "project = ISSUE AND status != Closed; assignee = currentUser()"
```

**JIRA Projects:**
```yaml
PSYNC_JIRA_PROJECTS: "ISSUE,QUARKUS,DROOLS"
```

All three can be used together. Issues are automatically deduplicated.

### 2. Policy Validation
Each issue is validated based on its JIRA status:

| JIRA Status | Policy Stage | Required Fields |
|-------------|--------------|-----------------|
| NEW, REFINEMENT | Next | Area, Priority, Fix Versions |
| IN PROGRESS, ON_DEV | In Progress | Area, Priority, Fix Versions, Original Estimate, Remaining Estimate, Assignee |
| CORE_REVIEW, ON_QA | In Review | Area, Priority, Fix Versions, Original Estimate, Remaining Estimate, Assignee |
| RELEASE PENDING, CLOSED | Done | Area, Priority, Fix Versions, Original Estimate, Time Spent, Assignee |

### 3. Violation Labels
One label is added per violation type:

| Label | Meaning |
|-------|---------|
| `NO_AREA` | Missing area/* label |
| `NO_PRIORITY` | Missing priority |
| `NO_VERSION` | Missing fix versions |
| `NO_ESTIMATE` | Missing original estimate |
| `NO_REMAINING_WORK` | Missing remaining estimate |
| `NO_TIME_SPENT` | Missing time spent |
| `NO_ASSIGNEE` | Missing assignee |
| `REMAINING_WORK_NOT_CLEARED` | Remaining work not cleared when Done |

Labels are automatically:
- **Added** when violations are detected
- **Removed** when violations are resolved

### 4. Compliance Report
A JSON report is generated with:
- Total issues checked
- Issues with violations
- Violations by type and status
- JIRA filter URLs for each violation type

Report is uploaded as a workflow artifact.

## Finding Violations in JIRA

### Quick Filters

**All violations:**
```jql
labels IN (NO_AREA, NO_PRIORITY, NO_VERSION, NO_ESTIMATE, NO_REMAINING_WORK, NO_TIME_SPENT, NO_ASSIGNEE, REMAINING_WORK_NOT_CLEARED)
```

**My violations:**
```jql
assignee = currentUser() AND labels IN (NO_ESTIMATE, NO_ASSIGNEE)
```

**Critical violations:**
```jql
labels IN (NO_ESTIMATE, NO_ASSIGNEE, NO_TIME_SPENT) AND status != Backlog
```

**Specific violation type:**
```jql
labels = NO_ESTIMATE ORDER BY priority DESC
```

### Saved Filters
Create and save these filters in JIRA for quick access:

1. **🚨 All Compliance Violations**
   ```jql
   labels IN (NO_AREA, NO_PRIORITY, NO_VERSION, NO_ESTIMATE, NO_REMAINING_WORK, NO_TIME_SPENT, NO_ASSIGNEE, REMAINING_WORK_NOT_CLEARED) ORDER BY priority DESC, updated DESC
   ```

2. **👤 My Compliance Violations**
   ```jql
   assignee = currentUser() AND labels IN (NO_AREA, NO_PRIORITY, NO_VERSION, NO_ESTIMATE, NO_REMAINING_WORK, NO_TIME_SPENT, NO_ASSIGNEE) ORDER BY status
   ```

3. **📊 Missing Estimates**
   ```jql
   labels = NO_ESTIMATE AND status IN ("IN PROGRESS", "CORE_REVIEW") ORDER BY priority DESC
   ```

## Dry Run Mode

Test the workflow without making changes to JIRA:

1. Go to **Actions → JIRA Issues Compliance Checker → Run workflow**
2. Select **"true"** for "Dry run mode"
3. Click **"Run workflow"**

The workflow will:
- ✅ Discover issues
- ✅ Validate compliance
- ✅ Generate report
- ❌ NOT update JIRA labels

## Troubleshooting

### No issues found
- Check that at least one of `PSYNC_JIRA_FILTERS`, `PSYNC_JIRA_JQL`, or `PSYNC_JIRA_PROJECTS` is configured
- Verify filter IDs are correct
- Test JQL queries in JIRA search

### Authentication errors
- Verify `PSYNC_PAT_JIRA` secret is set correctly
- Verify `PSYNC_JIRA_EMAIL` matches the API token owner
- Check API token hasn't expired

### Labels not updating
- Verify you have permission to edit issues in JIRA
- Check workflow logs for specific error messages
- Try dry run mode to test without making changes

### Workflow fails
- Check **Actions** tab for error logs
- Verify all required configuration is set
- Ensure JIRA base URL is correct (no trailing slash)

## Examples

### Example 1: Single Project
```yaml
PSYNC_JIRA_PROJECTS: "ISSUE"
```
Checks all non-closed issues in the ISSUE project.

### Example 2: Multiple Filters
```yaml
PSYNC_JIRA_FILTERS: "12345,67890,11111"
```
Checks issues from three saved JIRA filters.

### Example 3: Custom JQL
```yaml
PSYNC_JIRA_JQL: "project = ISSUE AND status IN ('IN PROGRESS', 'CORE_REVIEW') AND updated >= -7d"
```
Checks in-progress issues updated in the last 7 days.

### Example 4: Hybrid Approach
```yaml
PSYNC_JIRA_FILTERS: "12345"
PSYNC_JIRA_JQL: "assignee = currentUser() AND status != Closed"
PSYNC_JIRA_PROJECTS: "QUARKUS,DROOLS"
```
Combines all three methods. Issues are automatically deduplicated.

## Related Documentation
- [Full Specification](jira-compliance-checker-spec.md)
- [GitHub Issue #54](https://github.com/kubesmarts/pm-automations/issues/54)
- [Policy Source](https://github.com/kubesmarts/pm-automations/blob/main/.github/workflows/sync-project-reporting-metrics.md)