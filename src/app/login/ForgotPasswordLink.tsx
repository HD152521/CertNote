'use client';

import Link from 'next/link';
import { useLanguage, t } from '@/lib/i18n-client';

// 비밀번호 찾기 링크만 클라이언트로 분리 — 로그인 페이지는 서버 컴포넌트로 두어
// isGoogleLoginEnabled()가 서버 env를 읽게 한다(클라이언트에선 process.env가 비어 버튼이 숨겨졌다).
export function ForgotPasswordLink() {
  const lang = useLanguage();
  return (
    <p className="mx-auto mt-4 max-w-sm text-center text-xs text-fg-faint">
      <Link href="/forgot" className="text-accent hover:underline">{t(lang, 'forgotPasswordQuestion')}</Link>
    </p>
  );
}
