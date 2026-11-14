import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { isGoogleLoginEnabled } from '@/lib/auth/oauth/google';
import { ForgotPasswordLink } from './ForgotPasswordLink';

// 서버 컴포넌트로 둔다: googleEnabled는 서버 env(GOOGLE_CLIENT_ID/SECRET)로 판단해야 하며,
// 'use client'였을 땐 브라우저에서 process.env가 비어 구글 로그인 버튼이 사라졌다.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="login" googleEnabled={isGoogleLoginEnabled()} />
      <ForgotPasswordLink />
    </Suspense>
  );
}
