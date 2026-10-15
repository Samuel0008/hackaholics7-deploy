import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { FingerprintTable } from '@/components/soc/FingerprintTable';
import { AdversaryFingerprint } from '@/types/telemetry';

describe('FingerprintTable Component', () => {
  const sampleFingerprints: AdversaryFingerprint[] = [
    {
      id: 'adv-1',
      ip: '203.0.113.88',
      asn: 'AS16509 (AWS)',
      country: 'Frankfurt, DE',
      userAgent: 'Python-urllib/3.11',
      timingDisparityMs: 142.4,
      decoyHitCount: 2,
      riskScore: 98,
      threatLevel: 'CRITICAL',
      quarantineStatus: 'ACTIVE',
      firstSeen: '2026-10-14T14:00:00.000Z',
      lastSeen: '2026-10-14T15:00:00.000Z',
      flaggedBehaviors: ['Honey-Token Access'],
    },
  ];

  it('renders adversary IP, ASN, and risk score', () => {
    render(
      <FingerprintTable
        fingerprints={sampleFingerprints}
        onToggleQuarantine={vi.fn()}
      />
    );

    expect(screen.getByTestId('fingerprint-table')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.88')).toBeInTheDocument();
    expect(screen.getByText('AS16509 (AWS)')).toBeInTheDocument();
    expect(screen.getByText('98')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('triggers onToggleQuarantine when QUARANTINE button is clicked', async () => {
    const onToggle = vi.fn().mockResolvedValue(true);
    render(
      <FingerprintTable
        fingerprints={sampleFingerprints}
        onToggleQuarantine={onToggle}
      />
    );

    const quarantineBtn = screen.getByText('QUARANTINE');
    fireEvent.click(quarantineBtn);

    expect(onToggle).toHaveBeenCalledWith('203.0.113.88', 'QUARANTINE');
  });

  it('opens HoneyFeedModal when inspect button is clicked', () => {
    render(
      <FingerprintTable
        fingerprints={sampleFingerprints}
        onToggleQuarantine={vi.fn()}
      />
    );

    const inspectBtn = screen.getByTitle('Inspect Poisoned Honey-Feed');
    fireEvent.click(inspectBtn);

    expect(screen.getByTestId('honey-feed-modal')).toBeInTheDocument();
    expect(screen.getByText('ATTACKER HONEY-FEED INSPECTOR')).toBeInTheDocument();
  });
});
