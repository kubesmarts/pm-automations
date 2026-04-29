# JIRA Status Compliance Checker - Specification

## Overview
A GitHub Actions workflow that validates JIRA issues against ABLE team's software development lifecycle policies. The workflow uses a hybrid approach to discover issues from multiple sources (Filters, JQL, Projects) and reports compliance issues using granular JIRA labels for precise filtering.

## JIRA Status to Policy Stage Mapping

| JIRA Status | Policy Stage | Required Fields |
|-------------|--------------|-----------------|
| NEW, REFINEMENT | Next | Area, Priority, Fix Versions |
| IN PROGRESS, ON_DEV | In Progress | Area, Priority, Fix Versions, Original Estimate, Remaining Estimate, Assignee |
| CORE_REVIEW, ON_QA | In Review | Area, Priority, Fix Versions, Original Estimate, Remaining Estimate, Assignee |
| RELEASE PENDING | Done | Area, Priority, Fix Versions, Original Estimate, Time Spent, Assignee |
| CLOSED (resolution: Done) | Done | Area, Priority, Fix Versions, Original Estimate, Time Spent, Assignee |
| CLOSED (other resolution) | Skipped | No checks — no work was done or planned |

## JIRA Field Validation Rules

### Field Definitions
| Field Name | JIRA Field | Type | Validation |
|------------|------------|------|------------|
| Component | Component | Single select | Must be set (SRVLOGIC issues only) |
| Area | area/\<value\> label | Label | Must have one label matching pattern `area/*` (e.g., area/ci, area/runtimes, area/tooling, area/cloud, area/qe, area/docs). For SRVLOGIC issues, automatically synced with Component field |
| Priority | Priority | Single select | Must be set to one of: Blocker, Critical, Major, Normal, Minor |
| Version | Fix Versions | Array | Must have at least one version set |
| Estimate | Original Estimate | Time tracking | Must be set (any positive value) |
| Remaining Work | Remaining Estimate | Time tracking | Must be set (any positive value) |
| Time Spent | Time Spent (worklog sum) | Time tracking | Must be set (can be 0, but field must exist/not be null) |
| Assignee | Assignee | User | Must have at least one assignee |

### Component-to-Area Label Mapping (SRVLOGIC Issues Only)

For issues with keys starting with `SRVLOGIC-`, the Area label is automatically synchronized with the Component field according to this mapping:

| JIRA Component | Area Label |
|----------------|------------|
| CI:Midstream | area/ci |
| Documentation | area/docs |
| Productization | area/productization |
| Agile | area/pm |
| Cloud:CLI | area/cloud |
| Cloud:Images | area/cloud |
| Cloud:Operator | area/cloud |
| Event Orchestration | area/runtimes |
| Integration | area/runtimes |
| Job Service | area/runtimes |
| Persistence | area/runtimes |
| Service Orchestration | area/runtimes |
| Security | area/runtimes |
| Getting Started | area/docs |
| Migration | area/runtimes |
| Installation | area/docs |
| Management Console | area/tooling |
| Tooling:DataIndexWebapp | area/tooling |
| Tooling:Editor | area/tooling |
| Tooling:VSCode | area/tooling |
| Tooling:WebTools | area/tooling |
| QE Test Suite | area/qe |
| serverless-workflow | area/runtimes |

**Synchronization Behavior:**
- If Component is set and Area label is missing → Area label is automatically added
- If Component is set and wrong Area label exists → Wrong Area label is removed and correct one is added
- If Component changes → Old Area label is removed and new Area label is added
- Only one Area label should exist per issue (matching the Component)

### Policy Rules by Status

#### Backlog
- **No required fields** - All fields are optional

#### Next (JIRA: NEW, REFINEMENT)
- **Required:** Area (area/* label), Priority, Fix Versions
- **Recommended:** Original Estimate, Remaining Estimate
- **Optional:** Time Spent, Assignee

#### In Progress (JIRA: IN PROGRESS, ON_DEV)
- **Required:** Area (area/* label), Priority, Fix Versions, Original Estimate, Remaining Estimate, Assignee
- **Update Often:** Time Spent

#### In Review (JIRA: CORE_REVIEW, ON_QA)
- **Required:** Area (area/* label), Priority, Fix Versions, Original Estimate, Remaining Estimate, Assignee
- **Update Often:** Time Spent

#### Done (JIRA: RELEASE PENDING, CLOSED with resolution Done)
- **Required:** Area (area/* label), Priority, Fix Versions, Original Estimate, Time Spent (must be set, can be 0), Assignee
- **Auto-cleared:** Remaining Estimate (should be 0 or empty)

#### Skipped (JIRA: CLOSED with resolution other than Done)
- Issues closed as Duplicate, Won't Fix, Obsolete, or any non-Done resolution are skipped entirely.
- No compliance checks are performed since no work was done or planned.
- Any existing `compliance-alerts` label and compliance comment are cleaned up automatically.

## Hybrid Issue Discovery Approach

### Configuration Variables (All Optional)

#### 1. JIRA Filter IDs
- **Variable:** `PSYNC_JIRA_FILTERS`
- **Format:** Comma-separated list of JIRA filter IDs
- **Example:** `12345,67890,11111`
- **Use Case:** Reusable saved filters managed in JIRA UI

#### 2. Direct JQL Queries
- **Variable:** `PSYNC_JIRA_JQL`
- **Format:** Semicolon-separated list of JQL queries
- **Example:** `project = ISSUE AND status != Closed; assignee = currentUser() AND labels = able-team`
- **Use Case:** Flexible ad-hoc queries without creating filters

#### 3. JIRA Project Keys
- **Variable:** `PSYNC_JIRA_PROJECTS`
- **Format:** Comma-separated list of JIRA project keys
- **Example:** `ISSUE,QUARKUS,DROOLS`
- **Use Case:** Check all issues in specific projects
- **Auto-generated JQL:** `project IN (ISSUE,QUARKUS,DROOLS) AND status != Closed`

### Processing Logic
```javascript
1. Initialize empty issue set (to avoid duplicates)
2. If PSYNC_JIRA_FILTERS is set:
   - Parse filter IDs
   - For each filter: fetch issues and add to set
3. If PSYNC_JIRA_JQL is set:
   - Parse JQL queries (split by semicolon)
   - For each query: execute and add issues to set
4. If PSYNC_JIRA_PROJECTS is set:
   - Parse project keys
   - Generate JQL: "project IN (keys) AND status != Closed"
   - Execute and add issues to set
5. Process unique issues from set
```

### Example Configuration
```yaml
# All three can be used together
PSYNC_JIRA_FILTERS: "12345,67890"
PSYNC_JIRA_JQL: "project = ISSUE AND assignee = currentUser(); labels = critical-bug"
PSYNC_JIRA_PROJECTS: "QUARKUS,DROOLS"

# Or just one
PSYNC_JIRA_JQL: "project = ISSUE AND status IN ('IN PROGRESS', 'CORE_REVIEW')"

# Or any combination
PSYNC_JIRA_FILTERS: "12345"
PSYNC_JIRA_PROJECTS: "ISSUE"
```

## Validation Logic

### For Each JIRA Issue:
1. **Fetch JIRA issue** via REST API (including components and resolution fields)
2. **Extract status** from issue.fields.status.name
3. **Check if CLOSED with non-Done resolution** (Duplicate, Won't Fix, Obsolete, etc.)
   - If YES: skip all compliance checks, clean up any existing `compliance-alerts` label and comment, continue to next issue
4. **Check if SRVLOGIC issue** (key starts with `SRVLOGIC-`)
   - If YES: Validate Component field and sync Area label
   - If NO: Skip Component/Area validation
5. **Component/Area Validation (SRVLOGIC only):**
   - Check if Component is set → Add `NO_COMPONENT` if missing
   - If Component is set and in mapping:
     - Check if correct Area label exists
     - Add correct Area label if missing
     - Remove incorrect Area labels
6. **Determine policy stage** based on status mapping
7. **Validate required fields** for that stage
8. **Generate alert codes**
9. **Update JIRA ticket labels:**
   - Add specific alert labels (e.g., `NO_ESTIMATE`, `NO_ASSIGNEE`, `NO_COMPONENT`)
   - Remove alert labels that are now resolved
   - Sync Area labels for SRVLOGIC issues

### Label Management Logic
```javascript
// For each issue
currentAlerts = validateIssue(issue)
existingAlertLabels = getAlertLabels(issue)

// For SRVLOGIC issues: Check Component/Area sync
if (issue.key.startsWith('SRVLOGIC-')) {
  componentAreaSync = validateComponentAndArea(issue)
  if (componentAreaSync.shouldSync) {
    labelsToAdd.push(...componentAreaSync.labelsToAdd)
    labelsToRemove.push(...componentAreaSync.labelsToRemove)
  }
}

// Add new alert labels
labelsToAdd = currentAlerts - existingAlertLabels
for (label in labelsToAdd) {
  addLabel(issue, label)
}

// Remove resolved alert labels
labelsToRemove = existingAlertLabels - currentAlerts
for (label in labelsToRemove) {
  removeLabel(issue, label)
}
```

### Alert Codes (Used as Labels)
| Code/Label | Description | When Raised |
|------------|-------------|-------------|
| `NO_COMPONENT` | Component field is not set | SRVLOGIC issues only - Component field is empty/null |
| `NO_AREA` | No area/* label found | Required for Next, In Progress, In Review, Done (after Component/Area sync for SRVLOGIC) |
| `NO_PRIORITY` | Priority field is empty | Required for Next, In Progress, In Review, Done |
| `NO_VERSION` | Fix Versions is empty | Required for Next, In Progress, In Review, Done |
| `NO_ESTIMATE` | Original Estimate is empty | Required for In Progress, In Review, Done |
| `NO_REMAINING_WORK` | Remaining Estimate is empty | Required for In Progress, In Review |
| `NO_TIME_SPENT` | Time Spent field is null/not set | Required for Done (value can be 0, but field must exist) |
| `NO_ASSIGNEE` | Assignee field is empty | Required for In Progress, In Review, Done |
| `REMAINING_WORK_NOT_CLEARED` | Remaining Estimate > 0 when Done | Status is Done but Remaining Estimate not cleared |

## JIRA API Integration

### Authentication
- **Method:** HTTP Basic Auth
- **Credentials:** `PSYNC_JIRA_EMAIL:PSYNC_PAT_JIRA`
- **Base URL:** From `PSYNC_JIRA_BASE_URL` variable

### API Endpoints

**Note:** Using JIRA REST API v3 (v2 has been deprecated). The `/rest/api/3/search` endpoint has been removed and replaced with `/rest/api/3/search/jql` (GET method with query parameters).

#### Get Filter and Execute
```
GET {JIRA_BASE_URL}/rest/api/3/filter/{filterId}
GET {JIRA_BASE_URL}/rest/api/3/search/jql?jql={filter.jql}&fields=key,status,priority,fixVersions,timetracking,worklog,assignee,labels,components&maxResults=100&startAt=0
```

#### Execute JQL Query
```
GET {JIRA_BASE_URL}/rest/api/3/search/jql?jql={encodedJQL}&fields=key,status,priority,fixVersions,timetracking,worklog,assignee,labels,components&maxResults=100&startAt=0
```

#### Update Issue Labels (Add/Remove)
```
PUT {JIRA_BASE_URL}/rest/api/3/issue/{issueKey}
Body: {
  "update": {
    "labels": [
      {"add": "NO_ESTIMATE"},
      {"add": "NO_ASSIGNEE"},
      {"remove": "NO_PRIORITY"}
    ]
  }
}
```

## Workflow Features

### Execution
- **Schedule:** Daily at 06:00 UTC
- **Manual trigger:** With dry-run option (no JIRA updates)
- **Input:** Hybrid discovery from filters, JQL, and projects

### Processing Flow
1. **Discover issues from all sources:**
   - Process PSYNC_JIRA_FILTERS (if set)
   - Process PSYNC_JIRA_JQL (if set)
   - Process PSYNC_JIRA_PROJECTS (if set)
   - Deduplicate issues by key
2. **For each unique issue:**
   - Fetch full issue details including existing labels
   - Extract status and map to policy stage
   - Validate required fields
   - Determine current compliance alerts
   - Compare with existing alert labels
   - Add new alert labels
   - Remove resolved alert labels
3. **Generate compliance report**
4. **Create/update GitHub issue** with summary and JIRA filter links

### Reporting
- **JSON artifact:** Detailed compliance alerts per issue with label changes
- **GitHub issue:** Summary with links to JIRA filters for each alert type
- **JIRA labels:** Granular marking on tickets

### Report Structure
```json
{
  "runDate": "2026-04-20T12:00:00Z",
  "sources": {
    "filters": ["12345", "67890"],
    "jqlQueries": ["project = ISSUE AND status != Closed"],
    "projects": ["QUARKUS", "DROOLS"]
  },
  "totalIssues": 150,
  "issuesWithViolations": 25,
  "violations": [
    {
      "jiraKey": "ISSUE-123",
      "jiraUrl": "https://redhat.atlassian.net/browse/ISSUE-123",
      "status": "IN PROGRESS",
      "policyStage": "In Progress",
      "violations": ["NO_ESTIMATE", "NO_ASSIGNEE"],
      "labelsAdded": ["NO_ESTIMATE", "NO_ASSIGNEE"],
      "labelsRemoved": ["NO_PRIORITY"],
      "fields": {
        "area": "area/ci",
        "priority": "Major",
        "fixVersions": ["3.20"],
        "originalEstimate": null,
        "remainingEstimate": "1w",
        "timeSpent": "4h",
        "assignee": null
      }
    }
  ],
  "summary": {
    "bySource": {
      "filter-12345": { "total": 50, "violations": 10 },
      "jql-0": { "total": 75, "violations": 12 },
      "project-QUARKUS": { "total": 25, "violations": 3 }
    },
    "byStatus": {
      "IN PROGRESS": { "total": 45, "violations": 15 },
      "CORE_REVIEW": { "total": 30, "violations": 8 }
    },
    "byViolationType": {
      "NO_ESTIMATE": 12,
      "NO_ASSIGNEE": 18,
      "NO_AREA": 5,
      "NO_PRIORITY": 3,
      "NO_VERSION": 7,
      "NO_REMAINING_WORK": 8,
      "NO_TIME_SPENT": 4,
      "REMAINING_WORK_NOT_CLEARED": 2
    }
  },
  "jiraFilterUrls": {
    "allViolations": "https://redhat.atlassian.net/issues/?jql=labels%20IN%20(NO_AREA%2C%20NO_PRIORITY%2C%20NO_VERSION%2C%20NO_ESTIMATE%2C%20NO_REMAINING_WORK%2C%20NO_TIME_SPENT%2C%20NO_ASSIGNEE%2C%20REMAINING_WORK_NOT_CLEARED)",
    "NO_ESTIMATE": "https://redhat.atlassian.net/issues/?jql=labels%20%3D%20NO_ESTIMATE",
    "NO_ASSIGNEE": "https://redhat.atlassian.net/issues/?jql=labels%20%3D%20NO_ASSIGNEE"
  }
}
```

## Configuration Requirements

### Secrets
- `PSYNC_PAT_JIRA` - JIRA API token (Atlassian Cloud API token)
- `PSYNC_PAT_GH` - GitHub PAT (for creating GitHub issues)

### Variables (All Optional - At least one required)
- `PSYNC_JIRA_BASE_URL` - JIRA instance URL (e.g., https://redhat.atlassian.net)
- `PSYNC_JIRA_EMAIL` - JIRA account email
- `PSYNC_JIRA_FILTERS` - Comma-separated filter IDs (optional)
- `PSYNC_JIRA_JQL` - Semicolon-separated JQL queries (optional)
- `PSYNC_JIRA_PROJECTS` - Comma-separated project keys (optional)

## Implementation Components

### Files to Create
```
.github/
├── workflows/
│   ├── jira-compliance-checker.yml
│   └── scripts/
│       ├── jira-compliance-checker.js (main orchestration)
│       ├── jira-client.js (JIRA REST API wrapper)
│       ├── issue-discovery.js (hybrid discovery logic)
│       ├── policy-validator.js (validation rules)
│       ├── label-manager.js (granular label add/remove)
│       └── report-generator.js (report creation)
└── docs/
    └── jira-compliance-checker.md (user guide with JQL examples)
```

### Key Functions

#### label-manager.js
```javascript
- getViolationLabels(issue) // Extract existing violation labels
- compareViolations(current, existing) // Determine labels to add/remove
- addViolationLabels(issueKey, labels) // Add multiple labels
- removeViolationLabels(issueKey, labels) // Remove multiple labels
- updateLabels(issueKey, toAdd, toRemove) // Single API call for both
```

#### jira-client.js
```javascript
- fetchFilter(filterId) // Get filter details
- searchIssues(jql, startAt) // Execute JQL with pagination
- fetchIssue(issueKey) // Get single issue details
- updateIssueLabels(issueKey, addLabels, removeLabels) // Update labels
```

## Success Criteria
- ✅ Support all three discovery methods (filters, JQL, projects)
- ✅ Gracefully handle missing configuration variables
- ✅ Deduplicate issues from multiple sources
- ✅ Validate all required fields per status
- ✅ Add granular alert labels (one per alert type)
- ✅ Remove alert labels when resolved
- ✅ Generate comprehensive report with per-alert-type statistics
- ✅ Provide JIRA filter URLs for each alert type
- ✅ Skip CLOSED tickets with non-Done resolution (Duplicate, Won't Fix, Obsolete, etc.)
- ✅ Handle JIRA API errors gracefully
- ✅ Support dry-run mode (no JIRA updates)

## Finding Compliance Alerts - Quick Reference Card

### For Developers
```jql
# My compliance alerts
assignee = currentUser() AND labels IN (NO_AREA, NO_PRIORITY, NO_VERSION, NO_ESTIMATE, NO_REMAINING_WORK, NO_TIME_SPENT, NO_ASSIGNEE)

# My missing estimates
assignee = currentUser() AND labels = NO_ESTIMATE
```

### For Team Leads
```jql
# All team compliance alerts
project = ISSUE AND labels IN (NO_AREA, NO_PRIORITY, NO_VERSION, NO_ESTIMATE, NO_REMAINING_WORK, NO_TIME_SPENT, NO_ASSIGNEE) ORDER BY priority DESC

# Critical alerts only
labels IN (NO_ESTIMATE, NO_ASSIGNEE, NO_TIME_SPENT) AND status != Backlog
```

### For Project Managers
```jql
# All alerts by type
labels = NO_ESTIMATE  # or NO_ASSIGNEE, NO_AREA, etc.

# Alerts in active work
labels IN (NO_ESTIMATE, NO_REMAINING_WORK, NO_ASSIGNEE) AND status IN ("IN PROGRESS", "CORE_REVIEW")
```

### GitHub Issue
The automated GitHub issue includes:
- Summary statistics per alert type
- Direct JIRA filter links for each alert type
- Top issues list
- Link to full JSON report

## Next Steps
1. Create workflow YAML file with hybrid discovery
2. Implement issue discovery module
3. Implement JIRA client with label management
4. Implement policy validator
5. Implement granular label manager
6. Implement report generator with per-alert-type URLs
7. Add error handling and pagination
8. Create user documentation with JQL filter examples
9. Test with all three discovery methods
10. Test label add/remove lifecycle
11. Deploy and monitor