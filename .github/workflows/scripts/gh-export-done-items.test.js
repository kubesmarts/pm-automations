'use strict';

/**
 * Tests for gh-export-done-items.yml
 *
 * Strategy:
 *  - YAML wiring tests: structural assertions on the workflow YAML.
 *  - Python logic tests: exercise the embedded Python scripts using
 *    child_process.execSync with minimal self-contained inputs.
 *    0. build_rows – parses an existing CSV into { url: [17 columns] }.
 *    1. compare    – compares a freshly built row with the stored one, ignoring Reporting Date and Parent Issue (NEW / SAME / CHANGED).
 *    2. dedup      – deduplicates rows by URL (last row wins) and sorts by Reporting Date.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { execSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORKFLOW_PATH = path.resolve(__dirname, '../gh-export-done-items.yml');
const WORKFLOW_YML  = fs.readFileSync(WORKFLOW_PATH, 'utf8');

/** Write content to a temp file and return its path. */
function tmpFile(content, ext = '') {
    const f = path.join(os.tmpdir(), `gh-done-test-${process.pid}-${Math.random().toString(36).slice(2)}${ext}`);
    fs.writeFileSync(f, content);
    return f;
}

/** Run a bash snippet and return stdout trimmed. Throws on non-zero exit. */
function bash(script) {
    const f = tmpFile(script, '.sh');
    try {
        return execSync(`bash ${f}`, { encoding: 'utf8' }).trim();
    } finally {
        try { fs.unlinkSync(f); } catch (_) {}
    }
}

/** Run a Python snippet and return stdout trimmed. Throws on non-zero exit. */
function python(script, args = []) {
    const f = tmpFile(script, '.py');
    try {
        const argStr = args.map(a => `'${a.replace(/'/g, "\\'")}'`).join(' ');
        return execSync(`python3 ${f} ${argStr}`, { encoding: 'utf8' }).trim();
    } finally {
        try { fs.unlinkSync(f); } catch (_) {}
    }
}

/** CSV header used by done-items exports. */
const HEADER = 'Issue Number,Parent Issue,Issue URL,Title,Assignees,Type,Area,Priority,Initiative,Target Milestone,Size,Estimate,Time Spent,Reporting Date,External Reference,Comments,Alerts';

/** Wrap a CSV field value in double-quotes (escaping any inner quotes). */
function q(v) {
    return `"${v.replace(/"/g, '""')}"`;
}

/** Build a minimal 17-column CSV row string. Fields with commas are quoted. */
function csvRow({ url = 'https://github.com/org/repo/issues/1', reportingDate = '2026-10-01', reportingLog = '', alerts = '' } = {}) {
    // cols: Number,Parent,URL,Title,Assignees,Type,Area,Priority,Initiative,Milestone,Size,Est,Spent,Date,ExtRef,Log,Alerts
    return `1,,${url},Title,,,,,,,,,,${reportingDate},,${q(reportingLog)},${alerts}`;
}

// ---------------------------------------------------------------------------
// Extract the Python scripts from the workflow YAML.
// Scripts are stored base64-encoded; extract and decode them for testing.
// ---------------------------------------------------------------------------

/** Extract the Nth base64 payload from a base64 -d | python3 invocation (0-indexed). */
function extractPythonScript(index) {
    const matches = [...WORKFLOW_YML.matchAll(/echo '([A-Za-z0-9+/=]+)' \| base64 -d \| python3/g)];
    if (!matches[index]) throw new Error(`No base64 python script at index ${index}`);
    return Buffer.from(matches[index][1], 'base64').toString('utf8');
}

// Script 0: build_rows — builds { url: [columns] } JSON from a CSV file
// Script 1: compare    — prints NEW, SAME or CHANGED: <diff> for a freshly built row
// Script 2: dedup      — deduplicates rows from a merged CSV temp file
const BUILD_ROWS_SCRIPT = extractPythonScript(0);
const COMPARE_SCRIPT    = extractPythonScript(1);
const DEDUP_SCRIPT      = extractPythonScript(2);

// ---------------------------------------------------------------------------
// SECTION 1 – YAML wiring
// ---------------------------------------------------------------------------

test('workflow: dry_run input declared as boolean with default false', () => {
    assert.match(WORKFLOW_YML, /dry_run:/,
        'workflow_dispatch must declare a dry_run input');
    assert.match(WORKFLOW_YML, /type: boolean/,
        'dry_run input must be of type boolean');
    assert.match(WORKFLOW_YML, /default: false/,
        'dry_run input must default to false');
});

test('workflow: DRY_RUN env var is wired to inputs.dry_run', () => {
    assert.match(WORKFLOW_YML, /DRY_RUN:.*github\.event\.inputs\.dry_run/,
        'DRY_RUN env var must be wired to github.event.inputs.dry_run');
});

test('workflow: commit step is skipped when dry_run is true', () => {
    assert.match(WORKFLOW_YML, /github\.event\.inputs\.dry_run != 'true'/,
        'Commit step must be gated on dry_run != true');
});

test('workflow: emits dry-run notice when DRY_RUN is true', () => {
    assert.match(WORKFLOW_YML, /DRY RUN MODE/,
        'Workflow must print a DRY RUN MODE notice');
});

test('workflow: EXISTING_ROWS_FILE is initialised to {} (first export has no stored rows)', () => {
    assert.match(WORKFLOW_YML, /echo "\{\}" > "\$EXISTING_ROWS_FILE"/,
        'Workflow must initialise EXISTING_ROWS_FILE with an empty JSON object');
});

test('workflow: change detection compares exported values, not the Reporting Log field', () => {
    assert.doesNotMatch(WORKFLOW_YML, /get_field "\$item" "Reporting Log"/,
        'Reporting Log is not stored in the CSV and must not be used for change detection');
    assert.match(WORKFLOW_YML, /ROW_STATUS=\$\(/,
        'Workflow must compute ROW_STATUS by comparing the built row with the stored one');
});

test('workflow: does not use NUL byte sentinels (bash drops them with a warning)', () => {
    assert.doesNotMatch(WORKFLOW_YML, /\\x00/,
        'Workflow must not use \\x00 sentinels in command substitution');
});

test('workflow: item is skipped only when ROW_STATUS is SAME', () => {
    assert.match(WORKFLOW_YML, /if \[ "\$ROW_STATUS" = "SAME" \]; then/,
        'Workflow must skip an item only when all exported values are unchanged');
});

test('workflow: re-export message includes title, URL and the changed columns', () => {
    assert.match(WORKFLOW_YML, /Re-exporting issue #\$\{ISSUE_NUMBER\} \\"\$\{TITLE\}\\" \(\$\{ISSUE_URL\}\): exported values changed — \$\{ROW_STATUS#CHANGED: \}/,
        'Message must include issue number, title, URL and the changed exported values');
});

// ---------------------------------------------------------------------------
// SECTION 2 – build_rows and compare Python scripts
// ---------------------------------------------------------------------------

/** Build a 17-element row array with sensible defaults. */
function rowArr(over = {}) {
    const base = {
        0: '1', 1: '', 2: 'https://github.com/org/repo/issues/1', 3: 'Title', 4: 'alice',
        5: '', 6: 'Tooling', 7: 'Normal', 8: '', 9: '2026/Q4', 10: 'M', 11: '0.6', 12: '0.5',
        13: '2026-10-13', 14: '', 15: '', 16: '',
    };
    const r = { ...base, ...over };
    return Array.from({ length: 17 }, (_, i) => r[i]);
}

/** Encode a row array as one CSV line (every field quoted). */
function toCsv(arr) {
    return arr.map(q).join(',');
}

/** Run the compare script against a stored-rows map and a freshly built CSV line. */
function runCompare(storedRows, freshArr) {
    const map = tmpFile(JSON.stringify(Object.fromEntries(storedRows.map(r => [r[2], r]))));
    try {
        return python(COMPARE_SCRIPT, [map, toCsv(freshArr)]);
    } finally {
        fs.unlinkSync(map);
    }
}

test('build_rows: returns {} for empty CSV (header only)', () => {
    const csv = tmpFile(`${HEADER}\n`);
    assert.deepEqual(JSON.parse(python(BUILD_ROWS_SCRIPT, [csv])), {});
});

test('build_rows: maps URL to all 17 columns', () => {
    const row = rowArr({ 3: 'A title, with comma' });
    const csv = tmpFile(`${HEADER}\n${toCsv(row)}\n`);
    const result = JSON.parse(python(BUILD_ROWS_SCRIPT, [csv]));
    assert.deepEqual(result[row[2]], row);
});

test('build_rows: skips rows with fewer than 17 columns', () => {
    const csv = tmpFile(`${HEADER}\n1,,https://github.com/org/repo/issues/99,Title\n`);
    assert.deepEqual(JSON.parse(python(BUILD_ROWS_SCRIPT, [csv])), {});
});

test('build_rows: last row wins when the same URL appears twice', () => {
    const r1 = rowArr({ 7: 'Low' });
    const r2 = rowArr({ 7: 'Major' });
    const csv = tmpFile(`${HEADER}\n${toCsv(r1)}\n${toCsv(r2)}\n`);
    const result = JSON.parse(python(BUILD_ROWS_SCRIPT, [csv]));
    assert.equal(result[r1[2]][7], 'Major');
});

test('compare: NEW when the URL was never exported', () => {
    assert.equal(runCompare([], rowArr()), 'NEW');
    assert.equal(runCompare([rowArr({ 2: 'https://github.com/org/repo/issues/2' })], rowArr()), 'NEW');
});

test('compare: SAME when every compared column is identical', () => {
    assert.equal(runCompare([rowArr()], rowArr()), 'SAME');
});

test('compare: SAME for a known item whose compared columns are all empty', () => {
    const empty = rowArr({ 4: '', 6: '', 7: '', 9: '', 10: '', 11: '', 12: '' });
    assert.equal(runCompare([empty], empty), 'SAME');
});

test('compare: CHANGED lists each differing column with old and new value', () => {
    const stored = rowArr({ 6: 'Tooling', 7: 'Normal', 9: '2026/Q4', 11: '0.6', 12: '0.5' });
    const fresh  = rowArr({ 6: 'CI',      7: 'Major',  9: '2026/Q3', 11: '0.8', 12: '0.7' });
    assert.equal(runCompare([stored], fresh),
        "CHANGED: Area: 'Tooling' -> 'CI'; Priority: 'Normal' -> 'Major'; Target Milestone: '2026/Q4' -> '2026/Q3'; " +
        "Estimate: '0.6' -> '0.8'; Time Spent: '0.5' -> '0.7'");
});

test('compare: detects a field filled in after the original export', () => {
    assert.equal(runCompare([rowArr({ 11: '' })], rowArr({ 11: '0.4' })), "CHANGED: Estimate: '' -> '0.4'");
});

test('compare: detects changes in title, assignees, type, initiative, size, external reference, comments and alerts', () => {
    const stored = rowArr();
    const fresh  = rowArr({ 3: 'New title', 4: 'bob', 5: 'Bug', 8: 'Init', 10: 'L', 14: 'JIRA-1', 15: 'note', 16: 'NO_ESTIMATE' });
    assert.equal(runCompare([stored], fresh),
        "CHANGED: Title: 'Title' -> 'New title'; Assignees: 'alice' -> 'bob'; Type: '' -> 'Bug'; Initiative: '' -> 'Init'; " +
        "Size: 'M' -> 'L'; External Reference: '' -> 'JIRA-1'; Comments: '' -> 'note'; Alerts: '' -> 'NO_ESTIMATE'");
});

test('compare: ignores Reporting Date and Parent Issue', () => {
    const stored = rowArr();
    const fresh  = rowArr({ 1: '12', 13: '2026-10-14' });
    assert.equal(runCompare([stored], fresh), 'SAME');
});

test('compare: long values are truncated in the description', () => {
    const long = 'x'.repeat(200);
    const out = runCompare([rowArr({ 15: '' })], rowArr({ 15: long }));
    assert.match(out, /^CHANGED: Comments: '' -> 'x{77}\.\.\.'$/);
});

// ---------------------------------------------------------------------------
// SECTION 3 – dedup Python script
// ---------------------------------------------------------------------------

/**
 * Run the dedup script against a merged CSV string (no header).
 * Returns parsed array of rows.
 */
function runDedup(mergedCsvContent) {
    const merged = tmpFile(mergedCsvContent);
    // The dedup script reads sys.argv[1] and writes CSV to stdout
    const out = python(DEDUP_SCRIPT, [merged]);
    // Parse output lines back into arrays using a simple split
    // (fields may be quoted — use Python itself to parse)
    if (!out) return [];
    const parsePy = `
import csv, sys, json
rows = list(csv.reader(open(sys.argv[1])))
print(json.dumps(rows))
`;
    const outFile = tmpFile(out);
    const parsed = JSON.parse(python(parsePy, [outFile]));
    fs.unlinkSync(outFile);
    return parsed;
}

test('dedup: single row is kept as-is', () => {
    const url = 'https://github.com/org/repo/issues/1';
    const row = csvRow({ url, reportingDate: '2026-10-01', reportingLog: 'log1' });
    const result = runDedup(`${row}\n`);
    assert.equal(result.length, 1);
    assert.equal(result[0][2], url);
});

test('dedup: two rows with different URLs are both kept', () => {
    const url1 = 'https://github.com/org/repo/issues/1';
    const url2 = 'https://github.com/org/repo/issues/2';
    const merged =
        `${csvRow({ url: url1, reportingDate: '2026-10-01' })}\n` +
        `${csvRow({ url: url2, reportingDate: '2026-09-01' })}\n`;
    const result = runDedup(merged);
    assert.equal(result.length, 2);
});

test('dedup: same URL appearing twice yields one row (last wins)', () => {
    const url = 'https://github.com/org/repo/issues/1';
    const older = csvRow({ url, reportingDate: '2026-09-01', reportingLog: 'old log' });
    const newer = csvRow({ url, reportingDate: '2026-10-01', reportingLog: 'new log' });
    const result = runDedup(`${older}\n${newer}\n`);
    assert.equal(result.length, 1);
    assert.equal(result[0][13], '2026-10-01');  // col 14 (index 13) = Reporting Date
});

test('dedup: last row wins for the same URL (freshly exported row replaces stored row)', () => {
    const url = 'https://github.com/org/repo/issues/1';
    const stored = toCsv(rowArr({ 2: url, 7: 'Normal', 13: '2026-10-01' }));
    const fresh  = toCsv(rowArr({ 2: url, 7: 'Major',  13: '2026-10-01' }));
    const result = runDedup(`${stored}\n${fresh}\n`);
    assert.equal(result.length, 1);
    assert.equal(result[0][7], 'Major');
});

test('dedup: freshly exported row wins even if its Reporting Date is older', () => {
    const url = 'https://github.com/org/repo/issues/1';
    const stored = toCsv(rowArr({ 2: url, 13: '2026-10-05' }));
    const fresh  = toCsv(rowArr({ 2: url, 13: '2026-10-01' }));
    const result = runDedup(`${stored}\n${fresh}\n`);
    assert.equal(result.length, 1);
    assert.equal(result[0][13], '2026-10-01');
});

test('dedup: output is sorted by Reporting Date descending', () => {
    const url1 = 'https://github.com/org/repo/issues/1';
    const url2 = 'https://github.com/org/repo/issues/2';
    const url3 = 'https://github.com/org/repo/issues/3';
    const merged =
        `${csvRow({ url: url1, reportingDate: '2026-09-01' })}\n` +
        `${csvRow({ url: url2, reportingDate: '2026-10-05' })}\n` +
        `${csvRow({ url: url3, reportingDate: '2026-10-01' })}\n`;
    const result = runDedup(merged);
    assert.equal(result.length, 3);
    assert.equal(result[0][13], '2026-10-05');
    assert.equal(result[1][13], '2026-10-01');
    assert.equal(result[2][13], '2026-09-01');
});

test('dedup: skips rows with fewer than 17 columns', () => {
    const url = 'https://github.com/org/repo/issues/1';
    const shortRow = `1,,${url},Title`;  // only 4 columns
    const validRow = csvRow({ url: 'https://github.com/org/repo/issues/2', reportingDate: '2026-10-01' });
    const result = runDedup(`${shortRow}\n${validRow}\n`);
    assert.equal(result.length, 1);
    assert.equal(result[0][2], 'https://github.com/org/repo/issues/2');
});
