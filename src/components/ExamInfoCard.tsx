import { ExternalLink, Lightbulb, HelpCircle } from 'lucide-react';
import { formatCost, getExamTips, type ExamInfo } from '@/lib/examInfo';
import BulletList from '@/components/ui/BulletList';
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
  // 도메인 배점 비중은 전부 있거나 전부 없다고 본다(일부만 있으면 막대가 뒤섞여 오해를 부른다).
  const hasWeights = info.domains.every((d) => typeof d.weight === 'number');

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

      {/* 핵심 수치. 단일 응시 시험(AWS)은 5칸 그리드, 다단계 시험(리눅스마스터 1차/2차)은
          단계별로 값이 달라 그리드에 넣을 수 없으므로 아래 단계 표로 대체한다.
          합격 기준·유효기간은 단계와 무관한 값이라 어느 형태든 여기 남는다. */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {info.questionCount !== undefined && (
          <Fact label={lang === 'en' ? 'Questions' : '문항 수'} value={`${info.questionCount}${lang === 'en' ? '' : '문항'}`} />
        )}
        {info.durationMin !== undefined && (
          <Fact label={lang === 'en' ? 'Duration' : '시험 시간'} value={`${info.durationMin}${lang === 'en' ? 'min' : '분'}`} />
        )}
        <Fact
          label={lang === 'en' ? 'Passing' : '합격 기준'}
          value={info.passingCriteria ?? `${info.passingScore} / ${info.scoreMax}`}
        />
        {info.costUsd !== undefined && (
          <Fact label={lang === 'en' ? 'Cost' : '응시료'} value={`$${info.costUsd}`} />
        )}
        {/* 갱신 규정이 없는 자격은 이 칸 자체를 내린다 — '정보 없음'을 적는 것보다 정직하다. */}
        {info.validityYears !== undefined && (
          <Fact label={lang === 'en' ? 'Validity' : '유효기간'} value={`${info.validityYears}${lang === 'en' ? 'y' : '년'}`} />
        )}
      </dl>

      {/* 단계별 상세(다단계 시험 전용). 좁은 화면에서 가로 스크롤되게 감싼다. */}
      {info.phases && info.phases.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-faint">
                <th scope="col" className="pb-2 pr-3 font-medium">{lang === 'en' ? 'Stage' : '단계'}</th>
                <th scope="col" className="pb-2 pr-3 font-medium">{lang === 'en' ? 'Questions' : '문항'}</th>
                <th scope="col" className="pb-2 pr-3 font-medium">{lang === 'en' ? 'Duration' : '시간'}</th>
                <th scope="col" className="pb-2 pr-3 font-medium">{lang === 'en' ? 'Format' : '형식'}</th>
                <th scope="col" className="pb-2 font-medium">{lang === 'en' ? 'Cost' : '응시료'}</th>
              </tr>
            </thead>
            <tbody>
              {info.phases.map((ph) => (
                <tr key={ph.name} className="border-b border-border/60 last:border-0 align-top">
                  <th scope="row" className="py-2 pr-3 text-left font-medium text-fg">{ph.name}</th>
                  <td className="py-2 pr-3 tabular-nums text-fg-muted">{ph.questionCount}</td>
                  <td className="py-2 pr-3 tabular-nums text-fg-muted">{ph.durationMin}{lang === 'en' ? 'min' : '분'}</td>
                  <td className="py-2 pr-3 text-fg-muted">{ph.format}</td>
                  <td className="py-2 tabular-nums text-fg-muted">{ph.cost ? formatCost(ph.cost) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 도메인. 배점 비중이 고시된 시험만 막대를 그린다 — 비중을 모르는데 막대를 그리면
          길이 자체가 거짓 정보가 되므로, 그런 시험은 과목 목록으로만 표기한다. */}
      {info.domains.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-medium uppercase tracking-wider text-fg-faint">
            {hasWeights
              ? lang === 'en' ? 'Domain Weights' : '도메인 비중'
              : lang === 'en' ? 'Subjects' : '과목'}
          </h3>
          {hasWeights ? (
            <div className="space-y-2.5">
              {info.domains.map((d) => (
                <div key={d.name}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 flex-1 truncate text-fg">{d.name}</span>
                    <span className="shrink-0 tabular-nums text-fg-muted">{d.weight}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${d.weight}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <BulletList items={info.domains.map((d) => d.name)} />
          )}
        </div>
      )}

      {/* 형식 / 선수지식 / 언어 */}
      <div className="space-y-2 border-t border-border pt-4">
        {info.format && <MetaRow label={lang === 'en' ? 'Format' : '형식'} value={info.format} />}
        <MetaRow label={lang === 'en' ? 'Prerequisites' : '선수지식'} value={info.prerequisites} />
        <MetaRow label={lang === 'en' ? 'Languages' : '언어'} value={info.languages.join(', ')} />
      </div>

      {/* 시험 혜택 & 꿀팁 (섹션별; aws만 공통 혜택 팁). 팁이 없으면 블록 자체를 숨긴다. */}
      {tips.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-fg-faint">
            <Lightbulb className="h-3.5 w-3.5 text-accent" /> {lang === 'en' ? 'Benefits & Tips' : '혜택 & 꿀팁'}
          </h3>
          <BulletList items={tips} />
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
