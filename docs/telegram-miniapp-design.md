# Telegram Mini App Design

## Direction
IB4DECK Mini App uses a compact financial cockpit layout optimized for Telegram WebView. The visual language is dense, dark-first, and operational: balances, alerts, and actions stay visible without a desktop sidebar.

## Navigation
- Bottom tabs: `Wallets`, `Transactions`, `Contacts`, `AML`.
- Each tab keeps its own scroll position.
- Telegram BackButton closes active sheets first, then returns to the previous tab.
- Destructive actions use native confirmation copy in the UI before calling the API.

## Wallets
- Top summary strip: total USDT, reserved USDT, available USDT, total TRX.
- Wallet cards show name, address short form, USDT/TRX balances, AML state, hidden state, and color accent.
- Primary actions: refresh balances, add wallet, manage reserves.
- Wallet details open as a bottom sheet with rename, color picker, delete, AML check, and wallet-specific transaction history.
- Reserves are managed from a compact sheet launched from the summary strip.

## Transactions
- Dedicated transaction feed supports filters for small USDT, TRX, and own fund transfers.
- Primary actions: refresh transactions and remove duplicates.
- Transaction rows can open the same add-address sheet with the counterparty address prefilled.

## Contacts
- Search-first list grouped by customer.
- Add/edit sheet contains customer, address, manager, and AML status.

## AML
- Address check form is always visible at the top.
- Results are risk cards with score, risk level, balances, customer, manager, and checked time.
- Active checks use inline progress rows and polling.

## Telegram Integration
- Frontend reads `window.Telegram.WebApp.initData` only to send it to the backend.
- Backend validates initData and returns a Bearer token.
- UI uses Telegram theme variables when available and falls back to local CSS variables.
- MainButton is reserved for active sheet submit actions; HapticFeedback is used after successful writes.
