# JIRA Issues Export Workflow - Specification

## Overview
A GitHub Actions workflow that exports JIRA issues to CSV files for both active and done items. The workflow retrieves tickets from JIRA using filters, JQL queries, or project keys, applies eligibility rules, and generates project-specific CSV exports that are compatible with the GitHub Project reporting metrics structure.

## Schedule
- **Frequency:** Daily at 00:00 UTC
- **Manual trigger:** Supported via workflow_dispatch

## JIRA Connection Configuration

### Required Secrets
- `PSYNC_PAT_JIRA` - JIRA API token (Atlassian Cloud API token)

### Required Variables
- `PSYNC_JIRA_BASE_URL` - JIRA instance URL (e.g., https://redhat.atlassian.net)
- `PSYNC_JIRA_EMAIL` - JIRA account email

### Issue Discovery Variables (All Optional - At least one required)
- `PSYNC_JIRA_FILTERS` - Comma-separated filter IDs (optional)
- `PSYNC_JIRA_JQL` - Semicolon-separated JQL queries (optional)
- `PSYNC_JIRA_PROJECTS` - Comma-separated project keys (optional)

## Issue Discovery and Retrieval

### Discovery Logic
The workflow uses the same hybrid discovery approach as the compliance checker:

1. Initialize empty issue set (to avoid duplicates)
2. If `PSYNC_JIRA_FILTERS` is set:
   - Parse filter IDs
   - For each filter: fetch issues and add to set
3. If `PSYNC_JIRA_JQL` is set:
   - Parse JQL queries (split by semicolon)
   - For each query: execute and add issues to set
4. If `PSYNC_JIRA_PROJECTS` is set:
   - Parse project keys
   - Generate JQL: `project IN (keys)`
   - Execute and add issues to set
5. Process unique issues from set

### JIRA API Integration

**Authentication:**
- Method: HTTP Basic Auth
- Credentials: `PSYNC_JIRA_EMAIL:PSYNC_PAT_JIRA`

**API Endpoints:**

```
# Get Filter
GET {JIRA_BASE_URL}/rest/api/3/filter/{filterId}

# Execute JQL (with pagination support)
GET {JIRA_BASE_URL}/rest/api/3/search/jql?jql={encodedJQL}&fields=key,project,status,summary,assignee,issuetype,priority,labels,fixVersions,timetracking,worklog,parent,resolution,updated&maxResults=100&startAt={offset}
```

**Required Fields:**
- `key` - Issue key (e.g., SRVLOGIC-900)
- `project` - Project information (key, name)
- `status` - Current status
- `summary` - Issue title
- `assignee` - Assignee information
- `issuetype` - Issue type (Bug, Feature, Epic, etc.)
- `priority` - Priority level
- `labels` - Array of labels
- `fixVersions` - Array of fix versions
- `timetracking` - Original estimate, remaining estimate
- `worklog` - Time spent (sum of worklogs)
- `parent` - Parent issue information (for sub-issues)
- `resolution` - Resolution status (for closed issues)
- `updated` - Last update timestamp

**Aggregate Time Tracking Fields:**

For parent issues (Epics and issues with sub-tasks), JIRA provides aggregated time tracking fields that sum up values from all descendants:

- `aggregatetimeoriginalestimate` - Sum of original estimates (parent + all sub-tasks)
- `aggregatetimespent` - Sum of time spent (parent + all sub-tasks)
- `aggregatetimeestimate` - Sum of remaining estimates (parent + all sub-tasks)

These fields should be requested when available and mapped to the Σ columns in the export files.

**Modified Fields Request:**
```
GET {JIRA_BASE_URL}/rest/api/3/search/jql?jql={encodedJQL}&fields=key,project,status,summary,assignee,issuetype,priority,labels,fixVersions,timetracking,worklog,parent,resolution,updated,aggregatetimeoriginalestimate,aggregatetimespent,aggregatetimeestimate&maxResults=100&startAt={offset}
```

## Project Detection

For each retrieved JIRA ticket:

1. Extract project key from issue key (e.g., `SRVLOGIC-900` → `SRVLOGIC`)
2. Extract issue number from issue key (e.g., `SRVLOGIC-900` → `900`)
3. Use project key to:
   - Determine project name for Initiative field
   - Check for project-specific rules (e.g., SRVLOGIC fixVersion suffix)
   - Generate output file names (lowercase project key)

## Contributor Whitelist Matching

### Whitelist File Location
- Path: `contributors.csv` in repository root
- Format: CSV with columns: `username,active,name,role`

### Whitelist Loading
1. Check if `contributors.csv` exists
2. If exists:
   - Load all entries with `active=true`
   - Extract `name` column (Full name) for matching
   - Build in-memory lookup map: normalized name → username
3. If not exists:
   - Whitelist is disabled
   - All tickets are eligible (except those excluded by other rules)

### Name Matching Algorithm

The assignee matching uses **fuzzy name comparison** to handle:
- Case differences: "Tibor Zimányi" ≈ "Tibor zimanyi"
- Accent differences: "Dominik Hanák" ≈ "Dominik Hanak"
- Name variations: "Francisco J. Tirado Sarti" ≈ "Francisco Javier Tirado Sarti"

**Matching Rules:**

1. **Normalize both names:**
   - Convert to lowercase
   - Remove accents/diacritics (e.g., á→a, é→e, í→i, ñ→n)
   - Split into words (by whitespace)

2. **Match if at least 2 words match:**
   - Extract words from both normalized names
   - Count matching words
   - Match succeeds if ≥ 2 common words

**Examples:**
```javascript
// Case insensitive
"Tibor Zimányi" (JIRA) → normalized: ["tibor", "zimanyi"]
"Tibor zimanyi" (CSV)   → normalized: ["tibor", "zimanyi"]
// Match: 2 words match ✓

// Accent insensitive
"Dominik Hanák" (JIRA) → normalized: ["dominik", "hanak"]
"Dominik Hanak" (CSV)  → normalized: ["dominik", "hanak"]
// Match: 2 words match ✓

// Name variations
"Francisco J. Tirado Sarti" (JIRA) → normalized: ["francisco", "j", "tirado", "sarti"]
"Francisco Javier Tirado Sarti" (CSV) → normalized: ["francisco", "javier", "tirado", "sarti"]
// Match: "francisco", "tirado", "sarti" = 3 words match ✓

// No match - only 1 word
"John Smith" (JIRA) → normalized: ["john", "smith"]
"Jane Doe" (CSV)     → normalized: ["jane", "doe"]
// No match: 0 words match ✗
```

**Implementation Pseudocode:**

```javascript
function normalizeWords(name) {
  return name
    .toLowerCase()
    .normalize("NFD") // Decompose accented chars
    .replace(/[̀-ͯ]/g, "") // Remove diacritics
    .split(/\s+/) // Split by whitespace
    .filter(w => w.length > 0)
}

function matchesContributor(jiraName, csvName) {
  const jiraWords = normalizeWords(jiraName)
  const csvWords = normalizeWords(csvName)
  
  const commonWords = jiraWords.filter(jw => csvWords.includes(jw))
  return commonWords.length >= 2
}
```

### Assignee Resolution

For each JIRA ticket:

1. Extract JIRA assignee display name (e.g., `issue.fields.assignee.displayName`)
2. If whitelist is configured:
   - Check if assignee name matches any contributor in whitelist (using fuzzy matching)
   - If match found: use contributor's `username` from CSV as the exported assignee
   - If no match found: skip ticket (unless special rules apply - see Eligibility Rules)
3. If whitelist is not configured:
   - Use JIRA assignee account ID as exported assignee

## Ticket Eligibility Rules

A ticket is **NOT exported** if any of these conditions are true:

### 1. Backlog Items Without Version
- Ticket status is `BACKLOG` (or equivalent)
- AND `fixVersions` is empty
- **Rationale:** Unplanned backlog items are not tracked in exports

### 2. Backlog Items with Future Version
- Ticket status is `BACKLOG` (or equivalent)
- AND `fixVersions` contains only `"Future"`
- **Rationale:** Future-planned items are not actively tracked

### 3. Unassigned Non-Active Contributors (When Whitelist Configured)
- Whitelist is configured (`contributors.csv` exists)
- AND ticket assignee is not in whitelist
- AND ticket does NOT have a specific fixVersion set (empty or "Future")
- **Rationale:** Untracked contributors' work is only exported if tied to a specific release

### 4. No Assignee and No Specific Version (When Whitelist Configured)
- Whitelist is configured (`contributors.csv` exists)
- AND ticket has no assignee
- AND ticket does NOT have a specific fixVersion set (empty or containing the word "Future" case insensitive)
- **Rationale:** Unassigned work must be tied to a release to be tracked

> **Note:** Issues with the `compliance-alerts` label are **included** in the active items export. Their violation codes are surfaced in the `Alerts` column (see Active Items CSV Columns below).

**Special Case - Whitelisted Backlog Export:**

Backlog items ARE exported if:
- They have a fixVersion set AND
- fixVersion is NOT "Future" AND
- (Assignee matches whitelist OR whitelist is not configured)

**Example Scenarios:**

| Assignee in Whitelist | fixVersion | Status | Exported? | Reason |
|----------------------|------------|--------|-----------|--------|
| Yes | "1.39.0" | Backlog | Yes | Whitelisted + specific version |
| Yes | "Future" | Backlog | No | Future version excluded |
| Yes | (empty) | Backlog | No | No version set |
| Yes | "1.39.0" | In progress | Yes | Whitelisted + specific version |
| No | "1.39.0" | Backlog | No | Not in whitelist |
| No | "1.39.0" | In progress | No | Not in whitelist |
| (none) | "1.39.0" | Backlog | Yes | Specific version allows unassigned |
| (none) | "Future" | Backlog | No | Future version + no assignee |
| (none) | (empty) | Backlog | No | No version + no assignee |

## JIRA Status to CSV Status Mapping

Based on the [JIRA Status to Policy Stage Mapping](https://github.com/kubesmarts/pm-automations/blob/main/.github/workflows/jira-compliance-checker-spec.md#jira-status-to-policy-stage-mapping):

| JIRA Status | CSV Status | Notes |
|-------------|------------|-------|
| NEW | Next | Planning stage |
| REFINEMENT | Next | Planning stage |
| IN PROGRESS | In progress | Active work |
| ON_DEV | In progress | Active work |
| CODE REVIEW | In review | Under review |
| CODE_REVIEW | In review | Under review |
| ON_QA | In review | Under review |
| RELEASE PENDING | Done | Completed |
| CLOSED (resolution: Done) | Done | Completed |
| CLOSED (other resolution) | Skipped | Not exported |

**Note:** Tickets in CLOSED status with resolution other than "Done" (e.g., Duplicate, Won't Fix, Obsolete) are **NOT exported** to either active or done items CSV files.

## Area Extraction from Labels

The `Area` field is derived from JIRA labels matching the pattern `area/<value>`:

1. Search all ticket labels for pattern `area/*`
2. Take the **first** label matching this pattern
3. Remove the `area/` prefix
4. Capitalize only the first letter (exceptions: CI, QE and PM must be in uppercase, in general two letters go uppercase)
5. Use the result as the Area value

**Examples:**

| JIRA Labels | Extracted Area |
|-------------|----------------|
| `["area/ci", "bug"]` | `CI` (2 letters = uppercase) |
| `["area/qe"]` | `QE` (2 letters = uppercase) |
| `["area/pm"]` | `PM` (2 letters = uppercase) |
| `["feature", "area/docs"]` | `Docs` |
| `["area/productization", "area/cloud"]` | `Productization` (first match) |
| `["area/runtimes"]` | `Runtimes` |
| `["area/tooling"]` | `Tooling` |
| `["bug", "feature"]` | (empty - no area label) |

**Label Mapping Reference:**

| Label | Area Value | Rule |
|-------|------------|------|
| `area/ci` | `CI` | 2 letters → uppercase |
| `area/qe` | `QE` | 2 letters → uppercase |
| `area/pm` | `PM` | 2 letters → uppercase |
| `area/docs` | `Docs` | First letter capitalized |
| `area/productization` | `Productization` | First letter capitalized |
| `area/cloud` | `Cloud` | First letter capitalized |
| `area/runtimes` | `Runtimes` | First letter capitalized |
| `area/tooling` | `Tooling` | First letter capitalized |

## Time Value Conversion

### JIRA Time Format
JIRA stores time in seconds and displays it in formats like:
- `2w 3d` (2 weeks 3 days)
- `4h` (4 hours)
- `1w 2d 4h` (1 week 2 days 4 hours)

### GitHub Project Format
GitHub Projects use **weeks** as the unit, based on:
- 1 week = 5 days
- 1 day = 8 hours
- 1 hour = 0.025 weeks (1/40)

### Conversion Formula

**From JIRA seconds to weeks:**

```javascript
function jirasTimeToWeeks(seconds) {
  if (!seconds || seconds === 0) return 0
  
  const hours = seconds / 3600
  return Math.round(hours / 40 * 10) / 10  // Round to 1 decimal
}
```

**Conversion Table:**

| JIRA Time | JIRA Seconds | Weeks Value |
|-----------|-------------|-------------|
| `4h` | 14400 | `0.1` |
| `8h` (1 day) | 28800 | `0.2` |
| `1d` | 28800 | `0.2` |
| `2d` | 57600 | `0.4` |
| `1w` (5 days) | 144000 | `1.0` |
| `2w` | 288000 | `2.0` |
| `2w 3d` | 374400 | `2.6` |

**Reference:** See [Understanding time values](https://github.com/kubesmarts/pm-automations/blob/main/docs/user-guide-rms-projects.md#understanding-time-values) in user guide.

### Time Fields Mapping

| CSV Field | JIRA Field | Conversion |
|-----------|-----------|------------|
| Estimate | `timetracking.originalEstimate` (seconds) | `jirasTimeToWeeks(seconds)` |
| Time Spent | Sum of `worklog.worklogs[].timeSpentSeconds` | `jirasTimeToWeeks(totalSeconds)` |
| Remaining Work | `timetracking.remainingEstimate` (seconds) | `jirasTimeToWeeks(seconds)` |
| Σ Estimate | `aggregatetimeoriginalestimate` (seconds) | `jirasTimeToWeeks(seconds)` |
| Σ Time Spent | `aggregatetimespent` (seconds) | `jirasTimeToWeeks(seconds)` |
| Σ Remaining Work | `aggregatetimeestimate` (seconds) | `jirasTimeToWeeks(seconds)` |

**Handling Missing Values:**
- If JIRA field is `null` or `undefined` → export as empty string
- If JIRA field is `0` → export as `0` (or `0.0`)
- Never export negative values (treat as `0`)

**Handling Aggregate Fields:**
- If aggregate field is not available (issue has no sub-tasks or JIRA doesn't provide it) → leave the Σ column empty
- The workflow should attempt to fetch aggregate fields but not fail if they're unavailable

## Target Milestone Formatting

### General Rule
Use the JIRA `fixVersions` field value as-is.

### SRVLOGIC Project Special Rule
For tickets belonging to the SRVLOGIC project (detected by `project.key === "SRVLOGIC"`):
- Append `" OSL"` suffix to the fixVersion value (only if fixVersion does not contain the word "Future", case unsensitive)
- **Example:** `"1.39.0"` → `"1.39.0 OSL"`

**Handling Multiple Fix Versions:**
- If multiple fixVersions exist, use the **first one** in the array
- Apply the OSL suffix rule if applicable
- **Example:** `["1.39.0", "1.40.0"]` → `"1.39.0 OSL"` (for SRVLOGIC)

**Handling No Fix Version:**
- If `fixVersions` is empty or null → export as empty string

## Project Name Mapping (Initiative Field)

The `Initiative` field represents the full project name, not just the project key.

### Mapping Strategy

**Option 1: Use JIRA Project Name**
- Use `issue.fields.project.name` from JIRA API response
- This is the simplest and most reliable approach
- **Example:** `SRVLOGIC` → `"Serverless Logic"` (from JIRA)

**Option 2: Static Mapping (Fallback)**
If JIRA project name is not descriptive, maintain a static mapping:

```javascript
const PROJECT_NAMES = {
  "SRVLOGIC": "Serverless Logic",
  "QUARKUS": "Quarkus",
  "DROOLS": "Drools",
  // Add more as needed
}

const initiative = PROJECT_NAMES[projectKey] || projectKey
```

**Recommended:** Use Option 1 (JIRA project name) for flexibility.

## Export File Generation

### Active Items Export

**File Name Format:** `<project>-active-items.csv`
- Example: `srvlogic-active-items.csv`
- Project name is **lowercase**

**Eligibility:**
- JIRA status is NOT in `[RELEASE PENDING, CLOSED]`
- AND passes all Eligibility Rules

**Backlog Items Special Rule:**
- Backlog status items are ONLY exported if:
  - They have a fixVersion set AND
  - fixVersion does NOT contain "Future" (case unsensitive) AND
  - (Assignee matches whitelist OR no whitelist configured)

**CSV Columns (Active Items):**

| Column Name | Source | Notes |
|-------------|--------|-------|
| Issue Number | JIRA issue number | e.g., `900` from `SRVLOGIC-900` |
| Parent Issue | Parent issue number | Empty if no parent |
| Issue URL | JIRA issue URL | e.g., `https://redhat.atlassian.net/browse/SRVLOGIC-900` |
| Title | `issue.fields.summary` | |
| Assignees | Contributor username or JIRA assignee ID | See Assignee Resolution |
| Status | Mapped status | See Status Mapping |
| Type | `issue.fields.issuetype.name` | e.g., Feature, Bug, Epic |
| Area | Extracted from `area/*` label | See Area Extraction |
| Priority | `issue.fields.priority.name` | e.g., High, Normal, Low |
| Initiative | Project name | See Project Name Mapping |
| Target Milestone | `fixVersions[0]` + OSL suffix if SRVLOGIC | See Target Milestone Formatting |
| Size | (empty) | Not available in JIRA |
| Estimate | Original estimate in weeks | See Time Conversion |
| Time Spent | Total time spent in weeks | See Time Conversion |
| Remaining Work | Remaining estimate in weeks | See Time Conversion |
| Σ Estimate | Aggregated original estimate in weeks | See Time Conversion (if available) |
| Σ Time Spent | Aggregated time spent in weeks | See Time Conversion (if available) |
| Σ Remaining Work | Aggregated remaining estimate in weeks | See Time Conversion (if available) |
| External Reference | (empty) | Reserved for future use |
| Comments | (empty) | Reserved for future use |
| Reporting Date | Last updated date of the ticket | `issue.fields.updated` formatted as `YYYY-MM-DD`; falls back to current date if absent |
| Alerts | Compliance violation codes from latest compliance comment | Empty if no `compliance-alerts` label; e.g. `NO_ESTIMATE, NO_REMAINING_WORK` |

**File Replacement:**
- If `<project>-active-items.csv` exists → **completely replace** with new export
- If file doesn't exist → create new file

### Done Items Export

**File Name Format:** `<project>-done-items.csv`
- Example: `srvlogic-done-items.csv`
- Project name is **lowercase**

**Eligibility:**
- JIRA status is `RELEASE PENDING`
- OR JIRA status is `CLOSED` with `resolution = Done`
- AND passes all Eligibility Rules

**CSV Columns (Done Items):**

| Column Name | Source | Notes |
|-------------|--------|-------|
| Issue Number | JIRA issue number | e.g., `900` from `SRVLOGIC-900` |
| Parent Issue | Parent issue number | Empty if no parent |
| Issue URL | JIRA issue URL | e.g., `https://redhat.atlassian.net/browse/SRVLOGIC-900` |
| Title | `issue.fields.summary` | |
| Assignees | Contributor username or JIRA assignee ID | See Assignee Resolution |
| Type | `issue.fields.issuetype.name` | e.g., Feature, Bug, Epic |
| Area | Extracted from `area/*` label | See Area Extraction |
| Priority | `issue.fields.priority.name` | e.g., High, Normal, Low |
| Initiative | Project name | See Project Name Mapping |
| Target Milestone | `fixVersions[0]` + OSL suffix if SRVLOGIC | See Target Milestone Formatting |
| Size | (empty) | Not available in JIRA |
| Estimate | Original estimate in weeks | See Time Conversion |
| Time Spent | Total time spent in weeks | See Time Conversion |
| Reporting Date | Last update date | `issue.fields.updated` in `YYYY-MM-DD` format |
| External Reference | (empty) | Reserved for future use |
| Comments | (empty) | Reserved for future use |
| Alerts | Compliance violation codes from latest compliance comment | Empty if no `compliance-alerts` label; e.g. `NO_ESTIMATE, NO_REMAINING_WORK` |

**Columns NOT Present in Done Items:**
- `Status` - Not needed for done items
- `Remaining Work` - Work is complete
- `Σ Estimate` - Aggregation not needed for completed work
- `Σ Time Spent` - Aggregation not needed for completed work
- `Σ Remaining Work` - Work is complete

**Reporting Date Format:**
- Extract `issue.fields.updated` (ISO timestamp)
- Convert to `YYYY-MM-DD` format
- Example: `2026-05-29T14:30:00.000+0000` → `2026-05-29`

### Done Items File Management

**Ordering:**
- All entries MUST be sorted by `Reporting Date` in **descending order** (newest first)
- New entries added at the beginning of the file

**Adding New Entries:**

1. **If file does not exist:**
   - Create new file
   - Add all eligible done items
   - Sort by Reporting Date (newest first)

2. **If file exists:**
   - Load existing entries
   - For each new done item:
     - Check if Reporting Date ≥ first entry's Reporting Date
     - If YES: eligible to add
     - If NO: skip (too old)
   - Remove duplicate entries (same Issue URL, older Reporting Date)
   - Add new entries
   - Sort all entries by Reporting Date (newest first)
   - Write updated file

**Duplicate Prevention:**

Before adding a new entry:
1. Search existing entries for same `Issue URL`
2. If found with older `Reporting Date`:
   - Remove old entry
   - Add new entry
3. If found with newer `Reporting Date`:
   - Skip new entry (keep existing)
4. If not found:
   - Add new entry

**Example Scenario:**

```
Existing file (srvlogic-done-items.csv):
2026-05-30, SRVLOGIC-100, ...
2026-05-29, SRVLOGIC-101, ...
2026-05-28, SRVLOGIC-102, ...

New entries to process:
2026-05-31, SRVLOGIC-103, ...  ← New, add
2026-05-30, SRVLOGIC-100, ...  ← Duplicate, same date, skip
2026-05-29, SRVLOGIC-104, ...  ← New, older than first, skip
2026-05-30, SRVLOGIC-101, ...  ← Duplicate, newer, replace old

Result:
2026-05-31, SRVLOGIC-103, ...  ← New entry added
2026-05-30, SRVLOGIC-101, ...  ← Updated entry
2026-05-30, SRVLOGIC-100, ...  ← Kept existing
2026-05-28, SRVLOGIC-102, ...  ← Kept existing
```

## Output Directory

All export files are written to the `exports/` directory in the repository root:

```
exports/
├── srvlogic-active-items.csv
├── srvlogic-done-items.csv
├── quarkus-active-items.csv
├── quarkus-done-items.csv
└── ...
```

If the `exports/` directory does not exist, create it before writing files.

## Workflow Processing Flow

1. **Initialize:**
   - Load contributor whitelist (if exists)
   - Create exports directory (if needed)
   - Initialize issue set

2. **Discover Issues:**
   - Process PSYNC_JIRA_FILTERS (if set)
   - Process PSYNC_JIRA_JQL (if set)
   - Process PSYNC_JIRA_PROJECTS (if set)
   - Deduplicate by issue key

3. **For Each Unique Issue:**
   - Fetch full issue details from JIRA API
   - Extract project key and issue number
   - Check eligibility rules
   - If not eligible: skip to next issue
   - Resolve assignee (whitelist matching if configured)
   - Map JIRA status to CSV status
   - Extract area from labels
   - Convert time values to weeks
   - Determine if active or done
   - Add to appropriate project's export list

4. **Generate Export Files:**
   - Group issues by project key
   - For each project:
     - Generate active items CSV (replace existing)
     - Generate or update done items CSV (ordered, deduped)
   - Write all files to exports/ directory

5. **Report Summary:**
   - Log total issues processed
   - Log issues skipped (with reasons)
   - Log files generated/updated
   - Create artifact with export files

## Error Handling

### JIRA API Errors
- **401 Unauthorized:** Invalid credentials, stop workflow
- **403 Forbidden:** Insufficient permissions, log and skip issue
- **404 Not Found:** Filter/project doesn't exist, log and skip
- **429 Rate Limit:** Retry with exponential backoff
- **500 Server Error:** Retry up to 3 times, then skip issue

### Data Validation Errors
- **Missing required field:** Log warning, export with empty value
- **Invalid time value:** Log warning, export as `0`
- **Invalid date format:** Log warning, use fallback (current date)

### File System Errors
- **Cannot create exports directory:** Fail workflow with clear error
- **Cannot write CSV file:** Fail workflow with clear error
- **Cannot read existing CSV:** Log warning, treat as new file

## Logging and Reporting

### Console Output
```
Loading contributor whitelist...
  → Loaded 25 active contributors

Discovering issues...
  → Filter 12345: 50 issues
  → JQL query 1: 30 issues
  → Project SRVLOGIC: 100 issues
  → Total unique issues: 150

Processing issues...
  SRVLOGIC-900 → Active (assigned to dgutierr)
  SRVLOGIC-901 → Skipped (compliance-alerts label)
  SRVLOGIC-902 → Skipped (assignee not in whitelist)
  SRVLOGIC-903 → Done (reported 2026-05-30)
  ...

Generating exports...
  srvlogic-active-items.csv → 45 items (replaced)
  srvlogic-done-items.csv → 3 new items added (total: 128)
  quarkus-active-items.csv → 20 items (replaced)
  quarkus-done-items.csv → 1 new item added (total: 89)

Summary:
  Total issues processed: 150
  Active items exported: 65
  Done items exported: 4
  Skipped issues: 81
    - compliance-alerts: 5
    - no version: 30
    - future version: 10
    - not in whitelist: 25
    - no assignee + no version: 11
```

### Artifacts
- Export CSV files uploaded as workflow artifact
- Artifact name: `jira-exports-YYYY-MM-DD`
- Retention: 30 days

## Configuration Requirements

### Secrets
- `PSYNC_PAT_JIRA` - JIRA API token (required)

### Variables
- `PSYNC_JIRA_BASE_URL` - JIRA instance URL (required)
- `PSYNC_JIRA_EMAIL` - JIRA account email (required)
- `PSYNC_JIRA_FILTERS` - Comma-separated filter IDs (optional)
- `PSYNC_JIRA_JQL` - Semicolon-separated JQL queries (optional)
- `PSYNC_JIRA_PROJECTS` - Comma-separated project keys (optional)

### Repository Files
- `contributors.csv` - Contributor whitelist (optional, in repository root)

## Implementation Components

### Files to Create
```
.github/
├── workflows/
│   ├── jira-export.yml (workflow definition)
│   └── scripts/
│       ├── jira-export.js (main orchestration)
│       ├── jira-client.js (JIRA REST API wrapper - reuse from compliance checker)
│       ├── issue-discovery.js (hybrid discovery - reuse from compliance checker)
│       ├── contributor-matcher.js (fuzzy name matching logic)
│       ├── eligibility-checker.js (eligibility rules)
│       ├── field-mapper.js (JIRA to CSV field mapping)
│       ├── time-converter.js (JIRA time to weeks conversion)
│       ├── csv-generator.js (CSV file generation)
│       └── done-items-merger.js (done items deduplication and ordering)
```

### Key Functions

#### contributor-matcher.js
```javascript
- loadContributorWhitelist(filePath) // Load and parse contributors.csv
- normalizeWords(name) // Normalize name for fuzzy matching
- matchContributor(jiraName, contributors) // Find matching contributor
- resolveAssignee(jiraAssignee, whitelist) // Resolve assignee to username
```

#### eligibility-checker.js
```javascript
- hasComplianceAlerts(issue) // Check for compliance-alerts label
- isBacklogWithoutVersion(issue) // Check backlog + no version
- isBacklogWithFutureVersion(issue) // Check backlog + Future version
- isEligibleForExport(issue, whitelist) // Apply all eligibility rules
```

#### field-mapper.js
```javascript
- extractProjectKey(issueKey) // Extract project key from issue key
- extractIssueNumber(issueKey) // Extract issue number from issue key
- extractArea(labels) // Extract area from area/* labels
- mapPriority(jiraPriority) // Map JIRA priority to CSV priority
- formatTargetMilestone(fixVersions, projectKey) // Format with OSL suffix if needed
- getProjectName(projectKey, projectName) // Get initiative name
```

#### time-converter.js
```javascript
- jiraTimeToWeeks(seconds) // Convert JIRA seconds to weeks (1 decimal)
- extractTimeTracking(issue) // Extract all time fields from issue
- formatTimeValue(weeks) // Format weeks for CSV export
```

#### csv-generator.js
```javascript
- generateActiveItemsCSV(issues, projectKey) // Generate active items CSV
- generateDoneItemsCSV(newIssues, existingFile) // Generate/update done items CSV
- writeCSV(filePath, rows, columns) // Write CSV file
```

#### done-items-merger.js
```javascript
- parseExistingCSV(filePath) // Parse existing done items CSV
- mergeDoneItems(newItems, existingItems) // Merge new items with existing
- removeDuplicates(items) // Remove older duplicates by Issue URL
- sortByReportingDate(items) // Sort descending by Reporting Date
- filterByReportingDate(newItems, latestDate) // Filter items by date threshold
```

## Success Criteria

✅ Support all three JIRA discovery methods (filters, JQL, projects)
✅ Load and parse contributor whitelist (if exists)
✅ Fuzzy match JIRA assignee names to contributor names
✅ Apply all eligibility rules correctly
✅ Export backlog items with specific fixVersion (not starting with "Future")
✅ Extract area from area/* labels (first match, capitalized)
✅ Convert JIRA time values to weeks (1 decimal precision)
✅ Apply OSL suffix to SRVLOGIC fixVersions
✅ Generate active items CSV (replace existing)
✅ Generate/update done items CSV (ordered, deduped)
✅ Handle missing/null JIRA fields gracefully
✅ Create exports/ directory if needed
✅ Log processing summary and skip reasons
✅ Upload export files as workflow artifact
✅ Handle JIRA API errors gracefully
✅ Support dry-run mode (no file writes)

## Testing Scenarios

### Scenario 1: New Export (No Existing Files)
- **Setup:** No existing export files, whitelist configured
- **Expected:** Generate both active and done CSV files from scratch

### Scenario 2: Update Active Items
- **Setup:** Existing active items file, new issues discovered
- **Expected:** Completely replace active items file with new export

### Scenario 3: Append Done Items
- **Setup:** Existing done items file, new done issues discovered
- **Expected:** Add new done items to beginning, remove duplicates, maintain order

### Scenario 4: Whitelist Filtering
- **Setup:** Whitelist configured, mix of whitelisted and non-whitelisted assignees
- **Expected:** Only export issues with whitelisted assignees (or specific fixVersion)

### Scenario 5: Backlog with FixVersion
- **Setup:** Backlog items with fixVersion "1.39.0" and "Future"
- **Expected:** Export "1.39.0" items, skip "Future" items

### Scenario 6: Fuzzy Name Matching
- **Setup:** JIRA assignee "Tibor Zimányi", CSV contributor "Tibor zimanyi"
- **Expected:** Match succeeds, use CSV username

### Scenario 7: Time Conversion
- **Setup:** JIRA time "2w 3d" (374400 seconds)
- **Expected:** Export as "2.6" weeks

### Scenario 8: SRVLOGIC Milestone
- **Setup:** SRVLOGIC ticket with fixVersion "1.39.0"
- **Expected:** Export as "1.39.0 OSL"

### Scenario 9: No Whitelist
- **Setup:** No contributors.csv file
- **Expected:** Export all eligible issues, use JIRA assignee IDs

### Scenario 10: Compliance Alerts
- **Setup:** Issue with `compliance-alerts` label and a compliance checker comment
- **Expected:** Issue is exported to active items CSV with violation codes in the `Alerts` column (e.g. `NO_ESTIMATE, NO_REMAINING_WORK`)

### Scenario 11: Compliance Alerts — No Comment
- **Setup:** Issue with `compliance-alerts` label but no compliance checker comment on the ticket
- **Expected:** Issue is exported with `Alerts` column empty

## Next Steps

1. Create workflow YAML file (jira-export.yml)
2. Implement contributor whitelist loader and fuzzy matcher
3. Implement eligibility checker with all rules
4. Implement field mapper (area extraction, project name, milestone formatting)
5. Implement time converter (JIRA seconds to weeks)
6. Implement CSV generators (active and done)
7. Implement done items merger (deduplication and ordering)
8. Add error handling and logging
9. Add dry-run mode support
10. Test with all scenarios
11. Document usage and configuration
12. Deploy and monitor
