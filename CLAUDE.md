# pm-automations — Workspace Guidelines

## Project Overview

A collection of GitHub Actions workflows for project management automation (GitHub Projects + JIRA).
Each workflow under `.github/workflows/` ships with a companion `.md` guide.
User-facing documentation lives in `docs/`.

## Documentation Policy

**Every functional change — addition, modification, or removal — must be accompanied by the corresponding documentation update in the same commit/PR. A change is not complete until the docs reflect it.**

### General rule

For any change to the codebase, ask:
1. **Is there a companion `.md`** next to or near the changed file? → Update it.
2. **Does a `docs/` user guide describe the affected behavior?** → Update it.
3. **Is the change visible in `README.md`** (new workflow, removed workflow, renamed guide)? → Update it.
4. **Is there a test file covering the changed behavior?** → Update or add tests.

If the answer to any of these is yes and the docs/tests are not updated, the change is incomplete.

### Workflow changes (`.github/workflows/*.yml`)

| Change type | Required doc update |
|-------------|---------------------|
| New workflow added | Create a companion `.github/workflows/<name>.md` covering: purpose, inputs/secrets, schedule, dry-run usage, and troubleshooting |
| Existing workflow modified | Update the companion `.md` to reflect the change (new inputs, changed behavior, updated schedule, etc.) |
| Workflow removed | Remove its companion `.md` and remove the entry from `README.md` |

### Script changes (`.github/workflows/scripts/`)

| Change type | Required doc update |
|-------------|---------------------|
| New script added | Document it in the companion `.md` of the workflow that invokes it |
| Existing script behavior changed | Update the relevant workflow `.md` and any `docs/` guides that reference the script |

### User guide changes (`docs/`)

Always review [`docs/user-guide-rms-projects.md`](docs/user-guide-rms-projects.md) when:
- A workflow adds, removes, or renames a field, label, or lifecycle state that end-users interact with
- A new workflow changes how users should manage their GitHub Project or JIRA issues
- An existing workflow changes its behavior in a way that is visible to end-users (e.g. new alerts, changed compliance rules, new export columns)

### README.md

- Keep the **Automations** table in `README.md` in sync: add a row for every new workflow, remove rows for deleted ones.
- Keep the **User guides** table in sync when guides are added or removed from `docs/`.

## Test Coverage Policy

**Every functional change — addition, modification, or removal — must be accompanied by the corresponding test update in the same commit/PR.**

### General rule

For any change to the codebase, ask:
1. **Does a `.test.js` file exist for the changed workflow or script?** → Add, update, or remove tests to match the new behavior.
2. **Is a new validation rule or alert added?** → Add tests for: the happy path (alert raised), all suppression conditions (e.g. backlog, next), the boundary value (e.g. exactly at threshold), and the unconfigured-field case.
3. **Is an existing rule's condition changed?** → Update the affected tests and verify boundary cases still hold.
4. **Is a rule removed?** → Remove its tests.

All tests must pass before committing. Run [`npm test`](.github/workflows/scripts/package.json) in [`.github/workflows/scripts/`](.github/workflows/scripts) to verify.

## Code Style & Conventions

- Workflow filenames: `kebab-case.yml`
- Companion guide filenames: match the workflow name, e.g. `gh-export-done-items.yml` → `gh-export-done-items.md`
- Scripts under `.github/workflows/scripts/` use Node.js; follow the existing `package.json` dependencies.

## Commit Preparation Rule

- Before preparing, suggesting, or executing any commit-related action in this repository, run [`npm test`](.github/workflows/scripts/package.json) in [`.github/workflows/scripts/`](.github/workflows/scripts).
- If the tests fail, do not proceed with the commit request until the failure is resolved or the user explicitly instructs otherwise.
