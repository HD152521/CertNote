'use client';

import { useState } from 'react';
import { useLanguage, t } from '@/lib/i18n-client';
import { X } from 'lucide-react';

interface SubscriptionModalsProps {
  isPro: boolean;
}

export function ChangePaymentModal() {
  const lang = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleChangePayment() {
    setLoading(true);
    setError('');
    try {
      // TODO: Implement payment method change API
      // const res = await fetch('/api/subscription/payment', { method: 'POST' })
      // if (!res.ok) throw new Error('Failed to change payment method')
      alert(lang === 'en' ? 'Feature coming soon' : '곧 제공될 예정입니다');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        type="button"
        className="flex-1 rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold hover:bg-bg-subtle transition"
      >
        {t(lang, 'changePayment')}
      </button>

      {/* Modal Backdrop */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
          />
          {/* Modal */}
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-50 bg-bg border border-border rounded-lg shadow-lg p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {lang === 'en' ? 'Update Payment Method' : '결제 방법 변경'}
              </h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-fg-muted hover:text-fg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <p className="text-sm text-fg-muted">
              {lang === 'en'
                ? 'Update your payment information to ensure uninterrupted service.'
                : '결제 정보를 업데이트하여 서비스를 계속 이용하세요.'}
            </p>

            {error && (
              <p className="text-sm text-red-500 bg-red-500/10 p-3 rounded">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-bg-subtle transition"
              >
                {lang === 'en' ? 'Cancel' : '취소'}
              </button>
              <button
                type="button"
                onClick={handleChangePayment}
                disabled={loading}
                className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 transition disabled:opacity-50"
              >
                {loading ? '...' : (lang === 'en' ? 'Update' : '변경')}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function CancelSubscriptionModal() {
  const lang = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'confirm' | 'reason'>('confirm');
  const [selectedReason, setSelectedReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reasons = [
    { value: 'too_expensive', label: lang === 'en' ? 'Too expensive' : '너무 비싸요' },
    { value: 'not_using', label: lang === 'en' ? 'Not using it' : '사용하지 않아요' },
    { value: 'found_alternative', label: lang === 'en' ? 'Found alternative' : '다른 서비스 찾았어요' },
    { value: 'other', label: lang === 'en' ? 'Other' : '기타' },
  ];

  async function handleCancel() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: selectedReason }),
      });
      if (!res.ok) throw new Error('Failed to cancel subscription');

      // Redirect to home after successful cancellation
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        type="button"
        className="flex-1 rounded-lg border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-500/10 transition"
      >
        {t(lang, 'cancelSubscription')}
      </button>

      {/* Modal Backdrop */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => {
              setIsOpen(false);
              setStep('confirm');
              setSelectedReason('');
            }}
          />
          {/* Modal */}
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-50 bg-bg border border-border rounded-lg shadow-lg p-6 space-y-4">
            {step === 'confirm' ? (
              <>
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-red-600">
                    {lang === 'en' ? 'Cancel Subscription?' : '구독을 취소하시겠습니까?'}
                  </h2>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-fg-muted hover:text-fg"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Warning */}
                <div className="bg-red-500/10 border border-red-500/40 rounded p-3 text-sm text-red-600">
                  {lang === 'en'
                    ? 'Your subscription will be cancelled immediately. You will lose access to Pro features.'
                    : '구독이 즉시 취소되며, Pro 기능에 대한 접근 권한이 상실됩니다.'}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-bg-subtle transition"
                  >
                    {lang === 'en' ? 'Keep Subscription' : '유지'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('reason')}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
                  >
                    {lang === 'en' ? 'Continue' : '계속'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Header */}
                <div>
                  <h2 className="text-lg font-semibold">
                    {lang === 'en' ? 'Tell us why' : '이유를 알려주세요'}
                  </h2>
                  <p className="text-sm text-fg-muted mt-1">
                    {lang === 'en'
                      ? 'Help us improve by sharing your feedback'
                      : '피드백을 공유해주세요'}
                  </p>
                </div>

                {/* Reasons */}
                <div className="space-y-2">
                  {reasons.map((reason) => (
                    <label
                      key={reason.value}
                      className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-bg-subtle transition"
                    >
                      <input
                        type="radio"
                        name="cancel_reason"
                        value={reason.value}
                        checked={selectedReason === reason.value}
                        onChange={(e) => setSelectedReason(e.target.value)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">{reason.label}</span>
                    </label>
                  ))}
                </div>

                {error && (
                  <p className="text-sm text-red-500 bg-red-500/10 p-3 rounded">
                    {error}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('confirm');
                      setSelectedReason('');
                    }}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-bg-subtle transition"
                  >
                    {lang === 'en' ? 'Back' : '뒤로'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={!selectedReason || loading}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {loading ? '...' : (lang === 'en' ? 'Cancel Pro' : 'Pro 취소')}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
