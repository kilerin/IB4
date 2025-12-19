let sortableInstance = null;

// Load wallets on page load
document.addEventListener('DOMContentLoaded', function() {
    // Restore toggle states from localStorage
    const hideSmall = localStorage.getItem('hideSmallTransactions') === 'true';
    const hideTrx = localStorage.getItem('hideTrxTransactions') === 'true';
    
    const hideSmallCheckbox = document.getElementById('hideSmall');
    const hideTrxCheckbox = document.getElementById('hideTrx');
    
    if (hideSmallCheckbox) {
        hideSmallCheckbox.checked = hideSmall;
    }
    if (hideTrxCheckbox) {
        hideTrxCheckbox.checked = hideTrx;
    }
    
    loadWallets();
    loadTransactions();
    loadReserves();
    updateHiddenToggleIcon();
    
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
        
        const amlDate = wallet.aml_checked_at 
            ? new Date(wallet.aml_checked_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Never';
        
        const usdtAmount = Math.floor(wallet.balance_usdt).toLocaleString('ru-RU');
        const trxAmount = Math.floor(wallet.balance_trx).toLocaleString('ru-RU');
        
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
                        <button class="wallet-icon-btn" onclick="openAmlConfirmModal(${wallet.id || 'null'})" title="Check AML" data-wallet-id="${wallet.id || ''}">
                            <img src="/static/ico/shield-check.svg" class="wallet-icon" alt="AML">
                        </button>
                        ${wallet.aml_checking ? `
                            <div class="aml-progress-container">
                                <div class="aml-progress-bar">
                                    <div class="aml-progress-fill"></div>
                                </div>
                            </div>
                        ` : `
                            ${wallet.aml_status === 'checked' && wallet.aml_score !== null ? `
                                <span class="wallet-aml-status"><span class="risk-level risk-level-${(wallet.aml_risk_level || 'undefined').toLowerCase()}">${(wallet.aml_risk_level || 'N/A').toUpperCase()}</span> <span class="risk-score">${parseFloat(wallet.aml_score).toFixed(1)}%</span></span>
                            ` : `
                                <span class="wallet-aml-status">${wallet.aml_status || 'Pending'}</span>
                            `}
                            <span class="wallet-aml-date text-muted">${amlDate}</span>
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
                loadWallets();
                alert('AML check timeout');
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
    const color = document.querySelector('input[name="walletColor"]:checked')?.value || 'gray';
    
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
                ${address ? `
                    <img src="/static/ico/copy.svg" class="copy-icon" onclick="copyToClipboard('${escapeHtml(address)}')" title="Copy address" alt="Copy">
                    <img src="/static/ico/vote.svg" class="copy-icon" onclick="openAddAddressModal('${escapeHtml(address)}')" title="Add to Address Book" alt="Add" style="margin-left: 4px;">
                ` : ''}
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
        
        // Set color
        const color = wallet.color || 'gray';
        // Map color names to capitalized form for ID matching
        const colorMap = {
            'red': 'Red',
            'blue': 'Blue',
            'purple': 'Purple',
            'gray': 'Gray',
            'green': 'Green',
            'orange': 'Orange',
            'yellow': 'Yellow'
        };
        const colorCapitalized = colorMap[color] || 'Gray';
        const colorRadio = document.getElementById(`detailsColor${colorCapitalized}`);
        if (colorRadio) {
            colorRadio.checked = true;
        }
        
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
    const color = document.querySelector('input[name="walletDetailsColor"]:checked')?.value || 'gray';
    
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
            showNotification('Address added to address book');
            
            // Update all transactions with this address
            const updateResponse = await fetch('/api/transactions/update-counterparty', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    address: address
                })
            });
            
            if (updateResponse.ok) {
                const updateData = await updateResponse.json();
                showNotification(`Updated ${updateData.updated_count} transactions`);
                // Reload transactions to show updated names
                loadTransactions();
            } else {
                console.error('Error updating transactions');
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
    
    // Prepare data for Excel
    const excelData = allTransactions.map(tx => {
        const date = new Date(tx.created_at);
        const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        
        // Format amount for Excel (no plus sign, no thousands separator)
        let amountStr = '';
        if (tx.type === 'approve') {
            // For approve, just show the number without formatting
            amountStr = tx.amount.toFixed(2).replace('.', ',');
        } else {
            // Format number: 2 decimal places, comma as decimal separator, no thousands separator, no plus for incoming
            const formatted = tx.amount.toFixed(2).replace('.', ',');
            amountStr = tx.direction === 'incoming' ? formatted : `-${formatted}`;
        }
        
        const address = tx.direction === 'incoming' ? tx.from_address : tx.to_address;
        
        return {
            'Currency': tx.currency,
            'Type': tx.type || 'transfer',
            'Amount': amountStr,
            'Direction': tx.direction,
            'Wallet': tx.wallet_name,
            'From/To': tx.counterparty_name || '-',
            'Address': address || '-',
            'Date': dateStr,
            'Time': timeStr,
            'AML Status': tx.aml_status || 'pending'
        };
    });
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Set column widths
    const colWidths = [
        { wch: 10 }, // Currency
        { wch: 12 }, // Type
        { wch: 15 }, // Amount
        { wch: 10 }, // Direction
        { wch: 20 }, // Wallet
        { wch: 20 }, // From/To
        { wch: 40 }, // Address
        { wch: 12 }, // Date
        { wch: 10 }, // Time
        { wch: 12 }  // AML Status
    ];
    ws['!cols'] = colWidths;
    
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

