from flask import Flask, render_template, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
import requests

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///crypto_deck.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Models
class Wallet(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    address = db.Column(db.String(200), unique=True, nullable=False)
    balance_usdt = db.Column(db.Float, default=0.0)
    balance_trx = db.Column(db.Float, default=0.0)
    aml_status = db.Column(db.String(50), default='pending')
    aml_checked_at = db.Column(db.DateTime, nullable=True)
    is_hidden = db.Column(db.Boolean, default=False)
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    wallet_id = db.Column(db.Integer, db.ForeignKey('wallet.id', ondelete='CASCADE'), nullable=False)
    currency = db.Column(db.String(10), nullable=False)  # USDT or TRX
    amount = db.Column(db.Float, nullable=False)
    direction = db.Column(db.String(10), nullable=False)  # incoming or outgoing
    type = db.Column(db.String(50), default='transfer')  # transfer, freeze, unfreeze, vote, unvote, deposit, withdraw, exchange, contract_execution
    from_address = db.Column(db.String(200), nullable=True)
    to_address = db.Column(db.String(200), nullable=True)
    counterparty_name = db.Column(db.String(100), nullable=True)
    aml_status = db.Column(db.String(50), default='pending')
    tx_hash = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    wallet = db.relationship('Wallet', backref=db.backref('transactions', lazy=True, cascade='all, delete-orphan'))

# Routes
@app.route('/')
def dashboard():
    return render_template('dashboard.html')

@app.route('/wallets')
def wallets():
    return render_template('wallets.html')

@app.route('/address-book')
def address_book():
    return render_template('address_book.html')

@app.route('/aml-check')
def aml_check():
    return render_template('aml_check.html')

# API Routes
@app.route('/api/wallets', methods=['GET'])
def get_wallets():
    show_hidden = request.args.get('show_hidden', 'false') == 'true'
    wallet_id = request.args.get('wallet_id', type=int)
    
    query = Wallet.query
    
    # If specific wallet_id is requested, return it regardless of hidden status
    if wallet_id:
        wallet = Wallet.query.get(wallet_id)
        if wallet:
            return jsonify({
                'wallets': [{
                    'id': wallet.id,
                    'name': wallet.name,
                    'address': wallet.address,
                    'balance_usdt': wallet.balance_usdt,
                    'balance_trx': wallet.balance_trx,
                    'aml_status': wallet.aml_status,
                    'aml_checked_at': wallet.aml_checked_at.isoformat() if wallet.aml_checked_at else None,
                    'is_hidden': wallet.is_hidden,
                    'sort_order': wallet.sort_order
                }],
                'total_usdt': sum(w.balance_usdt for w in Wallet.query.filter_by(is_hidden=False).all()),
                'total_trx': sum(w.balance_trx for w in Wallet.query.filter_by(is_hidden=False).all())
            })
        else:
            return jsonify({'wallets': [], 'total_usdt': 0, 'total_trx': 0}), 404
    
    if not show_hidden:
        query = query.filter_by(is_hidden=False)
    wallets = query.order_by(Wallet.sort_order, Wallet.created_at).all()
    
    total_usdt = sum(w.balance_usdt for w in Wallet.query.filter_by(is_hidden=False).all())
    total_trx = sum(w.balance_trx for w in Wallet.query.filter_by(is_hidden=False).all())
    
    return jsonify({
        'wallets': [{
            'id': w.id,
            'name': w.name,
            'address': w.address,
            'balance_usdt': w.balance_usdt,
            'balance_trx': w.balance_trx,
            'aml_status': w.aml_status,
            'aml_checked_at': w.aml_checked_at.isoformat() if w.aml_checked_at else None,
            'is_hidden': w.is_hidden,
            'sort_order': w.sort_order
        } for w in wallets],
        'total_usdt': total_usdt,
        'total_trx': total_trx
    })

@app.route('/api/wallets', methods=['POST'])
def add_wallet():
    data = request.json
    name = data.get('name')
    address = data.get('address')
    
    if not name or not address:
        return jsonify({'error': 'Name and address are required'}), 400
    
    # Basic address validation (TRX addresses start with T and are 34 chars)
    address = address.strip()
    if not address.startswith('T') or len(address) != 34:
        return jsonify({'error': 'Invalid TRX address format. Address must start with T and be 34 characters long.'}), 400
    
    # Check for valid base58 characters (simplified check)
    valid_chars = set('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz')
    if not all(c in valid_chars for c in address):
        return jsonify({'error': 'Invalid TRX address format. Address contains invalid characters.'}), 400
    
    # Check if wallet already exists
    if Wallet.query.filter_by(address=address).first():
        return jsonify({'error': 'Wallet already exists'}), 400
    
    max_order = db.session.query(db.func.max(Wallet.sort_order)).scalar() or 0
    
    wallet = Wallet(
        name=name,
        address=address,
        sort_order=max_order + 1
    )
    db.session.add(wallet)
    db.session.commit()
    
    return jsonify({
        'id': wallet.id,
        'name': wallet.name,
        'address': wallet.address,
        'balance_usdt': wallet.balance_usdt,
        'balance_trx': wallet.balance_trx,
        'aml_status': wallet.aml_status,
        'aml_checked_at': wallet.aml_checked_at.isoformat() if wallet.aml_checked_at else None,
        'is_hidden': wallet.is_hidden,
        'sort_order': wallet.sort_order
    }), 201

@app.route('/api/wallets/<int:wallet_id>', methods=['PUT'])
def update_wallet(wallet_id):
    wallet = Wallet.query.get_or_404(wallet_id)
    data = request.json
    
    if 'name' in data:
        wallet.name = data['name']
    if 'is_hidden' in data:
        wallet.is_hidden = data['is_hidden']
    
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/wallets/<int:wallet_id>', methods=['DELETE'])
def delete_wallet(wallet_id):
    try:
        wallet = Wallet.query.get_or_404(wallet_id)
        # Delete related transactions first
        Transaction.query.filter_by(wallet_id=wallet_id).delete()
        db.session.delete(wallet)
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/wallets/reorder', methods=['POST'])
def reorder_wallets():
    data = request.json
    order = data.get('order', [])
    
    for index, wallet_id in enumerate(order):
        wallet = Wallet.query.get(wallet_id)
        if wallet:
            wallet.sort_order = index
    
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/wallets/refresh-balances', methods=['POST'])
def refresh_balances():
    print("\n=== REFRESH BALANCES CALLED ===")
    TRONGRID_API_KEY = 'edccd59a-8c06-40a5-b5eb-41cc161009c5'
    TRONGRID_API_URL = 'https://api.trongrid.io'
    USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'  # USDT-TRC20 contract address
    
    headers = {
        'TRON-PRO-API-KEY': TRONGRID_API_KEY
    }
    
    wallets = Wallet.query.all()
    print(f"Found {len(wallets)} wallets to update")
    updated_count = 0
    errors = []
    
    for wallet in wallets:
        try:
            address = wallet.address
            
            # Get TRX balance
            trx_response = requests.get(
                f'{TRONGRID_API_URL}/v1/accounts/{address}',
                headers=headers,
                timeout=10
            )
            
            if trx_response.status_code == 200:
                account_data = trx_response.json()
                if account_data.get('data') and len(account_data['data']) > 0:
                    balance_sun = account_data['data'][0].get('balance', 0)
                    wallet.balance_trx = round(balance_sun / 1_000_000, 2)  # Convert from sun to TRX
                else:
                    wallet.balance_trx = 0.0
            else:
                errors.append(f"Failed to get TRX balance for {wallet.name}")
            
            # Get USDT (TRC20) balance using tronpy library (more reliable)
            wallet.balance_usdt = 0.0
            
            try:
                print(f"\n=== Getting USDT balance for {wallet.name} ({address}) ===")
                
                # Use direct API call with API key (more reliable than tronpy for rate limits)
                # Skip tronpy due to rate limiting issues, use direct API call instead
                import base58
                # Decode base58 address
                address_bytes = base58.b58decode(address)
                print(f"Address bytes: {address_bytes.hex()}, length: {len(address_bytes)}")
                
                # For parameter, we need the 20-byte address part (skip first byte which is version byte)
                address_20_bytes = address_bytes[1:21]
                address_hex = address_20_bytes.hex()
                
                # For Solidity address type in ABI encoding:
                # address is 20 bytes, padded to 32 bytes (64 hex chars) with zeros on the left
                address_param = '0' * 24 + address_hex
                
                print(f"Address hex (20 bytes): {address_hex} (length: {len(address_hex)})")
                print(f"Parameter: {address_param} (length: {len(address_param)})")
                
                # Use base58 format for owner_address (TronGrid API expects base58)
                # Call balanceOf function on USDT contract using triggerconstantcontract
                # IMPORTANT: When using base58 addresses, set visible: true
                contract_response = requests.post(
                    f'{TRONGRID_API_URL}/wallet/triggerconstantcontract',
                    headers=headers,
                    json={
                        "owner_address": address,  # base58 format
                        "contract_address": USDT_TRC20_CONTRACT,
                        "function_selector": "balanceOf(address)",
                        "parameter": address_param,
                        "visible": True  # Required when using base58 addresses
                    },
                    timeout=10
                )
                
                print(f"Contract call response status: {contract_response.status_code}")
                
                if contract_response.status_code == 200:
                    contract_data = contract_response.json()
                    print(f"Contract response keys: {list(contract_data.keys())}")
                    
                    # Check if there's an error in the response
                    if contract_data.get('result') and isinstance(contract_data['result'], dict):
                        if contract_data['result'].get('code'):
                            print(f"Error in response: {contract_data['result']}")
                            errors.append(f"Error calling USDT contract for {wallet.name}: {contract_data['result'].get('message', 'Unknown error')}")
                        else:
                            # Success - check for constant_result
                            if contract_data.get('constant_result') and len(contract_data['constant_result']) > 0:
                                balance_hex = contract_data['constant_result'][0]
                                print(f"Balance hex: {balance_hex}")
                                balance_int = int(balance_hex, 16)
                                print(f"Balance int: {balance_int}")
                                # USDT has 6 decimals
                                wallet.balance_usdt = round(balance_int / 1_000_000, 2)
                                print(f"USDT balance set to: {wallet.balance_usdt}")
                            else:
                                print(f"No constant_result in response")
                                print(f"Full response: {contract_data}")
                                errors.append(f"No balance result for {wallet.name}")
                    elif contract_data.get('constant_result') and len(contract_data['constant_result']) > 0:
                        # Direct success case
                        balance_hex = contract_data['constant_result'][0]
                        print(f"Balance hex: {balance_hex}")
                        balance_int = int(balance_hex, 16)
                        print(f"Balance int: {balance_int}")
                        # USDT has 6 decimals
                        wallet.balance_usdt = round(balance_int / 1_000_000, 2)
                        print(f"USDT balance set to: {wallet.balance_usdt}")
                    else:
                        print(f"No constant_result in response")
                        print(f"Full response: {contract_data}")
                        errors.append(f"No balance result for {wallet.name}")
                else:
                    error_text = contract_response.text[:200] if contract_response.text else 'No error text'
                    print(f"Contract call failed: {contract_response.status_code} - {error_text}")
                    errors.append(f"Failed to get USDT balance for {wallet.name}: HTTP {contract_response.status_code}")
                        
            except Exception as e:
                print(f"Error in USDT balance call: {str(e)}")
                import traceback
                traceback.print_exc()
                errors.append(f"Error calling USDT contract for {wallet.name}: {str(e)}")
            
            updated_count += 1
            
        except Exception as e:
            errors.append(f"Error updating {wallet.name}: {str(e)}")
            continue
    
    db.session.commit()
    
    # Log errors for debugging
    if errors:
        print(f"Balance update errors: {errors}")
    
    if errors:
        return jsonify({
            'success': True,
            'updated': updated_count,
            'errors': errors
        }), 200
    
    return jsonify({
        'success': True,
        'updated': updated_count
    })

@app.route('/api/wallets/<int:wallet_id>/aml-check', methods=['POST'])
def check_aml(wallet_id):
    wallet = Wallet.query.get_or_404(wallet_id)
    # TODO: Implement actual AML check using BitOK API
    wallet.aml_status = 'checked'
    wallet.aml_checked_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'success': True, 'aml_status': wallet.aml_status})

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    hide_small = request.args.get('hide_small', 'false') == 'true'
    hide_trx = request.args.get('hide_trx', 'false') == 'true'
    wallet_id = request.args.get('wallet_id', type=int)
    
    query = Transaction.query.join(Wallet)
    
    if wallet_id:
        query = query.filter(Transaction.wallet_id == wallet_id)
    
    if hide_trx:
        query = query.filter(Transaction.currency != 'TRX')
    
    transactions = query.order_by(Transaction.created_at.desc()).all()
    
    # Filter small amounts (only for USDT)
    if hide_small:
        transactions = [t for t in transactions if not (t.currency == 'USDT' and t.amount < 10.0)]
    
    return jsonify({
        'transactions': [{
            'id': t.id,
            'wallet_id': t.wallet_id,
            'wallet_name': t.wallet.name,
            'currency': t.currency,
            'amount': t.amount,
            'direction': t.direction,
            'type': t.type or 'transfer',
            'from_address': t.from_address,
            'to_address': t.to_address,
            'counterparty_name': t.counterparty_name,
            'aml_status': t.aml_status,
            'tx_hash': t.tx_hash,
            'created_at': t.created_at.isoformat()
        } for t in transactions]
    })

@app.route('/api/transactions/refresh', methods=['POST'])
def refresh_transactions():
    TRONGRID_API_KEY = 'edccd59a-8c06-40a5-b5eb-41cc161009c5'
    TRONGRID_API_URL = 'https://api.trongrid.io'
    USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'  # USDT-TRC20 contract address
    
    headers = {
        'TRON-PRO-API-KEY': TRONGRID_API_KEY
    }
    
    wallets = Wallet.query.all()
    new_count = 0
    errors = []
    
    print(f"\n=== REFRESH TRANSACTIONS CALLED ===")
    print(f"Found {len(wallets)} wallets to check")
    
    for wallet in wallets:
        try:
            address = wallet.address
            print(f"\n=== Getting transactions for {wallet.name} ({address}) ===")
            
            # Get existing transaction hashes to avoid duplicates
            existing_hashes = set(
                tx.tx_hash for tx in Transaction.query.filter_by(wallet_id=wallet.id).all() 
                if tx.tx_hash
            )
            
            # Get TRC20 (USDT) transactions
            try:
                trc20_response = requests.get(
                    f'{TRONGRID_API_URL}/v1/accounts/{address}/transactions/trc20',
                    headers=headers,
                    params={
                        'limit': 200,
                        'only_confirmed': True,
                        'contract_address': USDT_TRC20_CONTRACT
                    },
                    timeout=10
                )
                
                if trc20_response.status_code == 200:
                    trc20_data = trc20_response.json()
                    if trc20_data.get('data'):
                        for tx_data in trc20_data['data']:
                            tx_hash = tx_data.get('transaction_id')
                            if tx_hash and tx_hash not in existing_hashes:
                                # Parse transaction
                                from_addr = tx_data.get('from', '')
                                to_addr = tx_data.get('to', '')
                                value_str = tx_data.get('value', '0')
                                
                                # Convert value from string (with decimals) to float
                                # USDT has 6 decimals
                                try:
                                    value_int = int(value_str)
                                    amount = round(value_int / 1_000_000, 6)
                                except (ValueError, TypeError):
                                    amount = 0.0
                                
                                # Determine direction - normalize addresses for comparison
                                # Convert both to lowercase and compare
                                to_addr_normalized = to_addr.lower() if to_addr else ''
                                address_normalized = address.lower()
                                direction = 'incoming' if to_addr_normalized == address_normalized else 'outgoing'
                                
                                # Check if this is an approve transaction
                                # Approve transactions call approve(address,uint256) method
                                # Try to get transaction details to check the method called
                                is_approve = False
                                approve_amount = 0.0
                                
                                # Always check transaction details for TRC20 to determine if it's approve
                                try:
                                    tx_detail_response = requests.get(
                                        f'{TRONGRID_API_URL}/wallet/gettransactionbyid',
                                        headers=headers,
                                        params={'value': tx_hash},
                                        timeout=5
                                    )
                                    if tx_detail_response.status_code == 200:
                                        tx_detail = tx_detail_response.json()
                                        # Check if transaction contains contract calls
                                        raw_data = tx_detail.get('raw_data', {})
                                        contracts = raw_data.get('contract', [])
                                        for contract in contracts:
                                            contract_type = contract.get('type')
                                            if contract_type == 'TriggerSmartContract':
                                                parameter = contract.get('parameter', {})
                                                value = parameter.get('value', {})
                                                data = value.get('data', '')
                                                # Approve method signature: approve(address,uint256) = 0x095ea7b3
                                                # Check if data starts with approve signature
                                                if data and data.startswith('095ea7b3'):
                                                    is_approve = True
                                                    # Extract approve amount from data
                                                    # Format: 095ea7b3 (method, 8 chars) + address (64 chars padded) + amount (64 chars)
                                                    # Total: 8 + 64 + 64 = 136 chars minimum
                                                    if len(data) >= 136:
                                                        try:
                                                            # Extract amount part (last 64 hex chars after method and address)
                                                            approve_amount_hex = data[72:136]  # Skip method (8) + address (64) = 72, take next 64
                                                            approve_amount_int = int(approve_amount_hex, 16)
                                                            approve_amount = round(approve_amount_int / 1_000_000, 6)
                                                            print(f"Extracted approve amount: {approve_amount} USDT from hex: {approve_amount_hex}")
                                                        except (ValueError, IndexError) as e:
                                                            print(f"Error extracting approve amount: {e}")
                                                            approve_amount = 0.0
                                                    break
                                except Exception as e:
                                    print(f"Error checking approve transaction: {e}")
                                    # If we can't get details, use heuristics
                                    # If amount is 0 and outgoing to different address, might be approve
                                    if amount == 0.0 and direction == 'outgoing' and to_addr and to_addr.lower() != address.lower():
                                        is_approve = True
                                
                                # Get timestamp
                                block_timestamp = tx_data.get('block_timestamp', 0)
                                tx_datetime = datetime.fromtimestamp(block_timestamp / 1000) if block_timestamp else datetime.utcnow()
                                
                                # Determine transaction type
                                if is_approve:
                                    transaction_type = 'approve'
                                    # For approve, show the approved amount (not transferred amount)
                                    # But in display, we'll show it without sign
                                    display_amount = approve_amount if approve_amount > 0 else amount
                                else:
                                    transaction_type = direction
                                    display_amount = amount
                                
                                transaction = Transaction(
                                    wallet_id=wallet.id,
                                    currency='USDT',
                                    amount=display_amount,  # Use approve_amount for approve, regular amount for others
                                    direction=direction,
                                    type=transaction_type,
                                    from_address=from_addr if from_addr else None,
                                    to_address=to_addr if to_addr else None,
                                    tx_hash=tx_hash,
                                    created_at=tx_datetime
                                )
                                db.session.add(transaction)
                                existing_hashes.add(tx_hash)
                                new_count += 1
                                print(f"Added USDT transaction: {tx_hash[:16]}... {amount} USDT ({direction})")
            except Exception as e:
                print(f"Error fetching TRC20 transactions for {wallet.name}: {str(e)}")
                errors.append(f"Error fetching USDT transactions for {wallet.name}: {str(e)}")
            
            # Get TRX transactions
            try:
                trx_response = requests.get(
                    f'{TRONGRID_API_URL}/v1/accounts/{address}/transactions',
                    headers=headers,
                    params={
                        'limit': 200,
                        'only_confirmed': True
                    },
                    timeout=10
                )
                
                if trx_response.status_code == 200:
                    trx_data = trx_response.json()
                    if trx_data.get('data'):
                        for tx_data in trx_data['data']:
                            tx_hash = tx_data.get('txID') or tx_data.get('transaction_id')
                            if tx_hash and tx_hash not in existing_hashes:
                                # Parse transaction
                                raw_data = tx_data.get('raw_data', {})
                                contracts = raw_data.get('contract', [])
                                
                                import base58
                                transaction_type = 'transfer'
                                transaction_processed = False
                                
                                for contract in contracts:
                                    contract_type = contract.get('type')
                                    parameter = contract.get('parameter', {})
                                    value = parameter.get('value', {})
                                    
                                    # Get timestamp
                                    block_timestamp = raw_data.get('timestamp', 0)
                                    tx_datetime = datetime.fromtimestamp(block_timestamp / 1000) if block_timestamp else datetime.utcnow()
                                    
                                    if contract_type == 'TransferContract':
                                        owner_address = value.get('owner_address', '')
                                        to_address = value.get('to_address', '')
                                        amount_sun = value.get('amount', 0)
                                        
                                        # Convert from sun to TRX (1 TRX = 1,000,000 sun)
                                        amount = round(amount_sun / 1_000_000, 6)
                                        
                                        # Convert hex addresses to base58 if needed
                                        try:
                                            if owner_address and len(owner_address) == 42 and owner_address.startswith('41'):
                                                hex_bytes = bytes.fromhex(owner_address)
                                                from_addr = base58.b58encode(hex_bytes).decode('utf-8')
                                            else:
                                                from_addr = owner_address
                                            
                                            if to_address and len(to_address) == 42 and to_address.startswith('41'):
                                                hex_bytes = bytes.fromhex(to_address)
                                                to_addr = base58.b58encode(hex_bytes).decode('utf-8')
                                            else:
                                                to_addr = to_address
                                        except Exception:
                                            from_addr = owner_address
                                            to_addr = to_address
                                        
                                        # Determine direction
                                        to_addr_normalized = to_addr.lower() if to_addr else ''
                                        address_normalized = address.lower()
                                        direction = 'incoming' if to_addr_normalized == address_normalized else 'outgoing'
                                        
                                        # Для TransferContract используем direction как тип (incoming/outgoing)
                                        transaction_type = direction
                                        
                                        transaction = Transaction(
                                            wallet_id=wallet.id,
                                            currency='TRX',
                                            amount=amount,
                                            direction=direction,
                                            type=transaction_type,  # incoming или outgoing
                                            from_address=from_addr if from_addr else None,
                                            to_address=to_addr if to_addr else None,
                                            tx_hash=tx_hash,
                                            created_at=tx_datetime
                                        )
                                        db.session.add(transaction)
                                        existing_hashes.add(tx_hash)
                                        new_count += 1
                                        print(f"Added TRX transaction: {tx_hash[:16]}... {amount} TRX ({direction}, {transaction_type})")
                                        transaction_processed = True
                                        break
                                    
                                    elif contract_type == 'FreezeBalanceContract':
                                        transaction_type = 'freeze'
                                        owner_address = value.get('owner_address', '')
                                        frozen_balance = value.get('frozen_balance', 0)
                                        amount = round(frozen_balance / 1_000_000, 6)
                                        
                                        # Convert hex address to base58 if needed
                                        try:
                                            if owner_address and len(owner_address) == 42 and owner_address.startswith('41'):
                                                hex_bytes = bytes.fromhex(owner_address)
                                                from_addr = base58.b58encode(hex_bytes).decode('utf-8')
                                            else:
                                                from_addr = owner_address
                                        except Exception:
                                            from_addr = owner_address
                                        
                                        transaction = Transaction(
                                            wallet_id=wallet.id,
                                            currency='TRX',
                                            amount=amount,
                                            direction='outgoing',
                                            type=transaction_type,
                                            from_address=from_addr if from_addr else None,
                                            to_address=None,
                                            tx_hash=tx_hash,
                                            created_at=tx_datetime
                                        )
                                        db.session.add(transaction)
                                        existing_hashes.add(tx_hash)
                                        new_count += 1
                                        print(f"Added TRX transaction: {tx_hash[:16]}... {amount} TRX (freeze)")
                                        transaction_processed = True
                                        break
                                    
                                    elif contract_type == 'UnfreezeBalanceContract':
                                        transaction_type = 'unfreeze'
                                        owner_address = value.get('owner_address', '')
                                        
                                        # Convert hex address to base58 if needed
                                        try:
                                            if owner_address and len(owner_address) == 42 and owner_address.startswith('41'):
                                                hex_bytes = bytes.fromhex(owner_address)
                                                from_addr = base58.b58encode(hex_bytes).decode('utf-8')
                                            else:
                                                from_addr = owner_address
                                        except Exception:
                                            from_addr = owner_address
                                        
                                        # Unfreeze doesn't have amount in contract, set to 0 or get from previous freeze
                                        transaction = Transaction(
                                            wallet_id=wallet.id,
                                            currency='TRX',
                                            amount=0.0,
                                            direction='incoming',
                                            type=transaction_type,
                                            from_address=from_addr if from_addr else None,
                                            to_address=None,
                                            tx_hash=tx_hash,
                                            created_at=tx_datetime
                                        )
                                        db.session.add(transaction)
                                        existing_hashes.add(tx_hash)
                                        new_count += 1
                                        print(f"Added TRX transaction: {tx_hash[:16]}... (unfreeze)")
                                        transaction_processed = True
                                        break
                                    
                                    elif contract_type == 'VoteWitnessContract':
                                        transaction_type = 'vote'
                                        owner_address = value.get('owner_address', '')
                                        
                                        # Convert hex address to base58 if needed
                                        try:
                                            if owner_address and len(owner_address) == 42 and owner_address.startswith('41'):
                                                hex_bytes = bytes.fromhex(owner_address)
                                                from_addr = base58.b58encode(hex_bytes).decode('utf-8')
                                            else:
                                                from_addr = owner_address
                                        except Exception:
                                            from_addr = owner_address
                                        
                                        transaction = Transaction(
                                            wallet_id=wallet.id,
                                            currency='TRX',
                                            amount=0.0,
                                            direction='outgoing',
                                            type=transaction_type,
                                            from_address=from_addr if from_addr else None,
                                            to_address=None,
                                            tx_hash=tx_hash,
                                            created_at=tx_datetime
                                        )
                                        db.session.add(transaction)
                                        existing_hashes.add(tx_hash)
                                        new_count += 1
                                        print(f"Added TRX transaction: {tx_hash[:16]}... (vote)")
                                        transaction_processed = True
                                        break
                                    
                                    elif contract_type == 'WithdrawBalanceContract':
                                        transaction_type = 'withdraw'
                                        owner_address = value.get('owner_address', '')
                                        
                                        # Convert hex address to base58 if needed
                                        try:
                                            if owner_address and len(owner_address) == 42 and owner_address.startswith('41'):
                                                hex_bytes = bytes.fromhex(owner_address)
                                                from_addr = base58.b58encode(hex_bytes).decode('utf-8')
                                            else:
                                                from_addr = owner_address
                                        except Exception:
                                            from_addr = owner_address
                                        
                                        transaction = Transaction(
                                            wallet_id=wallet.id,
                                            currency='TRX',
                                            amount=0.0,
                                            direction='incoming',
                                            type=transaction_type,
                                            from_address=None,
                                            to_address=from_addr if from_addr else None,
                                            tx_hash=tx_hash,
                                            created_at=tx_datetime
                                        )
                                        db.session.add(transaction)
                                        existing_hashes.add(tx_hash)
                                        new_count += 1
                                        print(f"Added TRX transaction: {tx_hash[:16]}... (withdraw)")
                                        transaction_processed = True
                                        break
                                    
                                    elif contract_type in ['TriggerSmartContract', 'CreateSmartContract']:
                                        transaction_type = 'contract_execution'
                                        owner_address = value.get('owner_address', '')
                                        
                                        # Convert hex address to base58 if needed
                                        try:
                                            if owner_address and len(owner_address) == 42 and owner_address.startswith('41'):
                                                hex_bytes = bytes.fromhex(owner_address)
                                                from_addr = base58.b58encode(hex_bytes).decode('utf-8')
                                            else:
                                                from_addr = owner_address
                                        except Exception:
                                            from_addr = owner_address
                                        
                                        transaction = Transaction(
                                            wallet_id=wallet.id,
                                            currency='TRX',
                                            amount=0.0,
                                            direction='outgoing',
                                            type=transaction_type,
                                            from_address=from_addr if from_addr else None,
                                            to_address=None,
                                            tx_hash=tx_hash,
                                            created_at=tx_datetime
                                        )
                                        db.session.add(transaction)
                                        existing_hashes.add(tx_hash)
                                        new_count += 1
                                        print(f"Added TRX transaction: {tx_hash[:16]}... (contract_execution)")
                                        transaction_processed = True
                                        break
                                
                                # If no specific contract type matched, skip this transaction
                                if not transaction_processed:
                                    continue
            except Exception as e:
                print(f"Error fetching TRX transactions for {wallet.name}: {str(e)}")
                errors.append(f"Error fetching TRX transactions for {wallet.name}: {str(e)}")
                
        except Exception as e:
            print(f"Error processing wallet {wallet.name}: {str(e)}")
            errors.append(f"Error processing {wallet.name}: {str(e)}")
            continue
    
    db.session.commit()
    
    print(f"\n=== TRANSACTIONS REFRESH COMPLETE ===")
    print(f"Added {new_count} new transactions")
    if errors:
        print(f"Errors: {errors}")
    
    return jsonify({
        'success': True,
        'new_transactions': new_count,
        'errors': errors if errors else None
    })

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        # Add sample data if database is empty
        if Wallet.query.count() == 0:
            wallet1 = Wallet(name='Main Wallet', address='T' + '1' * 33, balance_usdt=1000.0, balance_trx=100.0, sort_order=1)
            wallet2 = Wallet(name='Trading Wallet', address='T' + '2' * 33, balance_usdt=500.0, balance_trx=50.0, sort_order=2)
            wallet3 = Wallet(name='Savings Wallet', address='T' + '3' * 33, balance_usdt=2500.0, balance_trx=200.0, sort_order=3)
            db.session.add(wallet1)
            db.session.add(wallet2)
            db.session.add(wallet3)
            db.session.commit()
            
            # Add sample transactions
            tx1 = Transaction(wallet_id=wallet1.id, currency='USDT', amount=100.5, direction='incoming', 
                             from_address='T' + 'A' * 33, to_address=wallet1.address, tx_hash='0x' + 'a' * 64)
            tx2 = Transaction(wallet_id=wallet1.id, currency='USDT', amount=15.75, direction='incoming',
                             from_address='T' + 'B' * 33, to_address=wallet1.address, tx_hash='0x' + 'b' * 64)
            tx3 = Transaction(wallet_id=wallet2.id, currency='USDT', amount=50.0, direction='outgoing',
                             from_address=wallet2.address, to_address='T' + 'C' * 33, tx_hash='0x' + 'c' * 64)
            tx4 = Transaction(wallet_id=wallet2.id, currency='TRX', amount=25.0, direction='incoming',
                             from_address='T' + 'D' * 33, to_address=wallet2.address, tx_hash='0x' + 'd' * 64)
            db.session.add_all([tx1, tx2, tx3, tx4])
            db.session.commit()
    
    print("\n" + "="*50)
    print("🚀 IB4 CRYPTO DECK запущен!")
    print("📍 Откройте в браузере: http://localhost:5001")
    print("="*50 + "\n")
    app.run(debug=True, host='0.0.0.0', port=5001)

