import Link from 'next/link';
import { DEFAULT_CATEGORY, EN_CATEGORY } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { getExamCertSlugs, getExamQuestionsByCert } from '@/lib/exam/examBank';
import type { Language } from '@/lib/i18n';
import { fmt, pick } from '@/lib/strings/dict';
import { tryStrings } from '@/lib/strings/try';
import { GuestPreview } from './GuestPreview';

interface TryContentProps {
  lang: Language;
  /** ?cert= 쿼리 값. 목록에 없으면 자격증 선택 화면. */
  certParam: string | string[] | undefined;
}

// /try(ko)·/en/try(en) 공용 본문. 자격증 목록은 언어별 인덱스에서, 문제은행은 같은 slug 로 가져온다.
export async function TryContent({ lang, certParam }: TryContentProps) {
  const s = pick(tryStrings, lang);
  const slug = typeof certParam === 'string' ? certParam : '';
  const base = lang === 'en' ? '/en/try' : '/try';
  const examSlugs = new Set(getExamCertSlugs());
  const certs = (await listCerts(lang === 'en' ? EN_CATEGORY : DEFAULT_CATEGORY)).filter((c) => examSlugs.has(c.slug));
  const picked = certs.find((c) => c.slug === slug);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <header className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">{s.eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{picked ? fmt(s.titlePicked, { code: picked.code }) : s.titleDefault}</h1>
        <p className="text-sm text-fg-muted">{s.intro}</p>
      </header>
      {picked ? (
        <GuestPreview certSlug={picked.slug} certCode={picked.code} totalCount={getExamQuestionsByCert(picked.slug).length} lang={lang} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {certs.map((c) => (
            <li key={c.slug}>
              <Link href={`${base}?cert=${c.slug}`} prefetch={false}
                className="block rounded-md border border-border px-3 py-2.5 text-sm transition hover:border-border-strong">
                <span className="font-mono text-xs uppercase text-fg-muted">{c.code}</span>
                <span className="block text-fg">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
