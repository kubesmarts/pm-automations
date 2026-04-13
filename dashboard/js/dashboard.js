// ============================================
// Dashboard Main JavaScript
// ============================================

// Global state
const state = {
    allIssues: [],
    filteredIssues: [],
    projects: new Map(), // Map of project key to project data
    filters: {
        projects: new Set(),
        versions: new Set(),
        areas: new Set(),
        priorities: new Set(),
        assignees: new Set(),
        statuses: new Set()
    },
    sortColumn: 'number',
    sortDirection: 'desc'
};

// Configuration
const CONFIG = {
    projectFiles: [
        'kiegroup-8',
        'kiegroup-9',
        'kubesmarts-1',
        'quarkiverse-11'
    ],
    basePath: '../exports/'
};

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadAllProjects();
        initializeFilters();
        initializeEventListeners();
        applyFilters();
        renderDashboard();
        hideLoading();
    } catch (error) {
        showError(error.message);
    }
});

// ============================================
// Data Loading
// ============================================

async function loadAllProjects() {
    const promises = CONFIG.projectFiles.map(projectKey => loadProjectData(projectKey));
    const results = await Promise.allSettled(promises);
    
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            const projectKey = CONFIG.projectFiles[index];
            state.projects.set(projectKey, result.value);
            state.allIssues.push(...result.value.issues);
        } else {
            console.error(`Failed to load ${CONFIG.projectFiles[index]}:`, result.reason);
        }
    });
    
    if (state.allIssues.length === 0) {
        throw new Error('No project data could be loaded. Please check that CSV files exist in the exports directory.');
    }
    
    // Update last updated time
    const now = new Date();
    document.getElementById('lastUpdated').textContent = now.toLocaleString();
}

async function loadProjectData(projectKey) {
    const csvPath = `${CONFIG.basePath}${projectKey}-active-items.csv`;
    
    try {
        const response = await fetch(csvPath);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const csvText = await response.text();
        const parsed = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true
        });
        
        if (parsed.errors.length > 0) {
            console.warn(`Parsing warnings for ${projectKey}:`, parsed.errors);
        }
        
        // Fetch project title from GitHub API
        const [org, number] = projectKey.split('-');
        let projectTitle = projectKey; // Fallback to key
        
        try {
            const projectInfo = await fetchProjectTitle(org, number);
            projectTitle = projectInfo.title || projectKey;
        } catch (e) {
            console.warn(`Could not fetch project title for ${projectKey}:`, e);
        }
        
        // Process issues
        const issues = parsed.data.map(row => ({
            ...row,
            project: projectKey,
            projectTitle: projectTitle,
            'Issue Number': parseInt(row['Issue Number']) || 0,
            'Estimate': parseFloat(row['Estimate']) || 0,
            'Time Spent': parseFloat(row['Time Spent']) || 0,
            'Remaining Work': parseFloat(row['Remaining Work']) || 0,
            'Σ Estimate': parseFloat(row['Σ Estimate']) || 0,
            'Σ Time Spent': parseFloat(row['Σ Time Spent']) || 0,
            'Σ Remaining Work': parseFloat(row['Σ Remaining Work']) || 0,
            'Assignees': row['Assignees'] || '',
            'Status': row['Status'] || '',
            'Area': row['Area'] || '',
            'Priority': row['Priority'] || '',
            'Version': row['Version'] || ''
        }));
        
        return {
            key: projectKey,
            title: projectTitle,
            issues: issues
        };
    } catch (error) {
        throw new Error(`Failed to load ${projectKey}: ${error.message}`);
    }
}

async function fetchProjectTitle(org, number) {
    // This would require authentication for private repos
    // For now, return a placeholder
    // In production, you'd use: gh api graphql with proper query
    return {
        title: `${org} Project #${number}`
    };
}

// ============================================
// Filters
// ============================================

function initializeFilters() {
    const projects = new Set();
    const versions = new Set();
    const areas = new Set();
    const priorities = new Set();
    const assignees = new Set();
    const statuses = new Set();
    
    state.allIssues.forEach(issue => {
        projects.add(issue.projectTitle);
        if (issue.Version) versions.add(issue.Version);
        if (issue.Area) areas.add(issue.Area);
        if (issue.Priority) priorities.add(issue.Priority);
        if (issue.Status) statuses.add(issue.Status);
        
        // Split assignees by comma
        if (issue.Assignees) {
            issue.Assignees.split(',').forEach(a => {
                const assignee = a.trim();
                if (assignee) assignees.add(assignee);
            });
        }
    });
    
    // Render filter checkboxes
    renderFilterGroup('projectFilters', Array.from(projects).sort(), 'projects');
    renderFilterGroup('versionFilters', Array.from(versions).sort(), 'versions');
    renderFilterGroup('areaFilters', Array.from(areas).sort(), 'areas');
    renderFilterGroup('priorityFilters', Array.from(priorities).sort(), 'priorities');
    renderFilterGroup('assigneeFilters', Array.from(assignees).sort(), 'assignees');
    renderFilterGroup('statusFilters', Array.from(statuses).sort(), 'statuses');
}

function renderFilterGroup(containerId, items, filterKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Add "All" checkbox
    const allCheckbox = createCheckbox('all', 'All', true, () => {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:not([value="all"])');
        checkboxes.forEach(cb => {
            cb.checked = allCheckbox.checked;
            if (allCheckbox.checked) {
                state.filters[filterKey].add(cb.value);
            } else {
                state.filters[filterKey].delete(cb.value);
            }
        });
        applyFilters();
    });
    container.appendChild(allCheckbox);
    
    // Add individual checkboxes
    items.forEach(item => {
        const checkbox = createCheckbox(item, item, true, (checked) => {
            if (checked) {
                state.filters[filterKey].add(item);
            } else {
                state.filters[filterKey].delete(item);
                allCheckbox.querySelector('input').checked = false;
            }
            applyFilters();
        });
        container.appendChild(checkbox);
        state.filters[filterKey].add(item);
    });
}

function createCheckbox(value, label, checked, onChange) {
    const labelEl = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = value;
    input.checked = checked;
    input.addEventListener('change', (e) => onChange(e.target.checked));
    
    labelEl.appendChild(input);
    labelEl.appendChild(document.createTextNode(label));
    return labelEl;
}

function applyFilters() {
    state.filteredIssues = state.allIssues.filter(issue => {
        // Project filter
        if (state.filters.projects.size > 0 && !state.filters.projects.has(issue.projectTitle)) {
            return false;
        }
        
        // Version filter
        if (state.filters.versions.size > 0 && !state.filters.versions.has(issue.Version)) {
            return false;
        }
        
        // Area filter
        if (state.filters.areas.size > 0 && !state.filters.areas.has(issue.Area)) {
            return false;
        }
        
        // Priority filter
        if (state.filters.priorities.size > 0 && !state.filters.priorities.has(issue.Priority)) {
            return false;
        }
        
        // Status filter
        if (state.filters.statuses.size > 0 && !state.filters.statuses.has(issue.Status)) {
            return false;
        }
        
        // Assignee filter
        if (state.filters.assignees.size > 0) {
            const issueAssignees = issue.Assignees.split(',').map(a => a.trim());
            const hasMatch = issueAssignees.some(a => state.filters.assignees.has(a));
            if (!hasMatch) return false;
        }
        
        return true;
    });
    
    renderDashboard();
}

// ============================================
// Rendering
// ============================================

function renderDashboard() {
    renderSummary();
    renderBreakdowns();
    renderIssuesList();
    
    // Trigger chart updates
    if (window.updateCharts) {
        window.updateCharts(state.filteredIssues);
    }
}

function renderSummary() {
    const totalIssues = state.filteredIssues.length;
    const totalRemaining = state.filteredIssues.reduce((sum, i) => sum + i['Σ Remaining Work'], 0);
    const totalEstimate = state.filteredIssues.reduce((sum, i) => sum + i['Σ Estimate'], 0);
    const totalSpent = state.filteredIssues.reduce((sum, i) => sum + i['Σ Time Spent'], 0);
    const progress = totalEstimate > 0 ? (totalSpent / totalEstimate * 100) : 0;
    
    document.getElementById('totalIssues').textContent = totalIssues;
    document.getElementById('totalRemaining').textContent = `${totalRemaining.toFixed(1)} weeks`;
    document.getElementById('totalEstimate').textContent = `${totalEstimate.toFixed(1)} weeks`;
    document.getElementById('totalSpent').textContent = `${totalSpent.toFixed(1)} weeks`;
    document.getElementById('totalProgress').textContent = `${progress.toFixed(0)}%`;
}

function renderBreakdowns() {
    renderBreakdownTable('projectTable', 'projectTitle', 'Project');
    renderBreakdownTable('versionTable', 'Version', 'Version');
    renderBreakdownTable('areaTable', 'Area', 'Area');
    renderBreakdownTable('priorityTable', 'Priority', 'Priority');
    renderAssigneeBreakdown();
}

function renderBreakdownTable(tableId, groupBy, label) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    // Group issues
    const groups = new Map();
    state.filteredIssues.forEach(issue => {
        const key = issue[groupBy] || '(none)';
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(issue);
    });
    
    // Calculate totals
    const totalRemaining = state.filteredIssues.reduce((sum, i) => sum + i['Σ Remaining Work'], 0);
    
    // Sort by remaining work descending
    const sorted = Array.from(groups.entries()).sort((a, b) => {
        const aSum = a[1].reduce((sum, i) => sum + i['Σ Remaining Work'], 0);
        const bSum = b[1].reduce((sum, i) => sum + i['Σ Remaining Work'], 0);
        return bSum - aSum;
    });
    
    // Render rows
    sorted.forEach(([key, issues]) => {
        const remaining = issues.reduce((sum, i) => sum + i['Σ Remaining Work'], 0);
        const estimate = issues.reduce((sum, i) => sum + i['Σ Estimate'], 0);
        const spent = issues.reduce((sum, i) => sum + i['Σ Time Spent'], 0);
        const progress = estimate > 0 ? (spent / estimate * 100) : 0;
        const percentage = totalRemaining > 0 ? (remaining / totalRemaining * 100) : 0;
        
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><strong>${escapeHtml(key)}</strong></td>
            <td>${issues.length}</td>
            <td>${remaining.toFixed(1)}w</td>
            <td>${estimate.toFixed(1)}w</td>
            <td>${progress.toFixed(0)}%</td>
            <td>${percentage.toFixed(1)}%</td>
        `;
    });
}

function renderAssigneeBreakdown() {
    const table = document.getElementById('assigneeTable');
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    // Group by assignee
    const assigneeMap = new Map();
    state.filteredIssues.forEach(issue => {
        const assignees = issue.Assignees ? issue.Assignees.split(',').map(a => a.trim()) : ['(unassigned)'];
        assignees.forEach(assignee => {
            if (!assignee) assignee = '(unassigned)';
            if (!assigneeMap.has(assignee)) {
                assigneeMap.set(assignee, { issues: [], areas: new Set() });
            }
            assigneeMap.get(assignee).issues.push(issue);
            if (issue.Area) assigneeMap.get(assignee).areas.add(issue.Area);
        });
    });
    
    // Sort by remaining work
    const sorted = Array.from(assigneeMap.entries()).sort((a, b) => {
        const aSum = a[1].issues.reduce((sum, i) => sum + i['Σ Remaining Work'], 0);
        const bSum = b[1].issues.reduce((sum, i) => sum + i['Σ Remaining Work'], 0);
        return bSum - aSum;
    });
    
    // Render rows
    sorted.forEach(([assignee, data]) => {
        const remaining = data.issues.reduce((sum, i) => sum + i['Σ Remaining Work'], 0);
        const estimate = data.issues.reduce((sum, i) => sum + i['Σ Estimate'], 0);
        const spent = data.issues.reduce((sum, i) => sum + i['Σ Time Spent'], 0);
        const progress = estimate > 0 ? (spent / estimate * 100) : 0;
        const areas = Array.from(data.areas).join(', ') || '(none)';
        
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><strong>${escapeHtml(assignee)}</strong></td>
            <td>${data.issues.length}</td>
            <td>${remaining.toFixed(1)}w</td>
            <td>${estimate.toFixed(1)}w</td>
            <td>${progress.toFixed(0)}%</td>
            <td>${escapeHtml(areas)}</td>
        `;
    });
}

function renderIssuesList() {
    const table = document.getElementById('issuesTable');
    if (!table) return;
    
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    document.getElementById('issueCount').textContent = state.filteredIssues.length;
    
    // Sort issues
    const sorted = [...state.filteredIssues].sort((a, b) => {
        let aVal = a[state.sortColumn];
        let bVal = b[state.sortColumn];
        
        // Handle numeric columns
        if (state.sortColumn === 'number' || state.sortColumn === 'remaining') {
            aVal = parseFloat(aVal) || 0;
            bVal = parseFloat(bVal) || 0;
        }
        
        if (state.sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
    
    // Render rows
    sorted.forEach(issue => {
        const progress = issue['Σ Estimate'] > 0 
            ? (issue['Σ Time Spent'] / issue['Σ Estimate'] * 100) 
            : 0;
        
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><a href="${issue['Issue URL']}" target="_blank">#${issue['Issue Number']}</a></td>
            <td>${escapeHtml(issue.Title)}</td>
            <td><span class="badge badge-${issue.Status.toLowerCase()}">${escapeHtml(issue.Status)}</span></td>
            <td>${escapeHtml(issue.Area)}</td>
            <td><span class="badge badge-${issue.Priority.toLowerCase()}">${escapeHtml(issue.Priority)}</span></td>
            <td>${escapeHtml(issue.Version)}</td>
            <td>${escapeHtml(issue.Assignees)}</td>
            <td>${issue['Σ Remaining Work'].toFixed(1)}w</td>
            <td>${progress.toFixed(0)}%</td>
        `;
        
        row.addEventListener('click', () => {
            window.open(issue['Issue URL'], '_blank');
        });
    });
}

// ============================================
// Event Listeners
// ============================================

function initializeEventListeners() {
    // Clear filters button
    document.getElementById('clearFilters')?.addEventListener('click', () => {
        // Reset all filters
        Object.keys(state.filters).forEach(key => {
            state.filters[key].clear();
        });
        
        // Re-initialize filters (will check all boxes)
        initializeFilters();
        applyFilters();
    });
    
    // Export filtered data
    document.getElementById('exportFiltered')?.addEventListener('click', exportFilteredData);
    
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            switchTab(tabName);
        });
    });
    
    // Table sorting
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            if (state.sortColumn === column) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortColumn = column;
                state.sortDirection = 'desc';
            }
            
            // Update UI
            document.querySelectorAll('.sortable').forEach(t => {
                t.classList.remove('asc', 'desc');
            });
            th.classList.add(state.sortDirection);
            
            renderIssuesList();
        });
    });
}

function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
    
    // Update panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`)?.classList.add('active');
}

function exportFilteredData() {
    const csv = Papa.unparse(state.filteredIssues);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filtered-issues-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// Utility Functions
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
}

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}

// Export state for other modules
window.dashboardState = state;

// Made with Bob
