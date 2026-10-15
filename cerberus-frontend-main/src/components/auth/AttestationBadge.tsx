import React from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AttestationBadgeProps {
  isHardwareBound: boolean;
  algorithm?: string;
  className?: string;
}

export const AttestationBadge: React.FC<AttestationBadgeProps> = ({
  isHardwareBound,
  algorithm = 'ECDSA P-256',
  className,
}) => {
  return (
    <div
      data-testid="attestation-badge"
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium',
        isHardwareBound
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-800',
        className
      )}
    >
      {isHardwareBound ? (
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>
        {isHardwareBound ? `Hardware Key: Bound (${algorithm})` : 'Authenticator hardware not attested'}
      </span>
    </div>
  );
};
