import type { Metadata } from 'next';
import { HomeLanding } from '@/components/marketing/HomeLanding';

// 홈 canonical. 과거 루트 레이아웃(src/app/layout.tsx)에 있던 전역 선언을 이곳으로 옮겼다
// (docs/SEO-indexing-fix-plan.md Step 2) — 다른 라우트로 상속되지 않도록 홈 페이지 자신이 소유한다.
//
// hreflang(languages)은 의도적으로 선언하지 않는다(Step 3). 홈(마케팅 랜딩)의 영어판 URL은
// 존재하지 않는다 — `/en`은 `/aws-certs`(자격증 허브)의 영어판이지 홈의 영어판이 아니다.
// 예전엔 홈과 `/aws-certs`가 둘 다 `/en`을 자기 짝이라 주장했지만 `/en`은 홈만 되받아,
// 상호 참조가 성립하지 않는 hreflang 클러스터가 만들어졌다(구글이 클러스터 전체를 무시한다).
// 언어 쌍은 `/aws-certs` ↔ `/en` 하나로 확정했다 — 세부 근거는
// docs/SEO-indexing-fix-plan.md Step 3 및 src/app/[category]/page.tsx, src/app/en/page.tsx 참고.
export const metadata: Metadata = {
  // 홈 고유 title/description. 예전엔 둘 다 루트 레이아웃 기본값을 그대로 썼는데, 홈은
  // "aws 자격증 독학/준비" 의도의 착지 페이지라 사이트 전체 기본값과 역할이 다르다.
  // (GSC 2026-08-31: 홈이 '크롤링됨 - 현재 색인이 생성되지 않음' 에 있었다.)
  // description 은 네이버 권장 80자 이내를 지킨다.
  // ⚠️ 루트 레이아웃의 title.template('%s | Cert Notes')은 **여기에 적용되지 않는다.**
  // template 은 하위 route segment 에만 붙는데, app/page.tsx 는 app/layout.tsx 와 같은
  // 세그먼트다(실측: 홈 title 에는 접미사가 없고 /aws/reviews 에는 붙는다).
  // 따라서 브랜드명을 직접 넣는다. 지우면 SERP 에서 브랜드가 사라진다.
  title: 'AWS 자격증 독학 — 하루 30분 한국어 커리큘럼 | Cert Notes',
  description: '주차별 커리큘럼으로 AWS 자격증 독학. 심화 노트·연습문제·간격반복 복습. 전 과정 무료.',
  alternates: { canonical: '/' },
};

// 홈은 정적으로 프리렌더돼 다음 배포까지 캐시된다(docs/P3-step3-speed-report.md).
// 예전엔 여기서 getCurrentUser()(cookies())로 로그인 여부를 갈랐는데, 그 한 줄 때문에 홈 전체가
// 요청마다 렌더됐다(Cache-Control: no-store, 운영 콜드 스타트 4.1초).
//
// ⚠️ 이 파일과 HomeLanding/Landing 에서 쿠키·세션·DB 를 읽지 말 것(page.test.ts 가 감시).
// 로그인 사용자의 학습 홈은 src/proxy.ts 가 세션 쿠키를 보고 /home(src/app/home/page.tsx)으로
// rewrite 해 렌더한다 — 주소창은 그대로 `/` 이고, 비로그인 랜딩이 먼저 보였다 바뀌는 깜빡임이 없다.
export default function HomePage() {
  return <HomeLanding />;
}
