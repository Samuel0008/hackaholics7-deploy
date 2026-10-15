# Spec: Cerberus Frontend (cerberus-frontend)

## Objective
Build a dual-surface financial cybersecurity console for the **Cerberus Zero-Trust Cryptographic Deception Engine**. The frontend balances high-fidelity enterprise production capabilities with hackathon-ready demo execution across three primary routes:
1. **Corporate Client Surface (`/auth/employee-portal`)**: Demonstrates hardware-bound WebAuthn/FIDO2 credential registration/login (`@simplewebauthn/browser`) and silent client-side decoy verification via an isolated Web Worker (`securityWorker.js`) without UI disruption.
2. **Autonomous SOC Command Center (`/soc/dashboard`) [Primary Demo Core]**: Real-time attack-mitigation command board featuring an Attacker Telemetry Feed / Terminal, Topological Threat Radar, Cryptographic Honey-Trap Detonation banner, Adversary Fingerprint Matrix, and synthetic believable financial honey-feed inspector modal.
3. **Cryptographic Triad & Audit Viewer (`/admin/crypto-registry`)**: Real-time visualization of the 3-key triad (Escrow HSM, Client Hardware Key, Decoy Honey Keys), in-memory AML compliance inspection simulation, and Supabase-ready storage abstraction monitor.

Additionally, provides an **Offline Demo Fallback Toolbar (`Ctrl+Shift+D`)** that injects scripted red-team attack sequences and mock telemetry if the backend server is unreachable.

---

## Architecture & BFF (Backend-for-Frontend) Design

We adopt the **Composable BFF (cBFF)** pattern with **Pattern 6: API Lens** as the primary driver, supported by **Pattern 2: API Composition**:

1. **Primary Pattern — API Lens:**
   `cerberus-frontend` is partitioned into three distinct operational personas accessing the shared underlying zero-trust engine:
   - **Employee Lens (`/api/bff/employee/*`)**: Handles device attestation and silent decoy synchronization payloads without exposing backend threat data or bank HSM internals.
   - **SOC Operator Lens (`/api/bff/soc/*`)**: Scopes telemetry, honeypot detonate signals, adversary fingerprint anomalies, and session quarantine actions.
   - **Auditor Lens (`/api/bff/audit/*`)**: Exposes in-memory AML compliance logs, triad key states, and ledger storage health without leaking live attacker feeds.

2. **Supporting Pattern — API Composition:**
   - The SOC command center aggregates multiple backend endpoints (`/api/v1/telemetry/threat-report` + `/api/v1/telemetry/events`) into a unified streaming interface at `/api/bff/soc/telemetry-stream`.
   - The BFF handles graceful upstream degradation: if the backend server (`http://localhost:3001`) is offline or during judging demo mode, the BFF transparently composes and serves synthetic attack sequences and pre-recorded scenarios with zero UI error leakage and zero visual "simulated" tags.

---

## Tech Stack & Tooling
- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript (Client UI + Next.js Route Handler BFF)
- **Styling & UI:** Tailwind CSS + `shadcn/ui` (Radix primitives, Lucide icons, Dark Mode default, clean enterprise cyber defense aesthetic)
- **Visuals & Motion:** `framer-motion` (radar pulse, alert flashes, micro-interactions) + Canvas / SVG (for topological anomaly radar)
- **Data & Tables:** `@tanstack/react-table` for telemetry event logs and adversary fingerprint matrix
- **Client Cryptography & Security:** `@simplewebauthn/browser` for WebAuthn/FIDO2 ceremony execution, native Web Crypto API (`SubtleCrypto` in `securityWorker.js`)
- **BFF Communication:** Next.js Route Handlers (`/api/bff/*`) streaming unified SSE / event data to client components
- **Testing:** Vitest + React Testing Library + jsdom

---

## Commands
```bash
# Package Installation
npm install

# Development Server (Port 3000, Next.js BFF routes connect to Express backend on http://localhost:3001)
npm run dev

# Production Build & Typecheck
npm run build

# Unit & Integration Tests
npm test

# Lint & Format
npm run lint
```

---

## Project Structure
```
cerberus-frontend/
├── public/
│   ├── favicon.ico
│   └── workers/
│       └── securityWorker.js          # Isolated worker for decoy payload sync & AES-GCM tag verification
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout (Dark theme, Hotkey listener, Navigation header)
│   │   ├── page.tsx                   # Landing / Navigation hub linking to the 3 routes
│   │   ├── api/
│   │   │   └── bff/
│   │   │       ├── employee/
│   │   │       │   ├── register-options/route.ts  # WebAuthn options proxy / mock
│   │   │       │   ├── register-verify/route.ts   # WebAuthn verify proxy / mock
│   │   │       │   └── sync-payload/route.ts      # Honey payload proxy / mock
│   │   │       ├── soc/
│   │   │       │   ├── telemetry-stream/route.ts  # Composed SSE/stream aggregating threat-report & events
│   │   │       │   └── quarantine/route.ts        # Zero-trust session revocation
│   │   │       └── audit/
│   │   │           ├── triad-status/route.ts      # 3-key triad status proxy / mock
│   │   │           └── aml-inspect/route.ts       # AML in-memory compliance inspection proxy / mock
│   │   ├── auth/
│   │   │   └── employee-portal/
│   │   │       └── page.tsx           # Route 1: Corporate Client & WebAuthn enrollment
│   │   ├── soc/
│   │   │   └── dashboard/
│   │   │       └── page.tsx           # Route 2: SOC Attack-Mitigation Command Center (Demo Core)
│   │   └── admin/
│   │       └── crypto-registry/
│   │           └── page.tsx           # Route 3: Cryptographic Triad & AML Audit Viewer
│   ├── components/
│   │   ├── ui/                        # Reusable shadcn/ui components (Button, Dialog, Badge, Card, etc.)
│   │   ├── layout/                    # AppHeader, NavigationPills, StatusTicker
│   │   ├── soc/                       # AttackerTerminal, AnomalyRadar, FingerprintTable, HoneyTrapBanner, HoneyFeedModal
│   │   ├── auth/                      # WebAuthnEnrollmentCard, HardwareKeyStatusBadge, DecoyWorkerStatus
│   │   ├── crypto/                    # TriadKeyBoard, AMLPipelineVisualizer, SupabaseStatusCard
│   │   └── demo/                      # Discrete DemoController modal (Ctrl+Shift+D trigger)
│   ├── hooks/
│   │   ├── use-webauthn.ts            # Client WebAuthn registration & authentication hook
│   │   ├── use-security-worker.ts     # Web Worker lifecycle & message bridge hook
│   │   ├── use-telemetry-stream.ts    # Real-time event stream hook consuming /api/bff/soc/telemetry-stream
│   │   └── use-demo-mode.ts           # Demo state & scripted attack playback controller
│   ├── lib/
│   │   ├── bff/
│   │   │   ├── upstream.ts            # Upstream Express fetch client (http://localhost:3001) with fallback
│   │   │   └── mock-engine.ts         # High-fidelity mock generator for offline/fallback mode
│   │   ├── crypto/
│   │   │   └── webcrypto.ts           # SubtleCrypto helpers (AES-GCM tag verify, hash calculation)
│   │   ├── mock/
│   │   │   ├── attack-scenarios.ts    # Pre-recorded Red-Team attack sequences for zero-dependency demo
│   │   │   └── synthetic-feed.ts      # Believable fake wire transactions & dummy bank accounts
│   │   └── utils.ts                   # Tailwind cn helper, date formatters, byte formatters
│   └── types/
│       ├── auth.ts                    # WebAuthn & device attestation types
│       ├── telemetry.ts               # Telemetry events, IP fingerprint, risk scores
│       ├── crypto.ts                  # Triad key status, AML audit record, decoy payload types
│       └── demo.ts                    # Demo mode state & scenario definitions
├── tests/
│   ├── bff/                           # Route handler & upstream fallback tests
│   ├── components/                    # UI component tests
│   ├── hooks/                         # Custom hook tests
│   └── lib/                           # Crypto helper and mock engine tests
├── tasks/
│   ├── plan.md                        # Implementation plan (Phase 2)
│   └── todo.md                        # Actionable task list (Phase 3)
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── SPEC.md
```

---

## Code Style & Conventions
- **TypeScript Strictness:** Full strict mode (`strict: true`), explicit type signatures on API interfaces and hook returns, no implicit `any`.
- **Component Architecture:** Small, functional React components with atomic responsibilities. Heavy computation (e.g. cryptography) delegated to Web Workers or utilities.
- **Styling:** Cyberpunk-informed, clean enterprise dark-mode aesthetics (slate-950/black background, neon accents: cyan for corporate client, emerald for verified/safe, amber for warnings, rose/crimson for threat attacks/detonations). No visible "simulated" tags or mode badges in normal UI.
- **Resilience:** All BFF route handlers automatically fall back to the internal mock engine if the backend at `http://localhost:3001` is unreachable, ensuring a seamless presentation experience.

### Example Component Style
```tsx
import React from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttestationBadgeProps {
  isHardwareBound: boolean;
  algorithm?: string;
  className?: string;
}

export const AttestationBadge: React.FC<AttestationBadgeProps> = ({
  isHardwareBound,
  algorithm = 'ECDSA P-256',
  className,
}) => {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono border backdrop-blur-md transition-colors',
        isHardwareBound
          ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
          : 'bg-amber-950/40 border-amber-500/30 text-amber-400',
        className
      )}
    >
      {isHardwareBound ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
      <span>
        {isHardwareBound ? `Hardware Key: Bound (${algorithm})` : 'Unverified Platform Key'}
      </span>
    </div>
  );
};
```

---

## Testing Strategy
- **Framework:** Vitest with jsdom environment and `@testing-library/react`.
- **Unit Tests:**
  - BFF route handlers and fallback upstream switching.
  - Client crypto helpers (`webcrypto.ts` AES-GCM verification catch).
  - Telemetry parser and anomaly risk-score visual mappers.
- **Component Tests:**
  - Attestation badge state switching.
  - Honey-Trap detonation banner visibility & animation triggers.
  - Telemetry table pagination and filtering.
- **Verification Commands:**
  - `npm test` runs suite with coverage reporting.
  - `npm run build` verifies zero TypeScript compilation errors and bundle integrity.

---

## Boundaries
- **Always do:**
  - Route all client traffic through the Next.js BFF layer (`/api/bff/*`), keeping upstream endpoints decoupled from the client UI.
  - Provide completely seamless offline/fallback functionality without any visual disruption or "simulated mode" labels in the primary UI.
  - Keep client WebAuthn operations spec-compliant using `@simplewebauthn/browser`.
  - Isolate decoy payload polling and silent cryptographic tag mismatch catching in `securityWorker.js` to ensure the main thread is never blocked.
  - Maintain dark-mode cyber defense UI styling with high visual clarity for presentations.
- **Ask first:**
  - Adding heavy 3D WebGL libraries (prefer lightweight 2D canvas/SVG for radar charts to guarantee 60fps performance on any laptop).
  - Altering the 3 primary route paths.
- **Never do:**
  - Display "Live vs Simulated" warning banners or badges in the user-facing header.
  - Store unencrypted private keys in localStorage, cookies, or frontend state.
  - Block the UI thread with cryptographic loops.
  - Fail the demo or crash the dashboard if the backend server at `localhost:3001` is not yet running.

---

## Success Criteria
- [ ] **Corporate Client (`/auth/employee-portal`)**:
  - Triggers standard WebAuthn Passkey registration via `navigator.credentials.create` proxied through `/api/bff/employee/register-*`.
  - Displays hardware-bound status badge (`ECDSA P-256`).
  - Spawns `securityWorker.js` which fetches `/api/bff/employee/sync-payload`, validates the mismatch in `<2ms`, and reports silent status without interrupting the user.
- [ ] **SOC Command Center (`/soc/dashboard`)**:
  - Displays live Attacker Feed / Red-Team terminal streaming from `/api/bff/soc/telemetry-stream`.
  - Renders Topological Threat Radar highlighting flagged anomalous IP nodes.
  - Flashes the Cryptographic Honey-Trap Detonation banner when poisoned payloads are touched.
  - Renders Adversary Fingerprint Matrix with risk scores, headers, and Quarantine toggle (`ACTIVE` / `REVOKED`).
  - Opens Attacker Honey-Feed Inspector modal displaying believable synthetic financial ledger data.
- [ ] **Cryptographic Triad & Audit Viewer (`/admin/crypto-registry`)**:
  - Visualizes Escrow HSM, Client Public Key, and Decoy Honey Key statuses via `/api/bff/audit/triad-status`.
  - Visualizes simulated in-memory AML compliance payload inspection pipeline.
  - Shows Supabase-ready storage abstraction health status.
- [ ] **Demo Reliability & Offline Fallback**:
  - `Ctrl+Shift+D` opens a discrete Demo Controller modal to trigger pre-scripted scenarios (Credential Stuffing Attack, Decoy Canary Breach, Zero-Trust Session Revocation).
  - Works 100% reliably whether the backend server is online or offline, with no ugly error banners.
- [ ] **Build & Quality**:
  - `npm run build` completes with 0 errors.
  - All unit/component tests pass (`npm test`).

---

## Resolved Architectural Decisions
- **No Live vs Simulated Indicator**: The application UI maintains an authentic, clean cyber defense console appearance without visible mock or simulation badges. Fallback to mock data happens automatically in the BFF layer if the upstream backend is disconnected.
- **Telemetry Streaming Protocol**: Implemented as a Next.js BFF Route Handler (`/api/bff/soc/telemetry-stream`) that aggregates backend `/api/v1/telemetry/events` and `/api/v1/telemetry/threat-report` via polling, streaming unified events directly to the frontend client.
- **BFF Architecture**: Pattern 6 (API Lens) as the domain driver across the 3 surfaces, supported by Pattern 2 (API Composition) to consolidate telemetry feeds and graceful degradation.

- **WebAuthn Hardware Token Simulation**: Inside the employee registration card, a discrete fallback action ("Simulate Hardware Token") is provided so that any tester, CI runner, or judge lacking biometric/FIDO2 hardware can complete the zero-trust enrollment and attestation verification ceremony seamlessly.

---

## Open Questions
None. All architectural decisions, personas, BFF routing, and fallback strategies have been resolved and agreed upon.
