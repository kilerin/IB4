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
    loadChannels(); // Refresh to update selected state
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
                       placeholder="0"
                       onfocus="if (this.value === '') { this.value = ''; } else { this.value = this.dataset.originalValue || ''; }"
                       onblur="formatSumInput(this); updateIncomingPayment(${payment.id}, 'sum_amount', parseSumValue(this.value))" 
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

// Update incoming payment
async function updateIncomingPayment(paymentId, field, value) {
    try {
        const paymentRow = document.querySelector(`tr[data-payment-id="${paymentId}"]`);
        const inputs = paymentRow.querySelectorAll('input');
        
        // Parse sum value to remove spaces
        const sumValue = inputs[0].classList.contains('incoming-payment-sum') 
            ? parseSumValue(inputs[0].value) 
            : inputs[0].value;
        
        const data = {
            sum_amount: sumValue,
            agent: inputs[1].value,
            from_address: inputs[2].value,
            date: inputs[3].value
        };
        
        const response = await fetch(`/api/incoming-payments/${paymentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Failed to update payment');
            await loadIncomingPayments(selectedChannelId); // Reload to restore correct values
        } else {
            // Reload payments statistics to update "Incoming payments" column
            if (selectedChannelId) {
                await loadChannelPayments(selectedChannelId);
            }
        }
    } catch (error) {
        console.error('Error updating payment:', error);
        alert('Error updating payment');
        await loadIncomingPayments(selectedChannelId); // Reload to restore correct values
    }
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
    
    paymentsTable.innerHTML = `
        <tr>
            <td>${formatAmount(data.in)}</td>
            <td>${formatAmount(data.out)}</td>
            <td>${formatAmount(data.inc_pmts)}</td>
            <td>${formatAmount(data.agent_balance)}</td>
            <td>${data.orders}</td>
        </tr>
    `;
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
    if (amount === null || amount === undefined) return '0.00';
    return parseFloat(amount).toLocaleString('ru-RU', {
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

// Parse sum value (remove spaces)
function parseSumValue(value) {
    if (!value) return '';
    return value.toString().replace(/\s/g, '').replace(',', '.');
}

// Format sum input on blur
function formatSumInput(input) {
    const value = parseSumValue(input.value);
    if (value && value !== '0') {
        const num = parseFloat(value);
        if (!isNaN(num) && num !== 0) {
            input.value = formatNumberWithSpaces(num);
            input.dataset.originalValue = num.toString();
        } else {
            input.value = '';
            input.dataset.originalValue = '';
        }
    } else {
        input.value = '';
        input.dataset.originalValue = '';
    }
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
