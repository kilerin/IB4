// Transit Payments JavaScript

let selectedChannelId = null;
let currentEditingChannelId = null;
let channelTypeModalMode = 'add'; // 'add' or 'edit'

// Load channels on page load
document.addEventListener('DOMContentLoaded', async function() {
    await loadChannels();
    
    // Restore last selected channel from localStorage
    const lastChannelId = localStorage.getItem('lastSelectedChannelId');
    if (lastChannelId) {
        const channelId = parseInt(lastChannelId);
        selectedChannelId = channelId;
        await loadChannelPayments(channelId);
        await loadIncomingPayments(channelId);
        await loadChannelAdditionalInfo(channelId);
        loadChannels(); // Refresh to update selected state
    } else {
        // Clear incoming payments table if no channel selected
        document.getElementById('incomingPaymentsTable').innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">
                    Select a channel to manage incoming payments
                </td>
            </tr>
        `;
        // Clear additional info fields
        document.getElementById('agentBalanceInput').value = '';
        document.getElementById('notPaidOrdersInput').value = '';
    }
    
    // Close modals when clicking outside
    const modals = ['addChannelModal', 'editChannelModal', 'channelTypeModal', 'editChannelTypeModal', 'addIncomingPaymentModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    if (modalId === 'addChannelModal') closeAddChannelModal();
                    else if (modalId === 'editChannelModal') closeEditChannelModal();
                    else if (modalId === 'channelTypeModal') closeChannelTypeModal();
                    else if (modalId === 'editChannelTypeModal') closeEditChannelTypeModal();
                    else if (modalId === 'addIncomingPaymentModal') closeAddIncomingPaymentModal();
                }
            });
        }
    });
});

// Load all channels
async function loadChannels() {
    try {
        const response = await fetch('/api/channels');
        const data = await response.json();
        displayChannels(data.channels);
    } catch (error) {
        console.error('Error loading channels:', error);
        showNotification('Error loading channels', 'error');
    }
}

// Display channels in the list
function displayChannels(channels) {
    const channelList = document.getElementById('channelList');
    channelList.innerHTML = '';
    
    if (channels.length === 0) {
        channelList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No channels yet. Click "Add Channel" to create one.</div>';
        return;
    }
    
    channels.forEach(channel => {
        const channelItem = document.createElement('div');
        channelItem.className = 'wallet-item';
        channelItem.dataset.channelId = channel.id;
        channelItem.onclick = () => selectChannel(channel.id);
        
        if (selectedChannelId === channel.id) {
            channelItem.style.borderColor = 'var(--accent-color)';
            channelItem.style.backgroundColor = 'var(--bg-secondary)';
        }
        
        channelItem.innerHTML = `
            <div class="wallet-content" style="flex-direction: row; align-items: center; justify-content: space-between;">
                <div class="wallet-left" style="flex: 1;">
                    <span class="wallet-name clickable">${escapeHtml(channel.name)}</span>
                    <span class="wallet-address-suffix">${escapeHtml(channel.transaction_type)}</span>
                </div>
                <button class="wallet-icon-btn" onclick="event.stopPropagation(); openEditChannelModal(${channel.id})" title="Edit channel">
                    <img src="/static/ico/edit.svg" class="wallet-icon" alt="Edit" onerror="this.style.display='none'; this.parentElement.innerHTML='✏️'">
                </button>
            </div>
        `;
        
        channelList.appendChild(channelItem);
    });
}

// Select a channel and load its payments
async function selectChannel(channelId) {
    selectedChannelId = channelId;
    // Save selected channel to localStorage
    localStorage.setItem('lastSelectedChannelId', channelId.toString());
    await loadChannelPayments(channelId);
    await loadIncomingPayments(channelId);
    await loadChannelAdditionalInfo(channelId);
    loadChannels(); // Refresh to update selected state
}

// Load additional info (agent balance, customer balance) for a channel
async function loadChannelAdditionalInfo(channelId) {
    try {
        const response = await fetch(`/api/channels`);
        const data = await response.json();
        const channel = data.channels.find(c => c.id === channelId);
        if (channel) {
            document.getElementById('agentBalanceInput').value = formatNumberWithSpaces(channel.agent_balance || 0, 2);
            document.getElementById('notPaidOrdersInput').value = formatNumberWithSpaces(channel.not_paid_orders || 0, 0);
        }
    } catch (error) {
        console.error('Error loading channel additional info:', error);
    }
}

// Format number with space as thousands separator
function formatNumberWithSpaces(value, decimals = 2) {
    if (value === null || value === undefined || value === '') return '0';
    const num = parseFloat(value);
    if (isNaN(num)) return '0';
    
    // Format with specified decimals
    const formatted = num.toFixed(decimals);
    
    // Split into integer and decimal parts
    const parts = formatted.split('.');
    const integerPart = parts[0];
    const decimalPart = decimals > 0 ? '.' + parts[1] : '';
    
    // Add space as thousands separator
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    
    return formattedInteger + decimalPart;
}

// Parse formatted number (remove spaces and convert to number)
function parseFormattedNumber(value) {
    if (!value || value === '') return 0;
    // Remove spaces and convert to number
    const cleaned = value.toString().replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

// Format Agent Balance input on focus
function formatAgentBalanceInput(onFocus) {
    const input = document.getElementById('agentBalanceInput');
    if (onFocus) {
        // On focus: show raw value without formatting
        const value = parseFormattedNumber(input.value);
        input.value = value === 0 ? '' : value.toString();
    }
}

// Format Customer balance input on focus
function formatNotPaidOrdersInput(onFocus) {
    const input = document.getElementById('notPaidOrdersInput');
    if (onFocus) {
        // On focus: show raw value without formatting
        const value = parseFormattedNumber(input.value);
        input.value = value === 0 ? '' : Math.floor(value).toString();
    }
}

// Format and update Agent Balance
async function formatAndUpdateAgentBalance() {
    const input = document.getElementById('agentBalanceInput');
    const agentBalance = parseFormattedNumber(input.value);
    input.value = formatNumberWithSpaces(agentBalance, 2);
    await updateChannelAgentBalance();
}

// Format and update Customer balance
async function formatAndUpdateNotPaidOrders() {
    const input = document.getElementById('notPaidOrdersInput');
    const notPaidOrders = Math.floor(parseFormattedNumber(input.value));
    input.value = formatNumberWithSpaces(notPaidOrders, 0);
    await updateChannelNotPaidOrders();
}

// Update channel agent balance
async function updateChannelAgentBalance() {
    if (!selectedChannelId) return;
    
    const input = document.getElementById('agentBalanceInput');
    const agentBalance = parseFormattedNumber(input.value);
    
    try {
        const response = await fetch(`/api/channels/${selectedChannelId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                agent_balance: agentBalance
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update agent balance');
        }
        
        // Reload channel data to get updated values
        const channelResponse = await fetch(`/api/channels`);
        const channelData = await channelResponse.json();
        const channel = channelData.channels.find(c => c.id === selectedChannelId);
        if (channel) {
            document.getElementById('agentBalanceInput').value = formatNumberWithSpaces(channel.agent_balance || 0, 2);
        }
        
        // Reload payments table to update Saldo
        await loadChannelPayments(selectedChannelId);
    } catch (error) {
        console.error('Error updating agent balance:', error);
        showNotification('Error updating agent balance', 'error');
    }
}

// Update channel customer balance
async function updateChannelNotPaidOrders() {
    if (!selectedChannelId) return;
    
    const input = document.getElementById('notPaidOrdersInput');
    const notPaidOrders = Math.floor(parseFormattedNumber(input.value));
    
    try {
        const response = await fetch(`/api/channels/${selectedChannelId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                not_paid_orders: notPaidOrders
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update customer balance');
        }
        
        // Reload channel data to get updated values
        const channelResponse = await fetch(`/api/channels`);
        const channelData = await channelResponse.json();
        const channel = channelData.channels.find(c => c.id === selectedChannelId);
        if (channel) {
            document.getElementById('notPaidOrdersInput').value = formatNumberWithSpaces(channel.not_paid_orders || 0, 0);
        }
        
        // Reload payments table to update Saldo
        await loadChannelPayments(selectedChannelId);
    } catch (error) {
        console.error('Error updating customer balance:', error);
        showNotification('Error updating customer balance', 'error');
    }
}

// Load incoming payments for a channel
async function loadIncomingPayments(channelId) {
    try {
        const response = await fetch(`/api/channels/${channelId}/incoming-payments`);
        const data = await response.json();
        displayIncomingPayments(data.incoming_payments);
    } catch (error) {
        console.error('Error loading incoming payments:', error);
        showNotification('Error loading incoming payments', 'error');
    }
}

// Display incoming payments in the table
function displayIncomingPayments(payments) {
    const incomingPaymentsTable = document.getElementById('incomingPaymentsTable');
    
    if (!selectedChannelId) {
        incomingPaymentsTable.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">
                    Select a channel to manage incoming payments
                </td>
            </tr>
        `;
        return;
    }
    
    if (payments.length === 0) {
        incomingPaymentsTable.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">
                    No incoming payments. Click "+ Add" to add one.
                </td>
            </tr>
        `;
        return;
    }
    
    console.log('Displaying payments:', payments);  // Debug
    
    incomingPaymentsTable.innerHTML = payments.map(payment => {
        const sumAmount = (payment.sum_amount !== null && payment.sum_amount !== undefined && payment.sum_amount !== 0 && payment.sum_amount !== '') ? payment.sum_amount : '';
        const sumAmountFormatted = sumAmount ? formatNumberWithSpaces(sumAmount) : '';
        const agent = (payment.agent !== null && payment.agent !== undefined && payment.agent !== '') ? payment.agent : '';
        const fromAddress = (payment.from_address !== null && payment.from_address !== undefined && payment.from_address !== '') ? payment.from_address : '';
        const date = (payment.date !== null && payment.date !== undefined && payment.date !== '') ? payment.date : '';
        
        console.log(`Payment ${payment.id}: sum=${sumAmount}, agent=${agent}, from=${fromAddress}, date=${date}`);  // Debug
        
        return `
        <tr data-payment-id="${payment.id}">
            <td>
                <input type="text" class="form-input incoming-payment-sum" 
                       value="${sumAmountFormatted}" 
                       data-original-value="${sumAmount || ''}"
                       data-payment-id="${payment.id}"
                       placeholder="0"
                       onfocus="handleSumInputFocus(this)"
                       onblur="handleSumInputBlur(this)"
                       oninput="handleSumInputChange(this)"
                       style="width: 100%; padding: 4px; font-size: 12px; text-align: right;">
            </td>
            <td>
                <input type="text" class="form-input" value="${escapeHtml(agent)}" 
                       onchange="updateIncomingPayment(${payment.id}, 'agent', this.value)" 
                       style="width: 100%; padding: 4px; font-size: 12px;">
            </td>
            <td>
                <input type="text" class="form-input" value="${escapeHtml(fromAddress)}" 
                       onchange="updateIncomingPayment(${payment.id}, 'from_address', this.value)" 
                       style="width: 100%; padding: 4px; font-size: 12px;">
            </td>
            <td>
                <input type="date" class="form-input" value="${date}" 
                       onchange="updateIncomingPayment(${payment.id}, 'date', this.value)" 
                       style="width: 100%; padding: 4px; font-size: 12px;">
            </td>
            <td>
                <button class="btn-icon-small" onclick="deleteIncomingPayment(${payment.id})" title="Delete">
                    <img src="/static/ico/trash.svg" class="wallet-icon" alt="Delete" onerror="this.style.display='none'; this.parentElement.innerHTML='🗑️'">
                </button>
            </td>
        </tr>
    `;
    }).join('');
}

// Add new incoming payment row directly in table
async function addIncomingPaymentRow() {
    if (!selectedChannelId) {
        alert('Please select a channel first');
        return;
    }
    
    try {
        // Create empty payment in database
        const response = await fetch(`/api/channels/${selectedChannelId}/incoming-payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sum_amount: 0,
                agent: '',
                from_address: '',
                date: ''
            })
        });
        
        if (response.ok) {
            await loadIncomingPayments(selectedChannelId);
            // Reload payments statistics to update "Incoming payments" column
            if (selectedChannelId) {
                await loadChannelPayments(selectedChannelId);
            }
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to add payment');
        }
    } catch (error) {
        console.error('Error adding payment:', error);
        alert('Error adding payment: ' + error.message);
    }
}

// Update single field of incoming payment (used for sum_amount field)
async function updateIncomingPaymentField(paymentId, field, value) {
    try {
        const paymentRow = document.querySelector(`tr[data-payment-id="${paymentId}"]`);
        if (!paymentRow) {
            console.error('Payment row not found for ID:', paymentId);
            return;
        }
        
        const inputs = paymentRow.querySelectorAll('input');
        if (!inputs || inputs.length < 4) {
            console.error('Inputs not found in payment row');
            return;
        }
        
        // Get current values from inputs safely
        const sumInput = inputs[0];
        let sumValue = 0;
        
        if (field === 'sum_amount') {
            // Use the provided value, ensure it's a number
            if (value === null || value === undefined || value === '') {
                sumValue = 0;
            } else {
                const numValue = typeof value === 'string' ? parseFloat(value.replace(/\s/g, '').replace(',', '.')) : value;
                sumValue = isNaN(numValue) ? 0 : numValue;
            }
        } else {
            // Get sum from input field
            if (sumInput.classList.contains('incoming-payment-sum')) {
                const rawValue = sumInput.dataset.originalValue || sumInput.value || '';
                if (rawValue) {
                    const cleaned = rawValue.toString().replace(/\s/g, '').replace(',', '.');
                    const num = parseFloat(cleaned);
                    sumValue = isNaN(num) ? 0 : num;
                }
            } else {
                const num = parseFloat(sumInput.value || 0);
                sumValue = isNaN(num) ? 0 : num;
            }
        }
        
        // Get other field values safely
        const agent = (inputs[1] && inputs[1].value) ? inputs[1].value.trim() : '';
        const fromAddress = (inputs[2] && inputs[2].value) ? inputs[2].value.trim() : '';
        const date = (inputs[3] && inputs[3].value) ? inputs[3].value.trim() : '';
        
        const data = {
            sum_amount: sumValue,
            agent: agent,
            from_address: fromAddress,
            date: date
        };
        
        console.log('Updating payment:', paymentId, 'with data:', data); // Debug
        
        const response = await fetch(`/api/incoming-payments/${paymentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Update error:', errorData);
            // Don't reload immediately, let user see the error
            throw new Error(errorData.error || 'Failed to update payment');
        } else {
            const result = await response.json();
            console.log('Update successful:', result); // Debug
            // Reload payments statistics to update "Incoming payments" column
            if (selectedChannelId) {
                await loadChannelPayments(selectedChannelId);
            }
        }
    } catch (error) {
        console.error('Error updating payment:', error);
        // Show error but don't reload immediately - let user fix the value
        // Only reload if it's a critical error
        if (error.message && error.message.includes('404')) {
            // Payment not found, reload the table
            if (selectedChannelId) {
                await loadIncomingPayments(selectedChannelId);
            }
        }
    }
}

// Update incoming payment (used for other fields like agent, from_address, date)
async function updateIncomingPayment(paymentId, field, value) {
    await updateIncomingPaymentField(paymentId, field, value);
}

// Delete incoming payment
async function deleteIncomingPayment(paymentId) {
    if (!confirm('Are you sure you want to delete this payment?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/incoming-payments/${paymentId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadIncomingPayments(selectedChannelId);
            // Reload payments statistics to update "Incoming payments" column
            if (selectedChannelId) {
                await loadChannelPayments(selectedChannelId);
            }
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to delete payment');
        }
    } catch (error) {
        console.error('Error deleting payment:', error);
        alert('Error deleting payment');
    }
}

// Load payments for a channel
async function loadChannelPayments(channelId) {
    try {
        const response = await fetch(`/api/channels/${channelId}/payments`);
        const data = await response.json();
        displayPayments(data);
    } catch (error) {
        console.error('Error loading payments:', error);
        showNotification('Error loading payments', 'error');
    }
}

// Display payments in the table
function displayPayments(data) {
    const paymentsTable = document.getElementById('paymentsTable');
    const paymentsTableTitle = document.getElementById('paymentsTableTitle');
    
    paymentsTableTitle.textContent = data.channel_name || 'Payments';
    
    // Update Agent Balance and Customer balance fields in header
    const agentBalanceInput = document.getElementById('agentBalanceInput');
    const notPaidOrdersInput = document.getElementById('notPaidOrdersInput');
    if (agentBalanceInput) {
        agentBalanceInput.value = formatNumberWithSpaces(data.agent_balance || 0, 2);
    }
    if (notPaidOrdersInput) {
        notPaidOrdersInput.value = formatNumberWithSpaces(data.not_paid_orders || 0, 0);
    }
    
    let rowsHtml = '';
    
    // Always add total row at the beginning
    rowsHtml += `
        <tr style="font-weight: bold; background-color: var(--bg-secondary);">
            <td>Total</td>
            <td>${formatAmount(data.in || 0)}</td>
            <td>${formatAmount(data.out || 0)}</td>
            <td>${formatAmount(data.inc_pmts || 0)}</td>
            <td>${formatAmount(data.agent_balance || 0)}</td>
            <td>${formatAmount(data.saldo || 0)}</td>
        </tr>
    `;
    
    // Display individual transaction rows if available
    if (data.payment_rows && data.payment_rows.length > 0) {
        // Display each transaction row (already sorted newest first)
        for (const row of data.payment_rows) {
            const dateStr = row.date ? new Date(row.date + 'T00:00:00').toLocaleDateString('ru-RU') : '';
            rowsHtml += `
                <tr>
                    <td>${dateStr}</td>
                    <td>${formatAmount(row.in)}</td>
                    <td>${formatAmount(row.out)}</td>
                    <td>${formatAmount(row.incoming_payment)}</td>
                    <td>${formatAmount(row.profit)}</td>
                    <td>${formatAmount(row.saldo)}</td>
                </tr>
            `;
        }
    }
    
    paymentsTable.innerHTML = rowsHtml;
}

// Load incoming payments for a channel
async function loadIncomingPayments(channelId) {
    try {
        const response = await fetch(`/api/channels/${channelId}/incoming-payments`);
        const data = await response.json();
        displayIncomingPayments(data.incoming_payments);
    } catch (error) {
        console.error('Error loading incoming payments:', error);
        showNotification('Error loading incoming payments', 'error');
    }
}

// Format amount for display
function formatAmount(amount) {
    if (amount === null || amount === undefined) return '-';
    const num = parseFloat(amount);
    if (isNaN(num) || num === 0) return '-';
    return num.toLocaleString('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Format number with spaces as thousand separator
function formatNumberWithSpaces(value) {
    if (!value && value !== 0) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    
    // Split into integer and decimal parts
    const parts = num.toString().split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1] || '';
    
    // Add spaces every 3 digits from right
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    
    return decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;
}

// Parse sum value (remove spaces and convert to number)
function parseSumValue(value) {
    if (!value || value === '') return '';
    const cleaned = value.toString().replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? '' : num.toString();
}

// Handle sum input focus - show raw value for editing
function handleSumInputFocus(input) {
    const rawValue = input.dataset.originalValue || '';
    if (rawValue) {
        input.value = rawValue;
    } else if (input.value) {
        // If no original value, parse current formatted value
        const parsed = parseSumValue(input.value);
        input.value = parsed || '';
        input.dataset.originalValue = parsed || '';
    }
}

// Handle sum input change - allow typing without validation
function handleSumInputChange(input) {
    // Just allow typing, don't validate or format during input
    // Store the current raw value
    const currentValue = input.value.replace(/\s/g, '').replace(',', '.');
    input.dataset.originalValue = currentValue;
}

// Handle sum input blur - format and save
function handleSumInputBlur(input) {
    const paymentId = input.dataset.paymentId;
    if (!paymentId) {
        console.warn('No payment ID found for input');
        return;
    }
    
    // Get raw value from input or dataset
    let rawValue = input.value || '';
    if (rawValue) {
        rawValue = rawValue.replace(/\s/g, '').replace(',', '.');
    }
    
    // Parse the value
    const num = rawValue ? parseFloat(rawValue) : 0;
    
    if (!rawValue || rawValue === '' || isNaN(num)) {
        // If empty or invalid, set to 0 but keep field empty visually
        input.value = '';
        input.dataset.originalValue = '0';
        // Update with zero value
        updateIncomingPaymentField(parseInt(paymentId), 'sum_amount', 0);
    } else {
        // Format and save
        const formatted = formatNumberWithSpaces(num);
        input.value = formatted;
        input.dataset.originalValue = num.toString();
        // Update with numeric value
        updateIncomingPaymentField(parseInt(paymentId), 'sum_amount', num);
    }
}

// Format sum input on blur (deprecated - use handleSumInputBlur instead)
function formatSumInput(input) {
    handleSumInputBlur(input);
}

// Show notification
function showNotification(message, type = 'success') {
    // Simple notification - can be enhanced later
    alert(message);
}

// Modal functions
function openAddChannelModal() {
    document.getElementById('addChannelModal').classList.add('active');
    document.getElementById('channelName').value = '';
    document.getElementById('channelType').value = '';
    document.getElementById('channelTypeBtn').textContent = 'Select Type';
}

function closeAddChannelModal() {
    document.getElementById('addChannelModal').classList.remove('active');
}

function openEditChannelModal(channelId) {
    currentEditingChannelId = channelId;
    // Load channel data
    fetch(`/api/channels`)
        .then(response => response.json())
        .then(data => {
            const channel = data.channels.find(c => c.id === channelId);
            if (channel) {
                document.getElementById('editChannelId').value = channel.id;
                document.getElementById('editChannelName').value = channel.name;
                document.getElementById('editChannelType').value = channel.transaction_type;
                document.getElementById('editChannelTypeBtn').textContent = channel.transaction_type;
                document.getElementById('editChannelModal').classList.add('active');
            }
        })
        .catch(error => {
            console.error('Error loading channel:', error);
            showNotification('Error loading channel', 'error');
        });
}

function closeEditChannelModal() {
    document.getElementById('editChannelModal').classList.remove('active');
    currentEditingChannelId = null;
}

function openChannelTypeModal() {
    channelTypeModalMode = 'add';
    document.getElementById('channelTypeModal').classList.add('active');
}

function closeChannelTypeModal() {
    document.getElementById('channelTypeModal').classList.remove('active');
}

function selectChannelType(type) {
    document.getElementById('channelType').value = type;
    document.getElementById('channelTypeBtn').textContent = type;
    closeChannelTypeModal();
}

function openEditChannelTypeModal() {
    channelTypeModalMode = 'edit';
    document.getElementById('editChannelTypeModal').classList.add('active');
}

function closeEditChannelTypeModal() {
    document.getElementById('editChannelTypeModal').classList.remove('active');
}

function selectEditChannelType(type) {
    document.getElementById('editChannelType').value = type;
    document.getElementById('editChannelTypeBtn').textContent = type;
    closeEditChannelTypeModal();
}

// Add channel
async function addChannel(event) {
    event.preventDefault();
    
    const name = document.getElementById('channelName').value.trim();
    const transactionType = document.getElementById('channelType').value;
    
    if (!name) {
        alert('Channel name is required');
        return;
    }
    
    if (!transactionType) {
        alert('Transaction type is required');
        return;
    }
    
    try {
        const response = await fetch('/api/channels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, transaction_type: transactionType })
        });
        
        if (response.ok) {
            closeAddChannelModal();
            loadChannels();
            showNotification('Channel added successfully');
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to add channel');
        }
    } catch (error) {
        console.error('Error adding channel:', error);
        alert('Error adding channel');
    }
}

// Save channel changes
async function saveChannelChanges(event) {
    event.preventDefault();
    
    const channelId = parseInt(document.getElementById('editChannelId').value);
    const name = document.getElementById('editChannelName').value.trim();
    const transactionType = document.getElementById('editChannelType').value;
    
    if (!name) {
        alert('Channel name is required');
        return;
    }
    
    if (!transactionType) {
        alert('Transaction type is required');
        return;
    }
    
    try {
        const response = await fetch(`/api/channels/${channelId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, transaction_type: transactionType })
        });
        
        if (response.ok) {
            closeEditChannelModal();
            loadChannels();
            if (selectedChannelId === channelId) {
                await loadChannelPayments(channelId);
            }
            showNotification('Channel updated successfully');
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to update channel');
        }
    } catch (error) {
        console.error('Error updating channel:', error);
        alert('Error updating channel');
    }
}

// Delete channel
async function deleteChannel() {
    if (!currentEditingChannelId) return;
    
    if (!confirm('Are you sure you want to delete this channel?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/channels/${currentEditingChannelId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            closeEditChannelModal();
            if (selectedChannelId === currentEditingChannelId) {
                selectedChannelId = null;
                localStorage.removeItem('lastSelectedChannelId');
                document.getElementById('paymentsTable').innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">
                            Select a channel to view payments
                        </td>
                    </tr>
                `;
                document.getElementById('paymentsTableTitle').textContent = 'Payments';
                document.getElementById('incomingPaymentsTable').innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 20px; color: var(--text-secondary);">
                            Select a channel to manage incoming payments
                        </td>
                    </tr>
                `;
            }
            loadChannels();
            showNotification('Channel deleted successfully');
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to delete channel');
        }
    } catch (error) {
        console.error('Error deleting channel:', error);
        alert('Error deleting channel');
    }
}
