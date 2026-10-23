import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/legal/LegalPage';
import { CHANGELOG_KIND_LABELS, getChangelog, groupChangelogByDate } from '@/lib/trust/changelog';
import { SITE_NAME } from '@/lib/site';

// 수정 기록(docs/P4-trust-quality-plan.md Step 5b). 데이터는 content/changelog.json.
const TITLE = '수정 기록';
const DESCRIPTION = `${SITE_NAME} 노트와 문제에서 제보·검수로 찾아 고친 오류를 날짜순으로 공개합니다.`;
const PATH = '/changelog';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: PATH, type: 'website' },
};

const LINK = 'underline underline-offset-4 hover:text-fg';

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

export default function ChangelogPage() {
  const days = groupChangelogByDate(getChangelog());
  return (
    <LegalPage title="수정 기록">
      <LegalSection title="이 페이지에 대해">
        <p>
          노트·문제·해설과 사이트 문구에서 제보나 검수로 찾아 고친 오류를 최신순으로 적습니다. 만드는 방식과 검수 기준은{' '}
          <Link href="/about/how-we-make" className={LINK}>제작 방식</Link>에, 오류 제보 방법은{' '}
          <Link href="/contact" className={LINK}>문의 페이지</Link>에 있습니다.
        </p>
      </LegalSection>

      {days.length === 0 ? (
        <LegalSection title="기록">
          <p>아직 공개한 수정 기록이 없습니다.</p>
        </LegalSection>
      ) : (
        days.map((day) => (
          <LegalSection key={day.date} title={formatDate(day.date)}>
            <ul className="space-y-1.5">
              {day.entries.map((entry) => (
                <li key={`${entry.kind}:${entry.summary}`} className="flex items-baseline gap-2">
                  <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] leading-none text-fg-muted">
                    {CHANGELOG_KIND_LABELS[entry.kind]}
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
