# Azure Functions demo API

This is a learning prototype. It is **not a production bank authentication service**. Protected integration and admin routes require Microsoft Entra ID app-role tokens, an explicit bank tenant/client allowlist, and Azure Table Storage for prototype state.

For a partner-facing integration guide with authentication steps, request/response examples, incident evidence verification, and route details, see [the API guide](../../docs/API.md).

## What it implements

- WebAuthn/passkey registration and authentication using SimpleWebAuthn.
- 15-minute bearer sessions, checked against device status, account reauthentication state, and a session version that permanently invalidates tokens issued before an identified decoy hit.
- Per-device, client-generated message encryption keys. The API stores employee public keys only; the private CryptoKey is stored in browser IndexedDB.
- An encrypted-envelope relay. The API stores and returns client ciphertext; it does not encrypt messages.
- Per-bank Azure Key Vault-backed escrow public-key discovery and explicitly requested compliance decryption of demo envelopes.
- A separate audit record for successful escrow decryptions. Plaintext and data keys are not written to storage or logs.
- Tenant-scoped incident and containment alerts signed with a dedicated Key Vault RSA key. Security administrators can retrieve the versioned public key and independently verify each alert's canonical evidence payload.
- Backend-only decoy surfaces resembling common scanner targets (`.env`, debug configuration, database backup, and a privileged-access audit export). They are listed as disallowed in the API's `robots.txt` to attract opportunistic scanners, return synthetic/nonfunctional content only, and are never included in normal responses or delivered to customer pages.
- Verified-user decoy response: the first hit carrying a valid employee Entra token or signed device session immediately invalidates existing sessions and requires fresh passkey authentication. A second identified hit within 24 hours automatically suspends the account, blocks passkey authentication and protected operations, and requires a security administrator to complete an investigation before release. First-hit reauthentication is available immediately; if not completed, its 15-minute restriction expires, but pre-hit session tokens remain invalid. Both actions are recorded in tenant-scoped alerts.
- Admin-triggered device and passkey revocation. This invalidates future API access; it does **not** lock, locate, or erase a laptop.

## Key roles and escrow model

A passkey is a device-authenticator credential used to sign a WebAuthn login challenge. Its private key is not the message-encryption key; WebAuthn does not let this API set a Web Crypto `extractable` flag or guarantee HSM/TPM storage on every authenticator.

After passkey authentication, the browser calls `registerDeviceEncryptionKey()` in `packages/crypto/src/index.ts`. It generates a separate RSA-OAEP-3072 employee encryption key pair with Web Crypto; the private key is marked non-extractable and stored locally in IndexedDB, and only the public key is registered with the API. This prevents ordinary key export, but web standards do **not** guarantee that Web Crypto keys are backed by a TPM/Secure Enclave or resist malware/XSS running in the same user session. IndexedDB data can also be lost when site data is cleared or the device is replaced, so production needs a reviewed recovery/re-enrollment design.

The browser bundle can import this client module directly. After login, register that device's encryption key once:

```ts
const deviceKey = await registerDeviceEncryptionKey(apiUrl, sessionToken);
```

The backend serves `GET /api/robots.txt`, which advertises common sensitive-file/config paths and the deliberately tempting `GET /api/internal/employee/access-review-export.json`. These routes mimic exposed configuration or backup files, but only return fabricated, nonfunctional decoy data. Values use the reserved `.invalid` domain or explicit decoy labels; no real credential, secret, customer or employee data is returned. Each request records a bounded alert without storing the request body, query string, headers, or IP address. Tenant-attributed alerts, containment actions, and investigation releases are signed with that tenant's dedicated Key Vault RSA key; the signature covers a canonical event payload, including the tenant and action. A `Bank.SecurityAdmin` can retrieve the versioned public key at `GET /api/admin/audit/public-key` and verify alert evidence. For verification independent of this service, pin or otherwise trust the public key out of band; fetching it from the same API alone does not establish trust. Anonymous alerts without a trusted tenant remain unsigned and cannot trigger employee containment. These routes are not called by the customer app during normal use. The older `POST /admin/canaries` endpoint can also issue one-time backend-only canary URLs for controlled tests.

These are **not actual vulnerabilities**: there is no SQL injection, path traversal, command execution, credential exposure, or unsafe database operation behind the bait. `robots.txt` is public metadata, so bots can choose to ignore it; it may attract opportunistic scanners, but cannot force them to take the bait or detect every scan of normal API routes. In the one-bank deployment, `DECOY_TENANT_ID` lets the API show bounded anonymous decoy hits in that deployment's tenant alert feed, but an anonymous hit cannot identify or safely block an employee. Shared multi-tenant deployments must leave this setting unset unless a trusted tenant identity is available. A request carrying a valid delegated employee token or signed device session is linked to that verified identity. The first identified hit immediately invalidates existing sessions. An enrolled passkey can restore access immediately using a new challenge requested after the hit; pre-hit bearer tokens remain invalid. Until successful passkey authentication, protected operations and passkey enrollment are denied for up to 15 minutes. A second identified hit for the same account within 24 hours automatically suspends the account and blocks passkey authentication and protected operations until security-admin investigation and release. The administrator must provide an investigation reference and a written summary; these are recorded in the tenant-scoped audit alert. Releasing the account resets the repeat-hit window. Anonymous hits create alerts only. A decoy hit is a high-confidence interaction, not proof of malicious intent: legitimate users or authorized security tests can trigger it accidentally. Use disposable accounts when testing. This prototype does not correlate broader suspicious-activity signals. Anonymous alert writes are capped per running Function instance; use Azure Monitor/API Management controls for production rate limits.

To send to another employee, first fetch the recipient's keys with `getRecipientMessageKeys(apiUrl, sessionToken, recipientUserId)`, choose an active key, then send:

```ts
const envelope = await sendEncryptedMessage(
  apiUrl,
  sessionToken,
  senderUserId,
  messageId,
  new TextEncoder().encode(messageText),
  recipientKey,
);
```

The recipient calls `fetchEncryptedMessage(apiUrl, sessionToken, messageId)` and then `decryptForEmployee(envelope, recipientUserId, messageId)`. That only works in the browser profile where the corresponding non-extractable private key was registered.

For messages that compliance automation must be able to inspect, `sendEncryptedMessage()`:

1. Generate a random 256-bit AES data key and a fresh 96-bit IV for each message.
2. Encrypt the message with AES-256-GCM. Use the exact additional authenticated data string `v1|{userId}|{documentId}|{escrowKeyId}|{recipientKeyId}` (UTF-8). Send the ciphertext with the 16-byte GCM tag appended.
3. Wrap the same AES data key separately for the employee's application-encryption public key and the bank escrow public key. Web Crypto RSA-OAEP with SHA-256 can wrap to the bank's RSA public key. The employee encryption key is distinct from their passkey.
4. Upload the JSON envelope below as the `encryptedEnvelope` value to `PUT /sync/{documentId}`.

```json
{
  "version": 1,
  "algorithm": "A256GCM-RSA-OAEP-256",
  "keyId": "<keyId from /escrow/public-key>",
  "iv": "<base64url 12-byte IV>",
  "ciphertext": "<base64url AES-GCM ciphertext followed by its 16-byte tag>",
  "wrappedEscrowKey": "<base64url RSA-OAEP-SHA-256-wrapped 32-byte AES key>",
  "recipientKeyId": "<employee application-encryption key identifier>",
  "wrappedRecipientKey": "<base64url AES key wrapped to the employee encryption public key>"
}
```

This design is **escrow-accessible encryption, not strict user-only end-to-end encryption**: an authorized escrow service can decrypt the data key and message. The API does not create employee encryption keys or encrypt data on the client's behalf. Do not use a passkey private key as an encryption key.

## Local setup

Requirements: Node.js 20+, Azure Functions Core Tools v4, and Azurite (the local Azure Storage emulator). In PowerShell, use `npm.cmd`, `func.cmd`, and `azurite.cmd` if script execution policy blocks PowerShell shims.

1. Install the local tools if needed: `npm.cmd install --global azure-functions-core-tools@4 --allow-scripts=azure-functions-core-tools` and `npm.cmd install --global azurite`.
2. In this directory, install dependencies with `npm.cmd install`.
3. Copy `local.settings.example.json` to `local.settings.json`. Set a unique random `JWT_SECRET` (at least 32 bytes). Configure `AZURE_API_AUDIENCE`, `BANK_TENANTS_JSON`, and `BANK_ESCROW_VAULTS_JSON` with a real test Entra app registration, tenant GUID, approved caller app GUID, and that tenant's Key Vault URL, escrow key name, and audit signing key name. The audit key must be RSA with `sign` and `verify` operations; create one for a local test vault with `az keyvault key create --vault-name <vault-name> --name bank-audit-signing --kty RSA --size 3072 --ops sign verify`. There is no shared admin-key bypass. `BANK_ESCROW_VAULTS_JSON` is a JSON object keyed by Entra tenant GUID; each value has `vaultUrl`, `keyName`, and `auditSigningKeyName`. Tenants without a vault mapping cannot retrieve an escrow public key or decrypt data; tenant-attributed alert creation also requires its configured audit key.
4. In one terminal, start storage with `azurite.cmd --silent --location .azurite`.
5. In a second terminal, run `npm.cmd start`.
6. Use a local HTTPS web app, or `http://localhost:3000` for local development, and keep `EXPECTED_ORIGIN` exactly equal to its origin. Keep `RP_ID` to its hostname (`localhost` locally).

Passkey registration and authentication require an approved, delegated Microsoft Entra user token with the `Bank.Employee` app role. App-only client-credential tokens are rejected because they do not identify a human. Passkey enrollment is bound to the verified Entra object ID; client-supplied user IDs cannot choose another employee's account. Escrow public-key discovery requires an active employee session and selects the vault mapped to that session's tenant. Compliance decryption uses the requesting bank's mapped vault. For local development, sign in with Azure CLI (`az login`) as an identity granted the **Key Vault Crypto User** role on each configured vault. In Azure, the Function App managed identity receives storage data-plane roles and **Key Vault Crypto User** only on its deployment's vault. Keep local settings ignored by Git and never commit them. Run `npm.cmd test` to compile both TypeScript projects and exercise crypto tests.

## Routes

All routes are under `/api`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/robots.txt` | Backend API crawler metadata advertising the decoy path |
| GET | `/.env` | Synthetic configuration decoy; records access, returns no usable credentials |
| GET | `/debug/config` | Synthetic debug configuration decoy |
| GET | `/backup/database.sql` | Synthetic SQL backup decoy |
| GET | `/internal/employee/access-review-export.json` | Synthetic decoy audit export; hit is recorded and fake data only is returned |
| POST | `/passkeys/register/options` | Create passkey registration options (`userName`); identity is taken from the delegated Entra token |
| POST | `/passkeys/register/verify` | Verify registration; returns the demo `deviceId` |
| POST | `/passkeys/auth/options` | Create authentication options for the delegated Entra user |
| POST | `/passkeys/auth/verify` | Verify assertion; returns a 15-minute bearer token |
| PUT | `/sync/{documentId}` | Store an opaque client-encrypted envelope |
| GET | `/sync/{documentId}` | Retrieve that user's envelope |
| POST | `/keys/message` | Register this authenticated device's RSA-OAEP encryption public key |
| GET | `/keys/message/{userId}` | List active public encryption keys for a recipient |
| POST | `/admin/canaries` | Create a one-time tenant-scoped canary; requires `Bank.SecurityAdmin` |
| GET | `/admin/alerts` | Read this tenant's canary and identified decoy alerts; requires `Bank.SecurityAdmin` |
| GET | `/admin/audit/public-key?version=<key-version>` | Return this tenant's current or specified RSA public key to verify signed alert evidence; requires `Bank.SecurityAdmin` |
| POST | `/admin/quarantine/release` | Release a suspended account after investigation; requires `userId`, `investigationReference`, and `investigationSummary`, plus `Bank.SecurityAdmin` |
| GET | `/escrow/public-key` | Return the current tenant's escrow RSA public key and key ID; requires an active employee session |
| POST | `/admin/compliance/decrypt` | Decrypt a stored envelope; requires `Bank.Compliance` |
| GET | `/admin/compliance/audit` | List this tenant's recent successful escrow decrypts; requires `Bank.Compliance` |
| POST | `/admin/devices/revoke` | Revoke a tenant-scoped device and passkeys; requires `Bank.SecurityAdmin` |

Passkey options and verification require a bank Entra token with `Bank.Employee`; administrative routes require the specific roles listed above. Entra tokens must have the configured API audience, an allowlisted tenant and caller app, and the required role. User-provided IDs are hashed and prefixed with the verified tenant ID before storage, and admin/audit queries are tenant-filtered. Authenticated passkey sessions use short-lived signed tokens for subsequent employee data operations. Alert evidence carries a Key Vault key ID, RS256 signature, and canonical payload; fetch the matching public key and use RSASSA-PKCS1-v1_5 with SHA-256 to verify the exact UTF-8 payload bytes. Signatures show that payload data has not changed since signing; they do not prove malicious intent or make the Table Storage record immutable. Preserve the relevant public-key versions for evidence verification after key rotation. This sample still needs independent security review and bank-specific authorization policies before real-data use.

### Entra onboarding

In the API's Microsoft Entra app registration, expose the API using the audience configured in `AZURE_API_AUDIENCE`, then define the delegated-user app roles in `infra/azure/app-roles.json` with the exact values `Bank.Employee`, `Bank.SecurityAdmin`, and `Bank.Compliance`. Merge them into the API app registration without overwriting existing roles, enable the API for organizational tenants, and configure v2 access tokens. Assign least-privilege roles to approved individual users or employee groups and configure the client app to request delegated API scopes. The API requires a delegated scope and user object ID; app-only tokens cannot enroll or authenticate employees. Keep the caller client allowlist in `BANK_TENANTS_JSON`. Never distribute a confidential client secret to a browser. The deployment template is deliberately one-bank-per-resource-group; deploy a separate stack in each bank's own Entra tenant/subscription for isolation.

After the first verified decoy hit, the employee can recover immediately through a fresh passkey challenge; the temporary 15-minute restriction expires if reauthentication is unavailable, but old session tokens stay revoked. A second identified hit within 24 hours suspends the account. Only a `Bank.SecurityAdmin` can release it, and the release request must include the tenant-scoped alert `userId`, an investigation/case reference (3-128 characters), and an investigation summary (20-2000 characters). The API records the investigator, reference, and summary in an audit alert and resets the repeat-hit window. Anonymous hits never trigger account suspension. The deployment template is deliberately one-bank-per-resource-group; deploy a separate stack in each bank's own Entra tenant/subscription for isolation.

## Azure deployment

`infra/azure/main.bicep` and `infra/azure/deploy.ps1` define and deploy a single-bank starter stack: Linux Azure Functions, a TLS-only Storage Account with shared-key access disabled, managed identity and least-privilege Table/Blob/Queue roles, separate tenant-owned Key Vault RSA escrow and audit-signing keys, Application Insights/Log Analytics, and API Management. The APIM API is imported from `infra/azure/openapi.json`; its policy applies per-IP rate limiting, a 2 MiB JSON body limit, CORS, and a backend-only random gateway header. Every Function route rejects requests without that header when configured, so direct Function URL requests do not bypass API authorization. The template sets `DECOY_TENANT_ID` for its single-bank deployment so anonymous decoy alerts are tenant-visible but not assigned to an employee. Local development leaves `GATEWAY_SHARED_SECRET` unset and uses the Storage connection string; cloud deployments use identity-based storage access.

Before deploying:

1. Create/configure the API's Entra app registration and app roles as described above. Have a bank administrator assign roles and grant consent to approved caller applications. The audience, bank tenant ID, and caller client ID are required deployment inputs.
2. Sign in with Azure CLI to the bank's Azure tenant and select the intended subscription (`az login`, then `az account set`). Ensure the identity can create the listed resources and role assignments, including `Microsoft.Authorization/roleAssignments/write`. Install Azure CLI with Bicep support, Node.js, and Azure Functions Core Tools v4.
3. Review current regional availability and costs. The template uses Consumption Functions, Consumption APIM, standard Storage, 30-day Log Analytics retention, and Standard Key Vault by default. APIM and monitoring incur costs; Consumption APIM is not a private-network deployment or an SLA-backed production gateway. Use `-KeyVaultSku premium` for HSM-backed escrow where available/required. This still does not provide private endpoints or network isolation.
4. Run from PowerShell using your own non-secret IDs and verified HTTPS frontend origin:

```powershell
.\infra\azure\deploy.ps1 `
  -ResourceGroupName 'rg-bank-attestation-dev' `
  -Location 'eastus' `
  -NamePrefix 'bankdemo' `
  -BankTenantId '<bank-tenant-guid>' `
  -ApprovedClientIds @('<approved-caller-app-client-guid>') `
  -ApiAudience 'api://<api-app-client-guid>' `
  -AllowedOrigin 'https://<your-frontend-host>' `
  -RelyingPartyId '<your-frontend-host>' `
  -RelyingPartyName 'Bank Attestation' `
  -PublisherEmail '<operator-email>' `
  -PublisherName 'Bank Attestation' `
  -Deploy
```

The script runs the API tests before provisioning. It generates separate random session-signing and gateway secrets, passes them through a temporary parameter file, removes that file after deployment, publishes the API, and checks the health endpoint through APIM. Do not paste secret values into source control, client code, or chat. Azure resources can incur charges; `-Deploy` is an explicit provisioning opt-in. Deleting the resource group will remove all resources and stored prototype data; preserve anything required before cleanup.

The Function App still has a public Azure hostname, but the API code requires the secret header that APIM overwrites and injects; do not expose that secret. For stronger production isolation, replace Consumption APIM with an appropriate networking tier, put APIM and Functions behind private networking/access restrictions, and test that the Function hostname is unreachable from outside the gateway. The Bicep template does not configure private endpoints, customer-facing frontend hosting, custom domains/certificates, automated key rotation, immutable audit retention, or bank employee authorization workflows.

The API's `Bank.Employee` app role currently authorizes a calling application, not the individual human employee. The bank must enforce user identity, per-user authorization, consent/approval for escrow decryptions, and auditable actor identity in its trusted application before handling real data. Signed alert evidence is tamper-evident but the underlying Table Storage is not immutable/compliance-grade; an operator with signing-key access could create new signatures, and signing-key version retention and rotation must be governed. Complete an independent security review and bank legal/privacy review before production use.

A laptop lock or wipe must be an approved action in the bank's MDM/endpoint-management system; this API intentionally does not implement remote erasure.
