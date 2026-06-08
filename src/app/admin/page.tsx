import { getCurrentUser } from '@/lib/auth/currentUser';

// /admin은 middleware에서 admin 역할만 통과시킨다. 여기선 표시만 한다.
export default async function AdminPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">관리자 대시보드</h1>
      <p className="text-sm text-fg-muted">
        {user?.email}님으로 로그인됨 (역할: {user?.role})
      </p>
      <p className="text-sm text-fg-faint">
        이후 단계에서 사용자·콘텐츠·사용 통계 관리 기능이 여기에 추가됩니다.
      </p>
    </div>
  );
}
