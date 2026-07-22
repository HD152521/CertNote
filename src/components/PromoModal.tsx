'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Check, ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n-client';

// 얼리버드 혜택: 7월 내 가입자에게 3개월 Pro 무료. 마감일은 명시적으로 표기.
const FREE_MONTHS = 3;
const DEADLINE_KO = '2026년 7월 31일';
const DEADLINE_EN = 'July 31, 2026';

// 한국어·영어를 함께 노출("한눈에" 보이게). 사용자 언어를 주 텍스트로, 반대 언어를 보조로.
function order<T>(en: boolean, ko: T, enVal: T): [T, T] {
  return en ? [enVal, ko] : [ko, enVal];
}

export function PromoModal() {
  const router = useRouter();
  const lang = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // 7월(가입 마감 달)에만, 그리고 아직 안 본 사용자에게만 노출.
    const today = new Date();
    const inJuly = today.getFullYear() === 2026 && today.getMonth() === 6;
    if (!inJuly) return;
    // 마운트 시 1회: localStorage(클라 전용)를 읽어 최초 방문자에게만 노출.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!localStorage.getItem('promo-modal-seen')) setIsOpen(true);
  }, []);

  const dismiss = () => {
    setIsOpen(false);
    localStorage.setItem('promo-modal-seen', 'true');
  };

  const goSignup = () => {
    dismiss();
    router.push('/signup');
  };

  if (!isOpen) return null;

  const en = lang === 'en';
  const [headline, headlineSub] = order(en, `${FREE_MONTHS}개월 Pro 무료`, `${FREE_MONTHS} Months of Pro — Free`);
  const [badge] = order(en, '얼리버드 혜택', 'Early-bird offer');
  const [lead, leadSub] = order(
    en,
    `지금 가입하면 ${FREE_MONTHS}개월 동안 모든 Pro 콘텐츠를 무료로 이용할 수 있어요.`,
    `Sign up now and get ${FREE_MONTHS} months of full Pro access, on us.`,
  );
  const [deadline, deadlineSub] = order(
    en,
    `${DEADLINE_KO}까지 가입한 분 한정`,
    `Only for members who sign up by ${DEADLINE_EN}`,
  );
  const [perks, perksSub] = order(
    en,
    'AWS 자격증 11종 + 리눅스마스터 전체 · 모의고사 · SRS 복습',
    'All 11 AWS certs + Linux Master · mock exams · SRS review',
  );
  const [cta, ctaSub] = order(en, '지금 무료로 시작', 'Start free now');
  const [note] = order(en, '신용카드 불필요', 'No credit card required');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-2xl">
        <button
          onClick={dismiss}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-accent-fg/80 transition hover:bg-white/15 hover:text-accent-fg"
          aria-label="닫기 / Close"
        >
          <X size={20} />
        </button>

        {/* 액센트 헤더 — 혜택을 한눈에 */}
        <div className="bg-gradient-to-br from-accent to-accent/75 px-7 pb-7 pt-8 text-accent-fg">
          <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
            🎉 {badge}
          </span>
          <p className="mt-3 text-3xl font-bold leading-tight tracking-tight">{headline}</p>
          <p className="mt-0.5 text-sm font-medium opacity-90">{headlineSub}</p>
        </div>

        {/* 본문 */}
        <div className="space-y-4 px-7 py-6">
          <div>
            <p className="text-[15px] leading-relaxed text-fg">{lead}</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">{leadSub}</p>
          </div>

          {/* 마감일 강조 — 기간·대상 명시 */}
          <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
            <p className="text-sm font-semibold text-fg">📅 {deadline}</p>
            <p className="mt-0.5 text-xs text-fg-muted">{deadlineSub}</p>
          </div>

          {/* 포함 내역 */}
          <div className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div>
              <p className="text-sm text-fg">{perks}</p>
              <p className="text-xs text-fg-faint">{perksSub}</p>
            </div>
          </div>

          <button
            onClick={goSignup}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg transition hover:opacity-90"
          >
            <span>{cta}</span>
            <span className="text-sm font-normal opacity-80">· {ctaSub}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="text-center text-[11px] text-fg-faint">✓ {note}</p>
        </div>
      </div>
    </div>
  );
}
