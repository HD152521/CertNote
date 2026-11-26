import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Flame } from 'lucide-react';
import { DEFAULT_CATEGORY, certLevelLabel } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { groupCertsByLevel } from '@/lib/levels';
import { CertCard } from '@/components/CertCard';
import { ContinueCards } from '@/components/ContinueCards';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getTodayCardData } from '@/lib/study/todayCardData';
import { TodayCard } from '@/components/dashboard/TodayCard';
import { HomeLanding } from '@/components/marketing/HomeLanding';
import type { Language } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { dashboardStrings } from '@/lib/strings/dashboard';
import { fmt } from '@/lib/strings/study';
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

  const headersList = await headers();
  const lang = (headersList.get('x-language') || 'ko') as Language;
  const s = pick(dashboardStrings, lang);

  const certs = await listCerts(DEFAULT_CATEGORY);
  const groups = groupCertsByLevel(certs, 'aws').map((g) => ({ level: g.level, items: g.certs }));
  const todayData = await getTodayCardData(session.sub);

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      {/* "오늘 뭘 하면 되는지"를 한 장으로 — 대시보드의 숫자 타일·그래프는 여기 안 가져온다,
          그건 /dashboard 에서 보고 싶을 때 보는 것이고 홈은 오늘 할 일 하나만 분명하면 된다. */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">Certification Notes · {certs.length} tracks</p>
          {todayData.streakCurrent > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-[13px] font-semibold text-accent">
              <Flame className="h-3.5 w-3.5" aria-hidden />
              {fmt(s.streak, { n: todayData.streakCurrent })}
            </span>
          )}
        </div>
        <TodayCard lang={lang} plan={todayData.plan} starter={todayData.starter} reviewDue={todayData.reviewDue} />
      </section>

      {/* 여러 자격증을 오가며 읽던 자리로 바로 가는 카드. 플랜 없는 신규 유저용 "시작하기"는
          위 TodayCard(NoPlanBody)가 이미 보여주므로 여기선 starter 를 넘기지 않는다(중복 방지). */}
      <ContinueCards certs={certs} />

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
