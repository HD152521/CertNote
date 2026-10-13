import { describe, expect, test } from 'vitest';
import { overlapsAnyAd, type Box } from './adOverlap';

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

// 320×568 화면의 "피드백" 버튼 자리(우하단 16px 여백, 119×40).
const FEEDBACK = box(185, 512, 119, 40);

describe('overlapsAnyAd — 떠 있는 버튼이 광고와 겹치는가', () => {
  test('광고가 없으면 겹치지 않는다', () => {
    expect(overlapsAnyAd([FEEDBACK], [], 48)).toBe(false);
  });

  test('대상이 없으면 겹치지 않는다', () => {
    expect(overlapsAnyAd([], [box(16, 300, 288, 280)], 48)).toBe(false);
  });

  test('버튼 사각형이 광고 사각형과 겹치면 true', () => {
    expect(overlapsAnyAd([FEEDBACK], [box(16, 300, 288, 280)], 0)).toBe(true);
  });

  test('겹치지 않아도 여백 안에 광고가 있으면 true(바로 옆도 오클릭 자리다)', () => {
    // 광고 아래 끝 480, 버튼 위 끝 512 → 32px 떨어져 있다.
    const ad = box(16, 200, 288, 280);

    expect(overlapsAnyAd([FEEDBACK], [ad], 0)).toBe(false);
    expect(overlapsAnyAd([FEEDBACK], [ad], 48)).toBe(true);
  });

  test('여백보다 멀리 떨어져 있으면 false', () => {
    // 광고 아래 끝 380 → 버튼과 132px.
    expect(overlapsAnyAd([FEEDBACK], [box(16, 100, 288, 280)], 48)).toBe(false);
  });

  test('모서리가 딱 맞닿기만 한 것은 겹침이 아니다', () => {
    expect(overlapsAnyAd([box(0, 0, 10, 10)], [box(10, 0, 10, 10)], 0)).toBe(false);
    expect(overlapsAnyAd([box(0, 0, 10, 10)], [box(0, 10, 10, 10)], 0)).toBe(false);
  });

  test('세로로는 겹치지만 가로로 떨어져 있으면 false', () => {
    expect(overlapsAnyAd([box(0, 0, 48, 48)], [box(200, 0, 100, 48)], 48)).toBe(false);
  });

  test('접혀서 크기가 0 인 광고(display:none)는 무시한다', () => {
    expect(overlapsAnyAd([FEEDBACK], [box(0, 0, 0, 0)], 1000)).toBe(false);
    expect(overlapsAnyAd([FEEDBACK], [box(185, 512, 0, 0)], 48)).toBe(false);
  });

  test('대상·광고가 여럿이면 한 쌍이라도 겹칠 때 true', () => {
    const prev = box(8, 260, 48, 48);
    const next = box(264, 260, 48, 48);
    const farAd = box(16, 900, 288, 100);
    const midAd = box(16, 200, 288, 280);

    expect(overlapsAnyAd([prev, next], [farAd], 48)).toBe(false);
    expect(overlapsAnyAd([prev, next], [farAd, midAd], 48)).toBe(true);
  });
});
