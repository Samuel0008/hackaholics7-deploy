'use client';

import React from 'react';
import { X, ShieldAlert, Cpu, DollarSign, ArrowRight } from 'lucide-react';
import { AdversaryFingerprint } from '@/types/telemetry';
import { SYNTHETIC_WIRE_FEED, SyntheticWireTransaction } from '@/lib/mock/synthetic-feed';

export interface HoneyFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  adversary: AdversaryFingerprint | null;
}

export const HoneyFeedModal: React.FC<HoneyFeedModalProps> = ({
  isOpen,
  onClose,
  adversary,
}) => {
  if (!isOpen || !adversary) return null;

  return (
    <div
      data-testid="honey-feed-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-3xl rounded-xl border border-rose-500/50 bg-[#050b14] shadow-[0_0_50px_rgba(244,63,94,0.3)] overflow-hidden font-mono text-xs">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-950/80 border border-rose-500/50 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                <span>ATTACKER HONEY-FEED INSPECTOR</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-600/30 border border-rose-500/40 text-rose-300">
                  DECEPTION SUBSYSTEM
                </span>
              </h2>
              <p className="text-slate-400 text-[11px]">
                Target: <strong className="text-cyan-400">{adversary.ip}</strong> ({adversary.asn})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Sub-Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-6 bg-slate-950/40 border-b border-slate-800">
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/60">
            <span className="text-slate-400 block mb-1">Compute Trapped</span>
            <div className="flex items-center gap-1.5 text-rose-400 font-bold text-sm">
              <Cpu className="w-4 h-4" />
              <span>184.2 CPU Sec</span>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/60">
            <span className="text-slate-400 block mb-1">Poisoned Funds Served</span>
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-sm">
              <DollarSign className="w-4 h-4" />
              <span>$10,180,000.00</span>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/60">
            <span className="text-slate-400 block mb-1">Real Ledger Exposure</span>
            <div className="text-cyan-400 font-bold text-sm">
              0 Bytes (100% Isolated)
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="p-6 space-y-3">
          <h3 className="text-slate-300 font-semibold text-xs tracking-wider uppercase">
            Synthetic Poisoned Wire Ledger Feed
          </h3>

          <div className="max-h-64 overflow-y-auto space-y-2 border border-slate-800 rounded-lg p-2 bg-slate-950/60 scrollbar-thin">
            {SYNTHETIC_WIRE_FEED.map((tx: SyntheticWireTransaction) => (
              <div
                key={tx.id}
                className="p-3 rounded border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/80 transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-cyan-400 font-bold">{tx.referenceNumber}</span>
                  <span className="text-emerald-400 font-bold">
                    ${tx.amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} {tx.currency}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-300">
                  <span className="truncate max-w-[200px] text-slate-400">{tx.senderName}</span>
                  <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                  <span className="truncate max-w-[200px] text-amber-300">{tx.beneficiaryName}</span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>Routing: {tx.senderRouting}</span>
                  <span className="text-rose-400 font-bold">DECOY CANARY TRAP</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
