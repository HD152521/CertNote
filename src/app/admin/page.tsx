import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { query } from '@/lib/db';
import { AdminStats } from '@/components/admin/AdminStats';
import { AdminFeedback } from '@/components/admin/AdminFeedback';
import { AdminQuestionReports, type QuestionReportItem } from '@/components/admin/AdminQuestionReports';
import { AdminCertRequests, type CertRequestTally } from '@/components/admin/AdminCertRequests';
import { getQuestionById } from '@/lib/questions';
import { navDayHref } from '@/lib/navTree';
import { getAdminStats } from '@/lib/admin/stats';

// 쿠키·DB를 읽으므로 항상 동적 렌더.
export const dynamic = 'force-dynamic';

interface CountRow {
  pro: string;
  total: string;
}

interface FeedbackRow {
  id: number;
  phone: string;
  message: string;
  rewarded: boolean;
  created_at: string;
  email: string | null;
}

interface ReportRow {
  id: number;
  question_id: string;
  reason: string;
  message: string | null;
  status: string;
  created_at: string;
}

const PROMPT_PREVIEW = 160;

// 신고 행에 문제 원문 앞부분과 day 페이지 링크를 붙인다(모의고사 문제는 페이지가 없어 링크 없음).
function toReportItem(r: ReportRow): QuestionReportItem {
  const q = getQuestionById(r.question_id);
  return {
    id: r.id,
    questionId: r.question_id,
    reason: r.reason,
    message: r.message,
    status: r.status,
    created_at: r.created_at,
    prompt: q ? q.prompt.slice(0, PROMPT_PREVIEW) : null,
    href: q && q.week > 0 ? navDayHref(q.section ?? 'aws', q.slug, q.week, q.day) : null,
  };
}

// /admin은 middleware에서 admin 역할만 통과시킨다.
export default async function AdminPage() {
  const user = await getCurrentUser();
  const [stats, counts, feedback, reports, certRequests] = await Promise.all([
    getAdminStats(),
    query<CountRow>(`SELECT count(*) FILTER (WHERE plan = 'pro') AS pro, count(*) AS total FROM users`),
    query<FeedbackRow>(`SELECT f.id, f.phone, f.message, f.rewarded,
        to_char(f.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS created_at,
        u.email AS email
      FROM feedback f LEFT JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC LIMIT 200`),
    query<ReportRow>(`SELECT id, question_id, reason, message, status,
        to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS created_at
      FROM question_reports
      ORDER BY (status = 'open') DESC, created_at DESC LIMIT 200`),
    // 같은 '기타' 이름은 대소문자만 달라도 한 줄로 모은다. 알림은 로그인 요청자의 계정 이메일로만, 아직 안 보낸 사람만.
    query<CertRequestTally>(`SELECT cr.cert_key, min(cr.other_name) AS other_name, count(*)::int AS total,
        count(cr.user_id)::int AS members,
        coalesce(array_agg(DISTINCT u.email) FILTER (WHERE u.email IS NOT NULL AND cr.notified_at IS NULL), '{}') AS pending_emails
      FROM cert_requests cr LEFT JOIN users u ON u.id = cr.user_id
      GROUP BY cr.cert_key, lower(coalesce(cr.other_name, ''))
      ORDER BY total DESC`),
  ]);
  const c = counts[0] ?? { pro: '0', total: '0' };

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">관리자 대시보드</h1>
        <p className="text-sm text-fg-muted">{user?.email}님 · 전체 사용자 {c.total}명 / Pro {c.pro}명</p>
      </header>

      <nav className="flex flex-wrap gap-2">
        <Link href="/admin/users" className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium transition hover:bg-fg/5">
          유저 관리 (대기자 승인 · Pro 부여/해지) →
        </Link>
        <Link href="/admin/reviews" className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium transition hover:bg-fg/5">
          후기 관리 (숨김/노출) →
        </Link>
      </nav>

      <AdminStats stats={stats} />

      <AdminQuestionReports items={reports.map(toReportItem)} />

      <AdminCertRequests items={certRequests} />

      <AdminFeedback items={feedback} />
    </div>
  );
}
