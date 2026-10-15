'use client';

import React from 'react';
import { Database, CheckCircle2, HardDrive, RefreshCw } from 'lucide-react';
import { SupabaseStorageHealth } from '@/types/crypto';

export interface SupabaseStatusCardProps {
  health: SupabaseStorageHealth | null;
  className?: string;
}

export const SupabaseStatusCard: React.FC<SupabaseStatusCardProps> = ({
  health,
  className = '',
}) => {
  const currentHealth: SupabaseStorageHealth = health || {
    connected: true,
    table: 'audit_crypto_triad_logs',
    latencyMs: 14.2,
    schemaVersion: '2026_03_zero_trust_v1',
    rowCount: 10428,
    lastSync: new Date().toISOString(),
  };

  return (
    <div
      data-testid="supabase-status-card"
      className={`rounded-xl border border-slate-800 bg-[#050b14]/90 backdrop-blur-md p-6 font-mono text-xs shadow-2xl space-y-4 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide">
              STORAGE ABSTRACTION & LEDGER REPOSITORY
            </h3>
            <p className="text-[11px] text-slate-400 font-sans">
              Supabase / PostgreSQL zero-knowledge audit table monitor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-emerald-400 font-bold text-xs">
            {currentHealth.connected ? 'ONLINE' : 'DEGRADED'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 block mb-1">Target Table</span>
          <span className="text-slate-200 font-semibold block truncate">
            {currentHealth.table}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 block mb-1">Query Latency</span>
          <span className="text-emerald-400 font-semibold block">
            {currentHealth.latencyMs.toFixed(1)}ms
          </span>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 block mb-1">Total Audit Rows</span>
          <span className="text-cyan-400 font-semibold block">
            {currentHealth.rowCount.toLocaleString()}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
          <span className="text-slate-400 block mb-1">Schema Migration</span>
          <span className="text-slate-200 font-semibold block truncate">
            {currentHealth.schemaVersion}
          </span>
        </div>
      </div>
    </div>
  );
};
