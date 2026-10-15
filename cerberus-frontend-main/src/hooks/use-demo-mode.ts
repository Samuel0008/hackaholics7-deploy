'use client';

import { useState, useEffect, useCallback } from 'react';
import { AttackScenarioId, DemoState } from '@/types/demo';
import { ATTACK_SCENARIOS } from '@/lib/mock/attack-scenarios';
import { mockEngine } from '@/lib/bff/mock-engine';

export interface UseDemoModeReturn extends DemoState {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  triggerScenario: (scenarioId: AttackScenarioId) => Promise<void>;
  resetDemo: () => void;
}

export function useDemoMode(): UseDemoModeReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [demoState, setDemoState] = useState<DemoState>({
    isActive: false,
    activeScenarioId: null,
    currentStepIndex: 0,
    totalSteps: 0,
    honeyTrapDetonated: false,
    playbackSpeed: 1,
  });

  // Global hotkey listener: Ctrl+Shift+D or Cmd+Shift+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const triggerScenario = useCallback(async (scenarioId: AttackScenarioId) => {
    const scenario = ATTACK_SCENARIOS[scenarioId];
    if (!scenario) return;

    setDemoState({
      isActive: true,
      activeScenarioId: scenarioId,
      currentStepIndex: 0,
      totalSteps: scenario.steps.length,
      honeyTrapDetonated: false,
      playbackSpeed: 1,
    });

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      if (step.delayMs > 0) {
        await new Promise((res) => setTimeout(res, step.delayMs));
      }

      // Inject event into mock engine
      if (step.telemetryEvent) {
        mockEngine.addEvent({
          id: `demo-${Date.now()}-${i}`,
          timestamp: new Date().toISOString(),
          category: step.telemetryEvent.category || 'DECOY_TRIGGER',
          level: step.telemetryEvent.level || 'CRITICAL',
          sourceIp: step.telemetryEvent.sourceIp || '203.0.113.88',
          targetResource: step.telemetryEvent.targetResource || '/keys/canary',
          action: step.telemetryEvent.action || step.description,
          details: step.telemetryEvent.details || {},
          isDecoyHit: step.telemetryEvent.isDecoyHit,
        });
      }

      if (step.fingerprintUpdate && step.fingerprintUpdate.ip) {
        mockEngine.updateFingerprint(step.fingerprintUpdate as any);
      }

      setDemoState((prev) => ({
        ...prev,
        currentStepIndex: i + 1,
        honeyTrapDetonated: prev.honeyTrapDetonated || Boolean(step.triggerHoneyTrapBanner),
        lastDetonationTimestamp: step.triggerHoneyTrapBanner ? new Date().toISOString() : prev.lastDetonationTimestamp,
      }));

      // Broadcast custom DOM event for active views
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cerberus:telemetry-update', { detail: step }));
      }
    }

    setDemoState((prev) => ({ ...prev, isActive: false }));
  }, []);

  const resetDemo = useCallback(() => {
    setDemoState({
      isActive: false,
      activeScenarioId: null,
      currentStepIndex: 0,
      totalSteps: 0,
      honeyTrapDetonated: false,
      playbackSpeed: 1,
    });
  }, []);

  return {
    ...demoState,
    isOpen,
    setIsOpen,
    triggerScenario,
    resetDemo,
  };
}
