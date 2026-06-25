import { DEFAULT_CATEGORY, certLevelLabel } from '@/lib/category';
import { listCerts } from '@/lib/content';
import type { CertLevel } from '@/lib/content';
import { CertCard } from '@/components/CertCard';
import { ContinueCards } from '@/components/ContinueCards';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { Landing } from '@/components/marketing/Landing';

// 학습 페이지/연습 문항 총량(빌드 시점 스냅샷). 큰 questions.json을 root에 import하지 않기 위한 상수.
// 자격증 추가로 크게 바뀌면 갱신.
const PAGE_COUNT = 555;
const QUESTION_COUNT = 3410;

// 홈/랜딩 자격증 그룹 표시 순서.
const LEVEL_ORDER: CertLevel[] = ['foundational', 'associate', 'professional', 'specialty'];

export default async function HomePage() {
  const session = await getCurrentUser();
  const certs = await listCerts(DEFAULT_CATEGORY);
  // 비로그인 방문자는 마케팅 랜딩, 로그인 사용자는 학습 홈(자격증 그리드).
  if (!session) return <Landing certCount={certs.length} pageCount={PAGE_COUNT} questionCount={QUESTION_COUNT} />;

  const groups = LEVEL_ORDER.map((level) => ({ level, items: certs.filter((c) => c.level === level) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <section className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">Certification Notes · {certs.length} tracks</p>
        <h1 className="text-3xl font-semibold tracking-tight">출퇴근 15분, 자격증 한 권</h1>
        <p className="text-base text-fg-muted max-w-xl">매일 한 페이지씩. AWS 자격증 + 리눅스마스터 1급 학습 자료를 모았습니다. 사이드바에서 자격증을 골라 시작하세요.</p>
      </section>
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
