import Link from 'next/link';
import { BookOpen, Timer, RefreshCw, ArrowRight } from 'lucide-react';
import { DEFAULT_CATEGORY } from '@/lib/category';
import type { CertMeta } from '@/lib/content';
import { WaitlistForm } from './WaitlistForm';

const HIGHLIGHTS = [
  {
    icon: BookOpen,
    title: '깊이 있는 학습 자료',
    body: '시험용 정답 암기가 아니라, 내부 동작·사고 사례·표준까지 짚는 기술 블로그형 자료.',
  },
  {
    icon: Timer,
    title: '실전 모의고사',
    body: '실제 시험처럼 타이머와 합/불 채점. 약점을 데이터로 확인하고 보완하세요.',
  },
  {
    icon: RefreshCw,
    title: '틀린 문제는 자동 복습',
    body: '간격반복(SRS)으로 오답을 잊을 때쯤 다시 보여줘 장기 기억으로 굳힙니다.',
  },
];

// 방문자가 가장 많이 열어본 트랙(PostHog 페이지뷰 기준). 콘텐츠는 비로그인도 열람 가능하므로
// 가입 전에 품질을 직접 확인시키는 게 자연스러운 전환 경로다.
const POPULAR_SLUGS = ['saa-c03', 'clf-c02', 'linux-master-1'];

interface LandingProps {
  certCount: number;
  pageCount: number;
  questionCount: number;
  certs: CertMeta[];
}

// 비로그인 방문자용 마케팅 랜딩. 수치는 서버(root 페이지)에서 주입 → 자격증 추가 시 자동 반영.
export function Landing({ certCount, pageCount, questionCount, certs }: LandingProps) {
  const nf = (n: number) => n.toLocaleString('ko-KR');
  const popular = POPULAR_SLUGS.map((slug) => certs.find((c) => c.slug === slug)).filter(
    (c): c is CertMeta => Boolean(c),
  );
  return (
    <div className="mx-auto max-w-3xl space-y-16 py-8">
      <section className="space-y-5">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">AWS · 리눅스마스터 · {certCount} tracks</p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          클라우드 네이티브로 시작하는<br />AWS 자격증, 클라우드 자격증
        </h1>
        <p className="max-w-xl text-lg text-fg-muted">
          AWS 클라우드 자격증 11종 + 리눅스마스터 1급. 매일 한 페이지씩 읽고, {nf(questionCount)}문항으로 실전 감각을 채우세요.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/signup" className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90">
            무료로 시작하기
          </Link>
          <Link href="/pricing" className="rounded-md border border-border px-5 py-2.5 text-sm font-medium transition hover:border-border-strong">
            요금제 보기
          </Link>
        </div>
        <p className="text-xs text-fg-faint">Week 1은 누구나 무료 · 신용카드 불필요</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-border p-5">
            <Icon className="h-5 w-5 text-accent" />
            <h2 className="mt-3 text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-fg-muted">{body}</p>
          </div>
        ))}
      </section>

      {popular.length > 0 && (
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">가입 없이 먼저 읽어보세요</h2>
            <p className="text-sm text-fg-muted">Week 1 학습 자료는 로그인 없이 누구나 볼 수 있어요. 품질을 직접 확인하고 시작하세요.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {popular.map((cert) => (
              <Link
                key={cert.slug}
                href={`/${DEFAULT_CATEGORY}/${cert.slug}`}
                className="group flex flex-col gap-2 rounded-xl border border-border p-5 transition hover:border-border-strong"
              >
                <span className="font-mono text-xs text-fg-faint">{cert.code}</span>
                <span className="text-sm font-semibold leading-snug">{cert.name}</span>
                <span className="mt-auto flex items-center gap-1 pt-2 text-xs text-fg-muted transition group-hover:text-accent">
                  Week 1 무료로 읽기 <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-3 gap-4 rounded-xl border border-border bg-bg-subtle p-6 text-center">
        <div><p className="text-2xl font-bold">{nf(certCount)}</p><p className="text-xs text-fg-faint">자격증 트랙</p></div>
        <div><p className="text-2xl font-bold">{nf(pageCount)}</p><p className="text-xs text-fg-faint">학습 페이지</p></div>
        <div><p className="text-2xl font-bold">{nf(questionCount)}</p><p className="text-xs text-fg-faint">연습 문항</p></div>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-6">
        <h2 className="text-lg font-semibold">Pro 출시 알림 받기</h2>
        <p className="text-sm text-fg-muted">전체 자료·모의고사·무제한 복습이 곧 열립니다. 이메일을 남기면 가장 먼저 알려드릴게요.</p>
        <WaitlistForm />
      </section>
    </div>
  );
}
