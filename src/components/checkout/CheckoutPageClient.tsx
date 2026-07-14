'use client';

import { useLanguage, t } from '@/lib/i18n-client';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';

interface CheckoutPageClientProps {
  userId: string;
  email: string;
}

export function CheckoutPageClient({ userId, email }: CheckoutPageClientProps) {
  const lang = useLanguage();

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">
          {lang === 'en' ? 'Upgrade to Pro Plan' : 'Pro 플랜 업그레이드'}
        </h1>
        <p className="mt-2 text-fg-secondary">
          {lang === 'en'
            ? 'Access all certifications, mock exams, and unlimited review.'
            : '모든 자격증, 모의고사, 무제한 복습에 접근하세요.'}
        </p>
      </div>

      {/* Plan Comparison */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Free Plan */}
        <div className="rounded-lg border border-border-secondary bg-bg-secondary p-6">
          <h3 className="text-lg font-semibold">{t(lang, 'freePlan')}</h3>
          <p className="mt-1 text-2xl font-bold">₩0<span className="text-sm">/{lang === 'en' ? 'month' : '월'}</span></p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>✓ {lang === 'en' ? 'Full Week1 access to each certification' : '각 자격증 Week1 전체'}</li>
            <li>✓ {lang === 'en' ? 'Basic practice questions' : '기본 연습 문제'}</li>
            <li className="text-fg-secondary">✗ {lang === 'en' ? 'Mock exams' : '모의고사'}</li>
            <li className="text-fg-secondary">✗ {lang === 'en' ? 'Week2+ content' : 'Week2+ 콘텐츠'}</li>
          </ul>
        </div>

        {/* Pro Plan */}
        <div className="rounded-lg border-2 border-accent bg-bg-secondary p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t(lang, 'proPlan')}</h3>
            <span className="rounded bg-accent px-2 py-1 text-xs font-semibold text-bg">{lang === 'en' ? 'Recommended' : '추천'}</span>
          </div>
          <p className="mt-1 text-2xl font-bold">₩9,900<span className="text-sm">/{lang === 'en' ? 'month' : '월'}</span></p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>✓ {lang === 'en' ? 'All certifications, all content' : '모든 자격증 전체 콘텐츠'}</li>
            <li>✓ {lang === 'en' ? 'Mock exams (65-72 questions per certification)' : '모의고사 (자격증별 65~72문항)'}</li>
            <li>✓ {lang === 'en' ? 'Unlimited SRS review' : '무제한 SRS 복습'}</li>
            <li>✓ {lang === 'en' ? 'Incorrect answers note & score analysis' : '오답 노트 & 성적 분석'}</li>
          </ul>
        </div>
      </div>

      {/* Checkout Form */}
      <CheckoutForm userId={userId} email={email} />

      {/* Trust Badges */}
      <div className="flex flex-wrap gap-6 border-t border-border-secondary pt-6 text-center">
        <div className="flex-1">
          <div className="text-sm font-semibold text-fg">🔒 {lang === 'en' ? 'Safe Payment' : '안전한 결제'}</div>
          <div className="mt-1 text-xs text-fg-secondary">{lang === 'en' ? 'All payments are encrypted' : '모든 결제는 암호화됩니다'}</div>
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-fg">💰 {lang === 'en' ? 'Refund Policy' : '환불 정책'}</div>
          <div className="mt-1 text-xs text-fg-secondary">{lang === 'en' ? 'Refund available within 7 days' : '7일 이내 환불 가능'}</div>
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-fg">📞 {lang === 'en' ? 'Customer Support' : '고객 지원'}</div>
          <div className="mt-1 text-xs text-fg-secondary">{lang === 'en' ? '24-hour email support' : '24시간 이메일 지원'}</div>
        </div>
      </div>
    </div>
  );
}
