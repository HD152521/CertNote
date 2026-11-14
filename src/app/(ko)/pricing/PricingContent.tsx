'use client';

import Link from 'next/link';
import { Check, X, ChevronDown } from 'lucide-react';
import { WaitlistForm } from '@/components/marketing/WaitlistForm';
import { useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { pricingStrings } from '@/lib/strings/pricing';

function CheckItem({ children, included }: { children: React.ReactNode; included: boolean }) {
  return (
    <li className={`flex items-start gap-2 text-sm ${included ? '' : 'opacity-50'}`}>
      {included ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      ) : (
        <X className="mt-0.5 h-4 w-4 shrink-0 text-fg-faint" />
      )}
      <span>{children}</span>
    </li>
  );
}

// 언어에 따라 갈리는 마크업 전부. 서버 page.tsx는 metadata만 들고 이걸 렌더한다 —
// cookies()를 읽지 않아야 /pricing이 정적으로 남는다.
export function PricingContent() {
  const lang = useLanguage();
  const s = pick(pricingStrings, lang);

  const freeFeatures = [
    { name: s.freeWeek1, included: true },
    { name: s.freeQuiz, included: true },
    { name: s.freeProgress, included: true },
    { name: s.freeDashboard, included: true },
    { name: s.freeAllWeeks, included: false },
    { name: s.freeMockExams, included: false },
    { name: s.freeSrs, included: false },
  ];

  const proFeatures = [
    { name: s.proCurriculum, included: true },
    { name: s.proMockExams, included: true },
    { name: s.proSrs, included: true },
    { name: s.proStats, included: true },
    { name: s.proNewCerts, included: true },
  ];

  const comparison = [
    { name: s.cmpPrice, free: '₩0', pro: '₩9,900', udemy: '₩15-30K', coursera: '₩40-49K' },
    { name: s.cmpKorean, free: '✅', pro: '✅', udemy: '❌', coursera: '❌' },
    { name: s.cmpSrs, free: '❌', pro: '✅', udemy: '❌', coursera: '❌' },
    { name: s.cmpCurriculum, free: s.cmpCurriculumFree, pro: s.cmpCurriculumPro, udemy: '❌', coursera: '✅' },
    { name: s.cmpMockExam, free: '❌', pro: '✅', udemy: s.cmpMockExamUdemy, coursera: '✅' },
  ];

  const faqs = [
    { q: s.faqDurationQ, a: s.faqDurationA },
    { q: s.faqFreeQ, a: s.faqFreeA },
    { q: s.faqCertsQ, a: s.faqCertsA },
    { q: s.faqUpgradeQ, a: s.faqUpgradeA },
    { q: s.faqCancelQ, a: s.faqCancelA },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-16 py-12">
      {/* Header */}
      <header className="space-y-3 text-center">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">Pricing</p>
        <h1 className="text-4xl font-bold tracking-tight">{s.headline}</h1>
        <p className="mx-auto max-w-2xl text-lg text-fg-muted">
          {s.sublineA}<br />
          {s.sublineB}
        </p>
      </header>

      {/* Pricing Cards */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-2xl border border-border p-8">
          <h2 className="text-2xl font-bold">Free</h2>
          <p className="mt-1 text-4xl font-bold">₩0</p>
          <p className="text-sm text-fg-faint">{s.freePriceNote}</p>
          <p className="mt-3 text-sm text-fg-muted">{s.freeDesc}</p>
          <ul className="mt-6 space-y-2">
            {freeFeatures.map((f) => (
              <CheckItem key={f.name} included={f.included}>{f.name}</CheckItem>
            ))}
          </ul>
          <Link
            href="/signup"
            className="mt-8 rounded-lg border border-border px-4 py-3 text-center font-semibold transition hover:border-border-strong"
          >
            {s.freeCta}
          </Link>
        </div>

        {/* Pro */}
        <div className="flex flex-col rounded-2xl border-2 border-accent bg-gradient-to-br from-accent/5 to-transparent p-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Pro</h2>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase text-accent-fg">{s.proBadge}</span>
          </div>
          <p className="mt-1 text-4xl font-bold">₩9,900<span className="text-lg font-normal text-fg-muted">{s.proPricePeriod}</span></p>
          <p className="text-sm text-fg-faint">{s.proPriceNote}</p>
          <p className="mt-3 text-sm text-accent font-semibold">{s.proSavings}</p>
          <ul className="mt-6 space-y-2">
            {proFeatures.map((f) => (
              <CheckItem key={f.name} included={f.included}>{f.name}</CheckItem>
            ))}
          </ul>
          <div className="mt-8 space-y-2">
            <p className="text-xs text-fg-faint">{s.waitlistNote}</p>
            <WaitlistForm />
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">{s.comparisonHeading}</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-subtle">
                <th className="px-4 py-3 text-left font-semibold">{s.comparisonFeature}</th>
                <th className="px-4 py-3 text-center font-semibold">Free</th>
                <th className="px-4 py-3 text-center font-semibold text-accent">Pro</th>
                <th className="px-4 py-3 text-center font-semibold">Udemy</th>
                <th className="px-4 py-3 text-center font-semibold">Coursera</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-center text-fg-muted">{row.free}</td>
                  <td className="px-4 py-3 text-center font-semibold text-accent">{row.pro}</td>
                  <td className="px-4 py-3 text-center text-fg-muted">{row.udemy}</td>
                  <td className="px-4 py-3 text-center text-fg-muted">{row.coursera}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">{s.faqHeading}</h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <details
              key={i}
              className="group rounded-lg border border-border p-4 transition hover:bg-bg-subtle"
            >
              <summary className="flex cursor-pointer items-center justify-between font-semibold">
                {faq.q}
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm text-fg-muted leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold">{s.ctaHeading}</h2>
        <p className="text-lg text-fg-muted">{s.ctaBody}</p>
        <Link
          href="/signup"
          className="inline-block rounded-lg bg-accent px-6 py-3 font-semibold text-accent-fg transition hover:opacity-90"
        >
          {s.ctaButton}
        </Link>
      </div>

      <p className="text-center text-xs text-fg-faint">
        {s.haveAccount} <Link href="/login" className="text-accent hover:underline">{s.loginLink}</Link>
      </p>
    </div>
  );
}
