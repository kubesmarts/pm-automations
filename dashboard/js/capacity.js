// ============================================
// Capacity Planning Module
// ============================================

// Initialize capacity planning
document.addEventListener('DOMContentLoaded', () => {
    initializeCapacityPlanning();
});

function initializeCapacityPlanning() {
    // Set default target date to end of current quarter
    const targetDateInput = document.getElementById('targetDate');
    if (targetDateInput) {
        targetDateInput.value = getEndOfQuarter();
    }
    
    // Add event listener to calculate button
    const calculateBtn = document.getElementById('calculateCapacity');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', calculateCapacity);
    }
}

// ============================================
// Calculate Capacity and Feasibility
// ============================================

function calculateCapacity() {
    const targetDate = document.getElementById('targetDate').value;
    const teamSize = parseInt(document.getElementById('teamSize').value) || 3;
    const availability = parseInt(document.getElementById('availability').value) || 100;
    
    if (!targetDate) {
        alert('Please select a target date');
        return;
    }
    
    // Get filtered issues from dashboard state
    const issues = window.dashboardState?.filteredIssues || [];
    
    if (issues.length === 0) {
        alert('No issues to analyze. Please adjust your filters.');
        return;
    }
    
    // Calculate metrics
    const totalRemaining = issues.reduce((sum, i) => sum + i['Remaining Work'], 0);
    const totalEstimate = issues.reduce((sum, i) => sum + i['Estimate'], 0);
    const totalSpent = issues.reduce((sum, i) => sum + i['Time Spent'], 0);
    
    // Calculate available time
    const today = new Date();
    const target = new Date(targetDate);
    const weeksAvailable = Math.max(0, (target - today) / (7 * 24 * 60 * 60 * 1000));
    
    // Calculate team capacity
    const effectiveAvailability = availability / 100;
    const teamCapacity = weeksAvailable * teamSize * effectiveAvailability;
    
    // Calculate buffer and utilization
    const buffer = teamCapacity - totalRemaining;
    const utilization = teamCapacity > 0 ? (totalRemaining / teamCapacity * 100) : 0;
    
    // Determine feasibility status
    let status, statusClass, riskLevel;
    if (buffer < 0) {
        status = '❌ NOT FEASIBLE';
        statusClass = 'at-risk';
        riskLevel = '🔴 HIGH RISK';
    } else if (buffer / teamCapacity < 0.2) {
        status = '⚠️ TIGHT';
        statusClass = 'tight';
        riskLevel = '🟡 MEDIUM RISK';
    } else {
        status = '✅ FEASIBLE';
        statusClass = 'feasible';
        riskLevel = '🟢 LOW RISK';
    }
    
    // Render results
    renderFeasibilityResults({
        status,
        statusClass,
        riskLevel,
        totalRemaining,
        weeksAvailable,
        teamSize,
        teamCapacity,
        buffer,
        utilization,
        issues,
        targetDate
    });
    
    // Show results section
    document.getElementById('capacityResults').style.display = 'block';
    
    // Render velocity-based forecast if available
    if (window.renderForecast) {
        window.renderForecast(totalRemaining, targetDate);
    }
}

// ============================================
// Render Feasibility Results
// ============================================

function renderFeasibilityResults(data) {
    const container = document.getElementById('feasibilityContent');
    if (!container) return;
    
    const bufferText = data.buffer >= 0 
        ? `with ${data.buffer.toFixed(1)} weeks buffer`
        : `${Math.abs(data.buffer).toFixed(1)} weeks over capacity`;
    
    container.innerHTML = `
        <div class="feasibility-summary">
            <div class="feasibility-status ${data.statusClass}">
                ${data.status}
            </div>
            <p class="mt-md"><strong>Risk Level:</strong> ${data.riskLevel}</p>
        </div>
        
        <div class="capacity-metrics mt-lg">
            <div class="metric-row">
                <span class="metric-label">Total Σ Remaining Work:</span>
                <span class="metric-value"><strong>${data.totalRemaining.toFixed(1)} weeks</strong></span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Available Time:</span>
                <span class="metric-value">${data.weeksAvailable.toFixed(1)} weeks (from today to ${data.targetDate})</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Team Size:</span>
                <span class="metric-value">${data.teamSize} people</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Team Capacity:</span>
                <span class="metric-value"><strong>${data.teamCapacity.toFixed(1)} weeks</strong> (${data.weeksAvailable.toFixed(1)} weeks × ${data.teamSize} people)</span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Buffer:</span>
                <span class="metric-value ${data.buffer < 0 ? 'text-danger' : 'text-success'}">
                    <strong>${bufferText}</strong>
                </span>
            </div>
            <div class="metric-row">
                <span class="metric-label">Utilization:</span>
                <span class="metric-value"><strong>${data.utilization.toFixed(0)}%</strong></span>
            </div>
        </div>
        
        <div class="capacity-breakdown mt-lg">
            <h4>Per-Area Capacity</h4>
            ${renderAreaCapacity(data.issues, data.weeksAvailable, data.teamSize)}
        </div>
        
        <div class="capacity-breakdown mt-lg">
            <h4>Per-Person Capacity</h4>
            ${renderPersonCapacity(data.issues, data.weeksAvailable)}
        </div>
        
        <div class="recommendations mt-lg">
            <h4>Recommendations</h4>
            ${generateRecommendations(data)}
        </div>
    `;
}

// ============================================
// Render Area Capacity Breakdown
// ============================================

function renderAreaCapacity(issues, weeksAvailable, teamSize) {
    // Group by area
    const areaMap = new Map();
    issues.forEach(issue => {
        const area = issue.Area || '(none)';
        if (!areaMap.has(area)) {
            areaMap.set(area, { remaining: 0, issues: [] });
        }
        const data = areaMap.get(area);
        data.remaining += issue['Remaining Work'];
        data.issues.push(issue);
    });
    
    // Sort by remaining work
    const sorted = Array.from(areaMap.entries()).sort((a, b) => b[1].remaining - a[1].remaining);
    
    let html = '<table class="breakdown-table"><thead><tr>';
    html += '<th>Area</th><th>Remaining</th><th>People</th><th>Capacity</th><th>Status</th>';
    html += '</tr></thead><tbody>';
    
    sorted.forEach(([area, data]) => {
        // Estimate people needed (rough allocation)
        const peopleNeeded = Math.ceil(data.remaining / weeksAvailable);
        const capacity = peopleNeeded * weeksAvailable;
        const utilization = capacity > 0 ? (data.remaining / capacity * 100) : 0;
        
        let status, statusClass;
        if (utilization > 80) {
            status = `⚠️ ${utilization.toFixed(0)}% used`;
            statusClass = 'text-warning';
        } else {
            status = `✅ ${(100 - utilization).toFixed(0)}% free`;
            statusClass = 'text-success';
        }
        
        html += `<tr>
            <td><strong>${escapeHtml(area)}</strong></td>
            <td>${data.remaining.toFixed(1)}w</td>
            <td>${peopleNeeded}</td>
            <td>${capacity.toFixed(1)}w</td>
            <td class="${statusClass}">${status}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

// ============================================
// Render Person Capacity Breakdown
// ============================================

function renderPersonCapacity(issues, weeksAvailable) {
    // Group by assignee
    const assigneeMap = new Map();
    issues.forEach(issue => {
        const assignees = issue.Assignees ? issue.Assignees.split(',').map(a => a.trim()) : ['(unassigned)'];
        assignees.forEach(assignee => {
            if (!assignee) assignee = '(unassigned)';
            if (!assigneeMap.has(assignee)) {
                assigneeMap.set(assignee, { remaining: 0, issues: [] });
            }
            const data = assigneeMap.get(assignee);
            data.remaining += issue['Remaining Work'];
            data.issues.push(issue);
        });
    });
    
    // Sort by remaining work
    const sorted = Array.from(assigneeMap.entries()).sort((a, b) => b[1].remaining - a[1].remaining);
    
    let html = '<table class="breakdown-table"><thead><tr>';
    html += '<th>Person</th><th>Remaining</th><th>Capacity</th><th>Utilization</th><th>Status</th>';
    html += '</tr></thead><tbody>';
    
    sorted.forEach(([assignee, data]) => {
        const capacity = weeksAvailable;
        const utilization = capacity > 0 ? (data.remaining / capacity * 100) : 0;
        
        let status, statusClass;
        if (assignee === '(unassigned)') {
            status = '❌ Needs assignment';
            statusClass = 'text-danger';
        } else if (utilization > 80) {
            status = '⚠️ Overloaded';
            statusClass = 'text-warning';
        } else if (utilization > 60) {
            status = '⚠️ High load';
            statusClass = 'text-warning';
        } else {
            status = '✅ Good';
            statusClass = 'text-success';
        }
        
        html += `<tr>
            <td><strong>${escapeHtml(assignee)}</strong></td>
            <td>${data.remaining.toFixed(1)}w</td>
            <td>${capacity.toFixed(1)}w</td>
            <td>${utilization.toFixed(0)}%</td>
            <td class="${statusClass}">${status}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}

// ============================================
// Generate Recommendations
// ============================================

function generateRecommendations(data) {
    const recommendations = [];
    
    // Check for unassigned work
    const unassignedWork = data.issues
        .filter(i => !i.Assignees || i.Assignees.trim() === '')
        .reduce((sum, i) => sum + i['Remaining Work'], 0);
    
    if (unassignedWork > 0) {
        recommendations.push(`Assign ${unassignedWork.toFixed(1)} weeks of unassigned work`);
    }
    
    // Check if more people are needed
    if (data.buffer < 0) {
        const additionalPeople = Math.ceil(Math.abs(data.buffer) / data.weeksAvailable);
        recommendations.push(`Add ${additionalPeople} more person(s) to the team`);
    }
    
    // Check utilization
    if (data.utilization > 90) {
        recommendations.push('Team is at >90% utilization - consider reducing scope or extending deadline');
    } else if (data.utilization > 80) {
        recommendations.push('Team is at >80% utilization - monitor workload closely');
    }
    
    // Check for high-priority items
    const blockers = data.issues.filter(i => i.Priority === 'Blocker');
    if (blockers.length > 0) {
        const blockerWork = blockers.reduce((sum, i) => sum + i['Remaining Work'], 0);
        recommendations.push(`Focus on ${blockers.length} Blocker item(s) (${blockerWork.toFixed(1)} weeks)`);
    }
    
    if (recommendations.length === 0) {
        recommendations.push('Current capacity looks good - continue monitoring progress');
    }
    
    return '<ul class="recommendations-list">' + 
           recommendations.map(r => `<li>${r}</li>`).join('') + 
           '</ul>';
}

// ============================================
// Utility Functions
// ============================================

function getEndOfQuarter() {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3);
    const endMonth = (quarter + 1) * 3;
    const endDate = new Date(now.getFullYear(), endMonth, 0);
    return endDate.toISOString().split('T')[0];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Made with Bob
