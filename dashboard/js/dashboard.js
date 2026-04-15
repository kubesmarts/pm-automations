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
    sortDirection: 'desc',
    CONFIG: null // Will be set to CONFIG after initialization
};

// Expose state globally for capacity and velocity modules
window.dashboardState = state;

// Configuration
const CONFIG = {
    projectFiles: [
        'kiegroup-8',
        'kiegroup-9',
        'kubesmarts-1',
        'quarkiverse-11'
    ],
    basePath: '../exports/',
    // Project name mapping
    projectNames: {
        'quarkiverse-11': 'Quarkus Flow',
        'kiegroup-8': 'Serverless Logic',
        'kiegroup-9': 'Drools & CaseHub',
        'kubesmarts-1': 'Kubesmarts Project'
    },
    // Projects to hide from dashboard
    hiddenProjects: ['kubesmarts-1']
};

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Expose CONFIG in state for other modules
    state.CONFIG = CONFIG;
    
    try {
        await loadAllProjects();
        initializeFilters();
        initializeEventListeners();
        initializeMainTabs();
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
            
            // Skip hidden projects
            if (CONFIG.hiddenProjects.includes(projectKey)) {
                console.log(`Skipping hidden project: ${projectKey}`);
                return;
            }
            
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
    const projectKey = `${org}-${number}`;
    
    // Check if we have a custom name mapping
    if (CONFIG.projectNames[projectKey]) {
        return { title: CONFIG.projectNames[projectKey] };
    }
    
    // Try to fetch the actual project title from GitHub API
    try {
        const response = await fetch(`https://api.github.com/orgs/${org}/projects`, {
            headers: {
                'Accept': 'application/vnd.github+json'
            }
        });
        
        if (response.ok) {
            const projects = await response.json();
            const project = projects.find(p => p.number === parseInt(number));
            if (project && project.name) {
                return { title: project.name };
            }
        }
    } catch (e) {
        console.warn(`Could not fetch project title from API for ${org}/${number}:`, e);
    }
    
    // Fallback: return a formatted name
    return {
        title: `${org.charAt(0).toUpperCase() + org.slice(1)} Project #${number}`
    };
}

// ============================================
// Filters
// ============================================

function initializeFilters() {
    // First, select all projects
    const allProjects = [];
    state.allIssues.forEach(issue => {
        if (!allProjects.includes(issue.projectTitle)) {
            allProjects.push(issue.projectTitle);
        }
    });
    allProjects.forEach(project => state.filters.projects.add(project));
    
    // Get available options based on selected projects
    const availableOptions = getAvailableFilterOptions();
    
    // Initialize all other filters with all available options selected
    availableOptions.versions.forEach(item => state.filters.versions.add(item));
    availableOptions.areas.forEach(item => state.filters.areas.add(item));
    availableOptions.priorities.forEach(item => state.filters.priorities.add(item));
    availableOptions.assignees.forEach(item => state.filters.assignees.add(item));
    availableOptions.statuses.forEach(item => state.filters.statuses.add(item));
    
    // Render filter groups
    renderFilterGroup('projectFilters', availableOptions.projects, 'projects', true);
    renderFilterGroup('versionFilters', availableOptions.versions, 'versions');
    renderFilterGroup('areaFilters', availableOptions.areas, 'areas');
    renderFilterGroup('priorityFilters', availableOptions.priorities, 'priorities');
    renderFilterGroup('assigneeFilters', availableOptions.assignees, 'assignees');
    renderFilterGroup('statusFilters', availableOptions.statuses, 'statuses');
}

function getAvailableFilterOptions() {
    const projects = new Set();
    const versions = new Set();
    const areas = new Set();
    const priorities = new Set();
    const assignees = new Set();
    const statuses = new Set();
    
    // Always show all projects
    state.allIssues.forEach(issue => {
        projects.add(issue.projectTitle);
    });
    
    // If no projects are selected, return empty options for other filters
    if (state.filters.projects.size === 0) {
        return {
            projects: Array.from(projects).sort(),
            versions: [],
            areas: [],
            priorities: [],
            assignees: [],
            statuses: []
        };
    }
    
    // Filter issues by selected projects
    const issuesToConsider = state.allIssues.filter(issue =>
        state.filters.projects.has(issue.projectTitle)
    );
    
    // Show only options available in selected projects
    issuesToConsider.forEach(issue => {
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
    
    return {
        projects: Array.from(projects).sort(),
        versions: Array.from(versions).sort(),
        areas: Array.from(areas).sort(),
        priorities: Array.from(priorities).sort(),
        assignees: Array.from(assignees).sort(),
        statuses: Array.from(statuses).sort()
    };
}

function getAllProjects() {
    const projects = new Set();
    state.allIssues.forEach(issue => projects.add(issue.projectTitle));
    return Array.from(projects);
}

function renderFilterGroup(containerId, items, filterKey, isProjectFilter = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Clear existing content to prevent duplication
    container.innerHTML = '';
    
    // Preserve existing selections if they're still valid
    const currentSelections = Array.from(state.filters[filterKey]);
    const validSelections = currentSelections.filter(item => items.includes(item));
    
    // Update filter state with only valid selections
    state.filters[filterKey].clear();
    if (validSelections.length > 0) {
        validSelections.forEach(item => state.filters[filterKey].add(item));
    }
    // If no valid selections remain, keep the filter empty (don't auto-select all)
    
    // Create multi-select dropdown
    const dropdown = createMultiSelectDropdown(items, filterKey, Array.from(state.filters[filterKey]), isProjectFilter);
    container.appendChild(dropdown);
}

function updateCascadingFilters() {
    // Clear all non-project filters first
    state.filters.versions.clear();
    state.filters.areas.clear();
    state.filters.priorities.clear();
    state.filters.assignees.clear();
    state.filters.statuses.clear();
    
    // Get available options based on currently selected projects
    const availableOptions = getAvailableFilterOptions();
    
    // Select all available options for each filter
    availableOptions.versions.forEach(item => state.filters.versions.add(item));
    availableOptions.areas.forEach(item => state.filters.areas.add(item));
    availableOptions.priorities.forEach(item => state.filters.priorities.add(item));
    availableOptions.assignees.forEach(item => state.filters.assignees.add(item));
    availableOptions.statuses.forEach(item => state.filters.statuses.add(item));
    
    // Update all non-project filters
    renderFilterGroup('versionFilters', availableOptions.versions, 'versions');
    renderFilterGroup('areaFilters', availableOptions.areas, 'areas');
    renderFilterGroup('priorityFilters', availableOptions.priorities, 'priorities');
    renderFilterGroup('assigneeFilters', availableOptions.assignees, 'assignees');
    renderFilterGroup('statusFilters', availableOptions.statuses, 'statuses');
}

function createMultiSelectDropdown(items, filterKey, selectedItems, isProjectFilter = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'filter-select';
    
    // Trigger button
    const trigger = document.createElement('div');
    trigger.className = 'filter-select-trigger';
    
    const text = document.createElement('span');
    text.className = 'filter-select-text';
    updateTriggerText(text, selectedItems, items);
    
    const arrow = document.createElement('span');
    arrow.className = 'filter-select-arrow';
    arrow.textContent = '▼';
    
    trigger.appendChild(text);
    trigger.appendChild(arrow);
    
    // Dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-select-dropdown';
    
    // Search box
    const searchBox = document.createElement('div');
    searchBox.className = 'filter-select-search';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search...';
    searchBox.appendChild(searchInput);
    
    // Options container
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'filter-select-options';
    
    // Create options
    const options = [];
    items.forEach(item => {
        const option = document.createElement('div');
        option.className = 'filter-select-option';
        option.dataset.value = item;
        
        // Add selected class if item is selected
        if (selectedItems.includes(item)) {
            option.classList.add('selected');
        }
        
        const label = document.createElement('span');
        label.textContent = item;
        
        option.appendChild(label);
        optionsContainer.appendChild(option);
        options.push({ option, item });
        
        // Handle option click
        option.addEventListener('click', () => {
            const isSelected = option.classList.contains('selected');
            
            if (isSelected) {
                option.classList.remove('selected');
                state.filters[filterKey].delete(item);
            } else {
                option.classList.add('selected');
                state.filters[filterKey].add(item);
            }
            
            updateTriggerText(text, Array.from(state.filters[filterKey]), items);
            
            // If this is the project filter, update other filter options
            if (isProjectFilter) {
                updateCascadingFilters();
            }
            
            // Always apply filters after any change
            applyFilters();
        });
    });
    
    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        options.forEach(({ option, item }) => {
            const matches = item.toLowerCase().includes(searchTerm);
            option.style.display = matches ? 'flex' : 'none';
        });
    });
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'filter-select-actions';
    
    const selectAll = document.createElement('button');
    selectAll.className = 'select-all';
    selectAll.textContent = 'Select All';
    selectAll.addEventListener('click', () => {
        options.forEach(({ option, item }) => {
            option.classList.add('selected');
            state.filters[filterKey].add(item);
        });
        updateTriggerText(text, items, items);
        
        // If this is the project filter, update other filter options
        if (isProjectFilter) {
            updateCascadingFilters();
        }
        
        // Always apply filters
        applyFilters();
    });
    
    const clearAll = document.createElement('button');
    clearAll.className = 'clear-all';
    clearAll.textContent = 'Clear All';
    clearAll.addEventListener('click', () => {
        options.forEach(({ option }) => {
            option.classList.remove('selected');
        });
        state.filters[filterKey].clear();
        updateTriggerText(text, [], items);
        
        // If this is the project filter, update other filter options
        if (isProjectFilter) {
            updateCascadingFilters();
        }
        
        // Always apply filters
        applyFilters();
    });
    
    actions.appendChild(selectAll);
    actions.appendChild(clearAll);
    
    dropdown.appendChild(searchBox);
    dropdown.appendChild(optionsContainer);
    dropdown.appendChild(actions);
    
    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = dropdown.classList.contains('active');
        
        // Close all other dropdowns
        document.querySelectorAll('.filter-select-dropdown.active').forEach(d => {
            d.classList.remove('active');
            d.previousElementSibling.classList.remove('active');
        });
        
        if (!isActive) {
            dropdown.classList.add('active');
            trigger.classList.add('active');
            searchInput.focus();
        }
    });
    
    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);
    
    return wrapper;
}

// ============================================
// Main Tab Navigation
// ============================================

function initializeMainTabs() {
    const tabButtons = document.querySelectorAll('.main-tab-button');
    const tabPanes = document.querySelectorAll('.main-tab-pane');
    const statusFilterGroup = document.getElementById('statusFilterGroup');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-main-tab');
            
            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Add active class to clicked button and corresponding pane
            button.classList.add('active');
            const targetPane = document.getElementById(`${targetTab}Tab`);
            if (targetPane) {
                targetPane.classList.add('active');
            }
            
            // Hide status filter in Performance tab (all items are completed)
            if (statusFilterGroup) {
                if (targetTab === 'performance') {
                    statusFilterGroup.style.display = 'none';
                } else {
                    statusFilterGroup.style.display = 'block';
                }
            }
            
            // Trigger updates when switching tabs
            if (targetTab === 'performance' && window.updatePerformanceMetrics) {
                window.updatePerformanceMetrics();
            }
            
            // Trigger velocity update when switching to capacity tab
            if (targetTab === 'capacity' && window.velocityModule) {
                // Dispatch event to update velocity with current filters
                window.dispatchEvent(new CustomEvent('filtersChanged'));
            }
        });
    });
}

function updateTriggerText(textElement, selected, allItems) {
    if (selected.length === 0) {
        textElement.textContent = 'None selected';
        textElement.classList.add('placeholder');
    } else if (selected.length === allItems.length) {
        textElement.textContent = 'All selected';
        textElement.classList.remove('placeholder');
    } else if (selected.length === 1) {
        textElement.textContent = selected[0];
        textElement.classList.remove('placeholder');
    } else {
        textElement.textContent = `${selected.length} selected`;
        textElement.classList.remove('placeholder');
    }
}

function applyFilters() {
    state.filteredIssues = state.allIssues.filter(issue => {
        // Project filter - REQUIRED: if no projects selected, filter out everything
        if (state.filters.projects.size === 0) {
            return false;
        }
        if (!state.filters.projects.has(issue.projectTitle)) {
            return false;
        }
        
        // Version filter - OPTIONAL: only apply if selections exist
        if (state.filters.versions.size > 0 && !state.filters.versions.has(issue.Version)) {
            return false;
        }
        
        // Area filter - OPTIONAL: only apply if selections exist
        if (state.filters.areas.size > 0 && !state.filters.areas.has(issue.Area)) {
            return false;
        }
        
        // Priority filter - OPTIONAL: only apply if selections exist
        if (state.filters.priorities.size > 0 && !state.filters.priorities.has(issue.Priority)) {
            return false;
        }
        
        // Status filter - OPTIONAL: only apply if selections exist
        if (state.filters.statuses.size > 0 && !state.filters.statuses.has(issue.Status)) {
            return false;
        }
        
        // Assignee filter - OPTIONAL: only apply if selections exist
        if (state.filters.assignees.size > 0) {
            const issueAssignees = issue.Assignees.split(',').map(a => a.trim());
            const hasMatch = issueAssignees.some(a => state.filters.assignees.has(a));
            if (!hasMatch) {
                return false;
            }
        }
        
        return true;
    });
    
    renderDashboard();
    
    // Dispatch event for velocity module to update
    window.dispatchEvent(new CustomEvent('filtersChanged'));
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
    
    // Update Global Summary tab
    document.getElementById('totalIssues').textContent = totalIssues;
    document.getElementById('totalRemaining').textContent = `${totalRemaining.toFixed(1)} weeks`;
    document.getElementById('totalEstimate').textContent = `${totalEstimate.toFixed(1)} weeks`;
    document.getElementById('totalSpent').textContent = `${totalSpent.toFixed(1)} weeks`;
    document.getElementById('totalProgress').textContent = `${progress.toFixed(0)}%`;
    
    // Update Capacity Planning tab summary cards
    const capacityTotalIssues = document.getElementById('capacityTotalIssues');
    const capacityTotalRemaining = document.getElementById('capacityTotalRemaining');
    const capacityTotalEstimate = document.getElementById('capacityTotalEstimate');
    const capacityTotalSpent = document.getElementById('capacityTotalSpent');
    const capacityTotalProgress = document.getElementById('capacityTotalProgress');
    
    if (capacityTotalIssues) capacityTotalIssues.textContent = totalIssues;
    if (capacityTotalRemaining) capacityTotalRemaining.textContent = `${totalRemaining.toFixed(1)} weeks`;
    if (capacityTotalEstimate) capacityTotalEstimate.textContent = `${totalEstimate.toFixed(1)} weeks`;
    if (capacityTotalSpent) capacityTotalSpent.textContent = `${totalSpent.toFixed(1)} weeks`;
    if (capacityTotalProgress) capacityTotalProgress.textContent = `${progress.toFixed(0)}%`;
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
    if (!table) {
        console.warn(`Table not found: ${tableId}`);
        return;
    }
    
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
    
    console.log(`Rendering ${tableId}: ${groups.size} groups from ${state.filteredIssues.length} issues`);
    
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
        let aVal, bVal;
        
        // Map sort column to actual field names
        switch (state.sortColumn) {
            case 'number':
                aVal = parseInt(a['Issue Number']) || 0;
                bVal = parseInt(b['Issue Number']) || 0;
                break;
            case 'title':
                aVal = (a['Title'] || '').toLowerCase();
                bVal = (b['Title'] || '').toLowerCase();
                break;
            case 'status':
                aVal = (a['Status'] || '').toLowerCase();
                bVal = (b['Status'] || '').toLowerCase();
                break;
            case 'area':
                aVal = (a['Area'] || '').toLowerCase();
                bVal = (b['Area'] || '').toLowerCase();
                break;
            case 'priority':
                aVal = (a['Priority'] || '').toLowerCase();
                bVal = (b['Priority'] || '').toLowerCase();
                break;
            case 'version':
                aVal = (a['Version'] || '').toLowerCase();
                bVal = (b['Version'] || '').toLowerCase();
                break;
            case 'assignees':
                aVal = (a['Assignees'] || '').toLowerCase();
                bVal = (b['Assignees'] || '').toLowerCase();
                break;
            case 'remaining':
                aVal = parseFloat(a['Σ Remaining Work']) || 0;
                bVal = parseFloat(b['Σ Remaining Work']) || 0;
                break;
            case 'progress':
                aVal = a['Σ Estimate'] > 0 ? (a['Σ Time Spent'] / a['Σ Estimate'] * 100) : 0;
                bVal = b['Σ Estimate'] > 0 ? (b['Σ Time Spent'] / b['Σ Estimate'] * 100) : 0;
                break;
            default:
                aVal = a[state.sortColumn];
                bVal = b[state.sortColumn];
        }
        
        if (aVal < bVal) return state.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return state.sortDirection === 'asc' ? 1 : -1;
        return 0;
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
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-select')) {
            document.querySelectorAll('.filter-select-dropdown.active').forEach(dropdown => {
                dropdown.classList.remove('active');
                dropdown.previousElementSibling.classList.remove('active');
            });
        }
    });
    
    // Sidebar toggle
    document.getElementById('toggleSidebar')?.addEventListener('click', () => {
        const dashboardContent = document.querySelector('.dashboard-content');
        dashboardContent.classList.toggle('sidebar-collapsed');
        
        // Update button text
        const button = document.getElementById('toggleSidebar');
        button.textContent = dashboardContent.classList.contains('sidebar-collapsed') ? '▶' : '◀';
    });
    
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
    
    // Tab switching (only for Global Summary breakdown tabs)
    document.querySelectorAll('.breakdown-section .tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            switchTab(tabName);
        });
    });
    
    // Table sorting (only for active issues table)
    const issuesTable = document.getElementById('issuesTable');
    console.log('Issues table found:', !!issuesTable);
    if (issuesTable) {
        const sortableHeaders = issuesTable.querySelectorAll('.sortable');
        console.log('Sortable headers found:', sortableHeaders.length);
        sortableHeaders.forEach(th => {
            th.addEventListener('click', () => {
                console.log('Sort clicked:', th.dataset.sort);
                const column = th.dataset.sort;
                if (state.sortColumn === column) {
                    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sortColumn = column;
                    state.sortDirection = 'desc';
                }
                
                // Update UI (only within issues table)
                issuesTable.querySelectorAll('.sortable').forEach(t => {
                    t.classList.remove('asc', 'desc');
                });
                th.classList.add(state.sortDirection);
                
                renderIssuesList();
            });
        });
    } else {
        console.error('Issues table not found!');
    }
}

function switchTab(tabName) {
    // Update buttons (only within breakdown-section)
    document.querySelectorAll('.breakdown-section .tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.breakdown-section [data-tab="${tabName}"]`)?.classList.add('active');
    
    // Update panes (only within breakdown-section)
    document.querySelectorAll('.breakdown-section .tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    document.querySelector(`.breakdown-section #${tabName}Tab`)?.classList.add('active');
}

function exportFilteredData() {
    // Determine which tab is active
    const activeTab = document.querySelector('.main-tab-pane.active');
    const isPerformanceTab = activeTab && activeTab.id === 'performanceTab';
    
    let dataToExport, filename;
    
    if (isPerformanceTab && window.getCompletedItems) {
        // Export completed items
        dataToExport = window.getCompletedItems();
        filename = `completed-items-${new Date().toISOString().split('T')[0]}.csv`;
    } else {
        // Export active issues
        dataToExport = state.filteredIssues;
        filename = `active-issues-${new Date().toISOString().split('T')[0]}.csv`;
    }
    
    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
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
