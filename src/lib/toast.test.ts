import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_ERROR_TOAST_MS, DEFAULT_TOAST_MS, MAX_TOASTS, dismissToast, getToastSnapshot, pauseToast, resetToasts, resumeToast,
  setToastsAdPaused, showToast, subscribeToasts,
} from './toast';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', {});
  resetToasts();
});
afterEach(() => {
  resetToasts();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const messages = () => getToastSnapshot().map((x) => x.message);

describe('toast store', () => {
  test('추가하면 목록에 들어가고 구독자에게 알린다', () => {
    const listener = vi.fn();
    const off = subscribeToasts(listener);
    showToast({ message: '저장됨' });
    expect(messages()).toEqual(['저장됨']);
    expect(getToastSnapshot()[0].tone).toBe('info');
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    showToast({ message: '다른 것' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('서버(window 없음)에서 부르면 무시한다', () => {
    vi.unstubAllGlobals();
    expect(typeof window).toBe('undefined');
    expect(showToast({ message: 'x' })).toBe(0);
    expect(getToastSnapshot()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
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
    expect(showToast({ message: '저장됨' })).toBe(first);
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
    expect(messages()).toEqual(['m2', 'm3', 'm4']);
  });

  test('기본 4초 뒤 자동으로 사라지고 길이를 지정할 수 있다', () => {
    showToast({ message: 'short' });
    showToast({ message: 'long', durationMs: 6000 });
    vi.advanceTimersByTime(4000);
    expect(messages()).toEqual(['long']);
    vi.advanceTimersByTime(2000);
    expect(getToastSnapshot()).toHaveLength(0);
  });

  test('오류 알림은 기본 10초 유지된다', () => {
    showToast({ message: 'e', tone: 'error' });
    vi.advanceTimersByTime(DEFAULT_ERROR_TOAST_MS - 1);
    expect(getToastSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(getToastSnapshot()).toHaveLength(0);
  });

  test('durationMs 0 은 자동으로 닫히지 않고 수동으로만 닫힌다', () => {
    const id = showToast({ message: 'manual', tone: 'error', durationMs: 0 });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 * 60_000);
    expect(messages()).toEqual(['manual']);
    dismissToast(id);
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

describe('멈춤 회귀', () => {
  test('호버 중에 새 토스트가 추가돼도 멈춘 토스트는 그대로 멈춰 있다', () => {
    const held = showToast({ message: 'held' });
    pauseToast(held);
    showToast({ message: 'other' });
    vi.advanceTimersByTime(DEFAULT_TOAST_MS + 1);
    expect(messages()).toEqual(['held']);
  });

  test('호버 중인 토스트와 같은 문구를 다시 띄워도(합치기) 멈춘 채 유지된다', () => {
    const held = showToast({ message: 'held' });
    pauseToast(held);
    expect(showToast({ message: 'held' })).toBe(held);
    vi.advanceTimersByTime(60_000);
    expect(messages()).toEqual(['held']);
    resumeToast(held);
    vi.advanceTimersByTime(DEFAULT_TOAST_MS + 1);
    expect(getToastSnapshot()).toHaveLength(0);
  });

  test('광고 겹침으로 멈추면 전부 멈추고, 풀리면 호버 중이 아닌 것만 이어서 돈다', () => {
    const hovered = showToast({ message: 'hovered' });
    showToast({ message: 'free' });
    pauseToast(hovered);
    setToastsAdPaused(true);
    vi.advanceTimersByTime(60_000);
    expect(messages()).toEqual(['hovered', 'free']);
    setToastsAdPaused(false);
    vi.advanceTimersByTime(DEFAULT_TOAST_MS + 1);
    expect(messages()).toEqual(['hovered']);
  });

  test('광고 겹침 중 새로 뜬 토스트는 겹침이 풀려야 돌기 시작한다', () => {
    setToastsAdPaused(true);
    showToast({ message: 'late' });
    vi.advanceTimersByTime(60_000);
    expect(messages()).toEqual(['late']);
    setToastsAdPaused(false);
    vi.advanceTimersByTime(DEFAULT_TOAST_MS + 1);
    expect(getToastSnapshot()).toHaveLength(0);
  });

  test('호버가 끝나도 광고 겹침이 계속이면 멈춘 채다', () => {
    const id = showToast({ message: 'x' });
    pauseToast(id);
    setToastsAdPaused(true);
    resumeToast(id);
    vi.advanceTimersByTime(60_000);
    expect(messages()).toEqual(['x']);
  });
});
