import Link from 'next/link';
import { Check } from 'lucide-react';
import { WaitlistForm } from '@/components/marketing/WaitlistForm';

export const metadata = {
  title: '요금제 · CertNote',
  description: 'CertNote 무료 플랜과 Pro 플랜 비교. 출퇴근 15분으로 AWS·리눅스마스터 자격증 준비.',
};

const FREE_FEATURES = [
  '각 자격증 Week 1 전체 학습 자료',
  'Week 1 인터랙티브 퀴즈',
  '학습 진도 저장',
  '대시보드 기본 보기',
];

const PRO_FEATURES = [
  '6개 트랙 전체 학습 자료 (2,696문항)',
  '실전 모의고사 (타이머 · 합/불 채점)',
  '무제한 간격반복 복습(SRS) · 오답노트',
  '자격증별 진척 · 정답률 상세 통계',
  '출시되는 신규 자격증 자동 포함',
];

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <span>{children}</span>
    </li>
  );
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 py-12">
      <header className="space-y-3 text-center">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">Pricing</p>
        <h1 className="text-3xl font-semibold tracking-tight">필요한 만큼만, 합리적으로</h1>
        <p className="mx-auto max-w-xl text-fg-muted">
          Week 1은 무료로 충분히 둘러보세요. 본격적으로 준비할 때 Pro로 전환하면 됩니다.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold">Free</h2>
          <p className="mt-1 text-3xl font-bold">₩0</p>
          <p className="text-xs text-fg-faint">영원히 무료</p>
          <ul className="mt-5 space-y-2">
            {FREE_FEATURES.map((f) => (<CheckItem key={f}>{f}</CheckItem>))}
          </ul>
          <Link
            href="/signup"
            className="mt-6 rounded-md border border-border px-4 py-2 text-center text-sm font-medium transition hover:border-border-strong"
          >
            무료로 시작
          </Link>
        </div>

        {/* Pro */}
        <div className="flex flex-col rounded-xl border-2 border-accent p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pro</h2>
            <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">추천</span>
          </div>
          <p className="mt-1 text-3xl font-bold">₩9,900<span className="text-sm font-normal text-fg-muted"> / 월</span></p>
          <p className="text-xs text-fg-faint">언제든 해지 가능</p>
          <ul className="mt-5 space-y-2">
            {PRO_FEATURES.map((f) => (<CheckItem key={f}>{f}</CheckItem>))}
          </ul>
          <div className="mt-6 space-y-2">
            <p className="text-xs text-fg-muted">결제 기능은 준비 중이에요. 출시되면 알려드릴게요.</p>
            <WaitlistForm />
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-fg-faint">
        이미 계정이 있나요? <Link href="/login" className="text-accent hover:underline">로그인</Link>
      </p>
    </div>
  );
}
