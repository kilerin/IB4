from flask import Flask, render_template, jsonify, request, session, redirect, url_for
from functools import wraps
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func
from datetime import datetime, timedelta
from ib4deck.auth.telegram import (
    AuthError,
    issue_jwt,
    parse_allowed_telegram_ids,
    validate_init_data,
    verify_jwt,
)
import hmac
import os
import requests
import threading
import time
from dotenv import load_dotenv

load_dotenv()  # Загружает переменные из .env файла

app = Flask(__name__)

# Поддержка PostgreSQL через переменную окружения, fallback на SQLite для разработки
database_url = os.getenv('DATABASE_URL')
if database_url:
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    # Настройки пула соединений для PostgreSQL
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'pool_size': 10,
        'max_overflow': 20
    }
else:
    # Для локальной разработки используем SQLite
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///crypto_deck.db'
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'connect_args': {
            'timeout': 30,
            'check_same_thread': False
        }
    }

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# Secret key для сессий (используется для шифрования cookie)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY') or 'dev-secret-key-change-in-production'
# Пароль для входа (из переменной окружения)
APP_PASSWORD = os.getenv('APP_PASSWORD') or 'admin123'
if database_url and app.config['SECRET_KEY'] == 'dev-secret-key-change-in-production':
    raise RuntimeError('SECRET_KEY must be configured in production')
if database_url and APP_PASSWORD == 'admin123':
    raise RuntimeError('APP_PASSWORD must be configured in production')

app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Strict'
app.config['SESSION_COOKIE_SECURE'] = bool(database_url)

TRONGRID_API_URL = os.getenv('TRONGRID_API_URL', 'https://api.trongrid.io')
USDT_TRC20_CONTRACT = os.getenv('USDT_TRC20_CONTRACT', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
BITOK_API_BASE_URL = os.getenv('BITOK_API_BASE_URL', 'https://kyt-api.bitok.org')
TELEGRAM_AUTH_MAX_AGE_SECONDS = int(os.getenv('TELEGRAM_AUTH_MAX_AGE_SECONDS', '86400'))
JWT_EXPIRES_SECONDS = int(os.getenv('JWT_EXPIRES_SECONDS', '86400'))

db = SQLAlchemy(app)

def require_env(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f'{name} is not configured')
    return value

def get_trongrid_headers():
    return {'TRON-PRO-API-KEY': require_env('TRONGRID_API_KEY')}

def get_bitok_credentials():
    return require_env('BITOK_API_KEY_ID'), require_env('BITOK_API_SECRET')

def get_bearer_payload():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None

    token = auth_header.split(' ', 1)[1].strip()
    if not token:
        return None

    payload = verify_jwt(token, require_env('JWT_SECRET'))
    allowed_ids = parse_allowed_telegram_ids(require_env('ALLOWED_TELEGRAM_IDS'))
    if int(payload.get('sub', 0)) not in allowed_ids:
        raise AuthError('Bearer token subject is no longer allowed')
    return payload

def has_csrf_header():
    return request.headers.get('X-Requested-With') == 'XMLHttpRequest'

# Декоратор для защиты маршрутов
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# Проверка аутентификации перед каждым запросом
@app.before_request
def require_login():
    # Разрешаем доступ к странице входа и статическим файлам без аутентификации
    if request.endpoint in {'login', 'telegram_auth', 'health'} or request.path.startswith('/static/'):
        return
    if request.path.startswith('/api/'):
        if 'logged_in' in session:
            if request.method in {'POST', 'PUT', 'DELETE', 'PATCH'} and not has_csrf_header():
                return jsonify({'error': 'Forbidden'}), 403
            return
        try:
            request.telegram_payload = get_bearer_payload()
            if request.telegram_payload:
                return
        except (AuthError, RuntimeError) as e:
            return jsonify({'error': 'Unauthorized', 'message': str(e)}), 401
        return jsonify({'error': 'Unauthorized'}), 401
    elif 'logged_in' not in session:
        return redirect(url_for('login'))

# Models
class Wallet(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    address = db.Column(db.String(200), unique=True, nullable=False)
    balance_usdt = db.Column(db.Float, default=0.0)
    balance_trx = db.Column(db.Float, default=0.0)
    aml_status = db.Column(db.String(50), default='pending')
    aml_checked_at = db.Column(db.DateTime, nullable=True)
    aml_score = db.Column(db.Float, nullable=True)  # Процент риска (0.0-100.0)
    aml_risk_level = db.Column(db.String(20), nullable=True)  # low, medium, high
    aml_checking = db.Column(db.Boolean, default=False)  # Флаг проверки в процессе
    balance_changed = db.Column(db.Boolean, default=False)  # Флаг изменения баланса
    is_hidden = db.Column(db.Boolean, default=False)
    sort_order = db.Column(db.Integer, default=0)
    color = db.Column(db.String(20), default='gray')  # red, blue, purple, gray, green, orange, yellow
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    wallet_id = db.Column(db.Integer, db.ForeignKey('wallet.id', ondelete='CASCADE'), nullable=False, index=True)
    currency = db.Column(db.String(10), nullable=False, index=True)  # USDT or TRX
    amount = db.Column(db.Float, nullable=False)
    direction = db.Column(db.String(10), nullable=False)  # incoming or outgoing
    type = db.Column(db.String(50), default='transfer')  # transfer, freeze, unfreeze, vote, unvote, deposit, withdraw, exchange, contract_execution
    from_address = db.Column(db.String(200), nullable=True)
    to_address = db.Column(db.String(200), nullable=True)
    counterparty_name = db.Column(db.String(100), nullable=True)
    aml_status = db.Column(db.String(50), default='pending')
    tx_hash = db.Column(db.String(200), nullable=True, index=True)
    comment = db.Column(db.String(500), nullable=True)  # User comment for transaction
    transaction_type = db.Column(db.String(50), nullable=True, index=True)  # Sell usdt, Buy usdt, Alex, Agent, Loan, Expence, Other, Transit
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    wallet = db.relationship('Wallet', backref=db.backref('transactions', lazy=True, cascade='all, delete-orphan'))

class Reserve(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)
    comment = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AddressBook(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    customer = db.Column(db.String(200), nullable=False)
    address = db.Column(db.String(200), nullable=False, index=True)
    aml_status = db.Column(db.String(50), default='pending')
    manager = db.Column(db.String(100), nullable=True)
    date_added = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AmlCheck(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    address = db.Column(db.String(200), nullable=False)
    risk_level = db.Column(db.String(50), nullable=True)
    risk_score = db.Column(db.Float, nullable=True)  # 0.0-100.0
    customer = db.Column(db.String(200), nullable=True)  # From address book
    manager = db.Column(db.String(100), default='N4')
    balance_usdt = db.Column(db.Float, nullable=True, default=0.0)
    balance_trx = db.Column(db.Float, nullable=True, default=0.0)
    checked_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# Routes
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        password = request.form.get('password')
        if hmac.compare_digest(password or '', APP_PASSWORD):
            session['logged_in'] = True
            return redirect(url_for('wallets'))
        else:
            return render_template('login.html', error='Неверный пароль')
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

@app.route('/api/auth/telegram', methods=['POST'])
def telegram_auth():
    data = request.get_json(silent=True) or {}
    init_data = data.get('initData') or data.get('init_data')

    try:
        parsed = validate_init_data(
            init_data,
            require_env('TELEGRAM_BOT_TOKEN'),
            max_age_seconds=TELEGRAM_AUTH_MAX_AGE_SECONDS,
        )
        user = parsed.get('user') or {}
        user_id = int(user.get('id', 0))
        if not user_id:
            raise AuthError('Telegram user id is missing')

        allowed_ids = parse_allowed_telegram_ids(require_env('ALLOWED_TELEGRAM_IDS'))
        if user_id not in allowed_ids:
            return jsonify({'error': 'Forbidden'}), 403

        token = issue_jwt(user, require_env('JWT_SECRET'), expires_in_seconds=JWT_EXPIRES_SECONDS)
        return jsonify({
            'token': token,
            'token_type': 'Bearer',
            'expires_in': JWT_EXPIRES_SECONDS,
            'user': user,
        })
    except (AuthError, RuntimeError, ValueError):
        return jsonify({'error': 'Unauthorized'}), 401

@app.route('/')
@login_required
def index():
    return redirect(url_for('wallets'))

@app.route('/wallets')
@login_required
def wallets():
    return render_template('wallets.html')

@app.route('/address-book')
@login_required
def address_book():
    return render_template('address_book.html')

@app.route('/aml-check')
@login_required
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
                    'aml_score': wallet.aml_score,
                    'aml_risk_level': wallet.aml_risk_level,
                    'aml_checking': wallet.aml_checking,
                    'is_hidden': wallet.is_hidden,
                    'sort_order': wallet.sort_order,
                    'color': wallet.color or 'gray'
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
            'aml_score': w.aml_score,
            'aml_risk_level': w.aml_risk_level,
            'aml_checking': w.aml_checking or False,
            'balance_changed': w.balance_changed or False,
            'is_hidden': w.is_hidden,
            'sort_order': w.sort_order,
            'color': w.color or 'gray'
        } for w in wallets],
        'total_usdt': total_usdt,
        'total_trx': total_trx
    })

@app.route('/api/wallets', methods=['POST'])
def add_wallet():
    data = request.json
    name = data.get('name')
    address = data.get('address')
    color = data.get('color', 'gray')
    
    # Validate color
    valid_colors = ['red', 'blue', 'purple', 'gray', 'green', 'orange', 'yellow']
    if color not in valid_colors:
        color = 'gray'
    
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
        color=color,
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
        'color': wallet.color,
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
    if 'color' in data:
        valid_colors = ['red', 'blue', 'purple', 'gray', 'green', 'orange', 'yellow']
        color = data['color']
        if color in valid_colors:
            wallet.color = color
        else:
            wallet.color = 'gray'
    
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
    try:
        headers = get_trongrid_headers()
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 500
    
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
            
            # Store old balances for comparison BEFORE updating
            old_balance_trx = wallet.balance_trx
            old_balance_usdt = wallet.balance_usdt
            
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
            
            # Check if USDT balance changed by more than 10 USDT (TRX changes are ignored)
            # Only SET balance_changed to True if balance changed significantly
            # Do NOT reset it to False here - it should only be reset after AML check
            usdt_change = abs(wallet.balance_usdt - old_balance_usdt)
            if usdt_change > 10.0:
                wallet.balance_changed = True
                print(f"Balance changed for {wallet.name}: USDT {old_balance_usdt} -> {wallet.balance_usdt} (change: {usdt_change:.2f} USDT)")
            # If balance didn't change significantly, keep the existing balance_changed flag
            # (don't reset it - it will only be reset after AML check)
            
            db.session.commit()
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

def build_bitok_signature(http_method, endpoint, timestamp, json_payload=None, api_secret=None):
    """Build HMAC-SHA256 signature for BitOK API"""
    import hmac
    import hashlib
    import base64
    import json
    
    if api_secret is None:
        api_secret = require_env('BITOK_API_SECRET')
    
    str_to_sign = f"{http_method}\n{endpoint}\n{timestamp}"
    
    if json_payload:
        str_to_sign += f"\n{json.dumps(json_payload, separators=(',', ':'))}"
    
    built_signature = hmac.new(
        api_secret.encode('utf-8'),
        msg=str_to_sign.encode('utf-8'),
        digestmod=hashlib.sha256
    ).digest()
    
    signature = base64.b64encode(built_signature).decode()
    return signature

def perform_aml_check_async(wallet_id):
    """Выполняет AML проверку в фоновом потоке"""
    with app.app_context():
        wallet = Wallet.query.get(wallet_id)
        if not wallet:
            return
        
        try:
            api_key_id, api_secret = get_bitok_credentials()
            
            # Создаем запрос на проверку адреса
            timestamp = str(int(time.time() * 1000))
            endpoint = '/v1/manual-checks/check-address/'
            
            payload = {
                'network': 'TRX',
                'address': wallet.address
            }
            
            signature = build_bitok_signature('POST', endpoint, timestamp, payload, api_secret)
            
            headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'API-KEY-ID': api_key_id,
                'API-TIMESTAMP': timestamp,
                'API-SIGNATURE': signature
            }
            
            # Отправляем запрос на проверку
            response = requests.post(
                f'{BITOK_API_BASE_URL}{endpoint}',
                headers=headers,
                json=payload,
                timeout=10
            )
            
            if response.status_code != 200:
                raise Exception(f"BitOK API error: {response.status_code} - {response.text}")
            
            check_data = response.json()
            check_id = check_data.get('id')
            
            if not check_id:
                raise Exception("No check ID returned from BitOK API")
            
            # Опрашиваем статус проверки (максимум 60 секунд = 1 минута)
            max_attempts = 60
            attempt = 0
            
            while attempt < max_attempts:
                time.sleep(1)  # Ждем 1 секунду между запросами
                
                timestamp = str(int(time.time() * 1000))
                endpoint = f'/v1/manual-checks/{check_id}/'
                signature = build_bitok_signature('GET', endpoint, timestamp, None, api_secret)
                
                headers = {
                    'Accept': 'application/json',
                    'API-KEY-ID': api_key_id,
                    'API-TIMESTAMP': timestamp,
                    'API-SIGNATURE': signature
                }
                
                status_response = requests.get(
                    f'{BITOK_API_BASE_URL}{endpoint}',
                    headers=headers,
                    timeout=10
                )
                
                if status_response.status_code == 200:
                    status_data = status_response.json()
                    check_status = status_data.get('check_status')
                    
                    if check_status == 'checked':
                        risk_level = status_data.get('risk_level', 'undefined')
                        risk_score = status_data.get('risk_score')
                        
                        # Конвертируем risk_score (0.0-1.0) в процент (0.0-100.0)
                        if risk_score is not None:
                            aml_score = round(risk_score * 100, 1)
                        else:
                            # Если нет risk_score, определяем по risk_level
                            if risk_level == 'low':
                                aml_score = 20
                            elif risk_level == 'medium':
                                aml_score = 50
                            elif risk_level == 'high':
                                aml_score = 80
                            elif risk_level == 'severe':
                                aml_score = 100
                            else:
                                aml_score = 0
                        
                        # Обновляем результат проверки
                        wallet.aml_checking = False
                        wallet.aml_status = 'checked'
                        wallet.aml_checked_at = datetime.utcnow()
                        wallet.aml_score = aml_score
                        wallet.aml_risk_level = risk_level
                        wallet.balance_changed = False  # Reset balance_changed flag after AML check
                        
                        # Получаем customer из адресной книги, если есть
                        customer = None
                        address_entry = AddressBook.query.filter_by(address=wallet.address).first()
                        if address_entry:
                            customer = address_entry.customer
                        
                        # Используем текущие балансы кошелька
                        balance_usdt = wallet.balance_usdt or 0.0
                        balance_trx = wallet.balance_trx or 0.0
                        
                        # Сохраняем результат проверки в таблицу AmlCheck
                        aml_check = AmlCheck(
                            address=wallet.address,
                            risk_level=risk_level,
                            risk_score=aml_score,
                            customer=customer,
                            manager='N4',
                            balance_usdt=balance_usdt,
                            balance_trx=balance_trx,
                            checked_at=datetime.utcnow()
                        )
                        db.session.add(aml_check)
                        db.session.commit()
                        return
                    elif check_status == 'error':
                        raise Exception("BitOK API check failed with error status")
                
                attempt += 1
            
            # Если проверка не завершилась за отведенное время
            raise Exception("AML check timeout - check is still in progress")
            
        except Exception as e:
            # В случае ошибки сбрасываем флаг проверки
            wallet.aml_checking = False
            wallet.aml_status = 'error'
            db.session.commit()
            print(f"AML check error for wallet {wallet_id}: {str(e)}")

def perform_aml_check_for_address(address, manager='N4'):
    """Выполняет AML проверку для произвольного адреса"""
    try:
        api_key_id, api_secret = get_bitok_credentials()
        
        # Создаем запрос на проверку адреса
        timestamp = str(int(time.time() * 1000))
        endpoint = '/v1/manual-checks/check-address/'
        
        payload = {
            'network': 'TRX',
            'address': address
        }
        
        signature = build_bitok_signature('POST', endpoint, timestamp, payload, api_secret)
        
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'API-KEY-ID': api_key_id,
            'API-TIMESTAMP': timestamp,
            'API-SIGNATURE': signature
        }
        
        # Отправляем запрос на проверку
        response = requests.post(
            f'{BITOK_API_BASE_URL}{endpoint}',
            headers=headers,
            json=payload,
            timeout=10
        )
        
        if response.status_code != 200:
            raise Exception(f"BitOK API error: {response.status_code} - {response.text}")
        
        check_data = response.json()
        check_id = check_data.get('id')
        
        if not check_id:
            raise Exception("No check ID returned from BitOK API")
        
        # Опрашиваем статус проверки (максимум 60 секунд = 1 минута)
        max_attempts = 60
        attempt = 0
        
        while attempt < max_attempts:
            time.sleep(1)  # Ждем 1 секунду между запросами
            
            timestamp = str(int(time.time() * 1000))
            endpoint = f'/v1/manual-checks/{check_id}/'
            signature = build_bitok_signature('GET', endpoint, timestamp, None, api_secret)
            
            headers = {
                'Accept': 'application/json',
                'API-KEY-ID': api_key_id,
                'API-TIMESTAMP': timestamp,
                'API-SIGNATURE': signature
            }
            
            status_response = requests.get(
                f'{BITOK_API_BASE_URL}{endpoint}',
                headers=headers,
                timeout=10
            )
            
            if status_response.status_code == 200:
                status_data = status_response.json()
                check_status = status_data.get('check_status')
                
                if check_status == 'checked':
                    risk_level = status_data.get('risk_level', 'undefined')
                    risk_score = status_data.get('risk_score')
                    
                    # Конвертируем risk_score (0.0-1.0) в процент (0.0-100.0)
                    if risk_score is not None:
                        aml_score = round(risk_score * 100, 1)
                    else:
                        # Если нет risk_score, определяем по risk_level
                        if risk_level == 'low':
                            aml_score = 20
                        elif risk_level == 'medium':
                            aml_score = 50
                        elif risk_level == 'high':
                            aml_score = 80
                        elif risk_level == 'severe':
                            aml_score = 100
                        else:
                            aml_score = 0
                    
                    # Получаем customer из адресной книги, если есть
                    customer = None
                    address_entry = AddressBook.query.filter_by(address=address).first()
                    if address_entry:
                        customer = address_entry.customer
                    
                    # Получаем балансы USDT и TRX из TronGrid API
                    balance_usdt = 0.0
                    balance_trx = 0.0
                    try:
                        headers = get_trongrid_headers()
                        
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
                                balance_trx = round(balance_sun / 1_000_000, 2)  # Convert from sun to TRX
                        
                        # Get USDT balance using tronpy library approach
                        try:
                            import base58
                            from tronpy import Tron
                            from tronpy.keys import PrivateKey
                            
                            tron = Tron(network='mainnet')
                            contract = tron.get_contract(USDT_TRC20_CONTRACT)
                            
                            # Convert address to hex
                            address_bytes = base58.b58decode_check(address)
                            address_hex = '0x' + address_bytes.hex()
                            
                            # Call balanceOf function
                            result = contract.functions.balanceOf(address_hex)
                            balance_usdt = round(result / 1_000_000, 2)  # USDT has 6 decimals
                        except Exception as e:
                            print(f"Error getting USDT balance with tronpy for {address}: {str(e)}")
                            # Fallback: try direct API call
                            try:
                                usdt_response = requests.get(
                                    f'{TRONGRID_API_URL}/v1/accounts/{address}/tokens',
                                    headers=headers,
                                    params={'contract_address': USDT_TRC20_CONTRACT},
                                    timeout=10
                                )
                                if usdt_response.status_code == 200:
                                    usdt_data = usdt_response.json()
                                    if usdt_data and len(usdt_data) > 0:
                                        for token in usdt_data:
                                            if token.get('token_address') == USDT_TRC20_CONTRACT:
                                                balance_usdt = round(float(token.get('balance', 0)) / 1_000_000, 2)
                                                break
                            except Exception as e2:
                                print(f"Error getting USDT balance via API for {address}: {str(e2)}")
                    except Exception as e:
                        print(f"Error fetching balances for {address}: {str(e)}")
                    
                    # Сохраняем результат проверки
                    aml_check = AmlCheck(
                        address=address,
                        risk_level=risk_level,
                        risk_score=aml_score,
                        customer=customer,
                        manager=manager,
                        balance_usdt=balance_usdt,
                        balance_trx=balance_trx,
                        checked_at=datetime.utcnow()
                    )
                    db.session.add(aml_check)
                    db.session.commit()
                    
                    return {
                        'success': True,
                        'risk_level': risk_level,
                        'risk_score': aml_score,
                        'customer': customer
                    }
                elif check_status == 'error':
                    raise Exception("BitOK API check failed with error status")
            
            attempt += 1
        
        # Если проверка не завершилась за отведенное время
        raise Exception("AML check timeout - check is still in progress")
        
    except Exception as e:
        print(f"AML check error for address {address}: {str(e)}")
        raise

@app.route('/api/aml-check/check-address', methods=['POST'])
def check_address_aml():
    """Проверка адреса на AML"""
    data = request.json
    address = data.get('address', '').strip()
    manager = data.get('manager', 'N4')
    
    if not address:
        return jsonify({
            'success': False,
            'error': 'Address is required'
        }), 400
    
    # Валидация адреса TRX
    if not (address.startswith('T') and len(address) == 34):
        return jsonify({
            'success': False,
            'error': 'Invalid TRX address format'
        }), 400
    
    # Запускаем проверку в фоновом потоке
    thread = threading.Thread(target=perform_aml_check_for_address_async, args=(address, manager))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': 'AML check started'
    })

def perform_aml_check_for_address_async(address, manager):
    """Выполняет AML проверку в фоновом потоке"""
    with app.app_context():
        try:
            result = perform_aml_check_for_address(address, manager)
            print(f"AML check completed for {address}: {result}")
        except Exception as e:
            print(f"AML check error for {address}: {str(e)}")

@app.route('/api/aml-check', methods=['GET'])
def get_aml_checks():
    """Получить список всех AML проверок"""
    try:
        checks = AmlCheck.query.order_by(AmlCheck.checked_at.desc()).all()
        
        result_checks = []
        for check in checks:
            # Safely get balance fields (they might not exist in old records or DB schema)
            balance_usdt = 0.0
            balance_trx = 0.0
            try:
                # Use getattr with default value to avoid AttributeError
                balance_usdt = getattr(check, 'balance_usdt', None) or 0.0
            except (AttributeError, KeyError):
                balance_usdt = 0.0
            
            try:
                balance_trx = getattr(check, 'balance_trx', None) or 0.0
            except (AttributeError, KeyError):
                balance_trx = 0.0
            
            result_checks.append({
                'id': check.id,
                'address': check.address,
                'risk_level': check.risk_level,
                'risk_score': check.risk_score,
                'customer': check.customer,
                'manager': check.manager,
                'balance_usdt': float(balance_usdt) if balance_usdt is not None else 0.0,
                'balance_trx': float(balance_trx) if balance_trx is not None else 0.0,
                'checked_at': check.checked_at.isoformat() if check.checked_at else None
            })
        
        return jsonify({
            'checks': result_checks
        })
    except Exception as e:
        print(f"Error in get_aml_checks: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'message': 'Failed to load AML checks'}), 500

@app.route('/api/wallets/<int:wallet_id>/aml-check', methods=['POST'])
def check_aml(wallet_id):
    wallet = Wallet.query.get_or_404(wallet_id)
    
    # Проверяем, не идет ли уже проверка
    if wallet.aml_checking:
        return jsonify({
            'success': False,
            'error': 'AML check is already in progress'
        }), 400
    
    # Устанавливаем флаг проверки в процессе
    wallet.aml_checking = True
    wallet.aml_status = 'checking'
    db.session.commit()
    
    # Запускаем проверку в фоновом потоке
    thread = threading.Thread(target=perform_aml_check_async, args=(wallet_id,))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True,
        'message': 'AML check started',
        'aml_status': 'checking',
        'aml_checking': True
    })

@app.route('/api/wallets/<int:wallet_id>/reset-aml-checking', methods=['POST'])
def reset_aml_checking(wallet_id):
    """Сбрасывает зависший флаг AML проверки"""
    wallet = Wallet.query.get_or_404(wallet_id)
    
    if wallet.aml_checking:
        wallet.aml_checking = False
        if wallet.aml_status == 'checking':
            wallet.aml_status = 'pending'
        db.session.commit()
        return jsonify({
            'success': True,
            'message': 'AML checking flag reset'
        })
    else:
        return jsonify({
            'success': False,
            'message': 'Wallet is not in checking state'
        }), 400

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
    
    if hide_small:
        query = query.filter((Transaction.currency != 'USDT') | (Transaction.amount >= 10.0))
    
    transactions = query.order_by(Transaction.created_at.desc()).all()
    
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
            'comment': t.comment,
            'transaction_type': t.transaction_type,
            'created_at': t.created_at.isoformat()
        } for t in transactions]
    })

def get_counterparty_name(address):
    """Get customer name from address book if address exists"""
    if not address:
        return None
    address_clean = address.strip().lower()
    
    entry = AddressBook.query.filter(
        func.lower(func.trim(AddressBook.address)) == address_clean
    ).first()
    if entry:
        print(f"Found address book entry for '{address_clean}': {entry.customer}")
        return entry.customer

    return None

def commit_refresh_batch(batch_name, errors):
    """Commit a refresh batch and recover the SQLAlchemy session on failure."""
    try:
        db.session.commit()
        return True
    except Exception as e:
        db.session.rollback()
        message = f"Error saving transactions for {batch_name}: {str(e)}"
        print(message)
        errors.append(message)
        return False

def should_import_trc20_transaction(tx_data):
    """Import only actual TRC20 transfers; approvals are allowances, not movements."""
    return tx_data.get('type', 'Transfer') == 'Transfer'

def is_approve_contract_call(contract_value):
    """Detect TRC20 approve(address,uint256), which is not a fund movement."""
    return (contract_value.get('data') or '').startswith('095ea7b3')

@app.route('/api/transactions/refresh', methods=['POST'])
def refresh_transactions():
    try:
        headers = get_trongrid_headers()
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 500
    
    wallets = Wallet.query.all()
    new_count = 0
    errors = []
    
    # Get all wallet addresses for internal transfer detection
    # Normalize addresses: strip whitespace and convert to lowercase
    wallet_addresses = set(w.address.strip().lower() for w in wallets if w.address)
    
    print(f"\n=== REFRESH TRANSACTIONS CALLED ===")
    print(f"Found {len(wallets)} wallets to check")
    
    # Get ALL existing transaction hashes with wallet_id to avoid duplicates
    # Check by combination of tx_hash + wallet_id to prevent duplicates for the same wallet
    all_existing_tx_keys = set(
        (tx.tx_hash, tx.wallet_id) for tx in Transaction.query.filter(Transaction.tx_hash.isnot(None)).all()
        if tx.tx_hash
    )
    print(f"Found {len(all_existing_tx_keys)} existing transactions in database")
    
    for wallet in wallets:
        try:
            address = wallet.address
            wallet_new_count = 0
            print(f"\n=== Getting transactions for {wallet.name} ({address}) ===")
            
            # Check for duplicates by (tx_hash, wallet_id) combination
            # This prevents adding the same transaction multiple times for the same wallet
            
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
                            if not should_import_trc20_transaction(tx_data):
                                print(f"Skipping TRC20 {tx_data.get('type')} transaction: {tx_data.get('transaction_id', '')[:16]}...")
                                continue
                            tx_hash = tx_data.get('transaction_id')
                            # Check if this transaction already exists for this wallet
                            tx_key = (tx_hash, wallet.id)
                            if tx_hash and tx_key not in all_existing_tx_keys:
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
                                
                                # Only zero-value outgoing USDT entries need the expensive approve check.
                                if amount == 0.0 and direction == 'outgoing' and to_addr and to_addr.lower() != address.lower():
                                    try:
                                        tx_detail_response = requests.get(
                                            f'{TRONGRID_API_URL}/wallet/gettransactionbyid',
                                            headers=headers,
                                            params={'value': tx_hash},
                                            timeout=3
                                        )
                                        if tx_detail_response.status_code == 200:
                                            tx_detail = tx_detail_response.json()
                                            raw_data = tx_detail.get('raw_data', {})
                                            contracts = raw_data.get('contract', [])
                                            for contract in contracts:
                                                contract_type = contract.get('type')
                                                if contract_type == 'TriggerSmartContract':
                                                    parameter = contract.get('parameter', {})
                                                    value = parameter.get('value', {})
                                                    data = value.get('data', '')
                                                    # Approve method signature: approve(address,uint256) = 0x095ea7b3
                                                    if data and data.startswith('095ea7b3'):
                                                        is_approve = True
                                                        if len(data) >= 136:
                                                            try:
                                                                approve_amount_hex = data[72:136]
                                                                approve_amount_int = int(approve_amount_hex, 16)
                                                                approve_amount = round(approve_amount_int / 1_000_000, 6)
                                                                print(f"Extracted approve amount: {approve_amount} USDT from hex: {approve_amount_hex}")
                                                            except (ValueError, IndexError) as e:
                                                                print(f"Error extracting approve amount: {e}")
                                                                approve_amount = 0.0
                                                        break
                                    except Exception as e:
                                        print(f"Error checking approve transaction: {e}")
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
                                
                                # Get counterparty name from address book
                                # For incoming: counterparty is from_address (who sent)
                                # For outgoing: counterparty is to_address (who received)
                                counterparty_address = from_addr if direction == 'incoming' else to_addr
                                if counterparty_address:
                                    with db.session.no_autoflush:
                                        counterparty_name = get_counterparty_name(counterparty_address)
                                    if counterparty_name:
                                        print(f"Found counterparty: {counterparty_name} for address: {counterparty_address}")
                                else:
                                    counterparty_name = None
                                
                                # Check if this is an internal transfer (both addresses belong to our wallets)
                                comment = None
                                if from_addr and to_addr:
                                    # Normalize addresses: strip whitespace and convert to lowercase
                                    from_addr_clean = from_addr.strip().lower() if isinstance(from_addr, str) else str(from_addr).strip().lower()
                                    to_addr_clean = to_addr.strip().lower() if isinstance(to_addr, str) else str(to_addr).strip().lower()
                                    
                                    # Check if both addresses are non-empty and belong to our wallets
                                    if from_addr_clean and to_addr_clean:
                                        if from_addr_clean in wallet_addresses and to_addr_clean in wallet_addresses:
                                            comment = "Own fund transfer"
                                            print(f"Detected own fund transfer: {from_addr} -> {to_addr}")
                                        else:
                                            # Debug output to help diagnose why transfers aren't detected
                                            print(f"NOT detected as own fund transfer: {from_addr} -> {to_addr}")
                                            print(f"  from_addr_clean in wallet_addresses: {from_addr_clean in wallet_addresses}")
                                            print(f"  to_addr_clean in wallet_addresses: {to_addr_clean in wallet_addresses}")
                                            if from_addr_clean not in wallet_addresses:
                                                print(f"  from_addr '{from_addr_clean}' not found in wallet addresses")
                                            if to_addr_clean not in wallet_addresses:
                                                print(f"  to_addr '{to_addr_clean}' not found in wallet addresses")
                                
                                transaction = Transaction(
                                    wallet_id=wallet.id,
                                    currency='USDT',
                                    amount=display_amount,  # Use approve_amount for approve, regular amount for others
                                    direction=direction,
                                    type=transaction_type,
                                    from_address=from_addr if from_addr else None,
                                    to_address=to_addr if to_addr else None,
                                    counterparty_name=counterparty_name,
                                    comment=comment,
                                    tx_hash=tx_hash,
                                    created_at=tx_datetime
                                )
                                db.session.add(transaction)
                                # Add to set to prevent duplicates
                                all_existing_tx_keys.add(tx_key)
                                new_count += 1
                                wallet_new_count += 1
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
                            # Check if this transaction already exists for this wallet
                            tx_key = (tx_hash, wallet.id)
                            if tx_hash and tx_key not in all_existing_tx_keys:
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
                                        
                                        # Check if this is an internal transfer (both addresses belong to our wallets)
                                        comment = None
                                        if from_addr and to_addr:
                                            # Normalize addresses: strip whitespace and convert to lowercase
                                            from_addr_clean = from_addr.strip().lower() if isinstance(from_addr, str) else str(from_addr).strip().lower()
                                            to_addr_clean = to_addr.strip().lower() if isinstance(to_addr, str) else str(to_addr).strip().lower()
                                            
                                            # Check if both addresses are non-empty and belong to our wallets
                                            if from_addr_clean and to_addr_clean:
                                                if from_addr_clean in wallet_addresses and to_addr_clean in wallet_addresses:
                                                    comment = "Own fund transfer"
                                                    print(f"Detected own fund transfer: {from_addr} -> {to_addr}")
                                                else:
                                                    # Debug output to help diagnose why transfers aren't detected
                                                    print(f"NOT detected as own fund transfer: {from_addr} -> {to_addr}")
                                                    print(f"  from_addr_clean in wallet_addresses: {from_addr_clean in wallet_addresses}")
                                                    print(f"  to_addr_clean in wallet_addresses: {to_addr_clean in wallet_addresses}")
                                                    if from_addr_clean not in wallet_addresses:
                                                        print(f"  from_addr '{from_addr_clean}' not found in wallet addresses")
                                                    if to_addr_clean not in wallet_addresses:
                                                        print(f"  to_addr '{to_addr_clean}' not found in wallet addresses")
                                        
                                        transaction = Transaction(
                                            wallet_id=wallet.id,
                                            currency='TRX',
                                            amount=amount,
                                            direction=direction,
                                            type=transaction_type,  # incoming или outgoing
                                            from_address=from_addr if from_addr else None,
                                            to_address=to_addr if to_addr else None,
                                            counterparty_name=None,  # TRX transactions don't use address book
                                            comment=comment,
                                            tx_hash=tx_hash,
                                            created_at=tx_datetime
                                        )
                                        db.session.add(transaction)
                                        # Add to set to prevent duplicates
                                        all_existing_tx_keys.add(tx_key)
                                        new_count += 1
                                        wallet_new_count += 1
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
                                        # Add to set to prevent duplicates
                                        all_existing_tx_keys.add(tx_key)
                                        new_count += 1
                                        wallet_new_count += 1
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
                                        # Add to set to prevent duplicates
                                        all_existing_tx_keys.add(tx_key)
                                        new_count += 1
                                        wallet_new_count += 1
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
                                        # Add to set to prevent duplicates
                                        all_existing_tx_keys.add(tx_key)
                                        new_count += 1
                                        wallet_new_count += 1
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
                                        # Add to set to prevent duplicates
                                        all_existing_tx_keys.add(tx_key)
                                        new_count += 1
                                        wallet_new_count += 1
                                        print(f"Added TRX transaction: {tx_hash[:16]}... (withdraw)")
                                        transaction_processed = True
                                        break
                                    
                                    elif contract_type in ['TriggerSmartContract', 'CreateSmartContract']:
                                        if is_approve_contract_call(value):
                                            print(f"Skipping approve contract transaction: {tx_hash[:16]}...")
                                            transaction_processed = True
                                            break

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
                                        # Add to set to prevent duplicates
                                        all_existing_tx_keys.add(tx_key)
                                        new_count += 1
                                        wallet_new_count += 1
                                        print(f"Added TRX transaction: {tx_hash[:16]}... (contract_execution)")
                                        transaction_processed = True
                                        break
                                
                                # If no specific contract type matched, skip this transaction
                                if not transaction_processed:
                                    continue
            except Exception as e:
                print(f"Error fetching TRX transactions for {wallet.name}: {str(e)}")
                errors.append(f"Error fetching TRX transactions for {wallet.name}: {str(e)}")
            
            if wallet_new_count > 0:
                if not commit_refresh_batch(wallet.name, errors):
                    new_count -= wallet_new_count
                
        except Exception as e:
            db.session.rollback()
            print(f"Error processing wallet {wallet.name}: {str(e)}")
            errors.append(f"Error processing {wallet.name}: {str(e)}")
            continue
    
    # Update counterparty names for existing USDT transactions that don't have one yet
    # Only update transactions that don't have counterparty_name set
    print("\n=== UPDATING EXISTING TRANSACTIONS WITH ADDRESS BOOK ===")
    updated_count = 0
    existing_usdt_txs = Transaction.query.filter_by(currency='USDT').filter(
        (Transaction.counterparty_name == None) | (Transaction.counterparty_name == '')
    ).all()
    
    for tx in existing_usdt_txs:
        # For incoming: counterparty is from_address (who sent)
        # For outgoing: counterparty is to_address (who received)
        counterparty_address = tx.from_address if tx.direction == 'incoming' else tx.to_address
        if counterparty_address:
            # Normalize address for comparison
            counterparty_address_clean = counterparty_address.strip().lower()
            with db.session.no_autoflush:
                counterparty_name = get_counterparty_name(counterparty_address)
            if counterparty_name:
                # Only update if counterparty_name is different (avoid duplicates)
                if tx.counterparty_name != counterparty_name:
                    tx.counterparty_name = counterparty_name
                    updated_count += 1
                    print(f"Updated transaction {tx.id}: set counterparty_name={counterparty_name} for address={counterparty_address}")
    
    # Update "Own fund transfer" status for existing transactions that don't have it yet
    print("\n=== UPDATING EXISTING TRANSACTIONS WITH OWN FUND TRANSFER STATUS ===")
    own_fund_updated_count = 0
    existing_txs = Transaction.query.filter(
        (Transaction.comment != 'Own fund transfer') | (Transaction.comment == None)
    ).filter(
        Transaction.from_address.isnot(None),
        Transaction.to_address.isnot(None)
    ).all()
    
    for tx in existing_txs:
        if tx.from_address and tx.to_address:
            # Normalize addresses: strip whitespace and convert to lowercase
            from_addr_clean = tx.from_address.strip().lower() if isinstance(tx.from_address, str) else str(tx.from_address).strip().lower()
            to_addr_clean = tx.to_address.strip().lower() if isinstance(tx.to_address, str) else str(tx.to_address).strip().lower()
            
            # Check if both addresses are non-empty and belong to our wallets
            if from_addr_clean and to_addr_clean:
                if from_addr_clean in wallet_addresses and to_addr_clean in wallet_addresses:
                    tx.comment = "Own fund transfer"
                    own_fund_updated_count += 1
                    print(f"Updated transaction {tx.id} ({tx.tx_hash[:16]}...): Own fund transfer")
    
    if own_fund_updated_count > 0:
        print(f"Updated {own_fund_updated_count} transactions with 'Own fund transfer' status")
    
    commit_refresh_batch("transaction metadata", errors)
    
    print(f"\n=== TRANSACTIONS REFRESH COMPLETE ===")
    print(f"Added {new_count} new transactions")
    print(f"Updated {updated_count} existing transactions with address book entries")
    print(f"Updated {own_fund_updated_count} existing transactions with 'Own fund transfer' status")
    if errors:
        print(f"Errors: {errors}")
    
    return jsonify({
        'success': True,
        'new_transactions': new_count,
        'updated_transactions': updated_count,
        'errors': errors if errors else None
    })

# Reserves API
@app.route('/api/reserves', methods=['GET'])
def get_reserves():
    reserves = Reserve.query.order_by(Reserve.created_at.desc()).all()
    return jsonify({
        'reserves': [{
            'id': r.id,
            'amount': r.amount,
            'comment': r.comment,
            'created_at': r.created_at.isoformat(),
            'updated_at': r.updated_at.isoformat()
        } for r in reserves]
    })

@app.route('/api/reserves', methods=['POST'])
def create_reserve():
    data = request.json
    amount = float(data.get('amount', 0))
    comment = data.get('comment', '').strip()
    
    if amount <= 0:
        return jsonify({'error': 'Amount must be greater than 0'}), 400
    
    reserve = Reserve(amount=amount, comment=comment)
    db.session.add(reserve)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'reserve': {
            'id': reserve.id,
            'amount': reserve.amount,
            'comment': reserve.comment,
            'created_at': reserve.created_at.isoformat(),
            'updated_at': reserve.updated_at.isoformat()
        }
    })

@app.route('/api/reserves/<int:reserve_id>', methods=['PUT'])
def update_reserve(reserve_id):
    reserve = Reserve.query.get_or_404(reserve_id)
    data = request.json
    amount = float(data.get('amount', reserve.amount))
    comment = data.get('comment', reserve.comment).strip()
    
    if amount <= 0:
        return jsonify({'error': 'Amount must be greater than 0'}), 400
    
    reserve.amount = amount
    reserve.comment = comment
    reserve.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'success': True,
        'reserve': {
            'id': reserve.id,
            'amount': reserve.amount,
            'comment': reserve.comment,
            'created_at': reserve.created_at.isoformat(),
            'updated_at': reserve.updated_at.isoformat()
        }
    })

@app.route('/api/reserves/<int:reserve_id>', methods=['DELETE'])
def delete_reserve(reserve_id):
    reserve = Reserve.query.get_or_404(reserve_id)
    db.session.delete(reserve)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/reserves/total', methods=['GET'])
def get_total_reserves():
    total = db.session.query(func.sum(Reserve.amount)).scalar() or 0.0
    return jsonify({'total': round(total, 2)})

# Address Book API
@app.route('/api/addressbook', methods=['GET'])
def get_addressbook():
    addresses = AddressBook.query.order_by(AddressBook.date_added.desc()).all()
    return jsonify({
        'addresses': [{
            'id': a.id,
            'customer': a.customer,
            'address': a.address,
            'aml_status': a.aml_status,
            'manager': a.manager,
            'date_added': a.date_added.isoformat() if a.date_added else None,
            'created_at': a.created_at.isoformat(),
            'updated_at': a.updated_at.isoformat()
        } for a in addresses]
    })

@app.route('/api/addressbook', methods=['POST'])
def create_addressbook_entry():
    data = request.json
    customer = data.get('customer', '').strip()
    address = data.get('address', '').strip()
    manager = data.get('manager', '').strip()
    aml_status = data.get('aml_status', 'pending')
    
    if not customer or not address:
        return jsonify({'error': 'Customer and Address are required'}), 400
    
    # Check if address already exists
    existing_entry = AddressBook.query.filter_by(address=address).first()
    if existing_entry:
        return jsonify({
            'error': 'Address already exists',
            'existing': {
                'customer': existing_entry.customer,
                'address': existing_entry.address,
                'manager': existing_entry.manager,
                'date_added': existing_entry.date_added.isoformat() if existing_entry.date_added else None
            }
        }), 400
    
    entry = AddressBook(
        customer=customer,
        address=address,
        manager=manager if manager else None,
        aml_status=aml_status
    )
    db.session.add(entry)
    db.session.commit()
    
    # Update transactions for this address (only if they don't already have counterparty_name)
    # This prevents duplicates - transactions will be updated only once
    address_clean = address.strip().lower()
    all_usdt_txs = Transaction.query.filter_by(currency='USDT').filter(
        (Transaction.counterparty_name == None) | (Transaction.counterparty_name == '')
    ).all()
    updated_count = 0
    for tx in all_usdt_txs:
        counterparty_address = tx.from_address if tx.direction == 'incoming' else tx.to_address
        if counterparty_address:
            counterparty_address_clean = counterparty_address.strip().lower()
            if counterparty_address_clean == address_clean:
                tx.counterparty_name = customer
                updated_count += 1
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'address': {
            'id': entry.id,
            'customer': entry.customer,
            'address': entry.address,
            'aml_status': entry.aml_status,
            'manager': entry.manager,
            'date_added': entry.date_added.isoformat() if entry.date_added else None,
            'created_at': entry.created_at.isoformat(),
            'updated_at': entry.updated_at.isoformat()
        },
        'updated_transactions': updated_count
    })

@app.route('/api/addressbook/<int:entry_id>', methods=['PUT'])
def update_addressbook_entry(entry_id):
    entry = AddressBook.query.get_or_404(entry_id)
    data = request.json
    customer = data.get('customer', entry.customer).strip()
    address = data.get('address', entry.address).strip()
    manager = data.get('manager', entry.manager).strip() if data.get('manager') else None
    aml_status = data.get('aml_status', entry.aml_status)
    
    if not customer or not address:
        return jsonify({'error': 'Customer and Address are required'}), 400
    
    # Check if address already exists (excluding current entry)
    if address != entry.address:
        existing_entry = AddressBook.query.filter_by(address=address).first()
        if existing_entry:
            return jsonify({
                'error': 'Address already exists',
                'existing': {
                    'customer': existing_entry.customer,
                    'address': existing_entry.address,
                    'manager': existing_entry.manager,
                    'date_added': existing_entry.date_added.isoformat() if existing_entry.date_added else None
                }
            }), 400
    
    old_address = entry.address
    old_customer = entry.customer
    
    entry.customer = customer
    entry.address = address
    entry.manager = manager
    entry.aml_status = aml_status
    entry.updated_at = datetime.utcnow()
    db.session.commit()
    
    # If customer name or address changed, update transactions
    if old_customer != customer or old_address != address:
        # Update transactions for the old address (if address changed)
        if old_address != address:
            # Clear counterparty_name for transactions with old address
            old_address_clean = old_address.strip().lower()
            all_usdt_txs = Transaction.query.filter_by(currency='USDT').all()
            for tx in all_usdt_txs:
                counterparty_address = tx.from_address if tx.direction == 'incoming' else tx.to_address
                if counterparty_address:
                    counterparty_address_clean = counterparty_address.strip().lower()
                    if counterparty_address_clean == old_address_clean:
                        tx.counterparty_name = None
            
            db.session.commit()
        
        # Update transactions for the new address (or updated customer name)
        address_clean = address.strip().lower()
        all_usdt_txs = Transaction.query.filter_by(currency='USDT').all()
        updated_count = 0
        for tx in all_usdt_txs:
            counterparty_address = tx.from_address if tx.direction == 'incoming' else tx.to_address
            if counterparty_address:
                counterparty_address_clean = counterparty_address.strip().lower()
                if counterparty_address_clean == address_clean:
                    # Only update if the name is different (avoid duplicates)
                    if tx.counterparty_name != customer:
                        tx.counterparty_name = customer
                        updated_count += 1
        
        db.session.commit()
    
    return jsonify({
        'success': True,
        'address': {
            'id': entry.id,
            'customer': entry.customer,
            'address': entry.address,
            'aml_status': entry.aml_status,
            'manager': entry.manager,
            'date_added': entry.date_added.isoformat() if entry.date_added else None,
            'created_at': entry.created_at.isoformat(),
            'updated_at': entry.updated_at.isoformat()
        }
    })

@app.route('/api/addressbook/<int:entry_id>', methods=['DELETE'])
def delete_addressbook_entry(entry_id):
    entry = AddressBook.query.get_or_404(entry_id)
    db.session.delete(entry)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/transactions/<int:transaction_id>/comment', methods=['PUT'])
def update_transaction_comment(transaction_id):
    """Update comment for a transaction"""
    transaction = Transaction.query.get_or_404(transaction_id)
    data = request.json
    comment = data.get('comment', '').strip()
    
    transaction.comment = comment if comment else None
    db.session.commit()
    
    return jsonify({
        'success': True,
        'comment': transaction.comment
    })

@app.route('/api/transactions/<int:transaction_id>/type', methods=['PUT'])
def update_transaction_type(transaction_id):
    """Update transaction type for a transaction"""
    transaction = Transaction.query.get_or_404(transaction_id)
    data = request.json
    transaction_type = data.get('transaction_type', '').strip()
    
    # Validate transaction type
    valid_types = ['Sell usdt', 'Buy usdt', 'Alex', 'Agent', 'Loan', 'Expence', 'Other', 'Transit']
    if transaction_type and transaction_type not in valid_types:
        return jsonify({'error': 'Invalid transaction type'}), 400
    
    transaction.transaction_type = transaction_type if transaction_type else None
    db.session.commit()
    
    return jsonify({
        'success': True,
        'transaction_type': transaction.transaction_type
    })

@app.route('/api/transactions/update-counterparty', methods=['POST'])
def update_transactions_counterparty():
    """Update counterparty_name for all transactions with a given address"""
    data = request.json
    address = data.get('address', '').strip()
    
    if not address:
        return jsonify({'error': 'Address is required'}), 400
    
    # Normalize address for comparison
    address_clean = address.strip().lower()
    
    # Get customer name from address book (try exact match first, then case-insensitive)
    entry = AddressBook.query.filter_by(address=address).first()
    if not entry:
        # Try case-insensitive match
        all_entries = AddressBook.query.all()
        for e in all_entries:
            if e.address.strip().lower() == address_clean:
                entry = e
                break
    
    if not entry:
        return jsonify({'error': 'Address not found in address book'}), 404
    
    customer_name = entry.customer
    
    # Find all USDT transactions where this address is the counterparty
    # For incoming: counterparty is from_address
    # For outgoing: counterparty is to_address
    # Use case-insensitive comparison
    all_usdt_txs = Transaction.query.filter_by(currency='USDT').all()
    
    matching_txs = []
    for tx in all_usdt_txs:
        # Check if this transaction involves the address
        counterparty_address = tx.from_address if tx.direction == 'incoming' else tx.to_address
        if counterparty_address:
            counterparty_address_clean = counterparty_address.strip().lower()
            if counterparty_address_clean == address_clean:
                matching_txs.append(tx)
    
    # Update counterparty_name for all matching transactions
    # Only update if the name is different (avoid duplicates)
    updated_count = 0
    for tx in matching_txs:
        if tx.counterparty_name != customer_name:
            tx.counterparty_name = customer_name
            updated_count += 1
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'updated_count': updated_count,
        'customer_name': customer_name
    })

@app.route('/api/transactions/remove-duplicates', methods=['POST'])
def remove_duplicate_transactions():
    """Remove duplicate transactions based on (tx_hash, wallet_id) combination"""
    from collections import defaultdict
    
    try:
        # Find duplicates by (tx_hash, wallet_id) combination
        duplicates = defaultdict(list)
        
        all_transactions = Transaction.query.filter(
            Transaction.tx_hash.isnot(None),
            Transaction.tx_hash != ''
        ).all()
        
        # Group by (tx_hash, wallet_id)
        for tx in all_transactions:
            key = (tx.tx_hash, tx.wallet_id)
            duplicates[key].append(tx)
        
        # Find duplicate groups (where more than one transaction with same key)
        duplicate_groups = {k: v for k, v in duplicates.items() if len(v) > 1}
        
        total_deleted = 0
        deleted_details = []
        
        for (tx_hash, wallet_id), transactions in duplicate_groups.items():
            # Sort by id (oldest first)
            transactions.sort(key=lambda x: x.id)
            
            # Keep the first (oldest), delete the rest
            to_delete = transactions[1:]
            
            for tx in to_delete:
                deleted_details.append({
                    'id': tx.id,
                    'tx_hash': tx_hash[:20] + '...' if len(tx_hash) > 20 else tx_hash,
                    'amount': float(tx.amount),
                    'currency': tx.currency,
                    'wallet_id': wallet_id
                })
                db.session.delete(tx)
                total_deleted += 1
        
        if total_deleted > 0:
            db.session.commit()
            return jsonify({
                'success': True,
                'deleted_count': total_deleted,
                'duplicate_groups': len(duplicate_groups),
                'details': deleted_details[:10]  # Return first 10 for display
            })
        else:
            return jsonify({
                'success': True,
                'deleted_count': 0,
                'duplicate_groups': 0,
                'message': 'No duplicates found'
            })
    except Exception as e:
        print(f"Error removing duplicates: {e}")
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

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

