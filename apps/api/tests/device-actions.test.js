import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDemoComplianceStatus,
  isDemoDeviceAction,
  isDifferentApprover,
  isPendingDeviceAction,
  isValidActionReason,
} from '../dist/device-actions.js';

test('demo device action requests allow only simulated lock and wipe choices', () => {
  assert.equal(isDemoDeviceAction('lock'), true);
  assert.equal(isDemoDeviceAction('wipe'), true);
  assert.equal(isDemoDeviceAction('flash-firmware'), false);
  assert.equal(isDemoDeviceAction('reset-tpm'), false);
  assert.equal(isDemoDeviceAction('run-command'), false);
});

test('device action approval requires a different administrator and a pending request', () => {
  const action = {
    actionId: 'action-1',
    tenantId: 'tenant-1',
    userId: 'scoped-user-1',
    deviceId: 'device-1',
    action: 'wipe',
    reason: 'Device reported lost by the account owner.',
    requestedBy: 'admin-1',
    requestedAt: '2026-10-15T12:00:00.000Z',
    status: 'pending-approval',
  };

  assert.equal(isPendingDeviceAction(action), true);
  assert.equal(isDifferentApprover(action, 'admin-1'), false);
  assert.equal(isDifferentApprover(action, 'admin-2'), true);
  assert.equal(isPendingDeviceAction({ ...action, status: 'approved-simulation-only' }), false);
});

test('demo compliance accepts only explicit states and requires a useful reason', () => {
  assert.equal(isDemoComplianceStatus('compliant'), true);
  assert.equal(isDemoComplianceStatus('noncompliant'), true);
  assert.equal(isDemoComplianceStatus('unknown'), true);
  assert.equal(isDemoComplianceStatus('verified'), false);

  assert.equal(isValidActionReason('The employee reported that the device is missing.'), true);
  assert.equal(isValidActionReason('lost'), false);
  assert.equal(isValidActionReason('x'.repeat(501)), false);
});
