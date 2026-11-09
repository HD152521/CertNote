import { describe, expect, test } from 'vitest';
import robots from './robots';

describe('robots', () => {
  const rule = [robots().rules].flat()[0];
  const disallow = [rule?.disallow ?? []].flat();

  test('링크 미리 불러오기용 RSC 요청(?_rsc=)은 크롤링하지 않게 막는다', () => {
    expect(disallow).toContain('/*?_rsc=');
    expect(disallow).toContain('/*&_rsc=');
  });

  test('콘텐츠 경로는 막지 않는다', () => {
    for (const path of ['/data', '/aws', '/linux', '/lab', '/en']) {
      expect(disallow.some((d) => d === path || d === `${path}/`)).toBe(false);
    }
  });
});
