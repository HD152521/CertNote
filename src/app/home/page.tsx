import type { Metadata } from 'next';
import { DEFAULT_CATEGORY, certLevelLabel } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { groupCertsByLevel } from '@/lib/levels';
import { CertCard } from '@/components/CertCard';
import { ContinueCards } from '@/components/ContinueCards';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getStarterDay } from '@/lib/study/starter';
import { ExamDateNudge } from '@/components/study/ExamDateNudge';
import { HomeLanding } from '@/components/marketing/HomeLanding';
import { metadata as homeMetadata } from '../page';

// 로그인 사용자의 학습 홈. 공개 URL 이 아니다 — src/proxy.ts 가 유효한 세션 쿠키가 있는 `/` 요청을
// 여기로 rewrite 한다(주소창은 `/`). `/home` 을 직접 열면 proxy 가 `/` 로 돌려보낸다.
// 홈을 정적 캐시로 돌리면서 cookies() 를 읽는 부분만 이 라우트로 떼어냈다(docs/P3-step3-speed-report.md).
//
// title/description/canonical 은 홈과 같다. 검색엔진은 쿠키가 없어 이 라우트에 닿지 않지만,
// 닿더라도 홈과 겹치는 사본으로 색인되지 않게 noindex 를 둔다.
//
// title 은 absolute 로 고정한다. 이 라우트는 루트의 하위 세그먼트라 title.template 이 붙는데
// (홈 page.tsx 는 붙지 않는다), 그대로 두면 "… | CertNote | CertNote" 가 된다.
export const metadata: Metadata = {
  ...homeMetadata,
  title: { absolute: String(homeMetadata.title) },
  robots: { index: false, follow: true },
};

export default async function StudyHomePage() {
  // proxy 는 JWT 서명·만료만 본다. token_version 대조(비밀번호 변경으로 무효화된 세션)는 여기서 한다.
  // 무효 세션은 예전 홈과 똑같이 랜딩을 보여준다 — redirect('/') 는 proxy 가 다시 여기로 보내 무한 루프가 된다.
  const session = await getCurrentUser();
  if (!session) return <HomeLanding />;

  const certs = await listCerts(DEFAULT_CATEGORY);
  const awsCount = certs.filter((c) => (c.section ?? 'aws') === 'aws').length;
  const linuxCount = certs.filter((c) => c.section === 'linux').length;
  const trackSummary = `AWS 클라우드 자격증 ${awsCount}종${linuxCount > 0 ? ` + 리눅스마스터 ${linuxCount}종` : ''}`;
  const groups = groupCertsByLevel(certs, 'aws').map((g) => ({ level: g.level, items: g.certs }));
  const starter = await getStarterDay(session.sub);

  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <section className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">Certification Notes · {certs.length} tracks</p>
        <h1 className="text-3xl font-semibold tracking-tight">AWS 자격증으로 시작하는 클라우드 네이티브</h1>
        <p className="text-base text-fg-muted max-w-xl">{trackSummary}. 매일 한 페이지씩 주차별 한국어 노트로 학습. 사이드바에서 자격증을 골라 시작하세요.</p>
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
