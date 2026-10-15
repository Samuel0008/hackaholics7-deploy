'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TelemetryEvent, ThreatReport, AdversaryFingerprint } from '@/types/telemetry';

export interface UseTelemetryStreamReturn {
  events: TelemetryEvent[];
  threatReport: ThreatReport | null;
  fingerprints: AdversaryFingerprint[];
  isLoading: boolean;
  isPaused: boolean;
  latestDecoyHit: TelemetryEvent | null;
  togglePause: () => void;
  refresh: () => Promise<void>;
  quarantineIp: (ip: string, action?: 'QUARANTINE' | 'UNQUARANTINE') => Promise<boolean>;
  injectEvent: (event: TelemetryEvent) => void;
}

export function useTelemetryStream(pollIntervalMs = 2500): UseTelemetryStreamReturn {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [threatReport, setThreatReport] = useState<ThreatReport | null>(null);
  const [fingerprints, setFingerprints] = useState<AdversaryFingerprint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [latestDecoyHit, setLatestDecoyHit] = useState<TelemetryEvent | null>(null);

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const fetchStreamData = useCallback(async () => {
    if (isPausedRef.current) return;

    try {
      const res = await fetch('/api/bff/soc/telemetry-stream');
      if (!res.ok) return;

      const data = await res.json();

      if (data.events && Array.isArray(data.events)) {
        setEvents(data.events);

        // Find any new decoy hits
        const decoy = data.events.find((e: TelemetryEvent) => e.isDecoyHit);
        if (decoy) {
          setLatestDecoyHit(decoy);
        }
      }

      if (data.threatReport) {
        setThreatReport(data.threatReport);
      }

      if (data.fingerprints && Array.isArray(data.fingerprints)) {
        setFingerprints(data.fingerprints);
      }
    } catch {
      // Upstream degradation handled gracefully
    } finally {
      setIsLoading(false);
    }
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const quarantineIp = useCallback(
    async (ip: string, action?: 'QUARANTINE' | 'UNQUARANTINE'): Promise<boolean> => {
      try {
        const res = await fetch('/api/bff/soc/quarantine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, action }),
        });

        if (!res.ok) return false;

        const data = await res.json();
        const updatedStatus = data.quarantineStatus || (action === 'UNQUARANTINE' ? 'ACTIVE' : 'REVOKED');

        setFingerprints((prev) =>
          prev.map((fp) =>
            fp.ip === ip ? { ...fp, quarantineStatus: updatedStatus } : fp
          )
        );

        // Immediately refresh stream to sync event logs
        await fetchStreamData();
        return true;
      } catch {
        return false;
      }
    },
    [fetchStreamData]
  );

  const injectEvent = useCallback((event: TelemetryEvent) => {
    setEvents((prev) => [event, ...prev]);
    if (event.isDecoyHit) {
      setLatestDecoyHit(event);
    }
  }, []);

  useEffect(() => {
    fetchStreamData();
    const interval = setInterval(fetchStreamData, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchStreamData, pollIntervalMs]);

  return {
    events,
    threatReport,
    fingerprints,
    isLoading,
    isPaused,
    latestDecoyHit,
    togglePause,
    refresh: fetchStreamData,
    quarantineIp,
    injectEvent,
  };
}
