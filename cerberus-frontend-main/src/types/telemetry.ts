export type ThreatLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EventCategory =
  | 'AUTH_ATTEMPT'
  | 'DECOY_TRIGGER'
  | 'CRYPTO_VERIFY'
  | 'KEY_ACCESS'
  | 'NETWORK_ANOMALY'
  | 'QUARANTINE_ENFORCED';

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  category: EventCategory;
  level: ThreatLevel;
  sourceIp: string;
  targetResource: string;
  action: string;
  details: Record<string, unknown>;
  isDecoyHit?: boolean;
}

export interface AdversaryFingerprint {
  id: string;
  ip: string;
  asn: string;
  country: string;
  ja3Digest?: string;
  userAgent: string;
  timingDisparityMs: number;
  decoyHitCount: number;
  riskScore: number; // 0 to 100
  threatLevel: ThreatLevel;
  quarantineStatus: 'ACTIVE' | 'REVOKED';
  firstSeen: string;
  lastSeen: string;
  flaggedBehaviors: string[];
}

export interface ThreatReport {
  overallRiskScore: number;
  activeAttacksCount: number;
  decoyHitsLast24h: number;
  quarantinedSessionsCount: number;
  radarNodes: Array<{
    id: string;
    ip: string;
    distance: number; // 0.0 to 1.0 (0=near core, 1=perimeter)
    angle: number; // 0 to 360
    riskScore: number;
    level: ThreatLevel;
    isDecoyHit: boolean;
  }>;
  recentEvents: TelemetryEvent[];
}
