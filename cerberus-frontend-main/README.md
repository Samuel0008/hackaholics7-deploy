# Cerberus Frontend (`cerberus-frontend`)

[![Next.js 15](https://img.shields.io/badge/Next.js-15.1.7-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0.0-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript 5.7](https://img.shields.io/badge/TypeScript-5.7.3-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4.17-38bdf8?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![WebAuthn / FIDO2](https://img.shields.io/badge/WebAuthn-FIDO2%20Passkeys-emerald?style=flat-square&logo=fido)](https://w3c.github.io/webauthn/)
[![Vitest 3](https://img.shields.io/badge/Vitest-3.0.5-fcc72b?style=flat-square&logo=vitest)](https://vitest.dev/)
[![Architecture](https://img.shields.io/badge/Architecture-Composable%20BFF%20(API%20Lens)-purple?style=flat-square)](#architecture--bff-design)

> **Cerberus Banking Security Prototype**

Cerberus Frontend is a test UI for the Banking Attestation Functions API. Connected flows include Entra-authorized passkey registration/authentication, a browser-side encrypted-message self-round-trip, tenant decoy-alert history, configured Key Vault public-key metadata, compliance audit/decryption, canary creation, account release, device revocation, non-authoritative demo compliance input, and simulation-only device actions. It is not a production banking or threat-detection console.

> **Important:** The previous mock dashboard implied real IP/JA3 telemetry, firewall quarantine, hardware attestation, AML/OFAC screening, and automated decoy verification. Those capabilities are not provided by the backend. The live UI now shows their absence instead of substituting mock results. The separate scenario injector and mock-engine code are demonstration-only.

---

## Table of Contents

- [Overview & Value Proposition](#overview--value-proposition)
- [Three Operational Surfaces](#three-operational-surfaces)
- [Architecture & BFF Design](#architecture--bff-design)
- [Zero-Trust Cryptographic Deception Mechanics](#zero-trust-cryptographic-deception-mechanics)
- [Offline Demo Fallback & Scenario Injector](#offline-demo-fallback--scenario-injector)
- [Project Directory Structure](#project-directory-structure)
- [Quickstart & Commands](#quickstart--commands)
- [Environment Variables](#environment-variables)
- [Testing & Verification](#testing--verification)
- [Capabilities Deep-Dive](#capabilities-deep-dive)
- [License](#license)

---

## Overview & Value Proposition

The prototype provides a protected passkey lifecycle, browser-side encrypted-message storage and self-retrieval, tenant-scoped decoy-alert visibility, security-admin operations, Key Vault public-key metadata, and audited compliance decryption. It does not provide network analytics, IP blocking, AML/OFAC screening, MDM commands, or hardware attestation.

---

## Three Operational Surfaces

The frontend is partitioned into three distinct operational lenses accessible from the top navigation bar or the root hub (`/`):

```
                        ┌──────────────────────────────────────────────┐
                        │              Cerberus Hub (/)                │
                        └──────────────────────┬───────────────────────┘
                                               │
             ┌─────────────────────────────────┼────────────────────────────────┐
             ▼                                 ▼                                ▼
  ┌──────────────────────┐          ┌──────────────────────┐         ┌──────────────────────┐
  │   Employee Portal    │          │ Tenant Alert Viewer   │         │ Key Registry & Audit │
  │ (/auth/employee-     │          │   (/soc/dashboard)   │         │   & Audit Registry   │
  │       portal)        │          │                      │         │ (/admin/crypto-reg)  │
  ├──────────────────────┤          ├──────────────────────┤         ├──────────────────────┤
  │ • WebAuthn Passkeys  │          │ • Decoy alert history│         │ • Key Vault metadata│
  │ • Entra sign-in      │          │ • Containment counts │         │ • Compliance audit  │
  │ • Short-lived session│          │ • Capability limits  │         │ • Device demo only   │
  │ • Encrypted self-test │         │ • Admin API actions  │         │ • No AML screening   │
  └──────────────────────┘          └──────────────────────┘         └──────────────────────┘
```

### 1. Corporate Client Portal (`/auth/employee-portal`)
- Real passkey registration and authentication use the Functions API after Entra sign-in.
- Successful passkey verification creates a short-lived API session held only in component memory.
- After verification, the browser registers a separate RSA-OAEP-3072 message key; the non-extractable private key is kept in IndexedDB and is not attested as hardware-backed.
- The message test encrypts locally, uploads only an envelope, downloads it, and decrypts it locally. The current API stores by authenticated employee, so this is self-retrieval, not cross-user sharing.
- The browser cannot prove TPM/Secure Enclave backing through this API; UI text explicitly avoids claiming hardware attestation.
- Automated decoy payload sync is not implemented and is shown as unavailable.

### 2. Security Alerts (`/soc/dashboard`)
- Reads tenant-scoped decoy alert records and containment counts from the authenticated API.
- Does not claim to provide live IP, JA3, threat-score, or firewall-quarantine data.
- Exposes security-admin canary, release, device-revocation, and demo-compliance operations. Compliance decryption separately requires the `Bank.Compliance` role and displays sensitive plaintext only after the API records its audit event.

### 3. Key Registry & Audit (`/admin/crypto-registry`)
- Reads escrow-encryption and audit-signing public-key metadata from Azure Key Vault through the API.
- Displays recorded escrow-decryption audit entries when the signed-in user has the `Bank.Compliance` role.
- Includes approval-gated device lock/wipe **simulation records only**. No device command is sent.
- AML/OFAC transaction screening is not available.

The browser uses the Entra bearer token for admin/compliance endpoints and the separate short-lived passkey API session token for employee encryption/key/sync endpoints. The BFF only forwards the supplied token; authorization is enforced by the Functions API.

---

## Architecture & BFF Design

Cerberus Frontend uses a Next.js BFF to call a fixed allowlist of Functions API paths. The browser obtains a delegated Entra access token; the BFF forwards that bearer token and preserves API status/errors. The server-side BFF URL is configured using `BANKING_API_BASE_URL`.

```
[ Browser Client UI ]
        │
        ▼ (Local Next.js Route Handlers)
┌────────────────────────────────────────────────────────────────────────┐
│                   Next.js App Router BFF Layer                         │
├────────────────────┬────────────────────┬──────────────────────────────┤
│   Employee Lens    │      SOC Lens      │          Audit Lens          │
│ (/api/bff/employee)│  (/api/bff/soc)    │      (/api/bff/audit)        │
│ • passkey routes   │ • decoy alerts     │ • key metadata               │
│ • API session      │ • no IP blocking   │ • compliance audit           │
└─────────┬──────────┴─────────┬──────────┴──────────────┬───────────────┘
          │                    │                         │
          └────────────────────┼─────────────────────────┘
                               ▼
               ┌──────────────────────────────┐
               │ Authenticated API           │
               │ Forwarder                   │
               └──────────┬──────────────────┘
                          ▼
                 Azure Functions API
```

### Pattern 6: API Lens (Role Isolation)
- **Employee routes**: Forward passkey registration/authentication requests. Protected employee-data routes use the separate short-lived API session token.
- **SOC routes**: Return tenant-scoped decoy alert records only. The old IP quarantine action returns `501 Not Implemented`.
- **Audit routes**: Return backend key metadata and compliance-decryption audit entries; authorization roles are enforced by the API.

### Error handling and demo separation
- The upstream forwarder does not substitute mock data when the API is unavailable or returns an authorization error.
- Offline scenario-injector/mock-engine components are presentation-only and do not produce backend security alerts or actions.
- The dashboard uses only fields returned by the tenant-scoped backend API and shows unavailable capabilities explicitly.

---

## Zero-Trust Cryptographic Deception Mechanics

### Automated decoy worker
The current Functions API does not serve a client decoy-sync payload, and the frontend does not claim to verify one. The employee portal shows this integration as unavailable. Backend decoy URLs are scanner-facing synthetic endpoints and are unrelated to a continuously polling client worker.

---

## Offline Demo Fallback & Scenario Injector

Cerberus includes a built-in **Red-Team Attack Scenario Injector** designed for demonstrations, hackathon presentations, and offline testing:

- **Global Hotkey**: Press **`Ctrl+Shift+D`** (or **`Cmd+Shift+D`** on macOS) anywhere in the application.
- **Modal Trigger**: Click the **"Scenario Injector"** button in the header or root hub.

### Pre-Scripted Attack Scenarios
| Scenario ID | Attack Type | Key Behaviors |
|-------------|-------------|---------------|
| `CREDENTIAL_STUFFING` | Distributed Brute Force & TLS Anomaly | Presentation-only mock event; not observed by the Functions API. |
| `DECOY_CANARY_BREACH` | Canary Key Poisoning & Detonation | Adversary touches `/keys/escrow/honey-trap-9021`; high-visibility detonation banner flashes crimson; attacker trapped in synthetic financial feed. |
| `SESSION_REVOCATION` | Zero-Trust Immediate Quarantine | Presentation-only scenario. The live API does not provide network quarantine. |

---

## Project Directory Structure

```
cerberus-frontend/
├── public/
│   ├── favicon.ico
│   └── workers/
│       └── securityWorker.js          # Off-thread Web Crypto decoy verification worker
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout (Dark theme, AppHeader, global CSS)
│   │   ├── page.tsx                   # Central navigation hub & architectural showcase
│   │   ├── globals.css                # Tailwind base styles & cyber defense variables
│   │   ├── api/
│   │   │   └── bff/                   # Composable BFF Route Handlers
│   │   │       ├── employee/          # Employee Lens (register-options, register-verify, sync-payload)
│   │   │       ├── soc/               # SOC Operator Lens (telemetry-stream, quarantine)
│   │   │       └── audit/             # Auditor Lens (triad-status, aml-inspect)
│   │   ├── auth/
│   │   │   └── employee-portal/       # Surface 1: Corporate Client & WebAuthn enrollment
│   │   ├── soc/
│   │   │   └── dashboard/             # Surface 2: SOC Attack-Mitigation Command Center (Demo Core)
│   │   └── admin/
│   │       └── crypto-registry/       # Surface 3: Cryptographic Triad & AML Audit Viewer
│   ├── components/
│   │   ├── auth/                      # WebAuthnEnrollmentCard, AttestationBadge, DecoyWorkerStatus
│   │   ├── crypto/                    # TriadKeyBoard, AMLPipelineVisualizer, SupabaseStatusCard
│   │   ├── demo/                      # DemoControllerModal (Ctrl+Shift+D scenario injector)
│   │   ├── layout/                    # AppHeader, NavigationPills
│   │   └── soc/                       # AttackerTerminal, AnomalyRadar, HoneyTrapBanner,
│   │                                  # FingerprintTable, HoneyFeedModal, BattleBoardLayout
│   ├── hooks/
│   │   ├── use-webauthn.ts            # FIDO2 Passkey registration & simulation hook
│   │   ├── use-security-worker.ts     # Web Worker lifecycle bridge hook
│   │   ├── use-telemetry-stream.ts    # Composed telemetry & adversary quarantine stream hook
│   │   └── use-demo-mode.ts           # Demo modal state & scenario playback controller
│   ├── lib/
│   │   ├── bff/
│   │   │   ├── upstream.ts            # Resilient upstream client (800ms timeout + fallback)
│   │   │   └── mock-engine.ts         # High-fidelity mock engine with state persistence
│   │   ├── crypto/
│   │   │   └── webcrypto.ts           # Client Web Crypto AES-GCM helpers
│   │   ├── mock/
│   │   │   ├── attack-scenarios.ts    # Realistic red-team attack sequences
│   │   │   └── synthetic-feed.ts      # Synthetic wire transactions & decoy bank accounts
│   │   └── utils.ts                   # Tailwind cn merger and formatting helpers
│   └── types/
│       ├── auth.ts                    # WebAuthn options, attestation status, verification
│       ├── crypto.ts                  # Triad key entries, AML audit records, decoy payloads
│       ├── demo.ts                    # Scenario definitions, step progression, demo state
│       └── telemetry.ts               # Telemetry events, threat reports, adversary fingerprints
├── tests/
│   ├── setup.ts                       # Vitest global mocks (SubtleCrypto, Worker, TextEncoder)
│   ├── bff/                           # Route handler & upstream fallback tests
│   ├── components/                    # UI component tests (SOC, Auth, Crypto, Demo)
│   ├── hooks/                         # Custom hook tests (WebAuthn, Worker, Telemetry)
│   └── lib/                           # Crypto helper and mock engine unit tests
├── CAPABILITIES.md                    # In-depth architectural & capability specification
├── SPEC.md                            # Original technical requirements & engineering spec
├── package.json                       # Project dependencies & scripts
├── tailwind.config.ts                 # Tailwind configuration with cyber color palette
├── tsconfig.json                      # Strict TypeScript compiler configuration
└── vitest.config.ts                   # Vitest runner configuration with jsdom
```

---

## Quickstart & Commands

### Prerequisites
- **Node.js**: v18.17.0+ or v20.x+ or v22.x+
- **Package Manager**: npm, yarn, or pnpm

### 1. Installation
```bash
# Clone the repository and navigate into the frontend folder
cd cerberus-frontend

# Install dependencies
npm install
```

### 2. Running Development Server
```bash
# Starts Next.js development server on http://localhost:3000
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

> [!NOTE]
> Copy `.env.example` to `.env.local` and configure the API base URL and Entra public-client settings. Local Functions uses `http://localhost:7071/api`. Live BFF requests require an Entra delegated token; upstream failures and authorization errors are returned to the UI and never replaced with mock success.

### 3. Production Build & Linting
```bash
# Typecheck and compile production build
npm run build

# Start production server
npm start

# Health check probe
curl http://localhost:3000/api/health
```

### 4. Running Test Suite
```bash
# Run Vitest test runner across all unit and component suites
npm test
```

---

## Environment Variables

Create a `.env.local` file in the project root:

```bash
# Local Functions URL; in Azure use the APIM gateway URL ending in /v1.
BANKING_API_BASE_URL=http://localhost:7071/api

# Entra SPA registration and API delegated scope; never add a client secret here.
NEXT_PUBLIC_ENTRA_CLIENT_ID=your-frontend-application-client-id
NEXT_PUBLIC_ENTRA_TENANT_ID=your-bank-tenant-guid
NEXT_PUBLIC_ENTRA_API_SCOPE=api://your-api-application-id/access_as_user
PORT=3000
```

The Entra app registration must list the frontend origin as a Single-page application redirect URI (for local development: `http://localhost:3000`). Authentication uses a full-page redirect so it does not depend on browser popup permissions. The app must request the API's delegated `access_as_user` scope and have administrator consent and required user app-role assignments. The API server must allowlist this frontend client ID and frontend HTTPS origin. Do not use a confidential client secret in this browser application.

---

## Testing & Verification

The project includes an automated test suite powered by **Vitest**, **React Testing Library**, and **jsdom**:

| Test Suite | Path | What It Verifies |
|------------|------|------------------|
| **BFF Routes** | `tests/bff/routes.test.ts` | Checks Functions route mapping, bearer forwarding, status preservation, and explicit unsupported-feature responses. |
| **Web Crypto Helpers** | `tests/lib/mock-engine.test.ts` | Validates AES-GCM mismatch detection, event generation, and state manipulation. |
| **WebAuthn Hook** | `tests/hooks/use-webauthn.test.ts` | Verifies real passkey flow handling and rejects the former fake hardware-token enrollment. |
| **Security Worker Hook** | `tests/hooks/use-security-worker.test.ts` | Tests worker lifecycle, message dispatch, and error handling. |
| **SOC Battle Board** | `tests/components/soc-visuals.test.tsx` | Tests Anomaly Radar rendering, Honey-Trap banner animation triggers, and terminal output. |
| **Adversary Matrix** | `tests/components/FingerprintTable.test.tsx` | Tests sorting, risk score coloring, and quarantine toggle actions. |
| **Demo Scenario Modal** | `tests/components/DemoControllerModal.test.tsx` | Tests scenario injection, step progression, and hotkey trigger. |

Run tests at any time with:
```bash
npm test
```

---

## Capabilities Deep-Dive

For an exhaustive technical breakdown of the platform's architectural, cryptographic, and operational capabilities, see [CAPABILITIES.md](file:///c:/Users/Samuel/Desktop/codes/cerberus-frontend/CAPABILITIES.md).
