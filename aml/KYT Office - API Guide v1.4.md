# Welcome to KYT Office by BitOK

KYT Office is the service where you can register all transfers in crypto and then control all its properties and risks.

# API Guide

## Transfers

Transfers are core objects of KYT Service.

### Types of transfers

There are two types of transfers:

- **Full transfer** \- a transfer that has already occurred in a blockchain. The network, the transaction hash, the input and output addresses, the amount and the accurate date and time are defined.

- **Transfer attempt** \- a transfer not yet occurred in a blockchain. Such types of transfers are used to pre-check a counterparty wallet for potential risks.

There are 2 subtypes of the full transfers:

- **Deposit** \- incoming transfer bound to a transaction.

- **Withdrawal** \- outgoing transfer bound to a transaction.

There are 2 subtypes of the transfer attempts:

- **Deposit attempt** \- incoming transfer not bound to a transaction.

- **Withdrawal attempt** \- outgoing transfer not bound to a transaction.

## Registering transfers

### How to register a full transfer

To register a full transfer using **/transfers/register/** endpoint you must define the following fields about the transfer:

- **client\_id** (optional) \- an external ID of the client the transfer will be associated with.

- **direction** \- the direction of the transfer.

- **network \-** the code of the network where the transfer occurred.

- **tx\_hash** \- the hash of the transaction the transfer belongs to.

- **token\_id** \- the identifier of the token within its network.

- **output\_address** \- the address of a recipient of the transfer.

Request:

| curl \-X POST "https://kyt-api.bitok.org/v1/transfers/register/" \\ \--header  "Content-Type: application/json" \\ \--header  "Accept: application/json" \\ \--header  "API-KEY-ID:{KEY\_ID}" \\ \--header  "API-TIMESTAMP:{TIMESTAMP}" \\ \--header  "API-SIGNATURE:{SIGNATURE}" \\ \--data ‘{   "client\_id": "id0001",   "direction": "incoming",   "network": "ETH",   "tx\_hash": "0x46bf4313a1f7f22cf97859d119c609fedad81541330de661f967795cc4f46e89",   "token\_id": "0xdac17f958d2ee523a2206206994597c13d831ec7",   "output\_address": "0x98Cb5718876AaB18e3A8429a18Ad543f6369A6f3" }’ |
| :---- |

Response:

| {   "id": "cdc3fd93-c975-4b79-beb7-4ad058078b48",   "client\_id": "id0001",   "registered\_at": "2023-12-18T13:47:25.197606+03:00",   "occurred\_at": null,   "direction": "incoming",   "risk\_level": "undefined",   "network": "ETH",   "token\_id": "0xdac17f958d2ee523a2206206994597c13d831ec7",   "token\_symbol": "USDT",   "tx\_hash": "0x46bf4313a1f7f22cf97859d119c609fedad81541330de661f967795cc4f46e89",   "tx\_status": "binding",   "input\_address": null,   "output\_address": "0x98cb5718876aab18e3a8429a18ad543f6369a6f3",   "amount": null,   "fiat\_currency": "USD",   "value\_in\_fiat": null,   "check\_state": { 	"exposure": "queued", 	"exposure\_checked\_at": null, 	"counterparty": "none", 	"counterparty\_checked\_at": null, 	"sanctions": "none", 	"sanctions\_checked\_at": null   } } |
| :---- |

When the transaction is bound the state of the transfer state will be enriched with all necessary properties.

Request:

| curl \-X GET "https://kyt-api.bitok.org/v1/transfers/cdc3fd93-c975-4b79-beb7-4ad058078b48/" \\ \--header  "Accept: application/json" \\ \--header  "API-KEY-ID:{KEY\_ID}" \\ \--header  "API-TIMESTAMP:{TIMESTAMP}" \\ \--header  "API-SIGNATURE:{SIGNATURE}" |
| :---- |

Response:

| {   "id": "cdc3fd93-c975-4b79-beb7-4ad058078b48",   "client\_id": "id0001",   "registered\_at": "2023-12-18T13:47:25.197606+03:00",   "occurred\_at": "2023-12-18T13:46:23+03:00",   "direction": "incoming",   "risk\_level": "medium",   "network": "ETH",   "token\_id": "0xdac17f958d2ee523a2206206994597c13d831ec7",   "token\_symbol": "USDT",   "tx\_hash": "0x46bf4313a1f7f22cf97859d119c609fedad81541330de661f967795cc4f46e89",   "tx\_status": "bound",   "input\_address": "0x56eddb7aa87536c09ccc2793473599fd21a8b17f",   "output\_address": "0x98cb5718876aab18e3a8429a18ad543f6369a6f3",   "amount": 1206,   "fiat\_currency": "USD",   "value\_in\_fiat": 1205.2,   "check\_state": {     "exposure": "checked",     "exposure\_checked\_at": "2023-12-18T10:47:27.045732Z",     "counterparty": "none",     "counterparty\_checked\_at": null,     "sanctions": "checked",     "sanctions\_checked\_at": "2023-12-18T10:47:27.045732Z"   } } |
| :---- |

### How to register a transfer attempt

To register a transfer attempt using **/transfers/register-attempt/** endpoint you must define the following fields:

- **client\_id** (optional) \- an external ID of the client the transfer will be associated with.

- **attempt\_id** (optional) \- a unique external ID of the attempt used while registering the transfer.

- **direction** \- the direction of the transfer.

- **network \-** the code of the network where the transfer occurred.

- **input\_address** (when **direction** is “**incoming**”) \- the address of a sender of the transfer.

- **output\_address** (when **direction** is “**outgoing**”) \- the address of a recipient of the transfer.

- **token\_id** (optional)

- **amount** (optional)

Request:

| curl \-X POST "https://kyt-api.bitok.org/v1/transfers/register-attempt/" \\ \--header  "Content-Type: application/json" \\ \--header  "Accept: application/json" \\ \--header  "API-KEY-ID:{KEY\_ID}" \\ \--header  "API-TIMESTAMP:{TIMESTAMP}" \\ \--header  "API-SIGNATURE:{SIGNATURE}" \\ \--data ‘{   "client\_id": "id0001",   "attempt\_id": "0a805206bab649a68b3408032a7352e6",   "direction": "outgoing",   "network": "ETH",   "token\_id": "0xdac17f958d2ee523a2206206994597c13d831ec7",   "output\_address": "0x92a5B444907902dAa39dE28A82EF66AF12e7f170",   "amount": 500 }’ |
| :---- |

Response:

| {   "id": "3c6b874e-f76c-42b4-8a08-e13fc50fa6a5",   "client\_id": "id0001",   "attempt\_id": "0a805206bab649a68b3408032a7352e6",   "registered\_at": "2023-12-18T14:15:02.266520+03:00",   "occurred\_at": "2023-12-18T14:15:02.258132+03:00",   "direction": "outgoing",   "risk\_level": "undefined",   "network": "ETH",   "token\_id": "0xdac17f958d2ee523a2206206994597c13d831ec7",   "token\_symbol": "USDT",   "tx\_hash": null,   "tx\_status": "none",   "input\_address": null,   "output\_address": "0x92a5b444907902daa39de28a82ef66af12e7f170",   "amount": 500,   "fiat\_currency": "USD",   "value\_in\_fiat": 499.66889865320763,   "check\_state": {     "exposure": "none",     "exposure\_checked\_at": null,     "counterparty": "checking",     "counterparty\_checked\_at": null,     "sanctions": "none",     "sanctions\_checked\_at": null   } } |
| :---- |

### How to bind a transaction to a transfer attempt

Each transfer attempt could be upgraded to a full transfer binding a transaction by a hash.

To bind a transaction to a transfer attempt using **/transfers/{id}/bind-transaction/** endpoint you must define the following fields:

- **tx\_hash** \- the hash of the transaction the transfer must belong to.

- **token\_id** (required if not defined before) \- ID of the token.

- **output\_address** (required if not defined before) \- the address of a recipient of the transfer. Required for deposits attempts only.

Request:

| curl \-X POST "https://kyt-api.bitok.org/v1/transfers/3c6b874e-f76c-42b4-8a08-e13fc50fa6a5/bind-transaction/" \\ \--header  "Content-Type: application/json" \\ \--header  "Accept: application/json" \\ \--header  "API-KEY-ID:{KEY\_ID}" \\ \--header  "API-TIMESTAMP:{TIMESTAMP}" \\ \--header  "API-SIGNATURE:{SIGNATURE}" \\ \--data ‘{   "tx\_hash": "0xc9ebe3254e683705c2553e268b915bf310995bf7540285146901b17fc3b437e6" }’ |
| :---- |

Response:

| {   "id": "3c6b874e-f76c-42b4-8a08-e13fc50fa6a5",   "client\_id": "id0001",   "attempt\_id": "0a805206bab649a68b3408032a7352e6",   "registered\_at": "2023-12-18T14:15:02.266520+03:00",   "occurred\_at": "2023-12-18T14:15:02.258132+03:00",   "direction": "outgoing",   "risk\_level": "medium",   "network": "ETH",   "token\_id": "0xdac17f958d2ee523a2206206994597c13d831ec7",   "token\_symbol": "USDT",   "tx\_hash": "0xc9ebe3254e683705c2553e268b915bf310995bf7540285146901b17fc3b437e6",   "tx\_status": "binding",   "input\_address": null,   "output\_address": "0x92a5b444907902daa39de28a82ef66af12e7f170",   "amount": 500,   "fiat\_currency": "USD",   "value\_in\_fiat": 499.67,   "check\_state": {     "exposure": "queued",     "exposure\_checked\_at": null,     "counterparty": "checked",     "counterparty\_checked\_at": "2023-12-18T11:15:04.733475Z",     "sanctions": "checked",     "sanctions\_checked\_at": "2023-12-18T11:15:04.733475Z"   } } |
| :---- |

When the transaction is bound the state of the transfer state will be enriched with all necessary properties.

Request:

| curl \-X GET "https://kyt-api.bitok.org/v1/transfers/3c6b874e-f76c-42b4-8a08-e13fc50fa6a5/" \\ \--header  "Accept: application/json" \\ \--header  "API-KEY-ID:{KEY\_ID}" \\ \--header  "API-TIMESTAMP:{TIMESTAMP}" \\ \--header  "API-SIGNATURE:{SIGNATURE}" |
| :---- |

Response:

| {   "id": "3c6b874e-f76c-42b4-8a08-e13fc50fa6a5",   "client\_id": "id0001",   "attempt\_id": "0a805206bab649a68b3408032a7352e6",   "registered\_at": "2023-12-18T14:15:02.266520+03:00",   "occurred\_at": "2023-12-18T13:52:35+03:00",   "direction": "outgoing",   "risk\_level": "medium",   "network": "ETH",   "token\_id": "0xdac17f958d2ee523a2206206994597c13d831ec7",   "token\_symbol": "USDT",   "tx\_hash": "0xc9ebe3254e683705c2553e268b915bf310995bf7540285146901b17fc3b437e6",   "tx\_status": "bound",   "input\_address": "0x3a2c752d3a78a2234b0caf8d6bcc2ec4c9dedfa8",   "output\_address": "0x92a5b444907902daa39de28a82ef66af12e7f170",   "amount": 500,   "fiat\_currency": "USD",   "value\_in\_fiat": 499.67,   "check\_state": { 	"exposure": "checked", 	"exposure\_checked\_at": "2023-12-18T11:37:54.204528Z", 	"counterparty": "checked", 	"counterparty\_checked\_at": "2023-12-18T11:37:54.204528Z", 	"sanctions": "checked", 	"sanctions\_checked\_at": "2023-12-18T11:37:54.204528Z"   } } |
| :---- |

## Transfer exposure and counterparty

### Transfer exposure

One of the most important properties of a transfer is its exposure. The exposure defined the origin of funds for incoming transfers and the destination of funds for outgoing transfers.

The exposure is a property of a full transfer only,

Usually the exposure is automatically checked when a transaction is bound.   
The exposure also may be rechecked using the API.

### Transfer counterparty

Another important property of a transfer is its counterparty. The counterparty is represented by an address exposure and defines a sender of incoming transfers and a recipient for outgoing transfers.

Firstly the counterparty is a property of a transfer attempt but it is also used for full transfers.

## Risks and alerts

### Risks

Risks indicate different kinds of interaction with risky entities.

### Levels of risks

There are the following levels of risks:

| Level | Description |
| :---- | :---- |
| **low** |  |
| **medium** |  |
| **high** |  |
| **severe** |  |

Additional levels of risks:

| Level | Description |
| :---- | :---- |
| **none** | No risk detected |
| **undefined** | The risk is not yet calculated. |

### Types of risks

| Type | Description |
| :---- | :---- |
| **sender\_entity** | The risk is associated with an entity of the sender. |
| **recipient\_entity** | The risk is associated with an entity of the recipient. |
| **origin\_of\_funds** | The risk is associated with the entity owned the assets that are a part of the transfer now. |
| **destination\_of\_funds** | The risk is associated with the entity received the assets that was a part of the transfer. |
| **sender\_exposure** | The risk is associated with a risky entity at the sender’s exposure. |
| **recipient\_exposure** | The risk is associated with a risky entity at the sender’s exposure. |
| **attempt\_sender\_entity** | The risk is associated with an entity of the attempt’s sender. |
| **attempt\_recipient\_entity** | The risk is associated with an entity of the attempt’s recipient. |
| **attempt\_sender\_exposure** | The risk is associated with a risky entity at the exposure of the attempt’s sender. |
| **attempt\_recipient\_exposure** | The risk is associated with a risky entity at the exposure of the attempt’s recipient. |

### Alerts

Alerts are signals about risks.

## Manual checks

### How to create a manual transfer check

To create a manual transfer check you have to use **/manual-check/check-transfer/** endpoint and define the following fields about the transfer:

- **network**

- **token\_id**

- **tx\_hash**

- **output\_address**

- **direction**

Request:

| curl \-X POST "https://kyt-api.bitok.org/v1/manual-checks/check-transfer/" \\ \--header  "Content-Type: application/json" \\ \--header  "Accept: application/json" \\ \--header  "API-KEY-ID:{KEY\_ID}" \\ \--header  "API-TIMESTAMP:{TIMESTAMP}" \\ \--header  "API-SIGNATURE:{SIGNATURE}" \\ \--data ‘{   "network": "ETH",   "token\_id": "native",   "tx\_hash": "0xd74f7e2a5081eb82c1d0a4fbd1859f23bed5fab8280f0aaf9e987019acc973a1",   "output\_address": "0x2A6Ced4B10769147824A36e3D646eDA222E50f2A",   "direction": "incoming" }’ |
| :---- |

Response:

| {   "id": "4976989b-c116-47fd-9a77-03502f578bc7",   "created\_at": "2024-02-29T19:30:17.278452+03:00",   "check\_type": "deposit",   "check\_status": "checking",   "checked\_at": null,   "transfer": {     "network": "ETH",     "token\_id": "native",     "token\_symbol": "ETH",     "tx\_hash": "0xd74f7e2a5081eb82c1d0a4fbd1859f23bed5fab8280f0aaf9e987019acc973a1",     "input\_address": "0x98f79674d5f2f777d44e253bfaf905d7491e8cef",     "output\_address": "0x2a6ced4b10769147824a36e3d646eda222e50f2a",     "direction": "incoming",     "occurred\_at": "2024-02-29T19:24:59+03:00",     "amount": 7.2181350653139,     "value\_in\_fiat": 16348.434545956596   },   "address": null,   "risk\_level": "undefined",   "fiat\_currency": "USD" } |
| :---- |

### How to create a manual address check

To create a manual transfer check you have to use **/manual-check/check-address/** endpoint and define the following fields about the transfer:

- **network**

- **token\_id** (optional)

- **address**

Request:

| curl \-X POST "https://kyt-api.bitok.org/v1/manual-checks/check-address/" \\ \--header  "Content-Type: application/json" \\ \--header  "Accept: application/json" \\ \--header  "API-KEY-ID:{KEY\_ID}" \\ \--header  "API-TIMESTAMP:{TIMESTAMP}" \\ \--header  "API-SIGNATURE:{SIGNATURE}" \\ \--data ‘{   "network": "ETH",   "token\_id": "0xdac17f958d2ee523a2206206994597c13d831ec7",   "address": "0x98f79674D5F2f777d44e253BfAf905D7491E8cEF" }’ |
| :---- |

Response:

| {   "id": "15b9bf78-a814-4b8e-9dbd-09f2596a6b00",   "created\_at": "2024-02-29T19:40:12.287316+03:00",   "check\_type": "single\_address",   "check\_status": "checking",   "checked\_at": null,   "transfer": null,   "address": {     "network": "ETH",     "address": "0x98f79674d5f2f777d44e253bfaf905d7491e8cef"   },   "risk\_level": "undefined",   "fiat\_currency": "USD" } |
| :---- |

# API Reference

## Authorization

KYT API uses a custom HTTP-scheme based on a keyed-HMAC (Hash Message Authentication Code) for authentication.

To authenticate a request, you first concatenate selected elements of the request to form a string. You then use your KYT secret access key to calculate the HMAC of that string. Informally, we call this process "signing the request," and we call the output of the HMAC algorithm the signature, because it simulates the security properties of a real signature. Finally, you add this signature as a parameter of the request by using the syntax described in this section.

### Header parameters:

| Parameter | Description |
| :---- | :---- |
| API-KEY-ID | API Key ID. |
| API-TIMESTAMP | Current timestamp in milliseconds. |
| API-SIGNATURE | HMAC-256 signature encoded in Base-64. |

### Building a HMAC-256 signature

The following Python script builds the preceding HMAC-256 signature, using the provided parameters.  
You can use this script to construct your own signatures, replacing the keys and other input parameters.

| Parameter | Description |
| :---- | :---- |
| http\_method | HTTP-method of the request. Example: GET, POST. |
| endpoint\_with\_query\_params | The endpoint path supplemented by query parameters. |
| timestamp | The timestamp included to the request header. |
| json\_payload | The payload of the request as a dict.  |
| api\_secret | The secret part of the key. |

| import json import hmac import hashlib import base64 str\_to\_sign \= (     http\_method \+ '\\n' \+      endpoint\_with\_query\_params \+ '\\n' \+      timestamp ) if json\_payload:     string\_to\_sign \+= '\\n' \+ json.dumps(json\_payload, separators=(',', ':')) built\_signature \= hmac.new(     api\_secret.encode('utf-8'),     msg=str\_to\_sign.encode('utf-8'),     digestmod=hashlib.sha256 ).digest() signature \= base64.b64encode(built\_signature).decode() |
| :---- |

Example of the string to sign:

| POST /v1/transfers/register/ 1713449845309 {"client\_id":null,"direction":"incoming","network":"ETH","tx\_hash":"0x28138cd586826bbad08d1d0e64b566795b5907790ad30ebb0722948c2ba21d09","token\_id":"usdt","output\_address":"0x016606acc6b0cfe537acc221e3bf1bb44b4049ee"} |
| :---- |

API Key:

| qgbtA4OrsHIx67APkTFGfUSctuEEwOYm |
| :---- |

API Secret:

| CXOlYKZgeSM3TpIyPwjSM84Ews2hARKi2m1MlLpnbI7UrF5bqtB2WQ3nW6Qh4vSJ |
| :---- |

HMAC-256 signature:

| 2dJYm8qkR8fCO3s7ZsSVBo1xKpLgx/eYAkewE82pyIs= |
| :---- |

HTTP-header:

| POST /v1/transfers/register/ HTTP/1.1 … Content-Type: application/json API-KEY-ID: qgbtA4OrsHIx67APkTFGfUSctuEEwOYm API-TIMESTAMP: 1713449845309 API-SIGNATURE: 2dJYm8qkR8fCO3s7ZsSVBo1xKpLgx/eYAkewE82pyIs= |
| :---- |

## Pagination

Some endpoints support pagination with the following parameters:

* **page** \- a page number within the paginated result set.  
* **page\_size** \- number of results to return per page

## Basics

| Endpoint | Method | Query params | Description |
| :---- | :---- | :---- | :---- |
| /basics/networks/ | GET | Yes | *Pagination enabled.* |
| /basics/tokens/ | GET | Yes | *Pagination enabled.* |
| /basics/entity-categories/ | GET | None | *Pagination enabled.* |

## Transfers

| Endpoint | Method | Query params | Description |
| :---- | :---- | :---- | :---- |
| /transfers/ | GET | Yes | Retrieve transfers based on certain criteria. Returns a list of REGISTERED\_TRANSFER\_EXTRA. *Pagination enabled.* |
| /transfers/{id}/ | GET |  | Retrieve information about a specific transfer by its ID Returns REGISTERED\_TRANSFER\_EXTRA. |
| /transfers/register/ | POST |  | Register a full transfer.  Returns REGISTERED\_TRANSFER\_EXTRA. |
| /transfers/register-attempt/ | POST |  | Register a transfer attempt. Returns REGISTERED\_TRANSFER\_EXTRA.  |
| /transfers/{id}/bind-transaction/ | POST |  | Bind a transaction to a transfer. Returns REGISTERED\_TRANSFER\_EXTRA. |
| transfers/{id}/exposure/ | GET |  | Get an exposure of a transfer. Return TRANSFER\_EXPOSURE. |
| /transfers/{id}/recheck-exposure/ | POST |  | Recheck an exposure of a transfer. |
| /transfers/{id}/counterparty/ | GET |  | Get information about the counterparty info of a transfer. Return ADDRESS\_EXPOSURE. |
| /transfers/{id}/recheck-counterparty/ | POST |  | Recheck the counterparty of a transfer. |
| /transfers/{id}/risks/ | GET |  | Get all risks of the transfer. |

## Alerts

| Endpoint | Method | Query params | Description |
| :---- | :---- | :---- | :---- |
|  |  |  |  |
| /alerts/ | GET | Yes | Retrieve alerts based on certain criteria. *Pagination enabled.* |
| /alerts/id}/ | GET |  | Retrieve information about a specific alert by its ID |

## Manual checks

| Endpoint | Method | Query params | Description |
| :---- | :---- | :---- | :---- |
| /manual-checks/check-transfer/ | POST |  | Create manual transfer check. Returns MANUAL\_CHECK. |
| /manual-checks/check-address/ | POST |  | Create manual address check. Returns MANUAL\_CHECK. |
| /manual-checks/ | GET |  | Retrieve all manual checks. Returns MANUAL\_CHECK objects. |
| /manual-checks/{id}/ | GET |  | Retrieve manual check details, Returns MANUAL\_CHECK. |
| /manual-checks/{id}/risks/ | GET |  | Retrieve risks of a manual check. Returns RISK objects |
| /manual-checks/{id}/transfer-exposure/ | GET |  | Retrieve a transfer exposure of the transfer being checked. Returns TRANSFER\_EXPOSURE. |
| /manual-checks/{id}/address-exposure/ | GET |  | Retrieve an address exposure of the address being checked. Returns ADDRESS\_EXPOSURE. |

# API Structures

## Transfers

### Transfer (TRANSFER)

There are base properties of any kind of a transfer (registered transfer, registered attempt, transfer of a manual check):

| Property | Type | Allow null | Description |
| :---- | :---- | :---- | :---- |
| **network** | String |  | The code of the network where the transfer occurred. Examples: **ETH**, **BTC**, **TRX**. |
| **token\_id** | String |  | The identifier of the token within its network.  This is a contract address for ERC-20/TRC-20/BEP-20 tokens and **“native”** for a native token of the network.  Examples: Native ETH token in Ethereum has token\_id as “**native**”. ERC-20 token USDT in Ethereum has **token\_id** as **“0xdac17f958d2ee523a2206206994597c13d831ec7”**. |
| **token\_symbol** | String |  | The symbol of the token. |
| **tx\_status** | String |  | The status of the bound transaction. Possible values:  **none** \- the transaction is not bound. **bound** \- the transaction is already bound. **binding** \- the transaction is in the binding process. **not\_found** \- the transaction is not bound due to an incorrect transaction hash. **error** \- error occurred while binding the transaction. |
| **tx\_hash** | String | Yes | The transaction hash of the bound transaction in the blockchain. *Not defined for the transfer attempts.* |
| **occurred\_at** | Timestamp | Yes | The date and time when the transfer occurred. *Not defined for the transfer attempts.* |
| **input\_address** | String | Yes | The address of the sender. *Not defined for the withdrawal attempts (the outgoing transfer attempts).*  |
| **output\_address** | String | Yes | The address of the recipient. *Not defined for the deposit attempts (the incoming transfer attempts).*  |
| **direction** | String |  | The direction of the transfer.  Possible values: **incoming**, **outgoing**. |
| **amount** | Float | Yes | The amount (in token asset) of the transfer. |
| **value\_in\_fiat** | Float | Yes | May be not defined if the fiat price is unknown (for some tokens). |

### Registered transfer (REGISTERED\_TRANSFER)

The properties of a registered transfer described in the table below:

| Property | Type | Allow null | Description |
| ----- | :---- | :---- | :---- |
| **id** | String |  | The identifier of the transfer. |
| **registered\_at** | Timestamp |  | The date and time when the transfer was registered |
| **client\_id** | String | Yes | External ID of the client the transfer is associated with. If client\_id is null the transfer isn’t associated with any client. |
| **attempt\_id** | String | Yes | Unique external ID of the attempt used while registering the transfer. |
| **risk\_level** | String |  | The risk associated with the transfer. Possible values:  **none** \- no risk detected; **low** \- the transfer has a low risk; **medium** \- the transfer has a medium risk; **high** \- the transfer has a high risk; **severe** \- the transfer has a severe (maximum) risk; **undefined** \- the transfer was never checked. **See the details about risks below.** |
| **risk\_score** | Float | Yes | The risk score from 0.0 to 1.0 if the risk level is defined. |
|  *All fields of TRANSFER.* |  |  |  |

### Registered transfer with extra properties (REGISTERED\_TRANSFER\_EXTRA)

Transfers have some extra properties that are used at **/transfers/\*** endpoints only. Its described in the table below:

| Property | Type | Allow null | Description |
| ----- | :---- | :---- | :---- |
|  *All fields of REGISTERED\_TRANSFER.* |  |  |  |
| **check\_state** | Object |  | The state of checks of the transfer exposure and counterparty.  |
| **check\_state.exposure** | String |  | The check status of the exposure. Possible values: **none** \- the exposure was never checked. **queued** \- a check will be started after binding a transaction. **checked** \- the check is completed successfully while the last checking. **checking** \- the check is being checked. **error** \- an error occurred while the last checking. |
| **check\_state.exposure\_checked\_at** | Timestamp | Yes | The date and time when the exposure is checked. *Null if not checked.* |
| **check\_state.counterparty** | String |  | The check status of the counterparty. Possible values: **none** \- the exposure was never checked. **checked** \- the check is completed successfully while the last checking. **checking** \- the check is being checked. **error** \- an error occurred while the last checking. |
| **check\_state.counterparty\_checked\_at** | Timestamp | Yes | The date and time when the counterparty is checked. *Null if not checked.* |
| **fiat\_currency** | String |  | The symbol of the fiat currency used to calculate the amount in fiat. |

## Transfer exposure

### Transfer exposure (TRANSFER\_EXPOSURE)

The base properties described in the table below:

| Property | Type | Allow null | Description |
| :---- | :---- | :---- | :---- |
| **direct\_interaction** | Object | Yes | Information about the counterparty if the exposure has direct interaction. *Null if not checked or indirectly interacted.* |
| **direct\_interaction.entity\_category** | String |  | The entity category of the counterparty. |
| **direct\_interaction.entity\_name** | String |  | The name of the counterparty. |
| **direct\_interaction.value\_in\_fiat** | Float |  | The value in fiat. |
| **indirect\_interaction** | Array | Yes | An array of all indirect connections. *Null if not checked or directly interacted.* |
| **indirect\_interaction\[ \].entity\_category** | String |  | The entity category of assets. |
| **indirect\_interaction\[ \].value\_share** | Float |  | The share of assets of a specific category in the total exposure. |
| **indirect\_interaction\[ \].value\_in\_fiat** | Float |  | The value of assets of a specific category in fiat. |
| **fiat\_currency** | String |  | The symbol of the fiat currency used to calculate the amount in fiat. |

### Transfer exposure of a registered transfer (REGISTERED\_TRANSFER\_EXPOSURE)

There are some extra fields used for registered transfers:

| Property | Type | Allow null | Description |
| ----- | :---- | :---- | :---- |
|  *All fields of TRANSFER\_EXPOSURE.*  |  |  |  |
| **check\_status** | String |  | The check status of the exposure. *See “Checks” below.* |
| **checked\_at** | Timestamp | Yes | The date and time when the exposure is checked. *Null if not checked.* |

## Address exposure

### Address exposure (ADDRESS\_EXPOSURE)

The counterparty properties described in the table below:

| Property | Type | Allow null | Description |
| :---- | :---- | :---- | :---- |
| **entity\_category** | String | Yes | The entity category of the counterparty. *Null if the counterparty isn’t identified.* |
| **entity\_name** | String | Yes | The name of the counterparty. *Null if the counterparty isn’t identified.* |
| **exposure** | Array | Yes | Information about the counterparty exposure (incoming and outgoing connections). *Null if the counterparty is already identified.* |
| **exposure\[\].entity\_category** | String |  | The entity category of assets. |
| **exposure\[\].value\_share** | Float |  | The share of assets of a specific category in the total exposure of the counterparty. |

### Address exposure of a registered transfer counterparty (REGISTERED\_COUNTERPARTY\_EXPOSURE)

There are some extra fields used for registered transfers:

| Property | Type | Allow null | Description |
| ----- | :---- | :---- | :---- |
|  *All fields of ADDRESS\_EXPOSURE.*  |  |  |  |
| **check\_status** | String |  | The check status of the counterparty. *See “Checks” below.* |
| **checked\_at** | Timestamp | Yes | The date and time when the counterparty is checked. *Null if not checked.* |

## Risks and alerts

### Risks (RISK)

The risks associated with transfer are about interacting with different risky entities. Each risk have a number of the properties described below:

| Property | Type | Allow null | Description |
| :---- | :---- | :---- | :---- |
| **risk\_level** | String |  | The level of risk. |
| **occurred\_at** | Timestamp |  | The date and time when the risk occurred. |
| **detected\_at** | Timestamp |  | The date and time when the risk was detected. |
| **risk\_type** | String |  | The type of risk. |
| **entity\_category** | String |  | The entity category associated with the risk. |
| **proximity** | String |  | The proximity of a risky entity. Possible values: **direct indirect** |
| **value\_in\_fiat** | Float | Yes | The amount of risky value in fiat. |
| **value\_share** | Float | Yes | The share of the risky value relative to the transfer value. |
| **rule** | Object |  | The rule created the risk. *See RISK\_RULE below.* |

### Risk rule (RISK\_RULE)

| Property | Type | Allow null | Description |
| :---- | :---- | :---- | :---- |
| **rule\_type** | String | Yes | *Note: Null for old risks only.* |
| **rule\_sub\_type** | String | Yes | *Note: Null for old risks only.* |
| **entity\_category** | String |  | The entity category defined in the rule. |
| **min\_value\_in\_fiat** | Float | Yes | The minimum risky value in fiat in the rule. |
| **min\_value\_share** | Float | Yes | The minimum share of a risky value in the rule. |

### Alerts (ALERT)

| Property | Type | Allow null | Description |
| :---- | :---- | :---- | :---- |
| **id** | String |  | The identifier of the alert. |
| **created\_at** | Timestamp (ISO) |  | The date and time when the alert was created. |
| **updated\_at** | Timestamp (ISO) |  | The date and time when the alert was updated. |
| **risk\_level** | String |  | The risk level of the associated risk. |
| **risk\_type** | String |  | The type of the associated risk. |
| **risk\_occurred\_at** | Timestamp (ISO) |  | The date and time when the risk occurred. |
| **alert\_status** (ex. status) | String |  | The status of the alert. Possible values: **open in\_progress awaiting\_response done** |
| **entity\_interaction** | Object | Yes | Details of the risks connected with a risky entity. *See RISK\_ENTITY\_INTERACTION below.* |
| **transfer** | Object | Yes | The transfer associated with the alert. *See REGISTERED\_TRANSFER.* |
| **fiat\_currency** | String |  | The symbol of the fiat currency used to calculate values in fiat. |
| **type** | String |  | Deprecated. Will be removed soon. |
| **status** | String |  | Deprecated. Will be removed soon. |

### Entity interaction of a risk (RISK\_ENTITY\_INTERACTION)

The structure of the entity-interaction details:

| Property | Type | Allow null | Description |
| :---- | :---- | :---- | :---- |
| **entity\_category** | String |  | The entity category associated with the risk. |
| **proximity** (ex. interaction) | String |  | The type of interaction with a risky entity. Possible values: **direct indirect** |
| **value\_in\_fiat** | Float | Yes | The amount of risky value in fiat. |
| **value\_share** | Float | Yes | The share of the risky value relative to the transfer value. |
| **rule** | Object |  | The rule created the risk.  *See RISK\_RULE above.* |
| **interaction** | String |  | Deprecated. Will be removed soon. |

## Manual checks

### Manual check (MANUAL\_CHECK)

| Property | Type | Allow null | Description |
| :---- | :---- | :---- | :---- |
| **id** | String |  | The identifier of the check. |
| **created\_at** | Timestamp (ISO) |  | The date and time when the check was created. |
| **check\_type** | String |  | The type of the check. Possible values: **deposit** **withdrawal** **single\_address** |
| **check\_status** | String |  | The current status of the check: Possible values: **checked** \- the check is already checked. **checking** \- the check is being checked. **error** \- an error occurred while checking. |
| **checked\_at** | Timestamp (ISO) | Yes | The date and time when the check was completed. |
| **risk\_level** | String |  | The level of risk. |
| **risk\_score** | Float | Yes | The risk score from 0.0 to 1.0 if the risk level is defined. |
| **transfer** | Object | Yes | The transfer was checked by the manual check. *See TRANSFER.* |
| **address** | Object | Yes | The transfer associated with the alert. *See ADDRESS.* |
| **fiat\_currency** | String |  | The symbol of the fiat currency used to calculate values in fiat. |

### Address (ADDRESS)

| Property | Type | Allow null | Description |
| :---- | :---- | :---- | :---- |
| **network** | String |  | The network where the transfer occurred |
| **address** | String |  | The address in the network. |

