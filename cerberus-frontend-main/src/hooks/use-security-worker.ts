'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface SecurityWorkerState {
  isRunning: boolean;
  lastSyncId: string | null;
  lastCanaryId: string | null;
  lastDurationMs: number | null;
  canaryTriggered: boolean;
  lastHeartbeat: string | null;
  error: string | null;
}

export interface UseSecurityWorkerReturn extends SecurityWorkerState {
  triggerSync: () => void;
  startWorker: () => void;
  stopWorker: () => void;
}

export function useSecurityWorker(autoStart = true, pollIntervalMs = 8000): UseSecurityWorkerReturn {
  const [state, setState] = useState<SecurityWorkerState>({
    isRunning: false,
    lastSyncId: null,
    lastCanaryId: null,
    lastDurationMs: null,
    canaryTriggered: false,
    lastHeartbeat: null,
    error: null,
  });

  const workerRef = useRef<Worker | null>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    const data = event.data;
    if (!data) return;

    if (data.type === 'STATUS') {
      setState((prev) => ({
        ...prev,
        isRunning: Boolean(data.running),
        lastHeartbeat: new Date().toISOString(),
      }));
    } else if (data.type === 'VERIFICATION_RESULT') {
      setState((prev) => ({
        ...prev,
        lastSyncId: data.syncId,
        lastCanaryId: data.canaryId,
        lastDurationMs: data.timeMs,
        canaryTriggered: Boolean(data.canaryTriggered),
        lastHeartbeat: data.timestamp || new Date().toISOString(),
        error: null,
      }));
    } else if (data.type === 'ERROR') {
      setState((prev) => ({
        ...prev,
        error: data.error || 'Worker error',
        lastHeartbeat: data.timestamp || new Date().toISOString(),
      }));
    }
  }, []);

  const startWorker = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (!workerRef.current && typeof Worker !== 'undefined') {
      try {
        const worker = new Worker('/workers/securityWorker.js');
        worker.onmessage = handleMessage;
        workerRef.current = worker;
        worker.postMessage({ action: 'START', intervalMs: pollIntervalMs });
        setState((prev) => ({ ...prev, isRunning: true }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to instantiate Worker',
        }));
      }
    } else if (workerRef.current) {
      workerRef.current.postMessage({ action: 'START', intervalMs: pollIntervalMs });
      setState((prev) => ({ ...prev, isRunning: true }));
    }
  }, [handleMessage, pollIntervalMs]);

  const stopWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ action: 'STOP' });
      setState((prev) => ({ ...prev, isRunning: false }));
    }
  }, []);

  const triggerSync = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ action: 'SYNC_NOW' });
    }
  }, []);

  useEffect(() => {
    if (autoStart) {
      startWorker();
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [autoStart, startWorker]);

  return {
    ...state,
    triggerSync,
    startWorker,
    stopWorker,
  };
}
