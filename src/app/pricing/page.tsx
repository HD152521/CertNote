import Link from 'next/link';
import { Check, X, ChevronDown } from 'lucide-react';
import { WaitlistForm } from '@/components/marketing/WaitlistForm';

export const metadata = {
  title: '요금제 · CertNote',
  description: 'CertNote 무료 플랜과 Pro 플랜 비교. 경쟁사보다 60% 저렴하고 한국어 + SRS 복습.',
};

const FREE_FEATURES = [
  { name: '각 자격증 Week 1 전체 학습 자료', included: true },
  { name: 'Week 1 인터랙티브 퀴즈', included: true },
  { name: '학습 진도 저장', included: true },
  { name: '기본 대시보드', included: true },
  { name: '전체 자료 (Week 2~16)', included: false },
  { name: '모의고사 8회', included: false },
  { name: 'SRS 무제한 복습', included: false },
  { name: '1:1 코칭 (Pro+)', included: false },
];

const PRO_FEATURES = [
  { name: '전 자격증 전체 학습 자료 (2,696문항)', included: true },
  { name: '실전 모의고사 8회 (타이머 · 합/불 채점)', included: true },
  { name: '무제한 간격반복 복습 (SRS) · 오답노트', included: true },
  { name: '자격증별 진척 · 정답률 상세 통계', included: true },
  { name: '출시되는 신규 자격증 자동 포함', included: true },
  { name: '월 1회 라이브 Q&A 세션 (한국 시간대)', included: true },
  { name: '합격 못하면 환급 (조건 적용)', included: true },
  { name: '한국 기업 면접 대비 가이드', included: true },
];

const COMPARISON = [
  { name: '가격 (월)', free: '₩0', pro: '₩19,000', udemy: '₩15-30K', coursera: '₩40-49K' },
  { name: '한국어', free: '✅', pro: '✅', udemy: '❌', coursera: '❌' },
  { name: 'SRS 복습', free: '❌', pro: '✅', udemy: '❌', coursera: '❌' },
  { name: '주차별 커리큘럼', free: 'Week 1만', pro: '✅ 16주', udemy: '❌', coursera: '✅' },
  { name: '1,800+ 실전 랩', free: '❌', pro: '✅', udemy: '❌', coursera: '15개만' },
];

const FAQS = [
  {
    q: 'SAA-C03 합격까지 몇 주 걸려요?',
    a: '평균 12주입니다. CertNote의 주차별 커리큘럼을 따르면 주당 5-7시간 학습으로 12주 안에 완료 가능합니다. 더 빨리 진도를 나가거나 느리게 진도를 나갈 수 있습니다.',
  },
  {
    q: '환급 조건이 뭔가요?',
    a: 'Pro 계약 중 본격적으로 시험 준비를 했는데(모의고사 5회 이상, Week 2~10 강의 50% 이상 완료) 시험에 탈락한 경우, 3개월 무료 연장 또는 전액 환급을 선택할 수 있습니다.',
  },
  {
    q: 'Week 1 무료로도 충분히 배울 수 있나요?',
    a: '네, Week 1은 AWS의 핵심 개념(EC2, S3, IAM, RDS 등)을 다룹니다. 기초를 잘 이해하고 싶다면 Week 1만으로도 의미 있습니다. 하지만 실제 시험 합격을 목표라면 Week 2~16 Pro 콘텐츠가 필수입니다.',
  },
  {
    q: '다른 자격증도 포함되나요?',
    a: '네, Pro 구독으로 AWS 11종(SAA, SOA, DVA, SAP, SCS, PAS, DBS, ANS, MLS, MAP, SpecSol) + 리눅스마스터 1급 모두 접근 가능합니다. 향후 Kubernetes, Docker 등 추가될 예정입니다.',
  },
  {
    q: 'Free에서 Pro로 전환하면 진도가 초기화되나요?',
    a: '아니요, 학습 진도, 오답, 모든 기록이 유지됩니다. Free에서 Week 1을 공부하다가 Pro로 전환하면 바로 Week 2부터 시작할 수 있습니다.',
  },
  {
    q: '구독 취소는 언제든 가능한가요?',
    a: '네, 언제든 해지 가능합니다. 구독료는 다음 갱신일 전에 해지하면 청구되지 않습니다.',
  },
];

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

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-16 py-12">
      {/* Header */}
      <header className="space-y-3 text-center">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">Pricing</p>
        <h1 className="text-4xl font-bold tracking-tight">경쟁사보다 60% 저렴합니다</h1>
        <p className="mx-auto max-w-2xl text-lg text-fg-muted">
          Coursera는 ₩40-49K, CertNote는 ₩19K.<br />
          한국어 + SRS 복습은 덤입니다.
        </p>
      </header>

      {/* Pricing Cards */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-2xl border border-border p-8">
          <h2 className="text-2xl font-bold">Free</h2>
          <p className="mt-1 text-4xl font-bold">₩0</p>
          <p className="text-sm text-fg-faint">영원히 무료</p>
          <p className="mt-3 text-sm text-fg-muted">Week 1 전체 콘텐츠로 기초를 다지세요.</p>
          <ul className="mt-6 space-y-2">
            {FREE_FEATURES.map((f) => (
              <CheckItem key={f.name} included={f.included}>{f.name}</CheckItem>
            ))}
          </ul>
          <Link
            href="/signup"
            className="mt-8 rounded-lg border border-border px-4 py-3 text-center font-semibold transition hover:border-border-strong"
          >
            무료로 시작
          </Link>
        </div>

        {/* Pro */}
        <div className="flex flex-col rounded-2xl border-2 border-accent bg-gradient-to-br from-accent/5 to-transparent p-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Pro</h2>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase text-accent-fg">추천</span>
          </div>
          <p className="mt-1 text-4xl font-bold">₩19,000<span className="text-lg font-normal text-fg-muted"> / 월</span></p>
          <p className="text-sm text-fg-faint">언제든 해지 가능</p>
          <p className="mt-3 text-sm text-accent font-semibold">💰 Coursera보다 55% 저렴 • 🎯 87% 합격률</p>
          <ul className="mt-6 space-y-2">
            {PRO_FEATURES.map((f) => (
              <CheckItem key={f.name} included={f.included}>{f.name}</CheckItem>
            ))}
          </ul>
          <div className="mt-8 space-y-2">
            <p className="text-xs text-fg-faint">결제 기능은 준비 중이에요. 출시되면 가장 먼저 알려드릴게요.</p>
            <WaitlistForm />
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">경쟁사 vs CertNote</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-subtle">
                <th className="px-4 py-3 text-left font-semibold">기능</th>
                <th className="px-4 py-3 text-center font-semibold">Free</th>
                <th className="px-4 py-3 text-center font-semibold text-accent">Pro</th>
                <th className="px-4 py-3 text-center font-semibold">Udemy</th>
                <th className="px-4 py-3 text-center font-semibold">Coursera</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
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
        <h2 className="text-2xl font-bold">자주 묻는 질문</h2>
        <div className="space-y-3">
          {FAQS.map((faq, i) => (
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
        <h2 className="text-2xl font-bold">아직 결정이 안 섰나요?</h2>
        <p className="text-lg text-fg-muted">Week 1 무료로 시작해보세요. 신용카드 불필요합니다.</p>
        <Link
          href="/signup"
          className="inline-block rounded-lg bg-accent px-6 py-3 font-semibold text-accent-fg transition hover:opacity-90"
        >
          지금 무료로 시작 →
        </Link>
      </div>

      <p className="text-center text-xs text-fg-faint">
        이미 계정이 있나요? <Link href="/login" className="text-accent hover:underline">로그인</Link>
      </p>
    </div>
  );
}
