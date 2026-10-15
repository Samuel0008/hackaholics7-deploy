'use client';

import React from 'react';
import { Shield, AlertTriangle, Flame, ShieldAlert, Activity } from 'lucide-react';
import { TelemetryEvent, ThreatReport, AdversaryFingerprint } from '@/types/telemetry';
import { AttackerTerminal } from './AttackerTerminal';
import { AnomalyRadar } from './AnomalyRadar';
import { HoneyTrapBanner } from './HoneyTrapBanner';
import { FingerprintTable } from './FingerprintTable';

export interface BattleBoardLayoutProps {
  events: TelemetryEvent[];
  threatReport: ThreatReport | null;
  fingerprints: AdversaryFingerprint[];
  latestDecoyHit: TelemetryEvent | null;
  isPaused: boolean;
  onTogglePause: () => void;
  onToggleQuarantine: (ip: string, action?: 'QUARANTINE' | 'UNQUARANTINE') => Promise<boolean>;
}

export const BattleBoardLayout: React.FC<BattleBoardLayoutProps> = ({
  events,
  threatReport,
  fingerprints,
  latestDecoyHit,
  isPaused,
  onTogglePause,
  onToggleQuarantine,
}) => {
  const overallScore = threatReport?.overallRiskScore ?? 89;
  const activeAttacks = threatReport?.activeAttacksCount ?? 2;
  const decoyHits = threatReport?.decoyHitsLast24h ?? 3;
  const quarantinedCount = threatReport?.quarantinedSessionsCount ?? 1;

  return (
    <div data-testid="battle-board-layout" className="space-y-6">
      {/* Pinned Honey-Trap Detonation Alert Banner */}
      <HoneyTrapBanner latestDecoyHit={latestDecoyHit} />

      {/* Top Security Posture Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
        <div className="p-4 rounded-xl border border-slate-800 bg-[#050b14]/80 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span>OVERALL RISK INDEX</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-400">
            {overallScore}<span className="text-xs text-slate-500">/100</span>
          </div>
          <div className="text-[10px] text-rose-400/80 mt-1">ELEVATED DECEPTION THREAT</div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-[#050b14]/80 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span>ACTIVE ADVERSARIES</span>
            <Activity className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-400">
            {activeAttacks}
          </div>
          <div className="text-[10px] text-amber-400/80 mt-1">SESSIONS CURRENTLY TRACKED</div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-[#050b14]/80 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span>DECOY HITS (24H)</span>
            <Flame className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400">
            {decoyHits}
          </div>
          <div className="text-[10px] text-emerald-400 mt-1">100% POISONED PAYLOADS SERVED</div>
        </div>

        <div className="p-4 rounded-xl border border-slate-800 bg-[#050b14]/80 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span>QUARANTINED SESSIONS</span>
            <Shield className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-black text-cyan-400">
            {quarantinedCount}
          </div>
          <div className="text-[10px] text-cyan-400/80 mt-1">ZERO-TRUST TRANSPORT ENFORCED</div>
        </div>
      </div>

      {/* Split-Screen Battle Board (Panel A: Terminal, Panel B: Radar) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7">
          <AttackerTerminal
            events={events}
            isPaused={isPaused}
            onTogglePause={onTogglePause}
            className="h-full"
          />
        </div>

        <div className="lg:col-span-5">
          <AnomalyRadar threatReport={threatReport} className="h-full" />
        </div>
      </div>

      {/* Adversary Fingerprint Matrix */}
      <div>
        <FingerprintTable
          fingerprints={fingerprints}
          onToggleQuarantine={onToggleQuarantine}
        />
      </div>
    </div>
  );
};
