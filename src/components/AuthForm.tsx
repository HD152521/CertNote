'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BellRing } from 'lucide-react';
import { emitAuthChange } from '@/lib/auth/authEvents';
import { enablePush, isPushSupported } from '@/lib/push/client';
import { PURPOSE_OPTIONS, EXPERIENCE_OPTIONS } from '@/lib/profileOptions';

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
}

const COPY: Record<Mode, { title: string; submit: string; altText: string; altHref: string; altLabel: string }> = {
  login: { title: '로그인', submit: '로그인', altText: '계정이 없으신가요?', altHref: '/signup', altLabel: '회원가입' },
  signup: { title: '회원가입', submit: '가입하기', altText: '이미 계정이 있으신가요?', altHref: '/login', altLabel: '로그인' },
};

const INPUT_CLS =
  'w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-border-strong';

export function AuthForm({ mode, certs = [] }: AuthFormProps) {
  const router = useRouter();
  const params = useSearchParams();
  const copy = COPY[mode];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        setError(data.message ?? '요청을 처리하지 못했습니다.');
        return;
      }
      emitAuthChange();
      // 가입 직후엔 알림 권한 단계로(지원 시). 그 외/미지원이면 바로 이동.
      if (mode === 'signup' && isPushSupported()) {
        setAskPush(true);
        return;
      }
      goNext();
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
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
          <h1 className="text-xl font-semibold tracking-tight">학습 알림을 받을까요?</h1>
          <p className="text-sm text-fg-muted">복습할 카드가 쌓이면 매일 정해진 시각에 알려드려요. 설정에서 언제든 끌 수 있어요.</p>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={submitting}
            className="w-full rounded-md border border-border-strong px-3 py-2 text-sm font-medium transition hover:bg-fg/5 disabled:opacity-50"
          >
            {submitting ? '설정 중…' : '알림 받기'}
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={submitting}
            className="w-full px-3 py-2 text-sm text-fg-muted transition hover:text-fg disabled:opacity-50"
          >
            나중에
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm text-fg-muted">이메일</label>
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
          <label htmlFor="password" className="text-sm text-fg-muted">비밀번호</label>
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
          {mode === 'signup' && <p className="text-xs text-fg-faint">8자 이상</p>}
        </div>

        {mode === 'signup' && (
          <>
            <div className="space-y-1">
              <label htmlFor="name" className="text-sm text-fg-muted">이름</label>
              <input id="name" type="text" autoComplete="name" required value={name}
                onChange={(e) => setName(e.target.value)} className={INPUT_CLS} />
            </div>
            <div className="space-y-1">
              <label htmlFor="birthdate" className="text-sm text-fg-muted">생년월일</label>
              <input id="birthdate" type="date" autoComplete="bday" required value={birthdate}
                onChange={(e) => setBirthdate(e.target.value)} className={INPUT_CLS} />
            </div>
            <div className="space-y-1">
              <label htmlFor="targetCert" className="text-sm text-fg-muted">목표 자격증</label>
              <select id="targetCert" required value={targetCert}
                onChange={(e) => setTargetCert(e.target.value)} className={INPUT_CLS}>
                <option value="" disabled>선택해 주세요</option>
                {certs.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.code} · {c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="occupation" className="text-sm text-fg-muted">직업 <span className="text-fg-faint">(선택)</span></label>
              <input id="occupation" type="text" value={occupation}
                onChange={(e) => setOccupation(e.target.value)} className={INPUT_CLS}
                placeholder="예: 대학생, 백엔드 개발자, 취업준비생" />
            </div>
            <div className="space-y-1">
              <label htmlFor="purpose" className="text-sm text-fg-muted">학습 목적 <span className="text-fg-faint">(선택)</span></label>
              <select id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className={INPUT_CLS}>
                <option value="">선택 안 함</option>
                {PURPOSE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="experienceLevel" className="text-sm text-fg-muted">현재 수준/경력 <span className="text-fg-faint">(선택)</span></label>
              <select id="experienceLevel" value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)} className={INPUT_CLS}>
                <option value="">선택 안 함</option>
                {EXPERIENCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <label className="flex items-start gap-2 text-xs text-fg-muted">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 shrink-0" />
              <span>
                (필수) 이름·생년월일 등 입력 정보를 서비스 제공 및 개선 목적으로 수집·이용하는 데 동의합니다.{' '}
                <Link href="/privacy" target="_blank" onClick={(e) => e.stopPropagation()} className="text-fg underline underline-offset-2">
                  개인정보처리방침
                </Link>
              </span>
            </label>
          </>
        )}

        {error && <p className="text-sm text-red-500" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={submitting || (mode === 'signup' && !consent)}
          className="w-full rounded-md border border-border-strong px-3 py-2 text-sm font-medium transition hover:bg-fg/5 disabled:opacity-50"
        >
          {submitting ? '처리 중…' : copy.submit}
        </button>
      </form>
      <p className="text-sm text-fg-muted">
        {copy.altText}{' '}
        <Link href={copy.altHref} className="text-fg underline underline-offset-4">{copy.altLabel}</Link>
      </p>
    </div>
  );
}
