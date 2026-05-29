#!/bin/bash

set -e

echo "Cleaning up duplicate entries in export CSV files..."
echo "===================================================="

EXPORT_DIR="exports"
AFFECTED_FILES=(
  "kiegroup-8-done-items.csv"
  "kiegroup-9-done-items.csv"
  "kubesmarts-1-done-items.csv"
  "quarkiverse-11-done-items.csv"
)

for filename in "${AFFECTED_FILES[@]}"; do
  filepath="$EXPORT_DIR/$filename"

  if [ ! -f "$filepath" ]; then
    echo "⚠️  Skipping $filename (not found)"
    continue
  fi

  echo ""
  echo "Processing: $filename"

  # Count duplicates before cleanup
  BEFORE_COUNT=$(tail -n +2 "$filepath" | wc -l)
  DUP_COUNT=$(tail -n +2 "$filepath" | python3 -c "
import csv, sys
from collections import defaultdict
urls = defaultdict(int)
for row in csv.reader(sys.stdin):
    if len(row) >= 3:
        urls[row[2]] += 1
print(sum(1 for count in urls.values() if count > 1))
")

  # Deduplicate
  TEMP_FILE=$(mktemp)

  python3 -c "
import csv
import sys

# Read header
with open('$filepath', 'r') as f:
    reader = csv.reader(f)
    header = next(reader)

    # Read and deduplicate data
    url_map = {}
    for row in reader:
        if len(row) >= 14:
            url = row[2]  # Issue URL
            reporting_date = row[13]  # Reporting Date

            # Keep entry with newest Reporting Date
            if url not in url_map or reporting_date > url_map[url][13]:
                url_map[url] = row

    # Write deduplicated CSV
    with open('$TEMP_FILE', 'w', newline='') as out:
        writer = csv.writer(out)
        writer.writerow(header)
        for row in sorted(url_map.values(), key=lambda x: x[13], reverse=True):
            writer.writerow(row)
"

  mv "$TEMP_FILE" "$filepath"

  # Count after cleanup
  AFTER_COUNT=$(tail -n +2 "$filepath" | wc -l)
  REMOVED_COUNT=$((BEFORE_COUNT - AFTER_COUNT))

  echo "  ✓ Removed $REMOVED_COUNT duplicate row(s) ($DUP_COUNT duplicate URLs)"
  echo "  Before: $BEFORE_COUNT rows | After: $AFTER_COUNT rows"
done

echo ""
echo "===================================================="
echo "Cleanup complete!"
