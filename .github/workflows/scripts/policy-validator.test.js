'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const PolicyValidator = require('./policy-validator');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 1 week in seconds = 5 days × 8 hours × 3600
const ONE_WEEK_S  = 5 * 8 * 3600;
const TWO_WEEKS_S = 2 * ONE_WEEK_S;

/**
 * Build a minimal mock JIRA issue for validateIssue().
 * Only the fields exercised by the ESTIMATE_TOO_LONG rule are required here;
 * all other required fields are pre-populated so other rules don't fire.
 */
function makeIssue({ status = 'IN PROGRESS', estimateSeconds = null, key = 'TEST-1', subtasks = [] } = {}) {
    return {
        key,
        fields: {
            status:       { name: status },
            resolution:   null,
            priority:     { name: 'Major' },
            fixVersions:  [{ name: '1.0' }],
            assignee:     { displayName: 'Alice', accountId: 'alice-id' },
            labels:       ['area/runtimes'],
            components:   [],
            subtasks,
            timetracking: {
                originalEstimateSeconds:  estimateSeconds,
                originalEstimate:         estimateSeconds != null ? `${Math.round(estimateSeconds / 3600)}h` : undefined,
                remainingEstimateSeconds: 0,
                remainingEstimate:        '0h',
                timeSpentSeconds:         estimateSeconds != null ? 3600 : null,
                timeSpent:                estimateSeconds != null ? '1h' : null,
            },
        },
    };
}

/** Minimal jiraClient stub for validateIssue(). */
const jiraClient = {
    extractStatus:           (i) => i.fields.status?.name || null,
    extractResolution:       (i) => i.fields.resolution?.name || null,
    extractPriority:         (i) => i.fields.priority?.name || null,
    extractFixVersions:      (i) => i.fields.fixVersions?.map(v => v.name) || [],
    extractOriginalEstimate: (i) => {
        const s = i.fields.timetracking?.originalEstimateSeconds;
        if (s === undefined || s === null) return null;
        return s > 0 ? i.fields.timetracking.originalEstimate : '0m';
    },
    extractRemainingEstimate:(i) => {
        const s = i.fields.timetracking?.remainingEstimateSeconds;
        return s > 0 ? i.fields.timetracking.remainingEstimate : null;
    },
    extractTimeSpent:        (i) => {
        const s = i.fields.timetracking?.timeSpentSeconds;
        if (s === undefined || s === null) return null;
        return s > 0 ? i.fields.timetracking.timeSpent : 0;
    },
    extractAssignee:         (i) => i.fields.assignee?.displayName || null,
    extractAssigneeAccountId:(i) => i.fields.assignee?.accountId || null,
    extractAreaLabel:        (i) => (i.fields.labels || []).find(l => l.startsWith('area/')) || null,
    extractAreaLabels:       (i) => (i.fields.labels || []).filter(l => l.startsWith('area/')),
    extractFirstComponent:   (i) => i.fields.components?.[0]?.name || null,
    extractLabels:           (i) => i.fields.labels || [],
};

// ---------------------------------------------------------------------------
// ESTIMATE_TOO_LONG tests
// ---------------------------------------------------------------------------

test('ESTIMATE_TOO_LONG: raised for In Progress item with estimate > 2 weeks', () => {
    const validator = new PolicyValidator();
    const issue = makeIssue({ status: 'IN PROGRESS', estimateSeconds: TWO_WEEKS_S + 1 });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(result.violations.includes('ESTIMATE_TOO_LONG'),
        `Expected ESTIMATE_TOO_LONG, got: ${result.violations}`);
});

test('ESTIMATE_TOO_LONG: not raised when estimate is exactly 2 weeks', () => {
    const validator = new PolicyValidator();
    const issue = makeIssue({ status: 'IN PROGRESS', estimateSeconds: TWO_WEEKS_S });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(!result.violations.includes('ESTIMATE_TOO_LONG'),
        `Unexpected ESTIMATE_TOO_LONG for exactly 2 weeks: ${result.violations}`);
});

test('ESTIMATE_TOO_LONG: not raised when estimate is below 2 weeks', () => {
    const validator = new PolicyValidator();
    const issue = makeIssue({ status: 'IN PROGRESS', estimateSeconds: ONE_WEEK_S });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(!result.violations.includes('ESTIMATE_TOO_LONG'),
        `Unexpected ESTIMATE_TOO_LONG for 1 week: ${result.violations}`);
});

test('ESTIMATE_TOO_LONG: not raised for Backlog items even with large estimate', () => {
    const validator = new PolicyValidator();
    const issue = makeIssue({ status: 'BACKLOG', estimateSeconds: TWO_WEEKS_S * 3 });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(!result.violations.includes('ESTIMATE_TOO_LONG'),
        `Unexpected ESTIMATE_TOO_LONG for Backlog: ${result.violations}`);
});

test('ESTIMATE_TOO_LONG: not raised for Next (NEW) items even with large estimate', () => {
    const validator = new PolicyValidator();
    const issue = makeIssue({ status: 'NEW', estimateSeconds: TWO_WEEKS_S * 3 });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(!result.violations.includes('ESTIMATE_TOO_LONG'),
        `Unexpected ESTIMATE_TOO_LONG for Next: ${result.violations}`);
});

test('ESTIMATE_TOO_LONG: not raised for Next (REFINEMENT) items even with large estimate', () => {
    const validator = new PolicyValidator();
    const issue = makeIssue({ status: 'REFINEMENT', estimateSeconds: TWO_WEEKS_S * 3 });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(!result.violations.includes('ESTIMATE_TOO_LONG'),
        `Unexpected ESTIMATE_TOO_LONG for Refinement: ${result.violations}`);
});

test('ESTIMATE_TOO_LONG: not raised when estimate is absent (null)', () => {
    const validator = new PolicyValidator();
    const issue = makeIssue({ status: 'IN PROGRESS', estimateSeconds: null });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(!result.violations.includes('ESTIMATE_TOO_LONG'),
        `Unexpected ESTIMATE_TOO_LONG for null estimate: ${result.violations}`);
});

test('ESTIMATE_TOO_LONG: not raised for In Review items even with large estimate', () => {
    const validator = new PolicyValidator();
    const issue = makeIssue({ status: 'CODE REVIEW', estimateSeconds: TWO_WEEKS_S + 3600 });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(!result.violations.includes('ESTIMATE_TOO_LONG'),
        `Unexpected ESTIMATE_TOO_LONG for In Review: ${result.violations}`);
});

test('ESTIMATE_TOO_LONG: not raised for Done items even with large estimate', () => {
    const validator = new PolicyValidator();
    const issue = makeIssue({ status: 'RELEASE PENDING', estimateSeconds: TWO_WEEKS_S + 3600 });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(!result.violations.includes('ESTIMATE_TOO_LONG'),
        `Unexpected ESTIMATE_TOO_LONG for Done: ${result.violations}`);
});

// ---------------------------------------------------------------------------
// Epic suppression tests (NO_ESTIMATE / NO_REMAINING_WORK)
// ---------------------------------------------------------------------------

/** A stub sub-task entry — only the presence matters for isEpic(). */
const STUB_SUBTASK = { key: 'TEST-2', fields: { summary: 'child' } };

test('NO_ESTIMATE: not raised for In Progress epic with no estimate', () => {
    const validator = new PolicyValidator();
    // Epic with no estimate — originalEstimateSeconds is null
    const issue = makeIssue({ status: 'IN PROGRESS', estimateSeconds: null, subtasks: [STUB_SUBTASK] });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(!result.violations.includes('NO_ESTIMATE'),
        `Unexpected NO_ESTIMATE for epic: ${result.violations}`);
});

test('NO_ESTIMATE: raised for non-epic In Progress item with no estimate', () => {
    const validator = new PolicyValidator();
    // Non-epic (no subtasks) with no estimate — should still fire
    const issue = makeIssue({ status: 'IN PROGRESS', estimateSeconds: null, subtasks: [] });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(result.violations.includes('NO_ESTIMATE'),
        `Expected NO_ESTIMATE for non-epic without estimate: ${result.violations}`);
});

test('NO_REMAINING_WORK: not raised for In Progress epic with no estimate', () => {
    const validator = new PolicyValidator();
    // Epic with estimate=0 — remaining work not mandatory
    const issue = makeIssue({ status: 'IN PROGRESS', estimateSeconds: 0, subtasks: [STUB_SUBTASK] });
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(!result.violations.includes('NO_REMAINING_WORK'),
        `Unexpected NO_REMAINING_WORK for epic with estimate=0: ${result.violations}`);
});

test('NO_REMAINING_WORK: raised for In Progress epic when estimate > 0 and remaining work is absent', () => {
    const validator = new PolicyValidator();
    // Epic with a real estimate — remaining work IS required
    // We need remainingEstimateSeconds to be 0/null to trigger the missing-field path.
    const issue = makeIssue({ status: 'IN PROGRESS', estimateSeconds: ONE_WEEK_S, subtasks: [STUB_SUBTASK] });
    // Override remaining to be absent (null) to trigger the rule
    issue.fields.timetracking.remainingEstimateSeconds = null;
    issue.fields.timetracking.remainingEstimate = undefined;
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(result.violations.includes('NO_REMAINING_WORK'),
        `Expected NO_REMAINING_WORK for epic with estimate>0 and no remaining: ${result.violations}`);
});

// ---------------------------------------------------------------------------
// PR_NOT_MERGED tests
// ---------------------------------------------------------------------------

/**
 * A "Done" issue — RELEASE PENDING has all required fields populated via makeIssue defaults.
 * We must also set timeSpent so NO_TIME_SPENT doesn't fire.
 */
function makeDoneIssue(overrides = {}) {
    const issue = makeIssue({ status: 'RELEASE PENDING', estimateSeconds: ONE_WEEK_S, ...overrides });
    // timetracking already has timeSpentSeconds > 0 when estimateSeconds is set
    return issue;
}

const OPEN_PR   = { id: '1', title: 'Fix bug', url: 'https://github.com/org/repo/pull/1', status: 'OPEN' };
const MERGED_PR = { id: '2', title: 'Add feature', url: 'https://github.com/org/repo/pull/2', status: 'MERGED' };

test('PR_NOT_MERGED: raised for RELEASE PENDING issue with at least one open PR', () => {
    const validator = new PolicyValidator();
    const issue = makeDoneIssue();
    const result = validator.validateIssue(issue, jiraClient, [OPEN_PR]);
    assert.ok(result.violations.includes('PR_NOT_MERGED'),
        `Expected PR_NOT_MERGED, got: ${result.violations}`);
});

test('PR_NOT_MERGED: raised for CLOSED/Done issue with at least one open PR', () => {
    const validator = new PolicyValidator();
    const issue = makeIssue({ status: 'CLOSED', estimateSeconds: ONE_WEEK_S });
    issue.fields.resolution = { name: 'Done' };
    const result = validator.validateIssue(issue, jiraClient, [OPEN_PR]);
    assert.ok(result.violations.includes('PR_NOT_MERGED'),
        `Expected PR_NOT_MERGED for CLOSED/Done, got: ${result.violations}`);
});

test('PR_NOT_MERGED: not raised when all linked PRs are merged (empty open-PR list)', () => {
    const validator = new PolicyValidator();
    const issue = makeDoneIssue();
    // Caller filters to open PRs only; passing empty list simulates all-merged
    const result = validator.validateIssue(issue, jiraClient, []);
    assert.ok(!result.violations.includes('PR_NOT_MERGED'),
        `Unexpected PR_NOT_MERGED when all PRs merged: ${result.violations}`);
});

test('PR_NOT_MERGED: not raised when there are no linked PRs', () => {
    const validator = new PolicyValidator();
    const issue = makeDoneIssue();
    const result = validator.validateIssue(issue, jiraClient, []);
    assert.ok(!result.violations.includes('PR_NOT_MERGED'),
        `Unexpected PR_NOT_MERGED with no PRs: ${result.violations}`);
});

test('PR_NOT_MERGED: not raised when openPullRequests parameter is omitted', () => {
    const validator = new PolicyValidator();
    const issue = makeDoneIssue();
    const result = validator.validateIssue(issue, jiraClient);
    assert.ok(!result.violations.includes('PR_NOT_MERGED'),
        `Unexpected PR_NOT_MERGED when parameter omitted: ${result.violations}`);
});

test('PR_NOT_MERGED: not raised for In Progress issues even with open PRs', () => {
    const validator = new PolicyValidator();
    const issue = makeIssue({ status: 'IN PROGRESS', estimateSeconds: ONE_WEEK_S });
    const result = validator.validateIssue(issue, jiraClient, [OPEN_PR]);
    assert.ok(!result.violations.includes('PR_NOT_MERGED'),
        `Unexpected PR_NOT_MERGED for In Progress: ${result.violations}`);
});

test('PR_NOT_MERGED: raised with mixed open and merged PRs (at least one open)', () => {
    const validator = new PolicyValidator();
    const issue = makeDoneIssue();
    const result = validator.validateIssue(issue, jiraClient, [MERGED_PR, OPEN_PR]);
    assert.ok(result.violations.includes('PR_NOT_MERGED'),
        `Expected PR_NOT_MERGED with mixed PRs, got: ${result.violations}`);
});
