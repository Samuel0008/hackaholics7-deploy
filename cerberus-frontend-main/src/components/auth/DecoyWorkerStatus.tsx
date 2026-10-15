'use client';

import React from 'react';
import { Info } from 'lucide-react';

export const DecoyWorkerStatus: React.FC = () => {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
      <p className="text-sm leading-5 text-slate-600">
        Automated client decoy sync is not available. The API records requests to selected synthetic decoy URLs but does not send hidden payloads to client workers.
      </p>
    </div>
  );
};
