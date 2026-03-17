# Sync Project Reporting Metrics

## What it does

This is an **automation workflow** designed to facilitate **progress reporting and sync across multiple GitHub Projects**. It runs **once daily at 00:00 UTC** and checks **all items across all configured projects**. For each item it compares the current values of the tracked fields (**Status**, **Priority**, **Version**, **Estimate**, **Remaining Work**, **Time Spent**) against the last entry in the item's **`Reporting Log`** field. If a change is detected (or the log is empty), the workflow:

1. Sets **`Reporting Date`** to today
2. Prepends a new entry to **`Reporting Log`** in the format:
   ```
   YYYY-MM-DD, Area, Status, Priority, Version, Estimate, Remaining Work, Time Spent
   ```
3. (Optional) Syncs **Priority**, **Estimate**, **Remaining Work**, and **Time Spent** to the linked JIRA ticket

No action is taken when non-tracked fields change (e.g. title, assignee).

---

## Setup

### 1. Add the required fields to each project

In every GitHub Project you want to track, make sure the following fields exist (names are **case-sensitive**):

**Tracked fields** — changes to any of these trigger an update:

| Field name           | Type          | Notes                                                                                     |
|----------------------|---------------|-------------------------------------------------------------------------------------------|
| `Status`             | Single select | e.g. Backlog, Next, In Progress, In Review, Done                                                           |
| `Priority`           | Single select | e.g. `Blocker`, `Critical`, `Major`, `Normal`, `Minor`                                    |
| `Version`            | Text          | Target release version (e.g. `3.20`, `2025.Q2`) |
| `Estimate`           | Number        | Estimated effort in weeks (e.g. `2` = 2 weeks, `0.4` = 2 days, `0.1` = 4 hours)         |
| `Remaining Work`     | Number        | Remaining effort in weeks                                                                 |
| `Time Spent`         | Number        | Time already spent in weeks                                                               |
| `Area`               | Single select | `Runtimes`, `Tooling`, `Cloud`, `CI`, `QE`, `Docs`. Synced to JIRA as `area/<value>` label. |
| `External Reference` | Text          | JIRA ticket ID (e.g. `ISSUE-774`) for sync, **or** a `CREATE` directive (see below). |

#### Auto-creating JIRA tickets via the `CREATE` directive

Instead of a JIRA ticket ID, the `External Reference` field can hold a **CREATE directive** to automatically create a new JIRA ticket during the next workflow run:

```
CREATE <projectKey> [<component>]
```

| Example | Effect |
|---------|--------|
| `CREATE QUARKUS` | Creates a Story in the QUARKUS JIRA project |
| `CREATE QUARKUS quarkus-flow` | Creates a Story in QUARKUS with component `quarkus-flow` |

When the workflow detects this pattern it:

1. Creates a JIRA Story with:
   - **Summary** — same as the GH issue title
   - **Description** — `Details at <GH issue URL>`
   - **Label** — `gh-issue-<number>` (e.g. `gh-issue-3`)
   - **Component** — as specified (omitted if not provided)
2. Overwrites the `External Reference` field with the new JIRA key (e.g. `QUARKUS-42`)
3. Immediately syncs all tracked fields (Priority, Area, Estimate, etc.) to the new ticket

On subsequent runs the item is treated as a normal JIRA-synced issue. Requires the `PSYNC_PAT_JIRA` secret and `PSYNC_JIRA_BASE_URL` variable to be configured.

---

**Workflow-managed fields** — updated automatically, do not edit manually:

| Field name       | Type   | Purpose                                                       |
|------------------|--------|---------------------------------------------------------------|
| `Reporting Date` | Date   | Set to today whenever a tracked field changes                 |
| `Reporting Log`  | Text   | Log of changes, newest entry first, max 5 entries             |
| `Alerts`    | Text   | Optional: validation codes and JIRA sync result (see below)  |

**Reporting Log entry format** — entries are separated by ` | `, ordered **newest first**:

```
DATE, Area, Status, Priority, Version, Estimate, Remaining Work, Time Spent
```

Example (newest → oldest, max 5 entries):
```
2026-03-10, CI, In Progress, Major, 3.20, 8, 5, 3 | 2026-03-01, CI, Backlog, Major, 3.20, 8, 8, 0
```

#### Alerts codes

When the optional `Alerts` field is present in a project, the workflow writes one or more comma-separated status codes to it on every run (even when no tracked field changed). An empty value means everything is healthy.

| Code | When set |
|------|----------|
| `NO_ESTIMATE` | `Estimate` is empty and the item's `Status` is neither `Backlog` nor `Next` |
| `NO_REMAINING_WORK` | `Remaining Work` is empty and `Status` is `In Progress` or `In Review` (not raised for `Done` — field is auto-cleared) |
| `NO_AREA` | `Area` is empty and `Status` is not `Backlog` |
| `NO_PRIORITY` | `Priority` is empty and `Status` is not `Backlog` |
| `NO_VERSION` | `Version` is empty and `Status` is not `Backlog` |
| `NO_TIME_SPENT` | `Time Spent` is empty and `Status` is `Done` |
| `NO_ASSIGNEE` | Issue has no assignee and `Status` is `In Progress`, `In Review`, or `Done` |
| `JIRA_NOT_FOUND` | `External Reference` is set but the JIRA ticket returned HTTP 404 |
| `JIRA_SYNC_NOT_ALLOWED` | The JIRA ticket exists but does not carry the `gh-issue-<number>` label |
| `JIRA_SYNC_ERROR HTTP_<code>` | A JIRA API call failed with the given HTTP status code |
| `JIRA_CREATE_ERROR HTTP_<code>` | A `CREATE` directive was detected but the JIRA ticket creation failed |
| `JIRA_CREATE_ERROR NO_ISSUE` | A `CREATE` directive was detected but the item is not linked to a GH issue |
| `JIRA_CREATE_ERROR NO_EXT_REF_FIELD` | A `CREATE` directive was detected but the `External Reference` field is not configured in the project |
| `CHILDREN_STATUS` | Parent/child status inconsistency detected (see below) |

**`CHILDREN_STATUS` rules** — only sub-issues that are also tracked in the same project are considered:

- Parent is `Done` but at least one child is **not** `Done`
- Parent is **not** `Backlog` or `Next`, but at least one child is `Backlog`

Multiple codes are separated by `, ` (e.g. `NO_ESTIMATE, CHILDREN_STATUS`).

---

### 2. Create a Personal Access Token (PAT)

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
2. Click **"Generate new token (classic)"**
3. Give it a name (e.g. `pm-automation`)
4. Under **Scopes**, check both:
   - **`project`** — grants read/write access to GitHub Projects v2
   - **`read:org`** — required to access organization-level project data
5. Click **"Generate token"** and **copy it immediately** (you won't see it again)

> Why not use the default `GITHUB_TOKEN`? That token is scoped to the repository only and cannot read or write fields on organization-level GitHub Projects v2.

The same PAT can access projects across multiple organizations as long as the token owner is a member of each org. For organizations with **SAML SSO**, the PAT must also be authorized per org via **GitHub → Settings → Personal access tokens → Configure SSO → Authorize**.

### 3. Store the PAT as a repository secret

1. Go to **`Repository` → Settings → Secrets and variables → Actions**
2. Click **"New repository secret"**
3. Set **Name** to `PSYNC_PAT_GH` and paste the token as the **Secret**
4. Click **"Add secret"**

### 4. Configure repository variables

The workflow reads its project list and JIRA host from **GitHub Actions Variables** (plaintext config, not secrets).

1. Go to **`Repository` → Settings → Secrets and variables → Actions → Variables tab**
2. Click **"New repository variable"** and add each of the following:

| Variable name   | Example value               | Description |
|-----------------|-----------------------------|-------------|
| `PSYNC_PROJECTS`      | `orgA:1 orgB:3` | Space-separated `owner:project_number` pairs |
| `PSYNC_JIRA_BASE_URL` | `https://redhat.atlassian.net` | Base URL of the JIRA instance (no trailing slash) |
| `PSYNC_JIRA_EMAIL`    | `user@redhat.com` | Atlassian account email used for JIRA API authentication |

**`PSYNC_PROJECTS` format:** each entry is `<org>:<project-number>`, separated by spaces. The project number is the integer in the project URL: `https://github.com/orgs/<org>/projects/<number>`.

Example with three projects across two organizations:
```
orgA:1 orgA:2 orgB:5
```

> **Tip:** Variables can also be defined at the **organization level** (org Settings → Secrets and variables → Actions → Variables) and shared across multiple repositories.

### 5. (Optional) Configure JIRA sync

If you want changes to be synced to JIRA tickets, ensure the `External Reference` field is added to each project (step 1), then configure the following:

1. Generate an Atlassian Cloud API token at **[https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)**
2. Go to **`Repository` → Settings → Secrets and variables → Actions → New repository secret**
3. Set **Name** to `PSYNC_PAT_JIRA` and paste the API token as the **Secret**
4. Go to **Variables tab** and add `PSYNC_JIRA_EMAIL` set to the Atlassian account email that owns the token (e.g. `user@redhat.com`)

> **Note:** Atlassian Cloud uses HTTP Basic authentication (`email:api_token`). The workflow computes the `Authorization: Basic ...` header automatically from `PSYNC_JIRA_EMAIL` and `PSYNC_PAT_JIRA`.

When `External Reference` is set on a project item (e.g. `ISSUE-774`), the workflow will sync to the JIRA ticket **only if the following condition is met**:

1. **The JIRA ticket has the label `gh-issue-<number>`** — where `<number>` is the GitHub issue number linked to the project item (e.g. `gh-issue-3`). Tickets without this label are skipped.

When this condition passes, the workflow will:
- Update **Priority** and **time tracking** (Estimate → original estimate, Remaining Work → remaining estimate) on the JIRA ticket at `<PSYNC_JIRA_BASE_URL>/browse/<External Reference>`
- Keep **Time Spent** in sync: first sync logs a `Copied time spent from GH #<issue>` worklog; subsequent increases log an `Increased time spent from GH #<issue>` worklog
- Keep the **`area/*` label** in sync with the GH `Area` field: removes any existing `area/*` label and adds `area/<value>` (lowercase, e.g. `area/runtimes`, `area/ci`). If `Area` is empty, any existing `area/*` label is removed and none is added.

If `PSYNC_PAT_JIRA` is not set, the JIRA sync step is skipped silently.

### 6. Error notifications via GitHub issues

When errors occur during a run (JIRA sync failures, GraphQL errors, unresolvable project IDs), the workflow automatically opens a GitHub issue in this repository titled **`bug: Error during project(s) sync workflow run`**. If an issue with that title is already open, a new comment is added instead of opening a duplicate.

When a subsequent run completes without errors, the open issue is automatically closed with a resolution comment.

No additional configuration is required — the workflow uses the existing `PSYNC_PAT_GH` token. Anyone watching this repository will receive a GitHub notification when the issue is opened or commented on.

---

Once all steps are done, the workflow runs automatically once daily (00:00 UTC) across all projects listed in `PSYNC_PROJECTS`.

---

## Testing

### Prerequisites

- `PSYNC_PAT_GH` secret is set (PAT with `project` and `read:org` scopes)
- `PSYNC_PROJECTS` variable is set (e.g. `orgA:1`) — **Settings → Secrets and variables → Actions → Variables**
- `PSYNC_JIRA_BASE_URL` variable is set (e.g. `https://redhat.atlassian.net`) — same location
- Each project in `PSYNC_PROJECTS` has `Reporting Date` and `Reporting Log` fields
- (Optional) Each project has a `Alerts` Text field to see validation codes

For JIRA sync testing also:
- `PSYNC_PAT_JIRA` secret is set (Atlassian Cloud API token)
- `PSYNC_JIRA_EMAIL` variable is set (Atlassian account email that owns the token)
- The project has an `External Reference` field with a valid ticket ID on at least one item
- The referenced JIRA ticket has the label `gh-issue-<number>` (e.g. `gh-issue-3` for GH issue #3)

### Manual trigger (skip the scheduled wait)

1. Go to **Actions → Sync Project Reporting Metrics → Run workflow**
2. Click **"Run workflow"**
3. The workflow runs immediately against all projects in `PSYNC_PROJECTS`

### Testing steps

1. **Go to a project** listed in your `PSYNC_PROJECTS` variable and pick any issue/item
2. **Change one of the tracked fields**: Status, Priority, Version, Estimate, Remaining Work, or Time Spent
3. **Trigger the workflow** manually (see above) or wait for 05:00 UTC
4. **Check the Actions log** → open the latest run of `Sync Project Reporting Metrics`. You should see:
   - A `========` header per project with the org and project number
   - The item listed with a change detected and an update confirmation
   - A per-project summary and a grand total at the end
5. **Verify the project item**:
   - `Reporting Date` is set to today
   - `Reporting Log` has a new entry prepended (`YYYY-MM-DD, Area, Status, Priority, Version, Estimate, Remaining Work, Time Spent`), max 5 entries total separated by ` | `
   - `Alerts` (if the field exists) is empty when all validation rules pass, or contains one or more codes (e.g. `NO_ESTIMATE`) when a rule is violated
6. **Verify JIRA sync (if configured)** on the linked ticket:
   - The Actions log shows `Syncing to JIRA ticket: <id>` (confirming the `gh-issue-<number>` label is present)
   - **Priority**, **Original Estimate**, and **Remaining Estimate** match the project item values
   - A worklog entry with comment `Copied time spent from GH #<issue>` or `Increased time spent from GH #<issue>` has been added

### Negative test (optional)

Change a field that is **not** tracked (e.g. title or assignee). After the next run, the log should show `No change detected. Skipping.` for that item.

---

## Troubleshooting

- **Workflow fails with auth error** → `PSYNC_PAT_GH` secret is missing or the PAT doesn't have `project` and `read:org` scopes
- **No projects processed / empty run** → `PSYNC_PROJECTS` variable is not set; go to **Settings → Secrets and variables → Actions → Variables** and verify it exists
- **`PSYNC_PROJECTS` or `PSYNC_JIRA_BASE_URL` not found** → make sure they are defined as **Variables** (not secrets)
- **`Reporting Date` field not found** → field name in the project doesn't exactly match `Reporting Date` (case-sensitive); the project is skipped and the run continues
- **`Reporting Log` field not found** → same as above
- **Item not processed** → the workflow paginates (100 items per page); check the log to confirm the item's page was fetched
- **Project in a different org not processed** → the PAT owner must be a member of that org; for SAML SSO orgs the PAT must be authorized via **GitHub → Settings → Personal access tokens → Configure SSO → Authorize**
- **`Alerts` field not updated** → the field name must be exactly `Alerts` (case-sensitive) and its type must be Text; if absent, the field is silently skipped and a note appears in the Actions log (`not configured`)
- **`Alerts` shows `NO_ESTIMATE` or `NO_REMAINING_WORK`** → set the missing field on the project item, or move the item back to `Backlog` / `Next` status if estimation is not yet applicable
- **`Alerts` shows `NO_AREA`** → set the `Area` field on the project item, or move it back to `Backlog` if area classification is not yet applicable
- **`Alerts` shows `NO_PRIORITY`** → set the `Priority` field on the project item, or move it back to `Backlog` if prioritization is not yet applicable
- **`Alerts` shows `NO_TIME_SPENT`** → the item is `Done` but `Time Spent` is empty; log the actual time spent
- **`Alerts` shows `NO_ASSIGNEE`** → the item is `In Progress`, `In Review`, or `Done` but has no assignee; assign it to the responsible person
- **`Alerts` shows `JIRA_NOT_FOUND`** → the ticket ID in `External Reference` does not exist or is not accessible with the provided credentials
- **`Alerts` shows `JIRA_SYNC_NOT_ALLOWED`** → the JIRA ticket exists but lacks the `gh-issue-<number>` label; add it (e.g. `gh-issue-3`) to the JIRA ticket to opt it in to syncing
- **`Alerts` shows `JIRA_SYNC_ERROR HTTP_<code>`** → a JIRA API call failed; check the Actions log for the response body and consult the JIRA troubleshooting entries below
- **`Alerts` shows `CHILDREN_STATUS`** → resolve the status inconsistency: if the parent is `Done`, all children must also be `Done`; if the parent is active (not `Backlog`/`Next`), no child should still be in `Backlog`
- **JIRA sync skipped with "does not have the 'gh-issue-<number>' label"** → add the label `gh-issue-<number>` to the JIRA ticket to opt it in to syncing
- **JIRA update failed (HTTP 401)** → `PSYNC_PAT_JIRA` is missing or expired, or `PSYNC_JIRA_EMAIL` is wrong; Atlassian Cloud uses Basic auth (`email:api_token`) — verify both are correctly configured
- **JIRA update failed (HTTP 404)** → the ticket ID in `External Reference` does not exist or is not accessible with the provided credentials
- **JIRA update failed (HTTP 400)** → a field value is in an unexpected format (e.g. Priority name doesn't match a valid JIRA priority, or time values are not in the expected format)

---

## Why cron instead of GitHub project events?

GitHub Actions does **not** natively support triggering workflows from GitHub Projects (v2) field changes. The available event triggers (`issues`, `pull_request`, `project_card`, etc.) only fire on classic Projects (v1) or on issue/PR metadata changes — not on custom project fields like `Status`, `Priority`, `Estimate`, etc.

The only way to react to custom project field changes in GitHub Actions is via the **GitHub GraphQL API**, which is only accessible by polling. Hence the scheduled cron approach:

1. The workflow runs on schedule and queries all project items via GraphQL.
2. For each item, it compares the current field values against the last entry in `Reporting Log`.
3. If anything changed since the last run, it updates `Reporting Date` and prepends a new entry to `Reporting Log`.

This is a known limitation of GitHub Projects v2 — there is no `project_field_changed` webhook or Actions trigger available.
