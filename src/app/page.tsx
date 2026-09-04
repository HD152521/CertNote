import type { Metadata } from 'next';
import { DEFAULT_CATEGORY, certLevelLabel } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { groupCertsByLevel } from '@/lib/levels';
import { CertCard } from '@/components/CertCard';
import { ContinueCards } from '@/components/ContinueCards';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getStarterDay } from '@/lib/study/starter';
import { ExamDateNudge } from '@/components/study/ExamDateNudge';
import { Landing } from '@/components/marketing/Landing';

// 학습 페이지/연습 문항 총량(빌드 시점 스냅샷). 큰 questions.json을 root에 import하지 않기 위한 상수.
// 자격증 추가로 크게 바뀌면 갱신.
const PAGE_COUNT = 555;
const QUESTION_COUNT = 3410;

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
  description: '주차별 커리큘럼으로 AWS 자격증 독학. 심화 노트·연습문제·간격반복 복습. Week 1 무료.',
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const session = await getCurrentUser();
  const certs = await listCerts(DEFAULT_CATEGORY);
  // 비로그인 방문자는 마케팅 랜딩, 로그인 사용자는 학습 홈(자격증 그리드).
  if (!session) return <Landing certCount={certs.length} pageCount={PAGE_COUNT} questionCount={QUESTION_COUNT} certs={certs} />;

  const groups = groupCertsByLevel(certs, 'aws').map((g) => ({ level: g.level, items: g.certs }));
  const starter = await getStarterDay(session.sub);

  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <section className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">Certification Notes · {certs.length} tracks</p>
        <h1 className="text-3xl font-semibold tracking-tight">AWS 자격증으로 시작하는 클라우드 네이티브</h1>
        <p className="text-base text-fg-muted max-w-xl">AWS 클라우드 자격증 11종 + 리눅스마스터 1급. 매일 한 페이지씩 주차별 한국어 노트로 학습. 사이드바에서 자격증을 골라 시작하세요.</p>
      </section>
      <ContinueCards certs={certs} starter={starter} />
      <ExamDateNudge />
      {groups.map(({ level, items }) => (
        <section key={level} className="space-y-4">
          <h2 className="text-sm font-medium text-fg-muted">{certLevelLabel(level)}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((c) => (
              <CertCard key={c.slug} cert={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
