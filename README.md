# pm-automations

A collection of project management automations for GitHub Projects, covering progress reporting sync, data exports, and interactive dashboards for capacity planning and velocity tracking.

## Automations

| Workflow | Description |
|----------|-------------|
| [Sync Project Reporting Metrics](.github/workflows/sync-project-reporting-metrics.md) | Tracks field changes across multiple GitHub Projects, maintains a reporting log, and optionally syncs progress to JIRA |
| [Export Done Items](.github/workflows/export-done-items.md) | Exports completed items from GitHub Projects to CSV files with incremental weekly exports |
| [Export Active Items](.github/workflows/export-active-items.yml) | Exports active (non-Done, non-Backlog) items from GitHub Projects to CSV files daily for dashboard consumption |

## Dashboards

| Dashboard | Description | Live Demo | Documentation |
|-----------|-------------|-----------|---------------|
| Active Issues Dashboard | Interactive dashboard for visualizing active work with multi-dimensional filtering, capacity planning, velocity tracking, and deadline feasibility analysis | [Dashboard](https://kubesmarts.github.io/pm-automations/dashboard/) | [Documentation](dashboard/README.md) |

## User guides

| Guide | Description |
|-------|-------------|
| [Projects User Guide](docs/user-guide-rms-projects.md) | How to work with GitHub Projects that use the reporting metrics structure: issue lifecycle, field requirements, alerts, and JIRA integration |
| [Dashboard User Guide](dashboard/README.md) | How to use the Active Issues Dashboard for sprint planning, resource allocation, and progress monitoring |

## Adding new automations

Each automation lives as a GitHub Actions workflow under `.github/workflows/`. Accompany each `.yml` with a `.md` guide covering setup, testing, and troubleshooting.
