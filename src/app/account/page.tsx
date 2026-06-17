import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AccountForms } from './AccountForms';

// 계정 관리 페이지. 미들웨어(/account)에 더해 서버에서도 getCurrentUser로 권위 확인
// (token_version 무효화 반영). 비로그인 시 로그인으로 리다이렉트.
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/account');
  }

  return (
    <div className="mx-auto max-w-sm space-y-8 py-16">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">계정 설정</h1>
        <p className="text-sm text-fg-muted">{user.email}</p>
      </div>
      <AccountForms />
    </div>
  );
}
