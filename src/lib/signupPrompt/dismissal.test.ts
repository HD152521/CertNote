import { describe, expect, it } from 'vitest';
import { DISMISS_KEY, SNOOZE_DAYS, isDismissed, recordDismissal } from './dismissal';

function memory(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}
const DAY = 86_400_000;

describe('signup prompt dismissal', () => {
  it('is not dismissed by default', () => {
    expect(isDismissed(1_000, memory())).toBe(false);
  });
  it('persists for the snooze window then expires', () => {
    const st = memory();
    recordDismissal(1_000, st);
    expect(st.data.get(DISMISS_KEY)).toBe('1000');
    expect(isDismissed(1_000 + (SNOOZE_DAYS - 1) * DAY, st)).toBe(true);
    expect(isDismissed(1_000 + SNOOZE_DAYS * DAY, st)).toBe(false);
  });
  it('ignores garbage values', () => {
    const st = memory();
    st.data.set(DISMISS_KEY, 'abc');
    expect(isDismissed(5, st)).toBe(false);
  });
  it('never throws when storage is blocked', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(isDismissed(1, broken)).toBe(false);
    expect(() => recordDismissal(1, broken)).not.toThrow();
    expect(isDismissed(1, null)).toBe(false);
  });
});
