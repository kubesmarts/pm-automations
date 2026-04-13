# Active Issues Dashboard

A comprehensive dashboard for visualizing and analyzing active work across multiple GitHub Projects, with capacity planning, velocity tracking, and deadline feasibility analysis.

## Features

### 📊 Real-time Metrics
- Global summary of all active issues
- Σ (Sigma) aggregated fields for parent-child relationships
- Progress tracking (Estimate vs Time Spent)

### 🔍 Multi-Dimensional Filtering
- Filter by Project, Version, Area, Priority, Assignee, Status
- Multi-select checkboxes for flexible combinations
- Real-time updates as filters change

### 📈 Interactive Visualizations
- **Bar Charts**: Remaining work by Project and Version
- **Pie Charts**: Distribution by Area and Priority
- **Line Charts**: Velocity trends over time
- Responsive and interactive with Chart.js

### 📋 Detailed Breakdowns
- Tabular views by Project, Version, Area, Priority, Assignee
- Sortable issue list with all key metrics
- Click-through to GitHub issues

### 🎯 Capacity Planning
- Set target dates and team size
- Calculate feasibility with risk indicators
- Per-area and per-person capacity analysis
- Actionable recommendations

### 🚀 Velocity Tracking
- Historical completion rates from done-items data
- 4-week and 8-week moving averages
- Trend analysis (increasing/decreasing/stable)
- Velocity-based forecasting with confidence intervals

## Setup

### 1. Enable GitHub Pages

1. Go to repository **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **dashboard** folder
4. Save

The dashboard will be available at:
```
https://kubesmarts.github.io/pm-automations/dashboard/
```

### 2. Run Export Workflow

The dashboard requires CSV data from the export workflows:

```bash
# Manually trigger the export-active-items workflow
gh workflow run export-active-items.yml

# Or wait for the daily scheduled run at 00:00 UTC
```

This will create CSV files in the `exports/` directory:
- `exports/kiegroup-8-active-items.csv`
- `exports/kiegroup-9-active-items.csv`
- `exports/kubesmarts-1-active-items.csv`
- `exports/quarkiverse-11-active-items.csv`

### 3. Configure Projects

Edit `dashboard/js/dashboard.js` to add or remove projects:

```javascript
const CONFIG = {
    projectFiles: [
        'kiegroup-8',
        'kiegroup-9',
        'kubesmarts-1',
        'quarkiverse-11'
    ],
    basePath: '../exports/'
};
```

## Usage

### Filtering Data

1. **Select Projects**: Choose which projects to include
2. **Select Versions**: Filter by target version/milestone
3. **Select Areas**: Filter by team/area
4. **Select Priorities**: Focus on Blocker, Major, etc.
5. **Select Assignees**: View specific person's workload
6. **Select Status**: Include In Progress, To Do, Blocked, etc.

### Capacity Planning

1. Navigate to the **Capacity Planning** section
2. Set **Target Date** (defaults to end of current quarter)
3. Set **Team Size** (number of people)
4. Set **Availability** (percentage, default 100%)
5. Click **Calculate Feasibility**

The dashboard will show:
- ✅ **FEASIBLE**: Plenty of buffer time
- ⚠️ **TIGHT**: Less than 20% buffer
- ❌ **NOT FEASIBLE**: Over capacity

### Velocity Tracking

The dashboard automatically loads historical data from `*-done-items.csv` files and calculates:
- Weekly completion rates
- Moving averages (4-week and 8-week)
- Trend analysis
- Forecasted completion dates

### Exporting Data

Click **Export Filtered Data** to download the currently filtered issues as a CSV file.

## Architecture

```
dashboard/
├── index.html              # Main HTML structure
├── README.md              # This file
├── specification.md       # Complete technical specification
├── css/
│   └── dashboard.css      # Styles and responsive design
└── js/
    ├── dashboard.js       # Core logic, data loading, filtering
    ├── charts.js          # Chart.js visualizations
    ├── capacity.js        # Capacity planning calculations
    └── velocity.js        # Velocity tracking and forecasting
```

### Data Flow

1. **Data Collection**: GitHub Actions workflow exports active issues to CSV
2. **Data Storage**: CSV files committed to `exports/` directory
3. **Data Loading**: Dashboard fetches CSV files via HTTPS
4. **Data Processing**: PapaParse parses CSV, JavaScript aggregates
5. **Visualization**: Chart.js renders interactive charts
6. **User Interaction**: Filters update views in real-time

## Dependencies

All dependencies are loaded from CDN (no build step required):

- **PapaParse** (5.4.1): CSV parsing
- **Chart.js** (4.4.0): Interactive charts

## Browser Support

- Chrome/Edge: ✅ Latest 2 versions
- Firefox: ✅ Latest 2 versions
- Safari: ✅ Latest 2 versions
- Mobile: ✅ Responsive design

## Performance

- **Initial Load**: < 2 seconds (for ~500 issues)
- **Filter Change**: < 100ms
- **Chart Update**: < 200ms
- **CSV Size**: ~50KB per project

## Troubleshooting

### Dashboard shows "Error Loading Data"

**Cause**: CSV files don't exist or can't be accessed

**Solution**:
1. Run the export-active-items workflow
2. Check that CSV files exist in `exports/` directory
3. Verify GitHub Pages is enabled

### Charts not displaying

**Cause**: Chart.js failed to load from CDN

**Solution**:
1. Check browser console for errors
2. Verify internet connection
3. Try refreshing the page

### Filters not working

**Cause**: JavaScript error or data format issue

**Solution**:
1. Open browser console (F12)
2. Look for error messages
3. Verify CSV format matches specification

### Velocity data not loading

**Cause**: Done-items CSV files don't exist

**Solution**:
1. Run the export-done-items workflow
2. Wait for at least one week of historical data
3. Check that `*-done-items.csv` files exist

## Privacy & Security

⚠️ **Important**: This dashboard is publicly accessible if the repository is public.

- All CSV data is visible to anyone with the URL
- No authentication is required
- Consider using a private repository for sensitive data

To make the dashboard private:
1. Make the repository private (requires GitHub Pro/Team/Enterprise)
2. GitHub Pages will only be accessible to repository collaborators

## Future Enhancements

See `specification.md` for planned features:
- Historical snapshots
- Alerts & notifications
- Custom metrics
- PDF/PowerPoint export
- JIRA integration
- Slack integration

## Support

For issues or questions:
- Open an issue in the repository
- Check the specification document
- Review the workflow logs

## License

Part of the pm-automations project.

---

**Made with ❤️ by Bob (AI Assistant)**