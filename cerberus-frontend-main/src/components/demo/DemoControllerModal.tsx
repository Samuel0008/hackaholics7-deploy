'use client';

import React from 'react';
import { X, Play, RotateCcw, ShieldAlert, Sparkles, Terminal, Flame, Lock } from 'lucide-react';
import { AttackScenarioId } from '@/types/demo';
import { ATTACK_SCENARIOS } from '@/lib/mock/attack-scenarios';

export interface DemoControllerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isActive: boolean;
  activeScenarioId: AttackScenarioId | null;
  currentStepIndex: number;
  totalSteps: number;
  onTriggerScenario: (id: AttackScenarioId) => void;
  onReset: () => void;
}

export const DemoControllerModal: React.FC<DemoControllerModalProps> = ({
  isOpen,
  onClose,
  isActive,
  activeScenarioId,
  currentStepIndex,
  totalSteps,
  onTriggerScenario,
  onReset,
}) => {
  if (!isOpen) return null;

  const scenarios = Object.values(ATTACK_SCENARIOS);

  const getScenarioIcon = (id: string) => {
    switch (id) {
      case 'CREDENTIAL_STUFFING':
        return <Terminal className="w-5 h-5 text-cyan-400" />;
      case 'DECOY_CANARY_BREACH':
        return <Flame className="w-5 h-5 text-rose-400" />;
      case 'ZERO_TRUST_QUARANTINE':
        return <Lock className="w-5 h-5 text-amber-400" />;
      default:
        return <ShieldAlert className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div
      data-testid="demo-controller-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-cyan-500/40 bg-[#050b14] shadow-[0_0_50px_rgba(6,182,212,0.25)] overflow-hidden font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                <span>OFFLINE DEMO & SCENARIO CONTROLLER</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300">
                  Ctrl+Shift+D
                </span>
              </h2>
              <p className="text-slate-400 text-[11px] font-sans">
                Inject deterministic red-team sequences to demonstrate Cerberus deception capabilities
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

        {/* Progress Bar (if active) */}
        {isActive && (
          <div className="px-6 py-2 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
            <span className="text-cyan-400 font-bold">
              EXECUTING SCENARIO: {activeScenarioId} (Step {currentStepIndex}/{totalSteps})
            </span>
            <div className="w-32 h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-300"
                style={{ width: `${(currentStepIndex / Math.max(1, totalSteps)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Scenarios List */}
        <div className="p-6 space-y-4">
          <div className="space-y-3">
            {scenarios.map((sc) => {
              const isCurrent = activeScenarioId === sc.id && isActive;

              return (
                <div
                  key={sc.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isCurrent
                      ? 'border-cyan-500 bg-cyan-950/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 shrink-0 mt-0.5">
                        {getScenarioIcon(sc.id)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-xs tracking-wide">
                          {sc.title}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                          {sc.description}
                        </p>
                        <div className="text-[10px] text-slate-500 mt-1">
                          Steps: {sc.steps.length} • Est. Duration: ~{sc.estimatedDurationSec}s
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onTriggerScenario(sc.id as AttackScenarioId)}
                      disabled={isActive}
                      className="px-3.5 py-2 rounded-lg border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 font-semibold text-xs tracking-wider uppercase transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{isCurrent ? 'Playing...' : 'Inject'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">Esc</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">Ctrl+Shift+D</kbd> to close
          </span>

          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Demo State</span>
          </button>
        </div>
      </div>
    </div>
  );
};
