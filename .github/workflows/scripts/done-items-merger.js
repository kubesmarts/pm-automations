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

/**
 * Filter new items by reporting date threshold
 * Only keeps items with Reporting Date >= threshold
 */
function filterByReportingDate(newItems, latestDate) {
  if (!latestDate) return newItems; // No threshold, keep all

  const threshold = new Date(latestDate);

  return newItems.filter(item => {
    const itemDate = new Date(item['Reporting Date']);
    return itemDate >= threshold;
  });
}

/**
 * Get the latest reporting date from existing items
 * Returns null if no items
 */
function getLatestReportingDate(existingItems) {
  if (!existingItems || existingItems.length === 0) return null;

  // Assuming items are already sorted by reporting date (newest first)
  // Return the first item's reporting date
  return existingItems[0]['Reporting Date'];
}

/**
 * Merge new done items with existing items
 * - Filters new items by latest reporting date
 * - Removes duplicates (keeps newest)
 * - Sorts by reporting date descending
 */
function mergeDoneItems(newItems, existingItems) {
  if (!existingItems || existingItems.length === 0) {
    // No existing items, just sort new items
    return sortByReportingDate([...newItems]);
  }

  // Get latest reporting date from existing items
  const latestDate = getLatestReportingDate(existingItems);

  // Filter new items - only keep items >= latest date
  const filteredNewItems = filterByReportingDate(newItems, latestDate);

  console.log(`  → Filtered: ${filteredNewItems.length} of ${newItems.length} new items meet date threshold (>= ${latestDate})`);

  // Combine all items
  const allItems = [...filteredNewItems, ...existingItems];

  // Remove duplicates (keeps newest by reporting date)
  const uniqueItems = removeDuplicates(allItems);

  console.log(`  → Deduplicated: ${uniqueItems.length} unique items (removed ${allItems.length - uniqueItems.length} duplicates)`);

  // Sort by reporting date descending
  return sortByReportingDate(uniqueItems);
}

module.exports = {
  sortByReportingDate,
  removeDuplicates,
  filterByReportingDate,
  getLatestReportingDate,
  mergeDoneItems
};
