/**
 * Sort items by Reporting Date in descending order (newest first)
 */
function sortByReportingDate(items) {
  return items.sort((a, b) => {
    const dateA = new Date(a['Reporting Date']);
    const dateB = new Date(b['Reporting Date']);
    return dateB - dateA; // Descending order
  });
}

/**
 * Remove duplicate entries by Issue URL
 * Keeps the one with the newest Reporting Date
 */
function removeDuplicates(items) {
  const uniqueMap = new Map();

  for (const item of items) {
    const issueUrl = item['Issue URL'];
    const reportingDate = new Date(item['Reporting Date']);

    if (!uniqueMap.has(issueUrl)) {
      uniqueMap.set(issueUrl, item);
    } else {
      const existing = uniqueMap.get(issueUrl);
      const existingDate = new Date(existing['Reporting Date']);

      // Keep the one with newer date
      if (reportingDate > existingDate) {
        uniqueMap.set(issueUrl, item);
      }
    }
  }

  return Array.from(uniqueMap.values());
}

const DONE_COMPARE_COLUMNS = [
  'Title',
  'Assignees',
  'Type',
  'Area',
  'Priority',
  'Initiative',
  'Target Milestone',
  'Size',
  'Estimate',
  'Time Spent',
  'External Reference',
  'Comments',
  'Alerts'
];

const NUMERIC_COLUMNS = new Set(['Size', 'Estimate', 'Time Spent']);

/**
 * Compare freshly built done row with existing stored row.
 * Normalizes numeric fields (e.g. '1.0' === '1') to prevent cosmetic false positives.
 * Returns array of diff strings.
 */
function compareDoneRows(oldRow, newRow) {
  const diffs = [];
  const cut = v => (v.length <= 80 ? v : v.slice(0, 77) + '...');

  for (const col of DONE_COMPARE_COLUMNS) {
    const oldVal = (oldRow[col] || '').trim();
    const newVal = (newRow[col] || '').trim();

    if (oldVal === newVal) continue;

    // For numeric columns, ignore cosmetic representation differences (e.g. '1.0' vs '1', '0.0' vs '0')
    if (NUMERIC_COLUMNS.has(col) && oldVal !== '' && newVal !== '') {
      const oldNum = Number(oldVal);
      const newNum = Number(newVal);
      if (!Number.isNaN(oldNum) && !Number.isNaN(newNum) && oldNum === newNum) {
        continue;
      }
    }

    diffs.push(`${col}: '${cut(oldVal)}' -> '${cut(newVal)}'`);
  }

  return diffs;
}

/**
 * Remove existing done-items rows whose Issue URL appears in the active set.
 * Called before merging so that tickets which transitioned back to an active
 * status do not leave a ghost row in the done-items CSV.
 */
function removeActiveItems(existingItems, activeUrls) {
  if (!activeUrls || activeUrls.size === 0) return existingItems;

  const evicted = existingItems.filter(item => activeUrls.has(item['Issue URL']));
  if (evicted.length > 0) {
    evicted.forEach(item => console.log(`  → Evicted ghost done-items row for ${item['Issue URL']} (ticket is now Active)`));
  }

  return existingItems.filter(item => !activeUrls.has(item['Issue URL']));
}

/**
 * Merge new done items with existing items
 * - Evicts rows for tickets that are currently Active (ghost row cleanup)
 * - Identifies new done items not present in existing rows (no date cutoff)
 * - Updates existing rows when exported field values changed (via compareDoneRows)
 * - Retains existing rows when values are unchanged
 * - Sorts by reporting date descending
 */
function mergeDoneItems(newItems, existingItems, activeUrls) {
  const incoming = newItems || [];
  const existing = existingItems || [];

  if (existing.length === 0) {
    // No existing items, just sort incoming items
    return sortByReportingDate([...incoming]);
  }

  // 1. Evict ghost rows for tickets that have transitioned back to Active
  const cleanedExisting = removeActiveItems(existing, activeUrls);

  // 2. Build map of existing items by Issue URL
  const existingMap = new Map();
  for (const item of cleanedExisting) {
    existingMap.set(item['Issue URL'], item);
  }

  // 3. Process incoming items:
  // - If item is NOT in existingMap -> new done item
  // - If item IS in existingMap -> check for differences via compareDoneRows
  //   - If diffs found -> re-export (fresh item wins)
  //   - If no diffs -> keep existing item
  const newOrUpdated = [];
  let skippedUnchanged = 0;

  for (const doneRow of incoming) {
    const issueUrl = doneRow['Issue URL'];
    const existingRow = existingMap.get(issueUrl);

    if (!existingRow) {
      newOrUpdated.push(doneRow);
    } else {
      const diffs = compareDoneRows(existingRow, doneRow);
      if (diffs.length > 0) {
        console.log(`  → Re-exporting issue #${doneRow['Issue Number'] || ''} "${doneRow['Title'] || ''}" (${issueUrl}): exported values changed — ${diffs.join('; ')}`);
        newOrUpdated.push(doneRow);
      } else {
        skippedUnchanged++;
      }
    }
  }

  // 4. Merge cleaned existing rows with new/updated done rows (deduplicating by Issue URL)
  const urlMap = new Map();
  for (const r of cleanedExisting) {
    urlMap.set(r['Issue URL'], r);
  }
  for (const r of newOrUpdated) {
    urlMap.set(r['Issue URL'], r); // fresh row wins
  }

  const finalDoneRows = Array.from(urlMap.values());
  return sortByReportingDate(finalDoneRows);
}

module.exports = {
  DONE_COMPARE_COLUMNS,
  NUMERIC_COLUMNS,
  compareDoneRows,
  sortByReportingDate,
  removeDuplicates,
  removeActiveItems,
  mergeDoneItems
};
