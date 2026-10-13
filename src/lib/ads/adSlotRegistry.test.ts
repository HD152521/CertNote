import { describe, expect, test, vi } from 'vitest';
import { hasMountedAdSlots, registerAdSlot, subscribeAdSlots } from './adSlotRegistry';

describe('adSlotRegistry — 화면에 광고 슬롯이 있는지', () => {
  test('등록 전에는 false, 등록하면 true, 전부 해제하면 다시 false', () => {
    expect(hasMountedAdSlots()).toBe(false);

    const unregisterA = registerAdSlot();
    const unregisterB = registerAdSlot();
    expect(hasMountedAdSlots()).toBe(true);

    unregisterA();
    expect(hasMountedAdSlots()).toBe(true);
    unregisterB();
    expect(hasMountedAdSlots()).toBe(false);
  });

  test('해제를 두 번 불러도 한 번만 센다', () => {
    const unregister = registerAdSlot();
    const other = registerAdSlot();

    unregister();
    unregister();

    expect(hasMountedAdSlots()).toBe(true);
    other();
    expect(hasMountedAdSlots()).toBe(false);
  });

  test('등록·해제 때마다 구독자에게 알리고, 구독을 끊으면 더는 알리지 않는다', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAdSlots(listener);

    const unregister = registerAdSlot();
    expect(listener).toHaveBeenCalledTimes(1);
    unregister();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    registerAdSlot()();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
