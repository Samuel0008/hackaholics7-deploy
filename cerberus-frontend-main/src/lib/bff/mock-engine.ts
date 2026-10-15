import {
  TelemetryEvent,
  AdversaryFingerprint,
  ThreatReport,
  ThreatLevel,
} from '@/types/telemetry';
import {
  TriadKeyEntry,
  DecoyTransitPayload,
  AMLComplianceRecord,
  SupabaseStorageHealth,
} from '@/types/crypto';
import {
  WebAuthnRegistrationOptions,
  WebAuthnVerificationResponse,
} from '@/types/auth';

class MockEngine {
  private events: TelemetryEvent[] = [
    {
      id: 'evt-101',
      timestamp: new Date(Date.now() - 1000 * 120).toISOString(),
      category: 'AUTH_ATTEMPT',
      level: 'LOW',
      sourceIp: '192.168.1.105',
      targetResource: '/api/v1/auth/fido-verify',
      action: 'PASSKEY_AUTHENTICATION_SUCCESS',
      details: { algorithm: 'ECDSA P-256', deviceType: 'YubiKey 5C NFC' },
    },
    {
      id: 'evt-102',
      timestamp: new Date(Date.now() - 1000 * 90).toISOString(),
      category: 'CRYPTO_VERIFY',
      level: 'LOW',
      sourceIp: '192.168.1.105',
      targetResource: '/api/v1/transit-vault/sync',
      action: 'SILENT_DECOY_TAG_MATCH_VERIFIED',
      details: { durationMs: 0.8, status: 'TAG_CLEAN' },
    },
    {
      id: 'evt-103',
      timestamp: new Date(Date.now() - 1000 * 45).toISOString(),
      category: 'KEY_ACCESS',
      level: 'MEDIUM',
      sourceIp: '198.51.100.42',
      targetResource: '/api/v1/transit-vault/keys',
      action: 'UNAUTHORIZED_KEY_PROBE',
      details: { filter: 'active_escrow', ja3Anomaly: true },
    },
    {
      id: 'evt-104',
      timestamp: new Date(Date.now() - 1000 * 15).toISOString(),
      category: 'DECOY_TRIGGER',
      level: 'CRITICAL',
      sourceIp: '203.0.113.88',
      targetResource: '/keys/escrow/honey-trap-9021',
      action: 'HONEY_KEY_DETONATED',
      isDecoyHit: true,
      details: {
        honeyKeyId: 'HK-9021',
        injectedDecoyTransitId: 'SYNC-HK-9942',
      },
    },
  ];

  private fingerprints: AdversaryFingerprint[] = [
    {
      id: 'adv-01',
      ip: '203.0.113.88',
      asn: 'AS16509 (Amazon AWS EU)',
      country: 'Frankfurt, DE',
      ja3Digest: 'b32309a26ce5161597f185c123f6334d',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Python-urllib/3.11',
      timingDisparityMs: 142.4,
      decoyHitCount: 2,
      riskScore: 98,
      threatLevel: 'CRITICAL',
      quarantineStatus: 'ACTIVE',
      firstSeen: new Date(Date.now() - 1000 * 3600 * 2).toISOString(),
      lastSeen: new Date(Date.now() - 1000 * 15).toISOString(),
      flaggedBehaviors: [
        'Honey-Token Access (HK-9021)',
        'TLS JA3 Spoofing',
        'Direct Transit Vault Scrape',
      ],
    },
    {
      id: 'adv-02',
      ip: '198.51.100.42',
      asn: 'AS14061 (DigitalOcean)',
      country: 'Bucharest, RO',
      ja3Digest: 'e7d705a3286e19ea42f587b344ee6865',
      userAgent: 'Go-http-client/1.1 (Custom Botnet Exfiltrator)',
      timingDisparityMs: 89.1,
      decoyHitCount: 1,
      riskScore: 84,
      threatLevel: 'HIGH',
      quarantineStatus: 'ACTIVE',
      firstSeen: new Date(Date.now() - 1000 * 3600 * 5).toISOString(),
      lastSeen: new Date(Date.now() - 1000 * 45).toISOString(),
      flaggedBehaviors: [
        'High Velocity Credential Stuffing',
        'FIDO2 Challenge Replay Attempt',
      ],
    },
    {
      id: 'adv-03',
      ip: '185.220.101.5',
      asn: 'AS208294 (Tor Exit Node)',
      country: 'Amsterdam, NL',
      ja3Digest: '771,4865-4866-4867,43-51',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0',
      timingDisparityMs: 310.8,
      decoyHitCount: 0,
      riskScore: 68,
      threatLevel: 'MEDIUM',
      quarantineStatus: 'REVOKED',
      firstSeen: new Date(Date.now() - 1000 * 3600 * 12).toISOString(),
      lastSeen: new Date(Date.now() - 1000 * 300).toISOString(),
      flaggedBehaviors: ['Anonymized Tor Routing', 'Port Enumeration'],
    },
  ];

  private triadKeys: TriadKeyEntry[] = [
    {
      role: 'BANK_ESCROW_HSM',
      title: 'Institutional Escrow HSM (Master Vault)',
      keyId: 'HSM-PRIME-01',
      algorithm: 'RSA-4096 / AES-256-GCM',
      status: 'OPERATIONAL',
      fingerprint: 'SHA256:7f9a8b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a',
      hardwareModule: 'Thales Luna PCIe HSM (FIPS 140-3 Level 3)',
      lastRotated: new Date(Date.now() - 1000 * 3600 * 24 * 7).toISOString(),
      accessCount: 18420,
      quarantined: false,
      metadata: { firmware: '7.8.1', slotId: 1 },
    },
    {
      role: 'CLIENT_HARDWARE_KEY',
      title: 'Client WebAuthn Hardware Authenticator',
      keyId: 'FIDO-CLIENT-P256',
      algorithm: 'ECDSA P-256 (FIDO2 / WebAuthn)',
      status: 'OPERATIONAL',
      fingerprint: 'SHA256:4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c',
      hardwareModule: 'Secure Enclave / TPM 2.0 / FIDO2 Authenticator',
      lastRotated: new Date(Date.now() - 1000 * 3600 * 48).toISOString(),
      accessCount: 312,
      quarantined: false,
      metadata: { aaguid: '00000000-0000-0000-0000-000000000000', userVerification: 'required' },
    },
    {
      role: 'DECOY_HONEY_KEYS',
      title: 'Rotated Decoy Canary Keyrings (Deception Trap)',
      keyId: 'HK-POOL-ACTIVE-12',
      algorithm: 'AES-256-GCM (Poisoned Auth Tag)',
      status: 'ROTATING',
      fingerprint: 'SHA256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
      hardwareModule: 'Dynamic Software Canary Generator',
      lastRotated: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      accessCount: 14,
      quarantined: false,
      metadata: { activeTraps: 8, seedEpoch: 4092 },
    },
  ];

  public getWebAuthnRegistrationOptions(username = 'security_officer@cerberus.corp'): WebAuthnRegistrationOptions {
    return {
      challenge: 'dGVzdC1jaGFsbGVuZ2UtY2VyYmVydXMtMjAyNg',
      rp: {
        name: 'Cerberus Zero-Trust Vault',
        id: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
      },
      user: {
        id: 'dXNyXzAxOTA4MWYy',
        name: username,
        displayName: username.split('@')[0].toUpperCase() + ' (Zero-Trust Key)',
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      timeout: 60000,
      attestation: 'direct',
      authenticatorSelection: {
        authenticatorAttachment: 'cross-platform',
        requireResidentKey: false,
        residentKey: 'preferred',
        userVerification: 'required',
      },
    };
  }

  public verifyWebAuthnRegistration(payload?: Record<string, unknown>): WebAuthnVerificationResponse {
    return {
      verified: true,
      credentialId: (payload?.id as string) || 'cred_hardware_bound_p256_mock',
      publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAErX8V...',
      algorithm: 'ECDSA P-256',
      isHardwareBound: true,
      aaguid: 'ea9b8d91-457d-4e2a-9f5b-1188031d279e',
      signCount: 1,
      timestamp: new Date().toISOString(),
    };
  }

  public getDecoyTransitPayload(): DecoyTransitPayload {
    return {
      syncId: `sync-${Math.floor(Date.now() / 1000)}`,
      epoch: Math.floor(Date.now() / 30000),
      vaultDigest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      canaryId: 'CANARY-TRANSIT-V2',
      encryptedTransitBlock: {
        iv: 'YWJjZGVmZ2hpamts', // 12 bytes base64
        ciphertext: 'ZXhhbXBsZSBwb2lzb25lZCBsZWRnZXIgcGF5bG9hZCBpbiB0cmFuc2l0',
        tag: 'd3JvbmdfYXV0aF90YWdf', // Intentionally mismatched tag to exercise <2ms catch
      },
      issuedAt: new Date().toISOString(),
    };
  }

  public getThreatReport(): ThreatReport {
    const activeAttacks = this.fingerprints.filter((f) => f.threatLevel === 'CRITICAL' && f.quarantineStatus === 'ACTIVE');
    return {
      overallRiskScore: 89,
      activeAttacksCount: activeAttacks.length,
      decoyHitsLast24h: this.fingerprints.reduce((acc, curr) => acc + curr.decoyHitCount, 0),
      quarantinedSessionsCount: this.fingerprints.filter((f) => f.quarantineStatus === 'REVOKED').length,
      radarNodes: this.fingerprints.map((f, idx) => ({
        id: f.id,
        ip: f.ip,
        distance: 0.2 + (idx * 0.28),
        angle: 45 + (idx * 115),
        riskScore: f.riskScore,
        level: f.threatLevel,
        isDecoyHit: f.decoyHitCount > 0,
      })),
      recentEvents: [...this.events].reverse(),
    };
  }

  public getTelemetryEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  public getFingerprints(): AdversaryFingerprint[] {
    return [...this.fingerprints];
  }

  public toggleQuarantine(ip: string, action?: 'QUARANTINE' | 'UNQUARANTINE'): AdversaryFingerprint | null {
    const fp = this.fingerprints.find((f) => f.ip === ip);
    if (!fp) return null;

    if (action === 'UNQUARANTINE') {
      fp.quarantineStatus = 'ACTIVE';
    } else if (action === 'QUARANTINE') {
      fp.quarantineStatus = 'REVOKED';
    } else {
      fp.quarantineStatus = fp.quarantineStatus === 'ACTIVE' ? 'REVOKED' : 'ACTIVE';
    }

    // Add event log for audit trail
    this.events.push({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toISOString(),
      category: 'QUARANTINE_ENFORCED',
      level: fp.quarantineStatus === 'REVOKED' ? 'CRITICAL' : 'LOW',
      sourceIp: fp.ip,
      targetResource: '/api/v1/soc/quarantine',
      action: fp.quarantineStatus === 'REVOKED' ? 'SESSION_QUARANTINE_ENFORCED' : 'QUARANTINE_LIFTED',
      details: {
        newStatus: fp.quarantineStatus,
        operator: 'soc_commander_alpha',
      },
    });

    return fp;
  }

  public getTriadStatus(): TriadKeyEntry[] {
    return [...this.triadKeys];
  }

  public getAMLComplianceInspection(): AMLComplianceRecord[] {
    return [
      {
        transactionId: 'TX-AML-9021',
        timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
        amountUsd: 1425000.0,
        senderAccount: 'ACC-PRIME-8821',
        beneficiaryAccount: 'ACC-COMMODITIES-4190',
        ofacScreeningResult: 'PASS',
        ctrThresholdMet: true,
        structuringRiskScore: 12,
        cryptoVerificationStatus: 'DECRYPTED_IN_MEMORY',
        pipelineStage: 'AUDIT_LOGGED',
      },
      {
        transactionId: 'TX-AML-9022',
        timestamp: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
        amountUsd: 5900000.0,
        senderAccount: 'ACC-TRUST-5599',
        beneficiaryAccount: 'ACC-DECOY-0021',
        ofacScreeningResult: 'FLAGGED',
        ctrThresholdMet: true,
        structuringRiskScore: 94,
        cryptoVerificationStatus: 'CANARY_MISMATCH',
        pipelineStage: 'SCREEN',
      },
    ];
  }

  public getSupabaseHealth(): SupabaseStorageHealth {
    return {
      connected: true,
      table: 'audit_crypto_triad_logs',
      latencyMs: 14.2,
      schemaVersion: '2026_03_zero_trust_v1',
      rowCount: 10428,
      lastSync: new Date().toISOString(),
    };
  }

  public addEvent(event: TelemetryEvent) {
    this.events.push(event);
  }

  public updateFingerprint(update: Partial<AdversaryFingerprint> & { ip: string }) {
    const existing = this.fingerprints.find((f) => f.ip === update.ip);
    if (existing) {
      Object.assign(existing, update);
    } else {
      this.fingerprints.push({
        id: `adv-${Date.now()}`,
        ip: update.ip,
        asn: update.asn || 'AS Unknown',
        country: update.country || 'Unknown',
        ja3Digest: update.ja3Digest,
        userAgent: update.userAgent || 'Unknown Agent',
        timingDisparityMs: update.timingDisparityMs || 100,
        decoyHitCount: update.decoyHitCount || 0,
        riskScore: update.riskScore || 80,
        threatLevel: update.threatLevel || 'HIGH',
        quarantineStatus: update.quarantineStatus || 'ACTIVE',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        flaggedBehaviors: update.flaggedBehaviors || ['Automated Probe'],
      });
    }
  }
}

export const mockEngine = new MockEngine();
