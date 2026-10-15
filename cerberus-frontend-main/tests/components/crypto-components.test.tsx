import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TriadKeyBoard } from '@/components/crypto/TriadKeyBoard';
import { SupabaseStatusCard } from '@/components/crypto/SupabaseStatusCard';
import { TriadKeyEntry } from '@/types/crypto';

describe('Crypto Registry Components', () => {
  const sampleKeys: TriadKeyEntry[] = [
    {
      role: 'BANK_ESCROW_HSM',
      title: 'Institutional Escrow HSM (Master Vault)',
      keyId: 'HSM-PRIME-01',
      algorithm: 'RSA-4096 / AES-256-GCM',
      status: 'OPERATIONAL',
      fingerprint: 'SHA256:7f9a...8f9a',
      hardwareModule: 'Thales Luna PCIe HSM',
      lastRotated: '2026-10-14T00:00:00.000Z',
      accessCount: 18420,
      quarantined: false,
    },
  ];

  it('renders TriadKeyBoard with key title and algorithm', () => {
    render(<TriadKeyBoard keys={sampleKeys} onRefresh={vi.fn()} />);
    expect(screen.getByTestId('triad-key-board')).toBeInTheDocument();
    expect(screen.getByText('Institutional Escrow HSM (Master Vault)')).toBeInTheDocument();
    expect(screen.getByText('RSA-4096 / AES-256-GCM')).toBeInTheDocument();
    expect(screen.getByText('OPERATIONAL')).toBeInTheDocument();
  });

  it('renders SupabaseStatusCard with online status and latency', () => {
    render(
      <SupabaseStatusCard
        health={{
          connected: true,
          table: 'audit_crypto_triad_logs',
          latencyMs: 12.5,
          schemaVersion: '2026_03_zero_trust_v1',
          rowCount: 5000,
          lastSync: '2026-10-14T15:00:00.000Z',
        }}
      />
    );

    expect(screen.getByTestId('supabase-status-card')).toBeInTheDocument();
    expect(screen.getByText('ONLINE')).toBeInTheDocument();
    expect(screen.getByText('12.5ms')).toBeInTheDocument();
    expect(screen.getByText('audit_crypto_triad_logs')).toBeInTheDocument();
  });
});
