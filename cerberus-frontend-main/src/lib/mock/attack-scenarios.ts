import { AttackScenario } from '@/types/demo';

export const ATTACK_SCENARIOS: Record<string, AttackScenario> = {
  CREDENTIAL_STUFFING: {
    id: 'CREDENTIAL_STUFFING',
    title: 'Distributed Credential Stuffing & TLS Fingerprint Mismatch',
    description: 'Adversary executes high-velocity brute force using rotated residential proxies with non-compliant JA3 cipher negotiation.',
    estimatedDurationSec: 15,
    steps: [
      {
        delayMs: 500,
        description: 'TLS handshake initiated from anomalous ASN 14061 (DigitalOcean)',
        terminalLog: '[WARN] TLS ClientHello anomaly: JA3 771,4865-4866-4867,43-51,29-23-24 mismatched against declared Chrome/133 User-Agent',
        telemetryEvent: {
          category: 'AUTH_ATTEMPT',
          level: 'MEDIUM',
          sourceIp: '198.51.100.42',
          targetResource: '/api/v1/auth/session-init',
          action: 'ANOMALOUS_CIPHER_NEGOTIATION',
          details: { ja3: 'e7d705a3286e19ea42f587b344ee6865', asn: 'AS14061' },
        },
      },
      {
        delayMs: 2000,
        description: 'Rapid credential replay detected across 12 employee identity targets',
        terminalLog: '[HIGH] Velocity alert: 42 requests/sec from single TLS session. Origin IP: 198.51.100.42 (Bucharest, RO)',
        telemetryEvent: {
          category: 'AUTH_ATTEMPT',
          level: 'HIGH',
          sourceIp: '198.51.100.42',
          targetResource: '/api/v1/auth/login',
          action: 'HIGH_VELOCITY_CREDENTIAL_STUFFING',
          details: { requestRate: '42 req/s', sampleTarget: 'corporate_exec@fintech.vault' },
        },
        fingerprintUpdate: {
          ip: '198.51.100.42',
          riskScore: 78,
          threatLevel: 'HIGH',
          decoyHitCount: 0,
        },
      },
      {
        delayMs: 3500,
        description: 'Adversary attempted bypass of FIDO2 challenge using replay token',
        terminalLog: '[CRITICAL] Zero-Trust Attestation failure: Hardware-bound token signature missing. Replayed challenge payload rejected.',
        telemetryEvent: {
          category: 'KEY_ACCESS',
          level: 'CRITICAL',
          sourceIp: '198.51.100.42',
          targetResource: '/api/v1/auth/fido-attest',
          action: 'ATTESTATION_TOKEN_REPLAY',
          details: { signatureValid: false, hardwareAttestation: 'ABSENT' },
        },
        fingerprintUpdate: {
          ip: '198.51.100.42',
          riskScore: 92,
          threatLevel: 'CRITICAL',
        },
      },
    ],
  },

  DECOY_CANARY_BREACH: {
    id: 'DECOY_CANARY_BREACH',
    title: 'Decoy Canary Breach & Dynamic Payload Poisoning',
    description: 'Adversary accesses planted cryptographic honey-keys, detonating real-time honeypot traps and isolating malicious session.',
    estimatedDurationSec: 18,
    steps: [
      {
        delayMs: 600,
        description: 'Adversary queried undocumented internal endpoint /vault/transit-key/canary-04',
        terminalLog: '[INFO] Ingress probe: GET /api/v1/transit-vault/keys?filter=active_escrow from 203.0.113.88',
        telemetryEvent: {
          category: 'KEY_ACCESS',
          level: 'MEDIUM',
          sourceIp: '203.0.113.88',
          targetResource: '/api/v1/transit-vault/keys',
          action: 'UNAUTHORIZED_KEY_ENUMERATION',
          details: { queryParam: 'filter=active_escrow' },
        },
      },
      {
        delayMs: 2500,
        description: 'Honey-Key HK-9021 touched by unauthorized session token',
        terminalLog: '[CRITICAL] 💥 CRYPTOGRAPHIC HONEY-TRAP DETONATED! Honey-Key ID [HK-9021] accessed. Origin: 203.0.113.88',
        triggerHoneyTrapBanner: true,
        telemetryEvent: {
          category: 'DECOY_TRIGGER',
          level: 'CRITICAL',
          sourceIp: '203.0.113.88',
          targetResource: '/keys/escrow/honey-trap-9021',
          action: 'HONEY_KEY_DETONATED',
          isDecoyHit: true,
          details: {
            honeyKeyId: 'HK-9021',
            syntheticPayloadInjected: true,
            poisonedAccount: 'ACC-DECOY-9921-US',
          },
        },
        fingerprintUpdate: {
          ip: '203.0.113.88',
          riskScore: 99,
          threatLevel: 'CRITICAL',
          decoyHitCount: 1,
          flaggedBehaviors: ['Honey-Token Access', 'Payload Exfiltration Attempt'],
        },
      },
      {
        delayMs: 4500,
        description: 'Synthetic poisoned transaction feed dispatched to adversary session',
        terminalLog: '[INFO] Deception subsystem active: Serving poisoned wire ledger (14 synthetic transactions totaling $4.2M dummy funds)',
        telemetryEvent: {
          category: 'DECOY_TRIGGER',
          level: 'HIGH',
          sourceIp: '203.0.113.88',
          targetResource: '/api/v1/ledger/wire-transit',
          action: 'SYNTHETIC_DECOY_FEED_STREAMING',
          isDecoyHit: true,
          details: { syntheticFundsDispatched: '$4,280,000.00', computeTrappedSec: 142 },
        },
      },
    ],
  },

  ZERO_TRUST_QUARANTINE: {
    id: 'ZERO_TRUST_QUARANTINE',
    title: 'Automated Session Revocation & Adversary Quarantine',
    description: 'Cerberus Zero-Trust engine forcefully terminates attacker session, revokes transport tickets, and freezes upstream API access.',
    estimatedDurationSec: 10,
    steps: [
      {
        delayMs: 500,
        description: 'Evaluating threshold risk score for IP 185.220.101.5',
        terminalLog: '[WARN] Risk threshold breach: Aggregate anomaly index 96/100 for session sess_7f8a92b1',
        telemetryEvent: {
          category: 'NETWORK_ANOMALY',
          level: 'HIGH',
          sourceIp: '185.220.101.5',
          targetResource: '/session/evaluate-risk',
          action: 'RISK_THRESHOLD_EXCEEDED',
          details: { aggregateRisk: 96, activeViolations: 3 },
        },
      },
      {
        delayMs: 2000,
        description: 'Quarantine directive executed: Zero-Trust key tickets invalidated',
        terminalLog: '[CRITICAL] 🔒 ZERO-TRUST QUARANTINE ENFORCED. Session token sess_7f8a92b1 REVOKED. IP 185.220.101.5 blacklisted.',
        telemetryEvent: {
          category: 'QUARANTINE_ENFORCED',
          level: 'CRITICAL',
          sourceIp: '185.220.101.5',
          targetResource: '/api/v1/security/quarantine/release',
          action: 'SESSION_REVOCATION_BROADCAST',
          details: { status: 'REVOKED', revokedKeysCount: 3 },
        },
        fingerprintUpdate: {
          ip: '185.220.101.5',
          quarantineStatus: 'REVOKED',
          riskScore: 100,
          threatLevel: 'CRITICAL',
        },
      },
    ],
  },
};
