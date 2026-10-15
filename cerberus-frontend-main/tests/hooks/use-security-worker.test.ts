import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSecurityWorker } from '@/hooks/use-security-worker';

describe('useSecurityWorker Hook', () => {
  let mockPostMessage: ReturnType<typeof vi.fn>;
  let mockTerminate: ReturnType<typeof vi.fn>;
  let workerInstance: {
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    onmessage: ((ev: MessageEvent) => void) | null;
  };

  beforeEach(() => {
    mockPostMessage = vi.fn();
    mockTerminate = vi.fn();

    workerInstance = {
      postMessage: mockPostMessage,
      terminate: mockTerminate,
      onmessage: null,
    };

    // Mock Worker constructor
    vi.stubGlobal('Worker', class {
      constructor() {
        return workerInstance;
      }
    });
  });

  it('initializes worker and sends START command on mount', () => {
    const { result } = renderHook(() => useSecurityWorker(true, 5000));

    expect(mockPostMessage).toHaveBeenCalledWith({ action: 'START', intervalMs: 5000 });
    expect(result.current.isRunning).toBe(true);
  });

  it('updates state when worker receives verification result', () => {
    const { result } = renderHook(() => useSecurityWorker(true));

    act(() => {
      if (workerInstance.onmessage) {
        workerInstance.onmessage({
          data: {
            type: 'VERIFICATION_RESULT',
            syncId: 'sync-9921',
            canaryId: 'CANARY-TEST',
            timeMs: 0.84,
            canaryTriggered: true,
            verified: false,
            timestamp: '2026-10-14T15:00:00.000Z',
          },
        } as MessageEvent);
      }
    });

    expect(result.current.lastSyncId).toBe('sync-9921');
    expect(result.current.lastCanaryId).toBe('CANARY-TEST');
    expect(result.current.lastDurationMs).toBe(0.84);
    expect(result.current.canaryTriggered).toBe(true);
  });

  it('triggers manual sync via triggerSync', () => {
    const { result } = renderHook(() => useSecurityWorker(true));

    act(() => {
      result.current.triggerSync();
    });

    expect(mockPostMessage).toHaveBeenCalledWith({ action: 'SYNC_NOW' });
  });

  it('terminates worker on unmount', () => {
    const { unmount } = renderHook(() => useSecurityWorker(true));
    unmount();
    expect(mockTerminate).toHaveBeenCalled();
  });
});
