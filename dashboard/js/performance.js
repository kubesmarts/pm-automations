// ============================================
// Historic Performance Module
// ============================================

let performanceData = null;
let performanceCharts = {
    itemBurndown: null,
    workBurndown: null,
    weeklyVelocity: null,
    velocityComparison: null,
    accuracyTrend: null
};

// State for completed items table sorting
let completedItemsSortColumn = 'reportingDate';
let completedItemsSortDirection = 'desc';

// Initialize performance tracking
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadPerformanceData();
        renderPerformanceMetrics();
        createPerformanceCharts();
        renderCompletedItemsTable();
        initializeBreakdownTabs();
        initializeCompletedItemsSorting();
    } catch (error) {
        console.error('Failed to load performance data:', error);
    }
});

// Listen for velocity data to be loaded
if (typeof window !== 'undefined') {
    window.addEventListener('velocityDataLoaded', () => {
        console.log('Velocity data loaded, rendering performance breakdowns');
        renderPerformanceBreakdowns();
    });
    
    // Listen for filter changes
    window.addEventListener('filtersChanged', () => {
        updatePerformanceMetrics();
    });
}

// Expose completed items for export
window.getCompletedItems = function() {
    if (!window.velocityModule) return [];
    
    const filters = window.dashboardState?.filters;
    if (!filters) return window.velocityModule.allDoneItemsCache || [];
    
    let filteredItems = window.velocityModule.allDoneItemsCache || [];
    
    // Filter by selected projects (if any selected)
    if (filters.projects && filters.projects.size > 0) {
        const dashboardConfig = window.dashboardState.CONFIG || {};
        const projectNames = dashboardConfig.projectNames || {};
        const projectIds = [];
        
        Array.from(filters.projects).forEach(title => {
            for (const [key, mappedTitle] of Object.entries(projectNames)) {
                if (mappedTitle === title) {
                    const projectId = window.velocityModule.projectMapping[key];
                    if (projectId) projectIds.push(projectId);
                }
            }
        });
        
        filteredItems = filteredItems.filter(item => projectIds.includes(item.Project));
    }
    
    // Filter by versions
    if (filters.versions && filters.versions.size > 0) {
        filteredItems = filteredItems.filter(item =>
            filters.versions.has(item.Version)
        );
    }
    
    // Filter by areas
    if (filters.areas && filters.areas.size > 0) {
        filteredItems = filteredItems.filter(item =>
            filters.areas.has(item.Area)
        );
    }
    
    // Filter by priorities
    if (filters.priorities && filters.priorities.size > 0) {
        filteredItems = filteredItems.filter(item =>
            filters.priorities.has(item.Priority)
        );
    }
    
    // Filter by assignees
    if (filters.assignees && filters.assignees.size > 0) {
        filteredItems = filteredItems.filter(item => {
            if (!item.Assignees) return false;
            const itemAssignees = item.Assignees.split(',').map(a => a.trim());
            return itemAssignees.some(a => filters.assignees.has(a));
        });
    }
    
    return filteredItems;
};

// ============================================
// Load and Calculate Performance Data
// ============================================

async function loadPerformanceData() {
    // Reuse the done items cache from velocity module
    if (!window.velocityModule || !window.velocityModule.allDoneItemsCache) {
        console.warn('Velocity module data not available');
        return;
    }
    
    const allDoneItems = window.velocityModule.allDoneItemsCache;
    performanceData = calculatePerformanceMetrics(allDoneItems);
}

function calculatePerformanceMetrics(doneItems) {
    console.log('calculatePerformanceMetrics called with', doneItems.length, 'items');
    
    // Filter items with valid reporting date (completed items)
    // We keep all items with a reporting date, even if estimate/time spent are 0
    const validItems = doneItems.filter(item => item['Reporting Date']);
    
    console.log('After filtering for Reporting Date:', validItems.length, 'valid items');
    
    if (validItems.length === 0) {
        return null;
    }
    
    // Sort by reporting date
    validItems.sort((a, b) => {
        const dateA = new Date(a['Reporting Date']);
        const dateB = new Date(b['Reporting Date']);
        return dateA - dateB;
    });
    
    // Group by week
    const weeklyData = groupByWeek(validItems);
    
    // Calculate metrics
    const totalItems = validItems.length;
    const totalEstimate = validItems.reduce((sum, item) => sum + (parseFloat(item['Estimate']) || 0), 0);
    const totalTimeSpent = validItems.reduce((sum, item) => sum + (parseFloat(item['Time Spent']) || 0), 0);
    
    // Calculate velocities (work completed per week)
    const weeks = Array.from(weeklyData.keys()).sort();
    const estimateVelocities = [];
    const actualVelocities = [];
    const itemCounts = [];
    
    weeks.forEach(weekKey => {
        const weekData = weeklyData.get(weekKey);
        estimateVelocities.push(weekData.totalEstimate);
        actualVelocities.push(weekData.totalTimeSpent);
        itemCounts.push(weekData.items.length);
    });
    
    // Calculate overall velocity using the same method as breakdown table
    // Get all reporting dates for velocity calculation
    const allDates = validItems.map(item => new Date(item['Reporting Date'])).filter(d => !isNaN(d.getTime()));
    const avgEstimateVelocity = calculateMonthlyVelocity(allDates, totalEstimate);
    const avgActualVelocity = calculateMonthlyVelocity(allDates, totalTimeSpent);
    
    // Calculate estimation deviation (positive = under budget, negative = over budget)
    const deviations = validItems
        .filter(item => item['Estimate'] > 0 && item['Time Spent'] > 0)
        .map(item => {
            const estimate = parseFloat(item['Estimate']);
            const actual = parseFloat(item['Time Spent']);
            return ((estimate - actual) / estimate) * 100;
        });
    
    const avgDeviation = average(deviations);
    
    // Calculate weekly deviation trend
    const weeklyAccuracy = weeks.map(weekKey => {
        const weekData = weeklyData.get(weekKey);
        const weekItems = weekData.items.filter(item =>
            item['Estimate'] > 0 && item['Time Spent'] > 0
        );
        
        if (weekItems.length === 0) return 0;
        
        const weekDeviations = weekItems.map(item => {
            const estimate = parseFloat(item['Estimate']);
            const actual = parseFloat(item['Time Spent']);
            return ((estimate - actual) / estimate) * 100;
        });
        
        return average(weekDeviations);
    });
    
    // Calculate cumulative burndown
    let cumulativeItems = 0;
    let cumulativeWork = 0;
    const itemBurndown = [];
    const workBurndown = [];
    
    weeks.forEach(weekKey => {
        const weekData = weeklyData.get(weekKey);
        cumulativeItems += weekData.items.length;
        cumulativeWork += weekData.totalTimeSpent;
        itemBurndown.push(cumulativeItems);
        workBurndown.push(cumulativeWork);
    });
    
    return {
        totalItems,
        totalEstimate,
        totalTimeSpent,
        avgEstimateVelocity,
        avgActualVelocity,
        accuracy: avgDeviation, // This is actually deviation now
        weeks,
        weeklyData,
        estimateVelocities,
        actualVelocities,
        itemCounts,
        weeklyAccuracy, // This is actually weekly deviation now
        itemBurndown,
        workBurndown
    };
}

function groupByWeek(items) {
    const weeklyData = new Map();
    
    items.forEach(item => {
        const date = new Date(item['Reporting Date']);
        if (isNaN(date.getTime())) return;
        
        const weekStart = getWeekStart(date);
        const weekKey = weekStart.toISOString().split('T')[0];
        
        if (!weeklyData.has(weekKey)) {
            weeklyData.set(weekKey, {
                date: weekStart,
                items: [],
                totalEstimate: 0,
                totalTimeSpent: 0
            });
        }
        
        const week = weeklyData.get(weekKey);
        week.items.push(item);
        week.totalEstimate += parseFloat(item['Estimate']) || 0;
        week.totalTimeSpent += parseFloat(item['Time Spent']) || 0;
    });
    
    return weeklyData;
}

// ============================================
// Render Performance Metrics
// ============================================

function renderPerformanceMetrics() {
    const accuracyElement = document.getElementById('perfAccuracy');
    
    if (!performanceData) {
        document.getElementById('perfTotalItems').textContent = '0';
        document.getElementById('perfTotalWork').textContent = '0 weeks';
        document.getElementById('perfEstVelocity').textContent = '0 weeks/month';
        document.getElementById('perfActualVelocity').textContent = '0 weeks/month';
        accuracyElement.textContent = 'N/A';
        accuracyElement.style.color = '#9ca3af';
        return;
    }
    
    document.getElementById('perfTotalItems').textContent = performanceData.totalItems;
    document.getElementById('perfTotalWork').textContent = `${performanceData.totalTimeSpent.toFixed(1)} weeks`;
    // Velocities are already in weeks/month from calculateMonthlyVelocity
    document.getElementById('perfEstVelocity').textContent = `${performanceData.avgEstimateVelocity.toFixed(1)} weeks/month`;
    document.getElementById('perfActualVelocity').textContent = `${performanceData.avgActualVelocity.toFixed(1)} weeks/month`;
    
    // Display average deviation (positive = under budget, negative = over budget)
    const avgDeviation = performanceData.accuracy; // This is actually deviation now
    const deviationSign = avgDeviation > 0 ? '+' : '';
    accuracyElement.textContent = `${deviationSign}${avgDeviation.toFixed(1)}%`;
    
    // Color code deviation
    accuracyElement.style.color = getAccuracyColor(avgDeviation);
}

// ============================================
// Render Completed Items Table
// ============================================

function renderCompletedItemsTable() {
    const tbody = document.querySelector('#completedItemsTable tbody');
    if (!tbody) {
        console.warn('Completed items table tbody not found');
        return;
    }
    
    const completedItems = window.getCompletedItems();
    console.log('Rendering completed items, count:', completedItems.length);
    
    if (completedItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">No completed items found</td></tr>';
        return;
    }
    
    // Sort items based on current sort column and direction
    const sortedItems = sortCompletedItems([...completedItems]);
    
    tbody.innerHTML = sortedItems.map(item => {
        const estimate = parseFloat(item['Estimate']) || 0;
        const timeSpent = parseFloat(item['Time Spent']) || 0;
        const reportingDate = item['Reporting Date'] ? new Date(item['Reporting Date']).toLocaleDateString() : 'N/A';
        const assignees = item['Assignees'] || 'N/A';
        
        return `
            <tr>
                <td><a href="${item['Issue URL']}" target="_blank">${item['Issue Number']}</a></td>
                <td>${item['Title'] || 'N/A'}</td>
                <td>${getProjectName(item['Project'])}</td>
                <td>${item['Area'] || 'N/A'}</td>
                <td>${item['Version'] || 'N/A'}</td>
                <td>${assignees}</td>
                <td>${estimate.toFixed(1)} weeks</td>
                <td>${timeSpent.toFixed(1)} weeks</td>
                <td>${reportingDate}</td>
            </tr>
        `;
    }).join('');
}

function getProjectName(projectId) {
    const dashboardConfig = window.dashboardState?.CONFIG || {};
    const projectNames = dashboardConfig.projectNames || {};
    const projectMapping = window.velocityModule?.projectMapping || {};
    
    // Find the key that maps to this project ID
    for (const [key, id] of Object.entries(projectMapping)) {
        if (id === projectId) {
            return projectNames[key] || projectId;
        }
    }
    
    return projectId;
}

// ============================================
// Create Performance Charts
// ============================================

function createPerformanceCharts() {
    // Always call chart functions - they handle null data by destroying existing charts
    createItemBurndownChart();
    createWorkBurndownChart();
    createWeeklyVelocityChart();
    createVelocityComparisonChart();
    createAccuracyTrendChart();
}

function createItemBurndownChart() {
    const ctx = document.getElementById('itemBurndownChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (performanceCharts.itemBurndown) {
        performanceCharts.itemBurndown.destroy();
        performanceCharts.itemBurndown = null;
    }
    
    if (!performanceData) return;
    
    const labels = performanceData.weeks.map(w => formatWeekLabel(new Date(w)));
    
    if (performanceCharts.itemBurndown) {
        performanceCharts.itemBurndown.destroy();
    }
    
    performanceCharts.itemBurndown = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative Items Completed',
                data: performanceData.itemBurndown,
                borderColor: '#3b82f6',
                backgroundColor: '#3b82f620',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.parsed.y} items`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Items' }
                }
            }
        }
    });
}

function createWorkBurndownChart() {
    const ctx = document.getElementById('workBurndownChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (performanceCharts.workBurndown) {
        performanceCharts.workBurndown.destroy();
        performanceCharts.workBurndown = null;
    }
    
    if (!performanceData) return;
    
    const labels = performanceData.weeks.map(w => formatWeekLabel(new Date(w)));
    
    if (performanceCharts.workBurndown) {
        performanceCharts.workBurndown.destroy();
    }
    
    performanceCharts.workBurndown = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative Work Completed',
                data: performanceData.workBurndown,
                borderColor: '#10b981',
                backgroundColor: '#10b98120',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.parsed.y.toFixed(1)} weeks`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Work (weeks)' }
                }
            }
        }
    });
}

function createWeeklyVelocityChart() {
    const ctx = document.getElementById('weeklyVelocityChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (performanceCharts.weeklyVelocity) {
        performanceCharts.weeklyVelocity.destroy();
        performanceCharts.weeklyVelocity = null;
    }
    
    if (!performanceData) return;
    
    const labels = performanceData.weeks.map(w => formatWeekLabel(new Date(w)));
    
    performanceCharts.weeklyVelocity = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weeks Completed',
                data: performanceData.actualVelocities,
                backgroundColor: '#8b5cf6',
                borderColor: '#7c3aed',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.parsed.y.toFixed(1)} weeks completed`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Weeks Completed' }
                }
            }
        }
    });
}

function createVelocityComparisonChart() {
    const ctx = document.getElementById('velocityComparisonChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (performanceCharts.velocityComparison) {
        performanceCharts.velocityComparison.destroy();
        performanceCharts.velocityComparison = null;
    }
    
    if (!performanceData) return;
    
    const labels = performanceData.weeks.map(w => formatWeekLabel(new Date(w)));
    
    if (performanceCharts.velocityComparison) {
        performanceCharts.velocityComparison.destroy();
    }
    
    performanceCharts.velocityComparison = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Estimated Velocity',
                    data: performanceData.estimateVelocities,
                    backgroundColor: '#3b82f680',
                    borderColor: '#3b82f6',
                    borderWidth: 1
                },
                {
                    label: 'Actual Velocity',
                    data: performanceData.actualVelocities,
                    backgroundColor: '#10b98180',
                    borderColor: '#10b981',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: true, position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(1)} weeks`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Velocity (weeks/week)' }
                }
            }
        }
    });
}

function createAccuracyTrendChart() {
    const ctx = document.getElementById('accuracyTrendChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (performanceCharts.accuracyTrend) {
        performanceCharts.accuracyTrend.destroy();
        performanceCharts.accuracyTrend = null;
    }
    
    if (!performanceData) return;
    
    const labels = performanceData.weeks.map(w => formatWeekLabel(new Date(w)));
    
    if (performanceCharts.accuracyTrend) {
        performanceCharts.accuracyTrend.destroy();
    }
    
    performanceCharts.accuracyTrend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Estimation Deviation',
                data: performanceData.weeklyAccuracy, // This is actually deviation now
                borderColor: '#8b5cf6',
                backgroundColor: '#8b5cf620',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = context.parsed.y;
                            const sign = value > 0 ? '+' : '';
                            return `${sign}${value.toFixed(1)}% deviation`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Deviation (%)' }
                }
            }
        }
    });
}

// ============================================
// Update Performance Metrics (for filter changes)
// ============================================

function updatePerformanceMetrics() {
    if (!window.velocityModule || !window.velocityModule.allDoneItemsCache) return;
    
    const filters = window.dashboardState?.filters;
    let filteredItems = window.velocityModule.allDoneItemsCache || [];
    
    // Apply filters only if they exist and have selections
    if (filters) {
        // Filter by projects (if any selected)
        if (filters.projects && filters.projects.size > 0) {
            const dashboardConfig = window.dashboardState.CONFIG || {};
            const projectNames = dashboardConfig.projectNames || {};
            const projectIds = [];
            
            Array.from(filters.projects).forEach(title => {
                for (const [key, mappedTitle] of Object.entries(projectNames)) {
                    if (mappedTitle === title) {
                        const projectId = window.velocityModule.projectMapping[key];
                        if (projectId) projectIds.push(projectId);
                    }
                }
            });
            
            filteredItems = filteredItems.filter(item => projectIds.includes(item.Project));
        }
        
        // Filter by versions
        if (filters.versions && filters.versions.size > 0) {
            filteredItems = filteredItems.filter(item =>
                filters.versions.has(item.Version)
            );
        }
        
        // Filter by areas
        if (filters.areas && filters.areas.size > 0) {
            filteredItems = filteredItems.filter(item =>
                filters.areas.has(item.Area)
            );
        }
        
        // Filter by priorities
        if (filters.priorities && filters.priorities.size > 0) {
            filteredItems = filteredItems.filter(item =>
                filters.priorities.has(item.Priority)
            );
        }
        
        // Filter by assignees
        if (filters.assignees && filters.assignees.size > 0) {
            filteredItems = filteredItems.filter(item => {
                if (!item.Assignees) return false;
                const itemAssignees = item.Assignees.split(',').map(a => a.trim());
                return itemAssignees.some(a => filters.assignees.has(a));
            });
        }
    }
    
    performanceData = calculatePerformanceMetrics(filteredItems);
    renderPerformanceMetrics();
    createPerformanceCharts();
    renderCompletedItemsTable();
    renderPerformanceBreakdowns();
}

// Expose for main tab switching
window.updatePerformanceMetrics = updatePerformanceMetrics;

// ============================================
// Performance Breakdowns
// ============================================

function initializeBreakdownTabs() {
    // Handle performance breakdown tabs (in Historic Performance section)
    const perfTabButtons = document.querySelectorAll('.performance-breakdowns .tab-button');
    
    perfTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            
            // Update button states
            perfTabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update pane states
            const perfTabPanes = document.querySelectorAll('.performance-breakdowns .tab-pane');
            perfTabPanes.forEach(pane => pane.classList.remove('active'));
            
            const targetPane = document.getElementById(`${tabName}Tab`);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });
}

function renderPerformanceBreakdowns() {
    const completedItems = window.getCompletedItems();
    console.log('renderPerformanceBreakdowns called, items count:', completedItems.length);
    
    // Log first few items to see their project
    if (completedItems.length > 0) {
        console.log('Sample breakdown items:', completedItems.slice(0, 3).map(item => ({
            project: item.Project,
            timeSpent: item['Time Spent'],
            reportingDate: item['Reporting Date']
        })));
    }
    
    // Always render breakdowns (they will show "No data available" if empty)
    renderBreakdownByProject(completedItems);
    renderBreakdownByVersion(completedItems);
    renderBreakdownByArea(completedItems);
    renderBreakdownByPriority(completedItems);
    renderBreakdownByAssignee(completedItems);
}

function renderBreakdownByProject(items) {
    // Filter to only items with Reporting Date (same as summary metrics)
    const validItems = items.filter(item => item['Reporting Date']);
    const breakdown = validItems.length > 0 ? aggregateByField(validItems, 'Project', getProjectName) : [];
    renderPerformanceBreakdownTable('perfProjectTable', breakdown);
}

function renderBreakdownByVersion(items) {
    // Filter to only items with Reporting Date (same as summary metrics)
    const validItems = items.filter(item => item['Reporting Date']);
    const breakdown = validItems.length > 0 ? aggregateByField(validItems, 'Version') : [];
    renderPerformanceBreakdownTable('perfVersionTable', breakdown);
}

function renderBreakdownByArea(items) {
    // Filter to only items with Reporting Date (same as summary metrics)
    const validItems = items.filter(item => item['Reporting Date']);
    const breakdown = validItems.length > 0 ? aggregateByField(validItems, 'Area') : [];
    renderPerformanceBreakdownTable('perfAreaTable', breakdown);
}

function renderBreakdownByPriority(items) {
    // Filter to only items with Reporting Date (same as summary metrics)
    const validItems = items.filter(item => item['Reporting Date']);
    const breakdown = validItems.length > 0 ? aggregateByField(validItems, 'Priority') : [];
    renderPerformanceBreakdownTable('perfPriorityTable', breakdown);
}

function renderBreakdownByAssignee(items) {
    // Filter to only items with Reporting Date (same as summary metrics)
    const validItems = items.filter(item => item['Reporting Date']);
    const breakdown = validItems.length > 0 ? aggregateByField(validItems, 'Assignees') : [];
    renderPerformanceBreakdownTable('perfAssigneeTable', breakdown);
}

function aggregateByField(items, fieldName, nameMapper = null) {
    const aggregated = {};

    items.forEach(item => {
        let key = item[fieldName] || 'N/A';
        if (nameMapper) {
            key = nameMapper(key);
        }

        if (!aggregated[key]) {
            aggregated[key] = {
                name: key,
                count: 0,
                totalEstimate: 0,
                totalTimeSpent: 0,
                dates: []
            };
        }

        aggregated[key].count++;
        aggregated[key].totalEstimate += parseFloat(item['Estimate']) || 0;
        aggregated[key].totalTimeSpent += parseFloat(item['Time Spent']) || 0;
        
        // Track reporting dates for velocity calculation
        const reportingDate = item['Reporting Date'];
        if (reportingDate) {
            aggregated[key].dates.push(new Date(reportingDate));
        }
    });

    // Convert to array and sort by count descending
    return Object.values(aggregated).sort((a, b) => b.count - a.count);
}

function renderPerformanceBreakdownTable(tableId, breakdown) {
    console.log(`renderPerformanceBreakdownTable called for ${tableId}, breakdown type:`, typeof breakdown, 'isArray:', Array.isArray(breakdown));
    const tbody = document.querySelector(`#${tableId} tbody`);
    
    if (!tbody) {
        console.error(`Performance table tbody not found for #${tableId}`);
        return;
    }

    if (!Array.isArray(breakdown)) {
        console.error(`Performance breakdown is not an array for ${tableId}:`, breakdown);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">Error: Invalid data format</td></tr>';
        return;
    }

    if (breakdown.length === 0) {
        console.warn(`No performance breakdown data for ${tableId}`);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No data available</td></tr>';
        return;
    }

    console.log(`Rendering ${breakdown.length} rows for performance ${tableId}`);
    tbody.innerHTML = breakdown.map(item => {
        const deviation = calculateAccuracy(item.totalEstimate, item.totalTimeSpent);
        const deviationColor = getAccuracyColor(deviation);
        const deviationSign = deviation > 0 ? '+' : '';
        
        // Calculate velocity (weeks/month)
        const velocity = calculateMonthlyVelocity(item.dates, item.totalTimeSpent);
        const velocityDisplay = velocity > 0 ? `${velocity.toFixed(1)} weeks/month` : 'N/A';

        return `
            <tr>
                <td>${item.name}</td>
                <td>${item.count}</td>
                <td>${item.totalEstimate.toFixed(1)} weeks</td>
                <td>${item.totalTimeSpent.toFixed(1)} weeks</td>
                <td>${velocityDisplay}</td>
                <td style="color: ${deviationColor}; font-weight: 600;">${deviationSign}${deviation.toFixed(1)}%</td>
            </tr>
        `;
    }).join('');
}

function calculateMonthlyVelocity(dates, totalTimeSpent) {
    if (!dates || dates.length === 0 || totalTimeSpent === 0) return 0;
    
    // Find the date range
    const sortedDates = dates.sort((a, b) => a - b);
    const firstDate = sortedDates[0];
    const lastDate = sortedDates[sortedDates.length - 1];
    
    // Calculate number of weeks in the period
    const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksDuration = (lastDate - firstDate) / millisecondsPerWeek;
    
    // If all items completed in same week, use 1 week as minimum
    const effectiveWeeks = Math.max(weeksDuration, 1);
    
    // Calculate velocity: (total work / weeks) * 4.33 to get weeks/month
    const weeklyVelocity = totalTimeSpent / effectiveWeeks;
    const monthlyVelocity = weeklyVelocity * 4.33;
    
    return monthlyVelocity;
}

function calculateAccuracy(estimate, timeSpent) {
    if (estimate === 0 || timeSpent === 0) return 0;
    // Positive = under budget (good), Negative = over budget (bad)
    const deviation = ((estimate - timeSpent) / estimate) * 100;
    return deviation;
}

function getAccuracyColor(deviation) {
    // Negative = over budget (BAD) - always red
    if (deviation < 0) return '#ef4444'; // red - over budget
    
    // Positive = under budget (GOOD)
    // Green: 0-20% under (good estimation)
    // Yellow: 20-40% under (acceptable but conservative)
    // Red: >40% under (too conservative)
    if (deviation <= 20) return '#10b981'; // green - good estimation
    if (deviation <= 40) return '#f59e0b'; // orange - conservative
    return '#ef4444'; // red - too conservative
}

// ============================================
// Completed Items Table Sorting
// ============================================

function initializeCompletedItemsSorting() {
    const table = document.getElementById('completedItemsTable');
    if (!table) return;
    
    table.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (completedItemsSortColumn === column) {
                completedItemsSortDirection = completedItemsSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                completedItemsSortColumn = column;
                completedItemsSortDirection = 'desc';
            }
            
            // Update UI
            table.querySelectorAll('.sortable').forEach(t => {
                t.classList.remove('asc', 'desc');
            });
            th.classList.add(completedItemsSortDirection);
            
            renderCompletedItemsTable();
        });
    });
}

function sortCompletedItems(items) {
    return items.sort((a, b) => {
        let aVal, bVal;
        
        switch (completedItemsSortColumn) {
            case 'number':
                aVal = parseInt(a['Issue Number']) || 0;
                bVal = parseInt(b['Issue Number']) || 0;
                break;
            case 'title':
                aVal = (a['Title'] || '').toLowerCase();
                bVal = (b['Title'] || '').toLowerCase();
                break;
            case 'project':
                aVal = getProjectName(a['Project']).toLowerCase();
                bVal = getProjectName(b['Project']).toLowerCase();
                break;
            case 'area':
                aVal = (a['Area'] || '').toLowerCase();
                bVal = (b['Area'] || '').toLowerCase();
                break;
            case 'version':
                aVal = (a['Version'] || '').toLowerCase();
                bVal = (b['Version'] || '').toLowerCase();
                break;
            case 'assignees':
                aVal = (a['Assignees'] || '').toLowerCase();
                bVal = (b['Assignees'] || '').toLowerCase();
                break;
            case 'estimate':
                aVal = parseFloat(a['Estimate']) || 0;
                bVal = parseFloat(b['Estimate']) || 0;
                break;
            case 'timeSpent':
                aVal = parseFloat(a['Time Spent']) || 0;
                bVal = parseFloat(b['Time Spent']) || 0;
                break;
            case 'reportingDate':
                aVal = new Date(a['Reporting Date']).getTime() || 0;
                bVal = new Date(b['Reporting Date']).getTime() || 0;
                break;
            default:
                return 0;
        }
        
        if (aVal < bVal) return completedItemsSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return completedItemsSortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

// ============================================
// Utility Functions
// ============================================

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function formatWeekLabel(date) {
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
}

function average(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Made with Bob