# pm-automations

A collection of project management automations for GitHub Projects, covering progress reporting sync and AI-assisted process quality checks.

## Automations

| Workflow | Description |
|----------|-------------|
| [Sync Project Reporting Metrics](.github/workflows/sync-project-reporting-metrics.md) | Tracks field changes across multiple GitHub Projects, maintains a reporting log, and optionally syncs progress to JIRA |

## Adding new automations

Each automation lives as a GitHub Actions workflow under `.github/workflows/`. Accompany each `.yml` with a `.md` guide covering setup, testing, and troubleshooting.
