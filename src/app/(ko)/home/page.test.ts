import { describe, expect, test } from 'vitest';
import { metadata as homeMetadata } from '../page';
import { metadata } from './page';

// 학습 홈은 proxy 가 `/` 를 rewrite 해 보여주는 화면이다(docs/P3-step3-speed-report.md).
// 주소창이 `/` 이므로 탭 제목·canonical 은 홈과 같아야 하고, 사본으로 색인되면 안 된다.
describe('home(학습 홈) — 메타데이터', () => {
  test('제목이 홈과 같다 — 루트 title.template 접미사가 한 번 더 붙지 않는다', () => {
    expect(metadata.title).toEqual({ absolute: homeMetadata.title });
  });

  test('canonical 이 홈을 가리킨다', () => {
    expect(metadata.alternates?.canonical).toBe('/');
  });

  test('색인 대상이 아니다', () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
