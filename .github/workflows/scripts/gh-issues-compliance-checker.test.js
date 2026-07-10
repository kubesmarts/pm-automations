/**
 * Tests for gh-issues-compliance-checker.yml
 *
 * Strategy:
 *  - YAML wiring tests: read the raw YAML file and assert structural invariants
 *    that would cause silent regressions (wrong step ID references, missing outputs).
 *  - Bash logic tests: exercise the shell snippets that encode business rules using
 *    child_process.execSync with minimal self-contained bash scripts and mocked data.
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const { execSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKFLOW_PATH = path.resolve(__dirname, '../gh-issues-compliance-checker.yml');
const WORKFLOW_YML  = fs.readFileSync(WORKFLOW_PATH, 'utf8');

/**
 * Run a bash snippet and return stdout as a trimmed string.
 * Writes the script to a temp file to avoid newline-collapsing issues
 * when passing multi-line scripts through shell argument quoting.
 * Throws on non-zero exit so assertion failures surface cleanly.
 */
function bash(script) {
  const os = require('node:os');
  const seq = bash._seq = (bash._seq || 0) + 1;
  const tmp = `${os.tmpdir()}/compliance-test-${process.pid}-${seq}.sh`;
  fs.writeFileSync(tmp, script);
  try {
    return execSync(`bash ${tmp}`, { encoding: 'utf8' }).trim();
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// SECTION 1 – YAML wiring: step ID and output references
// ---------------------------------------------------------------------------

test('main step has id: check', () => {
  // Matches "id: check" as a YAML key (preceded by spaces/dash)
  assert.match(WORKFLOW_YML, /^\s+id:\s+check\s*$/m,
    'The compliance step must declare "id: check" so downstream steps can read its outputs');
});

test('no downstream step references steps.sync (the old, wrong step ID)', () => {
  // Any occurrence of steps.sync would be a regression to the original bug
  const occurrences = (WORKFLOW_YML.match(/steps\.sync\./g) || []).length;
  assert.equal(occurrences, 0,
    'Found reference(s) to steps.sync — should be steps.check after the fix');
});

test('"Open or update error issue" step references steps.check.outputs.has_errors == true', () => {
  assert.match(WORKFLOW_YML,
    /name: Open or update error issue[\s\S]{0,200}steps\.check\.outputs\.has_errors == 'true'/,
    '"Open or update error issue" must guard on steps.check.outputs.has_errors');
});

test('"Close error issue on clean run" step references steps.check.outputs.has_errors == false', () => {
  assert.match(WORKFLOW_YML,
    /name: Close error issue on clean run[\s\S]{0,200}steps\.check\.outputs\.has_errors == 'false'/,
    '"Close error issue on clean run" must guard on steps.check.outputs.has_errors');
});

test('"Open or update alert notification issue" step references steps.check.outputs.has_alerts == true', () => {
  assert.match(WORKFLOW_YML,
    /name: Open or update alert notification issue[\s\S]{0,200}steps\.check\.outputs\.has_alerts == 'true'/,
    '"Open or update alert notification issue" must guard on steps.check.outputs.has_alerts');
});

test('"Close alert notification issue on clean run" step references steps.check.outputs.has_alerts == false', () => {
  assert.match(WORKFLOW_YML,
    /name: Close alert notification issue on clean run[\s\S]{0,200}steps\.check\.outputs\.has_alerts == 'false'/,
    '"Close alert notification issue on clean run" must guard on steps.check.outputs.has_alerts');
});

test('ERROR_SUMMARY env var is wired to steps.check.outputs.error_summary', () => {
  assert.match(WORKFLOW_YML,
    /ERROR_SUMMARY:.*steps\.check\.outputs\.error_summary/,
    'ERROR_SUMMARY env must come from steps.check.outputs.error_summary');
});

test('ALERTS_DATA env var is wired to steps.check.outputs.alerts_summary', () => {
  assert.match(WORKFLOW_YML,
    /ALERTS_DATA:.*steps\.check\.outputs\.alerts_summary/,
    'ALERTS_DATA env must come from steps.check.outputs.alerts_summary');
});

// ---------------------------------------------------------------------------
// SECTION 2 – YAML wiring: has_errors / has_alerts are written to GITHUB_OUTPUT
// ---------------------------------------------------------------------------

test('workflow writes has_errors=true to GITHUB_OUTPUT when errors exist', () => {
  assert.match(WORKFLOW_YML, /has_errors=true.*GITHUB_OUTPUT|GITHUB_OUTPUT.*has_errors=true/s,
    'has_errors=true must be written to GITHUB_OUTPUT');
});

test('workflow writes has_errors=false to GITHUB_OUTPUT on clean run', () => {
  assert.match(WORKFLOW_YML, /has_errors=false.*GITHUB_OUTPUT|GITHUB_OUTPUT.*has_errors=false/s,
    'has_errors=false must be written to GITHUB_OUTPUT');
});

test('workflow writes has_alerts=true to GITHUB_OUTPUT when alerts exist', () => {
  assert.match(WORKFLOW_YML, /has_alerts=true.*GITHUB_OUTPUT|GITHUB_OUTPUT.*has_alerts=true/s,
    'has_alerts=true must be written to GITHUB_OUTPUT');
});

test('workflow writes has_alerts=false to GITHUB_OUTPUT when no alerts', () => {
  assert.match(WORKFLOW_YML, /has_alerts=false.*GITHUB_OUTPUT|GITHUB_OUTPUT.*has_alerts=false/s,
    'has_alerts=false must be written to GITHUB_OUTPUT');
});

// ---------------------------------------------------------------------------
// SECTION 3 – Bash logic: JIRA error stripping from SYNC_STATUS_CODES
//
// The sed pipeline strips JIRA_* codes before writing to the alerts file,
// so assignees are only pinged for actionable validation failures.
// ---------------------------------------------------------------------------

// Helper: mirrors the sed pipeline from the workflow
function stripJiraErrors(codes) {
  return bash(
    `echo ${JSON.stringify(codes)} ` +
    `| sed -E 's/(JIRA_SYNC_ERROR[^,]*|JIRA_CREATE_ERROR[^,]*|JIRA_ENDPOINT_ERROR[^,]*),?\\s*//g' ` +
    `| sed 's/^[, ]*//;s/[, ]*//'`
  );
}

test('JIRA error stripping: pure JIRA_SYNC_ERROR yields empty string', () => {
  assert.equal(stripJiraErrors('JIRA_SYNC_ERROR'), '');
});

test('JIRA error stripping: pure JIRA_CREATE_ERROR yields empty string', () => {
  assert.equal(stripJiraErrors('JIRA_CREATE_ERROR'), '');
});

test('JIRA error stripping: pure JIRA_ENDPOINT_ERROR yields empty string', () => {
  assert.equal(stripJiraErrors('JIRA_ENDPOINT_ERROR'), '');
});

test('JIRA error stripping: validation codes are preserved when no JIRA errors', () => {
  assert.equal(stripJiraErrors('NO_ESTIMATE, NO_TIME_SPENT'), 'NO_ESTIMATE, NO_TIME_SPENT');
});

test('JIRA error stripping: JIRA_SYNC_ERROR removed, validation codes kept', () => {
  const result = stripJiraErrors('JIRA_SYNC_ERROR, NO_ESTIMATE');
  assert.ok(result.includes('NO_ESTIMATE'), `Expected NO_ESTIMATE in "${result}"`);
  assert.ok(!result.includes('JIRA_SYNC_ERROR'), `JIRA_SYNC_ERROR should be stripped from "${result}"`);
});

test('JIRA error stripping: JIRA_CREATE_ERROR removed, validation codes kept', () => {
  const result = stripJiraErrors('NO_AREA, JIRA_CREATE_ERROR HTTP_400, NO_PRIORITY');
  assert.ok(result.includes('NO_AREA'), `Expected NO_AREA in "${result}"`);
  assert.ok(result.includes('NO_PRIORITY'), `Expected NO_PRIORITY in "${result}"`);
  assert.ok(!result.includes('JIRA_CREATE_ERROR'), `JIRA_CREATE_ERROR should be stripped from "${result}"`);
});

test('JIRA error stripping: JIRA_ENDPOINT_ERROR removed, multiple validation codes kept', () => {
  const result = stripJiraErrors('JIRA_ENDPOINT_ERROR, NO_MILESTONE, NO_REMAINING_WORK');
  assert.ok(!result.includes('JIRA_ENDPOINT_ERROR'), `JIRA_ENDPOINT_ERROR should be stripped`);
  assert.ok(result.includes('NO_MILESTONE'), `Expected NO_MILESTONE in "${result}"`);
  assert.ok(result.includes('NO_REMAINING_WORK'), `Expected NO_REMAINING_WORK in "${result}"`);
});

// ---------------------------------------------------------------------------
// SECTION 4 – Bash logic: SYNC_STATUS_CODES validation rules
//
// Each rule is encoded as a standalone bash snippet that mirrors the exact
// condition from process_items().  Field IDs are non-empty stubs ("FIELD_ID")
// to simulate "field configured in project".
// ---------------------------------------------------------------------------

/**
 * Evaluate a single validation rule given current field state.
 * Returns the SYNC_STATUS_CODES value (may be empty).
 */
function evalRule(vars) {
  const assignments = Object.entries(vars)
    .map(([k, v]) => `${k}=${JSON.stringify(String(v ?? ''))}`)
    .join('\n');

  const script = `
${assignments}
SYNC_STATUS_CODES=""

# NO_ESTIMATE
if [ -n "$ESTIMATE_FIELD_ID" ] && [ -n "$STATUS_LC" ] && [ "$STATUS_LC" != "backlog" ] && [ "$STATUS_LC" != "next" ] && [ -z "$ESTIMATE" ]; then
  SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }NO_ESTIMATE"
fi

# NO_REMAINING_WORK
if [ -n "$REMAINING_WORK_FIELD_ID" ] && [ -n "$STATUS_LC" ] && [ "$STATUS_LC" != "backlog" ] && [ "$STATUS_LC" != "next" ] && [ "$STATUS_LC" != "done" ] && [ -z "$REMAINING_WORK" ]; then
  SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }NO_REMAINING_WORK"
fi

# NO_AREA
if [ -n "$AREA_FIELD_ID" ] && [ -n "$STATUS_LC" ] && [ "$STATUS_LC" != "backlog" ] && [ -z "$AREA" ]; then
  SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }NO_AREA"
fi

# NO_PRIORITY
if [ -n "$PRIORITY_FIELD_ID" ] && [ -n "$STATUS_LC" ] && [ "$STATUS_LC" != "backlog" ] && [ -z "$PRIORITY" ]; then
  SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }NO_PRIORITY"
fi

# NO_MILESTONE
if [ -n "$MILESTONE_FIELD_ID" ] && [ -n "$STATUS_LC" ] && [ "$STATUS_LC" != "backlog" ] && [ -z "$MILESTONE" ]; then
  SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }NO_MILESTONE"
fi

# NO_TIME_SPENT
if [ -n "$TIME_SPENT_FIELD_ID" ] && [ "$STATUS_LC" = "done" ] && [ -z "$TIME_SPENT" ]; then
  SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }NO_TIME_SPENT"
fi

# ESTIMATE_TOO_LONG
if [ -n "$ESTIMATE_FIELD_ID" ] && [ "$STATUS_LC" = "in progress" ] && [ -n "$ESTIMATE" ] && \
   awk -v e="$ESTIMATE" 'BEGIN { exit !(e+0 > 2) }'; then
  SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }ESTIMATE_TOO_LONG"
fi

echo "\$SYNC_STATUS_CODES"
`;
  return bash(script);
}

// Shared stub field IDs (non-empty = "field configured in project")
const ALL_FIELDS = {
  ESTIMATE_FIELD_ID:       'FIELD_ID',
  REMAINING_WORK_FIELD_ID: 'FIELD_ID',
  AREA_FIELD_ID:           'FIELD_ID',
  PRIORITY_FIELD_ID:       'FIELD_ID',
  MILESTONE_FIELD_ID:      'FIELD_ID',
  TIME_SPENT_FIELD_ID:     'FIELD_ID',
};

// -- NO_ESTIMATE --

test('NO_ESTIMATE: raised when in-progress item has no estimate', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', ESTIMATE: '' });
  assert.ok(codes.includes('NO_ESTIMATE'), `Expected NO_ESTIMATE, got: "${codes}"`);
});

test('NO_ESTIMATE: not raised when estimate is set', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', ESTIMATE: '1' });
  assert.ok(!codes.includes('NO_ESTIMATE'), `Unexpected NO_ESTIMATE in: "${codes}"`);
});

test('NO_ESTIMATE: not raised for backlog items', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'backlog', ESTIMATE: '' });
  assert.ok(!codes.includes('NO_ESTIMATE'), `Unexpected NO_ESTIMATE for backlog: "${codes}"`);
});

test('NO_ESTIMATE: not raised for next items', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'next', ESTIMATE: '' });
  assert.ok(!codes.includes('NO_ESTIMATE'), `Unexpected NO_ESTIMATE for next: "${codes}"`);
});

test('NO_ESTIMATE: not raised when field is not configured', () => {
  const codes = evalRule({ ...ALL_FIELDS, ESTIMATE_FIELD_ID: '', STATUS_LC: 'in progress', ESTIMATE: '' });
  assert.ok(!codes.includes('NO_ESTIMATE'), `Unexpected NO_ESTIMATE when field absent: "${codes}"`);
});

// -- NO_REMAINING_WORK --

test('NO_REMAINING_WORK: raised for in-progress item with no remaining work', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', REMAINING_WORK: '' });
  assert.ok(codes.includes('NO_REMAINING_WORK'), `Expected NO_REMAINING_WORK, got: "${codes}"`);
});

test('NO_REMAINING_WORK: not raised for done items (done clears it)', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'done', REMAINING_WORK: '' });
  assert.ok(!codes.includes('NO_REMAINING_WORK'), `Unexpected NO_REMAINING_WORK for done: "${codes}"`);
});

test('NO_REMAINING_WORK: not raised for backlog items', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'backlog', REMAINING_WORK: '' });
  assert.ok(!codes.includes('NO_REMAINING_WORK'), `Unexpected NO_REMAINING_WORK for backlog: "${codes}"`);
});

test('NO_REMAINING_WORK: not raised for next items', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'next', REMAINING_WORK: '' });
  assert.ok(!codes.includes('NO_REMAINING_WORK'), `Unexpected NO_REMAINING_WORK for next: "${codes}"`);
});

test('NO_REMAINING_WORK: not raised when remaining work is set', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', REMAINING_WORK: '0.5' });
  assert.ok(!codes.includes('NO_REMAINING_WORK'), `Unexpected NO_REMAINING_WORK when set: "${codes}"`);
});

// -- NO_AREA --

test('NO_AREA: raised for in-progress item with no area', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', AREA: '' });
  assert.ok(codes.includes('NO_AREA'), `Expected NO_AREA, got: "${codes}"`);
});

test('NO_AREA: not raised for backlog items', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'backlog', AREA: '' });
  assert.ok(!codes.includes('NO_AREA'), `Unexpected NO_AREA for backlog: "${codes}"`);
});

test('NO_AREA: raised for done items with no area', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'done', AREA: '' });
  assert.ok(codes.includes('NO_AREA'), `Expected NO_AREA for done: "${codes}"`);
});

test('NO_AREA: not raised when area is set', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', AREA: 'Cloud' });
  assert.ok(!codes.includes('NO_AREA'), `Unexpected NO_AREA when set: "${codes}"`);
});

// -- NO_PRIORITY --

test('NO_PRIORITY: raised for in-progress item with no priority', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', PRIORITY: '' });
  assert.ok(codes.includes('NO_PRIORITY'), `Expected NO_PRIORITY, got: "${codes}"`);
});

test('NO_PRIORITY: not raised for backlog items', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'backlog', PRIORITY: '' });
  assert.ok(!codes.includes('NO_PRIORITY'), `Unexpected NO_PRIORITY for backlog: "${codes}"`);
});

test('NO_PRIORITY: not raised when priority is set', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', PRIORITY: 'Major' });
  assert.ok(!codes.includes('NO_PRIORITY'), `Unexpected NO_PRIORITY when set: "${codes}"`);
});

// -- NO_MILESTONE --

test('NO_MILESTONE: raised for in-progress item with no milestone', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', MILESTONE: '' });
  assert.ok(codes.includes('NO_MILESTONE'), `Expected NO_MILESTONE, got: "${codes}"`);
});

test('NO_MILESTONE: not raised for backlog items', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'backlog', MILESTONE: '' });
  assert.ok(!codes.includes('NO_MILESTONE'), `Unexpected NO_MILESTONE for backlog: "${codes}"`);
});

test('NO_MILESTONE: not raised when milestone is set', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', MILESTONE: 'OSL.Next' });
  assert.ok(!codes.includes('NO_MILESTONE'), `Unexpected NO_MILESTONE when set: "${codes}"`);
});

// -- NO_TIME_SPENT --

test('NO_TIME_SPENT: raised for done item with no time spent', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'done', TIME_SPENT: '' });
  assert.ok(codes.includes('NO_TIME_SPENT'), `Expected NO_TIME_SPENT, got: "${codes}"`);
});

test('NO_TIME_SPENT: not raised for in-progress items', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', TIME_SPENT: '' });
  assert.ok(!codes.includes('NO_TIME_SPENT'), `Unexpected NO_TIME_SPENT for in-progress: "${codes}"`);
});

test('NO_TIME_SPENT: not raised when time spent is set', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'done', TIME_SPENT: '1.5' });
  assert.ok(!codes.includes('NO_TIME_SPENT'), `Unexpected NO_TIME_SPENT when set: "${codes}"`);
});

// -- ESTIMATE_TOO_LONG --

test('ESTIMATE_TOO_LONG: raised for in-progress item with estimate > 2 weeks', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', ESTIMATE: '3' });
  assert.ok(codes.includes('ESTIMATE_TOO_LONG'), `Expected ESTIMATE_TOO_LONG, got: "${codes}"`);
});

test('ESTIMATE_TOO_LONG: not raised when estimate is exactly 2 weeks', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', ESTIMATE: '2' });
  assert.ok(!codes.includes('ESTIMATE_TOO_LONG'), `Unexpected ESTIMATE_TOO_LONG for estimate=2: "${codes}"`);
});

test('ESTIMATE_TOO_LONG: not raised when estimate is below 2 weeks', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', ESTIMATE: '1' });
  assert.ok(!codes.includes('ESTIMATE_TOO_LONG'), `Unexpected ESTIMATE_TOO_LONG for estimate=1: "${codes}"`);
});

test('ESTIMATE_TOO_LONG: not raised for backlog items even with large estimate', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'backlog', ESTIMATE: '5' });
  assert.ok(!codes.includes('ESTIMATE_TOO_LONG'), `Unexpected ESTIMATE_TOO_LONG for backlog: "${codes}"`);
});

test('ESTIMATE_TOO_LONG: not raised for next items even with large estimate', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'next', ESTIMATE: '5' });
  assert.ok(!codes.includes('ESTIMATE_TOO_LONG'), `Unexpected ESTIMATE_TOO_LONG for next: "${codes}"`);
});

test('ESTIMATE_TOO_LONG: not raised when estimate field is not configured', () => {
  const codes = evalRule({ ...ALL_FIELDS, ESTIMATE_FIELD_ID: '', STATUS_LC: 'in progress', ESTIMATE: '5' });
  assert.ok(!codes.includes('ESTIMATE_TOO_LONG'), `Unexpected ESTIMATE_TOO_LONG when field absent: "${codes}"`);
});

test('ESTIMATE_TOO_LONG: not raised when estimate is absent (NO_ESTIMATE handles that)', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', ESTIMATE: '' });
  assert.ok(!codes.includes('ESTIMATE_TOO_LONG'), `Unexpected ESTIMATE_TOO_LONG for empty estimate: "${codes}"`);
});

// -- Multiple alerts at once --

test('multiple alerts: all applicable codes raised for a done item missing area, time spent', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'done', AREA: '', TIME_SPENT: '' });
  assert.ok(codes.includes('NO_AREA'),       `Expected NO_AREA in: "${codes}"`);
  assert.ok(codes.includes('NO_TIME_SPENT'), `Expected NO_TIME_SPENT in: "${codes}"`);
});

test('clean item: no alerts for a fully-populated in-progress item', () => {
  const codes = evalRule({
    ...ALL_FIELDS,
    STATUS_LC:     'in progress',
    AREA:          'Cloud',
    PRIORITY:      'Major',
    MILESTONE:     'OSL.Next',
    ESTIMATE:      '1',
    REMAINING_WORK:'0.5',
    TIME_SPENT:    '',   // TIME_SPENT only required for done
  });
  assert.equal(codes, '', `Expected no alerts, got: "${codes}"`);
});

// ---------------------------------------------------------------------------
// SECTION 5 – Bash logic: record_alert gating
//
// record_alert is only called when: SYNC_STATUS_CODES non-empty, ISSUE_NUMBER set,
// VALIDATION_ALERTS non-empty after stripping, and ASSIGNEES_LIST non-empty.
// ---------------------------------------------------------------------------

/**
 * Simulate the record_alert gate and return the content written to the alerts file
 * (empty string if nothing was written).
 */
function runAlertGate({ syncCodes, issueNumber, assignees }) {
  const script = `
SYNC_STATUS_CODES=${JSON.stringify(syncCodes)}
ISSUE_NUMBER=${JSON.stringify(String(issueNumber ?? ''))}
ALERTS_FILE=$(mktemp)

if [ -n "$SYNC_STATUS_CODES" ] && [ -n "$ISSUE_NUMBER" ]; then
  VALIDATION_ALERTS=$(echo "$SYNC_STATUS_CODES" | sed -E 's/(JIRA_SYNC_ERROR[^,]*|JIRA_CREATE_ERROR[^,]*|JIRA_ENDPOINT_ERROR[^,]*),?\\s*//g' | sed 's/^[, ]*//;s/[, ]*//')
  if [ -n "$VALIDATION_ALERTS" ]; then
    ASSIGNEES_LIST=${JSON.stringify(assignees ?? '')}
    if [ -n "$ASSIGNEES_LIST" ]; then
      printf '%s|%s|%s|%s|%s|%s\\n' "proj:1" "$ISSUE_NUMBER" "$ASSIGNEES_LIST" "$VALIDATION_ALERTS" "title" "http://url" >> "$ALERTS_FILE"
    fi
  fi
fi

cat "$ALERTS_FILE"
rm -f "$ALERTS_FILE"
`;
  return bash(script);
}

test('record_alert: fires when codes, issue number, and assignees are all present', () => {
  const out = runAlertGate({ syncCodes: 'NO_ESTIMATE', issueNumber: '42', assignees: 'alice' });
  assert.ok(out.length > 0, 'Expected an alert entry to be written');
  assert.ok(out.includes('NO_ESTIMATE'), `Expected NO_ESTIMATE in output: "${out}"`);
  assert.ok(out.includes('alice'), `Expected assignee in output: "${out}"`);
  assert.ok(out.includes('42'), `Expected issue number in output: "${out}"`);
});

test('record_alert: does NOT fire when SYNC_STATUS_CODES is empty', () => {
  const out = runAlertGate({ syncCodes: '', issueNumber: '42', assignees: 'alice' });
  assert.equal(out, '', 'No alert should be written when codes are empty');
});

test('record_alert: does NOT fire when ISSUE_NUMBER is missing (draft item)', () => {
  const out = runAlertGate({ syncCodes: 'NO_ESTIMATE', issueNumber: '', assignees: 'alice' });
  assert.equal(out, '', 'No alert should be written for draft items');
});

test('record_alert: does NOT fire when assignees list is empty', () => {
  const out = runAlertGate({ syncCodes: 'NO_ESTIMATE', issueNumber: '42', assignees: '' });
  assert.equal(out, '', 'No alert should be written when there are no assignees');
});

test('record_alert: does NOT fire when only JIRA errors (no actionable validation codes)', () => {
  const out = runAlertGate({ syncCodes: 'JIRA_SYNC_ERROR', issueNumber: '42', assignees: 'alice' });
  assert.equal(out, '', 'No alert should be written for pure JIRA errors');
});

test('record_alert: fires for mixed JIRA + validation codes, strips JIRA part', () => {
  const out = runAlertGate({ syncCodes: 'JIRA_SYNC_ERROR, NO_ESTIMATE', issueNumber: '7', assignees: 'bob' });
  assert.ok(out.length > 0, 'Expected an alert entry for mixed codes');
  assert.ok(!out.includes('JIRA_SYNC_ERROR'), `JIRA_SYNC_ERROR should be stripped from: "${out}"`);
  assert.ok(out.includes('NO_ESTIMATE'), `NO_ESTIMATE should remain in: "${out}"`);
});

// ---------------------------------------------------------------------------
// SECTION 6 – Bash logic: GITHUB_OUTPUT writing
//
// Verify the shell logic that emits has_errors / has_alerts to GITHUB_OUTPUT.
// ---------------------------------------------------------------------------

/**
 * Simulate writing the outputs section from the end of the main step.
 * Returns { hasErrors, hasAlerts } as parsed from a mocked GITHUB_OUTPUT.
 */
function evalOutputs({ errorsFileContent, alertsFileContent }) {
  const script = `
WORKFLOW_ERRORS_FILE=$(mktemp)
WORKFLOW_ALERTS_FILE=$(mktemp)
GITHUB_OUTPUT=$(mktemp)

printf '%s' ${JSON.stringify(errorsFileContent)} > "$WORKFLOW_ERRORS_FILE"
printf '%s' ${JSON.stringify(alertsFileContent)} > "$WORKFLOW_ALERTS_FILE"

if [ -s "$WORKFLOW_ERRORS_FILE" ]; then
  echo "has_errors=true" >> "$GITHUB_OUTPUT"
else
  echo "has_errors=false" >> "$GITHUB_OUTPUT"
fi

if [ -s "$WORKFLOW_ALERTS_FILE" ]; then
  echo "has_alerts=true" >> "$GITHUB_OUTPUT"
else
  echo "has_alerts=false" >> "$GITHUB_OUTPUT"
fi

cat "$GITHUB_OUTPUT"
rm -f "$WORKFLOW_ERRORS_FILE" "$WORKFLOW_ALERTS_FILE" "$GITHUB_OUTPUT"
`;
  const out = bash(script);
  const match = (key) => (out.match(new RegExp(`${key}=(true|false)`)) || [])[1];
  return { hasErrors: match('has_errors'), hasAlerts: match('has_alerts') };
}

test('GITHUB_OUTPUT: has_errors=true when errors file is non-empty', () => {
  const { hasErrors } = evalOutputs({ errorsFileContent: '[proj:1] some error\n', alertsFileContent: '' });
  assert.equal(hasErrors, 'true');
});

test('GITHUB_OUTPUT: has_errors=false when errors file is empty', () => {
  const { hasErrors } = evalOutputs({ errorsFileContent: '', alertsFileContent: '' });
  assert.equal(hasErrors, 'false');
});

test('GITHUB_OUTPUT: has_alerts=true when alerts file is non-empty', () => {
  const { hasAlerts } = evalOutputs({ errorsFileContent: '', alertsFileContent: 'proj:1|42|alice|NO_ESTIMATE|title|http://url\n' });
  assert.equal(hasAlerts, 'true');
});

test('GITHUB_OUTPUT: has_alerts=false when alerts file is empty', () => {
  const { hasAlerts } = evalOutputs({ errorsFileContent: '', alertsFileContent: '' });
  assert.equal(hasAlerts, 'false');
});

test('GITHUB_OUTPUT: independent — errors and alerts can both be true simultaneously', () => {
  const result = evalOutputs({
    errorsFileContent: '[proj:1] some error\n',
    alertsFileContent: 'proj:1|42|alice|NO_ESTIMATE|title|http://url\n',
  });
  assert.equal(result.hasErrors, 'true');
  assert.equal(result.hasAlerts, 'true');
});

// ---------------------------------------------------------------------------
// SECTION 7 – Bash logic: stateReason skip guard
//
// Done items whose underlying GH issue was not closed as COMPLETED must be
// skipped before any validation runs.  The guard sits right after STATUS_LC
// is set and before field reads / alert generation.
// ---------------------------------------------------------------------------

/**
 * Simulate the stateReason skip guard from process_items().
 * Returns 'skipped' when the item would be skipped, 'processed' otherwise.
 */
function evalStateReasonGuard({ statusLC, stateReason }) {
  const script = `
STATUS_LC=${JSON.stringify(statusLC)}
# Simulate jq extracting stateReason from the item JSON
STATE_REASON=${JSON.stringify(stateReason ?? '')}

SKIPPED=false
if [ "$STATUS_LC" = "done" ]; then
  if [ "$STATE_REASON" != "COMPLETED" ]; then
    SKIPPED=true
  fi
fi

if [ "$SKIPPED" = "true" ]; then
  echo "skipped"
else
  echo "processed"
fi
`;
  return bash(script);
}

test('stateReason guard: Done + COMPLETED is processed', () => {
  assert.equal(evalStateReasonGuard({ statusLC: 'done', stateReason: 'COMPLETED' }), 'processed');
});

test('stateReason guard: Done + NOT_PLANNED is skipped', () => {
  assert.equal(evalStateReasonGuard({ statusLC: 'done', stateReason: 'NOT_PLANNED' }), 'skipped');
});

test('stateReason guard: Done + REOPENED is skipped', () => {
  assert.equal(evalStateReasonGuard({ statusLC: 'done', stateReason: 'REOPENED' }), 'skipped');
});

test('stateReason guard: Done + null stateReason is skipped', () => {
  assert.equal(evalStateReasonGuard({ statusLC: 'done', stateReason: '' }), 'skipped');
});

test('stateReason guard: non-Done status is never skipped regardless of stateReason', () => {
  assert.equal(evalStateReasonGuard({ statusLC: 'in progress', stateReason: 'NOT_PLANNED' }), 'processed');
  assert.equal(evalStateReasonGuard({ statusLC: 'backlog',     stateReason: 'NOT_PLANNED' }), 'processed');
  assert.equal(evalStateReasonGuard({ statusLC: 'next',        stateReason: 'NOT_PLANNED' }), 'processed');
  assert.equal(evalStateReasonGuard({ statusLC: 'in review',   stateReason: 'NOT_PLANNED' }), 'processed');
});
