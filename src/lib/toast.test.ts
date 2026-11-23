import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_TOAST_MS, MAX_TOASTS, dismissToast, getToastSnapshot, pauseToast, resetToasts, resumeToast, showToast, subscribeToasts,
} from './toast';

beforeEach(() => {
  vi.useFakeTimers();
  resetToasts();
});
afterEach(() => {
  resetToasts();
  vi.useRealTimers();
});

describe('toast store', () => {
  test('추가하면 목록에 들어가고 구독자에게 알린다', () => {
    const listener = vi.fn();
    const off = subscribeToasts(listener);
    showToast({ message: '저장됨' });
    expect(getToastSnapshot().map((x) => x.message)).toEqual(['저장됨']);
    expect(getToastSnapshot()[0].tone).toBe('info');
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    showToast({ message: '다른 것' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('상태를 바꿀 때마다 새 배열을 만든다(이전 스냅샷은 그대로)', () => {
    showToast({ message: 'a' });
    const before = getToastSnapshot();
    showToast({ message: 'b' });
    expect(getToastSnapshot()).not.toBe(before);
    expect(before.map((x) => x.message)).toEqual(['a']);
  });

  test('같은 문구·종류는 합치고 시간을 다시 채운다', () => {
    const first = showToast({ message: '저장됨' });
    vi.advanceTimersByTime(DEFAULT_TOAST_MS - 100);
    const second = showToast({ message: '저장됨' });
    expect(second).toBe(first);
    expect(getToastSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(DEFAULT_TOAST_MS - 100);
    expect(getToastSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(getToastSnapshot()).toHaveLength(0);
  });

  test('문구가 같아도 종류가 다르면 따로 둔다', () => {
    showToast({ message: 'x' });
    showToast({ message: 'x', tone: 'error' });
    expect(getToastSnapshot()).toHaveLength(2);
  });

  test('최대 수를 넘기면 가장 오래된 것부터 뺀다', () => {
    for (let i = 0; i < MAX_TOASTS + 2; i++) showToast({ message: `m${i}` });
    expect(getToastSnapshot().map((x) => x.message)).toEqual(['m2', 'm3', 'm4']);
  });

  test('기본 4초 뒤 자동으로 사라지고 길이를 지정할 수 있다', () => {
    showToast({ message: 'short' });
    showToast({ message: 'long', durationMs: 6000 });
    vi.advanceTimersByTime(4000);
    expect(getToastSnapshot().map((x) => x.message)).toEqual(['long']);
    vi.advanceTimersByTime(2000);
    expect(getToastSnapshot()).toHaveLength(0);
  });

  test('수동으로 닫으면 바로 사라지고 타이머도 정리된다', () => {
    const id = showToast({ message: 'x' });
    dismissToast(id);
    expect(getToastSnapshot()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('멈추면 남은 시간이 보존되고 재개하면 그만큼 뒤에 사라진다', () => {
    const id = showToast({ message: 'x' });
    vi.advanceTimersByTime(3000);
    pauseToast(id);
    vi.advanceTimersByTime(60_000);
    expect(getToastSnapshot()).toHaveLength(1);
    resumeToast(id);
    vi.advanceTimersByTime(999);
    expect(getToastSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(getToastSnapshot()).toHaveLength(0);
  });
});
