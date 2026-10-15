import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AttestationBadge } from '@/components/auth/AttestationBadge';

const authMocks = vi.hoisted(() => ({
  getSignedInAccount: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/lib/auth/entra', () => authMocks);

import { EntraAccountButton } from '@/components/auth/EntraAccountButton';

describe('Corporate Client Auth Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getSignedInAccount.mockResolvedValue(null);
  });

  it('states that authenticator hardware backing is not attested', () => {
    render(<AttestationBadge isHardwareBound={false} />);
    const badge = screen.getByTestId('attestation-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Authenticator hardware not attested');
  });

  it('renders bound status badge with algorithm when isHardwareBound is true', () => {
    render(<AttestationBadge isHardwareBound={true} algorithm="ECDSA P-256" />);
    const badge = screen.getByTestId('attestation-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Hardware Key: Bound (ECDSA P-256)');
  });

  it('starts only one Entra interaction when the button is clicked rapidly', async () => {
    let resolveSignIn!: () => void;
    authMocks.signIn.mockImplementation(() => new Promise<void>((resolve) => {
      resolveSignIn = () => resolve();
    }));
    render(<EntraAccountButton />);

    const button = await screen.findByRole('button', { name: 'Sign in with Entra' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(authMocks.signIn).toHaveBeenCalledOnce();
    resolveSignIn();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in with Entra' })).toBeEnabled());
  });

  it('explains how to recover from an existing Entra interaction', async () => {
    authMocks.signIn.mockRejectedValue(Object.assign(new Error('Interaction in progress'), {
      errorCode: 'interaction_in_progress',
    }));
    render(<EntraAccountButton />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Entra' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Close any open sign-in window, refresh this page, and try again.',
    );
  });
});
