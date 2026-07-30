import { ExternalLink, Lightbulb, HelpCircle } from 'lucide-react';
import { getExamTips, type ExamInfo } from '@/lib/examInfo';
import type { Language } from '@/lib/i18n-client';

interface ExamInfoCardProps {
  info: ExamInfo;
  lang: Language;
  section?: string; // 섹션별 꿀팁 분기(aws만 공통 혜택 팁). 미지정 시 aws로 폴백.
}

interface FactProps {
  label: string;
  value: string;
}

function Fact({ label, value }: FactProps) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-bg-subtle px-3 py-2.5">
      <dt className="truncate text-xs text-fg-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums text-fg">{value}</dd>
    </div>
  );
}

interface MetaRowProps {
  label: string;
  value: string;
}

function MetaRow({ label, value }: MetaRowProps) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <span className="shrink-0 text-xs text-fg-faint sm:w-20">{label}</span>
      <span className="min-w-0 text-sm text-fg-muted">{value}</span>
    </div>
  );
}

export default function ExamInfoCard({ info, lang, section }: ExamInfoCardProps) {
  const tips = getExamTips(section);

  return (
    <section
      aria-labelledby="exam-info-heading"
      className="space-y-5 rounded-lg border border-border bg-bg-elevated p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="exam-info-heading" className="text-sm font-medium text-fg-muted">
          {lang === 'en' ? 'Exam Information' : '시험 정보'}
        </h2>
        {info.difficulty && (
          <span className="rounded-full border border-border bg-bg-subtle px-2.5 py-0.5 text-xs text-fg-muted">
            {info.difficulty}
          </span>
        )}
      </div>

      {/* 핵심 수치: 모바일 2열, sm 3열, lg 5열로 깔끔하게 줄바꿈 */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Fact label={lang === 'en' ? 'Questions' : '문항 수'} value={`${info.questionCount}${lang === 'en' ? '' : '문항'}`} />
        <Fact label={lang === 'en' ? 'Duration' : '시험 시간'} value={`${info.durationMin}${lang === 'en' ? 'min' : '분'}`} />
        <Fact label={lang === 'en' ? 'Pass Score' : '합격 점수'} value={`${info.passingScore} / ${info.scoreMax}`} />
        <Fact label={lang === 'en' ? 'Cost' : '응시료'} value={`$${info.costUsd}`} />
        <Fact label={lang === 'en' ? 'Validity' : '유효기간'} value={`${info.validityYears}${lang === 'en' ? 'y' : '년'}`} />
      </dl>

      {/* 도메인 비중: 가로 막대 (대시보드 도메인 막대 스타일 재사용) */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-medium uppercase tracking-wider text-fg-faint">
          {lang === 'en' ? 'Domain Weights' : '도메인 비중'}
        </h3>
        <div className="space-y-2.5">
          {info.domains.map((d) => (
            <div key={d.name}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 flex-1 truncate text-fg">{d.name}</span>
                <span className="shrink-0 tabular-nums text-fg-muted">{d.weight}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${d.weight}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 형식 / 선수지식 / 언어 */}
      <div className="space-y-2 border-t border-border pt-4">
        <MetaRow label={lang === 'en' ? 'Format' : '형식'} value={info.format} />
        <MetaRow label={lang === 'en' ? 'Prerequisites' : '선수지식'} value={info.prerequisites} />
        <MetaRow label={lang === 'en' ? 'Languages' : '언어'} value={info.languages.join(', ')} />
      </div>

      {/* 시험 혜택 & 꿀팁 (섹션별; aws만 공통 혜택 팁). 팁이 없으면 블록 자체를 숨긴다. */}
      {tips.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-faint">
            <Lightbulb className="h-3.5 w-3.5 text-accent" /> {lang === 'en' ? 'Benefits & Tips' : '혜택 & 꿀팁'}
          </h3>
          <ul className="space-y-1.5">
            {tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-fg-muted">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                <span className="min-w-0">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 자주 묻는 질문(FAQ). info.faq 텍스트를 그대로 렌더 — cert 페이지의 FAQPage JSON-LD와 1:1.
          faq가 없으면(대부분의 초기 상태) 블록 미표기. */}
      {info.faq && info.faq.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-faint">
            <HelpCircle className="h-3.5 w-3.5 text-accent" /> {lang === 'en' ? 'FAQ' : '자주 묻는 질문'}
          </h3>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {info.faq.map((f, i) => (
              <details key={i} className="group bg-bg-subtle/40 open:bg-bg-subtle">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-fg marker:content-none">
                  <span className="min-w-0">{f.q}</span>
                  <span aria-hidden className="shrink-0 text-fg-faint transition group-open:rotate-45">+</span>
                </summary>
                <p className="px-3 pb-3 text-sm leading-relaxed text-fg-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* 외부 링크 버튼: 모바일 풀폭, sm+ 인라인 */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={info.officialUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 sm:w-auto"
        >
          {lang === 'en' ? 'Official Exam Guide' : '공식 시험 안내'} <ExternalLink className="h-4 w-4" />
        </a>
        <a
          href={info.registerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-bg-subtle px-4 py-2 text-sm font-medium text-fg transition hover:border-border-strong sm:w-auto"
        >
          {lang === 'en' ? 'Register for Exam' : '시험 등록'} <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}
