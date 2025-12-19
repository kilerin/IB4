let editingAddressId = null;

// Load addresses on page load
document.addEventListener('DOMContentLoaded', function() {
    loadAddresses();
});

// Load addresses
async function loadAddresses() {
    try {
        const response = await fetch('/api/addressbook');
        const data = await response.json();
        displayAddresses(data.addresses);
    } catch (error) {
        console.error('Error loading addresses:', error);
    }
}

// Display addresses grouped by customer
function displayAddresses(addresses) {
    const tbody = document.getElementById('addressTable');
    tbody.innerHTML = '';
    
    if (addresses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="text-align: center; padding: 40px;">No addresses found</td></tr>';
        return;
    }
    
    // Group addresses by customer
    const grouped = {};
    addresses.forEach(addr => {
        const customer = addr.customer || 'Unknown';
        if (!grouped[customer]) {
            grouped[customer] = [];
        }
        grouped[customer].push(addr);
    });
    
    // Sort customers alphabetically
    const sortedCustomers = Object.keys(grouped).sort();
    
    // Display grouped addresses
    sortedCustomers.forEach(customer => {
        const customerAddresses = grouped[customer];
        
        // Add group header row
        const headerRow = document.createElement('tr');
        headerRow.className = 'customer-group-header';
        headerRow.innerHTML = `
            <td colspan="6" class="customer-group-cell">
                <strong>${escapeHtml(customer)}</strong>
                <span class="customer-count">(${customerAddresses.length} ${customerAddresses.length === 1 ? 'address' : 'addresses'})</span>
            </td>
        `;
        tbody.appendChild(headerRow);
        
        // Add addresses for this customer
        customerAddresses.forEach(addr => {
            const row = document.createElement('tr');
            row.className = 'customer-group-row';
            
            const date = addr.date_added ? new Date(addr.date_added) : new Date(addr.created_at);
            const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
            
            const amlStatus = addr.aml_status || 'pending';
            const amlStatusClass = amlStatus === 'approved' ? 'status-approved' : 
                                  amlStatus === 'rejected' ? 'status-rejected' : 'status-pending';
            
            row.innerHTML = `
                <td></td>
                <td>
                    <span class="address-short">${shortenAddress(addr.address)}</span>
                    <img src="/static/ico/copy.svg" class="copy-icon" onclick="copyToClipboard('${escapeHtml(addr.address)}')" title="Copy address" alt="Copy">
                </td>
                <td><span class="status-badge ${amlStatusClass}">${amlStatus}</span></td>
                <td>${escapeHtml(addr.manager || '-')}</td>
                <td>${dateStr}</td>
                <td>
                    <button class="btn-icon-small" onclick="editAddress(${addr.id})" title="Edit">
                        <img src="/static/ico/edit.svg" class="wallet-icon" alt="Edit" onerror="this.style.display='none'">
                    </button>
                    <button class="btn-icon-small" onclick="deleteAddress(${addr.id})" title="Delete">
                        <img src="/static/ico/trash.svg" class="wallet-icon" alt="Delete">
                    </button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    });
}

// Shorten address
function shortenAddress(address) {
    if (!address || address.length <= 12) return address;
    return address.substring(0, 6) + '...' + address.substring(address.length - 6);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Copy to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Address copied!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showNotification('Address copied!');
    });
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 2000);
}

// Open add address modal
function openAddAddressModal(addressId = null) {
    editingAddressId = addressId;
    const modal = document.getElementById('addressModal');
    const title = document.getElementById('addressModalTitle');
    const submitBtn = document.getElementById('addressSubmitBtn');
    const form = document.getElementById('addressForm');
    
    if (addressId) {
        title.textContent = 'Edit Address';
        submitBtn.textContent = 'Save';
        
        // Load address data
        fetch(`/api/addressbook`)
            .then(response => response.json())
            .then(data => {
                const addr = data.addresses.find(a => a.id === addressId);
                if (addr) {
                    document.getElementById('addressCustomer').value = addr.customer;
                    document.getElementById('addressAddress').value = addr.address;
                    document.getElementById('addressManager').value = addr.manager || '';
                    document.getElementById('addressAmlStatus').value = addr.aml_status || 'pending';
                }
            });
    } else {
        title.textContent = 'Add Address';
        submitBtn.textContent = 'Add';
        form.reset();
    }
    
    modal.style.display = 'flex';
}

// Close address modal
function closeAddressModal() {
    const modal = document.getElementById('addressModal');
    modal.style.display = 'none';
    editingAddressId = null;
    document.getElementById('addressForm').reset();
}

// Save address
async function saveAddress(event) {
    event.preventDefault();
    
    const customer = document.getElementById('addressCustomer').value.trim();
    const address = document.getElementById('addressAddress').value.trim();
    const manager = document.getElementById('addressManager').value.trim();
    const aml_status = document.getElementById('addressAmlStatus').value;
    
    if (!customer || !address) {
        alert('Customer and Address are required');
        return;
    }
    
    try {
        const url = editingAddressId 
            ? `/api/addressbook/${editingAddressId}`
            : '/api/addressbook';
        const method = editingAddressId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer, address, manager, aml_status })
        });
        
        if (response.ok) {
            closeAddressModal();
            loadAddresses();
            showNotification(editingAddressId ? 'Address updated' : 'Address added');
        } else {
            const data = await response.json();
            if (data.error === 'Address already exists' && data.existing) {
                const existing = data.existing;
                const dateStr = existing.date_added ? new Date(existing.date_added).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
                const message = `Address already exists!\n\nCustomer: ${existing.customer}\nManager: ${existing.manager || '-'}\nDate Added: ${dateStr}`;
                alert(message);
            } else {
                alert(data.error || 'Error saving address');
            }
        }
    } catch (error) {
        console.error('Error saving address:', error);
        alert('Error saving address');
    }
}

// Edit address
function editAddress(addressId) {
    openAddAddressModal(addressId);
}

// Delete address
async function deleteAddress(addressId) {
    if (!confirm('Are you sure you want to delete this address?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/addressbook/${addressId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadAddresses();
            showNotification('Address deleted');
        } else {
            alert('Error deleting address');
        }
    } catch (error) {
        console.error('Error deleting address:', error);
        alert('Error deleting address');
    }
}

// Close modal on outside click
document.getElementById('addressModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeAddressModal();
    }
});

