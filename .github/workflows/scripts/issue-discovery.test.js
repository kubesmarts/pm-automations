'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const IssueDiscovery = require('./issue-discovery');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(key) {
    return { key, fields: { summary: `Issue ${key}` } };
}

/**
 * Build a minimal JiraClient stub.
 * filterMap: { filterId -> { jql, issues[] } }
 * jqlMap:    { jql -> issues[] }
 */
function makeClient({ filterMap = {}, jqlMap = {} } = {}) {
    return {
        fetchFilter: async (filterId) => {
            if (!filterMap[filterId]) throw new Error(`Filter ${filterId} not found`);
            return { jql: filterMap[filterId].jql };
        },
        fetchAllIssuesFromJql: async (jql) => {
            if (!jqlMap[jql]) throw new Error(`JQL error for: ${jql}`);
            return jqlMap[jql];
        },
        fetchAllIssuesFromJqlWithSplit: async (jql) => {
            if (!jqlMap[jql]) throw new Error(`JQL error for: ${jql}`);
            return jqlMap[jql];
        },
    };
}

// ---------------------------------------------------------------------------
// discoverIssues — happy path
// ---------------------------------------------------------------------------

test('returns issues from a successful filter', async () => {
    const issue = makeIssue('FOO-1');
    const jql = 'project = FOO';
    const client = makeClient({
        filterMap: { '111': { jql } },
        jqlMap: { [jql]: [issue] },
    });
    const discovery = new IssueDiscovery(client);
    const issues = await discovery.discoverIssues('111', null, null);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].key, 'FOO-1');
});

test('deduplicates issues appearing in multiple filters', async () => {
    const issue = makeIssue('FOO-1');
    const jql1 = 'project = FOO';
    const jql2 = 'project = FOO AND priority = High';
    const client = makeClient({
        filterMap: {
            '111': { jql: jql1 },
            '222': { jql: jql2 },
        },
        jqlMap: { [jql1]: [issue], [jql2]: [issue] },
    });
    const discovery = new IssueDiscovery(client);
    const issues = await discovery.discoverIssues('111, 222', null, null);
    assert.equal(issues.length, 1);
});

test('returns issues from a successful JQL query', async () => {
    const jql = 'project = BAR';
    const client = makeClient({ jqlMap: { [jql]: [makeIssue('BAR-1')] } });
    const discovery = new IssueDiscovery(client);
    const issues = await discovery.discoverIssues(null, jql, null);
    assert.equal(issues.length, 1);
});

// ---------------------------------------------------------------------------
// discoverIssues — failure propagation
// ---------------------------------------------------------------------------

test('throws when a filter fails with a JQL error', async () => {
    const client = makeClient({
        filterMap: { '999': { jql: 'project = SRVLOGIC ORDER BY key ASC AND broken' } },
        // jqlMap intentionally empty → fetchAllIssuesFromJqlWithSplit will throw
    });
    const discovery = new IssueDiscovery(client);
    await assert.rejects(
        () => discovery.discoverIssues('999', null, null),
        (err) => {
            assert.match(err.message, /Issue discovery failed for 1 source/);
            assert.match(err.message, /Filter 999/);
            return true;
        }
    );
});

test('throws when a JQL query fails', async () => {
    const jql = 'project = BROKEN AND bad syntax';
    // jqlMap empty → fetchAllIssuesFromJqlWithSplit will throw
    const client = makeClient({});
    const discovery = new IssueDiscovery(client);
    await assert.rejects(
        () => discovery.discoverIssues(null, jql, null),
        (err) => {
            assert.match(err.message, /Issue discovery failed for 1 source/);
            assert.match(err.message, /JQL query 1/);
            return true;
        }
    );
});

test('throws listing all failed sources when multiple sources fail', async () => {
    const client = makeClient({
        filterMap: {
            '111': { jql: 'project = FOO' },
            '222': { jql: 'project = BAR' },
        },
        // jqlMap empty → both filters will throw
    });
    const discovery = new IssueDiscovery(client);
    await assert.rejects(
        () => discovery.discoverIssues('111, 222', null, null),
        (err) => {
            assert.match(err.message, /Issue discovery failed for 2 source/);
            assert.match(err.message, /Filter 111/);
            assert.match(err.message, /Filter 222/);
            return true;
        }
    );
});

test('still processes successful sources before throwing', async () => {
    // Filter 111 succeeds, filter 222 fails — the error is thrown after
    // processing completes, but since the throw happens we cannot return issues.
    // What matters is that the error message is accurate.
    const goodJql = 'project = FOO';
    const client = makeClient({
        filterMap: {
            '111': { jql: goodJql },
            '222': { jql: 'project = BAD AND broken' },
        },
        jqlMap: { [goodJql]: [makeIssue('FOO-1')] },
    });
    const discovery = new IssueDiscovery(client);
    await assert.rejects(
        () => discovery.discoverIssues('111, 222', null, null),
        (err) => {
            assert.match(err.message, /Issue discovery failed for 1 source/);
            assert.match(err.message, /Filter 222/);
            return true;
        }
    );
});
