import { DEFAULT_CATEGORY } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { CertCard } from '@/components/CertCard';
import { ContinueCards } from '@/components/ContinueCards';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { Landing } from '@/components/marketing/Landing';

export default async function HomePage() {
  // 비로그인 방문자는 마케팅 랜딩, 로그인 사용자는 학습 홈(자격증 그리드).
  const session = await getCurrentUser();
  if (!session) return <Landing />;
  const certs = await listCerts(DEFAULT_CATEGORY);
  const associates = certs.filter((c) => c.level === 'associate');
  const professionals = certs.filter((c) => c.level === 'professional');
  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <section className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">Certification Notes · 6 tracks</p>
        <h1 className="text-3xl font-semibold tracking-tight">출퇴근 15분, 자격증 한 권</h1>
        <p className="text-base text-fg-muted max-w-xl">매일 한 페이지씩. AWS 5종 + 리눅스마스터 1급 학습 자료를 모았습니다. 사이드바에서 자격증을 골라 시작하세요.</p>
      </section>
      <ContinueCards certs={certs} />
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-fg-muted">Associate</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{associates.map((c) => (<CertCard key={c.slug} cert={c} />))}</div>
      </section>
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-fg-muted">Professional</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{professionals.map((c) => (<CertCard key={c.slug} cert={c} />))}</div>
      </section>
    </div>
  );
}
