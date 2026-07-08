'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const JiraClient = require('./jira-client');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal JiraClient with makeRequest stubbed out.
 * @param {Function} makeRequestFn - (endpoint) => Promise<any>
 */
function makeClient(makeRequestFn) {
  const client = new JiraClient('https://jira.example.com', 'user@example.com', 'token');
  client.makeRequest = makeRequestFn;
  return client;
}

/**
 * Build an ADF document with a single paragraph containing the given text nodes.
 */
function makeADFComment(textNodes) {
  return {
    version: 1,
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: textNodes,
    }],
  };
}

// ---------------------------------------------------------------------------
// _extractTextFromADF
// ---------------------------------------------------------------------------

test('_extractTextFromADF: extracts text from a flat text node', () => {
  const client = makeClient(async () => ({}));
  const node = { type: 'text', text: 'Hello world' };
  assert.equal(client._extractTextFromADF(node), 'Hello world');
});

test('_extractTextFromADF: extracts and concatenates text from nested nodes', () => {
  const client = makeClient(async () => ({}));
  const doc = makeADFComment([
    { type: 'text', text: 'Compliance violations detected: ' },
    { type: 'text', text: 'NO_ESTIMATE, NO_AREA' },
    { type: 'text', text: '. Please review and resolve.' },
  ]);
  const text = client._extractTextFromADF(doc);
  assert.ok(text.includes('Compliance violations detected: NO_ESTIMATE, NO_AREA'));
});

test('_extractTextFromADF: returns empty string for null node', () => {
  const client = makeClient(async () => ({}));
  assert.equal(client._extractTextFromADF(null), '');
});

test('_extractTextFromADF: returns empty string for node with no text and no content', () => {
  const client = makeClient(async () => ({}));
  assert.equal(client._extractTextFromADF({ type: 'mention', attrs: {} }), '');
});

test('_extractTextFromADF: skips mention nodes (no text property)', () => {
  const client = makeClient(async () => ({}));
  // Mention node followed by the actual text — as written by buildComplianceCommentBody
  const doc = makeADFComment([
    { type: 'mention', attrs: { id: 'acc-1', text: '@alice' } },
    { type: 'text', text: ' ' },
    { type: 'text', text: 'Compliance violations detected: NO_ESTIMATE. Please review and resolve.' },
  ]);
  const text = client._extractTextFromADF(doc);
  assert.ok(text.includes('Compliance violations detected: NO_ESTIMATE'));
});

// ---------------------------------------------------------------------------
// extractComplianceAlerts
// ---------------------------------------------------------------------------

test('extractComplianceAlerts: returns codes from a matching comment', async () => {
  const body = makeADFComment([
    { type: 'text', text: 'Compliance violations detected: NO_ESTIMATE, NO_REMAINING_WORK. Please review and resolve.' },
  ]);
  const client = makeClient(async () => ({ comments: [{ id: '1', body }] }));
  const result = await client.extractComplianceAlerts('PROJ-1');
  assert.equal(result, 'NO_ESTIMATE, NO_REMAINING_WORK');
});

test('extractComplianceAlerts: returns single code when only one violation', async () => {
  const body = makeADFComment([
    { type: 'text', text: 'Compliance violations detected: NO_AREA. Please review and resolve.' },
  ]);
  const client = makeClient(async () => ({ comments: [{ id: '1', body }] }));
  const result = await client.extractComplianceAlerts('PROJ-2');
  assert.equal(result, 'NO_AREA');
});

test('extractComplianceAlerts: returns empty string when no compliance comment exists', async () => {
  const body = makeADFComment([{ type: 'text', text: 'Just a normal comment.' }]);
  const client = makeClient(async () => ({ comments: [{ id: '1', body }] }));
  const result = await client.extractComplianceAlerts('PROJ-3');
  assert.equal(result, '');
});

test('extractComplianceAlerts: returns empty string when comments list is empty', async () => {
  const client = makeClient(async () => ({ comments: [] }));
  const result = await client.extractComplianceAlerts('PROJ-4');
  assert.equal(result, '');
});

test('extractComplianceAlerts: returns empty string and warns when API throws', async () => {
  const client = makeClient(async () => { throw new Error('network error'); });
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  const result = await client.extractComplianceAlerts('PROJ-5');
  console.warn = origWarn;
  assert.equal(result, '');
  assert.ok(warnings.some(w => w.includes('PROJ-5')));
});

test('extractComplianceAlerts: works when mention node precedes the text (real comment shape)', async () => {
  const body = makeADFComment([
    { type: 'mention', attrs: { id: 'acc-1', text: '@alice' } },
    { type: 'text', text: ' Compliance violations detected: NO_PRIORITY. Please review and resolve.' },
  ]);
  const client = makeClient(async () => ({ comments: [{ id: '1', body }] }));
  const result = await client.extractComplianceAlerts('PROJ-6');
  assert.equal(result, 'NO_PRIORITY');
});
