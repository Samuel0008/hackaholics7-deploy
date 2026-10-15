import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AttackerTerminal } from '@/components/soc/AttackerTerminal';
import { TelemetryEvent } from '@/types/telemetry';

describe('AttackerTerminal Component', () => {
  const sampleEvents: TelemetryEvent[] = [
    {
      id: 'evt-1',
      timestamp: '2026-10-14T15:10:00.000Z',
      category: 'AUTH_ATTEMPT',
      level: 'HIGH',
      sourceIp: '198.51.100.42',
      targetResource: '/api/v1/auth/login',
      action: 'CREDENTIAL_STUFFING_ATTEMPT',
      details: { rate: '42 req/s' },
    },
    {
      id: 'evt-2',
      timestamp: '2026-10-14T15:10:05.000Z',
      category: 'DECOY_TRIGGER',
      level: 'CRITICAL',
      sourceIp: '203.0.113.88',
      targetResource: '/keys/escrow/honey-trap-9021',
      action: 'HONEY_KEY_DETONATED',
      isDecoyHit: true,
      details: { canaryId: 'HK-9021' },
    },
  ];

  it('renders terminal with events and source IPs', () => {
    render(
      <AttackerTerminal
        events={sampleEvents}
        isPaused={false}
        onTogglePause={vi.fn()}
      />
    );

    expect(screen.getByTestId('attacker-terminal')).toBeInTheDocument();
    expect(screen.getByText('198.51.100.42')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.88')).toBeInTheDocument();
    expect(screen.getByText('HONEY_KEY_DETONATED')).toBeInTheDocument();
    expect(screen.getByText('DECOY BREACH')).toBeInTheDocument();
  });

  it('calls onTogglePause when pause button is clicked', () => {
    const onTogglePause = vi.fn();
    render(
      <AttackerTerminal
        events={sampleEvents}
        isPaused={false}
        onTogglePause={onTogglePause}
      />
    );

    const pauseBtn = screen.getByTitle('Pause Stream');
    fireEvent.click(pauseBtn);
    expect(onTogglePause).toHaveBeenCalledTimes(1);
  });
});
