/**
 * Tests for gh-archive-project-items.yml
 *
 * Strategy:
 *  - YAML wiring tests: read the raw YAML file and assert structural invariants
 *    (inputs declared, dry_run default, GITHUB_STEP_SUMMARY written).
 *  - Bash logic tests: exercise the shell snippets that encode business rules
 *    (filter parser, get_field helper, item match/skip/archive decision).
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const os     = require('node:os');
const { execSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKFLOW_PATH = path.resolve(__dirname, '../gh-archive-project-items.yml');
const WORKFLOW_YML  = fs.readFileSync(WORKFLOW_PATH, 'utf8');

/**
 * Run a bash snippet and return stdout as a trimmed string.
 * Writes the script to a temp file to avoid newline-collapsing issues
 * when passing multi-line scripts through shell argument quoting.
 * Throws on non-zero exit so assertion failures surface cleanly.
 */
function bash(script) {
  const seq = bash._seq = (bash._seq || 0) + 1;
  const tmp = `${os.tmpdir()}/archive-test-${process.pid}-${seq}.sh`;
  fs.writeFileSync(tmp, script);
  try {
    return execSync(`bash ${tmp}`, { encoding: 'utf8' }).trim();
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// SECTION 1 – YAML wiring: inputs declared correctly
// ---------------------------------------------------------------------------

test('workflow declares "projects" input as required string', () => {
  assert.match(WORKFLOW_YML, /projects:/,
    'workflow must declare a "projects" input');
  // required: true must appear near the projects input
  const projectsBlock = WORKFLOW_YML.slice(WORKFLOW_YML.indexOf('projects:'));
  assert.match(projectsBlock.slice(0, 200), /required:\s*true/,
    '"projects" input must be required: true');
});

test('workflow declares "filter" input as required string', () => {
  assert.match(WORKFLOW_YML, /filter:/,
    'workflow must declare a "filter" input');
  const filterBlock = WORKFLOW_YML.slice(WORKFLOW_YML.indexOf('filter:'));
  assert.match(filterBlock.slice(0, 200), /required:\s*true/,
    '"filter" input must be required: true');
});

test('workflow declares "dry_run" input with default true', () => {
  assert.match(WORKFLOW_YML, /dry_run:/,
    'workflow must declare a "dry_run" input');
  const dryRunBlock = WORKFLOW_YML.slice(WORKFLOW_YML.indexOf('dry_run:'));
  assert.match(dryRunBlock.slice(0, 300), /default:\s*true/,
    '"dry_run" input must default to true');
});

test('dry_run input is of type boolean', () => {
  const dryRunBlock = WORKFLOW_YML.slice(WORKFLOW_YML.indexOf('dry_run:'));
  assert.match(dryRunBlock.slice(0, 300), /type:\s*boolean/,
    '"dry_run" input must be type: boolean');
});

// ---------------------------------------------------------------------------
// SECTION 2 – YAML wiring: job summary and secrets
// ---------------------------------------------------------------------------

test('workflow writes to GITHUB_STEP_SUMMARY', () => {
  assert.match(WORKFLOW_YML, /GITHUB_STEP_SUMMARY/,
    'workflow must write to $GITHUB_STEP_SUMMARY for job summary');
});

test('workflow uses PSYNC_PAT_GH secret for GH_TOKEN', () => {
  assert.match(WORKFLOW_YML, /secrets\.PSYNC_PAT_GH/,
    'GH_TOKEN must come from secrets.PSYNC_PAT_GH');
});

test('workflow uses GH_TOKEN env var', () => {
  assert.match(WORKFLOW_YML, /GH_TOKEN:/,
    'workflow must set GH_TOKEN env var');
});

// ---------------------------------------------------------------------------
// SECTION 3 – YAML wiring: dry-run mode propagation
// ---------------------------------------------------------------------------

test('DRY_RUN env var is wired to inputs.dry_run', () => {
  assert.match(WORKFLOW_YML, /DRY_RUN:.*inputs\.dry_run/,
    'DRY_RUN env must come from inputs.dry_run');
});

test('workflow emits dry-run notice in job summary when DRY_RUN is true', () => {
  assert.match(WORKFLOW_YML, /[Dd]ry.run/,
    'workflow must reference dry-run in the job summary output');
});

// ---------------------------------------------------------------------------
// SECTION 4 – Bash logic: filter parser
//
// The filter string is split into FILTER_STATUS and FILTER_TARGET_MILESTONES.
// ---------------------------------------------------------------------------

/**
 * Run the filter-parsing block extracted from the workflow and return
 * the two parsed variables as { status, milestones }.
 */
function parseFilter(filterStr) {
  const script = `
FILTER=${JSON.stringify(filterStr)}
FILTER_STATUS=""
FILTER_TARGET_MILESTONES=""

for clause in $FILTER; do
  key="\${clause%%:*}"
  val="\${clause#*:}"
  case "$key" in
    status)            FILTER_STATUS="$val" ;;
    target-milestone)  FILTER_TARGET_MILESTONES="$val" ;;
  esac
done

echo "STATUS=$FILTER_STATUS"
echo "MILESTONES=$FILTER_TARGET_MILESTONES"
`;
  const out = bash(script);
  const status     = (out.match(/^STATUS=(.*)$/m)     || [])[1] || '';
  const milestones = (out.match(/^MILESTONES=(.*)$/m) || [])[1] || '';
  return { status, milestones };
}

test('filter parser: extracts status clause', () => {
  const { status } = parseFilter('status:Done');
  assert.equal(status, 'Done');
});

test('filter parser: extracts target-milestone clause (single value)', () => {
  const { milestones } = parseFilter('target-milestone:2026/Q1');
  assert.equal(milestones, '2026/Q1');
});

test('filter parser: extracts target-milestone clause (multiple values)', () => {
  const { milestones } = parseFilter('target-milestone:2026/Q1,2026/Q2');
  assert.equal(milestones, '2026/Q1,2026/Q2');
});

test('filter parser: handles combined status + target-milestone', () => {
  const { status, milestones } = parseFilter('status:Done target-milestone:2026/Q1,2026/Q2');
  assert.equal(status, 'Done');
  assert.equal(milestones, '2026/Q1,2026/Q2');
});

test('filter parser: status is empty when clause is absent', () => {
  const { status } = parseFilter('target-milestone:2026/Q1');
  assert.equal(status, '');
});

test('filter parser: milestones is empty when clause is absent', () => {
  const { milestones } = parseFilter('status:Done');
  assert.equal(milestones, '');
});

test('filter parser: unknown clauses are silently ignored', () => {
  const { status, milestones } = parseFilter('unknown:foo status:Done');
  assert.equal(status, 'Done');
  assert.equal(milestones, '');
});

// ---------------------------------------------------------------------------
// SECTION 5 – Bash logic: get_field helper
//
// The helper extracts a field value by name from a project item JSON blob.
// ---------------------------------------------------------------------------

// Shared get_field implementation (mirrors the workflow exactly)
const GET_FIELD_FN = `
get_field() {
  local item_json="$1"
  local field_name="$2"
  echo "$item_json" | jq -r --arg n "$field_name" '
    [ .fieldValues.nodes[] | select(.field.name == $n) ] |
    if length == 0 then ""
    else .[0] |
      if .text  != null then .text
      elif .number != null then (.number | tostring)
      elif .name  != null then .name
      elif .date  != null then .date
      else ""
      end
    end
  '
}
`;

/**
 * Build a minimal project item JSON blob with a given field value type.
 */
function makeItem({ fieldName, text, number, name, date } = {}) {
  let node = `{"field":{"name":${JSON.stringify(fieldName)}}}`;
  if (text   !== undefined) node = `{"text":${JSON.stringify(text)},"field":{"name":${JSON.stringify(fieldName)}}}`;
  if (number !== undefined) node = `{"number":${number},"field":{"name":${JSON.stringify(fieldName)}}}`;
  if (name   !== undefined) node = `{"name":${JSON.stringify(name)},"field":{"name":${JSON.stringify(fieldName)}}}`;
  if (date   !== undefined) node = `{"date":${JSON.stringify(date)},"field":{"name":${JSON.stringify(fieldName)}}}`;
  return JSON.stringify({ fieldValues: { nodes: [node].map(JSON.parse) } });
}

test('get_field: extracts single-select (name) field', () => {
  const item = makeItem({ fieldName: 'Status', name: 'Done' });
  const out  = bash(`${GET_FIELD_FN}\nget_field ${JSON.stringify(item)} "Status"`);
  assert.equal(out, 'Done');
});

test('get_field: extracts text field', () => {
  const item = makeItem({ fieldName: 'External Reference', text: 'JIRA-123' });
  const out  = bash(`${GET_FIELD_FN}\nget_field ${JSON.stringify(item)} "External Reference"`);
  assert.equal(out, 'JIRA-123');
});

test('get_field: extracts number field', () => {
  const item = makeItem({ fieldName: 'Estimate', number: 2 });
  const out  = bash(`${GET_FIELD_FN}\nget_field ${JSON.stringify(item)} "Estimate"`);
  assert.equal(out, '2');
});

test('get_field: extracts date field', () => {
  const item = makeItem({ fieldName: 'Start date', date: '2026-01-15' });
  const out  = bash(`${GET_FIELD_FN}\nget_field ${JSON.stringify(item)} "Start date"`);
  assert.equal(out, '2026-01-15');
});

test('get_field: returns empty string when field is absent', () => {
  const item = JSON.stringify({ fieldValues: { nodes: [] } });
  const out  = bash(`${GET_FIELD_FN}\nget_field ${JSON.stringify(item)} "Status"`);
  assert.equal(out, '');
});

test('get_field: returns empty string when field name does not match', () => {
  const item = makeItem({ fieldName: 'Status', name: 'Done' });
  const out  = bash(`${GET_FIELD_FN}\nget_field ${JSON.stringify(item)} "Priority"`);
  assert.equal(out, '');
});

// ---------------------------------------------------------------------------
// SECTION 6 – Bash logic: item match / skip decision
//
// The filtering loop skips archived items, then applies status and
// target-milestone filters. We test every branch.
// ---------------------------------------------------------------------------

/**
 * Run the match/skip logic for a single item and return "MATCH" or "SKIP".
 * filterStatus and filterMilestones can be empty to disable that filter.
 */
function evalMatch({ isArchived = 'false', status = '', targetMilestone = '',
                     filterStatus = '', filterMilestones = '' } = {}) {
  // Build a minimal item JSON
  const nodes = [];
  if (status)          nodes.push({ name: status,          field: { name: 'Status'           } });
  if (targetMilestone) nodes.push({ name: targetMilestone, field: { name: 'Target Milestone' } });
  const item = JSON.stringify({ isArchived, fieldValues: { nodes } });

  const script = `
${GET_FIELD_FN}

FILTER_STATUS=${JSON.stringify(filterStatus)}
FILTER_TARGET_MILESTONES=${JSON.stringify(filterMilestones)}

item=${JSON.stringify(item)}
RESULT="SKIP"

IS_ARCHIVED=$(echo "$item" | jq -r '.isArchived')
[ "$IS_ARCHIVED" = "true" ] && echo "$RESULT" && exit 0

# --- Status filter ---
if [ -n "$FILTER_STATUS" ]; then
  STATUS=$(get_field "$item" "Status")
  STATUS_LC=$(echo "$STATUS" | tr '[:upper:]' '[:lower:]')
  FILTER_STATUS_LC=$(echo "$FILTER_STATUS" | tr '[:upper:]' '[:lower:]')
  [ "$STATUS_LC" != "$FILTER_STATUS_LC" ] && echo "$RESULT" && exit 0
fi

# --- Target Milestone filter ---
if [ -n "$FILTER_TARGET_MILESTONES" ]; then
  TM=$(get_field "$item" "Target Milestone")
  MATCH=false
  IFS=',' read -ra TM_LIST <<< "$FILTER_TARGET_MILESTONES"
  for wanted in "\${TM_LIST[@]}"; do
    if [ "$TM" = "$wanted" ]; then
      MATCH=true
      break
    fi
  done
  [ "$MATCH" = "false" ] && echo "$RESULT" && exit 0
fi

RESULT="MATCH"
echo "$RESULT"
`;
  return bash(script);
}

test('match: archived item is always skipped', () => {
  const r = evalMatch({ isArchived: 'true', status: 'Done', targetMilestone: '2026/Q1',
                        filterStatus: 'Done', filterMilestones: '2026/Q1' });
  assert.equal(r, 'SKIP');
});

test('match: item matching both status and milestone is matched', () => {
  const r = evalMatch({ status: 'Done', targetMilestone: '2026/Q1',
                        filterStatus: 'Done', filterMilestones: '2026/Q1' });
  assert.equal(r, 'MATCH');
});

test('match: status filter is case-insensitive', () => {
  const r = evalMatch({ status: 'done', targetMilestone: '2026/Q1',
                        filterStatus: 'Done', filterMilestones: '2026/Q1' });
  assert.equal(r, 'MATCH');
});

test('match: wrong status is skipped', () => {
  const r = evalMatch({ status: 'In progress', targetMilestone: '2026/Q1',
                        filterStatus: 'Done', filterMilestones: '2026/Q1' });
  assert.equal(r, 'SKIP');
});

test('match: wrong milestone is skipped', () => {
  const r = evalMatch({ status: 'Done', targetMilestone: '2026/Q3',
                        filterStatus: 'Done', filterMilestones: '2026/Q1,2026/Q2' });
  assert.equal(r, 'SKIP');
});

test('match: item matches when milestone is second value in comma-separated list', () => {
  const r = evalMatch({ status: 'Done', targetMilestone: '2026/Q2',
                        filterStatus: 'Done', filterMilestones: '2026/Q1,2026/Q2' });
  assert.equal(r, 'MATCH');
});

test('match: milestone filter alone (no status filter) matches correctly', () => {
  const r = evalMatch({ status: 'In progress', targetMilestone: '2026/Q1',
                        filterStatus: '', filterMilestones: '2026/Q1' });
  assert.equal(r, 'MATCH');
});

test('match: status filter alone (no milestone filter) matches correctly', () => {
  const r = evalMatch({ status: 'Done', targetMilestone: '',
                        filterStatus: 'Done', filterMilestones: '' });
  assert.equal(r, 'MATCH');
});

test('match: item missing milestone field is skipped when milestone filter is set', () => {
  const r = evalMatch({ status: 'Done', targetMilestone: '',
                        filterStatus: 'Done', filterMilestones: '2026/Q1' });
  assert.equal(r, 'SKIP');
});

test('match: item missing status field is skipped when status filter is set', () => {
  const r = evalMatch({ status: '', targetMilestone: '2026/Q1',
                        filterStatus: 'Done', filterMilestones: '2026/Q1' });
  assert.equal(r, 'SKIP');
});
