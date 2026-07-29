import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { EN_CATEGORY, certLevelLabel } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { hreflangPair } from '@/lib/i18n';
import { SITE_NAME } from '@/lib/site';

// 영어판 홈. 무료 Week1 영어 트랙의 진입점 — 정적 라우트라 /en 이 [category]보다 우선 매칭된다.
// 콘텐츠·역할 면에서 이 페이지의 한국어판은 홈(`/`, 마케팅 랜딩)이 아니라 aws 섹션 허브
// (`/aws`)다 — 둘 다 "전 자격증 트랙을 나열하는 진입 목록" 페이지라는 점에서 같은 역할을 한다.
// hreflang 짝은 `/aws` ↔ `/en`으로 고정(Phase1: 구 `/aws-certs`는 301되므로 신 URL을 가리킨다).
export const metadata: Metadata = {
  title: 'AWS Certification Study Notes in English — Week 1 Free',
  description:
    'Daily in-depth study notes for 11 AWS certifications. Week 1 of every track is free in English, with practice questions built in.',
  alternates: {
    canonical: `/${EN_CATEGORY}`,
    languages: hreflangPair('/aws', `/${EN_CATEGORY}`, { xDefault: true }),
  },
  openGraph: {
    title: `${SITE_NAME} — AWS Certification Study Notes`,
    description: 'Week 1 free in English for 11 AWS certification tracks.',
    url: `/${EN_CATEGORY}`,
    type: 'website',
  },
};

export default async function EnHomePage() {
  const certs = await listCerts(EN_CATEGORY).catch(() => []);
  return (
    <div className="mx-auto max-w-3xl space-y-10 py-4">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          AWS certification prep, <span className="text-accent">one day at a time</span>
        </h1>
        <p className="text-fg-muted leading-relaxed">
          In-depth daily study notes for 11 AWS certifications — written to be read on your commute, with practice
          questions after every lesson. <strong className="text-fg">Week 1 of every track is free in English.</strong>
        </p>
        <p className="text-xs text-fg-faint">
          The full multi-week courses, mock exams, and spaced-repetition review are currently Korean-only.{' '}
          <Link href="/" className="underline underline-offset-4 hover:text-fg">Switch to the Korean site</Link> for the
          complete experience.
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2">
        {certs.map((c) => (
          <Link
            key={c.slug}
            href={`/${EN_CATEGORY}/${c.slug}`}
            className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-elevated px-4 py-3 transition hover:border-border-strong"
          >
            <span className="min-w-0">
              <span className="block font-mono text-[11px] text-fg-faint">{c.code} · {certLevelLabel(c.level)}</span>
              <span className="block truncate text-sm font-medium">{c.name}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-fg-faint transition group-hover:text-fg" />
          </Link>
        ))}
      </section>
      {certs.length === 0 && (
        <p className="text-sm text-fg-muted">English tracks are being prepared — check back soon.</p>
      )}
    </div>
  );
}
