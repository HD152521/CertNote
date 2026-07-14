'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BellRing } from 'lucide-react';
import { emitAuthChange } from '@/lib/auth/authEvents';
import { track } from '@/lib/analytics';
import { enablePush, isPushSupported } from '@/lib/push/client';
import { OCCUPATION_OPTIONS, PURPOSE_OPTIONS, EXPERIENCE_OPTIONS } from '@/lib/profileOptions';
import { useLanguage, t } from '@/lib/i18n-client';

type Mode = 'login' | 'signup';

export interface CertOption {
  slug: string;
  code: string;
  name: string;
}

interface AuthFormProps {
  mode: Mode;
  // 회원가입의 "목표 자격증" 드롭다운용. 서버 컴포넌트(signup 페이지)에서 주입.
  certs?: CertOption[];
  // 구글 로그인 버튼 표시 여부(서버에서 GOOGLE_CLIENT_ID 유무로 판단해 주입).
  googleEnabled?: boolean;
}

const INPUT_CLS =
  'w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong';

export function AuthForm({ mode, certs = [], googleEnabled = false }: AuthFormProps) {
  const lang = useLanguage();
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // OAuth 콜백 실패 시 /login?error=google 로 돌아온다.
  const oauthError = params.get('error') === 'google' ? (lang === 'en' ? 'Google login failed. Please try again.' : '구글 로그인에 실패했습니다. 다시 시도해 주세요.') : null;
  // 회원가입 프로필(테스터 데이터 수집)
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [occupation, setOccupation] = useState('');
  const [targetCert, setTargetCert] = useState('');
  const [purpose, setPurpose] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 회원가입 성공 후, 알림 권한을 묻는 단계로 전환(지원 브라우저에 한해).
  const [askPush, setAskPush] = useState(false);

  // 퍼널 이벤트: {signup|login}_started → _submitted → _completed / _error.
  // started는 폼 첫 상호작용에 1회만 — 페이지뷰 대비 실제 작성 시도 비율을 구분하기 위함.
  const startedRef = useRef(false);
  function markStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    track(`${mode}_started`);
  }

  function goNext() {
    const next = params.get('next');
    // 신규 가입자는 첫 방문 온보딩으로(명시적 next가 없을 때).
    router.push(next || (mode === 'signup' ? '/welcome' : '/'));
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    track(`${mode}_submitted`);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'signup'
            ? { email, password, name, birthdate, occupation, targetCert, purpose, experienceLevel, consent }
            : { email, password },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 이탈 원인 분석용: 검증 실패인지(코드별) 단순 변심인지 구분한다.
        track(`${mode}_error`, { error_code: data.error ?? `http_${res.status}`, error_message: data.message });
        setError(data.message ?? t(lang, 'somethingWentWrong'));
        return;
      }
      track(`${mode}_completed`);
      emitAuthChange();
      // 가입 직후엔 알림 권한 단계로(지원 시). 그 외/미지원이면 바로 이동.
      if (mode === 'signup' && isPushSupported()) {
        setAskPush(true);
        return;
      }
      goNext();
    } catch {
      track(`${mode}_error`, { error_code: 'network' });
      setError(t(lang, 'networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnablePush() {
    setSubmitting(true);
    await enablePush();
    setSubmitting(false);
    goNext();
  }

  if (askPush) {
    return (
      <div className="mx-auto max-w-sm space-y-6 py-12 text-center">
        <BellRing className="mx-auto h-10 w-10 text-accent" />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{t(lang, 'pushNotificationTitle')}</h1>
          <p className="text-sm text-fg-muted">{t(lang, 'pushNotificationDesc')}</p>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={submitting}
            className="w-full rounded-md border border-border-strong px-3 py-2 text-sm font-medium transition hover:bg-fg/5 disabled:opacity-50"
          >
            {submitting ? t(lang, 'processing') : t(lang, 'enableNotifications')}
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={submitting}
            className="w-full px-3 py-2 text-sm text-fg-muted transition hover:text-fg disabled:opacity-50"
          >
            {t(lang, 'later')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{t(lang, mode === 'login' ? 'login' : 'signup')}</h1>
      <form onSubmit={handleSubmit} onFocusCapture={markStarted} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm text-fg-muted">{t(lang, 'email')}</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-fg-muted">{t(lang, 'password')}</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong"
          />
          {mode === 'signup' && <p className="text-xs text-fg-faint">{lang === 'en' ? 'At least 8 characters' : '8자 이상'}</p>}
        </div>

        {mode === 'signup' && (
          <>
            <div className="space-y-1">
              <label htmlFor="name" className="text-sm text-fg-muted">{t(lang, 'name')}</label>
              <input id="name" type="text" autoComplete="name" required value={name}
                onChange={(e) => setName(e.target.value)} className={INPUT_CLS} />
            </div>
            <div className="space-y-1">
              <label htmlFor="birthdate" className="text-sm text-fg-muted">{t(lang, 'birthdate')}</label>
              <input id="birthdate" type="date" autoComplete="bday" required value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)} className={INPUT_CLS} />
            </div>
            <div className="space-y-1">
              <label htmlFor="targetCert" className="text-sm text-fg-muted">{t(lang, 'targetCert')}</label>
              <select id="targetCert" required value={targetCert}
                onChange={(e) => setTargetCert(e.target.value)} className={INPUT_CLS}>
                <option value="" disabled>{t(lang, 'selectOne')}</option>
                {certs.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.code} · {c.name}</option>
                ))}
              </select>
            </div>
            {/* 선택 항목은 접어서 폼의 체감 길이를 줄인다(가입 이탈 완화). 값은 그대로 함께 제출. */}
            <details className="group rounded-md border border-border">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm text-fg-muted transition hover:text-fg">
                {t(lang, 'additionalInfo')} <span className="text-fg-faint">({t(lang, 'additionalInfoDesc')})</span>
              </summary>
              <div className="space-y-4 border-t border-border p-3">
                <div className="space-y-1">
                  <label htmlFor="occupation" className="text-sm text-fg-muted">{t(lang, 'occupation')}</label>
                  <select id="occupation" value={occupation} onChange={(e) => setOccupation(e.target.value)} className={INPUT_CLS}>
                    <option value="">{t(lang, 'doNotSelect')}</option>
                    {OCCUPATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="purpose" className="text-sm text-fg-muted">{t(lang, 'purpose')}</label>
                  <select id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className={INPUT_CLS}>
                    <option value="">{t(lang, 'doNotSelect')}</option>
                    {PURPOSE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="experienceLevel" className="text-sm text-fg-muted">{t(lang, 'experienceLevel')}</label>
                  <select id="experienceLevel" value={experienceLevel}
                    onChange={(e) => setExperienceLevel(e.target.value)} className={INPUT_CLS}>
                    <option value="">{t(lang, 'doNotSelect')}</option>
                    {EXPERIENCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            </details>
            <label className="flex items-start gap-2 text-xs text-fg-muted">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 shrink-0" />
              <span>
                {t(lang, 'consentText')}{' '}
                <Link href="/privacy" target="_blank" onClick={(e) => e.stopPropagation()} className="text-fg underline underline-offset-2">
                  {t(lang, 'privacyPolicy')}
                </Link>
              </span>
            </label>
          </>
        )}

        {(error || oauthError) && <p className="text-sm text-red-500" role="alert">{error ?? oauthError}</p>}
        <button
          type="submit"
          disabled={submitting || (mode === 'signup' && !consent)}
          className="w-full rounded-md border border-border-strong px-3 py-2 text-sm font-medium transition hover:bg-fg/5 disabled:opacity-50"
        >
          {submitting ? t(lang, 'processing') : t(lang, mode === 'login' ? 'login' : 'signup')}
        </button>
      </form>
      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-fg-faint">
            <span className="h-px flex-1 bg-border" />
            {t(lang, 'or')}
            <span className="h-px flex-1 bg-border" />
          </div>
          {/* SPA 전환이 아니라 서버 리다이렉트 플로우라 Link 대신 a 태그. */}
          <a
            href={`/api/auth/google${params.get('next') ? `?next=${encodeURIComponent(params.get('next') as string)}` : ''}`}
            onClick={() => track(`${mode}_google_clicked`)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-border-strong hover:bg-fg/5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.72-4.96H1.29v3.09A12 12 0 0 0 12 24Z" />
              <path fill="#FBBC05" d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.63H1.29a12 12 0 0 0 0 10.74l3.99-3.09Z" />
              <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.99 3.09C6.22 6.88 8.87 4.77 12 4.77Z" />
            </svg>
            {t(lang, 'continueWithGoogle')}
          </a>
          <p className="text-center text-[11px] leading-relaxed text-fg-faint">
            {t(lang, 'googleContinueText')}{' '}
            <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-fg">{t(lang, 'privacyPolicy')}</Link>
            {t(lang, 'googleAgreeTerms')}
          </p>
        </>
      )}
      <p className="text-sm text-fg-muted">
        {t(lang, mode === 'login' ? 'dontHaveAccount' : 'alreadyHaveAccount')}{' '}
        <Link href={mode === 'login' ? '/signup' : '/login'} className="text-fg underline underline-offset-4">{t(lang, mode === 'login' ? 'signup' : 'login')}</Link>
      </p>
    </div>
  );
}
