import { describe, it, expect } from 'vitest';
import { mockEngine } from '@/lib/bff/mock-engine';
import { computeSha256Digest, verifyDecoyPayloadTag } from '@/lib/crypto/webcrypto';
import { ATTACK_SCENARIOS } from '@/lib/mock/attack-scenarios';
import { SYNTHETIC_WIRE_FEED } from '@/lib/mock/synthetic-feed';

describe('MockEngine and Crypto Helpers', () => {
  it('provides valid WebAuthn registration options', () => {
    const opts = mockEngine.getWebAuthnRegistrationOptions('test_user@cerberus.corp');
    expect(opts.challenge).toBeDefined();
    expect(opts.rp.name).toContain('Cerberus');
    expect(opts.user.name).toBe('test_user@cerberus.corp');
  });

  it('verifies WebAuthn payload with hardware-bound ECDSA P-256 metadata', () => {
    const res = mockEngine.verifyWebAuthnRegistration({ id: 'cred_123' });
    expect(res.verified).toBe(true);
    expect(res.isHardwareBound).toBe(true);
    expect(res.algorithm).toBe('ECDSA P-256');
  });

  it('generates decoy transit payload with AES-GCM block', () => {
    const payload = mockEngine.getDecoyTransitPayload();
    expect(payload.syncId).toContain('sync-');
    expect(payload.encryptedTransitBlock.iv).toBeDefined();
    expect(payload.encryptedTransitBlock.tag).toBeDefined();
  });

  it('returns structured threat report and radar nodes', () => {
    const report = mockEngine.getThreatReport();
    expect(report.overallRiskScore).toBeGreaterThan(0);
    expect(report.radarNodes.length).toBeGreaterThan(0);
    expect(report.radarNodes[0].angle).toBeDefined();
    expect(report.recentEvents.length).toBeGreaterThan(0);
  });

  it('toggles quarantine status for an adversary IP', () => {
    const fp = mockEngine.toggleQuarantine('203.0.113.88');
    expect(fp).not.toBeNull();
    expect(fp?.quarantineStatus).toBe('REVOKED');

    // Toggle back
    const restored = mockEngine.toggleQuarantine('203.0.113.88');
    expect(restored?.quarantineStatus).toBe('ACTIVE');
  });

  it('returns 3-key triad entries with active health statuses', () => {
    const triad = mockEngine.getTriadStatus();
    expect(triad.length).toBe(3);
    const roles = triad.map((k) => k.role);
    expect(roles).toContain('BANK_ESCROW_HSM');
    expect(roles).toContain('CLIENT_HARDWARE_KEY');
    expect(roles).toContain('DECOY_HONEY_KEYS');
  });

  it('computes sha-256 digests', async () => {
    const digest = await computeSha256Digest('test-data');
    expect(digest.length).toBeGreaterThanOrEqual(16);
  });

  it('detects mismatched decoy payload tags without crashing', async () => {
    const dummyKey = new Uint8Array(32).buffer;
    const res = await verifyDecoyPayloadTag(
      dummyKey,
      'YWJjZGVmZ2hpamts',
      'ZXhhbXBsZSBwb2lzb25lZCBsZWRnZXIgcGF5bG9hZCBpbiB0cmFuc2l0',
      'd3JvbmdfYXV0aF90YWdf'
    );
    // Because auth tag is intentionally wrong, canaryTriggered must be true
    expect(res.verified).toBe(false);
    expect(res.canaryTriggered).toBe(true);
    expect(res.timeMs).toBeGreaterThanOrEqual(0);
  });

  it('contains pre-recorded attack scenarios and synthetic wire records', () => {
    expect(ATTACK_SCENARIOS.CREDENTIAL_STUFFING).toBeDefined();
    expect(ATTACK_SCENARIOS.DECOY_CANARY_BREACH).toBeDefined();
    expect(ATTACK_SCENARIOS.ZERO_TRUST_QUARANTINE).toBeDefined();
    expect(SYNTHETIC_WIRE_FEED.length).toBeGreaterThanOrEqual(4);
  });
});
