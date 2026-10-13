import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { metadata as homeMetadata } from './page';

// SEO 색인 오류 회귀 테스트(docs/SEO-indexing-fix-plan.md Step 2).
//
// 배경: 루트 레이아웃의 전역 alternates(canonical: '/')가 canonical을 명시하지 않은 모든 하위
// 라우트로 상속돼 /checkout 같은 무관한 페이지까지 홈을 자기 canonical로 선언했다. 홈의
// canonical/hreflang은 홈 페이지 자신이 소유해야 하고, 루트 레이아웃은 더 이상 alternates를
// 지정하지 않아야 한다.
//
// layout.tsx는 next/font/google(Inter, JetBrains_Mono)을 로드해 vitest(node 환경)에서
// 직접 import하면 폰트 로더가 실패한다. 대신 소스 텍스트로 `alternates` 재도입 여부를 감시한다.
describe('layout — 루트 레이아웃은 더 이상 전역 alternates를 상속시키지 않는다', () => {
  test('layout.tsx의 metadata 객체에 alternates 키가 없다', () => {
    const source = readFileSync(join(__dirname, 'layout.tsx'), 'utf-8');
    const metadataBlock = source.slice(source.indexOf('export const metadata'), source.indexOf('export const viewport'));
    expect(metadataBlock).not.toMatch(/alternates\s*:/);
  });
});

describe('page — 홈의 canonical/hreflang', () => {
  test('canonical이 사이트 루트를 가리킨다', () => {
    expect(homeMetadata.alternates?.canonical).toBe('/');
  });

  // Step 3: 홈은 더 이상 hreflang을 선언하지 않는다. 예전엔 홈과 /aws-certs가 둘 다 /en을
  // 자기 짝이라 주장했지만 /en은 홈만 되받아 상호 참조가 성립하지 않았다(구글이 클러스터
  // 전체를 무시하는 충돌). 언어 쌍은 /aws-certs ↔ /en 하나로 확정하고 홈은 제외했다.
  test('언어 쌍이 없다 — /en을 자기 영어판이라 주장하지 않는다', () => {
    expect(homeMetadata.alternates?.languages).toBeUndefined();
  });
});

// 홈은 정적으로 프리렌더돼 캐시된다(docs/P3-step3-speed-report.md). 이 파일이나 랜딩이 쿠키·세션을
// 읽으면 홈 전체가 다시 요청마다 렌더된다(Cache-Control: no-store). 로그인 사용자의 학습 홈은
// proxy 가 /home 으로 rewrite 해 따로 렌더한다(src/proxy.ts, src/app/home/page.tsx).
describe('page — 홈은 정적 캐시 대상이다', () => {
  const FORBIDDEN = ['next/headers', '@/lib/auth/currentUser', '@/lib/db'];
  const FILES = ['page.tsx', '../components/marketing/HomeLanding.tsx', '../components/marketing/Landing.tsx'];

  test.each(FILES)('%s 가 쿠키·세션·DB 모듈을 import 하지 않는다', (file) => {
    const source = readFileSync(join(__dirname, file), 'utf-8');
    for (const specifier of FORBIDDEN) {
      expect(source.includes(`from '${specifier}'`), `${file} 가 ${specifier} 를 import 함`).toBe(false);
    }
  });

  test('page.tsx 가 dynamic 을 강제하지 않는다', () => {
    const source = readFileSync(join(__dirname, 'page.tsx'), 'utf-8');
    expect(source).not.toMatch(/export\s+const\s+dynamic\s*=/);
  });
});
