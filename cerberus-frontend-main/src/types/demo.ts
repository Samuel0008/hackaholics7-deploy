import { TelemetryEvent, AdversaryFingerprint } from './telemetry';

export type AttackScenarioId =
  | 'CREDENTIAL_STUFFING'
  | 'DECOY_CANARY_BREACH'
  | 'ZERO_TRUST_QUARANTINE';

export interface AttackScenario {
  id: AttackScenarioId;
  title: string;
  description: string;
  estimatedDurationSec: number;
  steps: Array<{
    delayMs: number;
    description: string;
    terminalLog: string;
    telemetryEvent?: Partial<TelemetryEvent>;
    fingerprintUpdate?: Partial<AdversaryFingerprint>;
    triggerHoneyTrapBanner?: boolean;
  }>;
}

export interface DemoState {
  isActive: boolean;
  activeScenarioId: AttackScenarioId | null;
  currentStepIndex: number;
  totalSteps: number;
  honeyTrapDetonated: boolean;
  lastDetonationTimestamp?: string;
  playbackSpeed: number; // 1x, 2x, etc.
}
