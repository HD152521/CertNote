import { describe, expect, test } from 'vitest';
import { hidesFeedbackButton } from './feedbackVisibility';

describe('hidesFeedbackButton — 문제 풀이 세션에서는 플로팅 피드백 버튼을 숨긴다', () => {
  test('모의고사·복습 세션', () => {
    expect(hidesFeedbackButton('/exam')).toBe(true);
    expect(hidesFeedbackButton('/exam/')).toBe(true);
    expect(hidesFeedbackButton('/review')).toBe(true);
  });

  test('그 밖의 화면은 그대로 보인다(이름이 비슷한 경로 포함)', () => {
    for (const p of ['/', '/en', '/aws/saa-c03/week1/day1', '/aws/reviews', '/aws/reviews/saa-c03', '/examples', '/reviewer', '/dashboard', '/notebook', '/account', null]) {
      expect(hidesFeedbackButton(p)).toBe(false);
    }
  });
});
