export const DEMO_DEVICE_ACTIONS = ['lock', 'wipe'] as const;
export type DemoDeviceAction = typeof DEMO_DEVICE_ACTIONS[number];

export type DeviceActionStatus =
  | 'pending-approval'
  | 'approved-simulation-only'
  | 'rejected';

export interface DeviceActionRecord {
  actionId: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  action: DemoDeviceAction;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: DeviceActionStatus;
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
}

export function isDemoDeviceAction(value: unknown): value is DemoDeviceAction {
  return typeof value === 'string' &&
    (DEMO_DEVICE_ACTIONS as readonly string[]).includes(value);
}

export function isValidActionReason(value: unknown): value is string {
  return typeof value === 'string' &&
    value.trim().length >= 20 &&
    value.trim().length <= 500;
}

export function isDifferentApprover(
  action: DeviceActionRecord,
  approverId: string,
): boolean {
  return action.requestedBy !== approverId;
}

export function isPendingDeviceAction(action: DeviceActionRecord): boolean {
  return action.status === 'pending-approval';
}

export function isDemoComplianceStatus(
  value: unknown,
): value is 'compliant' | 'noncompliant' | 'unknown' {
  return value === 'compliant' || value === 'noncompliant' || value === 'unknown';
}
