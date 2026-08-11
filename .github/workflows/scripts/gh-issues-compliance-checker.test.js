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

# NO_ESTIMATE: suppressed for epics (estimate is optional on epics).
if [ -n "$ESTIMATE_FIELD_ID" ] && [ -n "$STATUS_LC" ] && [ "$STATUS_LC" != "backlog" ] && [ "$STATUS_LC" != "next" ] && [ -z "$ESTIMATE" ] && [ "$HAS_SUB_ISSUES" != "true" ]; then
  SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }NO_ESTIMATE"
fi

# NO_REMAINING_WORK: for epics, only raised when estimate is set and > 0.
if [ -n "$REMAINING_WORK_FIELD_ID" ] && [ -n "$STATUS_LC" ] && [ "$STATUS_LC" != "backlog" ] && [ "$STATUS_LC" != "next" ] && [ "$STATUS_LC" != "done" ] && [ -z "$REMAINING_WORK" ]; then
  if [ "$HAS_SUB_ISSUES" != "true" ] || awk -v e="$ESTIMATE" 'BEGIN { exit !(e+0 > 0) }'; then
    SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }NO_REMAINING_WORK"
  fi
fi

# IN_PROGRESS_NO_WORK_REMAINING
if [ -n "$REMAINING_WORK_FIELD_ID" ] && [ "$STATUS_LC" = "in progress" ] && [ -n "$REMAINING_WORK" ] && \
   awk -v r="$REMAINING_WORK" 'BEGIN { exit !(r+0 == 0) }' && \
   awk -v e="$ESTIMATE" 'BEGIN { exit !(e+0 > 0) }'; then
  SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }IN_PROGRESS_NO_WORK_REMAINING"
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

# NO_DESCRIPTION: raised when body is empty AND (item is epic OR estimate >= 0.1 weeks / 4 hours).
# Items with no estimate or estimate < 0.1 are skipped.
if [ -z "$ISSUE_BODY" ]; then
  if [ "$HAS_SUB_ISSUES" = "true" ] || \
     { [ -n "$ESTIMATE" ] && awk -v e="$ESTIMATE" 'BEGIN { exit !(e+0 >= 0.1) }'; }; then
    SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }NO_DESCRIPTION"
  fi
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

test('NO_ESTIMATE: not raised for epic (in-progress, no estimate)', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', ESTIMATE: '', HAS_SUB_ISSUES: 'true' });
  assert.ok(!codes.includes('NO_ESTIMATE'), `Unexpected NO_ESTIMATE for epic: "${codes}"`);
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

test('NO_REMAINING_WORK: not raised for epic with no estimate (estimate empty)', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', REMAINING_WORK: '', ESTIMATE: '', HAS_SUB_ISSUES: 'true' });
  assert.ok(!codes.includes('NO_REMAINING_WORK'), `Unexpected NO_REMAINING_WORK for epic with no estimate: "${codes}"`);
});

test('NO_REMAINING_WORK: not raised for epic with zero estimate', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', REMAINING_WORK: '', ESTIMATE: '0', HAS_SUB_ISSUES: 'true' });
  assert.ok(!codes.includes('NO_REMAINING_WORK'), `Unexpected NO_REMAINING_WORK for epic with estimate=0: "${codes}"`);
});

test('NO_REMAINING_WORK: raised for epic when estimate is > 0 and remaining work is empty', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', REMAINING_WORK: '', ESTIMATE: '1', HAS_SUB_ISSUES: 'true' });
  assert.ok(codes.includes('NO_REMAINING_WORK'), `Expected NO_REMAINING_WORK for epic with estimate=1: "${codes}"`);
});


// -- IN_PROGRESS_NO_WORK_REMAINING --

test('IN_PROGRESS_NO_WORK_REMAINING: raised when in-progress item has remaining work of 0 and estimate > 0', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', REMAINING_WORK: '0', ESTIMATE: '1' });
  assert.ok(codes.includes('IN_PROGRESS_NO_WORK_REMAINING'), `Expected IN_PROGRESS_NO_WORK_REMAINING, got: "${codes}"`);
});

test('IN_PROGRESS_NO_WORK_REMAINING: raised when in-progress item has remaining work of 0.0 and estimate > 0', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', REMAINING_WORK: '0.0', ESTIMATE: '1' });
  assert.ok(codes.includes('IN_PROGRESS_NO_WORK_REMAINING'), `Expected IN_PROGRESS_NO_WORK_REMAINING for 0.0, got: "${codes}"`);
});

test('IN_PROGRESS_NO_WORK_REMAINING: not raised when remaining work is a positive value', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', REMAINING_WORK: '0.5' });
  assert.ok(!codes.includes('IN_PROGRESS_NO_WORK_REMAINING'), `Unexpected IN_PROGRESS_NO_WORK_REMAINING when set: "${codes}"`);
});

test('IN_PROGRESS_NO_WORK_REMAINING: not raised when remaining work is empty (NO_REMAINING_WORK handles that)', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', REMAINING_WORK: '' });
  assert.ok(!codes.includes('IN_PROGRESS_NO_WORK_REMAINING'), `Unexpected IN_PROGRESS_NO_WORK_REMAINING for empty value: "${codes}"`);
});

test('IN_PROGRESS_NO_WORK_REMAINING: not raised for done items', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'done', REMAINING_WORK: '0' });
  assert.ok(!codes.includes('IN_PROGRESS_NO_WORK_REMAINING'), `Unexpected IN_PROGRESS_NO_WORK_REMAINING for done: "${codes}"`);
});

test('IN_PROGRESS_NO_WORK_REMAINING: not raised for backlog items', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'backlog', REMAINING_WORK: '0' });
  assert.ok(!codes.includes('IN_PROGRESS_NO_WORK_REMAINING'), `Unexpected IN_PROGRESS_NO_WORK_REMAINING for backlog: "${codes}"`);
});

test('IN_PROGRESS_NO_WORK_REMAINING: not raised when remaining work field is not configured', () => {
  const codes = evalRule({ ...ALL_FIELDS, REMAINING_WORK_FIELD_ID: '', STATUS_LC: 'in progress', REMAINING_WORK: '0' });
  assert.ok(!codes.includes('IN_PROGRESS_NO_WORK_REMAINING'), `Unexpected IN_PROGRESS_NO_WORK_REMAINING when field absent: "${codes}"`);
});

test('IN_PROGRESS_NO_WORK_REMAINING: not raised when estimate is 0 (zero-effort item)', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', REMAINING_WORK: '0', ESTIMATE: '0' });
  assert.ok(!codes.includes('IN_PROGRESS_NO_WORK_REMAINING'), `Unexpected IN_PROGRESS_NO_WORK_REMAINING when estimate is 0: "${codes}"`);
});

test('IN_PROGRESS_NO_WORK_REMAINING: not raised when estimate is absent', () => {
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', REMAINING_WORK: '0', ESTIMATE: '' });
  assert.ok(!codes.includes('IN_PROGRESS_NO_WORK_REMAINING'), `Unexpected IN_PROGRESS_NO_WORK_REMAINING when estimate absent: "${codes}"`);
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

// -- NO_DESCRIPTION --

test('NO_DESCRIPTION: raised for epic with empty body', () => {
  const codes = evalRule({ ...ALL_FIELDS, HAS_SUB_ISSUES: 'true', ISSUE_BODY: '' });
  assert.ok(codes.includes('NO_DESCRIPTION'), `Expected NO_DESCRIPTION for epic with no body: "${codes}"`);
});

test('NO_DESCRIPTION: not raised for epic with a non-empty body', () => {
  const codes = evalRule({ ...ALL_FIELDS, HAS_SUB_ISSUES: 'true', ISSUE_BODY: 'Some description.' });
  assert.ok(!codes.includes('NO_DESCRIPTION'), `Unexpected NO_DESCRIPTION for epic with body: "${codes}"`);
});

test('NO_DESCRIPTION: raised for non-epic with estimate >= 0.1 (4h) and empty body', () => {
  const codes = evalRule({ ...ALL_FIELDS, HAS_SUB_ISSUES: 'false', ESTIMATE: '0.1', ISSUE_BODY: '' });
  assert.ok(codes.includes('NO_DESCRIPTION'), `Expected NO_DESCRIPTION for estimate=0.1 with no body: "${codes}"`);
});

test('NO_DESCRIPTION: raised for non-epic with estimate > 0.1 and empty body', () => {
  const codes = evalRule({ ...ALL_FIELDS, HAS_SUB_ISSUES: 'false', ESTIMATE: '1', ISSUE_BODY: '' });
  assert.ok(codes.includes('NO_DESCRIPTION'), `Expected NO_DESCRIPTION for estimate=1 with no body: "${codes}"`);
});

test('NO_DESCRIPTION: not raised for non-epic with estimate < 0.1 (< 4h) and empty body', () => {
  const codes = evalRule({ ...ALL_FIELDS, HAS_SUB_ISSUES: 'false', ESTIMATE: '0.05', ISSUE_BODY: '' });
  assert.ok(!codes.includes('NO_DESCRIPTION'), `Unexpected NO_DESCRIPTION for estimate=0.05: "${codes}"`);
});

test('NO_DESCRIPTION: not raised when estimate is absent and item is not an epic', () => {
  const codes = evalRule({ ...ALL_FIELDS, HAS_SUB_ISSUES: 'false', ESTIMATE: '', ISSUE_BODY: '' });
  assert.ok(!codes.includes('NO_DESCRIPTION'), `Unexpected NO_DESCRIPTION with no estimate and not epic: "${codes}"`);
});

test('NO_DESCRIPTION: not raised for non-epic with estimate >= 0.1 when body is present', () => {
  const codes = evalRule({ ...ALL_FIELDS, HAS_SUB_ISSUES: 'false', ESTIMATE: '0.5', ISSUE_BODY: 'Implement the new feature.' });
  assert.ok(!codes.includes('NO_DESCRIPTION'), `Unexpected NO_DESCRIPTION when body is present: "${codes}"`);
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
    ISSUE_BODY:    'Implement the new feature as described in the spec.',
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

// ---------------------------------------------------------------------------
// SECTION – PR_NOT_MERGED alert
// ---------------------------------------------------------------------------

/**
 * Simulate the PR_NOT_MERGED check from process_items().
 * Builds a minimal item JSON with the given timelineItems and injects the
 * STATUS_LC / ISSUE_NUMBER variables, then runs the exact check snippet.
 *
 * Each entry in timelineItems must include:
 *   willCloseTarget {boolean} — true only for PRs that use closing keywords (Closes #N)
 *   number          {number}
 *   state           {string}  — "OPEN", "CLOSED", "MERGED"
 *   merged          {boolean}
 */
function evalPRNotMerged({ statusLC, issueNumber, timelineItems }) {
  // Build a minimal item JSON matching what the GraphQL query returns.
  const itemJson = JSON.stringify({
    content: {
      number: issueNumber || null,
      timelineItems: {
        nodes: (timelineItems || []).map(pr => ({
          willCloseTarget: pr.willCloseTarget,
          source: {
            number: pr.number,
            state:  pr.state,
            merged: pr.merged,
          }
        }))
      }
    }
  });

  const script = `
STATUS_LC=${JSON.stringify(statusLC)}
ISSUE_NUMBER=${JSON.stringify(String(issueNumber ?? ''))}
item=${JSON.stringify(itemJson)}
SYNC_STATUS_CODES=""

if [ "$STATUS_LC" = "done" ] && [ -n "$ISSUE_NUMBER" ]; then
  LINKED_PRS=$(echo "$item" | jq -r '
    [.content.timelineItems.nodes[]? |
     select(.willCloseTarget == true) |
     select(.source.number != null) |
     select(.source.state == "OPEN")] |
    length')
  if [ "\${LINKED_PRS:-0}" -gt 0 ]; then
    SYNC_STATUS_CODES="\${SYNC_STATUS_CODES:+\${SYNC_STATUS_CODES}, }PR_NOT_MERGED"
  fi
fi

echo "\$SYNC_STATUS_CODES"
`;
  return bash(script);
}

test('PR_NOT_MERGED: raised for Done issue with an open closing PR', () => {
  const codes = evalPRNotMerged({
    statusLC: 'done',
    issueNumber: '42',
    timelineItems: [{ willCloseTarget: true, number: 10, state: 'OPEN', merged: false }],
  });
  assert.ok(codes.includes('PR_NOT_MERGED'), `Expected PR_NOT_MERGED, got: "${codes}"`);
});

test('PR_NOT_MERGED: not raised for Done issue with all closing PRs merged', () => {
  const codes = evalPRNotMerged({
    statusLC: 'done',
    issueNumber: '42',
    timelineItems: [{ willCloseTarget: true, number: 10, state: 'MERGED', merged: true }],
  });
  assert.ok(!codes.includes('PR_NOT_MERGED'), `Unexpected PR_NOT_MERGED, got: "${codes}"`);
});

test('PR_NOT_MERGED: not raised for Done issue with no linked PRs', () => {
  const codes = evalPRNotMerged({
    statusLC: 'done',
    issueNumber: '42',
    timelineItems: [],
  });
  assert.ok(!codes.includes('PR_NOT_MERGED'), `Unexpected PR_NOT_MERGED, got: "${codes}"`);
});

test('PR_NOT_MERGED: not raised for non-Done item even with open closing PRs', () => {
  for (const statusLC of ['in progress', 'in review', 'next', 'backlog']) {
    const codes = evalPRNotMerged({
      statusLC,
      issueNumber: '42',
      timelineItems: [{ willCloseTarget: true, number: 10, state: 'OPEN', merged: false }],
    });
    assert.ok(!codes.includes('PR_NOT_MERGED'),
      `Unexpected PR_NOT_MERGED for status "${statusLC}", got: "${codes}"`);
  }
});

test('PR_NOT_MERGED: not raised for Done draft item (no issue number)', () => {
  const codes = evalPRNotMerged({
    statusLC: 'done',
    issueNumber: '',
    timelineItems: [{ willCloseTarget: true, number: 10, state: 'OPEN', merged: false }],
  });
  assert.ok(!codes.includes('PR_NOT_MERGED'), `Unexpected PR_NOT_MERGED, got: "${codes}"`);
});

test('PR_NOT_MERGED: raised when at least one closing PR is open even if others are merged', () => {
  const codes = evalPRNotMerged({
    statusLC: 'done',
    issueNumber: '42',
    timelineItems: [
      { willCloseTarget: true, number: 10, state: 'MERGED', merged: true },
      { willCloseTarget: true, number: 11, state: 'OPEN',   merged: false },
    ],
  });
  assert.ok(codes.includes('PR_NOT_MERGED'), `Expected PR_NOT_MERGED, got: "${codes}"`);
});

test('PR_NOT_MERGED: not raised for Done issue when open PR is a comment mention (willCloseTarget false)', () => {
  const codes = evalPRNotMerged({
    statusLC: 'done',
    issueNumber: '42',
    timelineItems: [{ willCloseTarget: false, number: 10, state: 'OPEN', merged: false }],
  });
  assert.ok(!codes.includes('PR_NOT_MERGED'), `Unexpected PR_NOT_MERGED for comment mention, got: "${codes}"`);
});

test('PR_NOT_MERGED: not raised for Done issue when closing PR was closed without merging', () => {
  const codes = evalPRNotMerged({
    statusLC: 'done',
    issueNumber: '42',
    timelineItems: [{ willCloseTarget: true, number: 10, state: 'CLOSED', merged: false }],
  });
  assert.ok(!codes.includes('PR_NOT_MERGED'), `Unexpected PR_NOT_MERGED for closed-without-merge PR, got: "${codes}"`);
});

// ---------------------------------------------------------------------------
// SECTION – Repo milestone sync
// ---------------------------------------------------------------------------

/**
 * Simulate the repo→project milestone sync logic extracted from the workflow.
 * Returns an object with:
 *   - action: 'set' | 'clear' | 'skip_invalid' | 'in_sync'
 *   - milestone: the MILESTONE variable value after sync
 *   - log: the log line printed by the sync block
 *
 * Parameters mirror the outer-scope shell variables used by the sync block:
 *   - repoMilestone:      repo issue milestone title (empty string = no milestone)
 *   - projectMilestone:   project item Target Milestone value (empty = not set)
 *   - milestoneOptions:   newline-separated list of valid option names
 *   - milestoneFieldId:   field ID (non-empty = field configured)
 *   - issueNumber:        issue number (non-empty = linked issue)
 */
function evalMilestoneSync({ repoMilestone, projectMilestone, milestoneOptions, milestoneFieldId = 'FIELD_ID', issueNumber = '42' }) {
  // Build shell statements that produce real newlines, one option per line.
  // Using printf ensures tab-separation and newlines are actual bytes, not escape sequences.
  const optionsPrintfArgs  = (milestoneOptions || []).map(n => JSON.stringify(n + '\n')).join(' ');
  const optionIdsPrintfArgs = (milestoneOptions || []).map((n, i) => JSON.stringify(`OPT_ID_${i}\t${n}\n`)).join(' ');

  const script = `
ISSUE_NUMBER=${JSON.stringify(String(issueNumber ?? ''))}
MILESTONE_FIELD_ID=${JSON.stringify(String(milestoneFieldId ?? ''))}
MILESTONE=${JSON.stringify(String(projectMilestone ?? ''))}
MILESTONE_FIELD_NAME="Target Milestone"
DRY_RUN="false"
ITEM_ID="ITEM_1"
PROJECT_ID="PROJ_1"

MILESTONE_OPTIONS=$(printf %b ${optionsPrintfArgs || '""'})
MILESTONE_OPTION_IDS=$(printf %b ${optionIdsPrintfArgs || '""'})

ACTION=""
LOG_LINE=""

if [ -n "$ISSUE_NUMBER" ] && [ -n "$MILESTONE_FIELD_ID" ]; then
  REPO_MILESTONE=${JSON.stringify(String(repoMilestone ?? ''))}
  if [ -n "$REPO_MILESTONE" ]; then
    if echo "$MILESTONE_OPTIONS" | grep -qxF "$REPO_MILESTONE"; then
      if [ "$MILESTONE" != "$REPO_MILESTONE" ]; then
        MILESTONE_OPT_ID=$(echo "$MILESTONE_OPTION_IDS" | awk -F'\\t' -v name="$REPO_MILESTONE" '$2==name{print $1; exit}')
        LOG_LINE="Milestone sync: repo='$REPO_MILESTONE', project='\${MILESTONE:-<empty>}' → setting to '$REPO_MILESTONE' (optionId=$MILESTONE_OPT_ID)"
        ACTION="set"
        MILESTONE="$REPO_MILESTONE"
      else
        LOG_LINE="Milestone sync: repo='$REPO_MILESTONE', project='$MILESTONE' → already in sync"
        ACTION="in_sync"
      fi
    else
      LOG_LINE="Milestone sync: repo='$REPO_MILESTONE' is not a valid \${MILESTONE_FIELD_NAME} option — leaving project field unchanged (current: '\${MILESTONE:-<empty>}')"
      ACTION="skip_invalid"
    fi
  else
    if [ -n "$MILESTONE" ]; then
      LOG_LINE="Milestone sync: repo has no milestone, project has '\${MILESTONE}' → clearing \${MILESTONE_FIELD_NAME}"
      ACTION="clear"
      MILESTONE=""
    else
      LOG_LINE="Milestone sync: repo has no milestone, project field is empty → already in sync"
      ACTION="in_sync"
    fi
  fi
fi

echo "$ACTION"
echo "$MILESTONE"
echo "$LOG_LINE"
`;
  const out = bash(script).split('\n');
  return { action: out[0], milestone: out[1], log: out.slice(2).join('\n') };
}

// -- Set: repo milestone is a valid option and project field is empty --

test('milestone sync: sets project field when repo milestone is a valid option and project field is empty', () => {
  const { action, milestone } = evalMilestoneSync({
    repoMilestone: 'Future',
    projectMilestone: '',
    milestoneOptions: ['Future', '3.20', '2025.Q2'],
  });
  assert.equal(action, 'set', 'expected action=set');
  assert.equal(milestone, 'Future', 'expected MILESTONE to be updated to Future');
});

test('milestone sync: sets project field when repo milestone is a valid option and project field has a different value', () => {
  const { action, milestone } = evalMilestoneSync({
    repoMilestone: '3.20',
    projectMilestone: 'Future',
    milestoneOptions: ['Future', '3.20'],
  });
  assert.equal(action, 'set', 'expected action=set');
  assert.equal(milestone, '3.20', 'expected MILESTONE to be updated to 3.20');
});

// -- Already in sync --

test('milestone sync: no-op when repo milestone matches project field', () => {
  const { action, milestone } = evalMilestoneSync({
    repoMilestone: 'Future',
    projectMilestone: 'Future',
    milestoneOptions: ['Future', '3.20'],
  });
  assert.equal(action, 'in_sync', 'expected action=in_sync');
  assert.equal(milestone, 'Future', 'MILESTONE should remain Future');
});

// -- Skip: repo milestone is not a valid option --

test('milestone sync: does not change project field when repo milestone is not a valid option', () => {
  const { action, milestone } = evalMilestoneSync({
    repoMilestone: 'UnknownMilestone',
    projectMilestone: '',
    milestoneOptions: ['Future', '3.20'],
  });
  assert.equal(action, 'skip_invalid', 'expected action=skip_invalid');
  assert.equal(milestone, '', 'MILESTONE should remain empty');
});

test('milestone sync: does not change existing project value when repo milestone is not a valid option', () => {
  const { action, milestone } = evalMilestoneSync({
    repoMilestone: 'UnknownMilestone',
    projectMilestone: 'Future',
    milestoneOptions: ['Future', '3.20'],
  });
  assert.equal(action, 'skip_invalid', 'expected action=skip_invalid');
  assert.equal(milestone, 'Future', 'MILESTONE should remain Future');
});

// -- Clear: repo has no milestone but project field is set --

test('milestone sync: clears project field when repo has no milestone and project field is set', () => {
  const { action, milestone } = evalMilestoneSync({
    repoMilestone: '',
    projectMilestone: 'Future',
    milestoneOptions: ['Future', '3.20'],
  });
  assert.equal(action, 'clear', 'expected action=clear');
  assert.equal(milestone, '', 'MILESTONE should be cleared');
});

// -- No-op: repo has no milestone and project field is already empty --

test('milestone sync: no-op when repo has no milestone and project field is also empty', () => {
  const { action, milestone } = evalMilestoneSync({
    repoMilestone: '',
    projectMilestone: '',
    milestoneOptions: ['Future', '3.20'],
  });
  assert.equal(action, 'in_sync', 'expected action=in_sync');
  assert.equal(milestone, '', 'MILESTONE should remain empty');
});

// -- Guard: skip entirely when no issue number (draft item) --

test('milestone sync: skipped entirely for draft items (no issue number)', () => {
  const { action } = evalMilestoneSync({
    repoMilestone: 'Future',
    projectMilestone: '',
    milestoneOptions: ['Future'],
    issueNumber: '',
  });
  assert.equal(action, '', 'expected no action for draft item');
});

// -- Guard: skip entirely when milestone field not configured --

test('milestone sync: skipped entirely when milestone field is not configured in project', () => {
  const { action } = evalMilestoneSync({
    repoMilestone: 'Future',
    projectMilestone: '',
    milestoneOptions: ['Future'],
    milestoneFieldId: '',
  });
  assert.equal(action, '', 'expected no action when field not configured');
});

// -- NO_MILESTONE suppression: synced value prevents alert --

test('NO_MILESTONE: not raised after milestone sync sets the project field', () => {
  // Simulate sync setting MILESTONE before compliance check runs
  const codes = evalRule({ ...ALL_FIELDS, STATUS_LC: 'in progress', MILESTONE: 'Future' });
  assert.ok(!codes.includes('NO_MILESTONE'), `Unexpected NO_MILESTONE after sync: "${codes}"`);
});

// ---------------------------------------------------------------------------
// SECTION 7 – Bash logic: Milestone unset event detection
//
// New behavior: Only clear project milestone if repo issue previously had one
// (detected via MILESTONED_EVENT in timeline). If repo never had a milestone,
// skip clearing even if project field is set.
// ---------------------------------------------------------------------------

/**
 * Helper: evaluate milestone sync decision with unset event detection.
 * Calls the repo_issue_had_milestone function and evaluates the sync logic.
 */
function evalMilestoneSyncWithTimeline(vars) {
  const {
    repoMilestone = '',
    projectMilestone = '',
    repoHadMilestone = false,
    milestoneOptions = [],
    milestoneFieldId = 'FIELD_ID',
  } = vars;

  const assignments = [
    `REPO_MILESTONE=${JSON.stringify(repoMilestone)}`,
    `MILESTONE=${JSON.stringify(projectMilestone)}`,
    `REPO_HAD_MILESTONE=${JSON.stringify(String(repoHadMilestone))}`,
    `MILESTONE_FIELD_ID=${JSON.stringify(milestoneFieldId)}`,
    `DRY_RUN="false"`,
  ].join('\n');

  const script = `
${assignments}

# Simulate the repo_issue_had_milestone function
repo_issue_had_milestone() {
  echo "$REPO_HAD_MILESTONE"
}

# Clear action tracking
CLEAR_ACTION=""
SKIP_REASON=""

# This is the exact logic from the workflow
if [ -z "$REPO_MILESTONE" ]; then
  # Repo has no milestone; check if it ever had one via timeline
  if [ -n "$MILESTONE" ]; then
    # Only clear if repo issue previously had a milestone (unset event)
    REPO_HAD_MILESTONE_RESULT=\$(repo_issue_had_milestone)
    if [ "\$REPO_HAD_MILESTONE_RESULT" = "true" ]; then
      CLEAR_ACTION="clear"
    else
      SKIP_REASON="never_had_milestone"
    fi
  fi
fi

echo "CLEAR_ACTION=\${CLEAR_ACTION}|SKIP_REASON=\${SKIP_REASON}"
`;

  const result = bash(script);
  const [clearPart, skipPart] = result.split('|');
  const clearAction = clearPart.split('=')[1] || '';
  const skipReason = skipPart.split('=')[1] || '';

  return {
    shouldClear: clearAction === 'clear',
    skipReason: skipReason,
  };
}

// -- Unset event: repo had milestone, now removed --

test('milestone unset: repo had milestone (MILESTONED_EVENT exists), now empty, project has value → CLEAR', () => {
  const { shouldClear, skipReason } = evalMilestoneSyncWithTimeline({
    repoMilestone: '',         // repo has no milestone now
    projectMilestone: 'v1.0',  // project has value
    repoHadMilestone: true,    // timeline shows MILESTONED_EVENT
  });
  assert.equal(shouldClear, true, 'expected clear action');
  assert.equal(skipReason, '', 'expected no skip reason');
});

test('milestone unset: repo had milestone (MILESTONED_EVENT exists), now empty, project empty → NO CHANGE', () => {
  const { shouldClear, skipReason } = evalMilestoneSyncWithTimeline({
    repoMilestone: '',         // repo has no milestone now
    projectMilestone: '',      // project is empty
    repoHadMilestone: true,    // timeline shows MILESTONED_EVENT
  });
  assert.equal(shouldClear, false, 'expected no clear action');
  assert.equal(skipReason, '', 'expected no skip reason');
});

// -- Never had milestone: repo never had one --

test('milestone never set: repo never had milestone (no MILESTONED_EVENT), now empty, project has value → SKIP', () => {
  const { shouldClear, skipReason } = evalMilestoneSyncWithTimeline({
    repoMilestone: '',         // repo has no milestone now
    projectMilestone: 'v1.0',  // project has value
    repoHadMilestone: false,   // timeline shows NO MILESTONED_EVENT
  });
  assert.equal(shouldClear, false, 'expected no clear action');
  assert.equal(skipReason, 'never_had_milestone', 'expected skip reason for never_had_milestone');
});

test('milestone never set: repo never had milestone (no MILESTONED_EVENT), now empty, project empty → NO CHANGE', () => {
  const { shouldClear, skipReason } = evalMilestoneSyncWithTimeline({
    repoMilestone: '',         // repo has no milestone now
    projectMilestone: '',      // project is empty
    repoHadMilestone: false,   // timeline shows NO MILESTONED_EVENT
  });
  assert.equal(shouldClear, false, 'expected no clear action');
  assert.equal(skipReason, '', 'expected no skip reason');
});

// -- Workflow YAML: timeline query includes milestone events --

test('workflow YAML: timelineItems query includes MILESTONED_EVENT', () => {
  assert.match(WORKFLOW_YML, /itemTypes:.*MILESTONED_EVENT/,
    'GraphQL query must include MILESTONED_EVENT in timeline');
});

test('workflow YAML: timelineItems query includes DEMILESTONED_EVENT', () => {
  assert.match(WORKFLOW_YML, /itemTypes:.*DEMILESTONED_EVENT/,
    'GraphQL query must include DEMILESTONED_EVENT in timeline');
});

test('workflow YAML: timeline MilestonedEvent fragment defined', () => {
  assert.match(WORKFLOW_YML, /\.\.\.\s+on\s+MilestonedEvent/,
    'GraphQL query must have MilestonedEvent fragment');
});

test('workflow YAML: timeline DemilestonedEvent fragment defined', () => {
  assert.match(WORKFLOW_YML, /\.\.\.\s+on\s+DemilestonedEvent/,
    'GraphQL query must have DemilestonedEvent fragment');
});

test('workflow YAML: repo_issue_had_milestone function defined', () => {
  assert.match(WORKFLOW_YML, /repo_issue_had_milestone\s*\(\)/,
    'Workflow must define repo_issue_had_milestone function');
});

test('workflow YAML: milestone sync calls repo_issue_had_milestone when repo has no milestone', () => {
  assert.match(WORKFLOW_YML, /REPO_HAD_MILESTONE\s*=\s*\$\(\s*repo_issue_had_milestone/,
    'Milestone sync must call repo_issue_had_milestone function');
});
