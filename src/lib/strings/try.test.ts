import { describe, expect, test } from 'vitest';
import { tryStrings } from './try';

const HANGUL = /[ㄱ-ㆎ가-힣]/;

describe('tryStrings', () => {
  test('영어 문구에는 한글이 없다', () => {
    for (const [key, value] of Object.entries(tryStrings.en)) {
      expect(HANGUL.test(value), `en.${key}`).toBe(false);
    }
  });

  test('한국어·영어의 자리표시자({code}, {total})가 같다', () => {
    const slots = (v: string) => (v.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const key of Object.keys(tryStrings.ko) as (keyof typeof tryStrings.ko)[]) {
      expect(slots(tryStrings.en[key]), key).toBe(slots(tryStrings.ko[key]));
    }
  });
});
