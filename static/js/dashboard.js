let weeklyChart = null;
let transactionTypesChart = null;

// Load dashboard data on page load
document.addEventListener('DOMContentLoaded', function() {
    loadDashboardData();
    loadTransactionTypesData();
    
    // Add event listener for filter change
    const filter = document.getElementById('transactionTypeFilter');
    if (filter) {
        filter.addEventListener('change', function() {
            loadDashboardData();
        });
    }
    
    // Add event listener for period change
    const periodFilter = document.getElementById('periodFilter');
    if (periodFilter) {
        periodFilter.addEventListener('change', function() {
            loadDashboardData();
        });
    }
    
    // Add event listeners for transaction types chart
    const typePeriodFilter = document.getElementById('typePeriodFilter');
    if (typePeriodFilter) {
        typePeriodFilter.addEventListener('change', function() {
            loadTransactionTypesData();
        });
    }
    
    const directionFilter = document.getElementById('directionFilter');
    if (directionFilter) {
        directionFilter.addEventListener('change', function() {
            loadTransactionTypesData();
        });
    }
    
    // Add event listener for export Excel button
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', function() {
            exportToExcel();
        });
    }
});

async function loadDashboardData() {
    const filter = document.getElementById('transactionTypeFilter');
    const periodFilter = document.getElementById('periodFilter');
    const transactionType = filter ? filter.value : '';
    const period = periodFilter ? periodFilter.value : '0';
    
    try {
        const response = await fetch(`/api/dashboard/weekly-stats?transaction_type=${encodeURIComponent(transactionType)}&period=${encodeURIComponent(period)}`);
        const data = await response.json();
        
        if (data.weeks) {
            updateStats(data);
            updateChart(data.weeks);
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function updateStats(data) {
    // Round to whole numbers
    const totalIn = Math.round(data.total_in || 0);
    const totalOut = Math.round(data.total_out || 0);
    const delta = Math.round(data.delta || 0);
    const walletBalanceFromTx = Math.round(data.wallet_balance_from_tx || 0);
    
    document.getElementById('totalIn').textContent = totalIn.toLocaleString('ru-RU');
    document.getElementById('totalOut').textContent = totalOut.toLocaleString('ru-RU');
    
    const deltaElement = document.getElementById('delta');
    deltaElement.textContent = Math.abs(delta).toLocaleString('ru-RU');
    
    // Color delta based on positive/negative
    if (delta >= 0) {
        deltaElement.style.color = 'var(--success-color)';
    } else {
        deltaElement.style.color = 'var(--danger-color)';
    }
    
    // Log comparison for debugging
    if (Math.abs(delta - walletBalanceFromTx) > 0.01) {
        console.warn('⚠️ Delta mismatch:', {
            delta: delta,
            walletBalanceFromTx: walletBalanceFromTx,
            difference: Math.abs(delta - walletBalanceFromTx)
        });
    } else {
        console.log('✅ Delta matches wallet balance from transactions:', delta);
    }
}

function updateChart(weeks) {
    const ctx = document.getElementById('weeklyChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (weeklyChart) {
        weeklyChart.destroy();
    }
    
    const labels = weeks.map(w => w.week_label);
    const incomingData = weeks.map(w => w.incoming);
    const outgoingData = weeks.map(w => w.outgoing);
    
    weeklyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Incoming',
                    data: incomingData,
                    backgroundColor: 'rgba(40, 167, 69, 0.7)', // Green
                    borderColor: 'rgba(40, 167, 69, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Outgoing',
                    data: outgoingData,
                    backgroundColor: 'rgba(220, 53, 69, 0.7)', // Red
                    borderColor: 'rgba(220, 53, 69, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        callback: function(value) {
                            return formatAmountShort(value);
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatAmount(context.parsed.y);
                        }
                    }
                }
            }
        }
    });
}

function formatAmount(amount) {
    return parseFloat(amount).toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatAmountShort(amount) {
    // Format as millions: 6M, 7M, etc.
    const millions = parseFloat(amount) / 1000000;
    if (millions >= 1) {
        return Math.round(millions) + 'M';
    } else {
        // For values less than 1M, show in thousands
        const thousands = millions * 1000;
        return Math.round(thousands) + 'K';
    }
}

// Export to Excel function
function exportToExcel() {
    const filter = document.getElementById('transactionTypeFilter');
    const periodFilter = document.getElementById('periodFilter');
    const transactionType = filter ? filter.value : '';
    const period = periodFilter ? periodFilter.value : '0';
    
    // Build URL with parameters
    const url = `/api/dashboard/export-excel?transaction_type=${encodeURIComponent(transactionType)}&period=${encodeURIComponent(period)}`;
    
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Load transaction types data
async function loadTransactionTypesData() {
    const typePeriodFilter = document.getElementById('typePeriodFilter');
    const directionFilter = document.getElementById('directionFilter');
    const period = typePeriodFilter ? typePeriodFilter.value : '365';
    const direction = directionFilter ? directionFilter.value : 'incoming';
    
    try {
        const response = await fetch(`/api/dashboard/transaction-types?period=${encodeURIComponent(period)}&direction=${encodeURIComponent(direction)}`);
        const data = await response.json();
        
        if (data.types) {
            updateTransactionTypesChart(data.types, data.direction);
        }
    } catch (error) {
        console.error('Error loading transaction types data:', error);
    }
}

// Update transaction types chart
function updateTransactionTypesChart(types, direction) {
    const ctx = document.getElementById('transactionTypesChart');
    if (!ctx) return;
    
    const chartCtx = ctx.getContext('2d');
    
    // Destroy existing chart if it exists
    if (transactionTypesChart) {
        transactionTypesChart.destroy();
    }
    
    const labels = types.map(t => t.type);
    const amounts = types.map(t => t.amount);
    
    // Color palette for different transaction types
    const colors = [
        'rgba(40, 167, 69, 0.7)',   // Green
        'rgba(220, 53, 69, 0.7)',    // Red
        'rgba(0, 123, 255, 0.7)',    // Blue
        'rgba(108, 117, 125, 0.7)',  // Gray
        'rgba(255, 193, 7, 0.7)',    // Yellow
        'rgba(23, 162, 184, 0.7)',   // Cyan
        'rgba(111, 66, 193, 0.7)',   // Purple
        'rgba(253, 126, 20, 0.7)',   // Orange
        'rgba(40, 167, 69, 0.5)'     // Light Green
    ];
    
    const backgroundColors = labels.map((_, index) => colors[index % colors.length]);
    
    transactionTypesChart = new Chart(chartCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: direction === 'incoming' ? 'Incoming' : 'Outgoing',
                    data: amounts,
                    backgroundColor: backgroundColors,
                    borderColor: backgroundColors.map(c => c.replace('0.7', '1').replace('0.5', '1')),
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        callback: function(value) {
                            return formatAmountShort(value);
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += formatAmount(context.parsed.y) + ' USDT';
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}


