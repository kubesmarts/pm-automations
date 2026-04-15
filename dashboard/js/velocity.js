// ============================================
// Velocity Tracking Module - v2.0 (Cache Bust)
// ============================================

// Configuration
const VELOCITY_CONFIG = {
    projectMapping: {
        'kiegroup-8': 'kiegroup:8',
        'kiegroup-9': 'kiegroup:9',
        'kubesmarts-1': 'kubesmarts:1',
        'quarkiverse-11': 'quarkiverse:11'
    },
    basePath: '../exports/',
    weeksToAnalyze: null // null = show all available data
};

let velocityData = null;
let allDoneItemsCache = null;

// Expose module data for performance module
window.velocityModule = {
    get allDoneItemsCache() { return allDoneItemsCache; },
    get projectMapping() { return VELOCITY_CONFIG.projectMapping; }
};

// Initialize velocity tracking
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Add timeout to prevent hanging (increased to 10 seconds)
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout loading velocity data (10s)')), 10000)
        );
        
        await Promise.race([loadVelocityData(), timeoutPromise]);
        
        // Check if we actually have data
        if (!velocityData || !allDoneItemsCache || allDoneItemsCache.length === 0) {
            throw new Error('No velocity data loaded');
        }
        
        renderVelocitySummary();
        if (window.createVelocityChart) {
            window.createVelocityChart(prepareVelocityChartData());
        }
        
        // Dispatch event to notify other modules that velocity data is ready
        window.dispatchEvent(new CustomEvent('velocityDataLoaded'));
        console.log('Velocity data loaded successfully:', allDoneItemsCache.length, 'items');
    } catch (error) {
        console.error('Failed to load velocity data:', error);
        console.error('Error details:', error.message, error.stack);
        const summaryEl = document.getElementById('velocitySummary');
        if (summaryEl) {
            summaryEl.innerHTML =
                '<p class="text-muted">Historical velocity data not available. Capacity planning will work with current active issues.</p>';
        }
        
        // Hide the velocity chart if it exists
        const chartContainer = document.querySelector('.velocity-chart-container');
        if (chartContainer) {
            chartContainer.style.display = 'none';
        }
    }
});

// Listen for filter changes
if (typeof window !== 'undefined') {
    window.addEventListener('filtersChanged', () => {
        updateVelocityForFilters();
    });
}

// ============================================
// Load Historical Data
// ============================================

async function loadVelocityData() {
    const projectKeys = Object.keys(VELOCITY_CONFIG.projectMapping);
    const promises = projectKeys.map(projectKey => loadDoneItems(projectKey));
    const results = await Promise.allSettled(promises);
    
    allDoneItemsCache = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            allDoneItemsCache.push(...result.value);
        } else {
            console.warn(`Failed to load done items for ${projectKeys[index]}:`, result.reason);
        }
    });
    
    console.log('Total items loaded into cache:', allDoneItemsCache.length);
    
    if (allDoneItemsCache.length === 0) {
        throw new Error('No historical data available');
    }
    
    console.log('Calling calculateVelocity with', allDoneItemsCache.length, 'items');
    velocityData = calculateVelocity(allDoneItemsCache);
    console.log('calculateVelocity returned:', velocityData ? 'data object' : 'null/undefined');
    
    if (!velocityData) {
        throw new Error('calculateVelocity returned no data');
    }
}

// Update velocity based on current filters
function updateVelocityForFilters() {
    if (!allDoneItemsCache || !window.dashboardState) {
        // If no velocity data available, show message
        const summaryEl = document.getElementById('velocitySummary');
        if (summaryEl && !allDoneItemsCache) {
            summaryEl.innerHTML =
                '<p class="text-muted">Historical velocity data not available. Capacity planning will work with current active issues.</p>';
        }
        return;
    }
    
    const selectedProjects = window.dashboardState.filters.projects;
    
    // Filter done items by selected projects
    // If no projects selected, show all data (don't filter)
    let filteredItems = allDoneItemsCache;
    if (selectedProjects && selectedProjects.size > 0) {
        // Get the dashboard CONFIG for project name mapping
        const dashboardConfig = window.dashboardState.CONFIG || {};
        const projectNames = dashboardConfig.projectNames || {};
        
        // Convert project titles back to project IDs for filtering
        const projectTitles = Array.from(selectedProjects);
        const projectIds = [];
        
        projectTitles.forEach(title => {
            // Find the project ID from the title
            for (const [key, mappedTitle] of Object.entries(projectNames)) {
                if (mappedTitle === title) {
                    const projectId = VELOCITY_CONFIG.projectMapping[key];
                    if (projectId) {
                        projectIds.push(projectId);
                    }
                }
            }
        });
        
        console.log('Filtering velocity by projects:', projectTitles, '-> IDs:', projectIds);
        
        filteredItems = allDoneItemsCache.filter(item => {
            return projectIds.includes(item.Project);
        });
        
        console.log('Filtered items count:', filteredItems.length, 'from', allDoneItemsCache.length);
    }
    
    if (filteredItems.length === 0) {
        document.getElementById('velocitySummary').innerHTML =
            '<p class="text-muted">No velocity data available for selected projects.</p>';
        const titleElement = document.getElementById('velocityTitle');
        if (titleElement) {
            titleElement.textContent = 'Team Velocity';
        }
        // Clear the chart
        if (window.createVelocityChart) {
            window.createVelocityChart({ weeks: [], values: [], average: [] });
        }
        return;
    }
    
    velocityData = calculateVelocity(filteredItems);
    renderVelocitySummary();
    
    // Update the chart with new data
    if (window.createVelocityChart) {
        const chartData = prepareVelocityChartData();
        console.log('Updating velocity chart with data:', chartData);
        window.createVelocityChart(chartData);
    }
}

async function loadDoneItems(projectKey) {
    const csvPath = `${VELOCITY_CONFIG.basePath}${projectKey}-done-items.csv`;
    const projectId = VELOCITY_CONFIG.projectMapping[projectKey];
    
    console.log(`Loading done items from: ${csvPath}`);
    
    try {
        const response = await fetch(csvPath);
        if (!response.ok) {
            console.error(`Failed to fetch ${csvPath}: HTTP ${response.status}`);
            throw new Error(`HTTP ${response.status}`);
        }
        
        const csvText = await response.text();
        console.log(`Loaded CSV for ${projectKey}, length: ${csvText.length} bytes`);
        
        const parsed = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true
        });
        
        console.log(`Parsed ${parsed.data.length} rows for ${projectKey}`);
        
        return parsed.data.map(row => ({
            ...row,
            'Time Spent': parseFloat(row['Time Spent']) || 0,
            'Reporting Date': row['Reporting Date'] || '',
            'Project': projectId // Add project identifier
        }));
    } catch (error) {
        console.error(`Could not load ${projectKey} done items from ${csvPath}:`, error);
        return [];
    }
}

// ============================================
// Calculate Velocity Metrics
// ============================================

function calculateVelocity(doneItems) {
    console.log('>>> calculateVelocity ENTRY POINT with', doneItems ? doneItems.length : 'null', 'items');
    try {
        console.log('>>> Inside try block');
        
        // Group by week
        const weeklyData = new Map();
        
        // Sample first few items to see their structure
        if (doneItems.length > 0) {
            console.log('Sample item:', {
                'Reporting Date': doneItems[0]['Reporting Date'],
                'Time Spent': doneItems[0]['Time Spent'],
                'Time Spent type': typeof doneItems[0]['Time Spent']
            });
        }
        
        let skippedCount = 0;
        let processedCount = 0;
        
            doneItems.forEach(item => {
                // Only skip if Reporting Date is missing or Time Spent is not a number
                // Allow Time Spent of 0 (it's valid data)
                if (!item['Reporting Date'] || item['Time Spent'] === undefined || item['Time Spent'] === null) {
                    skippedCount++;
                    return;
                }
                
                const date = new Date(item['Reporting Date']);
                if (isNaN(date.getTime())) {
                    skippedCount++;
                    return;
                }
                
                processedCount++;
                
                // Get week start (Monday)
                const weekStart = getWeekStart(date);
                const weekKey = weekStart.toISOString().split('T')[0];
                
                if (!weeklyData.has(weekKey)) {
                    weeklyData.set(weekKey, {
                        date: weekStart,
                        timeSpent: 0,
                        items: []
                    });
                }
                
                const week = weeklyData.get(weekKey);
                week.timeSpent += item['Time Spent'];
                week.items.push(item);
            });
            
            console.log('Processed', processedCount, 'items, skipped', skippedCount, 'items');
    
        // Sort by date and get weeks (all if weeksToAnalyze is null)
        const sortedWeeks = Array.from(weeklyData.entries())
            .sort((a, b) => a[1].date - b[1].date);
        
        console.log('Weekly data calculated:', weeklyData.size, 'weeks');
        
        const weeksToShow = VELOCITY_CONFIG.weeksToAnalyze
            ? sortedWeeks.slice(-VELOCITY_CONFIG.weeksToAnalyze)
            : sortedWeeks;
        
        if (weeksToShow.length === 0) {
            console.warn('No weeks with valid data found. Processed:', processedCount, 'Skipped:', skippedCount);
            return null;
        }
        
        console.log('Weeks to show:', weeksToShow.length);
        
        // Calculate moving averages
        const velocities = weeksToShow.map(([key, data]) => data.timeSpent);
        const movingAvg4 = calculateMovingAverage(velocities, 4);
        const movingAvg8 = calculateMovingAverage(velocities, 8);
        
        // Calculate trend
        const recent4 = velocities.slice(-4);
        const previous4 = velocities.slice(-8, -4);
        const avg4 = average(recent4);
        const avgPrev4 = average(previous4);
        const trend = avgPrev4 > 0 ? ((avg4 - avgPrev4) / avgPrev4 * 100) : 0;
        
        // Calculate standard deviation
        const stdDev = standardDeviation(recent4);
    
        return {
            weeks: weeksToShow,
            velocities: velocities,
            movingAvg4: movingAvg4,
            movingAvg8: movingAvg8,
            currentAvg: avg4,
            trend: trend,
            stdDev: stdDev,
            totalWeeks: weeksToShow.length
        };
    } catch (error) {
        console.error('Error in calculateVelocity:', error);
        console.error('Error stack:', error.stack);
        return null;
    }
}

// ============================================
// Render Velocity Summary
// ============================================

function renderVelocitySummary() {
    const container = document.getElementById('velocitySummary');
    if (!container || !velocityData) return;
    
    const recent4Weeks = velocityData.weeks.slice(-4);
    const trendIcon = velocityData.trend > 5 ? '↗️' : velocityData.trend < -5 ? '↘️' : '→';
    const trendText = velocityData.trend > 5 ? 'Increasing' : velocityData.trend < -5 ? 'Decreasing' : 'Stable';
    const trendClass = velocityData.trend > 5 ? 'text-success' : velocityData.trend < -5 ? 'text-danger' : 'text-muted';
    
    // Update title with period info
    const titleElement = document.getElementById('velocityTitle');
    if (titleElement) {
        titleElement.textContent = `Team Velocity (${velocityData.totalWeeks} weeks)`;
    }
    
    let html = '<div class="velocity-metrics">';
    
    // Recent weeks
    html += '<h4>Recent 4 Weeks</h4>';
    html += '<ul class="velocity-list">';
    recent4Weeks.forEach(([key, data]) => {
        const weekLabel = formatWeekLabel(data.date);
        html += `<li>Week of ${weekLabel}: <strong>${data.timeSpent.toFixed(1)} weeks</strong> completed</li>`;
    });
    html += '</ul>';
    
    // Summary stats
    html += '<div class="velocity-stats mt-md">';
    html += `<div class="stat-row">
        <span class="stat-label">Average Velocity:</span>
        <span class="stat-value"><strong>${velocityData.currentAvg.toFixed(1)} weeks/week</strong></span>
    </div>`;
    html += `<div class="stat-row">
        <span class="stat-label">Trend:</span>
        <span class="stat-value ${trendClass}"><strong>${trendIcon} ${trendText} (${velocityData.trend > 0 ? '+' : ''}${velocityData.trend.toFixed(0)}%)</strong></span>
    </div>`;
    html += `<div class="stat-row">
        <span class="stat-label">Std Deviation:</span>
        <span class="stat-value">${velocityData.stdDev.toFixed(1)} weeks (±${(velocityData.stdDev / velocityData.currentAvg * 100).toFixed(0)}%)</span>
    </div>`;
    html += '</div>';
    
    html += '</div>';
    container.innerHTML = html;
}

// ============================================
// Render Forecast
// ============================================

function renderForecast(remainingWork, targetDate) {
    const container = document.getElementById('forecastContent');
    if (!container || !velocityData) {
        if (container) {
            container.innerHTML = '<p class="text-muted">Velocity data not available. Historical completion data is needed for forecasting.</p>';
        }
        return;
    }
    
    const avgVelocity = velocityData.currentAvg;
    const stdDev = velocityData.stdDev;
    
    // Calculate completion estimates
    const expectedWeeks = remainingWork / avgVelocity;
    const bestCaseWeeks = remainingWork / (avgVelocity + stdDev);
    const worstCaseWeeks = remainingWork / Math.max(0.1, avgVelocity - stdDev);
    
    const today = new Date();
    const expectedDate = new Date(today.getTime() + expectedWeeks * 7 * 24 * 60 * 60 * 1000);
    const bestCaseDate = new Date(today.getTime() + bestCaseWeeks * 7 * 24 * 60 * 60 * 1000);
    const worstCaseDate = new Date(today.getTime() + worstCaseWeeks * 7 * 24 * 60 * 60 * 1000);
    
    // Compare with target
    const target = new Date(targetDate);
    const bufferWeeks = (target - expectedDate) / (7 * 24 * 60 * 60 * 1000);
    
    let status, statusClass;
    if (bufferWeeks < 0) {
        status = '❌ AT RISK';
        statusClass = 'text-danger';
    } else if (bufferWeeks < 2) {
        status = '⚠️ TIGHT';
        statusClass = 'text-warning';
    } else {
        status = '✅ ON TRACK';
        statusClass = 'text-success';
    }
    
    let html = '<div class="forecast-results">';
    
    html += `<div class="forecast-summary">
        <div class="metric-row">
            <span class="metric-label">Remaining Work:</span>
            <span class="metric-value"><strong>${remainingWork.toFixed(1)} weeks</strong></span>
        </div>
        <div class="metric-row">
            <span class="metric-label">Average Velocity:</span>
            <span class="metric-value">${avgVelocity.toFixed(1)} weeks/week</span>
        </div>
        <div class="metric-row">
            <span class="metric-label">Estimated Completion:</span>
            <span class="metric-value"><strong>~${expectedWeeks.toFixed(1)} weeks (${formatDate(expectedDate)})</strong></span>
        </div>
    </div>`;
    
    html += '<div class="confidence-intervals mt-md">';
    html += '<h4>Confidence Intervals (based on velocity variance)</h4>';
    html += '<ul class="forecast-list">';
    html += `<li>• <strong>Best case (90th percentile):</strong> ${bestCaseWeeks.toFixed(1)} weeks (${formatDate(bestCaseDate)})</li>`;
    html += `<li>• <strong>Expected (50th percentile):</strong> ${expectedWeeks.toFixed(1)} weeks (${formatDate(expectedDate)})</li>`;
    html += `<li>• <strong>Worst case (10th percentile):</strong> ${worstCaseWeeks.toFixed(1)} weeks (${formatDate(worstCaseDate)})</li>`;
    html += '</ul>';
    html += '</div>';
    
    html += `<div class="forecast-status mt-md">
        <div class="metric-row">
            <span class="metric-label">Target Date:</span>
            <span class="metric-value">${formatDate(target)}</span>
        </div>
        <div class="metric-row">
            <span class="metric-label">Status:</span>
            <span class="metric-value ${statusClass}"><strong>${status}</strong></span>
        </div>
        <div class="metric-row">
            <span class="metric-label">Buffer:</span>
            <span class="metric-value ${statusClass}">
                ${bufferWeeks >= 0 ? `${bufferWeeks.toFixed(1)} weeks buffer` : `${Math.abs(bufferWeeks).toFixed(1)} weeks over`}
            </span>
        </div>
    </div>`;
    
    html += '</div>';
    container.innerHTML = html;
}

// Expose renderForecast globally for capacity module
window.renderForecast = renderForecast;

// ============================================
// Prepare Chart Data
// ============================================

function prepareVelocityChartData() {
    if (!velocityData) return { weeks: [], values: [], average: [] };
    
    const weeks = velocityData.weeks.map(([key, data]) => formatWeekLabel(data.date));
    const values = velocityData.velocities;
    const average = velocityData.movingAvg4;
    
    return { weeks, values, average };
}

// ============================================
// Utility Functions
// ============================================

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    return new Date(d.setDate(diff));
}

function formatWeekLabel(date) {
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
}

function formatDate(date) {
    return date.toLocaleDateString('default', { year: 'numeric', month: 'short', day: 'numeric' });
}

function calculateMovingAverage(values, window) {
    const result = [];
    for (let i = 0; i < values.length; i++) {
        const start = Math.max(0, i - window + 1);
        const slice = values.slice(start, i + 1);
        result.push(average(slice));
    }
    return result;
}

function average(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function standardDeviation(values) {
    if (values.length === 0) return 0;
    const avg = average(values);
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(average(squareDiffs));
}

// Export for use in capacity module
window.renderForecast = renderForecast;

// Made with Bob
