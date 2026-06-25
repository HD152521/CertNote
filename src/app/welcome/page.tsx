import Link from 'next/link';
import { BookOpen, PlayCircle, RefreshCw, Trophy } from 'lucide-react';

export const metadata = {
  title: '시작하기 · CertNote',
};

const STEPS = [
  {
    icon: BookOpen,
    title: '① 목표 자격증을 고르세요',
    body: '왼쪽 사이드바에서 자격증을 누르면 시험 정보와 주차별 커리큘럼이 열려요.',
  },
  {
    icon: PlayCircle,
    title: '② 매일 한 페이지씩',
    body: '하루 분량의 학습 자료를 읽고, 끝의 연습 문제로 바로 확인하세요. 출퇴근 15분이면 충분해요.',
  },
  {
    icon: RefreshCw,
    title: '③ 틀린 문제는 자동 복습',
    body: '틀린 문항은 복습함에 쌓이고, 잊을 때쯤 다시 나타나요. 알림을 켜두면 매일 챙겨드려요.',
  },
  {
    icon: Trophy,
    title: '④ 모의고사로 실전 점검',
    body: '실제 시험처럼 타이머·채점으로 약점을 데이터로 확인하고 보완하세요.',
  },
];

// 가입 직후 첫 방문 온보딩. 핵심 사용 흐름 4단계 안내.
export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-lg space-y-8 py-12">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">환영합니다 🎉</h1>
        <p className="text-sm text-fg-muted">CertNote는 이렇게 쓰면 가장 효과적이에요.</p>
      </header>

      <ol className="space-y-3">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3 rounded-xl border border-border p-4">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-sm text-fg-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Link
        href="/"
        className="block w-full rounded-md bg-accent px-5 py-2.5 text-center text-sm font-medium text-accent-fg transition hover:opacity-90"
      >
        시작하기
      </Link>
    </div>
  );
}
