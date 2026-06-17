const tg = window.Telegram?.WebApp;
const state = {
  token: '',
  activeScreen: 'wallets',
  wallets: [],
  transactions: [],
  reserves: [],
  addresses: [],
  amlChecks: [],
  filters: {
    hideSmall: localStorage.getItem('miniHideSmall') === 'true',
    hideTrx: localStorage.getItem('miniHideTrx') === 'true',
    hideOwn: localStorage.getItem('miniHideOwn') !== 'false',
  },
  txSort: localStorage.getItem('miniTxSort') || 'date_desc',
  showHiddenWallets: localStorage.getItem('miniShowHiddenWallets') === 'true',
};

const COLORS = {
  gray: '#68707f',
  red: '#ff5c7a',
  blue: '#2f8cff',
  purple: '#a46cff',
  green: '#2fd17c',
  orange: '#ff9f43',
  yellow: '#ffc857',
};

const TYPES = ['Sell usdt', 'Buy usdt', 'Alex', 'Agent', 'Loan', 'Expence', 'Other', 'Transit'];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  tg?.ready();
  tg?.expand();
  bindNavigation();
  document.getElementById('reloadBtn').addEventListener('click', reloadActiveScreen);
  document.getElementById('sheetBackdrop').addEventListener('click', closeSheet);

  await authenticate();
  await loadAll();
}

function bindNavigation() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      state.activeScreen = tab.dataset.screen;
      document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab));
      document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
      document.getElementById(`${state.activeScreen}Screen`).classList.add('active');
      document.getElementById('screenTitle').textContent = tab.textContent;
      await reloadActiveScreen();
    });
  });
}

async function authenticate() {
  const authState = document.getElementById('authState');
  if (state.token) {
    authState.textContent = 'Authenticated';
    return;
  }

  const initData = tg?.initData;
  if (!initData) {
    authState.textContent = 'Open this page inside Telegram to authenticate.';
    return;
  }

  try {
    const response = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({initData}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || data.error || 'Telegram auth failed');
    state.token = data.token;
    authState.textContent = `Authenticated as ${data.user?.username || data.user?.first_name || data.user?.id}`;
  } catch (error) {
    authState.textContent = error.message;
  }
}

async function api(path, options = {}, retryAuth = true) {
  if (!state.token) throw new Error('Not authenticated');
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && retryAuth) {
    state.token = '';
    await authenticate();
    return api(path, options, false);
  }
  if (!response.ok) throw new Error(data.message || data.error || `Request failed: ${response.status}`);
  return data;
}

async function loadAll() {
  await Promise.allSettled([loadWallets(), loadTransactions(), loadReserves(), loadAddressBook(), loadAmlChecks()]);
  renderWallets();
  renderTransactions();
  renderAddressBook();
  renderAml();
}

async function reloadActiveScreen() {
  try {
    if (state.activeScreen === 'wallets') {
      await Promise.all([loadWallets(), loadReserves()]);
      renderWallets();
    } else if (state.activeScreen === 'transactions') {
      await loadTransactions();
      renderTransactions();
    } else if (state.activeScreen === 'addressBook') {
      await loadAddressBook();
      renderAddressBook();
    } else {
      await loadAmlChecks();
      renderAml();
    }
    haptic('selection');
  } catch (error) {
    notify(error.message);
  }
}

async function loadWallets() {
  const data = await api('/api/wallets?show_hidden=true');
  state.wallets = data.wallets || [];
  state.totalUsdt = data.total_usdt || 0;
  state.totalTrx = data.total_trx || 0;
}

async function loadTransactions(walletId = null) {
  const params = new URLSearchParams({
    hide_small: state.filters.hideSmall,
    hide_trx: state.filters.hideTrx,
  });
  if (walletId) params.set('wallet_id', walletId);
  const data = await api(`/api/transactions?${params.toString()}`);
  state.transactions = data.transactions || [];
}

async function loadReserves() {
  const data = await api('/api/reserves');
  state.reserves = data.reserves || [];
}

async function loadAddressBook() {
  const data = await api('/api/addressbook');
  state.addresses = data.addresses || [];
}

async function loadAmlChecks() {
  const data = await api('/api/aml-check');
  state.amlChecks = data.checks || [];
}

function renderWallets() {
  const screen = document.getElementById('walletsScreen');
  const reserveTotal = state.reserves.reduce((sum, reserve) => sum + Number(reserve.amount || 0), 0);
  const available = Number(state.totalUsdt || 0) - reserveTotal;
  const wallets = state.showHiddenWallets ? state.wallets : state.wallets.filter((wallet) => !wallet.is_hidden);

  screen.innerHTML = `
    <div class="summary-grid">
      ${metric('USDT', money(state.totalUsdt))}
      ${metric('Reserved', money(reserveTotal))}
      ${metric('Available', money(available))}
      ${metric('TRX', money(state.totalTrx))}
    </div>
    <div class="toolbar">
      <button class="primary-btn" data-action="refreshBalances">Refresh balances</button>
      <button class="ghost-btn" data-action="addWallet">Add wallet</button>
      <button class="ghost-btn" data-action="reserves">Reserves</button>
    </div>
    <div class="filters">
      <label><input type="checkbox" id="showHiddenWallets" ${state.showHiddenWallets ? 'checked' : ''}> Show hidden</label>
    </div>
    <h2>Wallets</h2>
    <div class="wallet-list">${wallets.map(walletCard).join('') || empty(state.showHiddenWallets ? 'No wallets' : 'No visible wallets')}</div>
  `;

  screen.querySelector('[data-action="refreshBalances"]').addEventListener('click', () => runAction('/api/wallets/refresh-balances', 'Balances refreshed'));
  screen.querySelector('[data-action="addWallet"]').addEventListener('click', openWalletForm);
  screen.querySelector('[data-action="reserves"]').addEventListener('click', openReservesSheet);
  screen.querySelector('#showHiddenWallets').addEventListener('change', updateWalletVisibility);
  screen.querySelectorAll('[data-wallet]').forEach((button) => button.addEventListener('click', () => openWalletDetails(Number(button.dataset.wallet))));
  screen.querySelectorAll('[data-copy-address]').forEach((button) => button.addEventListener('click', () => copyText(button.dataset.copyAddress, 'Wallet address copied')));
}

function renderTransactions() {
  const screen = document.getElementById('transactionsScreen');
  const transactions = sortTransactions(
    state.transactions.filter((tx) => !state.filters.hideOwn || tx.comment !== 'Own fund transfer')
  );

  screen.innerHTML = `
    <div class="toolbar">
      <button class="primary-btn" data-action="refreshTransactions">Refresh transactions</button>
      <button class="ghost-btn" data-action="dedupe">Dedupe</button>
    </div>
    <div class="filters">
      <label><input type="checkbox" id="hideSmall" ${state.filters.hideSmall ? 'checked' : ''}> Hide USDT below 10</label>
      <label><input type="checkbox" id="hideTrx" ${state.filters.hideTrx ? 'checked' : ''}> Hide TRX</label>
      <label><input type="checkbox" id="hideOwn" ${state.filters.hideOwn ? 'checked' : ''}> Hide own fund transfers</label>
      <label>Sort
        <select id="txSort">
          <option value="date_desc" ${state.txSort === 'date_desc' ? 'selected' : ''}>Newest first</option>
          <option value="date_asc" ${state.txSort === 'date_asc' ? 'selected' : ''}>Oldest first</option>
          <option value="amount_desc" ${state.txSort === 'amount_desc' ? 'selected' : ''}>Amount high to low</option>
          <option value="amount_asc" ${state.txSort === 'amount_asc' ? 'selected' : ''}>Amount low to high</option>
        </select>
      </label>
    </div>
    <div class="transaction-list">${transactions.map(transactionRow).join('') || empty('No transactions')}</div>
  `;

  screen.querySelector('[data-action="refreshTransactions"]').addEventListener('click', () => runAction('/api/transactions/refresh', 'Transactions refreshed'));
  screen.querySelector('[data-action="dedupe"]').addEventListener('click', () => runAction('/api/transactions/remove-duplicates', 'Duplicates removed'));
  screen.querySelector('#hideSmall').addEventListener('change', updateFilters);
  screen.querySelector('#hideTrx').addEventListener('change', updateFilters);
  screen.querySelector('#hideOwn').addEventListener('change', updateFilters);
  screen.querySelector('#txSort').addEventListener('change', updateSort);
  screen.querySelectorAll('[data-comment]').forEach((button) => button.addEventListener('click', () => editTransactionComment(Number(button.dataset.comment))));
  screen.querySelectorAll('[data-type]').forEach((button) => button.addEventListener('click', () => editTransactionType(Number(button.dataset.type))));
  screen.querySelectorAll('[data-address]').forEach((button) => button.addEventListener('click', () => openAddressForm({address: button.dataset.address})));
}

function metric(label, value) {
  return `<article class="card metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function walletCard(wallet) {
  const color = COLORS[wallet.color] || COLORS.gray;
  const hidden = wallet.is_hidden ? '<span class="badge warn">Hidden</span>' : '';
  return `
    <article class="wallet-card" style="--wallet-color:${color}">
      <header>
        <button class="wallet-title-btn" data-wallet="${wallet.id}" type="button">${escapeHtml(wallet.name)}</button>
        <span class="wallet-usdt">${money(wallet.balance_usdt)}</span>
      </header>
      <div class="wallet-subrow">
        <button class="wallet-address" data-copy-address="${escapeHtmlAttr(wallet.address || '')}" type="button">
          ${escapeHtml(wallet.address || '-')}
        </button>
        <span class="wallet-trx">${money(wallet.balance_trx)}</span>
      </div>
      ${hidden ? `<div class="toolbar wallet-badges">${hidden}</div>` : ''}
    </article>
  `;
}

function updateWalletVisibility() {
  state.showHiddenWallets = document.getElementById('showHiddenWallets').checked;
  localStorage.setItem('miniShowHiddenWallets', state.showHiddenWallets);
  renderWallets();
}

function transactionRow(tx) {
  const counterparty = tx.direction === 'incoming' ? tx.from_address : tx.to_address;
  return `
    <article class="transaction-row ${tx.direction}">
      <div class="row-top">
        <p class="row-title">${tx.direction === 'incoming' ? '+' : '-'}${money(tx.amount)} ${escapeHtml(tx.currency)}</p>
        <span class="badge">${escapeHtml(tx.transaction_type || tx.type || 'transfer')}</span>
      </div>
      <p class="muted">${escapeHtml(tx.wallet_name || '')} · ${formatDate(tx.created_at)}</p>
      <p class="address">${short(counterparty)} ${tx.counterparty_name ? `· ${escapeHtml(tx.counterparty_name)}` : ''}</p>
      ${tx.comment ? `<p>${escapeHtml(tx.comment)}</p>` : ''}
      <div class="toolbar">
        <button class="ghost-btn" data-comment="${tx.id}">Comment</button>
        <button class="ghost-btn" data-type="${tx.id}">Type</button>
        ${counterparty ? `<button class="ghost-btn" data-address="${escapeHtmlAttr(counterparty)}">Add address</button>` : ''}
      </div>
    </article>
  `;
}

async function updateFilters() {
  state.filters.hideSmall = document.getElementById('hideSmall').checked;
  state.filters.hideTrx = document.getElementById('hideTrx').checked;
  state.filters.hideOwn = document.getElementById('hideOwn').checked;
  localStorage.setItem('miniHideSmall', state.filters.hideSmall);
  localStorage.setItem('miniHideTrx', state.filters.hideTrx);
  localStorage.setItem('miniHideOwn', state.filters.hideOwn);
  await loadTransactions();
  renderTransactions();
}

function updateSort() {
  state.txSort = document.getElementById('txSort').value;
  localStorage.setItem('miniTxSort', state.txSort);
  renderTransactions();
}

function sortTransactions(transactions) {
  return [...transactions].sort((left, right) => {
    if (state.txSort === 'amount_desc') return Number(right.amount || 0) - Number(left.amount || 0);
    if (state.txSort === 'amount_asc') return Number(left.amount || 0) - Number(right.amount || 0);
    const leftDate = new Date(left.created_at || 0).getTime();
    const rightDate = new Date(right.created_at || 0).getTime();
    return state.txSort === 'date_asc' ? leftDate - rightDate : rightDate - leftDate;
  });
}

async function moveWallet(walletId, direction) {
  const wallets = [...state.wallets].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
  const index = wallets.findIndex((wallet) => wallet.id === walletId);
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= wallets.length) return;
  const [wallet] = wallets.splice(index, 1);
  wallets.splice(targetIndex, 0, wallet);
  await api('/api/wallets/reorder', {
    method: 'POST',
    body: JSON.stringify({order: wallets.map((item) => item.id)}),
  });
  await reloadActiveScreen();
}

function openWalletForm(wallet = null) {
  const color = wallet?.color || 'gray';
  openSheet(`
    <h2>${wallet ? 'Edit wallet' : 'Add wallet'}</h2>
    <form class="form-grid" id="walletForm">
      <label class="field"><span>Name</span><input name="name" value="${escapeHtmlAttr(wallet?.name || '')}" required></label>
      <label class="field"><span>Address</span><input name="address" value="${escapeHtmlAttr(wallet?.address || '')}" ${wallet ? 'readonly' : 'required'}></label>
      <div class="field"><span>Color</span><div class="color-row">${Object.keys(COLORS).map((name) => `<button class="color-dot ${name === color ? 'active' : ''}" data-color="${name}" type="button" style="background:${COLORS[name]}"></button>`).join('')}</div></div>
      <div class="sheet-actions">
        <button class="ghost-btn" type="button" data-close>Cancel</button>
        <button class="primary-btn" type="submit">Save</button>
      </div>
    </form>
  `);
  let selectedColor = color;
  document.querySelectorAll('[data-color]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedColor = button.dataset.color;
      document.querySelectorAll('[data-color]').forEach((item) => item.classList.toggle('active', item === button));
    });
  });
  document.querySelector('[data-close]').addEventListener('click', closeSheet);
  document.getElementById('walletForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {name: form.get('name'), color: selectedColor};
    if (!wallet) payload.address = form.get('address');
    await api(wallet ? `/api/wallets/${wallet.id}` : '/api/wallets', {
      method: wallet ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    closeSheet();
    await reloadActiveScreen();
    notify('Wallet saved');
  });
}

async function openWalletDetails(walletId) {
  const wallet = state.wallets.find((item) => item.id === walletId);
  if (!wallet) return;
  const walletTx = state.transactions.filter((tx) => tx.wallet_id === walletId).slice(0, 20);
  openSheet(`
    <h2>${escapeHtml(wallet.name)}</h2>
    <p class="address">${escapeHtml(wallet.address)}</p>
    <div class="summary-grid">
      ${metric('USDT', money(wallet.balance_usdt))}
      ${metric('TRX', money(wallet.balance_trx))}
    </div>
    <div class="toolbar">
      <button class="primary-btn" id="editWalletBtn">Edit</button>
      <button class="ghost-btn" id="toggleWalletBtn">${wallet.is_hidden ? 'Show' : 'Hide'}</button>
      <button class="ghost-btn" id="walletAmlBtn">AML check</button>
      <button class="danger-btn" id="deleteWalletBtn">Delete</button>
    </div>
    <h3>Recent transactions</h3>
    <div class="transaction-list">${walletTx.map(transactionRow).join('') || empty('No wallet transactions')}</div>
  `);
  document.getElementById('editWalletBtn').addEventListener('click', () => openWalletForm(wallet));
  document.getElementById('toggleWalletBtn').addEventListener('click', async () => {
    await api(`/api/wallets/${wallet.id}`, {method: 'PUT', body: JSON.stringify({is_hidden: !wallet.is_hidden})});
    closeSheet();
    await reloadActiveScreen();
  });
  document.getElementById('walletAmlBtn').addEventListener('click', () => runAction(`/api/wallets/${wallet.id}/aml-check`, 'AML check started'));
  document.getElementById('deleteWalletBtn').addEventListener('click', async () => {
    if (!confirm('Delete this wallet and its transactions?')) return;
    await api(`/api/wallets/${wallet.id}`, {method: 'DELETE'});
    closeSheet();
    await reloadActiveScreen();
  });
}

function openReservesSheet() {
  openSheet(`
    <h2>Reserves</h2>
    <div class="toolbar"><button class="primary-btn" id="addReserveBtn">Add reserve</button></div>
    <div class="transaction-list">${state.reserves.map((reserve) => `
      <article class="transaction-row">
        <div class="row-top"><p class="row-title">${money(reserve.amount)} USDT</p><span></span></div>
        <p class="muted">${escapeHtml(reserve.comment || '')}</p>
        <div class="toolbar">
          <button class="ghost-btn" data-edit-reserve="${reserve.id}">Edit</button>
          <button class="danger-btn" data-reserve="${reserve.id}">Delete</button>
        </div>
      </article>`).join('') || empty('No reserves')}</div>
  `);
  document.getElementById('addReserveBtn').addEventListener('click', () => editReserve());
  document.querySelectorAll('[data-edit-reserve]').forEach((button) => button.addEventListener('click', () => {
    const reserve = state.reserves.find((item) => item.id === Number(button.dataset.editReserve));
    editReserve(reserve);
  }));
  document.querySelectorAll('[data-reserve]').forEach((button) => button.addEventListener('click', async () => {
    await api(`/api/reserves/${button.dataset.reserve}`, {method: 'DELETE'});
    await loadReserves();
    openReservesSheet();
  }));
}

async function editReserve(reserve = null) {
  const amount = prompt('Reserve amount', reserve?.amount ?? '');
  if (!amount) return;
  const comment = prompt('Comment', reserve?.comment || '') || '';
  await api(reserve ? `/api/reserves/${reserve.id}` : '/api/reserves', {
    method: reserve ? 'PUT' : 'POST',
    body: JSON.stringify({amount, comment}),
  });
  await loadReserves();
  openReservesSheet();
}

async function editTransactionComment(id) {
  const current = state.transactions.find((tx) => tx.id === id)?.comment || '';
  const comment = prompt('Comment', current);
  if (comment === null) return;
  await api(`/api/transactions/${id}/comment`, {method: 'PUT', body: JSON.stringify({comment})});
  await reloadActiveScreen();
}

async function editTransactionType(id) {
  const current = state.transactions.find((tx) => tx.id === id)?.transaction_type || '';
  const transaction_type = prompt(`Type: ${TYPES.join(', ')}`, current);
  if (transaction_type === null) return;
  await api(`/api/transactions/${id}/type`, {method: 'PUT', body: JSON.stringify({transaction_type})});
  await reloadActiveScreen();
}

function renderAddressBook() {
  const screen = document.getElementById('addressBookScreen');
  screen.innerHTML = `
    <div class="toolbar"><button class="primary-btn" id="addAddressBtn">Add contact</button></div>
    <div class="address-list">${state.addresses.map(addressRow).join('') || empty('No contacts')}</div>
  `;
  document.getElementById('addAddressBtn').addEventListener('click', () => openAddressForm());
  screen.querySelectorAll('[data-edit-address]').forEach((button) => button.addEventListener('click', () => {
    openAddressForm(state.addresses.find((item) => item.id === Number(button.dataset.editAddress)));
  }));
  screen.querySelectorAll('[data-delete-address]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Delete this contact?')) return;
    await api(`/api/addressbook/${button.dataset.deleteAddress}`, {method: 'DELETE'});
    await reloadActiveScreen();
  }));
}

function addressRow(entry) {
  return `
    <article class="address-row">
      <div class="row-top"><p class="row-title">${escapeHtml(entry.customer)}</p><span class="badge">${escapeHtml(entry.aml_status || 'pending')}</span></div>
      <p class="address">${short(entry.address)}</p>
      <p class="muted">${escapeHtml(entry.manager || 'No manager')}</p>
      <div class="toolbar">
        <button class="ghost-btn" data-edit-address="${entry.id}">Edit</button>
        <button class="danger-btn" data-delete-address="${entry.id}">Delete</button>
      </div>
    </article>
  `;
}

function openAddressForm(entry = {}) {
  openSheet(`
    <h2>${entry.id ? 'Edit contact' : 'Add contact'}</h2>
    <form class="form-grid" id="addressForm">
      <label class="field"><span>Customer</span><input name="customer" value="${escapeHtmlAttr(entry.customer || '')}" required></label>
      <label class="field"><span>Address</span><input name="address" value="${escapeHtmlAttr(entry.address || '')}" required></label>
      <label class="field"><span>Manager</span><input name="manager" value="${escapeHtmlAttr(entry.manager || '')}"></label>
      <label class="field"><span>AML status</span><select name="aml_status">
        ${['pending', 'approved', 'rejected'].map((status) => `<option value="${status}" ${entry.aml_status === status ? 'selected' : ''}>${status}</option>`).join('')}
      </select></label>
      <div class="sheet-actions"><button class="ghost-btn" type="button" data-close>Cancel</button><button class="primary-btn" type="submit">Save</button></div>
    </form>
  `);
  document.querySelector('[data-close]').addEventListener('click', closeSheet);
  document.getElementById('addressForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await api(entry.id ? `/api/addressbook/${entry.id}` : '/api/addressbook', {
      method: entry.id ? 'PUT' : 'POST',
      body: JSON.stringify(form),
    });
    closeSheet();
    await reloadActiveScreen();
  });
}

function renderAml() {
  const screen = document.getElementById('amlScreen');
  screen.innerHTML = `
    <form class="form-grid card" id="amlForm" style="padding:14px">
      <label class="field"><span>TRON address</span><input name="address" required placeholder="T..."></label>
      <label class="field"><span>Manager</span><input name="manager" value="N4"></label>
      <button class="primary-btn" type="submit">Check AML</button>
    </form>
    <div class="aml-list" style="margin-top:12px">${state.amlChecks.map(amlRow).join('') || empty('No AML checks')}</div>
  `;
  document.getElementById('amlForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    await api('/api/aml-check/check-address', {method: 'POST', body: JSON.stringify(form)});
    notify('AML check started');
    setTimeout(async () => {
      await loadAmlChecks();
      renderAml();
    }, 2500);
  });
}

function amlRow(check) {
  const riskClass = check.risk_level === 'low' ? 'good' : check.risk_level === 'medium' ? 'warn' : 'danger';
  return `
    <article class="aml-row">
      <div class="row-top"><p class="row-title">${escapeHtml((check.risk_level || 'N/A').toUpperCase())}</p><span class="badge ${riskClass}">${check.risk_score ?? 'N/A'}%</span></div>
      <p class="address">${short(check.address)}</p>
      <p class="muted">${escapeHtml(check.customer || '-')} · ${escapeHtml(check.manager || 'N4')} · ${formatDate(check.checked_at)}</p>
      <div class="balance-line"><span class="balance-pill">${money(check.balance_usdt)} USDT</span><span class="balance-pill">${money(check.balance_trx)} TRX</span></div>
    </article>
  `;
}

async function runAction(path, successMessage) {
  try {
    await api(path, {method: 'POST'});
    notify(successMessage);
    await reloadActiveScreen();
  } catch (error) {
    notify(error.message);
  }
}

function openSheet(html) {
  document.getElementById('sheet').innerHTML = html;
  document.getElementById('sheet').hidden = false;
  document.getElementById('sheetBackdrop').hidden = false;
  tg?.BackButton?.show();
  tg?.BackButton?.onClick(closeSheet);
}

function closeSheet() {
  document.getElementById('sheet').hidden = true;
  document.getElementById('sheetBackdrop').hidden = true;
  tg?.BackButton?.hide();
}

function notify(message) {
  tg?.showPopup ? tg.showPopup({message}) : alert(message);
  haptic('notification');
}

async function copyText(text, successMessage = 'Copied') {
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    notify(successMessage);
  } catch (error) {
    notify('Copy failed');
  }
}

function haptic(type) {
  if (type === 'selection') tg?.HapticFeedback?.selectionChanged();
  else tg?.HapticFeedback?.notificationOccurred('success');
}

function money(value) {
  return Number(value || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function short(address) {
  if (!address) return '-';
  return `${escapeHtml(String(address).slice(0, 6))}...${escapeHtml(String(address).slice(-6))}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function empty(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
