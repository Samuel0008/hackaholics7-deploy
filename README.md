# Banking Attestation Prototype



Decoy Backend URLs

cerberus-backend-gnc6.onrender.com/api/.env

https://cerberus-backend-gnc6.onrender.com/api/debug/config

https://cerberus-backend-gnc6.onrender.com/api/backup/database.sql


A local-first prototype for passkey-based employee authentication, encrypted-message relay, tenant escrow, and decoy-triggered account containment. It is an experimental security demo, not a production banking service or general-purpose attacker detector. Use synthetic data only.

## API integration

The [API integration guide](docs/API.md) is the starting point for integrators. It documents Entra delegated-token requirements, passkey enrollment and sign-in, employee session tokens, message keys and encrypted-envelope relay, security-admin workflows, compliance operations, request/response examples, and prototype limitations.

The machine-readable API contract used by Azure API Management is [infra/azure/openapi.json](infra/azure/openapi.json).

## Project layout

- `apps/api/` — Azure Functions API, local setup, and API tests
- `packages/crypto/` — client-side message-encryption and key-management helpers
- `docs/API.md` — integrator-facing API guide
- `infra/azure/` — Azure Bicep deployment, API Management OpenAPI definition, and Entra app roles
- `infrastructure/` — API Management gateway policy

## Local development

Requirements: Node.js 20+, Azure Functions Core Tools v4, and Azurite. Follow [apps/api/README.md](apps/api/README.md) for local settings and setup, then run the API tests from `apps/api`:

```powershell
npm.cmd test
```

Never commit `apps/api/local.settings.json`, credentials, access tokens, local storage emulator data, or build outputs. Use `apps/api/local.settings.example.json` as a template and generate unique local secrets.

## Security and deployment notes

- The API requires the exact Entra `access_as_user` delegated scope, an approved tenant/client, and the per-user role required for each operation; employee sessions are bound to the verified tenant, user, and active device.
- Compliance decryption requires a case reference and reason, records the verified actor/client, and writes a tenant-signed audit alert.
- Employee encryption keys are generated client-side. Escrow decryption is intentionally possible to authorized compliance roles, so this is not user-only end-to-end encryption.
- A verified decoy hit triggers a defensive policy; it is not proof of malicious intent. A first hit forces fresh passkey authentication, while a second identified hit within 24 hours suspends the account pending investigation.
- Security-admin device compliance and lock/wipe workflows are simulation-only: compliance is manually entered and non-authoritative; approvals never send device commands; and there is no TPM, firmware-flashing, or MDM integration.
- Tenant-attributed incident evidence can be signed with a Key Vault key. Signatures do not make the underlying Table Storage immutable.
- Review deployment modes and limitations in [apps/api/README.md](apps/api/README.md). The default Azure deployment uses Basic APIM with per-IP rate limits and a request-size limit, then restricts Function and SCM ingress to the APIM service tag while retaining a private gateway header. Function-only mode omits these protections and is not for public exposure. Deployment publishes the API—not the entire repository—enables Key Vault key rotation, and sends Function 5xx alerts to a required security mailbox. Azure resources incur charges and require explicit opt-in.

This project requires independent security, privacy, and operational review before any real-data or production use.
