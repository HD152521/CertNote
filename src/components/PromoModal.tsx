'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function PromoModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    // 7월 31일 이후는 표시 안 함
    const today = new Date();
    if (today.getMonth() !== 6 || today.getDate() > 31) {
      return;
    }

    // localStorage에서 이전 방문 확인
    const hasSeenPromo = localStorage.getItem('promo-modal-seen');
    if (!hasSeenPromo) {
      setIsOpen(true);
      setIsDismissed(false);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem('promo-modal-seen', 'true');
  };

  if (!isOpen) return null;

  const isKo = typeof window !== 'undefined' && navigator.language.startsWith('ko');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative max-w-md rounded-lg bg-white p-8 shadow-xl dark:bg-slate-900">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-fg-muted hover:text-fg transition-colors"
          aria-label="Close"
        >
          <X size={24} />
        </button>

        {isKo ? (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-fg">🎉 MVP 특별 혜택</h2>
            <p className="text-fg-muted">
              Cert Notes는 현재 <span className="font-semibold">MVP 버전</span>으로 운영 중입니다.
            </p>
            <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950">
              <p className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                🚀 지금 가입하시면
              </p>
              <p className="text-blue-800 dark:text-blue-200">
                <span className="font-bold">Pro 버전 무료 이용</span>을 받으실 수 있습니다.
              </p>
            </div>
            <p className="text-sm text-fg-muted">
              AWS 자격증 11종 + 리눅스마스터의 모든 콘텐츠를 제한 없이 학습하세요.
            </p>
            <p className="text-xs text-fg-faint">
              ⏰ 이 혜택은 7월 말까지만 유효합니다.
            </p>
            <button
              onClick={handleClose}
              className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              지금 가입하기
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-fg">🎉 MVP Special Offer</h2>
            <p className="text-fg-muted">
              Cert Notes is currently running as an <span className="font-semibold">MVP version</span>.
            </p>
            <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950">
              <p className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                🚀 Sign up now and get
              </p>
              <p className="text-blue-800 dark:text-blue-200">
                <span className="font-bold">Free Pro access</span> for unlimited learning.
              </p>
            </div>
            <p className="text-sm text-fg-muted">
              Learn all AWS certifications (11 tracks) + Linux Master without any limitations.
            </p>
            <p className="text-xs text-fg-faint">
              ⏰ This offer is valid only until the end of July.
            </p>
            <button
              onClick={handleClose}
              className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Sign Up Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
