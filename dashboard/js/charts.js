// ============================================
// Charts Module - Chart.js Integration
// ============================================

let charts = {
    project: null,
    area: null,
    version: null,
    priority: null,
    velocity: null
};

// Chart color schemes
const COLORS = {
    primary: ['#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'],
    success: ['#10b981', '#059669', '#047857', '#065f46', '#064e3b'],
    warning: ['#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f'],
    danger: ['#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'],
    info: ['#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63'],
    mixed: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
};

// ============================================
// Initialize Charts
// ============================================

function initializeCharts() {
    // Set Chart.js defaults
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.color = '#475569';
    
    // Create initial empty charts
    createProjectChart([]);
    createAreaChart([]);
    createVersionChart([]);
    createPriorityChart([]);
}

// ============================================
// Update Charts with Filtered Data
// ============================================

window.updateCharts = function(filteredIssues) {
    updateProjectChart(filteredIssues);
    updateAreaChart(filteredIssues);
    updateVersionChart(filteredIssues);
    updatePriorityChart(filteredIssues);
};

// ============================================
// Project Chart (Bar Chart)
// ============================================

function createProjectChart(data) {
    const ctx = document.getElementById('projectChart');
    if (!ctx) return;
    
    charts.project = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Σ Remaining Work (weeks)',
                data: [],
                backgroundColor: COLORS.primary[0],
                borderColor: COLORS.primary[1],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y.toFixed(1)} weeks`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Weeks'
                    }
                }
            }
        }
    });
}

function updateProjectChart(issues) {
    if (!charts.project) return;
    
    // Group by project
    const groups = new Map();
    issues.forEach(issue => {
        const key = issue.projectTitle || issue.project;
        if (!groups.has(key)) {
            groups.set(key, 0);
        }
        groups.set(key, groups.get(key) + issue['Σ Remaining Work']);
    });
    
    // Sort by value descending
    const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
    
    charts.project.data.labels = sorted.map(([key]) => key);
    charts.project.data.datasets[0].data = sorted.map(([, value]) => value);
    charts.project.update();
}

// ============================================
// Area Chart (Pie Chart)
// ============================================

function createAreaChart(data) {
    const ctx = document.getElementById('areaChart');
    if (!ctx) return;
    
    charts.area = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: COLORS.mixed,
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value.toFixed(1)}w (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function updateAreaChart(issues) {
    if (!charts.area) return;
    
    // Group by area
    const groups = new Map();
    issues.forEach(issue => {
        const key = issue.Area || '(none)';
        if (!groups.has(key)) {
            groups.set(key, 0);
        }
        groups.set(key, groups.get(key) + issue['Σ Remaining Work']);
    });
    
    // Sort by value descending
    const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
    
    charts.area.data.labels = sorted.map(([key]) => key);
    charts.area.data.datasets[0].data = sorted.map(([, value]) => value);
    charts.area.update();
}

// ============================================
// Version Chart (Horizontal Bar Chart)
// ============================================

function createVersionChart(data) {
    const ctx = document.getElementById('versionChart');
    if (!ctx) return;
    
    charts.version = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Σ Remaining Work (weeks)',
                data: [],
                backgroundColor: COLORS.success[0],
                borderColor: COLORS.success[1],
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.x.toFixed(1)} weeks`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Weeks'
                    }
                }
            }
        }
    });
}

function updateVersionChart(issues) {
    if (!charts.version) return;
    
    // Group by version
    const groups = new Map();
    issues.forEach(issue => {
        const key = issue.Version || '(none)';
        if (!groups.has(key)) {
            groups.set(key, 0);
        }
        groups.set(key, groups.get(key) + issue['Σ Remaining Work']);
    });
    
    // Sort by value descending
    const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
    
    charts.version.data.labels = sorted.map(([key]) => key);
    charts.version.data.datasets[0].data = sorted.map(([, value]) => value);
    charts.version.update();
}

// ============================================
// Priority Chart (Doughnut Chart)
// ============================================

function createPriorityChart(data) {
    const ctx = document.getElementById('priorityChart');
    if (!ctx) return;
    
    charts.priority = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    COLORS.danger[0],   // Blocker
                    COLORS.warning[0],  // Major
                    COLORS.info[0],     // Normal
                    COLORS.success[0]   // Minor
                ],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 10
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value.toFixed(1)}w (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function updatePriorityChart(issues) {
    if (!charts.priority) return;
    
    // Group by priority
    const groups = new Map();
    issues.forEach(issue => {
        const key = issue.Priority || '(none)';
        if (!groups.has(key)) {
            groups.set(key, 0);
        }
        groups.set(key, groups.get(key) + issue['Σ Remaining Work']);
    });
    
    // Sort by priority order: Blocker, Major, Normal, Minor
    const priorityOrder = ['Blocker', 'Major', 'Normal', 'Minor'];
    const sorted = Array.from(groups.entries()).sort((a, b) => {
        const aIndex = priorityOrder.indexOf(a[0]);
        const bIndex = priorityOrder.indexOf(b[0]);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });
    
    charts.priority.data.labels = sorted.map(([key]) => key);
    charts.priority.data.datasets[0].data = sorted.map(([, value]) => value);
    charts.priority.update();
}

// ============================================
// Velocity Chart (Line Chart)
// ============================================

function createVelocityChart(velocityData) {
    const ctx = document.getElementById('velocityChart');
    if (!ctx) return;
    
    // If chart exists, update it instead of creating new one
    if (charts.velocity) {
        charts.velocity.data.labels = velocityData.weeks;
        charts.velocity.data.datasets[0].data = velocityData.values;
        charts.velocity.data.datasets[1].data = velocityData.average;
        charts.velocity.update();
        return;
    }
    
    // Create new chart
    charts.velocity = new Chart(ctx, {
        type: 'line',
        data: {
            labels: velocityData.weeks,
            datasets: [
                {
                    label: 'Weekly Completion',
                    data: velocityData.values,
                    borderColor: COLORS.primary[0],
                    backgroundColor: COLORS.primary[0] + '20',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Moving Average',
                    data: velocityData.average,
                    borderColor: COLORS.success[0],
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)} weeks`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Work Completed (weeks)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Week'
                    }
                }
            }
        }
    });
}

// Initialize charts when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCharts);
} else {
    initializeCharts();
}

// Export for use in other modules
window.createVelocityChart = createVelocityChart;

// Made with Bob
