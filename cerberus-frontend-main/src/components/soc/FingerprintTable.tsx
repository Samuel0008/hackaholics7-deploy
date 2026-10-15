'use client';

import React, { useState } from 'react';
import { Shield, ShieldAlert, Eye, UserX, UserCheck, AlertTriangle } from 'lucide-react';
import { AdversaryFingerprint } from '@/types/telemetry';
import { HoneyFeedModal } from './HoneyFeedModal';

export interface FingerprintTableProps {
  fingerprints: AdversaryFingerprint[];
  onToggleQuarantine: (ip: string, action?: 'QUARANTINE' | 'UNQUARANTINE') => Promise<boolean>;
  className?: string;
}

export const FingerprintTable: React.FC<FingerprintTableProps> = ({
  fingerprints,
  onToggleQuarantine,
  className = '',
}) => {
  const [selectedAdversary, setSelectedAdversary] = useState<AdversaryFingerprint | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingIp, setLoadingIp] = useState<string | null>(null);

  const handleInspect = (adv: AdversaryFingerprint) => {
    setSelectedAdversary(adv);
    setIsModalOpen(true);
  };

  const handleQuarantineClick = async (ip: string, currentStatus: string) => {
    setLoadingIp(ip);
    const action = currentStatus === 'ACTIVE' ? 'QUARANTINE' : 'UNQUARANTINE';
    await onToggleQuarantine(ip, action);
    setLoadingIp(null);
  };

  return (
    <div
      data-testid="fingerprint-table"
      className={`rounded-xl border border-slate-800 bg-[#050b14]/90 backdrop-blur-md overflow-hidden font-mono text-xs shadow-2xl ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-400">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide">
              ADVERSARY FINGERPRINT MATRIX & ZERO-TRUST QUARANTINE
            </h3>
            <p className="text-[11px] text-slate-400">
              Active sessions evaluated against hardware attestation & decoy honey-tokens
            </p>
          </div>
        </div>

        <div className="text-[11px] text-slate-400">
          IDENTIFIED ADVERSARIES: <strong className="text-cyan-400">{fingerprints.length}</strong>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-950/50 text-[11px] uppercase tracking-wider text-slate-400">
              <th className="py-3 px-4">Origin & ASN</th>
              <th className="py-3 px-4">Client Fingerprint / JA3</th>
              <th className="py-3 px-4">Timing Disparity</th>
              <th className="py-3 px-4">Decoy Hits</th>
              <th className="py-3 px-4">Risk Index</th>
              <th className="py-3 px-4">Quarantine Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {fingerprints.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                  No active adversary fingerprints captured.
                </td>
              </tr>
            ) : (
              fingerprints.map((adv) => {
                const isRevoked = adv.quarantineStatus === 'REVOKED';
                const isLoading = loadingIp === adv.ip;

                return (
                  <tr
                    key={adv.id}
                    className="hover:bg-slate-900/40 transition-colors"
                  >
                    {/* IP & Location */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-white text-xs">{adv.ip}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                        {adv.asn}
                      </div>
                      <div className="text-[10px] text-slate-500">{adv.country}</div>
                    </td>

                    {/* JA3 & User-Agent */}
                    <td className="py-3.5 px-4">
                      <div className="text-cyan-400 truncate max-w-[160px] text-[11px]">
                        {adv.ja3Digest || 'Standard TLS Handshake'}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[160px]">
                        {adv.userAgent}
                      </div>
                    </td>

                    {/* Timing */}
                    <td className="py-3.5 px-4 font-mono">
                      <span className="text-amber-400 font-semibold">
                        +{adv.timingDisparityMs.toFixed(1)}ms
                      </span>
                    </td>

                    {/* Decoy Hits */}
                    <td className="py-3.5 px-4">
                      {adv.decoyHitCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 font-bold">
                          💥 {adv.decoyHitCount} HITS
                        </span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>

                    {/* Risk Index */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full ${
                              adv.riskScore > 85
                                ? 'bg-rose-500'
                                : adv.riskScore > 60
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${adv.riskScore}%` }}
                          />
                        </div>
                        <span
                          className={`font-bold ${
                            adv.riskScore > 85
                              ? 'text-rose-400'
                              : adv.riskScore > 60
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {adv.riskScore}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          isRevoked
                            ? 'bg-rose-950/50 border-rose-500/40 text-rose-400'
                            : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-400'
                        }`}
                      >
                        {isRevoked ? (
                          <>
                            <UserX className="w-3 h-3" />
                            REVOKED
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3 h-3" />
                            ACTIVE
                          </>
                        )}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handleInspect(adv)}
                          className="p-1.5 rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          title="Inspect Poisoned Honey-Feed"
                        >
                          <Eye className="w-3.5 h-3.5 text-cyan-400" />
                        </button>

                        <button
                          onClick={() => handleQuarantineClick(adv.ip, adv.quarantineStatus)}
                          disabled={isLoading}
                          className={`px-2.5 py-1.5 rounded border text-[11px] font-semibold transition-colors ${
                            isRevoked
                              ? 'border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300'
                              : 'border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300'
                          }`}
                        >
                          {isLoading
                            ? '...'
                            : isRevoked
                            ? 'LIFT BAN'
                            : 'QUARANTINE'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Inspector Modal */}
      <HoneyFeedModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        adversary={selectedAdversary}
      />
    </div>
  );
};
