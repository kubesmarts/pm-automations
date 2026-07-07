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
function makeIssue({ status = 'IN PROGRESS', estimateSeconds = null, key = 'TEST-1' } = {}) {
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
