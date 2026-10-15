'use client';

import React, { useState } from 'react';
import { ShieldCheck, Play, ArrowRight, CheckCircle2, AlertOctagon, FileCheck } from 'lucide-react';
import { AMLComplianceRecord } from '@/types/crypto';

export interface AMLPipelineVisualizerProps {
  records: AMLComplianceRecord[];
  className?: string;
}

export const AMLPipelineVisualizer: React.FC<AMLPipelineVisualizerProps> = ({
  records,
  className = '',
}) => {
  const [activeStep, setActiveStep] = useState<number>(3);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const steps = [
    { title: '1. Ingest Payload', desc: 'Secure payload in encrypted transit memory' },
    { title: '2. In-Memory Decrypt', desc: 'Ephemeral decryption using Escrow HSM + Client Key' },
    { title: '3. AML / OFAC Screen', desc: 'FinCEN CTR check & structuring anomaly detection' },
    { title: '4. Zero-Trust Audit', desc: 'Append-only ledger commit with privacy preservation' },
  ];

  const handleSimulateInspection = () => {
    setIsRunning(true);
    setActiveStep(0);

    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= 3) {
          clearInterval(interval);
          setIsRunning(false);
          return 3;
        }
        return prev + 1;
      });
    }, 800);
  };

  return (
    <div
      data-testid="aml-pipeline-visualizer"
      className={`rounded-xl border border-slate-800 bg-[#050b14]/90 backdrop-blur-md p-6 font-mono text-xs shadow-2xl space-y-6 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
            IN-MEMORY AML COMPLIANCE INSPECTION PIPELINE
          </h2>
          <p className="text-[11px] text-slate-400 font-sans mt-0.5">
            Zero-storage payload inspection: decrypted in ephemeral memory, screened against sanction lists, and audited
          </p>
        </div>

        <button
          onClick={handleSimulateInspection}
          disabled={isRunning}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 font-semibold transition-colors disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{isRunning ? 'Inspecting Transit...' : 'Run In-Memory Trace'}</span>
        </button>
      </div>

      {/* Pipeline Step Progression */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {steps.map((s, idx) => {
          const isDone = activeStep >= idx;
          const isCurrent = activeStep === idx;

          return (
            <div
              key={idx}
              className={`p-3 rounded-lg border transition-all ${
                isCurrent
                  ? 'border-cyan-500 bg-cyan-950/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                  : isDone
                  ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                  : 'border-slate-800 bg-slate-950/50 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-[11px]">{s.title}</span>
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-slate-700" />
                )}
              </div>
              <p className="text-[10px] text-slate-400 font-sans">{s.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Recent AML Compliance Inspection Log */}
      <div className="space-y-3 pt-2">
        <h3 className="text-slate-300 font-semibold text-xs tracking-wider uppercase">
          Ephemeral Inspection Audit Log
        </h3>

        <div className="space-y-2">
          {records.map((rec) => {
            const isFlagged = rec.ofacScreeningResult === 'FLAGGED' || rec.cryptoVerificationStatus === 'CANARY_MISMATCH';

            return (
              <div
                key={rec.transactionId}
                className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isFlagged
                    ? 'border-rose-500/40 bg-rose-950/20'
                    : 'border-slate-800 bg-slate-950/60'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs">{rec.transactionId}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        isFlagged
                          ? 'bg-rose-950/70 border-rose-500/50 text-rose-300'
                          : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-400'
                      }`}
                    >
                      {rec.cryptoVerificationStatus}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Amount: <strong className="text-emerald-400">${rec.amountUsd.toLocaleString()}</strong> • Sender: {rec.senderAccount} • Beneficiary: {rec.beneficiaryAccount}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[10px] text-slate-400">
                  <div>
                    OFAC: <strong className={rec.ofacScreeningResult === 'FLAGGED' ? 'text-rose-400' : 'text-emerald-400'}>{rec.ofacScreeningResult}</strong>
                  </div>
                  <div>
                    Structuring Score: <strong className={rec.structuringRiskScore > 50 ? 'text-rose-400' : 'text-emerald-400'}>{rec.structuringRiskScore}/100</strong>
                  </div>
                  <div className="text-slate-500">
                    Stage: {rec.pipelineStage}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
