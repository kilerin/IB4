let sortableInstance = null;
let currentSort = { field: null, direction: 'asc' }; // 'asc' or 'desc'

// Make sortTransactions available globally
window.sortTransactions = function(field) {
    // Toggle direction if clicking the same field
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    
    // Update sort indicators
    updateSortIndicators();
    
    // Reload transactions to apply sort
    loadTransactions();
};

// Load wallets on page load
document.addEventListener('DOMContentLoaded', function() {
    // Restore toggle states from localStorage
    const hideSmall = localStorage.getItem('hideSmallTransactions') === 'true';
    const hideTrx = localStorage.getItem('hideTrxTransactions') === 'true';
    const hideOwnFundTransfer = localStorage.getItem('hideOwnFundTransfer') === 'true';
    
    const hideSmallCheckbox = document.getElementById('hideSmall');
    const hideTrxCheckbox = document.getElementById('hideTrx');
    const hideOwnFundTransferCheckbox = document.getElementById('hideOwnFundTransfer');
    
    if (hideSmallCheckbox) {
        hideSmallCheckbox.checked = hideSmall;
    }
    if (hideTrxCheckbox) {
        hideTrxCheckbox.checked = hideTrx;
    }
    if (hideOwnFundTransferCheckbox) {
        hideOwnFundTransferCheckbox.checked = hideOwnFundTransfer;
    }
    
    loadWallets();
    loadTransactions();
    loadReserves();
    updateHiddenToggleIcon();
    
    // Add sort handlers using event delegation (table is loaded dynamically)
    const transactionsTable = document.getElementById('transactionsTable');
    if (transactionsTable && transactionsTable.closest('table')) {
        const table = transactionsTable.closest('table');
        table.addEventListener('click', function(e) {
            const header = e.target.closest('th.sortable');
            if (header) {
                const sortField = header.getAttribute('data-sort');
                sortTransactions(sortField);
            }
        });
    }
    
    // Close modals when clicking outside
    const addAddressModal = document.getElementById('addAddressModal');
    if (addAddressModal) {
        addAddressModal.addEventListener('click', function(e) {
            if (e.target === addAddressModal) {
                closeAddAddressModal();
            }
        });
    }
    
    // Save toggle states when changed
    if (hideSmallCheckbox) {
        hideSmallCheckbox.addEventListener('change', function() {
            localStorage.setItem('hideSmallTransactions', this.checked);
            loadTransactions();
        });
    }
    if (hideTrxCheckbox) {
        hideTrxCheckbox.addEventListener('change', function() {
            localStorage.setItem('hideTrxTransactions', this.checked);
            loadTransactions();
        });
    }
    if (hideOwnFundTransferCheckbox) {
        hideOwnFundTransferCheckbox.addEventListener('change', function() {
            localStorage.setItem('hideOwnFundTransfer', this.checked);
            loadTransactions();
        });
    }
});

// Track hidden wallets visibility state
let showHiddenWallets = false;

// Load wallets
async function loadWallets() {
    try {
        const response = await fetch(`/api/wallets?show_hidden=${showHiddenWallets}`);
        const data = await response.json();
        
        displayWallets(data.wallets);
        updateTotals(data.total_usdt, data.total_trx);
        
        // Update icon based on state
        updateHiddenToggleIcon();
        
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
        const color = wallet.color || 'gray';
        walletItem.className = `wallet-item wallet-color-${color} ${wallet.is_hidden ? 'hidden' : ''}`;
        walletItem.dataset.walletId = wallet.id;
        
        const usdtAmount = Math.floor(wallet.balance_usdt).toLocaleString('ru-RU');
        const trxAmount = Math.floor(wallet.balance_trx).toLocaleString('ru-RU');
        
        walletItem.innerHTML = `
            <div class="wallet-content">
                <div class="wallet-row">
                    <div class="wallet-left">
                        <span class="wallet-name clickable" onclick="openWalletDetails(${wallet.id})" title="Click to view details">${escapeHtml(wallet.name)}</span>
                        <span class="wallet-address-suffix">
                            ...${escapeHtml(wallet.address.slice(-6))}
                            <div class="wallet-action-icons">
                                <img src="/static/ico/copy.svg" class="wallet-copy-icon" onclick="event.stopPropagation(); copyToClipboard('${escapeHtml(wallet.address)}'); showNotification('Address copied')" title="Copy address" alt="Copy">
                                <button class="wallet-icon-btn" onclick="toggleWalletVisibility(${wallet.id}, ${!wallet.is_hidden})" title="${wallet.is_hidden ? 'Show' : 'Hide'}">
                                    <img src="/static/ico/eye.svg" class="wallet-icon" alt="Hide">
                                </button>
                                <button class="wallet-icon-btn" onclick="openAmlConfirmModal(${wallet.id || 'null'})" title="Check AML" data-wallet-id="${wallet.id || ''}">
                                    <img src="/static/ico/shield-check.svg" class="wallet-icon" alt="AML">
                                </button>
                            </div>
                        </span>
                    </div>
                    <div class="wallet-right">
                        <span class="wallet-balance-usdt">${usdtAmount}</span>
                        <img src="/static/ico/USDT.svg" class="currency-icon-small" alt="USDT">
                    </div>
                </div>
                <div class="wallet-row">
                    <div class="wallet-left">
                        ${wallet.aml_checking ? `
                            <div class="aml-progress-container">
                                <div class="aml-progress-bar">
                                    <div class="aml-progress-fill"></div>
                                </div>
                            </div>
                        ` : `
                            ${wallet.balance_changed ? `
                                <span class="wallet-aml-status"><span class="risk-level risk-level-need-check" style="color: #f0355b; font-weight: 600;">NEED CHECK!</span></span>
                            ` : `
                                ${wallet.aml_status === 'checked' && wallet.aml_score !== null ? `
                                    <span class="wallet-aml-status"><span class="risk-level risk-level-${(wallet.aml_risk_level || 'undefined').toLowerCase()}">${(wallet.aml_risk_level || 'N/A').toUpperCase()}</span> <span class="risk-score">${parseFloat(wallet.aml_score).toFixed(1)}%</span></span>
                                ` : `
                                    <span class="wallet-aml-status">${wallet.aml_status || 'Pending'}</span>
                                `}
                            `}
                        `}
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
    // Total TRX is now replaced by RESERVES, so we don't update it here
    // It will be updated by loadReserves()
    // Also update available USDT
    updateAvailableUsdtFromReserves();
}

function updateAvailableUsdtFromReserves() {
    // Get current reserves total
    fetch('/api/reserves/total')
        .then(response => response.json())
        .then(data => {
            const totalReserves = data.total || 0;
            updateAvailableUsdt(totalReserves);
        })
        .catch(error => {
            console.error('Error fetching reserves total:', error);
        });
}

function updateAvailableUsdt(totalReserves) {
    const totalUsdtText = document.getElementById('totalUsdt').textContent.replace(/\s/g, '');
    const totalUsdt = parseFloat(totalUsdtText.replace(',', '.')) || 0;
    const available = Math.max(0, totalUsdt - totalReserves);
    document.getElementById('availableUsdt').textContent = Math.floor(available).toLocaleString('ru-RU');
}

// Toggle hidden wallets
function toggleHiddenWallets() {
    showHiddenWallets = !showHiddenWallets;
    loadWallets();
    updateHiddenToggleIcon();
}

function updateHiddenToggleIcon() {
    const icon = document.getElementById('toggleHiddenIcon');
    if (icon) {
        if (showHiddenWallets) {
            // When hidden wallets are shown, use eye-scan to indicate we can hide them
            icon.src = '/static/ico/eye-scan.svg';
            icon.alt = 'Hide hidden wallets';
        } else {
            // When hidden wallets are hidden, use eye to indicate we can show them
            icon.src = '/static/ico/eye.svg';
            icon.alt = 'Show hidden wallets';
        }
    }
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
    const refreshBtn = document.getElementById('refreshBalancesBtn');
    const loadingDiv = document.getElementById('balancesLoading');
    
    try {
        // Show loading animation
        if (refreshBtn) {
            refreshBtn.disabled = true;
        }
        if (loadingDiv) {
            loadingDiv.style.display = 'flex';
        }
        
        showNotification('Обновление балансов...');
        const response = await fetch('/api/wallets/refresh-balances', {
            method: 'POST'
        });
        
        if (response.ok) {
            const data = await response.json();
            await loadWallets();
            if (data.errors && data.errors.length > 0) {
                console.error('Balance update errors:', data.errors);
                showNotification(`Обновлено ${data.updated || 0} кошельков. Проверьте консоль на ошибки.`);
            } else {
                showNotification(`Успешно обновлено ${data.updated || 0} кошельков`);
            }
        } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('Error refreshing balances:', errorData);
            showNotification('Ошибка при обновлении балансов');
        }
    } catch (error) {
        console.error('Error refreshing balances:', error);
        showNotification('Ошибка при обновлении балансов');
    } finally {
        // Hide loading animation
        if (refreshBtn) {
            refreshBtn.disabled = false;
        }
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }
    }
}

// AML Check Confirmation Modal
let pendingAmlWalletId = null;

function openAmlConfirmModal(walletId) {
    console.log('Opening AML confirm modal for wallet:', walletId);
    if (!walletId || walletId === 'null' || walletId === null || walletId === undefined) {
        console.error('Cannot open AML modal: walletId is missing or invalid');
        alert('Error: Wallet ID is missing');
        return;
    }
    pendingAmlWalletId = walletId;
    const modal = document.getElementById('amlConfirmModal');
    if (modal) {
        modal.classList.add('active');
    } else {
        console.error('AML confirm modal not found');
    }
}

function closeAmlConfirmModal() {
    document.getElementById('amlConfirmModal').classList.remove('active');
    pendingAmlWalletId = null;
}

// Confirm and start AML check
document.addEventListener('DOMContentLoaded', function() {
    const confirmBtn = document.getElementById('confirmAmlCheckBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            if (pendingAmlWalletId) {
                const walletId = pendingAmlWalletId; // Сохраняем ID перед закрытием модального окна
                closeAmlConfirmModal();
                checkAML(walletId);
            }
        });
    }
    
    // Close AML confirmation modal on outside click
    const amlModal = document.getElementById('amlConfirmModal');
    if (amlModal) {
        amlModal.addEventListener('click', function(e) {
            if (e.target === amlModal) {
                closeAmlConfirmModal();
            }
        });
    }
});

// Check AML
let amlCheckIntervals = {}; // Храним интервалы опроса для каждого кошелька

async function checkAML(walletId) {
    if (!walletId || walletId === 'null' || walletId === null) {
        console.error('Wallet ID is required for AML check, received:', walletId);
        alert('Error: Wallet ID is missing');
        return;
    }
    
    console.log('Starting AML check for wallet:', walletId);
    
    try {
        // Обновляем отображение кошелька с прогрессбаром
        loadWallets();
        
        const response = await fetch(`/api/wallets/${walletId}/aml-check`, {
            method: 'POST'
        });
        
        if (response.ok) {
            // Запускаем периодический опрос статуса проверки
            startAmlStatusPolling(walletId);
            showNotification('AML check started');
        } else {
            const errorData = await response.json().catch(() => ({}));
            loadWallets();
            alert(errorData.error || 'Error starting AML check');
        }
    } catch (error) {
        console.error('Error checking AML:', error);
        loadWallets();
        alert('Error performing AML check');
    }
}

// Опрос статуса AML проверки
function startAmlStatusPolling(walletId) {
    // Останавливаем предыдущий интервал, если есть
    if (amlCheckIntervals[walletId]) {
        clearInterval(amlCheckIntervals[walletId]);
    }
    
    let attempts = 0;
    const maxAttempts = 60; // Максимум 1 минута (60 секунд)
    
    amlCheckIntervals[walletId] = setInterval(async () => {
        attempts++;
        
        try {
            const response = await fetch(`/api/wallets?wallet_id=${walletId}`);
            const data = await response.json();
            
            if (data.wallets && data.wallets.length > 0) {
                const wallet = data.wallets[0];
                
                // Если проверка завершена
                if (!wallet.aml_checking) {
                    clearInterval(amlCheckIntervals[walletId]);
                    delete amlCheckIntervals[walletId];
                    loadWallets();
                    showNotification('AML check completed');
                    return;
                }
            }
            
            // Обновляем отображение для показа прогрессбара
            loadWallets();
            
            // Если превышен лимит попыток
            if (attempts >= maxAttempts) {
                clearInterval(amlCheckIntervals[walletId]);
                delete amlCheckIntervals[walletId];
                
                // Автоматически сбрасываем флаг проверки при таймауте
                fetch(`/api/wallets/${walletId}/reset-aml-checking`, {
                    method: 'POST'
                }).then(() => {
                    loadWallets();
                    alert('AML check timeout - checking flag has been reset');
                }).catch(() => {
                    loadWallets();
                    alert('AML check timeout');
                });
            }
        } catch (error) {
            console.error('Error polling AML status:', error);
            clearInterval(amlCheckIntervals[walletId]);
            delete amlCheckIntervals[walletId];
        }
    }, 1000); // Опрашиваем каждую секунду
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
    const color = 'gray'; // Все кошельки одинакового цвета
    
    // Basic validation
    if (!address.startsWith('T') || address.length !== 34) {
        alert('Invalid TRX address. Address must start with T and be 34 characters long.');
        return;
    }
    
    try {
        const response = await fetch('/api/wallets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, address, color })
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

// Store transactions for export
let allTransactions = [];

// Load transactions
async function loadTransactions() {
    try {
        const hideSmall = document.getElementById('hideSmall').checked;
        const hideTrx = document.getElementById('hideTrx').checked;
        const response = await fetch(`/api/transactions?hide_small=${hideSmall}&hide_trx=${hideTrx}`);
        const data = await response.json();
        
        // Store all transactions for export (without filters)
        const allResponse = await fetch('/api/transactions?hide_small=false&hide_trx=false');
        const allData = await allResponse.json();
        allTransactions = allData.transactions;
        
        displayTransactions(data.transactions);
        return Promise.resolve();
    } catch (error) {
        console.error('Error loading transactions:', error);
        return Promise.reject(error);
    }
}

// Get CSS class for transaction type badge
function getTransactionTypeClass(transactionType) {
    if (!transactionType) {
        return 'transaction-type-badge type-none';
    }
    
    const typeMap = {
        'Sell usdt': 'type-sell-usdt',
        'Buy usdt': 'type-buy-usdt',
        'Alex': 'type-alex-deal',
        'Agent': 'type-agent-deal',
        'Loan': 'type-loan',
        'Expence': 'type-expence',
        'Other': 'type-other',
        'Transit': 'type-transit'
    };
    
    const typeClass = typeMap[transactionType] || 'type-other';
    return `transaction-type-badge ${typeClass}`;
}

// Truncate comment to 20 characters for display
function truncateComment(comment, maxLength = 20) {
    if (!comment) return null;
    if (comment.length <= maxLength) return comment;
    return comment.substring(0, maxLength) + '...';
}

// Display transactions
function displayTransactions(transactions) {
    const tbody = document.getElementById('transactionsTable');
    tbody.innerHTML = '';
    
    // Get hideOwnFundTransfer state
    const hideOwnFundTransfer = document.getElementById('hideOwnFundTransfer') ? document.getElementById('hideOwnFundTransfer').checked : false;
    
    // Filter out own fund transfers if toggle is enabled
    let filteredTransactions = transactions;
    if (hideOwnFundTransfer) {
        filteredTransactions = transactions.filter(tx => tx.comment !== 'Own fund transfer');
    }
    
    // Sort transactions if sort is active
    if (currentSort.field) {
        filteredTransactions = sortTransactionsArray(filteredTransactions, currentSort.field, currentSort.direction);
    }
    
    if (filteredTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-muted" style="text-align: center; padding: 40px;">No transactions found</td></tr>';
        return;
    }
    
    filteredTransactions.forEach(tx => {
        const row = document.createElement('tr');
        
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
            <td style="text-align: left;">${currencyIcon}${amount}</td>
            <td>${escapeHtml(tx.wallet_name)}</td>
            <td class="text-muted">${tx.counterparty_name || '-'}</td>
            <td>
                <span class="transaction-type ${getTransactionTypeClass(tx.transaction_type)}" onclick="editTransactionType(${tx.id}, '${escapeHtml(tx.transaction_type || '')}')" title="Click to edit type">
                    ${tx.transaction_type ? escapeHtml(tx.transaction_type) : '<span class="text-muted" style="opacity: 0.5;">-</span>'}
                </span>
            </td>
            <td>
                <span class="transaction-comment" 
                      data-transaction-id="${tx.id}" 
                      data-comment="${escapeHtmlAttr(tx.comment || '')}" 
                      onclick="editTransactionCommentFromElement(this)" 
                      title="${tx.comment && tx.comment.length > 20 ? escapeHtmlAttr(tx.comment) : 'Click to edit comment'}" 
                      style="cursor: pointer; display: inline-block; min-width: 100px; padding: 4px 8px; border-radius: 4px; transition: background-color 0.2s;" 
                      onmouseover="this.style.backgroundColor='var(--bg-tertiary)'" 
                      onmouseout="this.style.backgroundColor='transparent'">
                    ${tx.comment ? escapeHtml(truncateComment(tx.comment)) : '<span class="text-muted" style="opacity: 0.5;">-</span>'}
                </span>
            </td>
            <td>
                <span class="address-short">${shortAddress}</span>
                ${address ? `
                    <img src="/static/ico/copy.svg" class="copy-icon" onclick="copyToClipboard('${escapeHtml(address)}')" title="Copy address" alt="Copy">
                    <img src="/static/ico/vote.svg" class="copy-icon" onclick="openAddAddressModal('${escapeHtml(address)}')" title="Add to Address Book" alt="Add" style="margin-left: 4px;">
                ` : ''}
            </td>
            <td>${dateStr} ${timeStr}</td>
        `;
        
        tbody.appendChild(row);
    });
    
    // Update sort indicators after displaying transactions
    updateSortIndicators();
}

// Sort transactions (also available as window.sortTransactions)
function sortTransactions(field) {
    // Toggle direction if clicking the same field
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    
    // Update sort indicators
    updateSortIndicators();
    
    // Reload transactions to apply sort
    loadTransactions();
}

// Ensure function is available globally
if (typeof window !== 'undefined') {
    window.sortTransactions = sortTransactions;
}

// Sort transactions array
function sortTransactionsArray(transactions, field, direction) {
    const sorted = [...transactions].sort((a, b) => {
        let aValue, bValue;
        
        if (field === 'amount') {
            // Sort by amount (consider direction for incoming/outgoing)
            aValue = a.amount * (a.direction === 'incoming' ? 1 : -1);
            bValue = b.amount * (b.direction === 'incoming' ? 1 : -1);
        } else if (field === 'date') {
            // Sort by date
            aValue = new Date(a.created_at).getTime();
            bValue = new Date(b.created_at).getTime();
        } else if (field === 'wallet') {
            // Sort by wallet name
            aValue = (a.wallet_name || '').toLowerCase();
            bValue = (b.wallet_name || '').toLowerCase();
        } else if (field === 'from_to') {
            // Sort by counterparty name
            aValue = (a.counterparty_name || '').toLowerCase();
            bValue = (b.counterparty_name || '').toLowerCase();
        } else if (field === 'type') {
            // Sort by transaction type
            aValue = (a.transaction_type || '').toLowerCase();
            bValue = (b.transaction_type || '').toLowerCase();
        } else if (field === 'comment') {
            // Sort by comment
            aValue = (a.comment || '').toLowerCase();
            bValue = (b.comment || '').toLowerCase();
        } else if (field === 'address') {
            // Sort by address (from_address for incoming, to_address for outgoing)
            const aAddr = a.direction === 'incoming' ? (a.from_address || '') : (a.to_address || '');
            const bAddr = b.direction === 'incoming' ? (b.from_address || '') : (b.to_address || '');
            aValue = aAddr.toLowerCase();
            bValue = bAddr.toLowerCase();
        } else {
            return 0;
        }
        
        // Handle null/empty values - put them at the end
        if (aValue === '' || aValue === null || aValue === undefined) {
            return direction === 'asc' ? 1 : -1;
        }
        if (bValue === '' || bValue === null || bValue === undefined) {
            return direction === 'asc' ? -1 : 1;
        }
        
        // Compare values
        if (typeof aValue === 'number' && typeof bValue === 'number') {
            if (direction === 'asc') {
                return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
            } else {
                return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
            }
        } else {
            // String comparison
            if (direction === 'asc') {
                return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
            } else {
                return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
            }
        }
    });
    
    return sorted;
}

// Update sort indicators in table headers
function updateSortIndicators() {
    const sortableHeaders = document.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        const indicator = header.querySelector('.sort-indicator');
        const field = header.getAttribute('data-sort');
        
        if (currentSort.field === field) {
            indicator.textContent = currentSort.direction === 'asc' ? ' ▲' : ' ▼';
            indicator.style.opacity = '1';
        } else {
            indicator.textContent = '';
            indicator.style.opacity = '0';
        }
    });
}

// Refresh transactions
async function refreshTransactions() {
    const loadingElement = document.getElementById('transactionsLoading');
    
    try {
        // Show loading animation
        if (loadingElement) {
            loadingElement.style.display = 'flex';
        }
        
        showNotification('Обновление транзакций...');
        const response = await fetch('/api/transactions/refresh', {
            method: 'POST'
        });
        
        if (response.ok) {
            const data = await response.json();
            await loadTransactions();
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
    } finally {
        // Hide loading animation
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
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
    if (!address || address.length <= 6) return address;
    return address.substring(0, 2) + '...' + address.substring(address.length - 4);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Escape HTML attribute value (for data attributes, title, etc.)
function escapeHtmlAttr(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
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
        
        // Цвет больше не используется - все кошельки одинакового цвета
        
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
    const color = 'gray'; // Все кошельки одинакового цвета
    
    if (!newName) {
        alert('Wallet name cannot be empty');
        return;
    }
    
    try {
        const response = await fetch(`/api/wallets/${currentWalletId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName, color: color })
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

document.getElementById('reserveModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeReserveModal();
    }
});

// Reserves functions
let editingReserveId = null;

async function loadReserves() {
    try {
        const response = await fetch('/api/reserves');
        const data = await response.json();
        displayReserves(data.reserves);
        
        // Load total reserves
        const totalResponse = await fetch('/api/reserves/total');
        const totalData = await totalResponse.json();
        const totalReserves = totalData.total || 0;
        document.getElementById('totalReserves').textContent = Math.floor(totalReserves).toLocaleString('ru-RU');
        
        // Calculate and display available USDT
        updateAvailableUsdt(totalReserves);
    } catch (error) {
        console.error('Error loading reserves:', error);
    }
}

function displayReserves(reserves) {
    const reservesList = document.getElementById('reservesList');
    reservesList.innerHTML = '';
    
    if (reserves.length === 0) {
        return;
    }
    
    reserves.forEach(reserve => {
        const reserveItem = document.createElement('div');
        reserveItem.className = 'reserve-item';
        reserveItem.dataset.reserveId = reserve.id;
        
        const comment = reserve.comment || '-';
        const amount = parseFloat(reserve.amount).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        reserveItem.innerHTML = `
            <div class="reserve-content">
                <img src="/static/ico/freeze.svg" class="reserve-icon" alt="Reserve">
                <span class="reserve-comment">${escapeHtml(comment)}</span>
                <span class="reserve-amount">${amount}</span>
            </div>
            <div class="reserve-actions">
                <button class="btn-icon-small" onclick="editReserve(${reserve.id})" title="Edit">
                    <img src="/static/ico/edit.svg" class="wallet-icon" alt="Edit" onerror="this.style.display='none'; this.parentElement.innerHTML='✏️'">
                </button>
                <button class="btn-icon-small" onclick="deleteReserve(${reserve.id})" title="Delete">
                    <img src="/static/ico/trash.svg" class="wallet-icon" alt="Delete">
                </button>
            </div>
        `;
        
        reservesList.appendChild(reserveItem);
    });
}

function openReserveModal(reserveId = null) {
    editingReserveId = reserveId;
    const modal = document.getElementById('reserveModal');
    const title = document.getElementById('reserveModalTitle');
    const submitBtn = document.getElementById('reserveSubmitBtn');
    const form = document.getElementById('reserveForm');
    
    if (reserveId) {
        title.textContent = 'Edit Reserve';
        submitBtn.textContent = 'Save';
        
        // Load reserve data
        fetch(`/api/reserves`)
            .then(response => response.json())
            .then(data => {
                const reserve = data.reserves.find(r => r.id === reserveId);
                if (reserve) {
                    document.getElementById('reserveAmount').value = reserve.amount;
                    document.getElementById('reserveComment').value = reserve.comment || '';
                }
            });
    } else {
        title.textContent = 'Add Reserve';
        submitBtn.textContent = 'Add';
        form.reset();
    }
    
    modal.style.display = 'flex';
}

function closeReserveModal() {
    const modal = document.getElementById('reserveModal');
    modal.style.display = 'none';
    editingReserveId = null;
    document.getElementById('reserveForm').reset();
}

async function saveReserve(event) {
    event.preventDefault();
    
    const amount = parseFloat(document.getElementById('reserveAmount').value);
    const comment = document.getElementById('reserveComment').value.trim();
    
    if (amount <= 0) {
        alert('Amount must be greater than 0');
        return;
    }
    
    try {
        const url = editingReserveId 
            ? `/api/reserves/${editingReserveId}`
            : '/api/reserves';
        const method = editingReserveId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, comment })
        });
        
        if (response.ok) {
            closeReserveModal();
            loadReserves();
            updateAvailableUsdtFromReserves();
            showNotification(editingReserveId ? 'Reserve updated' : 'Reserve added');
        } else {
            const data = await response.json();
            alert(data.error || 'Error saving reserve');
        }
    } catch (error) {
        console.error('Error saving reserve:', error);
        alert('Error saving reserve');
    }
}

async function deleteReserve(reserveId) {
    try {
        const response = await fetch(`/api/reserves/${reserveId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadReserves();
            updateAvailableUsdtFromReserves();
        } else {
            alert('Error deleting reserve');
        }
    } catch (error) {
        console.error('Error deleting reserve:', error);
        alert('Error deleting reserve');
    }
}

function editReserve(reserveId) {
    openReserveModal(reserveId);
}

// Add Address to Address Book from Transaction
function openAddAddressModal(address) {
    const modal = document.getElementById('addAddressModal');
    const addressInput = document.getElementById('addressBookAddress');
    const customerInput = document.getElementById('addressBookCustomer');
    const managerInput = document.getElementById('addressBookManager');
    const amlStatusInput = document.getElementById('addressBookAmlStatus');
    
    addressInput.value = address;
    customerInput.value = '';
    managerInput.value = '';
    amlStatusInput.value = 'pending';
    
    modal.style.display = 'flex';
}

function closeAddAddressModal() {
    const modal = document.getElementById('addAddressModal');
    modal.style.display = 'none';
    document.getElementById('addAddressForm').reset();
}

async function saveAddressFromTransaction(event) {
    event.preventDefault();
    
    const customer = document.getElementById('addressBookCustomer').value.trim();
    const address = document.getElementById('addressBookAddress').value.trim();
    const manager = document.getElementById('addressBookManager').value.trim();
    const aml_status = document.getElementById('addressBookAmlStatus').value;
    
    if (!customer || !address) {
        alert('Customer name and address are required');
        return;
    }
    
    try {
        // Add address to address book
        const response = await fetch('/api/addressbook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                customer: customer,
                address: address,
                manager: manager || null,
                aml_status: aml_status
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            // Transactions are automatically updated on the backend
            if (data.updated_transactions && data.updated_transactions > 0) {
                showNotification(`Address added. Updated ${data.updated_transactions} transactions`);
                // Reload transactions to show updated names
                loadTransactions();
            } else {
                showNotification('Address added to address book');
            }
            
            closeAddAddressModal();
        } else {
            const errorData = await response.json();
            if (errorData.error === 'Address already exists' && errorData.existing) {
                const existing = errorData.existing;
                const dateStr = existing.date_added ? new Date(existing.date_added).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
                const message = `Address already exists!\n\nCustomer: ${existing.customer}\nManager: ${existing.manager || '-'}\nDate Added: ${dateStr}`;
                alert(message);
            } else {
                alert(errorData.error || 'Error adding address');
            }
        }
    } catch (error) {
        console.error('Error adding address:', error);
        alert('Error adding address');
    }
}

let pendingTransactionCommentId = null; // To store the ID of the transaction being edited

// Open transaction comment edit modal
function openTransactionCommentModal(transactionId, currentComment) {
    pendingTransactionCommentId = transactionId;
    const modal = document.getElementById('transactionCommentModal');
    const input = document.getElementById('transactionCommentInput');
    const charCount = document.getElementById('commentCharCount');
    
    if (modal && input) {
        input.value = currentComment || '';
        updateCommentCharCount();
        modal.classList.add('active');
        // Focus on input
        setTimeout(() => input.focus(), 100);
    } else {
        console.error('Transaction comment modal not found');
    }
}

// Close transaction comment modal
function closeTransactionCommentModal() {
    const modal = document.getElementById('transactionCommentModal');
    if (modal) {
        modal.classList.remove('active');
    }
    pendingTransactionCommentId = null;
}

// Update character count
function updateCommentCharCount() {
    const input = document.getElementById('transactionCommentInput');
    const charCount = document.getElementById('commentCharCount');
    if (input && charCount) {
        const length = input.value.length;
        charCount.textContent = `${length} / 500 characters`;
    }
}

// Save transaction comment
async function saveTransactionComment() {
    if (pendingTransactionCommentId === null) {
        console.error('No transaction ID pending for comment update.');
        return;
    }
    
    const input = document.getElementById('transactionCommentInput');
    if (!input) {
        console.error('Comment input not found');
        return;
    }
    
    const transactionId = pendingTransactionCommentId;
    const comment = input.value.trim();
    
    try {
        const response = await fetch(`/api/transactions/${transactionId}/comment`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ comment: comment || null })
        });
        
        if (response.ok) {
            closeTransactionCommentModal();
            loadTransactions();
            showNotification('Comment updated');
        } else {
            const data = await response.json();
            alert(data.error || 'Error updating comment');
        }
    } catch (error) {
        console.error('Error updating comment:', error);
        alert('Error updating comment');
    }
}

// Edit transaction comment (opens modal) - called from onclick
function editTransactionCommentFromElement(element) {
    if (!element) {
        console.error('Element not provided to editTransactionCommentFromElement');
        return;
    }
    const transactionId = parseInt(element.getAttribute('data-transaction-id'));
    const currentComment = element.getAttribute('data-comment') || '';
    
    if (isNaN(transactionId)) {
        console.error('Invalid transaction ID:', element.getAttribute('data-transaction-id'));
        return;
    }
    
    editTransactionComment(transactionId, currentComment);
}

// Edit transaction comment (opens modal)
function editTransactionComment(transactionId, currentComment) {
    openTransactionCommentModal(transactionId, currentComment);
}

// Edit transaction type
// Store current transaction ID for type selection
let pendingTransactionTypeId = null;

// Open transaction type selection modal
function editTransactionType(transactionId, currentType) {
    pendingTransactionTypeId = transactionId;
    const modal = document.getElementById('transactionTypeModal');
    if (modal) {
        modal.classList.add('active');
        
        // Highlight current type if exists
        const buttons = modal.querySelectorAll('button[onclick^="selectTransactionType"]');
        buttons.forEach(btn => {
            const typeMatch = btn.getAttribute('onclick').match(/selectTransactionType\('([^']*)'\)/);
            if (typeMatch && typeMatch[1] === currentType) {
                btn.style.backgroundColor = 'var(--accent-color)';
                btn.style.color = 'white';
            } else {
                btn.style.backgroundColor = '';
                btn.style.color = '';
            }
        });
    }
}

// Close transaction type modal
function closeTransactionTypeModal() {
    const modal = document.getElementById('transactionTypeModal');
    if (modal) {
        modal.classList.remove('active');
    }
    pendingTransactionTypeId = null;
}

// Select transaction type and save
async function selectTransactionType(type) {
    if (!pendingTransactionTypeId) {
        return;
    }
    
    const transactionType = type || null;
    
    try {
        const response = await fetch(`/api/transactions/${pendingTransactionTypeId}/type`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ transaction_type: transactionType })
        });
        
        if (response.ok) {
            closeTransactionTypeModal();
            loadTransactions();
            showNotification('Transaction type updated');
        } else {
            const errorData = await response.json().catch(() => ({}));
            alert(errorData.error || 'Error updating transaction type');
        }
    } catch (error) {
        console.error('Error updating transaction type:', error);
        alert('Error updating transaction type');
    }
}

// Close modal on outside click
document.addEventListener('DOMContentLoaded', function() {
    const transactionTypeModal = document.getElementById('transactionTypeModal');
    if (transactionTypeModal) {
        transactionTypeModal.addEventListener('click', function(e) {
            if (e.target === transactionTypeModal) {
                closeTransactionTypeModal();
            }
        });
    }
    
    // Setup transaction comment modal
    const transactionCommentModal = document.getElementById('transactionCommentModal');
    if (transactionCommentModal) {
        transactionCommentModal.addEventListener('click', function(e) {
            if (e.target === transactionCommentModal) {
                closeTransactionCommentModal();
            }
        });
    }
    
    // Setup character counter for comment input
    const commentInput = document.getElementById('transactionCommentInput');
    if (commentInput) {
        commentInput.addEventListener('input', updateCommentCharCount);
        commentInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                saveTransactionComment();
            }
        });
    }
});

// Export transactions to Excel
function exportToExcel() {
    // Check if XLSX library is loaded
    if (typeof XLSX === 'undefined') {
        alert('Excel export library is not loaded. Please refresh the page.');
        console.error('XLSX library not found. Make sure SheetJS is loaded.');
        return;
    }
    
    if (!allTransactions || allTransactions.length === 0) {
        alert('No transactions to export');
        return;
    }
    
    // Get current filter states
    const hideSmall = document.getElementById('hideSmall') ? document.getElementById('hideSmall').checked : false;
    const hideTrx = document.getElementById('hideTrx') ? document.getElementById('hideTrx').checked : false;
    const hideOwnFundTransfer = document.getElementById('hideOwnFundTransfer') ? document.getElementById('hideOwnFundTransfer').checked : false;
    
    // Apply filters to transactions
    let filteredTransactions = [...allTransactions];
    
    // Filter TRX transactions if hideTrx is enabled
    if (hideTrx) {
        filteredTransactions = filteredTransactions.filter(tx => tx.currency !== 'TRX');
    }
    
    // Filter small USDT transactions if hideSmall is enabled
    if (hideSmall) {
        filteredTransactions = filteredTransactions.filter(tx => {
            if (tx.currency === 'USDT' && tx.amount < 10.0) {
                return false;
            }
            return true;
        });
    }
    
    // Filter own fund transfers if hideOwnFundTransfer is enabled
    if (hideOwnFundTransfer) {
        filteredTransactions = filteredTransactions.filter(tx => tx.comment !== 'Own fund transfer');
    }
    
    if (filteredTransactions.length === 0) {
        alert('No transactions to export after applying filters');
        return;
    }
    
    // Prepare data for Excel
    const excelData = filteredTransactions.map(tx => {
        const date = new Date(tx.created_at);
        const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        
        // Format amount as number (not text) for Excel
        let amountNum;
        if (tx.type === 'approve') {
            // For approve, show positive number
            amountNum = tx.amount;
        } else {
            // For incoming: positive, for outgoing: negative
            amountNum = tx.direction === 'incoming' ? tx.amount : -tx.amount;
        }
        
        const address = tx.direction === 'incoming' ? tx.from_address : tx.to_address;
        
        return {
            'Date': dateStr,
            'Time': timeStr,
            'Type': tx.type || 'transfer',
            'Amount': amountNum,  // Number format, not text
            'Direction': tx.direction,
            'Wallet': tx.wallet_name,
            'From/To': tx.counterparty_name || '-',
            'Transaction Type': tx.transaction_type || '',
            'Comment': tx.comment || '-',
            'Address': address || '-'
        };
    });
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Set column widths
    const colWidths = [
        { wch: 12 }, // Date
        { wch: 10 }, // Time
        { wch: 12 }, // Type
        { wch: 15 }, // Amount
        { wch: 10 }, // Direction
        { wch: 20 }, // Wallet
        { wch: 20 }, // From/To
        { wch: 15 }, // Transaction Type
        { wch: 30 }, // Comment
        { wch: 40 }  // Address
    ];
    ws['!cols'] = colWidths;
    
    // Format Amount column as number with 2 decimal places
    const range = XLSX.utils.decode_range(ws['!ref']);
    const amountColIndex = 3; // Amount is 4th column (0-indexed: Date=0, Time=1, Type=2, Amount=3)
    
    for (let row = 1; row <= range.e.r; row++) { // Skip header row (row 0)
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: amountColIndex });
        if (ws[cellAddress]) {
            // Ensure the cell is treated as a number
            ws[cellAddress].z = '#,##0.00'; // Number format with 2 decimal places and thousands separator
        }
    }
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
    
    // Generate filename with current date
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const filename = `transactions_${dateStr}.xlsx`;
    
    // Save file
    XLSX.writeFile(wb, filename);
    
    showNotification('Transactions exported to Excel');
}