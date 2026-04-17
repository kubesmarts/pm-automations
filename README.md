# pm-automations

A collection of project management automations for GitHub Projects, covering progress reporting sync and data exports.

## Automations

| Workflow | Description |
|----------|-------------|
| [Sync Project Reporting Metrics](.github/workflows/sync-project-reporting-metrics.md) | Tracks field changes across multiple GitHub Projects, maintains a reporting log, and optionally syncs progress to JIRA |
| [Export Done Items](.github/workflows/export-done-items.md) | Exports completed items from GitHub Projects to CSV files with incremental weekly exports |
| [Export Active Items](.github/workflows/export-active-items.md) | Exports active items (non-Done, non-Cancelled) and Backlog items with specific versions from GitHub Projects to CSV files |

## User guides

| Guide | Description |
|-------|-------------|
| [Projects User Guide](docs/user-guide-rms-projects.md) | How to work with GitHub Projects that use the reporting metrics structure: issue lifecycle, field requirements, alerts, and JIRA integration |

## Adding new automations

Each automation lives as a GitHub Actions workflow under `.github/workflows/`. Accompany each `.yml` with a `.md` guide covering setup, testing, and troubleshooting.
