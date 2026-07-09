/**
 * Convert JIRA time (in seconds) to weeks
 * Based on: 1 week = 5 days, 1 day = 8 hours
 *
 * @param {number} seconds - JIRA time in seconds
 * @returns {number} - Time in weeks, rounded to 4 decimals
 */
function jiraTimeToWeeks(seconds) {
  if (!seconds || seconds === 0) return 0;

  const hours = seconds / 3600;
  const weeks = hours / 40; // 40 hours per week (5 days * 8 hours)

  return Math.round(weeks * 10000) / 10000; // Round to 4 decimals
}

/**
 * Extract time tracking fields from JIRA issue
 * Converts all values to weeks
 */
function extractTimeTracking(issue) {
  const fields = issue.fields || {};
  const timetracking = fields.timetracking || {};

  // Basic time tracking
  const originalEstimate = jiraTimeToWeeks(timetracking.originalEstimateSeconds || 0);
  const remainingEstimate = jiraTimeToWeeks(timetracking.remainingEstimateSeconds || 0);
  const timeSpent = jiraTimeToWeeks(timetracking.timeSpentSeconds || 0);

  // Aggregate time tracking (for parent issues with sub-tasks)
  const aggregateOriginalEstimate = jiraTimeToWeeks(fields.aggregatetimeoriginalestimate || 0);
  const aggregateTimeSpent = jiraTimeToWeeks(fields.aggregatetimespent || 0);
  const aggregateRemainingEstimate = jiraTimeToWeeks(fields.aggregatetimeestimate || 0);

  return {
    originalEstimate,
    remainingEstimate,
    timeSpent,
    aggregateOriginalEstimate,
    aggregateTimeSpent,
    aggregateRemainingEstimate
  };
}

/**
 * Format time value for CSV export
 * - 0 -> "0" or empty string based on flag
 * - Positive values -> up to 4 decimal places, trailing zeros stripped
 * - Negative values -> "0" (should not happen, but safety check)
 */
function formatTimeValue(weeks, emptyIfZero = false) {
  if (!weeks || weeks <= 0) {
    return emptyIfZero ? '' : '0';
  }

  return String(Math.round(weeks * 10000) / 10000);
}

/**
 * Format aggregate time value for CSV export
 * Returns empty string if zero or not available
 * Positive values -> up to 4 decimal places, trailing zeros stripped
 */
function formatAggregateTimeValue(weeks) {
  if (!weeks || weeks <= 0) return '';
  return String(Math.round(weeks * 10000) / 10000);
}

module.exports = {
  jiraTimeToWeeks,
  extractTimeTracking,
  formatTimeValue,
  formatAggregateTimeValue
};
