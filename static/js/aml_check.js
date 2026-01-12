// Load AML checks
async function loadAmlChecks() {
    try {
        const response = await fetch('/api/aml-check');
        const data = await response.json();
        displayAmlChecks(data.checks);
    } catch (error) {
        console.error('Error loading AML checks:', error);
    }
}

// Display AML checks
function displayAmlChecks(checks) {
    const tbody = document.getElementById('amlChecksTable');
    if (!tbody) return;
    
    // Keep checking rows (rows that are being checked but not yet in database)
    const checkingRows = Array.from(tbody.querySelectorAll('tr[id^="check-"]'));
    const checkingAddresses = new Set(checkingRows.map(row => row.dataset.address));
    
    // Clear only non-checking rows
    const rowsToRemove = Array.from(tbody.querySelectorAll('tr:not([id^="check-"])'));
    rowsToRemove.forEach(row => row.remove());
    
    // Add completed checks
    checks.forEach(check => {
        // Skip if this address is still being checked
        if (checkingAddresses.has(check.address)) {
            return;
        }
        
        const row = document.createElement('tr');
        
        const date = new Date(check.checked_at);
        const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        
        const riskLevel = check.risk_level ? check.risk_level.toUpperCase() : 'N/A';
        const riskLevelClass = `risk-level-${(check.risk_level || 'undefined').toLowerCase()}`;
        
        const balanceUsdt = check.balance_usdt !== null && check.balance_usdt !== undefined ? formatAmount(check.balance_usdt) : '-';
        const balanceTrx = check.balance_trx !== null && check.balance_trx !== undefined ? formatAmount(check.balance_trx) : '-';
        
        row.innerHTML = `
            <td><span class="risk-level ${riskLevelClass}">${riskLevel}</span></td>
            <td>${check.risk_score !== null ? check.risk_score.toFixed(1) + '%' : 'N/A'}</td>
            <td><span class="address-short">${shortenAddress(check.address)}</span></td>
            <td>${check.customer || '-'}</td>
            <td>${balanceUsdt}</td>
            <td>${balanceTrx}</td>
            <td>${dateStr} ${timeStr}</td>
            <td>${check.manager || 'N4'}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Update checking rows - replace with completed check if found
    checkingRows.forEach(checkingRow => {
        const address = checkingRow.dataset.address;
        const completedCheck = checks.find(c => c.address === address);
        
        if (completedCheck) {
            // Replace checking row with completed check
            const date = new Date(completedCheck.checked_at);
            const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            
            const riskLevel = completedCheck.risk_level ? completedCheck.risk_level.toUpperCase() : 'N/A';
            const riskLevelClass = `risk-level-${(completedCheck.risk_level || 'undefined').toLowerCase()}`;
            
            checkingRow.id = '';
            checkingRow.dataset.address = '';
            const balanceUsdt = completedCheck.balance_usdt !== null && completedCheck.balance_usdt !== undefined ? formatAmount(completedCheck.balance_usdt) : '-';
            const balanceTrx = completedCheck.balance_trx !== null && completedCheck.balance_trx !== undefined ? formatAmount(completedCheck.balance_trx) : '-';
            
            checkingRow.innerHTML = `
                <td><span class="risk-level ${riskLevelClass}">${riskLevel}</span></td>
                <td>${completedCheck.risk_score !== null ? completedCheck.risk_score.toFixed(1) + '%' : 'N/A'}</td>
                <td><span class="address-short">${shortenAddress(completedCheck.address)}</span></td>
                <td>${completedCheck.customer || '-'}</td>
                <td>${balanceUsdt}</td>
                <td>${balanceTrx}</td>
                <td>${dateStr} ${timeStr}</td>
                <td>${completedCheck.manager || 'N4'}</td>
            `;
        }
    });
    
    // Show empty message if no checks and no checking rows
    if (tbody.children.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-muted" style="text-align: center; padding: 40px;">No checks found</td></tr>';
    }
}

// Check address
async function checkAddress(event) {
    event.preventDefault();
    
    const addressInput = document.getElementById('checkAddress');
    const checkButton = document.getElementById('checkButton');
    const loadingDiv = document.getElementById('checkLoading');
    
    if (!addressInput || !checkButton || !loadingDiv) {
        console.error('Required elements not found');
        return;
    }
    
    const address = addressInput.value.trim();
    
    // Validate address
    if (!address.startsWith('T') || address.length !== 34) {
        alert('Invalid TRX address. Address must start with T and be 34 characters long.');
        return;
    }
    
    // Disable form
    checkButton.disabled = true;
    
    // Add row immediately with checking status
    const tbody = document.getElementById('amlChecksTable');
    const row = document.createElement('tr');
    row.id = `check-${address}`;
    row.dataset.address = address;
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    // Get customer from address book if exists
    let customer = '-';
    // We'll check this when loading checks
    
    row.innerHTML = `
        <td>
            <div class="aml-progress-container" style="display: flex; align-items: center; gap: 8px;">
                <div class="aml-progress-bar" style="flex: 1; height: 8px; background-color: var(--bg-tertiary); border-radius: 4px; overflow: hidden; position: relative; min-width: 100px;">
                    <div class="aml-progress-fill" style="height: 100%; background: linear-gradient(90deg, var(--accent-color) 0%, var(--accent-hover) 50%, var(--accent-color) 100%); background-size: 200% 100%; border-radius: 4px; animation: aml-progress 1.5s linear infinite; width: 100%;"></div>
                </div>
            </div>
        </td>
        <td>-</td>
        <td><span class="address-short">${shortenAddress(address)}</span></td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>${dateStr} ${timeStr}</td>
        <td>N4</td>
    `;
    
    // Insert at the beginning of tbody
    if (tbody.firstChild && tbody.firstChild.classList && tbody.firstChild.classList.contains('text-muted')) {
        tbody.removeChild(tbody.firstChild);
    }
    tbody.insertBefore(row, tbody.firstChild);
    
    // Clear input
    addressInput.value = '';
    
    try {
        const response = await fetch('/api/aml-check/check-address', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                address: address,
                manager: 'N4'
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                showNotification('AML check started. Results will appear shortly.');
                // The row will be updated automatically by loadAmlChecks polling
            } else {
                alert(data.error || 'Error starting AML check');
                // Remove the row on error
                row.remove();
            }
        } else {
            const errorData = await response.json();
            alert(errorData.error || 'Error starting AML check');
            // Remove the row on error
            row.remove();
        }
    } catch (error) {
        console.error('Error checking address:', error);
        alert('Error checking address: ' + error.message);
        // Remove the row on error
        row.remove();
    } finally {
        // Re-enable form
        checkButton.disabled = false;
    }
}

// Utility functions
function shortenAddress(address) {
    if (!address || address.length < 12) return address;
    return address.substring(0, 6) + '...' + address.substring(address.length - 6);
}

function formatAmount(amount) {
    if (amount === null || amount === undefined || amount === '-') return '-';
    return parseFloat(amount).toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function showNotification(message) {
    // Simple notification - you can enhance this later
    const notification = document.createElement('div');
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--success-color); color: white; padding: 12px 20px; border-radius: 4px; z-index: 10000;';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Load AML checks on page load
document.addEventListener('DOMContentLoaded', function() {
    loadAmlChecks();
    
    // Poll for updates every 2 seconds
    setInterval(loadAmlChecks, 2000);
    
    // Add event listener to form
    const form = document.getElementById('amlCheckForm');
    if (form) {
        form.addEventListener('submit', checkAddress);
    } else {
        console.error('Form not found');
    }
});
