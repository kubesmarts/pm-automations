// ============================================
// Velocity Tracking Module
// ============================================

// Configuration
const VELOCITY_CONFIG = {
    doneItemsFiles: [
        'kiegroup-8',
        'kiegroup-9',
        'kubesmarts-1',
        'quarkiverse-11'
    ],
    basePath: '../exports/',
    weeksToAnalyze: 12
};

let velocityData = null;

// Initialize velocity tracking
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadVelocityData();
        renderVelocitySummary();
        if (window.createVelocityChart) {
            window.createVelocityChart(prepareVelocityChartData());
        }
    } catch (error) {
        console.error('Failed to load velocity data:', error);
        document.getElementById('velocitySummary').innerHTML = 
            '<p class="text-danger">Failed to load velocity data. Historical data may not be available.</p>';
    }
});

// ============================================
// Load Historical Data
// ============================================

async function loadVelocityData() {
    const promises = VELOCITY_CONFIG.doneItemsFiles.map(projectKey => loadDoneItems(projectKey));
    const results = await Promise.allSettled(promises);
    
    const allDoneItems = [];
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            allDoneItems.push(...result.value);
        } else {
            console.warn(`Failed to load done items for ${VELOCITY_CONFIG.doneItemsFiles[index]}:`, result.reason);
        }
    });
    
    if (allDoneItems.length === 0) {
        throw new Error('No historical data available');
    }
    
    velocityData = calculateVelocity(allDoneItems);
}

async function loadDoneItems(projectKey) {
    const csvPath = `${VELOCITY_CONFIG.basePath}${projectKey}-done-items.csv`;
    
    try {
        const response = await fetch(csvPath);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const csvText = await response.text();
        const parsed = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true
        });
        
        return parsed.data.map(row => ({
            ...row,
            'Time Spent': parseFloat(row['Time Spent']) || 0,
            'Reporting Date': row['Reporting Date'] || ''
        }));
    } catch (error) {
        console.warn(`Could not load ${projectKey} done items:`, error);
        return [];
    }
}

// ============================================
// Calculate Velocity Metrics
// ============================================

function calculateVelocity(doneItems) {
    // Group by week
    const weeklyData = new Map();
    
    doneItems.forEach(item => {
        if (!item['Reporting Date'] || !item['Time Spent']) return;
        
        const date = new Date(item['Reporting Date']);
        if (isNaN(date.getTime())) return;
        
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
    
    // Sort by date and get last N weeks
    const sortedWeeks = Array.from(weeklyData.entries())
        .sort((a, b) => a[1].date - b[1].date)
        .slice(-VELOCITY_CONFIG.weeksToAnalyze);
    
    // Calculate moving averages
    const velocities = sortedWeeks.map(([key, data]) => data.timeSpent);
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
        weeks: sortedWeeks,
        velocities: velocities,
        movingAvg4: movingAvg4,
        movingAvg8: movingAvg8,
        currentAvg: avg4,
        trend: trend,
        stdDev: stdDev
    };
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
    
    let html = '<div class="velocity-metrics">';
    
    // Recent weeks
    html += '<h4>Recent Weeks</h4>';
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
    if (!container || !velocityData) return;
    
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
