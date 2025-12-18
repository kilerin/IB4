let sortableInstance = null;

// Load wallets on page load
document.addEventListener('DOMContentLoaded', function() {
    loadWallets();
    loadTransactions();
});

// Load wallets
async function loadWallets() {
    try {
        const showHidden = document.getElementById('showHidden').checked;
        const response = await fetch(`/api/wallets?show_hidden=${showHidden}`);
        const data = await response.json();
        
        displayWallets(data.wallets);
        updateTotals(data.total_usdt, data.total_trx);
        
        // Initialize sortable
        if (sortableInstance) {
            sortableInstance.destroy();
        }
        
        const walletList = document.getElementById('walletList');
        sortableInstance = Sortable.create(walletList, {
            animation: 150,
            onEnd: function(evt) {
                reorderWallets();
                showNotification('Порядок изменен');
            }
        });
    } catch (error) {
        console.error('Error loading wallets:', error);
    }
}

// Display wallets
function displayWallets(wallets) {
    const walletList = document.getElementById('walletList');
    walletList.innerHTML = '';
    
    if (wallets.length === 0) {
        walletList.innerHTML = '<div class="empty-state"><p>No wallets found. Add your first wallet!</p></div>';
        return;
    }
    
    wallets.forEach(wallet => {
        const walletItem = document.createElement('div');
        walletItem.className = `wallet-item ${wallet.is_hidden ? 'hidden' : ''}`;
        walletItem.dataset.walletId = wallet.id;
        
        const amlDate = wallet.aml_checked_at 
            ? new Date(wallet.aml_checked_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Never';
        
        const usdtAmount = Math.floor(wallet.balance_usdt).toLocaleString('ru-RU');
        const trxAmount = formatNumber(wallet.balance_trx);
        
        walletItem.innerHTML = `
            <div class="wallet-content">
                <div class="wallet-row">
                    <div class="wallet-left">
                        <button class="wallet-icon-btn" onclick="toggleWalletVisibility(${wallet.id}, ${!wallet.is_hidden})" title="${wallet.is_hidden ? 'Show' : 'Hide'}">
                            <img src="/static/ico/eye.svg" class="wallet-icon" alt="Hide">
                        </button>
                        <span class="wallet-name clickable" onclick="openWalletDetails(${wallet.id})" title="Click to view details">${escapeHtml(wallet.name)}</span>
                    </div>
                    <div class="wallet-right">
                        <span class="wallet-balance-usdt">${usdtAmount}</span>
                        <img src="/static/ico/USDT.svg" class="currency-icon-small" alt="USDT">
                    </div>
                </div>
                <div class="wallet-row">
                    <div class="wallet-left">
                        <button class="wallet-icon-btn" onclick="checkAML(${wallet.id})" title="Check AML">
                            <img src="/static/ico/shield-check.svg" class="wallet-icon" alt="AML">
                        </button>
                        <span class="wallet-aml-status">${wallet.aml_status || 'Pending'}</span>
                        <span class="wallet-aml-date text-muted">${amlDate}</span>
                    </div>
                    <div class="wallet-right">
                        <span class="wallet-balance-trx">${trxAmount}</span>
                        <img src="/static/ico/TRX.svg" class="currency-icon-small" alt="TRX">
                    </div>
                </div>
            </div>
        `;
        
        walletList.appendChild(walletItem);
    });
}

// Update totals
function updateTotals(totalUsdt, totalTrx) {
    document.getElementById('totalUsdt').textContent = Math.floor(totalUsdt).toLocaleString('ru-RU');
    document.getElementById('totalTrx').textContent = Math.floor(totalTrx).toLocaleString('ru-RU');
}

// Toggle hidden wallets
function toggleHiddenWallets() {
    loadWallets();
}

// Toggle wallet visibility
async function toggleWalletVisibility(walletId, isHidden) {
    try {
        const response = await fetch(`/api/wallets/${walletId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_hidden: isHidden })
        });
        
        if (response.ok) {
            loadWallets();
        }
    } catch (error) {
        console.error('Error toggling wallet visibility:', error);
    }
}

// Reorder wallets
async function reorderWallets() {
    const walletList = document.getElementById('walletList');
    const walletItems = Array.from(walletList.children);
    const order = walletItems.map(item => parseInt(item.dataset.walletId));
    
    try {
        const response = await fetch('/api/wallets/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order })
        });
        
        if (!response.ok) {
            console.error('Error reordering wallets');
            loadWallets(); // Reload on error
        }
    } catch (error) {
        console.error('Error reordering wallets:', error);
        loadWallets(); // Reload on error
    }
}

// Refresh balances
async function refreshBalances() {
    try {
        showNotification('Updating balances...');
        const response = await fetch('/api/wallets/refresh-balances', {
            method: 'POST'
        });
        
        if (response.ok) {
            const data = await response.json();
            loadWallets();
            if (data.errors && data.errors.length > 0) {
                console.error('Balance update errors:', data.errors);
                showNotification(`Updated ${data.updated || 0} wallets. Check console for errors.`);
            } else {
                showNotification(`Successfully updated ${data.updated || 0} wallets`);
            }
        } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('Error refreshing balances:', errorData);
            showNotification('Error refreshing balances');
        }
    } catch (error) {
        console.error('Error refreshing balances:', error);
        showNotification('Error refreshing balances');
    }
}

// Check AML
async function checkAML(walletId) {
    try {
        const response = await fetch(`/api/wallets/${walletId}/aml-check`, {
            method: 'POST'
        });
        
        if (response.ok) {
            loadWallets();
            alert('AML check completed');
        }
    } catch (error) {
        console.error('Error checking AML:', error);
    }
}

// Add wallet modal
function openAddWalletModal() {
    document.getElementById('addWalletModal').classList.add('active');
}

function closeAddWalletModal() {
    document.getElementById('addWalletModal').classList.remove('active');
    document.getElementById('addWalletForm').reset();
}

// Add wallet
async function addWallet(event) {
    event.preventDefault();
    
    const name = document.getElementById('walletName').value;
    const address = document.getElementById('walletAddress').value.trim();
    
    // Basic validation
    if (!address.startsWith('T') || address.length !== 34) {
        alert('Invalid TRX address. Address must start with T and be 34 characters long.');
        return;
    }
    
    try {
        const response = await fetch('/api/wallets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, address })
        });
        
        if (response.ok) {
            closeAddWalletModal();
            loadWallets();
        } else {
            const error = await response.json();
            alert(error.error || 'Error adding wallet');
        }
    } catch (error) {
        console.error('Error adding wallet:', error);
        alert('Error adding wallet');
    }
}

// Load transactions
async function loadTransactions() {
    try {
        const hideSmall = document.getElementById('hideSmall').checked;
        const hideTrx = document.getElementById('hideTrx').checked;
        const response = await fetch(`/api/transactions?hide_small=${hideSmall}&hide_trx=${hideTrx}`);
        const data = await response.json();
        
        displayTransactions(data.transactions);
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Display transactions
function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionsTable');
    tbody.innerHTML = '';
    
    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-muted" style="text-align: center; padding: 40px;">No transactions found</td></tr>';
        return;
    }
    
    transactions.forEach(tx => {
        const row = document.createElement('tr');
        
        // Get transaction type icon (for CUR column)
        const txType = tx.type || 'transfer';
        const typeIcon = `<img src="/static/ico/${txType}.svg" class="currency-icon" alt="${txType}" onerror="this.style.display=\'none\'">`;
        
        // Currency icon (for AMOUNT column)
        const currencyIcon = tx.currency === 'USDT' 
            ? '<img src="/static/ico/USDT.svg" class="currency-icon" alt="USDT" onerror="this.style.display=\'none\'" style="margin-right: 4px;">'
            : '<img src="/static/ico/TRX.svg" class="currency-icon" alt="TRX" onerror="this.style.display=\'none\'" style="margin-right: 4px;">';
        
        // For approve transactions, show amount without + or - sign
        const amount = tx.type === 'approve'
            ? formatAmount(tx.amount)
            : (tx.direction === 'incoming' 
                ? `<span class="amount-positive">+${formatAmount(tx.amount)}</span>`
                : `<span class="amount-negative">-${formatAmount(tx.amount)}</span>`);
        
        const address = tx.direction === 'incoming' ? tx.from_address : tx.to_address;
        const shortAddress = address ? shortenAddress(address) : '-';
        
        const date = new Date(tx.created_at);
        const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        
        row.innerHTML = `
            <td>${typeIcon}</td>
            <td style="text-align: left;">${currencyIcon}${amount}</td>
            <td>${escapeHtml(tx.wallet_name)}</td>
            <td class="text-muted">${tx.counterparty_name || '-'}</td>
            <td>
                <span class="address-short">${shortAddress}</span>
                ${address ? `<img src="/static/ico/copy.svg" class="copy-icon" onclick="copyToClipboard('${escapeHtml(address)}')" title="Copy address" alt="Copy">` : ''}
            </td>
            <td>
                <span class="text-muted" style="opacity: 0.5;">🔍</span>
            </td>
            <td>${dateStr} ${timeStr}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Refresh transactions
async function refreshTransactions() {
    try {
        showNotification('Обновление транзакций...');
        const response = await fetch('/api/transactions/refresh', {
            method: 'POST'
        });
        
        if (response.ok) {
            const data = await response.json();
            loadTransactions();
            if (data.new_transactions > 0) {
                showNotification(`Добавлено ${data.new_transactions} новых транзакций`);
            } else {
                showNotification('Новых транзакций не найдено');
            }
            if (data.errors && data.errors.length > 0) {
                console.error('Transaction refresh errors:', data.errors);
            }
        } else {
            showNotification('Ошибка при обновлении транзакций');
        }
    } catch (error) {
        console.error('Error refreshing transactions:', error);
        showNotification('Ошибка при обновлении транзакций');
    }
}

// Utility functions
function formatNumber(num) {
    return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAmount(num) {
    return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('.', ',');
}

function shortenAddress(address) {
    if (!address || address.length <= 12) return address;
    return address.substring(0, 6) + '...' + address.substring(address.length - 6);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: var(--accent-color); color: white; padding: 12px 24px; border-radius: 6px; z-index: 10000; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Address copied!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showNotification('Address copied!');
        } catch (e) {
            alert('Failed to copy address');
        }
        document.body.removeChild(textarea);
    });
}

// Wallet Details Modal Functions
let currentWalletId = null;

async function openWalletDetails(walletId) {
    currentWalletId = walletId;
    
    try {
        // Load wallet data - request specific wallet regardless of hidden status
        const walletResponse = await fetch(`/api/wallets?wallet_id=${walletId}`);
        const walletData = await walletResponse.json();
        
        if (!walletData.wallets || walletData.wallets.length === 0) {
            alert('Wallet not found');
            return;
        }
        
        const wallet = walletData.wallets[0];
        
        // Populate modal
        document.getElementById('walletDetailsTitle').textContent = wallet.name;
        document.getElementById('walletDetailsName').value = wallet.name;
        document.getElementById('walletDetailsAddress').textContent = wallet.address;
        
        // Load wallet transactions
        await loadWalletTransactions(walletId);
        
        // Show modal
        document.getElementById('walletDetailsModal').classList.add('active');
    } catch (error) {
        console.error('Error loading wallet details:', error);
        alert('Error loading wallet details');
    }
}

function closeWalletDetailsModal() {
    document.getElementById('walletDetailsModal').classList.remove('active');
    currentWalletId = null;
}

async function loadWalletTransactions(walletId) {
    try {
        const response = await fetch(`/api/transactions?wallet_id=${walletId}`);
        const data = await response.json();
        
        const tbody = document.getElementById('walletTransactionsTable');
        tbody.innerHTML = '';
        
        if (data.transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted" style="text-align: center; padding: 40px;">No transactions found</td></tr>';
            return;
        }
        
        data.transactions.forEach(tx => {
            const row = document.createElement('tr');
            
            // Get transaction type icon (for CUR column)
            const txType = tx.type || 'transfer';
            const typeIcon = `<img src="/static/ico/${txType}.svg" class="currency-icon" alt="${txType}" onerror="this.style.display=\'none\'">`;
            
            // Currency icon (for AMOUNT column)
            const currencyIcon = tx.currency === 'USDT' 
                ? '<img src="/static/ico/USDT.svg" class="currency-icon" alt="USDT" onerror="this.style.display=\'none\'" style="margin-right: 4px;">'
                : '<img src="/static/ico/TRX.svg" class="currency-icon" alt="TRX" onerror="this.style.display=\'none\'" style="margin-right: 4px;">';
            
            // For approve transactions, show amount without + or - sign
            const amount = tx.type === 'approve'
                ? formatAmount(tx.amount)
                : (tx.direction === 'incoming' 
                    ? `<span class="amount-positive">+${formatAmount(tx.amount)}</span>`
                    : `<span class="amount-negative">-${formatAmount(tx.amount)}</span>`);
            
            const address = tx.direction === 'incoming' ? tx.from_address : tx.to_address;
            const shortAddress = address ? shortenAddress(address) : '-';
            
            const date = new Date(tx.created_at);
            const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            
            row.innerHTML = `
                <td>${typeIcon}</td>
                <td style="text-align: left;">${currencyIcon}${amount}</td>
                <td>${tx.direction === 'incoming' ? 'Incoming' : 'Outgoing'}</td>
                <td>
                    <span class="address-short">${shortAddress}</span>
                    ${address ? `<img src="/static/ico/copy.svg" class="copy-icon" onclick="copyToClipboard('${escapeHtml(address)}')" title="Copy address" alt="Copy">` : ''}
                </td>
                <td>${dateStr} ${timeStr}</td>
            `;
            
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading wallet transactions:', error);
    }
}

async function saveWalletChanges() {
    if (!currentWalletId) return;
    
    const newName = document.getElementById('walletDetailsName').value.trim();
    
    if (!newName) {
        alert('Wallet name cannot be empty');
        return;
    }
    
    try {
        const response = await fetch(`/api/wallets/${currentWalletId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        
        if (response.ok) {
            showNotification('Wallet updated successfully');
            closeWalletDetailsModal();
            loadWallets();
        } else {
            alert('Error updating wallet');
        }
    } catch (error) {
        console.error('Error saving wallet changes:', error);
        alert('Error saving wallet changes');
    }
}

async function deleteWalletFromDetails() {
    if (!currentWalletId) return;
    
    if (!confirm('Are you sure you want to delete this wallet? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/wallets/${currentWalletId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Wallet deleted successfully');
            closeWalletDetailsModal();
            loadWallets();
        } else {
            alert('Error deleting wallet');
        }
    } catch (error) {
        console.error('Error deleting wallet:', error);
        alert('Error deleting wallet');
    }
}

// Close modal on outside click
document.getElementById('addWalletModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeAddWalletModal();
    }
});

document.getElementById('walletDetailsModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeWalletDetailsModal();
    }
});

