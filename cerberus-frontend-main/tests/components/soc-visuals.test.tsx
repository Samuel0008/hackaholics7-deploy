import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AnomalyRadar } from '@/components/soc/AnomalyRadar';
import { HoneyTrapBanner } from '@/components/soc/HoneyTrapBanner';
import { ThreatReport, TelemetryEvent } from '@/types/telemetry';

describe('SOC Visual Components (Radar & Banner)', () => {
  const sampleThreatReport: ThreatReport = {
    overallRiskScore: 92,
    activeAttacksCount: 2,
    decoyHitsLast24h: 3,
    quarantinedSessionsCount: 1,
    radarNodes: [
      { id: 'node-1', ip: '203.0.113.88', distance: 0.3, angle: 90, riskScore: 98, level: 'CRITICAL', isDecoyHit: true },
    ],
    recentEvents: [],
  };

  const sampleDecoyHit: TelemetryEvent = {
    id: 'evt-decoy-1',
    timestamp: '2026-10-14T15:12:00.000Z',
    category: 'DECOY_TRIGGER',
    level: 'CRITICAL',
    sourceIp: '203.0.113.88',
    targetResource: '/keys/escrow/honey-trap-9021',
    action: 'HONEY_KEY_DETONATED',
    isDecoyHit: true,
    details: {
      honeyKeyId: 'HK-9021',
      poisonedAccount: 'ACC-DECOY-9921-US',
    },
  };

  it('renders AnomalyRadar with radar nodes count', () => {
    render(<AnomalyRadar threatReport={sampleThreatReport} />);
    expect(screen.getByTestId('anomaly-radar')).toBeInTheDocument();
    expect(screen.getByText('TOPOLOGICAL THREAT RADAR')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders HoneyTrapBanner when decoy hit occurs', () => {
    render(<HoneyTrapBanner latestDecoyHit={sampleDecoyHit} />);
    expect(screen.getByTestId('honey-trap-banner')).toBeInTheDocument();
    expect(screen.getByText(/HONEY-TOKEN ACCESSED/i)).toBeInTheDocument();
    expect(screen.getByText('HK-9021')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.88')).toBeInTheDocument();
  });

  it('dismisses HoneyTrapBanner when close button is clicked', () => {
    const onDismiss = vi.fn();
    render(<HoneyTrapBanner latestDecoyHit={sampleDecoyHit} onDismiss={onDismiss} />);
    const dismissBtn = screen.getByTitle('Acknowledge Alert');
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('honey-trap-banner')).not.toBeInTheDocument();
  });
});
