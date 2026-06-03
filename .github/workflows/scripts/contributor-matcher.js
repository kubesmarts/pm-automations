const fs = require('fs');

/**
 * Normalize a name for fuzzy matching:
 * - Convert to lowercase
 * - Remove accents/diacritics
 * - Split into words
 */
function normalizeWords(name) {
  if (!name) return [];

  return name
    .toLowerCase()
    .normalize("NFD") // Decompose accented characters
    .replace(/[̀-ͯ]/g, "") // Remove diacritics
    .split(/\s+/) // Split by whitespace
    .filter(w => w.length > 0);
}

/**
 * Check if two names match using fuzzy comparison:
 * - At least 2 words must match
 * - Case insensitive
 * - Accent insensitive
 */
function matchesContributor(jiraName, csvName) {
  if (!jiraName || !csvName) return false;

  const jiraWords = normalizeWords(jiraName);
  const csvWords = normalizeWords(csvName);

  const commonWords = jiraWords.filter(jw => csvWords.includes(jw));
  return commonWords.length >= 2;
}

/**
 * Load contributor whitelist from CSV file
 * Returns map: normalized name -> username
 */
function loadContributorWhitelist(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log('Contributor whitelist not found, all issues are eligible');
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const contributors = new Map();
  let activeCount = 0;

  for (let i = 1; i < lines.length; i++) { // Skip header
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(',');
    if (parts.length < 4) continue;

    const [username, active, name, role] = parts;

    // Only include active contributors
    if (active.trim() === 'true') {
      contributors.set(name.trim(), username.trim());
      activeCount++;
    }
  }

  console.log(`Loaded contributor whitelist: ${activeCount} active contributor(s)`);
  if (activeCount > 0) {
    const usernames = Array.from(contributors.values()).join(',');
    console.log(`Active usernames: ${usernames}`);
  }

  return contributors;
}

/**
 * Find matching contributor from whitelist
 * Returns contributor username or null
 */
function matchContributor(jiraName, whitelist) {
  if (!jiraName || !whitelist) return null;

  for (const [csvName, username] of whitelist.entries()) {
    if (matchesContributor(jiraName, csvName)) {
      return username;
    }
  }

  return null;
}

/**
 * Resolve assignee to username:
 * - If whitelist configured: try to match JIRA assignee name
 * - If match found: return contributor username
 * - If no match or no whitelist: return JIRA assignee ID
 */
function resolveAssignee(jiraAssignee, whitelist) {
  if (!jiraAssignee) return null;

  const jiraName = jiraAssignee.displayName || jiraAssignee.name;
  const jiraId = jiraAssignee.accountId || jiraAssignee.key || jiraAssignee.name;

  if (!whitelist) {
    // No whitelist configured, use JIRA ID
    return jiraId;
  }

  // Try to match against whitelist
  const username = matchContributor(jiraName, whitelist);
  return username || jiraId;
}

module.exports = {
  normalizeWords,
  matchesContributor,
  loadContributorWhitelist,
  matchContributor,
  resolveAssignee
};
