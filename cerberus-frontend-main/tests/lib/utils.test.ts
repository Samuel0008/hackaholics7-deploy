import { describe, it, expect } from 'vitest';
import { cn, formatBytes, formatTimestamp } from '@/lib/utils';

describe('Utility functions', () => {
  it('cn merges class names properly', () => {
    expect(cn('px-2', 'py-1', { 'text-red-500': true, 'text-blue-500': false })).toBe('px-2 py-1 text-red-500');
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('formatBytes formats file sizes accurately', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
  });

  it('formatTimestamp produces formatted ISO time', () => {
    const timestamp = formatTimestamp('2026-10-14T12:30:45.000Z');
    expect(timestamp).toBe('12:30:45');
  });
});
