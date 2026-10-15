import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DemoControllerModal } from '@/components/demo/DemoControllerModal';

describe('DemoControllerModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <DemoControllerModal
        isOpen={false}
        onClose={vi.fn()}
        isActive={false}
        activeScenarioId={null}
        currentStepIndex={0}
        totalSteps={0}
        onTriggerScenario={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal with all 3 scenarios when isOpen is true', () => {
    render(
      <DemoControllerModal
        isOpen={true}
        onClose={vi.fn()}
        isActive={false}
        activeScenarioId={null}
        currentStepIndex={0}
        totalSteps={0}
        onTriggerScenario={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByTestId('demo-controller-modal')).toBeInTheDocument();
    expect(screen.getByText(/OFFLINE DEMO & SCENARIO CONTROLLER/i)).toBeInTheDocument();
    expect(screen.getByText(/Distributed Credential Stuffing/i)).toBeInTheDocument();
    expect(screen.getByText(/Decoy Canary Breach/i)).toBeInTheDocument();
    expect(screen.getByText(/Automated Session Revocation/i)).toBeInTheDocument();
  });

  it('triggers onTriggerScenario when Inject button is clicked', () => {
    const onTrigger = vi.fn();
    render(
      <DemoControllerModal
        isOpen={true}
        onClose={vi.fn()}
        isActive={false}
        activeScenarioId={null}
        currentStepIndex={0}
        totalSteps={0}
        onTriggerScenario={onTrigger}
        onReset={vi.fn()}
      />
    );

    const injectButtons = screen.getAllByText('Inject');
    fireEvent.click(injectButtons[0]);
    expect(onTrigger).toHaveBeenCalledWith('CREDENTIAL_STUFFING');
  });
});
