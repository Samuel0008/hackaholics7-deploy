import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BattleBoardLayout } from '@/components/soc/BattleBoardLayout';

describe('BattleBoardLayout Component', () => {
  it('renders overall risk score and active adversaries', () => {
    render(
      <BattleBoardLayout
        events={[]}
        threatReport={{
          overallRiskScore: 94,
          activeAttacksCount: 3,
          decoyHitsLast24h: 5,
          quarantinedSessionsCount: 2,
          radarNodes: [],
          recentEvents: [],
        }}
        fingerprints={[]}
        latestDecoyHit={null}
        isPaused={false}
        onTogglePause={vi.fn()}
        onToggleQuarantine={vi.fn()}
      />
    );

    expect(screen.getByTestId('battle-board-layout')).toBeInTheDocument();
    expect(screen.getByText('94')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
