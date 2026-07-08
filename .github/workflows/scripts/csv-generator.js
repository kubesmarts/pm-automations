const fs = require('fs');
const path = require('path');

/**
 * Escape CSV field value
 * - Wrap in quotes if contains comma, quote, or newline
 * - Double any quotes inside
 */
function escapeCSVField(value) {
  if (value == null) return '';

  const stringValue = String(value);

  // Check if field needs escaping
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV(data, columns) {
  if (!data || data.length === 0) return '';

  const rows = [];

  // Header row
  rows.push(columns.join(','));

  // Data rows
  for (const item of data) {
    const values = columns.map(col => escapeCSVField(item[col]));
    rows.push(values.join(','));
  }

  return rows.join('\n');
}

/**
 * Active items CSV columns
 */
const ACTIVE_ITEMS_COLUMNS = [
  'Issue Number',
  'Parent Issue',
  'Issue URL',
  'Title',
  'Assignees',
  'Status',
  'Type',
  'Area',
  'Priority',
  'Initiative',
  'Target Milestone',
  'Size',
  'Estimate',
  'Time Spent',
  'Remaining Work',
  'Σ Estimate',
  'Σ Time Spent',
  'Σ Remaining Work',
  'External Reference',
  'Comments',
  'Alerts'
];

/**
 * Done items CSV columns
 */
const DONE_ITEMS_COLUMNS = [
  'Issue Number',
  'Parent Issue',
  'Issue URL',
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
  'Reporting Date',
  'External Reference',
  'Comments'
];

/**
 * Generate active items CSV for a project
 * Completely replaces any existing file
 */
function generateActiveItemsCSV(issues, projectKey) {
  if (!issues || issues.length === 0) return null;

  const csvData = arrayToCSV(issues, ACTIVE_ITEMS_COLUMNS);
  const fileName = `${projectKey.toLowerCase()}-active-items.csv`;

  return {
    fileName,
    content: csvData,
    count: issues.length
  };
}

/**
 * Generate done items CSV for a project
 * Returns new items only (merging handled separately)
 */
function generateDoneItemsData(issues) {
  if (!issues || issues.length === 0) return null;

  return {
    items: issues,
    count: issues.length
  };
}

/**
 * Write CSV file to exports directory
 */
function writeCSV(exportsDir, fileName, content) {
  // Ensure exports directory exists
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  const filePath = path.join(exportsDir, fileName);
  fs.writeFileSync(filePath, content, 'utf-8');

  return filePath;
}

/**
 * Read existing CSV file from exports directory
 * Returns array of row objects
 */
function readExistingCSV(exportsDir, fileName, columns) {
  const filePath = path.join(exportsDir, fileName);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length <= 1) {
      return []; // Only header or empty
    }

    const items = [];

    // Skip header (line 0), parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values = parseCSVLine(line);

      if (values.length !== columns.length) {
        console.warn(`Warning: Line ${i + 1} has ${values.length} columns, expected ${columns.length}`);
        continue;
      }

      const item = {};
      columns.forEach((col, idx) => {
        item[col] = values[idx];
      });

      items.push(item);
    }

    return items;
  } catch (error) {
    console.warn(`Warning: Failed to read existing CSV ${fileName}: ${error.message}`);
    return null;
  }
}

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line) {
  const values = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = i < line.length - 1 ? line[i + 1] : null;

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        currentValue += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // Field separator
      values.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  // Push last value
  values.push(currentValue);

  return values;
}

module.exports = {
  escapeCSVField,
  arrayToCSV,
  generateActiveItemsCSV,
  generateDoneItemsData,
  writeCSV,
  readExistingCSV,
  parseCSVLine,
  ACTIVE_ITEMS_COLUMNS,
  DONE_ITEMS_COLUMNS
};
