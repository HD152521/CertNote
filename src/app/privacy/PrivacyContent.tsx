'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { privacyStrings } from '@/lib/strings/privacy';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="text-sm text-fg-muted">{children}</div>
    </section>
  );
}

// 방침 본문 전체. 서버 page.tsx는 metadata만 들고 이걸 렌더한다 — cookies()를 읽지
// 않아야 /privacy가 정적으로 남는다.
export function PrivacyContent() {
  const lang = useLanguage();
  const s = pick(privacyStrings, lang);

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
        <p className="text-sm text-fg-muted">{s.lastUpdated}</p>
      </header>

      <p className="text-sm text-fg-muted">{s.intro}</p>

      <Section title={s.collectTitle}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{s.collectRequired}</li>
          <li>{s.collectOptional}</li>
          <li>{s.collectAutomatic}</li>
          <li>{s.collectBehavior}</li>
        </ul>
      </Section>

      <Section title={s.purposeTitle}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{s.purposeAccount}</li>
          <li>{s.purposeFeatures}</li>
          <li>{s.purposeNotifications}</li>
          <li>{s.purposeImprovement}</li>
        </ul>
      </Section>

      <Section title={s.retentionTitle}>
        <p>{s.retentionBody}</p>
      </Section>

      <Section title={s.thirdPartyTitle}>
        <p>{s.thirdPartyBody}</p>
      </Section>

      <Section title={s.rightsTitle}>
        <p>{s.rightsBody}</p>
      </Section>

      <Section title={s.contactTitle}>
        <p>
          {s.contactLabel} <a href="mailto:wkdrndydtlr@gmail.com" className="underline underline-offset-4">wkdrndydtlr@gmail.com</a>
        </p>
      </Section>

      <p className="pt-4 text-sm">
        <Link href="/signup" className="text-fg underline underline-offset-4">{s.backToSignup}</Link>
      </p>
    </div>
  );
}
