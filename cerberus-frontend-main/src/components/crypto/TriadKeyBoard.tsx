'use client';

import React from 'react';
import { KeyRound, ShieldCheck, Flame, Cpu, RefreshCw } from 'lucide-react';
import { TriadKeyEntry } from '@/types/crypto';

export interface TriadKeyBoardProps {
  keys: TriadKeyEntry[];
  onRefresh?: () => void;
  className?: string;
}

export const TriadKeyBoard: React.FC<TriadKeyBoardProps> = ({
  keys,
  onRefresh,
  className = '',
}) => {
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'BANK_ESCROW_HSM':
        return <Cpu className="w-5 h-5 text-cyan-400" />;
      case 'CLIENT_HARDWARE_KEY':
        return <ShieldCheck className="w-5 h-5 text-emerald-400" />;
      case 'DECOY_HONEY_KEYS':
        return <Flame className="w-5 h-5 text-rose-400" />;
      default:
        return <KeyRound className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPERATIONAL':
        return 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400';
      case 'ROTATING':
        return 'bg-amber-950/60 border-amber-500/40 text-amber-400 animate-pulse';
      case 'REVOKED':
        return 'bg-rose-950/60 border-rose-500/40 text-rose-400';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  return (
    <div
      data-testid="triad-key-board"
      className={`rounded-xl border border-slate-800 bg-[#050b14]/90 backdrop-blur-md p-6 font-mono text-xs shadow-2xl space-y-6 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-950/50 border border-cyan-500/30 text-cyan-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
              CRYPTOGRAPHIC 3-KEY TRIAD REGISTRY
            </h2>
            <p className="text-[11px] text-slate-400 font-sans">
              Separation of trust: Institutional Escrow, Client Authenticator Enclave, and Rotating Canary Keys
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-300 hover:text-white transition-colors"
            title="Refresh Key Status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {keys.map((k) => (
          <div
            key={k.keyId}
            className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-3 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                {getRoleIcon(k.role)}
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusBadge(
                  k.status
                )}`}
              >
                {k.status}
              </span>
            </div>

            <div>
              <h3 className="font-semibold text-white text-xs tracking-wide">
                {k.title}
              </h3>
              <span className="text-[10px] text-cyan-400 block mt-0.5">
                ID: {k.keyId}
              </span>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-900 text-[10px] text-slate-400">
              <div>
                <span className="text-slate-500">Algorithm: </span>
                <span className="text-slate-200">{k.algorithm}</span>
              </div>
              {k.hardwareModule && (
                <div>
                  <span className="text-slate-500">Module: </span>
                  <span className="text-slate-300">{k.hardwareModule}</span>
                </div>
              )}
              <div className="truncate">
                <span className="text-slate-500">Fingerprint: </span>
                <span className="text-slate-400 font-mono text-[9px]">{k.fingerprint}</span>
              </div>
              <div className="flex items-center justify-between pt-1 text-[10px]">
                <span className="text-slate-500">Operations: {k.accessCount}</span>
                <span className="text-slate-500">
                  Rotated: {new Date(k.lastRotated).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
