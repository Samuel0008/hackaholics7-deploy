export type TriadKeyRole = 'BANK_ESCROW_HSM' | 'CLIENT_HARDWARE_KEY' | 'DECOY_HONEY_KEYS';

export type KeyHealthStatus = 'OPERATIONAL' | 'ROTATING' | 'REVOKED' | 'STANDBY';

export interface TriadKeyEntry {
  role: TriadKeyRole;
  title: string;
  keyId: string;
  algorithm: string;
  status: KeyHealthStatus;
  fingerprint: string;
  hardwareModule?: string;
  lastRotated: string;
  accessCount: number;
  quarantined: boolean;
  metadata?: Record<string, string | number>;
}

export interface DecoyTransitPayload {
  syncId: string;
  epoch: number;
  vaultDigest: string;
  canaryId: string;
  encryptedTransitBlock: {
    iv: string; // base64
    ciphertext: string; // base64
    tag: string; // base64
  };
  issuedAt: string;
}

export interface AMLComplianceRecord {
  transactionId: string;
  timestamp: string;
  amountUsd: number;
  senderAccount: string;
  beneficiaryAccount: string;
  ofacScreeningResult: 'PASS' | 'FLAGGED';
  ctrThresholdMet: boolean;
  structuringRiskScore: number; // 0 to 100
  cryptoVerificationStatus: 'DECRYPTED_IN_MEMORY' | 'CANARY_MISMATCH' | 'FAILED';
  pipelineStage: 'INGEST' | 'DECRYPT' | 'SCREEN' | 'AUDIT_LOGGED';
}

export interface SupabaseStorageHealth {
  connected: boolean;
  table: string;
  latencyMs: number;
  schemaVersion: string;
  rowCount: number;
  lastSync: string;
}
