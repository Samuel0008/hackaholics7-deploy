'use client';

import React, { useState } from 'react';
import { AlertOctagon, Flame, X, ShieldAlert } from 'lucide-react';
import { TelemetryEvent } from '@/types/telemetry';

export interface HoneyTrapBannerProps {
  latestDecoyHit: TelemetryEvent | null;
  onDismiss?: () => void;
  className?: string;
}

export const HoneyTrapBanner: React.FC<HoneyTrapBannerProps> = ({
  latestDecoyHit,
  onDismiss,
  className = '',
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (!latestDecoyHit || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  const details = latestDecoyHit.details || {};
  const honeyKeyId = (details.honeyKeyId as string) || 'HK-9021';
  const poisonedAccount = (details.poisonedAccount as string) || 'ACC-DECOY-9921-US';

  return (
    <div
      data-testid="honey-trap-banner"
      className={`rounded-xl border border-rose-500/70 bg-gradient-to-r from-rose-950/80 via-red-950/70 to-rose-950/80 p-4 shadow-[0_0_30px_rgba(244,63,94,0.35)] text-rose-100 font-mono transition-all animate-pulse-glow ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 rounded-lg bg-rose-900/60 border border-rose-500/50 text-rose-300 shrink-0">
            <Flame className="w-6 h-6 animate-bounce" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest font-black text-white bg-rose-600 px-2 py-0.5 rounded">
                DECEPTION ALARM
              </span>
              <h3 className="text-sm sm:text-base font-extrabold tracking-wide text-rose-200">
                HONEY-TOKEN ACCESSED → PAYLOAD POISONED → THREAT CONFINED
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-rose-300 mt-1">
              <span>
                Honey-Key ID: <strong className="text-white">{honeyKeyId}</strong>
              </span>
              <span>
                Origin IP: <strong className="text-cyan-300">{latestDecoyHit.sourceIp}</strong>
              </span>
              <span>
                Synthetic Account: <strong className="text-yellow-300">{poisonedAccount}</strong>
              </span>
              <span>
                Strategy:{' '}
                <strong className="text-emerald-300">Poisoned Feed Active (Deception Enclave)</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg border border-rose-500/40 bg-rose-900/40 hover:bg-rose-900/80 text-rose-300 transition-colors"
            title="Acknowledge Alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
