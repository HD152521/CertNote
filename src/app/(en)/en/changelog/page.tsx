import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { CHANGELOG_KIND_LABELS_EN, getChangelog, groupChangelogByDate } from '@/lib/trust/changelog';
import { infoAlternates } from '@/lib/infoAlternates';
import { SITE_NAME } from '@/lib/site';
import { withDefaultOgImage } from '@/lib/ogImages';

// 영어판 수정 기록. 데이터는 한국어판과 같은 content/changelog.json 이고, 영어 요약(summaryEn)이 있는 항목만 싣는다.
const TITLE = 'Changelog';
const DESCRIPTION = `A dated list of errors in ${SITE_NAME} notes and questions that we found and fixed through reports and review.`;
const PATH = '/en/changelog';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: infoAlternates(PATH),
  openGraph: withDefaultOgImage({ title: TITLE, description: DESCRIPTION, url: PATH, type: 'website' }),
};

const LINK = 'underline underline-offset-4 hover:text-fg';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export default function EnChangelogPage() {
  const entries = getChangelog().flatMap((e) => (e.summaryEn ? [{ ...e, summary: e.summaryEn }] : []));
  const days = groupChangelogByDate(entries);
  return (
    <LegalPage lang="en" title="Changelog">
      <LegalSection title="About this page">
        <p>
          This page lists, newest first, the errors in notes, questions, explanations and site wording that we found and fixed
          through reports or review. How we make the content and our review criteria are in{' '}
          <Link href="/en/about/how-we-make" className={LINK}>How we make this</Link>; how to report an error is on the{' '}
          <Link href="/en/contact" className={LINK}>contact page</Link>.
        </p>
      </LegalSection>

      {days.length === 0 ? (
        <LegalSection title="Entries">
          <p>No fixes have been published yet.</p>
        </LegalSection>
      ) : (
        days.map((day) => (
          <LegalSection key={day.date} title={formatDate(day.date)}>
            <ul className="space-y-1.5">
              {day.entries.map((entry) => (
                <li key={`${entry.kind}:${entry.summary}`} className="flex items-baseline gap-2">
                  <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] leading-none text-fg-muted">
                    {CHANGELOG_KIND_LABELS_EN[entry.kind]}
                  </span>
                  <span>{entry.summary}</span>
                </li>
              ))}
            </ul>
          </LegalSection>
        ))
      )}
    </LegalPage>
  );
}
