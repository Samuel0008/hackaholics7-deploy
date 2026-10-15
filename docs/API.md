# Banking Attestation API

Integration guide for the prototype API. This service is a demonstration backend, not a production banking or general-purpose threat-detection service. Use synthetic data and disposable accounts only.

## Environments and base URLs

For an Azure deployment, use the API Management gateway URL printed by the deployment script:

```text
https://<api-management-name>.azure-api.net/v1
```

For local Azure Functions Core Tools:

```text
http://localhost:7071/api
```

The Azure gateway injects the private Function gateway header. Clients must not call the Function hostname directly or send a gateway secret. All examples below use `BASE_URL` for the appropriate base URL.

## Authentication

There are two bearer-token types. Do not interchange them.

1. **Microsoft Entra delegated access token** — used for passkey registration/authentication and administrative endpoints. The user token must target the configured API audience, come from an allowlisted tenant and client application, include a delegated scope, and contain the endpoint's required app role. App-only/client-credential tokens are rejected.
2. **API session token** — returned after a successful passkey assertion. It is a 15-minute bearer token used for employee data operations such as encrypted document relay, message-key registration, and escrow public-key discovery.

| Role | Intended use |
|---|---|
| `Bank.Employee` | Passkey lifecycle endpoints |
| `Bank.SecurityAdmin` | Canary management, alerts, incident evidence key, account release, device revocation |
| `Bank.Compliance` | Explicit escrow decryption and decryption audit |

Send tokens using `Authorization: Bearer <token>`. Never put tokens in query strings, logs, or browser URLs. The trusted frontend obtains the Entra token through its own Entra integration; this API does not implement OAuth client sign-in.

## Common response behavior

JSON responses use `Content-Type: application/json` and `Cache-Control: no-store`. Errors generally have this shape:

```json
{ "error": "Explanation of the error." }
```

Common status codes: `400` invalid input or expired/missing challenge; `401` missing, expired, or invalid authentication; `403` missing app role, quarantined account, or required reauthentication; `404` resource unavailable; `500` unexpected server failure. Protected routes may also return `503` when required identity configuration is missing.

## Employee integration

### 1. Register a passkey

Obtain an Entra delegated access token with `Bank.Employee` and request registration options:

```http
POST {BASE_URL}/passkeys/register/options
Authorization: Bearer <entra-access-token>
Content-Type: application/json
```

```json
{ "userName": "employee@example.test" }
```

The response is the WebAuthn `PublicKeyCredentialCreationOptions` object. Pass it to the browser's WebAuthn registration flow (or a compatible client library), then submit the resulting registration credential:

```http
POST {BASE_URL}/passkeys/register/verify
Authorization: Bearer <entra-access-token>
Content-Type: application/json
```

```json
{ "response": { "...": "WebAuthn RegistrationResponseJSON" } }
```

On success (`201`):

```json
{ "verified": true, "deviceId": "server-generated-device-id" }
```

The account identity is taken from the verified Entra token, not from a caller-supplied user ID. User verification is required. Passkey enrollment is blocked while a verified decoy hit requires reauthentication or the account is suspended.

### 2. Authenticate and obtain an API session

Request authentication options:

```http
POST {BASE_URL}/passkeys/auth/options
Authorization: Bearer <entra-access-token>
```

Use the response with the browser's WebAuthn authentication flow, then verify the resulting assertion:

```http
POST {BASE_URL}/passkeys/auth/verify
Authorization: Bearer <entra-access-token>
Content-Type: application/json
```

```json
{ "response": { "...": "WebAuthn AuthenticationResponseJSON" } }
```

Success (`200`):

```json
{ "verified": true, "token": "<api-session-token>", "expiresInSeconds": 900 }
```

Use this session token for the following employee data operations:

```http
Authorization: Bearer <api-session-token>
```

After a first identified decoy hit, existing sessions are invalidated and fresh passkey authentication is required. A second identified hit within 24 hours suspends the account pending a security-admin investigation. A decoy hit is an interaction signal, not proof of malicious intent.

### 3. Register and discover message-encryption keys

Generate an RSA-OAEP-3072 employee encryption key pair on the client. The API accepts only a public JWK; never send a private key.

```http
POST {BASE_URL}/keys/message
Authorization: Bearer <api-session-token>
Content-Type: application/json
```

```json
{ "publicJwk": { "kty": "RSA", "n": "<base64url-modulus>", "e": "AQAB", "alg": "RSA-OAEP-256", "use": "enc" } }
```

Success (`201`) returns a generated `keyId` and public-key parameters. The API requires an RSA-OAEP-256 key with at least a 3072-bit modulus.

Fetch active public keys for a recipient using their Entra object ID (not their tenant-scoped internal storage ID):

```http
GET {BASE_URL}/keys/message/{recipientEntraObjectId}
Authorization: Bearer <api-session-token>
```

```json
{ "keys": [{ "keyId": "...", "algorithm": "RSA-OAEP-256", "kty": "RSA", "n": "...", "e": "AQAB", "createdAt": "..." }] }
```

The API returns active devices' public keys only. It does not distribute or recover employee private keys.

### 4. Relay encrypted messages

The API stores an opaque JSON envelope for the authenticated user's own account. It does not encrypt the message. To support both employee decryption and optional escrow access, client-side code can encrypt the plaintext with AES-256-GCM and wrap the AES key separately to the recipient's public key and the tenant escrow public key.

Fetch the tenant escrow public key:

```http
GET {BASE_URL}/escrow/public-key
Authorization: Bearer <api-session-token>
```

Upload an envelope (up to 48 KB encoded):

```http
PUT {BASE_URL}/sync/{documentId}
Authorization: Bearer <api-session-token>
Content-Type: application/json
```

```json
{
  "encryptedEnvelope": "{\"version\":1,\"algorithm\":\"A256GCM-RSA-OAEP-256\",\"keyId\":\"<escrow-key-version-id>\",\"iv\":\"<base64url-12-byte-iv>\",\"ciphertext\":\"<base64url-ciphertext-and-tag>\",\"wrappedEscrowKey\":\"<base64url>\",\"recipientKeyId\":\"<recipient-key-id>\",\"wrappedRecipientKey\":\"<base64url>\"}"
}
```

The value of `encryptedEnvelope` is a JSON string. The client must bind AES-GCM additional authenticated data to the protocol version, user identifier, document identifier, escrow key ID, and recipient key ID exactly as implemented by the client crypto package. `documentId` must contain only letters, digits, underscore, or hyphen (up to 128 characters).

Success (`200`): `{ "saved": true }`. Retrieve the same user's envelope with `GET {BASE_URL}/sync/{documentId}`; response: `{ "documentId": "...", "encryptedEnvelope": "<JSON string>" }`. A document belonging to another user is not accessible through this route.

This is escrow-accessible encryption, not strict user-only end-to-end encryption: an authorized compliance service can decrypt the escrow-wrapped key.

## Security-admin integration

All routes in this section require an Entra delegated token with `Bank.SecurityAdmin`.

### Create a one-time canary

```http
POST {BASE_URL}/admin/canaries
Authorization: Bearer <security-admin-entra-token>
```

Success (`201`) returns a tenant-scoped backend-only URL:

```json
{ "canaryUrl": "https://<host>/api/internal/employee/audit-export/<tenant>/<token>", "expiresInSeconds": 86400, "exposure": "backend-only" }
```

Treat the URL as a secret: anyone who accesses it can consume the one-time canary. The endpoint responds `404` whether the canary is valid or not.

### List tenant alerts

```http
GET {BASE_URL}/admin/alerts
Authorization: Bearer <security-admin-entra-token>
```

Returns `{ "alerts": [...] }` with up to the latest 100 tenant-attributed alerts. Alert records can include `type`, `canaryId`, `occurredAt`, scoped `userId`, `deviceId`, `severity`, `action`, investigation details, and optional signed `evidence`.

### Verify signed incident evidence

Retrieve the tenant's current signing key:

```http
GET {BASE_URL}/admin/audit/public-key
Authorization: Bearer <security-admin-entra-token>
```

Retrieve an earlier version by its Key Vault key version:

```http
GET {BASE_URL}/admin/audit/public-key?version=<key-version>
Authorization: Bearer <security-admin-entra-token>
```

The response contains `publicKey` with `keyId`, `algorithm: "RS256"`, `kty: "RSA"`, `n`, and `e`. For each alert with evidence, verify the signature using RSASSA-PKCS1-v1_5/SHA-256 over the exact UTF-8 bytes of `evidence.payload`; decode `evidence.signature` from base64url. The evidence payload is canonical JSON with keys in lexicographic order. Match `evidence.keyId` to the returned key ID. Trust or pin the public key out of band for independent verification; fetching a key from the same API alone does not establish trust. A valid signature detects changes to the signed payload, but does not make Table Storage immutable or prove malicious intent.

### Release a suspended account after investigation

`userId` must be the tenant-scoped ID shown in that tenant's alert:

```http
POST {BASE_URL}/admin/quarantine/release
Authorization: Bearer <security-admin-entra-token>
Content-Type: application/json
```

```json
{
  "userId": "<tenant-guid>_<sha256-hex-from-alert>",
  "investigationReference": "CASE-12345",
  "investigationSummary": "Reviewed the access event and confirmed the employee followed an obsolete internal test link."
}
```

The reference must be 3-128 characters; the summary must be 20-2000 characters. Success: `{ "released": true }`. The admin actor, timestamp, reference, and summary are recorded in a tenant-scoped signed audit event.

### Revoke a device

For this endpoint, `userId` is the employee's Entra object ID (different from the tenant-scoped alert ID):

```http
POST {BASE_URL}/admin/devices/revoke
Authorization: Bearer <security-admin-entra-token>
Content-Type: application/json
```

```json
{ "userId": "<employee-Entra-object-id>", "deviceId": "<device-id-from-registration>" }
```

Success: `{ "revoked": true, "deviceId": "..." }`. The device and its passkeys are revoked for future API access. This does not lock, locate, or erase a device.

## Compliance integration

Compliance routes require an Entra delegated token with `Bank.Compliance`.

### Decrypt a stored envelope

`userId` is the employee's Entra object ID, not the tenant-scoped alert ID:

```http
POST {BASE_URL}/admin/compliance/decrypt
Authorization: Bearer <compliance-entra-token>
Content-Type: application/json
```

```json
{ "userId": "<employee-Entra-object-id>", "documentId": "<document-id>" }
```

Success returns plaintext bytes encoded as base64url:

```json
{ "userId": "<employee-Entra-object-id>", "documentId": "...", "plaintextBase64Url": "...", "encoding": "base64url" }
```

The plaintext is not stored or logged by the API. The client is responsible for decoding the base64url value and handling the plaintext securely. Successful decryptions are recorded in the compliance audit list.

### Read the compliance-decryption audit

```http
GET {BASE_URL}/admin/compliance/audit
Authorization: Bearer <compliance-entra-token>
```

Returns `{ "entries": [...] }` for up to 100 successful decryptions in the last 30 days, filtered to the caller's tenant.

## Public and decoy routes

These endpoints need no employee bearer token, but Azure deployments still require the API Management gateway. They return synthetic content only and may record a hit:

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/health` | Returns `{ "status": "ok", "demo": true }` |
| `GET` | `/robots.txt` | Advertises decoy paths |
| `GET` | `/.env` | Synthetic, nonfunctional configuration bait |
| `GET` | `/debug/config` | Synthetic debug configuration bait |
| `GET` | `/backup/database.sql` | Synthetic database-backup bait |
| `GET` | `/internal/employee/access-review-export.json` | Synthetic audit-export bait |
| `GET` | `/internal/employee/audit-export/{tenantId}/{token}` | One-time canary; returns `404` for both valid and invalid tokens |

Verified employee access to a decoy triggers immediate session-version invalidation and passkey reauthentication. A second identified hit within 24 hours suspends the account pending investigation. Anonymous hits are alerts only and cannot identify or safely block an employee. This prototype does not analyze ordinary API traffic for generalized hacker behavior.

## OpenAPI and source

The machine-readable API contract is [openapi.json](../infra/azure/openapi.json). Azure API Management imports this file during deployment. Consult the [API implementation README](../apps/api/README.md) for local setup and the [project root](../) for deployment and architecture details.

## Operational and security limitations

- This prototype is not production-ready; use no real customer or bank data.
- Configure Entra tenant/client allowlists, audience, roles, WebAuthn relying-party values, storage, and tenant Key Vault keys before use.
- Keep local settings, tokens, Key Vault credentials, and canary URLs private. Do not upload `apps/api/local.settings.json`, Azurite data, build output, or dependencies.
- Anonymous decoy alert limiting is in-memory and per Function instance. Use gateway controls and durable production rate limits.
- Table Storage alerts are not immutable compliance records. Signed evidence protects payload integrity but is not a substitute for immutable retention, independent key trust, or a formal audit system.
- The service provides decoy-triggered containment, not general attacker detection; false positives and authorized testing can trigger the response.
